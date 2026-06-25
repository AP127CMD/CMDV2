# AP127 CMDV2 — History Charts Design Spec

**Date:** 2026-06-25  
**Feature:** Lead/Lag History Charts (bottom of Progress / Cohort view)  
**File affected:** `js/view-cohort.js`  
**Next version token:** `p99`

---

## 1. Goal

Add two Chart.js panels at the bottom of the Progress view showing how the lead/lag of actual progress vs the curriculum plan has changed over time — visible for both the whole batch and for individual students.

The charts answer: *"Are we closing the gap, or is it widening?"*

---

## 2. Charts Overview

### Chart 1 — Batch Lead/Lag History

A single-line time-series chart showing the **batch-wide** delta between actual and planned progress.

| Property | Value |
|---|---|
| Canvas ID | `d127-hist-batch` |
| State var | `HIST_BATCH_MODE = 'hours'` (independent) |
| Default mode | **Hours** |
| Series | One line: `Σ actual − Σ planned` across all 28 students |
| X-axis | All dates where something changed (flight dates ∪ `cur127[].planned_date`), from batch start to today |
| Y-axis | Lead/lag in hours (or lessons). Positive = ahead, negative = behind |
| Zero line | Dashed white reference line at y = 0 ("on plan") |
| Fill | Green (α 15%) above zero, red (α 15%) below zero |
| KPI strip | Three tiles above the chart: **Now** (current delta), **Best** (max delta), **Worst** (min delta) |
| Controls | Hours / Lessons toggle chips (independent from race chart) |

**Delta computation:**
```
planned_as_of(D) = sum of cur127[i].planned_mins/60 (or count 1 lesson)
                   for all i where cur127[i].planned_date <= D
                   × N students (28)

actual_as_of(D)  = sum of flown[j].mins/60 (or count 1 lesson)
                   for all j where flown[j].date <= D, across all 28 students

batch_delta(D) = actual_as_of(D) - planned_as_of(D)
```

---

### Chart 2 — Individual Lead/Lag vs Plan

Shows the same delta per student over time. Shares state with the existing **Actual vs Planned** ("race") chart.

| Property | Value |
|---|---|
| Canvas ID | `d127-hist-solo` |
| Shared state | `AP127_RACE_MODE` (hours/lessons) + `AP127_RACE_SOLO` (student solo-toggle) |
| Series | 28 individual student lines + 1 batch AVG line |
| Y-axis | Per-student lead/lag (positive = ahead, negative = behind) |
| Zero line | Dashed white reference at y = 0 |
| Fill | None (too many lines; fill would be cluttered) |
| AVG line | Magenta `#e88aff`, `borderWidth: 3`, `order: 999` — same style as race chart |
| Student colors | Same hue-per-index scheme as race chart |
| Visibility | Respects `AP127_RACE_SOLO` — same students shown/hidden as race chart |
| Controls | Inherited from race chart (no duplicate buttons here) |

**Per-student delta computation:**
```
planned_as_of(D)         = same as above but for 1 student (no × N)
actual_student_as_of(D)  = sum of student.flown[j] with date <= D

student_delta(D) = actual_student_as_of(D) - planned_as_of(D)
```

---

## 3. Shared State Linkage

When the race chart re-renders (mode or solo toggle changes), Chart 2 must also re-render.

Changes to **two places** in existing code:
1. `setAP127RaceMode(m)` — add `buildAP127HistSolo()` call after existing race chart rebuild
2. The solo-toggle chip click handler inside `buildAP127RaceChart()` — add `buildAP127HistSolo()` call alongside the race chart rebuild

Chart 1 is independent and has its own `setHistBatchMode(m)` function.

---

## 4. Markup Structure

Two new `d127-panel` divs appended after the existing "Overall Progress Bar View" panel in `MARKUP`:

```html
<!-- Chart 1: Batch Lead/Lag History -->
<div class="d127-panel">
  <div class="d127-h" style="flex-wrap:wrap;gap:6px">
    <span class="d127-t">Batch Lead/Lag History</span>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="cpv-btn hist-batch-mode sel" data-m="hours"   onclick="setHistBatchMode('hours')">Hours</button>
      <button class="cpv-btn hist-batch-mode"     data-m="lessons" onclick="setHistBatchMode('lessons')">Lessons</button>
    </div>
  </div>
  <div class="d127-body">
    <div class="cpv-kpis" id="hist-batch-kpis"></div>
    <div style="position:relative;height:220px"><canvas id="d127-hist-batch"></canvas></div>
  </div>
</div>

<!-- Chart 2: Individual Lead/Lag vs Plan -->
<div class="d127-panel">
  <div class="d127-h">
    <span class="d127-t">Individual Lead/Lag vs Plan</span>
    <span class="d127-s">Shares mode &amp; filters with Actual vs Planned above</span>
  </div>
  <div class="d127-body">
    <div class="d127-note">Delta = actual cumulative − planned cumulative. Above zero = ahead of plan. Shares Hours/Lessons mode and student filters with the Actual vs Planned chart.</div>
    <div style="position:relative;height:300px"><canvas id="d127-hist-solo"></canvas></div>
  </div>
</div>
```

---

## 5. New Functions

| Function | Description |
|---|---|
| `buildAP127HistBatch()` | Builds Chart 1. Reads `HIST_BATCH_MODE`. Destroys old chart via `mkC()`. |
| `buildAP127HistSolo()` | Builds Chart 2. Reads `AP127_RACE_MODE` and `AP127_RACE_SOLO`. |
| `setHistBatchMode(m)` | Sets `HIST_BATCH_MODE`, toggles button `.sel`, calls `buildAP127histBatch()`. |

Both functions exposed on `window` alongside the existing exports.

---

## 6. Render Trigger

Both charts are built in the main render flow. Add calls at the end of `renderAP127Detail()` (or in the `mountProgress()` path alongside `buildAP127CombinedChart()` and `buildAP127RaceChart()`).

Exact trigger pattern: same as `buildAP127CombinedChart()` — called once when data loads, and again when mode/filter changes.

---

## 7. X-Axis Date Labels

Follow the same approach as `buildAP127RaceChart()`:
- Collect all flight dates and all `cur127[i].planned_date` values (up to today)
- Union into a sorted array of unique date strings
- Use as chart labels

This gives natural density — days with no flights and no curriculum transitions don't add noise.

---

## 8. Chart Style

Follows existing patterns:
- `mkC(id, cfg)` helper for create/destroy
- `copts()` for base options (JetBrains Mono font, dark grid)
- `type: 'line'`, `responsive: true`, `maintainAspectRatio: false`
- No datalabels plugin on these charts
- Zero reference line: `borderColor: 'rgba(255,255,255,0.25)'`, `borderDash: [4,3]`, `pointRadius: 0`, not in legend

---

## 9. Out of Scope

- No snapshot/archive data — delta is derived purely from the flown records already in memory
- No zoom/reset on these charts (keep it simple; the Combined chart already has zoom)
- No projected future trend line in Chart 1 (that's already covered by Combined Progress chart)

---

## 10. Files Changed

| File | Change |
|---|---|
| `js/view-cohort.js` | Add MARKUP HTML, `HIST_BATCH_MODE` state var, 3 new functions, hook `setAP127RaceMode` and solo-toggle handler |
| `index.html` | Bump `?v=p99` on all `<script>` tags |
| `CLAUDE.md` | Update "Last known" line and next token |
| `REVAMP.md` | Add change log entry |
| `AP127_Docs/README.md` | §2.4 update + §10 log entry |
