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
      { id: 'performance', label: "School Perf.", icon: '◷' },
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
  ];
  const ALL_VIEWS = GROUPS.flatMap(g => g.items);
  const LABEL = Object.fromEntries(ALL_VIEWS.map(v => [v.id, v.label]));

  // Share presets — map ?g=<key> to an array of allowed view IDs.
  // Main site (no ?g= param) always shows all tabs unchanged.
  const SHARE_PRESETS = {
    // students: Home + Progress + Training Program + Help
    students: ['overview', 'cohort', 'student', 'plans', 'tutorial'],
    // instructors: Home + Operations + Planning + Progress + Help
    instructors: ['overview', 'today', 'board', 'gantt', 'weekly', 'roster', 'calendar', 'aircraft', 'autoslotfinder', 'cohort', 'analytics', 'student', 'tutorial'],
  };
  const _shareParam = new URLSearchParams(location.search).get('g') || '';
  const _sharePreset = _shareParam ? (SHARE_PRESETS[_shareParam.toLowerCase()] || null) : null;

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
          background: active ? 'color-mix(in oklch,var(--highlight) 14%,var(--surface))' : 'transparent', color: active ? 'var(--highlight)' : 'var(--ink-2)', fontWeight: active ? 600 : 500, fontSize: 10.5, width: '100%' } },
        h('span', { style: { width: rail ? 'auto' : 19, fontSize: 17, lineHeight: 1, textAlign: 'center', position: 'relative' } }, v.icon,
          flag && rail && h('span', { style: { position: 'absolute', top: -3, right: -4, width: 7, height: 7, borderRadius: 999, background: 'var(--col-pending)', boxShadow: '0 0 6px var(--col-pending)' } })),
        !rail && v.label,
        !rail && flag && h('span', { title: `${t.conflict || 0} conflict · ${t.review || 0} review`, style: { marginLeft: 'auto', width: 8, height: 8, borderRadius: 999, background: 'var(--col-pending)', boxShadow: '0 0 6px var(--col-pending)' } }));
    };
    return h('div', { style: { width: rail ? 58 : 224, flexShrink: 0, background: 'var(--bg-2)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', height: mobile ? '100vh' : '100%', position: mobile ? 'fixed' : 'relative', top: 0, left: 0, zIndex: mobile ? 200 : 'auto', boxShadow: mobile ? '6px 0 24px oklch(0 0 0 / 0.45)' : 'none', overflowY: 'auto', transition: 'width .15s ease' } },
      mobile && h('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('span', { className: 'head', style: { fontWeight: 700 } }, 'AP127 V2'), h('button', { onClick: onClose, style: { background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 18, cursor: 'pointer' } }, '✕')),
      // Mobile-only: surface the PROG/OPS data freshness (SYNC times) hidden from the top bar on small screens.
      mobile && h('div', { style: { padding: '8px 16px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { className: 'mono uc', style: { fontSize: 8, color: 'var(--ink-3)', letterSpacing: '0.1em' } }, 'DATA FRESHNESS'),
        h(FreshnessDot, { kind: 'PROG', fresh: d.freshness.progress }),
        h(FreshnessDot, { kind: 'OPS', fresh: d.freshness.ops })),
      h('nav', { style: { padding: rail ? '8px 6px' : 8, display: 'flex', flexDirection: 'column', gap: 2 } },
        (_sharePreset ? GROUPS.map(g => ({ ...g, items: g.items.filter(i => _sharePreset.includes(i.id)) })).filter(g => g.items.length > 0) : GROUPS)
        .map((g, gi) => h('div', { key: gi, style: { marginTop: g.label ? 10 : 0 } },
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

  // Resolve a CSS custom property to its computed colour string (Chart.js can't
  // read var(--…) directly). Falls back if unavailable.
  function cssVar(name, fallback) {
    try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; } catch (e) { return fallback; }
  }

  // Per-student progress chart: the student's Actual vs Plan vs forward Projection,
  // overlaid with the batch-average curve and the most-advanced SP — so a student
  // sees where they stand against the cohort and the leader. Presentational only;
  // the comparison series are computed in StudentLensView and passed in.
  function StudentProgressChart({ student, curriculum, today, etcDate, mobile, batchAvg, leader, leaderNick }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const ctx = ref.current; if (!ctx || !window.Chart) return;
      try { const ex = window.Chart.getChart(ctx); if (ex) ex.destroy(); } catch (e) {}
      const ink2 = cssVar('--ink-2', '#8b949e'), ink3 = cssVar('--ink-3', '#6e7681'), line = cssVar('--line', '#21262d');
      const accent = cssVar('--highlight', '#e88aff'), done = cssVar('--col-done', '#7acf7e'), pend = cssVar('--col-pending', '#e9bd63');
      const flown = (student.flown || []).filter(f => f.date).slice().sort((a, b) => a.date.localeCompare(b.date));
      let acc = 0; const actual = flown.map(f => ({ x: f.date, y: ++acc }));
      const planDates = (curriculum || []).filter(c => c.planned_date).slice().sort((a, b) => a.planned_date.localeCompare(b.planned_date));
      let pacc = 0; const plan = planDates.map(c => ({ x: c.planned_date, y: ++pacc }));
      const total = student.total || (curriculum || []).length || 101;
      const doneN = student.done || actual.length || 0;
      // Forward projection: today's standing → ETC at current pace.
      const projection = (etcDate && etcDate > today) ? [{ x: today, y: doneN }, { x: etcDate, y: total }] : [];
      const ds = [
        { label: 'Plan', data: plan, borderColor: ink3, borderDash: [6, 4], borderWidth: 1.4, pointRadius: 0, tension: 0, order: 5 },
        { label: 'Batch avg', data: batchAvg || [], borderColor: ink2, borderWidth: 1.4, pointRadius: 0, tension: .25, order: 4 },
      ];
      if (leader && leader.length) ds.push({ label: 'Leader' + (leaderNick ? ' · ' + leaderNick : ''), data: leader, borderColor: done, borderWidth: 1.4, borderDash: [2, 3], pointRadius: 0, tension: 0, order: 3 });
      if (projection.length) ds.push({ label: 'Projection', data: projection, borderColor: pend, borderWidth: 2, borderDash: [3, 3], pointRadius: 3, pointStyle: 'rectRot', tension: 0, order: 2 });
      ds.push({ label: 'You', data: actual, borderColor: accent, backgroundColor: accent + '22', borderWidth: 2.6, pointRadius: mobile ? 0 : 2, pointHoverRadius: 4, tension: 0, fill: false, order: 1 });
      let chart;
      try {
        chart = new window.Chart(ctx, {
          type: 'line',
          data: { datasets: ds },
          options: {
            responsive: true, maintainAspectRatio: false, parsing: { xAxisKey: 'x', yAxisKey: 'y' },
            interaction: { mode: 'index', intersect: false },
            plugins: { datalabels: { display: false },
              legend: { labels: { color: ink2, usePointStyle: true, pointStyle: 'line', font: { family: 'JetBrains Mono', size: mobile ? 8 : 9 }, boxWidth: 16, padding: mobile ? 6 : 8 } },
              tooltip: { callbacks: { title: c => { const r = c[0]?.raw; try { return r ? new Date(r.x + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : ''; } catch { return r?.x || ''; } },
                label: c => `${c.dataset.label}: ${Math.round(c.raw?.y || 0)} lessons` } } },
            scales: { x: { type: 'time', time: { unit: 'month', displayFormats: { month: 'MMM yy' } }, ticks: { color: ink3, font: { family: 'JetBrains Mono', size: mobile ? 8 : 9 }, maxTicksLimit: mobile ? 5 : 9 }, grid: { color: line } },
              y: { beginAtZero: true, suggestedMax: total, ticks: { color: ink2, font: { family: 'JetBrains Mono', size: mobile ? 8 : 9 }, precision: 0 }, grid: { color: line } } },
          },
        });
      } catch (e) {}
      return () => { try { chart && chart.destroy(); } catch (e) {} };
    }, [student, curriculum, today, etcDate, mobile, batchAvg, leader, leaderNick]);
    return h('div', { style: { position: 'relative', height: mobile ? 220 : 290 } }, h('canvas', { ref }));
  }

  // Combined, sortable OPS+PROG table for one student. One row per lesson;
  // canceled flights excluded; a coloured dot encodes how the two sources line up.
  const LENS_SRC = {
    both:   { c: 'var(--col-done)',    t: 'Confirmed in both Operations & Progress' },
    review: { c: 'var(--col-pending)',  t: 'In both, but date/duration differ — review' },
    ops:    { c: 'var(--col-solo)',     t: 'Flown in Operations, not yet posted to Progress' },
    prog:   { c: 'var(--col-stby)',     t: 'Logged in Progress, no matching Operations flight' },
    sched:  { c: 'var(--col-pending)',  t: 'Scheduled in Operations (upcoming)' },
    plan:   { c: 'var(--ink-3)',        t: 'Planned only — not yet scheduled (TBC)' },
  };
  function LensCombinedTable({ rows, mobile, onRow, fd, hm }) {
    const [sortKey, setSortKey] = React.useState('date');
    const [sortDir, setSortDir] = React.useState('desc');
    const click = k => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir(k === 'lesson' ? 'asc' : 'desc'); } };
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = rows.slice().sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'mins') { av = av || 0; bv = bv || 0; }
      else { av = (av == null ? '' : '' + av); bv = (bv == null ? '' : '' + bv); }
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
    const SC = { Completed: 'var(--col-done)', Pending: 'var(--col-pending)', Scheduled: 'var(--col-pending)', Planned: 'var(--ink-3)', Canceled: 'var(--col-cancel)' };
    const arrow = k => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const th = (k, label, extra) => h('th', { onClick: () => click(k), style: { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...(extra || {}) }, title: 'Sort by ' + label }, label, arrow(k));
    return h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'tb', style: { width: '100%' } },
      h('thead', null, h('tr', null,
        h('th', { style: { width: 22 }, title: 'Data source' }, '●'),
        th('date', 'Date'),
        th('lesson', 'Lesson'),
        th('mins', 'Hrs', { textAlign: 'right' }),
        !mobile && th('fi', 'FI'),
        th('status', 'Status'))),
      h('tbody', null, sorted.length ? sorted.map((r, i) => {
        const src = LENS_SRC[r.src] || LENS_SRC.plan;
        return h('tr', { key: r.key + i, onClick: r.opsId ? () => onRow(r.opsId) : undefined, style: { cursor: r.opsId ? 'pointer' : 'default' } },
          h('td', null, h('span', { title: src.t, style: { display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: src.c } })),
          h('td', { className: 'mono', style: { whiteSpace: 'nowrap' } }, r.date ? fd(r.date) : '—'),
          h('td', { className: 'mono' }, r.lesson || '—'),
          h('td', { className: 'mono', style: { textAlign: 'right' } }, r.mins ? hm(r.mins) : '—'),
          !mobile && h('td', { className: 'muted mono', style: { fontSize: 9 } }, r.fi || ''),
          h('td', null, h('span', { className: 'pill', style: { background: `color-mix(in oklch,${SC[r.status] || 'var(--ink-3)'} 16%,transparent)`, color: SC[r.status] || 'var(--ink-3)' } }, (r.status || '').slice(0, 4))));
      }) : h('tr', null, h('td', { colSpan: mobile ? 5 : 6 }, h('div', { className: 'empty' }, 'No lesson records'))))));
  }

  // Student Lens — the unifying view: one student's Operations schedule linked to
  // their Progress curriculum (neither original app connected these). See REVAMP.md §5.
  function StudentLensView() {
    const d = window.useData();
    const { useState: useSlQ } = React;
    const [q, setQ] = useSlQ('');
    const s = d.studentLens;

    // Cohort comparison series for the chart: the batch-average cumulative curve
    // and the most-advanced SP's curve. Memoised so the chart isn't rebuilt every
    // render. Kept above the early return to preserve hook order.
    const compare = React.useMemo(() => {
      const all = d.students || [];
      const perStudentDates = all.map(st => (st.flown || []).filter(x => x.date).map(x => x.date).sort());
      const allDates = [...new Set(perStudentDates.flat())].sort();
      const batchAvg = all.length ? allDates.map(dt => {
        let sum = 0; perStudentDates.forEach(ds => { let c = 0; for (const x of ds) { if (x <= dt) c++; else break; } sum += c; });
        return { x: dt, y: sum / all.length };
      }) : [];
      const leaderSt = all.reduce((a, b) => !a ? b : (((b.done || 0) > (a.done || 0)) || ((b.done || 0) === (a.done || 0) && (b.pct || 0) > (a.pct || 0)) ? b : a), null);
      const isSelfLeader = leaderSt && s && leaderSt.catc_id === s.catc_id;
      let lacc = 0;
      const leader = (leaderSt && !isSelfLeader) ? (leaderSt.flown || []).filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date)).map(f => ({ x: f.date, y: ++lacc })) : [];
      return { batchAvg, leader, leaderNick: isSelfLeader ? '' : (leaderSt ? (leaderSt.nick || leaderSt.name) : ''), isSelfLeader: !!isSelfLeader };
    }, [d.students, s]);

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
    const today = (() => { const n = new Date(); const b = new Date(n.getTime() + (n.getTimezoneOffset() + 420) * 60000); return b.toISOString().slice(0, 10); })();
    // This student's Operations flights (match progress name → ops "FIRST L." key)
    const key = window.AP127Reconcile.ccKeyFromFull(s.name);
    const opsFlights = d.FLIGHTS.filter(f => window.AP127Reconcile.ccNameNorm(f.student) === key).sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || '')));
    const flown = (s.flown || []).slice().reverse();
    const curriculum = d.curriculum || [];
    // Upcoming = ACTUAL scheduled Operations flights (future, not completed/cancelled) —
    // not simulation projections or TBC curriculum dates.
    const upcomingOps = opsFlights
      .filter(f => f.status !== 'Completed' && f.status !== 'Canceled' && f.date >= today)
      .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))
      .slice(0, 14);

    // ── KPI computations ──
    const lessonMins = {}; curriculum.forEach(c => { lessonMins[c.lesson] = c.planned_mins || 0; });
    const hoursDone = (s.flown || []).reduce((a, f) => a + (lessonMins[f.lesson] || f.actual_mins || 0), 0) / 60;
    const plannedHrsToday = curriculum.filter(c => c.planned_date && c.planned_date <= today).reduce((a, c) => a + (c.planned_mins || 0), 0) / 60;
    const hrsDelta = hoursDone - plannedHrsToday;
    const expectedToday = curriculum.filter(c => c.planned_date && c.planned_date <= today).length;
    const lesDelta = (s.done || 0) - expectedToday;
    const lastDate = (s.flown || []).map(f => f.date).filter(Boolean).sort().at(-1) || '';
    const idle = lastDate ? Math.max(0, Math.round((new Date(today) - new Date(lastDate)) / 86400000)) : null;
    const total = s.total || curriculum.length || 101;
    const totalHrs = curriculum.reduce((a, c) => a + (c.planned_mins || 0), 0) / 60;
    // Projected finish (ETC) at recent pace
    const flownAsc = (s.flown || []).filter(f => f.date).slice().sort((a, b) => a.date.localeCompare(b.date));
    const firstDate = flownAsc[0]?.date || today;
    const paceDays = Math.max(1, Math.round((new Date(today) - new Date(firstDate)) / 86400000));
    const pace = (s.done || 0) / paceDays;
    const etcDate = pace > 0 ? new Date(new Date(today).getTime() + (Math.max(total - (s.done || 0), 0) / pace) * 86400000).toISOString().slice(0, 10) : null;

    // ── Combined OPS+PROG rows (one per lesson, canceled excluded) ──
    const R = window.AP127Reconcile;
    const nl = l => R ? R.normLesson(l) : String(l || '').toUpperCase().trim();
    const progFlownBy = {}; (s.flown || []).forEach(f => { if (f.lesson) progFlownBy[nl(f.lesson)] = f; });
    const curBy = {}; curriculum.forEach(c => { if (c.lesson) curBy[nl(c.lesson)] = c; });
    // Non-canceled ops flights for this student, one per lesson (prefer Completed, else earliest).
    const opsBy = {};
    opsFlights.filter(f => f.status !== 'Canceled' && f.lesson).forEach(f => {
      const k = nl(f.lesson); const prev = opsBy[k];
      if (!prev) { opsBy[k] = f; return; }
      const better = (f.status === 'Completed' && prev.status !== 'Completed') ||
        (f.status === prev.status && (f.date || '') < (prev.date || ''));
      if (better) opsBy[k] = f;
    });
    // Only real records: PROG flown + OPS flights — no projected plan
    const lessonKeys = [...new Set([...Object.keys(progFlownBy), ...Object.keys(opsBy)])];
    const mergedRows = lessonKeys.map(k => {
      const pf = progFlownBy[k], cu = curBy[k], op = opsBy[k];
      const opsDone = op && op.status === 'Completed';
      const lesson = (pf && pf.lesson) || (op && op.lesson) || k;
      let src, status, date, mins;
      if (pf || opsDone) {
        // Completed domain
        status = 'Completed';
        date = (pf && pf.date) || (op && op.date) || '';
        mins = (pf && pf.actual_mins) || (op && (R ? R.hmToMin(op.duration) : null)) || op?.durMin || (cu && cu.planned_mins) || 0;
        if (pf && opsDone) {
          const dd = R ? R.dateDiff(op.date, pf.date) : 0;
          const oM = R ? R.hmToMin(op.duration) : null; const pM = pf.actual_mins;
          const dateBad = dd != null && Math.abs(dd) > 1;
          const durBad = oM != null && pM != null && Math.abs(oM - pM) > 20;
          src = (dateBad || durBad) ? 'review' : 'both';
        } else if (pf) src = 'prog';
        else src = 'ops';
      } else {
        // Upcoming: only OPS-scheduled flights reach here
        date = (op && op.date) || '';
        mins = (op && (R ? R.hmToMin(op.duration) : null)) || op?.durMin || (cu && cu.planned_mins) || 0;
        status = 'Scheduled'; src = 'sched';
      }
      return { key: k, lesson, date, mins, status, src, fi: op ? op.instructor : '', opsId: op ? op.id : null };
    });

    const SC = { Completed: 'var(--col-done)', Pending: 'var(--col-pending)', Canceled: 'var(--col-cancel)', Scheduled: 'var(--col-pending)' };
    const listPanel = (title, sub, children) => h('div', { className: 'panel' }, h('div', { className: 'ph' }, h('span', { className: 'pt' }, title), h('span', { className: 'ps' }, sub)), h('div', { style: { overflow: 'auto', maxHeight: 380 } }, children));
    const rowsOrEmpty = (arr, fn, empty) => arr.length ? arr.map(fn) : h('div', { className: 'empty' }, empty);
    const kpiDelta = (label, valTxt, delta, unit) => h('div', { className: 'kpi' },
      h('div', { className: 'kl' }, label),
      h('div', { className: 'kv', style: { fontSize: 18 } }, valTxt),
      h('div', { className: 'ks', style: { color: delta >= 0 ? 'var(--col-done)' : 'var(--col-cancel)' } }, `${delta >= 0 ? '+' : ''}${unit === 'h' ? delta.toFixed(1) + 'h' : delta + ''} ${delta >= 0 ? 'ahead' : 'behind'}`));

    return h('div', { style: { padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' } },
      h('div', { className: 'panel' }, h('div', { className: 'ph' },
          h('span', { className: 'pt' }, 'Student Lens · ' + s.nick),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { className: 'ps' }, s.name + ' · ' + (s.catc_id || '')),
            h('button', { className: 'chip', onClick: () => d.setStudentLens(null), title: 'Pick a different student' }, '↺ Change'))),
        h('div', { className: 'pb' }, h('div', { className: 'kpis' },
          h('div', { className: 'kpi acc' }, h('div', { className: 'kl' }, 'Progress'), h('div', { className: 'kv' }, (s.pct || 0).toFixed(0) + '%'), h('div', { className: 'ks' }, `${s.done}/${s.total} lessons`)),
          kpiDelta('Lessons vs Plan', `${s.done || 0} / ${expectedToday}`, lesDelta, ''),
          kpiDelta('Hours vs Plan', `${hoursDone.toFixed(1)} / ${plannedHrsToday.toFixed(0)}`, hrsDelta, 'h'),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Next Lesson'), h('div', { className: 'kv', style: { fontSize: 18 } }, s.next_lesson || '—'), h('div', { className: 'ks' }, upcomingOps[0] ? 'sched ' + fd(upcomingOps[0].date) : 'not scheduled')),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Idle Days'), h('div', { className: 'kv', style: { color: idle != null && idle >= 6 ? 'var(--col-cancel)' : idle != null && idle >= 3 ? 'var(--col-pending)' : 'var(--ink)' } }, idle == null ? '—' : idle), h('div', { className: 'ks' }, lastDate ? 'last ' + fd(lastDate) : 'no flights')),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Proj. Finish'), h('div', { className: 'kv', style: { fontSize: 16, color: 'var(--col-pending)' } }, etcDate ? fd(etcDate) : '—'), h('div', { className: 'ks' }, 'ETC at current pace')),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Total Hours' ), h('div', { className: 'kv', style: { fontSize: 16 } }, `${hoursDone.toFixed(0)}/${totalHrs.toFixed(0)}`), h('div', { className: 'ks' }, 'flown / curriculum')),
          h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Instructor'), h('div', { className: 'kv', style: { fontSize: 15 } }, (d.FI_FULL[s.fi] || s.fi || '—')), h('div', { className: 'ks' }, (s.se || '—') + ' · ' + opsFlights.length + ' ops')),
        ))),
      h('div', { className: 'panel' },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Progress · You vs Batch'), h('span', { className: 'ps' }, etcDate ? 'projected finish ' + fd(etcDate) + (compare.isSelfLeader ? ' · you lead the batch' : '') : 'cumulative lessons over time')),
        h('div', { className: 'pb' }, h(StudentProgressChart, { student: s, curriculum, today, etcDate, mobile: d.isMobile, batchAvg: compare.batchAvg, leader: compare.leader, leaderNick: compare.leaderNick }))),
      h('div', { className: 'panel' },
        h('div', { className: 'ph' },
          h('span', { className: 'pt' }, 'Lesson Log · Operations + Progress'),
          h('span', { className: 'ps' }, mergedRows.length + ' lessons · canceled flights hidden')),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 12, padding: '8px 12px', borderBottom: '1px solid var(--line-soft)', fontSize: 10 } },
          ...[['both', 'Both agree'], ['review', 'Differ — review'], ['ops', 'Ops only'], ['prog', 'Progress only'], ['sched', 'Scheduled']].map(([k, lbl]) =>
            h('span', { key: k, title: LENS_SRC[k].t, style: { display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink-2)' } },
              h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: LENS_SRC[k].c } }), lbl))),
        h('div', { className: 'pb', style: { padding: 0 } }, h(LensCombinedTable, { rows: mergedRows, mobile: d.isMobile, onRow: id => d.setDrawer(id), fd, hm }))));
  }

  // Maps view id → component. Resolved at render time (after all view scripts load).
  // Ops views come from the reused Command Center files (window.*Board).
  function registry() {
    return {
      schedule: window.ScheduleView,
      board: window.OpsBoard, gantt: window.GanttBoard,
      weekly: window.WeeklyBoard, roster: window.RosterBoard, calendar: window.CalendarBoard,
      autoslotfinder: window.AutoSlotFinderBoard,
      analytics: window.SummaryBoard,
      aircraft: window.AircraftStatusView,
      cohort: window.CohortView,
      plans: window.ProgressDetailView,
      performance: window.SchoolPerformanceView,
      simulation: window.SimulationView,
      sim2: window.Simulation2View,
      sim3: window.Simulation3View,
      crosscheck: window.CrossCheckView,
      tutorial: window.TutorialView,
      watchdog: window.WatchdogView,
      cfusage: window.CfUsageView,
    };
  }

  function Shell() {
    const d = window.useData();
    const ALIAS = { today: 'overview' };
    const [view, setView] = useState(() => {
      const raw = (location.hash || '').replace('#/', '').replace('#', '') || localStorage.getItem('ap127v2-view') || 'overview';
      if (_sharePreset && !_sharePreset.includes(raw)) return _sharePreset[0];
      return ALIAS[raw] || raw;
    });
    const [menu, setMenu] = useState(false);
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ap127v2-collapsed') === '1');
    const mobile = d.isMobile;
    useEffect(() => {
      const onGo = e => { const v = ALIAS[e.detail] || e.detail; if (_sharePreset && !_sharePreset.includes(v)) return; setView(v); setMenu(false); };
      window.addEventListener('ap127-go', onGo); return () => window.removeEventListener('ap127-go', onGo);
    }, []);
    useEffect(() => { localStorage.setItem('ap127v2-view', view); try { history.replaceState(null, '', location.search + '#/' + view); } catch (e) {} }, [view]);
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
