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
