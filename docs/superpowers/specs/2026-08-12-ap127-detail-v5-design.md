# AP127 DETAIL V5 — product spec + implementation & test plan

> **Status: implemented and shipped (p164, 2026-08-12).** This is the design doc as approved
> before implementation; the actual build followed it closely. See `REVAMP.md`'s p164 entry for
> what was built, the real bugs found and fixed during live verification (not covered by this
> doc, since they were only discovered while implementing/testing), and the verification evidence.

## Context

`AP127 Detail V4` (`js/view-cohort-v4.js`, 3,234 lines, tab id `cohort-v4`) has grown by ~25 rounds of
incremental feedback since 2026-08-02. Each round added a panel, a toggle or a chart. Nothing was ever
removed or re-integrated, so the tab is now 16 stacked panels / 13 Chart.js instances / 2 huge DOM
heatmaps, all built eagerly on mount, each with its own private control vocabulary.

The user's report:

| Problem | Confirmed root cause (from code, see §2) |
|---|---|
| Laggy when scrolling | ~10,400 DOM cells in 2 heatmaps with `position:sticky` columns, 13 live canvases, 4-layer `background-attachment:local` gradients, O(n²) recompute in hot paths |
| Duplicated charts & info | 4 charts plot the same actual-vs-plan comparison; 2 panels are both SP×calendar-day; 3 panels are all SP×lesson-number; "vs plan today" appears in 3 places |
| Bad layout / confusing UX | No hierarchy — 16 equal-weight panels in one 15,000px scroll; 9 independent per-panel toggle sets with inconsistent labels |
| No chart-to-chart consistency | Hours/Lessons toggled separately in 4 panels; range selected separately in 2; student filter shared by only 2 of 5 per-SP charts |
| Admin can't customise after publish | Layout is a hardcoded `MARKUP` template string |
| PDF doesn't look like the page | `ap127ExportPDF()` hand-lays out a *different* document in jsPDF primitives; heatmaps fall back to text tables because html2canvas 1.4.1 can't parse this app's `oklch()`/`color-mix()` |

**Outcome wanted:** a new tab `AP127 DETAIL V5` that keeps every important capability and every number,
but with a designed information architecture, one consistent control system, fluid scrolling, an
admin-editable dynamic layout, animated "what matters now" storytelling, and a PDF that is literally
the page.

**Hard constraints (from the user):** don't break any current system · keep all main important
features · all data and calculations must be accurate.

---

## 1. Non-negotiable isolation rules

`js/shared.js`, `js/view-cohort-v4.js` and `css/progress.css` are **live-proxied by DB_Share**
(`ap127-dashboardr1.pages.dev` fetches them from this site on every page load — see CMDV2
`CLAUDE.md`). Therefore:

* **Do not touch** `js/view-cohort-v4.js`, `js/shared.js`, `css/progress.css`. Not one byte.
  Verified after every commit with `git diff --stat` on those three paths.
* V5 CSS goes in a **new** `css/cohort-v5.css` scoped under `.ap127-v5`, never in `progress.css`.
* V5 reads the app context read-only via `window.useData()` — no new fields added to `AppProvider`.
* All V5 globals suffixed `V5`, all DOM ids prefixed `d127v5-`, own IIFE. Enforced by a grep check
  (same technique used when V4 was split off V3).
* V5 loads as a **plain `<script>`** (no `type="text/babel"`) — skips runtime Babel entirely, unlike
  V4. Follows the existing `view-program.js` / `view-watchdog.js` precedent.

Files changed outside V5's own new files: `index.html` (script tags + `?v=p164` bump),
`js/shell.js` (one nav entry + one registry key). Neither is proxied by DB_Share.

---

## 2. What the study found (evidence, not guesses)

### 2.1 V4 panel inventory (16 panels, 13 charts, 2 DOM heatmaps)

Title/badge/Export · sticky toolbar (time-travel scrubber, search, sort, as-of) · KPI×4 ·
Pace Monitor (3 cards + 2 tables + action banner) · split grid [Progress Ranking 13-col table |
Pace Distribution, Needs Attention, Recent Flight, Lesson Codes] · Combined Progress vs Plan ·
Batch Lagging History · Daily Output · Actual vs Planned · Consecutive & Idle Streaks ·
Individual Lead/Lag vs Plan · Flight Timeline vs Progress · Overall Progress Bar View (+SYLLABUS
strip) · Lesson Completion Matrix · Phase Progress Funnel · AP127 Roster (heatmap + by-instructor).

### 2.2 Duplication map — the basis for the redesign

| # | V4 panels | What they actually are | V5 |
|---|---|---|---|
| A | Combined Progress vs Plan · Batch Lagging History · Actual vs Planned · Individual Lead/Lag vs Plan | All four = cumulative actual vs cumulative plan. Differ only by **aggregate/per-SP** and **level/delta**. | **1 chart**, `Batch\|Per-SP` × `Level\|Gap` |
| B | Flight Timeline vs Progress · AP127 Roster heatmap | Both = SP rows × calendar-date columns, phase-coloured | **1 Activity Calendar** (canvas) |
| C | Overall Progress Bar View · Lesson Completion Matrix · Phase Progress Funnel | All three = SP × lesson-number space; funnel is the column-sum of the matrix | **1 Curriculum Grid** (canvas), `Bars\|Cells` + phase-completion footer on the same axis |
| D | KPI×4 · Pace cards · `cpv-kpis` (6) · `hist-batch-kpis` (3) · `lb-kpis` (4) = 20 tiles | "vs plan today" appears 3×, "hours done" 4× | **6 headline tiles** + per-panel context line |
| E | Recent Flight · Lesson Codes legend | Already columns in the ranking table / static reference | Folded into table + `ⓘ` popover |
| F | Needs Attention · IDLE DAYS column · Cons & Idle chart | Idle surfaced 3× | Watchlist (action) + column (data) + streak chart kept, cross-linked |

16 panels → **10**. 13 Chart.js instances → **6 Chart.js + 2 purpose-built canvases**.

### 2.3 Confirmed performance root causes

1. **Lesson Completion Matrix** — 28 SP × 96 lessons = 2,688 cells, each `<td>` + `<div>` with inline
   style + `title` ⇒ ~5,400 nodes (`view-cohort-v4.js:2568`).
2. **Roster heatmap** — 28 × up-to-115 days ⇒ ~5,000 nodes, and its inner loop runs
   `(s.flown||[]).filter(f=>f.date===d)` per cell = O(SP × days × flights) ≈ 90k comparisons per
   rebuild (`:2704`).
3. **Sticky columns inside those tables** (`.d127v4-lm-name/-vs`, `.d127v4-heat-name/-total`) —
   sticky cells in multi-thousand-cell tables force compositor work on every scroll frame. This is
   the specific mechanism behind "laggy when scrolling".
4. **`.d127-table-wrap`** uses 4 stacked gradients with `background-attachment:local` — a known
   scroll-repaint cost (`css/progress.css:32`).
5. **`ap127Hours(s)` rebuilds the 96-entry `lessonsMap` on every call** (`:419`) and is called from
   the sort comparator, 3 aggregate reducers and every table row ⇒ 100+ map builds per render.
   `buildAP127Watchlist` similarly re-runs `ap127PlannedHoursAsOf()` per student (`:2544`).
6. **13 canvases + 2 heatmaps all built on mount**; nothing is lazy. Tall canvases
   (`timeline` = `max(420, n*22)`, `overall` similar).
7. `App`'s `resize` listener calls `setW`/`setHt` un-debounced (`js/shell.js:587`) ⇒ full React
   re-render + 13 chart resizes per resize event.

*(Node counts are derived from the code. Phase 0 records a real Chrome profile as the baseline to
measure V5 against.)*

### 2.4 Accuracy findings — two real, live inconsistencies

**F1 — "Lessons done" means two different things on the same page.**
`s.done` = `flown.length` (`view-cohort-v4.js:2870`, every flight record **including retakes**) and
drives the headline *Batch Progress %*, *Lessons Done / Plan*, the ranking table and `pct`.
The Lesson Matrix instead uses `Object.keys(byLesson).length` (**unique lesson numbers**, `:2590`)
and the Phase Funnel dedups per `(student, lesson number)` (`:2504`) — both fixed precisely *because*
retakes over-counted. Retakes exist in live data (the matrix draws a retake dot; the p151 fix
exists because the funnel exceeded 100%). So V4's headline lesson count is inflated relative to its
own matrix/funnel. `next_lesson` is computed from the *unique* set, so a row can read
`done: 40` next to a next-lesson implying 39 complete.

**F2 — effective hours are credited per flight record, so a retake re-credits a full standard
lesson duration.** `ap127Hours()` (`:419`) sums `lessonsMap[lesson] || actual_mins` over every
record. This contradicts the rule the user already set for Ops Analytics in p143 ("a curriculum
lesson's effective hours count **once per SP**, no matter how many bookings reference it"), so
AP127 Detail and Ops Analytics currently disagree about the same batch's effective hours.

**V5 resolution (deliberate, documented divergence from V4 — V4 stays as-is):** the model exposes
three clearly-named quantities and every panel declares which one it uses.

| Field | Definition | Used by |
|---|---|---|
| `lessonsCompleted` | count of **distinct curriculum lesson numbers** with ≥1 completed record | everything compared against plan/target: KPIs, progress %, ranking, curriculum grid, funnel |
| `flightRecords` | count of completed records incl. retakes | activity/output panels: Daily Output, Activity Calendar, "last flight" |
| `hoursEffective` | Σ standard duration over **distinct lessons** (retake credits once) | everything compared against planned hours |
| `hoursLogged` | Σ standard-or-actual duration over **all** records | shown in the SP drawer + a footnote, so no training time is hidden |

Retakes get their own visible KPI (`N retakes across M SP`) instead of being silently folded in.
This is the single behavioural difference the V4↔V5 parity harness (§7.3) is expected to report;
every other number must match V4 to 0.00.

---

## 3. V5 design

### 3.1 One global control rail (the core UX fix)

V4 has 9 independent per-panel control sets. V5 has **one** sticky 44px command bar; panels only
keep options that are genuinely local.

```
AP127 PROGRESS V5   [HOURS|LESSONS]  [BATCH|PER-SP|◉ SP…]  [30D|90D|ALL|⋯]  [⏱ 12 Aug ▾]  [🔍]   ▶ Story  ⚙ Customise  ⤓ PDF  🖨 Print  ⟳
```

* **Unit** (Hours/Lessons) — global; replaces 4 separate toggles.
* **Scope** (Batch / Per-SP / single SP) — global; replaces the 2 ad-hoc student-toggle blocks and
  drives the whole page (single-SP scope turns V5 into an SP profile view).
* **Range** — global; replaces the Roster range `<select>` and Daily Output date pair.
* **Time machine** — the V4 scrubber moves into a popover (it currently occupies permanent vertical
  space); an amber bar appears only when not live. Same `setCohortAsOf` semantics.
* **Search** — filters the roster table only, 120ms debounce (as V4 p142 already established).
* Per-panel toolbars keep only: period grain (Day/Week/Month), `Level|Gap`, `Bars|Cells`,
  `By Type`, `By Instructor`, zoom reset. Rendered by **one shared `PanelToolbar` component** so
  every chip looks and behaves identically.

State lives in one `V5_STATE` object; a single `applyState(changed)` re-renders only the panels
that declared a dependency on the changed key. No panel reads a DOM control directly (V4's
`document.getElementById('d127v4-sort').value` pattern is what makes its state untraceable).

### 3.2 Five sections (deep-linked sub-routes, lazily mounted)

`#/cohort-v5/pulse` … `/trend` `/people` `/syllabus` `/calendar`. Only the active section is
mounted ⇒ at most 4 live charts.

**① PULSE — "what is the situation right now"**
* **Insight Reel** (new, animated — §3.3): auto-advancing hero cards, each = one sentence + one
  small animated chart + a deep link.
* **6 KPI tiles** with count-up animation and a 30-day sparkline: Progress %, Hours Δ vs plan,
  Lessons Δ vs plan, Δ vs Target today, At-risk SP, Days to plan end. Each tile is a link to the
  panel that explains it.
* **Pace vs Target** — one table (not two), rows Month/Week/Day, columns Req / Act / Gap, with a
  `Per-SP | Batch` switch driven by global Scope. Gap cells carry an inline bullet bar. One
  "Required Action" line. Same `ap127RequiredPace()` / `ap127ActualPace()` math, ported verbatim.
* **Watchlist** — compact, sorted by severity, click → SP drawer. Label fixed to match its rule
  (`idle ≥ 5d`, V4 says ">5d").

**② TREND — "how did we get here, where are we going"**
* **Progress vs Plan** — the merged chart (dup-map row A). `Level` = cumulative Actual / Plan /
  Target / Projection (30d + 15d) / Total; `Gap` = actual − plan, with a *lag-only* sub-option
  floored at zero (V4 p162's requested behaviour, preserved as a mode instead of a whole panel).
  `Batch` = 1 line + references; `Per-SP` = 28 thin lines with the global scope/search dimming and
  a "spotlight" hover. Shared time axis, shared zoom, shared tooltip format.
* **Output** — Daily Output bars + moving average + target/gap overlay on the latest *closed*
  period + open-period projection + `By Type` (Dual/Solo/Sim) stack. All V4 p145–p154 behaviour
  kept; range/unit now come from the global rail.
* **Streaks** — Consecutive & Idle, kept (distinct y-meaning), with its staggered-enrolment note.

**③ PEOPLE — "who needs what"**
* **Roster table** — V4's 13-column Progress Ranking with: sticky header, admin-configurable column
  set, inline progress bar, sortable headers (keyboard + `aria-sort`, already in V4), a totals row
  consistent with the filter, and `Δ vs target` added (currently only reachable via the matrix).
* **Distribution** — Pace Distribution histogram + smoothed curve + average marker (V4's fixed
  bin-interpolation math ported verbatim), with a spread readout (min/median/max/IQR) replacing
  the separate "at/above avg" sentence.
* **SP drawer (upgraded)** — KPI row, per-SP mini progress-vs-plan chart, lesson log with retake
  markers, next 3 planned lessons, `hoursLogged` vs `hoursEffective` reconciliation, link to
  Student Lens.

**④ SYLLABUS — curriculum space**
* **SYLLABUS strip** (kept: phase blocks, milestone icons, click-to-detail modal, narrow-label
  handling, target line, zooms with the grid).
* **Curriculum Grid** (canvas; dup-map row C) — rows = SP, x = lesson 1…96, `Bars | Cells`:
  *Bars* = V4's stacked phase bar per SP; *Cells* = V4's completion matrix. Same axis, same strip,
  same zoom ⇒ the two views are now provably aligned instead of two panels the eye has to match.
  Footer band on the same axis = **phase / per-lesson batch completion %** — this is the Phase
  Funnel, integrated rather than separate. Target checkpoint columns flagged; next-lesson ring;
  retake dot; `vs L{closest target}` pinned column.

**⑤ CALENDAR — activity in time**
* **Activity Calendar** (canvas; dup-map row B) — rows = SP, x = calendar date over the global
  range; cells phase- or type-coloured; >7-day gaps drawn as a red rule (V4 timeline's signal);
  month separators; today column; target checkpoint dates as vertical rules; per-row totals
  (`N L · H h`); `Group by: none | instructor` (absorbs V4's "By Instructor" list, which is the same
  data as a grouped total).

### 3.3 Animated chart feature

Three concrete animations, all opt-out and `prefers-reduced-motion` aware
(`css/theme.css` already kills CSS animation under that query; JS-driven Chart.js animation is
gated on the same media query and jumps to the end state instead).

1. **Insight Reel** (Pulse hero). Deterministic, data-derived, no hardcoding. Ten generator
   functions each return `{score, headline, detail, spark, deepLink} | null`; top 5–6 by score are
   shown, auto-advancing every 6s, pause on hover/focus, ←/→ keys, progress dots, "pin".
   Generators: lag trend vs 7d ago · Δ vs target checkpoint (and how many SP behind) · idle ≥7d
   alert · best/worst period in the last 8 weeks · bottleneck lesson (lowest batch-% with SPs
   waiting) · phase crossings this week · milestones passed in 14d (first solo, checkrides) ·
   required-pace change vs 30d ago · at-risk count change · Dual/Solo mix shift.
   Each card's mini chart animates in over 600ms (the one place animation is on by default).
2. **Replay** (`▶ Story`). Drives the existing time-travel As-Of through batch-start → today at
   ~20fps from precomputed frames; the visible section animates with it (KPIs count, the Progress
   chart draws forward, the roster re-sorts, the calendar fills). Auto-pauses ~1.2s at each **key
   point**: target checkpoints, phase transitions, first solo, each checkride, the worst lag day —
   with a caption. Scrub bar + speed 0.5×/1×/2×. Only the mounted section is animated.
3. **KPI count-up + delta flash** — 400ms tween on value change, green/rose flash on the delta.

### 3.4 Admin customise + dynamic layout

Everything renders from a **layout config object**, so "customise" and "dynamic layout" are the same
mechanism:

```js
{ version:1, preset:'default',
  density:'comfortable'|'compact', chartScale:0.85..1.3,
  defaults:{ unit:'hours', scope:'batch', range:90, section:'pulse' },
  kpis:['progress','hoursDelta','lessonsDelta','vsTarget','atRisk','daysLeft'],
  columns:['rank','name','nick','se','fi','progress','hours','lessons','last','idle','dayDelta','hrsDelta','vsTarget'],
  sections:[ { id:'pulse', label:'Pulse', visible:true,
               panels:[ {id:'reel', span:12, visible:true, opts:{autoplay:true}}, … ] }, … ] }
```

**Customise mode (`⚙`)** — a right-hand editor drawer + on-canvas affordances:
drag to reorder panels · drag panel edge to set span (12-col grid: 12/8/6/4) · eye icon to hide ·
per-panel "opens with" defaults · rename section labels · toggle section visibility · pick KPI tiles ·
pick roster columns · density/chart-scale sliders · live preview, `Cancel` / `Apply`.

**Persistence — honest about the static host** (same pattern as `js/ap127-targets-data.js`, and the
same reasoning: this app is a static Cloudflare Pages deploy with no writable backend):
1. `localStorage['ap127v5Layout']` — instant, browser-local, with a local revision log.
2. **Share link** — `?v5layout=<base64url(JSON)>`; a read-only viewer opens with that layout. Lets
   an admin hand a tailored view to the Director or to instructors with no deploy.
3. **Export default for commit** — pretty-prints the config as a ready-to-paste
   `window.AP127_V5_LAYOUT_DEFAULT` for `js/ap127-v5-layout.js`, with copy button + instructions.
   Committing that file is what makes a layout the *published* default for everyone. Git history on
   that file is the durable revision record.
4. **Named presets** shipped in code: `Default` · `Director brief` (Pulse + Trend, big type, fewer
   panels) · `Instructor daily` (People + Calendar) · `Full detail` (everything, V4-equivalent
   coverage) · `Report` (the PDF composition). `⟳ Reset` restores the committed default.

Guardrails: schema `version` + validator; unknown panel ids ignored (forward-compatible); a config
that hides everything is rejected; a "Layout differs from published default" chip appears when a
local override is active, so nobody debugs a layout they forgot they changed.

### 3.5 PDF that looks like the page

One **Report Sheet** builder feeds both output paths, so there is only ever one composition to keep
in sync with the screen:

`buildReportSheet(layout, model)` → a real DOM subtree, `.ap127-v5 .v5-report`, **fixed 703px content
width** (A4 210mm @96dpi minus 12mm margins), single column, every panel expanded, charts re-rendered
into fresh canvases at report width and a fixed height (never squeezed or cropped), tables full-width
with repeating headers. Shown to the user first as an on-screen **Report Preview** — so "same look as
the page" is verifiable before exporting.

* **🖨 Print / Save as PDF (recommended, vector)** — the preview is the print target;
  `@page{size:A4;margin:12mm}`, `break-inside:avoid` per block, `thead{display:table-header-group}`,
  running header/footer via fixed positioned elements. Result: selectable text, ~200–400KB, exact.
* **⤓ Download PDF (one click, raster)** — JS packs measured blocks into page-height groups (never
  cutting a block), then one `html2canvas` capture per page at `scale:1.75` → one jsPDF A4 page per
  image. Budget ≤ 5MB for the default layout; a `High quality` option raises scale to 2.5.

**The oklch problem, solved without new dependencies.** V4's export breaks because html2canvas 1.4.1
can't parse `oklch()`/`color-mix()`, which this app's palette is built from. The report sheet is
therefore rendered with a **self-contained, hex-only palette snapshot** taken at export time:
`resolveColorToRgb(cssColor)` paints the value into a 1×1 canvas (`ctx.fillStyle = value;
fillRect; getImageData`) and reads the pixel back — the browser does the conversion, so any CSS
colour it understands becomes concrete `rgb()`. Every `--v5r-*` var on the report sheet is set from
that snapshot, and the sheet's own stylesheet contains **zero** `oklch()`/`color-mix()` (enforced by
a grep test + a runtime computed-style scan). This makes the raster path reliable *and* keeps the
report matching the current theme.
Report theme option: **Light (default, ink-friendly)** or **Match screen**. Report `chartScale`
re-renders charts with light-theme axis/grid colours in light mode.

Report contents (in layout order, admin-controlled — the layout config *is* the report outline):
cover band (batch, as-of, live/time-travel, generated at, feed freshness, `HOURS = EFFECTIVE`
convention, self-check verdict) → executive summary (KPI grid + Required Action + top 3 insights as
static text) → every visible panel. Wide panels (Curriculum Grid 96 cols ≈ 7.3px/col, Activity
Calendar) are **fit to report width**, not cropped or landscape-rotated as in V4; a calendar range
wider than ~120 days splits into stacked month blocks. Page numbers + running footer throughout.

### 3.6 Performance architecture ("fluid browsing")

| Fix | Target problem |
|---|---|
| Section routing + `IntersectionObserver` lazy panel mount (skeleton with reserved height, no layout shift) | 13 eager charts |
| `content-visibility:auto` + `contain-intrinsic-size` + `contain:layout paint` on every panel | offscreen paint cost |
| The 2 heatmaps become **2 canvases** (draw once; hit-test by pointer coords for tooltip/click) | ~10,400 DOM nodes → ~0; kills the sticky-column scroll cost with them |
| Frozen pinned-column *overlay* canvas instead of `position:sticky` cells | scroll compositing |
| Drop the 4-layer `background-attachment:local` gradient; single pseudo-element shadow | scroll repaint |
| **One memoised model** computed once per (students, curriculum, asOf, range) — no panel recomputes `lessonsMap`, sorts or date ranges | the 100+ `lessonsMap` rebuilds and O(SP×days×flights) loops |
| Pre-indexed lookups: `flownByDate`, `flownByLessonNum`, `datesIndex` | per-cell `.filter()` |
| Chart.js: `normalized:true`, `parsing:false` with pre-sorted `{x,y}`, `pointRadius:0` on dense series, built-in `decimation` (lttb) for the 28-line charts, `devicePixelRatio` capped at 2, `animation:false` except reel/replay, `resizeDelay:120` | 28-series render cost |
| Debounced (150ms) local resize handling inside V5; V5 does not re-render on every window resize event | `shell.js` resize storm (left unmodified) |
| Single scroll container, `overscroll-behavior:contain`, no nested scrollers except intentional table wraps | scroll chaining |
| Staged mount via `requestIdleCallback` (KPIs → hero → rest) | time to first meaningful paint |

**Budgets (measured, in the test plan):** first meaningful paint ≤400ms · section switch ≤150ms ·
search keystroke → table ≤30ms · ≤4 live Chart.js instances · V5 tab DOM ≤2,500 nodes ·
3s continuous scroll with ≤2 frames >16.7ms.

### 3.7 Accuracy architecture

1. **`js/ap127-v5-model.js`** — the only place any AP127 number is computed. Every formula is ported
   **verbatim** from V4 (with the V4 line number in a comment) except the two F1/F2 changes in §2.4,
   which are commented with their reasoning. Pure functions, no DOM reads, memoised on
   `(studentsRef, curriculumRef, asOf, range)`.
2. **Self-Check panel** (collapsible footer on V5, also printed in the report header): runs a set of
   invariant assertions and shows PASS/FAIL with the actual numbers, so the user can audit without
   reading code —
   Σ per-SP hours = batch hours (±0.01) · Σ per-SP lessons = batch lessons ·
   per phase: done + remaining = slots and done ≤ slots · KPI hours = roster total = trend chart's
   "Done" = pace-monitor base · last lag value = −(hours Δ) floored at 0 ·
   `lessonsCompleted ≤ curriculum length` per SP · range totals ⊆ all-time totals ·
   every lesson code resolves to a phase (no "Other") · target interpolation monotonic ·
   `flightRecords − lessonsCompleted = retakes`.
3. **V4↔V5 parity harness** — `ap127V5ParityV5()`, dev-only, run in the console during
   verification: renders V4, scrapes its DOM numbers, compares against V5's model, prints a diff
   table. Expected result: every row 0.00 except the documented F1/F2 rows.

---

## 4. Files

**New**
* `js/ap127-v5-model.js` — metrics model + invariants (plain script, loaded before V5).
* `js/ap127-v5-layout.js` — `AP127_V5_LAYOUT_DEFAULT` + presets + validator + share-link codec.
* `js/view-cohort-v5.js` — shell, command bar, section router, panel registry, panels, customise
  mode, insight reel, replay, report sheet, print + PDF export.
* `css/cohort-v5.css` — `.ap127-v5` scope (own hex palette), grid, panels, report/print rules.
* `docs/superpowers/specs/2026-08-12-ap127-detail-v5-design.md` — this design, committed.

**Modified**
* `index.html` — 4 new script/style tags; bump every `?v=p163` → `?v=p164`.
* `js/shell.js` — `{ id:'cohort-v5', label:'AP127 Detail V5', icon:'◆' }` in the Progress group +
  `'cohort-v5': window.CohortViewV5` in `registry()`.
* `REVAMP.md`, `CLAUDE.md`, `/Users/nugui/AP127_Docs/README.md` §2.4 + §10 (project update rule).

**Panel registry contract** — the abstraction that makes dynamic layout, lazy mount and the report
sheet fall out of one design:

```js
registerPanelV5({
  id, title, section, defaultSpan, minSpan,
  deps: ['unit','scope','range','asOf'],   // which state keys force a rebuild
  estHeight,                                // for skeletons / contain-intrinsic-size
  toolbar: (state) => [...chips],
  mount:  (el, model, opts, state) => handle,
  update: (handle, model, opts, state) => void,
  destroy:(handle) => void,
  report: (el, model, opts, state, palette) => void,   // report-width render
});
```

---

## 5. Implementation plan (phased, with review checkpoints)

**Phase 0 — baseline & scaffold**
Record a real Chrome profile of V4 (DOM node count, long-frame count on a 3s scroll, mount time,
chart count) and write it into the spec as the number V5 must beat. Create the 4 new files, add the
tab; V5 renders an empty shell with the command bar. *Checkpoint: baseline numbers agreed.*

**Phase 1 — model + accuracy (no UI)**
Port every formula verbatim, build the indexes, implement F1/F2, write the Self-Check panel and the
parity harness. *Checkpoint: parity harness output reviewed — all rows 0.00 except documented F1/F2.*

**Phase 2 — shell**
State container + `applyState`, section router with hash deep-links, 12-column dynamic grid from the
layout config, lazy panel mount, `PanelToolbar`, skeletons, SP drawer. Two trivial panels wired to
prove the registry.

**Phase 3 — panels, one section per sub-step**
Pulse (KPIs, Pace vs Target, Watchlist) → Trend (merged Progress chart, Output, Streaks) → People
(roster table, distribution, drawer) → Syllabus (strip + Curriculum Grid canvas + integrated phase
footer) → Calendar (Activity Calendar canvas). *Checkpoint after each section: numbers cross-checked
against V4 on the live page, side by side.*

**Phase 4 — animation**
Insight-reel generators + card UI, Replay engine with key-point stops, KPI count-up. Reduced-motion
paths.

**Phase 5 — customise & dynamic layout**
Customise drawer, drag reorder/resize, hide/show, KPI + column pickers, presets, localStorage +
revision log, share-link codec, "Export default for commit", validator + guardrails.

**Phase 6 — report, print, PDF**
`resolveColorToRgb` + palette snapshot (build and verify this first — everything else depends on it),
report sheet builder, on-screen preview, print stylesheet, block packing + raster download.

**Phase 7 — performance, mobile, a11y**
Measure against every §3.6 budget and fix until met. 390px layout pass (sections become a scrollable
chip row; grid collapses to 1 column; canvases scroll horizontally inside their own container with
no page-level overflow). Keyboard nav, `aria-sort`, focus rings, reel pause on focus.

**Phase 8 — ship**
`?v=p164` bump on every tag, REVAMP.md entry, CLAUDE.md Verify section, AP127_Docs §2.4 + §10 push,
commit + push, DB_Share regression check.

---

## 6. Test plan

### 6.1 Accuracy (the constraint the user named first)
* **Parity harness** (§3.7.3): every shared metric matches V4 to 0.00; only F1/F2 rows differ, each
  explained in the output.
* **Self-Check panel**: all invariants PASS on live data, on a time-travelled As-Of, on a
  zero-match search, and on each global range.
* **Hand verification** of one SP end-to-end: pick a student with a retake, compute
  `lessonsCompleted`, `flightRecords`, `hoursEffective`, `hoursLogged` by hand from
  `window.PROGRESS_DATA`, and confirm each appears in the right place with the right label.
* **Cross-tab check**: V5's effective hours for AP-127 now agree with Ops Analytics' post-p143 rule;
  record the number and confirm the direction of any residual difference is explainable.
* Edge cases: never-flown SP (no `9999`-day artefacts leaking into averages) · zero-match search ·
  As-Of before the batch's first flight · As-Of past plan end (overdue path) · empty curriculum.

### 6.2 Performance
Chrome DevTools Performance, on the live-equivalent local build, V4 vs V5 back to back:
DOM node count (`document.querySelectorAll('*').length` scoped to the tab) · mount time · long-frame
count over a scripted 3s continuous scroll · live `Chart.instances` count · section-switch time ·
`performance.measure` on search keystroke → table paint. Each compared against the §3.6 budget and
the Phase 0 baseline. Also: 6× CPU throttle sanity run.

### 6.3 PDF / print — "same look" verified, not asserted
Reuse the p163 technique (intercept `doc.save()`, capture `output('datauristring')`, decode to a real
`.pdf`, inspect with `pdfinfo`/`pdftoppm`) plus:
* **Visual equivalence**: screenshot the on-screen Report Preview, render the corresponding PDF page
  to PNG, compare with `compare -metric RMSE`. Threshold: RMSE < 3% per page.
* Single-column, page-width layout confirmed on every page; no block cut mid-element; no panel
  clipped; Curriculum Grid and Activity Calendar fully visible.
* File size ≤5MB default / vector print path ≤500KB with selectable text (`pdftotext` non-empty).
* Report reflects live UI state: active search filter, sort, time-travel As-Of, custom range, chosen
  layout preset, hidden panels absent.
* Runs with the report sheet's palette snapshot in both Light and Match-screen mode, and in all three
  app themes — with a runtime assertion that no computed colour on the sheet contains `oklch`/`color-mix`.

### 6.4 Regression / don't-break-anything
* `git diff --stat js/view-cohort-v4.js js/shared.js css/progress.css` → **empty**, checked before
  every commit.
* Load V4 live and exercise it fully (sort, search, scrubber, every toggle, drawer, Export PDF) —
  unchanged behaviour, zero new console errors.
* **DB_Share**: load `https://ap127-dashboardr1.pages.dev` after deploy and confirm it still renders
  (it live-proxies the three untouched files).
* Every other CMDV2 tab loads with zero new console errors (V5 adds globals; verify no collision via
  a scripted `window` key scan, the same check used when V4 was created).
* Both V4 and V5 mounted in one session: no shared DOM ids, no cross-talk on As-Of, no chart-instance
  theft (`Chart.getChart` targets distinct canvases).

### 6.5 Layout / customise
Reorder + resize + hide, reload → restored · share link opens with the encoded layout · export
produces a valid pasteable default · `⟳ Reset` clears the override · malformed/hostile
`?v5layout=` rejected safely · unknown panel id in a saved config ignored, rest still renders ·
"differs from published default" chip appears and clears correctly.

### 6.6 Animation / a11y / mobile
Reel auto-advances, pauses on hover/focus, arrow keys work, deep links land on the right panel ·
Replay runs, pauses at every key point, scrub + speed work, cancels cleanly on section change ·
`prefers-reduced-motion:reduce` → no motion, end state shown · 390px pass with zero horizontal page
overflow · keyboard-only traversal of the roster table and command bar · visible focus rings.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Canvas heatmaps lose per-cell `title` tooltips and click targets | Custom hit-testing from pointer coords against the model's index; verified click-through to the SP drawer on both canvases before the DOM versions are dropped |
| Raster PDF too heavy | Print/vector path is the recommended default; raster budgeted at scale 1.75 with a measured ≤5MB gate |
| F1/F2 change makes V5's headline numbers differ from V4's | Deliberate and documented; surfaced in the parity output and in a footnote on the page; V4 untouched so the old numbers remain inspectable side by side |
| Scope creep — V5 must keep "all main important features" | Phase 3 gates on a panel-by-panel coverage checklist derived from §2.1; nothing ships until every V4 capability is either present or explicitly logged as intentionally folded into another panel |
| Accidental DB_Share breakage | The three proxied files are never edited; `git diff --stat` gate + live DB_Share load after deploy |

---

## 8. Decisions I made (stated, not asked)

1. **New tab, new files.** V4 stays byte-identical and stays in the sidebar. V5 is additive.
2. **Sections are sub-tabs inside V5**, not five new sidebar entries — keeps the sidebar as it is.
3. **Global unit / scope / range / as-of** replace per-panel duplicates. This is the single biggest
   consistency change and the main reason V5 feels like one instrument rather than 16.
4. **16 panels → 10**, per the duplication map. Nothing is deleted outright; two reference panels
   (Recent Flight, Lesson Codes) become a table column and an `ⓘ` popover.
5. **Canvas** for the two grid views. This is what actually fixes scroll lag.
6. **Print/vector is the recommended PDF path**, raster download kept for one-click convenience.
   Report theme defaults to **light** because dark PDFs print badly; "Match screen" available.
7. **Layout persistence is localStorage + share link + export-for-commit** — the honest answer for a
   static Cloudflare Pages deploy with no writable backend, matching the AP127 Targets precedent.
8. **Retakes are separated out (F1/F2)** rather than silently folded in, because "all data and
   calculation accurate" cannot coexist with two different live definitions of "lessons done" on the
   same page. V4 is left alone.

## 9. Post-change checklist (project update rule)
`?v=p164` on every tag → REVAMP.md log entry → CLAUDE.md Verify section → AP127_Docs README §2.4 +
§10 entry, commit + push AP127_Docs → commit + push CMDV2 → confirm CF Pages deploy → load V4, V5 and
DB_Share live.
