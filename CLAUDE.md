# CMDV2 — Claude Code Context

## Note (2026-07-27): CMD_CTR-side root cause of the notification flip-flop is fixed

The `2026-07-31` status flip-flop that caused duplicate Cancelled/Pending Telegram notices was root-caused
and fixed upstream in CMD_CTR (`flight-schedule-feed/CLAUDE.md` — the scraper's Timeline mode-switching
fetch, which could silently leak a stale Canceled-mode read, was replaced entirely with a direct RPC call
that can't produce that failure mode). AP127 Telegram notifications are still OFF as of this write —
re-enabling them is the user's call once they're satisfied the upstream fix is holding in production
(watch a few days of CI runs / real notifications before flipping `enabled: true` in the Watchdog
Destinations config). This session's watchdog-side defensive patches (`stabilizeCancelledFlights()`, the
bookingId-reassignment guard, the anomaly-drop guard, `suppressActualPairs()`) were built to compensate
for the now-fixed upstream flakiness — left in place deliberately (no evidence they cause harm by
staying, removing them is a separate future cleanup, not bundled into the upstream fix).

## ⚠️ Update rule — do this after EVERY code change
1. Bump `?v=pNN` token on ALL `<script>` tags in `index.html` — next must be `p130` (all currently at p129)
2. Add entry to `REVAMP.md` change log: `| 2026-MM-DD | Description (pNN) |`
3. Update the Verify section below with new token + change summary
4. Update `/Users/nugui/AP127_Docs/README.md` §2.4 (add to §10 log) — then push AP127_Docs
5. `git add . && git commit -m "pNN: <what changed>" && git pull --rebase && git push`

## What this project is
Unified ops + progress SPA. Merges CMD CTR (operations) + DB001 (progress) in one native React app.
GitHub: `AP127CMD/CMDV2` | Live: https://ap127-ngt2.pages.dev | Local: `/Users/nugui/AP127_V2/`

## Verify actual state — run before starting
```bash
grep -o '?v=p[0-9]*' index.html | sort -u                                   # all tokens (may differ per file)
grep -E 'view-overview|shell\.js|view-watchdog|view-cf-usage|view-crosscheck' index.html  # Babel vs plain per file
git log --oneline | grep -v "chore: refresh data" | head -6                 # last real changes
```
**Last known:** all files `p129` (2026-08-02 — **AP127 Detail V4 — Pace Monitor: bar charts
replaced with big-number Required/Actual/Gap stats**, ninth round of same-day feedback. The p128
Day/Week/Month bar-chart redesign was itself replaced (not a bug fix — a straight ask for a
different visual language): "No more the bar chart. Just big number." Each of the 6 period-blocks
(Per Month / Per Week / Per Day × 1 SP / 28 SP Batch Total) is now a big-number stat trio —
Required, Actual, Gap — instead of a progress bar. The "Actual" figure per period now also uses a
period-matched rolling window instead of reusing one globally-selected range: Per Month = the
trailing-30-day total used directly (30d ≈ 1 month); Per Week = the trailing-14-day total halved
to a weekly rate (smoother than a bare 7-day sample); Per Day = the trailing-7-day total divided
by 7. The now-superseded "ACTUAL RANGE" dropdown (7/14/30/60d/all-time selector) was removed from
the markup since each period now sources its own fixed window. Required figures are computed
directly per period from `remaining ÷ daysRem` scaled by 7 (week) / 30.44 (month, average
Gregorian month length) rather than derived from a single weekly figure. Dead code from the old
bar-bullet system (`bullet()`, `periodBlock()`, `.d127v4-bullet-*`/`.d127v4-bullets` CSS) removed;
replaced with `stat()`/`statGroup()` and new `.d127v4-pace-stat*` CSS. Verified live: all 6
period-blocks show internally consistent numbers (per-SP figures = batch-wide ÷ 28, gap =
actual − required, batch Per Month required 1016h ÷ 28 = 36.3h matches the 1-SP Per Month
required), zero console errors, original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css`. Full
write-up: REVAMP.md's p129 entry.) p128 (2026-08-02 — **AP127 Detail V4 — Pace Monitor: Day/Week/Month
bars + Plan End countdown**, eighth round of same-day feedback. Removed the "Cohort ETC" card (a
single-number ETC computed from all-time average pace felt redundant next to the per-period bars
below it). "Plan End" card now shows a "Xd remaining" subline (days from today to the 27 Nov 2026
curriculum end date, reusing the already-computed `daysRem`). The Pace Monitor's actual-vs-target
bars — previously one "per week" bar per metric with a text-only day/month conversion footnote —
are now three fully separate bar pairs (Per Day / Per Week / Per Month), each showing its own
actual, target, and an explicit `(+/-Xh gap)` readout, for both the "1 SP" and "28 SP · Batch
Total" sections (12 bars total, up from 4). Cards grid dropped from 4 to 3 columns to match. Dead
code from the removed ETC card (`avgHrsDone`/`avgRemHrs`/`allTimeDaySP`/`etcDate` calc) removed
too. Verified live: bars render correctly for both sections, gap figures match actual-minus-target
by hand-check, zero console errors, original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css`. Full
write-up: REVAMP.md's p128 entry.) p127 (2026-08-02 — **AP127 Detail V4 — KPI card hours + curriculum-hours
disclosure**, seventh round of same-day feedback. Two small KPI-card additions: (1) "Batch Progress"
card's subtext now shows hours done alongside lessons done — `923 les / 1,135.3h of 2688 les / 5040h
flown` — instead of lessons-only; (2) "Students" card's subtext now shows the curriculum's total hours
alongside its lesson count — `96 les · 180h curriculum` (180h = `ap127CurriculumHours()`, the sum of
every lesson's `planned_mins` in `G.cur127`, confirmed live against the raw progress-worker payload) —
with a `*` and a hover tooltip clarifying the 96-lesson/180h curriculum excludes Advanced UPRT (+5
lessons/+5h), which is tracked separately from the core AP127 syllabus (this exclusion is domain
knowledge from the user, not derived from `cur127` — the live data has no UPRT entries to check against).
Both figures reuse the existing `ap127Hours()`/`ap127CurriculumHours()` effective-hours convention, so
they stay consistent with every other hours figure on the tab. Verified live: both cards render
correctly, tooltip text confirmed via DOM inspection, zero console errors, original AP127 Detail
(`js/view-cohort.js`) still byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`,
`index.html` (cache-bust bump only). Full write-up: REVAMP.md's p127 entry.) p126 (2026-08-02 —
**AP127 Detail V4 — visible hours-convention badge**,
sixth round of same-day feedback. After the p125 fix standardized "hours done" to the effective-hours
convention (curriculum standard duration per lesson, not actual logged flight time) everywhere, user
asked which convention was actually in use, then asked for it to be shown on the page itself rather
than only explained in chat. Added a persistent, always-visible pill badge — "● HOURS = EFFECTIVE
(standard duration per lesson, not actual logged time)" — directly under the page title (not hidden
behind a hover), with a full-detail tooltip on hover covering every panel it applies to and the
fallback rule. Also added shorter reinforcing tooltips to the KPI card's "Hrs Done / Plan" label and
the Progress Ranking table's "HRS DONE" column header. Verified live: badge renders correctly above
the sticky toolbar, zero console errors, original AP127 Detail (`js/view-cohort.js`) still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css`. Full
write-up: REVAMP.md's p126 entry.) p125 (2026-08-02 — **AP127 Detail V4 — cross-chart consistency pass**,
fifth round of same-day feedback, and the most consequential one: found and fixed a real numeric
discrepancy, not just UX polish. **Root cause: two competing "hours per flight" formulas coexisted
across the tab.** `ap127Hours()` (used by the KPI card, Progress Ranking table, Pace Monitor —
inherited unchanged from the original tab) computes each flight's hours as
`lessonsMap[lesson]||actualMins` (curriculum's standard duration wins, actual logged duration is
only a fallback). Six panels added across earlier V4 rounds — Actual vs Planned, Combined Progress's
chart line, Batch Lead/Lag History, Individual Lead/Lag vs Plan, Daily Output, and the Roster —
had each independently reinvented the same per-flight sum with the fallback order REVERSED
(`actualMins||lessonsMap[lesson]`) or dropped entirely (Roster: actual-only, no fallback). Same real
flights, different totals, because standard and actual durations aren't always identical. User
caught it by comparing Batch Lead/Lag History's "Now" (-880.7h at the time) against the KPI card
and Combined Progress vs Plan's "vs Plan Today," which agreed with each other but not with Batch
Lead/Lag. Fixed by rewriting all six sites to call the same `lessonsMap[lesson]||actualMins`
formula (Roster gained its own local `lessonsMap`/`hrsOf()` since it didn't have one). Re-verified
live: KPI card, Combined Progress vs Plan, and Batch Lead/Lag History now all show **-880.7h**
identically (was -880.7h / -880.7h / a different number before the fix); lessons mode spot-checked
too (-337 across all three, was already consistent since lesson *counting* was never ambiguous —
only the hours *conversion* per lesson was). Also this round: (1) **Pace Distribution's average
line was landing in the wrong bin entirely**, not just off-center — `avgDone` is a fractional mean
(e.g. 32.96) but bins are integer-bounded (`[31,32]`, `[33,34]`, ...), so a `>=lo && <=hi` match
left a gap no fractional value could ever land in, silently falling through to the "last bin"
fallback and drawing the line at the far right of the chart regardless of the real average; fixed
by matching against the bin's true continuous range `[lo, hi+1)`, then interpolating the exact
pixel position within that bin (the fix from the previous session only handled the second half of
this — worth re-verifying claimed fixes against real rendered output, which is exactly how this
deeper bug surfaced). Pace Distribution bars now also show the full SP name list on hover, not just
a count. (2) **Roster "today" highlight matched nothing** — `ap127AllDatesRange()` (and two sibling
helpers) parsed date strings as LOCAL midnight but serialized via `.toISOString()` (always UTC),
silently shifting every generated date backward by one day in any timezone east of UTC (Bangkok
included) — the exact bug class this project's CLAUDE.md already documents from prior `bkkToday()`/
`bkkNowMin()` incidents, just newly reintroduced in V4-only code. Fixed by parsing and stepping in
UTC throughout. Roster flight cells are now clickable (opens the same student drawer used
elsewhere). (3) **Overall Progress Bar View gained a "MASTER PLAN" reference row** (the full
96-lesson curriculum, always 100% filled, as row 0) plus finer syllabus key points beyond the 4
phase boundaries — Initial Solo (lesson 14), Instrument (15), Cross-Country (29), Sim (56),
Multi-Engine (91), and all 4 Checkride lessons (54/55/90/96) — computed dynamically from
`G.cur127`'s own lesson codes via the same decoder key as the phase classifier, not hardcoded.
Verified live end-to-end: both tabs, zero console errors, original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file touched:
`js/view-cohort-v4.js`. Full write-up: REVAMP.md's p125 entry.) p124 (2026-08-02 — **AP127 Detail V4 — Pace Monitor clarity + Daily
Output off-days toggle**, fourth round of same-day feedback. (1) **Pace Monitor's day/month
sub-labels were asymmetric and confusing** — the "1 SP" section's bullets showed "≈ X / day"
underneath, the "28 SP" section's showed "≈ X / month" underneath, both under an identically-worded
"Hours / wk" header, so it read like two different metrics rather than the same weekly figure
broken down two ways. Fixed by having the shared `bullet()` helper always compute and show BOTH
`≈ X/day · Y/month` under every bullet (1 SP and 28 SP alike) — one consistent format everywhere,
no more guessing which section's footnote means what. (2) **Daily Output chart now includes
zero-flight days by default** — previously `byPeriod` only ever got a key for periods that had at
least one flight, so off-days were silently absent from the x-axis entirely (a quiet week looked
compressed, not idle). New `ap127v4PeriodRange()` generates the full day/week/month sequence from
the batch's first flown date to today regardless of activity; a new toggle button ("Hide off days",
off by default) switches back to the old activity-only view when a denser chart is preferred. Only
file touched: `js/view-cohort-v4.js`. Verified live: both tabs, zero console errors, toggle
re-checked both states, bullet sub-labels re-checked in both Pace Monitor sections. Full write-up:
REVAMP.md's p124 entry.) p123 (2026-08-02 — **AP127 Detail V4 — authoritative syllabus phases**,
third round of same-day feedback on the `p122` build below. Discovered the real curriculum structure
by fetching `data/syllabus.json` from the user-referenced `https://ap127-flight-training.pages.dev`
(Study > Diagram tab): 4 official phases, exact lesson-NUMBER ranges (Phase I 1-13 "Basic Flight
Training", Phase II 14-32 "Consolidation and IFR Introduction", Phase III 33-55 "Advanced VFR and
Night Flying", Phase IV 56-96 "IFR and Multi-Engine Training") plus a lesson-code decoder key
(C=Check suffix, D=Dual, S=Solo, SP=SPIC, M=Multi-Engine, G/I/N/X=activity letters). Replaced the
old prefix/substring-guessing `ap127LessonPhase()` with `ap127SyllabusPhase()` — exact, since every
lesson code ends in its curriculum lesson number (e.g. "CSPGL 36" = lesson 36) and phase membership
is a direct number-range lookup, no more inference. Applied this SAME classifier everywhere "phase"
appears in V4 — Flight Timeline dots, Roster heatmap cells, Phase Progress Funnel, and Overall
Progress — so they're now colour-consistent (previously Overall Progress used one ad hoc scheme,
Timeline/Roster another). Overall Progress Bar View rebuilt again: back to a STACKED bar per SP (one
segment per phase, up to 4), with fixed dashed boundary lines at the exact lesson numbers each phase
starts (14/33/56) — this replaces the two prior attempts (stacked-by-guessed-phase in `p121`, then
single-bar-with-approximate-milestones in `p122`) now that the real boundaries are known. Removed
the Weekday Activity Pattern chart (user's bonus-feature call, not requested). Roster: no more SP
callsign under the name, Total column now shows lesson count alongside hours ("18L · 24.7h"), day
headers show month on the first visible column of each month, cell hover text now includes flight
duration, default range dropped to 30 days (matching By-Instructor's own default), and both the
heatmap and the row/column CSS were tightened further for density. Verified live (local static
server): both tabs, zero console errors, Overall Progress boundary lines land exactly at lesson
14/33/56 as expected, Phase Progress Funnel now shows real per-phase completion (100%/92%/11%/0% at
verification time) instead of one lumped bucket. Only files touched: `js/view-cohort-v4.js`,
`css/progress.css`. Full write-up: REVAMP.md's p123 entry.) p122 (2026-08-02 — **AP127 Detail V4 follow-up round**, same day as the
`p121` build below, per direct user feedback after using the live `p121` tab. (1) **Overall Progress
Bar View reworked again** — user wanted the stacked-by-phase bars replaced with a single bar per SP
(x-axis = lesson number reached, no accumulation/stacking), colored by the phase of their last-flown
lesson (still no per-student rainbow), plus dashed vertical lines marking where the curriculum's major
stages first begin ("Initial Solo", "Multiengine" — derived from `G.cur127` in curriculum order via a
new coarse 3-bucket `ap127OverallStage()` classifier: `CM*`-prefixed = Multiengine, any `SP`/`PIC`
substring = Initial Solo, else the implicit starting stage — no line needed at position 0). A static
phase-color legend row (reusing the Timeline's dot-legend pattern) replaces the old per-dataset Chart.js
legend, since a single-dataset bar with a `backgroundColor` array can't drive one. (2) **Roster range
now goes to "All time"** — added a `value="0"` option to `#d127v4-roster-range` (same pattern as the
Pace Monitor's range select), heatmap start falls back to `batchStart` when 0. (3) **By-Instructor
list now respects the same range selector** (previously always all-time regardless of the heatmap's
range) — a `rangeFlown()`/`rangeHours()` helper filters each student's `flown` to `[start, today]`
before summing, and the section heading updates to show the active range (e.g. "By Instructor · All
time · since 20 Apr"). (4) **By-Instructor made compact** — `#d127v4-fi-roster` is now a CSS grid
(`repeat(auto-fill, minmax(310px,1fr))`, was a single flat column) with tighter row padding/font-size;
first attempt at 260px columns + wider stat-column widths truncated names to "Napon…"/"Vasap…" —
fixed by widening the grid minmax to 310px AND shrinking the 3 stat-column widths (44/44/56px, was
60/52/80px), verified live that full "First L." names render without ellipsis again. Verified live
(local static server): both AP127 Detail and AP127 Detail V4, zero console errors, phase-milestone
lines and both roster range selectors exercised. Only file touched: `js/view-cohort-v4.js` (+
`css/progress.css` for the grid/row tightening). Full write-up: REVAMP.md's p122 entry.) p121 (2026-08-02 — **New tab: AP127 Detail V4** — a full redesigned
duplicate of AP127 Detail (`js/view-cohort.js`, untouched, byte-identical) at a new sidebar entry
`cohort-v4` / `js/view-cohort-v4.js` (new file, ~1850 lines). Fixed the sticky time-slider covering
the tab title (reordered markup, `top:0` sticky toolbar) — reproduced live on the original tab first
to confirm the bug, fix applied to V4 only. Redesigned Pace Monitor (bullet-bar actual-vs-target +
headline cards, same math as original), Pace Band (histogram + smoothed curve + avg line, was a
3-band chip list), and Overall Progress Bar View (x-axis now spans the full curriculum, stacked by
curriculum phase instead of one rainbow hue per student — this also exposed and fixed, V4-only, a
real gap in `ap127LessonPhase`'s prefix-anchored regexes, which missed almost every real compound
lesson code like `CSPGL 36`/`CDXV 29` and dumped them all into "Other"). Added 4 new charts/panels:
Consecutive & Idle Streaks (shares its student-filter/color state with Actual vs Planned), Daily
Output bar+moving-average (day/week/month), Phase Progress Funnel, Weekday Activity Pattern, plus an
AP127-only Roster (day-by-day phase heatmap + instructor-grouped cumulative totals, adapted from Ops
Analytics' roster pattern) and a "Needs Attention" watchlist. Every other panel (Combined Progress vs
Plan, Batch Lead/Lag History, Actual vs Planned, Individual Lead/Lag vs Plan, Flight Timeline vs
Progress, drawer) is carried over with identical behavior. Isolation: every DOM id is
`d127v4-`/`tt-*-v4` prefixed and every `window`-exposed function carries a `...V4` key (verified by
script, not eyeballed) so both tabs' scripts coexist without clobbering each other's globals — only
files touched: `js/view-cohort-v4.js` (new), `js/shell.js`, `index.html`, `css/progress.css`. Verified
live via a local static server: both tabs exercised end-to-end (sort/search/scrubber/toggles/drawer),
zero console errors, mobile 375px checked. Full write-up: REVAMP.md's p121 entry.) p120 (2026-07-29 — **Ops Analytics follow-up whole-branch review fixes.**
A final review of the p119 follow-up round (see the p119 entry below for what that round built) found
2 Important, emergent-only issues: (1) Batch Summary's lesson-done counts drifted after visiting other
tabs — `js/view-program.js`'s `normalizeStudentDone()` mutates the same `window.NGT_CACHE` student
objects `batchSummaryRows` reads (`s.done`), verified live (AP-127: 907→949 after a Program-tab visit,
desyncing LESSONS REM. from HOURS REM.); fixed by reading `(s.flown||[]).length` instead — same array
`hoursDone` already sums, immune to the mutation, re-verified held at 907 across the round-trip. (2)
Composition strip's Sim tint broke outside the default theme — resolved via the same pre-existing
`getComputedStyle(document.documentElement)` theme-invariance limitation as the canvas charts, but this
was the FIRST theme-invariant color in this component's DOM output (previously pure CSS-var/theme-
correct). First fix attempt (`color-mix(in oklch,...)`) removed the theme-invariance but rotated hue by
up to 74° in the DEFAULT theme (AP-128 sim segment rendered magenta); switched to `color-mix(in
oklab,...)` (rectangular space, holds hue within ~2-5°), re-verified via computed-style extraction for
all 5 batches. Both fixes re-reviewed clean. Known non-blocking follow-ups (documented in `REVAMP.md`'s
p120 entry, not fixed this round): non-AP roster group ordering not alphabetical, stack-total labels
can drift ~0.1h from segment-label sum in an edge case, per-chart legend now 2× entries with only-half
toggling, growing sim/real bucket-builder duplication (candidate for a shared helper next round),
`sBatchRoster` doesn't guard a malformed (non-array) `NGT_CACHE` entry, `BATCH_ROSTER_KEY`/
`BATCH_CUR_KEY` are a second batch-identity registry that could drift from `AP_BATCH_ORDER`, and the
strip's sim tint darkens while the charts' sim tint lightens (same concept, inconsistent direction).
Only file touched: `js/view-summary.js`.) p119 (2026-07-29 — **Ops Analytics follow-up — chart fixes, Sim
split, batch-grouped roster, Batch Summary.** Six follow-up changes to the Ops Analytics tab
based on user feedback after using the live `p118` rebuild, built via a 19-task subagent-driven
plan (Tasks 13-18 code, Task 19 wrap-up: full end-to-end regression + cache-bust + docs). (1)
**Chart data-labels only rendering on hover, fixed** — `StackedBatchChart` had no `animation`
override, so the default entrance animation raced the datalabels plugin's height check; set
`animation: false`, labels now correct from first paint. (2) **Per-stack total labels** added
to all 4 charts (daily count, daily hours, weekly hours, monthly hours) via a zero-height
`TOTAL` dataset. (3) **Sim flights now included by default** (`SIMULATOR` filter defaults ON,
was off) **with a visual split** — all 4 charts + Batch Composition strip split each batch's
segment into solid (real) + lighter-tint (sim); KPI strip gained a **SIM HOURS** tile, existing
HOURS/COMPLETION/CANCELLATION/AVG H/FLIGHT tiles now report real-only. (4) **Student roster
grouped by batch** — `RosterHeatmap` gained an optional `groupOf` prop rendering a batch-header
row above each batch's students (instructor roster call site unchanged, no grouping). (5) **New
Batch Summary section** — all-time lessons/hours done vs. curriculum plan, time/lessons/hours
remaining, required pace, sourced from `window.NGT_CACHE`'s separate progress feed (not
`FLIGHTS`, so unaffected by the Effective/Block toggle); AP-128 shows an explicit "NO PLAN DATA"
row (zero entries anywhere in the feed, confirmed not a bug); narrows correctly when the header's
BATCH filter changes. (6) Confirmed correct, no change: daily/weekly/monthly hours charts
showing 0 for the most recent dates in a period (those flights are still Pending). Task 19's
full end-to-end regression pass exercised all six together on one fresh load — zero console
errors, no integration issues found, no code fix needed. Only file touched: `js/view-summary.js`.
Design: `docs/superpowers/specs/2026-07-29-ops-analytics-followup-design.md`; plan:
`docs/superpowers/plans/2026-07-29-ops-analytics-followup.md`.) p118 (2026-07-29 — **Ops Analytics whole-branch review fixes**, same feature as the `p117` entry immediately below. A final whole-branch review (12 tasks had each individually passed review, but the whole ~955-line file together exposed 5 issues no single task's diff showed) found: (1) `<FocusControls/>`'s ONLY toggle was a no-op — `filteredFlights` never read `hideOthers`/`highlightAP127`; fixed to mirror `view-gantt.js`/`view-weekly.js`'s existing pattern. (2) STATUS=Standby matched zero flights (Standby is `f.isStandby`, not a `f.status` value) — fixed to OR against the flag, matching `shared.js`'s own convention. (3) Batch Composition strip rendered invisible slivers with no explanation whenever the filtered set had flights but zero completed hours; added an explicit empty state. (4) Chart data-label text was hardcoded near-black, illegible in light/warm themes; now resolves from `--bg` (note: this — like every `getComputedStyle(document.documentElement)` color read in the app, a pre-existing pattern — is still theme-*invariant* in practice, since `body[data-theme]` overrides never reach `document.documentElement`; a real per-theme fix needs a codebase-wide change, tracked as a known follow-up, not attempted here). (5) `RosterHeatmap` resolved a cell's color even when unused (zero-value cells) — tens of thousands of wasted `getComputedStyle` calls at a 90-day period; moved inside the `v > 0` branch. Also cleaned up: stale internal "(Task N)" comments, a dormant `BreakdownTable` leave-badge lookup bug (querying person-keyed `leavesOnDate()` with a batch name — the pre-rewrite file guarded this, the port dropped the guard, restored), and hoisted 3 inline-per-render subcomponents to stop needless remounts. Fix re-reviewed clean (0 critical/important). Still open, deliberately not fixed this round: the `document.documentElement` theme-invariance issue described above (codebase-wide, predates this feature); the all-time cumulative tables intentionally don't honor the AP-127 ONLY toggle (they're period/filter-invariant by design — batch-governed for students, instructor-governed for instructors); minor chart/roster duplication noted in the whole-branch review as a follow-up refactor candidate, not blocking. Only file touched: `js/view-summary.js`. Full findings: whole-branch review + fix verification transcripts in this session; spec/plan unchanged from the `p117` entry below.) p117 (2026-07-28 — **Ops Analytics tab full revamp — batch-centric KPIs, composition, 4 charts, rosters.** Replaced the old donut-chart + 3-table Analytics layout entirely with a period-filterable, multi-dimension analytics tab, built via a 12-task subagent-driven plan (Tasks 1-11 code, Task 12 wrap-up). New tab: header with 14D/30D/90D/CUSTOM period presets + Block/Effective metric toggle; collapsible filter panel over 6 dimensions (status/batch/instructor/student/aircraft-type/simulator); 13-tile KPI strip (counts per status, hours, completion %, cancellation %, avg h/flight, batch count, student count, AP-127 share); batch composition strip (segmented bar + legend); 4 stacked bar charts (`StackedBatchChart` — daily count, daily hours, weekly hours, monthly hours — each with per-segment data labels and a legend that toggles batch series); batch breakdown table; and student + instructor rosters, each a day-by-day activity heatmap (`RosterHeatmap`, click a cell → drawer) plus an all-time cumulative summary table (`CumulativeTable`, click a row → drawer) that is deliberately period-invariant — it reflects full history regardless of the header's date range (batch-grouped for students, flat for instructors). Mobile-verified at 390px: KPI strip → 3 columns, chart grid → 1 column, filter panel → 2-column stack with no overlapping text, both roster heatmaps scroll horizontally within their own container with zero page-level horizontal overflow — no code fix was needed. Only file touched: `js/view-summary.js` (full rewrite, ~955 lines). Full design: `docs/superpowers/specs/2026-07-28-ops-analytics-revamp-design.md`; task-by-task implementation history: `docs/superpowers/plans/2026-07-28-ops-analytics-revamp.md`.) p116 (2026-07-27 — **Full-view audit + 6 fixes, same day as the KPI-inflation fix below.** User: "go through all tab and functions, verify all system if it working correctly, suggest improvement." Exercised all 17 views live — zero console errors, every KPI reconciles against the raw feed. Found and fixed: (1) **`ap127-data-api` CORS was hardcoded to one origin** (`ALLOWED_ORIGIN` var = DB_Share only), so CMDV2's AND CMDV3's own live progress fetch always failed with a browser CORS error and silently fell back to the snapshot — the header's `⚠` next to PROG was therefore *permanent*, not an intermittent fault. New home for the worker source at `AP127_NGT_001/data-api/` (previously undocumented-in-repo, deployed ad hoc); switched to the same reflect-if-allowlisted `ALLOWED_ORIGINS` pattern the watchdog worker already uses (`ap127-ngt2.pages.dev` + `ap127-v3.pages.dev` + `ap127-dashboardr1.pages.dev`, default falls back to DB_Share — never a wildcard). Verified live: all three origins now get 200 + a matching CORS header; the `⚠` is gone. (2) **`OTHER` batch-type chip could never reveal blank-batch flights** (e.g. `KEY PERSONNEL MEETING`, `batch:""`) — `view-schedule.js`'s whitelist builder used `.filter(b => b && …)`, and an empty string is falsy, so it was dropped before ever reaching `filters.batches.includes(x.batch)`. Changed the guard to `b != null` (only `''` needs to survive, not `null`/`undefined`). Verified: selecting only OTHER now shows all 3 meeting rows alongside FAM FI. (3) **New "PUB" header chip** — how many days forward the Ops Portal has actually PUBLISHED (distinct from fetch freshness), because that number silently swings 0–8 days depending on what the academy has posted, and nothing in the UI ever said so; traced 30 days of history and found it decaying 3→2→1→**0** with Weekly/Roster/Slot Finder just quietly having less to show, indistinguishable from a slow day. New `scheduleCoverage` in the app context (`shared.js`), rendered via `CoverageChip` in both the desktop top bar and the mobile sidebar (`shell.js`). (4) **Board's TOTAL tile now flags when a filter is hiding flights** — e.g. `TOTAL 22 · of 30 total` when the default AP-only TYPE filter is active; computed against the unfiltered same-day count in `view-board.js`, shown via a new `hint` prop on `StatHero`. (5) **CF Usage's key gate had zero context** — it said only "Watchdog API key:" with no explanation of what the key was, where to get it, or that it's the SAME key as the Watchdog tab (`localStorage['wd-key']`, shared). Rewrote the panel to say so explicitly. (6) **Watchdog Notification Log rendered every row unvirtualized** — measured 8,579 rows / ~60,000 DOM nodes in one view for a busy month, by far the heaviest thing in the app. No virtualization lib is loaded (this project is deliberately no-build/CDN-only), so added plain pagination (`LOG_PAGE_SIZE=100`, Prev/Next, resets to page 1 on search) — verified via a mocked 8,579-row fetch that only 100 `<tbody>` rows ever mount (827 total DOM nodes, down from ~60,000). (7) **Accessibility landmarks** — the whole app had no `<main>`/`<nav aria-label>` beyond a bare `<div id="root">`; added both, plus `aria-current="page"` on the active sidebar item. Files touched: `js/shared.js`, `js/shell.js`, `js/view-board.js`, `js/view-schedule.js`, `js/view-cf-usage.js`, `js/view-watchdog.js`, `AP127_NGT_001/data-api/worker.js` (new), `index.html`. **Also shipped in this same `p116`:** **fixed duplicate flight rows that inflated every view and every hours KPI.** Found during a full-ecosystem verification sweep, not user-reported. Two independent sources, both live: (1) `attachCancelDetails()` pushed one synthetic `CANCEL_<bookingId>` row per `cancellations[]` *record*, but upstream emits one record per cancel **event** (its `id` embeds a submission timestamp), so re-cancelled bookings duplicated — 5 bookingIds → 6 phantom rows, 3 AP-127, one rendering 3×. Now collapses to the most recent record per `bookingId`; and a real `flights[]` row always wins over synthesizing a virtual, whatever status it currently reads (during a scraper flap it can still say `Pending` while the Cancel Record is submitted — the frontend counterpart of the watchdog's `stabilizeCancelledFlights()`). (2) New `dedupeIdenticalActuals()` removes 67 rows where the SAME flight was ingested twice as two `ACTUAL_ONLY` rows under different `_ACT_<n>` ids — the pre-existing dedup pass only removes *planned* rows, so these double-counted block hours. Guarded on a non-empty student **on purpose**: studentless `MEETING`/`KEY PERSONNEL MEETING` bookings legitimately repeat at the same time and must NOT collapse (all 26 preserved; the 13 remaining same-signature rows are exactly those, each with a distinct id). Verified by replaying both preludes over one live feed: rows 3806→3733, AP-127 inflation **0.67%→0%** (1337.9→1328.9 h), today's numbers byte-identical (30 rows / 52.0 h / AP-127 7 flights / 5.0 h) — the correction is entirely historical. Root cause is upstream and frozen: 425 of the 427 raw redundant rows are on dates ≤2026-07-09, i.e. inside `flight_schedule.pre_migration_archive.json`, which is re-applied as an override every run and so can never self-heal. **Still open, deliberately not fixed:** 60 ids map to genuinely *different* flights (worst `ACTUAL_ONLY_`, empty suffix, 21 rows) — upstream id-generation bug; all 206 such rows are 2026-05-05→2026-06-10, outside the watchdog's snapshot window, so notifications are unaffected.) p113 (2026-07-26 — **Schedule: fixed invisible cancelled flights, flight-card detail, Calendar leave enrichment.** Cancellations that only exist in the separate `cancellations[]` feed (no matching row in `flights[]`) were invisible in Board/Weekly/Calendar — confirmed via a real report (Napon S., CDXV 29, 2026-07-27) that self-healed mid-investigation once CMD_CTR's own new Timeline "Canceled mode" scrape started backfilling it with the real time; a second, stable example (VASAPHON S., CDGL 02, 2026-05-05) was used for the actual fix. New `attachCancelDetails()` in `shared.js` backfills `cancelReason`/`cancelRemarks` (fallback only, never overriding a pipeline-set value) and synthesizes a `_noTime` virtual flight for any still-unmatched cancellation, so every Schedule view shows it via the shared `FLIGHTS` array (Gantt correctly still skips it — no time to draw a bar with). Flight Drawer gains CANCEL REASON/REMARKS, NO TIME LOGGED, and BLOCK OFF/ON (previously-unused fields). New `leaveDetailOnDate()` (sibling to unchanged `leavesOnDate`) feeds the Calendar day panel's leave rows with duration/note/role, not just a bare reason. See `docs/superpowers/specs/2026-07-26-schedule-view-improvements-design.md`.) p112 (2026-07-17 — **ASF rank-data primary URL repointed** to `https://ap127-db001.pages.dev/cache.json`; the old primary `ap127cmd.github.io/DB001/cache.json` froze 2026-06-03 when DB001's Pages deploy job was removed — it still 200s with June data so the fallback never fired and ASF rankings ran on 6-week-old progress. Same fix in `ops/js` (`r41`) and CMD_CTR (`r44`). Also same day: leaves/resources/instructors feed restored upstream — see CMD_CTR/CLAUDE.md.) p111 (2026-07-04 — Watchdog Destinations batch picker now a live checkbox grid over every real batch in `window.FLIGHT_DATA` (fixes gaps like `TCAR`/`TCAR CONV`/`RECURRENT` casing/`TCAR / LPC` spacing that hardcoded presets missed) + Notification Log rows are now clickable → `LogDetailModal` with full flight detail + diff. p110 — Watchdog log search + sticky header + studentFilter per-destination; p109 — fixed Gantt NOW-line to use true Asia/Bangkok time via `Intl.DateTimeFormat` regardless of viewer's device timezone; `bkkNowMin()` moved from `view-gantt.js` into `shared.js`, same fix class as `p95`/I1's `bkkToday()`). p108 (2026-06-26 — Fleet Load Distribution now hides zero-hour tails when filtered, matching heatmap roster; `visEntries` filter). p107 (2026-06-26 — Effective metric mode for Utilization/FI Stat/SP Stat). p106 (shared.js strips "(Unplanned)" project-wide). p105 (FI Stat + SP Stat sub-tabs). p104 (Utilization: AP127 toggle + zero-row hiding). Next → `p110`. **Watchdog (2026-07-27) — fixed ADDED+Canceled misclassifying as "New flight" (122 tests):** Direct fallout from the stabilization fix immediately below, caught live by the user minutes after that deploy: a genuinely cancelled flight (Napon S., CDXV 29) notified as "✈️ New" with no hint it was a cancellation. Cause: once a cancelled booking's tracking is lost (the upstream flap outrunning the KV persist-only-on-change gate) and later rebuilt, it correctly fires as a fresh `ADDED` event — but with `flight.status` already forced to `Canceled` by `stabilizeCancelledFlights()`. This combination was previously impossible (a flight only ever became Canceled via a `STATUS` transition on an already-tracked id, never fresh via `ADDED`), so two places never anticipated it: `telegram.js`'s `classifyForGrouping()` special-cased `ADDED`+Completed but not `ADDED`+Canceled, falling through to the "new" bucket; `diff.js`'s `attachCancelReasons()` had the same gap, so the reason/remarks wouldn't even have joined. Both now key off `flight.status === 'Canceled'` for the ADDED case, mirroring the existing ADDED+Completed pattern. Verified against the exact real incident scenario through the full pipeline. Redeploy: `cd watchdog && npx wrangler deploy`. **Watchdog (2026-07-27) — stabilized against upstream feed flakiness, fixes real duplicate-notification storm (119 tests):** User reported "lots of back and forward duplicated notice" for cancelled flights. Confirmed via the watchdog's own `/log`: 3 live bookings each fired REMOVED-then-ADDED **9 times in one day**, each carrying a full cancel-reason notice. Root-caused via the upstream CMD_CTR feed's own git history (cloned the repo, walked 37 consecutive commits) — not guesswork: `flights[]` itself flaps a cancelled booking's presence in/out across scrapes (~5-10 min apart) while its `cancellations[]` record stays put the whole time. This is a known, only-partially-mitigated scraper race documented in CMD_CTR's own `scripts/fetch_schedule.py` (`recover_vanished_bookings()`, "kept as a safety net for if that Canceled-mode fetch itself fails for a run" — see CMD_CTR's p113 same-issue-class fix from the day before). Confirmed `cancellations[]` membership only ever gains, never loses (sampled all 37 commits) — so it's a stable source of truth. New `diff.js:stabilizeCancelledFlights(newSnap, prevSnap, cancellations)`: any cancelled bookingId present this pull gets status forced to `Canceled`; any cancelled bookingId absent this pull but known from a prior snapshot gets carried forward (status forced `Canceled`) instead of vanishing. Wired into `index.js` right before `diffSnapshots()` and before the KV persist, so the correction sticks across runs. **Verified by replaying the actual 37 real upstream commits from the incident window through old vs. new pipeline: 39 spam events → 4 (3 of which are trace-window-start artifacts; a continuously-running watchdog reduces to 1 clean notification per booking).** No frontend/pNN change. Redeploy: `cd watchdog && npx wrangler deploy`. **Watchdog (2026-07-26) — notification format redesign + cancel reason/remarks (111 tests):** Real-user report: the combined-message format's packed lines (up to 58 chars, e.g. time+tail crammed with " · ") wrapped mid-arrow on a phone screen — "line-cut". Redesigned iteratively via the visual-companion browser mockup (phone-width simulation): every SP line now leads with its group's type emoji (❌/⚠️/🔄/✈️/✅) so an entry self-labels even mid-chunk-split; context line (`lesson · 🗣️ FI · 📅 date`) drops any field that changed (promoted to its own line instead, never shown twice); **every fact/change is now its own `- {icon} ...` dash-bulleted line** instead of packed onto one line — eliminates the wrap; `🆕` moved to sit directly before the NEW value inside each arrow (`08:00–09:30 → 🆕 08:30–10:15`), never as a line prefix. Completed drops the words "planned"/"flew" (icon alone: `⏰` then `✍️`) and never shows `🆕` (factual record, not a change); actual-data split into `🛬` (T/O·LDG counts) and `🕘` (clock times + INST). **New: cancel reason + free-text remarks** — confirmed live these are NOT inline fields on the flight record, they live in the feed's separate `cancellations[]` array (mirrors `leaves[]`), joined by `bookingId`. New `diff.js:attachCancelReasons()` (pure, tested) does the join; wired into `index.js`'s pipeline (reads `data.cancellations`, already in the parsed feed, no extra fetch). Renders as `- 📝 <reason>` (categorical) + `- 💬 <remarks>` (free text, English or Thai — verified against real live records, e.g. "MFD does not sync + Ecu back-up unsafe light..."). No frontend/pNN change (backend worker only). Redeploy: `cd watchdog && npx wrangler deploy`. **Watchdog (2026-07-26) — detect same-id student/batch reassignment, then closed both residual gaps same day (97 tests):** Real incident: a flight for Anusorn T. (07-27) got "New flight" + "Flight updated" notices, then vanished with **zero** cancellation notice. Root-caused via CMD_CTR's own git history (not guesswork): the upstream source reused the SAME flight id for a totally different booking — different student (ANUSORN T.→PARAMUTT C.) AND batch (AP-127→AP-126) — instead of issuing a new id. `student`/`batch` were never in `TRACKED`, so this looked like one ordinary `CHANGED` event attributed only to the new owner; the old owner's flight silently disappeared, and even the old batch's Telegram group never saw it (routing keys off the event's — now new — batch). Fix in `diff.js`'s `diffSnapshots()`: a same-id student/batch change now synthesizes **REMOVED** (old owner, `diff.reassignedTo: {student,batch}`) + **ADDED** (new owner, `diff.reassignedFrom`) instead of one `CHANGED` — both sides get notified, each routes correctly. `telegram.js` renders a `↪ reassigned to/from <student> (<batch>)` line so the cancelled side knows who replaced them. Verified end-to-end against the real incident data (both AP127 group and a personal-DM destination now correctly receive the cancellation). **Same-day follow-up, both now fixed (user said "just fix it" rather than wait for live evidence):** (1) `TRACKED` gains `type`, `cond`, `isSim`, `isStandby` — these could also change unnoticed, same class of gap as the reassignment bug (though this specific pair wasn't caught live the way the reassignment was). `durMin`/`duration` deliberately excluded — derived from start/end, would just repeat that diff. Message rendering updated too (detection alone isn't the fix): `type`/`cond` show as `old→new` arrows, `isSim`/`isStandby` as plain words (`now SIM` / `no longer STANDBY`), not raw booleans. (2) `suppressActualPairs()` in `diff.js` now keys by `student|lesson|date` (was `student|lesson` only) — a student can legitimately attempt the same lesson code on more than one date, and without `date` a genuine cancellation could be wrongly swallowed by an unrelated same-tick Completed event sharing student+lesson on a different date. Regression-tested: the genuine same-date pair still suppresses correctly. **Watchdog (2026-07-25) — combined per-run notifications (spec: `docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md`):** Replaced the individual-message-or-summary split with a single mode: **every run sends one combined, fully-detailed message per destination**, `@mention`s every matched SP every time (fixes the 2026-07-21 outage-catch-up gap where a 26-event burst went out as one anonymous summary with zero mentions). Events group by urgency (❌ Cancelled → ⚠️ Changed → 🔄 Status update → ✈️ New → ✅ Completed, empty groups omitted), sorted by flight time within each group. Time is now **always** shown as a full `start–end` range (never a bare start), and a time change shows the full old range → full new range together. **Completed** flights now show full actual-flight data: touch-and-go count (`N T/O · N LDG`), actual clock times (`TO HH:MM · LDG HH:MM`, collision-distinct from the count label), and `INST N` (only when non-zero) — sourced from new display-only fields on `diff.js`'s `buildSnapshot()` (`to`/`ldg`/`tkoff`/`ldgTime`/`inst`, deliberately NOT added to `TRACKED` so they never themselves fire an event). Splits into multiple `(n/total)` messages only if content would exceed Telegram's 4,096-char hard limit (two-pass build: bodies first, headers once the total is known) — a typical mixed-event run stays well under one message, a 30-event all-Completed synthetic test confirmed correct multi-chunk splitting with the group header re-shown in each chunk. `formatMessage()`/`formatSummary()` and `MAX_SENDS_PER_DEST` are removed, replaced by `telegram.js`'s `buildCombinedMessages()`. 79 watchdog worker tests (up from 71 — see the spec for the full before/after; the separate `watchdog-monitor` package's 15 tests are unaffected by this change). No frontend/pNN change (backend worker only). Redeploy: `cd watchdog && npx wrangler deploy`. **Watchdog (2026-07-17) — completion label fix + dead-man's-switch monitor (81 tests):** (1) **In-place completion no longer mislabeled "Flight updated".** The newer feed completes many flights IN PLACE (plain id: `Pending→Completed` AND planned times replaced by actual flown times in one tick — 1058 such records live, alongside the older 2570 `ACTUAL_ONLY_*` add pattern). That 3-field diff `{start,end,status}` used to classify as `CHANGED` → "⚠️ Flight updated". Fix in `diff.js`: **any diff touching `status` is a `STATUS` event** (status is the headline), regardless of co-changed fields. `telegram.js` renders `STATUS`+`Completed` (from ADDED or in-place) as "✅ Flight completed" and, when actuals were recorded, adds `🕐 planned HH:MM–HH:MM → flew HH:MM–HH:MM`. A status change bundled with a reschedule/cancel now shows "🔄 Status update" with the co-changed detail appended (via new `changeDetailLines()`), never buried as "Flight updated". No frontend/pNN change (log types unchanged: ADDED/REMOVED/CHANGED/STATUS). (2) **New sibling worker `ap127-watchdog-monitor`** (`/Users/nugui/AP127_V2/watchdog-monitor`, own `*/10` cron, shares KV under `monitor:*`) — the long-recommended dead-man's-switch. Independent isolate, so it survives the watchdog's silent CPU-hard-kill. **Reads the watchdog's own `watchdog:status` directly from shared KV — NOT an HTTP call** (a same-account Worker→`*.workers.dev` fetch is blocked by CF error 1042; and a CPU-killed watchdog stops WRITING KV, so a frozen `lastRun` >30 min is the truest death signal). Two consecutive unhealthy checks (~20 min, tolerates one blip) → ONE Telegram alert; recovery → one all-clear. Alerts on transitions only (KV `monitor:state`). Reuses the watchdog's own config for the target chat (admin 'Nu' destination by default — no new chat-id needed). **Needs one manual step: `cd watchdog-monitor && npx wrangler secret put TELEGRAM_BOT_TOKEN`** (copy value from the main worker) — until then it observes but can't send. Redeploy: `cd watchdog-monitor && npx wrangler deploy`. **Watchdog (2026-06-23):** `telegram.test.js` — added missing SP `@username` assertion to `STATUS → Canceled` test; all 6 notification types now verified. Implementation was already correct; test coverage gap only (no deploy needed). **Watchdog (2026-07-14) — robustness hardening pass (66 tests):** (1) **Rolling actionable filter** `isActionable()` (flight date ≥ today Bangkok) replaced the fixed `NOTICE_CUTOFF_MS` (went stale, let 2-day-old flights notify); separate from the snapshot window. (2) **Bad-feed guard** `isAnomalousDrop()` holds a run (no snapshot write/notify) on a sudden >50% flight-count drop (truncated/empty feed), up to 3 runs then accepts. (3) **Day-sharded logs** (`watchdog:log:YYYY-MM-DD`) — the change that makes CHANGE runs safely under CPU budget (was R-M-W'ing a 1.5 MB month blob); `getLog` merges via `KV.list()` + legacy blob/shards. (4) **Skip-on-unchanged** `extractFeedSig()` (fetchedAt+length) skips the 1.4 MB parse when the feed is byte-identical. (5) **Bounded sends** `planNotifications()` caps each dest at `MAX_SENDS_PER_DEST`=8, else one summary (wall-clock guard for mass changes / AP127 re-enable). (6) `/status` adds `staleMinutes`+`healthy`+`feedSig`+`anomalyStreak`. Deploy needs a windowed baseline written to KV first. **Watchdog (2026-07-14) — window bounded both sides** (`SNAPSHOT_LOOKBACK_MS`=3d / `SNAPSHOT_LOOKAHEAD_MS`=14d); Free plan confirmed (can't raise `cpu_ms`), so no daily full-history check. **Watchdog (2026-07-13):** fixed recurring **"Exceeded CPU Limit"** silent death — the scheduled run was hard-killed every tick (cron fired, but the run exceeded CPU budget before notifying/erroring, so `/status.lastError` stayed null while notifications silently stopped). Cause: parsing the full ~1.4 MB feed (4222 flights, 3 mo history) + ~1.1 MB snapshot every run as data grew. Fix in `watchdog/src/index.js`: `withinSnapshotWindow()` restricts snapshot/diff to a rolling forward window (today−2 d) → snapshot ~95 % smaller (1.1 MB→50 KB), CPU capped. Diagnose with `npx wrangler tail` (shows `"*/5 * * * *" - Exceeded CPU Limit`); a plain redeploy gives a temporary fresh isolate. **NOTE:** `/status` legitimately looks stale up to **25 min** even when healthy (status-write skipped on quiet ticks) — only a >30 min gap = real death. 45 watchdog tests. Dead-man's-switch monitor still unbuilt (recommended).

## Key facts — things that trip up new sessions
- **Watchdog was silently down for 19h (2026-07-20T07:55Z → 2026-07-21T02:50Z) — recovered by plain redeploy.**
  Same CPU-hard-kill signature as prior incidents. The dead-man's-switch monitor detected it correctly
  (`alertedDown:true`) but **still cannot send Telegram alerts — its `TELEGRAM_BOT_TOKEN` secret has never
  been set.** This is a REPEAT ask: `cd watchdog-monitor && npx wrangler secret put TELEGRAM_BOT_TOKEN`
  (same value as the main watchdog). Until set, every future outage repeats this same silent blind spot.
  See AP127_Docs §10 (2026-07-21 entry) for full incident detail, including a known side effect (flight
  changes on the outage's calendar day can go permanently unnotified once the date rolls past — open decision,
  not yet fixed).
- **KV free-tier limit is per-ACCOUNT, not per-namespace (2026-07-17).** The 1,000 writes/day ceiling is shared
  across all 4 namespaces (`ap127-watchdog`, `AP127_STUDENT_DATA`, `AP127_CHAT_KV`, +preview). The watchdog's
  `/cf-usage` now queries **account-wide grouped by namespace** (`kv.*` = account totals, `kvByNamespace[]` =
  attribution) — it previously hardcoded the watchdog namespace and under-reported by ~2×. Measured normal day:
  writes 48% (watchdog ~221 + `AP127_STUDENT_DATA` ~220 [DB_Share, private/no local dir] + chat ~40); reads 1%.
  Constrained dimension is **writes**. See AP127_Docs §6.9/§10.
- **Check `<script>` type per file before editing** — `view-overview.js` uses `type="text/babel"`; `shell.js`, `view-watchdog.js`, `view-cf-usage.js`, `view-crosscheck.js` are plain `<script>`. Run the grep above to confirm.
- Cache-bust = bump `?v=pNN` on ALL `<script>` tags — use find-replace in `index.html`, NOT `?cb=`
- Drive views in preview: `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'viewId'}))` (not hash change)
- Read `REVAMP.md` change log before making changes — avoids duplicating or breaking prior work
- Watchdog worker redeploy: `cd /Users/nugui/AP127_V2/watchdog && npx wrangler deploy`
- **Watchdog CORS (2026-07-10):** `watchdog/src/index.js` `ALLOWED_ORIGINS` now includes BOTH
  `https://ap127-ngt2.pages.dev` (default/primary, unchanged) and `https://ap127-v3.pages.dev` — CMDV3
  built its own Watchdog admin view consuming this worker's existing API unchanged. If adding more
  consumers later, extend the Set the same way; `DEFAULT_ORIGIN` stays V2's URL as the ACO fallback.
- **CI (2026-06-29):** `scripts/refresh_snapshots.mjs` isolates each of the 3 upstreams — a transient blip (e.g. ap127-data-api 50-byte response) keeps the prior snapshot and continues; only a total outage fails. `refresh-data.yml` push is race-proof (retry + `rebase -X theirs`). Do NOT make a single source's failure fatal again.
- **Watchdog "Exceeded CPU Limit" crash-loop (2026-07-11):** every 5-min cron tick was hard-killed by the CF runtime (silent — no catchable JS exception, so `lastError` in `/status` never shows it) following the CMD_CTR Ops Portal migration (see CMD_CTR/CLAUDE.md, AP127_Docs §10). Root cause never fully pinned down — ruled out diff/event-volume (reset `watchdog:snapshot` in KV to match live data, still crashed on a 0-event run) and ruled out any single computation step (added temporary per-step `console.log` timing via `wrangler tail`; every step measured sub-millisecond to a few hundred ms of I/O wait). A plain `wrangler deploy` (fresh isolate, no code change) resolved it — confirmed stable across 3 consecutive clean ticks. Likely an isolate-level issue tied to the stale, unusually-long-lived worker instance rather than the new code/data itself.
  - **If this recurs:** don't assume it's diff-size-related again — instrument with per-step `console.log(Date.now())` timing + `wrangler tail`, and try a plain redeploy (no code change needed) before spending time on data-volume theories.
  - **Also did:** manually reset `watchdog:snapshot` in KV (namespace `b42f3202c5364f91aef3837132d6ccd5`) to match CMD_CTR's live `flight-data.js` at the time, since it had gone stale during the 18-hour CMD_CTR outage — this wasn't the actual fix, but was a reasonable precaution regardless (avoids ever re-diffing that stale window).

## Master reference
Full architecture, deploy steps, secrets: https://ap127-docs.pages.dev  (§2.4)
