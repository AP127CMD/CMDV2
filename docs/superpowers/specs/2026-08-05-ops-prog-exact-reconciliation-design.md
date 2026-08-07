# OPS ⇄ PROG exact reconciliation — root-causing every remaining hour (design)

Date: 2026-08-05

## Problem

Follow-up to the same day's earlier fix
(`docs/superpowers/specs/2026-08-05-ops-analytics-effective-hours-fix-design.md`),
which deduped effective hours to once per SP per lesson and closed most of the
gap between Ops Analytics and Progress, but left real residual Δs per
batch/month (largest: AP-126 June, +8.5%). The user's instruction this round:
**"All should be match exactly... go through all detail as much as you need
and make it all the same... If still cannot make it the same then show me in
the way that we can pin point all the different points."**

This is a request to (1) keep root-causing until nothing more is legitimately
fixable in code, and (2) for whatever remains, build a complete, itemized,
self-validating explanation — not aggregate diagnostic counts.

## Investigation — three more real bugs found and fixed, all confirmed live

Method: for each batch/month, directly compared the "matched, same-month"
totals on both sides record-by-record (not just aggregate hour totals) until
every discrepancy traced to a named, real cause.

1. **Duplicate `.id` values silently broke the effective-hours dedup credit
   set.** The dedup tracked "which row is credited" using `f.id` as the map
   key. Live data showed several Ops Portal rows share the *exact same* `.id`
   string (a pre-existing upstream id-generation bug this repo's `CLAUDE.md`
   already documents for `ACTUAL_ONLY_*` records). A `Set` of ids credits
   *every* row sharing a duplicated id, not just the intended one — for one
   real group (student NANJITRA D., lesson `CSXV 45`, 5 Ops rows, 4 sharing
   the literal id `"ACTUAL_ONLY_3255"`), this credited 4 of 5 rows instead of
   1, undershooting the fix (AP-126 May's true correction is 523.2h→475.2h,
   not the id-based version's 523.2h→510.2h). Fixed same day, already shipped
   as part of the prior spec.

2. **A lesson-code spelling mismatch between the Ops Portal and the
   curriculum/Progress.** Systematic sweep (edit-distance search between every
   OPS-only and PROG-only lesson code) found `"CDNXV 48"` (Ops Portal) and
   `"CDNXC 48"` (curriculum `cur126`, and therefore Progress) are the *same
   lesson* — confirmed by matching all 28 occurrences 1:1 by student+date.
   Left unfixed, this both under-priced Ops Analytics' effective hours for
   these bookings (curriculum-map lookup keyed on the curriculum's own
   spelling failed, falling back to raw block time) and made every
   cross-system reconciliation misreport it as two independent gaps (a
   "structural — lesson type Ops never tracks" gap on one side, an "Ops-only,
   no Progress record" gap on the other). Fixed with a new
   `AP_LESSON_CODE_ALIASES` map in `js/shared.js`, applied once at load time
   to `window.FLIGHT_DATA.flights[].lesson` — the same pattern and same file
   as the existing `AP127_STUDENT_ALIASES` fix, so every downstream view
   (Ops Analytics, Cross-Check, Sequence Check, everything) benefits with no
   per-view change.
3. **The effective-hours dedup didn't recognize "bare" and `"/1"` as the same
   lesson, and gave zero credit to a lesson logged only as continuation legs
   with no `"/1"`/bare leg at all.** Two related gaps in the original
   same-day dedup:
   - A short/aborted bare-coded attempt (e.g. `"CSXV 45"`, 45 min, clearly too
     short to be the real completion) plus a later properly-split
     `"/1,/2,/3"` re-attempt of the *same* lesson were treated as two
     unrelated single-row groups, each independently credited — confirmed
     live (student NAPATH T., lesson `CSXV 45`: a 2026-05-22 bare booking +
     a 2026-05-26 3-leg booking, Progress's own single flown record matches
     only the May-26 completion) and found to recur in 4 cases across the
     whole dataset (~11h).
   - A lesson logged *only* as continuation legs (`"/2"`, `"/3"`...) with no
     `"/1"`/bare leg ever recorded fell through `sEffectiveMins()`'s
     part-based logic to 0 credit every time, despite Progress showing it
     done — confirmed live in 8 cases across the whole dataset (~9h).

   Fixed by rewriting `sBuildEffectiveCreditSet()` (and its
   `js/crosscheck-monthly.js` mirror) around a single "lesson family" concept:
   group every Completed flight by **base** lesson code (any `/N` suffix
   stripped), then pick one credited representative — a "part 1" (bare or
   `/1`) row if any exists in the family (latest date/time wins among those);
   only when the family has *no* part-1 row at all does the earliest-available
   continuation leg stand in. The credited row always gets its full
   curriculum-standard duration looked up by base code (not by re-parsing its
   own suffix), which also required changing `hoursOf()` (and the ledger's
   `minsOps`) to do that direct base-code lookup instead of calling
   `sEffectiveMins()`/`effMinsFromDur()` on the credited row.

## New deliverable — the Reconciliation Ledger

Even after all three fixes, small residuals could remain from ordinary system
lag (Ops Portal completion-marking lag, Progress entry lag, cross-month
drift). Rather than leave these as an aggregate "Δ 8.8h, cause unknown," a new
`computeLedger(hoursMode)` in `js/crosscheck-monthly.js` computes, per
batch/month, the *complete* bidirectional accounting:

```
Δ(PROG − OPS) = structural + opsPending + opsCanceled + progTrueGap
                + progDrift − opsOrphan − opsDrift  (+ residual)
```

Six categories, each a real itemized list of student+lesson+date records (not
prose):
- **structural** — PROG lesson code that never appears in `FLIGHTS` at all
  (not a flight-booking lesson type, e.g. ground/academic — permanent, not a
  gap).
- **opsPending** / **opsCanceled** — a matching Ops booking exists but is
  still Pending / is Canceled.
- **progTrueGap** — no Ops record at all, any status, any date.
- **progDrift** / **opsDrift** — a match exists but lands in a different
  calendar month (both directions).
- **opsOrphan** — Ops shows Completed, Progress hasn't logged it at all yet
  (opposite lag direction).

`residual` = Δ minus every category above — a direct, printed
self-validation, not an assumption. **Confirmed live across all 6 batch/month
rows after the three fixes: 5 of 6 reconcile to an exact 0.00h residual; the
6th (AP-127 July) is 0.01h off — floating-point rounding only (~0.6
minutes).**

## UI

New "Reconciliation Ledger" panel in the Cross-Check tab's "Monthly OPS ⇄
PROG" view (`js/view-crosscheck.js`), between the headline table and the
existing data-quality diagnostic panels. One collapsible row per batch/month;
expanding shows every non-empty category as a clickable chip (count + hours),
which itself expands to the full itemized line list (student, lesson, date,
Ops status where relevant). A "✓ fully explained" / "residual ±Xh" badge
closes each row. The now-superseded one-directional `dateDrift`/`noMatch`
diagnostic panels (from the prior day's build) are removed — the ledger
strictly subsumes them (bidirectional, status-aware, validated).

## What does NOT change

- `js/view-program.js` (School Perf., School Analysis) — untouched.
- Block/Actual hours mode — untouched (real logged time per booking,
  correctly not deduped).
- Flight *counts* — untouched, still raw per-booking counts.
- Sim-tag mismatch and batch-tag check diagnostics — kept as-is, still real
  and orthogonal to the hours ledger.

## Testing / verification

- Local static server: reloaded after each fix, confirmed via direct
  `computeLedger('effective')` calls in the console that the residual for
  each of the 6 rows dropped to ~0 incrementally as each bug was fixed.
- Confirmed Ops Analytics itself (KPI/composition/charts/Batch Summary/
  Lesson Sequence Check) still renders correctly with the updated formula,
  zero console errors.
- Confirmed the Reconciliation Ledger UI expands/collapses correctly at both
  the category and line-item level, and that collapsing back to the headline
  table leaves the existing per-SP/multi-leg/sim/batch-tag panels unaffected.
- Mobile 390px checked: ledger panel and its expanded breakdown both scroll
  correctly within the page, no horizontal overflow.
