# Ops Analytics — effective-hours counting fix (design)

Date: 2026-08-05

## Problem

Follow-up to the 2026-08-04 Cross-Check "Monthly OPS ⇄ PROG" diagnostic
(`docs/superpowers/specs/2026-08-04-crosscheck-monthly-ops-prog-design.md`),
which found — but deliberately did not fix — that Ops Analytics' effective-hours
totals were inflated relative to Progress, mainly because one curriculum lesson
flown across 2+ separate same-day Ops Portal bookings got the full
curriculum-standard duration credited **again** for every extra booking.

The user set a hard rule: **a curriculum lesson's effective hours count once per
SP, no matter how many Ops Portal bookings reference it.** They also asked that,
since flight training is sequential, the app check and surface (not silently
fix) cases where a SP has a later curriculum lesson complete without an earlier
one logged — confirmed via clarifying question: **flag it, don't fabricate
hours** for any assumed-but-unlogged prior lesson.

## Scope

- Fix lives in `js/view-summary.js` (Ops Analytics) — the tab named in the
  request. `js/view-program.js` (School Perf.) is untouched; its `flown[]`
  source is already one record per completed lesson, not per booking, so it
  was never subject to this bug (confirmed during the 2026-08-04 investigation).
- Applies to **Effective mode only**. Block/Actual mode legitimately sums every
  real booking's logged block time — that's real aircraft-hours flown,
  correctly not deduped.
- Applies tab-wide: KPI strip, batch composition, all 4 stacked charts, batch
  breakdown table, student/instructor rosters, and the all-time cumulative
  roster — every one of these already funnels through the single `hoursOf(f)`
  callback (confirmed by grep — 9 call sites, all through `hoursOf`), so fixing
  `hoursOf` once fixes all of them consistently.
- `js/crosscheck-monthly.js` (the Cross-Check Monthly view) is updated to apply
  the identical dedup on its own "OPS hrs" column, so it keeps mirroring Ops
  Analytics' real, now-corrected behavior rather than the old bug.

## Approach

### 1. Effective-hours dedup

`sBuildEffectiveCreditSet(flights)`: groups every Completed flight by
`student + '|' + RAW lesson code` (case/whitespace-normalized, but **not**
suffix-stripped — a "/1"/"/2" split-lesson pair is intentionally left as two
separate one-row groups, since `sEffectiveMins()` already credits only the
"/1"/bare part and zeroes the rest; this dedup only targets *unmarked*
duplicates, exact repeats of the same lesson code). For any group with more
than one row, picks a single **representative** (latest date, then latest
start time, then original array position as a final stable tiebreak) and
credits only that row; every other row in the group returns 0 *effective*
hours from `hoursOf()` (they still count toward flight totals and block
hours — only the curriculum-standard duplicate credit is removed).

Computed **globally** — over every Completed flight ever, not just the
currently-selected period — because `hoursOf()` is called from two different
populations: the period-filtered `filteredFlights` (charts/KPI) **and** the
all-time `FLIGHTS` (`cumulStudentGroups`, the "STUDENT ALL-TIME SUMMARY"
roster, filtered only by batch). A period-scoped dedup would disagree with
itself across these two call sites; a global one is consistent everywhere.

**Bug found and fixed during implementation:** the first version tracked
credited rows by `f.id`. Live verification showed several Ops Portal rows
share the *exact same* `.id` string (a pre-existing upstream id-generation
issue this repo's `CLAUDE.md` already documents for `ACTUAL_ONLY_*` records)
— so a `Set` of ids silently credited *every* row sharing a duplicated id
instead of just the intended one, undershooting the correction. Fixed by
tracking **flight object references** instead of `.id` strings (a `Set` of
the actual row objects, checked by identity) — safe regardless of duplicate
ids, since every aggregation reads the same `FLIGHTS` array's object
references.

Verified live against the current data (values will drift as the hourly data
refresh runs, but the *shape* of the correction is stable): AP-126 May
523.2h→475.2h (previously the largest outlier), AP-126 Jun 587.7h→573.8h, Jul
1073.0h→1053.0h; AP-127 May 172.8h→169.3h, Jun 410.0h→409.0h, Jul
444.5h→432.5h. Cross-checked against the Cross-Check Monthly view's PROG
column afterward: every batch/month's Δ% dropped to within ±10%, down from
up to ±8.5% before *and* a materially larger swing before the object-identity
bug was caught (AP-126 May's raw multi-leg count is 227 bookings → only 212
distinct lesson-credits, a 15-row/48h correction — the id-based first attempt
under-corrected this same case to a 13h reduction).

### 2. Lesson sequence check

`sBuildSequenceGaps(batchAllowed)`: for each batch with curriculum data
(AP-124/126/127, plus AP-129 which shares AP-127's curriculum — same
convention as `js/view-program.js`'s `collectCurriculumPlan()`), and for each
student in that batch's roster, builds the set of curriculum lessons they've
ever completed and finds the highest curriculum-order position reached. Any
curriculum lesson *before* that position which isn't in the completed set is
reported as a gap (`{batch, student, reached, missing[]}`) — never
back-filled into any hours total.

**Bug found and fixed during implementation:** the first version sourced
"completed" from `window.FLIGHTS` (the Ops Portal feed). Live verification
showed this produced nonsensical results for long-finished batches — e.g.
AP-124 students who reached the final checkride lesson were reported missing
*nearly the entire curriculum*. Root cause: `FLIGHTS` is a **rolling window**
of Ops Portal history (already documented in `assets/reconcile.js`'s own
comment: "Operations history is a rolling window; progress goes back
further") — a batch that finished months ago has most of its early
lesson-by-lesson bookings aged out of that window even though every lesson
was genuinely flown. Fixed by sourcing "completed" from
`window.NGT_CACHE`'s `flown[]` (the Progress feed, via the already-existing
`sBatchRoster()` helper) instead — a full, non-windowed completion history
with no retention cutoff. Re-verified live: gap count dropped from 57
(mostly false positives) to 5 plausible single-lesson gaps (e.g. AP-127
student "A-RUT" reached `CDIL 25` with `CSGL 24` unlogged — consistent with
that same student's known `missing_in_ops`/`missing_in_progress` entries
already visible in the existing per-flight Cross-Check).

New `SequenceGapPanel` component, mounted directly after the existing
`BatchSummary` panel (same all-time, batch-filtered scope, same visual
style) — collapsed-by-default pattern isn't used here since the table is
small; shows a green all-clear state when empty, matching the existing
Batch-tag check pattern from the 2026-08-04 Cross-Check work.

## What does NOT change

- `js/view-program.js` (School Perf., School Analysis) — untouched.
- Block/Actual hours mode — untouched, still sums every real booking.
- Flight *counts* (KPI "Completed" tile, chart flight-count series, batch
  breakdown table's flight columns, Cross-Check Monthly's "OPS flights"
  column) — untouched, still raw per-booking counts. Only the *hours*
  computation is deduped; the count of real sorties flown is a legitimately
  different, still-accurate metric.
- The existing per-flight Cross-Check and its "Multi-leg bookings" diagnostic
  panel — kept, but its framing text was updated (`js/view-crosscheck.js`) to
  say the double-counting is now fixed and the list is a data-quality view
  (worth cleaning up in the Ops Portal with the existing "/2" suffix
  convention), not an open bug.

## Testing / verification

- Local static server (`ap127v2` launch config): reloaded Ops Analytics,
  confirmed KPI/composition/charts/batch breakdown/rosters all render with
  the corrected (lower) effective-hours totals, zero console errors.
- Confirmed Block mode's totals are unchanged (no dedup applied there).
- Confirmed the Lesson Sequence Check panel shows a small, plausible gap list
  (5 entries) instead of the initial FLIGHTS-sourced false-positive wall (57).
- Confirmed Cross-Check Monthly's "OPS hrs" column now closely tracks "PROG
  hrs" for AP-126/AP-127 × May/Jun/Jul (all Δ% now within ±10%, AP-126 May —
  previously the worst case — down to −1.4%).
- Mobile 390px checked: Batch Summary + Lesson Sequence Check panels scroll
  horizontally within their own containers, no page-level overflow.
