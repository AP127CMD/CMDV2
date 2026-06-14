# AP127 Detail Tab — Improvements Design

**Date:** 2026-06-14  
**File:** `js/view-cohort.js`  
**Version token to bump:** currently `p58` → will become `p59`

---

## 1. SP Detail Drawer — Full Detail (Approach B)

**Current:** two columns (Completed / Planned), each capped at 14 items.

**New layout:**
- **Mini KPI header row** at top of drawer body: Lessons Done / Total, Hours, Idle Days, Day Δ, Hrs Δ — all derived from the same student object already passed to `openAP127Drawer`.
- **Completed flights list** — all records (no cap), independently scrollable (`max-height: 45vh; overflow-y: auto`). Shows date, lesson code, duration.
- **Planned flights list** — all records (no cap), independently scrollable. Shows date (or TBC), lesson code, planned duration.

**Implementation:** In `openAP127Drawer(idx)`, remove the `.slice(-14)` and `.slice(0,14)` caps. Add a KPI strip above `d127-dg` by building inline HTML from the student's computed values (use existing helpers: `ap127Hours`, `ap127IdleDays`, `ap127DayDelta`, `ap127PlannedHoursAsOf`).

---

## 2. Idle Days — Use Current Date

**Current:** `ap127IdleDays(s, maxDate)` where `maxDate` is `max(all flight dates)`. If the most advanced student flew yesterday, every idle count is off by 1+.

**Fix:** Replace every call to `ap127IdleDays(s, maxDate)` with `ap127IdleDays(s, today)` where `today = ap127TodayBKK()`. The `today` variable is already computed in `renderAP127Detail` and `renderAP127Pace`.

**Affected call sites:**
- `renderAP127Detail` — `ap127IdleDays(s, maxDate)` in totals row and per-row; `ap127PaceSort(all, maxDate)` and `ap127BehindSort` used for bands/recent — all change `maxDate` → `today`
- `ap127SortRows(all, maxDate, planMap, today)` — the first `maxDate` arg (= `asOf`) → `today`
- `renderAP127Pace` — `ap127PaceSort(all, maxDate)` → `ap127PaceSort(all, today)`
- `buildAP127Timeline` — computes `idleDays = todayDay - lastFlightDay` directly (already uses today, no change needed)

---

## 3. Race Chart — Hours/Lessons Toggle

**Current:** cumulative lesson count only.

**New:** Add module-level `let AP127_RACE_MODE = 'lessons'` (parallel to existing `AP127_RACE_SOLO`). Add a chip bar directly above the toggles row with two buttons: **Lessons** (default, selected) and **Hours**.

**Hours mode data:** for each student, accumulate `ap127FlightMins(f) / 60` (same helper used elsewhere) instead of counting `+1` per flight. The planned target line switches to cumulative curriculum hours (`lessonsMap` sums via `c.planned_mins / 60`).

**Toggle wiring:** buttons call a new `setAP127RaceMode(m)` function that sets `AP127_RACE_MODE` and re-calls `buildAP127RaceChart`. Y-axis label and tooltip format update based on mode.

---

## 4. Race Chart — Cohort Average Line

**New dataset** added to `buildAP127RaceChart`, inserted first in `datasets` array so it renders under individual lines:

```
label: 'Batch Avg'
borderColor: '#e88aff'   // AP127 magenta (= --c127), visible across all 3 themes
borderWidth: 3
borderDash: []           // solid
pointRadius: 0
order: 999               // render on top of all individual student lines
```

**Computation:** at each date label, mean of all students' cumulative value (lessons or hours depending on `AP127_RACE_MODE`). Use the same `labels` array already built in `buildAP127RaceChart`.

**Position in datasets array:** append last so it is drawn on top of the individual per-student lines.

**Legend:** keep `legend: {display:false}` to avoid 29-item clutter. Add a text note below the toggles div: `◆ thick magenta = batch average`.

---

## 5. Combined Progress Chart

### 5a. Default filter: "To Today"

Change module-level initialisation: `let CPV_FILTER = 'today'` (was `'proj'`).  
In `MARKUP`, mark the `data-f="today"` button with class `cpv-btn sel` and remove `sel` from `data-f="proj"`.

### 5b. Auto-reset zoom on mode/filter change

At the top of both `setCPVFilter` and `setCPVMode`:
```js
CHARTS.ap127combined?.resetZoom?.();
```
This fires before `buildAP127CombinedChart()` redraws, so the rebuilt chart starts unzoomed. Both axes fit naturally because `buildAP127CombinedChart` always rebuilds the chart from scratch (calls `mkC` which destroys the old instance).

### 5c. Remove "To Plan End" option

- Remove the button `<button class="cpv-btn" data-f="plan" ...>To Plan End</button>` from `MARKUP`.
- Remove `'plan'` branch from the `endDate` ternary in `buildAP127CombinedChart`:
  - Current: `CPV_FILTER==='today'?today:CPV_FILTER==='plan'?planEnd:[planEnd,projEndDate].sort().at(-1)`
  - New: `CPV_FILTER==='today'?today:[planEnd,projEndDate].sort().at(-1)`
- No dead code remains; the `planEnd` variable is still used in KPIs and the axis bound.

---

## Out of Scope

- No changes to `css/progress.css` layout (drawer already styled, KPI strip reuses existing `.d127-kl`/`.d127-kv` classes).
- No changes to data pipeline or other views.
- `?v=` token bumped to `p59` in `index.html`.
