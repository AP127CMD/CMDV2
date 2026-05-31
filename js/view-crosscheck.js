/* ============================================================================
 * AP127 V2 revamp — Cross-Check view (native). Reconciles Operations ⇄ Progress
 * using window.AP127Reconcile + the unified context. Adjustable time/date
 * tolerance, filtering, sortable discrepancy + per-student tables. See REVAMP.md §3C/§10.
 * ==========================================================================*/
(function () {
  const { useState, useMemo } = React;
  const h = React.createElement;
  const esc = s => String(s == null ? '' : s);
  const fd = ds => { if (!ds) return '—'; try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return ds; } };
  const SEV_RANK = { conflict: 0, review: 1, ok: 2 };
  const TYPE_LABEL = { missing_in_ops: 'PROG only', missing_in_progress: 'OPS only', review: 'mismatch' };

  function CrossCheckView() {
    const d = window.useData();
    const [filter, setFilter] = useState('all');
    const [q, setQ] = useState('');
    const [durTol, setDurTol] = useState(20);
    const [dateTol, setDateTol] = useState(1);
    const [sort, setSort] = useState({ key: 'sev', dir: 1 });
    const [sortStu, setSortStu] = useState({ key: 'conflict', dir: -1 });

    const R = useMemo(() => {
      try { return window.AP127Reconcile.reconcile(window.FLIGHT_DATA, { ap127: d.students, cur127: d.curriculum }, { durTolMin: durTol, dateTolDays: dateTol }); }
      catch (e) { return { rows: [], perStudent: [], totals: { conflict: 0, review: 0, ok: 0, consistency: 100, checked: 0, students: 0, windowStart: '' } }; }
    }, [d.students, d.curriculum, durTol, dateTol]);
    const t = R.totals;

    let rows = R.rows.filter(r => r.sev !== 'ok');
    if (filter !== 'all') rows = rows.filter(r => r.sev === filter);
    if (q) { const ql = q.toLowerCase(); rows = rows.filter(r => (r.student + ' ' + r.lesson + ' ' + r.detail).toLowerCase().includes(ql)); }
    rows = rows.slice().sort((a, b) => { let av = sort.key === 'sev' ? SEV_RANK[a.sev] : a[sort.key], bv = sort.key === 'sev' ? SEV_RANK[b.sev] : b[sort.key]; av = av == null ? '' : av; bv = bv == null ? '' : bv; return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir; });
    const stu = R.perStudent.slice().sort((a, b) => { if (sortStu.key === 'name') return ('' + a.name).localeCompare('' + b.name) * sortStu.dir; return ((a[sortStu.key] || 0) - (b[sortStu.key] || 0)) * sortStu.dir; });

    const sortBy = k => setSort(s => ({ key: k, dir: s.key === k ? -s.dir : 1 }));
    const sortS = k => setSortStu(s => ({ key: k, dir: s.key === k ? -s.dir : 1 }));
    const kpi = (cls, l, v, s) => h('div', { className: 'kpi ' + cls }, h('div', { className: 'kl' }, l), h('div', { className: 'kv' }, v), h('div', { className: 'ks' }, s));
    const th = (label, k, sorter, cls) => h('th', { onClick: () => sorter(k), className: cls || '' }, label);

    return h('div', { style: { padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' } },
      h('div', { className: 'kpis' },
        kpi('acc', 'Consistency', t.consistency + '%', t.ok + ' of ' + t.checked + ' checks match'),
        kpi('ok', 'Matched', t.ok, 'identical in both'),
        kpi('rev', 'To Review', t.review, 'time / date differs'),
        kpi('bad', 'Conflicts', t.conflict, 'present one side only'),
        kpi('', 'Students', t.students, (R.perStudent.filter(x => x.matched).length) + ' matched in Ops'),
      ),
      h('div', { className: 'panel' }, h('div', { className: 'pb' },
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'var(--ink-2)' } },
          h('span', null, h('span', { className: 'pill ok' }, 'OK'), ' logged identically in both'),
          h('span', null, h('span', { className: 'pill rev' }, 'REVIEW'), ' matched, but time/date differs beyond tolerance'),
          h('span', null, h('span', { className: 'pill bad' }, 'CONFLICT'), ' present in one system, missing in the other')),
        h('div', { className: 'muted', style: { marginTop: 8, fontSize: 11 } },
          'Compares every AP127 flown lesson in Progress against Completed flights in Operations, both directions. Only the window both sources cover is checked (from ',
          h('span', { className: 'mono' }, t.windowStart), ') — older Progress entries predate the Operations history.'))),
      // controls
      h('div', { className: 'panel' }, h('div', { className: 'pb', style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
        h('input', { value: q, onChange: e => setQ(e.target.value), placeholder: 'search student / lesson…', style: { flex: 1, minWidth: 200, background: 'var(--bg-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 9px', fontSize: 12, outline: 'none' } }),
        h('span', { className: 'mono muted', style: { fontSize: 10 } }, 'SHOW'),
        ['all', 'conflict', 'review'].map(f => h('span', { key: f, className: 'chip' + (filter === f ? ' sel' : ''), onClick: () => setFilter(f) }, f[0].toUpperCase() + f.slice(1))),
        h('span', { className: 'mono muted', style: { fontSize: 10, marginLeft: 6 } }, 'TIME ±'),
        h('select', { value: durTol, onChange: e => setDurTol(+e.target.value), className: 'chip' }, [10, 20, 30, 45].map(v => h('option', { key: v, value: v }, v + 'm'))),
        h('span', { className: 'mono muted', style: { fontSize: 10 } }, 'DATE ±'),
        h('select', { value: dateTol, onChange: e => setDateTol(+e.target.value), className: 'chip' }, [0, 1, 3, 7].map(v => h('option', { key: v, value: v }, v + 'd'))),
      )),
      h('div', { style: { display: 'grid', gridTemplateColumns: d.isMobile ? '1fr' : '1.3fr 1fr', gap: 14 } },
        // discrepancies
        h('div', { className: 'panel' },
          h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Discrepancies'), h('span', { className: 'ps' }, rows.length + ' shown')),
          h('div', { style: { overflow: 'auto', maxHeight: 520 } }, h('table', { className: 'tb' },
            h('thead', null, h('tr', null, th('Sev', 'sev', sortBy), th('Student', 'student', sortBy), th('Lesson', 'lesson', sortBy), th('Date', 'date', sortBy), h('th', null, 'Detail'))),
            h('tbody', null, rows.length ? rows.map((r, i) => h('tr', { key: i },
              h('td', null, h('span', { className: 'pill ' + (r.sev === 'conflict' ? 'bad' : 'rev') }, r.sev)),
              h('td', null, esc(r.nick || ''), ' ', h('span', { className: 'muted', style: { fontSize: 9 } }, esc(r.student))),
              h('td', { className: 'mono' }, esc(r.lesson)), h('td', { className: 'mono' }, fd(r.date)),
              h('td', null, h('span', { className: 'muted mono', style: { fontSize: 9 } }, '[' + (TYPE_LABEL[r.type] || '') + '] '), esc(r.detail))))
              : h('tr', null, h('td', { colSpan: 5 }, h('div', { className: 'empty' }, 'No discrepancies — fully consistent ✓'))))))),
        // per-student
        h('div', { className: 'panel' },
          h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'By Student'), h('span', { className: 'ps' }, 'Progress vs Operations')),
          h('div', { style: { overflow: 'auto', maxHeight: 520 } }, h('table', { className: 'tb' },
            h('thead', null, h('tr', null, th('Student', 'name', sortS), th('PROG', 'progDone', sortS, 'n'), th('OPS', 'ccCompleted', sortS, 'n'), th('OK', 'ok', sortS, 'n'), th('REV', 'review', sortS, 'n'), th('CONF', 'conflict', sortS, 'n'))),
            h('tbody', null, stu.map((s, i) => h('tr', { key: i, onClick: () => { const full = d.students.find(x => x.nick === s.nick); if (full) { d.setStudentLens(full); d.go('student'); } }, style: { cursor: 'pointer' } },
              h('td', null, esc(s.nick || ''), ' ', h('span', { className: 'muted', style: { fontSize: 9 } }, esc(s.name)), s.matched ? '' : h('span', { className: 'pill info', style: { marginLeft: 4 } }, 'no ops')),
              h('td', { className: 'n' }, s.progDone), h('td', { className: 'n' }, s.ccCompleted),
              h('td', { className: 'n', style: { color: 'var(--col-done)' } }, s.ok),
              h('td', { className: 'n', style: { color: s.review ? 'var(--col-pending)' : 'var(--ink-3)' } }, s.review),
              h('td', { className: 'n', style: { color: s.conflict ? 'var(--col-cancel)' : 'var(--ink-3)', fontWeight: s.conflict ? 700 : 400 } }, s.conflict))))))),
      ));
  }
  window.CrossCheckView = CrossCheckView;
})();
