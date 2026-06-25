# History Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two lead/lag history Chart.js panels at the bottom of the Progress (Cohort) view in AP127 CMDV2.

**Architecture:** All changes live in `js/view-cohort.js` (new MARKUP, state var, three new functions, two hook edits). Two chart IDs — `d127-hist-batch` (batch-wide, independent mode) and `d127-hist-solo` (per-student, shares race chart state). Delta = actual cumulative minus planned cumulative computed from existing flight + curriculum data in memory — no new fetch.

**Tech Stack:** Chart.js 4.4.1, chartjs-adapter-date-fns 3, vanilla JS (no build step), React-mounted IIFE.

## Global Constraints

- Version token: bump ALL `?v=pNN` tags in `index.html` from `p98` → `p99` (use find-replace, NOT `?cb=`)
- `view-cohort.js` is wrapped in an IIFE `(function(){...})()` — all new code must be inside that IIFE
- Only `setHistBatchMode`, `buildAP127HistBatch`, `buildAP127HistSolo` need to be on `window` (via the existing `Object.assign(window,...)` at line 1129)
- Follow existing code style: terse one-liners, no comments, `mkC()` for chart create/destroy, `ap127TodayBKK()` for today, `ap127FmtDate()` for tooltip titles
- No zoom on the new charts (keep simple — Combined already has zoom)
- After EVERY code change: bump token, add REVAMP.md entry, update CLAUDE.md, update AP127_Docs README

---

## File Map

| File | Change |
|---|---|
| `js/view-cohort.js` | Add MARKUP HTML (2 panels), `HIST_BATCH_MODE` state var, `setHistBatchMode`, `buildAP127HistBatch`, `buildAP127HistSolo`, hook `setAP127RaceMode` + toggle handlers, expose on window, add render calls |
| `index.html` | Bump `?v=p98` → `?v=p99` on ALL script tags |
| `CLAUDE.md` | Update "Last known" line + next token |
| `REVAMP.md` | Add change log entry |
| `AP127_Docs/README.md` | §2.4 update + §10 log entry, then push |

---

### Task 1: Add MARKUP panels and state variable

**Files:**
- Modify: `js/view-cohort.js` (MARKUP section, lines ~125–132; state vars ~946–947)

**What to add — MARKUP (insert after the `d127-overall` panel, before the `</div>` that closes `d127-wrap`):**

```html
    <div class="d127-panel">
      <div class="d127-h" style="flex-wrap:wrap;gap:6px">
        <span class="d127-t">Batch Lead/Lag History</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="cpv-btn hist-batch-mode sel" data-m="hours"   onclick="setHistBatchMode('hours')">Hours</button>
          <button class="cpv-btn hist-batch-mode"     data-m="lessons" onclick="setHistBatchMode('lessons')">Lessons</button>
        </div>
      </div>
      <div class="d127-body">
        <div class="d127-note">Batch-wide cumulative actual − planned. Above zero = ahead of curriculum schedule; below = behind. Zero line = on plan.</div>
        <div class="cpv-kpis" id="hist-batch-kpis"></div>
        <div style="position:relative;height:220px"><canvas id="d127-hist-batch"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h">
        <span class="d127-t">Individual Lead/Lag vs Plan</span>
        <span class="d127-s">Shares hours/lessons mode &amp; student filters with Actual vs Planned</span>
      </div>
      <div class="d127-body">
        <div class="d127-note">Per-student delta (actual − planned). Above zero = ahead; below zero = behind. Thick magenta = batch avg. Use student toggles above to focus.</div>
        <div style="position:relative;height:300px"><canvas id="d127-hist-solo"></canvas></div>
      </div>
    </div>
```

**What to add — state var (after `let CPV_MODE='hours';` at ~line 947):**

```js
let HIST_BATCH_MODE='hours';
```

- [ ] **Step 1: Find the end of the Overall Progress Bar View panel in MARKUP**

  In `js/view-cohort.js`, find the block ending at approximately line 131:
  ```html
      </div>
    </div>
  </div>
  <div class="toast" id="toast">
  ```
  The two new panels go **between** `</div>\n    </div>` (closing Overall panel body + d127-panel) and `</div>` (closing the outer d127-wrap).

- [ ] **Step 2: Insert the two new d127-panel divs**

  Edit `js/view-cohort.js`. Find:
  ```
        <div style="position:relative;height:560px;width:100%"><canvas id="d127-overall"></canvas></div>
      </div>
    </div>
  </div>
  <div class="toast"
  ```
  Replace with:
  ```
        <div style="position:relative;height:560px;width:100%"><canvas id="d127-overall"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h" style="flex-wrap:wrap;gap:6px">
        <span class="d127-t">Batch Lead/Lag History</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="cpv-btn hist-batch-mode sel" data-m="hours"   onclick="setHistBatchMode('hours')">Hours</button>
          <button class="cpv-btn hist-batch-mode"     data-m="lessons" onclick="setHistBatchMode('lessons')">Lessons</button>
        </div>
      </div>
      <div class="d127-body">
        <div class="d127-note">Batch-wide cumulative actual − planned. Above zero = ahead of curriculum schedule; below = behind. Zero line = on plan.</div>
        <div class="cpv-kpis" id="hist-batch-kpis"></div>
        <div style="position:relative;height:220px"><canvas id="d127-hist-batch"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h">
        <span class="d127-t">Individual Lead/Lag vs Plan</span>
        <span class="d127-s">Shares hours/lessons mode &amp; student filters with Actual vs Planned</span>
      </div>
      <div class="d127-body">
        <div class="d127-note">Per-student delta (actual − planned). Above zero = ahead; below zero = behind. Thick magenta = batch avg. Use student toggles above to focus.</div>
        <div style="position:relative;height:300px"><canvas id="d127-hist-solo"></canvas></div>
      </div>
    </div>
  </div>
  <div class="toast"
  ```

- [ ] **Step 3: Add HIST_BATCH_MODE state var**

  In `js/view-cohort.js`, find:
  ```js
  let CPV_FILTER='proj';
  let CPV_MODE='hours';
  ```
  Replace with:
  ```js
  let CPV_FILTER='proj';
  let CPV_MODE='hours';
  let HIST_BATCH_MODE='hours';
  ```

---

### Task 2: Add setHistBatchMode and buildAP127HistBatch

**Files:**
- Modify: `js/view-cohort.js` — insert after `function buildAP127CombinedChart(){...}` block (after line ~1103)

**Insert this block after the closing `}` of `buildAP127CombinedChart` and before `function ap127FitY`:**

```js
function setHistBatchMode(m){
  HIST_BATCH_MODE=m;
  document.querySelectorAll('.hist-batch-mode').forEach(b=>b.classList.toggle('sel',b.dataset.m===m));
  buildAP127HistBatch();
}
function buildAP127HistBatch(){
  const all=G?.ap127||[];if(!all.length)return;
  const today=ap127TodayBKK();
  const curriculum=G.cur127||[];
  const isHrs=HIST_BATCH_MODE==='hours';
  const n=all.length;
  const lessonsMap={};curriculum.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const dateSet=new Set();
  all.forEach(s=>(s.flown||[]).forEach(f=>{if(f.date&&f.date<=today)dateSet.add(f.date);}));
  curriculum.forEach(c=>{if(c.planned_date&&c.planned_date<=today)dateSet.add(c.planned_date);});
  const labels=[...dateSet].sort();
  if(!labels.length)return;
  const actualByDate={};
  all.forEach(s=>(s.flown||[]).forEach(f=>{
    if(!f.date||f.date>today)return;
    const v=isHrs?(ap127FlightMins(f)||lessonsMap[f.lesson]||0)/60:1;
    actualByDate[f.date]=(actualByDate[f.date]||0)+v;
  }));
  const planByDate={};
  curriculum.forEach(c=>{
    if(!c.planned_date||c.planned_date>today)return;
    const v=isHrs?(c.planned_mins||0)*n/60:n;
    planByDate[c.planned_date]=(planByDate[c.planned_date]||0)+v;
  });
  let rAct=0,rPlan=0;
  const deltas=[];
  const batchData=labels.map(d=>{
    rAct+=(actualByDate[d]||0);
    rPlan+=(planByDate[d]||0);
    const delta=+(rAct-rPlan).toFixed(2);
    deltas.push(delta);
    return{x:d,y:delta};
  });
  const nowDelta=deltas.at(-1)||0;
  const bestDelta=Math.max(...deltas);
  const worstDelta=Math.min(...deltas);
  const fmt=v=>(v>=0?'+':'')+(isHrs?v.toFixed(1)+'h':Math.round(v)+' les');
  const kpiEl=document.getElementById('hist-batch-kpis');
  if(kpiEl)kpiEl.innerHTML=[
    {l:'Now',  v:fmt(nowDelta),   c:nowDelta>=0?'var(--done)':'#ef4444', s:'vs plan today'},
    {l:'Best', v:fmt(bestDelta),  c:'var(--done)',                        s:'peak lead ever'},
    {l:'Worst',v:fmt(worstDelta), c:'#ff6b6b',                           s:'peak lag ever'},
  ].map(k=>`<div class="cpv-kpi"><div class="cpv-kl">${k.l}</div><div class="cpv-kv" style="color:${k.c}">${k.v}</div><div class="cpv-ks">${k.s}</div></div>`).join('');
  CHARTS.ap127histBatch=mkC('d127-hist-batch',{
    type:'line',
    data:{datasets:[{
      label:'Batch Δ',
      data:batchData,
      borderColor:'#e88aff',
      borderWidth:2,
      pointRadius:0,
      pointHoverRadius:4,
      pointHoverBackgroundColor:'#e88aff',
      tension:0.15,
      fill:{target:{value:0},above:'rgba(74,222,128,0.12)',below:'rgba(239,68,68,0.12)'}
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,
      parsing:{xAxisKey:'x',yAxisKey:'y'},
      interaction:{mode:'index',intersect:false},
      plugins:{
        datalabels:{display:false},
        legend:{display:false},
        tooltip:{callbacks:{
          title:ctx=>{const r=ctx[0]?.raw;return r?ap127FmtDate(r.x):'';},
          label:ctx=>{const v=ctx.raw?.y;if(v==null)return null;return`Batch Δ: ${isHrs?v.toFixed(1)+'h':Math.round(v)+' les'}`;}
        }}
      },
      scales:{
        x:{type:'time',time:{unit:'month',displayFormats:{day:'d MMM',week:'d MMM',month:'MMM yy'}},
          ticks:{font:{family:'JetBrains Mono',size:8},color:'#6e7681',maxTicksLimit:14,source:'auto'},
          grid:{color:'#21262d'}},
        y:{ticks:{font:{family:'JetBrains Mono',size:9},color:'#8b949e',callback:v=>isHrs?v.toFixed(0)+'h':v},
          grid:{color:'#21262d'}}
      }
    }
  });
}
```

- [ ] **Step 1: Insert the two functions**

  Find in `js/view-cohort.js`:
  ```js
  function ap127FitY(chart){
  ```
  Insert the entire `setHistBatchMode` + `buildAP127HistBatch` block immediately **before** that line.

---

### Task 3: Add buildAP127HistSolo

**Files:**
- Modify: `js/view-cohort.js` — insert after `buildAP127HistBatch` (before `function ap127FitY`)

**Insert this block between `buildAP127HistBatch` and `ap127FitY`:**

```js
function buildAP127HistSolo(){
  const all=G?.ap127||[];if(!all.length)return;
  const today=ap127TodayBKK();
  const curriculum=G.cur127||[];
  const isHrs=AP127_RACE_MODE==='hours';
  const lessonsMap={};curriculum.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const racers=ap127PaceSort(all,today);
  const dateSet=new Set();
  racers.forEach(s=>(s.flown||[]).forEach(f=>{if(f.date&&f.date<=today)dateSet.add(f.date);}));
  curriculum.forEach(c=>{if(c.planned_date&&c.planned_date<=today)dateSet.add(c.planned_date);});
  const labels=[...dateSet].sort();
  if(!labels.length)return;
  const planByDate={};
  curriculum.forEach(c=>{
    if(!c.planned_date||c.planned_date>today)return;
    const v=isHrs?(c.planned_mins||0)/60:1;
    planByDate[c.planned_date]=(planByDate[c.planned_date]||0)+v;
  });
  let rPlan=0;
  const planCum=labels.map(d=>{rPlan+=(planByDate[d]||0);return +rPlan.toFixed(2);});
  const datasets=[{
    label:'Zero',
    data:labels.map(d=>({x:d,y:0})),
    borderColor:'rgba(255,255,255,0.18)',
    borderWidth:1,
    borderDash:[4,3],
    pointRadius:0,
    tension:0,
    order:0
  }];
  const allDeltas=[];
  racers.forEach((s,i)=>{
    const hue=(i*360/Math.max(racers.length,1)).toFixed(0);
    const col=`hsla(${hue},85%,62%,0.8)`;
    const nick=ap127ShortName(s.name);
    const visible=AP127_RACE_SOLO===null||AP127_RACE_SOLO===nick;
    const flightsByDate={};
    (s.flown||[]).filter(f=>f.date&&f.date<=today).forEach(f=>{
      const v=isHrs?(ap127FlightMins(f)||lessonsMap[f.lesson]||0)/60:1;
      flightsByDate[f.date]=(flightsByDate[f.date]||0)+v;
    });
    let rAct=0;
    const data=labels.map((d,li)=>{
      rAct+=(flightsByDate[d]||0);
      return{x:d,y:+(rAct-planCum[li]).toFixed(2)};
    });
    allDeltas.push(data.map(p=>p.y));
    datasets.push({
      label:nick,
      data,
      borderColor:col,
      borderWidth:visible?1.5:0,
      pointRadius:0,
      tension:0.15,
      hidden:!visible,
      order:1
    });
  });
  const avgData=labels.map((d,li)=>{
    const vals=allDeltas.map(sd=>sd[li]);
    return{x:d,y:vals.length?+(vals.reduce((a,v)=>a+v,0)/vals.length).toFixed(2):0};
  });
  datasets.push({
    label:'Batch Avg',
    data:avgData,
    borderColor:'#e88aff',
    borderWidth:3,
    pointRadius:0,
    tension:0.15,
    order:999
  });
  CHARTS.ap127histSolo=mkC('d127-hist-solo',{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      parsing:{xAxisKey:'x',yAxisKey:'y'},
      interaction:{mode:'index',intersect:false},
      plugins:{
        datalabels:{display:false},
        legend:{display:false},
        tooltip:{callbacks:{
          title:ctx=>{const r=ctx[0]?.raw;return r?ap127FmtDate(r.x):'';},
          label:ctx=>{
            if(ctx.dataset.label==='Zero')return null;
            const v=ctx.raw?.y;if(v==null)return null;
            return`${ctx.dataset.label}: ${isHrs?v.toFixed(1)+'h':Math.round(v)+' les'}`;
          }
        }}
      },
      scales:{
        x:{type:'time',time:{unit:'month',displayFormats:{day:'d MMM',week:'d MMM',month:'MMM yy'}},
          ticks:{font:{family:'JetBrains Mono',size:8},color:'#6e7681',maxTicksLimit:14,source:'auto'},
          grid:{color:'#21262d'}},
        y:{ticks:{font:{family:'JetBrains Mono',size:9},color:'#8b949e',callback:v=>isHrs?v.toFixed(0)+'h':v},
          grid:{color:'#21262d'}}
      }
    }
  });
}
```

- [ ] **Step 1: Insert buildAP127HistSolo**

  Find in `js/view-cohort.js`:
  ```js
  function ap127FitY(chart){
  ```
  Insert the entire `buildAP127HistSolo` block immediately **before** that line (after `buildAP127HistBatch`).

---

### Task 4: Wire shared state — hook setAP127RaceMode and toggle handlers

**Files:**
- Modify: `js/view-cohort.js` — three targeted one-line additions

- [ ] **Step 1: Update setAP127RaceMode (line ~762)**

  Find:
  ```js
  function setAP127RaceMode(m){
    AP127_RACE_MODE=m;
    const maxD=(G.ap127||[]).flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort().at(-1)||"";
    buildAP127RaceChart(G.ap127,G.cur127?.length||101,maxD);
  }
  ```
  Replace with:
  ```js
  function setAP127RaceMode(m){
    AP127_RACE_MODE=m;
    const maxD=(G.ap127||[]).flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort().at(-1)||"";
    buildAP127RaceChart(G.ap127,G.cur127?.length||101,maxD);
    buildAP127HistSolo();
  }
  ```

- [ ] **Step 2: Update ALL student toggle onclick in buildAP127RaceChart (~line 891)**

  Find:
  ```js
  allBtn.onclick=()=>{AP127_RACE_SOLO=null;buildAP127RaceChart(all,curriculum,maxDate);};
  ```
  Replace with:
  ```js
  allBtn.onclick=()=>{AP127_RACE_SOLO=null;buildAP127RaceChart(all,curriculum,maxDate);buildAP127HistSolo();};
  ```

- [ ] **Step 3: Update individual student toggle onclick (~line 899)**

  Find:
  ```js
      btn.onclick=()=>{AP127_RACE_SOLO=active?null:nick;buildAP127RaceChart(all,curriculum,maxDate);};
  ```
  Replace with:
  ```js
      btn.onclick=()=>{AP127_RACE_SOLO=active?null:nick;buildAP127RaceChart(all,curriculum,maxDate);buildAP127HistSolo();};
  ```

---

### Task 5: Wire render calls and expose on window

**Files:**
- Modify: `js/view-cohort.js` — two locations

- [ ] **Step 1: Add build calls in renderAP127Detail (~line 491)**

  Find:
  ```js
    buildAP127CombinedChart();
    buildAP127Timeline(all,curriculum,maxDate);
    buildAP127RaceChart(all,curriculum,maxDate);
    buildAP127OverallChart(all,curriculum,maxDate);
    renderAP127Pace();
  ```
  Replace with:
  ```js
    buildAP127CombinedChart();
    buildAP127Timeline(all,curriculum,maxDate);
    buildAP127RaceChart(all,curriculum,maxDate);
    buildAP127OverallChart(all,curriculum,maxDate);
    buildAP127HistBatch();
    buildAP127HistSolo();
    renderAP127Pace();
  ```

- [ ] **Step 2: Add to window exports (~line 1129)**

  Find:
  ```js
    Object.assign(window, { renderAP127Detail, renderAP127Pace, ap127ResetSort, ap127HeaderClick, setCPVFilter, setCPVMode, cpvResetZoom, openAP127Drawer, closeAP127Drawer, setAP127RaceMode, CHARTS });
  ```
  Replace with:
  ```js
    Object.assign(window, { renderAP127Detail, renderAP127Pace, ap127ResetSort, ap127HeaderClick, setCPVFilter, setCPVMode, cpvResetZoom, openAP127Drawer, closeAP127Drawer, setAP127RaceMode, setHistBatchMode, buildAP127HistBatch, buildAP127HistSolo, CHARTS });
  ```

---

### Task 6: Bump version token, update all MDs, commit and push

**Files:**
- `index.html`
- `CLAUDE.md`
- `REVAMP.md`
- `AP127_Docs/README.md`

- [ ] **Step 1: Bump version token in index.html**

  ```bash
  sed -i '' 's/?v=p98/?v=p99/g' /Users/nugui/AP127_V2/index.html
  # Verify
  grep -o '?v=p[0-9]*' /Users/nugui/AP127_V2/index.html | sort -u
  # Expected: ?v=p99 (all the same)
  ```

- [ ] **Step 2: Update CLAUDE.md**

  In `CLAUDE.md`, find the "Last known" line and update:
  - Change `p98` → `p99`
  - Add entry: `p99 (2026-06-25 — History Charts: two new panels at bottom of Progress view — Batch Lead/Lag History + Individual Lead/Lag vs Plan, both with hours/lessons toggle; individual chart shares race chart mode + student filters)`
  - Change "Next → p99" to "Next → p100"

- [ ] **Step 3: Add REVAMP.md entry**

  Append to the change log section in `REVAMP.md`:
  ```
  ### History Charts — Batch Lead/Lag & Individual Lead/Lag (2026-06-25, p99)

  `js/view-cohort.js`

  Two new panels added at the bottom of the Progress view showing lead/lag (actual − planned cumulative) over time:

  - **Batch Lead/Lag History** (`d127-hist-batch`): Single line chart — batch-wide delta (Σ actual − Σ planned × 28SP) over time. Fill green above zero / red below. KPI strip: Now / Best / Worst delta. Independent Hours/Lessons toggle (default hours). `HIST_BATCH_MODE` state var. `setHistBatchMode(m)` / `buildAP127HistBatch()` functions.
  - **Individual Lead/Lag vs Plan** (`d127-hist-solo`): Per-student delta lines (28 lines, same hue-per-index as race chart) + bold magenta batch avg. Zero reference line. Shares `AP127_RACE_MODE` and `AP127_RACE_SOLO` with the Actual vs Planned race chart — student toggles and mode chips above the race chart control both. `buildAP127HistSolo()` called from `setAP127RaceMode` + toggle click handlers.
  - Delta computation: cumulative actual − cumulative planned, derived purely from in-memory `flown[]` + `cur127[]` data. No new fetch.
  ```

- [ ] **Step 4: Update AP127_Docs/README.md**

  In `AP127_Docs/README.md`:
  - §2.4 (CMDV2): Note that two history chart panels were added to the Progress view (p99)
  - §10 (change log): Add entry `| 2026-06-25 | CMDV2 p99: History Charts — Batch Lead/Lag History + Individual Lead/Lag vs Plan panels |`

- [ ] **Step 5: Commit CMDV2 changes**

  ```bash
  cd /Users/nugui/AP127_V2
  git add js/view-cohort.js index.html CLAUDE.md REVAMP.md docs/superpowers/plans/2026-06-25-history-charts.md
  git commit -m "p99: History Charts — Batch Lead/Lag History + Individual Lead/Lag vs Plan panels"
  git pull --rebase && git push
  ```

- [ ] **Step 6: Commit AP127_Docs changes**

  ```bash
  cd /Users/nugui/AP127_Docs
  git add README.md
  git commit -m "docs: CMDV2 p99 — history charts panels"
  git pull --rebase && git push
  ```
