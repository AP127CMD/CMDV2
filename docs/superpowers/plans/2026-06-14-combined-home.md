# Combined Home (Home × Day Glance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Day Glance operational dashboard into the Home landing page so there is one combined command-center home (operational day snapshot + AP-127 cohort-progress digest), and remove the separate Day Glance tab.

**Architecture:** Day Glance's operational panels (Schedule Pulse, Status Mix, Batch Breakdown, Instructor Load, Aircraft Fleet, AP-127 Spotlight — all inline-SVG, no Chart.js) are extracted from `js/view-daily.js` into a reusable `window.DayGlancePanels` component that reads the shared date via `useApp().date`. `js/view-overview.js` is rewritten as the combined Home (loaded as `text/babel` so it shares the views' Babel scope) and composes: header + date picker → merged 8-tile KPI strip → `<DayGlancePanels/>` → today's-line + alerts → cohort progress. The standalone `DailyBoard` tab is retired and `#/today` redirects to Home.

**Tech Stack:** No-build React 18 (CDN UMD) + Babel Standalone, global-export module pattern, shared Babel scope across `type="text/babel"` scripts. `window.useData === useApp` (same context; `.date` is the picker-driven date). Cloudflare Pages (static).

**Verification note:** No unit-test harness exists for these in-browser JSX views. Each task is verified by running the static site in the preview (port 7423, launch config `ap127v2`) and asserting via the preview tools (`preview_eval`, `preview_screenshot`, `preview_console_logs`). After editing any `js/*` file, **bump the `?v=` token in `index.html`** (or `location.reload(true)` is unreliable for the Babel-fetched scripts). The "Expected" blocks describe the concrete browser observation.

**Working copy & branch:** `/Users/nugui/AP127_V2`, branch `feat/unified-schedule` (already checked out, PR #2 open). This work adds to that PR.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `js/view-daily.js` | Operational day panels | **Modify** — rename `DailyBoard`→`DayGlancePanels`, drop the page chrome + KPI strip, export `window.DayGlancePanels` |
| `js/view-overview.js` | Combined Home | **Rewrite** as `text/babel` JSX composing the panels + progress digest |
| `index.html` | Script loading | **Modify** — `view-overview.js` → `type="text/babel"`; bump `?v=` token |
| `js/shell.js` | Nav + routing | **Modify** — remove Day Glance nav item; alias `today`→`overview`; drop `today` from registry |
| `README.md` | Docs | **Modify** — note Day Glance folded into Home |

---

## Task 1: Extract `DayGlancePanels` from `view-daily.js`

Turn the standalone Day Glance board into a reusable panel cluster (no page chrome, no KPI strip — those move to Home).

**Files:**
- Modify: `js/view-daily.js`

- [ ] **Step 1: Rename the component and trim its render to the panels only**

In `js/view-daily.js`:

1. Rename the component declaration `function DailyBoard() {` → `function DayGlancePanels() {`.
2. **Keep unchanged** every `useMemo`/`const` computation inside it (`app`, `isMobile`, `date`, `today`, `isCurrentDay`, `fmtDay` destructure, `flights`, `stats`, `hourly`, `byBatch`, `byInstructor`, `byTail`, `ap127`, the status-mix slices, `gridCols`, etc.).
3. Replace the `return (...)` block. The current return renders `<ArtboardShell>` wrapping: a **top-bar** div, then a scrollable body containing a **date-hero** div, a **9-tile KPI strip** div, and then the panel sections (Schedule Pulse, Batch Breakdown, Status Mix, Instructor Load, Aircraft Fleet, AP-127 Spotlight). Change it to return a **plain fragment** that contains ONLY the panel sections — drop `ArtboardShell`, `ThemeStyle`, the top-bar div, the date-hero div, and the 9-tile KPI strip. Concretely, the new return is:

```jsx
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Charts row — Schedule Pulse + Batch Breakdown side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
        {/* ...KEEP the existing Schedule Pulse <Section> exactly as-is... */}
        {/* ...KEEP the existing Batch Breakdown <Section> exactly as-is... */}
      </div>

      {/* ...KEEP the existing Status Mix <Section> exactly as-is... */}

      <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
        {/* ...KEEP the existing Instructor Load <Section> exactly as-is... */}
        {/* ...KEEP the existing Aircraft Fleet <Section> exactly as-is... */}
      </div>

      {/* ...KEEP the existing ◆ AP-127 Spotlight <Section> exactly as-is... */}
    </div>
  );
```

The `{/* ...KEEP... */}` markers mean: move the existing JSX for those `<Section>` blocks (currently inside `DailyBoard`'s body, from the `{/* Charts row ... */}` comment through the end of the AP-127 Spotlight `<Section>`) into this new wrapper verbatim, preserving their internal code. Match the existing grid grouping the file already uses (the file already groups Pulse+Batch in one grid and Instructor+Fleet in another — keep those groupings). Do NOT alter the panel internals.

4. At the bottom of the file, change the export:

```javascript
window.DayGlancePanels = DayGlancePanels;
```

(Remove the old `window.DailyBoard = DailyBoard;` line — `DailyBoard` no longer exists.)

Leave the helper components (`DailyDonut`, `DKPI`, `Section`, `StackBar`) and all top-of-file helpers in place — `DayGlancePanels` still uses them.

- [ ] **Step 2: Bump the asset token and verify the file still loads**

In `index.html`, bump every `?v=p49` → `?v=p50` (whole file):

Run: `cd /Users/nugui/AP127_V2 && sed -i '' 's/?v=p49/?v=p50/g' index.html && grep -c '?v=p50' index.html`
Expected: `23`.

Confirm the rename landed:
Run: `grep -c "window.DayGlancePanels = DayGlancePanels" js/view-daily.js; grep -c "window.DailyBoard" js/view-daily.js`
Expected: `1` then `0`.

- [ ] **Step 3: Browser check — panels render in isolation (temporary route)**

The Day Glance tab still points at `today`→`window.DailyBoard` in the registry, which is now undefined, so `#/today` will show the placeholder until Task 3. That's expected at this step. Instead, confirm no parse/runtime error by loading any working route. Start the preview (launch config `ap127v2`), navigate to `#/schedule`, and run `preview_console_logs` (level error).
Expected: **no console errors** (the renamed file parses; nothing references `DayGlancePanels` yet, so it's defined-but-unused).

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-daily.js index.html
git commit -m "refactor(daily): extract DayGlancePanels (panels only) from DailyBoard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Rewrite `view-overview.js` as the combined Home

**Files:**
- Modify (full rewrite): `js/view-overview.js`
- Modify: `index.html` (one script tag → `type="text/babel"`)

- [ ] **Step 1: Replace the entire contents of `js/view-overview.js` with:**

```jsx
/* AP127 V2 — Combined Home. Cohort-progress digest × Day Glance operational dashboard.
 * Operational panels (pulse / status / batch / instructor / fleet / AP-127 spotlight)
 * come from <DayGlancePanels/> (js/view-daily.js); they read the shared date (useApp().date),
 * which the DateCalendarTrigger in this header drives. Loaded as text/babel so it shares the
 * views' Babel scope (DateCalendarTrigger, DayGlancePanels, localToday). */
(function () {
  const { useMemo } = React;
  const SC = { Completed: 'var(--col-done)', Pending: 'var(--col-pending)', Canceled: 'var(--col-cancel)' };
  const dDiff = (a, b) => (!a || !b) ? null : Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
  const hoursOf = mins => Math.round((mins / 60) * 10) / 10;

  function OverviewView() {
    const d = window.useData();
    const { FLIGHTS, students, curriculum, reconciliation, setStudentLens, isMobile } = d;
    const date = d.date;
    const go = d.go || (() => {});
    const today = localToday();
    const isAP = b => window.AP127Reconcile.isAP127(b);

    // Progress model — period-wide, date-independent (ported from the original Home)
    const model = useMemo(() => {
      const studs = students.map(s => {
        const last = (s.flown || []).map(f => f.date).filter(Boolean).sort().at(-1) || '';
        const idle = last ? Math.max(0, dDiff(today, last) || 0) : 9999;
        const due = curriculum.filter(c => c.planned_date && c.planned_date <= today).length;
        return { ...s, idle, behind: due - (s.done || 0) };
      });
      const cohortPct = studs.length ? Math.round(studs.reduce((a, s) => a + (s.pct || 0), 0) / studs.length * 10) / 10 : 0;
      const doneVals = studs.map(s => s.done || 0).sort((a, b) => a - b);
      const spread = (doneVals.at(-1) || 0) - (doneVals[0] || 0);
      return { studs, cohortPct, spread, lead: doneVals.at(-1) || 0, lag: doneVals[0] || 0 };
    }, [students, curriculum, today]);

    // Day model — selected date: AP-127 line + all-batches ops counts for the KPI strip
    const dayModel = useMemo(() => {
      const onDate = FLIGHTS.filter(f => f.date === date);
      const apLine = onDate
        .filter(f => isAP(f.batch) && f.student && f.student !== 'All Students')
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      const completed = onDate.filter(f => f.status === 'Completed').length;
      const pending = onDate.filter(f => f.status === 'Pending').length;
      const canc = onDate.filter(f => f.status === 'Canceled').length;
      const schedMin = onDate.reduce((a, f) => a + (f.durMin || 0), 0);
      return { apLine, completed, pending, canc, hours: hoursOf(schedMin), apCount: apLine.length };
    }, [FLIGHTS, date]);

    const t = reconciliation.totals;
    const leaders = model.studs.slice().sort((a, b) => (b.pct || 0) - (a.pct || 0)).slice(0, 6);
    const laggers = model.studs.slice().sort((a, b) => (b.behind - a.behind) || (b.idle - a.idle)).slice(0, 6);
    const idleStu = model.studs.filter(s => s.idle >= 7 && s.idle < 900).sort((a, b) => b.idle - a.idle);
    const lensTo = s => { setStudentLens(s); go('student'); };
    const toSchedule = () => go('schedule');

    const kpi = (cls, l, v, s, onClick) => (
      <div className={'kpi ' + cls} style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick || undefined}>
        <div className="kl">{l}</div><div className="kv">{v}</div><div className="ks">{s}</div>
      </div>
    );

    return (
      <div style={{ padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' }}>
        {/* Header + date picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
          <h1 className="head" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 0.5, margin: 0 }}>AP<b style={{ color: 'var(--highlight)' }}>127</b> COMMAND CENTER</h1>
          <DateCalendarTrigger/>
          {date === today && <span className="mono uc" style={{ fontSize: 9, color: 'var(--col-pending)', padding: '2px 7px', border: '1px solid var(--col-pending)', borderRadius: 3 }}>TODAY</span>}
          <span style={{ flex: 1 }}/>
          <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{model.studs.length} students · {dayModel.apCount} AP-127 today</span>
        </div>

        {/* Merged KPI strip — ops (all batches) + progress (AP-127) */}
        <div className="kpis">
          {kpi('acc', 'On The Line', dayModel.apCount, `${dayModel.completed} done · ${dayModel.pending} pending`, toSchedule)}
          {kpi('ok', 'Completed', dayModel.completed, `${dayModel.hours}h all batches`, toSchedule)}
          {kpi('rev', 'Pending', dayModel.pending, `${dayModel.canc} canceled`, toSchedule)}
          {kpi('', 'Cohort Progress', model.cohortPct + '%', `${model.studs.length} students avg`, () => go('cohort'))}
          {kpi('rev', 'Pace Spread', model.spread, `lead ${model.lead} · lag ${model.lag}`, () => go('cohort'))}
          {kpi(idleStu.length ? 'rev' : 'ok', 'Idle ≥7d', idleStu.length, idleStu.length ? `${idleStu[0].nick} ${idleStu[0].idle}d` : 'none', null)}
          {kpi(t.conflict ? 'bad' : 'ok', 'Conflicts', t.conflict, `${t.review} review · ${t.consistency}% match`, () => go('crosscheck'))}
        </div>

        {/* Operations + utilization + AP-127 spotlight (from Day Glance) */}
        <DayGlancePanels/>

        {/* Today's line + alerts */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,2fr) minmax(0,1fr)', gap: 14 }}>
          <div className="panel">
            <div className="ph"><span className="pt">On The Line</span><span className="ps link" onClick={toSchedule}>{date}{date === today ? ' (today)' : ''} · {dayModel.apCount} flights →</span></div>
            <div className="pb">{dayModel.apLine.length ? dayModel.apLine.slice(0, 14).map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '54px 1fr 80px 60px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 11 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{f.start || '--:--'}</span>
                <span><b style={{ color: 'var(--highlight)' }}>{f.lesson || '—'}</b> <span className="muted">{f.student || ''}</span></span>
                <span className="mono muted" style={{ fontSize: 10 }}>{f.instructor || ''}</span>
                <span className="pill" style={{ background: `color-mix(in oklch,${SC[f.status] || 'var(--ink-3)'} 16%,transparent)`, color: SC[f.status] || 'var(--ink-3)' }}>{(f.status || '').slice(0, 4)}</span>
              </div>
            )) : <div className="empty">No AP127 flights on this day</div>}</div>
          </div>
          <div className="panel">
            <div className="ph"><span className="pt">Alerts</span><span className="ps">needs attention</span></div>
            <div className="pb" style={{ display: 'grid', gap: 8 }}>{(() => {
              const a = [];
              if (idleStu.length) a.push(['rev', '⏸', `${idleStu.length} student${idleStu.length > 1 ? 's' : ''} idle ≥ 7 days`, idleStu.slice(0, 5).map(s => `${s.nick} (${s.idle}d)`).join(', ')]);
              if (dayModel.canc) a.push(['info', '✕', `${dayModel.canc} cancellation${dayModel.canc > 1 ? 's' : ''} on this day`, 'Review the schedule for rescheduling.']);
              if (!a.length) a.push(['ok', '✓', 'All clear', 'No idle students, no cancellations on the selected day.']);
              return a.map((x, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', borderLeft: `3px solid var(--col-${x[0] === 'bad' ? 'cancel' : x[0] === 'rev' ? 'pending' : x[0] === 'info' ? 'stby' : 'done'})`, fontSize: 12 }}>
                  <span style={{ fontSize: 15 }}>{x[1]}</span><div><b>{x[2]}</b><div className="muted" style={{ marginTop: 2 }}>{x[3]}</div></div>
                </div>
              ));
            })()}</div>
          </div>
        </div>

        {/* Cohort progress */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div className="panel">
            <div className="ph"><span className="pt">Pace Leaders</span><span className="ps link" onClick={() => go('cohort')}>cohort →</span></div>
            <div className="pb">{leaders.map((s, i) => (
              <div key={i} onClick={() => lensTo(s)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                <span className="mono" style={{ fontSize: 11, width: 62, color: 'var(--highlight)' }}>{s.nick}</span>
                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span className="bar" style={{ width: 84 }}><i style={{ width: Math.min(100, s.pct || 0) + '%' }}/></span>
                <span className="head" style={{ fontSize: 15, fontWeight: 700, width: 46, textAlign: 'right' }}>{(s.pct || 0).toFixed(0)}%</span>
              </div>
            ))}</div>
          </div>
          <div className="panel">
            <div className="ph"><span className="pt">Behind Schedule</span><span className="ps">most behind plan</span></div>
            <div className="pb">{laggers.map((s, i) => (
              <div key={i} onClick={() => lensTo(s)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                <span className="mono" style={{ fontSize: 11, width: 62, color: 'var(--highlight)' }}>{s.nick}</span>
                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span className={'pill ' + (s.behind > 0 ? 'rev' : 'ok')}>{s.behind > 0 ? s.behind + ' behind' : 'on pace'}</span>
                <span className="mono muted" style={{ fontSize: 10, width: 62, textAlign: 'right' }}>{s.idle > 900 ? 'never' : s.idle + 'd idle'}</span>
              </div>
            ))}</div>
          </div>
        </div>
      </div>
    );
  }
  window.OverviewView = OverviewView;
})();
```

- [ ] **Step 2: Load it as `text/babel` in `index.html`**

The combined Home now uses JSX and references `DateCalendarTrigger`/`DayGlancePanels`/`localToday` from the shared Babel scope, so it must be transpiled. Change its script tag from a plain script to a Babel script. Find:

```html
<script src="js/view-overview.js?v=p50"></script>
```

Change to:

```html
<script type="text/babel" src="js/view-overview.js?v=p50"></script>
```

(`view-schedule.js` and `shell.js` stay plain scripts — only `view-overview.js` changes.)

- [ ] **Step 3: Verify the combined Home renders**

Start/restart the preview (`ap127v2`), set viewport to 1440×900, navigate to `#/overview`, and screenshot. Run `preview_console_logs` (level error).
Expected: **zero console errors**; the page shows, top to bottom: header with "AP127 COMMAND CENTER" + a date trigger button + TODAY badge; an 8-tile KPI strip; the Schedule Pulse + Status Mix panels; Batch Breakdown + Instructor Load + Aircraft Fleet; the ◆ AP-127 Spotlight; On The Line + Alerts; Pace Leaders + Behind Schedule.

- [ ] **Step 4: Verify the date picker drives the operational panels**

In the preview, `preview_eval` to read the current date, then click the date trigger and pick a different in-range day (or set `d.setDate` is internal — instead click the `DateCalendarTrigger` button then a day cell). Simpler check: `preview_eval` the rendered "On The Line" header text before and after changing the selected day via the calendar UI.
Expected: changing the date updates On The Line, Schedule Pulse, Status Mix, Batch/Instructor/Fleet, and the Spotlight; the Pace Leaders / Behind Schedule / Cohort KPIs stay the same (date-independent). TODAY badge shows only when the selected date is today.

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-overview.js index.html
git commit -m "feat(home): combined Home — Day Glance panels + cohort digest, with date picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Remove the Day Glance tab and redirect `#/today`

**Files:**
- Modify: `js/shell.js`

- [ ] **Step 1: Remove the Day Glance nav item**

In `js/shell.js`, the Operations nav group currently is:

```javascript
    { label: 'Operations', items: [
      { id: 'today', label: 'Day Glance', icon: '✈' },
      { id: 'analytics', label: 'Ops Analytics', icon: '◫' },
      { id: 'aircraft', label: 'Aircraft Status', icon: '✦' },
    ] },
```

Remove the `today` line so it becomes:

```javascript
    { label: 'Operations', items: [
      { id: 'analytics', label: 'Ops Analytics', icon: '◫' },
      { id: 'aircraft', label: 'Aircraft Status', icon: '✦' },
    ] },
```

- [ ] **Step 2: Drop `today` from the registry**

In `registry()`, the first line currently reads:

```javascript
      schedule: window.ScheduleView,
      today: window.DailyBoard, board: window.OpsBoard, gantt: window.GanttBoard,
```

Remove `today: window.DailyBoard, ` (it now points at an undefined global). Result:

```javascript
      schedule: window.ScheduleView,
      board: window.OpsBoard, gantt: window.GanttBoard,
```

- [ ] **Step 3: Alias `today` → `overview` so old bookmarks land on Home**

In `js/shell.js`, find the `Shell` component's initial view state (it reads the hash):

```javascript
    const [view, setView] = useState(() => {
      const raw = (location.hash || '').replace('#/', '').replace('#', '') || localStorage.getItem('ap127v2-view') || 'overview';
      if (_sharePreset && !_sharePreset.includes(raw)) return _sharePreset[0];
      return raw;
    });
```

Add a one-line alias map just above the `useState` (inside `Shell`, before that block) and apply it in both the initializer and the `ap127-go` handler. First, immediately before the `const [view, setView] = useState(...)` line, add:

```javascript
    const ALIAS = { today: 'overview' };
```

Then change the initializer's `return raw;` to `return ALIAS[raw] || raw;`:

```javascript
    const [view, setView] = useState(() => {
      const raw = (location.hash || '').replace('#/', '').replace('#', '') || localStorage.getItem('ap127v2-view') || 'overview';
      if (_sharePreset && !_sharePreset.includes(raw)) return _sharePreset[0];
      return ALIAS[raw] || raw;
    });
```

And in the `onGo` handler (the `ap127-go` listener), apply the alias. It currently is:

```javascript
      const onGo = e => { if (_sharePreset && !_sharePreset.includes(e.detail)) return; setView(e.detail); setMenu(false); };
```

Change to:

```javascript
      const onGo = e => { const v = ALIAS[e.detail] || e.detail; if (_sharePreset && !_sharePreset.includes(v)) return; setView(v); setMenu(false); };
```

- [ ] **Step 4: Bump token and verify**

Run: `cd /Users/nugui/AP127_V2 && sed -i '' 's/?v=p50/?v=p51/g' index.html && node --check js/shell.js && echo "shell OK" && grep -c "id: 'today'" js/shell.js`
Expected: `shell OK` then `0` (no Day Glance nav item).

- [ ] **Step 5: Browser check — tab gone, redirect works**

Restart preview, viewport 1440×900, load `#/overview` then `#/today`. Screenshot each; `preview_console_logs` (error).
Expected: sidebar Operations shows only **Ops Analytics · Aircraft Status** (no Day Glance). Navigating to `#/today` lands on the combined Home (the alias resolves it to `overview`; URL/state becomes `overview`). Zero console errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/shell.js index.html
git commit -m "feat(nav): remove Day Glance tab (folded into Home); redirect #/today -> Home

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Operations nav line**

In `README.md`, the navigation block line currently reads:

```
OPERATIONS    Day Glance ✈ · Ops Analytics ◫ · Aircraft Status ✦
```

Change to:

```
OPERATIONS    Ops Analytics ◫ · Aircraft Status ✦
```

- [ ] **Step 2: Update the HOME line and the explanatory paragraph**

Change the `HOME ◎` line to note the merge:

```
HOME ◎        combined landing — operational day snapshot (Day Glance) + cohort-progress digest
```

And append this sentence to the paragraph that follows the nav block (after the existing "still resolve for bookmarks." sentence):

```
**Day Glance** is now folded into **Home**: the landing page carries the single-day operational
dashboard (schedule pulse, status mix, batch/instructor/fleet load, AP-127 spotlight) above the
cohort-progress digest, with a date picker. `#/today` redirects to Home.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nugui/AP127_V2
git add README.md
git commit -m "docs: Day Glance folded into Home

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Regression pass, push, update PR

**Files:** none (verification + push)

- [ ] **Step 1: Sweep the routes**

Restart preview, viewport 1440×900. Drive each route with `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'<id>'}))` for: `overview`, `schedule`, `analytics`, `aircraft`, `cohort`, `student`, `crosscheck`, `simulation`, `watchdog`. After each, check `preview_console_logs` (error).
Expected: every route mounts; **zero console errors**. `overview` shows the full combined Home.

- [ ] **Step 2: Confirm Schedule is untouched**

Drive to `schedule`, click through Day/Gantt/Week/Month/Roster.
Expected: unchanged from before this work.

- [ ] **Step 3: Screenshot the combined Home as the "after"**

`preview_screenshot` of `#/overview` at 1440×900. Save as `docs/superpowers/plans/_after-combined-home.png` (or attach to the PR).

- [ ] **Step 4: Push (updates PR #2)**

```bash
cd /Users/nugui/AP127_V2
git push origin feat/unified-schedule
```

Expected: push succeeds; PR #2 picks up the new commits; Cloudflare Pages rebuilds the branch preview.

- [ ] **Step 5: Verify the Pages preview**

Open `https://feat-unified-schedule.ap127-ngt2.pages.dev/#/overview` (give Pages ~1–2 min to build). Smoke-test the combined Home and the date picker.
Expected: matches local. (Note: the live progress API is CORS-locked to the dashboardr1 origin, so progress numbers fall back to the bundled snapshot on the preview subdomain — pre-existing, not from this change.)

---

## Self-Review (completed during planning)

- **Spec coverage:** combined Home layout (7 sections, Spotlight moved above cohort) → Task 2; merged 8-tile KPI strip → Task 2 Step 1; date picker + TODAY → Task 2 (DateCalendarTrigger + TODAY badge); AP-127 Spotlight kept → Task 1 (kept in `DayGlancePanels`) + rendered via `<DayGlancePanels/>`; Day Glance tab removed + `#/today` redirect → Task 3; reuse via `window.DayGlancePanels` → Task 1; README → Task 4; verification → Tasks 2/3/5. All spec sections covered.
- **Data flow:** `window.useData === useApp` (verified, shared.js:1012), so `d.date` is the picker-driven date and `<DayGlancePanels/>` (reads `useApp().date`) stays in sync with Home's `dayModel`. Ops KPIs all-batches, progress KPIs AP-127, per spec.
- **Type/name consistency:** `DayGlancePanels` defined+exported in Task 1, referenced in Task 2's JSX and registry untouched for it (it's composed, not routed). `OverviewView` is the only routed Home. `today` removed from both nav and registry (Task 3) and aliased to `overview`. KPI helper `kpi(cls,l,v,s,onClick)` signature consistent across all 7 calls.
- **Placeholders:** the only `…KEEP…` markers are in Task 1 Step 1, where they explicitly mean "move the existing `<Section>` JSX verbatim" — a precise move instruction for ~250 lines of unchanged panel markup, not a stub. Every net-new artifact (the full `view-overview.js`, the shell edits, index.html, README) is given as literal code.
- **Out of scope:** Schedule tab, other views, integrity-in-alerts — untouched per spec.

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in this session with checkpoints.
