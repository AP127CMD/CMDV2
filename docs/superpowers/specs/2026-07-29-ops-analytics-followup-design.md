# Ops Analytics follow-up — design spec

**Date:** 2026-07-29
**Status:** Approved by user, ready for implementation planning

## Summary

Six follow-up changes to the Ops Analytics tab (`js/view-summary.js`, shipped 2026-07-28/29) based on
user feedback after using the live rebuild: two bug fixes (chart data-labels only rendering on hover;
confirming the "blank later dates" in the hours chart is correct behavior, not a bug), and four feature
additions (Sim flights included by default with a lighter-shade visual split, per-bar stack totals on
the charts, batch-grouped student roster, and a new Batch Summary section comparing progress against
curriculum plan).

## Ground-truth data facts (verified against the live data files — needed by implementation)

- **`css/theme.css`** already has canonical batch colors; no new colors needed, only lighter *tints* of
  the existing ones for the Sim split (`color-mix(in oklch, var(--batch-apNNN) 55%, var(--bg))` or
  similar — exact mix ratio is an implementation detail, not user-specified).
- **Chart.js animation vs. datalabels layout race**: `StackedBatchChart` (in `js/view-summary.js`)
  currently has no `animation` override, so Chart.js's default ~1000ms entrance animation runs. The
  `datalabels` plugin's per-segment `display` callback checks the *rendered* bar element's `.height`,
  which isn't final until the entrance animation completes and a layout pass has settled — hovering
  forces a tooltip-driven redraw that happens to re-evaluate `display` after layout is stable, which is
  why labels "appear on hover." Setting `animation: false` removes the race entirely (labels are correct
  from first paint) and is a defensible product choice for a data dashboard (no downside to instant
  chart rendering here).
- **Daily/weekly/monthly HOURS charts showing 0 for recent dates**: confirmed NOT a bug. `hoursOf(f)`
  correctly returns 0 for any non-`'Completed'` flight; the default period presets (`14d`/`30d`/`90d`)
  never extend past today, so "blank later dates" are simply the most-recent days where flights are
  still `Pending` (not yet flown, or the feed hasn't been marked Completed yet — a known upstream lag
  documented elsewhere in this project's `CLAUDE.md`). The flight-COUNT chart already shows these dates
  have activity; the KPI strip's "booked hours" sub-label already surfaces the scheduled total. No code
  change for this item — confirmed working as designed, per user's explicit choice to leave it as-is.
- **`window.NGT_CACHE` shape** (verified via `ngt-data.js`, current live snapshot):
  - Keys: `ap124` (9 students), `ap126` (28), `ap127` (28), `ap129` (13), `cur124`, `cur126`, `cur127`
    (curriculum arrays, 96-97 entries each, `{lesson, planned_mins, planned_date}`, each totaling
    10,800 `planned_mins` = 180.0h across the full sequence). **`ap128`/`cur128` do not exist at all** —
    AP-128 currently has zero data anywhere in the feed.
  - Each student record in `ap124`/`ap126`/`ap127`/`ap129` (NOT `FLIGHTS` — this is the separate
    progress-reconciliation feed) has: `batch` (no dash, e.g. `"AP127"` vs. `FLIGHTS`' `"AP-127"` — a
    real naming mismatch to bridge in code), `done` (lesson count completed), `total` (total lesson
    count in that student's curriculum), `remaining` (`total - done`), `pct`, `flown` (array of
    completed lessons, each `{lesson, actual_mins, date}`), `planned` (array of the student's own
    remaining lessons, each `{lesson, mins, date}` — **already the correct per-student remaining-hours
    breakdown, sum `mins` across this array for remaining hours, no need to re-derive from the shared
    curriculum**), `planned_total` (a lesson *count*, confusingly named — equals `remaining`, not
    hours), `finish` (the student's own individually-computed projected completion date, accounting for
    their actual current pace — e.g. one AP-127 student's `finish` is `2027-01-29`, two months past the
    curriculum's own official last `planned_date` of `2026-11-27`, because delays push individual
    completion later than the idealized shared schedule).
  - **Batch Summary must source hours/lessons progress from `NGT_CACHE` (`flown`/`planned` per student),
    not from `FLIGHTS`/`hoursOf`** — this is a distinct, already-reconciled progress data source (the
    same one `js/view-cohort.js`'s existing Progress tab uses), and is NOT affected by this tab's
    Effective/Block metric toggle (that toggle is specifically about how `FLIGHTS`-derived sections
    count hours; Batch Summary's hours come from the progress feed's own pre-computed minutes).

## Ground rules confirmed with the user

- **Sim flights**: `SIMULATOR` filter defaults to **ON** (was off). Charts (all 4) and the Composition
  Strip split each batch's segment into a solid (real) + lighter-tint (sim) stacked pair. KPI strip gets
  a new **SIM HOURS** tile; existing HOURS/COMPLETION/CANCELLATION/AVG H/FLIGHT tiles report **real
  (non-sim) flights only**. Breakdown table and both rosters stay combined (unaffected).
- **Daily hours "blank dates"**: confirmed working as designed — no change.
- **Batch Summary**: all-time, governed by the header's BATCH filter (same convention as the existing
  cumulative tables — narrows to whichever batches `batchAllowed()` currently permits). AP-128 shows a
  "NO PLAN DATA" placeholder row rather than being hidden. Target/end date = the shared curriculum's own
  official last `planned_date` for AP-124/126/127 (a single consistent date since they share one
  curriculum); the **latest** of the batch's students' individual `finish` dates for AP-129 (no shared
  curriculum exists to draw an official date from).

## Changes

### 1. Chart data-label hover bug (fix)

In `StackedBatchChart`'s Chart.js `options`, set `animation: false`. No other change — the existing
`display`/`formatter` datalabels logic is otherwise correct.

### 2. Stacked bar totals (new)

Each of the 4 `StackedBatchChart` instances gains a total-per-bar label above the full stack. Standard
Chart.js technique: an additional dataset per chart carrying all-zero bar data (so it's visually
invisible and doesn't affect the stack height) but with its own `datalabels` config
(`anchor:'end', align:'end'`) whose `formatter` looks up that bar-index's true total (computed in JS by
summing every real dataset's value at that index, including both Sim and Real variants where the split
is active) and renders it as text sitting just above the visible stack.

### 3. Sim flights included by default, split in charts/composition (new)

- `simOn` state's default changes from `false` to `true`.
- `StackedBatchChart` (and the 4 chart-data-prep `useMemo`s that feed it) restructure from "one series
  per batch" to "one Real series + one Sim series per batch," rendered as two adjacent stacked datasets
  per batch (Real = full batch color, Sim = a lighter tint of the same batch color) — both still summing
  into the same one-bar-per-day/week/month visual, just visually subdivided within each batch's portion.
  Applies to all 4 charts (daily count, daily hours, weekly hours, monthly hours).
- `CompositionStrip` gets the same Real/Sim split within each batch's segment of the composition bar and
  legend (each batch's legend line shows real hours and sim hours as two figures, or a real segment +
  adjacent lighter sim segment in the bar itself — implementation's call on exact legend layout, but the
  BAR segment split is required).
- `KpiStrip` gains a **SIM HOURS** tile (parallel to the existing SIM count tile) computed the same way
  `HOURS` is computed but restricted to `f.isSim` flights; the existing HOURS/COMPLETION/CANCELLATION/
  AVG H/FLIGHT tiles are recomputed to explicitly exclude Sim flights (i.e., those tiles describe real
  flight training progress only, with Sim tracked as its own separate pair of numbers) — this is a
  behavior change from the shipped version, where Sim flights (when shown) were blended into every KPI.
- `BreakdownTable` and both rosters (`RosterHeatmap`/`CumulativeTable` for students and instructors) are
  **not** changed by this item — they continue to show combined (Sim+Real) totals, matching the user's
  explicit scoping choice.

### 4. Student roster grouped by batch (new)

The student day-by-day heatmap (`RosterHeatmap`, fed by `rosterStudents`/`studentDayMap`/
`studentColorOf` in `SummaryBoard`) currently renders a flat, alphabetically-sorted list of students.
It gains batch-grouped header rows — same visual convention (color swatch + batch name + count) already
used in `CumulativeTable`'s batch-grouped student table directly below it. `RosterHeatmap` itself stays
a generic, reusable component (still used un-grouped for the instructor roster) — grouping is an
opt-in prop, not baked into the component's core rendering logic.

### 5. Batch Summary (new section)

A new table-style section, one row per batch in `AP_BATCH_ORDER` (AP-124/126/127/128/129) that passes
`batchAllowed()`, placed in the render order immediately after the Composition Strip and before the
4-chart grid. Per batch:

- **Students**: count of students in that batch's `NGT_CACHE.apNNN` roster array (the authoritative
  enrolled-student list, not derived from `FLIGHTS`). AP-128: `—` (no roster exists).
- **Lessons done / total**: `Σ done` / `Σ total` across the batch's roster.
- **Hours done / total**: `Σ (flown[].actual_mins)` / `Σ (flown[].actual_mins) + Σ (planned[].mins)`,
  in hours, across the batch's roster.
- **Time remaining**: days from today to the batch's target date (see Ground rules above).
- **Lessons remaining / Hours remaining**: `total − done` for each.
- **Required pace**: hours/day and lessons/day needed, from today, to reach 100% by the target date
  (`remaining / daysRemaining`); shows **OVERDUE** instead of a rate if the target date has already
  passed.
- **AP-128**: every numeric column shows a "NO PLAN DATA" placeholder instead of `0`/`—` mixed
  ambiguously — the row is visibly present but explicitly marked as lacking data, not silently reading
  as "0% done."

No other section of the tab (KPI strip, charts, composition, breakdown, rosters) changes as a result of
this item — Batch Summary is a self-contained addition sourced entirely from `NGT_CACHE`, independent of
`filteredFlights`/`hoursOf`/the Effective-Block toggle.

## Out of scope

- No "current pace" / "at risk" / ETC-vs-plan-date flag (the existing `js/view-cohort.js` has similar
  logic already, but the user's explicit ask was done/plan/remaining/required-rate only — not
  current-pace-vs-required-pace comparison. Not adding it keeps this change matched to what was asked).
- No change to `js/shell.js`, `index.html` (beyond the final cache-bust bump), or any other view file.
- No change to the Effective/Block metric toggle's existing behavior for the sections it already governs.
- Breakdown table and rosters do not gain a Sim/Real split (explicitly scoped out per the user's answer).

## Testing / verification plan

Same as the original feature: no automated test framework exists for view files in this project (a
no-build CDN app) — verification is manual, in the browser, via the established
fetch(`cache:'no-store'`)+Babel-transpile+eval technique documented in this project's `CLAUDE.md` and
throughout the original feature's implementation plan. Verify: data labels visible without hovering on
first load of each of the 4 charts; a total figure appears above every stacked bar and is arithmetically
correct against the visible segments; SIMULATOR defaults to on and sim segments render in a visibly
lighter tint than their batch's real segments in all 4 charts + composition strip; KPI's SIM HOURS tile
is present and existing HOURS-derived tiles no longer include sim flights (cross-check by toggling
SIMULATOR off and confirming HOURS/COMPLETION/etc. don't change, only SIM/SIM HOURS drop to 0); student
roster heatmap shows batch-grouped headers matching the cumulative table below it; Batch Summary renders
5 rows with plausible numbers, AP-128 shows the placeholder state, and switching the header's BATCH
filter narrows/widens which batches appear in Batch Summary the same way it already does for the
cumulative tables.
