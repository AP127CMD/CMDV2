# Combined Home (Home × Day Glance) — Design Spec

**Date:** 2026-06-14
**Status:** Approved (pending written-spec review)
**Branch:** `feat/unified-schedule`

## Goal

Merge the **Day Glance** operational dashboard into the **Home** landing page so the app has a
single command-center landing that shows *both* the operational day snapshot (all batches) and the
AP-127 cohort-progress digest, in one scroll. Remove the separate Day Glance tab.

This resolves the Home/Day-Glance overlap (both showed "today's snapshot") flagged in the original
UX study — they become one view instead of two.

## Decisions (locked)

- **Approach A — blended single-scroll dashboard** (not a sub-toggle, not a rigid two-column split).
- **Day Glance tab is removed** from the sidebar. `#/today` **redirects to `#/overview`** so old
  bookmarks/links still land somewhere sensible.
- **Date picker + TODAY** is added to Home (from Day Glance) — Home can show any day's operational
  snapshot, defaulting to today/next active day.
- **AP-127 Spotlight is kept** as its own section in the combined Home.
- The **Schedule** tab is untouched.

## The combined Home — layout (top → bottom)

1. **Header** — `AP127 COMMAND CENTER` title + subtitle (`Operations × Progress · N students · <focus
   date>`) + flight count. Includes the **date picker (`DateCalendarTrigger`) + TODAY** control.
2. **KPI strip — 8 tiles** (click-through in parens):
   | Tile | Value | Source | Click → |
   |------|-------|--------|---------|
   | On The Line | AP-127 flights on the selected day | `FLIGHTS` (AP-127, date) | Schedule (Day) |
   | Completed | all-batches completed that day | `FLIGHTS` (date) | Schedule (Day) |
   | Pending | all-batches pending that day | `FLIGHTS` (date) | Schedule (Day) |
   | Hours | scheduled flight hours that day | `FLIGHTS` (date) | — |
   | Cohort Prog | avg AP-127 % complete | `students` | AP127 Detail |
   | Pace Spread | lead − lag lessons | `students` | AP127 Detail |
   | Idle ≥7d | AP-127 students idle ≥ 7 days | `students` | — |
   | Conflicts | cross-check conflicts | `reconciliation.totals` | Cross-Check |
   Ops tiles (Completed/Pending/Hours) are **all-batches**; progress tiles are **AP-127**.
3. **Operations · today** — `SCHEDULE PULSE` (hourly flights, inline SVG area) + `STATUS MIX` (inline
   SVG donut: completed/pending/canceled).
4. **Utilization** — `BATCH BREAKDOWN` + `INSTRUCTOR LOAD` + `AIRCRAFT FLEET` (3-up bar lists).
5. **Today's line & alerts** — `ON THE LINE` (AP-127 flights on the selected day, click → Schedule)
   + `ALERTS` (idle students, cancellations; integrity stays as the Cross-Check amber dot).
6. **Cohort progress** — `PACE LEADERS` + `BEHIND SCHEDULE` (click a student → Student Lens).
7. **◆ AP-127 SPOTLIGHT** — Day Glance's dedicated cohort panel (AP-127 KPIs + today's AP-127 student
   list).

All sections honor the selected date for the operational/day content; the progress sections (cohort,
pace, behind, leaders) are period-wide and date-independent.

## Architecture & reuse strategy

The win: Day Glance (`js/view-daily.js`, `window.DailyBoard`) **already builds** every operational
panel (pulse, status donut, batch, instructor, fleet, spotlight) with self-contained inline-SVG
helpers (`DailyDonut`, `DKPI`, `Section`, `StackBar`) — **no Chart.js dependency** — and already reads
the selected date via `useApp().date` + `DateCalendarTrigger`. Home (`js/view-overview.js`,
`window.OverviewView`) already builds the progress panels.

**Plan of record:** refactor `view-daily.js` so its operational-panel cluster is a reusable component
exported on `window` (working name `window.DayGlancePanels`) — same computations, but without the
outer `ArtboardShell`/page header (that chrome moves to Home). Then rebuild `OverviewView` (as a
`text/babel` JSX file, so it can use those JSX panels) to render: Home header + date picker → merged
KPI strip → operations row → utilization row → today's-line + alerts → cohort-progress row →
AP-127 spotlight. The progress panels and their click-throughs (Student Lens, cohort, cross-check)
are preserved from the current `OverviewView`.

`DailyBoard` (the standalone tab component) is **retired** — no longer mounted by any route. The
panel cluster it used is what Home now renders.

### Files touched
- `js/view-daily.js` — extract operational panels into `window.DayGlancePanels`; retire the standalone
  `DailyBoard` shell (or keep it as a thin wrapper around the panels, unused by nav).
- `js/view-overview.js` — becomes the combined Home: composes `DayGlancePanels` + the existing
  progress panels + merged KPI strip + date picker. Likely converted to JSX (`text/babel`).
- `js/shell.js` — remove the `today`/`Day Glance` nav item (already removed earlier? re-confirm it is
  gone); add a redirect so `#/today` resolves to `overview` in the initial-view logic; drop `today`
  from `registry()` (or point it at the combined Home). Keep everything else.
- `index.html` — `view-overview.js` may need to move from plain `<script>` to `type="text/babel"`
  (if converted to JSX); bump the `?v=` asset token.
- `README.md` — note Day Glance folded into Home.

### Data flow
One shared React context (`AppProvider`). Operational/day content reads `useApp().date` (driven by the
new picker) + `FLIGHTS`. Progress content reads `students` / `curriculum` / `reconciliation` from
`useData()`. No new data sources.

## Error / edge handling
- **No AP-127 flights on the selected day** — On The Line + Spotlight show their existing empty states
  ("No AP-127 flights on this day"); ops KPIs/charts still reflect all-batches activity.
- **No flights at all on the selected day** — KPI tiles show 0; pulse/donut render empty; panels show
  their existing empty states. No crash.
- **Date out of data range** — `DateCalendarTrigger` already clamps selectable dates to the data range.

## Testing / verification
No unit-test harness for these in-browser JSX views (per repo convention). Verify in the preview
(port 7423): Home renders all 7 sections; the date picker changes the operational sections (pulse,
status, batch, instructor, fleet, on-the-line, spotlight) while progress sections stay; TODAY resets
to today; KPI click-throughs navigate correctly; `#/today` redirects to Home; **zero console errors**;
sidebar no longer lists Day Glance. Screenshot Home as the "after".

## Out of scope (YAGNI)
- No new charts/metrics beyond what the two views already compute.
- No change to Schedule, or to any other tab.
- Integrity items stay surfaced as the Cross-Check amber dot (not duplicated into Alerts), per the
  existing Home convention.
