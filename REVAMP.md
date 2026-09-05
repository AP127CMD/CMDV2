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
| 2026-08-31 | **Meetings/ground school excluded from flight hours (p176).** Upstream (CMD_CTR) now flags them as `isNonFlight`; new `fMin()`/`fHrs()` in `js/shared.js` are the single place the exclusion lives, and all 27 sites that summed `f.durMin` directly now route through them, plus `brdFlownMin`/`calFlownMin`/`view-summary`'s `hoursOf()`. `hoursOf()` needed its own guard — its 'effective' branch bypasses `fHrs()` and would otherwise credit a meeting its full curriculum duration. Meetings stay VISIBLE on schedules (p116's fix preserved); only hours drop. Impact is on SCHEDULED-hours figures only — all meeting hours are status Pending, so Completed-gated metrics were already unaffected. Verified live: May 2026 scheduled hours 1432.5 → 1327.0 (−105.5h). |
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

### AP127 Detail V4 — new Lesson Completion Matrix chart (2026-08-04, p141)

`js/view-cohort-v4.js`, `js/ap127-targets-data.js`, `css/progress.css`

User request: "a new chart that similar to the roster but the column is lesson number instead of
date... show how each SP completed their lesson... add the target date mark for the lesson to
complete with indicating how each SP situation is for the closest target point (lead, lag)...
clean and data rich interactive chart."

New `buildAP127LessonMatrix()`, rendered into a new panel between Overall Progress Bar View and
Phase Progress Funnel. Conceptually the Roster's day-by-day heatmap turned 90° — same interaction
model (colored cells = activity, hover for detail, click to open the student drawer), but the
columns are curriculum LESSON NUMBER (1..96, fixed) instead of calendar date, so the question it
answers is "who's done what" rather than "who flew when."

Design choices:
- **Row order**: sorted by lead/lag vs the closest AP127 Target checkpoint (most-behind-first),
  not the usual pace sort — this view's whole reason to exist is target performance, so that's
  what should be immediately scannable, not just overall progress.
- **Two sticky columns** (Name, "vs L{n}"): with 96 lesson columns needing horizontal scroll, both
  identifying columns stay pinned. The vs-Target column is colored green (at/ahead) or rose
  (behind) — a direct answer to "who hit or not hit the target."
- **Header**: a phase-color band row (reusing `AP127_BAR_SEGMENTS`, the same 7-segment Phase I-IV
  + Sim/Real/ME split used on Overall Progress) so phase context is visible without repeating
  phase names down every row, plus a lesson-number tick every 5 lessons. Target-checkpoint columns
  get a small rose flag dot and the whole column gets a rose inset border running top to bottom,
  so a target lesson is traceable at a glance even scrolled far from its header.
- **Cells**: phase-colored when the SP has flown that lesson (click opens the same student drawer
  Roster uses); an amber inset ring marks each SP's current next-lesson (empty cell, not yet
  flown, but immediately queued); a small blue dot badge in the corner marks a retaken lesson
  (flown more than once) — a detail Roster's date-based view can't show as cleanly, since a retake
  is inherently about the SAME lesson recurring, which only has meaning on a lesson-indexed axis.
- **Footer "BATCH %" row**: each lesson column shaded by `color-mix(in oklch, var(--c127) N%,
  transparent)` where N = % of the 28 SPs who've completed it — the same intensity-shading idea a
  calendar heatmap uses, just applied to the lesson axis. Makes bottleneck lessons (where the whole
  batch is stuck) visible as a dark band without needing a separate chart.
- New `ap127ClosestMilestoneTarget(dateStr, targets)` added to `js/ap127-targets-data.js` (nearest
  schedule checkpoint by absolute day difference, ties toward the earlier one) — a discrete
  "the target is exactly Lesson N by exactly this date" reading, deliberately distinct from
  `ap127TargetLessonForDate`'s continuous interpolation used elsewhere (Overall Progress, Combined
  Progress vs Plan) since a lead/lag number is more actionable when it's phrased against one
  specific named checkpoint than an interpolated fractional lesson value.

Verified live: header renders phase bands + lesson ticks + target flags correctly; sticky Name/vs-
Target columns stay pinned while scrolling through all 96 lesson columns (confirmed IFR Sim/Real/
ME Sim/Real bands and their target-flagged columns L74/78/82/86/90/94/96 at the far right); the
"vs L30" column shows the correct ascending sort (most-behind at top); clicking a completed cell
opens the student drawer with the correct lesson/date/duration in its title tooltip; zero console
errors. Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched.

### AP127 Detail V4 — performance fix: search box no longer rebuilds the whole tab (2026-08-05, p142)

`js/view-cohort-v4.js`

User-reported: "the V4 tab feel laggy, pls improve it performance."

**Root cause**, found by reading the actual render wiring rather than guessing: the Progress
Ranking panel's search `<input id="d127v4-q">` had `oninput="renderAP127DetailV4()"` — calling
the FULL render orchestrator on every single keystroke, with no debounce. `renderAP127Detail()`
unconditionally:
- destroys and recreates all 12+ Chart.js instances on the tab (Combined Progress, Flight
  Timeline, Race, Consecutive/Idle, Overall Progress, Batch/Solo history, Pace Band, Lesson Bar,
  Funnel — each a full `Chart.destroy()` + `new Chart()` with its own dataset/plugin setup), and
  - fully regenerates both heatmap-style tables via `innerHTML` (Roster's day-by-day grid, and the
  p141 Lesson Completion Matrix's 96-lesson-column grid — together several thousand DOM nodes)
— even though **none of that depends on the search query**. Only the Progress Ranking table's row
filter (`rows.filter(s=>s.name...includes(q)...)`) actually needs to change when the user types.
Every one of the 12+ charts and both heatmaps read from the *unfiltered* student list
(`ap127AsOfStudents()`), confirmed by checking each `build*()` function's signature — none of them
take or reference `q`/`rows`.

**Fix — split the render into two paths:**

1. New `renderAP127Rows()`, containing exactly the search/sort-dependent slice of what
   `renderAP127Detail()` used to do inline: computing `q`, filtering `rows`, setting
   `AP127_VIEW_ROWS`, the total-row aggregate stats, the `tbody` HTML, and the sort-arrow
   indicators on the table headers. `renderAP127Detail()` now calls this instead of inlining that
   logic — behaviorally identical for the full-render path, just factored out so it can also be
   called on its own.
2. Rewired every search/sort-only trigger to call the light function instead of the full one: the
   search input (via a new debounced wrapper, see below), the sort `<select>`'s `onchange`,
   `ap127HeaderClick()` (clicking a sortable column header), and `ap127ResetSort()`. None of these
   change the underlying student data — only row order/filtering — so none of them need to touch a
   single chart or heatmap anymore.
3. Search input also gained a 120ms debounce (`ap127RowsDebounced()` / `_ap127RowsDebounce`) on
   top of the above — belt-and-suspenders smoothness for fast typing, on top of the now much
   cheaper operation it triggers.

**Second, independent fix — chart entrance animations.** `mkC(id,cfg)` is the single shared
helper every `build*Chart()` in this file goes through to create/replace a Chart.js instance. It
now defaults `cfg.options.animation=false` unless a caller's config already specifies an
`animation` option. Previously every chart used Chart.js's default ~1s animated entrance;
rebuilding 12+ of them together (on a real data refresh — As-Of date scrubbing, initial load) had
each animate independently, a second, compounding source of visible jank. One central default in
`mkC()` fixes this for every chart on the tab without needing to touch each one's own config
block.

Verified live: captured the Overall Progress chart's JS object reference and the Lesson
Completion Matrix's `innerHTML` string before typing "kraisee" into the search box — both were
confirmed byte-identical afterward (`Chart.getChart('d127v4-overall') === capturedRef`; innerHTML
string equality), while the Progress Ranking table correctly filtered down to the 1 matching row
("Kraisee L."). Repeated the same before/after identity check for the sort dropdown and Reset
Sort — chart untouched in both cases, table correctly re-sorted/reset. Confirmed the *full* render
path still works correctly: scrubbing the As-Of date produces a genuinely new chart object
(`chartRebuilt: true`) which now reports `animation: false`. Zero console errors throughout.
Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file
touched: `js/view-cohort-v4.js` (plus the usual `index.html` cache-bust bump).

### Ops Analytics — effective-hours counting fix + lesson sequence check (2026-08-05, p143)

`js/view-summary.js`, `js/crosscheck-monthly.js`, `js/view-crosscheck.js`

Follow-up to the previous day's Cross-Check "Monthly OPS ⇄ PROG" diagnostic (p136), which had
found — but deliberately not fixed — that multi-leg Ops Portal bookings double-credit curriculum
hours. User set a hard rule: **"we will count effective hour as required by syllabus for the
lesson once for each SP only."** Also: "as SP complete their lesson, typically they should finish
all the prior lessons, pls check and notice this" — clarified via question: flag any such gap,
never fabricate hours for an assumed-but-unlogged prior lesson.

**Fix 1 — effective-hours dedup.** `js/view-summary.js`'s `hoursOf(f)` is the single shared
callback every KPI tile, batch composition strip, all 4 stacked charts, the batch breakdown table,
and both student/instructor rosters read for hours (confirmed by grep: 9 call sites, all through
`hoursOf`) — so fixing it once fixes the whole tab consistently. New `sBuildEffectiveCreditSet()`
groups every Completed flight by `student|RAW lesson code` (suffix-preserving, so an existing
"/1"/"/2" split-lesson pair is untouched — `sEffectiveMins()` already handles that pair correctly)
and, for any group with more than one row (an un-suffixed duplicate booking), credits only ONE
representative row (latest date, then latest start time) with the curriculum-standard duration;
every other row in the group now returns 0 *effective* hours (still counts toward flight totals
and Block-mode hours — only the duplicate curriculum credit is removed). Computed globally
(all-time, not period-filtered) because `hoursOf` is called from both the period-filtered
`filteredFlights` (charts/KPI) and the all-time `FLIGHTS` (the "STUDENT ALL-TIME SUMMARY" roster,
`cumulStudentGroups`) — a period-scoped dedup would disagree with itself across these two
populations.

**Real bug caught during live verification (not shipped blind):** the first version tracked
credited rows by `f.id`. Live testing found several Ops Portal rows share the *exact same* `.id`
string — a pre-existing upstream id-generation issue (this file's own p116 entry above already
documents `ACTUAL_ONLY_*` id collisions: "60 ids map to genuinely different flights... upstream
id-generation bug"). A plain `Set` of ids silently credited *every* row sharing a duplicated id
instead of just the intended one — confirmed live: for one real group (student NANJITRA D., lesson
`CSXV 45`, 5 Ops rows, 4 of them sharing the literal id `"ACTUAL_ONLY_3255"`), the id-based version
credited 4 of the 5 rows instead of 1. Fixed by tracking flight **object references** in the
credited `Set` instead of `.id` strings — safe regardless of duplicate ids, since every
aggregation reads the same `FLIGHTS` array's object references. Re-verified: AP-126 May's true
correction is 523.2h→475.2h (212 of 227 bookings credited), not the id-based version's
523.2h→510.2h (which had under-corrected due to the collision).

**Fix 2 — lesson sequence check.** New `sBuildSequenceGaps()`/`SequenceGapPanel`, mounted directly
after the existing Batch Summary panel (same all-time, batch-filtered scope). For each batch with
curriculum data (AP-124/126/127, plus AP-129 sharing AP-127's curriculum — same convention as
`js/view-program.js`'s `collectCurriculumPlan()`), flags any SP whose highest-reached curriculum
lesson has an earlier lesson with no completion record at all — never backfills hours for it, only
surfaces it for human follow-up.

**Second real bug caught live:** the first version sourced "completed" from `window.FLIGHTS`,
which produced nonsense — AP-124 students who reached the batch's *final checkride lesson* were
reported missing nearly the entire 97-lesson curriculum. Root cause: `FLIGHTS` is a documented
**rolling window** of Ops Portal history (`assets/reconcile.js`'s own comment: "Operations history
is a rolling window; progress goes back further") — AP-124 finished months ago, so most of its
early lesson-by-lesson bookings have aged out of that window even though every lesson was
genuinely flown. Fixed by sourcing "completed" from `window.NGT_CACHE`'s `flown[]` (the Progress
feed, via the already-existing `sBatchRoster()` helper) — a full, non-windowed completion history.
Re-verified live: flagged-SP count dropped from 57 (almost entirely AP-124 false positives) to 5
genuinely plausible single-lesson gaps (e.g. AP-127's "A-RUT" reached `CDIL 25` with `CSGL 24`
unlogged — consistent with that same student's known conflict already visible in the existing
per-flight Cross-Check).

**Keeping Cross-Check in sync.** `js/crosscheck-monthly.js`'s own OPS-side effective-hours
calculation (built the previous day specifically to mirror "current site logic") got the identical
object-identity dedup fix, so its "OPS hrs" column keeps reflecting Ops Analytics' real behavior
rather than the bug that's now fixed. `js/view-crosscheck.js`'s "Multi-leg bookings" diagnostic
panel and "why they differ" text were reworded to say the double-counting is now fixed (the panel
is now a data-quality view of bookings worth tidying up with the existing "/2" suffix convention
in the Ops Portal, not an open bug). Re-verified live: every AP-126/AP-127 × May/Jun/Jul Δ% is now
within ±10% (AP-126 May — the prior worst case at +8.5% — is now −1.4%).

Verified live throughout: zero console errors, Block/Actual mode confirmed unchanged (no dedup
applied there), mobile 390px checked (Batch Summary + Lesson Sequence Check panels scroll within
their own containers, no page-level overflow), `js/view-program.js` (School Perf./School Analysis)
confirmed untouched. Design: `docs/superpowers/specs/2026-08-05-ops-analytics-effective-hours-fix-design.md`.

### AP127 Detail V4 — Daily Output chart: date range, target/gap overlay, separators, type breakdown (2026-08-07, p145)

`js/view-cohort-v4.js`

User request: improve the "Daily Output" chart with (1) a date-range setting defaulting to full
range, (2) a target line + gap indicator at the latest bar matching the Pace Monitor's numbers
exactly ("should be same number... pls cross check it"), (3) vertical separators for each
month/week, (4) a toggle to break each bar down by lesson type (Dual/Solo/Simulator).

**1. Date range.** New `AP127V4_LB_START`/`AP127V4_LB_END` state (both `null` by default = full
range), two date inputs in the panel header, `ap127SetLBRange()`/`ap127ResetLBRange()` handlers.
`rangeStart`/`rangeEnd` computed from these (falling back to the earliest flight date / today),
end clamped to never exceed today. Both the flight-accumulation filter and the
`ap127v4PeriodRange()` call now use this range instead of always `firstDate..today`.

**2. Target/actual/gap overlay, provably cross-checked against Pace Monitor.** This was the part
most likely to silently drift, given this tab's history of exactly that bug class (see the
mid-session hours-consistency fix). Rather than re-deriving the Pace Monitor's Required/Actual
formulas independently, factored them out of `renderAP127Pace()` into two shared functions:
- `ap127RequiredPace()` — remaining hours/lessons ÷ days-to-plan-end, at day/week/month grain.
- `ap127ActualPace()` — the same period-appropriate rolling window Pace Monitor already used
  (Day = trailing 7d ÷ 7, Week = trailing 14d ÷ 2, Month = trailing 30d directly).
`renderAP127Pace()` itself now calls both instead of computing them inline — one source of truth,
verified live by literal number match: Pace Monitor's "28 SP · Batch Total" Day row showed
Required 34.8h / Actual 4.83h / Gap -29.9h; the Daily Output chart's overlay on the same page load
showed "Required 34.8h" / "Actual 4.8h" / "-29.9h gap" — exact match, confirmed again after
switching to Week view (Required 243.4h vs Pace Monitor's 243h, rounding-consistent).

The overlay draws two dashed reference lines (rose = Required, blue = Actual) spanning just the
latest bar's column, each labeled, plus a vertical bracket with the gap number between them —
deliberately using the smoothed "Actual" figure (not the latest bar's own raw value) as the
bracket's lower/upper bound, specifically so the gap number is provably identical to Pace
Monitor's rather than a lookalike; the bar itself is left showing its raw per-period value,
unchanged, since that's still useful for spotting day-to-day variance. Only shown when the visible
range extends to today AND the latest bar is genuinely today's period (a custom end date, or "hide
off days" hiding an empty today, both correctly suppress it).

**3. Separators.** New `lbSepPlugin` (afterDatasetsDraw canvas plugin): a faint vertical line at
each Monday in Day view, or each month boundary (with a month label) in Week view. Month view
needs none — every bar already is a month.

**4. Dual/Solo/Simulator breakdown toggle.** New `ap127LessonType(code)` classifier, placed next
to `ap127SyllabusPhase()` since it's a different axis (lesson TYPE vs syllabus PHASE): strips the
code's leading "C" and optional "M" (multi-engine marker), then reads the next letter per the
syllabus's own lessonCodeKey (D=Dual, S=Solo, SP=SPIC) — "(SIM)" anywhere in the code overrides to
Simulator regardless of Dual/Solo, and SPIC buckets into Solo (both mean flying without an
instructor, the distinction that matters for this 3-way split). Verified against every code
pattern in the curriculum data (CDGL→Dual, CSGL/CSPGL→Solo, CDIF(SIM)/CMDIF(SIM)→Simulator,
CMDGL→Dual, CMSPXI→Solo). "By Type" toggle (`ap127ToggleLBBreakdownV4`) switches the single bar
dataset into 3 stacked datasets (distinct colors, `AP127_LESSON_TYPE_COLORS`), each with its own
centered per-segment datalabel; the topmost (Simulator) dataset's datalabel is overridden to show
the STACK TOTAL instead of its own value, positioned above the whole bar — computed via Chart.js
datalabels' `formatter` summing all three arrays at that index, no ghost dataset needed.

Verified live: all four features individually confirmed (date range narrows/resets correctly,
target/gap numbers exact-match Pace Monitor in both Day and Week view, separators render with
correct month labels in Week view, breakdown mode shows correctly stacked/colored/labeled bars
with correct stack totals); zero console errors beyond the pre-existing local-dev CORS fallback
(unrelated to this change); original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only file touched: `js/view-cohort-v4.js` (plus the usual `index.html`
cache-bust bump).

### AP127 Detail V4 — Daily Output target overlay: "Actual" fixed to the bar's own value (2026-08-07, p146)

`js/view-cohort-v4.js`

User questioned p145's overlay the moment they saw it live: "How the actual (blue dash line) is
calculated? It should not cal actual I think."

p145 deliberately made "Actual" the same smoothed rolling-window figure the Pace Monitor table
uses (Day = trailing 7d ÷ 7, Week = trailing 14d ÷ 2, Month = trailing 30d directly) — the
reasoning at the time was to make the gap NUMBER exactly equal Pace Monitor's own gap. In practice
that backfired: it meant the blue "Actual" line floated at a height that didn't correspond to
anything actually drawn on the chart — a bar chart where a labeled reference line doesn't match
its own bar reads as a bug, not a feature, regardless of how it was computed.

Fixed by making "Actual" simply the latest bar's own raw value (`values[keys.length-1]`), removing
the `ap127ActualPace()` call from `buildAP127LessonBar()` entirely (the function itself stays —
`renderAP127Pace()` still uses it, unaffected). The blue "Actual" line now always sits exactly
level with the bar's own top; the gap bracket connects that to the Required line directly, so it
visually reads as "this bar vs required pace" — exactly what's on screen, no hidden smoothing.

The Required/target side is UNCHANGED — still calls `ap127RequiredPace()`, still provably
identical to the Pace Monitor table's own Required figure. Only Actual changed. Updated the
legend (`Required` / `Actual (this bar)`) and the panel's note text to stop claiming both numbers
cross-check Pace Monitor — only Required does now, honestly reflected in the UI copy.

Verified live: reloaded with today's bar showing 0 hours (no flights logged yet in this test
snapshot) — the overlay correctly showed "Actual 0.0h" / "Required 34.8h" / "-34.8h gap", with the
blue line sitting right at the bar's own (empty) top rather than floating at an unrelated smoothed
value. Zero console errors beyond the pre-existing local-dev CORS fallback. Original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file touched:
`js/view-cohort-v4.js` (plus the usual `index.html` cache-bust bump).

### AP127 Detail V4 — Daily Output: gap uses latest CLOSED period, open period shown hollow with projection (2026-08-07, p147)

`js/view-cohort-v4.js`

Two more rounds of same-day feedback on the p146 overlay:
1. "I think we should calculate the gap by using the latest closed bar not the opening current bar."
2. "For current opening bar, pls change its appearance to be more distinguish, maybe a hollow bar
   with an estimate where it may close by projecting from the current already have data for that
   bar."

**1. Gap uses the latest closed period.** New `openIdx = keys.length-1` and
`latestIsOpen = atToday && keys[openIdx]===ap127v4PeriodKey(today,period)` — true whenever the
latest bar is the period today falls inside: a Day bar for today itself, or the Week/Month bar
today is only partway through. New `gapIdx = latestIsOpen ? openIdx-1 : openIdx` — the target/
actual/gap overlay (`lbTargetPlugin`) now anchors on `gapIdx`'s bar instead of unconditionally the
last one. Rationale: comparing a full-period Required figure against a still-forming, partial
Actual is an apples-to-oranges comparison that makes the gap look artificially worse than reality
every single day/week/month, right up until the period closes.

**2. Open bar: hollow outline + projected close estimate.** Two new helpers:
- `ap127v4PeriodEnd(key, period)` — the last calendar date a period key covers (used indirectly by
  the open/closed determination above).
- `ap127v4ProjectPeriod(key, period, actualSoFar, today)` — linear extrapolation: `actualSoFar ÷
  (daysElapsedInPeriod / totalDaysInPeriod)`. Day view returns `actualSoFar` unchanged — a day is
  this chart's finest granularity, so there's no sub-day signal to extrapolate from, and returning
  a fabricated number would be dishonest.

Visual treatment, applied to whichever bar dataset(s) are showing (works identically with the
Dual/Solo/Simulator breakdown on):
- The open bar's real (solid, actual-so-far) segment(s) get a scriptable white dashed border
  (`borderColor`/`borderWidth`/`borderDash` as functions of `ctx.dataIndex===openIdx`) instead of
  the plain fill every closed bar has — reads as "still forming" at a glance.
- A new "Projected (est.)" dataset, stacked on top of the real data, sized to
  `max(0, projectedTotal - actualSoFar)` — a hollow bar (`rgba(232,138,255,0.06)` fill, dashed
  `#e88aff` border) capping the real bar, only present at `openIdx` (zero everywhere else). Its
  datalabel and tooltip both show the projected TOTAL (`~17.0h`), not the bare remainder value,
  since "where might this land" is the useful number, not an abstract delta.
- The open bar's x-axis label gets a "◐" suffix appended (e.g. "03 Aug ◐") as a third, textual cue.

Panel note and legend text updated to explain both changes plainly.

Verified live across all three period views and both breakdown states:
- **Week view:** Required 243.4h / Actual 26.7h / gap -216.7h correctly anchored on the 27 Jul
  (closed) bar rather than 03 Aug (open) — the open bar showed a "~17.0h" projected cap,
  hand-verified against the underlying data: 12.17h actual so far ÷ (5 elapsed days / 7) ≈ 17.04h,
  matching exactly.
- **Month view + Dual/Solo/Simulator breakdown together:** Required 1058.5h / Actual 442.8h (July,
  closed, matching July's own stack-total datalabel exactly) / gap -615.6h; August's open bar
  showed a "~110.0h" projected cap with the dashed white border correctly applied across its real
  Dual/Solo segments.
- Confirmed via direct chart-data inspection (not just visual reading) that the open bar's
  scriptable border only activates at the correct index (`[0, 1.5]` for `[closedIdx, openIdx]`)
  and that the label suffix is present.

Zero console errors beyond the pre-existing local-dev CORS fallback (unrelated — the app's live
data fetch is blocked by CORS when testing from localhost, falls back to the bundled snapshot,
same on every local test this session). Original AP127 Detail (`js/view-cohort.js`) confirmed
still byte-identical/untouched. Only file touched: `js/view-cohort-v4.js` (plus the usual
`index.html` cache-bust bump).

### AP127 Detail V4 — Daily Output "By Type" breakdown: Dual → magenta, Solo → mustard (2026-08-07, p148)

`js/view-cohort-v4.js`

User: "When By Type option is ON. Dual should be in the Magenta and Solo in Mustard color."

Simple, targeted palette change to `AP127_LESSON_TYPE_COLORS` (the Dual/Solo/Simulator stacked-bar
colors introduced in p145's breakdown toggle):

```js
// before: {Dual:"#60a5fa", Solo:"#facc15", Simulator:"#a78bfa"}
// after:
const AP127_LESSON_TYPE_COLORS={Dual:"#e88aff",Solo:"#d4a017",Simulator:"#a78bfa"};
```

- **Dual → `#e88aff`** — the app's own signature magenta accent (`var(--c127)` in
  `css/program.css`/`css/progress.css`), already used throughout this tab (SYLLABUS strip, key-point
  icons, projected-bar outline, etc.) — was previously a generic blue (`#60a5fa`) with no particular
  meaning.
- **Solo → `#d4a017`** — a deliberately duller, more brownish mustard rather than the bright gold
  `#facc15` already in use elsewhere in this tab (target-checkpoint flags, key-point ticks), chosen
  specifically so Solo bars don't get visually confused with those unrelated gold UI elements.
- **Simulator** unchanged (`#a78bfa`).

Verified live: opened AP127 Detail V4 → Daily Output chart → enabled "By Type". Read the actual
Chart.js dataset objects via `Chart.getChart(canvas).data.datasets` rather than relying on a visual
read alone — confirmed `backgroundColor` exactly `#e88aff` (Dual), `#d4a017` (Solo), `#a78bfa`
(Simulator). Screenshot confirmed clearly distinguishable magenta/mustard/purple stacked segments
with good contrast against the dark cockpit theme; legend swatches match. Zero new console errors
(only the pre-existing local-dev CORS fallback, unrelated, present on every local test this
session). Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched.
Only file touched: `js/view-cohort-v4.js` (plus the usual `index.html` cache-bust bump, p147→p148).

### AP127 Detail V4 — full stats/table/chart audit, Round A: Progress Ranking + Pace Monitor bug fixes (2026-08-07, p149)

`js/view-cohort-v4.js`

User: "Pls go through all stat, table and Charts in AP127 DETAIL V4. Suggest improvement idea and
flaw that might currently there."

**Audit method.** Three Explore agents read every function in the file in parallel — one covering
KPI cards/Pace Monitor/Progress Ranking table, one covering the Timeline/Race/Cons-Idle/SYLLABUS-
strip/Overall-Progress/Combined-Progress charts, one covering Pace Distribution/Pace Band/Daily
Output/Funnel/Watchlist/Lesson-Matrix/Roster. Their combined findings (26 items total) were then
independently hand-verified against source for the 5 highest-value claims before committing to a
plan (`.claude/plans/nested-sparking-tide.md`, kept as the standing checklist for Rounds B–E). User
chose to implement all three severity tiers, grouped into 5 sequential rounds by chart/table area
rather than one giant change — this entry covers **Round A** only.

**1. NaN% in the Progress Ranking Total row on a zero-match search.** `renderAP127Rows()`'s
`avgPctAll` divided `0/0` whenever the search box matched nobody (`rows.length===0`), rendering a
literal "NaN%" in the Total row's progress bar and text. Guarded with `rows.length?...:0`.
Reproduced and confirmed fixed live: searching a nonsense string now shows a clean "AP127 · 0 SPs"
row with 0.0%/0.0h/0 lessons and "-→-"/"-–-" placeholders, no NaN anywhere.

**2. Total row no longer mixes filtered and unfiltered data.** Every other Total-row figure
(`avgPctAll`, `sumHrsAll`, `sumDoneAll`, `avgIdleAll`, `avgDayDeltaAll`, `sumHrsDeltaAll`) already
read from the search-filtered `rows`, but `lagLastLes`/`leadLastLes` (via `sortedByDone`) and
`minFltDate`/`maxFltDate` (via `allLastDates`) were built from the full unfiltered `all` — so
narrowing the search left the "last lesson transition"/"date range" text still describing the
whole 28-SP cohort. Both now derive from `rows`, consistent with the rest of the row.

**3. "On track" no longer means two different things on the same page.** The Progress Ranking
meta line ("X/Y on track") meant "at/above the cohort's own average" (`done>=avgDone` — by
construction, roughly half the batch always qualifies); the Pace Monitor's "On Track" KPI card a
few lines away means "ETC ≤ plan end date" — a genuinely plan-based measure. Renamed the meta
phrase to "X/Y at/above avg" so it no longer reads as a second, contradictory on-track figure.

**4. Pace Monitor's "avg +Xd" no longer distorted by a never-flown student.** In the per-SP ETC
loop, a 0-hour SP has no measurable pace and falls to a `"9999-12-31"` sentinel ETC — correctly
counted as at-risk, but averaging that ~2.9-million-day "delay" straight into `avgDelay` could
render an At Risk card reading something like "avg +2900000d" the moment any one SP is at 0 hours.
Sentinel-based delays are now excluded from the average and reported separately: `atRiskSub` shows
`"avg +Xd (+N not started)"` when there's a mix, or `"N not started"` alone if every at-risk SP is
in that state. Current live data has zero 0-hour students so the visible number was unchanged
(avg +273d, same as before) — this is a latent-bug fix, not a visible regression fix, verified by
reading the code path rather than a live before/after.

**5. Plan-overdue state gets its own, non-contradictory message.** `ap127RequiredPace()` clamped
`daysRem` to 0 once the plan end date had passed and returned every `req*` field as `null` — which
made the Required Action banner say "Plan end date unavailable" while the Plan End KPI card two
lines above it, using the same underlying data, correctly showed the real date plus "0d
remaining." Added `overdue`/`daysOverdue` fields (true when the *unclamped* days-remaining is
negative); the KPI card now shows "overdue by Xd" instead of a stale "0d remaining", and the
banner shows "Plan end date (27 Nov) has passed — batch is 4d overdue" instead of "unavailable."
**Verified live** by time-traveling the As-Of scrubber to 01 Dec 2026 (4 days past the 27 Nov 2026
plan end date): both the KPI card and the banner now agree, where before this fix they'd have
shown contradictory text for the identical situation.

**6. Also fixed while in this section of the file:**
- Latent UTC-parse timezone bug in the per-SP ETC calc (`new Date(today+"T00:00:00")` →
  `"T00:00:00Z"`), matching the pattern this file already gets right in `ap127AllDatesRange`/
  `ap127v4WeekStart` — the original bug class documented in earlier rounds resurfaced here.
- Removed dead code: `ap127RankClass()` (defined, never called — `getBandColor` inline in
  `renderAP127Rows` does the real rank-badge coloring).
- Dynamically-added sort options (from clicking a column header not in the static dropdown list)
  now get friendly labels via a new `AP127_SORT_LABELS` map ("Sort: HRS Delta" instead of the
  previous raw "Sort: hrsDelta").
- The LESSON DONE column header had `data-key="ahead"`, identical to the Progress % column —
  functionally harmless (same sort order under the shared-curriculum-size assumption) but meant
  the sort-arrow indicator lit up both headers simultaneously whenever "ahead" was the active
  sort, which could look like a rendering glitch. Split onto its own `donelessons` key, wired to
  the same `ap127PaceSort()` behavior in `ap127SortRows()`. Verified live: clicking LESSON DONE
  now shows the arrow/`aria-sort="descending"` on only that header, not Progress % too.
- Added `tabindex="0"`, `role="button"`, and `aria-sort` (updated on every render) to every
  sortable `<th>`, plus Enter/Space keydown handling — previously these were plain, unlabeled
  `<th>`s with a bare `onclick`, unusable via keyboard or screen reader.
- Added an explanatory `title` tooltip to the previously bare "Rank" header, clarifying that the
  number reflects position in the *current* sort while the badge color reflects a fixed
  lessons-done performance tier — two independent signals that could otherwise be misread as one.

Verified live throughout (see individual items above for specific repro steps); zero new console
errors beyond the pre-existing local-dev CORS fallback. Original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file touched:
`js/view-cohort-v4.js` (plus the usual `index.html` cache-bust bump, p148→p149). **Rounds B
(Combined Progress/Race/Cons-Idle/Timeline charts), C (Daily Output/Funnel/Roster/Lesson Matrix),
D (SYLLABUS strip/Overall Progress polish), and E (lesson-code normalization audit) are still
pending** — full 26-item catalog in `.claude/plans/nested-sparking-tide.md`.

### AP127 Detail V4 — full stats/table/chart audit, Round B: Combined Progress + Race + Cons/Idle + Timeline chart fixes (2026-08-07, p150)

`js/view-cohort-v4.js`

Continuation of the audit begun in p149 (see that entry for method). Round B covers the four
charts one Explore agent audited: Flight Timeline vs Progress, the Race chart ("Actual vs
Planned"), Consecutive & Idle Streaks, and Combined Progress vs Plan.

**1. Combined Progress vs Plan's "To Today" filter is fixed — it was silently a no-op.**
`buildAP127CombinedChart()`'s `targetSeries` (the AP127 Targets milestone overlay added in p140)
was built from the full, unclipped schedule (`targetsRaw.map(...)`, running to 2026-11-29) while
`planSeries`/`actSeries` right next to it were both correctly clipped to `endDate`. Chart.js
autoscales the x-axis to the union of every dataset's points with no explicit bounds set, so the
Target series' far-future points kept the axis wide open no matter what `CPV_FILTER` said —
selecting "To Today" (whose entire job is to zoom the view down to what's happened so far) did
nothing. Fixed by filtering `targetSeries` to `t.date<=endDate`, same as its siblings, plus adding
explicit `scales.x.min:firstDate,max:endDate` as a second, belt-and-braces fix so no future
dataset addition can silently widen the axis again. **Verified live:** default (`proj`) mode
showed axis max `2028-12-02` (the genuine long-run projection); switching to "To Today" now
correctly collapses it to `2026-08-07` (today), with the Target series correctly clipping to
empty (the first AP127 checkpoint, 09 Aug 2026, hasn't arrived yet in this snapshot).

**2. Race chart now plots on a real time axis instead of a category axis.** `buildAP127RaceChart`
had no `x.type` set in its chart config — Chart.js defaults to `category` when data is a plain
`{labels,datasets}` pair, which was exactly this chart's shape (irregularly-spaced calendar dates
as `labels`, plain numeric y-values per dataset). A category axis gives equal pixel width to
every gap between labels regardless of real elapsed time, so a 1-day gap and a 60-day gap between
flights looked identical — a real distortion for a chart whose whole point is showing pace *over
time*. Its siblings (Cons/Idle, Combined Progress) already get this right via `type:'time'`.
Fixed by converting every dataset's data to `{x:date,y:value}` pairs (the Batch Avg dataset's
internal average calc updated to read `.y` off each point instead of a raw number) and adding the
same `type:'time'` config + `parsing:{xAxisKey:'x',yAxisKey:'y'}` the other two charts use.
**Verified live:** `race.options.scales.x.type === 'time'`, sample data point
`{x:'2026-03-31',y:0}` confirms the new shape.

**3. Per-student line color is now stable across a session instead of drifting with sort
position.** Race and Cons/Idle both computed each SP's hue as `i*360/n` off their index in
`ap127PaceSort(...)` — since that sort order changes on essentially every render where relative
progress shifts (or the As-Of time-travel slider is scrubbed to a different date), the same
student's line color could visibly drift across a session even though both charts used the
identical formula and so stayed consistent *with each other* at any given instant. New shared
`ap127StudentHue(catc_id, allStudents)`: assigns each student a hue by sorting the batch's
`catc_id`s (a fixed identity key, not a pace-dependent one) once, cached and only recomputed if
batch membership itself changes. Wired into both charts' per-racer loops. **Verified live:**
captured one student's line hue (321°) at the default sort, time-traveled the As-Of scrubber to
01 Jun 2026 (which reorders `ap127PaceSort`'s output), and confirmed the same student's hue was
unchanged — 321° both times.

**4. Timeline chart: a never-flown student no longer renders as a blank, unexplained row.** Every
other activity state on this chart already gets a colored cue — a phase-colored dot per flight,
a dashed idle tail once a student's gone quiet — but a student who simply hasn't started training
yet got nothing pushed to the chart at all beyond their own empty dataset, an empty row
indistinguishable from a data-load glitch. Added a hollow-ring marker at the plot's left edge
(`_isNotStarted` dataset) with a "Not started yet" tooltip and a matching legend chip, and made it
clickable into the student drawer via the same `sIdx` mechanism every other point uses. No student
in the current live snapshot triggers this path, so this was verified via code review + the
existing `node --check` syntax pass rather than a live before/after — the same verification
standard already used for a couple of Round A's zero-hour-student edge cases.

**5. Timeline chart: a dot click on a search-filtered-out student no longer silently no-ops.**
`onClick` resolved the clicked SP against `AP127_VIEW_ROWS` — which is the *search-filtered*
Progress Ranking rows — with no fallback if the lookup came back empty; clicking a dot for a
student currently excluded by an active search box query simply did nothing, with no feedback at
all that anything had happened. Since `openAP127Drawer()` (shared with every other click-to-drawer
entry point in this tab) strictly indexes into `AP127_VIEW_ROWS`, the correct fix is to clear
whatever search is hiding the student and re-render before retrying the lookup, rather than build
a second, parallel drawer-render path.

**6. Cons/Idle streak chart: added a note explaining the early-batch negative-average artifact.**
Every SP's streak walk starts from the *batch's* earliest-ever flown date (`allFlownDates[0]`),
not their own individual start — so a late-starting SP reads as "idle" for every calendar day
before they personally began training, which can pull the Batch Avg line deeply negative early in
the chart's timeline for reasons that have nothing to do with pace. The panel's existing note
(which only explained the color-sharing/isolate-by-click behavior) now also explains this, so a
viewer skimming a deep dip early on doesn't misread it as "the batch was idle."

Verified live throughout (see individual items above); zero new console errors beyond the
pre-existing local-dev CORS fallback. Original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only file touched: `js/view-cohort-v4.js` (plus the usual `index.html`
cache-bust bump, p149→p150). **Rounds C (Daily Output/Funnel/Roster/Lesson Matrix), D (SYLLABUS
strip/Overall Progress polish), and E (lesson-code normalization audit) are still pending** — full
26-item catalog in `.claude/plans/nested-sparking-tide.md`.

### AP127 Detail V4 — full stats/table/chart audit, Round C: Daily Output + Funnel + Roster + Lesson Matrix fixes (2026-08-07, p151)

`js/view-cohort-v4.js`, `css/progress.css`

Continuation of the audit begun in p149 (method there). Round C covers the third Explore agent's
findings: Pace Distribution (batch + solo), Pace Band, Daily Output, Phase Progress Funnel,
Watchlist, Lesson Completion Matrix, Roster.

**1. Timezone bug fixed at two more sites.** Same local-parse/UTC-serialize bug class already
fixed in `ap127AllDatesRange()`/`ap127v4WeekStart()` (parsing `today+"T00:00:00"` with no `Z`
reads as LOCAL midnight, but `.toISOString()` always serializes in UTC — silently shifting the
result back a day in any timezone east of UTC, e.g. Bangkok UTC+7) had resurfaced in two places
written after that original fix: `ap127ActualPace()` (line ~506 — feeds Pace Monitor's Actual/Gap
numbers directly) and `buildAP127Roster()`'s date-range start (line ~2576). Both switched to
`+"T00:00:00Z"` / `setUTCDate`, matching the already-correct pattern.

**2. Phase Progress Funnel could show over 100% from retaken lessons.** `doneData` counted every
flown record whose lesson fell in a phase, with no dedup per (student, lesson) — but `totalSlots`
(`phaseSlots.total * n`) assumes exactly one completion per curriculum lesson per student. A
student retaking any lesson in a phase could push that phase's "Done" bar past its own slot total,
showing e.g. "108%" on a completion funnel. Fixed with a `Set` of seen lesson numbers per student
per phase before counting — same "credit once per SP" principle as the p143 Ops Analytics
effective-hours fix. **Verified live:** all 4 phases now compute to ≤100%
(`done:[364,495,73,0]`, `totals:[364,532,644,1148]` → `pcts:[100,93,11,0]`) — `Done+Remaining`
exactly equals each phase's total by construction, so overshoot is now structurally impossible.

**3. Lesson Completion Matrix's `vsClosest` lead/lag figure had the same bug, smaller blast
radius.** It compared a student's raw `s.done` (a flight-record count that includes retakes)
against the closest AP127 Target milestone's lesson number — a student who'd retaken one lesson
showed one unit more "ahead" than reality. Fixed using a locally-computed `uniqueDone =
Object.keys(byLesson).length` (the `byLesson` grouping this function already builds is naturally
deduped by lesson number) instead of `s.done`, scoped to just this function — `s.done` itself is
left untouched everywhere else in the tab, since it's an intentional, established "raw activity
count" convention used by many unrelated call sites (Progress Ranking, KPI cards, etc.) that
weren't flagged as having a bug.

**4. Roster table now has two sticky columns, matching the Lesson Completion Matrix's existing
pattern.** `.d127v4-heat-total` (the Total lessons/hours column) had no `position:sticky` — on a
wide date range (potentially many months of day columns) it scrolled out of view while only the
Name column stayed pinned, unlike the Lesson Matrix right above it in the tab, which already pins
two columns (Name + "vs Target") for exactly this reason. Fixed by mirroring
`.d127v4-lm-name`/`.d127v4-lm-vs`'s exact pattern: `.d127v4-heat-total{position:sticky;left:82px;
...}` with a `left:66px` mobile breakpoint at ≤700px. **Verified live:** `getComputedStyle` on the
Total header confirms `position:sticky, left:82px`; a screenshot of the rendered table shows the
Name and Total columns pinned together at the left edge while day cells scroll independently.
While in this CSS section, also removed the confirmed-dead `.d127v4-heat-group` rule (no matching
class ever emitted by `buildAP127Roster()` — leftover from an earlier "group by batch" idea that
was never wired up, verified via grep).

**5. Daily Output's "latest closed period" comparison can no longer silently point at a stale
period.** `gapIdx` (added in p147, anchors the Required/Actual/Gap overlay on the latest fully-
elapsed period rather than the still-forming open one) indexed into the *filtered* `keys` array —
when "Hide off days" strips zero-activity periods out, the entry immediately before `openIdx` in
that filtered array can be an arbitrarily older, non-adjacent period if there's a real idle gap
right before today, silently breaking the overlay's own "latest CLOSED period" claim. Fixed by
resolving the true calendar-adjacent period against the unfiltered `allKeys` first, then looking
that exact key up in the (possibly filtered) `keys` actually being plotted — if it was filtered
out, `gapIdx` correctly comes back `-1` and the existing `gapIdx>=0` guard on `showTarget`
suppresses the overlay rather than comparing against a stale bar. With "Hide off days" off (the
default), `keys===allKeys` and this reduces to the original `openIdx-1`, so default behavior is
unchanged. Verified live: toggled "Hide off days" on with the By Type breakdown also active, zero
console errors, overlay legend/note still render correctly.

**6. Dual/Solo/Simulator "By Type" palette contrast improved.** The p148 recolor (Dual→magenta,
Solo→mustard) left Simulator at its original light violet `#a78bfa`. Measured perceived luminance
(0.299R+0.587G+0.114B) put Solo and Simulator at nearly identical brightness (~160 vs ~160 on a
0-299 scale) — the three colors were distinguishable mainly by hue alone, a real risk for
colorblind viewers since magenta and violet sit close together under deuteranopia/protanopia.
Simulator darkened to `#6d5cd6` (~111 luminance) — a real ~50-point lightness gap from both Dual
and Solo while staying recognizably the same "Simulator" hue family; on-segment datalabels weren't
affected since Simulator's label is a light-colored stack-total figure positioned above the bar,
not dark text drawn on top of the fill. **Verified live:** `Chart.getChart(...)`'s Simulator
dataset confirms `backgroundColor: "#6d5cd6"`.

**7. Two dead-code cleanups + one latent chart-fit bug.** Removed `ap127v4PeriodEnd()` (defined,
never called — confirmed via grep, its purpose was apparently superseded by a simpler inline check
elsewhere). Fixed `ap127FitY()` (the shared Y-axis auto-fit helper used by Combined Progress and
Pace Distribution/solo) to skip `hidden` datasets when computing the visible range — previously,
isolating a single student in Pace Distribution (solo) via the shared Race-chart student filter
still let every OTHER (hidden) student's Δ range pull the auto-fit wide after a zoom/pan, working
against the whole point of isolating one line.

Verified live throughout (see individual items above); zero new console errors beyond the
pre-existing local-dev CORS fallback. Original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css` (plus the
usual `index.html` cache-bust bump, p150→p151). **Rounds D (SYLLABUS strip/Overall Progress
polish) and E (lesson-code normalization audit) are still pending** — full 26-item catalog in
`.claude/plans/nested-sparking-tide.md`.

### AP127 Detail V4 — full stats/table/chart audit, Round D: SYLLABUS strip + Overall Progress polish (2026-08-07, p152)

`js/view-cohort-v4.js`, `css/progress.css`

Continuation of the audit begun in p149 (method there). Round D covers the remaining Tier-3 polish
items for the SYLLABUS strip and Overall Progress Bar View.

**1. Narrow phase segments no longer silently ellipsis-clip their label to nothing.** The 2-lesson
"ME Sim" segment (`AP127_BAR_SEGMENTS`, `lo:91,hi:92`) renders at roughly 2% of the strip's width
at default zoom — its name + hour-range label was getting clipped by `text-overflow:ellipsis` down
to nothing visible, with no signal to the viewer that a segment even exists there. This can't be
solved in pure CSS: segments are flex-basis percentages of a container whose real pixel width
isn't known until layout runs, so a container-query-style CSS rule isn't available for this case.
New `ap127SetSyllabusStripHtml(stripEl, html)` sets the strip's innerHTML, then schedules a
`requestAnimationFrame` pass that measures each `.d127v4-syl-phase` block's actual `clientWidth`
and toggles a `.d127v4-syl-phase-narrow` class (hides the — now genuinely unreadable — text; the
existing hover `title` tooltip and click-to-modal still work) on any block under 34px. Both places
that render the strip (`buildAP127OverallChart()`'s initial mount, `ap127SyncSyllabusStrip()` on
every zoom/pan) now route through this helper instead of setting `.innerHTML` directly.
**Verified live** two ways: (1) confirmed the logic itself is correct by manually re-running the
exact measurement code in the console; (2) confirmed the actual live code path fires correctly
after a genuine interaction — triggered a real `+` zoom click (`ap127OverallZoomV4(1.25)`), which
narrowed "Phase I" down to 16px, and confirmed it correctly picked up `d127v4-syl-phase-narrow`.
(A cold-page-load check initially came back `narrow:false` despite an 19px-wide "ME Sim" block —
traced to the test harness's background/inactive tab throttling `requestAnimationFrame`, not a
real bug; the interaction-triggered check above rules that out conclusively.)

**2. Milestone icons within 2 lessons of each other no longer visually merge.** The two GH/VFR-XC
checkrides (L54/55), the Solo/Instrument pair (L14/15), and the IFR-XC-checkride/Multi-Engine pair
(L90/91 — which also happens to land right on the bold SE→ME phase divider) previously rendered as
indistinguishable icon clusters at default zoom. Proximity is now computed on a lesson-number-
*sorted copy* of the currently-visible milestone list (the underlying `kps` array from
`ap127KeyPoints()` isn't itself lesson-sorted — checkrides are appended after the type-based
first-matches, so array-adjacent items aren't reliably lesson-adjacent), then the *later* item in
each close pair (gap ≤2 lessons) gets a new `.d127v4-syl-kp-alt` CSS class that shifts its icon and
tick line down within the 56px-tall strip so both stay legible side by side. The rendered HTML
still preserves each milestone's original array index for `onclick="openAP127MilestoneModalV4(i)"`
(which reads `AP127_OVERALL_KPS` in that same original, unsorted order), so click targets stay
correct even though the *proximity* calculation uses a re-sorted view.

**Caught and fixed a real bug in the first version of this fix, during live verification (not
shipped blind).** The initial implementation compared each milestone only against whatever
happened to be the immediately-preceding element in the raw (unsorted) `kps` array, using
`(lesson - prevLesson) <= 2` — with no `Math.abs()`. Any negative difference automatically passes
a bare `<= 2` check, so e.g. processing order `...Multi-Engine(91), CheckrideGH(54)...` computed
`54 - 91 = -37`, which is `<= 2` → **wrongly flagged as "close"**, while genuinely adjacent pairs
that weren't next to each other in the raw array (like Checkride-IFR-XC L90 next to Multi-Engine
L91) were **missed entirely**, since the check only ever looked at strict array-order neighbors.
Live-testing the DOM output (`title`/`classList` per rendered icon) caught this immediately —
"Checkride GH L54" was flagged `alt:true` despite being 37 lessons from anything, which made no
sense against the panel. Rewritten to sort a copy by lesson number first, walk that sorted copy
with a proper `Math.abs`-free (inherently non-negative, since sorted ascending) `gap <= 2` check,
and map the resulting "needs alt" decision back onto the original array indices for rendering.
Re-verified: exactly the 4 expected items now carry `alt:true` — Instrument(L15, next to Solo L14),
VFR-XC(L55, next to GH L54), Sim(L56, chains onto VFR-XC L55 — a 3-in-a-row cluster, correctly
caught too), and Multi-Engine(L91, next to Checkride-IFR-XC L90) — nothing else.

**3. Overall Progress bar-end text color now states what it's measuring against.** The per-SP
current/next-lesson label at each bar's end (`currentLabelPlugin`) is colored green ("at/ahead")
or rose ("behind") based on standing vs. the AP127 batch-wide **Target** schedule — a different
reference line than "Plan" (the curriculum's own `planned_date`s, the reference used everywhere
else in this tab, e.g. Combined Progress vs Plan / Batch Lead-Lag) — but the panel's legend never
said which one the color tracks, risking a viewer assuming it's Plan like everywhere else. Added
two new legend chips ("● text = at/ahead of target" / "● text = behind target", green/rose dots)
with an explanatory hover tooltip, next to the existing phase-color and AP127-target-line chips.

Verified live throughout (see individual items above for specific repro/verification steps); zero
new console errors beyond the pre-existing local-dev CORS fallback. Original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only files touched:
`js/view-cohort-v4.js`, `css/progress.css` (plus the usual `index.html` cache-bust bump,
p151→p152). **Round E (lesson-code normalization audit) is still pending** — full 26-item catalog
in `.claude/plans/nested-sparking-tide.md`.

### AP127 Detail V4 — full stats/table/chart audit, Round E: lesson-code normalization audit — ruled out (2026-08-07, no code change)

No file touched — this round concludes the audit begun in p149 with a **ruled out, not fixed**
verdict, per the plan's own framing ("confirm or rule out... before deciding whether it needs a
fix").

**The concern:** `ap127AsOfStudents()` normalizes lesson codes with `.toUpperCase().trim()` before
comparing them (its `flownSet`/`nx` lookup) — the only place in the file that does this, which
reads as defensive coding written in response to some past real casing/whitespace inconsistency.
Every other lesson-code-keyed lookup in the file — `ap127Hours()`'s `lessonsMap`,
`ap127RequiredPace()`'s/`ap127ActualPace()`'s `lessonsMap`s, every `planMap` (Progress Ranking,
Pace Monitor, the student drawer) — does a **raw, unnormalized** object-key lookup. If a flown
lesson code ever differed in case/whitespace from the curriculum's own code for that same lesson,
`ap127Hours()` would silently fall back to the flight's *actual* logged minutes instead of the
curriculum-standard duration — quietly violating the tab's headline "HOURS = EFFECTIVE" guarantee
for that one flight — and the various `planMap` lookups would silently return `null`/`"-"`
("no planned date") for a lesson that does have one under a different casing.

**Verification method:** inspected the live bundled dataset directly (`window.PROGRESS_DATA`, the
same object `ap127AsOfStudents()`/`G` are built from) via the browser console — built the full set
of unique curriculum lesson codes (`cur127[].lesson`) and the full set of unique flown lesson
codes across every student (`ap127[].flown[].lesson`), then checked every flown code for (a) an
exact raw-string match in the curriculum set, and (b) if no exact match, whether a
`.toUpperCase().trim()`-normalized match existed instead (which would be the smoking gun for this
bug class).

**Result:** 96 unique curriculum codes, 43 unique flown codes, **zero** casing/whitespace-only
mismatches, **zero** flown codes missing from the curriculum set entirely — every single flown
lesson code in the live dataset is an exact raw-string match against its curriculum entry.

**Conclusion: ruled out, no code change made.** The bug class is real in principle (and the
defensive normalization in `ap127AsOfStudents()` suggests it was a genuine problem at some point,
likely upstream data that's since been cleaned), but it is not currently live — there is no
observable case to fix, and no way to verify a preventive change actually does anything against a
live dataset that already exhaustively passes. Applying a broad "normalize every lookup" change
across half a dozen call sites for a purely theoretical, currently-nonexistent condition would be
exactly the kind of speculative, unverifiable "fix" this session's standing discipline (verify
live, not just written and shipped) argues against. If upstream data quality regresses in the
future and this class of bug resurfaces, the fix is straightforward and localized (reuse the same
`.toUpperCase().trim()`-then-Map pattern `ap127AsOfStudents()` already has) — but there's nothing
to fix today.

**This closes the full 26-item audit catalog from `.claude/plans/nested-sparking-tide.md`
(Rounds A–E, p149–p152).**

### Schedule Gantt — AP-127 FOCUS dim fixed to be per-flight, not per-row (2026-08-07, p153)

User-reported: "In schedule Gantt, the AP127 quick button seem to a bit off. When it active it
should dim all other than AP127 SP but I found some other than AP127 still not dim."

**Root cause** (systematic debugging — traced against the correct, already-working pattern in
`view-board.js`/`view-weekly.js` before touching anything): `view-gantt.js` was the only Schedule
view dimming AP-127 FOCUS at the **row** level instead of per **flight**. It computed
`hasHL = r.flights.some(f=>f.batch===HIGHLIGHT_BATCH)` and applied a single `rowAlpha` (0.28 when
`highlightAP127` is on and the row has zero AP-127 flights, else 1) as `opacity` on the whole row
`<div>`. Gantt groups rows by tail or instructor — a row routinely contains flights from more than
one batch (e.g. the same tail flying an AP-127 student in one slot and an AP-126 student in the
next; or one instructor teaching across batches that day). Any such mixed row had `hasHL === true`,
so `rowAlpha` stayed `1` and **every** bar in that row rendered at full brightness, AP-127 or not —
exactly the reported symptom.

**Fix:** removed the row-level `hasHL`/`rowAlpha` mechanism entirely and applied the same shared
`flightAlpha(f, hlOn)` helper (`js/shared.js`) Board/Weekly already use, per flight bar, keyed off
that flight's own `f.batch` — folded into the bar's existing status-based opacity expression:
`opacity: (dim?0.4:isFiSP?0.75:1) * flightAlpha(f, app.highlightAP127)`.

**Verified live** (local static server, `python3 -m http.server`, since the file served via
`file://` can't fetch the local JSON data): toggled AP-127 FOCUS on in both A/C and INSTRUCTOR
grouping. Tail `HS-TVC` (AWIRUT, AP-127, dashed magenta) sitting next to a same-row AP-129 flight —
only AWIRUT stayed bright, the AP-129 bar dimmed. Instructor `EKKAPHOP R.` (an AP-127 flight) shown
correctly bright while every other instructor row (no AP-127 flights that day) dimmed as before.
Toggled focus off — confirmed full brightness restored everywhere (no regression). Zero new console
errors (only the pre-existing, already-documented local-dev CORS fallback). Only file touched:
`js/view-gantt.js`.

### AP127 Detail V4 — Daily Output: explanation behind ⓘ icon, new summary KPI row (2026-08-07, p154)

`js/view-cohort-v4.js`, `css/progress.css`

User: "Hide the explanation in an i icon" + "Add summary KPI card, not too big: Total, Total duo,
Total solo, Total sim." (Note: this session's audit work had reached p152; a concurrent session's
Gantt fix landed on `main` as p153 in between, so this change correctly took p154, the next real
available token.)

**1. Explanation collapsed behind a ⓘ button.** The panel's long explanation paragraph
(`#d127v4-lb-note`) previously rendered inline, always visible, ahead of the chart. It now starts
`display:none` and toggles open/closed via a new small round ⓘ button placed right next to the
panel title, wired to new `ap127ToggleLBInfo()`/`ap127ToggleLBInfoV4`. Same text as before — it's
just not taking up vertical space by default anymore.

**2. New compact 4-card summary row (Total / Dual / Solo / Simulator).** Added directly above the
chart, reusing the existing `.cpv-kpi` component (already used by Combined Progress and Pace
Distribution's KPI rows) inside a new `.d127v4-lb-kpis` container — a 4-column grid (2-column
below 900px, matching `.cpv-kpis`'s existing breakpoint). Per the "not too big" ask, the reused
card's value font is shrunk from the usual 20px to 16px via a scoped override
(`.d127v4-lb-kpis .cpv-kv{font-size:16px}`) and padding tightened. The row reflects the SAME
currently-visible range/unit/"Hide off days" filter as the bars themselves (not a separate,
independently-computed figure) — Total's subtitle shows the period count (e.g. "110 days"),
Dual/Solo/Simulator's subtitles show each type's % share of Total.

**Required one small change to the underlying calc, not just the UI:** `buildAP127LessonBar()`
only accumulated the Dual/Solo/Simulator per-period breakdown (`byPeriodType`) when the "By Type"
stacked-bar toggle (`breakdown`) was on — reasonable when that breakdown only ever fed the bars
themselves, but the new KPI row needs those totals unconditionally, regardless of whether "By
Type" happens to be toggled on. Removed the `if(breakdown)` gate around that accumulation; it now
always runs (trivial extra cost — a few additions per flight in a loop that already runs once per
render).

**Verified live**, cross-checked against the page's own existing headline numbers rather than just
eyeballing plausibility: switched to Lessons mode and confirmed Dual 637 + Solo 295 + Simulator 0
= 932, exactly matching the "932 lessons done" figure shown in the tab's top meta line; switched
back to Hours mode and confirmed the 68% / 32% / 0% split sums to 100%; confirmed the four cards
update correctly across every Unit (Hours/Lessons) and Period (Day/Week/Month) combination tested;
confirmed the ⓘ toggle correctly shows/hides the note (`display:none` ↔ `display:block`) with no
layout breakage, screenshotted both states. Zero new console errors beyond the pre-existing
local-dev CORS fallback. Original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css` (plus the
usual `index.html` cache-bust bump, p153→p154).

### OPS ⇄ PROG exact reconciliation — root-caused every remaining hour of Δ (2026-08-05, p158)

`js/shared.js`, `js/view-summary.js`, `js/crosscheck-monthly.js`, `js/view-crosscheck.js`

Same-day follow-up to the p143 fix (effective-hours dedup + lesson sequence check). User: **"All
should be match exactly... go through all detail as much as you need and make it all the same...
If still cannot make it the same then show me in the way that we can pin point all the different
points."** Method: instead of trusting aggregate hour totals, directly compared the "matched,
same-month" totals on both sides of each batch/month **record-by-record** until every remaining
discrepancy traced to a named, real cause. Found and fixed three more real bugs, all confirmed live:

1. **Duplicate `.id` values silently under-corrected the effective-hours dedup.** The credited-row
   `Set` from the p143 fix tracked rows by `f.id`. Live testing found several Ops Portal rows share
   the *exact same* `.id` string — the same upstream id-generation issue this file's own p116 entry
   already documented for `ACTUAL_ONLY_*` records ("60 ids map to genuinely different flights...").
   A plain `Set` of ids credits *every* row sharing a duplicated id, not just the intended one —
   confirmed on a real group (student NANJITRA D., lesson `CSXV 45`, 5 Ops rows, 4 sharing the
   literal id `"ACTUAL_ONLY_3255"`): the id-based version credited 4 of 5 instead of 1. Fixed by
   tracking flight **object references** in the credited `Set` instead — safe regardless of
   duplicate ids, since every aggregation reads the same `FLIGHTS` array's object references. The
   true correction for AP-126 May turned out to be 523.2h→475.2h (212 of 227 bookings credited),
   not the id-based version's under-corrected 523.2h→510.2h.
2. **A lesson-code spelling mismatch between the Ops Portal and the curriculum.** Systematic sweep
   (edit-distance search between every OPS-only and PROG-only lesson code, both batches) found
   `"CDNXV 48"` (Ops Portal) and `"CDNXC 48"` (curriculum `cur126` / Progress) are the *same lesson*
   — confirmed by matching all 28 occurrences 1:1 by student+date (same students, same dates,
   near-identical durations). Left unfixed, this both under-priced Ops Analytics' effective hours
   for these bookings (curriculum-map lookup keyed on the curriculum's own spelling failed, falling
   back to raw block time) and made every reconciliation misreport it as two independent gaps — a
   false "lesson type Ops never tracks" on the Progress side, a false "Ops-only, no Progress record"
   on the Ops side. Fixed with a new `AP_LESSON_CODE_ALIASES` map in `js/shared.js`, applied once at
   load time to `window.FLIGHT_DATA.flights[].lesson` — same pattern, same file, as the existing
   `AP127_STUDENT_ALIASES` fix (p131), so every downstream view benefits with zero per-view change.
3. **The dedup didn't recognize bare and "/1" lesson codes as the same lesson, and zeroed a lesson
   logged only as continuation legs with no "/1"/bare leg at all.** Two related gaps in the p143
   dedup: (a) a short/aborted bare-coded attempt (e.g. `"CSXV 45"`, 45 min — clearly too short to be
   the real completion) plus a later properly-split `"/1,/2,/3"` re-attempt of the *same* lesson
   were two unrelated single-row groups, each independently credited — confirmed live (student
   NAPATH T., lesson `CSXV 45`: a 2026-05-22 bare booking + a 2026-05-26 3-leg booking; Progress's
   own single flown record matches only the May-26 completion) and found to recur in 4 cases across
   the whole dataset (~11h). (b) A lesson logged *only* as continuation legs (`"/2"`,`"/3"`...) with
   no `"/1"`/bare leg ever recorded fell through `sEffectiveMins()`'s part-based logic to 0 credit
   every time, despite Progress showing it done — confirmed live in 8 cases across the whole
   dataset (~9h). Fixed by rewriting `sBuildEffectiveCreditSet()` (`js/view-summary.js`) and its
   `js/crosscheck-monthly.js` mirror around a single "lesson family" concept: group every Completed
   flight by **base** lesson code (any `/N` suffix stripped), then pick one credited representative
   — a "part 1" (bare or `/1`) row if any exists in the family (latest date/time wins among those);
   only when the family has *no* part-1 row at all does the earliest-available continuation leg
   stand in. The credited row's hours are now looked up directly by base code (not by re-parsing its
   own suffix via `sEffectiveMins()`/`effMinsFromDur()`), which required updating `hoursOf()` and
   the ledger's `minsOps` accordingly.

**New deliverable: the Reconciliation Ledger.** Even after all three fixes, small residuals could
remain from ordinary system lag. New `computeLedger(hoursMode)` in `js/crosscheck-monthly.js`
computes, per batch/month, the complete bidirectional accounting — `Δ(PROG−OPS) = structural +
opsPending + opsCanceled + progTrueGap + progDrift − opsOrphan − opsDrift (+ residual)` — six
categories (lesson-type-never-tracked, Ops-still-Pending, Ops-Canceled, no-Ops-record-at-all,
cross-month drift both directions, Progress-hasn't-logged-it-yet), each a real itemized list of
student+lesson+date records, with `residual` printed as a direct self-validation rather than
assumed zero. New "Reconciliation Ledger" panel in Cross-Check's "Monthly OPS ⇄ PROG" view
(`js/view-crosscheck.js`) — one collapsible row per batch/month, each category a clickable
count+hours chip expanding to its full line list, closed with a "✓ fully explained" / "residual
±Xh" badge. Supersedes and removes the prior day's one-directional `dateDrift`/`noMatch` diagnostic
panels (the ledger strictly subsumes them — bidirectional, status-aware, validated).

**Result, confirmed live after all three fixes:** 5 of 6 batch/month rows now reconcile to an
exact **0.00h** residual; the 6th (AP-127 July) is **0.01h** off — floating-point rounding only
(~0.6 minutes), not an unexplained gap. AP-126 June — the worst case going in (+8.5% before the
p143 fix) — is now fully explained: 18 Ops-Pending bookings (+62.0h), 1 Canceled (+2.0h), 1 true
gap (+2.0h), 2 cross-month-drift-from-Ops (+4.5h), 1 cross-month-drift-from-Progress (+5.0h), net
Δ +65.5h, residual 0.0h.

Verified live throughout: Ops Analytics (KPI/composition/charts/Batch Summary/Lesson Sequence
Check) renders correctly with the updated formula, zero console errors; Block/Actual hours mode
confirmed unchanged (no dedup applied there, as designed); flight *counts* unaffected (still raw
per-booking, only hours are deduped); `js/view-program.js` (School Perf./School Analysis)
confirmed untouched; ledger expand/collapse exercised at both category and line-item level;
mobile 390px checked (panel + expanded breakdown both scroll correctly, no horizontal overflow).
Design: `docs/superpowers/specs/2026-08-05-ops-prog-exact-reconciliation-design.md`.

### Ops Analytics — SIM hours fixed: upstream `isSim` flag wrong for ~67% of sim flights (2026-08-08, p159)

`js/shared.js`

User: "In OPS ANALYTICS, hour of SIM look off, check that too." Investigation started from the
Cross-Check Monthly Ledger's own "Sim-tag mismatch" diagnostic (flagged the previous round as a
known, unresolved gap): AP-126 June showed Progress logging 100 sim lessons that month against
**0** Ops-Analytics-flagged sim flights — not a rounding difference, a whole month invisible.

Root cause, confirmed directly against the raw `flight-data.js`: the Ops Portal feed uses **two
different aircraft-type spellings for the same simulator devices** — `"DA40 (SIM)"`/`"DA42
(SIM)"`/`"R44 (SIM)"` (parenthetical) and `"DA40_SIM"`/`"DA42_SIM"`/`"R44_SIM"` (underscore), both
genuinely present side by side in the live feed. Whatever upstream logic sets each flight's
`isSim` boolean only ever recognized the parenthetical spelling — every underscore-typed flight's
`isSim` came through `false`. Quantified: **481 of 713 simulator flights in the entire dataset
(≈67%) were mis-flagged.** The underscore convention is concentrated in one window (2026-06-08 to
2026-07-10), which is why it went unnoticed in the *default* 30-day Ops Analytics view (that
window had already rolled mostly out of "last 30 days" by the time this was reported) but showed
up starkly in June's Cross-Check ledger. Confirmed the Aircraft Status tab was never affected —
its own `uIsSim()` (`js/view-aircraft.js:125`) already does a robust `/SIM/i` substring test on
`type` rather than trusting the raw flag; Ops Analytics, the Cross-Check sim-tag diagnostic, and
anywhere else reading `f.isSim` directly inherited the bug.

Fixed the same way as the student-name and lesson-code alias bugs (p131, p158): a one-time,
load-time normalization pass in `js/shared.js`, `f.isSim = true` whenever `/sim/i.test(f.type)` or
`/\(sim\)/i.test(f.tail)` (the latter checked as a belt-and-suspenders fallback — confirmed live it
agrees with `type` on all but 4 of 713 sim flights) — so every downstream view benefits with no
per-view change, same as the established pattern in this file.

Verified live: Cross-Check's sim-tag mismatch dropped from AP-126 June 0-vs-100 (Δ100) / July
134-vs-235 (Δ101) to June 99-vs-100 (Δ1) / July 231-vs-235 (Δ4) — the tiny remainder traced to a
single already-known "Ops booking still Pending" case (student Prem Ponvilai, already correctly
categorized in the Reconciliation Ledger, not a new bug). Ops Analytics' 90D view now correctly
shows sim hours for AP-124 (18.0h) which showed none before. Zero console errors. Only file
touched: `js/shared.js`.

## p160 (2026-08-08 — Aircraft Status / SP Stat & FI Stat — precise-value drilldown, root-cause
investigation of a reported "rounding causes totals to be off" bug)

User (SP Stat sub-tab): "When flight time is 15 or 20 minutes these rounded as 0.3hr and it add
up cause the total calculation way off." Investigated via `superpowers:systematic-debugging`
before changing anything.

**Root cause found: the total/summation math was already correct — no bug there.** Every total in
`PersonStatTab`/`UtilizationTab` (`personTotals`, `dayTotals`, `kpi.totalHours`, group/type totals)
is built by summing each flight's raw `durMin/60` float; `.toFixed(1)` is applied only once, at the
final render step, never fed back into further arithmetic. Verified live against the deployed site
before touching code: student SIRIKIAT B. (30d window) has several sub-hour flights: hand-summing
the *displayed* 1-decimal day cells gives 7.9h, but the app's own Total correctly shows **7.8h** —
which matches the true precise sum (7.75h → toFixed(1)), not the rounded-cell sum. So the visible
Total was never wrong.

**Real bug: no way to verify that by hand.** The day-cells AND their hover tooltips both rounded to
1 decimal, so a 15-min flight and a 45-min flight could render as the same "0.3h"/"0.8h", and
hovering a cell for "the exact number" returned the *same* rounded number — zero additional
precision, so a user had no way to reconcile a total against its line items, reasonably reading
that as broken math. Fixed by adding `uFmtHPrecise()` (2dp) and routing it through every
manual-verification surface: cell hover tooltips (`title` attr) and the click-to-open drawer
(day/week/month/period summary tiles + each individual flight's block/airborne hours), in both
`UtilizationTab` and `PersonStatTab` (covers Utilization, FI Stat, SP Stat — all share this code).
Left the compact heatmap cells and headline KPI/Load-Distribution numbers at 1 decimal, matching
this app's convention everywhere else for "at a glance" hour figures — only the drilldown surfaces
changed.

Verified live (local static server): SIRIKIAT B.'s 21 Jul cell tooltip now reads "0.75h" (was
"0.8h"); opening that cell's drawer shows This Day 0.75h / Wk 1.75h / Jul 2026 5.50h / period
7.75h, each figure now hand-verifiable against the single 08:30–09:15 flight line item beneath it
(also 0.75h) — no more silent rounding gap. Zero new console errors (only the pre-existing
local-dev CORS fallback). Only file touched: `js/view-aircraft.js`. Cache-bust bumped to p160.

## p161 (2026-08-08 — same-day follow-up: audited every other CMDV2 tab/sub-tab for the p160
rounding-verification gap)

User: "Pls also check all other tab and sub-tab in CMD V2 about this precision problem." Swept
every `js/view-*.js` file (22 files) for the same failure shape as p160: a per-flight/per-day hour
value shown ONLY at 1 decimal in a surface a user would use to manually verify a total (hover
tooltip, click-through breakdown), with no more precise view available.

**Confirmed no real accumulation bug anywhere** — every hour total in every view sums raw
`durMin/60` (or equivalent) with `.toFixed()` applied once at final render; grepped every
`reduce()`+`toFixed` combination in the codebase and confirmed each rounds only the terminal
output, never an intermediate value that gets summed again.

**Found and fixed 2 more instances of the exact p160 gap** (both: row/cell total was already an
accurate precise sum, only the tooltip lacked the precision to verify it by hand):
- `js/view-summary.js` — Ops Analytics' `RosterHeatmap` (Student Activity / Instructor Activity):
  cell tooltip `v.toFixed(1)` → `v.toFixed(2)`.
- `js/view-roster.js` — PM Roster board: cell tooltip `cell.hours.toFixed(1)` → `.toFixed(2)`.

**Checked clean, no change needed** (already exact or intentionally coarse-and-acceptable):
- `js/view-crosscheck.js` + `crosscheck-monthly.js` (Cross-Check "Monthly OPS ⇄ PROG" ledger) —
  already BETTER than 2dp: itemized lines are `.toFixed(2)`, with an explicit residual and "✓
  fully explained" check (built in p158, see that entry).
- `js/view-cohort.js` / `view-cohort-v4.js` (AP127 Detail / V4 Roster) — per-day cell tooltips use
  `hm()`, an exact `H h MMm` minute-based formatter, not a rounded decimal at all.
- `js/view-gantt.js`, `js/view-board.js`, `js/view-daily.js`, `js/view-calendar.js` — per-flight
  tooltips/rows show the raw `f.start`–`f.end` time or the exact `f.duration` string, never a
  rounded decimal; clicking opens the shared exact `Drawer()` (`js/shared.js`, shows
  `Math.floor(f.durMin/60)}h {f.durMin%60}m` — exact to the minute).
- `js/view-program.js`, `js/shell.js` — remaining 1-decimal hour figures are day/period-aggregate
  KPI tiles or Chart.js tooltips (whole-batch totals), not itemized per-flight lists a user would
  hand-sum — same category as the headline KPI numbers p160 deliberately left alone.
- `js/view-weekly.js`, `js/view-schedule.js`, `js/view-ap127-targets.js`,
  `js/crosscheck-monthly.js`, `js/ap127-targets-data.js`, `js/view-watchdog.js`,
  `js/view-tutorial.js`, `js/view-cf-usage.js`, `js/view-autoslotfinder.js`, `js/view-overview.js`
  — no hour-total rounding present, or only percentage/count figures (not the affected pattern).

Verified live (local static server, cache-bust bumped to p161 to defeat browser HTTP caching of
the unchanged-URL `?v=p160` scripts that masked the first verification attempt): Ops Analytics'
Student Activity roster tooltip for AKARAVIT K. now reads "1.33h" (was "1.3h"); PM Roster board's
tooltip for the same student now reads "2.17h" (was "2.2h"). Zero new console errors (only the
pre-existing local-dev CORS fallback). Files touched: `js/view-summary.js`, `js/view-roster.js`.

### AP127 Detail V4 — "Batch Lead/Lag History" → "Batch Lagging History": flipped to lag-only, floored at zero (2026-08-08, p162)

`js/view-cohort-v4.js`

User: "Now I want to redesign the BATCH LEAD/LAG HISTORY chart. Due to it always lagging. I want
to change to Batch lagging chart. The Y axis show lag hour/lesson in positive. (Basically flip the
current one). If the progress is lead plan it will be be zero on the chart."

**Why:** the batch is realistically always behind schedule — a signed lead/lag line spent almost
all its history in negative territory, with the "ahead of plan" half of the y-axis essentially
unused dead space. A lag-only, always-positive framing is a better fit for what this chart is
actually used for (tracking how far behind, not whether-ahead-or-behind).

**What changed, in `buildAP127HistBatch()`:**
1. Per-date value flipped from `delta = cumulative_actual − cumulative_planned` (signed, `+` when
   ahead / `−` when behind) to `lag = Math.max(0, cumulative_planned − cumulative_actual)` — always
   ≥0. A day the batch is on-plan or genuinely ahead now reads as flat zero rather than a dip below
   the x-axis, per the explicit "if the progress is lead plan it will be zero on the chart"
   instruction.
2. Y-axis given `beginAtZero:true` so 0 is always the visible floor.
3. Line + fill recolored solid red/rose (`#ef4444`, was the tab's signature magenta with a two-tone
   green-above/red-below-zero fill) — the old two-tone fill made sense for a bidirectional value;
   a lag-only chart is "how bad is it," so a single red fill under the curve reads correctly.
4. Tooltip changed from `Batch Δ: ±Xh` to `Lag: Xh behind` (or `On plan or ahead` at zero).
5. KPI cards relabeled: `Now`/`Best`/`Worst` kept as headings, but `Best` now means "lowest lag
   ever reached" (was "peak lead ever") and the +/− sign prefix was dropped from all three (values
   are never negative now); `Now` shows `"On plan"` in the done-color when lag is exactly 0 rather
   than `"+0.0h"`.
6. Panel renamed "Batch Lead/Lag History" → "Batch Lagging History" everywhere it's referenced:
   the panel's own `<span class="d127-t">`, the top-of-tab "HOURS = EFFECTIVE" badge's tooltip
   (which lists every chart using the standard-duration hours convention by name), and one internal
   code comment.
7. Panel note text rewritten to describe the new floored-at-zero semantics instead of the old
   above/below-zero framing.

**Explicitly out of scope, left untouched:** the separate "Individual Lead/Lag vs Plan" chart
(per-SP, `buildAP127HistSolo()`) — individual students genuinely do run ahead of plan sometimes,
so a bidirectional view is still the right shape there; the user's request was specifically about
the *batch* chart.

Verified live: Hours mode showed "949.0h behind schedule today" / "28.0h closest to plan ever" /
"958.1h peak lag ever" with an entirely red, monotonically-shaped, always-positive line growing
from 0h to ~950h across the batch's history (screenshot confirmed no segment dips below the
x-axis); switched to Lessons mode and confirmed proportionally consistent values (409 / 28 / 581
les), still all positive; zero new console errors beyond the pre-existing local-dev CORS fallback.
Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file
touched: `js/view-cohort-v4.js` (plus the usual `index.html` cache-bust bump, p161→p162).

### AP127 Detail V4 — new "Export PDF" button (2026-08-09, p163)

`js/view-cohort-v4.js`, `index.html`

User: "No I want this tab export function. To snap the current state as pdf. It should include
all data in the page with proper layout. But this should not effect the current look of the page.
Pls design and propose to me with example of today report."

**Process.** Given the scope (a genuinely new feature, not a fix), this shipped in two steps
rather than going straight to code. First, a design proposal + a hand-built example PDF
(reportlab, Python, built by scraping live data + Chart.js `toBase64Image()` PNGs out of the
running app via the browser tooling) was delivered for review — covering the intended layout,
what data each section would show, and one genuine open fork (how to handle the Roster/Lesson
Matrix heatmaps, which are plain DOM tables, not Chart.js canvases, so can't use the same
image-export trick). User reviewed the example and chose "Screenshot via html2canvas" for those
two panels (over omitting them or a condensed summary table). The real in-app feature was then
built to match.

**Architecture.** Entirely client-side, no server round-trip: **jsPDF** + **jspdf-autotable** +
**html2canvas**, all three loaded via CDN in `index.html` (unpinned, like Chart.js/React — external
libraries, not this project's own versioned code, so they don't need the `?v=` cache-bust dance).
New `ap127ExportPDF()` deliberately reads the ALREADY-RENDERED DOM (KPI cards, Pace Monitor tables,
Progress Ranking rows, chart canvases) rather than recomputing anything from `G`/
`ap127AsOfStudents()` independently — this guarantees the PDF is byte-for-byte what's currently on
screen (any active search filter, sort, time-travel As-Of date, custom Daily Output date range)
with zero risk of a second, independently-drifting copy of the app's formulas — the exact bug class
this file's own `ap127Hours()`/`ap127RequiredPace()` comments warn about repeatedly. New "⬇ Export
PDF" button added to the tab's title bar, right next to the existing "HOURS = EFFECTIVE" badge —
purely additive; no existing element's position, size, or behavior changed.

**Report contents — genuinely all of the tab's data**, per the "include all data in the page"
requirement: cover page (report/data-as-of timestamps, live-vs-time-travel state) + Batch Summary
KPIs; Pace Monitor (3 KPI cards, both 1-SP/28-SP Req·Act·Gap tables, the Required Action banner);
Daily Output (4 KPI cards + chart); Batch Lagging History; Combined Progress vs Plan; Phase
Progress Funnel; Pace Distribution; Individual Lead/Lag vs Plan; Actual vs Planned; Consecutive &
Idle Streaks; Needs Attention (Watchlist) table; Flight Timeline (landscape); Overall Progress Bar
View (landscape, all 28 SP); the full Progress Ranking table (landscape, all 28 SP × all 13
columns, repeating header on page-break); Roster heatmap; Lesson Completion Matrix.

**Real bug found and fixed during live testing, not shipped blind.** html2canvas 1.4.1's own CSS
color parser can't handle `oklch()`/`color-mix(in oklch,...)` — and this app's ENTIRE theme system
is built on it (`css/theme.css`'s `:root` palette variables are declared as `oklch(...)`, and
`color-mix(in oklch,...)` is used across `theme.css`/`progress.css`/`program.css`, not just one
isolated spot as first suspected). A direct `html2canvas(el)` call on the Roster or Lesson Matrix
threw `"Attempting to parse an unsupported color function oklch"` and aborted the ENTIRE export,
not just that one panel — confirmed via direct console inspection during testing (3 full-export
failures in a row, all this exact error, before the fix). Mitigated two ways:
1. `cloneForCanvas(realEl)` — screenshots a temporary, off-screen CLONE of the target (never the
   live element), with every node using an inline `color-mix()` style swapped for the plain
   `rgb()` value the browser had already resolved it to (read via `getComputedStyle` on the
   still-mounted original — the same resolution the browser already does for normal rendering).
2. That alone didn't fully eliminate the failure (the root cause runs deeper, into custom-property
   resolution across the whole clone's style tree, which a per-node inline-style patch can't fully
   reach without a much larger rewrite) — so each heatmap capture is now wrapped in its own
   try/catch. On failure, it falls back to a real jspdf-autotable data table instead of an image:
   Name + the one column that actually carries visible text (Roster's Total lessons/hours; Lesson
   Matrix's vs-Target lead/lag) — the heatmap's hundreds of day/lesson cells carry no text at all,
   only background color, so dumping them as a table wouldn't be useful anyway — with a note
   explaining why a screenshot wasn't used. **The export as a whole can no longer fail because of
   this**, regardless of which path a given browser/environment hits. Verified live: forced the
   PDF's `.save()` to reveal its actual bytes (see verification method below) — the resulting file
   contains the graceful fallback tables for both panels, generated cleanly with zero uncaught
   errors, confirming the safety net works in the exact environment where the direct-capture path
   fails.

**Second bug found and fixed during verification.** jsPDF's default PNG image embedding turned out
to be near-uncompressed — confirmed via `pdfimages -list` on a full test export, which showed every
embedded chart image at a 100% storage ratio (i.e., no compression applied at all). An early
complete export (9 chart images + 2 heatmap panels, before the html2canvas fallback existed) came
out to **21.5MB**. Fixed by passing jsPDF's `"MEDIUM"` compression option to every `addImage()`
call (kept as PNG rather than switching to JPEG, to preserve the charts' transparent backgrounds —
Chart.js canvases render with no background fill by default). Re-verified the identical export
afterward: **1.77MB** — a ~12x reduction, with no visible quality loss on any rendered page.

**Third set of fixes found during verification.** Several DOM reads used `.textContent`, which has
no concept of layout and collapses `<br>`-separated header/label text with zero separating space
(e.g. the Progress Ranking table's "SE<br>TYPE" header read back as "SETYPE"; Pace Monitor's
"Month<br>(30d)" period cell read back as "Month(30d)"). Fixed by switching every such read to a
new shared `txt(el)` helper using `.innerText` instead, which IS layout-aware and inserts real line
breaks for `<br>`/block elements — `.replace(/\s+/g," ")` then correctly collapses those into a
single separating space rather than none. Also fixed the Roster/Lesson Matrix fallback tables
including a spurious blank/duplicate header row: the fallback's row query (`el.querySelectorAll`)
was matching `<thead>` rows too, since the name/value CSS selectors it targets (e.g.
`.d127v4-heat-name`/`.d127v4-heat-total`) are used on both `<th>` and `<td>` elements per this
codebase's existing convention — scoped the query to `tbody tr, tfoot tr` (the latter picks up the
Lesson Matrix's "BATCH %" summary row too, which is genuinely useful to keep).

**Verification method — genuinely end-to-end, not just "no console errors."** Triggered the real
`ap127ExportPDFV4()` button function live in the browser via its actual code path (not a
hand-written stand-in), but intercepted jsPDF's `.save()` (monkey-patching the constructor to wrap
`inst.save`) to capture the real generated PDF's bytes via `.output('datauristring')` instead of
relying on an unobservable browser download — the automated test browser has no filesystem bridge
to inspect a real download. Decoded the captured base64 back into an actual `.pdf` file on disk and
inspected it directly with `pdfinfo`/`pdftoppm`/`pdfimages` — confirmed: valid 11-page PDF, correct
live data on every page (exact KPI figures matching the on-screen ones, all 6 embedded charts
render correctly, the full 28-row/13-column Progress Ranking table paginates with a repeating
header, the Roster/Lesson Matrix fallback tables render cleanly with the header-duplication bug
gone), 1.77MB file size, zero garbled text after the `.innerText` fix. Zero new console errors
beyond the pre-existing local-dev CORS fallback (the 3 `"ap127ExportPDF failed: ...oklch"` error
lines visible in the console are stale — from the 3 test attempts made *before* the try/catch
fallback existed, not from the final, verified-working code; confirmed by checking for the newer
`"falling back to a text table"` warning instead, which appears exactly twice per successful run,
once per heatmap panel, matching the fallback path actually engaging as designed).

Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched throughout.
Files touched: `js/view-cohort-v4.js`, `index.html` (3 new CDN script tags for jsPDF/autotable/
html2canvas, plus the usual cache-bust bump, p162→p163).

---

## p164 (2026-08-12 — **New tab: AP127 Detail V5** — a redesigned, consolidated
successor to AP127 Detail V4, additive only. User: "I want to continue develop the AP127 DETAIL V4
tab... New version of AP127 DETAIL will be on a new tab 'AP127 DETAIL V5'... Keep all the current
system and tab." Full design doc:
`docs/superpowers/specs/2026-08-12-ap127-detail-v5-design.md`.

**Why.** V4 had grown to 16 stacked panels / 13 Chart.js instances / 2 ~5,000-node DOM heatmaps
across ~25 rounds of incremental feedback (p121-p163), each additive, nothing ever consolidated.
User reported: laggy scrolling, duplicated charts/info, confusing layout, no chart-to-chart
consistency, no admin customisation, and a PDF export that doesn't look like the page. A study of
`js/view-cohort-v4.js` found the concrete causes (2 heatmap tables with sticky columns and
~10,400 total DOM cells; `ap127Hours()` rebuilding a 96-entry lessons map on every call from inside
sort comparators and per-row renders; 13 canvases all built eagerly on mount) and two real, live
accuracy inconsistencies: **F1** — the headline "lessons done" (`s.done`, every flight record
including retakes) disagreed with the Lesson Matrix/Phase Funnel's own deduped counts (both fixed
in earlier rounds specifically because retakes over-counted); **F2** — `ap127Hours()` credits a
retaken lesson's full standard duration on every attempt, contradicting the p143 Ops Analytics rule
("a lesson's effective hours count once per SP"), so this tab and Ops Analytics disagreed about the
same batch's hours.

**Architecture — new tab, new files, V4 untouched.**
- `js/ap127-v5-model.js` (new, plain script) — the ONLY place any V5 number is computed. Every
  formula ported **verbatim** from `view-cohort-v4.js` with its original line number in a comment;
  the two F1/F2 divergences are the sole deliberate exceptions, each documented at its site.
  Exposes `lessonsCompleted`/`flightRecords`/`hoursEffective`/`hoursLogged` as four distinct,
  separately-labeled quantities (V4 conflated the first two and the last two) plus a visible
  `retakes` count. Runs unmodified under Node (`module.exports`) — verified directly against the
  live `PROGRESS_DATA` snapshot before any UI existed: 0 mismatches across all 28 SP for every
  non-divergent figure, 11/11 self-check invariants pass, all edge cases clean (never-flown SP,
  As-Of before batch start, As-Of past plan end, empty roster).
- `js/ap127-v5-layout.js` (new) — the admin-customisable dynamic layout: a versioned config object
  (sections → panels → span/visible/opts), presets (Default/Director brief/Instructor daily/Full
  detail/Report), a validator that rejects hostile/stale configs without ever blanking the page,
  localStorage persistence + revision log, a `?v5layout=` base64url share-link codec, and an
  "export for commit" that pretty-prints the config as the pasteable new code default (git history
  on this file is the durable revision record — same honest static-host pattern as
  `js/ap127-targets-data.js`).
- `js/view-cohort-v5.js` (new) — the shell: one global command bar (Unit/Scope/Range/time-machine/
  search replace 9 independent per-panel V4 control sets), 5 sections (Pulse/Trend/People/Syllabus/
  Calendar) lazily mounted via `IntersectionObserver`, a panel registry, and every panel. 16 V4
  panels consolidated to 10: the 4 actual-vs-plan charts (Combined Progress/Batch Lagging/Actual vs
  Planned/Individual Lead-Lag) become 1 chart with `Level|Gap` × `Batch|Per-SP`; the 2 heatmap
  tables (Flight Timeline, Roster) become 1 canvas-drawn Activity Calendar; the 3 lesson-number
  views (Overall Progress Bar, Lesson Matrix, Phase Funnel) become 1 canvas-drawn Curriculum Grid
  with an integrated batch-%-complete footer band. The two canvas grids are what actually fixes the
  scroll lag — measured live: 115 DOM nodes / 3 live Chart.js instances on the Trend section
  (V4's two heatmaps alone were ~10,000 nodes). Also: a 10-generator deterministic Insight Reel
  (auto-advancing, pause on hover/focus, arrow keys), a Replay ("▶ Story") that drives the existing
  As-Of scrubber through the batch's history with extra pauses at target checkpoints/milestones,
  KPI count-up + delta flash, a collapsible Self-Check footer running 11 live invariant assertions,
  and a Report Sheet builder feeding both an on-screen preview + `window.print()` (vector, real page
  numbers from the browser) and a one-click raster PDF download (own per-page footer with real
  page numbers, drawn directly via jsPDF rather than baked into the captured image).
- `css/cohort-v5.css` (new) — entirely scoped under `.ap127-v5`, own hex/rgb palette (not the app's
  oklch() theme tokens — deliberately, so the PDF/print path never has to fight them).
- `index.html` — 3 new `<script>` tags + 1 new `<link>`, every `?v=p163` bumped to `p164`.
- `js/shell.js` — one nav entry (`cohort-v5` / "AP127 Detail V5" / ◆, in the Progress group) + one
  registry key. Neither file is DB_Share-proxied.
- **`js/view-cohort-v4.js`, `js/shared.js`, `css/progress.css` were never touched** — confirmed via
  `git diff --stat` before every commit (these three are live-proxied by DB_Share, see the note near
  the top of this file / CLAUDE.md).

**Real bugs found and fixed during live verification (not shipped blind):**
1. **chartjs-plugin-datalabels auto-registers off the CDN UMD build** the moment its `<script>` tag
   runs in `index.html` (loaded for V4's charts) — every `new Chart(...)` anywhere on the page
   inherits it, including V5's, showing raw `x:date, y:value` text stamped over every point.
   Centralized a `plugins.datalabels:{display:false}` default into the shared `mkChart()` wrapper
   rather than repeating it per chart config.
2. **`Model.segmentOfNum`/`Model.phaseOfNum` called without the `.util.` namespace** in the
   Curriculum Grid and Activity Calendar canvas draw code — `TypeError`, panel failed to render.
3. **`signed()` double-negated for callers whose formatter doesn't already take an absolute value**
   — `vsTarget`/`dayDelta` columns rendered "−-2" instead of "−2" (the "−" sign prepended to a
   still-negative `"-2"` string). Fixed centrally by having `signed()` always pass `Math.abs(v)`
   into `fmt` (safe/idempotent for `fH`/`fL`, which already did their own internal abs).
4. **A stray `container` reference inside the Output panel's `update()`** (leftover from a mount-only
   draft) threw `ReferenceError`, aborting the panel every time unit/range/asOf changed after first
   mount. Removed the two dead lines.
5. **Nested-hash routing conflict**: `goSection()` originally wrote `#/cohort-v5/<section>` via
   `history.replaceState` — but the outer app shell (`js/shell.js`) owns `location.hash` for its own
   top-level view routing and only strips a single `#/` segment, so on reload it would have read
   `'cohort-v5/pulse'` as the view id, matched nothing, and shown the "no view registered"
   placeholder for the WHOLE APP, not just failed to restore the section. Fixed by moving V5's
   section deep-link into a `?v5section=` query param instead, which that routing logic never reads.
6. **SP drawer / Customise drawer / Report preview rendered fully transparent**, letting the dimmed
   page underneath show straight through and visually collide with their own header text. Root
   cause: these overlays are deliberately appended straight to `document.body` (so `position:fixed`
   always covers the true viewport, not some ancestor's clipped box) — but every `--v5-*` custom
   property was defined scoped to `.ap127-v5`, which these overlays sit OUTSIDE of in the DOM, so
   every `var(--v5-*)` inside them resolved to nothing. Fixed by moving the variable definitions to
   `:root`. Also bumped the SP drawer's scrim from `rgba(0,0,0,.55)` to `rgba(3,4,6,.86)` — even once
   opaque, the original alpha still let the page's own bright text read as a second, distracting
   layer above the drawer on short viewports.
7. **PDF download failed outright** with html2canvas's `"unsupported color function oklch"` even
   though the Report Sheet's own nodes are palette-snapshotted to plain `rgb()` before capture —
   because html2canvas clones the **whole document** (not just the target element) to resolve
   stacking contexts correctly, so it still walked into this app's oklch()-based `css/theme.css`
   elsewhere on the page during that clone. Fixed by capturing from an **isolated `<iframe>`**
   containing only `css/cohort-v5.css` (hex/rgb only) — html2canvas's clone of that iframe's own
   document never has an oklch() value to trip on. Verified against the real generated PDF (same
   `.save()`-interception + `pdfinfo`/`pdftoppm` technique as p163): 2-3 pages, both embedded charts
   present regardless of which section was active when the report was generated, all 28 roster rows,
   correct running footer.
8. **Report charts silently missing whenever the report was generated from a non-Trend section** —
   the report read `CHARTS['progress-chart']`/`CHARTS.output`, the LIVE on-screen chart instances,
   which only exist while the Trend section happens to be the one currently mounted (switching
   sections destroys them). Fixed by extracting `progressChartCfg(model)`/`outputChartCfg(model)` as
   standalone config builders shared by both the live panels and a new `renderOffscreenChartImg()`
   that renders each into its own fresh, detached canvas at report time regardless of what's mounted.
9. **PDF footer said "Page 1" on every physical page** — a single static footer div baked into the
   captured sheet image landed wherever the raster slice happened to cut it (confirmed live: it
   showed up on the LAST page, page 3, still reading "Page 1"). Fixed by drawing a real per-page
   running footer directly via jsPDF (`Page P / N`, correct on every page) instead, with the sheet's
   own DOM footer changed to a neutral "End of report" (correct once, since it only physically
   exists at one point in the flowing content).
10. **KPI count-up race condition** — every headline tile stuck on the bare tweened number
    ("34.8" instead of "34.8%", "107" instead of "27 Nov 26") and never recovered. Root-caused via a
    live `MutationObserver` trace (not guessed): the animation was split across two independent
    timers — a `requestAnimationFrame` loop driving the count-up, and a separate `setTimeout(520)`
    that swapped in the final formatted text — and they raced. rAF's own last frame is tied to the
    display refresh, not a fixed delay, so it could fire a few ms AFTER that setTimeout, overwriting
    the just-applied formatted text with the tween's raw number with nothing left to re-correct it.
    Traced exactly this in the live DOM: every tile briefly showed the correct formatted text then
    reverted 14ms later. Fixed by giving the tween a single `onDone` callback that renders the true
    final text from its OWN last frame — one code path now owns the final state, so the race can't
    recur. Re-verified via the same mutation trace: all six tiles settle correctly and stay correct
    across repeated toggles.
11. **Roster table sort headers had no keyboard/screen-reader affordance** (bare `onclick`, no
    `tabindex`/`role`/`aria-sort`) — same gap V4 fixed in its own Progress Ranking table (p149).
    Added the identical pattern here: `tabindex="0"`, `role="button"`, live `aria-sort`, Enter/Space
    keydown handling.

**Verified live, end-to-end:** `ap127V5ParityV5()` (new dev-only console harness) compares V5's
model against V4's own formulas for all 28 SP — 0 mismatches on every non-divergent figure (current
live data has 0 retakes, so F1/F2 currently show 0.00 too; the divergence is documented/dormant,
not fabricated). Self-check panel 11/11 pass on live data, on a time-travelled As-Of, and throughout
a full Replay run. All five sections exercised with real data (Pulse KPIs/reel/pace/watchlist, Trend
merged chart + output + streaks, People roster/distribution/SP-drawer, Syllabus Bars+Cells canvas
with click-through to the SP drawer, Calendar canvas with instructor grouping and click-through).
Customise: hid a panel, Applied, reloaded the page cold — stayed hidden (real localStorage
persistence, not session-only); Reset correctly restored the published default. PDF download
decoded from a real captured `.save()` call and inspected with `pdfinfo`/`pdftoppm` (not just "no
console errors"). Mobile 375px: zero page-level horizontal overflow on every section, including the
96-column Curriculum Grid canvas (scrolls inside its own container). V4 re-loaded after all of this
and confirmed pixel-for-pixel unchanged, zero new console errors, `git diff --stat` on the three
protected files empty throughout.

Files touched: `js/ap127-v5-model.js` (new), `js/ap127-v5-layout.js` (new), `js/view-cohort-v5.js`
(new), `css/cohort-v5.css` (new), `index.html`, `js/shell.js`.

---

## p165 (2026-08-12 — **AP127 Detail V5 — first round of user feedback after using
the live p164 build.** Seven items, all shipped. Verbatim asks: "Option setting bar at top look
confuse, dont know what these are using for or what to expect" · PULSE "Layout is complete broken
(on desktop) at PACE vs Target and Watchlist. Move it as a single chart per line, it can expland
then" · TREND "Target and Plan line of the whole batch is single SP should be different" + "Move
streak to below OUPUT chart" · PEOPLE "Change it name to Each SP" · SYLLABUS "It missing a lot of
feature from the original — Detail of lesson and phase, Key point mark, ETC" + "Indicate the target
date of each target red line" + "Add line of current date" + "Add lagging line indicate for lag SP
relate to target line" + "Combine it into just one mode — Modern roster style. ref to SP sub-tab in
Aircraft status tab" · CALENDAR "Change it to be the modern roster style ref to SP sub-tab in
Aircraft status tab" + "Add sum of hours for each day at bottom" + "Show dash line indicate long
idle day" + "Show idle day till today".

**1. Broken Pulse layout — root cause was invalid span values, not styling.** The shipped default
layout used `span: 7` for Pace vs Target and `span: 5` for Watchlist, but `css/cohort-v5.css` only
ever defined `.v5-span-4/6/8/12`. With no matching class, `grid-column` was never set, so both
panels fell back to a single 1/12-wide column of the 12-column grid — hence "complete broken".
Fixed three ways: every span 1-12 is now defined in CSS (so the class can't silently not exist),
the layout validator accepts any integer 1-12 instead of a hand-picked list of four, and per the
request both panels are now `span: 12` (one per line, full width). Same treatment for Trend —
Output and Streaks are both full width with Streaks ordered after Output.

**2. Command bar made self-explanatory.** It was 12 bare chips with no indication of what each
group controlled. Every group now carries a visible uppercase label — MEASURE IN · SHOW · PERIOD ·
DATA AS OF · FIND SP · ACTIONS — plus a plain-language tooltip on the group explaining what it
changes and what to expect. Chip wording changed from jargon to plain terms (`Batch`/`Per-SP`/`SP…`
→ `Whole batch`/`All SP`/`One SP…`; `30D` → `30 days`; `⤓ PDF` → `⤓ Report`; `⟳` → `⟳ Live`).

**3. Trend Plan/Target now scale to the selected scope — a real accuracy bug.** Plan and Target
come out of the model as BATCH totals (each lesson's planned value × 28 SP). The per-SP view drew
28 individual student lines against those batch-scale references, i.e. roughly 28× too high, making
the comparison meaningless. Both reference series are now divided by the student count whenever
scope isn't `batch`, and relabelled `Plan / SP` / `Target / SP` so the scale is stated. Verified
live: batch Plan peaks at 2156h, per-SP Plan at 77h against a 62h max student line. **Also fixed a
second bug found while doing this:** `isBatch` was `scope !== 'per-sp'`, so scope `sp` (one student
picked) fell into the batch branch and drew the 28-SP aggregate line — picking a single SP showed
everything except that SP. Single-SP now draws that student's own line, thickened, against per-SP
references.

**4. PEOPLE renamed to "Each SP"** (section label only; panel ids unchanged so saved layouts and
share links keep working).

**5. SYLLABUS rebuilt as ONE roster-style grid with the V4 detail restored.** The `Bars | Cells`
toggle is gone — a single view in the same idiom as Aircraft Status' SP Stat roster
(`js/view-aircraft.js:1163`): a real table with separated rounded cells, intensity fill, sticky
identity columns, phase-coloured completions. Restored from V4 and added:
   - **Lesson detail** — click any cell for code, phase, type, standard duration, planned date, when
     it was flown (every attempt, retakes labelled), plus that SP's standing.
   - **Phase detail** — the phase band across the top is clickable per segment, opening the phase's
     objective and completion standard (verbatim from the authoritative syllabus) with its lesson
     list and the milestones inside it.
   - **Key point marks** — a milestone row above the lesson numbers, each icon clickable for what
     that milestone means and how many SP have passed it.
   - **ETC column** — per-SP estimated completion date, alongside the existing vs-target column.
   - **Target checkpoint dates** — each of the 17 red target columns now carries its own date
     printed vertically in the header, so the red line says *when*, not just *where*.
   - **Current-date line** — the interpolated target lesson for today (L32 at time of writing) drawn
     as a blue column: on a lesson axis this is the meaningful "now" marker.
   - **Lagging indicator** — the cells between each SP's own progress and today's target lesson are
     washed red with a dashed rule, so each SP's lag against the target reads as a band.
   - Phase Progress Funnel kept, folded in as a clickable summary strip beneath the grid.

**6. CALENDAR rebuilt in the same roster style** with per-cell hours printed when the column is wide
enough, sticky name + period-total columns, Monday rules, month labels, today outlined, phase-
coloured intensity, and instructor grouping preserved. Added per the request:
   - **Sum per day at the bottom** — two sticky footer rows (HOURS/DAY and LESSONS/DAY) with a
     batch grand total in the pinned column, intensity-shaded per day. Made `position:sticky` inside
     the scroll box, and the box sized to `calc(100vh - 340px)`, because a non-sticky footer sat
     below 28 rows of grid and was only reachable by scrolling the inner container to its end —
     which defeats the purpose of a totals row.
   - **Dashed line for long idle** — runs of ≥7 consecutive no-fly days between two flights are
     marked with a red dashed rule and a faint wash across the whole run.
   - **Idle through to today** — a run that reaches the last column (i.e. the SP still hasn't flown)
     is drawn distinctly in amber dotted, and its tooltip reports how many days since the last
     flight. An SP with no flights at all in range is marked idle for the entire row.

**7. Dead code removed** — the canvas-grid engine (`attachCanvasGrid`) that backed the previous
Bars/Cells and canvas calendar is gone now that both grids are roster tables, along with its
`.v5-gridtip` styling.

**Also changed while verifying:** `content-visibility:auto` is now released (`.v5-mounted`) once a
panel has real content. It is genuinely useful only *before* mount, to defer painting panels that
aren't visible yet; leaving it on a mounted 96-column grid is a standing risk of the browser
holding a freshly-inserted subtree in the skipped state. **Honest note:** I could not prove
content-visibility was actually causing a visible fault — the "stuck on Loading…" frames seen
during this session turned out to be stale screenshot captures (each time, the DOM was verified
correct — no skeleton present, table built, 28 rows — and a forced repaint showed the real grid).
This change is defensive, not a fix for a reproduced bug.

**Verified live:** sticky identity columns measured to align exactly with the lesson grid and the
phase-band header (right edge 257px vs first lesson column at 258px — the first attempt had the
phase band sliding underneath them, and a double-edged rose box-shadow on all 17 target columns ×
28 rows that made the grid unreadable; both fixed). Lesson-number labels thinned from every 5th to
every 10th after measuring that two digits at 7.5px physically overlap in a 13px column. All three
restored modals confirmed opening with correct content (lesson CDGL 01 / phase objective+standard /
milestone explanation). Calendar footer confirmed pinned and populated (1039.0h / 827L). Parity
harness still 0 mismatches across all 28 SP; self-check 11/11. Mobile 375px: zero horizontal page
overflow on all five sections. V4 reloaded afterward — mounted, 10 charts, KPI 34.8%, unchanged;
`git diff --stat` on the three DB_Share-proxied files empty. Files touched:
`js/view-cohort-v5.js`, `js/ap127-v5-layout.js`, `css/cohort-v5.css`, `index.html` (p164→p165).

---

## p166 (2026-08-12 — **AP127 Detail V5 — labelled as Draft.** User: "Rename the V5 tab to
include 'Draft'." Sidebar nav entry changed from "AP127 Detail V5" to "AP127 Detail V5 (Draft)";
in-page command bar brand now shows a "DRAFT" badge next to "AP127 V5" with a tooltip explaining
the tab is still under active development. Purely cosmetic — no behavior, no DOM id, and no panel
id changed (saved layouts / share links still work). Files touched: `js/shell.js`,
`js/view-cohort-v5.js`, `css/cohort-v5.css` (p165→p166).

---

## p174 (2026-08-12 — **AP127 Detail V5 — UX/UI pass: sizing system, replay engine
rewrite, Syllabus/Calendar rebuilt in the "modern roster" style.** User: "pls go through all UX
UI again. Fix all problem, focus on layout, sizing, UX UI, readability. Charts should not cramped
when more data added, it should have limit on the max/min size of all UI... may be some buffer
system." Full pass, several real bugs found and fixed live:

**Layout fixes.** Command bar was 12 unexplained chips ("don't know what these are using for") —
every control group now has a visible label + explanatory tooltip (Measure in / Show / Period /
Data as of / Find SP / Actions). Pulse's Pace vs Target and Watchlist panels were using invalid
`span:7`/`span:5` values — `css/cohort-v5.css` only defined spans 4/6/8/12, so the unmatched spans
silently applied NO grid-column rule and the panels collapsed to a single 1/12-wide sliver. Fixed
by defining every span 1–12 and switching those two panels (plus Trend's Output/Streaks) to
full-width, one per line. "People" section renamed to "Each SP" per request.

**Trend accuracy bug.** The merged Progress-vs-Plan chart's Plan/Target reference lines are batch
totals (× 28 SP) — switching scope to Per-SP or a single SP still showed the 28-SP-scale
reference against 1-SP-scale actual lines, ~28x too high and effectively unusable. Fixed:
Plan/Target now divide by student count outside batch scope, labelled "Plan / SP" / "Target / SP".

**Sizing system** (`SIZE` constants + `chartHeight()`/`fitCell()`/`gridZoomBar()` helpers, new).
Charts now grow with series count (base + N×perSeries) up to a hard cap, then rely on zoom/pan
instead of cramming more lines into the same pixels — confirmed live: switching Trend to "All SP"
(28 lines) grew the chart from 310px to 435px instead of squeezing 28 lines into a fixed 320px box.
Chart.js zoom/pan enabled on every V5 chart, gated behind Ctrl/⌘+scroll (V4's own p138 lesson —
plain wheel-zoom was reported "all over the place, very sensitive"). Grids (Curriculum, Calendar)
get an explicit Zoom stepper (Fit/14/18/22/26/30px) — "Fit" clamps to a floor of 11px and the grid
scrolls horizontally rather than compressing cells below that floor.

**Real bug: grid cells silently compressed to ~20% of their declared width.** `table-layout:auto`
tables with no explicit `<table>` width, nested inside a `.v5-panel` that uses
`content-visibility:auto`/`contain:layout` (needed for lazy-mount performance), had every per-cell
`width:22px` style overridden down to ~4.5px regardless of what was declared — confirmed live via
direct DOM measurement (`getBoundingClientRect()`), and confirmed the fix by manually setting
`table.style.width` in the console, which immediately restored the correct 22px/11px cell sizes.
Fixed by computing and setting an explicit `<table>` width (identity columns + `count × CELL_W`)
on both grids — the table now genuinely grows to that width and the wrapper scrolls, instead of
the browser silently shrinking every column to fit.

**Syllabus rebuilt as ONE roster-style grid** (ref: Aircraft Status' SP Stat/FI Stat roster,
`js/view-aircraft.js`), replacing the two-mode canvas (Bars|Cells) with a single real `<table>`
combining both: phase-colour cell fill (bars-style extent AND cells-style per-lesson detail in one
view). Restored V4 features that were missing from the first V5 build: click-through detail modals
for lesson cells / phase headers / milestone icons (lesson code, standard duration, planned date,
flown history, phase objective/completion-standard text), an ETC column per SP, target-checkpoint
DATE labels above their own column (vertical text, not just a flagged column), a "today's target"
column (blue) computed from the interpolated batch target lesson, and a dashed lag indicator drawn
on every cell between an SP's own progress and today's target. Sticky identity-column offsets
(name/vs-target/ETC) are now computed from one set of width constants instead of hardcoded
mismatched pixel values (the mismatch was letting phase headers slide under the identity block).

**Calendar rebuilt the same way** — real `<table>`, sticky name+period columns, Monday/month
rules, today outline, per-cell hours with phase-colour fill. Added a footer showing batch total
hours AND lessons per day (was missing), dashed red rules for closed idle gaps ≥7 days between two
flights, and a distinct dotted amber rule for a gap that's STILL open through to today (was
previously drawn identically to a closed gap, losing the "still idle right now" signal). Both
grids get the same Zoom stepper as Syllabus.

**Replay ("Story") rewritten as a precomputed-frame engine — this is the actual fix for the
reported stutter.** The first version called `setAsOf()` once per frame, which triggers a FULL
model rebuild (every flight for all 28 SP) + `renderSelfCheck()` (11 invariants over the whole
dataset) + `applyState()` re-rendering EVERY mounted panel — including, on the Syllabus section, a
2,688-cell table rebuild, and on Trend, destroying and recreating Chart.js instances — roughly 90
times in a row for one playback. Rewritten around one precompute pass (`buildReplayTimeline()`):
per-day batch deltas and per-SP unique-lesson-completion counts are prefix-summed ONCE into flat
typed arrays, so every frame during playback is an O(1) array lookup. Per-frame work during
playback is now limited to: writing KPI tile text directly, and swapping the Actual/lag dataset's
already-built point array on the LIVE Chart.js instance via `update('none')` (no re-creation, no
animation, no layout pass) — confirmed live via a manual scrub: jumping the timeline instantly
re-renders with zero visible lag, versus the old version's full-panel-rebuild-per-frame cost.
Playback itself is now a `requestAnimationFrame` time-based clock (elapsed real time × days/sec,
not a fixed per-frame delay) so a slow frame skips ahead instead of stretching the timeline, with
real controls: play/pause, a draggable scrub track (auto-pauses playback), speed presets
(0.5×/1×/2×/4×), and a caption band that shows why a keydate got a longer pause (target checkpoint
date, first-in-batch milestone, or the single worst daily lag jump) — computed from the same
precomputed arrays, not hardcoded. Exiting restores live state with exactly ONE real model
rebuild/re-render (not one per frame).

**Verified live** end-to-end after a genuinely confusing debugging detour (documented for future
sessions): this local dev server's `index.html` document itself was being served from a stale
browser-cache snapshot across `force:true` navigations to the same URL — script tags referencing
an OLD `?v=pNN` token kept loading despite the file on disk being current, which looked exactly
like a code regression (mount functions "never called") until confirmed via
`document.querySelector('script[src*="..."]').src` showing the stale token. **Fix for future
sessions: append a throwaway `?nocache=<timestamp>` query param on the HTML document URL itself**
(not just the asset `?v=` tokens) when the served script doesn't match what was just edited — a
plain reload/force-navigate to the identical URL is not reliable here. Once on a verified-fresh
load: Pulse/Trend/Syllabus/Calendar all render correctly, grid width fix confirmed via direct
`table.style.width`/cell `getBoundingClientRect()` measurement (Syllabus: 1393px table, ~11px
cells; Calendar: 1308px table, ~14px cells), zoom stepper functional, Trend chart height grows
310px→435px switching Batch→All SP, per-SP Plan/Target scaling confirmed via dataset inspection,
Replay's manual scrub confirmed instant/glitch-free (the actual claim under test), Exit restores
live state cleanly, self-check 11/11 throughout, zero new console errors, V4 reloaded and confirmed
unchanged. `git diff --stat` on the three DB_Share-proxied files confirmed empty throughout.

Files touched: `js/view-cohort-v5.js`, `js/ap127-v5-layout.js`, `css/cohort-v5.css`.

## p175

**AP127 Detail V5 — round 3 of user feedback: Trend accuracy + Report overhaul.**

User feedback, verbatim:
> Trend: Plane [Plan] should show up to the finish date not current date. Target should be change
> to call "Revised-target". Output graph, moving avg have glitch, it include required (red) in it
> graph. The required value should show in dash red line and show gap between it and actual.
>
> Report: Change them to be dark theme corresponding to the site theme. Exe sum: Add total done
> hr / total hr, e.g. done 1000/5000 hr. Show remaining hour to be done. Pace vs Target: use full
> word, e.g. use Required instead of Req. Roster: Remove these column: Call sign, last lesson, Day
> delta, Vs target. Progress vs plan: Show plan up to the finish date not just current date. Change
> "Target" to be "Revised-target". Output chart: Fix the glitch of moving avg which should not
> include the required red value. Add lead/lag chart (ref to V4). Add LESSON COMPLETION MATRIX
> (ref V4).

All ten items shipped:

1. **Progress vs Plan — Plan line now runs to the curriculum's finish date, not clipped to
   today/asOf.** `buildSeries()` (`js/ap127-v5-model.js`) previously built one `plan` array walked
   only over `upto` (dates ≤ asOf), same as Actual — correct for Actual (there's no real data past
   today) but wrong for Plan, a static reference schedule that doesn't depend on how far the batch
   has actually gotten. Added a second `planFull` array, cumulative over the FULL set of planned
   dates regardless of asOf; `progressChartCfg()` now draws `s.planFull` instead of `s.plan`. Live
   verified: Plan's last point now lands on 2026-11-27 (curriculum planEndDate) while Actual's last
   point stays at 2026-08-26 (today) — was both stopping at today before.
2. **"Target" → "Revised-target"** on the Progress vs Plan chart's dataset label (both live panel
   and report, since the report embeds this same chart via `progressChartCfg()`).
3. **Output chart moving-avg "glitch" fixed — was the Required marker, not a real bug in the
   average itself.** `out.ma` (the moving average) was already computed purely from bar values,
   never touching Required — but the old Required overlay was a single floating dot (`pointRadius:4,
   showLine:false`) landing at the exact x/y the blue moving-avg line was also passing through,
   reading as a spike/glitch fused onto the average. Required is now its own full-width dashed red
   reference line (`out.values.map(() => req.req)`) — a flat "required pace" line, visually a
   distinct channel instead of a dot merged onto the average. New `outputRequiredInfo(model)`
   factors the Required/Actual/Gap figures out of the chart-config builder so the same numbers back
   both the dashed line and a new plain-text gap readout under the chart
   (`#d127v5-output-gap`: "Required 43.1h/period · Actual 0.00h · Gap −43.1h vs latest closed
   period") — the actual "show the gap between required and actual" ask. Bug caught in verification:
   the first version of the hint used a bare `+/-` sign check on `fH()`, which already takes
   `Math.abs()` internally — a negative gap rendered as "Gap 43.1h" with no sign shown, reading as
   positive; fixed to use the existing `signed()` helper, re-verified showing "Gap −43.1h" correctly.
4. **Report — dark by default, matching the site's own cockpit theme.** The report sheet already
   had a half-built `.v5-report-dark` class from the original design (never actually used —
   `openReportPreview()` hardcoded `buildReportSheet('light')`) with several colors still hardcoded
   light-only (KPI border, table borders, meta/footer text). Flipped the whole component: default is
   now dark (`.v5-report-sheet` base styles use `var(--v5-s1)`/`var(--v5-tx)`/`var(--v5-bd)`
   throughout), with a `.v5-report-light` opt-in (not currently exposed by a UI toggle, kept
   reachable via `buildReportSheet('light')` for later) restoring the original look. The `@media
   print` block now force-overrides back to light/ink-friendly with `!important` regardless of
   which theme class is on the sheet, since a dark background on real paper wastes ink — print output
   is unaffected by this change. Verified live: report background resolves to `rgb(22,27,34)`
   (`--v5-s1`), all 7 section headers legible.
5. **Executive summary — batch hours done/total + remaining, spelled out regardless of which KPI
   tiles are configured.** New line under the KPI grid: "Hours done: 1158h / 5040h (23.0%) ·
   Remaining: 3882h", from `model.batch.hoursDone` / `model.batch.hourSlots` (already-computed
   batch totals — no new model math needed).
6. **Pace vs Target — full words.** "Req"/"Act" → "Required"/"Actual" in both the live Pulse panel's
   table and the report's Pace vs Target table headers.
7. **Report Roster — 4 columns dropped** (Call sign, Last lesson, Day Δ, vs target) via a
   report-only `REPORT_HIDE_COLS` filter over `layoutCfg.current.columns` — deliberately doesn't
   touch the live People panel's own admin-configurable column set (not asked for), only what the
   report prints.
8. **New: Individual Lead/Lag vs Plan chart in the report** (ref V4's own panel of the same name).
   `progressChartCfg()` gained an optional 2nd `overrides` param (`{level, scope, students}`) so a
   caller can force per-SP/gap mode over ALL 28 students regardless of whatever the live command bar
   currently has selected — the live panel itself is unchanged, still calling it with no overrides.
   Report calls `progressChartCfg(model, {level:'gap', scope:'sp', students: model.students})`.
9. **New: Lesson Completion Matrix in the report** (ref V4's own panel). Not a reuse of the live
   Curriculum Grid's canvas (that needs a real pointer for hit-testing, not meaningful in a static
   export) — new `buildReportLessonMatrix()` builds a compact print-safe HTML/CSS grid: a
   `<colgroup>` of 96 equal-width lesson columns + 1 name column sized to the report's fixed 703px
   content width (~5.9px/lesson column), a phase-colored band header (consecutive same-phase lessons
   merged into one `colspan`), and per-SP rows shading each cell by phase color when completed
   (grey when not; a thin blue inset outline flags a retake). Verified live: 97 `<col>` elements
   (1 name + 96 lesson), 28 body rows, phase band visually matches the 4-phase palette used
   elsewhere in V5.

Verified live (local dev server, `?nocache=` reload per this project's known stale-HTML-cache
gotcha): Trend section — `Chart.getChart()` on both canvases confirms dataset labels
`["Plan","Revised-target","Actual"]` / `["Hours","Moving avg","Required"]`; Plan's last point
`{x:"2026-11-27", y:5040}` vs Actual's `{x:"2026-08-26", y:1157.67}`; Required dataset is a flat
line (single distinct value repeated); gap hint text correct with sign. Report — opened via the
Report button, `.v5-report-sheet` background resolves to `rgb(22,27,34)`, all 7 `<h2>` sections
present in order (Executive summary, Pace vs target, Roster, Progress vs plan, Output, Individual
lead/lag vs plan, Lesson completion matrix), Pace vs Target headers read
`["Period","Required (h)","Actual (h)","Gap (h)"]`, Roster headers no longer include Call sign/
Last lesson/Idle-day-delta/vs target, 3 chart images present (progress/output/lead-lag, all
non-empty PNG data URIs), lesson matrix table has 97 `<col>` × 28 `<tbody>` rows. `git diff --stat`
on the three DB_Share-proxied files confirmed empty. `node -c` clean on both changed plain-script
files. Zero new console errors beyond the pre-existing local-dev CORS fallback.

Files touched: `js/ap127-v5-model.js`, `js/view-cohort-v5.js`, `css/cohort-v5.css`, `index.html`.

## p181

**AP127 Detail V5 — round 4 of user feedback: Pulse redesigned as a real situation report, plus a
genuine Chart.js stacking bug behind the "moving avg" complaint.**

User feedback, verbatim:
> PULSE: Headline, show total remaining hours and remaining day/week/month. And require rate per
> day/ week. Redesign for more easy to understand at first glance. This is the key situation report.
> TREND: Moving AVG position is not correct? It float at higher Y axis
> SYLLABUS: Rotate the text of target (red) by 180 degree

### 1. TREND — the moving average really was drawn in the wrong place (root cause found, and it
### invalidates p175's explanation of the same symptom)

The user was right and my p175 diagnosis was wrong. Measured live BEFORE touching anything:

| index | raw `ma` | rendered y-value | `ma + Required` |
|---|---|---|---|
| 90 | 9.39 | **55.22** | 55.22 |
| 88 | 10.21 | **56.04** | 56.04 |
| 81 | 0.79 | **46.62** | 46.62 |

The rendered value equals `ma + Required` **to the cent at every sampled index** — the Moving avg
line was being drawn stacked on top of the Required line.

**Cause:** this chart's y-axis is `stacked: true` (the Dual/Solo/Simulator bars need it), and
Chart.js assigns a dataset with no explicit `stack` to a stack group keyed by its **type**. Both
line overlays therefore landed in one shared `'line'` group and were summed. The bars were never
affected — they carry `stack:'s'`, their own group. Fixed by giving each line overlay its own group
(`stack:'ovl-ma'` / `'ovl-req'`); re-measured after the fix, rendered value now equals raw `ma`
exactly at every index (9.39→9.39, 10.21→10.21, 0.79→0.79, 1.73→1.73), and re-verified with the
"By type" breakdown ON (5 datasets: 3 bars in `'s'`, 2 lines in their own groups).

**This is also the true root cause of the "moving avg glitch" reported against p174.** Back then
`Required` was `null` at every index except one, so it lifted the average at exactly that one point
— the "spike" the user saw. p175's changelog and code comment blamed an optical overlap of a
floating dot and "fixed" it by turning Required into a full-width line, which made the same bug
continuous instead of removing it. Both the code comment and this changelog are corrected here; the
p175 entry's claim that "the average itself was already correct" was false.

### 2. PULSE — Headline rebuilt into the tab's situation report

The old headline was six generic KPI tiles. Rebuilt (panel id kept as `kpis` so saved layouts and
`?v5layout=` share links still validate; title now "Situation") into a briefing that answers three
questions in reading order, and **moved to the top of Pulse, above the Insight Reel**, since it is
the key situation report.

* **Verdict band** — one plain sentence, colour-coded, carrying the single most actionable number:
  *"BEHIND REQUIRED PACE — 3804h left over 83d → needs 321h/week (11.5h/SP). Now flying 38.5h/week
  — short by 282h/week."* Separate states for plan-end-passed (overdue) and no-plan-end.
* **① Where we stand** — Progress (lessons) with both lesson and hour totals beneath, vs plan
  today, vs revised-target.
* **② What is left** — the explicit ask: **hours remaining** (batch + per SP + of total), lessons
  remaining, and **time remaining expressed three ways: days · weeks · months**.
* **③ What it takes** — the other explicit ask: **required rate per day / per week / per month**,
  each showing batch hours, per-SP hours, required lessons, and the actual rate now with a signed
  delta against it.
* **Watch strip** — the decision-relevant counts that used to be tiles (at risk, idle ≥5d, never
  flown, retakes), each still deep-linking to the section that explains it.

Hours **and** lessons are shown together throughout, deliberately independent of the command bar's
Hours/Lessons toggle — this is the one panel that must be readable without first checking which
unit is selected.

**Two real bugs caught in my own new code during verification, not shipped blind:**
1. **The headline number rendered as a literal `0`.** The count-up tween seeds the element with a
   `'0'` placeholder and fills in the real value from `requestAnimationFrame`; when rAF doesn't run
   (throttled/hidden renderer — reproduced live here) the placeholder is what stays on screen, i.e.
   actively wrong data on the panel that most needs to be trustworthy. Fixed by rendering the true
   value immediately and treating the tween as pure enhancement (also skipped under
   `prefers-reduced-motion`, and skipped on first paint when there is no prior value to count from).
   Verified: renders `36.4%` = 979/2688, matching the model.
2. **Doubled units in the sub-lines** — `fL()`/`fH()` append their own unit, so the copy read
   "−673 les lessons" and "1236h / 5040h hours". Switched those two lines to a plain number
   formatter.

Also labelled the headline **"Progress (lessons)"**: `progressPct` is lessons-based (36.4%) and runs
ahead of the hours-based figure (24.5%) because early lessons are short — both appear in the
sub-lines, and the headline now says which one it is.

### 3. SYLLABUS — target dates rotated 180°

`.v5-rt-tgt-lbl` gains `transform:rotate(180deg)` on top of its `writing-mode:vertical-rl`, so the
17 red target-checkpoint dates read bottom-to-top. Kept as a transform rather than
`writing-mode:sideways-lr` so it renders identically in the html2canvas PDF path, which doesn't
implement `sideways-lr`. Verified: computed transform `matrix(-1, 0, 0, -1, 0, 0)` on all 17
labels. First attempt kept a directional `padding` that pushed every label 2.0px off its own column
centre (18% of a cell at the 11px zoom floor); replaced with `margin:0 auto`, re-measured at
0.01px drift.

### Verification

Live, on the local dev server: moving-avg rendered-vs-raw measured at 4 indices in both plain and
"By type" modes (exact match after the fix, was `ma + 45.83` before); situation-report arithmetic
hand-checked against the model (5040−1236=3804h remaining ✓, 3804/28=136h per SP ✓, 3804/83=45.8h
required per day ✓, ×7=321h per week ✓, 83/7=11.9 weeks ✓, 83/30.44=2.7 months ✓); zero clipped or
overflowing text nodes in the new panel at desktop **and** at 375px (bands collapse to one column,
page scrollWidth 375 = viewport, no horizontal overflow); self-check 11/11 pass; parity harness 0
mismatches across all 28 SP; Report still builds all 7 sections with its 6 KPI tiles intact
(`KPI_DEFS` deliberately untouched — the report's Executive Summary reads it directly, not the
panel); V4 reloaded afterwards, 10 charts, KPI "1236.2 / 5040.0 · 24.5% complete" matching V5's own
hours figures exactly; `git diff --stat` on the three DB_Share-proxied files empty; `node -c` clean
on both changed plain scripts; zero new console errors beyond the pre-existing local-dev CORS
fallback.

**Note on the token jump (p176 → p181).** Tokens p176-p180 were consumed during verification and
never shipped. This dev environment's browser pane served a **stale body for a brand-new
`?v=` asset URL** — `fetch()` of the same file with a throwaway query returned the new content
while the `<script src>` request returned the old, i.e. the pane's asset cache is keyed by path and
ignores the query for script subresources. The `?nocache=` trick recorded in p174 fixes the
*document* but not this. The reliable workaround is to bump to a never-yet-requested `?v=` token
and reload; that is what each intermediate bump was for. Disk content was confirmed correct with
`grep` each time before re-bumping, so no change was ever "lost" — only re-served.

Files touched: `js/view-cohort-v5.js`, `js/ap127-v5-layout.js`, `css/cohort-v5.css`, `index.html`.

## p183

**AP127 Detail V5 — round 5 of user feedback: required pace becomes a moving target, calendar
footer unpinned, and Syllabus/Calendar cells linked to the real Ops booking behind them.**

User feedback, verbatim:
> TREND: Make the required line dynamic and correspond with that point of time not the latest one.
> CALENDAR: The last 2 row is stick with bottom and it float over other line while scrolling.
> Make elements in SYLLABUS and CALENDAR link to the actual OPS flight data (e.g. click on a cell
> and it should show detail of that flight record, both OPS and PROG). Make sure data is correct.

### 1. TREND — required pace is now the moving target it actually is

p175 drew Required as one flat line stamped with *today's* figure across all history, which implied
the requirement had always been that high. New `buildRequiredAt()` in `js/ap127-v5-model.js`
evaluates the same formula `buildPace()` uses, but against the work outstanding on each date and the
days that remained from it — crediting each lesson once, on the date of its first completion
(`!isRetake`), exactly as effective hours are credited elsewhere. The chart now plots one value per
period (`Required (at that time)`), and the gap readout compares the latest closed period's output
against what was required *then*, not now.

Live on the current data the line climbs **27.4h/day (07 Jun) → 45.8h/day (today)** — 89 distinct
values — which is the real story the flat line was hiding.

**New self-check invariant (`required-at-now`, self-check now 12/12):** `requiredAt(asOf)` must
equal the Pace panel's `reqDayHrsB`. Two code paths now produce a "required per day" figure, so the
check pins them together rather than letting the chart quietly disagree with the panel.

Hand-verified against first principles at four points on the curve — `(totalHours × 28 − effective
hours done by that date) ÷ days remaining to plan end`: 07 Jun 27.42 vs 27.42 ✓, 07 Jul 29.46 vs
29.46 ✓, 06 Aug 34.45 vs 34.46 ✓. The fourth (today) initially read 45.83 plotted vs 45.99
hand-computed; root-caused rather than waved off — my console recomputation used the raw
`PROGRESS_DATA` feed while the panel's model has `opsAugmentV5()` applied. Replaying that
augmentation found **7 Ops-completed lessons Progress has not posted yet, worth 13.3h**, which is
exactly the gap (3817.2h − 45.83×83 = 13.3h). The chart was right; the hand-check was the
incomplete one.

### 2. CALENDAR — footer no longer floats over the grid

`.v5-rt tfoot td` was `position:sticky; bottom:0` (with a hardcoded `bottom:18px` on the first of
the two rows) so a summary stayed visible. In practice it floated over the grid rows while
scrolling and covered the bottom SPs. The footer is now plain — the totals sit at the natural end of
the table. The identity column keeps its `position:sticky; left:0` (that one is for *horizontal*
scrolling and was never the complaint; verified: footer data cells now compute to
`position:static; bottom:auto`, footer name cell still `sticky/left:0`).

So nothing is lost, the batch totals for the visible range moved **above** the table as a plain
summary line: `952h flown · 716 lessons · 72 of 91 days had activity · avg 13.2h/active day across
28 SP`.

### 3. SYLLABUS + CALENDAR cells now open the real Ops booking

New OPS ⇄ PROG linkage. Source is `window.FLIGHTS` — the shared, alias-normalised, **de-duplicated**
array every Ops view reads — deliberately *not* the raw `FLIGHT_DATA.flights` that `opsAugmentV5()`
walks, which still contains the duplicate `ACTUAL_ONLY` rows p116 strips and would show a flight
twice. Matching reuses `AP127Reconcile`'s own key helpers (`ccKeyFromFull` / `ccNameNorm` /
`normLesson`), the same ones `opsAugmentV5()` uses, so this can't drift into a second notion of
"same student, same lesson".

**Match rate measured on live data before building any UI on it** — 972 PROG records across 28 SP
(28/28 SPs matched by name key):

| outcome | count | handling |
|---|---|---|
| OPS row on same student + lesson + date | 939 (96.6%) | full booking shown + agreement check |
| OPS row, same lesson, **different date** | 19 | shown, with both dates and the day delta |
| **no OPS row at all** | 14 | explained, see below |

All 14 no-match records fall **inside** the Ops feed's own coverage window (20 Apr – 02 Sep 26), so
the rolling-window explanation does *not* cover them — they are genuine Progress-only records, the
same "true gap" category the Cross-Check ledger reports. The modal says exactly that, rather than
implying data is missing. Spot-checked one (Khobpong W., CDGL 12, 05 Jun) directly against both
feeds: his CDGL 11 the day before matches Ops exactly (60 min both sides), so the matcher is sound
and the gap is real.

**Syllabus cell** → lesson detail + every Ops booking for that lesson (any status, so a cancelled or
still-pending attempt shows too) + a `PROG ⇄ OPS check` block: date agree/differ, credited minutes
vs Ops logged minutes, and an explicit note that a difference is *expected* (PROG credits the
curriculum standard duration, OPS logs real block time) rather than an error.

**Calendar cell** → everything for that SP on that date from both systems, with per-day count
reconciliation. Every cell is now clickable, not just flown ones — a blank cell can have a
cancelled booking behind it, which is precisely what someone clicking an unexpected gap wants. Live
example: an empty cell for Awirut S. on 07 Jun opens as *"1 Ops booking · no Progress record ·
Canceled · Operational / Schedule"* with the real remarks from the feed.

Ops fields are rendered only when present (a cancelled booking has no block times, a planned one no
actuals). The `Type / cond` row is labelled that way on purpose: the feed carries an aircraft model
in `type` on some rows and a Dual/Solo classification on others, so both values are shown verbatim
under a label that doesn't claim which is which.

### Verification

Live: required-line values hand-checked at 4 points (3 exact, 4th explained and reconciled to the
cent); self-check **12/12** including the new invariant; parity harness **0 mismatches** across all
28 SP; footer computed styles confirmed unpinned while the identity column stays pinned; three cell
modals exercised end-to-end against real records (matched flight with 45+20=65 min agreeing on both
sides, cancelled booking with reason + Thai remarks, and a Progress-only record correctly
categorised); Report still builds all 7 sections with its 3 charts (it shares `outputChartCfg`,
which changed); V4 reloaded unchanged (10 charts, 1236.2/5040.0 = 24.5%); 375px mobile shows no
horizontal overflow (scrollWidth 375 = viewport); `node -c` clean; `git diff --stat` on the three
DB_Share-proxied files empty; zero new console errors beyond the pre-existing local-dev CORS
fallback.

One bug caught in my own new code before shipping: a missing closing paren after refactoring
`openLessonCellModal`'s block array into `.concat()` calls — caught by `node -c`, which is why
every changed plain script gets syntax-checked before it reaches the browser.

Files touched: `js/ap127-v5-model.js`, `js/view-cohort-v5.js`, `css/cohort-v5.css`, `index.html`.

---

## p184

**New tab: AP127 DETAIL V6 — "Flight Recorder". A third, independent Detail tab alongside V4 and
V5, both untouched.**

User brief, verbatim:
> Now I want to develop new tab "AP127 DETAIL V6" which is a new version of the V4 and V5. Pls study
> in deep detail of the website and come up with the brandnew AP127 DETAIL V6. It should be a
> completely brand new design with dynamic animated scrolling, zooming and all the fancy modern UI
> stuff while keep all the useful function and features, best practice UX UI. With in mind of focus
> on the history/ situation and prediction of AP127 batch progress. Intuitive dashboard and charts.
> Pdf report ready for TG to review the current situation and records. Interactive and interconnect
> all the data cells. Data accuracy is very important. I want the new design feel lively fancy while
> all the important data are all there.

### The shape

V4 is 16 stacked panels. V5 consolidated those into 5 sections behind one command bar. Both answer
"what are the numbers" very well; neither answers "so what" without the reader assembling the story
themselves. V6 is built as a **narrative the reader falls through**, in the order a briefing is
actually given, driven by scroll with a fixed act rail:

| Act | Question it answers |
|-----|---------------------|
| **00 Flight deck** | The verdict, on one screen — animated completion gauge, colour-coded verdict sentence, four headline stats, six sparkline vital signs |
| **01 History** | How the batch got here — cumulative flown-vs-plan-vs-target with a draggable **playhead** and a "Play the story" animation, output-rhythm bars split by sortie type with the moving target overlaid, an auto-detected turning-point timeline, and a month ribbon |
| **02 Situation** | Exactly where it stands — a three-band situation report (where we stand / what is left / what it takes), a clickable phase funnel, the required-vs-actual table, and a zoom/pan **curriculum matrix** (28 SP × 96 lessons on canvas) |
| **03 Forecast** | Where it ends up — a P10–P90 **forecast cone**, a completion-date distribution, the full rate card with straight-line projections, a live **what-if simulator**, and a per-SP completion ladder |
| **04 The batch** | The same story per student — a 28-card constellation with progress rings and sparklines, plus a sortable roster |
| **05 Integrity** | Whether any of it can be trusted — all 33 invariants, evaluated live, plus provenance and the report button |

### Data accuracy — the part that mattered most

**V6 computes no present-tense figure of its own.** Every current-state number comes from
`js/ap127-v5-model.js` — the model already audited line-by-line against V4, carrying 12 invariants —
through byte-for-byte the same `opsAugment` step V5 applies (same `AP127Reconcile` key helpers, so
the two tabs cannot disagree about the same batch on the same day).

Everything forward-looking comes from a new engine, **`js/ap127-v6-forecast.js`**: pure, no DOM,
runs unmodified under Node, and **seeded** — the same model always produces byte-identical output,
because a forecast that changed on every render could never be put in a PDF and defended. It carries
16 invariants of its own; the view adds 5 more. All 33 are rendered in Act 05 and printed in the
report. Shown, not asserted.

Method: a **moving-block bootstrap**. The last 90 days of real daily batch output are resampled in
whole 7-day blocks — preserving the weekly rhythm the school actually flies, stand-downs included —
and run forward 1,500 times until the remaining work is complete. No distribution is fitted and no
growth is assumed; the batch's own days are the model.

### Three real problems found by measuring first, not by guessing

1. **Per-SP projection on isolated rates is noise, and the first build proved it.** Projecting each
   SP on their own trailing 45-day rate produced completion dates spanning 2027 to **2034** — one
   extra or missing sortie inside a window that contained an 8-day batch-wide stand-down moved a
   projected finish by years. Measured against the real snapshot: 27 of 28 SP flew in the 31 Aug –
   05 Sep catch-up push, i.e. the school flies a shared *line* and the SPs move through it together.
   Rebuilt to allocate the **batch's** forecast output by each SP's share of it, shrunk halfway
   toward an equal share. Shares sum to exactly 1, so the per-SP rates sum back to the batch rate —
   asserted by the `sp-share` and `sp-rate-sum` invariants. Spread collapsed from 7 years to
   184 days, and the last SP to finish now agrees with the batch cone instead of contradicting it.
2. **Two different "actual rates" were competing for the same headline.** The deck quoted the EWMA
   (9.2h/day) next to a P50 date the 90-day mean (11.4h/day) had produced — a reader dividing the
   remaining work by the rate shown would not land near the date shown. `verdict.actualRate` is now
   the rate the simulation actually runs on; the EWMA survives as `paceNow` in the rate card. The
   Situation table's trailing-window figures now name their own basis, and a note points at Act 03,
   where every rate the page is allowed to print is listed with its exact window.
   Sanity check now holds: 3,725h ÷ 11.4h/day = 325 days against a P50 of 343.
3. **The what-if at 1.00× disagreed with the headline it sat beside.** It ran 600 simulations
   against the headline's 1,500 and quoted an EWMA-derived rate, so "change nothing" produced a date
   five days off. It now shares the headline's seed and simulation count, and the
   `whatif-neutral` invariant pins neutral to the headline **exactly**.

### Bugs found and fixed during live verification

- **Phase funnel rendered `undefined — undefined` with invisible bars.** `buildPhaseFunnel()`
  returns `{ phase, lessons, slots, done… }` — label/title/colour live on `.phase`, not the row.
  Caught on screen, not in review.
- **A decorative animation could hide the data.** Reveal-on-scroll was an IntersectionObserver;
  observed live returning `revealed: 0 of 29`, i.e. a blank page. Replaced with a plain rAF+timer
  geometry sweep that cannot get stuck, plus a 4-second safety net that reveals everything
  regardless. The deferred chart/canvas mount pass got the same treatment (rAF **and** a timer,
  guarded to run once) so a tab that never receives a frame still builds its charts.
- **`cssv()` read `document.documentElement`, so canvases ignored the light theme.** This is the
  app-wide theme-invariance limitation already documented in CLAUDE.md (`body[data-theme]`
  overrides never reach `:root`). V6 owns its own stylesheet, so it is fixed properly here by
  reading from `document.body` — custom properties still inherit, and the `body[data-theme="light"]`
  block is finally visible to JS. A `MutationObserver` on `data-theme` rebuilds the charts and
  repaints the matrix on a theme switch. **V6 is the first Detail tab that actually follows the
  light theme**; V4 and V5 remain dark-only by design.
- **The exported PDF did not match the sheet on screen.** html2canvas rasterises inside an isolated
  iframe (the trick V5 needed so its clone never walks this app's `oklch()` theme) — and fonts do
  not cross document boundaries, so Rajdhani/JetBrains Mono fell back. The iframe now loads its own
  Google Fonts link and awaits `document.fonts.ready` (capped at 2.5s, so an offline client still
  gets a PDF in fallback fonts rather than hanging).
- **The forecast cone pushed the y-axis ~40% above the course total.** The simulation must keep
  generating output past completion to find the finish day of its slowest runs, but a batch cannot
  fly more than 100% of its own syllabus. Cone values are now capped at the total.
- **Chart.js stacking.** The Output chart's overlays each get their own `stack` group. Chart.js
  groups a `stack`-less dataset by TYPE, so two line overlays on a stacked axis get summed and drawn
  in the wrong place — the exact bug V5 root-caused in p181. Verified here by reading the rendered
  pixel back through the scale: raw 12.75 → rendered 12.75.

### Verified live, end-to-end

Self-check **33/33** on live data and on a time-travelled as-of (01 Jul 2026, which rebuilt the
entire tab: 14.2%, 714h, forecast 08 Dec 2027). Focus bus confirmed cross-highlighting an SP in
three places at once (card, ladder, roster) with the canvas matrix subscribing separately, since CSS
cannot dim a canvas. Matrix cell click opens the full Ops⇄Progress provenance modal (curriculum ·
Progress record · Ops booking · agreement check). Hours/Lessons toggle re-titles all four charts and
the playhead readout. "Play the story" walks the playhead with the readouts following.
**PDF export decoded from a real intercepted `.save()` and inspected with `pdfinfo`/`pdftoppm`:**
valid 5-page A4, 1.8 MB, both charts embedded, all 28 roster rows, the completion matrix, "All 33
invariants pass", and a correct per-page running footer. Mobile 375px: zero horizontal overflow
anywhere, tables scroll inside their own containers, rail hidden. **V4 reloaded (10 charts) and V5
reloaded (self-check 12/12) both unchanged**, and `git diff --stat` on the DB_Share-proxied files
(`js/view-cohort-v4.js`, `js/shared.js`, `css/progress.css`) plus every V5 file is empty.

Console harness: `ap127V6Audit()` prints all three invariant suites, the rate card and the per-SP
table, so a discrepancy can be found without reading the DOM.

Files: `js/ap127-v6-forecast.js` (new), `js/view-cohort-v6.js` (new), `css/cohort-v6.css` (new),
`index.html`, `js/shell.js` (2 lines: nav entry + registry).
