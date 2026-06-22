# AP127 V2 — Full Revamp Spec & Build Log

> **Single source of truth for the AP127 unified dashboard rebuild.**
> If you are an AI/agent picking this up cold: read this whole file first, then jump to
> **§12 Continuation Log** to see what's done and what's next. Verify any file/feature
> against the actual code before assuming — this doc is the intent, the code is the truth.

- **Target repo:** https://github.com/nuguitar/AP127_V2 (GitHub Pages: https://nuguitar.github.io/AP127_V2/)
- **Local working copy:** `/tmp/ap127_work/AP127_V2` (ephemeral — `git clone` fresh if gone)
- **Preview server:** launch config `ap127v2`, port **7423**, serves repo root (`/Users/nugui/.claude/launch.json`)
- **Source apps:**
  - Operations → https://github.com/nuguitar/AP127_Command_Center (local: `/Users/nugui/flight-schedule-feed`)
  - Progress → https://github.com/nuguitar/AP127_DashboardR1 (local clone in `/tmp/ap127_work/AP127_DashboardR1`)

---

## 1. Goal

One website that does **everything** the two original apps do, plus reconciliation, redesigned
from the ground up for the best possible UX/UI. Target users: **AP127 student pilots** and their
**leaders/instructors**, who need to monitor everything related to the cohort timely and effortlessly.

**Hard requirement: feature parity.** The revamp must not drop a single feature from either
original. §3 is the master checklist — every item must exist (possibly redesigned) in the new app.

**Current state (v1):** an iframe shell stitching the two apps + 2 new pages (Home, Cross-Check).
This works but is not "one website" — three separate codebases, no shared state, no cross-linking
between a student's schedule and their progress. The revamp replaces the iframe stitch with a
**single native React SPA**.

---

## 2. Tech baseline (keep — it's proven & zero-build)

- **No-build React 18** via CDN UMD + **Babel Standalone** (`<script type="text/babel">`). No bundler, no npm.
- **Chart.js 4** (+ date-fns adapter, zoom plugin, hammerjs) via CDN — used by Progress charts.
- Fonts: Inter / Rajdhani / JetBrains Mono / Nunito (Google Fonts).
- Hosting: GitHub Pages (static). Data committed as JS snapshots + live fetch at runtime.
- Global-export module pattern: each file attaches components to `window` (see Command Center).
- Per-file hook aliasing to avoid Babel global collisions (e.g. `const { useMemo: useM_b } = React`).

Why keep it: both originals already use it, GitHub Pages needs no build, and it deploys by `git push`.

---

## 3. MASTER FEATURE INVENTORY (parity checklist)

### 3A. OPERATIONS (from Command Center) — data: `window.FLIGHT_DATA`

**Shared foundation (`js/app-shared.js`):**
- [ ] AppContext/AppProvider state: `date`, `filters{batches,instructors,tails,statuses,search}`, `drawer`,
      `highlightAP127`, `hideOthers`, `tweaks{theme,showSim,showStandby,groupBy}`, `dayFlights`, `flightById`, `isMobile`, `setView`.
- [ ] **3 themes**: `cockpit` (dark blue), `light`, `warm` (amber/black) — full OKLCH token sets, persisted to localStorage.
- [ ] Per-batch color tokens (AP-124/126/127/128/129); AP-127 = pink/316 highlight.
- [ ] **Date calendar popup** — month grid, only scheduled dates selectable, today/selected markers, prev/next clamp to data range.
- [ ] **Date trigger** button (WD / DD / MON + ▾).
- [ ] **FilterBar**: text search (student/lesson/tail/instructor/type), expandable multi-select for BATCH / STATUS / AIRCRAFT (grouped by type, DA40TDI→DA40CS→other) / INSTRUCTOR; each item has "ONLY" + section "ALL" reset; active-count badge; CLEAR.
- [ ] **Focus controls**: ◆ AP-127 highlight toggle + ONLY (hide others) — present in headers and inline settings.
- [ ] **InlineSettings** bar: theme chips, AP-127 focus, hide-others, SIM toggle, STBY toggle, (gantt only) GROUP BY instructor/tail/batch.
- [ ] **Refresh/SYNC** button (hard reload bypassing cache).
- [ ] **LastUpdate** indicator (fetchedAt in Asia/Bangkok, pulsing live dot).
- [ ] **Drawer** (view-only flight detail): status pill, STBY/SIM/AP-127 tags, time/duration, student, instructor, batch, lesson, condition, standby note, A/C type, tail, **actual times** (T/O, LDG, AIR), **T/O·LDG·INST counts**.
- [ ] Atoms: FlightDot, ConditionTag, StatusPill, Tag, StandbyTag, **GndBadge** (tail in maintenance), **LeaveBadge** (person on leave), HighlightBar.
- [ ] Maintenance helper (`MAINT_TAILS`/`isTailMaint` from RESOURCES.isMaint); **leavesOnDate** (from LEAVES range).
- [ ] Mobile detection: `windowW<768 || (windowW<1100 && windowH<560)` (handles landscape phones); overlay sidebar + MobileTopBar.
- [ ] Desktop: resizable sidebar (180–360px drag).

**View: DAY GLANCE (`view-daily.js`)** — single-day comprehensive dashboard
- [ ] KPI tiles: TOTAL (+hrs sched), COMPLETED (+hrs), PENDING (+stby·hrs), CANCELED (+hrs), HOURS (actual/plan), SIM, A/C USED, INSTR active, **AP-127** (students count).
- [ ] **Schedule pulse**: flights-by-start-hour histogram (06–21/late).
- [ ] **Status mix donut** (mutually exclusive, SIM excluded) + outcome distribution legend with %.
- [ ] **Batch breakdown** (excl. MEETING/non-training; AP-127 first) with stacked status bars.
- [ ] **Top instructors** by hours + completion %.
- [ ] **Aircraft fleet usage** by tail.
- [ ] **AP-127 spotlight**: lessons-in-progress-today list; AP-127 completion rate vs school.
- [ ] Leave & maintenance status for the day.

**View: BOARD (`view-board.js`)** — sortable daily ops table
- [ ] All day's flights as sortable table; respects filters; empty-state; row→Drawer.

**View: GANTT (`view-gantt.js`)** — timeline bars
- [ ] Rows grouped by **instructor / tail / batch** (GROUP BY); shows **all activity types** (meetings, briefings, ground school) — bypasses SIM/STBY filters.
- [ ] If a person who is an FI appears as a student, their bar also shows in their FI row (busy-as-SP).
- [ ] Extended end-hour for late flights; click bar → detail; FOCUS + "AS SP" handling.

**View: WEEKLY (`view-weekly.js`)** — week calendar
- [ ] Day columns with per-day flight cards; today marker; empty-state.

**View: ANALYTICS (`view-summary.js`)** — aggregate stats over a date range
- [ ] **AP-batch pie** (only AP- batches; AP-127 pink reserved).
- [ ] **Breakdown table** toggle: by metric **flights | hours**; bar width ∝ metric, segments by status.
- [ ] **AP BATCH COMPARISON** (total flights per batch).
- [ ] **AP-127 student progress**: seeds ALL known AP-127 students (so 0-hr students appear), accumulates over range.
- [ ] Instructor load breakdown.

**View: ROSTER (`view-roster.js`)** — instructor × date workload heat-map
- [ ] Matrix rowKey × date → {flights, hours, batches[], ap127, completed}; load thresholds (color heat).
- [ ] AP-127-only filter; per-date summary row (DAILY TOTAL); ON LEAVE badge (today); cell→overlay flight list.

**View: SLOT FINDER (`view-slotfinder.js`)** — find an open window for one extra AP-127 flight
- [ ] **AP-127 FI qualification map** (which FIs can fly which type); hard-coded AP-127 SP names.
- [ ] Inputs: date, duration (1:00–5:00 / 15-min), **buffer/gap** (0–60 / 5-min, default 30, **both-sides padding**), start time (default 06:30), multi-select FI, multi-select SP, RWY-close window.
- [ ] Sweep in 15-min steps → valid (FI × tail) pairs + free SPs; **merge consecutive identical slots**.
- [ ] RWY-close overlap exclusion; SP must be free; FI type-qualified & not on leave; aircraft free & not maint.
- [ ] **Slot result cards** (grouped by FI→tails) + **resource timeline** (LEAVE / RWY CLOSE markers).

**View: AUTO SLOT FINDER (`view-autoslotfinder.js`, 1842 lines — most complex)**
- [ ] Pulls **NGT site SP ranking** from a cache feed (`cache_NGT001.json`-style) → auto-ranks AP-127 SPs.
- [ ] **RANK BY** options; **SP SOURCE**; **SHOW** (with-slots-only, etc.); SP-FI matched.
- [ ] Per-SP: best-slot proposal (DISPATCHER PROPOSAL), idle days, scheduled status, FI/SE overrides from cache w/ FLIGHTS fallback.
- [ ] **Reserve flow**: RESERVE → Ac picker modal (FI+tail) → RESERVED state; release modal; reservations affect others (**cascade feedback** — warns when a SP's options dropped due to others' reservations).
- [ ] Main timeline + mini timeline per expanded SP card; clickable slots (slot modal / release modal).
- [ ] FI-as-student blocking (FAM FI/PPC/Recurrent); per-SP filter rows; multi-check (null=ALL, []=NONE, subset).
- [ ] EXPAND ALL / COLLAPSE; **settings persisted** to versioned localStorage; PROPOSE modal.

**View: CALENDAR (`view-calendar.js`)** — monthly overview
- [ ] Month grid (Mon–Sun); per-day stats (respects AP-127-only); FI/SP leave per day; today marker.
- [ ] **DENSITY** toggle (COMPACT / NORMAL); month-level summary; AP-127 highlights.
- [ ] **Day detail panel** (slide-in) with prev/next nav across ALL_DATES; leave summary by person.

> Note: `view-mobile.js` exists but is **unused** (replaced by responsive layouts). Do not port.

### 3B. PROGRESS (from DashboardR1) — data: `window.PROGRESS_DATA` (`ap127[]`, `cur127[]`)

- [ ] **KPI row**: Students, Curriculum (96 lessons), Progress (done vs total), Total Hours (actual/total), **Ahead / Behind** named lists.
- [ ] **Progress Ranking table**: Rank (colored), today-flew dot, Name, **CALL SIGN** (nick), **SE TYPE** (DA40-TDI orange / DA40-CS blue), **FI** (full name), Progress bar+%, HRS DONE, LESSON DONE, Last Lesson, Last FLT (+relative), **IDLE DAYS** (color by idle), **DAY Delta** (today − planned date of last completed lesson), **HRS Delta** (actual − planned curriculum hrs to today). Sortable by any column.
- [ ] **Sort presets**: Most behind / Most ahead / Most hours / Name A–Z; **Reset**; header-click sort.
- [ ] Search by name.
- [ ] **Pace Bands** (leader→lagger spread bands).
- [ ] **Recent Flight** activity feed.
- [ ] **Lesson Codes legend** (GL, IL/IF, XV/XI, NL, SP/PIC, M).
- [ ] **Combined Progress vs Plan** chart: mode **Lessons | Hours**; horizon **To Today | To Plan End | To Proj. End**; CPV KPIs row; zoom (reset).
- [ ] **Flight Timeline vs Progress**: rows leader→lagger; per-student dots on dates flown, **colored by lesson phase**; **red segments for gaps > 7 days**; click dot → student drawer.
- [ ] **Actual vs Planned (Race chart)**: all 28 students w/ planned baseline; per-student toggles + solo; "actual to <date>".
- [ ] **Overall chart** (560px tall; students sorted; per-student bars).
- [ ] **Student Drawer**: catc_id · done/total · hrs; last 14 **flown** (date/lesson/mins); next 14 **planned** (date/lesson/mins); ESC to close.
- [ ] Phase classifier (`ap127LessonPhase`): GL/IL/IF/XV/XI/NL/SP/PIC/M → phase color.
- [ ] Reference maps: AP127_NICKS[28], AP127_FI[28], AP127_SE[28], AP127_FI_FULL, HOL (holiday set), Bangkok-today helper.
- [ ] Live status dot (live/loading/err) + "Updated …" + toast system.

### 3C. NEW in v1 (keep & improve)
- [ ] **Home / Overview**: On-the-line (focus day), Cohort progress, Pace spread, Data-conflict count, alerts (conflicts/review/idle/cancellations), pace leaders, behind-schedule, jump links.
- [ ] **Cross-Check**: consistency %, matched/review/conflict KPIs, discrepancy table (filter all/conflict/review, time & date tolerance), per-student table, name/lesson bridging, overlapping-window logic. Engine: `assets/reconcile.js` (pure, reusable).

---

## 4. DATA ARCHITECTURE

### 4A. Operations feed — `flight-data.js` → `window.FLIGHT_DATA`
```
{ fetchedAt, tz:"Asia/Bangkok",
  flights:[{id,date,status(Pending|Completed|Canceled),isSim,isStandby,start,end,
            durMin,duration,student,instructor,batch,lesson,cond,type,tail,
            tkoff?,ldgTime?,airborne?,to?,ldg?,inst?}],   // ACTUAL_ONLY_<n> ids for unplanned
  instructors:[{name,type}],                              // 21
  resources:[{acType,tail,isMaint}],                      // 38
  leaves:[{name,start,end,duration,reason}] }             // 203
```
- Pipeline (Command Center repo): GitHub Action every 30 min → Playwright scrape → merge → `data/flight_schedule.json` → `generate_flight_data.py` → `flight-data.js` → Pages deploy.
- Covers **all batches** (AP-124…129, Meeting, FAM, PPC…), scheduled + post-flight actuals. Rolling history window.

### 4B. Progress feed — worker `https://ap127-data-api.anusorn-tanmetha.workers.dev` → `window.PROGRESS_DATA`
```
{ _updated,
  ap127:[{catc_id,name,batch,done,total,remaining,pct,nick?,fi?,se?,next_lesson,
          flown:[{lesson,actual_ft,actual_mins,date}],
          planned:[{date,lesson,mins}]}],                 // 28 students
  cur127:[{lesson,planned_mins,planned_date}] }           // 96 master curriculum lessons
```
- AP127-only, curriculum-aligned. `flown` reaches back to ~2026-04-20; ops completed starts later (rolling window).
- nick/fi/se are injected client-side from `AP127_NICKS/FI/SE` (index-aligned to `ap127[]`) if absent.

### 4C. NGT SP rank cache (Auto Slot Finder)
- Auto Slot Finder consumes an NGT-site SP ranking cache. Related files in `/Users/nugui`:
  `cache_NGT001.json`, `aircraft_status.json`, `flight_schedule_CommandCenter.json`, `extractCatc.ts`, `extract_catc.py`.
- **TODO when porting ASF:** confirm the exact cache URL/shape it fetches (grep `ASF_LS_KEY` / "Cache feed" in `view-autoslotfinder.js`). Provide a bundled snapshot fallback as we do for the other feeds.

### 4D. Unified DataProvider (revamp)
Single provider loads both feeds once, exposes: `flights`, `instructors`, `resources`, `leaves`,
`students` (ap127), `curriculum` (cur127), `reconciliation` (from `reconcile.js`), `freshness{ops,progress}`,
plus the existing ops `date/filters/focus` state. Every feed: **live fetch → bundled snapshot fallback**
(progress fetched live in-browser; ops snapshot refreshed from Command Center repo / optional Action).

### 4E. Cross-check engine — `assets/reconcile.js` (already built, reuse as-is)
Bridges name formats (`"Akaravit Khwanngam"` ⇄ `"AKARAVIT K."`) and lesson codes (`"CDGL 04/1"`→`"CDGL 04"`),
compares only the overlapping date window, classifies each flown lesson **OK / REVIEW (time Δ>tol or date Δ>tol) /
CONFLICT (present one side only)**. Returns `{rows, perStudent, totals{consistency,ok,review,conflict,...}}`.
Current data: ~90% consistency, 5 conflicts, 10 reviews.

---

## 5. USER PERSONAS & USE CASES

### P1 — Student Pilot
- "What's **my** schedule today / this week?" → personalized day & week, my flights highlighted.
- "Where am **I** in the curriculum? Am I ahead or behind?" → my progress, idle days, day/hrs delta, next lesson.
- "When's my next planned lesson and with which FI/aircraft?" → planned list + slot context.
- "How do I compare to my batch?" → ranking, pace bands (read-only, motivational).
- Cares about: clarity, mobile, "just show me my stuff." Low tolerance for clutter.

### P2 — Leader / Instructor / Flight Commander
- "Is the **whole cohort** on track? Who's falling behind / idle?" → cohort progress, behind-plan, idle alerts.
- "What's flying **today**? Any cancellations, gaps, maintenance, leave?" → Day Glance, Board, Roster, Calendar.
- "Can I fit **one more** AP-127 flight in? Best slot per student?" → Slot Finder / Auto Slot Finder.
- "Is instructor load balanced over the period?" → Roster heat-map.
- "Do my two systems **agree**?" → Cross-Check (data integrity for trustworthy decisions).
- Cares about: density, cross-referencing, planning tools, trustworthy data.

### P3 — Dispatcher / Scheduler (subset of leader)
- Auto Slot Finder reserve/release workflow; aircraft & FI availability; RWY closures; leave-aware.

### Cross-cutting "Student Lens" (the big UX unlock the originals lack)
Pick a student once → their **Operations** (schedule/board/gantt highlight) **and** their **Progress**
(curriculum, deltas, next lessons) are linked in one place. Neither original connected a student's
*scheduled flights* to their *curriculum progress*. This is the headline new value of the revamp.

---

## 6. NEW INFORMATION ARCHITECTURE (single app)

Top-level nav (left sidebar desktop / bottom-bar + drawer mobile), grouped:

```
◎ OVERVIEW            role-aware home (today + cohort + alerts + conflicts)
  OPERATIONS
    ✈ Today           (Day Glance)
    ▤ Board
    ▭ Gantt
    ▦ Weekly
    ▥ Roster
    ▦ Calendar
  PLANNING
    ⌕ Slot Finder
    ⚡ Auto Slot Finder
  PROGRESS
    ▰ Cohort          (ranking + pace bands + recent + legend)
    ◷ Timeline        (flight timeline vs progress)
    ◔ Charts          (combined vs plan · race · overall)
    ◫ Analytics       (batch/instructor aggregates — ops summary)
  INTEGRITY
    ⇄ Cross-Check
```

**Global top bar (persists across all views):** brand · **Student Lens** picker (search a student →
"My View") · global **date** · **AP-127 focus** toggle · **theme** · unified **freshness** (OPS+PROG) ·
**conflict badge** (links to Cross-Check) · SYNC.

**Student Lens active** → adds/highlights: "My Schedule" (filtered ops), "My Progress" (their card),
and pins their row everywhere. A "Clear lens" chip returns to cohort/leader mode.

Routing: hash-based (`#/operations/today`, `#/progress/cohort`, `#/student/<nick>`); deep-linkable;
last view persisted to localStorage (carry over Command Center's `ap127-view`/`ap127-theme` keys).

---

## 7. UX PRINCIPLES

1. **One shell, one state.** Date, focus, theme, student lens are global and shared by every view.
2. **Progressive density.** Mobile = essentials + drill-in; desktop = dense multi-panel. Reuse CC's `isMobile`.
3. **Everything cross-links.** Click a flight → drawer with a link to that student's progress; click a
   student in progress → their schedule/gantt. Cross-check rows link to the offending flight/student.
4. **Trust signals always visible.** Freshness per feed + conflict count in the top bar at all times.
5. **No dead ends.** Empty states explain why (filters, no data, outside window) and offer an action.
6. **Keyboard & a11y.** ESC closes drawers/modals; arrow nav in calendars; focus rings; reduced-motion respected.
7. **Performance.** Memoize heavy derivations; lazy-mount Charts only when a chart view is active.

---

## 8. UI / DESIGN SYSTEM

- **Adopt Command Center's OKLCH token system** (it's the richer one: 3 themes, batch colors, status colors)
  as the canonical palette, and **map the Progress app's hex palette onto these tokens** so the charts inherit
  the active theme (instead of hard-coded `#0d1117` etc). One palette → all views, all themes.
- **Type:** Rajdhani (display/numbers headline) · Inter (UI body) · JetBrains Mono (data/labels, tabular-nums) · Nunito (optional body). Standardize: headline=Rajdhani, body=Inter, mono=JetBrains.
- **Spacing/radius:** 8px grid; cards radius 9px; pills 999px. Consistent panel chrome (`.panel/.ph/.pt/.pb`).
- **Components to unify (build once, use everywhere):** Panel, KPItile, StatusPill, Tag, Pill(ok/rev/bad/info),
  ProgressBar, DataTable(sortable), Drawer, Modal, Chip/Toggle, MultiSelect, DatePicker, Donut, Sparkline,
  Toast, EmptyState, FreshnessDot, ConflictBadge, StudentLensPicker.
- **Charts:** Chart.js with a theme-aware defaults helper (reads CSS vars → chart colors); destroy/recreate on
  data/theme change; lazy-init.
- **Responsive:** sidebar collapses to icon-rail < 1100px, to bottom-bar < 768px; tables → card lists on phone;
  multi-panel grids → single column.
- **Motion:** subtle (pulse on live dot, 120ms transitions); honor `prefers-reduced-motion`.

---

## 9. TECHNICAL ARCHITECTURE (revamp file layout)

```
/
  index.html               # shell: loads CDNs + all js/*, boots <App/> into #root
  flight-data.js           # ops snapshot (window.FLIGHT_DATA)
  progress-data.js         # progress snapshot fallback (window.PROGRESS_DATA)
  ngt-cache.js (TODO)      # auto-slot-finder SP cache snapshot (window.NGT_CACHE) — confirm shape
  css/theme.css            # OKLCH tokens (extracted from app-shared THEME_CSS) + base + shared component CSS
  js/
    data.js                # DataProvider: load+merge both feeds, live+fallback, reconciliation, freshness
    shared.js              # ported app-shared atoms/helpers/context (theme, date, filters, focus, drawer)
    ui.js                  # unified component library (Panel, KPItile, DataTable, Modal, Chart helpers, Toast...)
    shell.js               # App, Sidebar (grouped nav), TopBar (lens/date/theme/freshness/conflict), routing, mobile
    view-overview.js       # Home (role-aware)
    view-today.js          # Day Glance        (port view-daily)
    view-board.js          # port view-board
    view-gantt.js          # port view-gantt
    view-weekly.js         # port view-weekly
    view-roster.js         # port view-roster
    view-calendar.js       # port view-calendar
    view-slotfinder.js     # port view-slotfinder
    view-autoslotfinder.js # port view-autoslotfinder (biggest; confirm NGT cache)
    view-analytics.js      # port view-summary
    view-cohort.js         # Progress ranking + pace bands + recent + legend (port DashboardR1, React)
    view-timeline.js       # Progress flight-timeline-vs-progress (Chart.js in React)
    view-charts.js         # combined-vs-plan + race + overall (Chart.js in React)
    view-crosscheck.js     # port crosscheck (React, reuse reconcile.js)
    view-student.js        # Student Lens detail (unifies ops + progress for one student)
  assets/reconcile.js      # KEEP (pure cross-check engine)
  REVAMP.md                # this file
  README.md                # user-facing
  ARCHIVE_v1/ (optional)   # the iframe-era ops/ progress/ crosscheck/ overview/ if we want to keep them
```

State: extend the existing AppProvider with `students`, `curriculum`, `reconciliation`, `studentLens`,
`freshness`. Keep localStorage keys compatible. Progress views read `students/curriculum` from context.

**Porting strategy for DashboardR1 (vanilla → React):** the math/helpers (`ap127*` functions, phase classifier,
sorts, deltas) are pure — copy them verbatim into a `progress-lib` section. Wrap each Chart.js canvas in a React
component using `useRef` + `useEffect` (build chart on mount/data/theme change, destroy on cleanup). The ranking
table/pace bands/drawer become JSX. This preserves exact behavior while living natively in the shell.

---

## 10. CROSS-CHECK (already solid — extend)
- Reuse `assets/reconcile.js`. Add: link each discrepancy row to the flight (ops drawer) and the student (progress card);
  surface conflict count in the global top bar; optionally a "reconcile over date range" control.

---

## 11. BUILD PLAN (phases)

- **Phase 0 — Spec & scaffold** ✅ this doc; set up `css/`, `js/`, shell skeleton, DataProvider stub.
- **Phase 1 — Foundation:** `css/theme.css` (tokens, 3 themes), `js/data.js` (both feeds + reconciliation + freshness),
  `js/shared.js` (port app-shared context/atoms), `js/ui.js` (core components + theme-aware Chart helper),
  `js/shell.js` (grouped sidebar nav, top bar, routing, mobile, student lens scaffold). Boot `<App/>`.
- **Phase 2 — Operations parity:** port today/board/gantt/weekly/roster/calendar/analytics (mostly lift from CC views,
  swap context imports). Verify each against original feature list in §3A.
- **Phase 3 — Planning parity:** port slot-finder, then auto-slot-finder (confirm NGT cache feed + snapshot). Highest risk.
- **Phase 4 — Progress parity:** port cohort/timeline/charts/student-drawer from DashboardR1 into React (theme-aware Chart.js).
- **Phase 5 — Unifying value:** Overview (role-aware) + Student Lens (links ops⇄progress) + Cross-Check (linked rows) + conflict badge.
- **Phase 6 — Polish & verify:** responsive passes (phone/tablet/desktop), 3 themes, empty/error states, a11y/keyboard,
  perf (lazy charts, memo), full §3 checklist sweep, screenshots. Update README. Deploy (Pages).
- **Phase 7 (optional):** GitHub Action to auto-refresh both snapshots like Command Center does.

**Verification:** for EACH ported view, open original + revamp side by side and tick its §3 checklist items.
Use the `ap127v2` preview (port 7423) + screenshots/snapshots; check console for errors each phase.

---

## 12. CONTINUATION LOG  ← UPDATE THIS EVERY SESSION

| Date | Phase | Done | Notes / next |
|------|-------|------|--------------|
| 2026-05-31 | v1 | iframe shell (Home/Operations/Progress/Cross-Check), reconcile.js, snapshots, Pages live | Worked but not "one app". `index.html` = v1, still live. |
| 2026-05-31 | 0 | Full audit of both apps; wrote this REVAMP.md spec | — |
| 2026-05-31 | **1 ✅** | Foundation built & verified: `css/theme.css` (3 themes), shared context, native role-aware Overview, shell (sidebar, top bar w/ Student-Lens picker + freshness + conflict badge + theme + sync, hash routing, mobile drawer), boot entry. | — |
| 2026-05-31 | **2 ✅** | Operations parity: today/board/gantt/weekly/roster/calendar/analytics ported from Command Center into `js/view-*.js`, rewired to `window.useData()`, registered in shell registry. Babel Standalone added. | — |
| 2026-05-31 | **3 ✅** | Planning parity: slot-finder + auto-slot-finder ported (NGT cache feed + snapshot confirmed). | — |
| 2026-05-31 | **4 ✅** | Progress parity: DashboardR1 full dashboard ported VERBATIM into `js/view-cohort.js` (IIFE-scoped, mounted in React container, no iframe); `css/progress.css` scopes its dark palette. Nav consolidated (Progress = page + Analytics). Verified: 28-row ranking, 4 charts, KPIs. |
| 2026-05-31 | **5 ✅** | Unifying value: native Cross-Check (`view-crosscheck.js`) over shared reconciliation w/ adjustable tol + sortable discrepancy/per-student tables; **Student Lens** (shell.js) links one student's Ops schedule ⇄ Progress lessons ⇄ upcoming plan. Overview alerts deep-link to Cross-Check. Verified all. |
| 2026-05-31 | **6 ✅** | Polish & **SWAP**: verified all 12 routes render no-error, 3 themes, mobile responsive (fixed Overview grids to collapse via `isMobile`). Added `?v=` cache-busting to local includes. **`index.html` is now the unified app** (`app.html`→redirect; old v1 preserved as `legacy.html`). | — |
| 2026-05-31 | **7 ✅** | Auto-refresh: `scripts/refresh_snapshots.mjs` (zero-dep Node) mirrors CC's published `flight-data.js` + the `ap127-data-api` worker; `.github/workflows/refresh-data.yml` runs it hourly + on dispatch, commits only on real change, pushes (legacy Pages auto-deploys), opens an issue on failure. Data `<script>`s un-pinned from `?v=` so refreshes propagate. **Verified green on the runner twice** (1st: refreshed 819→821 flights; 2nd: clean no-op, no noise commit). | — |
| 2026-05-31 | **8b ✅** | Added **Progress Detail** (NGT_001 "Flight Plans") to the Training Program group: per-student plan cards (recent flown + upcoming + finish ETC), all 4 batches, search/sort. KEY CHANGE per user: upcoming-lesson dates are NO LONGER the scheduler's projections — `makeCard` now looks each future lesson up in the **Operations** feed (`window.FLIGHT_DATA`, keyed via reconcile `ccKeyFromFull`/`normLesson`) and shows the real scheduled date, or **TBC** if not yet scheduled. (Finish-ETC tag kept as the projection it is.) Verified: ops "KHOBPONG W. CDGL 09 2026-05-29" → card "CDGL 09 → 29 May 26"; far-future lessons → TBC. Code → `?v=p9`. | — |
| 2026-05-31 | **8 ✅** | **Full NGT_001 parity** (per user: include everything, not just DashboardR1's AP127 Detail). `js/view-program.js` embeds NGT_001's scheduler + render/chart logic VERBATIM (IIFE, no-JSX plain script), `css/program.css` (NGT styles scoped under `.ngt-prog` via native nesting), `ngt-data.js` = bundled `cache.json` mirror (all 4 batches AP124/126/127/129 + monthly + curricula) as `window.NGT_CACHE` (refresh workflow mirrors it too). Three new views in a **Training Program** nav group: **All Batches** (Daily Flight Load, all-students progress, batch timeline, per-batch charts), **School Perf.** (daily actual flights+hours, monthly by batch, filters), **Simulation** (live client-side scheduler — weekday/weekend/holiday caps, flights/hours mode, finish-date cards, capacity chart, extra batches). Verified all three render charts + scheduler re-runs interactively, no console errors. Code assets → `?v=p8`. | — |
| 2026-05-31 | **UX ✅** (`p17`) | Batch colours unified to the TODAY palette everywhere (AP124 `#4ba3f7` / AP126 `#7acf7e` / AP127 `#e88aff` / AP128 `#fc9252` / AP129 `#e9bd63`; AP127 detail accent → magenta). Sidebar collapses to a 58px icon rail via the top-bar burger (state in `ap127v2-collapsed`); bigger nav icons. Overview→**Home** + big "AP127 COMMAND CENTER" title; Home Alerts drop integrity items (now an amber dot on the Cross-Check nav item + ⇄ chip). **AP127 Detail**: progress reconciled from Ops (`opsAugment`), future dates = scheduled or TBC, big title, 6-tile summary. **Progress Detail**: batch filter. **School Perf**: separate Daily-Flights + Daily-Hours stacked-by-batch charts. **Gantt**: responsive px/hour (fits viewport, sticky row label). **Calendar**: status + batch filters. **Ops Analytics**: 6-col tiles + side-by-side breakdowns. New **User Guide** view (`js/view-tutorial.js`, Help group). 17 routes verified. | — |
| 2026-06-01 | **DATA ✅** (`p19`) | **Roster integrity.** AP127 briefly showed 27/28 (Anusorn T. missing; his done shown as 4). Root cause = a TRANSIENT upstream glitch: NGT `parseCSV` only keeps a student whose CATC-ID starts with "681" and resyncs via `i++`, so when Anusorn's ID cell was momentarily blank (mid-edit, done 6→8) exactly his 3-row block was skipped. Upstream self-healed (28, done=8); V2 just had a stale mirror. **Removed** the wrong ops-backfill (Ops Completed-count ≠ curriculum done → fabricated 4). **Kept**: `injectNicks` now assigns call-sign/FI/aircraft by NAME via `AP127_ROSTER` (not array index), so a drop can never again shift everyone's call-sign. Refreshed snapshots. Verified 28 + Anusorn done=8 + 0 mislabels. | **REVAMP COMPLETE.** Future: bump `?v=` on code releases; if the AP127 roster changes, edit `AP127_ROSTER` in `shared.js`. |
| 2026-06-14 | **AP127 Detail ✅** (`p62`) | SP drawer full detail (KPI strip + uncapped lists), idle days from today (not maxDate), race chart Lessons/Hours toggle + batch avg line, combined chart defaults to "To Today" + removes Plan To End + auto-resets zoom on mode/filter change. | — |
| 2026-06-16 | **Dual projection ✅** (`p84`) | Combined Progress chart now shows two projected lines: Proj 30d (sky blue `#38bdf8`) and Proj 15d (orange `#fb923c`), each as a 2-point dashed line from today's actual to its projected finish date. KPI strip updated to 5 tiles: Done/Total, Proj 30d Finish (pace + date), Proj 15d Finish (pace + date), Plan Finish, vs Plan Today. endDate extends to the furthest of the two projections. | — |
| 2026-06-16 | **Fix ✅** (`p85`) | vs Plan Today KPI now shows signed value: `-541 lessons` when behind, `+N` when ahead (was always unsigned). | — |
| 2026-06-16 | **Fix ✅** (`p86`) | Combined Progress chart now defaults to Hours mode + To Proj. End (was Lessons + To Today). | — |
| 2026-06-16 | **Hotfix ✅** (`p87`) | Telegram watchdog rate-limit handling. | — |
| 2026-06-20 | **Gantt card + type filter ✅** (`p89`) | **Gantt card:** removed SOLO badge (dashed border marks solo); SOLO now uses status color (amber pending / green done / red cancel); SIM uses status color with **dotted** border; batch shows without dash ("AP127" not "AP-127"); A/C shows as short 3-char form (first + last 2 chars: "HVG" for "HS-TVG"); legend updated. **Schedule TYPE filter:** `AP / HP / PPL / TCAR / MEP / OTHER` chips in a row below LAYOUT — default AP-only, persisted to localStorage, syncs to `filters.batches`, "ALL / AP ONLY" toggle. | `js/view-gantt.js`, `js/view-schedule.js`, `index.html` |
| 2026-06-20 | **Schedule polish ✅** (`p88`) | **Gantt:** timeline now trims to the actual day (floor first start → ceil last end + 30min pad) instead of a fixed 06–18, so bars use the full width; added **zoom** controls (−/FIT/+, scroll when zoomed; mobile floor raised to ~46px/hr for legible bars); added a live **NOW** time-line (Bangkok, ticks each minute) on today's date; **flight cards** drop the redundant start-time and always show **SP name + Batch + A/C** (incl. mobile); **default focus = A/C** (was Instructor) and the "tail" focus chip is relabelled **A/C**. **Day board:** sticky **TOTALS** row in the table (flights, completed ✓+hrs, sched hrs). **Headers:** extracted shared `DateFilterRow` (`shared.js`) used by Day + Gantt so the date/filter row lines up across layouts. Mobile-verified all 4 layouts. | `js/view-gantt.js`, `js/view-board.js`, `js/view-weekly.js`, `js/shared.js`, `js/shell.js`, `index.html` |
| 2026-06-21 | **School Perf scorecard — monthly variance table ✅** (`p90`) | `renderScorecard()` now populates `#pf-sc-table` with a per-month variance table: plan vs actual flights + hours, Δ and % columns, green/amber/red/grey status icons, expandable per-batch sub-rows (AP124/AP126/AP127/AP129) via `pfToggleMonthRow()`, current month marked with ◑, future months show "—" for actuals. | `js/view-program.js` |
| 2026-06-22 | **School Perf: Effective Hours toggle extended tab-wide ✅** (`p94`) | Hours-mode toggle now affects the entire School Perf tab, not just the scorecard. Toggle moved to filter bar (new `pf-mode-row` + `pf-mode-label`). `renderPerformance()` reads `localStorage['pf-sc-hours-mode']`, swaps `collectHistoricalFlights()` for `collectEffectiveFlights()` as `recAll`, syncs button states and shows/hides a magenta banner (`#pf-eff-banner`). `renderScorecard()` simplified — `effMode`/`effRec` logic removed; receives pre-filtered records from `renderPerformance()`. `pfToggleHoursMode()` now calls `renderPerformance()` instead of `renderScorecard()`. All KPI cards, daily hours chart, weekly table, recent stats, and scorecard all reflect mode. | `js/view-program.js`, `css/program.css`, `index.html` |
| 2026-06-22 | **Integrity-led hardening ✅** (`p95`) | **I1 Timezone:** every "today" is now anchored to **Asia/Bangkok** via one `Intl.DateTimeFormat('en-CA',…)` helper — `bkkToday()` rebuilt on it and `localToday` aliased to it (was browser-local clock, which disagreed with the Gantt NOW-line off UTC+7). **I2 Batch norm:** new exported `isAP127Batch` reuses the reconcile engine's tolerant normalizer; the AP-127 focus filter (shared `dayFlights`, Gantt, Weekly) and the AP-127-only toggles (Roster, Calendar) now classify batches by the SAME rule as Cross-Check (was exact `!== 'AP-127'`). **I3 Dedup:** the `ACTUAL_ONLY` dedup gained a `student\|date\|lesson` fallback that caught a real double-count (SANGYAI P. / PDXC 30 / 11 Jun) the id-match missed; warns when the fallback fires (canary for upstream ID drift). **I4:** added `validDate()` + a load-time malformed-date console canary, and a "manual yearly update" note on `AP127_HOLIDAYS`. **U2:** progress live-fetch now sets a distinct `'error'` source on failure; the PROG freshness dot turns red with a ⚠ and an explanatory tooltip ("live refresh FAILED — showing snapshot … Try SYNC") instead of silently staying amber. (U1/U3 from the review plan dropped — verified non-issues: Board/Gantt/Week already render the full FilterBar and Calendar/Roster have their own controls; `ALL_DATES` is a contiguous range so empty days are already selectable. Aircraft view already had full loading/error/refresh UI.) | `js/shared.js`, `js/shell.js`, `js/view-gantt.js`, `js/view-weekly.js`, `js/view-roster.js`, `js/view-calendar.js`, `index.html` |
| 2026-06-23 | **Watchdog: fix missing test coverage for STATUS→Canceled mention** | `telegram.test.js` `STATUS → Canceled` test was the only notification type not asserting `lines[1]` contains the SP `@username` mention. All 6 notification types (ADDED, ADDED+Completed, REMOVED, STATUS→Completed, STATUS→Canceled, CHANGED) now have explicit assertions for both the SP name and `@username` in `lines[1]`. Implementation was correct; gap was in test coverage only. | `watchdog/test/telegram.test.js` |
| 2026-06-22 | **Cross-Check keying fix ✅** (`p96`) | Root-caused the inflated conflict count. `(Unplanned)` ops records store the student as a **full name** ("AKARAVIT KHWANNGAM") or a **callsign** ("P-KORN") rather than the "FIRST L." form, so `ccNameNorm`-keyed ops flights never matched the `ccKeyFromFull`-keyed progress student → flights orphaned, showing as phantom `missing_in_ops` + `missing_in_progress`. New `opsStudentKey()` in `reconcile.js` reduces any ops name to the canonical "FIRST L." key and bridges bare callsigns via a nick→key map built from the (nick-injected) progress rows. Result: **consistency 87% → 93%, conflicts 48 → 32, orphan ops students 12 → 2** (only `WATCHARAPHOL` bare-name + `SAETASIT`↔`SETASIT` spelling variant remain). The remaining conflicts are now **meaningful**: ~11 are normal Progress-sheet lag behind Ops (recent, self-healing) and a cluster (Maethaphan CDGL 10/11/12, Bulaset CDGL 08, …) are flights flown-but-still-**"Pending"** in the Ops portal — an actionable ops data-entry gap, not a dashboard bug. | `assets/reconcile.js`, `index.html` |
| 2026-06-21 | **School Perf Scorecard: Effective Hours toggle ✅** (`p93`) | Added "Actual hrs / Effective hrs" pill toggle to the scorecard. Effective mode substitutes `planned_mins` from the curriculum for each completed lesson's hours (normalizes duration — a 60-min lesson counts as 60 min regardless of actual block time). New functions: `buildCurMap()` (lesson→planned_mins lookup), `collectEffectiveFlights()`, `pfToggleHoursMode()`. `_scLastParams` cached for lightweight re-render without full `renderPerformance()`. All hours KPIs, monthly table, and achievement bars update on toggle. State persisted in `localStorage['pf-sc-hours-mode']`. Fixed: `pfToggleScorecard/MonthRow/HoursMode` added to `window` via `Object.assign`. | `js/view-program.js`, `css/program.css`, `index.html` |
| 2026-06-21 | **Fix: hours always use block time (durMin) ✅** (`p92`) | All hours calculations across every ops view now use `f.durMin` (block time) instead of `f.airborne` (airborne time). Changed: `brdFlownMin` in `view-board.js`, `calFlownMin` in `view-calendar.js`, `flownMin_s` in `view-summary.js`, two inline calcs in `view-daily.js`, and the `ccMin` fallback in `assets/reconcile.js`. The `airborne` field is still displayed in the flight drawer for reference but is never used for hour totals. | `js/view-board.js`, `js/view-calendar.js`, `js/view-summary.js`, `js/view-daily.js`, `assets/reconcile.js`, `index.html` |
| 2026-06-21 | **Fix: deduplicate planned+actual completed flights ✅** (`p91`) | When a flight completes, the ops system adds an actual entry (`ACTUAL_ONLY_BK-X_ACT_N`, status=Completed, real tkoff/ldg/airborne) AND marks the original planned entry Completed (to=0/ldg=0/airborne=null). Both passed the `status==='Completed'` filter → double-counted flights and hours in every ops view (KPI tiles, Board, Analytics, Gantt). Fix: dedup IIFE at top of `shared.js` mutates `window.FLIGHT_DATA.flights` before `FLIGHTS` is assigned — strips planned Completed entries whose booking ID has an ACTUAL_ONLY counterpart (352 cases). Planned Pending/Canceled and manually-completed-without-actual entries are unaffected. | `js/shared.js`, `index.html` |

**Boot model (current, `?v=p19`):** **`index.html` IS the unified app** — loads `css/theme.css` + `css/progress.css`
+ `css/program.css` (all `?v=`-pinned), CDNs (React/Babel/Chart.js), data (`reconcile.js`, `flight-data.js`,
`progress-data.js`, `ngt-data.js` — snapshots NOT `?v=`-pinned so the hourly refresh propagates), then `js/shared.js`
→ the JSX ops/cohort/crosscheck/overview views (`text/babel`) + the two plain-JS views `js/view-program.js` &
`js/view-tutorial.js` → `js/shell.js`, and boots `window.AP127App` into `#root`. `app.html` redirects to `index.html`;
`legacy.html` is the original v1 iframe shell. **Bump the `?v=` token on every code release** (one `sed -i '' 's/?v=pN/?v=pN+1/g' index.html`)
so GitHub Pages clients (asset cache ~10 min) pick up new code.

**Current state:** Full parity + the NGT_001 program views + the UX round + the roster-integrity fix are all live.
Nav = Home · Operations(Today/Board/Gantt/Weekly/Roster/Calendar) · Planning(Slot/Auto-Slot) · Progress(AP127 Detail/
Ops Analytics) · Training Program(All Batches/Progress Detail/School Perf/Simulation) · Integrity(Cross-Check) ·
Help(User Guide). Data self-heals via the hourly `refresh-data.yml`. No open work items — extend per new requests.

**Integration contract for ported views (IMPORTANT):**
- A view file does: `(window.VIEWS_REGISTRY = window.VIEWS_REGISTRY || {})['board'] = OpsBoard;`
- Read state via `const d = window.useData();` — exposes `date,setDate,filters,setFilters,drawer,setDrawer,
  highlightAP127,setHighlightAP127,hideOthers,setHideOthers,tweaks,setTweak,dayFlights,flightById,FLIGHTS,
  INSTRUCTORS,RESOURCES,LEAVES,ALL_DATES,DEFAULT_DATE,HIGHLIGHT_BATCH,students,curriculum,reconciliation,
  freshness,studentLens,setStudentLens,go,localToday,bkkToday,NICKS,FIS,SES,FI_FULL,HOLIDAYS`.
- CC's shared atoms (StatusPill, Tag, FilterBar, Drawer, DateCalendarTrigger, ViewIcon, etc.) are **not yet ported** —
  port the ones a view needs into `js/shared.js` (or inline) as you go. Map any hard-coded hex in Progress views to CSS vars.

**Decisions (resolved):**
- v1 iframe pages → kept at `legacy.html` (+ `overview/ ops/ progress/ crosscheck/`), not deleted.
- Auto Slot Finder NGT cache → confirmed + bundled snapshot.
- Ship strategy → built in repo; `index.html` swapped to the unified app at Phase 6.
- Batch scope → all 4 batches (AP124/126/127/129), AP127 primary. Admin/Google-sync NOT ported (V2 mirrors data).

---

### UX round (2026-05-31, code `?v=p17`)
Batch colours unified to the TODAY palette everywhere (AP124 #4ba3f7 / AP126 #7acf7e /
AP127 #e88aff / AP128 #fc9252 / AP129 #e9bd63; AP127 detail accent → magenta). Sidebar
collapses to an icon rail via the top-bar burger; bigger nav icons. Overview→**Home** with
big "AP127 COMMAND CENTER" title; Home Alerts drop integrity items (now an amber dot on the
Cross-Check nav item + ⇄ chip). **AP127 Detail**: progress reconciled from the Operations
feed (`opsAugment`), future dates = real scheduled date or TBC, big title, 6-tile summary.
**Progress Detail**: batch filter. **School Perf**: separate Daily-Flights and Daily-Hours
charts, stacked by batch. **Gantt**: responsive px/hour (fits viewport, sticky row label).
**Calendar**: status + batch filters. **Ops Analytics**: 6-col tiles + side-by-side
instructor/student breakdowns. New **User Guide** view (Help group) documenting every view +
the logic. All 17 routes verified error-free.

### Perf + mobile-table round (2026-06-13, code `?v=p44`)
Audit-driven, safe in-place wins — **no build step** (the whole 5-site ecosystem is deliberately
no-build; see `AP127_Docs`). Three perf changes + one mobile polish:
- **React production builds**: `index.html` now loads `react.production.min.js` /
  `react-dom.production.min.js` instead of the `*.development.js` bundles — sheds a few hundred KB
  and the dev-mode warning/validation overhead on every load. Babel Standalone stays (11 JSX views +
  the inline boot script still need it); Chart.js + plugins were already minified.
- **Skip Babel for non-JSX files**: `shell.js`, `view-watchdog.js`, `view-cf-usage.js`,
  `view-crosscheck.js`, `view-overview.js` use `React.createElement`/`h()` only (verified zero JSX),
  so they're now plain `<script>` instead of `type="text/babel"` — they execute directly instead of
  being transpiled on every load. (`view-program.js`/`view-tutorial.js` were already plain.)
- **Boot loading indicator**: a themed spinner placeholder inside `#root` (inherits
  `body[data-theme]` via CSS vars) that React overwrites on first paint — no more blank white screen
  during the Babel-compile window.
- **Mobile Progress table** (`css/progress.css`): the `@media(max-width:900px)` rule perversely
  *raised* `.d127-table` min-width to 900px (wider than the desktop 760px), forcing off-screen scroll
  on phones with no cue. Lowered the mobile override to 640px and added a CSS-only scroll-shadow
  affordance on `.d127-table-wrap` (edge shadows show only when more content is scrollable, fade at
  the ends). No other table had the bump.
- **Cache token**: all code-asset `?v=` tokens unified from the drifted p39–p43 spread to **p44**.
  Data files stay un-pinned (hourly-refresh design — untouched).

### AP127 Detail improvements (2026-06-14, code `?v=p62`)
Five targeted improvements to `js/view-cohort.js`:
- **SP Drawer full detail**: Replaced the capped 14-item lists with scrollable full-length lists
  (`max-height:45vh; overflow-y:auto`). Added a KPI header strip per student — Lessons Done/Total,
  Hours, Idle Days, Day Δ, Hrs Δ — computed live in `openAP127Drawer` from `G.cur127`.
  Meta line shows CATC-ID · call-sign · FI · SE type (was: lessons/hrs summary).
- **Idle days from today**: `ap127IdleDays(s, maxDate)` → `ap127IdleDays(s, today)` (and all
  `ap127PaceSort`/`ap127BehindSort` calls that used `maxDate` as `asOf`). Idle counts now always
  measure from the current Bangkok date, not from the most-recent flight in the dataset.
- **Race chart Lessons/Hours toggle**: New `AP127_RACE_MODE` (`'lessons'`/`'hours'`) + `setAP127RaceMode(m)`
  function (exposed on `window`). Mode chips appear above the student solo-toggle row. In hours mode,
  cumulative series uses `ap127FlightMins(f)/60` and the planned target uses curriculum `planned_mins`.
- **Race chart Batch Avg line**: Thick magenta (`#e88aff`, `borderWidth:3`, `order:999`) average
  line added at the end of the datasets array, computed as mean of all student cumulative values at
  each date label. Note "◆ thick = batch avg" shown beside the mode chips.
- **Combined chart defaults**: `CPV_FILTER` defaults to `'today'` (was `'proj'`); "To Plan End" button
  removed; `setCPVFilter` and `setCPVMode` both call `CHARTS.ap127combined?.resetZoom?.()` on entry
  so zoom always resets when changing filter or mode.

### Slot Finder — intra-duty-window exemption (2026-06-16, ops/)

`ops/js/view-slotfinder.js` · `ops/js/view-autoslotfinder.js`

**Rule change:** When an FI already has flights scheduled on a day, a proposed slot that falls
**entirely within** their existing duty window (`t ≥ duty.first` and `end ≤ duty.last`) is now
**always permitted** — no duty-hour check applied. The FI is already on duty during that period,
so filling a gap adds zero new duty time.

Any slot that would **extend** the duty window (start before `duty.first` or end after
`duty.last`) still goes through the normal 7-hour span check (`SF_MAX_DUTY` / `ASF_MAX_DUTY = 420 min`).
Exactly 7 h (420 min) is allowed; 7 h 01 m is blocked.

One-line change in each file — added before the span check:
```js
if (t >= duty.first && end <= duty.last) return true; // within existing window — no new duty
```

## 13. GOTCHAS / NOTES
- No-build React: load order matters (CDNs → data → shared → ui → views → shell boot). Use `type="text/babel"` + per-file hook aliasing.
- Babel Standalone is slow on huge files; auto-slot-finder is 1842 lines — consider splitting when porting.
- Progress live fetch can be blocked in sandboxed preview (CORS/network) → snapshot fallback kicks in; works on Pages (DashboardR1 proves it).
- "Today" is **Asia/Bangkok**; both apps have BKK-today helpers — use one shared helper.
- Names differ across feeds — always go through `reconcile.js` helpers for matching.
- AP-127 nick/fi/se arrays are **index-aligned** to `ap127[]` order — keep order stable when refreshing snapshot.
- Curriculum master plan (`cur127`) is an aggressive idealized schedule (expects ~26 lessons by 2026-05-31; best student ~15) → the whole cohort reads "behind plan". Use relative metrics (pace spread, day/hrs delta) for meaningful signals, not raw behind-plan counts.
