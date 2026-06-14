# Unified Schedule + Nav Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the six separate Operations nav items (Day Glance, Board, Gantt, Weekly, Roster, Calendar) into one **Schedule** screen with a layout-mode switch, regroup/rename the rest of the sidebar, delete the dead Slot Finder, and apply three small layout enhancements (Gantt solo-lane, Roster SP-default, Day AP-127 edge marker).

**Architecture:** The existing views already share all filter/date/focus state through the `useApp()` React context (`app.filters`, `app.date`, `highlightAP127`, `hideOthers`, `tweaks.groupBy`) and each registers a global component (`window.OpsBoard`, `window.GanttBoard`, …). The unified Schedule is therefore a thin new shell component (`view-schedule.js`) that renders a layout chip-bar and mounts the selected existing board — switching layout swaps the body while the shared context preserves the filter state automatically. The other changes are small, surgical edits to existing files.

**Tech Stack:** No-build React 18 (CDN UMD) + Babel Standalone, global-export module pattern (`window.X = Component`), per-file hook aliasing. Hosting: Cloudflare Pages (static, deploy-on-push). No bundler, no npm for the app itself.

**Verification note (read before starting):** This codebase has **no unit-test harness for the React views** — they compile in-browser via Babel. The only `node:test` suite is under `watchdog/`, unrelated to this work. Therefore each task here is verified by **running the static site and asserting in the browser via the preview tools** (`preview_start`, `preview_navigate`/`preview_eval`, `preview_snapshot`, `preview_screenshot`), not by writing failing unit tests. "Expected" blocks describe the concrete browser observation that confirms the task. This is the honest verification path for this stack — do not fabricate a test runner.

**Working copy & branch:** `/Users/nugui/AP127_V2`, branch `feat/unified-schedule` (already created). Repo: `AP127CMD/CMDV2`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `js/view-schedule.js` | New unified Schedule shell: layout chip-bar + mounts selected board | **Create** |
| `index.html` | Loads view scripts; add Schedule | Modify (1 line) |
| `js/shell.js` | Sidebar nav model + view→component registry | Modify (NAV array + registry) |
| `js/view-gantt.js` | Gantt timeline | Modify (solo lane band) |
| `js/view-roster.js` | Roster heat-map | Modify (default groupBy) |
| `js/view-board.js` | Day table | Modify (AP-127 edge marker) |
| `js/view-slotfinder.js` | Dead in main app | **Delete** |
| `README.md` | Nav documentation | Modify (nav block) |

---

## Task 0: Setup & baseline screenshot

**Files:** none (environment only)

- [ ] **Step 1: Confirm branch and clean tree**

Run: `cd /Users/nugui/AP127_V2 && git status -sb && git log --oneline -1`
Expected: on `feat/unified-schedule`; working tree clean (aside from this plan file under `docs/`).

- [ ] **Step 2: Start the preview server**

Use the `preview_start` tool pointed at `/Users/nugui/AP127_V2` (static server, repo root is the site). If using a shell instead: `python3 -m http.server 8127` from the repo root.

- [ ] **Step 3: Capture baseline**

Navigate the preview to `#/board`, then `#/gantt`. Take a `preview_screenshot` of each and save as baseline (`docs/superpowers/plans/_baseline-board.png`, `_baseline-gantt.png`).
Expected: both render; sidebar shows the long Operations group (Day Glance, Board, Gantt, Weekly, Roster, Calendar). This is the "before".

---

## Task 1: Delete the dead Slot Finder

`js/view-slotfinder.js` is **not loaded by `index.html`** (only the legacy `ops/` iframe app references its own copy). Removing the main-app copy is safe.

**Files:**
- Delete: `js/view-slotfinder.js`

- [ ] **Step 1: Verify it is unreferenced by the main app**

Run: `cd /Users/nugui/AP127_V2 && grep -n "view-slotfinder" index.html; grep -rn "SlotFinderBoard" js/`
Expected: **no match in `index.html`**. `js/view-slotfinder.js` defines `SlotFinderBoard`; nothing under `js/` (other than the file itself) mounts it. (`js/shared.js` only has an icon-path branch `if (id === 'slotfinder')` inside `ViewIcon` — harmless, leave it.)

- [ ] **Step 2: Delete the file**

Run: `cd /Users/nugui/AP127_V2 && git rm js/view-slotfinder.js`
Expected: `rm 'js/view-slotfinder.js'`.

- [ ] **Step 3: Verify the app still boots**

Reload the preview at `#/board`. Use `preview_console_logs`.
Expected: no new console errors; Board still renders. (Nothing imported the deleted file.)

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git commit -m "chore: remove dead view-slotfinder.js (unused by unified app; superseded by Auto Slot Finder)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Create the unified Schedule shell component

A thin plain-JS (no JSX) IIFE that mounts an existing board based on a layout mode persisted to `localStorage`. Mirrors the `view-overview.js` / `view-crosscheck.js` plain-script pattern so it skips Babel.

**Files:**
- Create: `js/view-schedule.js`

- [ ] **Step 1: Write the component**

Create `js/view-schedule.js` with exactly:

```javascript
/* AP127 V2 — Unified Schedule shell. One screen, switch layout mode.
 * Each layout is an existing board (window.OpsBoard / GanttBoard / WeeklyBoard /
 * CalendarBoard / RosterBoard). They all read the SAME useData()/useApp() context,
 * so filter/date/focus state persists across a layout switch automatically. */
(function () {
  const { useState } = React;
  const h = React.createElement;

  // mode id -> { label, getComponent }. Resolved at render time (after boards load).
  const MODES = [
    { id: 'day',    label: 'Day',    get: () => window.OpsBoard },
    { id: 'gantt',  label: 'Gantt',  get: () => window.GanttBoard },
    { id: 'week',   label: 'Week',   get: () => window.WeeklyBoard },
    { id: 'month',  label: 'Month',  get: () => window.CalendarBoard },
    { id: 'roster', label: 'Roster', get: () => window.RosterBoard },
  ];

  function ScheduleView() {
    const [mode, setMode] = useState(() => {
      try { return localStorage.getItem('ap127v2-schedule-mode') || 'day'; }
      catch (e) { return 'day'; }
    });
    const pick = MODES.find(m => m.id === mode) || MODES[0];
    const Body = pick.get();
    const go = id => { setMode(id); try { localStorage.setItem('ap127v2-schedule-mode', id); } catch (e) {} };

    const chip = m => h('button', {
      key: m.id, onClick: () => go(m.id), className: 'mono uc',
      style: {
        fontSize: 10, padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
        border: '1px solid ' + (mode === m.id ? 'var(--highlight)' : 'var(--line)'),
        background: mode === m.id ? 'color-mix(in oklch,var(--highlight) 12%,transparent)' : 'transparent',
        color: mode === m.id ? 'var(--highlight)' : 'var(--ink-2)',
        transition: 'all .12s',
      },
    }, m.label);

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h('div', {
        style: {
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          padding: '6px 10px', borderBottom: '1px solid var(--line)',
          background: 'var(--bg-2)', flexShrink: 0,
        },
      },
        h('span', { className: 'mono uc', style: { fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em', marginRight: 4 } }, 'LAYOUT'),
        MODES.map(chip)),
      h('div', { style: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' } },
        Body ? h(Body) : h('div', { className: 'mono uc', style: { padding: 20, color: 'var(--ink-3)', fontSize: 11 } }, 'Layout unavailable')));
  }

  window.ScheduleView = ScheduleView;
})();
```

- [ ] **Step 2: Load it in index.html**

In `index.html`, add the script tag immediately **before** `js/shell.js` (it is plain JS — load as a plain `<script>`, not `text/babel`). Find the line:

```html
<script src="js/view-overview.js?v=p44"></script>
<script src="js/shell.js?v=p44"></script>
```

Insert between them:

```html
<script src="js/view-schedule.js?v=p44"></script>
```

Result:

```html
<script src="js/view-overview.js?v=p44"></script>
<script src="js/view-schedule.js?v=p44"></script>
<script src="js/shell.js?v=p44"></script>
```

- [ ] **Step 3: Register the route in shell.js**

In `js/shell.js`, find the `registry()` function (around line 274). Add a `schedule` entry at the top of the returned object (keep all existing ops entries for old-bookmark back-compat):

```javascript
  function registry() {
    return {
      schedule: window.ScheduleView,
      today: window.DailyBoard, board: window.OpsBoard, gantt: window.GanttBoard,
      weekly: window.WeeklyBoard, roster: window.RosterBoard, calendar: window.CalendarBoard,
```

- [ ] **Step 4: Verify it mounts (route reachable before nav change)**

Reload the preview and navigate to `#/schedule`. Use `preview_snapshot`.
Expected: a `LAYOUT` chip-bar with Day · Gantt · Week · Month · Roster; "Day" selected; the Board table renders below it. Click each chip → the body swaps (Gantt timeline, Week columns, Calendar month, Roster heat-map). Switch to Gantt, then back to Day — the body returns.
Run `preview_console_logs` → expected: no errors.

- [ ] **Step 5: Verify filter persistence across switch**

In the Day layout, type a student name into the FilterBar search. Click the **Gantt** chip.
Expected: the Gantt is filtered to the same query (shared context). Confirm via `preview_snapshot` that the row/flight set is reduced consistently.

- [ ] **Step 6: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-schedule.js index.html js/shell.js
git commit -m "feat: add unified Schedule shell that swaps layout modes over shared filter state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Regroup & rename the sidebar nav

Collapse the six Operations items to one **Schedule** entry, move **Aircraft Status** and **Ops Analytics** into Operations, and rename the colliding Progress/Training items. Old routes stay in the registry, so bookmarks to `#/board` etc. still work — they just leave the sidebar.

**Files:**
- Modify: `js/shell.js` (the `NAV` array, around lines 11-40)

- [ ] **Step 1: Replace the NAV model**

In `js/shell.js`, find the nav model (it begins `// Nav model — groups → views.` near line 10 and the groups array runs ~lines 11-40). Replace the array of groups with exactly:

```javascript
    { items: [{ id: 'overview', label: 'Home', icon: '◎', ready: true }] },
    { label: 'Schedule', items: [
      { id: 'schedule', label: 'Schedule', icon: '▦' },
    ] },
    { label: 'Operations', items: [
      { id: 'analytics', label: 'Ops Analytics', icon: '◫' },
      { id: 'aircraft', label: 'Aircraft Status', icon: '✦' },
    ] },
    { label: 'Planning', items: [
      { id: 'autoslotfinder', label: 'Slot Finder', icon: '⚡' },
    ] },
    { label: 'Progress', items: [
      { id: 'cohort', label: 'AP127 Detail', icon: '▰' },
      { id: 'student', label: 'Student Lens', icon: '👤' },
    ] },
    { label: 'Training Program', items: [
      { id: 'plans', label: 'Curriculum Plans', icon: '▤' },
      { id: 'performance', label: 'School Perf.', icon: '◷' },
      { id: 'simulation', label: 'Simulation', icon: '◈' },
      { id: 'sim2', label: 'Simulation 2', icon: '⚖' },
      { id: 'sim3', label: 'Simulation 3', icon: '◆' },
    ] },
    { label: 'Integrity', items: [{ id: 'crosscheck', label: 'Cross-Check', icon: '⇄' }] },
    { label: 'Help', items: [{ id: 'tutorial', label: 'User Guide', icon: '?' }] },
    { label: 'System', items: [
      { id: 'watchdog', label: 'Watchdog', icon: '◉' },
      { id: 'cfusage', label: 'CF Usage', icon: '☁' },
    ] },
```

Notes on the deliberate changes:
- Operations' six items (`today`/`board`/`gantt`/`weekly`/`roster`/`calendar`) are gone from the sidebar — replaced by the single `schedule` group.
- `analytics` (Ops Analytics) moved from **Progress** → **Operations** (it is operations data).
- `aircraft` moved from **Planning** → **Operations** (live fleet status).
- `autoslotfinder` relabeled `Slot Finder` (the dead one is deleted; this is the only one left).
- Training Program's `plans` relabeled `Curriculum Plans` so it no longer collides with Progress' `AP127 Detail`.
- The three Simulations are unchanged (per the user's choice).

- [ ] **Step 2: Verify the sidebar**

Reload the preview at `#/schedule`. `preview_snapshot` the sidebar.
Expected groups in order: Home · **Schedule** (Schedule) · **Operations** (Ops Analytics, Aircraft Status) · Planning (Slot Finder) · Progress (AP127 Detail, Student Lens) · Training Program (Curriculum Plans, School Perf., Simulation ×3) · Integrity · Help · System. **13 clickable items total.** No "Day Glance / Board / Gantt / Weekly / Roster / Calendar" in the sidebar.

- [ ] **Step 3: Verify old bookmarks still resolve**

Navigate the preview to `#/board` and `#/gantt` directly.
Expected: both still render (registry retained), even though they are not in the sidebar.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/shell.js
git commit -m "feat: regroup sidebar — one Schedule entry, Aircraft+Analytics under Operations, rename Curriculum Plans

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Gantt — split solo flights into a separate lane band (FI grouping)

When grouped by instructor, solo flights should occupy their own lane band **below** the FI's dual flights, instead of intermixing in the shared lane-packing. Overlap-packing, on-bar info, and click-to-open already exist — this only changes lane assignment.

**Files:**
- Modify: `js/view-gantt.js` (the lane-packing block, ~lines 202-216, and the `laneCount` it produces)

- [ ] **Step 1: Replace the lane-packing block**

In `js/view-gantt.js`, find the block that starts with the comment `// Overlap lanes: pack flights into sub-rows` (around line 202) and ends with `const rowH = Math.max(54, laneCount*LANE_H + 6);` (around line 216). Replace the whole block with:

```javascript
            // Overlap lanes: pack flights into sub-rows so overlapping schedules are
            // all visible and individually clickable (no stacked, unreachable bars).
            // When grouping by instructor, solo flights get their own lane band BELOW
            // the instructor's dual flights (they never share a lane with dual sorties).
            const isSoloRow = f => isSoloFlt(f) && !f._asFiStudent;
            const packLanes = list => {
              const ends = []; const map = new Map();
              [...list].sort((a,b)=>(minutesOf(a.start)||0)-(minutesOf(b.start)||0)).forEach(f=>{
                const s = minutesOf(f.start)||0;
                const e = minutesOf(f.end) || (s + (f.durMin||60));
                let lane = ends.findIndex(end => end <= s);
                if (lane === -1) { lane = ends.length; ends.push(e); }
                else ends[lane] = e;
                map.set(f, lane);
              });
              return { map, count: ends.length };
            };
            const splitSolo = groupBy === 'instructor';
            const dualList  = splitSolo ? r.flights.filter(f => !isSoloRow(f)) : r.flights;
            const soloList  = splitSolo ? r.flights.filter(f =>  isSoloRow(f)) : [];
            const dualPack  = packLanes(dualList);
            const soloPack  = packLanes(soloList);
            const dualLaneN = Math.max(splitSolo ? 0 : 1, dualPack.count);
            const flightLane = new Map();
            dualPack.map.forEach((lane, f) => flightLane.set(f, lane));
            soloPack.map.forEach((lane, f) => flightLane.set(f, dualLaneN + lane)); // offset below dual
            const laneCount = Math.max(1, dualLaneN + soloPack.count);
            const LANE_H = isMobile ? 30 : 48;
            const rowH   = Math.max(54, laneCount*LANE_H + 6);
```

This preserves the existing `flightLane`, `laneCount`, `LANE_H`, `rowH` names so the rest of the render (which reads `flightLane.get(f)` and positions bars at `lane*LANE_H + 3`) is unchanged.

- [ ] **Step 2: Verify solos drop to their own lane band**

Reload the preview at `#/schedule`, click the **Gantt** chip, ensure **GROUP BY → instructor** (the Gantt's own InlineSettings group control). Pick a date with solo lessons (search the FilterBar for "solo" to confirm such flights exist, then clear).
Expected: within an instructor row that has both dual and solo flights, the solo bars (dashed, `--col-solo`, "SOLO" badge) sit on lanes **below** all the dual bars — never side-by-side in the same lane as a dual sortie. The row height grows to fit. Each solo bar is still clickable → opens the drawer.

- [ ] **Step 3: Verify other groupings unaffected**

Switch GROUP BY to **tail**, then **batch**.
Expected: unchanged behavior (no solo split — `splitSolo` is false); bars pack normally; no console errors (`preview_console_logs`).

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-gantt.js
git commit -m "feat(gantt): solo sorties get a dedicated lane band under each instructor's dual flights

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Roster — default to SP-per-day rows

`view-roster.js` already supports `groupBy` of `'instructor' | 'batch' | 'student'`. Change the **default** to `'student'` (SP/day) so the Roster opens cohort-first, per the design.

**Files:**
- Modify: `js/view-roster.js` (the `groupBy` state initializer, ~line 17)

- [ ] **Step 1: Confirm the toggle exists and read the default line**

Run: `cd /Users/nugui/AP127_V2 && grep -n "useS_r('instructor')\|setGroupBy\|groupBy ===" js/view-roster.js | head`
Expected: a `const [groupBy, setGroupBy] = useS_r('instructor');` line (~17) and UI that calls `setGroupBy` with a `'student'` option. (If no visible `'student'` toggle button is rendered, add one alongside the existing instructor/batch buttons using the same `setGroupBy('student')` handler — keep it visually identical to the others.)

- [ ] **Step 2: Change the default to student**

In `js/view-roster.js`, change:

```javascript
  const [groupBy,    setGroupBy]    = useS_r('instructor'); // 'instructor' | 'batch' | 'student'
```

to:

```javascript
  const [groupBy,    setGroupBy]    = useS_r('student'); // 'student'(SP/day, default) | 'instructor' | 'batch'
```

- [ ] **Step 3: Verify**

Reload the preview at `#/schedule`, click the **Roster** chip.
Expected: rows are **students (SPs)** by date, not instructors. The groupBy toggle still lets you switch to Instructor/Batch. Toggle **◆ AP-127 focus** (top bar / FocusControls) → the SP roster narrows to the AP-127 cohort. No console errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-roster.js
git commit -m "feat(roster): default to SP-per-day rows (cohort-first); instructor/batch still available

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Day board — AP-127 left-edge marker

The Day table row already uses a 3px **status** color on its left border. Add a distinct thin **AP-127** marker just inside it (an inset box-shadow) so cohort rows stand out even when the table is sorted by another column — without removing the status edge.

**Files:**
- Modify: `js/view-board.js` (the row `<div>` style, ~lines 154-164)

- [ ] **Step 1: Add the AP-127 inset marker to the row style**

In `js/view-board.js`, find the data row's style object (the `<div key={f.id+i} onClick={()=>app.setDrawer(f.id)} style={{ ... borderLeft:`3px solid ${color}`, ... }}>`, ~line 154). Add a `boxShadow` property right after the `borderLeft` line:

```javascript
                  borderLeft:`3px solid ${color}`,
                  boxShadow: f.batch===HIGHLIGHT_BATCH ? 'inset 7px 0 0 -4px var(--highlight)' : 'none',
```

This paints a ~3px magenta bar inset 4px from the status edge, only on AP-127 rows. (The `-4px` spread keeps it from bleeding over the status border.)

- [ ] **Step 2: Verify**

Reload the preview at `#/schedule` (Day layout). Sort by **STUDENT** (click the column header) so batches interleave.
Expected: AP-127 rows show the magenta inset marker beside the status color edge; non-AP-127 rows show only the status edge. Toggle **◆ AP-127 focus** still dims/keeps rows as before. `preview_screenshot` to record.

- [ ] **Step 3: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-board.js
git commit -m "feat(board): magenta inset edge marks AP-127 rows independent of status colour

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Update README nav documentation

Keep the docs honest — the README's Navigation block still lists the six Operations items as separate views.

**Files:**
- Modify: `README.md` (the `## Navigation` fenced block)

- [ ] **Step 1: Replace the Navigation block**

In `README.md`, find the fenced block under `## Navigation` that begins `HOME ◎`. Replace its contents with:

```
HOME ◎
SCHEDULE      one screen · layout switch: Day ▦ · Gantt ▭ · Week ▦ · Month ▦ · Roster ▥
OPERATIONS    Ops Analytics ◫ · Aircraft Status ✦
PLANNING      Slot Finder ⚡
PROGRESS      AP127 Detail ▰ · Student Lens 👤
TRAINING PGM  Curriculum Plans ▤ · School Perf. ◷ · Simulation ◈ / ⚖ / ◆
INTEGRITY     Cross-Check ⇄   (amber dot when review/conflict items exist)
HELP          User Guide ?
SYSTEM        Watchdog ◉ · CF Usage ☁
```

Add one sentence after the block:

```
The six former Operations pages (Day Glance, Board, Gantt, Weekly, Roster, Calendar) are
now **layout modes of the single Schedule screen** — selected from a chip-bar, sharing one
filter/date/focus state. Old hash routes (`#/board`, `#/gantt`, …) still resolve for bookmarks.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nugui/AP127_V2
git add README.md
git commit -m "docs: update nav block for unified Schedule + regrouped sidebar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Full regression pass & PR

**Files:** none (verification + PR)

- [ ] **Step 1: Click through every sidebar item**

Reload the preview. Visit each of the 13 sidebar items in turn. After each, run `preview_console_logs`.
Expected: every view renders; **zero** console errors across the sweep. Schedule's five layouts all render and switch. Cross-Check, Simulations, Aircraft, Cohort, Student Lens all unaffected.

- [ ] **Step 2: Filter-persistence across layouts (final check)**

On Schedule: set a FilterBar search + toggle AP-127 focus. Cycle Day → Gantt → Week → Month → Roster.
Expected: the same filter/date/focus applies in all five (shared context). Capture a `preview_screenshot` of Day and Gantt as the "after".

- [ ] **Step 3: Push and open the PR**

```bash
cd /Users/nugui/AP127_V2
git push -u origin feat/unified-schedule
gh pr create --repo AP127CMD/CMDV2 --title "Unified Schedule + sidebar cleanup" --body "$(cat <<'EOF'
## Summary
- Collapse six Operations pages (Day Glance, Board, Gantt, Weekly, Roster, Calendar) into one **Schedule** screen with a layout chip-switch; all layouts share one filter/date/focus state (already in context).
- Regroup sidebar (21 → 13 items): Aircraft Status + Ops Analytics → Operations; rename Training "Curriculum Plans" to stop colliding with Progress "AP127 Detail".
- Delete dead `view-slotfinder.js` (unused by the main app).
- Gantt: solo sorties get a dedicated lane band under each instructor's dual flights.
- Roster: default to SP-per-day rows (cohort-first).
- Day board: magenta inset marks AP-127 rows independent of status colour.

Old hash routes (`#/board`, `#/gantt`, …) still resolve for bookmarks.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR created against `AP127CMD/CMDV2`. Cloudflare Pages will build a preview deployment on push.

- [ ] **Step 4: Verify the Pages preview**

Open the Cloudflare Pages preview URL from the PR checks. Smoke-test `#/schedule` and the layout switch on the deployed preview.
Expected: matches local behavior.

---

## Self-Review (completed during planning)

- **Spec coverage:** unify 6 schedule views → Tasks 2-3; delete dead Slot Finder → Task 1; nav regroup/rename → Task 3; Gantt solo lane → Task 4; Roster SP default → Task 5; Day drawer (already exists) + AP-127 edge → Task 6; global filter across layouts (already via context, verified) → Tasks 2/8. Sticky header, sortable columns, Gantt overlap-packing, on-bar info, Day drawer, Month status segments, Week columns all **already exist** in the current code and are confirmed by the verification steps rather than re-implemented.
- **Out of scope by user choice:** merging the 3 Simulations (left as separate items); a density toggle and per-column quick-filters on the Day table (the shared FilterBar + sort already cover the core need — flag as a fast follow-up if still wanted after this lands).
- **Type/name consistency:** `window.ScheduleView` defined in Task 2, referenced in `registry()` (Task 2 Step 3) and NAV id `schedule` (Task 3) — consistent. `flightLane`/`laneCount`/`LANE_H`/`rowH` names preserved in Task 4 so the unchanged Gantt render still compiles. `groupBy` value `'student'` in Task 5 matches the existing switch in `view-roster.js`.
- **Placeholders:** none — every code step shows the literal code.

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.
