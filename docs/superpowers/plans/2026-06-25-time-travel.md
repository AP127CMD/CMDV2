# AP127 CMDV2 Time Travel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AP127 Detail tab time-travelable — every chart, KPI, table, and panel reflects data as of a user-selected past date, with a sticky scrubber bar for drag-to-scrub navigation.

**Architecture:** A null-when-live `COHORT_AS_OF` state variable and a `ap127AsOf()` getter replace all inline `ap127TodayBKK()` calls in render scope. A sticky scrubber div (custom pointer-event-driven, not `<input type="range">`) drives `setCohortAsOf()`, which sets the state and triggers a full re-render. An amber banner appears whenever not in live mode.

**Tech Stack:** Vanilla JS (IIFE pattern), Chart.js 4.4.1, pointer events API, 150ms debounce.

## Global Constraints

- All edits are in `/Users/nugui/AP127_V2/js/view-cohort.js` (IIFE, plain `<script>`, NOT `type="text/babel"`)
- Version token must be bumped `p100` → `p101` on ALL `<script>` tags in `index.html`
- No new npm deps, no fetch calls — all data is already in `G.ap127[]` and `G.cur127[]`
- `ap127TodayBKK()` itself is NOT modified — only its call sites in render scope
- After every file change: update REVAMP.md, CLAUDE.md, AP127_Docs/README.md §2.4 + §10, then commit+push both repos
- Bangkok today: `ap127TodayBKK()` returns `YYYY-MM-DD` string anchored to UTC+7

---

### Task 1: Add COHORT_AS_OF state var and ap127AsOf() helper + scrubber helpers

**Files:**
- Modify: `js/view-cohort.js` — state variable block (~line 975) and utility area (~line 200)

**Interfaces:**
- Produces: `COHORT_AS_OF` (null | string), `ap127AsOf()` → string, `_scrBatchStart()` → string, `_scrDateFromFrac(frac)` → string, `_scrSetThumb(frac)` → void, `let _scrDebounce`

- [ ] **Step 1: Add `COHORT_AS_OF` state variable after `HIST_BATCH_MODE`**

Find `let HIST_BATCH_MODE='hours';` (line 975) and add the new state var after it:

```js
let HIST_BATCH_MODE='hours';
let COHORT_AS_OF=null;
```

- [ ] **Step 2: Add `ap127AsOf()` and scrubber helpers after `ap127TodayBKK()` definition**

Find `function ap127TodayBKK(){...}` (line 200) — the line reads:
```
function ap127TodayBKK(){const now=new Date();const bkk=new Date(now.getTime()+(now.getTimezoneOffset()+420)*60000);return bkk.toISOString().slice(0,10);}
```
Add these four helpers immediately after it:
```js
function ap127AsOf(){return COHORT_AS_OF||ap127TodayBKK();}
function _scrBatchStart(){const all=G?.ap127||[];return all.flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort()[0]||ap127TodayBKK();}
function _scrDateFromFrac(frac){const s=new Date(_scrBatchStart()+'T00:00:00').getTime(),e=new Date(ap127TodayBKK()+'T00:00:00').getTime();return new Date(s+frac*(e-s)).toISOString().slice(0,10);}
function _scrSetThumb(frac){const th=document.getElementById('tt-thumb'),ch=document.getElementById('tt-chip');if(!th)return;th.style.left=(frac*100)+'%';if(ch){const ds=frac>=0.99?ap127TodayBKK():_scrDateFromFrac(frac);ch.textContent=ds?ap127ShortDate(ds):'';}};
let _scrDebounce=null;
```

- [ ] **Step 3: Verify no syntax errors**

Open browser console after saving or use a quick Node.js parse check:
```bash
node --input-type=module < /dev/null || true
grep -c "function ap127AsOf" /Users/nugui/AP127_V2/js/view-cohort.js  # expect: 1
grep -c "let COHORT_AS_OF" /Users/nugui/AP127_V2/js/view-cohort.js     # expect: 1
```

---

### Task 2: Replace all 11 ap127TodayBKK() render-scope calls with ap127AsOf()

**Files:**
- Modify: `js/view-cohort.js` — 11 specific lines

**Interfaces:**
- Consumes: `ap127AsOf()` from Task 1

The 11 call sites (line numbers are approximate — verify with grep before editing):
| Line | Function | Change |
|------|----------|--------|
| 269 | `renderAP127Pace` | `const today=ap127TodayBKK()` → `ap127AsOf()` |
| 417 | `renderAP127Detail` | `const today0=ap127TodayBKK()` → `ap127AsOf()` |
| 445 | `renderAP127Detail` | `const today=ap127TodayBKK()` → `ap127AsOf()` |
| 530 | `openAP127Drawer` | `const today0=ap127TodayBKK()` → `ap127AsOf()` |
| 555 | `buildAP127Timeline` | `ap127PaceSort(all,ap127TodayBKK())` → `ap127AsOf()` |
| 558 | `buildAP127Timeline` | `const today=ap127TodayBKK()` → `ap127AsOf()` |
| 795 | `buildAP127RaceChart` | `const today=ap127TodayBKK()` → `ap127AsOf()` |
| 933 | `buildAP127OverallChart` | `ap127PaceSort(all,ap127TodayBKK())` → `ap127AsOf()` |
| 996 | `buildAP127CombinedChart` | `const today=ap127TodayBKK()` → `ap127AsOf()` |
| 1139 | `buildAP127HistBatch` | `const today=ap127TodayBKK()` → `ap127AsOf()` |
| 1217 | `buildAP127HistSolo` | `const today=ap127TodayBKK()` → `ap127AsOf()` |

- [ ] **Step 1: Do all 11 replacements**

Each replacement is a simple string swap within that function's local scope. Exact `old_string` for each Edit call must be unique in context. For lines with `const today=ap127TodayBKK()` that appear multiple times, include a unique surrounding line for context.

Key replacements:
- `const today=ap127TodayBKK();` (in renderAP127Pace, line 269) — include `if(!G||!G.ap127)return;` above for uniqueness
- `const today0=ap127TodayBKK();` (two occurrences — renderAP127Detail line 417, openAP127Drawer line 530) — use surrounding context
- `const today=ap127TodayBKK();` (in renderAP127Detail line 445) — include `AP127_VIEW_ROWS=rows;` below
- `ap127PaceSort(all,ap127TodayBKK())` (line 555 in buildAP127Timeline) — include `const wrap=...` context
- `const today=ap127TodayBKK();` (line 558 in buildAP127Timeline) — include `const DAY=86400000;` below
- `const today=ap127TodayBKK();` (line 795 in buildAP127RaceChart) — include `const racers=ap127PaceSort`
- `ap127PaceSort(all,ap127TodayBKK())` (line 933 in buildAP127OverallChart) — include `function buildAP127OverallChart`
- `const today=ap127TodayBKK();` (line 996 in buildAP127CombinedChart) — include `const n=all.length;`
- `const today=ap127TodayBKK();` (line 1139 in buildAP127HistBatch) — include `const curriculum=G.cur127||[];`
- `const today=ap127TodayBKK();` (line 1217 in buildAP127HistSolo) — include `const curriculum=G.cur127||[];` (different context: `AP127_RACE_MODE`)

- [ ] **Step 2: Verify no remaining render-scope TodayBKK calls**

```bash
grep -n "ap127TodayBKK()" /Users/nugui/AP127_V2/js/view-cohort.js
```
Expected survivors: only the function *definition* on line 200. Zero remaining call sites in render functions. (Calls in `renderAP127Pace`'s range computation inner arrow are OK because `rangeStart` uses a plain Date arithmetic — check manually.)

---

### Task 3: Add MARKUP — amber banner, sticky scrubber, date input in controls row

**Files:**
- Modify: `js/view-cohort.js` — MARKUP template string (lines 9–171)

**Interfaces:**
- Produces DOM elements: `#tt-banner`, `#tt-banner-date`, `#tt-scrubber-wrap`, `#tt-track`, `#tt-ticks`, `#tt-thumb`, `#tt-chip`, `#tt-date-input`
- Consumes (inline event handlers): `setCohortAsOf` (Task 4)

- [ ] **Step 1: Insert banner + scrubber after `<div class="d127-wrap">` (inner, line 11)**

Find this exact string in MARKUP (start of inner wrap):
```
  <div class="d127-wrap">
    <div class="d127-title">
```
Replace with:
```html
  <div class="d127-wrap">
    <div id="tt-banner" style="display:none;background:rgba(245,158,11,0.12);border-bottom:1px solid rgba(245,158,11,0.35);padding:6px 16px;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#f59e0b">
      <span>⏪ TIME TRAVEL MODE — data as of <span id="tt-banner-date">-</span></span>
      <span style="flex:1"></span>
      <button onclick="setCohortAsOf(null)" style="background:#f59e0b;color:#000;border:0;border-radius:3px;padding:2px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;cursor:pointer">Return to Live</button>
    </div>
    <div id="tt-scrubber-wrap" style="position:sticky;top:48px;z-index:90;background:var(--bg);border-bottom:1px solid var(--bd);padding:8px 16px 26px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#6e7681">HISTORY</span>
        <div id="tt-track" style="position:relative;flex:1;height:14px;background:var(--s2);border-radius:3px;cursor:pointer;touch-action:none;user-select:none">
          <div id="tt-ticks" style="position:absolute;inset:0;pointer-events:none"></div>
          <div id="tt-thumb" style="position:absolute;top:-3px;left:100%;transform:translateX(-50%);width:4px;height:20px;background:#38bdf8;border-radius:2px;cursor:grab;touch-action:none">
            <div id="tt-chip" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);background:#30363d;border:1px solid #444;border-radius:3px;padding:1px 6px;font-size:9px;font-family:'JetBrains Mono',monospace;color:#e6edf3;white-space:nowrap;pointer-events:none">Today</div>
          </div>
        </div>
        <button onclick="setCohortAsOf(null)" id="tt-live-btn" style="background:#1a2f1a;border:1px solid #4ade80;color:#4ade80;border-radius:3px;padding:2px 7px;font-size:9px;font-family:'JetBrains Mono',monospace;cursor:pointer">LIVE ●</button>
      </div>
    </div>
    <div class="d127-title">
```

- [ ] **Step 2: Add date input to `.d127-controls` row**

Find in MARKUP:
```
      <span class="d127-meta" id="d127-meta">-</span>
```
Replace with:
```html
      <input type="date" id="tt-date-input" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:3px;padding:3px 6px;font-size:11px;font-family:'JetBrains Mono',monospace" onchange="setCohortAsOf(this.value||null)">
      <button onclick="setCohortAsOf(null)" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx3);border-radius:3px;padding:3px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;cursor:pointer">Live</button>
      <span class="d127-meta" id="d127-meta">-</span>
```

- [ ] **Step 3: Verify MARKUP diff looks right**

```bash
grep -n "tt-banner\|tt-scrubber\|tt-track\|tt-thumb\|tt-chip\|tt-date-input\|tt-live-btn" /Users/nugui/AP127_V2/js/view-cohort.js | head -20
```
Expect: all IDs appear once (except `tt-banner-date` inside the banner span).

---

### Task 4: Add setCohortAsOf, updateScrubber, initScrubber functions; wire into renderAP127Detail and mountProgress

**Files:**
- Modify: `js/view-cohort.js` — function section and mountProgress

**Interfaces:**
- Consumes: `COHORT_AS_OF`, `ap127AsOf`, `_scrBatchStart`, `_scrDateFromFrac`, `_scrSetThumb`, `_scrDebounce`, `renderAP127Detail` (from existing code)
- Produces: `setCohortAsOf(ds)`, `updateScrubber()`, `initScrubber()`

- [ ] **Step 1: Add three functions before `// ##AP127JS_END##` marker (line 1333)**

Insert immediately before `// ##AP127JS_END##`:

```js
function setCohortAsOf(ds){
  COHORT_AS_OF=ds||null;
  renderAP127Detail();
}
function updateScrubber(){
  if(!G?.ap127)return;
  const bs=_scrBatchStart(),rt=ap127TodayBKK();
  const frac=COHORT_AS_OF?Math.max(0,Math.min(0.99,(new Date(COHORT_AS_OF+'T00:00:00').getTime()-new Date(bs+'T00:00:00').getTime())/(new Date(rt+'T00:00:00').getTime()-new Date(bs+'T00:00:00').getTime()||1))):1;
  _scrSetThumb(frac);
  const ticks=document.getElementById('tt-ticks');
  if(ticks){
    ticks.innerHTML='';
    const ms=new Date(bs+'T00:00:00').getTime(),me=new Date(rt+'T00:00:00').getTime(),span=me-ms||1;
    let d=new Date(bs+'T00:00:00');d.setDate(1);d.setMonth(d.getMonth()+1);
    while(d.getTime()<=me){
      const f=(d.getTime()-ms)/span;
      const t=document.createElement('span');
      t.style.cssText=`position:absolute;left:${f*100}%;transform:translateX(-50%);font-family:'JetBrains Mono',monospace;font-size:9px;color:#6e7681;top:14px;pointer-events:none;white-space:nowrap`;
      t.textContent=d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
      ticks.appendChild(t);
      d.setMonth(d.getMonth()+1);
    }
  }
  const banner=document.getElementById('tt-banner');
  const bdate=document.getElementById('tt-banner-date');
  if(banner){banner.style.display=COHORT_AS_OF?'flex':'none';}
  if(bdate&&COHORT_AS_OF)bdate.textContent=ap127FmtDate(COHORT_AS_OF);
  const dateInput=document.getElementById('tt-date-input');
  if(dateInput){dateInput.min=bs;dateInput.max=rt;dateInput.value=COHORT_AS_OF||rt;}
  const sub=document.getElementById('d127-subtitle');
  if(sub)sub.textContent=COHORT_AS_OF?`Viewing data as of ${ap127FmtDate(COHORT_AS_OF)} — live data paused`:'Progress retrieved from CATC FTC records and master plan';
  const liveBtn=document.getElementById('tt-live-btn');
  if(liveBtn){liveBtn.style.background=COHORT_AS_OF?'var(--s2)':'#1a2f1a';liveBtn.style.borderColor=COHORT_AS_OF?'var(--bd)':'#4ade80';liveBtn.style.color=COHORT_AS_OF?'var(--tx3)':'#4ade80';}
}
function initScrubber(){
  const track=document.getElementById('tt-track');
  if(!track||track._init)return;
  track._init=true;
  let drag=false;
  const px=e=>{const r=track.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));};
  const move=f=>{
    _scrSetThumb(f);
    clearTimeout(_scrDebounce);
    _scrDebounce=setTimeout(()=>setCohortAsOf(f>=0.99?null:_scrDateFromFrac(f)),150);
  };
  track.addEventListener('pointerdown',e=>{drag=true;track.setPointerCapture(e.pointerId);move(px(e));});
  track.addEventListener('pointermove',e=>{if(drag)move(px(e));});
  track.addEventListener('pointerup',()=>{drag=false;});
}
```

- [ ] **Step 2: Wire `updateScrubber()` call at end of `renderAP127Detail`**

Find the last line of `renderAP127Detail` before `renderAP127Pace()`. The function ends:
```js
  buildAP127HistBatch();
  buildAP127HistSolo();
  renderAP127Pace();
}
```
Replace with:
```js
  buildAP127HistBatch();
  buildAP127HistSolo();
  updateScrubber();
  renderAP127Pace();
}
```

- [ ] **Step 3: Wire `initScrubber()` into `mountProgress`**

Find:
```js
  function mountProgress(data){ G = data; renderAP127Detail(); }
```
Replace with:
```js
  function mountProgress(data){ G = data; initScrubber(); renderAP127Detail(); }
```

- [ ] **Step 4: Verify `updateScrubber` is called from `renderAP127Detail`**

```bash
grep -n "updateScrubber\|initScrubber\|setCohortAsOf" /Users/nugui/AP127_V2/js/view-cohort.js
```
Expect: `updateScrubber` appears in both function body and renderAP127Detail call. `initScrubber` appears in mountProgress. `setCohortAsOf` appears in function body + MARKUP event handlers + window exports.

---

### Task 5: Add setCohortAsOf and ap127AsOf to window exports

**Files:**
- Modify: `js/view-cohort.js` — `Object.assign(window, ...)` line (~1340)

**Interfaces:**
- Consumes: `setCohortAsOf`, `ap127AsOf` (Tasks 1 + 4)

- [ ] **Step 1: Update window exports**

Find:
```js
  Object.assign(window, { renderAP127Detail, renderAP127Pace, ap127ResetSort, ap127HeaderClick, setCPVFilter, setCPVMode, cpvResetZoom, openAP127Drawer, closeAP127Drawer, setAP127RaceMode, setHistBatchMode, buildAP127HistBatch, buildAP127HistSolo, CHARTS });
```
Replace with:
```js
  Object.assign(window, { renderAP127Detail, renderAP127Pace, ap127ResetSort, ap127HeaderClick, setCPVFilter, setCPVMode, cpvResetZoom, openAP127Drawer, closeAP127Drawer, setAP127RaceMode, setHistBatchMode, buildAP127HistBatch, buildAP127HistSolo, setCohortAsOf, ap127AsOf, CHARTS });
```

---

### Task 6: Version bump, update all MDs, commit and push

**Files:**
- Modify: `index.html` — all `?v=p100` → `?v=p101`
- Modify: `REVAMP.md` — add entry
- Modify: `CLAUDE.md` — update last known + next token
- Modify: `AP127_Docs/README.md` — §2.4 update + §10 log

- [ ] **Step 1: Bump version token in index.html**

```bash
sed -i '' 's/?v=p100/?v=p101/g' /Users/nugui/AP127_V2/index.html
grep -o '?v=p[0-9]*' /Users/nugui/AP127_V2/index.html | sort -u  # expect: only ?v=p101
```

- [ ] **Step 2: Add REVAMP.md entry**

Add row to REVAMP.md table:
```
| 2026-06-25 | Time travel: sticky scrubber + amber banner + date picker; ap127AsOf() replaces 11 ap127TodayBKK() render-scope calls (p101) |
```

- [ ] **Step 3: Update CLAUDE.md**

Update the "Last known" line to reflect p101. Change:
```
**Last known:** all files `p100` (2026-06-25 — Panel reorder...
```
Add to the beginning:
```
**Last known:** all files `p101` (2026-06-25 — Time travel: sticky scrubber + COHORT_AS_OF + amber banner + date picker). p100...
```
Also update the next token comment to `p102`.

- [ ] **Step 4: Update AP127_Docs/README.md**

In §2.4 CMDV2 section, add the p101 feature. In §10, add a log entry:
```
**2026-06-25 p101:** Time travel — AP127 Detail tab can now show data as of any past date. Sticky scrubber bar (pointer-event-driven, 150ms debounce), amber "TIME TRAVEL MODE" banner, date picker in controls row. `ap127AsOf()` helper replaces all 11 render-scope `ap127TodayBKK()` calls.
```

- [ ] **Step 5: Commit and push CMDV2**

```bash
cd /Users/nugui/AP127_V2
git add js/view-cohort.js index.html REVAMP.md CLAUDE.md
git commit -m "p101: time travel — sticky scrubber, amber banner, date picker, ap127AsOf() (11 render-scope call sites)"
git pull --rebase && git push
```

- [ ] **Step 6: Commit and push AP127_Docs**

```bash
cd /Users/nugui/AP127_Docs
git add README.md
git commit -m "docs: p101 CMDV2 time travel feature (scrubber, banner, ap127AsOf)"
git pull --rebase && git push
```
