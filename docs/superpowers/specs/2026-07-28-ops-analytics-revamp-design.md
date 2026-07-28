# Ops Analytics tab revamp — design spec

**Date:** 2026-07-28
**Status:** Approved by user, ready for implementation planning

## Summary

Full replacement of the Ops Analytics tab (`js/view-summary.js`, `window.SummaryBoard`, wired
in `js/shell.js` view id `analytics`). The old implementation (date-range dropdowns, AP-batch
donut, batch/instructor/student horizontal-bar breakdown tables) is deleted entirely and replaced
with a new batch-centric analytics view: period presets, a comprehensive filter panel, an
expanded KPI strip, a batch composition strip, four stacked bar-over-time charts, the retained
batch breakdown table, and new student/instructor roster sections (day-by-day heatmap + all-time
cumulative summary).

Same file (`js/view-summary.js`) and same global (`window.SummaryBoard`) are kept so
`js/shell.js`'s view-routing table needs no change — only the script's cache-bust token changes.

## Out of scope

- No new curriculum data is added for AP-128/AP-129 (they don't have `cur128`/`cur129` entries
  in `window.NGT_CACHE` today) — Effective-hours mode falls back to block time for those batches,
  same fallback `uEffectiveMins()` already uses in Utilization.
- No changes to `js/shell.js` routing, sidebar label, or icon.
- No changes to other tabs (Utilization, Cohort, etc.) — this is additive/isolated to the
  Analytics tab.

## Layout

### 1. Header bar

- Period selector chips: `14D` `30D` `90D` `CUSTOM` — default `30D` (today − 29 → today).
  `CUSTOM` reveals a native `<input type="date">` From/To pair (same pattern as
  `view-aircraft.js`'s `customFrom`/`customTo`).
- `<FocusControls/>` (existing shared component, `js/shared.js`) reused verbatim as the "AP127
  only" quick button — gives the ◆ AP-127 highlight toggle + ONLY (hide-others) toggle already
  used elsewhere in the app. No new component.
- Metric toggle: `EFFECTIVE` (default) / `BLOCK`. Effective = curriculum planned minutes per
  lesson (`uBuildCurMap()` + `uEffectiveMins()` logic ported from `view-aircraft.js`), falling
  back to `durMin` (block) when the lesson has no curriculum entry.
- `RefreshButton`, `LastUpdate` (existing shared components) kept at the right edge, matching
  every other view's header.

### 2. Comprehensive filter panel

Collapsible bar directly under the header. Dimensions:

- **Status** — multi-select chips: Pending / Completed / Canceled / Standby. **Default:
  Completed only.**
- **Batch** — multi-select chips, built from all distinct `batch` values in `FLIGHTS`. **Default:
  AP-* batches only** (`/^AP-/i.test(batch)` — AP-124/126/127/128/129), matching the existing
  `apBatchSlices` filter logic from the old `view-summary.js`.
- **Instructor** — multi-select, searchable (reuse existing chip/search-input pattern from
  Utilization or Cohort filter panels).
- **Student** — multi-select, searchable.
- **Aircraft type** — multi-select chips (`U_TYPE_ORDER` list from `view-aircraft.js`).
- **Sim** — show/hide toggle (respects `app.tweaks.showSim` convention used elsewhere, default
  hidden).
- **RESET TO DEFAULT** chip — clears all filters back to the defaults above.

All filter state is local `useState` in `SummaryBoard`, not persisted across navigation (matches
existing tab behavior — no other tab persists filters to localStorage except Watchdog's key).

### 3. KPI strip

Grid of stat tiles (reuse `SumTile` pattern from the old file), computed from the currently
filtered + period-scoped flight set:

Existing: Total, Pending, Completed, Canceled, Standby, Sim, Hours (Effective or Block per the
metric toggle).

New:
- **Completion rate %** = completed / (completed + canceled), guard divide-by-zero → `—`
- **Cancellation rate %** = canceled / (completed + canceled)
- **Avg hours/flight** = total hours / completed count
- **Active batches** = distinct batches with ≥1 flight in the filtered set
- **Active students** = distinct non-empty `student` values in the filtered set
- **AP-127 share %** = AP-127 hours / total hours in the filtered set (only meaningful when the
  batch filter includes more than AP-127; still computed and shown, reads `—` if total is 0)

### 4. Batch composition strip

One horizontal stacked bar (single row, not a donut) showing each batch's % share of the
filtered set by the current metric (Effective/Block hours). Legend below/beside: color swatch,
batch name, flight count, hours, and %. Colors: canonical `--batch-ap124` .. `--batch-ap129` CSS
vars for AP batches; a fixed grey-scale fallback palette (rotating through 3–4 neutral tones) for
any non-AP batch that's visible when the batch filter is widened past AP-only (HP-55, HP-57,
PPL-38/40/41/42, MEP-35, TCAR variants, RECURRENT, DEMO, FAM FI, Meeting, Test Flight, blank).
Sorted descending by share.

### 5. Four stacked bar-over-time charts

Chart.js (already loaded via CDN in `index.html`), one card each, laid out in a 2×2 grid on
desktop / stacked single column on mobile:

1. **Daily flight count by batch** — x = day (within period), stacked bars per batch, y = flight
   count.
2. **Daily flight hours by batch** — x = day, stacked bars per batch, y = hours (Effective/Block
   per toggle).
3. **Weekly hours by batch** — x = Monday-start week bucket (matching the `isMon` week-boundary
   convention already used by the Utilization Roster's day columns), stacked bars per batch,
   y = hours.
4. **Monthly hours by batch** — x = calendar month, stacked bars per batch, y = hours.

Each chart:
- Dataset colors = canonical batch colors, resolved from CSS vars via
  `getComputedStyle(document.documentElement)` (same pattern as `view-aircraft.js` lines
  ~325/950) since `<canvas>` fill/stroke can't consume `var(--x)` directly.
- `chartjs-plugin-datalabels` enabled per dataset — shows the segment's value (count or hours,
  1 decimal for hours) centered in each stacked segment, auto-hidden when the segment is too
  small to fit (`display: (ctx) => segment pixel height > ~10px`, standard datalabels pattern).
- Legend interactive: clicking a batch name in a chart's own legend toggles that batch's bars in
  that chart only (Chart.js default dataset-visibility-toggle behavior — no custom onClick
  needed beyond enabling the legend). Does **not** affect the shared filter state or other
  charts/tables.
- X-axis scoped to the selected period (14/30/90/custom); weekly/monthly charts show however
  many buckets fall inside that range (e.g. 14D period → ~2 weekly bars, <1 monthly bar).

### 6. Batch breakdown table

Keep the existing `BreakdownTable` component/style from the old file (horizontal bar per batch:
Pending/Completed/Canceled/Standby colored segments + completed-hours readout), now fed by the
new filtered + period-scoped flight set and the Effective/Block metric toggle (port the
`barMode` prop to also support the effective-hours calculation, not just `completedHours` from
raw `durMin`).

### 7. Student roster

Two parts, both scoped by the **batch filter** (which students appear) but differing on
period/status scope:

**a. Day-by-day heatmap** (period-scoped, respects status/sim filters)
- Rows = student, grouped/tagged by batch (row label shows batch-colored dot/tag next to name,
  same convention as `batchColor()` in `view-daily.js`).
- Columns = each day in the selected period (14/30/90/custom) — same sticky-header,
  horizontal-scroll table structure as the existing Utilization Roster
  (`js/view-aircraft.js` lines ~571-700+).
- Cell = hours flown that day (Effective/Block per toggle). **Cell color = that student's batch
  color, opacity/intensity scaled by hours** (0 hours → transparent/empty, more hours → more
  saturated), replacing the neutral single-hue intensity scale the Utilization Roster uses.
- Click cell → reuse the existing drawer/detail pattern (`handleCellClick` equivalent) to show
  that day's flights for that student.

**b. Cumulative summary table** (all-time, ignores period + status + sim filters — always
Completed, always full history)
- Grouped by batch (batch header row, matching `BreakdownTable`'s visual weight), then one row
  per student:
  - **Latest flight** — most recent flight by date across the student's entire history
    (any status, to reflect true recency of activity — not just latest Completed), showing
    date + lesson code.
  - **Total completed lessons** — count of all-time Completed flights.
  - **Total completed hours** — sum of all-time Completed flight hours (Effective/Block per the
    page's metric toggle, using the full `FLIGHTS` array unfiltered by period).
  - Batch-level rollup row: sum of the above across all students in that batch.
- Which students appear is governed by the **batch filter only** (e.g. if the batch filter is
  narrowed to AP-127, only AP-127 students list here) — instructor/student/type/sim/status
  filters and the period selector do not affect this table.

### 8. Instructor roster

Same two-part treatment as the student roster:

- **Day-by-day heatmap**: rows = instructor, columns = days in period, cell = hours that day,
  cell color = the instructor's **dominant batch that day** (the batch with the most hours among
  that instructor's flights on that day), opacity scaled by hours. Click cell → detail drawer.
- **Cumulative summary table**: latest flight + all-time total completed hours/lessons per
  instructor (not batch-grouped, since instructors span batches — flat list, sortable by hours).
  Governed by the **instructor filter only** (analogous to student roster's batch-filter
  governance).

## Data / helper functions (new, in `view-summary.js` unless noted)

- `sPresetRange(preset, today)` / `sDayRange(from, to)` — port `uPresetRange`/`uDayRange` from
  `view-aircraft.js` (identical logic, local copies to keep the file self-contained like the
  rest of the views do).
- `sBuildCurMap()` / `sEffectiveMins(f, curMap)` — port `uBuildCurMap`/`uEffectiveMins` verbatim.
- `sBatchColor(batch)` — canonical AP batch → `var(--batch-apNNN)` lookup (mirrors
  `batchColor()` in `view-daily.js`), extended with a small fixed grey-scale rotation for non-AP
  batches so every batch that can appear gets a stable, distinct color.
- `sWeekKey(dateStr)` / `sMonthKey(dateStr)` — ISO week bucket / `YYYY-MM` bucket for the
  weekly/monthly charts.
- `sResolveCssColor(varName)` — `getComputedStyle` lookup, memoized per render, for feeding
  canonical colors into Chart.js datasets.

## Technical / deploy notes

- File: gut and rewrite `js/view-summary.js` in place (delete `DonutChart`, old
  `BreakdownTable` usage patterns not needed, old `SummaryBoard`); keep the `BreakdownTable`
  component (reused per §6) and `window.SummaryBoard = SummaryBoard` export.
- No `index.html` / `shell.js` wiring changes beyond the cache-bust token bump.
- Bump `?v=p117` on **all** `<script>` tags in `index.html` per the project's update rule.
- Update `REVAMP.md` change log, this project's `CLAUDE.md` Verify section, and
  `/Users/nugui/AP127_Docs/README.md` §2.4 + §10 log entry, then commit+push `AP127_Docs`.
- No backend/data-pipeline changes — purely a frontend view rewrite consuming the existing
  `window.FLIGHT_DATA` / `FLIGHTS` / `window.NGT_CACHE` globals already loaded by `index.html`.

## Testing / verification plan

- Manual verification in the live app (`ap127-ngt2.pages.dev` preview or local via the app's own
  dev workflow) — this is a no-build CDN-only React app, no automated test suite for views.
- Verify: default filters land on Completed + AP-* batches + 30D; KPI tiles reconcile against a
  manual count from the raw feed for at least one narrow slice (e.g. AP-127 only, 7D); all 4
  charts render with visible datalabels and legend-click toggling; student/instructor cumulative
  tables show plausible latest-flight dates and total hours matching what Cohort/Utilization show
  for the same students; roster heatmap cell colors visibly differ per batch; mobile layout
  (single column) doesn't overflow horizontally outside the intentionally-scrollable roster
  tables.
