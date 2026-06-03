/* ============================================================================
 * AP127 V2 revamp — App shell (Phase 1). Grouped sidebar nav + top bar
 * (student lens · date · theme · freshness · conflict badge) + hash routing +
 * mobile. Ported views mount here as they land (Phase 2+). See REVAMP.md §6.
 * ==========================================================================*/
(function () {
  const { useState, useEffect } = React;
  const h = React.createElement;

  // Nav model — groups → views. `ready` flips true as each view is ported.
  const GROUPS = [
    { items: [{ id: 'overview', label: 'Home', icon: '◎', ready: true }] },
    { label: 'Operations', items: [
      { id: 'today', label: 'Day Glance', icon: '✈' }, { id: 'board', label: 'Board', icon: '▤' },
      { id: 'gantt', label: 'Gantt', icon: '▭' }, { id: 'weekly', label: 'Weekly', icon: '▦' },
      { id: 'roster', label: 'Roster', icon: '▥' }, { id: 'calendar', label: 'Calendar', icon: '▦' },
    ] },
    { label: 'Planning', items: [
      { id: 'autoslotfinder', label: 'Auto Slot Finder', icon: '⚡' },
    ] },
    { label: 'Progress', items: [
      { id: 'cohort', label: 'AP127 Detail', icon: '▰' }, { id: 'analytics', label: 'Ops Analytics', icon: '◫' },
      { id: 'student', label: 'Student Lens', icon: '👤' },
    ] },
    { label: 'Training Program', items: [
      { id: 'plans', label: 'Progress Detail', icon: '▤' },
      { id: 'performance', label: "School Perf.", icon: '◷' },
      { id: 'simulation', label: 'Simulation', icon: '◈' },
    ] },
    { label: 'Integrity', items: [{ id: 'crosscheck', label: 'Cross-Check', icon: '⇄' }] },
    { label: 'Help', items: [{ id: 'tutorial', label: 'User Guide', icon: '?' }] },
  ];
  const ALL_VIEWS = GROUPS.flatMap(g => g.items);
  const LABEL = Object.fromEntries(ALL_VIEWS.map(v => [v.id, v.label]));

  function FreshnessDot({ kind, fresh }) {
    const cls = fresh.source === 'live' ? 'live' : fresh.at ? 'snap' : 'err';
    const col = cls === 'live' ? 'var(--col-done)' : cls === 'snap' ? 'var(--col-pending)' : 'var(--col-cancel)';
    let label = '—'; if (fresh.at) { try { label = new Date(fresh.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + new Date(fresh.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); } catch { label = String(fresh.at); } }
    return h('div', { className: 'mono', title: kind + ' feed', style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--ink-3)' } },
      h('span', { style: { width: 7, height: 7, borderRadius: 999, background: col, boxShadow: cls !== 'err' ? `0 0 6px ${col}` : 'none' } }),
      h('span', { className: 'uc' }, kind), h('b', { style: { color: 'var(--ink-2)', fontWeight: 500 } }, label));
  }

  function TopBar({ view, mobile, onMenu }) {
    const d = window.useData();
    const t = d.reconciliation.totals;
    const conf = t.conflict, integrity = (t.conflict || 0) + (t.review || 0);
    return h('header', { style: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 12px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' } },
      h('button', { onClick: onMenu, title: mobile ? 'Menu' : 'Collapse / expand sidebar', style: { background: 'none', border: 'none', color: 'var(--ink-2)', fontSize: 19, cursor: 'pointer', lineHeight: 1, padding: '2px 4px' } }, '☰'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { width: 9, height: 9, borderRadius: 999, background: 'var(--col-done)', boxShadow: '0 0 8px var(--col-done)', animation: 'pulse 2.4s ease-in-out infinite' } }),
        h('span', { className: 'head', style: { fontWeight: 700, fontSize: 18, letterSpacing: 1 } }, 'AP', h('b', { style: { color: 'var(--highlight)' } }, '127')),
        !mobile && h('span', { className: 'mono', style: { fontSize: 9, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 5px' } }, 'V2')),
      !mobile && h('span', { className: 'mono uc', style: { fontSize: 11, color: 'var(--highlight)', fontWeight: 600 } }, LABEL[view] || view),
      h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 } },
        !mobile && h(FreshnessDot, { kind: 'PROG', fresh: d.freshness.progress }),
        !mobile && h(FreshnessDot, { kind: 'OPS', fresh: d.freshness.ops }),
        h('button', { className: 'chip', onClick: () => d.go('crosscheck'), title: `Cross-Check · ${t.conflict || 0} conflict · ${t.review || 0} to review`, style: { display: 'flex', alignItems: 'center', gap: 6 } },
          '⇄', h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: '#fff', background: conf ? 'var(--col-cancel)' : integrity ? 'var(--col-pending)' : 'var(--col-done)', borderRadius: 999, padding: '1px 6px', minWidth: 16, textAlign: 'center' } }, integrity || 0)),
        ['cockpit', 'light', 'warm'].map(th => h('button', { key: th, onClick: () => d.setTweak('theme', th), title: th + ' theme', className: 'chip' + (d.tweaks.theme === th ? ' sel' : ''), style: { padding: '4px 7px' } }, th[0].toUpperCase())),
        h('button', { className: 'chip', title: 'Reload from server', onClick: () => window.location.reload(true) }, '⟳')));
  }

  function Sidebar({ view, mobile, collapsed, onClose }) {
    const d = window.useData();
    const t = (d.reconciliation && d.reconciliation.totals) || {};
    const integrityFlag = ((t.conflict || 0) + (t.review || 0)) > 0;   // amber dot on Cross-Check
    const rail = collapsed && !mobile;                                  // icon-only rail
    const Item = v => {
      const active = view === v.id;
      const flag = v.id === 'crosscheck' && integrityFlag;
      return h('button', { key: v.id, onClick: () => { d.go(v.id); if (onClose) onClose(); }, title: rail ? v.label : '', className: 'mono uc',
        style: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 10, padding: rail ? '9px 0' : '8px 12px', borderRadius: 6, cursor: 'pointer', textAlign: 'left', border: `1px solid ${active ? 'var(--highlight)' : 'transparent'}`,
          background: active ? 'color-mix(in oklch,var(--highlight) 14%,var(--surface))' : 'transparent', color: active ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: active ? 600 : 400, fontSize: 10.5, width: '100%' } },
        h('span', { style: { width: rail ? 'auto' : 19, fontSize: 17, lineHeight: 1, textAlign: 'center', position: 'relative' } }, v.icon,
          flag && rail && h('span', { style: { position: 'absolute', top: -3, right: -4, width: 7, height: 7, borderRadius: 999, background: 'var(--col-pending)', boxShadow: '0 0 6px var(--col-pending)' } })),
        !rail && v.label,
        !rail && flag && h('span', { title: `${t.conflict || 0} conflict · ${t.review || 0} review`, style: { marginLeft: 'auto', width: 8, height: 8, borderRadius: 999, background: 'var(--col-pending)', boxShadow: '0 0 6px var(--col-pending)' } }));
    };
    return h('div', { style: { width: rail ? 58 : 224, flexShrink: 0, background: 'var(--bg-2)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', height: mobile ? '100vh' : '100%', position: mobile ? 'fixed' : 'relative', top: 0, left: 0, zIndex: mobile ? 200 : 'auto', boxShadow: mobile ? '6px 0 24px oklch(0 0 0 / 0.45)' : 'none', overflowY: 'auto', transition: 'width .15s ease' } },
      mobile && h('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('span', { className: 'head', style: { fontWeight: 700 } }, 'AP127 V2'), h('button', { onClick: onClose, style: { background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 18, cursor: 'pointer' } }, '✕')),
      h('nav', { style: { padding: rail ? '8px 6px' : 8, display: 'flex', flexDirection: 'column', gap: 2 } },
        GROUPS.map((g, gi) => h('div', { key: gi, style: { marginTop: g.label ? 10 : 0 } },
          g.label && !rail && h('div', { className: 'mono uc', style: { fontSize: 8, color: 'var(--ink-3)', padding: '2px 12px 4px', letterSpacing: '0.1em' } }, g.label),
          g.label && rail && gi > 0 && h('div', { style: { height: 1, background: 'var(--line)', margin: '6px 6px' } }),
          g.items.map(Item)))));
  }

  function Placeholder({ view }) {
    return h('div', { style: { padding: 24, overflow: 'auto', height: '100%' } },
      h('div', { className: 'panel', style: { maxWidth: 640, margin: '40px auto' } },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, LABEL[view] || view), h('span', { className: 'ps' }, 'revamp in progress')),
        h('div', { className: 'pb' },
          h('p', { style: { fontSize: 13, lineHeight: 1.6 } }, `No view is registered for “${view}”. Pick a destination from the sidebar, or open the `,
            h('a', { className: 'link', href: 'legacy.html', target: '_top' }, 'v1 dashboard'), '.'),
          h('p', { className: 'muted', style: { fontSize: 11, marginTop: 10 } }, 'If you reached this from a bookmark, the route may have been renamed in the unified app.'))));
  }

  // Student Lens — the unifying view: one student's Operations schedule linked to
  // their Progress curriculum (neither original app connected these). See REVAMP.md §5.
  function StudentLensView() {
    const d = window.useData();
    const { useState: useSlQ } = React;
    const [q, setQ] = useSlQ('');
    const s = d.studentLens;

    // No student selected — show inline picker
    if (!s) {
      const matches = q
        ? d.students.filter(st => (st.name + ' ' + (st.nick || '')).toLowerCase().includes(q.toLowerCase()))
        : d.students;
      return h('div', { style: { padding: 20, overflow: 'auto', height: '100%' } },
        h('div', { className: 'panel', style: { maxWidth: 520, margin: '0 auto' } },
          h('div', { className: 'ph' },
            h('span', { className: 'pt' }, '👤 Student Lens'),
            h('span', { className: 'ps' }, 'Pick a student to view unified schedule + progress')),
          h('div', { className: 'pb' },
            h('input', { autoFocus: true, value: q, onChange: e => setQ(e.target.value),
              placeholder: 'Search by name or callsign…',
              style: { width: '100%', background: 'var(--bg-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none', marginBottom: 8 } }),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
              matches.map((st, i) => h('button', { key: i, onClick: () => d.setStudentLens(st),
                style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 5, cursor: 'pointer', textAlign: 'left', background: 'transparent', border: '1px solid var(--line-soft)', color: 'inherit', width: '100%', transition: 'background .1s' },
                onMouseEnter: e => { e.currentTarget.style.background = 'color-mix(in oklch,var(--highlight) 8%,transparent)'; },
                onMouseLeave: e => { e.currentTarget.style.background = 'transparent'; },
              },
                h('span', { className: 'mono', style: { color: 'var(--highlight)', fontWeight: 700, fontSize: 12, minWidth: 64 } }, st.nick || '—'),
                h('span', { style: { flex: 1, fontSize: 13, color: 'var(--ink)' } }, st.name),
                h('span', { className: 'muted mono', style: { fontSize: 10 } }, `${st.done || 0}/${st.total || 101} · ${(st.pct || 0).toFixed(0)}%`))),
              !matches.length && h('div', { className: 'empty' }, 'No matches')))));
    }

    const fd = ds => { if (!ds) return '—'; try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return ds; } };
    const hm = m => m ? Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '') : '—';
    // This student's Operations flights (match progress name → ops "FIRST L." key)
    const key = window.AP127Reconcile.ccKeyFromFull(s.name);
    const opsFlights = d.FLIGHTS.filter(f => window.AP127Reconcile.ccNameNorm(f.student) === key).sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
    const flown = (s.flown || []).slice().reverse();
    const planned = (s.planned || []).slice(0, 12);
    const SC = { Completed: 'var(--col-done)', Pending: 'var(--col-pending)', Canceled: 'var(--col-cancel)' };
    const listPanel = (title, sub, children) => h('div', { className: 'panel' }, h('div', { className: 'ph' }, h('span', { className: 'pt' }, title), h('span', { className: 'ps' }, sub)), h('div', { style: { overflow: 'auto', maxHeight: 380 } }, children));
    const rowsOrEmpty = (arr, fn, empty) => arr.length ? arr.map(fn) : h('div', { className: 'empty' }, empty);

    return h('div', { style: { padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' } },
      h('div', { className: 'panel' }, h('div', { className: 'ph' },
          h('span', { className: 'pt' }, 'Student Lens · ' + s.nick),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { className: 'ps' }, s.name + ' · ' + (s.catc_id || '')),
            h('button', { className: 'chip', onClick: () => d.setStudentLens(null), title: 'Pick a different student' }, '↺ Change'))),
        h('div', { className: 'pb' }, h('div', { className: 'kpis' },
          h('div', { className: 'kpi acc' }, h('div', { className: 'kl' }, 'Progress'), h('div', { className: 'kv' }, (s.pct || 0).toFixed(0) + '%'), h('div', { className: 'ks' }, `${s.done}/${s.total} lessons`)),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Next Lesson'), h('div', { className: 'kv', style: { fontSize: 20 } }, s.next_lesson || '—'), h('div', { className: 'ks' }, 'up next')),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Instructor'), h('div', { className: 'kv', style: { fontSize: 16 } }, (d.FI_FULL[s.fi] || s.fi || '—')), h('div', { className: 'ks' }, 'assigned FI')),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Aircraft'), h('div', { className: 'kv', style: { fontSize: 18 } }, s.se || '—'), h('div', { className: 'ks' }, 'SE type')),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Ops Flights'), h('div', { className: 'kv' }, opsFlights.length), h('div', { className: 'ks' }, 'in schedule feed')),
        ))),
      h('div', { style: { display: 'grid', gridTemplateColumns: d.isMobile ? '1fr' : '1.2fr 1fr 1fr', gap: 14 } },
        listPanel('Operations Schedule', 'from flight ops', h('table', { className: 'tb' },
          h('thead', null, h('tr', null, h('th', null, 'Date'), h('th', null, 'Lesson'), h('th', null, 'FI'), h('th', null, 'Status'))),
          h('tbody', null, rowsOrEmpty(opsFlights.slice(0, 40), (f, i) => h('tr', { key: i, onClick: () => d.setDrawer(f.id), style: { cursor: 'pointer' } },
            h('td', { className: 'mono' }, fd(f.date), ' ', h('span', { className: 'muted', style: { fontSize: 9 } }, f.start || '')),
            h('td', { className: 'mono' }, f.lesson || '—'),
            h('td', { className: 'muted mono', style: { fontSize: 9 } }, f.instructor || ''),
            h('td', null, h('span', { className: 'pill', style: { background: `color-mix(in oklch,${SC[f.status] || 'var(--ink-3)'} 16%,transparent)`, color: SC[f.status] || 'var(--ink-3)' } }, (f.status || '').slice(0, 4)))),
            'No operations flights found for this student')))),
        listPanel('Completed (Progress)', flown.length + ' flown', h('div', { style: { padding: 10 } },
          rowsOrEmpty(flown.slice(0, 30), (f, i) => h('div', { key: i, style: { display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 11 } },
            h('span', { className: 'mono muted', style: { width: 56, fontSize: 9 } }, fd(f.date)), h('span', { className: 'mono', style: { flex: 1 } }, f.lesson || '—'), h('span', { className: 'muted', style: { fontSize: 10 } }, hm(f.actual_mins))),
            'No completed flights'))),
        listPanel('Upcoming Plan', 'curriculum', h('div', { style: { padding: 10 } },
          rowsOrEmpty(planned, (p, i) => h('div', { key: i, style: { display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 11 } },
            h('span', { className: 'mono muted', style: { width: 56, fontSize: 9 } }, fd(p.date)), h('span', { className: 'mono', style: { flex: 1 } }, p.lesson || '—'), h('span', { className: 'muted', style: { fontSize: 10 } }, hm(p.mins || p.planned_mins))),
            'No planned flights')))));
  }

  // Maps view id → component. Resolved at render time (after all view scripts load).
  // Ops views come from the reused Command Center files (window.*Board).
  function registry() {
    return {
      today: window.DailyBoard, board: window.OpsBoard, gantt: window.GanttBoard,
      weekly: window.WeeklyBoard, roster: window.RosterBoard, calendar: window.CalendarBoard,
      autoslotfinder: window.AutoSlotFinderBoard,
      analytics: window.SummaryBoard,
      cohort: window.CohortView,
      plans: window.ProgressDetailView,
      performance: window.SchoolPerformanceView,
      simulation: window.SimulationView,
      crosscheck: window.CrossCheckView,
      tutorial: window.TutorialView,
    };
  }

  function Shell() {
    const d = window.useData();
    const [view, setView] = useState(() => (location.hash || '').replace('#/', '').replace('#', '') || localStorage.getItem('ap127v2-view') || 'overview');
    const [menu, setMenu] = useState(false);
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ap127v2-collapsed') === '1');
    const mobile = d.isMobile;
    useEffect(() => {
      const onGo = e => { setView(e.detail); setMenu(false); };
      window.addEventListener('ap127-go', onGo); return () => window.removeEventListener('ap127-go', onGo);
    }, []);
    useEffect(() => { localStorage.setItem('ap127v2-view', view); try { history.replaceState(null, '', '#/' + view); } catch (e) {} }, [view]);
    useEffect(() => { localStorage.setItem('ap127v2-collapsed', collapsed ? '1' : '0'); }, [collapsed]);
    // Burger: mobile opens the drawer; desktop toggles the icon-rail collapse.
    const onBurger = () => mobile ? setMenu(m => !m) : setCollapsed(c => !c);

    const reg = registry();
    const Body = (view === 'overview' || view === 'home') ? window.OverviewView
      : view === 'student' ? StudentLensView
      : reg[view] ? reg[view]
      : null;

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h(TopBar, { view, mobile, onMenu: onBurger }),
      window.Drawer && h(window.Drawer),
      h('div', { style: { flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' } },
        !mobile && h(Sidebar, { view, collapsed }),
        mobile && menu && h('div', null, h('div', { onClick: () => setMenu(false), style: { position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.5)', zIndex: 199 } }), h(Sidebar, { view, mobile: true, onClose: () => setMenu(false) })),
        h('div', { style: { flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' } }, Body ? h(Body, { view }) : h(Placeholder, { view }))));
  }

  // Top-level App owns theme/tweaks + viewport, wraps everything in the augmented
  // AppProvider (from shared.js) so ops views, progress views and the shell share ONE context.
  function App() {
    const [w, setW] = useState(window.innerWidth), [ht, setHt] = useState(window.innerHeight);
    const [tweaks, setTweakState] = useState(() => ({ theme: localStorage.getItem('ap127-theme') || 'cockpit', showSim: false, showStandby: true, groupBy: 'instructor' }));
    const setTweak = (k, v) => setTweakState(t => ({ ...t, [k]: typeof v === 'function' ? v(t[k]) : v }));
    useEffect(() => { localStorage.setItem('ap127-theme', tweaks.theme); }, [tweaks.theme]);
    useEffect(() => { const f = () => { setW(window.innerWidth); setHt(window.innerHeight); }; window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
    const mobile = w < 768 || (w < 1100 && ht < 560);
    return h(window.AppProvider, { tweaks, setTweak, isMobile: mobile, setView: id => window.dispatchEvent(new CustomEvent('ap127-go', { detail: id })) }, h(Shell));
  }

  window.AP127App = App;
})();
