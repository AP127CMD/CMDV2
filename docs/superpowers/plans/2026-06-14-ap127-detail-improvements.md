# AP127 Detail Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the AP127 Detail tab in view-cohort.js: full student drawer, correct idle days, race chart Hours toggle + avg line, combined chart defaults.

**Architecture:** All changes are confined to `js/view-cohort.js` (one IIFE). No new files. Order: simple defaults first (easy wins), then idle days fix, then drawer, then race chart enhancements. Bump `?v=` token to `p59` in `index.html` at the end.

**Tech Stack:** Vanilla JS, Chart.js, React (createElement), no build step. Preview on port 7423 via `ap127v2` launch config.

---

### Task 1: Combined Chart — Remove "To Plan End", Default to "Today", Auto-reset Zoom

**Files:**
- Modify: `js/view-cohort.js` (lines ~96–109 MARKUP, ~859–870 CPV vars/setters, ~920 endDate calc)

- [ ] **Step 1: Change default CPV_FILTER and fix MARKUP button initial classes**

In `view-cohort.js`, find:
```js
let CPV_FILTER='proj';
```
Replace with:
```js
let CPV_FILTER='today';
```

In `MARKUP`, find the three cpv-btn buttons (around line 95–109):
```html
          <button class="cpv-btn" data-f="today"   onclick="setCPVFilter('today')">To Today</button>
          <button class="cpv-btn" data-f="plan"    onclick="setCPVFilter('plan')">To Plan End</button>
          <button class="cpv-btn sel" data-f="proj" onclick="setCPVFilter('proj')">To Proj. End</button>
```
Replace with (remove "To Plan End", swap `sel` to "today"):
```html
          <button class="cpv-btn sel" data-f="today" onclick="setCPVFilter('today')">To Today</button>
          <button class="cpv-btn" data-f="proj"      onclick="setCPVFilter('proj')">To Proj. End</button>
```

- [ ] **Step 2: Remove 'plan' branch from endDate calculation**

Find in `buildAP127CombinedChart` (~line 920):
```js
  const endDate=CPV_FILTER==='today'?today:CPV_FILTER==='plan'?planEnd:[planEnd,projEndDate].sort().at(-1);
```
Replace with:
```js
  const endDate=CPV_FILTER==='today'?today:[planEnd,projEndDate].sort().at(-1);
```

- [ ] **Step 3: Add resetZoom at top of setCPVFilter and setCPVMode**

Find `function setCPVFilter(f){`:
```js
function setCPVFilter(f){
  CPV_FILTER=f;
```
Replace with:
```js
function setCPVFilter(f){
  CHARTS.ap127combined?.resetZoom?.();
  CPV_FILTER=f;
```

Find `function setCPVMode(m){`:
```js
function setCPVMode(m){
  CPV_MODE=m;
```
Replace with:
```js
function setCPVMode(m){
  CHARTS.ap127combined?.resetZoom?.();
  CPV_MODE=m;
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-cohort.js
git commit -m "feat(cohort): combined chart default today, remove plan-end, auto-reset zoom"
```

---

### Task 2: Idle Days — Use Current Date (Today) Instead of maxDate

**Files:**
- Modify: `js/view-cohort.js` (renderAP127Detail, buildAP127RaceChart, buildAP127OverallChart)

- [ ] **Step 1: Fix renderAP127Detail — replace maxDate with today in sort/idle calls**

In `renderAP127Detail`, `maxDate` is set at around line 386:
```js
  const maxDate=all.flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort().at(-1)||"";
  const sortedLead=ap127PaceSort(all,maxDate);
  const sortedLag=ap127BehindSort(all,maxDate);
```
`today` is defined later at line 421 as `const today=ap127TodayBKK();`. Move `today` above `maxDate` (or use `today0` which is already defined at line 393 as `const today0=ap127TodayBKK()`). The variable `today0` is available in scope. Replace:
```js
  const sortedLead=ap127PaceSort(all,maxDate);
  const sortedLag=ap127BehindSort(all,maxDate);
```
With:
```js
  const sortedLead=ap127PaceSort(all,today0);
  const sortedLag=ap127BehindSort(all,today0);
```

- [ ] **Step 2: Fix ap127SortRows call — pass today0 instead of maxDate**

Find:
```js
  let rows=ap127SortRows(all,maxDate,planMap,today);
```
Replace with:
```js
  let rows=ap127SortRows(all,today,planMap,today);
```
(Note: `today` is defined at line 421 `const today=ap127TodayBKK();` and `today0` at line 393 — both are the same value; use `today` here since it matches the surrounding variable.)

- [ ] **Step 3: Fix paced sort and validIdles in renderAP127Detail**

Find:
```js
  const paced=ap127PaceSort(all,maxDate);
```
Replace with:
```js
  const paced=ap127PaceSort(all,today);
```

Find:
```js
  const validIdles=rows.map(s=>ap127IdleDays(s,maxDate)).filter(v=>v!==9999);
```
Replace with:
```js
  const validIdles=rows.map(s=>ap127IdleDays(s,today)).filter(v=>v!==9999);
```

- [ ] **Step 4: Fix per-row idle call in tbody row generation**

In the `rows.map((s,idx)=>...` block (~line 452), find:
```js
    const idle=ap127IdleDays(s,maxDate);
```
Replace with:
```js
    const idle=ap127IdleDays(s,today);
```

- [ ] **Step 5: Fix buildAP127RaceChart and buildAP127OverallChart**

In `buildAP127RaceChart` (~line 745):
```js
  const racers=ap127PaceSort(all,maxDate);
```
Replace with:
```js
  const today=ap127TodayBKK();
  const racers=ap127PaceSort(all,today);
```

In `buildAP127OverallChart` (~line 819):
```js
  const sorted=ap127PaceSort(all,maxDate);
```
Replace with:
```js
  const sorted=ap127PaceSort(all,ap127TodayBKK());
```

- [ ] **Step 6: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-cohort.js
git commit -m "fix(cohort): idle days computed from today not maxDate"
```

---

### Task 3: SP Detail Drawer — Full Detail with KPI Header

**Files:**
- Modify: `js/view-cohort.js` (MARKUP drawer HTML ~lines 135–146, openAP127Drawer ~lines 497–507)

- [ ] **Step 1: Add KPI strip element and remove height cap on lists in MARKUP**

Find the drawer inner HTML in MARKUP (~line 136):
```html
<div class="d127-draw-ov" id="d127-draw-ov" onclick="closeAP127Drawer()">
  <div class="d127-draw" onclick="event.stopPropagation()">
    <div class="d127-dh">
      <div><div class="d127-dn" id="d127-d-name">-</div><div class="d127-dm" id="d127-d-meta">-</div></div>
      <button class="d127-close" onclick="closeAP127Drawer()">Close</button>
    </div>
    <div class="d127-dg">
      <div class="d127-list"><div class="d127-lh">Recent Completed Flights</div><div id="d127-d-flown"></div></div>
      <div class="d127-list"><div class="d127-lh">Upcoming Planned Flights</div><div id="d127-d-plan"></div></div>
    </div>
  </div>
</div>
```
Replace with:
```html
<div class="d127-draw-ov" id="d127-draw-ov" onclick="closeAP127Drawer()">
  <div class="d127-draw" onclick="event.stopPropagation()">
    <div class="d127-dh">
      <div><div class="d127-dn" id="d127-d-name">-</div><div class="d127-dm" id="d127-d-meta">-</div></div>
      <button class="d127-close" onclick="closeAP127Drawer()">Close</button>
    </div>
    <div id="d127-d-kpis" style="display:flex;gap:10px;flex-wrap:wrap;padding:10px 16px 0;border-bottom:1px solid var(--bd)"></div>
    <div class="d127-dg">
      <div class="d127-list" style="overflow-y:auto;max-height:45vh"><div class="d127-lh">Completed Flights</div><div id="d127-d-flown"></div></div>
      <div class="d127-list" style="overflow-y:auto;max-height:45vh"><div class="d127-lh">Planned Flights</div><div id="d127-d-plan"></div></div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Update openAP127Drawer to populate KPIs and show all flights**

Find `function openAP127Drawer(idx){` (~line 497) and replace the entire function:
```js
function openAP127Drawer(idx){
  const s=AP127_VIEW_ROWS[idx];if(!s)return;
  const total=s.total||0,done=s.done||0;
  document.getElementById("d127-d-name").textContent=s.name;
  document.getElementById("d127-d-meta").textContent=`${s.catc_id||"-"} · ${s.nick||"-"} · ${s.fi||"-"} · ${s.se||"-"}`;
  // KPI strip
  const today0=ap127TodayBKK();
  const planMap={};(G.cur127||[]).forEach(c=>{if(c.lesson&&c.planned_date)planMap[c.lesson]=c.planned_date;});
  const idle=ap127IdleDays(s,today0);
  const dayDelta=ap127DayDelta(s,planMap,today0);
  const hrs=ap127Hours(s);
  const plannedHrsToday=ap127PlannedHoursAsOf(today0);
  const hrsDelta=hrs-plannedHrsToday;
  const kpiItem=(label,val,color)=>`<div style="min-width:72px;text-align:center;padding:6px 10px;background:var(--s2);border-radius:4px"><div class="d127-kl" style="margin-bottom:2px">${label}</div><div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;color:${color||'var(--tx)'};line-height:1.1">${val}</div></div>`;
  const setH=(id,h)=>{const e=document.getElementById(id);if(e)e.innerHTML=h;};
  setH("d127-d-kpis",[
    kpiItem("Lessons",`${done} / ${total}`,"var(--c127)"),
    kpiItem("Hours",hrs.toFixed(1)+"h","var(--tx)"),
    kpiItem("Idle",idle===9999?"—":idle+"d",idle<=2?"var(--tx)":idle<=5?"#fbbf24":"#ff6b6b"),
    kpiItem("Day Δ",dayDelta===null?"—":(dayDelta>=0?"+":"")+dayDelta+"d",dayDelta===null?"var(--tx3)":dayDelta>0?"#ff6b6b":"#51cf66"),
    kpiItem("Hrs Δ",(hrsDelta>=0?"+":"")+hrsDelta.toFixed(1)+"h",hrsDelta>=0?"#51cf66":"#ff6b6b"),
  ].join(""));
  // Full flight lists (no cap)
  const flown=(s.flown||[]).slice().reverse();
  setH("d127-d-flown",flown.length?flown.map(f=>`<div class="d127-li"><div class="d127-ldt">${ap127ShortDate(f.date)}</div><div class="d127-ll">${f.lesson||"-"}</div><div class="d127-ld">${hm(ap127FlightMins(f))}</div></div>`).join(""):`<div class="d127-ad">No completed flights.</div>`);
  const plan=(s.planned||[]);
  setH("d127-d-plan",plan.length?plan.map(p=>`<div class="d127-li"><div class="d127-ldt">${ap127ShortDate(p.date)}</div><div class="d127-ll">${p.lesson||"-"}</div><div class="d127-ld">${hm(p.mins||p.planned_mins||0)}</div></div>`).join(""):`<div class="d127-ad">No planned flights.</div>`);
  document.getElementById("d127-draw-ov").classList.add("show");
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-cohort.js
git commit -m "feat(cohort): SP drawer full detail — KPI strip + all flights, no cap"
```

---

### Task 4: Race Chart — Lessons/Hours Toggle + Batch Avg Line

**Files:**
- Modify: `js/view-cohort.js` (AP127_RACE_SOLO declaration ~line 743, buildAP127RaceChart ~lines 744–815, window.assign ~line 1026)

- [ ] **Step 1: Add AP127_RACE_MODE module-level variable**

Find (~line 743):
```js
let AP127_RACE_SOLO=null;
```
Replace with:
```js
let AP127_RACE_SOLO=null;
let AP127_RACE_MODE='lessons';
```

- [ ] **Step 2: Replace buildAP127RaceChart with hours-aware version**

Find the entire function `function buildAP127RaceChart(all,curriculum,maxDate){` through its closing `}` (lines ~744–815) and replace with:

```js
function setAP127RaceMode(m){
  AP127_RACE_MODE=m;
  const maxD=(G.ap127||[]).flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort().at(-1)||"";
  buildAP127RaceChart(G.ap127,G.cur127?.length||101,maxD);
}
function buildAP127RaceChart(all,curriculum,maxDate){
  const racers=ap127PaceSort(all,ap127TodayBKK());
  const today=ap127TodayBKK();
  const isHrs=AP127_RACE_MODE==='hours';
  const curMap={};(G.cur127||[]).forEach(c=>{curMap[c.lesson]=c.planned_mins||0;});

  // Build label set from all planned dates + actual flight dates up to today
  const plannedDates=(G.cur127||[]).map(c=>c.planned_date).filter(d=>d&&d<=today).sort();
  const dateSet=new Set(plannedDates);
  dateSet.add(today);
  racers.forEach(s=>(s.flown||[]).forEach(f=>{if(f.date&&f.date<=today)dateSet.add(f.date);}));
  const labels=[...dateSet].sort();

  // Cumulative series helper — lessons or hours
  const cumSeries=(flights)=>{
    const byDate={};
    flights.forEach(f=>{
      const v=isHrs?((ap127FlightMins(f)||curMap[f.lesson]||0)/60):1;
      byDate[f.date]=(byDate[f.date]||0)+v;
    });
    const flightDates=new Set(flights.map(f=>f.date));
    let run=0;
    return labels.map(d=>{
      run+=(byDate[d]||0);
      return {y:+run.toFixed(2),r:flightDates.has(d)?3:0};
    });
  };

  // Planned target — per student
  const planByDate={};
  if(isHrs){
    (G.cur127||[]).forEach(c=>{if(!c.planned_date||c.planned_date>today)return;planByDate[c.planned_date]=(planByDate[c.planned_date]||0)+(c.planned_mins||0)/60;});
  } else {
    plannedDates.forEach(d=>{planByDate[d]=(planByDate[d]||0)+1;});
  }
  let planRun=0;
  const planData=labels.map(d=>{planRun+=(planByDate[d]||0);return +planRun.toFixed(2);});

  const datasets=[{
    label:'Planned Target',
    data:planData,
    borderColor:'#cbd5e1',pointRadius:0,tension:.25,borderDash:[6,4],borderWidth:2
  }];

  racers.forEach((s,i)=>{
    const hue=(i*360/Math.max(racers.length,1)).toFixed(0);
    const col=`hsla(${hue},85%,62%,0.8)`;
    const nick=ap127ShortName(s.name);
    const ad=(s.flown||[]).filter(f=>f.date&&f.date<=today).sort((a,b)=>a.date.localeCompare(b.date));
    const visible=AP127_RACE_SOLO===null||AP127_RACE_SOLO===nick;
    const pts=cumSeries(ad);
    datasets.push({
      label:nick,
      data:pts.map(p=>p.y),
      borderColor:col,
      pointRadius:pts.map(p=>p.r),
      pointHoverRadius:pts.map(p=>p.r?5:0),
      pointBackgroundColor:col,
      pointBorderWidth:0,
      tension:.18,
      borderWidth:visible?1.5:0,
      hidden:!visible
    });
  });

  // Batch average line — on top
  const avgData=labels.map((_,li)=>{
    let sum=0,cnt=0;
    datasets.forEach(ds=>{
      if(ds.label==='Planned Target')return;
      const v=ds.data[li];
      if(typeof v==='number'){sum+=v;cnt++;}
    });
    return cnt?+(sum/cnt).toFixed(2):0;
  });
  datasets.push({
    label:'Batch Avg',
    data:avgData,
    borderColor:'#e88aff',
    borderWidth:3,
    pointRadius:0,
    tension:.18,
    borderDash:[],
    order:999
  });

  CHARTS.ap127race=mkC("d127-race",{
    type:"line",data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{datalabels:{display:false},legend:{display:false},tooltip:{callbacks:{title:(ctx)=>ap127FmtDate(ctx[0]?.label||""),label:(ctx)=>`${ctx.dataset.label}: ${isHrs?ctx.parsed.y.toFixed(1)+" hrs":ctx.parsed.y+" les"}`}}},
      scales:{
        x:{ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681",maxTicksLimit:18},grid:{color:"#21262d"}},
        y:{beginAtZero:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#8b949e"},grid:{color:"#21262d"}}
      }
    }
  });

  const togglesDiv=document.getElementById("d127-race-toggles");
  togglesDiv.innerHTML="";

  // Mode chips row
  const modeRow=document.createElement("div");
  modeRow.style.cssText="display:flex;gap:6px;align-items:center;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--bd)";
  ['lessons','hours'].forEach(m=>{
    const btn=document.createElement("button");
    btn.textContent=m==='lessons'?'Lessons':'Hours';
    const sel=AP127_RACE_MODE===m;
    btn.style.cssText=`padding:4px 10px;background:${sel?"#e88aff":"#30363d"};color:${sel?"#000":"#8b949e"};border:0;border-radius:3px;cursor:pointer;font-weight:${sel?"700":"400"};font-size:10px;font-family:'JetBrains Mono',monospace`;
    btn.onclick=()=>setAP127RaceMode(m);
    modeRow.appendChild(btn);
  });
  const avgNote=document.createElement("span");
  avgNote.style.cssText="font-family:'JetBrains Mono',monospace;font-size:9px;color:#e88aff;margin-left:8px";
  avgNote.textContent="◆ thick = batch avg";
  modeRow.appendChild(avgNote);
  togglesDiv.appendChild(modeRow);

  // Student solo toggle buttons
  const allBtn=document.createElement("button");
  allBtn.textContent="ALL";
  allBtn.style.cssText=`padding:4px 10px;background:${AP127_RACE_SOLO===null?"#4ade80":"#30363d"};color:${AP127_RACE_SOLO===null?"#000":"#8b949e"};border:0;border-radius:3px;cursor:pointer;font-weight:700;font-size:10px;font-family:'JetBrains Mono',monospace`;
  allBtn.onclick=()=>{AP127_RACE_SOLO=null;buildAP127RaceChart(all,curriculum,maxDate);};
  togglesDiv.appendChild(allBtn);
  racers.forEach(s=>{
    const nick=ap127ShortName(s.name);
    const active=AP127_RACE_SOLO===nick;
    const btn=document.createElement("button");
    btn.textContent=nick;
    btn.style.cssText=`padding:4px 8px;background:${active?"#38bdf8":"#30363d"};color:${active?"#000":"#8b949e"};border:0;border-radius:3px;cursor:pointer;font-size:10px;font-family:'JetBrains Mono',monospace`;
    btn.onclick=()=>{AP127_RACE_SOLO=active?null:nick;buildAP127RaceChart(all,curriculum,maxDate);};
    togglesDiv.appendChild(btn);
  });
  document.getElementById("d127-race-meta").textContent=`${all.length} students · actual to ${ap127FmtDate(today)} · ${isHrs?"hours":"lessons"} mode · planned baseline`;
}
```

- [ ] **Step 3: Expose setAP127RaceMode on window**

Find the `Object.assign(window, {...})` line (~line 1026):
```js
  Object.assign(window, { renderAP127Detail, renderAP127Pace, ap127ResetSort, ap127HeaderClick, setCPVFilter, setCPVMode, openAP127Drawer, closeAP127Drawer, CHARTS });
```
Replace with:
```js
  Object.assign(window, { renderAP127Detail, renderAP127Pace, ap127ResetSort, ap127HeaderClick, setCPVFilter, setCPVMode, openAP127Drawer, closeAP127Drawer, setAP127RaceMode, CHARTS });
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-cohort.js
git commit -m "feat(cohort): race chart hours/lessons toggle + batch avg line"
```

---

### Task 5: Bump Version Token and Verify

**Files:**
- Modify: `index.html` (all `?v=p58` occurrences → `?v=p59`)

- [ ] **Step 1: Bump all ?v= tokens**

```bash
cd /Users/nugui/AP127_V2
sed -i '' 's/\?v=p58/?v=p59/g' index.html
```

Verify:
```bash
grep "?v=p59" index.html | wc -l
```
Expected: same count as the previous `?v=p58` references.

- [ ] **Step 2: Commit**

```bash
cd /Users/nugui/AP127_V2
git add index.html
git commit -m "chore: bump version token to p59"
```

---

### Task 6: Update Project Memory and README

**Files:**
- Modify: `/Users/nugui/.claude/projects/-Users-nugui/memory/project_ap127_v2.md`
- Modify: `/Users/nugui/AP127_V2/REVAMP.md` (if it exists)

- [ ] **Step 1: Append entry to project memory**

Add a new bullet to `project_ap127_v2.md` under the existing entries documenting `p59` changes: drawer full detail, idle-days fix, race chart mode toggle + avg, combined chart defaults.

- [ ] **Step 2: Update REVAMP.md**

Append to the §12 log section in `REVAMP.md` a short entry for `p59`.

- [ ] **Step 3: Commit**

```bash
cd /Users/nugui/AP127_V2
git add REVAMP.md
git commit -m "docs: log p59 changes in REVAMP.md"
```
