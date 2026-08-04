# Cross-Check — Monthly OPS ⇄ PROG reconciliation (design)

Date: 2026-08-04

## Problem

The user compares AP127/AP126 flight-hour totals across two independently
built parts of this app — "Ops Analytics" (`js/view-summary.js`, sourced from
the scraped Operations Portal feed, `window.FLIGHTS`) and "School Perf."
(`js/view-program.js`'s `renderPerformance`/`renderScorecard`, sourced from
the school's own progress-tracking feed, `window.NGT_CACHE`) — and the
monthly totals for MAY/JUN/JUL don't match. They want to know **why**, with
concrete evidence, not just "they use different data."

Naming note surfaced during research and confirmed with the user: the tab
literally named **"School Analysis"** (`renderAnalysis`, sidebar id
`school-analysis`) has no monthly-hours-by-batch table at all — it's a
per-student pace/at-risk view (lesson counts in a lookback window, not
hours). The tab that actually computes monthly hours per batch, with an
Effective/Actual toggle, is the separate **"School Perf."** tab
(`renderPerformance`/`renderScorecard`/`buildMonthMap`). That's the PROG-side
engine this feature reconciles against.

## Confirmed root causes (found during research, real data)

Computed live in-browser against the app's own already-loaded, already-
normalized globals (`window.FLIGHTS`, `window.NGT_CACHE`) using each system's
own real formula — not a reimplementation guess:

- **OPS-side formula** (`js/view-summary.js:38-59, 725-730`): `hoursOf(f)` =
  curriculum-standard `planned_mins` for `f.lesson` (merged `cur124/126/127`,
  falling back to `f.durMin` if the lesson isn't in any curriculum) **only**
  for `f.status === 'Completed'`, batched by exact-string `f.batch` match
  (`"AP-126"`/`"AP-127"`), bucketed by `f.date.slice(0,7)`.
- **PROG-side formula** (`js/view-program.js:1440-1471, 1495-1514`):
  `collectEffectiveFlights()` applies the identical curriculum-standard/
  actual-fallback formula to every `flown[]` record across `NGT_CACHE.ap126`/
  `.ap127` (batch = which roster array the student sits in, not a per-record
  field), then `buildMonthMap()` buckets by `flown[].date.slice(0,7)`. No
  status filter needed — `flown[]` structurally only contains completed
  lessons.

Both sides already use the *same* effective-hours convention (curriculum
minutes with actual-fallback) — that is **not** the root cause, contrary to
the natural first guess. The real, evidenced causes, ranked by impact found
in the May/Jun/Jul AP-126/AP-127 window:

1. **Multi-leg/duplicate bookings inflate OPS-side hours.** The Ops Portal
   sometimes logs one curriculum lesson as 2+ separate flight bookings on the
   same date (different times/instructors, no `/2`-style suffix on the
   lesson code) — e.g. student NABHADR P., lesson `CSPXV 44`, 2026-05-12,
   logged as 3 separate Completed rows (1:00 + 2:40 + 1:30). Since
   `sEffectiveMins()` credits the **full** curriculum-standard duration to
   *every* row bearing that lesson code, each extra booking re-credits the
   same lesson's full standard hours again, while Progress logs the lesson
   once. Quantified for May AP-126: 38 lesson-instances split across 63 extra
   Ops rows (227 raw rows → 164 distinct student+lesson+date keys). This is
   the dominant driver of AP-126's May/Jun swings.
2. **Sim-flight tagging disagrees between the two systems.** OPS flags
   simulator flights via a per-booking `isSim` boolean (set upstream from
   aircraft/tail type). PROG detects sim via a literal `"(SIM)"` substring in
   the curriculum lesson code (`isSimLesson()`). Same real flights, two
   independent tags: AP-126 June shows 100 PROG sim-lesson completions vs.
   **0** OPS-flagged sim-Completed flights that month; July shows 234 vs 134.
   Invisible in either headline total (neither side's monthly total splits
   sim out), but a real disagreement anyone filtering by sim would hit.
3. **Date drift** — a lesson logged by both systems but on different dates
   near a period boundary (progress-entry lag vs. the Ops booking date).
   Quantified for May AP-126: 15 of 227 Ops-completed rows match their
   Progress counterpart on student+lesson but not on the exact date.
4. **No-match-at-all (progress lag)** — a handful of Ops-completed flights
   with no Progress record yet at all (e.g. 7 of May AP-126's `CDNXV 48`
   completions). Same class of "actionable gap" the existing per-flight
   Cross-Check already surfaces for AP127; this feature extends visibility
   to AP126.
5. **Batch-tag mismatch** — checked directly (cross-referencing each OPS
   flight's normalized student key against the PROG roster's batch
   membership): **zero** mismatches for AP-126/AP-127 in this window. Ruled
   out as a cause here, but the check stays in the UI as a standing
   green/red indicator since it's a real risk class in general (OPS batch
   tag is per-booking and free-text-ish; PROG batch is structural roster
   membership).

## Scope

- Batches: AP-126, AP-127 only (matches the user's ask; other batches like
  AP-124/128/129 excluded from this feature — AP-128 in particular has zero
  PROG-side data by design, see `js/view-summary.js:63`).
- Months: 2026-05, 2026-06, 2026-07 (calendar months, `f.date`/`flown[].date`
  based, same field each existing system already keys off).
- Levels: batch totals (headline) **and** per-SP drill-down (both requested
  and confirmed) — every AP-126/AP-127 student's OPS vs PROG hours/count
  side by side, sortable by gap size.
- Hours convention: **Effective** (curriculum-standard) as the primary/
  default view — matches the user's own framing ("effective correspond[s]
  to the syllabus") and is what both source tabs default to. A secondary
  **Actual/Block** toggle is included so the user can see whether switching
  convention narrows or widens the gap (itself diagnostic: if a gap survives
  in both modes, the cause isn't the hours formula).
- Diagnose only. No changes to `view-summary.js`'s or `view-program.js`'s
  existing calculation logic in this pass — this is a read-only reconciliation
  view built alongside them, reusing their formulas, not altering them.

## UI design

New toggle inside the existing **Cross-Check** tab (`js/view-crosscheck.js`),
alongside (not replacing) the current per-flight OK/REVIEW/CONFLICT table:

```
[ Per-Flight Reconciliation ]  [ Monthly OPS ⇄ PROG ]   ← tab-within-tab toggle
```

**Monthly OPS ⇄ PROG** panel, top to bottom:

1. **Controls**: Effective/Actual hours toggle, batch filter (AP-126 /
   AP-127 / both).
2. **Headline table**: rows = batch × month (6 rows for "both" batches),
   columns = OPS hours, OPS flights, PROG hours, PROG lessons, Δ hours, Δ%.
   Color-coded by |Δ%| (small/expected vs. large/flag).
3. **Root-cause panels** (each collapsible, each shows real matched
   evidence for the currently-filtered batch/month selection, not just
   prose):
   - *Multi-leg bookings* — list of student+lesson+date groups with >1 OPS
     row, showing each row's time/instructor/tail, and the resulting
     hours over-credit.
   - *Sim-tag mismatch* — per batch/month, PROG sim-lesson count vs. OPS
     `isSim`-flagged count, with the delta.
   - *Date drift* — student+lesson pairs matched across systems but on
     different dates, with both dates shown.
   - *No match* — OPS-completed flights with no PROG record at all
     (actionable: likely a real progress-entry gap).
   - *Batch-tag check* — pass/fail indicator; lists any mismatches found
     (empty state today, by design still checked live every load).
4. **Per-SP drill-down**: expandable per batch/month, one row per student —
   OPS hours/flights vs. PROG hours/lessons, Δ, sorted worst-gap-first by
   default.
5. **"Why they differ, and how to fix it"** — a written panel (not a code
   change) summarizing each root cause in plain language with a concrete
   recommendation, e.g.: adopt the existing `/2`-style split-lesson suffix
   convention in the Ops Portal whenever one curriculum lesson spans
   multiple bookings, so `sEffectiveMins()`'s existing split-credit logic
   applies instead of double-crediting; reconcile the two sim-detection
   mechanisms (`isSim` boolean vs. `"(SIM)"` lesson-code substring) onto one
   source of truth; treat progress-entry lag as expected/self-healing within
   a few days rather than a bug.

## Implementation approach

Pure client-side, computed live at render time from the already-loaded,
already-normalized `window.FLIGHTS` / `window.NGT_CACHE` — same no-build,
CDN-React pattern as the rest of the app, no new dependencies, no backend
change. New code lives in `js/view-crosscheck.js` (or a new
`js/crosscheck-monthly.js` companion module if the file grows unwieldy —
decide during implementation based on resulting size), reusing:

- `window.AP127Reconcile.ccKeyFromFull`/`ccNameNorm` (`assets/reconcile.js`)
  for student-name canonicalization (already generic, not AP127-locked
  despite the wrapping `reconcile()` function being AP127-only).
- The same `sBuildCurMap`/`sEffectiveMins`-equivalent formula ported inline
  (matching `js/view-summary.js:38-59` and `js/view-program.js:1440-1471`
  byte-for-byte in behavior, since the whole point is reflecting "current
  site logic," not a fresh interpretation).

No changes to `js/view-summary.js` or `js/view-program.js`.

## What does NOT change

- Ops Analytics and School Perf's own calculation code — untouched.
- The existing per-flight Cross-Check (`assets/reconcile.js`,
  AP127-only, per-flight OK/REVIEW/CONFLICT) — untouched, stays as its own
  toggle state.
- No new data sources — uses the same bundled `flight-data.js`/`ngt-data.js`
  snapshots already loaded for every other view.

## Testing / verification

- Local: serve via the existing `ap127v2` local static-server launch config,
  drive the Cross-Check tab, exercise both toggle states (Per-Flight /
  Monthly), both hours modes (Effective/Actual), both batches, confirm the
  headline table's numbers match a fresh independent computation against
  the same live `window.FLIGHTS`/`window.NGT_CACHE` (spot-checked during
  design: AP-126/AP-127 × May/Jun/Jul totals recorded above).
- Confirm zero console errors, confirm the existing per-flight Cross-Check
  view is pixel/behavior-identical to before (regression check).
- Mobile viewport check (this app's existing convention for every new view).

## Risks / trade-offs

- `window.NGT_CACHE`'s `flown[]` has no client-side dedup pass (unlike
  `FLIGHTS`, which got `dedupeIdenticalActuals()` in `p116`) — if the
  upstream DB001/`ap127-data-api` progress feed has its own duplicate-entry
  bug, PROG-side hours could be silently inflated with no safety net. Not
  fixed in this pass (out of scope — diagnose only); flagged in the "how to
  fix" panel as an open question for the upstream data owner.
- This feature computes a *new* combined (real+sim) OPS total that no
  existing Ops Analytics panel displays as a single number today (Ops
  Analytics splits real/sim into separate chart series) — chosen
  deliberately to match the user's explicit "all flight" scope and to pair
  correctly against PROG's own unsplit `buildMonthMap()` total, but worth
  noting as a new, feature-specific aggregate rather than a mirror of an
  existing on-screen number.
