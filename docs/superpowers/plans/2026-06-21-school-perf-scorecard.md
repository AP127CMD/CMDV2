# School Perf — School Pace Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "School Pace Scorecard" section to School Perf that compares curriculum plan targets vs actual flights/hours, in dual units (flights + hours), for all batches and AP127-only.

**Architecture:** All logic goes into `js/view-program.js` — two new helper functions (`collectCurriculumPlan`, `buildMonthMap`), one new render function (`renderScorecard`), and one toggle (`pfToggleScorecard`/`pfToggleMonthRow`). New HTML is injected into the existing `MK_PERF` template string. `renderPerformance()` calls `renderScorecard()` at the end. New visual classes go in `css/program.css`. No new files, no new dependencies.

**Tech Stack:** Plain JS (no build, no Babel/JSX), Chart.js 4.4.1 (already loaded — NOT used for scorecard), existing CSS variables (`--bd`, `--s1`, `--s2`, `--tx`, `--tx2`, `--c124`, `--c126`, `--c127`, `--c129`, `--ok`, `--wa`, `--er`)

## Global Constraints

- No build step — do NOT add npm scripts, bundlers, or build tooling
- `view-program.js` is a plain `<script>` (not `type="text/babel"`) — no JSX
- All functions defined at module scope (same as `renderPerformance`, `collectHistoricalFlights`, etc.)
- Bangkok time always via `ap127TodayBKK()` (defined at line 1424)
- Planned target = `G.cur124/cur126/cur127` curriculum dates × student count; AP129 uses `G.cur127`
- `G.ap124/ap126/ap127/ap129` are arrays of student objects — use `.length` for student count
- Pace Status verdict is based on **hours** achievement %, not flight count
- KPI tiles use existing `.sc .ca` classes for layout; add a second-line `div` for the hours value
- Monthly table hours columns carry class `pc-col-h` — hidden at ≤700 px via CSS
- Achievement bars: flights bar at full opacity, hours bar at opacity 0.5 to visually distinguish
- Version token bump: `p89` → `p90` on **all** `<script>` tags in `index.html` (final commit)
- Commit format: `pNN: description` (no co-author line needed for intermediate commits)

---

### Task 1: Data helpers — `collectCurriculumPlan()` and `buildMonthMap()`

**Files:**
- Modify: `js/view-program.js` — insert two functions after `collectHistoricalFlights()` at line 1437

**Interfaces:**
- Consumes: `G.cur124`, `G.cur126`, `G.cur127` (each is `[{lesson, planned_date, planned_mins}]`), `G.ap124/ap126/ap127/ap129` (student arrays, `.length` gives student count)
- Produces:
  - `collectCurriculumPlan(batchFilter?: 'ALL'|'AP124'|'AP126'|'AP127'|'AP129'): {date:string, batch:string, mins:number}[]`  
    Returns one record per (student × lesson). 28 AP127 students × 96 lessons = 2688 records.
  - `buildMonthMap(flights: {date,batch,mins}[], from: string, to: string): Record<string, {total:number, h:number, AP124:number, AP126:number, AP127:number, AP129:number, hAP124:number, hAP126:number, hAP127:number, hAP129:number}>`

- [ ] **Step 1: Insert `collectCurriculumPlan()` after the closing `}` of `collectHistoricalFlights` (line 1437)**

```javascript
function collectCurriculumPlan(batchFilter) {
  const BATCH_CUR = [
    ['AP124','ap124','cur124'],
    ['AP126','ap126','cur126'],
    ['AP127','ap127','cur127'],
    ['AP129','ap129','cur127'], // AP129 shares AP127 curriculum
  ];
  const rec = [];
  BATCH_CUR.forEach(([batch, key, curKey]) => {
    if (batchFilter && batchFilter !== 'ALL' && batchFilter !== batch) return;
    const cur = G?.[curKey] || [];
    const n = (G?.[key] || []).length;
    if (!n) return;
    cur.forEach(c => {
      if (!c.planned_date) return;
      for (let i = 0; i < n; i++) {
        rec.push({ date: c.planned_date, batch, mins: c.planned_mins || 60 });
      }
    });
  });
  return rec.sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 2: Insert `buildMonthMap()` immediately after `collectCurriculumPlan()`**

```javascript
function buildMonthMap(flights, from, to) {
  const map = {};
  flights.forEach(r => {
    if (!r.date || r.date < from || r.date > to) return;
    const m = r.date.slice(0, 7);
    if (!map[m]) map[m] = {
      total:0, h:0,
      AP124:0, AP126:0, AP127:0, AP129:0,
      hAP124:0, hAP126:0, hAP127:0, hAP129:0,
    };
    map[m].total++;
    const hrs = (r.mins || 60) / 60;
    map[m].h += hrs;
    if (r.batch in map[m]) {
      map[m][r.batch]++;
      map[m]['h' + r.batch] += hrs;
    }
  });
  return map;
}
```

- [ ] **Step 3: Smoke-test in browser DevTools console**

Start server: `cd /Users/nugui/AP127_V2 && npx serve . -p 7423`  
Open `http://localhost:7423/index.html?cb=1` → navigate to School Perf:
```javascript
window.dispatchEvent(new CustomEvent('ap127-go', {detail:'performance'}))
```

Run in DevTools console:
```javascript
// collectCurriculumPlan
const plan = collectCurriculumPlan('ALL');
console.assert(plan.length > 1000, 'Expected >1000 records, got ' + plan.length);
console.assert(plan[0].date && plan[0].batch && plan[0].mins, 'Record shape ok');
const ap127Plan = collectCurriculumPlan('AP127');
console.assert(ap127Plan.every(r => r.batch === 'AP127'), 'AP127 filter works');
console.log('AP127 plan records:', ap127Plan.length); // 28 students × 96 lessons = 2688

// buildMonthMap
const today = ap127TodayBKK();
const from = getThreeMonthsAgo();
const mm = buildMonthMap(plan, from, today);
const keys = Object.keys(mm).sort();
console.assert(keys.length > 0, 'Month map has entries');
const sample = mm[keys[0]];
console.assert('total' in sample && 'h' in sample && 'AP127' in sample, 'Map shape ok');
console.log('Sample month entry:', sample);
// Expected shape: {total: N, h: H, AP124: N, AP126: N, AP127: N, AP129: N, hAP124: H, ...}
```

All assertions should pass with no errors in console.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-program.js
git commit -m "p90: school perf scorecard — data helpers (collectCurriculumPlan, buildMonthMap)"
```

---

### Task 2: CSS + HTML scaffold + toggle functions

**Files:**
- Modify: `css/program.css` — append new CSS at end of file
- Modify: `js/view-program.js` — (a) insert scorecard HTML into `MK_PERF`, (b) add `pfToggleScorecard()` and `pfToggleMonthRow()`

**Interfaces:**
- Consumes: nothing from Task 1 yet (scaffold only — DOM elements are empty until Task 3)
- Produces: DOM structure that Tasks 3–5 will populate:
  - `#pf-scorecard` — outer collapsible wrapper
  - `#pf-scorecard-body` — collapsible body (hidden when collapsed)
  - `#pf-sc-kpis-all` — KPI tile grid, all batches
  - `#pf-sc-kpis-127` — KPI tile grid, AP127 only
  - `#pf-sc-table` — monthly variance table container
  - `#pf-sc-bars` — achievement bars container
  - `pfToggleScorecard()` — global function for onclick
  - `pfToggleMonthRow(m)` — global function for onclick

- [ ] **Step 1: Append new CSS to end of `css/program.css`**

```css
/* ── School Pace Scorecard ─────────────────────────────────────────── */
.pf-sc-wrap{margin-bottom:14px;border:1px solid var(--bd);border-radius:7px;overflow:hidden}
.pf-sc-hdr{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;
  background:var(--s1);cursor:pointer;font-size:11px;letter-spacing:1.5px;
  text-transform:uppercase;font-family:'JetBrains Mono',monospace;user-select:none}
.pf-sc-hdr:hover{background:var(--s2)}
.pf-sc-body{padding:10px 12px 14px}
/* Batch achievement bars */
.pc-batch-row{margin-bottom:10px}
.pc-batch-label{font-size:11px;font-family:'JetBrains Mono',monospace;letter-spacing:1px;margin-bottom:4px}
.pc-bar-wrap{display:flex;align-items:center;gap:8px;margin-bottom:3px}
.pc-bar-unit{width:22px;text-align:right;font-size:10px;color:var(--tx2);font-family:'JetBrains Mono',monospace}
.pc-bar-track{flex:1;height:7px;background:var(--s2);border-radius:4px;overflow:hidden}
.pc-bar-fill{height:100%;border-radius:4px;transition:width .3s}
.pc-bar-fill.pc-bar-h{opacity:.5}
.pc-bar-pct{width:36px;text-align:right;font-size:11px;font-weight:600}
.pc-bar-detail{font-size:10px;color:var(--tx2)}
/* Monthly variance table */
.pc-month-tbl{width:100%;border-collapse:collapse;font-size:12px}
.pc-month-tbl th{color:var(--tx2);font-weight:500;padding:4px 8px;text-align:right;
  border-bottom:1px solid var(--bd);white-space:nowrap}
.pc-month-tbl th:first-child{text-align:left}
.pc-month-tbl td{padding:4px 8px;text-align:right;border-bottom:1px solid var(--bd);white-space:nowrap}
.pc-month-tbl td:first-child{text-align:left;cursor:pointer}
.pc-month-tbl tr:last-child td{border-bottom:none}
.pc-sub-row td{font-size:11px;color:var(--tx2)}
.pc-sub-row td:first-child{padding-left:22px;cursor:default}
.pc-row-green{color:var(--ok,#4ade80)}
.pc-row-amber{color:var(--wa,#fbbf24)}
.pc-row-red{color:var(--er,#f87171)}
.pc-row-grey{color:var(--tx2);font-style:italic}
@media(max-width:700px){.pc-col-h{display:none}}
```

- [ ] **Step 2: Insert scorecard HTML into `MK_PERF` in `js/view-program.js`**

In `MK_PERF` (around line 2195), locate the line:
```html
  <div class="ss">
    <div class="sc ca"><div class="sl">Total Historical Flights</div>
```

Insert the following block **immediately before** that `<div class="ss">` opening tag:

```html
  <div id="pf-scorecard" class="pf-sc-wrap">
    <div class="pf-sc-hdr" onclick="pfToggleScorecard()">
      <span>◆ SCHOOL PACE SCORECARD</span>
      <span id="pf-sc-chevron">▲</span>
    </div>
    <div id="pf-scorecard-body" class="pf-sc-body">
      <div class="ss" id="pf-sc-kpis-all" style="margin-bottom:8px"></div>
      <div style="font-size:9px;color:var(--c127);font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;margin:8px 0 4px">AP127 Only</div>
      <div class="ss" id="pf-sc-kpis-127" style="margin-bottom:12px"></div>
      <div id="pf-sc-table" style="overflow-x:auto;margin-bottom:12px"></div>
      <div id="pf-sc-bars"></div>
    </div>
  </div>
```

- [ ] **Step 3: Add `pfToggleScorecard()` and `pfToggleMonthRow()` in `js/view-program.js`**

Insert both functions immediately before `function renderPerformance()` (line 1464):

```javascript
function pfToggleScorecard() {
  const body = document.getElementById('pf-scorecard-body');
  const chev = document.getElementById('pf-sc-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if (chev) chev.textContent = isOpen ? '▼' : '▲';
  try { localStorage.setItem('pf-scorecard-collapsed', isOpen ? '1' : '0'); } catch(e) {}
}
function pfToggleMonthRow(m) {
  const sub = document.getElementById('pf-sc-sub-' + m);
  if (sub) sub.style.display = sub.style.display === 'none' ? '' : 'none';
}
```

- [ ] **Step 4: Verify scaffold in browser**

Reload `http://localhost:7423/index.html?cb=2`, navigate to School Perf.

Check:
- "◆ SCHOOL PACE SCORECARD" header bar appears above the existing "Total Historical Flights" KPI cards
- Clicking the header makes the body disappear (chevron changes to ▼)
- Clicking again restores it (chevron ▲)
- Refresh the page — collapse state is preserved (check `localStorage.getItem('pf-scorecard-collapsed')`)
- Console: zero errors

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add css/program.css js/view-program.js
git commit -m "p90: school perf scorecard — CSS + HTML scaffold + toggle"
```

---

### Task 3: `renderScorecard()` — KPI strips

**Files:**
- Modify: `js/view-program.js` — add `renderScorecard()` function; call it from `renderPerformance()`

**Interfaces:**
- Consumes: `collectCurriculumPlan('ALL'|batch)`, `buildMonthMap(flights, from, to)`, `ap127TodayBKK()`, DOM IDs `#pf-sc-kpis-all`, `#pf-sc-kpis-127`
- Produces: `renderScorecard(actualAllRec, from, to, batch)` — `actualAllRec` is ALL batches, date-filtered; `batch` is the UI batch selector value

- [ ] **Step 1: Add `renderScorecard()` before `pfToggleScorecard()`**

```javascript
function renderScorecard(actualAllRec, from, to, batch) {
  const today = ap127TodayBKK();
  const thisMonth = today.slice(0, 7);

  // Restore collapse state on re-render
  try {
    const body = document.getElementById('pf-scorecard-body');
    const chev = document.getElementById('pf-sc-chevron');
    const collapsed = localStorage.getItem('pf-scorecard-collapsed') === '1';
    if (body) body.style.display = collapsed ? 'none' : '';
    if (chev) chev.textContent = collapsed ? '▼' : '▲';
  } catch(e) {}

  // ── Shared month maps (all batches, full date range) ──
  const planMapAll = buildMonthMap(collectCurriculumPlan('ALL'), from, to);
  const actMapAll  = buildMonthMap(actualAllRec, from, to);
  const allMonths  = [...new Set([...Object.keys(planMapAll), ...Object.keys(actMapAll)])].sort();

  // ── KPI computation for a given batch filter ──
  function scKpis(batchF) {
    const planM = batchF === 'ALL' ? planMapAll
      : buildMonthMap(collectCurriculumPlan(batchF), from, to);
    const actM  = batchF === 'ALL' ? actMapAll
      : buildMonthMap(actualAllRec.filter(r => r.batch === batchF), from, to);

    const months   = [...new Set([...Object.keys(planM), ...Object.keys(actM)])].sort();
    const elapsed  = months.filter(m => m <= thisMonth);
    const complete = elapsed.filter(m => m < thisMonth);

    const planTotFl = elapsed.reduce((s,m) => s + (planM[m]?.total || 0), 0);
    const planTotH  = elapsed.reduce((s,m) => s + (planM[m]?.h    || 0), 0);
    const actTotFl  = elapsed.reduce((s,m) => s + (actM[m]?.total || 0), 0);
    const actTotH   = elapsed.reduce((s,m) => s + (actM[m]?.h    || 0), 0);

    const achPctFl = planTotFl ? Math.round(actTotFl / planTotFl * 100) : null;
    const achPctH  = planTotH  ? Math.round(actTotH  / planTotH  * 100) : null;

    const planThisFl = planM[thisMonth]?.total || 0;
    const planThisH  = planM[thisMonth]?.h    || 0;
    const actThisFl  = actM[thisMonth]?.total || 0;
    const actThisH   = actM[thisMonth]?.h    || 0;

    const shortFl = actTotFl - planTotFl;
    const shortH  = actTotH  - planTotH;

    // 3-month pace — avg achievement % of last 3 complete months
    const last3 = complete.slice(-3);
    function pace3(field) {
      if (!last3.length) return null;
      return Math.round(last3.reduce((s, m) => {
        const p = planM[m]?.[field] || 0;
        const a = actM[m]?.[field]  || 0;
        return s + (p ? a / p * 100 : 100);
      }, 0) / last3.length);
    }
    const pace3Fl = pace3('total');
    const pace3H  = pace3('h');

    // Pace status (based on hours %)
    const pctH = achPctH ?? 0;
    const statusLabel = achPctH === null ? '—'
      : pctH >= 95 ? 'ON TRACK' : pctH >= 80 ? 'CAUTION' : 'BEHIND';
    const statusColor = achPctH === null ? 'var(--tx2)'
      : pctH >= 95 ? 'var(--ok,#4ade80)' : pctH >= 80 ? 'var(--wa,#fbbf24)' : 'var(--er,#f87171)';

    // Monthly trend — last 2 complete months
    function trendArrow(prev, curr) {
      if (prev === null || curr === null) return '—';
      return curr > prev + 2 ? '↑' : curr < prev - 2 ? '↓' : '→';
    }
    function monthPct(m, field) {
      const p = planM[m]?.[field] || 0; const a = actM[m]?.[field] || 0;
      return p ? Math.round(a / p * 100) : null;
    }
    const last2 = complete.slice(-2);
    const moTrendFl = last2.length === 2 ? trendArrow(monthPct(last2[0],'total'), monthPct(last2[1],'total')) : '—';
    const moTrendH  = last2.length === 2 ? trendArrow(monthPct(last2[0],'h'),     monthPct(last2[1],'h'))    : '—';

    // Weekly trend — last 7 vs prior 7 days
    function daysAgoStr(n) {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - n);
      return d.toISOString().slice(0, 10);
    }
    const ds7 = daysAgoStr(7); const ds14 = daysAgoStr(14);
    const filtRec = batchF === 'ALL' ? actualAllRec : actualAllRec.filter(r => r.batch === batchF);
    const cur7Fl  = filtRec.filter(r => r.date >= ds7  && r.date <= today).length;
    const pri7Fl  = filtRec.filter(r => r.date >= ds14 && r.date <  ds7 ).length;
    const cur7H   = filtRec.filter(r => r.date >= ds7  && r.date <= today).reduce((s,r) => s + (r.mins||60)/60, 0);
    const pri7H   = filtRec.filter(r => r.date >= ds14 && r.date <  ds7 ).reduce((s,r) => s + (r.mins||60)/60, 0);
    const wkTrendFl = trendArrow(pri7Fl, cur7Fl);
    const wkTrendH  = trendArrow(pri7H,  cur7H);

    // ── Tile builder ──
    function pctStr(v) { return v === null ? '—' : v + '%'; }
    function fmtH(h) { return h.toFixed(1) + 'h'; }
    function fmtShort(v, isH) {
      const s = v >= 0 ? '+' : '';
      return s + (isH ? v.toFixed(1) + 'h' : v);
    }
    function tile(label, primary, secondary, sub, color) {
      return `<div class="sc ca">` +
        `<div class="sl">${label}</div>` +
        `<div class="sv" style="color:${color||'inherit'};font-size:clamp(13px,1.8vw,18px)">${primary}</div>` +
        (secondary ? `<div style="font-size:11px;color:var(--tx2);margin-top:1px">${secondary}</div>` : '') +
        (sub ? `<div class="ss2">${sub}</div>` : '') +
        `</div>`;
    }

    const shortColor = shortFl < 0 ? 'var(--er,#f87171)' : shortFl > 0 ? 'var(--ok,#4ade80)' : 'inherit';

    return [
      tile('Overall Achievement', pctStr(achPctFl) + ' fl', pctStr(achPctH) + ' hrs', 'actual ÷ plan'),
      tile('This Month', `${actThisFl} / ${planThisFl} fl`, `${fmtH(actThisH)} / ${fmtH(planThisH)}`, 'actual / planned'),
      tile('3-Month Pace', pctStr(pace3Fl) + ' fl', pctStr(pace3H) + ' hrs', 'avg last 3 months'),
      tile('Shortfall', fmtShort(shortFl, false) + ' fl', fmtShort(shortH, true), shortFl < 0 ? 'behind plan' : 'ahead of plan', shortColor),
      tile('Pace Status', statusLabel, '', '', statusColor),
      tile('Monthly Trend', moTrendFl + ' fl', moTrendH + ' hrs', 'vs prior month'),
      tile('Weekly Trend', wkTrendFl + ' fl', wkTrendH + ' hrs', 'vs prior 7 days'),
    ].join('');
  }

  const kpiAll = document.getElementById('pf-sc-kpis-all');
  const kpi127 = document.getElementById('pf-sc-kpis-127');
  if (kpiAll) kpiAll.innerHTML = scKpis('ALL');
  if (kpi127) kpi127.innerHTML = scKpis('AP127');
}
```

- [ ] **Step 2: Call `renderScorecard()` at the end of `renderPerformance()`**

Inside `renderPerformance()`, find the closing `}` at line 1742. Insert this line immediately before it:

```javascript
  renderScorecard(recAll.filter(r => r.date >= from && r.date <= to), from, to, batch);
```

`recAll` (line 1467) is all batches, date-capped at today. Filtering to `[from, to]` gives date-range data without the batch filter — so `renderScorecard` can compute both the All-Batches and AP127-only KPI strips independently.

- [ ] **Step 3: Verify KPI strips in browser**

Reload `http://localhost:7423/index.html?cb=3`, navigate to School Perf.

Checks:
- 7 KPI tiles appear in the "All Batches" row inside the scorecard
- Each tile shows two lines: e.g. "91% fl" (primary) and "89% hrs" (secondary, smaller, grey)
- 7 KPI tiles in the "AP127 Only" row (below the magenta "AP127 ONLY" label)
- Shortfall tile is red when behind, green when ahead
- Pace Status shows one of: "ON TRACK" (green), "CAUTION" (amber), "BEHIND" (red)
- Changing the date range (`pf-from`/`pf-to`) re-renders and updates KPIs
- Changing batch filter (`pf-batch` to "AP127") — both strips still show (they're always All + AP127)
- Console: zero errors

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-program.js
git commit -m "p90: school perf scorecard — KPI strips (all batches + AP127)"
```

---

### Task 4: Monthly Variance Table

**Files:**
- Modify: `js/view-program.js` — extend `renderScorecard()` to populate `#pf-sc-table`

**Interfaces:**
- Consumes: `planMapAll`, `actMapAll`, `allMonths`, `thisMonth` (all in scope inside `renderScorecard`)
- Produces: HTML table in `#pf-sc-table`; `pfToggleMonthRow(m)` (already added in Task 2) handles row expand/collapse

- [ ] **Step 1: Add table rendering to end of `renderScorecard()` (after the kpi127 line)**

Inside `renderScorecard()`, after `if (kpi127) kpi127.innerHTML = scKpis('AP127');`, append:

```javascript
  // ── Monthly Variance Table ──
  const scTbl = document.getElementById('pf-sc-table');
  if (!scTbl) return;

  // Batches shown in sub-rows depend on batch filter
  const BATCHES_SHOW = batch === 'ALL'
    ? ['AP124','AP126','AP127','AP129']
    : [batch];

  function rowCls(pctH) {
    if (pctH === null) return 'pc-row-grey';
    return pctH >= 95 ? 'pc-row-green' : pctH >= 80 ? 'pc-row-amber' : 'pc-row-red';
  }
  function fmtDelta(a, p, isH) {
    const d = a - p;
    const s = d >= 0 ? '+' : '';
    return s + (isH ? d.toFixed(1) + 'h' : d);
  }
  function pct(a, p) { return p ? Math.round(a / p * 100) + '%' : '—'; }

  // Build table HTML — each month is its own <tbody> pair (header row + sub-rows tbody)
  // This avoids invalid nested <tbody> and lets display:none work cleanly on sub-rows.
  let html = `<table class="pc-month-tbl">
    <thead><tr>
      <th>Month</th>
      <th>Pl fl</th><th>Act fl</th><th>Δ fl</th>
      <th class="pc-col-h">Pl h</th><th class="pc-col-h">Act h</th><th class="pc-col-h">Δ h</th>
      <th>% fl</th><th class="pc-col-h">% h</th><th>Status</th>
    </tr></thead>`;

  allMonths.forEach(m => {
    const isFuture  = m > thisMonth;
    const isCurrent = m === thisMonth;

    const pFl = planMapAll[m]?.total || 0;
    const pH  = planMapAll[m]?.h    || 0;
    const aFl = isFuture ? 0 : (actMapAll[m]?.total || 0);
    const aH  = isFuture ? 0 : (actMapAll[m]?.h    || 0);

    const pctFl = isFuture ? null : (pFl ? Math.round(aFl / pFl * 100) : null);
    const pctH  = isFuture ? null : (pH  ? Math.round(aH  / pH  * 100) : null);
    const cls   = isFuture ? 'pc-row-grey' : rowCls(pctH);

    const monthLabel = m + (isCurrent ? ' ◑' : '');
    const aFlStr = isFuture ? '—' : aFl;
    const aHStr  = isFuture ? '—' : aH.toFixed(1) + 'h';
    const dFlStr = isFuture ? '—' : fmtDelta(aFl, pFl, false);
    const dHStr  = isFuture ? '—' : fmtDelta(aH,  pH,  true);
    const statusIcon = isFuture ? '⋯'
      : cls === 'pc-row-green' ? '✓'
      : cls === 'pc-row-amber' ? '△' : '✗';

    // Month header row — its own <tbody> so the sub-rows <tbody> can be a sibling
    html += `<tbody>
      <tr class="${cls}" onclick="pfToggleMonthRow('${m}')">
        <td>▸ ${monthLabel}</td>
        <td>${pFl}</td><td>${aFlStr}</td><td>${dFlStr}</td>
        <td class="pc-col-h">${pH.toFixed(1)}h</td><td class="pc-col-h">${aHStr}</td><td class="pc-col-h">${dHStr}</td>
        <td>${pct(aFl,pFl)}</td><td class="pc-col-h">${pct(aH,pH)}</td><td>${statusIcon}</td>
      </tr>
    </tbody>`;

    // Per-batch sub-rows in a sibling <tbody> (hidden by default)
    html += `<tbody id="pf-sc-sub-${m}" style="display:none">`;
    BATCHES_SHOW.forEach(b => {
      const bn   = b.replace('AP', '');
      const bPFl = planMapAll[m]?.[b]        || 0;
      const bPH  = planMapAll[m]?.['h' + b]  || 0;
      const bAFl = isFuture ? 0 : (actMapAll[m]?.[b]        || 0);
      const bAH  = isFuture ? 0 : (actMapAll[m]?.['h' + b]  || 0);
      const bPctH = isFuture ? null : (bPH ? Math.round(bAH / bPH * 100) : null);
      const bCls  = isFuture ? 'pc-row-grey' : rowCls(bPctH);
      html += `<tr class="pc-sub-row ${bCls}">
        <td style="color:var(--c${bn})">${b}</td>
        <td>${bPFl}</td><td>${isFuture ? '—' : bAFl}</td><td>${isFuture ? '—' : fmtDelta(bAFl, bPFl, false)}</td>
        <td class="pc-col-h">${bPH.toFixed(1)}h</td>
        <td class="pc-col-h">${isFuture ? '—' : bAH.toFixed(1) + 'h'}</td>
        <td class="pc-col-h">${isFuture ? '—' : fmtDelta(bAH, bPH, true)}</td>
        <td>${pct(bAFl, bPFl)}</td><td class="pc-col-h">${pct(bAH, bPH)}</td><td></td>
      </tr>`;
    });
    html += `</tbody>`;
  });
  html += `</table>`;
  scTbl.innerHTML = html;
```

- [ ] **Step 2: Verify the monthly table in browser**

Reload `http://localhost:7423/index.html?cb=4`, navigate to School Perf.

Checks:
- Monthly table appears below the two KPI strips
- Each month row shows: month label, Pl fl, Act fl, Δ fl, (Pl h / Act h / Δ h hidden on wide viewport — these appear), % fl, % h, status icon (✓/△/✗/⋯)
- Clicking a month row expands per-batch sub-rows (AP124 / AP126 / AP127 / AP129); clicking again collapses
- Batch colors in sub-rows: AP124=blue (`--c124`), AP126=green (`--c126`), AP127=magenta (`--c127`), AP129=gold (`--c129`)
- Current month shows "2026-06 ◑" in the month column
- Future months (if in date range) show grey italic style with "—" for actuals
- Green rows at ≥95%, amber 80-94%, red <80%
- Narrowing browser to ≤700px hides the three `.pc-col-h` column groups
- Changing `pf-batch` to "AP127" → sub-rows show only AP127; total row shows AP127 plan vs actual
- Console: zero errors

- [ ] **Step 3: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-program.js
git commit -m "p90: school perf scorecard — monthly variance table with expandable batch rows"
```

---

### Task 5: Achievement bars + version bump + final commit

**Files:**
- Modify: `js/view-program.js` — extend `renderScorecard()` to populate `#pf-sc-bars`
- Modify: `index.html` — bump all `?v=p89` → `?v=p90`

**Interfaces:**
- Consumes: `planMapAll`, `actMapAll`, `allMonths`, `thisMonth`, `batch` (all in scope inside `renderScorecard`)
- Produces: per-batch dual-bar rows in `#pf-sc-bars`

- [ ] **Step 1: Add achievement bars to `renderScorecard()` (after `scTbl.innerHTML = html;`)**

```javascript
  // ── Per-Batch Achievement Bars ──
  const scBars = document.getElementById('pf-sc-bars');
  if (!scBars) return;

  const elapsed = allMonths.filter(m => m <= thisMonth);
  const barsForBatch = batch === 'ALL'
    ? ['AP127','AP126','AP124','AP129']  // AP127 first (primary interest)
    : [batch];

  const barData = barsForBatch.map(b => {
    const totPFl = elapsed.reduce((s,m) => s + (planMapAll[m]?.[b]       || 0), 0);
    const totAFl = elapsed.reduce((s,m) => s + (actMapAll[m]?.[b]        || 0), 0);
    const totPH  = elapsed.reduce((s,m) => s + (planMapAll[m]?.['h' + b] || 0), 0);
    const totAH  = elapsed.reduce((s,m) => s + (actMapAll[m]?.['h'  + b] || 0), 0);
    const pctFl  = totPFl ? Math.round(totAFl / totPFl * 100) : 0;
    const pctH   = totPH  ? Math.round(totAH  / totPH  * 100) : 0;
    return { b, pctFl, pctH, totAFl, totPFl, totAH, totPH };
  }).sort((x, y) => y.pctH - x.pctH);

  scBars.innerHTML =
    `<div style="font-size:11px;color:var(--tx2);font-family:'JetBrains Mono',monospace;letter-spacing:1px;margin-bottom:8px">BATCH ACHIEVEMENT</div>` +
    barData.map(({ b, pctFl, pctH, totAFl, totPFl, totAH, totPH }) => {
      const bn  = b.replace('AP', '');
      const col = `var(--c${bn})`;
      const wFl = Math.min(pctFl, 100);
      const wH  = Math.min(pctH,  100);
      return `<div class="pc-batch-row">
        <div class="pc-batch-label" style="color:${col}">${b}</div>
        <div class="pc-bar-wrap">
          <span class="pc-bar-unit">fl</span>
          <div class="pc-bar-track">
            <div class="pc-bar-fill" style="width:${wFl}%;background:${col}"></div>
          </div>
          <span class="pc-bar-pct" style="color:${col}">${pctFl}%</span>
          <span class="pc-bar-detail">${totAFl} / ${totPFl} fl</span>
        </div>
        <div class="pc-bar-wrap">
          <span class="pc-bar-unit">h</span>
          <div class="pc-bar-track">
            <div class="pc-bar-fill pc-bar-h" style="width:${wH}%;background:${col}"></div>
          </div>
          <span class="pc-bar-pct" style="color:${col};opacity:.7">${pctH}%</span>
          <span class="pc-bar-detail">${totAH.toFixed(1)}h / ${totPH.toFixed(1)}h</span>
        </div>
      </div>`;
    }).join('');
```

- [ ] **Step 2: Bump version token in `index.html`**

Replace ALL occurrences of `?v=p89` with `?v=p90`:
```bash
sed -i '' 's/?v=p89/?v=p90/g' /Users/nugui/AP127_V2/index.html
```

Verify only one unique token remains:
```bash
grep -o '?v=p[0-9]*' /Users/nugui/AP127_V2/index.html | sort -u
# Expected: ?v=p90
```

- [ ] **Step 3: Full end-to-end verification**

Reload `http://localhost:7423/index.html?cb=5`, navigate to School Perf.

**Full checklist:**
1. ◆ SCHOOL PACE SCORECARD header bar appears above existing KPI cards
2. Collapse toggle works (header click → body hides/shows, chevron flips ▲/▼)
3. Collapse state survives a filter change (re-render doesn't reset it)
4. All Batches KPI strip: 7 tiles, each with flight % primary and hours % secondary
5. AP127 Only KPI strip: same 7 tiles, always showing AP127 data regardless of batch filter
6. Monthly table: correct rows for each month in filter range
7. Clicking month row expands per-batch sub-rows; clicking again collapses
8. Achievement bars: two bars per batch (fl full / h dimmer), sorted by hours % descending
9. Bars show `actual / planned` counts as text next to each bar
10. Changing batch filter (to "AP127") → table sub-rows show AP127 only; bars show AP127 only
11. Changing date range → all scorecard metrics update correctly
12. At ≤700 px viewport, `.pc-col-h` columns (Pl h, Act h, Δ h, % h) are hidden
13. Console: **zero errors**

- [ ] **Step 4: Update `REVAMP.md`**

In `/Users/nugui/AP127_V2/REVAMP.md`, find the change log table and prepend:
```
| 2026-06-21 | p90: School Perf Scorecard — planned vs actual in dual units (flights + hours); collapsible section with 7-tile KPI strips (All Batches + AP127 Only), monthly variance table (expandable per-batch rows, green/amber/red), per-batch achievement bars sorted by hours % |
```

- [ ] **Step 5: Update `CLAUDE.md` for this project**

In `/Users/nugui/AP127_V2/CLAUDE.md`, update the "Last known" line in the Verify section to:
```
**Last known:** all files `p90` (2026-06-21 — School Perf Scorecard: collapsible planned vs actual section; dual flight+hour KPI strips, monthly variance table, per-batch bars). Next → `p91`.
```

- [ ] **Step 6: Update AP127_Docs README (§2.4 + §10 log)**

Open `/Users/nugui/AP127_Docs/README.md`.

In **§2.4 (CMDV2)**, add a bullet to the feature list:
```
- **School Pace Scorecard (p90, 2026-06-21):** Collapsible scorecard section in School Perf — compares curriculum plan targets vs actuals in dual units (flights + hours). 7-tile KPI strips for All Batches and AP127 Only (Achievement %, This Month, 3-Month Pace, Shortfall, Pace Status, Monthly/Weekly Trend). Monthly variance table with expandable per-batch rows (green/amber/red by hours %). Per-batch achievement bars sorted by hours %.
```

In **§10 (Change Log)**, add an entry:
```
| 2026-06-21 | CMDV2 p90 | School Perf Scorecard — planned vs actual dual-unit section |
```

- [ ] **Step 7: Commit and push AP127_Docs**

```bash
cd /Users/nugui/AP127_Docs
git add README.md
git commit -m "docs: CMDV2 p90 — School Perf Scorecard"
git push
```

- [ ] **Step 8: Update project memory file**

In `/Users/nugui/.claude/projects/-Users-nugui/memory/project_ap127_v2.md`, find the line that references the current `?v=` token (p89) and update it to reflect p90 and the new scorecard feature. Add a bullet in the change history section:
```
- **School Pace Scorecard (code `?v=p90`, 2026-06-21):** Collapsible section in School Perf comparing curriculum plan targets vs actuals in dual units (flights + hours). New data helpers: `collectCurriculumPlan()` (expands `G.cur127` × student count) and `buildMonthMap()` (groups {date,batch,mins} by YYYY-MM). `renderScorecard(actualAllRec, from, to, batch)` called from `renderPerformance()`. Components: 7-tile KPI strips × 2 (All Batches + AP127 — Achievement%, This Month, 3-Month Pace, Shortfall, Pace Status, Monthly Trend, Weekly Trend); Monthly Variance Table (expandable per-batch rows, color-coded by hours %, mobile hides `.pc-col-h` columns ≤700px); Per-batch Achievement Bars (two bars per batch: flights full opacity, hours 0.5 opacity). Collapse state in `localStorage['pf-scorecard-collapsed']`. **Current `?v=` token: `p90`.**
```

- [ ] **Step 9: Final commit of CMDV2**

```bash
cd /Users/nugui/AP127_V2
git add js/view-program.js css/program.css index.html REVAMP.md CLAUDE.md
git commit -m "p90: school perf scorecard — achievement bars, version bump, full feature"
```

- [ ] **Step 10: Push CMDV2 and confirm live deploy**

```bash
cd /Users/nugui/AP127_V2
git pull --rebase && git push
```

Wait ~2 minutes for Cloudflare Pages auto-deploy. Open https://ap127-ngt2.pages.dev, navigate to School Perf, and confirm the scorecard section appears.
