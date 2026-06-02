# Multi-View Improvements Implementation Plan

> ✅ **COMPLETED 2026-06-03** — All 10 tasks implemented and pushed. Cache-bust token: `p20`.

**Goal:** Implement 12 targeted improvements across School Perf, Cross-Check, Simulation, Roster, Gantt, and nav cleanup.

**Architecture:** All changes are in-place edits to existing files — no new files except CSS additions. No build step; the app loads directly from CDN React + Babel. Verification is manual: launch `ap127v2` preview server (port 7423) and inspect each view after each task.

**Tech Stack:** Vanilla JS (IIFE modules), React 18 CDN UMD, Babel Standalone, Chart.js 4, CSS custom properties.

**Local repo:** `/tmp/ap127_work/AP127_V2`  
**Preview:** `http://localhost:7423/index.html?cb=1` (increment `cb` to bust cache between checks)

---

## File Map

| File | Tasks |
|---|---|
| `js/shell.js` | T1 — remove All Batches + Slot Finder from nav |
| `assets/reconcile.js` | T1 — block time fix |
| `js/view-roster.js` | T1 — normalise "(Unplanned)" in student key |
| `css/theme.css` | T2 — add `--col-solo` to all 3 themes |
| `js/view-gantt.js` | T2 — solo/monitor detection, bar label, legend |
| `js/view-program.js` | T3 (Sim) + T5–T9 (School Perf) |
| `css/program.css` | T4 — chart resize styles, day-card grid, filter toggle |
| `index.html` | T10 — bump `?v=` token p19 → p20 |

---

## Task 1: Nav Removals, Block-Time Fix, Roster Unplanned

**Files:**
- Modify: `js/shell.js`
- Modify: `assets/reconcile.js:126`
- Modify: `js/view-roster.js:36`

- [ ] **Step 1.1 — shell.js: remove Slot Finder from Planning group**

In `js/shell.js`, locate the Planning group (line ~19) and remove the `slotfinder` entry:

```js
// BEFORE
{ label: 'Planning', items: [
  { id: 'slotfinder', label: 'Slot Finder', icon: '⌕' }, { id: 'autoslotfinder', label: 'Auto Slot Finder', icon: '⚡' },
] },

// AFTER
{ label: 'Planning', items: [
  { id: 'autoslotfinder', label: 'Auto Slot Finder', icon: '⚡' },
] },
```

- [ ] **Step 1.2 — shell.js: remove All Batches from Training Program group**

```js
// BEFORE
{ label: 'Training Program', items: [
  { id: 'program', label: 'All Batches', icon: '◴' },
  { id: 'plans', label: 'Progress Detail', icon: '▤' },
  { id: 'performance', label: "School Perf.", icon: '◷' },
  { id: 'simulation', label: 'Simulation', icon: '◈' },
] },

// AFTER
{ label: 'Training Program', items: [
  { id: 'plans', label: 'Progress Detail', icon: '▤' },
  { id: 'performance', label: "School Perf.", icon: '◷' },
  { id: 'simulation', label: 'Simulation', icon: '◈' },
] },
```

- [ ] **Step 1.3 — shell.js: remove slotfinder + program from registry()**

```js
// BEFORE (inside registry())
slotfinder: window.SlotFinderBoard, autoslotfinder: window.AutoSlotFinderBoard,
// ...
program: window.ProgramOverviewView,

// AFTER
autoslotfinder: window.AutoSlotFinderBoard,
// (program line deleted)
```

- [ ] **Step 1.4 — reconcile.js: use block time (duration) before airborne**

In `assets/reconcile.js` line 126:

```js
// BEFORE
const ccMin = hmToMin(m.airborne) != null ? hmToMin(m.airborne) : hmToMin(m.duration);

// AFTER
const ccMin = hmToMin(m.duration) != null ? hmToMin(m.duration) : hmToMin(m.airborne);
```

- [ ] **Step 1.5 — view-roster.js: normalise "(Unplanned)" in student key**

In `js/view-roster.js` around line 36, change the student branch of the key expression:

```js
// BEFORE
const key = groupBy === 'instructor'
  ? (f.instructor || '—')
  : groupBy === 'batch'
    ? (f.batch      || '—')
    : (f.student    || '—');

// AFTER
const key = groupBy === 'instructor'
  ? (f.instructor || '—')
  : groupBy === 'batch'
    ? (f.batch      || '—')
    : ((f.student || '—').replace(/\s*\(Unplanned\)\s*/i, '').trim() || '—');
```

- [ ] **Step 1.6 — Verify in browser**

Open `http://localhost:7423/index.html?cb=2`.
- Sidebar: "Slot Finder" gone from Planning; "All Batches" gone from Training Program.
- Roster → view by STUDENT: students with "(Unplanned)" variants now share one row.
- Cross-Check: open dev console and check if duration-based comparison changes any diff counts (no crash expected).

- [ ] **Step 1.7 — Commit**

```bash
cd /tmp/ap127_work/AP127_V2
git add js/shell.js assets/reconcile.js js/view-roster.js
git commit -m "feat: remove All Batches + Slot Finder nav; cross-check uses block time; roster merges (Unplanned)"
```

---

## Task 2: Gantt — Solo / Monitor

**Files:**
- Modify: `css/theme.css:16,29,42` — add `--col-solo`
- Modify: `js/view-gantt.js` — solo detection, bar color/label, legend

- [ ] **Step 2.1 — theme.css: add --col-solo to all three themes**

Cockpit theme (line 16):
```css
/* BEFORE */
  --col-sim:oklch(0.72 0.12 280); --col-stby:oklch(0.70 0.13 255);
/* AFTER */
  --col-sim:oklch(0.72 0.12 280); --col-stby:oklch(0.70 0.13 255); --col-solo:oklch(0.78 0.15 65);
```

Light theme (line 29):
```css
/* BEFORE */
  --col-sim:oklch(0.45 0.12 280); --col-stby:oklch(0.45 0.13 255);
/* AFTER */
  --col-sim:oklch(0.45 0.12 280); --col-stby:oklch(0.45 0.13 255); --col-solo:oklch(0.52 0.14 65);
```

Warm theme (line 42):
```css
/* BEFORE */
  --col-sim:oklch(0.75 0.14 280); --col-stby:oklch(0.70 0.16 255);
/* AFTER */
  --col-sim:oklch(0.75 0.14 280); --col-stby:oklch(0.70 0.16 255); --col-solo:oklch(0.82 0.18 65);
```

- [ ] **Step 2.2 — view-gantt.js: add isSoloFlt helper**

After line 8 (`const isMeetingFlt = ...`), add:

```js
const isSoloFlt = f => /\bsolo\b/i.test(f.lesson || '');
```

- [ ] **Step 2.3 — view-gantt.js: use solo color in bar rendering**

Inside the flight bar `r.flights.map((f,fi)=>{ ... })` block (~line 229), change the color derivation:

```js
// BEFORE
const isFiSP    = !!f._asFiStudent;
const isMtg     = isMeetingFlt(f);
const color     = isFiSP ? 'var(--col-stby)' : isMtg ? 'var(--ink-3)' : STATUS_COLOR(f);

// AFTER
const isFiSP    = !!f._asFiStudent;
const isMtg     = isMeetingFlt(f);
const isSolo    = !isFiSP && isSoloFlt(f);
const color     = isFiSP ? 'var(--col-stby)' : isSolo ? 'var(--col-solo)' : isMtg ? 'var(--ink-3)' : STATUS_COLOR(f);
```

- [ ] **Step 2.4 — view-gantt.js: update bar top-right chips**

Inside the bar button's first `<div className="mono num" ...>` (~line 251–257):

```jsx
// BEFORE
{isFiSP && <span style={{color:'var(--col-stby)',fontSize:7,fontWeight:600}}>AS SP</span>}
{!isFiSP && done && <span style={{color:'var(--col-done)'}}>✓</span>}
{!isFiSP && stby && <span style={{color:'var(--col-stby)',fontSize:8}}>STBY</span>}
{isMtg && !isFiSP && <span style={{color:'var(--ink-3)',fontSize:7}}>MTG</span>}

// AFTER
{isFiSP && <span style={{color:'var(--col-stby)',fontSize:7,fontWeight:600}}>AS SP</span>}
{!isFiSP && isSolo && <span style={{color:'var(--col-solo)',fontSize:7,fontWeight:600}}>MONITOR</span>}
{!isFiSP && !isSolo && done && <span style={{color:'var(--col-done)'}}>✓</span>}
{!isFiSP && !isSolo && stby && <span style={{color:'var(--col-stby)',fontSize:8}}>STBY</span>}
{!isFiSP && !isSolo && isMtg && <span style={{color:'var(--ink-3)',fontSize:7}}>MTG</span>}
```

- [ ] **Step 2.5 — view-gantt.js: update main label line**

The label `<div>` (~line 258–264):

```jsx
// BEFORE
<div style={{ fontSize:isMobile?9:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.2 }}>
  {isFiSP
    ? `▾ ${f.lesson}`
    : isMtg
      ? (f.lesson || f.batch || '—')
      : f.student}
</div>

// AFTER
<div style={{ fontSize:isMobile?9:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',lineHeight:1.2 }}>
  {isFiSP
    ? `▾ ${f.lesson}`
    : isSolo
      ? (f.lesson || '—')
      : isMtg
        ? (f.lesson || f.batch || '—')
        : f.student}
</div>
```

- [ ] **Step 2.6 — view-gantt.js: add MONITOR/SOLO to legend**

In the bottom legend strip (~line 299), add after the MTG/OTHER entry:

```jsx
// After the MTG/OTHER span:
<span style={{ display:'flex',gap:5,alignItems:'center' }}>
  <span style={{ width:12,height:7,background:`color-mix(in oklch,var(--col-solo) 18%,var(--surface))`,border:'1px solid var(--col-solo)',borderRadius:2 }}/>
  MONITOR/SOLO
</span>
```

- [ ] **Step 2.7 — Verify in browser**

Open Gantt view on a date that has solo flights (search for a lesson containing "SOLO"). Confirm:
- Solo bars appear in amber colour.
- Top-right chip shows "MONITOR".
- Label shows lesson code, not student name.
- Legend shows MONITOR/SOLO swatch.

- [ ] **Step 2.8 — Commit**

```bash
git add css/theme.css js/view-gantt.js
git commit -m "feat(gantt): solo/monitor detection — amber bar, MONITOR label, legend entry"
```

---

## Task 3: Simulation — Last SP Finish, Rest Toggle, Priority Toggles

**File:** `js/view-program.js`

- [ ] **Step 3.1 — CFG: add restReg and priority fields**

Find line 14 (the `let CFG = { ... }` declaration). Add `restReg` and `priority`:

```js
// BEFORE
let CFG = { cap: 25, n129: 13, ap129start: "2026-06-01", horizon: 800, hourMode: false, weekendCap: 13, holidayCap: 13, _weAuto: true, _holAuto: true, recents: 3, upcomings: 8, showRest: true, showNextTag: true, cardH: 220 };

// AFTER
let CFG = { cap: 25, n129: 13, ap129start: "2026-06-01", horizon: 800, hourMode: false, weekendCap: 13, holidayCap: 13, _weAuto: true, _holAuto: true, recents: 3, upcomings: 8, showRest: true, showNextTag: true, cardH: 220, restReg: false, priority: null };
```

- [ ] **Step 3.2 — elig(): make resting regulation opt-in**

Find `function elig(b,cur,wi,overN)` (~line 98). Change the gap computation inside the loop:

```js
// BEFORE
for(let i=0;i<n;i++){if(iM[b][i]>=tot)continue;const gap=lmM[b][i]>=120?2:1;if((wi-lwM[b][i])<gap)continue;out.push([...]);}

// AFTER
for(let i=0;i<n;i++){if(iM[b][i]>=tot)continue;const gap=(CFG.restReg&&lmM[b][i]>=120)?2:1;if((wi-lwM[b][i])<gap)continue;out.push([...]);}
```

- [ ] **Step 3.3 — Add priorityOrder() helper and wire into scheduler**

Add this function directly before `runScheduler` (~line 64):

```js
function priorityOrder(p){
  if(p==='ap126')       return['AP126','AP124','AP127'];
  if(p==='ap126_ap127') return['AP126','AP127','AP124'];
  if(p==='ap127')       return['AP127','AP124','AP126'];
  return['AP124','AP126','AP127'];
}
```

Inside `runScheduler`, find the line that iterates the three batches (~line 103–108):

```js
// BEFORE
wds.forEach((ds,wi)=>{
  let slots=ops[wi].cap;
  ["AP124","AP126","AP127"].forEach(b=>{

// AFTER
wds.forEach((ds,wi)=>{
  let slots=ops[wi].cap;
  priorityOrder(CFG.priority).forEach(b=>{
```

- [ ] **Step 3.4 — fcard(): change "First finishes" to "Last SP finish"**

Find `fcard()` function (~line 241). Locate the secondary stats row containing `sim-fcard-stat-l` with text "First finishes":

```js
// BEFORE
<div class="sim-fcard-stat"><div class="sim-fcard-stat-v">${first?fm(first):"—"}</div><div class="sim-fcard-stat-l">First finishes</div></div>

// AFTER
<div class="sim-fcard-stat"><div class="sim-fcard-stat-v">${last?fm(last):"—"}</div><div class="sim-fcard-stat-l">Last SP finish</div></div>
```

- [ ] **Step 3.5 — Add window handlers for new controls**

Find `Object.assign(window, { renderPerformance, resetPerformanceFilters, ... })` (~line 599). Add two new handlers before it:

```js
function onRestRegChange(checked){ CFG.restReg=checked; }
function onPriorityChange(val){
  CFG.priority=(CFG.priority===val)?null:val;
  renderPriorityChips();
}
function renderPriorityChips(){
  ['ap126','ap126_ap127','ap127'].forEach(v=>{
    const el=document.getElementById('sim-pri-'+v);
    if(!el)return;
    const active=CFG.priority===v;
    el.style.border=`1px solid ${active?'var(--c127)':'var(--bd)'}`;
    el.style.background=active?'color-mix(in oklch,var(--c127) 14%,var(--s1))':'transparent';
    el.style.color=active?'var(--c127)':'var(--tx3)';
    el.style.fontWeight=active?'600':'400';
  });
  const info=document.getElementById('sim-priority-info');
  if(!info)return;
  const labels={'ap126':'AP126 → AP124 → AP127','ap126_ap127':'AP126 → AP127 → AP124','ap127':'AP127 → AP124 → AP126'};
  info.textContent=CFG.priority?labels[CFG.priority]:'AP124 → AP126 → AP127 (default)';
}
```

Add `onRestRegChange, onPriorityChange, renderPriorityChips` to the `Object.assign(window, {...})` call.

- [ ] **Step 3.6 — Call renderPriorityChips() inside renderSimulation()**

Find `function renderSimulation()` (~line 215). At the end of the function body, before the closing `}`, add:

```js
renderPriorityChips();
```

- [ ] **Step 3.7 — MK_SIM: add Resting Regulation toggle to controls grid**

In `MK_SIM`, find the Holiday Cap `sim-ctrl-item` block (the last item in the `.sim-ctrl-row` grid). Add the Resting Regulation item immediately after it (still inside `.sim-ctrl-row`):

```html
<div class="sim-ctrl-item">
  <div class="sim-ctrl-lbl">Resting Regulation</div>
  <div class="sim-ctrl-desc">After a flight ≥ 2 hrs, student skips 1 extra workday before next flight</div>
  <div class="sim-ctrl-val" style="display:flex;align-items:center;gap:8px">
    <span style="font-size:10px;color:var(--tx3)">Off</span>
    <label class="tsw"><input type="checkbox" id="sim-rest-reg" onchange="onRestRegChange(this.checked)"><span class="tsw-track"></span></label>
    <span style="font-size:10px;color:var(--tx3)">On</span>
  </div>
</div>
```

- [ ] **Step 3.8 — MK_SIM: add Priority Regulation section**

After the closing `</div>` of the `.sim-ctrl-row` grid (and before the "Additional Batches" section title), add:

```html
<div class="sim-ctrl-title" style="margin-top:4px">Priority Regulation</div>
<div style="font-size:10px;color:var(--tx3);margin-bottom:10px;line-height:1.5">Override default batch priority. Select one option, or none for default order.</div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
  <button id="sim-pri-ap126" class="bt" onclick="onPriorityChange('ap126')">AP126 first</button>
  <button id="sim-pri-ap126_ap127" class="bt" onclick="onPriorityChange('ap126_ap127')">AP126 + AP127 first</button>
  <button id="sim-pri-ap127" class="bt" onclick="onPriorityChange('ap127')">AP127 first</button>
</div>
```

- [ ] **Step 3.9 — MK_SIM: update Priority order info row to be dynamic**

In the `<details class="sim-info-panel">` block, find the Priority order `sim-info-item`. Change the static value to use an `id`:

```html
<!-- BEFORE -->
<div class="sim-info-val"><span style="color:var(--c124)">AP124</span> → <span style="color:var(--c126)">AP126</span> → <span style="color:var(--c127)">AP127</span> → <span style="color:var(--c129)">AP129</span> → Extra batches (in added order)</div>

<!-- AFTER -->
<div class="sim-info-val" id="sim-priority-info">AP124 → AP126 → AP127 (default)</div>
```

- [ ] **Step 3.10 — Verify in browser**

Open Simulation view, click ▶ Run Simulation.
- Finish cards: each card shows "Last SP finish" label (not "First finishes").
- Toggle Resting Regulation ON → re-run → slower projected finish dates.
- Click "AP127 first" → button highlights → re-run → AP127 finishes earlier than AP126.
- Click the same button again → deselects → re-run → default order restored.

- [ ] **Step 3.11 — Commit**

```bash
git add js/view-program.js
git commit -m "feat(sim): last SP finish stat, resting regulation toggle, priority regulation toggles"
```

---

## Task 4: School Perf — CSS for New Layout

**File:** `css/program.css`

- [ ] **Step 4.1 — Add chart-resize-wrap class**

Add after `.cr.c3` line (~line 53):

```css
.chart-resize-wrap{position:relative;resize:vertical;overflow:hidden;min-height:180px;height:280px;}
```

- [ ] **Step 4.2 — Add pf-day-grid and pf-day-card classes**

Find the `.pr-list` block (~line 238) and add the new day-card classes immediately after `.pr-meta`:

```css
.pf-day-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px;padding:10px 12px;}
.pf-day-card{background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:8px 6px;}
.pf-day-card-date{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em;}
.pf-day-card-bar{height:5px;border-radius:3px;overflow:hidden;background:var(--s3);margin-bottom:4px;display:flex;}
.pf-day-card-n{font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;color:var(--tx);line-height:1;}
.pf-day-card-h{font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--tx3);}
```

- [ ] **Step 4.3 — Verify CSS loads**

Open `http://localhost:7423/index.html?cb=3`, open dev tools, verify `.chart-resize-wrap` and `.pf-day-card` rules exist in the computed styles panel.

- [ ] **Step 4.4 — Commit**

```bash
git add css/program.css
git commit -m "style(program): chart-resize-wrap, pf-day-grid/card classes for School Perf redesign"
```

---

## Task 5: School Perf — MK_PERF HTML Updates

**File:** `js/view-program.js` — the `MK_PERF` template string (~line 645)

- [ ] **Step 5.1 — Add WE / HOL toggle buttons to filter bar**

In `MK_PERF`, find the filter bar `<div class="fr">`. Add two toggle buttons after the `pf-recent-n` select and before the Reset button:

```html
<button id="pf-inc-we"  class="bt" onclick="this.classList.toggle('active');renderPerformance()">WE</button>
<button id="pf-inc-hol" class="bt" onclick="this.classList.toggle('active');renderPerformance()">HOL</button>
```

- [ ] **Step 5.2 — Convert chart rows from 2-column to full-width with resize wrappers**

Replace both `<div class="cr c2">` chart rows (lines ~682–689) with four standalone `.cb` blocks:

```html
<div class="cb">
  <div class="ch">Daily Flights by Batch</div>
  <div class="cs">Stacked bars · flights/day, coloured by batch</div>
  <div class="chart-resize-wrap" id="wrap-perf-daily-f"><canvas id="c-perf-daily-f"></canvas></div>
</div>
<div class="cb">
  <div class="ch">Daily Hours by Batch</div>
  <div class="cs">Stacked bars · flight-hours/day, coloured by batch</div>
  <div class="chart-resize-wrap" id="wrap-perf-daily-h"><canvas id="c-perf-daily-h"></canvas></div>
</div>
<div class="cb">
  <div class="ch">Monthly Actual Hours by Batch</div>
  <div class="cs">Historical stacked hours contribution</div>
  <div class="chart-resize-wrap" id="wrap-perf-monthly"><canvas id="c-perf-monthly"></canvas></div>
</div>
<div class="cb">
  <div class="ch" id="pf-recent-title">Recent Operating Days</div>
  <div class="cs">Daily intensity — flights + hours per day</div>
  <div class="pf-day-grid" id="pf-recent"></div>
</div>
```

- [ ] **Step 5.3 — Add AP127 stats strip below the second summary row**

Find the second `.ss` strip (the 4-column one with Median/Avg Hours/Best Weekday/Top Batch). Add immediately after its closing `</div>`:

```html
<div style="font-size:9px;color:var(--c127);font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;padding:0 1px">AP127 Only</div>
<div class="ss">
  <div class="sc c127"><div class="sl">AP127 Flights</div><div class="sv" style="color:var(--c127)" id="pf-127-flights">-</div><div class="ss2">in selected range</div></div>
  <div class="sc c127"><div class="sl">AP127 Hours</div><div class="sv" style="color:var(--c127)" id="pf-127-hours">-</div><div class="ss2">actual flown time</div></div>
  <div class="sc c127"><div class="sl">AP127 Ops Days</div><div class="sv" style="color:var(--c127)" id="pf-127-days">-</div><div class="ss2">days with AP127 flights</div></div>
  <div class="sc c127"><div class="sl">AP127 Avg / Day</div><div class="sv" style="color:var(--c127)" id="pf-127-avg">-</div><div class="ss2">per AP127 ops day</div></div>
  <div class="sc c127"><div class="sl">AP127 Peak Day</div><div class="sv" style="color:var(--c127)" id="pf-127-peak">-</div><div class="ss2" id="pf-127-peak-sub">-</div></div>
</div>
```

- [ ] **Step 5.4 — Verify HTML renders without error**

Open `http://localhost:7423/index.html?cb=4`, navigate to School Perf. Confirm:
- Three full-width chart blocks appear (each dragable vertically by the resize handle).
- AP127 strip with `-` placeholders appears below the second summary row.
- WE and HOL buttons appear in the filter bar.

- [ ] **Step 5.5 — Commit**

```bash
git add js/view-program.js
git commit -m "feat(perf): full-width resize charts, AP127 stats strip, WE/HOL toggles in markup"
```

---

## Task 6: School Perf — Date Logic, Filter Toggles, Weekend/Holiday Inclusion

**File:** `js/view-program.js`

- [ ] **Step 6.1 — Remove PERF_BASE_START constant and add getThreeMonthsAgo helper**

Remove the line (around line 393):
```js
const PERF_BASE_START="2025-11-01";
```

Add a helper function immediately before `renderPerformance`:
```js
function getThreeMonthsAgo(){
  const today=ap127TodayBKK();
  const d=new Date(today+'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth()-3);
  return d.toISOString().slice(0,10);
}
```

- [ ] **Step 6.2 — Update resetPerformanceFilters()**

Replace the entire `resetPerformanceFilters` function:

```js
function resetPerformanceFilters(){
  const today=ap127TodayBKK();
  const a=document.getElementById("pf-from"),b=document.getElementById("pf-to"),
        c=document.getElementById("pf-batch"),d=document.getElementById("pf-recent-n");
  if(a)a.value=getThreeMonthsAgo();
  if(b){b.value=today;b.max=today;}
  if(c)c.value="ALL";
  if(d)d.value="20";
  document.getElementById('pf-inc-we')?.classList.remove('active');
  document.getElementById('pf-inc-hol')?.classList.remove('active');
  ['pf-127-flights','pf-127-hours','pf-127-days','pf-127-avg','pf-127-peak'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.textContent='-';
  });
  const sub=document.getElementById('pf-127-peak-sub');if(sub)sub.textContent='-';
  renderPerformance();
}
```

- [ ] **Step 6.3 — Update renderPerformance(): replace PERF_BASE_START usage, clamp to-date, read toggles**

In `renderPerformance()`, replace the block that reads `fromRaw`/`toRaw` and guards against `PERF_BASE_START` (~lines 414–420):

```js
// BEFORE
const recAll=collectHistoricalFlights().filter(r=>r.date>=PERF_BASE_START);
const fromRaw=document.getElementById("pf-from")?.value||"";
const toRaw=document.getElementById("pf-to")?.value||"";
const from=(fromRaw&&fromRaw>PERF_BASE_START)?fromRaw:PERF_BASE_START;
const to=toRaw||perfDefaultEnd(recAll);
if(fromRaw&&fromRaw<PERF_BASE_START){const el=document.getElementById("pf-from");if(el)el.value=PERF_BASE_START;}

// AFTER
const today=ap127TodayBKK();
const threeMonthsAgo=getThreeMonthsAgo();
const recAll=collectHistoricalFlights().filter(r=>r.date<=today);
const fromRaw=document.getElementById("pf-from")?.value||"";
const toRaw=document.getElementById("pf-to")?.value||"";
const from=fromRaw||threeMonthsAgo;
const to=(toRaw&&toRaw<=today)?toRaw:today;
const toEl=document.getElementById("pf-to");if(toEl){toEl.max=today;if(!toRaw)toEl.value=to;}
const incWE=document.getElementById('pf-inc-we')?.classList.contains('active')||false;
const incHol=document.getElementById('pf-inc-hol')?.classList.contains('active')||false;
```

- [ ] **Step 6.4 — renderPerformance(): add weekend/holiday dates to allDates**

Find the `allDates` construction block (after `bizDates` and `opsSet`). Replace with:

```js
// BEFORE
const opsSet=new Set(bizDates);
rec.forEach(r=>opsSet.add(r.date));
const allDates=[...opsSet].sort();

// AFTER
const opsSet=new Set(bizDates);
rec.forEach(r=>opsSet.add(r.date));
if(incWE){
  let cur=new Date(from+'T12:00:00Z');const end=new Date(to+'T12:00:00Z');
  while(cur<=end){const dw=cur.getUTCDay();if(dw===0||dw===6)opsSet.add(cur.toISOString().slice(0,10));cur.setUTCDate(cur.getUTCDate()+1);}
}
if(incHol){HOL.forEach(ds=>{if(ds>=from&&ds<=to)opsSet.add(ds);});}
const allDates=[...opsSet].sort();
```

- [ ] **Step 6.5 — Verify date range defaults and toggles**

Open `http://localhost:7423/index.html?cb=5`, navigate to School Perf.
- Default "from" date is 3 months before today; "to" date is today.
- "to" input: typing a future date should be blocked (max=today).
- Click WE → button gets `.active` highlight → chart X-axis gains empty weekend bars.
- Click HOL → same for holiday dates.
- Reset Filter → both toggles deactivate, dates reset to 3m window.

- [ ] **Step 6.6 — Commit**

```bash
git add js/view-program.js
git commit -m "feat(perf): default 3-month range, clamp future dates, WE/HOL toggle for empty bars"
```

---

## Task 7: School Perf — ResizeObserver for Charts

**File:** `js/view-program.js`

- [ ] **Step 7.1 — Add observeChartResize helper inside the IIFE**

Add directly before `renderStats` function (~line 146):

```js
function observeChartResize(chartKey,wrapperId){
  if(typeof ResizeObserver==='undefined')return;
  const el=document.getElementById(wrapperId);
  if(!el||!CHARTS[chartKey])return;
  const ro=new ResizeObserver(()=>{CHARTS[chartKey]&&CHARTS[chartKey].resize();});
  ro.observe(el);
  if(!CHARTS._ro)CHARTS._ro=[];
  CHARTS._ro.push(ro);
}
```

- [ ] **Step 7.2 — Call observeChartResize after each chart is created in renderPerformance()**

After `CHARTS.perfDailyF=mkC(...)` (~line 481):
```js
observeChartResize('perfDailyF','wrap-perf-daily-f');
```
After `CHARTS.perfDailyH=mkC(...)`:
```js
observeChartResize('perfDailyH','wrap-perf-daily-h');
```
After `CHARTS.perfMonthly=mkC(...)` (~line 488):
```js
observeChartResize('perfMonthly','wrap-perf-monthly');
```

- [ ] **Step 7.3 — Disconnect ResizeObservers in destroy()**

Find `function destroy()` (~line 824):

```js
// BEFORE
function destroy() { try { Object.values(CHARTS).forEach(c => { try { c && c.destroy(); } catch (e) {} }); } catch (e) {} }

// AFTER
function destroy() {
  try { Object.values(CHARTS).forEach(c => { try { c && c.destroy?.(); } catch (e) {} }); } catch (e) {}
  try { (CHARTS._ro||[]).forEach(ro=>ro.disconnect()); CHARTS._ro=[]; } catch(e){}
}
```

- [ ] **Step 7.4 — Verify resize works**

Open School Perf. Grab the bottom-right corner handle of the Daily Flights chart and drag it taller — bars should reflow to fill the new height without overflow or clipping.

- [ ] **Step 7.5 — Commit**

```bash
git add js/view-program.js
git commit -m "feat(perf): ResizeObserver on chart wrappers — charts reflow on vertical drag"
```

---

## Task 8: School Perf — Recent N Days Horizontal Redesign

**File:** `js/view-program.js`

- [ ] **Step 8.1 — Replace pr-list generation with pf-day-grid cards**

In `renderPerformance()`, find the `recent` variable and the `document.getElementById("pf-recent").innerHTML=...` line (~line 510–512). Replace the entire block:

```js
// BEFORE
const recent=dates.filter(d=>dm[d].n>0).slice(-recentN).reverse();
const maxRecent=Math.max(...recent.map(d=>dm[d].n),1);
document.getElementById("pf-recent").innerHTML=recent.length?recent.map(d=>`<div class="pr-row"><div class="pr-date">${ap127FmtDate(d)}</div><div class="pr-bar"><div class="pr-fill" style="width:${(dm[d].n/maxRecent)*100}%"></div></div><div class="pr-meta">${dm[d].n} / ${dm[d].h.toFixed(1)}h</div></div>`).join(""):`<div class="d127-ad">No operating days in selected range.</div>`;

// AFTER
const recent=dates.filter(d=>dm[d].n>0).slice(-recentN).reverse();
const BPAL_HEX={AP124:'#4ba3f7',AP126:'#7acf7e',AP127:'#e88aff',AP129:'#e9bd63'};
const BPAL_KEYS=['AP124','AP126','AP127','AP129'];
document.getElementById("pf-recent").innerHTML=recent.length?recent.map(d=>{
  const tot=dm[d].n;
  const segs=BPAL_KEYS.map(b=>{
    const pct=(dm[d].bn[b]||0)/tot*100;
    return pct>0?`<div style="flex:${pct.toFixed(1)};background:${BPAL_HEX[b]};height:100%"></div>`:'';
  }).join('');
  return`<div class="pf-day-card"><div class="pf-day-card-date">${ap127ShortDate(d)}</div><div class="pf-day-card-bar">${segs}</div><div class="pf-day-card-n">${tot}</div><div class="pf-day-card-h">${dm[d].h.toFixed(1)}h</div></div>`;
}).join(''):`<div style="color:var(--tx3);font-size:10px;padding:10px">No data in range.</div>`;
```

- [ ] **Step 8.2 — Verify day cards render**

Open School Perf. The "Recent Operating Days" section should now show a grid of compact amber-tinted day cards, each with a stacked-by-batch mini bar, flight count, and hours.

- [ ] **Step 8.3 — Commit**

```bash
git add js/view-program.js
git commit -m "feat(perf): recent days redesign — horizontal day-card grid with per-batch mini bar"
```

---

## Task 9: School Perf — AP127 Dedicated Stats

**File:** `js/view-program.js`

- [ ] **Step 9.1 — Compute AP127-only stats in renderPerformance()**

At the end of `renderPerformance()`, just before the final `}`, add:

```js
// AP127-only stats
const rec127=rec.filter(r=>r.batch==='AP127');
const total127=rec127.length;
const hours127=rec127.reduce((a,r)=>a+r.mins,0)/60;
const dates127=[...new Set(rec127.map(r=>r.date))];
const avg127=dates127.length?(total127/dates127.length):0;
const peak127Entry=dates127.length?dates127.reduce((best,d)=>((dm[d]?.bn?.AP127||0)>(dm[best]?.bn?.AP127||0)?d:best),dates127[0]):null;
const f127=id=>{const el=document.getElementById(id);return el||{textContent:''};};
f127('pf-127-flights').textContent=total127||'-';
f127('pf-127-hours').textContent=total127?hours127.toFixed(1):'-';
f127('pf-127-days').textContent=dates127.length||'-';
f127('pf-127-avg').textContent=total127?avg127.toFixed(2):'-';
f127('pf-127-peak').textContent=peak127Entry?ap127FmtDate(peak127Entry):'-';
const peakSub=document.getElementById('pf-127-peak-sub');
if(peakSub)peakSub.textContent=peak127Entry?`${dm[peak127Entry]?.bn?.AP127||0} flights`:'';
```

- [ ] **Step 9.2 — Verify AP127 stats**

Open School Perf. The AP127 strip should show real counts matching what you'd expect from the AP127 batch in the date range. Change batch filter to "AP127" — the main stats and AP127 strip should align.

- [ ] **Step 9.3 — Commit**

```bash
git add js/view-program.js
git commit -m "feat(perf): AP127-only stats strip — flights, hours, ops days, avg/day, peak day"
```

---

## Task 10: Version Token Bump

**File:** `index.html`

- [ ] **Step 10.1 — Bump all ?v= tokens from p19 to p20**

```bash
cd /tmp/ap127_work/AP127_V2
sed -i 's/?v=p19/?v=p20/g' index.html
```

Verify the substitution:
```bash
grep '?v=' index.html | head -10
# Every line should show ?v=p20, none should show p19
```

- [ ] **Step 10.2 — Full smoke-test**

Open `http://localhost:7423/index.html?cb=99`. Check all modified views:
- Sidebar: no Slot Finder, no All Batches.
- Gantt: any solo flight shows amber + MONITOR chip.
- Simulation: Last SP finish stat; rest toggle; priority chips.
- School Perf: 4 full-width charts (drag-resizable); 3-month default; WE/HOL toggles; day cards; AP127 strip.
- Cross-Check: Confirm no regressions.
- Roster (Student view): "(Unplanned)" variants merged.

- [ ] **Step 10.3 — Commit and push**

```bash
git add index.html
git commit -m "chore: bump cache-bust token to p20"
git push
```

---

## Self-Review Checklist

| Spec requirement | Task |
|---|---|
| School Perf charts full-width resizable | T4, T5, T7 |
| Recent N days horizontal redesign | T4, T5, T8 |
| Include every day with data | T6 (allDates always includes flight days) |
| Default 3-month date range | T6 |
| Future dates disregarded | T6 |
| WE toggle (default OFF) | T5, T6 |
| HOL toggle (default OFF) | T5, T6 |
| AP127 dedicated stats | T5, T9 |
| Cross-check block time | T1 |
| All Batches removed | T1 |
| Simulation last SP finish | T3 |
| Resting regulation toggle | T3 |
| Priority regulation toggles | T3 |
| Slot Finder removed | T1 |
| Roster (Unplanned) normalised | T1 |
| Gantt solo/monitor | T2 |
| Version token bump | T10 |
