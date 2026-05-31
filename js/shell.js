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
    { items: [{ id: 'overview', label: 'Overview', icon: '◎', ready: true }] },
    { label: 'Operations', items: [
      { id: 'today', label: 'Today', icon: '✈' }, { id: 'board', label: 'Board', icon: '▤' },
      { id: 'gantt', label: 'Gantt', icon: '▭' }, { id: 'weekly', label: 'Weekly', icon: '▦' },
      { id: 'roster', label: 'Roster', icon: '▥' }, { id: 'calendar', label: 'Calendar', icon: '▦' },
    ] },
    { label: 'Planning', items: [
      { id: 'slotfinder', label: 'Slot Finder', icon: '⌕' }, { id: 'autoslotfinder', label: 'Auto Slot Finder', icon: '⚡' },
    ] },
    { label: 'Progress', items: [
      { id: 'cohort', label: 'AP127 Detail', icon: '▰' }, { id: 'analytics', label: 'Ops Analytics', icon: '◫' },
    ] },
    { label: 'Training Program', items: [
      { id: 'program', label: 'All Batches', icon: '◴' },
      { id: 'performance', label: "School Perf.", icon: '◷' },
      { id: 'simulation', label: 'Simulation', icon: '◈' },
    ] },
    { label: 'Integrity', items: [{ id: 'crosscheck', label: 'Cross-Check', icon: '⇄' }] },
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

  function StudentLens() {
    const d = window.useData();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const cur = d.studentLens;
    const matches = q ? d.students.filter(s => (s.name + ' ' + s.nick).toLowerCase().includes(q.toLowerCase())).slice(0, 8) : d.students.slice(0, 8);
    return h('div', { style: { position: 'relative' } },
      h('button', { className: 'chip' + (cur ? ' sel' : ''), onClick: () => setOpen(o => !o), title: 'Focus a single student across all views' },
        cur ? `👤 ${cur.nick} ✕` : '👤 Student Lens ▾'),
      cur && h('span', { onClick: () => d.setStudentLens(null), style: { display: 'none' } }),
      open && h('div', { style: { position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 80, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, width: 240, boxShadow: 'var(--shadow)' } },
        h('input', { autoFocus: true, value: q, onChange: e => setQ(e.target.value), placeholder: 'search student…', style: { width: '100%', background: 'var(--bg-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 5, padding: '5px 8px', fontSize: 11, outline: 'none', marginBottom: 6 } }),
        cur && h('div', { className: 'chip', style: { marginBottom: 6, textAlign: 'center' }, onClick: () => { d.setStudentLens(null); setOpen(false); } }, 'Clear lens'),
        matches.map((s, i) => h('div', { key: i, onClick: () => { d.setStudentLens(s); setOpen(false); d.go('student'); }, className: 'mono', style: { padding: '6px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', justifyContent: 'space-between' } },
          h('span', { style: { color: 'var(--highlight)' } }, s.nick), h('span', { className: 'muted' }, s.name.split(' ')[0]))),
        !matches.length && h('div', { className: 'empty' }, 'no match')));
  }

  function TopBar({ view, mobile, onMenu }) {
    const d = window.useData();
    const conf = d.reconciliation.totals.conflict;
    return h('header', { style: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 12px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' } },
      mobile && h('button', { onClick: onMenu, style: { background: 'none', border: 'none', color: 'var(--ink)', fontSize: 20, cursor: 'pointer' } }, '☰'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { width: 9, height: 9, borderRadius: 999, background: 'var(--col-done)', boxShadow: '0 0 8px var(--col-done)', animation: 'pulse 2.4s ease-in-out infinite' } }),
        h('span', { className: 'head', style: { fontWeight: 700, fontSize: 18, letterSpacing: 1 } }, 'AP', h('b', { style: { color: 'var(--highlight)' } }, '127')),
        !mobile && h('span', { className: 'mono', style: { fontSize: 9, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 5px' } }, 'V2')),
      !mobile && h('span', { className: 'mono uc', style: { fontSize: 11, color: 'var(--highlight)', fontWeight: 600 } }, LABEL[view] || view),
      h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 } },
        h(StudentLens),
        !mobile && h(FreshnessDot, { kind: 'PROG', fresh: d.freshness.progress }),
        !mobile && h(FreshnessDot, { kind: 'OPS', fresh: d.freshness.ops }),
        h('button', { className: 'chip', onClick: () => d.go('crosscheck'), title: 'Data conflicts', style: { display: 'flex', alignItems: 'center', gap: 6 } },
          '⇄', h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, color: '#fff', background: conf ? 'var(--col-cancel)' : 'var(--col-done)', borderRadius: 999, padding: '1px 6px', minWidth: 16, textAlign: 'center' } }, conf)),
        ['cockpit', 'light', 'warm'].map(th => h('button', { key: th, onClick: () => d.setTweak('theme', th), title: th + ' theme', className: 'chip' + (d.tweaks.theme === th ? ' sel' : ''), style: { padding: '4px 7px' } }, th[0].toUpperCase())),
        h('button', { className: 'chip', title: 'Reload from server', onClick: () => window.location.reload(true) }, '⟳')));
  }

  function Sidebar({ view, mobile, onClose }) {
    const d = window.useData();
    const Item = v => h('button', { key: v.id, onClick: () => { d.go(v.id); if (onClose) onClose(); }, title: v.ready === false ? 'Coming in revamp Phase 2+' : '', className: 'mono uc',
      style: { display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 5, cursor: 'pointer', textAlign: 'left', border: `1px solid ${view === v.id ? 'var(--highlight)' : 'transparent'}`,
        background: view === v.id ? 'color-mix(in oklch,var(--highlight) 14%,var(--surface))' : 'transparent', color: view === v.id ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: view === v.id ? 600 : 400, fontSize: 10, opacity: v.ready === false ? 0.55 : 1, width: '100%' } },
      h('span', { style: { width: 14 } }, v.icon), v.label, v.ready === false && h('span', { style: { marginLeft: 'auto', fontSize: 7, color: 'var(--ink-3)' } }, 'SOON'));
    return h('div', { style: { width: 224, flexShrink: 0, background: 'var(--bg-2)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', height: mobile ? '100vh' : '100%', position: mobile ? 'fixed' : 'relative', top: 0, left: 0, zIndex: mobile ? 200 : 'auto', boxShadow: mobile ? '6px 0 24px oklch(0 0 0 / 0.45)' : 'none', overflowY: 'auto' } },
      mobile && h('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('span', { className: 'head', style: { fontWeight: 700 } }, 'AP127 V2'), h('button', { onClick: onClose, style: { background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 18, cursor: 'pointer' } }, '✕')),
      h('nav', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 2 } },
        GROUPS.map((g, gi) => h('div', { key: gi, style: { marginTop: g.label ? 10 : 0 } },
          g.label && h('div', { className: 'mono uc', style: { fontSize: 8, color: 'var(--ink-3)', padding: '2px 12px 4px', letterSpacing: '0.1em' } }, g.label),
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
    const s = d.studentLens;
    if (!s) return h('div', { style: { padding: 24 } }, h('div', { className: 'empty' }, 'Pick a student from the Student Lens (top bar) to see their unified schedule + progress.'));
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
          h('span', { className: 'pt' }, 'Student Lens · ' + s.nick), h('span', { className: 'ps' }, s.name + ' · ' + (s.catc_id || ''))),
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
      slotfinder: window.SlotFinderBoard, autoslotfinder: window.AutoSlotFinderBoard,
      analytics: window.SummaryBoard,
      cohort: window.CohortView,
      program: window.ProgramOverviewView,
      performance: window.SchoolPerformanceView,
      simulation: window.SimulationView,
      crosscheck: window.CrossCheckView,
    };
  }

  function Shell() {
    const d = window.useData();
    const [view, setView] = useState(() => (location.hash || '').replace('#/', '').replace('#', '') || localStorage.getItem('ap127v2-view') || 'overview');
    const [menu, setMenu] = useState(false);
    const mobile = d.isMobile;
    useEffect(() => {
      const onGo = e => { setView(e.detail); setMenu(false); };
      window.addEventListener('ap127-go', onGo); return () => window.removeEventListener('ap127-go', onGo);
    }, []);
    useEffect(() => { localStorage.setItem('ap127v2-view', view); try { history.replaceState(null, '', '#/' + view); } catch (e) {} }, [view]);

    const reg = registry();
    const Body = (view === 'overview' || view === 'home') ? window.OverviewView
      : view === 'student' ? StudentLensView
      : reg[view] ? reg[view]
      : null;

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      h(TopBar, { view, mobile, onMenu: () => setMenu(m => !m) }),
      window.Drawer && h(window.Drawer),
      h('div', { style: { flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' } },
        !mobile && h(Sidebar, { view }),
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
