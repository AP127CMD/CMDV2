/* AP127 V2 — Unified Schedule shell. One screen, switch layout mode.
 * Each layout is an existing board (window.OpsBoard / GanttBoard / WeeklyBoard /
 * CalendarBoard / RosterBoard). They all read the SAME useData()/useApp() context,
 * so filter/date/focus state persists across a layout switch automatically. */
(function () {
  const { useState, useEffect, useMemo } = React;
  const h = React.createElement;

  // ── Batch-type classification ──────────────────────────────────────────────
  // Maps a raw batch string to one of the quick-filter type keys.
  const toBatchType = b => {
    if (!b) return 'OTHER';
    if (/^AP-/i.test(b))   return 'AP';
    if (/^HP-/i.test(b))   return 'HP';
    if (/^PPL/i.test(b))   return 'PPL';
    if (/^TCAR/i.test(b))  return 'TCAR';
    if (/^MEP/i.test(b))   return 'MEP';
    return 'OTHER';
  };

  // Ordered list of types shown as chips (left to right)
  const TYPE_ORDER = ['AP', 'HP', 'PPL', 'TCAR', 'MEP', 'OTHER'];

  // mode id -> { label, getComponent }. Resolved at render time (after boards load).
  const MODES = [
    { id: 'day',    label: 'Day',    get: () => window.OpsBoard },
    { id: 'gantt',  label: 'Gantt',  get: () => window.GanttBoard },
    { id: 'week',   label: 'Week',   get: () => window.WeeklyBoard },
    { id: 'month',  label: 'Month',  get: () => window.CalendarBoard },
    { id: 'roster', label: 'Roster', get: () => window.RosterBoard },
  ];

  function ScheduleView() {
    const app = window.useData ? window.useData() : null;

    const [mode, setMode] = useState(() => {
      try { return localStorage.getItem('ap127v2-schedule-mode') || 'day'; }
      catch (e) { return 'day'; }
    });
    const pick = MODES.find(m => m.id === mode) || MODES[0];
    const Body = pick.get();
    const go = id => { setMode(id); try { localStorage.setItem('ap127v2-schedule-mode', id); } catch (e) {} };

    // ── Batch-type quick filter ────────────────────────────────────────────
    // Persisted; default = only AP on.
    const [selTypes, setSelTypes] = useState(() => {
      try {
        const s = localStorage.getItem('ap127v2-batch-types');
        return s ? new Set(JSON.parse(s)) : new Set(['AP']);
      } catch (e) { return new Set(['AP']); }
    });

    // Which types actually exist in the dataset
    const availTypes = useMemo(() => {
      const present = new Set((window.FLIGHTS || []).map(f => toBatchType(f.batch)));
      return TYPE_ORDER.filter(t => present.has(t));
    }, []);

    // Sync selected types → app.filters.batches
    useEffect(() => {
      if (!app || !app.setFilters) return;
      // All or none selected → clear batch filter (show everything)
      if (selTypes.size === 0 || selTypes.size >= availTypes.length) {
        app.setFilters(f => ({ ...f, batches: null }));
      } else {
        const matched = [...new Set(
          (window.FLIGHTS || []).map(f => f.batch).filter(b => b && selTypes.has(toBatchType(b)))
        )].sort();
        app.setFilters(f => ({ ...f, batches: matched.length ? matched : null }));
      }
      try { localStorage.setItem('ap127v2-batch-types', JSON.stringify([...selTypes])); } catch (e) {}
    }, [selTypes]);  // intentionally omit app/availTypes to avoid loops

    const toggleType = t => setSelTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) { next.delete(t); } else { next.add(t); }
      return next;
    });

    // ── Chips ──────────────────────────────────────────────────────────────
    const modeChip = m => h('button', {
      key: m.id, onClick: () => go(m.id), className: 'mono uc',
      style: {
        fontSize: 10, padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
        border: '1px solid ' + (mode === m.id ? 'var(--highlight)' : 'var(--line)'),
        background: mode === m.id ? 'color-mix(in oklch,var(--highlight) 12%,transparent)' : 'transparent',
        color: mode === m.id ? 'var(--highlight)' : 'var(--ink-2)',
        transition: 'all .12s',
      },
    }, m.label);

    const typeChip = t => h('button', {
      key: t, onClick: () => toggleType(t), className: 'mono uc',
      style: {
        fontSize: 9, padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
        border: '1px solid ' + (selTypes.has(t) ? 'var(--ink-2)' : 'var(--line)'),
        background: selTypes.has(t) ? 'color-mix(in oklch,var(--ink-2) 14%,var(--surface))' : 'transparent',
        color: selTypes.has(t) ? 'var(--ink)' : 'var(--ink-3)',
        fontWeight: selTypes.has(t) ? 600 : 400,
        transition: 'all .12s',
      },
    }, t);

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      // Layout chips row
      h('div', {
        style: {
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          padding: '6px 10px', borderBottom: '1px solid var(--line)',
          background: 'var(--bg-2)', flexShrink: 0,
        },
      },
        h('span', { className: 'mono uc', style: { fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em', marginRight: 4 } }, 'LAYOUT'),
        MODES.map(modeChip)),
      // Batch-type filter row
      h('div', {
        style: {
          display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap',
          padding: '5px 10px', borderBottom: '1px solid var(--line-soft)',
          background: 'var(--bg-2)', flexShrink: 0,
        },
      },
        h('span', { className: 'mono uc', style: { fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.08em', marginRight: 4 } }, 'TYPE'),
        availTypes.map(typeChip),
        h('button', {
          className: 'mono uc',
          onClick: () => setSelTypes(new Set(availTypes.length ? [] : availTypes)),
          style: {
            marginLeft: 6, fontSize: 9, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
            border: '1px solid var(--line)', background: 'transparent',
            color: 'var(--ink-3)', transition: 'all .12s',
          },
        }, selTypes.size === 0 || selTypes.size >= availTypes.length ? 'AP ONLY' : 'ALL')),
      // Board content
      h('div', { style: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' } },
        Body ? h(Body) : h('div', { className: 'mono uc', style: { padding: 20, color: 'var(--ink-3)', fontSize: 11 } }, 'Layout unavailable')));
  }

  window.ScheduleView = ScheduleView;
})();
