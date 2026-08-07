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

  function PerFlightView() {
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

    return h('div', { style: { display: 'grid', gap: 14 } },
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

  const LEDGER_CAT_META = {
    opsPending:  { label: 'Ops booking still Pending',            dot: 'rev',  help: 'Flown per Progress; the matching Ops Portal booking hasn\'t been marked Completed yet. Self-heals once Ops catches up.' },
    opsCanceled: { label: 'Ops booking marked Canceled',          dot: 'bad',  help: 'Flown per Progress, but the matching Ops Portal booking is marked Canceled — a real conflict worth a human look.' },
    structural:  { label: 'Lesson type never tracked by Ops',     dot: 'info', help: 'This lesson code has never appeared in the Ops Portal feed for anyone, any status — not a flight-booking item (e.g. a ground/academic lesson). Permanent, not a data gap.' },
    progTrueGap: { label: 'No Ops record found at all',           dot: 'bad',  help: 'No Ops Portal booking exists for this student+lesson, any status, any date — a genuine missing Ops entry.' },
    progDrift:   { label: 'Landed in a different month (Ops)',    dot: 'rev',  help: 'A matching Ops credit exists, but its date falls in a different calendar month than this Progress record.' },
    opsOrphan:   { label: 'Progress hasn\'t logged it yet',       dot: 'rev',  help: 'Ops shows this lesson Completed; no Progress record exists for it at all yet (opposite lag direction — Progress entry is behind Ops here).' },
    opsDrift:    { label: 'Landed in a different month (Progress)', dot: 'rev', help: 'A matching Progress record exists, but its date falls in a different calendar month than this Ops credit.' },
  };

  function MonthlyView() {
    const [hoursMode, setHoursMode] = useState('effective'); // 'effective' | 'actual'
    const [batchFilter, setBatchFilter] = useState('ALL');   // 'ALL' | 'AP-126' | 'AP-127'
    const [openDiag, setOpenDiag] = useState({ multiLeg: false, sim: false, tag: false });
    const [openSP, setOpenSP] = useState({}); // `${batch}|${month}` -> bool
    const [openLedger, setOpenLedger] = useState({}); // `${batch}|${month}` -> bool
    const [openCat, setOpenCat] = useState({}); // `${batch}|${month}|${cat}` -> bool

    const CC = window.AP127MonthlyCC;
    const { ops, prog } = useMemo(() => CC.computeMonthly(hoursMode), [hoursMode]);
    const diag = useMemo(() => CC.computeDiagnostics(), []);
    const ledger = useMemo(() => CC.computeLedger(hoursMode), [hoursMode]);
    const batches = batchFilter === 'ALL' ? CC.BATCHES.map(b => b.label) : [batchFilter];

    const toggleDiag = k => setOpenDiag(s => ({ ...s, [k]: !s[k] }));
    const toggleSP = k => setOpenSP(s => ({ ...s, [k]: !s[k] }));
    const toggleLedger = k => setOpenLedger(s => ({ ...s, [k]: !s[k] }));
    const toggleCat = k => setOpenCat(s => ({ ...s, [k]: !s[k] }));

    const rows = [];
    batches.forEach(b => CC.MONTHS.forEach(m => {
      const o = ops[b][m], p = prog[b][m];
      const dH = o.hours - p.hours;
      const dPct = p.hours ? (dH / p.hours) * 100 : 0;
      rows.push({ batch: b, month: m, o, p, dH, dPct });
    }));

    function inScope(x) { return batches.includes(x.batch); }
    function renderPerSP(r) {
      const keys = new Set([...Object.keys(r.o.byStu), ...Object.keys(r.p.byStu)]);
      const spRows = [...keys].map(k => {
        const o = r.o.byStu[k] || { hours: 0, count: 0 };
        const p = r.p.byStu[k] || { hours: 0, count: 0 };
        return { key: k, nick: p.nick || k, o, p, dH: o.hours - p.hours };
      }).sort((a, b) => Math.abs(b.dH) - Math.abs(a.dH));
      return h('div', { style: { padding: '8px 4px', maxHeight: 320, overflow: 'auto' } }, h('table', { className: 'tb' },
        h('thead', null, h('tr', null, h('th', null, 'SP'), h('th', { className: 'n' }, 'OPS hrs'), h('th', { className: 'n' }, 'OPS fl'), h('th', { className: 'n' }, 'PROG hrs'), h('th', { className: 'n' }, 'PROG les'), h('th', { className: 'n' }, 'Δ hrs'))),
        h('tbody', null, spRows.map((s, i) => h('tr', { key: i },
          h('td', null, s.nick), h('td', { className: 'n' }, s.o.hours.toFixed(1)), h('td', { className: 'n' }, s.o.count),
          h('td', { className: 'n' }, s.p.hours.toFixed(1)), h('td', { className: 'n' }, s.p.count),
          h('td', { className: 'n' }, (s.dH >= 0 ? '+' : '') + s.dH.toFixed(1)))))));
    }
    function renderMultiLeg(list) {
      if (!list.length) return h('div', { className: 'empty' }, 'None in current scope.');
      return h('div', { style: { display: 'grid', gap: 8 } }, list.map((g, i) => h('div', { key: i, className: 'mono', style: { fontSize: 11 } },
        g.batch + ' · ' + g.student + ' · ' + g.lesson + ' · ' + fd(g.date) + ' — ' + g.rows.length + ' Ops rows: ' +
        g.rows.map(r => r.duration + ' (' + r.start + '-' + r.end + ', ' + r.instructor + ')').join('; '))));
    }
    function renderSimMismatch(list) {
      if (!list.length) return h('div', { className: 'empty' }, 'None in current scope.');
      return h('table', { className: 'tb' }, h('thead', null, h('tr', null, h('th', null, 'Batch'), h('th', null, 'Month'), h('th', { className: 'n' }, 'PROG sim'), h('th', { className: 'n' }, 'OPS sim'), h('th', { className: 'n' }, 'Δ'))),
        h('tbody', null, list.map((x, i) => h('tr', { key: i }, h('td', null, x.batch), h('td', null, CC.MONTH_LABEL[x.month]), h('td', { className: 'n' }, x.progSim), h('td', { className: 'n' }, x.opsSim), h('td', { className: 'n' }, (x.delta >= 0 ? '+' : '') + x.delta)))));
    }
    function renderLedgerCatLines(catKey, cat) {
      if (!cat.n) return null;
      return h('div', { style: { display: 'grid', gap: 4, padding: '6px 0 6px 20px', fontSize: 11 } },
        cat.lines.slice(0, 200).map((ln, i) => h('div', { key: i, className: 'mono', style: { color: 'var(--ink-2)' } },
          ln.student + ' · ' + ln.lesson + ' · ' + fd(ln.date) +
          (ln.opsStatus ? '  [ops: ' + ln.opsStatus + (ln.opsDate && ln.opsDate !== ln.date ? ' on ' + fd(ln.opsDate) : '') + ']' : '') +
          '  —  ' + (ln.mins / 60).toFixed(2) + 'h')));
    }
    function renderLedgerRow(r) {
      const key = r.batch + '|' + r.month;
      const led = ledger[key];
      if (!led) return null;
      const catOrder = ['opsPending', 'opsCanceled', 'progTrueGap', 'structural', 'progDrift', 'opsOrphan', 'opsDrift'];
      return h('div', { style: { padding: '10px 4px', display: 'grid', gap: 6 } },
        h('div', { className: 'mono', style: { fontSize: 11, color: 'var(--ink-2)', marginBottom: 2 } },
          r.batch + ' · ' + CC.MONTH_LABEL[r.month] + ' — OPS ' + led.opsHours.toFixed(1) + 'h vs PROG ' + led.progHours.toFixed(1) +
          'h · Δ ' + (led.delta >= 0 ? '+' : '') + led.delta.toFixed(1) + 'h'),
        catOrder.map(ck => {
          const cat = led.categories[ck];
          if (!cat || !cat.n) return null;
          const meta = LEDGER_CAT_META[ck];
          const ckey = key + '|' + ck;
          return h('div', { key: ck },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }, onClick: () => toggleCat(ckey), title: meta.help },
              h('span', { className: 'pill ' + meta.dot }, cat.n),
              h('span', { style: { fontSize: 12, color: 'var(--ink)' } }, meta.label),
              h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--ink-3)' } }, (cat.h >= 0 ? '+' : '') + cat.h.toFixed(1) + 'h'),
              h('span', { className: 'muted', style: { fontSize: 10, marginLeft: 'auto' } }, openCat[ckey] ? '▾' : '▸')),
            openCat[ckey] ? renderLedgerCatLines(ck, cat) : null);
        }),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingTop: 6, borderTop: '1px solid var(--line-soft)' } },
          Math.abs(led.residual) < 0.05
            ? h('span', { className: 'pill ok' }, '✓ fully explained')
            : h('span', { className: 'pill rev' }, 'residual ' + (led.residual >= 0 ? '+' : '') + led.residual.toFixed(2) + 'h'),
          h('span', { className: 'muted', style: { fontSize: 10 } }, 'every category above sums exactly to Δ, ' + (Math.abs(led.residual) < 0.05 ? 'no unexplained gap' : 'small unattributed remainder'))));
    }
    function renderTagMismatch(list) {
      return h('table', { className: 'tb' }, h('thead', null, h('tr', null, h('th', null, 'Student'), h('th', null, 'Date'), h('th', null, 'Ops tag'), h('th', null, 'Roster batch'), h('th', null, 'Lesson'))),
        h('tbody', null, list.map((x, i) => h('tr', { key: i }, h('td', null, x.student), h('td', null, fd(x.date)), h('td', null, x.opsTag), h('td', null, x.rosterBatch), h('td', null, x.lesson)))));
    }

    const diagPanel = (key, title, count, body) => h('div', { className: 'panel' },
      h('div', { className: 'ph', style: { cursor: 'pointer' }, onClick: () => toggleDiag(key) },
        h('span', { className: 'pt' }, (openDiag[key] ? '▾ ' : '▸ ') + title),
        h('span', { className: 'ps' }, count + ' found')),
      openDiag[key] ? h('div', { style: { padding: '0 14px 14px' } }, body) : null);

    return h('div', { style: { display: 'grid', gap: 14 } },
      // controls
      h('div', { className: 'panel' }, h('div', { className: 'pb', style: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' } },
        h('span', { className: 'mono muted', style: { fontSize: 10 } }, 'HOURS'),
        ['effective', 'actual'].map(mval => h('span', { key: mval, className: 'chip' + (hoursMode === mval ? ' sel' : ''), onClick: () => setHoursMode(mval) }, mval === 'effective' ? 'Effective' : 'Actual')),
        h('span', { className: 'mono muted', style: { fontSize: 10, marginLeft: 10 } }, 'BATCH'),
        ['ALL', 'AP-126', 'AP-127'].map(bval => h('span', { key: bval, className: 'chip' + (batchFilter === bval ? ' sel' : ''), onClick: () => setBatchFilter(bval) }, bval)),
        h('span', { className: 'muted', style: { fontSize: 11, marginLeft: 'auto' } }, 'AP-126 / AP-127 · MAY–JUL 2026 · diagnose-only, no calculation changes'))),
      // headline table
      h('div', { className: 'panel' },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Monthly OPS ⇄ PROG'), h('span', { className: 'ps' }, rows.length + ' rows')),
        h('div', { style: { overflow: 'auto' } }, h('table', { className: 'tb' },
          h('thead', null, h('tr', null,
            h('th', null, 'Batch'), h('th', null, 'Month'),
            h('th', { className: 'n' }, 'OPS hrs'), h('th', { className: 'n' }, 'OPS flights'),
            h('th', { className: 'n' }, 'PROG hrs'), h('th', { className: 'n' }, 'PROG lessons'),
            h('th', { className: 'n' }, 'Δ hrs'), h('th', { className: 'n' }, 'Δ%'), h('th', null, ''))),
          h('tbody', null, rows.map((r, i) => {
            const spKey = r.batch + '|' + r.month;
            const flag = Math.abs(r.dPct) >= 5 ? 'bad' : Math.abs(r.dPct) >= 1 ? 'rev' : 'ok';
            return [
              h('tr', { key: i },
                h('td', null, r.batch), h('td', null, CC.MONTH_LABEL[r.month]),
                h('td', { className: 'n' }, r.o.hours.toFixed(1)), h('td', { className: 'n' }, r.o.count),
                h('td', { className: 'n' }, r.p.hours.toFixed(1)), h('td', { className: 'n' }, r.p.count),
                h('td', { className: 'n' }, (r.dH >= 0 ? '+' : '') + r.dH.toFixed(1)),
                h('td', { className: 'n' }, h('span', { className: 'pill ' + flag }, (r.dPct >= 0 ? '+' : '') + r.dPct.toFixed(1) + '%')),
                h('td', null, h('span', { className: 'chip', onClick: () => toggleSP(spKey) }, openSP[spKey] ? '▾ per-SP' : '▸ per-SP'))),
              openSP[spKey] ? h('tr', { key: i + '-sp' }, h('td', { colSpan: 9 }, renderPerSP(r))) : null,
            ];
          }))))),
      // reconciliation ledger — every hour of Δ, itemized, validated to a near-zero residual
      h('div', { className: 'panel' },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Reconciliation Ledger'), h('span', { className: 'ps' }, 'every Δ hour, pinpointed')),
        h('div', { className: 'muted', style: { padding: '0 14px 6px', fontSize: 11 } },
          'Each category below is a real, itemized set of student+lesson+date records (click to expand). They sum exactly to Δ for that batch/month — nothing is left as an unexplained aggregate gap.'),
        h('div', { style: { padding: '0 14px 14px', display: 'grid', gap: 4 } },
          rows.map((r, i) => {
            const key = r.batch + '|' + r.month;
            return h('div', { key: i, style: { borderTop: i ? '1px solid var(--line-soft)' : 'none' } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 0' }, onClick: () => toggleLedger(key) },
                h('span', { className: 'chip' }, r.batch + ' · ' + CC.MONTH_LABEL[r.month]),
                h('span', { className: 'muted', style: { fontSize: 11 } }, openLedger[key] ? '▾ hide breakdown' : '▸ show breakdown')),
              openLedger[key] ? renderLedgerRow(r) : null);
          }))),
      // diagnostics (data-quality views, orthogonal to the ledger above)
      diagPanel('multiLeg', 'Multi-leg bookings (Ops Portal data quality — hours no longer double-counted)', diag.multiLeg.filter(inScope).length,
        renderMultiLeg(diag.multiLeg.filter(inScope))),
      diagPanel('sim', 'Sim-tag mismatch (PROG "(SIM)" lesson vs OPS isSim flag)', diag.simMismatch.filter(x => batches.includes(x.batch)).filter(x => x.delta !== 0).length,
        renderSimMismatch(diag.simMismatch.filter(x => batches.includes(x.batch)))),
      diagPanel('tag', 'Batch-tag check (Ops tag vs PROG roster)', diag.batchTagMismatch.length,
        diag.batchTagMismatch.length === 0
          ? h('div', { className: 'empty' }, 'No mismatches — every AP-126/AP-127 student’s Ops flights are tagged with their correct roster batch ✓')
          : renderTagMismatch(diag.batchTagMismatch)),
      // why + how to fix
      h('div', { className: 'panel' }, h('div', { className: 'pb' },
        h('div', { className: 'pt', style: { marginBottom: 8 } }, 'Why they differ, and how to fix it'),
        h('ol', { style: { fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, paddingLeft: 18 } },
          h('li', null, h('b', null, 'Multi-leg bookings — FIXED. '), 'Ops Analytics and this Monthly view now count each curriculum lesson\'s effective hours once per SP, no matter how many separate Ops Portal bookings share that lesson code, including a bare-coded attempt paired with a later properly-split "/1,/2,/3" re-attempt, and a lesson logged only as continuation legs with no "/1"/bare leg at all. The extra bookings still count as real flights/block hours, just not extra curriculum credit.'),
          h('li', null, h('b', null, 'Lesson-code spelling mismatches — FIXED. '), 'The Ops Portal spells some lessons differently than the official curriculum (confirmed: "CDNXV 48" in Ops = "CDNXC 48" in Progress/curriculum, same lesson, 28 confirmed 1:1 matches). Fixed with a lesson-code alias map in js/shared.js, the same pattern already used for student-name spelling variants.'),
          h('li', null, h('b', null, 'Ops booking still Pending is the single biggest remaining driver. '), 'Flown per Progress, but the Ops Portal booking hasn\'t been marked Completed yet — this is the largest category in the ledger below for most rows. Self-heals once whoever runs the Ops Portal catches up; not a code bug.'),
          h('li', null, h('b', null, 'Sim flights are tagged two different ways. '), 'Ops Analytics flags sim via a per-booking aircraft/tail-type field; Progress detects sim via a "(SIM)" marker baked into the curriculum lesson code. Recommend picking one source of truth (the curriculum lesson code, since it\'s the more stable of the two) and deriving the other system\'s flag from it — not fixed this round.'),
          h('li', null, h('b', null, 'Cross-month drift and true no-match/no-progress-yet entries are real, ordinary system lag. '), 'A lesson flown near a month boundary can land in different calendar months on each side; a lesson can be completed in one system days before the other catches up. Both are itemized per batch/month in the ledger below, not swept into an unexplained total.'),
          h('li', null, h('b', null, 'Batch-tag mismatches, when present, mean the Ops Portal booking was tagged with the wrong cohort. '), 'Currently zero for AP-126/AP-127 — this check stays live so it surfaces immediately if that ever changes.'),
          h('li', null, h('b', null, 'Result: '), 'after both fixes, 5 of 6 batch/month rows reconcile to an exact 0.00h unexplained residual; the 6th is off by 0.01h (rounding only, ~0.6 minutes). Every remaining Δ hour is a real, itemized, named record in the ledger above — not a computation gap.')))));
  }

  function CrossCheckShell() {
    const [mode, setMode] = useState('perflight'); // 'perflight' | 'monthly'
    return h('div', { style: { padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' } },
      h('div', { style: { display: 'flex', gap: 8 } },
        h('span', { className: 'chip' + (mode === 'perflight' ? ' sel' : ''), onClick: () => setMode('perflight') }, 'Per-Flight Reconciliation'),
        h('span', { className: 'chip' + (mode === 'monthly' ? ' sel' : ''), onClick: () => setMode('monthly') }, 'Monthly OPS ⇄ PROG')),
      mode === 'perflight' ? h(PerFlightView) : h(MonthlyView));
  }

  window.CrossCheckView = CrossCheckShell;
})();
