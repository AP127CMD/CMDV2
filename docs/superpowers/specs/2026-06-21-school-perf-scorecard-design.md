# School Perf — School Pace Scorecard Design

**Date:** 2026-06-21  
**Status:** Approved  
**Next step:** Implementation plan

---

## Context

The SCHOOL PERF tab currently shows only historical actuals (5 charts, KPI cards, weekly table, trend strip). There is no comparison against the curriculum plan — making it impossible to know if the school is on pace. The user wants a "Target vs Actual" scorecard section that answers: *Is the school flying as many hours/lessons as the curriculum plan says it should?*

---

## Data Sources

### Planned target (curriculum baseline)
- **Source:** `G.cur127` (AP127), `G.cur124` (AP124), `G.cur126` (AP126) in `window.NGT_CACHE`
- **Structure per lesson:** `{ lesson, planned_date, planned_mins }`
- **Meaning:** Every student in the batch is supposed to have flown this lesson by `planned_date`
- **Planned flights per month for a batch:**  
  count of lessons with `planned_date` in that month × `G.ap127.length` (student count)
- **Planned hours per month:**  
  sum of `planned_mins` for those lessons × student count / 60
- **AP129:** Uses `G.cur127` (same curriculum), student count from `G.ap129.length`
- This pattern is already used by AP127 Detail's race chart (`buildAP127RaceChart`) and `ap127PlannedHoursAsOf()`

### Actual flights
- **Source:** `collectHistoricalFlights()` — already aggregated from `G.ap124/126/127/129[i].flown[]`
- Grouped by month per batch for the scorecard

---

## What Gets Built

### Section: School Pace Scorecard (collapsible)

Inserted in `MK_PERF` **after the filter bar** and **before the existing KPI cards**.

Collapse state stored in `localStorage['pf-scorecard-collapsed']`. Default: expanded.

---

### A. KPI Strip — All Batches (7 tiles)

Each tile shows **two lines**: primary value in flights, secondary value in hours (smaller, `--tx2` colour).  
Example: primary `91%`, secondary `89% hrs` — because each lesson has a different duration, the hour-based achievement % can differ from the flight-count %. Both are meaningful.

| Tile | Primary | Secondary | Computation |
|------|---------|-----------|-------------|
| **Overall Achievement** | `91% fl` | `89% hrs` | actual ÷ planned for both flights and hours in filter range |
| **This Month** | `310 / 460 fl` | `210 / 340 h` | actual vs planned for current month, flight count and hours |
| **3-Month Pace** | `94% fl` | `92% hrs` | average achievement % across last 3 complete months, both units |
| **Shortfall** | `−140 fl` | `−28.5 h` | planned − actual, both units (negative = behind) |
| **Pace Status** | `CAUTION` | — | based on hours achievement %: ≥95% ON TRACK (green), 80–94% CAUTION (amber), <80% BEHIND (red) |
| **Monthly Trend** | `↑ fl` | `↑ hrs` | last complete month vs prior: direction for both units |
| **Weekly Trend** | `↓ fl` | `↓ hrs` | current 7-day vs prior 7 days, both units |

**Pace Status** uses hours as the primary judge (since hours reflect lesson difficulty/duration, not just count).

### B. KPI Strip — AP127 Only (7 tiles, magenta `--c127` accent)

Same 7 tiles (each with dual flight/hour values), filtered to AP127 batch only. Uses `G.cur127` and `G.ap127.length`.

---

### C. Monthly Variance Table

Rows = calendar months in the filter range.  
Two data columns for both flights and hours side by side.  
Columns: **Month | Pl fl | Act fl | Δ fl | % fl | Pl h | Act h | Δ h | % h | Status**

Color coding per row based on **hours** achievement % (primary judge):
- Green: ≥95%
- Amber: 80–94%
- Red: <80%
- Grey italic: future month (planned only, actual = "—")

Each month row is expandable (click to reveal per-batch sub-rows):

```
Month    | Pl fl | Act fl | Δ fl | % fl | Pl h  | Act h | Δ h   | % h  | Status
2026-05  |  420  |  380   | −40  | 90%  | 350h  | 310h  | −40h  | 89%  | amber ↓
  AP124  |  100  |   90   | −10  | 90%  |  85h  |  75h  | −10h  | 88%
  AP126  |  140  |  130   | −10  | 93%  | 115h  | 108h  |  −7h  | 94%
  AP127  |  120  |  105   | −15  | 88%  | 100h  |  87h  | −13h  | 87%
  AP129  |   60  |   55   |  −5  | 92%  |  50h  |  40h  | −10h  | 80%
```

Current (in-progress) month is labelled "in progress ◑" and shows partial data.  
Future months show Planned only, Actual = "—".

The table respects the current batch filter (`pf-batch` select): if a single batch is selected, only that batch's rows are shown; totals = that batch only.

On narrow/mobile viewports the hours columns collapse (show flight columns only) to keep the table readable.

---

### D. Per-Batch Achievement Bars

Two bars per batch: one for flights, one for hours. Sorted by hours achievement % descending.

```
         Flights                              Hours
AP127  ████████████████░ 96%  (105/120 fl) | ████████████████░ 87%  (87h/100h)
AP126  █████████████░░░░ 93%  (130/140 fl) | ████████████████░ 94% (108h/115h)
AP124  ████████████████░ 90%   (90/100 fl) | ████████████░░░░░ 88%   (75h/85h)
AP129  ████████████████░ 92%   (55/60 fl)  | █████████████░░░░ 80%   (40h/50h)
```

Bar color = batch color (`--c127`, `--c124`, etc.).  
Each bar pair label: `batch · NNN fl / NNN planned · NNh / NNh planned`

---

## New Functions (view-program.js)

### `collectCurriculumPlan(batchFilter?)`
```
Returns: [{date, batch, mins}]
Logic:
  For each batch in ['AP124','AP126','AP127','AP129']:
    cur = G.cur124 / G.cur126 / G.cur127 / G.cur127 (AP129 uses cur127)
    n   = G.ap124.length / G.ap126.length / etc.
    For each lesson in cur:
      Push n records {date: lesson.planned_date, batch, mins: lesson.planned_mins}
  Sort by date
  If batchFilter !== 'ALL', filter to that batch
```

### `buildMonthMap(flights, from, to)`
```
Returns: {
  [YYYY-MM]: {
    total: N,           // total flight count
    h: H,               // total hours (sum of mins/60)
    AP124: N, AP126: N, AP127: N, AP129: N,     // flight counts per batch
    hAP124: H, hAP126: H, hAP127: H, hAP129: H  // hours per batch
  }
}
Logic: groups flight records by date.slice(0,7), sums both counts and mins (converted to hours) per batch
```

### `renderScorecard(actualRec, from, to, batch)`
```
Calls:
  planRec = collectCurriculumPlan(batch)  filtered to from..to
  actualMap = buildMonthMap(actualRec, from, to)
  planMap   = buildMonthMap(planRec, from, to)
  Computes KPIs and renders HTML into #pf-scorecard-body
```

`renderPerformance()` is extended to call `renderScorecard(rec, from, to, batch)` at the end.

---

## New HTML in MK_PERF

Inserted between `</div><!-- end pf-filter -->` and the first `<div class="ss">` (KPI cards):

```html
<div id="pf-scorecard" class="pf-sc-wrap">
  <div class="pf-sc-hdr" onclick="pfToggleScorecard()">
    <span class="pf-sc-title">◆ SCHOOL PACE SCORECARD</span>
    <span id="pf-sc-chevron">▲</span>
  </div>
  <div id="pf-scorecard-body">
    <!-- KPI strip: all batches -->
    <div class="ss" id="pf-sc-kpis-all"></div>
    <!-- KPI strip: AP127 only -->
    <div style="...AP127 label..."></div>
    <div class="ss" id="pf-sc-kpis-127"></div>
    <!-- Monthly variance table -->
    <div id="pf-sc-table" class="cb" style="margin-top:10px"></div>
    <!-- Per-batch achievement bars -->
    <div id="pf-sc-bars" style="margin-top:10px"></div>
  </div>
</div>
```

---

## New CSS (program.css)

```css
.pf-sc-wrap { margin-bottom: 14px; border: 1px solid var(--bd); border-radius: 7px; overflow: hidden; }
.pf-sc-hdr { display: flex; justify-content: space-between; align-items: center;
             padding: 8px 14px; background: var(--s1); cursor: pointer; font-size: 11px;
             letter-spacing: 1.5px; font-family: 'JetBrains Mono', monospace; }
.pf-sc-hdr:hover { background: var(--s2); }
.pc-batch-row  { margin-bottom: 10px; }
.pc-batch-label { font-size: 11px; font-family: 'JetBrains Mono', monospace; letter-spacing: 1px; margin-bottom: 4px; }
.pc-bar-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; font-size: 11px; color: var(--tx2); }
.pc-bar-unit  { width: 20px; text-align: right; font-size: 10px; color: var(--tx3); }
.pc-bar-track { flex: 1; height: 7px; background: var(--s2); border-radius: 4px; overflow: hidden; }
.pc-bar-fill  { height: 100%; border-radius: 4px; transition: width 0.3s; opacity: 0.85; }
.pc-bar-fill.hours { opacity: 0.5; }  /* hours bar slightly dimmer to distinguish from flights */
.pc-bar-pct   { width: 36px; text-align: right; font-size: 11px; font-weight: 600; }
.pc-bar-detail { font-size: 10px; color: var(--tx3); margin-left: 4px; }
.pc-month-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.pc-month-tbl th { color: var(--tx2); font-weight: 500; padding: 4px 8px; text-align: right; border-bottom: 1px solid var(--bd); }
.pc-month-tbl th:first-child { text-align: left; }
.pc-month-tbl td { padding: 4px 8px; text-align: right; border-bottom: 1px solid var(--bd); }
.pc-month-tbl td:first-child { text-align: left; }
.pc-row-green { color: var(--ok, #4ade80); }
.pc-row-amber { color: var(--wa, #fbbf24); }
.pc-row-red   { color: var(--er, #f87171); }
.pc-sub-row td { font-size: 11px; color: var(--tx2); }
.pc-sub-row td:first-child { padding-left: 24px; }
/* Mobile: hide hours columns to keep table readable */
@media (max-width: 700px) {
  .pc-col-h { display: none; }
}
```

---

## Verification

1. Start preview server: `cd /Users/nugui/AP127_V2 && npx serve . -p 7423`
2. Open `http://localhost:7423/index.html?cb=1`
3. Navigate to School Perf: `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'performance'}))`
4. Verify scorecard section appears above existing KPI cards
5. Check collapse toggle works (localStorage key `pf-scorecard-collapsed`)
6. Verify KPIs compute without errors (console clean)
7. Change batch filter to "AP127" — verify table and bars update to AP127 only
8. Check date range filter affects all scorecard metrics
9. Verify Monthly Trend ↑↓ direction matches what charts show
10. Check mobile layout (sidebar collapsed, 375px viewport)
