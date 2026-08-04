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
| 2026-06-23 | **School Perf: SIM flight separation ✅** (`p98`) | SIM lessons (codes with `(SIM)`) now separated from normal flights across all SCHOOL PERF charts and KPIs. New `isSimLesson()` helper; `collectHistoricalFlights`/`collectEffectiveFlights` emit `isSim` flag; `dm` map extended with `simN/simH/simB/simBn` fields. All 5 charts (daily flights, daily hours, monthly stacked, monthly grouped, recent N days) render 8 series: normal (vivid batch color) + SIM (lighter tint of same hue). Total KPI tiles show "(N SIM)" in muted brackets. Recent stats cards, AP127-only tiles, and weekly table all annotated with per-batch SIM counts/hours. | `js/view-program.js`, `index.html` |
| 2026-07-25 | **Watchdog: combined per-run notifications, full completed-flight actual data** | Replaced individual-or-summary sending with always-one-combined-message-per-destination-per-run (grouped by urgency, chunked only past Telegram's 4096-char limit); every matched SP is now @mentioned in every run including large bursts (fixes the 2026-07-21 outage gap). Completed flights now show T/O·LDG count, actual TO/LDG clock times, and INST time. See `docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md`. | `watchdog/src/diff.js`, `watchdog/src/telegram.js`, `watchdog/src/index.js` |
| 2026-07-26 | **Schedule: fix invisible cancelled flights, show cancel reason/remarks + block times on the flight card, enrich Calendar leave detail** (`p113`) | Cancelled flights whose booking only exists in the separate `cancellations[]` feed (no matching row in `flights[]`) were invisible everywhere — confirmed via a real report (Napon S., CDXV 29, 2026-07-27) and, since the upstream CMD_CTR scraper is mid-rollout of its own fix today, a stable second example (VASAPHON S., CDGL 02, 2026-05-05). New `attachCancelDetails()` in `shared.js` backfills `cancelReason`/`cancelRemarks` onto Canceled flights (fallback only, never overriding a value the pipeline already set) and synthesizes a `_noTime` virtual flight for any cancellation with no matching — or wrongly-statused (booking-id-reuse) — flight, so Board/Weekly/Calendar all pick it up via the shared `FLIGHTS` array; Gantt correctly skips it (no time to draw a bar with). Flight Drawer now shows CANCEL REASON/REMARKS, a NO TIME LOGGED badge, and BLOCK OFF/ON (previously-unused `blockOff`/`blockOn` fields). Board/Weekly/Calendar day-panel rows get a NO TIME tag; Calendar day-panel also shows the cancel reason inline. New `leaveDetailOnDate()` (sibling to `leavesOnDate`, which is unchanged) feeds the Calendar day panel's FI/SP leave rows with duration/note/role, not just the bare reason. See `docs/superpowers/specs/2026-07-26-schedule-view-improvements-design.md`. | `js/shared.js`, `js/view-board.js`, `js/view-weekly.js`, `js/view-calendar.js`, `index.html` |
| 2026-07-27 | **Fix: duplicate flight rows inflated every view and every hours KPI** (`p116`) | Found during a full-ecosystem verification sweep, measured against the live feed, not reported by a user. **Two independent duplicate sources, both live on `ap127-ngt2.pages.dev`.** (1) **`CANCEL_*` phantom rows** — the upstream emits one `cancellations[]` record per cancel *event* (its `id` embeds a submission timestamp, `Flight Cancels Record\|key\|BK-…\|27/04/2026 10:36:20`), so a booking cancelled → restored → re-cancelled carries several records under one `bookingId`. `attachCancelDetails()` (p113) assumed one record per booking and pushed a synthetic flight per record, all sharing id `CANCEL_<bookingId>` → 5 bookingIds duplicated into 6 phantom rows (3 of them AP-127; `THANATHIP W. / CSPGL 51 / 2026-06-06` rendered **3×**), plus colliding React keys. Fixed by collapsing to the most recent record per `bookingId` first (same last-wins rule the watchdog's `attachCancelReasons()` uses). The match guard also stopped being `status === 'Canceled'`: during an upstream scraper flap the row can read `Pending` while its Cancel Record is already submitted, and pushing a virtual then duplicated a booking that IS on the schedule — a real row now always wins and has its status corrected, the frontend counterpart of the watchdog's `diff.js:stabilizeCancelledFlights()`. (2) **Same flight ingested twice as two `ACTUAL_ONLY` rows** under different `_ACT_<n>` record ids (e.g. `…BK-4EUB-2369_ACT_1344` / `_ACT_1356`, identical date/student/lesson/times/tail). The existing dedup pass only ever removes *planned* rows and keeps every `ACTUAL_ONLY` row unconditionally, so these survived and **double-counted block hours**. New `dedupeIdenticalActuals()` second pass removes 67 such rows. Guarded on a non-empty student **on purpose** — studentless bookings (`MEETING` / `KEY PERSONNEL MEETING`) legitimately repeat at the same time on the same day as genuinely separate bookings, and collapsing those would hide real entries (all 26 meetings verified preserved; the 13 remaining same-signature rows are exactly those, each with its own distinct id). **Net effect, verified by replaying both preludes over the same live feed:** rows 3806 → 3733, overall hours inflation 2.81% → 1.11%, **AP-127 inflation 0.67% → 0%** (1337.9 h → 1328.9 h; 12 redundant rows, 9.0 h). Today's figures are byte-identical before/after (30 rows, 52.0 h, AP-127 7 flights / 5.0 h) — the correction is entirely historical. Nearly all of it traces to `flight_schedule.pre_migration_archive.json`, the frozen old-portal data re-applied as an override every run, so it could never self-heal upstream: 425 of the 427 raw-feed redundant rows are on dates ≤2026-07-09, and the post-migration scraper has added none. **Known and deliberately NOT fixed here:** 60 ids still map to genuinely *different* flights (worst: `ACTUAL_ONLY_` with an empty suffix, 21 rows) — an upstream id-generation bug, data correct / identity broken. All 206 such rows fall on 2026-05-05→2026-06-10, outside the watchdog's rolling snapshot window, so notifications are unaffected; the only cost is duplicate React keys on those historical dates. | `js/shared.js`, `index.html` |
| 2026-07-27 | **Full-view audit: every tab exercised live, 6 defects found and fixed, same `p116` deploy as the row above** | User: "go through all tab and functions, verify all system if it working correctly, suggest improvement." All 17 views exercised on production — zero console errors, every KPI reconciles against the raw feed. Fixes: **(1) `ap127-data-api` CORS was hardcoded to one origin** (`ALLOWED_ORIGIN` = DB_Share only) — CMDV2's and CMDV3's own live progress fetch always failed with a browser CORS error and silently fell back to snapshot, so the header's `⚠` next to PROG was *permanent*, not intermittent. Gave the worker a proper home at `AP127_NGT_001/data-api/` (previously deployed ad hoc with no source in any repo) and switched to the same reflect-if-allowlisted `ALLOWED_ORIGINS` set the watchdog worker already uses. Verified live: all three origins now get 200 + a matching CORS header. **(2) `OTHER` batch-type chip could never reveal blank-batch flights** (`KEY PERSONNEL MEETING`, `batch:""`) — the whitelist builder's `.filter(b => b && …)` dropped the empty string before it ever reached `filters.batches.includes(x.batch)`. Changed to `b != null`. **(3) New "PUB" header chip** — days the Ops Portal has actually published forward, kept deliberately separate from fetch-freshness because it silently swings 0–8 days based on what the academy has posted; traced 30 days of history and found it decaying 3→2→1→0 with nothing in the UI ever saying so. New `scheduleCoverage` in the app context, rendered in both the desktop top bar and mobile sidebar. **(4) Board's TOTAL tile now flags when a filter hides flights** — e.g. `TOTAL 22 · of 30 total` under the default AP-only filter. **(5) CF Usage's key gate rewritten** to explain what the key is and that it's shared with the Watchdog tab (previously just said "Watchdog API key:" with no context). **(6) Watchdog Notification Log was rendering every row unvirtualized** — measured 8,579 rows / ~60,000 DOM nodes for a busy month. No virtualization lib is loaded (no-build/CDN-only project), so added plain pagination (100/page, resets on search) — verified via a mocked 8,579-row fetch that only 100 rows ever mount. **(7) Accessibility:** added `<main>`/`<nav aria-label>` landmarks and `aria-current="page"` — previously the whole app had none beyond a bare `<div id="root">`. | `js/shared.js`, `js/shell.js`, `js/view-board.js`, `js/view-schedule.js`, `js/view-cf-usage.js`, `js/view-watchdog.js`, `AP127_NGT_001/data-api/worker.js` (new), `index.html` |
| 2026-07-17 | **Fix: ASF rank data was 6 weeks stale — primary cache URL repointed** (`p112`) | `ASF_CACHE_URL` pointed at `ap127cmd.github.io/DB001/cache.json`, whose GitHub Pages deployment silently stopped 2026-06-03 (DB001's `actions/deploy-pages` job was removed as legacy but Pages stayed in `build_type: workflow`, so the last deploy froze). The URL kept returning HTTP 200 with June data, so the fresh fallback (`raw.githubusercontent`) was never tried — the Auto Slot Finder ranked SPs on 6-week-old done/next_lesson (masked partly by `asfOpsAugment`'s ops-merge). Primary now `https://ap127-db001.pages.dev/cache.json` (CF Pages, fresh ~60s after DB001 push — same reasoning as `refresh_snapshots.mjs`'s NGT_SRC), fallback unchanged. Same fix in `ops/js` copy (`r41`) and upstream CMD_CTR (`r44`). | `js/view-autoslotfinder.js`, `ops/js/view-autoslotfinder.js`, `index.html`, `ops/index.html` |
| 2026-07-04 | **Watchdog: full batch picker + clickable log rows** (`p111`) | **Destinations:** batch-filter UI replaced with a live checkbox grid over every real batch value in `window.FLIGHT_DATA` (`getAllBatches()`) plus quick-select chips (AP-127/Other AP/HP/PPL/Other/All/Clear); "Other"+"All" are computed dynamically against the live batch list instead of a hardcoded array, so previously-missed values (`TCAR`, `TCAR CONV`, `RECURRENT` vs `Recurrent`, `TEST FLIGHT` vs `Test Flight`, `TCAR / LPC` spacing) are now selectable and correctly recognized in the read-only table label. `detectCategory`/`BATCH_CATEGORIES` removed, replaced by `resolveBatchFilter()`/`quickPresets()`. **Log panel:** rows are now clickable — opens a new `LogDetailModal` showing student/lesson/date/time/aircraft/instructor/flight ID and the full diff (`from → to`) for CHANGED/STATUS entries. Confirmed already-live from a prior session: log search + sticky header (`p110`) and the personal-DM "Nu" destination (`studentFilter: "ANUSORN T."`, `batchFilter: "*"`) for exclusive notifications to one SP. | `js/view-watchdog.js`, `index.html` |
| 2026-07-04 | **Watchdog: log search, sticky header, studentFilter** (`p110`) | Log panel gains a live search input (filters by SP name, lesson, date, type, or change text) and a "N / total" count; `<thead>` is now `position:sticky` so column labels stay visible while scrolling. Destinations panel: new **SP** column shows `studentFilter` per row; `DestinationFormModal` has a new "Student only" field (datalist from roster) with a DM hint when filled. Worker `src/index.js`: new check `if (dest.studentFilter && event.flight.student !== dest.studentFilter) continue;` so any destination can be scoped to one SP's flights. | `js/view-watchdog.js`, `watchdog/src/index.js`, `index.html` |
| 2026-07-01 | **Fix: Gantt NOW-line used viewer's local clock, not Bangkok** (`p109`) | `bkkNowMin()` (the Gantt current-time marker) lived only in `view-gantt.js` and computed Bangkok minutes-of-day via `n.getTime() + (n.getTimezoneOffset()+420)*60000` — wrong for any viewer whose device timezone isn't UTC+0 (e.g. a viewer already in Bangkok got UTC hours instead of local; other offsets landed on neither). This is the same class of bug `p95`/I1 fixed for `bkkToday()` but the Gantt NOW-line's own helper never got the same treatment. Moved `bkkNowMin()` into `shared.js` next to `bkkToday()`, rebuilt on the same `Intl.DateTimeFormat({timeZone:'Asia/Bangkok'})` approach (`formatToParts` → hour/minute), with a viewer-tz-independent fallback (fixed 7h added to the absolute epoch, not `getTimezoneOffset()`). Also fixed the same latent bug in `bkkToday()`'s own no-Intl fallback. Verified in-browser: `bkkNowMin()` now matches `Intl` Bangkok wall-clock exactly. | `js/shared.js`, `js/view-gantt.js`, `index.html` |
| 2026-06-26 | **Fleet Load Distribution — hide zero-hour tails when filtered** (`p108`) | `visEntries` filters `entries` to `hours > 0` before rendering bars, matching the heatmap roster behaviour. Verified: ◆ AP-127 filter reduces 19 → 11 bars. | `js/view-aircraft.js`, `index.html` |
| 2026-06-26 | **Effective metric — Utilization, FI Stat, SP Stat** (`p107`) | Added "Effective" as a third metric mode alongside Block and Airborne across all three Aircraft Status sub-tabs. Effective hours = curriculum `planned_mins` per lesson from `window.NGT_CACHE`. `uBuildCurMap()` merges cur124/126/127 into a lookup; `uEffectiveMins()` resolves per flight (exact match → planned; `/1` split → full planned of base; `/2+` → 0; unknown → block fallback). Filter bar gains an Effective button; KPI label updates; chart Y-axis title updates; ⚠ note shown. | `js/view-aircraft.js`, `index.html` |
| 2026-06-26 | **Name normalization — strip "(Unplanned)"** (`p106`) | `shared.js` now strips ` (Unplanned)` suffix from `f.student` and `f.instructor` in-place after dedup, project-wide. "STUDENT NAME (Unplanned)" merges with "STUDENT NAME" everywhere — SP Stat Active SPs: 137 → 105, avg/SP: 8.8h → 11.5h. | `js/shared.js`, `index.html` |
| 2026-06-26 | **FI Stat + SP Stat tabs** (`p105`) | Added 2 new sub-tabs to Aircraft Status view (now 5 tabs total). Shared `PersonStatTab({mode})` component powers both. FI Stat: per-instructor heatmap roster (flat, sorted by hours, cyan), load distribution bars, daily A/C-type chart, KPI strip, detail drawer. SP Stat: identical structure but per-student, grouped by batch with distinct palette colors per batch, batch headers collapsible. Both share full filter bar (date presets, type chips, +Sims, Block/Airborne, +Pending, ◆ AP-127). Drawer shows opposite person field (FI tab → student; SP tab → instructor) plus A/C tail+type, batch, lesson. | `js/view-aircraft.js`, `index.html` |
| 2026-06-26 | **Utilization tab — AP127 filter + row hiding** (`p104`) | Added ◆ AP-127 toggle button to Utilization filter bar (filters heatmap/charts to AP127-batch flights only, default OFF). Hidden rows: aircraft tails with 0 matching flights are now suppressed from the heatmap roster; type group headers are also hidden when all their aircraft are filtered out. | `js/view-aircraft.js`, `index.html` |
| 2026-06-26 | **Aircraft Utilization tab ✅** (`p103`) | Added a 3rd tab "Utilization" to `view-aircraft.js` (alongside Fleet & OPS Cross-Check). Reads `FLIGHT_DATA.flights` directly — no Google Sheet dependency. Features: full filter bar (date presets 1d/7d/30d/90d/month/custom, type chips, +Sims toggle, Block/Airborne metric, +Pending toggle, live summary); KPI strip (total hours, flights done, active A/C, avg/aircraft, busiest tail); Fleet Load Distribution horizontal bars sorted by hours with avg marker and 🔧 maint badges; Daily Hours stacked bar chart (Chart.js, by type + fleet-total dashed line); Utilization Roster heatmap (rows = tails grouped by collapsible type, cols = days, cells color-intensity-scaled by hours, 🔧 for maintenance, click to open drawer); Detail Drawer (slide-in panel with day/week/month/period totals + full flight list). Block time default, airborne switchable with fallback note. | `js/view-aircraft.js`, `index.html` |
| 2026-06-25 | **Time Travel data-filter fix ✅** (`p102`) | `ap127AsOfStudents()` filters G.ap127 per-student flown to ≤asOf, recomputes done/pct/next_lesson; fixed TDZ bug in renderAP127Detail. |
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

### Time Travel — full data filter fix (2026-06-25, p102)

`js/view-cohort.js`

Root-cause fix for time travel. Previous implementation (p101) replaced `ap127TodayBKK()` date cutoffs but left raw `G.ap127` student data (with pre-computed `s.done`, unfiltered `s.flown`) feeding all render functions — so KPI tiles, table rows, sort order, Pace Monitor, and charts all showed live data regardless of selected date.

**`ap127AsOfStudents()`** added: returns `G.ap127` with each student's `flown` filtered to `≤ asOf` date and `done`/`pct`/`remaining`/`next_lesson` recomputed. In live mode (`COHORT_AS_OF === null`) returns the raw array reference unchanged (zero cost). Used in: `renderAP127Detail`, `renderAP127Pace`, `buildAP127CombinedChart`, `buildAP127HistBatch`, `buildAP127HistSolo`, `setAP127RaceMode`.

Also fixed: `today0` was declared AFTER it was used at lines 435–436 in `renderAP127Detail` (temporal dead zone bug, pre-existing). Hoisted `today0` to top of function; removed dead `sortedLead`/`sortedLag`/`aheadNames`/`lagNames` block that referenced it; collapsed duplicate `today0`/`today` into one.

### Time Travel — sticky scrubber + amber banner + date picker (2026-06-25, p101)

`js/view-cohort.js`, `index.html`

AP127 Detail tab now supports time travel — every chart, KPI, table row, and panel can show data as of any past date.

- **`COHORT_AS_OF`** state var (null = live). **`ap127AsOf()`** helper replaces all 11 inline `ap127TodayBKK()` render-scope call sites across renderAP127Pace, renderAP127Detail, openAP127Drawer, buildAP127Timeline, buildAP127RaceChart, buildAP127OverallChart, buildAP127CombinedChart, buildAP127HistBatch, buildAP127HistSolo.
- **Sticky scrubber bar** (`#tt-scrubber-wrap`, `position:sticky;top:48px`): custom div-based track + draggable thumb + date chip, pointer-event-driven, 150ms debounce on re-render. Month ticks auto-generated from batch start to real today.
- **Amber banner** (`#tt-banner`): hidden in live mode, shows `⏪ TIME TRAVEL MODE — data as of DATE` + "Return to Live" button when time-travel active.
- **Date picker** in `.d127-controls` row (`#tt-date-input`): synced bidirectionally with scrubber. "Live" button resets both.
- `setCohortAsOf(ds)`, `updateScrubber()`, `initScrubber()` functions added. `initScrubber()` called from `mountProgress`. `updateScrubber()` called at end of `renderAP127Detail`. `setCohortAsOf` and `ap127AsOf` exposed on `window`.
- History charts (HistBatch, HistSolo) x-axis naturally caps at selected as-of date — no extra logic needed.

### Progress view panel reorder (2026-06-25, p100)

`js/view-cohort.js` MARKUP only — no logic changes.

New order: Combined Progress vs Plan → Batch Lead/Lag History → Actual vs Planned → Individual Lead/Lag vs Plan → Flight Timeline vs Progress → Overall Progress Bar View.

### History Charts — Batch Lead/Lag & Individual Lead/Lag (2026-06-25, p99)

`js/view-cohort.js`

Two new panels added at the bottom of the Progress view showing lead/lag (actual − planned cumulative) over time:

- **Batch Lead/Lag History** (`d127-hist-batch`): Single line chart — batch-wide delta (Σ actual − Σ planned × 28SP) over time. Fill green above zero / red below. KPI strip: Now / Best / Worst delta. Independent Hours/Lessons toggle (default hours). `HIST_BATCH_MODE` state var. `setHistBatchMode(m)` / `buildAP127HistBatch()` functions.
- **Individual Lead/Lag vs Plan** (`d127-hist-solo`): Per-student delta lines (28 lines, same hue-per-index as race chart) + bold magenta batch avg. Zero reference line. Shares `AP127_RACE_MODE` and `AP127_RACE_SOLO` with the Actual vs Planned race chart — student toggles and mode chips above the race chart control both. `buildAP127HistSolo()` called from `setAP127RaceMode` + toggle click handlers.
- Delta computation: cumulative actual − cumulative planned, derived purely from in-memory `flown[]` + `cur127[]` data. No new fetch.

## 13. GOTCHAS / NOTES
- No-build React: load order matters (CDNs → data → shared → ui → views → shell boot). Use `type="text/babel"` + per-file hook aliasing.
- Babel Standalone is slow on huge files; auto-slot-finder is 1842 lines — consider splitting when porting.
- Progress live fetch can be blocked in sandboxed preview (CORS/network) → snapshot fallback kicks in; works on Pages (DashboardR1 proves it).
- "Today" is **Asia/Bangkok**; both apps have BKK-today helpers — use one shared helper.
- Names differ across feeds — always go through `reconcile.js` helpers for matching.
- AP-127 nick/fi/se arrays are **index-aligned** to `ap127[]` order — keep order stable when refreshing snapshot.
- Curriculum master plan (`cur127`) is an aggressive idealized schedule (expects ~26 lessons by 2026-05-31; best student ~15) → the whole cohort reads "behind plan". Use relative metrics (pace spread, day/hrs delta) for meaningful signals, not raw behind-plan counts.

### Ops Analytics tab — full revamp (2026-07-28, p117)

`js/view-summary.js` (full rewrite, ~955 lines, IIFE-wrapped — replaces the old donut-chart + 3-table
"AP BATCH COMPARISON" layout entirely).

The old Analytics tab (donut chart of flights-per-batch + separate AP-127 students / batch breakdown /
instructor tables, no date-range or dimension filtering beyond the header's AP-127 focus toggle) is
gone. The new tab is period- and multi-dimension-filterable, batch-centric analytics:

- **Header:** period presets (14D / 30D / 90D / CUSTOM with explicit from/to date pickers), a
  Block/Effective metric toggle (Effective substitutes curriculum `planned_mins` per lesson), the
  existing AP-127 focus + ONLY controls, and SYNC.
- **Filter panel** (collapsible): 6 independent dimensions — status (pending/completed/canceled/standby),
  batch (AP only / all / custom multi-select), instructor (searchable multi-select), student
  (searchable multi-select), aircraft type, and simulator — all composing into one `filteredFlights`.
- **13-tile KPI strip:** total/pending/completed/canceled/standby/sim counts, hours, completion rate,
  cancellation rate, avg hours/flight, batch count, student count, and AP-127 share of hours.
- **Batch composition strip:** a single segmented bar + legend showing each batch's share of
  completed hours in the selected period.
- **4 stacked bar charts** (`StackedBatchChart`, Chart.js): daily flight count, daily hours, weekly
  hours, and monthly hours — each stacked per batch, with per-segment data labels and a per-chart
  legend that toggles individual batch series on/off.
- **Batch breakdown table:** per-batch pending/completed/canceled/standby counts and hours for the
  selected period.
- **Student and instructor rosters,** each a day-by-day heatmap (`RosterHeatmap`, click a cell to open
  the flight drawer) governed by the active filters/period, plus an **all-time cumulative summary**
  table (`CumulativeTable`, click a row to open the drawer) that is deliberately period-invariant —
  it always reflects the student/instructor's full history regardless of the header's date range,
  grouped by batch for students, flat (ungrouped) for instructors.

Built across Tasks 1-11 of `docs/superpowers/plans/2026-07-28-ops-analytics-revamp.md`; full design in
`docs/superpowers/specs/2026-07-28-ops-analytics-revamp-design.md`. Mobile-verified: KPI strip wraps to
3 columns, the chart grid collapses to one column, the filter panel's dimension grid stacks to 2
columns without overlapping text, and both roster heatmaps scroll horizontally inside their own
container — zero page-level horizontal overflow at 390px width.

### Ops Analytics — whole-branch review fixes (2026-07-29, p118)

`js/view-summary.js`

A final whole-branch review (after all 12 build tasks individually passed review) caught 5 issues only
visible reading the whole ~955-line file together — each individual task's diff was too narrow to show
them. All fixed in one pass, re-reviewed clean:

- **AP-127 ONLY toggle was a no-op** — `<FocusControls/>` rendered in the header, but `filteredFlights`
  never read `hideOthers`/`highlightAP127`, so clicking ONLY changed nothing. Now filters correctly
  (mirrors the `hideOthers && highlightAP127 && !isAP127Batch(...)` pattern already used in
  `view-gantt.js`/`view-weekly.js`).
- **STATUS=Standby matched zero flights** — Standby is `f.isStandby` (a flag), not a value of
  `f.status`; selecting it alone blanked the tab. Fixed to OR against `isStandby` alongside the status
  list, matching `shared.js`'s own `dayFlights` filter convention.
- **Batch Composition strip showed invisible slivers** whenever the filtered set had flights but zero
  *completed* hours (e.g. a Pending-only status filter) — every segment floored at its minimum-visible
  width with 0.0% legends, no indication anything was filtered out. Now shows an explicit "NO COMPLETED
  HOURS IN FILTERED SET" state instead.
- **Chart data-label text was illegible in light/warm themes** (hardcoded near-black `#0b0e14`, tuned
  only for the dark theme's lighter batch colors). Now resolves from `--bg`. Note: this — like every
  other `getComputedStyle(document.documentElement)` color read in this app, a pre-existing pattern
  predating this feature — is still theme-*invariant* in practice, because theme overrides live on
  `body[data-theme]` and `document.documentElement` (`<html>`) never sees a descendant's overrides;
  fixing that for real needs a codebase-wide change, out of scope here. This fix keeps the label and
  bar colors resolving through the same (theme-invariant) mechanism, so they stay mutually legible.
- **Roster heatmap resolved a cell's color even when unused** — `RosterHeatmap` called `colorOf(row,d)`
  for every cell before checking if it had a nonzero value; at a 90-day period with many rows that's
  tens of thousands of wasted `getComputedStyle` calls per render. Moved inside the `v > 0` branch.

Also cleaned up in the same pass: stale internal "(Task N)" comments, a dormant leave-badge lookup bug
in `BreakdownTable` (querying `leavesOnDate()`, which is keyed by person name, with a batch name — the
old pre-rewrite file guarded this and the port dropped the guard; restored), and hoisted three
inline-per-render subcomponents (`Tile`, `PresetChip`, `MetricChip`) to top-level to stop them
remounting on every render.

### Ops Analytics follow-up — chart fixes, Sim split, batch-grouped roster, Batch Summary (2026-07-29, p119)

`js/view-summary.js`

Six follow-up changes based on user feedback after using the live `p118` rebuild, built via a
19-task subagent-driven plan (Tasks 13-18 code, Task 19 wrap-up). Design:
`docs/superpowers/specs/2026-07-29-ops-analytics-followup-design.md`; task-by-task implementation
history: `docs/superpowers/plans/2026-07-29-ops-analytics-followup.md`.

- **Chart data-labels only rendering on hover (fix)** — `StackedBatchChart`'s Chart.js `options` had
  no `animation` override, so the default ~1000ms entrance animation raced the `datalabels` plugin's
  per-segment `display` callback (which checks the *rendered* bar element's height, not final until
  after layout settles); hovering forced a redraw that happened to land after layout stabilized, which
  is why labels only ever appeared on hover. Set `animation: false` — labels are now correct from first
  paint, no other logic changed.
- **Per-stack total labels (new)** — all 4 `StackedBatchChart` panels (daily count, daily hours, weekly
  hours, monthly hours) now render a grand-total figure above each full bar, via a zero-height `TOTAL`
  dataset whose `datalabels` anchor sits just past the top of the real stack (excluded from the legend
  and tooltip).
- **Sim flights included by default, with a visual split (new)** — the `SIMULATOR` filter now defaults
  to ON (was off). All 4 charts and the Batch Composition strip split each batch's segment into a solid
  (real) + lighter-tint (sim) stacked pair (`sLightenOklch()` on the batch's own resolved color, so Sim
  stays visually tied to its batch, not a separate color). KPI strip gains a new **SIM HOURS** tile;
  the existing HOURS/COMPLETION/CANCELLATION/AVG H/FLIGHT tiles now report real (non-sim) flights only
  — verified by toggling SIMULATOR off/on: SIM/SIM HOURS respond, HOURS/COMPLETION/CANCELLATION/
  AVG H/FLIGHT/AP-127 SHARE stay stable either way. BATCHES/STUDENTS are combined counts (a batch or
  student whose only activity in the period is simulator time still drops out when SIMULATOR is off —
  intentional, not a bug). Breakdown table and both rosters stay combined (unaffected by the toggle,
  as before).
- **Student roster grouped by batch (new)** — `RosterHeatmap` gained an optional `groupOf` prop that
  renders a colored batch-header row (name + student count) above each batch's students, ordered
  `AP_BATCH_ORDER` first, then non-AP batches in whichever order their first alphabetically-sorted
  student happens to appear (a batch-name-alphabetical tiebreak for the non-AP tail is a known,
  documented follow-up — see the 2026-07-29 whole-branch-review-fixes entry below); wired for the
  student roster only. The instructor roster call site is unchanged (no `groupOf`, flat list) —
  confirmed backward-compatible.
- **Batch Summary (new)** — a new all-time section below Batch Composition: per-batch students,
  lessons done/total, hours done/total, time remaining, lessons/hours remaining, and required daily
  pace (or DONE/OVERDUE), sourced from `window.NGT_CACHE`'s separate progress-reconciliation feed (the
  same one `js/view-cohort.js`'s Progress tab uses — pre-computed `flown`/`planned` minutes per
  student, NOT derived from `FLIGHTS`/`hoursOf`, so it's unaffected by the header's Effective/Block
  metric toggle). Governed by the header's BATCH filter, same convention as the existing cumulative
  tables. **AP-128 shows an explicit "NO PLAN DATA" row** rather than being hidden — it has zero
  entries anywhere in `NGT_CACHE` (confirmed against the live feed, not a display bug). Target date =
  the shared curriculum's own official last `planned_date` for AP-124/126/127; the latest of the
  batch's students' individual `finish` dates for AP-129 (no shared curriculum array exists for it).
- **Confirmed correct, no change** — the daily/weekly/monthly hours charts showing 0 for the most
  recent dates in a period is expected behavior (those flights are still `Pending`, not yet flown),
  not a bug; left as-is per explicit user sign-off in the design spec.

Full end-to-end regression pass (Task 19) exercised all six changes together on one fresh load —
data labels visible without hovering on all 4 charts, a total above every stacked bar, SIMULATOR
defaulting to "SHOWING SIM", the sim toggle round-tripping correctly, the roster's batch headers,
Batch Summary's AP-128 "NO PLAN DATA" row and its narrowing when the BATCH filter changes, a chart
legend click, a roster heatmap cell click, a cumulative-table row click, and a Batch Summary
batch-name click (confirmed inert, no handler) — zero console errors throughout, no integration
issues found, no code fix needed. Only file touched: `js/view-summary.js`.

### Ops Analytics follow-up — whole-branch review fixes (2026-07-29, p120)

`js/view-summary.js`

A final whole-branch review of the six changes above (opus, full diff since the `p118` state) found
two Important, emergent-only issues — each invisible to the six individual task reviews, since both
are cross-cutting interactions that only exist once the whole round is viewed together:

- **Batch Summary's lesson-done counts drifted after visiting other tabs.** `batchSummaryRows` read
  `s.done` off the shared `window.NGT_CACHE` student records — but `js/view-program.js`'s
  `normalizeStudentDone()` mutates those SAME objects in place (raising `done`/`remaining`/`pct`) the
  first time the user opens School Performance, School Analysis, or Simulation. Verified against the
  live feed: AP-127's lesson-done count read 907 on a fresh load, 949 after a Program-tab visit — and
  since `hoursDone`/`hoursTotal` are summed from the (unmutated) `flown`/`planned` arrays, a
  post-mutation Batch Summary row showed `LESSONS REM.` and `HOURS REM.` describing two different sets
  of remaining work, so the two REQUIRED PACE figures (h/d and L/d) stopped agreeing with each other.
  Fixed: read `(s.flown || []).length` instead of `s.done` — the same array `hoursDone` already sums,
  so lessons and hours now stay aligned by construction regardless of what any other view does to the
  shared cache object. Re-verified: value held at 907 across a Program-tab round-trip.
- **Composition strip's Sim tint broke in non-default themes.** The sim sub-segment resolved its color
  via `getComputedStyle(document.documentElement)` (the same pre-existing, documented, codebase-wide
  theme-invariance limitation noted in the `p118` entry above) — before this round `CompositionStrip`
  was pure CSS-var and fully theme-correct; this round put the first theme-invariant color into its
  DOM output. In the live light theme this produced a dark-violet-next-to-pale-pink mismatch for
  AP-127 and a near-invisible sim segment for AP-129. First fix attempt (`color-mix(in oklch, ...)`)
  removed the theme-invariance but introduced a NEW defect the review's own re-check caught: `oklch`
  interpolates through the polar hue channel, rotating some batches' sim tint by up to 74° (AP-128's
  sim segment rendered magenta, AP-129's rendered green) — worst in the *default* cockpit theme, where
  the original code had been hue-correct. Final fix: `color-mix(in oklab, ...)` — a rectangular color
  space, holds hue within ~2-5° for all five batches in every theme (verified live via computed-style
  extraction: AP-128 cockpit 50°→48.8°, AP-127 cockpit 316°→313°). `StackedBatchChart`'s
  `sLightenOklch()` (the canvas path, which genuinely cannot consume `color-mix()`/CSS vars) is
  untouched.

Both fixes re-reviewed clean. **Known, documented, deliberately-not-fixed-this-round follow-ups**
(all Minor, all "safely post-deploy" per the review): the non-AP batch group order in the student
roster follows first-appearing-student-alphabetically rather than batch-name-alphabetically (cosmetic,
only visible under `BATCH=ALL`/`CUSTOM`); stack-total labels can drift by up to 0.1h from the sum of
their rounded segment labels in an edge case; the per-chart legend now has up to 2× the entries (real
+ sim per batch) and a legend click only toggles one half of a batch's pair; the Sim/Real bucket
builders in `dailyBuckets`/`weeklyBuckets`/`monthlyBuckets` have grown more duplicated (candidate for
a `sBucketBy`/`sProject` helper pair — a "do it next round" per the review, not this one); `sBatchRoster`
doesn't guard against `NGT_CACHE[key]` being a malformed non-array (would throw on render, low
likelihood given the feed is a static generated snapshot); `BATCH_ROSTER_KEY`/`BATCH_CUR_KEY` are a
second batch-identity registry alongside `AP_BATCH_ORDER` that could drift out of sync if a new batch
is added later without updating both; and the strip's sim tint now visually darkens (mixes toward
`--surface`) while the charts' sim tint lightens (`sLightenOklch`) — same concept, two directions,
worth a deliberate future decision rather than an accidental inconsistency.

### AP127 Detail V4 — new redesigned duplicate tab (2026-08-02, p121)

`js/view-cohort-v4.js` (new, ~1850 lines), `js/shell.js`, `index.html`, `css/progress.css`

User asked for a full redesign pass on the AP127 Detail tab without touching the existing one, so it
duplicated to a brand-new sidebar tab **"AP127 Detail V4"** (`view-id: cohort-v4`) built from a full
copy of `js/view-cohort.js`'s logic. **`js/view-cohort.js` itself is untouched — byte-identical.**
V4 is fully independent: every DOM id is `d127v4-`/`tt-*-v4` prefixed and every function the original
exposes on `window` (for its inline `onclick=` markup) is re-exposed under a `...V4` key, so both
tabs' scripts can load on the same page without clobbering each other's globals — verified by
cross-checking every `getElementById` call against the markup and every inline handler against the
`Object.assign(window, {...})` export list (script, not just eyeballed). Internal helper names were
deliberately kept identical to the original (same math, easy to diff) — safe since both files are
separately IIFE-scoped closures.

- **Fixed the sticky time-slider covering the tab title.** Root cause: the original's history
  scrubber (`position:sticky;top:48px`) sits *before* the `<h1>` title in DOM order, and its natural
  resting position is above the sticky threshold — so it "activates" and pins over the title almost
  as soon as any scroll happens, live-verified on the original tab (screenshot showed the title text
  rendering cut off/behind the bar). V4 reorders the markup (title first, non-sticky) and merges the
  scrubber + search/sort/date controls into one sticky toolbar at `top:0` (relative to the panel's own
  scroll container, not the old copy-pasted `48px`) directly below the title — standard sticky-header
  pattern, confirmed live: title stays fully visible, toolbar pins cleanly once scrolled past.
- **Pace Monitor redesigned** — the dense multi-row table replaced with 4 headline cards (Plan End,
  Cohort ETC, On Track, At Risk) + bullet-bar comparisons (actual vs. a target tick mark) for Hours/wk
  and Lessons/wk at both the 1-SP and 28-SP-batch level, plus a highlighted "Required Action" banner.
  Same underlying math as the original (verified against it side-by-side — both showed identical
  102h/wk actual, 233h/wk need, etc.) — presentation only.
- **Pace Band redesigned** as a Chart.js histogram (students binned by lessons-done) + a smoothed
  curve overlay + a dashed batch-average reference line/label, replacing the old 3-band colored-chip
  list.
- **New: Consecutive & Idle Streaks chart** — per-student daily streak series (+N = currently on an
  N-day flying streak, −N = currently on an N-day idle streak, flips sign on state change) plus a
  batch-average line. Deliberately reuses the *same* `AP127_RACE_SOLO` filter variable and per-student
  hue formula as the Actual vs Planned chart (not just visually matching colors — an actual shared
  selection state), so isolating a student there also isolates them here.
- **New: Daily Output bar chart** (lessons or hours per day/week/month, toggleable) with a moving-
  average overlay line (7-period/4-period/3-period depending on granularity), data labels, and hover
  tooltips — uses the already-loaded `chartjs-plugin-datalabels` (registered once via
  `Chart.register(window.ChartDataLabels)`, same guarded pattern `view-summary.js` already uses).
- **Overall Progress Bar View redesigned** — x-axis now spans the *full* curriculum (was: only up to
  the furthest-ahead student's done count) so the empty space reads as "lessons remaining"; bars are
  now stacked by curriculum phase (color-matched to the existing phase legend) instead of one solid
  rainbow hue per student, with the student's current/next lesson code printed at the bar's end via a
  small canvas plugin.
  - Building this exposed a real, pre-existing gap in the phase-classifier (`ap127LessonPhase`,
    reused verbatim from the original): its regexes are prefix-anchored against bare codes like `GL`/
    `XV`, but the actual curriculum codes are compound (`CSPGL 36`, `CDXV 29`, `CMDGL 5`, verified by
    sampling every distinct code prefix in `progress-data.js`) — so almost everything except literal
    `CDGL *` fell into "Other." Fixed **only in the V4 copy** (the original's Timeline dot-coloring is
    unchanged) by switching to substring matching in a priority order verified against all 21 real
    prefixes, keeping `M` (multi-engine, `CM*`) and `CDGL` prefix-anchored so they still win over their
    embedded `GL`/`XV` substrings. Confirmed live: stacked bars went from solid-orange-then-gray to a
    real CDGL→IF/IL→XV/XI→GL breakdown, and the new Phase Progress Funnel chart went from one bucket
    to meaningful per-phase percentages.
- **New: Phase Progress Funnel chart** — batch-wide done-vs-remaining lesson-slots per curriculum
  phase, showing where the batch is bottlenecked.
- **New: AP127 Roster** — day-by-day activity heatmap (cells colored by lesson phase, one row per
  student, sticky name column) plus an all-time cumulative summary grouped by instructor — the Ops
  Analytics tab's roster pattern (`RosterHeatmap`/grouped cumulative list), rebuilt AP127-only and
  matching this file's plain-DOM-string rendering style rather than importing the React component
  (which lives in a separate IIFE closure in `view-summary.js` and isn't exposed to `window`).
- **New: Weekday Activity Pattern chart** — all-time lessons+hours by day-of-week, dual y-axis.
- **New: "Needs Attention" watchlist** — compact side-panel list of students idle ≥5 days or ≥3h
  behind plan, click-through to the same detail drawer as the main table.
- Everything else (Combined Progress vs Plan, Batch Lead/Lag History, Actual vs Planned, Individual
  Lead/Lag vs Plan, Flight Timeline vs Progress, drawer) is carried over with identical behavior —
  duplicated, not reinvented.
- Also fixed (V4 only): `closeAP127Drawer()` now null-guards its `getElementById` lookup — the
  original throws if Escape is pressed while the *other* tab's drawer DOM doesn't exist, because both
  files' `keydown` listeners are always registered once each script loads, regardless of which tab is
  currently mounted.

Verified live (local static server, both AP127 Detail and AP127 Detail V4 exercised): zero console
errors on load or on any interaction tried (sort, search, time-travel scrubber, range/period/unit
toggles, student solo-filter, row click → drawer → close, mobile 375px width). The apparent "browser
hung mid-scroll" symptom during testing was `chartjs-plugin-zoom`'s wheel handler on the Combined
Progress chart capturing the scroll gesture (pre-existing behavior, also present in the original tab)
— not a real hang; confirmed via `scrollTop` assignment + `Chart.getChart()` canvas count while the
gesture-based scroll was "stuck." Data itself (911/2688 lessons, -902.3h vs plan, batch ETC 2026-07-29
already past the 2026-11-27 plan end) is identical between the two tabs and reflects the bundled
snapshot's own staleness relative to "today," not a bug in either tab.

### AP127 Detail V4 — follow-up round on Overall Progress + Roster (2026-08-02, p122)

`js/view-cohort-v4.js`, `css/progress.css`

Same day as the `p121` build above — direct user feedback after trying the live `p121` tab.

- **Overall Progress Bar View reworked again.** The `p121` version stacked each SP's bar into 7
  phase-colored segments; the user wanted that reverted (no accumulation/stacking) in favor of a
  single bar reaching the lesson NUMBER they've completed to, still colored by phase (of their
  last-flown lesson, not per-student rainbow) so the "which stage is this SP in" signal survives
  without the stacking. Added dashed vertical **milestone lines** marking where the curriculum's
  major stages first begin — "Initial Solo" and "Multiengine" — computed from `G.cur127` in
  curriculum order via a new coarse classifier, `ap127OverallStage()`: `CM*`-prefixed lessons →
  Multiengine, any lesson containing `SP`/`PIC` → Initial Solo, everything else is the implicit
  starting stage (no line needed at position 0, the chart already starts there). This is
  deliberately coarser than the 7-way `ap127LessonPhase()` classifier used for bar/cell coloring
  elsewhere — the real curriculum interleaves solo/dual/night lessons rather than running them in
  clean contiguous blocks (confirmed by sampling `progress-data.js` again), so "first occurrence of
  each named stage" is the honest reading of "add a line where each major phase begins," not a full
  partition. Since a single dataset with a per-bar `backgroundColor` array can't drive Chart.js's
  own legend, replaced it with a static phase-color legend row (reusing the exact dot-legend pattern
  and color list already used by the Flight Timeline panel, so the two stay visually consistent).
- **Roster range now goes to "All time."** Added `<option value="0">All time</option>` to
  `#d127v4-roster-range` (same convention as the Pace Monitor's own range select); when selected,
  the heatmap's start date falls back to the batch's earliest flown date instead of `today − Nd`.
- **By-Instructor list now respects the same range selector** — previously it always showed
  all-time totals regardless of what the heatmap's range dropdown was set to. New
  `rangeFlown()`/`rangeHours()` helpers filter each student's `flown` array to `[start, today]`
  before summing lessons/hours, and the section heading now shows the active range live (e.g. "By
  Instructor · All time · since 20 Apr" or "· Last 30d").
- **By-Instructor made compact** — `#d127v4-fi-roster` is now a CSS grid
  (`grid-template-columns:repeat(auto-fill,minmax(310px,1fr))`, was one flat full-width column) with
  tighter row padding (`1.5px 8px 1.5px 14px`, was `4px 10px 4px 20px`) and smaller font (9.5px, was
  10.5px) — multiple instructor groups now sit side by side instead of one long vertical list. First
  attempt (260px column minimum + the original 60/52/80px stat-column widths) visually broke student
  names into "Napon…"/"Vasap…" ellipsis — there simply wasn't enough leftover flex space. Fixed by
  widening the grid minimum to 310px **and** shrinking the three stat columns to 44/44/56px;
  re-verified live that full "First L." names render without truncation at every grid width.

Verified live on a local static server: both AP127 Detail and AP127 Detail V4 exercised, phase
milestone lines checked against the actual curriculum data (Initial Solo line lands ~lesson 35,
Multiengine ~lesson 90, matching where `CSP*`/`CM*` codes first appear in `progress-data.js`), both
roster range selectors exercised including "All time," zero console errors. Only files touched:
`js/view-cohort-v4.js`, `css/progress.css`.

### AP127 Detail V4 — authoritative syllabus phases (2026-08-02, p123)

`js/view-cohort-v4.js`, `css/progress.css`

Third round of same-day feedback on the `p121`/`p122` builds above. The user pointed at
`https://ap127-flight-training.pages.dev` (Study > Diagram tab) as the source of truth for "phase" —
worth reading closely, because the two prior attempts at phase classification (`p121`'s prefix/
substring guesses off the lesson code letters, `p122`'s "first occurrence of Solo/Multiengine"
milestones) were both approximations of something that turned out to have an exact, machine-readable
answer.

- **Found the real data.** That site loads `data/syllabus.json` (confirmed via
  `read_network_requests`, then fetched directly with `fetch()` in the browser console) — 4 official
  phases with exact lesson-NUMBER ranges: **Phase I "Basic Flight Training" 1-13**, **Phase II
  "Consolidation and IFR Introduction" 14-32**, **Phase III "Advanced VFR and Night Flying" 33-55**,
  **Phase IV "IFR and Multi-Engine Training" 56-96** (96 lessons total, matching the app's own
  "96-lesson curriculum" figure). It also ships a `lessonCodeKey` decoder: `C`=Check (as a
  *trailing* suffix — `CSPGLC`, `CSPXVC`, `CSPXIC`, `CMSPXIC`, exactly the 4 codes ending in `C`,
  matching the diagram's own "CHK 4" tally), `D`=Dual, `S`=Solo, `SP`=SPIC, `M`=Multi-Engine,
  `G`=General Handling, `I`=IFR, `N`=Night, `XV`=VFR Cross Country, `XI`=IFR Cross Country. Every
  code in `progress-data.js` decodes cleanly against this key.
- **Replaced the classifier.** Since every AP127 lesson code ends in its curriculum lesson number
  (`"CSPGL 36"` = lesson 36 — verified against the syllabus.json dump directly, not assumed), phase
  membership is now a plain number-range lookup (`ap127SyllabusPhase()`/`ap127LessonNum()`) instead
  of the old regex guessing. This is exact, not heuristic.
- **Made "phase" mean the same thing everywhere in V4.** The user asked for Overall Progress's phase
  colors to match Flight Timeline and the Roster — they didn't, because each had grown its own
  classification independently across the three rounds. All four phase-colored surfaces (Timeline
  dots, Roster heatmap cells, Phase Progress Funnel, Overall Progress) now call the same
  `ap127SyllabusPhase()` and share the same 4-color palette (chosen to match the syllabus site's own
  Ph.1-4 timeline bar colors, so it's a familiar mapping to anyone who's used that site).
- **Overall Progress Bar View, third design.** Back to a **stacked** bar per SP (the `p122` build had
  reverted to a single solid bar per explicit user request at the time) — this time stacked by the
  real 4 phases, plus **fixed dashed boundary lines at the exact lesson numbers each phase starts**
  (14, 33, 56 — not the approximate "first SP/PIC or CM code" markers from `p122`). Legend and bar
  colors now match Timeline/Roster exactly.
- **Removed Weekday Activity Pattern** (one of the 3 bonus additions from the original `p121` build) —
  explicit user call, not requested going forward.
- **Roster polish:** dropped the SP callsign line under each name (one less thing competing for
  space); the Total column now reads `"18L · 24.7h"` (lesson count alongside hours, was hours-only);
  day-column headers show `"1 Jul"` on the first visible column of a new month instead of a bare day
  number every time; cell hover text now includes each flight's duration (`"CSGL 24 (1h15m)"`, was
  just the lesson code); default range dropped from 60 to 30 days (By-Instructor already inherited
  this via the shared selector from the `p122` round); heatmap cell size, row padding, and font sizes
  tightened further.

Verified live on a local static server: both tabs, zero console errors, Overall Progress boundary
lines land exactly at lesson 14/33/56, Phase Progress Funnel shows real per-phase completion
(100%/92%/11%/0% at verification time, previously one lumped "mostly Other" bucket), Roster's "All
time" range and cell hover detail both re-checked after the rewrite. Only files touched:
`js/view-cohort-v4.js`, `css/progress.css`.

### AP127 Detail V4 — Pace Monitor clarity + Daily Output off-days toggle (2026-08-02, p124)

`js/view-cohort-v4.js`

Fourth round of same-day feedback.

- **Pace Monitor's day/month sub-labels were asymmetric.** The redesigned bullet bars (from `p121`)
  showed a footnote under each bar — "1 SP · Per Week Pace" bullets said `≈ X / day`, "28 SP · Batch
  Total Per Week" bullets said `≈ X / month`, both underneath an identically-worded "Hours / wk" /
  "Lessons / wk" header. Nothing in the UI explained *why* one section converted to days and the
  other to months, so it read as if the two sections were showing different kinds of numbers rather
  than the same weekly figure sliced two ways. Fixed at the source: the shared `bullet()` helper now
  always computes and renders `≈ X/day · Y/month` under every bullet, 1-SP and 28-SP sections alike
  — one consistent format, so "per week" (the bar itself) never gets confused with "per month" (part
  of the footnote) again. Removed the per-call-site `sub` string parameter entirely now that it's
  derived internally from `actual` — less duplication, and impossible for the two sections to drift
  out of sync with each other again.
- **Daily Output chart silently dropped zero-flight periods.** `byPeriod` was only ever populated
  from `flown` records, so a period (day/week/month) with no lessons simply had no key and no bar —
  the x-axis quietly skipped it, which made a genuinely idle week look visually compressed rather
  than idle (two adjacent bars with a week-long real gap between them rendered right next to each
  other). New `ap127v4PeriodRange(start, end, period)` generates the *complete* sequence of periods
  from the batch's first flown date to today, independent of which periods actually have data; those
  full-range keys are now the default. Added a toggle button, **"Hide off days"** (off by default,
  matching the user's "include all day" request), that switches back to the old data-only view for
  when a denser chart is preferred — `AP127V4_LB_SHOWALL` flag, wired the same way as the existing
  unit/period toggles.

Verified live (local static server): both tabs, zero console errors, toggle exercised in both
states (visible gaps for off-days when on, packed contiguous bars when off), Pace Monitor's 1-SP and
28-SP sections both re-checked showing the identical `day · month` footnote format. Only file
touched: `js/view-cohort-v4.js`.

### AP127 Detail V4 — cross-chart consistency pass (2026-08-02, p125)

`js/view-cohort-v4.js`

Fifth round of same-day feedback. This one surfaced a real numeric bug, not just UX polish — the
user asked *"why is Done vs Plan different between charts?"* after noticing Batch Lead/Lag
History's "Now" delta didn't match the KPI card or Combined Progress vs Plan.

**The hours-per-flight inconsistency.** `ap127Hours()` — the helper behind the KPI card, Progress
Ranking table, and Pace Monitor, inherited unchanged from the original AP127 Detail tab — computes
each flight's hours as `lessonsMap[f.lesson] || ap127FlightMins(f)`: the curriculum's *standard*
duration for that lesson code wins; the flight's own logged duration is only a fallback for codes
missing from the curriculum. Across the four earlier V4 rounds, six other panels independently
reimplemented "hours done" with the fallback order **reversed** —
`ap127FlightMins(f) || lessonsMap[f.lesson]` (actual-first) — or dropped the fallback entirely:

- Actual vs Planned (`buildAP127RaceChart`'s `cumSeries`)
- Combined Progress vs Plan's chart line (`buildAP127CombinedChart`'s `actualByDate` — note this
  is distinct from the panel's own KPI tiles above the chart, which already called `ap127Hours()`
  and were therefore already correct; only the plotted line itself was off)
- Batch Lead/Lag History (`buildAP127HistBatch`)
- Individual Lead/Lag vs Plan (`buildAP127HistSolo`)
- Daily Output (`buildAP127LessonBar`)
- Roster (`buildAP127Roster`'s Total column and By-Instructor hours — this one had no fallback at
  all, pure `ap127FlightMins(f)`)

Same real flights, different totals, because a lesson's actual flown duration and its curriculum
standard duration aren't always identical — accumulated over hundreds of flights, this produces a
visibly different "hours done" figure depending on which panel you're looking at. Fixed by rewriting
all six sites to the same `lessonsMap[f.lesson] || ap127FlightMins(f)` formula (Roster gained its
own local `lessonsMap` + `hrsOf()` helper since it never had one). `ap127Hours()` now carries a
comment documenting this as the canonical convention, so a future addition doesn't reinvent it a
seventh way.

Re-verified live via `window.CHARTS_V4`/DOM inspection rather than eyeballing: KPI card, Combined
Progress vs Plan's "vs Plan Today," and Batch Lead/Lag History's "Now" all read **-880.7h**
identically post-fix (they disagreed before). Lessons mode spot-checked too (-337 across all three)
— already consistent beforehand, since lesson *counting* is just `(s.flown||[]).length`, unambiguous
regardless of formula; only the hours *conversion per lesson* was ever in question.

**Two more real bugs found while re-verifying the previous session's claimed fixes against actual
rendered output** (both from earlier today's rounds, not newly introduced):

- **Pace Distribution's average line landed in the wrong bin, not just off-center.** The prior fix
  (same day, earlier round) corrected the *within-bin* interpolation but missed a more fundamental
  issue: `avgDone` is a fractional mean (e.g. 32.96), but bins are integer-bounded (`[31,32]`,
  `[33,34]`, ...) and the match used `avgDone >= b.lo && avgDone <= b.hi` — a fractional value like
  32.96 satisfies neither `<=32` nor `>=33`, falls through every bin, and the `findIndex` failure
  fallback (`bins.length-1`) drew the line at the far right of the chart regardless of the real
  average. Confirmed live before fixing: labeled "AVG 33.0" but rendered between the "41–42" and
  "43" bins instead of near "31–32"/"33–34" where 33.0 actually sits. Fixed by matching against
  each bin's true continuous range `[lo, hi+1)`. Also added: hovering a bar now lists the actual SP
  names in that bin, not just a count.
- **Roster's "highlight today" matched nothing, ever.** `ap127AllDatesRange()` (and its siblings
  `ap127v4WeekStart`/`ap127v4PeriodRange`, all V4-only, added in earlier rounds) parsed date strings
  as LOCAL midnight but serialized via `.toISOString()`, which is always UTC — in any timezone east
  of UTC (Bangkok included) this silently shifts every generated date string back by a day, so the
  generated day list never actually contained the string equal to `ap127AsOf()`'s (timezone-correct)
  "today." This is the exact bug class this project has hit and fixed before in `bkkToday()`/
  `bkkNowMin()` — just freshly reintroduced in new V4-only helpers. Confirmed live: 0 elements
  matched `.d127v4-heat-today` anywhere in the DOM before the fix, 28 after (one per student row)
  plus the header column. Fixed by parsing with a `Z` suffix and stepping via `setUTCDate`/
  `setUTCMonth` throughout all three helpers. Roster flight cells are now also clickable (opens the
  same student drawer used elsewhere in the tab), and marker labels near the Overall Progress
  chart's right edge (lessons close to 96) now right-align instead of running off-canvas.

Verified live end-to-end: both tabs, zero console errors, original AP127 Detail (`js/view-cohort.js`)
confirmed still byte-identical/untouched. Only file touched: `js/view-cohort-v4.js`.

### AP127 Detail V4 — visible hours-convention badge (2026-08-02, p126)

`js/view-cohort-v4.js`, `css/progress.css`

Sixth round of same-day feedback, and a short one. After p125 standardized every "hours done" figure
in the tab to the effective-hours convention (curriculum's standard duration per lesson, falling back
to the flight's actual logged duration only if the lesson code isn't in the curriculum), the user
asked which convention was actually in effect — then asked for the answer to live on the page itself,
not just in chat.

Added `.d127v4-hours-badge`: a persistent pill directly under the page title, always visible (not
behind a hover) — "● HOURS = EFFECTIVE (standard duration per lesson, not actual logged time)" — with
a full-detail tooltip on hover listing every panel the convention applies to (KPI card, Pace Monitor,
Progress Ranking, Combined Progress vs Plan, Batch Lead/Lag History, Individual Lead/Lag vs Plan,
Actual vs Planned, Daily Output, Roster) and the fallback rule. Also added shorter reinforcing
tooltips at two of the most-interacted-with spots: the KPI card's "Hrs Done / Plan" label and the
Progress Ranking table's "HRS DONE" column header (which already had a sort-order tooltip — appended
to it rather than replacing it).

Verified live: badge renders correctly above the sticky toolbar at both desktop width and on load,
zero console errors, original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css`.

### AP127 Detail V4 — KPI card hours + curriculum-hours disclosure (2026-08-02, p127)

`js/view-cohort-v4.js`

Seventh round of same-day feedback. Two KPI-card requests:

1. **Batch Progress card** — subtext previously showed lessons only (`923 of 2688 lessons flown`).
   Now shows hours alongside lessons: `923 les / 1,135.3h of 2688 les / 5040h flown`. Both the
   "done" and "planned" hour totals use the tab's standard effective-hours convention
   (`ap127Hours()` per student, `ap127CurriculumHours()` for the per-student curriculum total ×
   student count), so they stay consistent with every other hours figure on the tab.

2. **Students card** — subtext previously showed only the lesson count (`96-lesson curriculum`).
   Now shows `96 les · 180h curriculum` (180h computed via `ap127CurriculumHours()` — sum of every
   `planned_mins` across `G.cur127`'s 96 lessons — confirmed live at 180.0h against the raw
   progress-worker payload) with a `*` and a hover tooltip: "The 96-lesson / 180h AP127 curriculum
   excludes Advanced UPRT (+5 lessons / +5h), which is tracked separately from the core syllabus."
   This exclusion is domain knowledge supplied by the user — `G.cur127` itself contains no UPRT
   entries to derive it from, so it's stated as a static tooltip rather than computed.

Verified live: both cards render the new figures correctly, tooltip text confirmed via DOM
inspection (`document.getElementById('d127v4-k-stu-s').title`), zero console errors, original
AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched (`git diff --stat`
empty). Only file touched: `js/view-cohort-v4.js` (plus the usual `index.html` cache-bust bump).

### AP127 Detail V4 — Pace Monitor: Day/Week/Month bars + Plan End countdown (2026-08-02, p128)

`js/view-cohort-v4.js`, `css/progress.css`

Eighth round of same-day feedback:

1. **Plan End card** — added a "Xd remaining" subline: days from today to the curriculum's final
   `planned_date` (27 Nov 2026), reusing the already-computed `daysRem`.
2. **Removed the Cohort ETC card** — a single all-time-average-pace ETC date felt redundant once
   the per-period Day/Week/Month bars below it show the same gap information more precisely.
3. **Pace bars split into Day / Week / Month** — previously each metric (Hours, Lessons) got one
   "per week" bar with a text-only "≈ X/day · Y/month" footnote underneath. Now there are three
   fully independent bar pairs per section — Per Day, Per Week, Per Month — each computed via a
   new `toPeriods(weeklyValue)` helper (`day = wk/7`, `week = wk`, `month = wk*4.345`) applied to
   both the actual and target weekly figures already computed upstream. Each bar's label now shows
   an explicit gap: `actual / target X (±Y gap)`, colored red/green to match the bar fill — instead
   of requiring the reader to subtract two numbers by eye. Applies to both the "1 SP" and "28 SP ·
   Batch Total" sections (12 bars total, up from 4).

Cleanup: the Cohort ETC card's supporting calc (`avgHrsDone`, `avgRemHrs`, `allTimeDaySP`,
`etcDate`/`etcColor`/`etcSub`) is now dead code with the card gone, so it was removed rather than
left orphaned. `.d127v4-cards` grid dropped from `repeat(4,1fr)` to `repeat(3,1fr)` to match the
3 remaining cards (Plan End, On Track, At Risk). New `.d127v4-sec-lbl-sub` CSS class for the
Day/Week/Month sub-headers (smaller/dimmer than the existing `.d127v4-sec-lbl` section headers, so
the two nesting levels stay visually distinct).

Verified live: both sections render all 6 period-blocks (Per Day/Week/Month × Hours/Lessons)
correctly, gap figures hand-checked against actual-minus-target, zero console errors, original
AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched (`git diff --stat`
empty). Only files touched: `js/view-cohort-v4.js`, `css/progress.css` (plus the usual
`index.html` cache-bust bump).

### AP127 Detail V4 — Pace Monitor: big-number Required/Actual/Gap stats (2026-08-02, p129)

`js/view-cohort-v4.js`, `css/progress.css`

Ninth round of same-day feedback — a visual-language change, not a bug fix: "No more the bar
chart. Just big number." Replaces p128's Day/Week/Month bar-chart redesign with the same 6
period-blocks (Per Month / Per Week / Per Day × "1 SP" / "28 SP · Batch Total") rendered as
big-number stat trios instead:

- **Required** — the target pace for that period, computed directly from `remaining ÷ daysRem`
  (not derived from a single weekly figure and rescaled): daily = `remaining/daysRem`, weekly =
  `daily*7`, monthly = `daily*30.44` (average Gregorian month length).
- **Actual** — now sourced from a period-matched rolling window instead of one globally-selected
  range (the old "ACTUAL RANGE" dropdown, now removed — it's superseded since every period sources
  its own fixed window): Per Month uses the trailing 30-day total directly (30d ≈ 1 calendar
  month, close enough not to need rescaling); Per Week uses the trailing 14-day total halved to a
  weekly rate (a 2-week sample is steadier than a bare 7-day one while still being recent); Per Day
  uses the trailing 7-day total divided by 7.
- **Gap** — `actual − required`, colored green/red, shown as a signed number.

Implementation: new `actualOverWindow(days)` helper replaces the old dropdown-driven single-range
actual calc; `stat()`/`statGroup()` replace `bullet()`/`periodBlock()`. Removed as dead code with
the bar system gone: the `ACTUAL RANGE` `<select>` in the markup, and the `.d127v4-bullet-*` /
`.d127v4-bullets` CSS (confirmed unreferenced via grep before deleting). New `.d127v4-pace-stat*`
CSS classes render the 3-column Required/Actual/Gap grid.

Verified live: all 6 period-blocks show internally consistent numbers — batch-wide Per Month
required (1016h) ÷ 28 SP matches the 1-SP Per Month required (36.3h); every gap equals
actual − required by hand-check — zero console errors, original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched (`git diff --stat` empty). Only
files touched: `js/view-cohort-v4.js`, `css/progress.css` (plus the usual `index.html` cache-bust
bump).

### School Perf — Scorecard batch-filter bug fix (2026-08-03, p130)

`js/view-program.js`

User report: "Progress data of AP126 seem to be broken — it can't see in CURRICULUM PROG and
SCHOOL PERF." Curriculum Prog checked out fine live (batch dropdown correctly narrows to 28 AP126
students with correct per-student data). **School Perf's "School Pace Scorecard" tiles were the
real bug**: `renderScorecard(actualAllRec, from, to, batch)` accepted the selected `batch` filter
as a parameter but never used it for the tile rendering — `scKpis('ALL')` and `scKpis('AP127')`
were hardcoded, so selecting AP126 (or AP124/AP129) from the batch dropdown updated the filter-note
text and the Monthly Variance table below (both already correctly batch-aware) while the headline
scorecard tiles and their "AP127 Only" sub-section silently kept showing all-batch and AP127-only
numbers — AP126's pace/achievement/shortfall figures were never reachable through this panel
regardless of filter selection. Root cause confirmed by reading `renderScorecard` (`js/view-
program.js:1541`) — the `batch` param was accepted but only ever referenced by the surrounding
`renderPerformance()` caller for the filter-note string and the table, not passed through to the
per-batch KPI block.

Fix: `kpi127`'s content and label are now driven by the actual selected batch — `const focusBatch =
batch === 'ALL' ? 'AP127' : batch;` then `scKpis(focusBatch)`, with the "AP127 Only" label
(previously static markup text) now written by JS into a new `#pf-sc-kpis-127-label` span so it
reads e.g. "AP126 ONLY" when that filter is active. Selecting "All batches" still shows the
original AP127-focused second block (no behavior change for the default view).

### OPS student-name alias normalization — 28 distinct AP-127 SPs (2026-08-04, p131)

`js/shared.js`

User-reported: the same AP-127 SP appears under multiple spellings in OPS data (`FLIGHTS[].student`),
fragmenting every OPS-side stat that groups by student (Ops Analytics "STUDENT BREAKDOWN", Roster,
Board, Slot Finder). This is the same root cause the `p96` Cross-Check fix (line 402 above) partially
patched — unplanned/manually-created bookings sometimes get logged with the full legal name, the
progress-feed nickname, or a differently-cased short form instead of the standard scheduling-system
"FIRST L." spelling — but `p96`'s `opsStudentKey()` only fixed matching *inside* `reconcile.js`'s
Cross-Check view; every other OPS view still grouped on the raw, unnormalized `f.student` string.
Confirmed live via `flight-data.js`: 12 AP-127 SPs each had a second (sometimes third) spelling —
`MAETHAPHAN RUENGPRAPAIKIJSEREE` / `WATCHARAPONG CHUAIDU` / `AKARAVIT KHWANNGAM` / `SAETASIT P.` /
`WATCHARAPHOL` / `WATCHARAPHOL VONGNOI` / `P-KORN` / `PICHAKORN JIRAPINYO` / `T-WAJ` /
`JIRAYU AMORNSATITPAN` / `W-POL` / `VASAPHON SINSAB` — all only ever seen on `(Unplanned)` rows,
alongside the correctly-spelled majority form.

Fix: new `AP127_STUDENT_ALIASES` map in `shared.js`, applied in the same load-time IIFE that already
strips the `" (Unplanned)"` suffix (`p106`) — keyed upper-cased/trimmed, rewrites each known variant
to its canonical "FIRST L." spelling before `FLIGHTS` is assigned, so every downstream view (OPS and
progress alike) sees one consistent name per person with no per-view changes needed. Verified live:
`new Set(FLIGHTS.filter(f=>f.batch==='AP-127').map(f=>f.student))` now returns exactly 28 real SP
names + the pre-existing legitimate `"All Students"` group-briefing entry (Long Brief / classroom
bookings, not a person) — was 29+ fragmented names before the fix. Zero console errors on Ops
Analytics. Only file touched: `js/shared.js` (plus the usual `index.html` cache-bust bump).

Verified live (local static server): selecting AP126 now shows a correct "AP126 ONLY" block (93%
overall achievement, ON TRACK pace status — both distinct from the frozen AP127 numbers seen
before the fix); reselecting "All batches" reverts to "AP127 ONLY" with the original figures
(no regression); zero console errors. Only file touched: `js/view-program.js` (plus the usual
`index.html` cache-bust bump).

### AP127 Detail V4 — Pace compact table, resizable splitter, Overall Progress readability (2026-08-04, p132)

`js/view-cohort-v4.js`, `css/progress.css`

Tenth round of same-day feedback, three asks bundled in one pass:

**1. Pace Monitor → compact table.** Replaced p129's big-number Required/Actual/Gap stat cards
(3 cards × 6 period-blocks) with two compact HTML tables — "1 SP" and "28 SP · Batch Total" — each
3 rows (Month/Week/Day) × 6 columns (Hrs Req/Act/Gap, Les Req/Act/Gap). Same underlying figures,
far less vertical space. The Required Action banner was changed from a per-SP hours+lessons
message to a single batch-wide hours-per-week figure, per explicit feedback ("focus on batch's
hrs need per week"): `gHrWkBatch = actWeekHrsB - reqWeekHrsB` (batch totals, no `/n`, hours only).

**2. Resizable Progress Ranking / side-panel splitter.** The layout below Progress Ranking used
the shared `.d127-grid` class — also used unchanged by the original AP127 Detail tab, so it was
left alone there. V4 now uses its own `.d127v4-split-grid` (3-column grid: panel / 8px handle /
side) with a draggable `#d127v4-split-handle` (`ap127InitSplit()`, pointer-event based, same
pattern as the existing date-scrubber's `initScrubber()`). Width persists to
`localStorage['ap127v4SplitLeftPx']`, restored (clamped to the live viewport) on every mount.

Bug caught in testing (not present until verified live, not just visually): the restore-on-mount
clamp ran synchronously right after `innerHTML=MARKUP`, before the browser had committed layout for
the freshly-inserted grid — so `grid.getBoundingClientRect().width` read `0`, and
`max = Math.max(MIN, 0-8-MIN)` collapsed to `MIN`, silently discarding the saved width on every
single mount/reload regardless of what was saved. Fixed by deferring the restore-and-clamp to
`requestAnimationFrame`, which runs after the browser has committed the new layout. Verified live:
dragged the handle to 735px width, reloaded, confirmed the grid restored to 732px (correctly
clamped against the real ~1020px grid width) — before the fix it always came back at 280px (`MIN`)
on reload no matter what had been saved.

**3. Overall Progress — readable marker labels + checkride detail.** User-reported: "Master plan
and key point is difficult to read." Root cause: `markerPlugin`'s phase-boundary/key-point labels
were flat-color canvas text (`ctx.fillText` only) drawn directly over the MASTER PLAN row's
colored phase segments — light text over a light segment (or the reverse) was low-contrast.
Fixed with a dark halo: `ctx.strokeText(...)` in `rgba(13,17,23,0.9)` with `lineWidth:3` drawn
immediately before `ctx.fillText(...)`, so the label stays legible regardless of which phase
color sits behind it.

Also added checkride detail per explicit request ("Add detail of each check ride flight"):
`ap127KeyPoints()`'s generic `"Checkride"` label is now `"Checkride · <detail>"` — GH / VFR XC /
IFR XC / ME IFR XC — via a new `AP127_CHECKRIDE_DETAIL` map keyed by the 4 real checkride codes
(CSPGLC, CSPXVC, CSPXIC, CMSPXIC), cross-checked against the authoritative
`ap127-flight-training.pages.dev/data/syllabus.json` lesson titles.

While building the detail map, found and fixed a real (pre-existing, unreported) bug: the old
checkride-detection regex was a bare `/C$/i` tested against the number-stripped lesson code, which
also matches Night/VFR/IFR Cross-Country codes ending in "...XC" (e.g. `"CDNXC 48"` — Night
Cross-Country, not a checkride — the code's comment even claimed "exactly 4 in the curriculum" but
the regex actually produced 5 matches). Fixed with a negative lookbehind, `/(?<!X)C$/i`, which
still matches every real check code (their trailing "C" isn't part of an "XC" token) while
excluding the false positive. Verified against the raw `cur127` curriculum data directly (not just
visually): exactly 4 checkride markers now match, matching the syllabus source of truth.

Verified live throughout: zero console errors; original AP127 Detail (`js/view-cohort.js`)
confirmed still byte-identical/untouched (`git diff --stat` empty). Only files touched:
`js/view-cohort-v4.js`, `css/progress.css` (plus the usual `index.html` cache-bust bump).

### AP127 Detail V4 — Overall Progress: SYLLABUS strip replaces the "MASTER PLAN" chart row (2026-08-04, p133)

`js/view-cohort-v4.js`, `css/progress.css`

Eleventh round of same-day feedback: "Make the master plan bigger so we can fit all info inside
the bar," "Add more detail from the syllabus to the master plan... add some creativity," "Change
the MASTER PLAN to be SYLLABUS."

The p128/p129-era design folded a "MASTER PLAN" reference bar into the Chart.js stacked horizontal
bar chart as row 0 — same fixed height as every SP's own row, holding at most one line of canvas
text per phase segment. That ceiling made it impossible to fit phase name + description + hour/
lesson counts + milestone detail into the bar, and canvas `fillText` has no hover-tooltip
mechanism, so there was nowhere to put "why does this phase matter" text.

Pulled the syllabus reference out of the chart entirely and rebuilt it as a standalone, much
taller HTML/CSS component:

- New `ap127SyllabusStrip(cur, totalLessons)` renders into a new `#d127v4-syllabus-strip` div
  placed directly above the `<canvas id="d127v4-overall">`, sharing the same 100px left gutter as
  the chart's y-axis label column so the two read as one continuous lesson-number timeline.
- 4 phase blocks, sized by `flex`/`%`-width proportional to each phase's lesson count, each 56px
  tall (vs. a per-SP row's ~20px) — room for phase number, title, lesson range, and hour count all
  inside the segment, white text with a drop-shadow for contrast against every phase color, plus a
  `title` tooltip carrying a one-line phase blurb ("Provide the trainee with fundamental flight
  skills..." → shortened per-phase `blurb` field on `AP127_SYLLABUS_PHASES`).
- Verified `hrs` field added per phase (14/25/45/96h) — summed each phase's own lesson durations
  directly from the authoritative `ap127-flight-training.pages.dev/data/syllabus.json` and
  confirmed they add to exactly 180h, rather than guessing/dividing the total evenly.
- Above the phase row, every key point and checkride from `ap127KeyPoints()` renders as an
  emoji-flagged pin — 🛫 Initial Solo, 📟 Instrument, 🧭 Cross-Country, 🖥️ Sim, ✈️ Multi-Engine,
  🏁 Checkride (new `ap127KeyPointIcon()` helper) — connected by a thin tick line down into its
  phase segment, hover-scales for a bit of interactivity. Positioned by the same
  `lesson/totalLessons` percentage math the chart below uses for its x-axis, so milestone pins line
  up with the same lesson number in both the strip and the per-SP bars underneath.
- `buildAP127OverallChart()` no longer prepends a row-0 "MASTER PLAN" entry to any dataset or the
  `labels` array — every dataset's `data`/`remainingData` and the `labels` array now start directly
  at the first real SP. `currentLabelPlugin`'s per-bar lookup (`meta.data[i+1]`) dropped its `+1`
  index offset to match. The y-axis tick-color scriptable callback's `ctx.index===0` special case
  (used to highlight the old MASTER PLAN row's label) was removed as dead code.
- All "MASTER PLAN" strings renamed to "SYLLABUS": removed entirely from the chart (no longer a
  row), the panel's description text rewritten to describe the new strip, and the surrounding code
  comments updated.

Verified live: zero console errors; the SYLLABUS strip's 9 milestone tooltips checked against the
syllabus source data one-by-one and match exactly (Initial Solo L14, Instrument L15, Cross-Country
L29, Sim L56, Multi-Engine L91, checkrides L54/L55/L90/L96); original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched (`git diff --stat` empty). Only
files touched: `js/view-cohort-v4.js`, `css/progress.css` (plus the usual `index.html` cache-bust
bump).

### Cross-Check — new "Monthly OPS ⇄ PROG" reconciliation view (2026-08-04, p136)

`js/crosscheck-monthly.js` (new), `js/view-crosscheck.js`, `index.html`

User asked the app to explain why AP-126/AP-127 monthly effective-hours totals differ between
"Ops Analytics" (`js/view-summary.js`, sourced from the scraped Operations Portal feed,
`window.FLIGHTS`) and the School side, for May/Jun/Jul 2026, with the comparison shown in an
interactive webpage inside the Cross-Check tab.

Research first corrected the premise: the tab literally named **"School Analysis"**
(`renderAnalysis`, sidebar id `school-analysis`) has no monthly-hours-by-batch table at all — it's
a per-student pace/at-risk view. The tab that actually computes monthly hours per batch, with an
Effective/Actual toggle, is the separate **"School Perf."** tab
(`renderPerformance`/`renderScorecard`/`buildMonthMap`, `js/view-program.js`). Confirmed with the
user before building against School Perf.'s engine instead.

New `js/crosscheck-monthly.js` (plain script, no JSX, exposes `window.AP127MonthlyCC`) computes
both sides live from already-loaded, already-normalized `window.FLIGHTS`/`window.NGT_CACHE`,
reusing — not reinterpreting — each source tab's own formula: `buildCurMap`/`effMinsFromDur`
mirror `js/view-summary.js:38-59` (`sBuildCurMap`/`sEffectiveMins`) byte-for-byte in behavior;
`effMinsFromActual` mirrors `js/view-program.js:1440-1471`
(`buildCurMap`/`collectEffectiveFlights`). `computeMonthly(hoursMode)` buckets Completed OPS
flights (exact-string batch match `"AP-126"`/`"AP-127"`) and PROG `flown[]` records (structural
batch = roster array membership) by calendar month; `computeDiagnostics()` finds multi-leg
same-lesson OPS bookings, PROG `"(SIM)"`-lesson vs. OPS `isSim` mismatches, date drift, no-match
entries, and batch-tag mismatches (student-key bridging reuses
`window.AP127Reconcile.ccKeyFromFull`/`ccNameNorm` from `assets/reconcile.js`).

`js/view-crosscheck.js` gained a toggle between the existing per-flight reconciliation (renamed
`PerFlightView` internally, behavior/markup unchanged — confirmed via live check against the
pre-change screenshot) and a new `MonthlyView`: headline batch×month table (OPS hrs/flights vs.
PROG hrs/lessons, Δ, Δ%, colored by |Δ%|), an expandable per-SP drill-down per row (sorted by
|Δ hrs| descending), 5 collapsible root-cause diagnostic panels with real matched evidence (not
just prose), and a written "why they differ, and how to fix it" panel. A `CrossCheckShell`
wrapper now owns the toggle state and the shared padding/scroll container; `window.CrossCheckView`
still resolves to this shell so `js/shell.js` needed no changes. Diagnose-only per explicit user
decision — no changes to `view-summary.js`'s or `view-program.js`'s calculation logic.

**Headline finding:** both systems already use the identical curriculum-standard effective-hours
formula — not the root cause, contrary to the natural first guess. The real drivers, ranked by
impact in the May/Jun/Jul AP-126/AP-127 window:
1. **Multi-leg Ops Portal bookings double-credit hours.** One curriculum lesson flown across 2+
   separate same-day bookings (no `/2`-suffix convention used) gets the full curriculum-standard
   duration credited again per booking, while Progress logs the lesson once. Quantified for May
   AP-126: 38 lesson-instances split across 63 extra Ops rows (227 raw rows → 164 distinct
   student+lesson+date keys) — the dominant driver of AP-126's May/Jun swings. Example: student
   NABHADR P., lesson `CSPXV 44`, 2026-05-12, logged as 3 separate bookings (1:00 + 2:40 + 1:30).
2. **Sim-flight tagging disagrees.** OPS `isSim` (per-booking aircraft/tail-type flag) vs. PROG's
   literal `"(SIM)"` substring in the curriculum lesson code — same real flights, two independent
   tags. AP-126 June: 100 PROG sim-lesson completions vs. **0** OPS-flagged; July: 234 vs. 134.
   Invisible in either headline total (neither splits sim out of its combined total) but a real
   disagreement for anyone filtering by sim.
3. Minor date-drift (progress-entry lag near month boundaries) and a handful of Ops-completed
   flights with no Progress entry yet — normal lag, not a data error. AP-127 stayed close every
   month in this window (largest Δ 4.9%), consistent with this being ordinary noise rather than a
   systemic issue for that batch.
4. Batch-tag mismatches (Ops booking tagged with the wrong cohort vs. the student's PROG roster)
   — checked directly, **zero** found for AP-126/AP-127 in this window. Ruled out as a cause here;
   the check stays live in the UI as a standing indicator.

Verified live: headline numbers cross-checked against an independent ad hoc computation run
against the same live data during design (exact match — AP-126 May 523.2h/227 ops vs. 482.0h/160
prog, etc.); toggle between Per-Flight/Monthly views, Effective/Actual hours toggle, batch filter,
per-SP drill-down expand, and all 5 diagnostic panel expansions exercised; mobile 390px checked
(headline table scrolls within its own container, no page-level horizontal overflow, controls wrap
cleanly); zero console errors throughout; existing per-flight Cross-Check confirmed pixel/behavior
identical to before this change. Design: `docs/superpowers/specs/2026-08-04-crosscheck-monthly-ops-prog-design.md`;
plan: `docs/superpowers/plans/2026-08-04-crosscheck-monthly-ops-prog.md`.

### AP127 Detail V4 — Overall Progress: mobile fix, clickable phases, Phase IV split, icons, zoom/resize (2026-08-04, p137)

`js/view-cohort-v4.js`, `css/progress.css`

Twelfth round of same-day feedback, five items bundled in one pass:

**1. Mobile SYLLABUS alignment bug fix.** The p133 build added a `@media(max-width:900px)` rule
zeroing out the SYLLABUS strip's 100px left offset, on the assumption a narrower viewport needed
less gutter. That assumption was wrong: the chart's y-axis label column below it
(`afterFit: scale.width=100` in `buildAP127OverallChart`) stays a fixed 100px at every viewport
width, so removing the strip's matching offset on mobile broke alignment instead of preserving it
— exactly the bug the user reported. Fixed by deleting the override; verified at a 375px viewport
that phase-color transitions in the strip now line up with the corresponding per-SP bar segments.

**2. Clickable phase detail.** Each SYLLABUS segment now opens a detail modal on click
(`openAP127SyllabusModalV4`/`closeAP127SyllabusModalV4`, markup reuses the existing `.d127-draw`/
`.d127-dh` drawer styling for visual consistency with the student drawer). Shows: the phase's
objective and completion standard (new `objective`/`standard` fields on `AP127_SYLLABUS_PHASES`,
trimmed verbatim from `syllabus.json`), an hours/lesson breakdown table when the phase has
sub-segments (Phase IV only), and every milestone (`ap127KeyPoints()`) that falls within the
phase's lesson range. Escape key and clicking the overlay both close it, matching the existing
student-drawer UX pattern.

**3. Phase IV split into SIM/REAL and SE/ME.** New `AP127_BAR_SEGMENTS` array, scoped to the
Overall Progress Bar View only (Flight Timeline, Roster, and Phase Progress Funnel still use the
flat 4-phase `AP127_SYLLABUS_PHASES` for their "same phase = same color" convention, which wasn't
part of this request) — splits Phase IV into 4 contiguous sub-ranges, each verified against
syllabus.json's per-lesson durations:
  - IFR Sim — lessons 56-67, 28h (`#93c5fd`)
  - IFR Real — lessons 68-90, 59h (`#a78bfa`, same hue as the original Phase IV color)
  - ME Sim — lessons 91-92, 2h (`#f9a8d4`)
  - ME Real — lessons 93-96, 7h (`#ec4899`)
Color scheme is deliberately 2-dimensional: purple family = single-engine, pink family =
multi-engine; lighter/cooler tone = simulator, saturated tone = real aircraft — satisfies "separate
color for SIM/REAL" and "separate color for ME/SE" with one coherent palette rather than two
unrelated ones. `buildAP127OverallChart`'s stacked-bar datasets, boundary markers, and the panel
legend all now iterate `AP127_BAR_SEGMENTS` (7 entries) instead of `AP127_SYLLABUS_PHASES` (4).
The SE→ME changeover (lesson 91, `meIntro:true` on the ME Sim segment) draws as a bold 2.2px solid
white/magenta divider in both the SYLLABUS strip (`.d127v4-syl-phase-me-div`) and the per-SP
chart's marker plugin, distinguishing it from the thinner dashed lines at ordinary phase
boundaries — "add a line there to separate" the biggest transition (different aircraft entirely)
from the smaller Sim/Real ones.

**4. Aviation-appropriate icons.** `ap127KeyPointIcon()`'s previous set included a pager emoji
(📟) for "Instrument" — reads as office equipment, not navigation. Full set replaced: 🛫 Initial
Solo, 🧭 Instrument, 🗺️ Cross-Country, 🖥️ Sim, 🌀 Multi-Engine, 🎖️ Checkride.

**5. Resizable + zoom/pan interactive.** Added `chartjs-plugin-zoom` config (wheel/pinch zoom +
drag pan, mode `'xy'`) to the Overall Progress chart — the same plugin already loaded globally and
used by the Combined Progress vs Plan chart's `cpvResetZoom` — plus a new "⟳ Reset View" button
(`ap127OverallResetZoomV4`) in the panel header. The canvas's container div
(`#d127v4-overall-wrap`) is now CSS `resize:vertical;overflow:hidden`, so a user can drag its
bottom-right corner to make the chart taller/shorter; Chart.js's own ResizeObserver (attached via
`responsive:true`) keeps the canvas in sync automatically, no extra JS needed.

Verified live throughout: zero console errors; clicking "IFR Sim" opens the Phase IV modal with
the correct 4-row breakdown and only the 2 milestones that actually fall in Phase IV (checkrides
at L90/L96 — L54/L55 correctly excluded as Phase III); clicking "Phase I" opens its modal with no
breakdown section (single-segment path); `chart.zoom(1.5,'x')` confirmed via direct API call
(scale 0-96 → 24-72), `ap127OverallResetZoomV4()` confirmed restoring 0-96; original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only files touched:
`js/view-cohort-v4.js`, `css/progress.css` (plus the usual `index.html` cache-bust bump).

### AP127 Detail V4 — Overall Progress: zoom UX overhaul (2026-08-04, p138)

`js/view-cohort-v4.js`, `css/progress.css`

User-reported on the p137 zoom feature: "The zoomable bar chart should be more user friendly, may
be with zoom button? Now with scroll zoom, it all over the place and very sensitive to zoom in and
out too much." Root cause: bare mouse-wheel zoom on a chart sitting inside a page that otherwise
scrolls normally fires on every incidental scroll-past — a user just trying to scroll down the page
while their cursor happened to be over the chart would get an unwanted, disorienting zoom instead.

Fixed with two changes:

1. **Explicit +/− zoom buttons.** New `ap127OverallZoomV4(factor)` calls chartjs-plugin-zoom's
   `chart.zoom(factor)` with a fixed step (1.25x for "+", 0.8x for "−") per click — predictable,
   discoverable, and compounds smoothly on repeated clicks. Added next to the existing "⟳ Reset
   View" button in the panel header (new `.d127v4-zoom-ctl` button group), now the primary zoom
   control rather than an incidental side-effect of scrolling.
2. **Wheel-zoom gated behind Ctrl/⌘.** `wheel:{enabled:true}` (unconditional, default speed)
   changed to `wheel:{enabled:true,modifierKey:"ctrl",speed:0.06}` — plain scrolling over the chart
   now scrolls the page like anywhere else; holding Ctrl (⌘ on Mac) while scrolling still zooms, at
   a gentler rate than before, for users who want the wheel shortcut. Pinch-zoom (touch) stays
   unconditional since a two-finger gesture is inherently a deliberate zoom intent, unlike an
   incidental wheel scroll.

Panel note text and button tooltips updated to describe the new interaction model.

Verified live: clicking "+" confirmed the scale went from 0-96 to 12-84 (the expected 1.25x zoom,
centered); a plain (non-Ctrl) wheel event dispatched at the chart's center confirmed NO zoom
happened (scale stayed 0-96); the same event with `ctrlKey:true` confirmed a gentle zoom did
happen; "⟳ Reset View" confirmed restoring 0-96 after each test. Zero console errors. Original
AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched. Only files touched:
`js/view-cohort-v4.js`, `css/progress.css` (plus the usual `index.html` cache-bust bump).

### AP127 Detail V4 — Overall Progress: SYLLABUS zooms with chart, decluttered SP rows, clickable milestones, SVG icons (2026-08-04, p139)

`js/view-cohort-v4.js`, `css/progress.css`

Thirteenth round of same-day feedback: "Make the syllabus zoom together with the chart. Move all
key event to inside the syllabus, not on the SP line. Remove the duplicated phase name. Make the
icon click to expand explanation detail. More professional icon."

1. **SYLLABUS zooms together with the chart.** `ap127SyllabusStrip()` gained `viewMin`/`viewMax`
   parameters (same 0..totalLessons units as the chart's x-axis); phase segments and milestone
   icons outside that window are dropped, and the visible portion is rescaled to fill the width —
   the strip now shows exactly what the chart is showing at any zoom level. New
   `ap127SyncSyllabusStrip()` reads `CHARTS.ap127overall.scales.x.min/max` and re-renders; wired
   into the zoom-plugin's `onZoomComplete`/`onPanComplete` for wheel/pinch/drag-pan, and called
   explicitly at the end of `ap127OverallZoom()`/`ap127OverallResetZoom()` for the button path
   (not relying on plugin callbacks firing identically for programmatic zoom calls). When zoomed,
   the strip's subtitle changes to `"showing lessons X–Y of 96 (zoomed with chart)"`.
2. **Chart decluttered — all phase/milestone display now lives only in the strip.** Deleted
   `markerPlugin` (the vertical dashed/solid guide lines + `strokeText`/`fillText` labels drawn
   over every SP row) entirely, along with the `boundaries`/`markers` construction that fed it.
   This was the literal "duplicated phase name" — the same phase label was rendered once in the
   SYLLABUS strip's block and a second time as canvas text over the SP rows, and with 28 rows and
   up to 9 markers the SP-row labels frequently overlapped each other illegibly. Per-SP bars are
   now plain phase-colored segments plus the `currentLabelPlugin` "current/next lesson" text (kept
   — that's genuinely per-SP data, not a repeat of syllabus-wide info). Legend trimmed from 4
   entries (segments, phase boundary, SE→ME changeover, key point) to 2 (segments, SE→ME
   changeover) since the removed dashed/dotted line styles no longer appear anywhere.
3. **Milestone icons are click-to-expand.** New `openAP127MilestoneModalV4(i)` populates the same
   generic drawer `openAP127SyllabusModalV4` uses, with a written explanation of the milestone
   TYPE (not the specific lesson instance) from a new `AP127_MILESTONE_TYPES` lookup — one
   paragraph each for Solo, Instrument, Cross-Country, Sim, Multi-Engine, Checkride, covering what
   the milestone represents and why it matters in the training progression. `i` indexes
   `AP127_OVERALL_KPS`, the full (unfiltered) milestone list captured by the most recent strip
   render, so the index stays valid even though the zoomed view may be hiding some milestones.
4. **Professional SVG icon set.** Replaced the emoji icons (🛫🧭🗺️🖥️🌀🎖️, themselves a prior
   round's fix for an even worse pager emoji) with small stroke-based inline SVGs — 14x14 viewBox,
   `currentColor`, ~1.2 stroke-width — matching the minimal geometric convention already
   established by `ViewIcon()` in `js/shared.js` (used for the app's other custom icons) rather
   than full-color emoji, which read as less "professional" in a data dashboard. New
   `ap127KeyPointIconSvg(label,size)` (replacing `ap127KeyPointIcon`) returns: an aircraft
   silhouette (Solo), a gauge with a needle (Instrument), a dashed route to a diamond waypoint
   (Cross-Country), a monitor (Sim), two propeller discs (Multi-Engine), a shield with a checkmark
   (Checkride). Used in the SYLLABUS strip's icon row, the phase-detail modal's milestone list, and
   the new milestone-detail modal's title.

Verified live: zoomed to 1.6x and confirmed the strip showed "showing lessons 29–67 of 96 (zoomed
with chart)" with Phase I correctly dropped and Phase III/IFR Sim correctly clipped at the
boundaries; Reset restored the full 0-96 view in both the chart and the strip; clicked the first
milestone icon and confirmed the modal opened with the correct title ("Initial Solo"), subtitle
("Lesson 14 · Consolidation & IFR Introduction"), and explanation text; zero console errors
throughout. Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched.
Only files touched: `js/view-cohort-v4.js`, `css/progress.css` (plus the usual `index.html`
cache-bust bump).

### AP127 Targets — new batch-wide milestone schedule feature (2026-08-04, p140)

New: `js/ap127-targets-data.js`, `js/view-ap127-targets.js`
Modified: `js/shell.js`, `js/view-cohort-v4.js`, `index.html`

User supplied a 17-checkpoint date→lesson-number schedule the whole AP127 batch is expected to
keep pace with (9 Aug 2026 → Lesson 30, through 29 Nov 2026 → Lesson 96), and asked for two things:
an editable admin page with a revision record for future changes, and the schedule visible on
every chart/timeline in AP127 Detail V4 so hit/miss is directly readable.

**Data model.** New `js/ap127-targets-data.js`, loaded before `shell.js` so every consumer can
reach it: `window.AP127_MILESTONE_TARGETS_DEFAULT` (the 17-entry array — the code default and,
per the note below, the durable revision record), `ap127GetMilestoneTargets()` (reads a
`localStorage` override if present, else the default — the single function every reader goes
through), `ap127TargetLessonForDate(dateStr)` (linear interpolation between the two schedule
entries bracketing a date; 0 before the first checkpoint, the last lesson after the final one).

**On "history record for revision":** this app has no writable backend — it's a static Cloudflare
Pages deploy off committed data files, the same architecture as every other AP127 project in this
ecosystem. There is nowhere to durably persist a *shared, multi-user* edit history server-side
without standing up new infrastructure (a Worker + KV namespace), which was out of scope for what
was asked. Built honestly within that constraint rather than faking a database: the System-tab
editor persists edits to this browser's `localStorage` (`ap127MilestoneTargetsOverride`) plus a
local revision log (`ap127MilestoneTargetsLog`) displayed on the page — but this is explicitly
labeled "this browser only" everywhere it appears in the UI. The actual durable, shared revision
record is git history on `js/ap127-targets-data.js` — exactly how every other change in this
codebase is tracked (see this file). The editor's "Export for commit" panel closes the loop:
it pretty-prints the current table as a ready-to-paste `AP127_MILESTONE_TARGETS_DEFAULT` array
with a Copy-to-clipboard button and explicit instructions to paste it into the data file and
commit — that commit is what makes an edit permanent and visible to everyone, not the localStorage
save.

**Admin page** (`js/view-ap127-targets.js`, new nav entry "AP127 Targets" under System, icon `⌖`,
registered in `shell.js`'s `GROUPS`/`registry()`). Plain `React.createElement` (no JSX), matching
the other System-tab views' convention (`view-watchdog.js`, `view-cf-usage.js`) — loaded as a
plain `<script>` so it skips Babel. Features: a sortable table of all checkpoints with inline
edit/delete per row and an add-row form; a banner showing whether you're viewing the CODE DEFAULT
or a LOCAL OVERRIDE; the Export-for-commit panel; the revision history log; a Reset-to-defaults
action. Every mutation (add/edit/delete/reset) atomically updates state, persists to
`localStorage`, and appends a log entry in one handler (`commit()`) so the displayed table and the
log can never drift out of sync.

**Chart/timeline overlays** — all three read the same `ap127GetMilestoneTargets()`/
`ap127TargetLessonForDate()` so they can never disagree with each other or with the editor:

1. **Combined Progress vs Plan** (`buildAP127CombinedChart`): new "Target" line dataset (rose
   `#f43f5e`, dashed, point markers) — the 17 checkpoints converted to this chart's batch-aggregate
   units so they're directly comparable to the existing Actual/Plan lines on the same axis: lessons
   mode = `target lesson × 28 SP`; hours mode = cumulative planned hours through that lesson number
   (summed from the curriculum's own per-lesson `planned_mins`, the same "hours" convention used
   everywhere else in this tab) `× 28 SP`. New "vs Target Today" KPI card alongside the existing
   "vs Plan Today" one, showing the batch's variance against today's interpolated target.
2. **Overall Progress Bar View** (`buildAP127OverallChart`/`ap127SyllabusStrip`): a single rose
   dashed reference line + "TARGET · L{n}" label at today's (or the As-Of date's) interpolated
   target — drawn once in the SYLLABUS strip (zooms with the chart like everything else there) and
   once on the chart itself (`targetLinePlugin`). Deliberately kept to ONE line rather than
   per-row, consistent with the p139 decluttering pass that had just removed per-row marker
   clutter. Instead, each SP's existing current/next-lesson label (`currentLabelPlugin`, unchanged
   otherwise) is color-coded green (that SP's `done` count is at/ahead of today's target) or rose
   (behind) — hit/miss is visible per SP without adding new line clutter back.
3. **Flight Timeline vs Progress** (`buildAP127Timeline`): one thin dashed rose vertical line per
   checkpoint date (`targetLinesPlugin`, styled like the existing idle/gap-label plugins), each
   labeled with its target lesson number, drawn against the same calendar x-axis as the per-SP
   flight dots — so the calendar cadence the batch is meant to keep is visible directly against
   actual activity.

Verified live: admin page renders all 17 checkpoints correctly with correct per-row deltas;
editing a row (L30→L32) confirmed writing to `localStorage` and logging
`"Changed 09 Aug 2026 · L30 → 09 Aug 2026 · L32"`; Reset-to-defaults confirmed clearing the
override; Combined Progress vs Plan's Target line and "vs Target Today" KPI render correctly
(interpolated to L0 since "today" in the snapshot data is 4 Aug, before the schedule starts 9
Aug — correct per the interpolation rule); time-traveled the Overall Progress view to 2026-09-01
and confirmed the target line correctly interpolated to L43 (between the Aug30/L42 and Sep6/L46
checkpoints) with every SP's label correctly turning rose (all were behind L43 in that snapshot);
Flight Timeline's first target line (Aug 9) confirmed visible within the chart's date range. Zero
console errors throughout. Original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched.
