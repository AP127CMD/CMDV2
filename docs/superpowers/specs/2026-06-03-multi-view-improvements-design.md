# AP127 V2 — Multi-View Improvements Design
**Date:** 2026-06-03  
**Scope:** School Perf, Cross-Check, Simulation, All Batches, Slot Finder, Roster, Gantt  
**Files:** `js/view-program.js`, `js/shell.js`, `js/view-roster.js`, `js/view-gantt.js`, `assets/reconcile.js`, `css/program.css`

---

## 1. School Perf — Full-Width Resizable Charts

**Current:** Charts are in a 2-column `.cr.c2` grid (250 px tall, side by side).

**Change:** Each chart block becomes full-width, single-column. Chart wrappers get:
```css
resize: vertical;
overflow: hidden;
min-height: 180px;
```
A `ResizeObserver` on each wrapper triggers `chart.resize()` so bars reflow on drag. Default height raised to **280 px**. Horizontal sizing is automatic (Chart.js `responsive: true`).

**Affected markup in `MK_PERF`:**  
- Remove `.cr.c2` wrapper divs; each `.cb` stands alone at 100% width.  
- Add `resize: vertical; overflow: hidden` to each `style="position:relative;height:280px"` wrapper.  
- Add `ResizeObserver` setup in `renderPerformance()` (or a shared `observeChartResize(id)` helper).

---

## 2. School Perf — Date Range & Filters

**Current:** `PERF_BASE_START = "2025-11-01"` (hardcoded). `to` defaults to last-flight date.

**Changes:**
- Remove `PERF_BASE_START` constant.
- `resetPerformanceFilters()` computes `from = today − 3 months` (subtract 3 calendar months from `ap127TodayBKK()`).
- `to` defaults to today (`ap127TodayBKK()`). The `<input type="date" id="pf-to">` gets `max` attribute set to today on each render, preventing future-date input.
- `renderPerformance()` clamps `to` to today: `const to = toRaw && toRaw <= today ? toRaw : today;`.

**Two new toggle chips in the filter bar:**
| Toggle | ID | Default | Behaviour |
|---|---|---|---|
| Include Weekends | `pf-inc-we` | OFF | Adds all Sat/Sun dates in `[from, to]` to `allDates` even with 0 flights |
| Include Holidays | `pf-inc-hol` | OFF | Adds all `HOL` dates in `[from, to]` to `allDates` even with 0 flights |

State stored as local booleans read inside `renderPerformance()` from `document.getElementById('pf-inc-we').checked` etc.

`allDates` construction:
```js
const opsSet = new Set(bizDates);        // always: weekdays excl. holidays
rec.forEach(r => opsSet.add(r.date));    // always: days with actual flights
if (incWeekends) weInRange.forEach(d => opsSet.add(d));
if (incHolidays) holInRange.forEach(d => opsSet.add(d));
const allDates = [...opsSet].sort();
```

---

## 3. School Perf — Recent N Days (Horizontal Redesign)

**Current:** Vertical list of `pr-row` items (date label + horizontal bar + count/hours).

**Change:** Replace with a **horizontal wrapping grid of day cards**. Layout: `display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px`.

Each card (only days with ≥1 flight):
```
┌─────────────┐
│  03 Jun     │  ← date, short
│  ███░░░░░░  │  ← mini stacked-by-batch bar (height 6px)
│  14 flt     │  ← count
│  9.2 h      │  ← hours
└─────────────┘
```
Styling: dark surface (`.cb`-style background), `border-radius: 6px`, `padding: 8px 6px`, `font-family: JetBrains Mono`. Color coding uses the batch palette (`BPAL`) stacked proportionally in the mini bar.

---

## 4. School Perf — AP127 Dedicated Stats Section

**Change:** Add a **3rd summary `.ss` strip** below the existing two, filtered to `r.batch === 'AP127'`:

| Stat | ID | Value |
|---|---|---|
| AP127 Flights | `pf-127-flights` | Count of AP127 records in `rec` |
| AP127 Hours | `pf-127-hours` | Sum of AP127 `r.mins / 60` |
| AP127 Avg / Day | `pf-127-avg` | AP127 flights ÷ operating days with ≥1 AP127 flight |
| AP127 Peak Day | `pf-127-peak` | Date with most AP127 flights |
| AP127 Ops Days | `pf-127-days` | Days with ≥1 AP127 flight |

Header label above the strip: `"AP127 Only"` in AP127 batch colour (`var(--c127)`).

---

## 5. Cross-Check — Block Time

**File:** `assets/reconcile.js` line 126.

**Current:** Duration compared as airborne time, with block-time fallback.
```js
const ccMin = hmToMin(m.airborne) != null ? hmToMin(m.airborne) : hmToMin(m.duration);
```

**Change:** Use block time (`duration`) first; fall back to airborne only if duration is absent.
```js
const ccMin = hmToMin(m.duration) != null ? hmToMin(m.duration) : hmToMin(m.airborne);
```

No other changes to the reconcile engine.

---

## 6. All Batches — Remove

**File:** `js/shell.js`

Remove from `GROUPS`:
```js
{ id: 'program', label: 'All Batches', icon: '◴' },
```

Remove from `registry()`:
```js
program: window.ProgramOverviewView,
```

The "Training Program" group becomes: **Progress Detail**, **School Perf.**, **Simulation**.  
`window.ProgramOverviewView` code in `view-program.js` is **not deleted** (preserved for possible future use).

---

## 7. Simulation — Last SP Finish (secondary stat)

**File:** `js/view-program.js`, `fcard()` function.

**Current:** Secondary stat row shows `first = fins[0]` (earliest student finish) labelled "First finishes".

**Change:** Replace with last SP finish date (`last = fins.at(-1)`, same value as the main headline):
```js
// Before
`<div class="sim-fcard-stat-v">${first?fm(first):"—"}</div>
 <div class="sim-fcard-stat-l">First finishes</div>`

// After
`<div class="sim-fcard-stat-v">${last?fm(last):"—"}</div>
 <div class="sim-fcard-stat-l">Last SP finish</div>`
```

---

## 8. Simulation — Resting Regulation Toggle

**File:** `js/view-program.js`

**CFG addition:** `CFG.restReg = false` (default OFF).

**`elig()` change:** 
```js
// Before
const gap = lmM[b][i] >= 120 ? 2 : 1;
// After
const gap = (CFG.restReg && lmM[b][i] >= 120) ? 2 : 1;
```

**UI:** Add to Scheduler Parameters section:
```
Resting Regulation
After a flight ≥ 2 hrs, student rests 1 extra workday before next flight
[toggle] OFF → ON
```
Toggle handler: `CFG.restReg = checked;` (no re-run needed until user clicks ▶ Run Simulation).

---

## 9. Simulation — Priority Regulation

**File:** `js/view-program.js`

**CFG addition:** `CFG.priority = null` (default = standard order).

**New helper:**
```js
function priorityOrder(p) {
  if (p === 'ap126')        return ['AP126','AP124','AP127'];
  if (p === 'ap126_ap127')  return ['AP126','AP127','AP124'];
  if (p === 'ap127')        return ['AP127','AP124','AP126'];
  return ['AP124','AP126','AP127'];  // default
}
```

**Scheduler change:** Replace hardcoded `["AP124","AP126","AP127"].forEach(...)` with `priorityOrder(CFG.priority).forEach(...)`.

**UI:** New "Priority Regulation" section in controls with 3 radio-style toggles (mutually exclusive — selecting one deselects others). Selecting a second time deselects (toggle off = back to default).

| Label | `CFG.priority` value |
|---|---|
| AP126 first | `'ap126'` |
| AP126 + AP127 first | `'ap126_ap127'` |
| AP127 only first | `'ap127'` |

Selecting any clears the others. All unselected → `CFG.priority = null`.

Also update the **"How the Simulation Works"** info panel's Priority order row to reflect the active setting dynamically.

---

## 10. Slot Finder — Remove

**File:** `js/shell.js`

Remove from `GROUPS` (Planning group):
```js
{ id: 'slotfinder', label: 'Slot Finder', icon: '⌕' },
```

Remove from `registry()`:
```js
slotfinder: window.SlotFinderBoard,
```

Planning group keeps only: **Auto Slot Finder**.

---

## 11. Roster — Normalize "(Unplanned)"

**File:** `js/view-roster.js`

When `groupBy === 'student'`, normalise the key:
```js
const key = groupBy === 'instructor'
  ? (f.instructor || '—')
  : groupBy === 'batch'
    ? (f.batch || '—')
    : ((f.student || '—').replace(/\s*\(Unplanned\)\s*/i, '').trim() || '—');
```

The displayed label in the row uses the same cleaned key, so "(Unplanned)" never appears as a separate row or in labels. Flights for both name variants aggregate into the single normalised row.

---

## 12. Gantt — Solo / Monitor

**File:** `js/view-gantt.js`

**Detection:**
```js
const isSoloFlt = f => /\bsolo\b/i.test(f.lesson || '');
```

**New CSS var** (added to `css/theme.css` for all three themes):
```css
--col-solo: oklch(0.78 0.15 65);   /* warm amber */
```

**Bar rendering changes** (inside the flight bar map):
```js
const isSolo  = isSoloFlt(f);
const color   = isFiSP  ? 'var(--col-stby)'
              : isSolo   ? 'var(--col-solo)'
              : isMtg    ? 'var(--ink-3)'
              : STATUS_COLOR(f);
```

Bar label row: when `isSolo && !isFiSP`, show **"MONITOR"** chip (top-right, same size as existing "STBY" chip) in `--col-solo` colour. Main label line shows lesson code (not student name — the student is alone in the aircraft).

```js
// top-right chip
{isSolo && !isFiSP && <span style={{color:'var(--col-solo)',fontSize:7,fontWeight:600}}>MONITOR</span>}
// main label
{isSolo && !isFiSP ? (f.lesson || '—') : /* existing logic */ }
```

**Legend:** Add entry `['MONITOR/SOLO', 'var(--col-solo)']` to the bottom legend strip.

---

## Version Token

Bump `?v=` token in `index.html` from `p19` → **`p20`** on all `<link>` and `<script>` tags.

---

## Files Changed Summary

| File | Changes |
|---|---|
| `js/view-program.js` | School Perf (§1–4), Simulation (§7–9) |
| `js/shell.js` | Remove All Batches (§6), Remove Slot Finder (§10) |
| `js/view-roster.js` | Normalise Unplanned (§11) |
| `js/view-gantt.js` | Solo/Monitor (§12) |
| `assets/reconcile.js` | Block time fix (§5) |
| `css/program.css` | Resize styles, day-card grid, AP127 strip |
| `css/theme.css` | `--col-solo` var |
| `index.html` | Bump `?v=` token |
