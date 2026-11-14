/* AP127 V2 — Master Plan (Planning → "Master Plan").
 *
 * Every AP-127 SP, every remaining sortie, on a calendar: the 96 curriculum
 * lessons, the 5 Advanced UPRT sorties (C172) and the 3 final skill checks —
 * scheduled day by day against the resources the school is actually giving the
 * batch (measured live from the ops feed: last 7 days = level, last 30 days =
 * shape, AP-126 = pools AP-127 hasn't used yet). Every assumption is a control.
 *
 * All maths lives in js/ap127-masterplan-model.js (pure, seeded, Node-tested,
 * with a backtest); this file only lays out and draws.
 *
 * Plain script (React.createElement, no JSX). Reads shared.js globals lazily
 * via useData() at render time.
 */
(function () {
  const { useState, useMemo, useEffect, useRef } = React;
  const h = React.createElement;
  const MP = () => window.AP127MasterPlan;
  const LS = 'ap127v2-masterplan';
  const loadLS = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const saveLS = v => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch (e) {} };

  // ── formatting ─────────────────────────────────────────────────────────────
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fD = s => !s ? '—' : s === 'done' ? 'done' : `${+s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]}`;
  const fDY = s => !s || s === 'done' ? fD(s) : `${fD(s)} ${s.slice(2, 4)}`;
  const dDiff = (a, b) => (a && b && a !== 'done' && b !== 'done') ? Math.round((Date.parse(a) - Date.parse(b)) / 864e5) : null;
  const sgn = v => v == null ? '' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);
  const shortName = n => { const p = String(n || '').trim().split(/\s+/); return p.length < 2 ? n : p[0] + ' ' + p[p.length - 1][0] + '.'; };

  // pool → colour (theme tokens where they exist, literal fallbacks otherwise)
  const POOL_COL = {
    DA40CS: 'oklch(0.70 0.13 230)', DA40TDI: 'oklch(0.72 0.13 185)', SIM40: 'var(--col-sim)', SIM42: 'oklch(0.75 0.11 330)',
    DA42: 'oklch(0.66 0.19 350)', C172: 'oklch(0.80 0.15 70)', EXAM: 'oklch(0.80 0.16 140)',
  };
  const cellCol = e => e.kind === 'check' ? POOL_COL.EXAM : e.kind === 'auprt' ? POOL_COL.C172 : (POOL_COL[e.pool] || 'var(--ink-3)');
  const cellTxt = e => e.kind === 'check' ? e.code.replace(/^S/, '').slice(0, 3) : e.kind === 'auprt' ? 'U' + e.code.slice(-1) : String(e.num);

  const CSS = `
.mp{padding:14px 16px 40px;display:flex;flex-direction:column;gap:12px;max-width:100%;}
.mp h2{font-family:'Rajdhani',sans-serif;font-size:22px;margin:0;letter-spacing:.5px}
.mp .sub{font-size:11px;color:var(--ink-3);font-family:'JetBrains Mono',monospace}
.mp .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}
.mp .kpi .kv{font-size:24px}
.mp .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mp .ctl{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px 14px;padding:12px}
.mp .ctl label{display:flex;flex-direction:column;gap:3px;font-size:10px;color:var(--ink-3);font-family:'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.5px}
.mp .ctl .src{text-transform:none;letter-spacing:0;color:var(--ink-3);font-size:9.5px}
.mp input[type=number],.mp select,.mp input[type=text]{background:var(--bg-2);border:1px solid var(--line);color:var(--ink);border-radius:5px;padding:4px 7px;font-size:12px;font-family:'JetBrains Mono',monospace;width:100%;box-sizing:border-box}
.mp .dirty{border-color:var(--highlight)!important}
.mp table{border-collapse:collapse;width:100%;font-size:11.5px}
.mp th{position:sticky;top:0;background:var(--surface);z-index:2;text-align:left;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:var(--ink-3);font-weight:500;padding:6px 6px;border-bottom:1px solid var(--line);cursor:pointer;white-space:nowrap}
.mp td{padding:5px 6px;border-bottom:1px solid var(--line-soft);white-space:nowrap}
.mp td.n{font-family:'JetBrains Mono',monospace;text-align:right}
.mp .scroll{overflow:auto;max-height:620px}
.mp .grid td{padding:0;border-bottom:1px solid var(--line-soft);border-right:1px solid var(--line-soft)}
.mp .grid th{padding:2px 0;text-align:center;font-size:8.5px;min-width:22px}
.mp .grid th.we,.mp .grid td.we{background:color-mix(in oklch,var(--ink) 4%,transparent)}
.mp .grid th.hol,.mp .grid td.hol{background:color-mix(in oklch,var(--col-cancel) 14%,transparent)}
.mp .grid .nm{position:sticky;left:0;background:var(--surface);z-index:1;padding:3px 8px;font-size:11px;min-width:128px;border-right:1px solid var(--line)}
.mp .grid th.nm{z-index:3}
.mp .cell{display:flex;flex-direction:column;gap:1px;padding:1px}
.mp .cell span{display:block;border-radius:3px;font-size:9px;line-height:13px;text-align:center;font-family:'JetBrains Mono',monospace;color:#111;font-weight:600}
.mp .lg{display:flex;gap:10px;flex-wrap:wrap;font-size:10px;color:var(--ink-2);padding:8px 12px}
.mp .lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.mp .heat td.n{color:#111;font-weight:600}
.mp .note{font-size:11px;color:var(--ink-2);line-height:1.5;padding:10px 12px}
.mp .pass{color:var(--col-done)} .mp .fail{color:var(--col-cancel)}
.mp .tag{font-family:'JetBrains Mono',monospace;font-size:9.5px;padding:1px 5px;border-radius:4px;border:1px solid var(--line)}
.mp tr.sel td{background:color-mix(in oklch,var(--highlight) 10%,transparent)}
.mp .sched{display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px}
.mp .sched span{font-size:10px;font-family:'JetBrains Mono',monospace;padding:2px 6px;border-radius:4px;color:#111}
@media (max-width:640px){.mp{padding:10px}.mp .kpi .kv{font-size:20px}}
`;
  function useStyle() { useEffect(() => { if (document.getElementById('mp-style')) return; const s = document.createElement('style'); s.id = 'mp-style'; s.textContent = CSS; document.head.appendChild(s); }, []); }

  // heat colour for a utilisation fraction (0..1+)
  const heat = u => u == null ? 'transparent' : `oklch(${(0.93 - Math.min(1, u) * 0.28).toFixed(3)} ${(0.04 + Math.min(1, u) * 0.14).toFixed(3)} ${u >= 0.9 ? 25 : u >= 0.6 ? 70 : 145})`;

  // ── controls ───────────────────────────────────────────────────────────────
  function Num({ label, value, base, step, min, max, onChange, src, unit }) {
    const dirty = base != null && Math.abs((+value) - (+base)) > 1e-9;
    return h('label', null, label + (unit ? ` (${unit})` : ''),
      h('input', { type: 'number', step: step || 1, min, max, value, className: dirty ? 'dirty' : '', onChange: e => onChange(e.target.value === '' ? 0 : +e.target.value) }),
      h('span', { className: 'src' }, (src || '') + (base != null ? `${src ? ' · ' : ''}baseline ${base}` : '')));
  }
  function Sel({ label, value, opts, onChange, src }) {
    return h('label', null, label, h('select', { value, onChange: e => onChange(e.target.value) }, opts.map(([v, t]) => h('option', { key: v, value: v }, t))), src ? h('span', { className: 'src' }, src) : null);
  }

  function MasterPlanView() {
    useStyle();
    const d = window.useData ? window.useData() : null;
    const flights = (d && d.FLIGHTS) || window.FLIGHTS || [];
    const students = (d && d.students) || [];
    const curriculum = (d && d.curriculum) || [];
    const holidays = useMemo(() => [...((window.AP127_HOLIDAYS && [...window.AP127_HOLIDAYS]) || [])], []);
    const asOf = MP() ? MP().util.todayBKK() : '';
    const ctx = useMemo(() => ({ students, curriculum, flights, holidays }), [students, curriculum, flights, holidays]);

    const measured = useMemo(() => (MP() && students.length ? MP().measure(ctx, asOf) : null), [ctx, asOf]);
    const baseP = useMemo(() => (measured ? MP().defaults(measured) : null), [measured]);
    const [over, setOver] = useState(() => loadLS().over || {});
    const [ui, setUi] = useState(() => Object.assign({ sort: 'complete', dir: 1, showCtl: true, sel: null, gridFrom: 0 }, loadLS().ui || {}));
    useEffect(() => { saveLS({ over, ui: { sort: ui.sort, dir: ui.dir, showCtl: ui.showCtl } }); }, [over, ui.sort, ui.dir, ui.showCtl]);

    const P = useMemo(() => {
      if (!baseP) return null;
      const p = JSON.parse(JSON.stringify(baseP));
      Object.entries(over).forEach(([k, v]) => {
        if (k.startsWith('poolCap.')) p.poolCap[k.slice(8)] = v;
        else if (k === 'c172OpDays') p.c172OpDays = v;
        else if (k === 'extraHolidays') p.extraHolidays = v;
        else p[k] = v;
      });
      return p;
    }, [baseP, over]);

    // debounce plan recompute so typing in a field doesn't re-run 60 MC passes per keystroke
    const [Pd, setPd] = useState(null);
    useEffect(() => { const t = setTimeout(() => setPd(P), 220); return () => clearTimeout(t); }, [P]);
    const res = useMemo(() => (Pd && measured ? MP().plan(ctx, Pd, { asOf, measured }) : null), [Pd, measured]);
    const baseRes = useMemo(() => (baseP && measured ? MP().plan(ctx, Object.assign({}, baseP, { runs: 0 }), { asOf, measured }) : null), [baseP, measured]);
    const altSP = useMemo(() => (Pd && measured && Pd.checkMode === 'batch' ? MP().plan(ctx, Object.assign({}, Pd, { checkMode: 'individual', runs: 0 }), { asOf, measured }) : null), [Pd, measured]);
    const bt = useMemo(() => (measured ? MP().backtest(ctx, MP().util.addDays(asOf, -7), MP().util.addDays(asOf, -1)) : null), [measured]);
    const bt2 = useMemo(() => (measured ? MP().backtest(ctx, MP().util.addDays(asOf, -11), MP().util.addDays(asOf, -1)) : null), [measured]);
    const sc = useMemo(() => (res ? MP().selfCheck(res, bt) : null), [res, bt]);

    if (!MP()) return h('div', { className: 'mp' }, 'Master Plan engine failed to load (js/ap127-masterplan-model.js).');
    if (!measured || !res) return h('div', { className: 'mp' }, h('div', { className: 'sub' }, 'Waiting for the AP127 progress and ops feeds…'));

    const set = (k, v) => setOver(o => Object.assign({}, o, { [k]: v }));
    const reset = () => setOver({});
    const m = measured, B = res.batch, bB = baseRes && baseRes.batch;
    const changed = Object.keys(over).length > 0;

    // critical path: the pool with the most saturated weeks (≥90%) in the plan
    const sat = MP().POOLS.map(p => ({ p, n: res.weeks.filter(w => w.cap[p] > 0 && w.used[p] / w.cap[p] >= 0.9).length, last: res.weeks.filter(w => w.cap[p] > 0 && w.used[p] / w.cap[p] >= 0.9).map(w => w.week).pop() }))
      .sort((a, b) => b.n - a.n || (b.last || '').localeCompare(a.last || ''));
    const crit = sat[0] && sat[0].n ? sat[0] : null;

    const delta = (a, b) => { const v = dDiff(a, b); return v == null || !changed ? '' : ` (${sgn(v)}d vs baseline)`; };

    // ── KPI strip
    const kpis = h('div', { className: 'kpis' },
      h('div', { className: 'kpi acc' }, h('div', { className: 'kl' }, 'Course complete · whole batch'), h('div', { className: 'kv' }, fDY(B.planComplete)),
        h('div', { className: 'ks' }, `P50 ${fD(B.p50)} · P80 ${fD(B.p80)}${bB ? delta(B.planComplete, bB.planComplete) : ''}`),
        altSP ? h('div', { className: 'ks', title: 'Same plan, but each SP starts checks on their own lesson 96 + gap instead of waiting for the batch block' }, `if checks ran per SP: ${fD(altSP.batch.planComplete)}`) : null),
      h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'Lesson 96 · last SP'), h('div', { className: 'kv' }, fDY(B.plan96)),
        h('div', { className: 'ks' }, `P50 ${fD(B.p50_96)} · P80 ${fD(B.p80_96)}${bB ? delta(B.plan96, bB.plan96) : ''}`)),
      h('div', { className: 'kpi' }, h('div', { className: 'kl' }, 'First SP complete'), h('div', { className: 'kv' }, fDY(Object.values(res.perSP).map(v => v.plan.complete).filter(v => v && v !== 'done').sort()[0])),
        h('div', { className: 'ks' }, `${res.state.sps.length} SPs · ${res.state.sps.reduce((a, s) => a + s.remaining.length, 0)} lessons + ${res.state.sps.reduce((a, s) => a + 5 - s.auprtDone, 0)} UPRT + ${res.state.sps.reduce((a, s) => a + 3 - s.checksDone.length, 0)} checks left`)),
      h('div', { className: 'kpi rev' }, h('div', { className: 'kl' }, 'What sets the end date'), h('div', { className: 'kv' }, res.driver ? (res.driver.kind === 'check' ? 'Examiners' : res.driver.kind === 'auprt' ? 'C172 (UPRT)' : MP().POOL_LABEL[res.driver.pool]) : '—'),
        h('div', { className: 'ks' }, (res.driver ? `last sortie: ${res.driver.code} on ${fD(res.driver.date)}` : '') + (crit ? ` · longest saturated: ${MP().POOL_LABEL[crit.p]} ${crit.n} wk` : ''))),
      h('div', { className: 'kpi ' + (sc && sc.pass ? 'ok' : 'bad') }, h('div', { className: 'kl' }, 'Backtest · last 7 days'), h('div', { className: 'kv' }, bt ? `${bt.batchErrPct >= 0 ? '+' : ''}${bt.batchErrPct.toFixed(0)}%` : '—'),
        h('div', { className: 'ks' }, bt ? `${bt.predicted} predicted vs ${bt.actual} flown · ±${bt.mae}/SP` : '')));

    // ── controls
    const pl = MP().POOL_LABEL;
    const ctl = !ui.showCtl ? null : h('div', { className: 'panel' },
      h('div', { className: 'ph' }, h('b', null, 'Scenario — every assumption, measured then editable'),
        h('div', { className: 'row' }, changed ? h('span', { className: 'tag' }, Object.keys(over).length + ' changed') : h('span', { className: 'tag' }, 'baseline = recent week'),
          h('button', { className: 'chip', onClick: reset, disabled: !changed }, 'Reset to measured'))),
      h('div', { className: 'ctl' },
        h(Num, { label: 'AP-127 block hours / day', unit: 'avg day', value: P.budgetPerDay, base: baseP.budgetPerDay, step: 0.5, onChange: v => set('budgetPerDay', v), src: `last 7 days ${m.windows.base.map(fD).join('–')}: ${m.budget.last7Total}h` }),
        h(Num, { label: 'Share of school', unit: '×', value: P.budgetScale, base: 1, step: 0.05, onChange: v => set('budgetScale', v), src: 'what-if multiplier on the line above' }),
        ...['DA40CS', 'DA40TDI', 'DA42', 'SIM42'].map(p => h(Num, { key: p, label: pl[p] + ' cap', unit: 'h/day', value: P.poolCap[p], base: baseP.poolCap[p], step: 0.5, onChange: v => set('poolCap.' + p, v), src: m.pools[p].source })),
        h(Num, { label: 'C172 UPRT sorties / op-day', value: P.poolCap.C172, base: baseP.poolCap.C172, step: 0.2, onChange: v => set('poolCap.C172', v), src: `${m.pools.C172.source}; ${m.pools.C172.tails.join(', ')} · FI ${m.pools.C172.fis.join(', ')}${m.pools.C172.ref126 ? ` · AP-126 ran ${m.pools.C172.ref126}/day` : ''}` }),
        h('label', null, 'C172 operating days',
          h('div', { className: 'row', style: { gap: 3 } }, DOWS.map((n, i) => h('button', { key: n, className: 'chip' + (P.c172OpDays[i] ? ' sel' : ''), style: { padding: '3px 6px' }, onClick: () => { const a = P.c172OpDays.slice(); a[i] = !a[i]; set('c172OpDays', a); } }, n[0] + n[1]))),
          h('span', { className: 'src' }, 'measured: days UPRT flew in the last 30 days')),
        h(Num, { label: 'Examiner check sorties / weekday', value: P.poolCap.EXAM, base: baseP.poolCap.EXAM, step: 0.2, onChange: v => set('poolCap.EXAM', v), src: m.pools.EXAM.source }),
        h(Sel, { label: 'UPRT policy', value: P.auprtPolicy, onChange: v => set('auprtPolicy', v), opts: [['spare', 'Fit into C172 slots (as practised)'], ['after96', 'Only after lesson 96']], src: 'AP-127 today: started between lessons 74–91' }),
        h(Num, { label: 'UPRT may start after lesson', value: P.auprtFrom, base: baseP.auprtFrom, onChange: v => set('auprtFrom', v), src: 'earliest AP-127 start so far' }),
        h(Sel, { label: 'Final checks start', value: P.checkMode, onChange: v => set('checkMode', v), opts: [['batch', 'As AP-126: one block after the batch'], ['individual', 'Per SP: own lesson 96 + gap']], src: `AP-126: last L96 ${fD(m.checkGap.batchLast96)} → first check ${fD(m.checkGap.batchFirstCheck)}, then one block` }),
        P.checkMode === 'batch'
          ? h(Num, { label: 'Block opens after last SP\'s L96', unit: 'days', value: P.checkGap, base: baseP.checkGap, onChange: v => set('checkGap', v), src: `AP-126: ${m.checkGap.batch} days` })
          : h(Num, { label: 'Gap after own lesson 96', unit: 'days', value: P.checkGapSP, base: baseP.checkGapSP, onChange: v => set('checkGapSP', v), src: `AP-126 per SP: min ${m.checkGap.min}, median ${m.checkGap.median} (mostly waiting for the batch)` }),
        P.checkMode === 'batch' ? h(Num, { label: 'Block opens when', unit: '% with L96', value: P.checkBatchPct, base: baseP.checkBatchPct, onChange: v => set('checkBatchPct', v) }) : null,
        h(Num, { label: 'SIRME re-fly rate', value: P.sirmeRefly, base: baseP.sirmeRefly, step: 0.05, min: 0, max: 1, onChange: v => set('sirmeRefly', v), src: 'AP-126 SPs who needed a 2nd SIRME sortie' }),
        h(Num, { label: 'Max sorties per SP / 7 days', value: P.spMaxPerWeek, base: baseP.spMaxPerWeek, onChange: v => set('spMaxPerWeek', v), src: 'p90 of AP-127 SPs, last 30 days' }),
        h(Num, { label: 'Max AP-127 sorties per FI / day', value: P.fiMaxPerDay, base: baseP.fiMaxPerDay, onChange: v => set('fiMaxPerDay', v), src: 'p95, last 30 days' }),
        h(Sel, { label: 'Who flies first', value: P.priority, onChange: v => set('priority', v), opts: [['pace', 'As now (rotation weighted by recent pace)'], ['behind', 'Catch the tail up'], ['leaders', 'Push the leaders through']] }),
        h('label', null, 'Extra days off (YYYY-MM-DD, comma)', h('input', { type: 'text', defaultValue: (P.extraHolidays || []).join(', '), onBlur: e => set('extraHolidays', e.target.value.split(/[ ,;]+/).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x))) }),
          h('span', { className: 'src' }, 'holidays in use: ' + m.holidays.filter(x => x >= asOf).map(fD).join(', '))),
        h(Num, { label: 'Monte-Carlo runs', value: P.runs, base: baseP.runs, step: 10, min: 0, max: 300, onChange: v => set('runs', Math.max(0, Math.min(300, v))), src: 'seeded — same inputs, same dates' })));

    // ── per-SP table
    const rows = res.state.sps.map(s => {
      const p = res.perSP[s.id];
      return { s, p, next: (s.remaining[0] && s.remaining[0].code) || (s.auprtDone < 5 ? 'AUPRT 0' + (s.auprtDone + 1) : 'checks'),
        d96: p.plan.date96, complete: p.plan.complete, p50: p.p50.complete, p80: p.p80.complete, school: s.schoolFinish, vsSchool: dDiff(p.plan.date96, s.schoolFinish) };
    });
    const keyF = { name: r => r.s.name, done: r => r.s.doneCount, d96: r => r.d96 || '9', complete: r => r.complete || '9', p80: r => r.p80 || '9', vs: r => r.vsSchool == null ? 999 : r.vsSchool, up: r => r.s.auprtDone };
    rows.sort((a, b) => { const ka = keyF[ui.sort](a), kb = keyF[ui.sort](b); return (ka > kb ? 1 : ka < kb ? -1 : 0) * ui.dir; });
    const th = (k, t, title) => h('th', { title, onClick: () => setUi(u => Object.assign({}, u, { sort: k, dir: u.sort === k ? -u.dir : 1 })) }, t + (ui.sort === k ? (ui.dir > 0 ? ' ▲' : ' ▼') : ''));
    const selSp = ui.sel && res.perSP[ui.sel] ? res.state.sps.find(s => s.id === ui.sel) : null;
    const table = h('div', { className: 'panel' },
      h('div', { className: 'ph' }, h('b', null, 'Per-SP finish dates'), h('span', { className: 'sub' }, 'click a row for its dated lesson-by-lesson plan')),
      h('div', { className: 'scroll' }, h('table', null,
        h('thead', null, h('tr', null, th('name', 'SP'), h('th', null, 'SE'), th('done', 'Done'), h('th', null, 'Next'), th('up', 'UPRT'), h('th', null, 'Checks'),
          th('d96', 'Lesson 96'), h('th', { title: "The school's own planned date for the SP's last curriculum lesson (DB001)" }, 'School L96'), th('vs', 'vs school'),
          th('complete', 'Complete'), th('p80', 'P80'))),
        h('tbody', null, rows.map(r => h('tr', { key: r.s.id, className: ui.sel === r.s.id ? 'sel' : '', style: { cursor: 'pointer' }, onClick: () => setUi(u => Object.assign({}, u, { sel: u.sel === r.s.id ? null : r.s.id })) },
          h('td', null, shortName(r.s.name), r.s.nick ? h('span', { className: 'sub' }, ' ' + r.s.nick) : null),
          h('td', null, h('span', { className: 'tag', style: { borderColor: POOL_COL[r.s.se] } }, r.s.se === 'DA40TDI' ? 'TDI' : 'CS')),
          h('td', { className: 'n' }, r.s.doneCount + '/96'), h('td', { className: 'sub' }, r.next),
          h('td', { className: 'n' }, r.s.auprtDone + '/5'), h('td', { className: 'n' }, r.s.checksDone.length + '/3'),
          h('td', { className: 'n' }, fD(r.d96)), h('td', { className: 'n sub' }, fD(r.school)),
          h('td', { className: 'n', style: { color: r.vsSchool == null ? '' : r.vsSchool > 0 ? 'var(--col-cancel)' : 'var(--col-done)' } }, r.vsSchool == null ? '' : sgn(r.vsSchool) + 'd'),
          h('td', { className: 'n', style: { fontWeight: 700 } }, fD(r.complete)), h('td', { className: 'n sub' }, fD(r.p80))))))),
      selSp ? h('div', null,
        h('div', { className: 'note' }, h('b', null, selSp.name), ` · ${selSp.se} · FI ${selSp.fi || '—'} · ${res.perSP[selSp.id].plan.sorties} sorties planned · complete ${fDY(res.perSP[selSp.id].plan.complete)} (P50 ${fD(res.perSP[selSp.id].p50.complete)}, P80 ${fD(res.perSP[selSp.id].p80.complete)})`),
        h('div', { className: 'sched' }, res.perSP[selSp.id].plan.log.map((e, i) => h('span', { key: i, style: { background: cellCol(e) }, title: `${e.code} · ${MP().POOL_LABEL[e.pool] || e.pool} · ${e.mins} min` }, `${fD(e.date)} ${e.code}`)))) : null);

    // ── the master plan grid: SP × day
    const days = res.base.days.map(x => x.date);
    const byDay = {}; res.state.sps.forEach(s => { res.perSP[s.id].plan.log.forEach(e => { ((byDay[s.id] = byDay[s.id] || {})[e.date] = byDay[s.id][e.date] || []).push(e); }); });
    const holSet = new Set([...m.holidays, ...(P.extraHolidays || [])]);
    const gridOrder = res.state.sps.slice().sort((a, b) => (res.perSP[a.id].plan.complete || '9').localeCompare(res.perSP[b.id].plan.complete || '9'));
    const grid = h('div', { className: 'panel' },
      h('div', { className: 'ph' }, h('b', null, 'Master plan — every SP, every day'), h('span', { className: 'sub' }, `${fD(days[0])} → ${fD(days[days.length - 1])} · ${res.base.days.reduce((a, x) => a + x.n, 0)} sorties · ordered by finish`)),
      h('div', { className: 'lg' }, ...[['DA40CS', 'DA40 CS lesson'], ['DA40TDI', 'DA40 TDI lesson'], ['SIM42', 'DA42 SIM (91–92)'], ['DA42', 'DA42 (93–96)'], ['C172', 'UPRT (C172)'], ['EXAM', 'Skill check']].map(([k, t]) => h('span', { key: k }, h('i', { style: { background: POOL_COL[k] } }), t)),
        h('span', null, h('i', { style: { background: 'color-mix(in oklch,var(--col-cancel) 30%,transparent)' } }), 'holiday')),
      h('div', { className: 'scroll' }, h('table', { className: 'grid' },
        h('thead', null,
          h('tr', null, h('th', { className: 'nm' }, ''), days.map(dd => h('th', { key: dd, className: (holSet.has(dd) ? 'hol' : (MP().util.dow(dd) % 6 === 0 ? 'we' : '')) }, +dd.slice(8, 10) === 1 || dd === days[0] ? MON[+dd.slice(5, 7) - 1] : ''))),
          h('tr', null, h('th', { className: 'nm' }, 'SP'), days.map(dd => h('th', { key: dd, className: (holSet.has(dd) ? 'hol' : (MP().util.dow(dd) % 6 === 0 ? 'we' : '')), title: `${DOWS[MP().util.dow(dd)]} ${fD(dd)}` }, +dd.slice(8, 10))))),
        h('tbody', null, gridOrder.map(s => h('tr', { key: s.id },
          h('td', { className: 'nm', title: s.name }, shortName(s.name), h('span', { className: 'sub' }, ' ' + fD(res.perSP[s.id].plan.complete))),
          days.map(dd => { const es = (byDay[s.id] || {})[dd]; return h('td', { key: dd, className: (holSet.has(dd) ? 'hol' : (MP().util.dow(dd) % 6 === 0 ? 'we' : '')) },
            es ? h('div', { className: 'cell' }, es.map((e, i) => h('span', { key: i, style: { background: cellCol(e) }, title: `${shortName(s.name)} · ${fD(dd)} · ${e.code} · ${MP().POOL_LABEL[e.pool] || e.pool} · ${e.mins} min` }, cellTxt(e)))) : null); })))))));

    // ── weekly resource load
    const heatT = h('div', { className: 'panel' },
      h('div', { className: 'ph' }, h('b', null, 'Resource load per week (plan)'), h('span', { className: 'sub' }, 'used ÷ capacity · ≥90% red = the constraint that week')),
      h('div', { className: 'scroll', style: { maxHeight: 'none' } }, h('table', { className: 'heat' },
        h('thead', null, h('tr', null, h('th', null, 'Week of'), h('th', null, 'Sorties'), h('th', null, 'AP-127 hours'), ...MP().POOLS.filter(p => p !== 'SIM40').map(p => h('th', { key: p }, pl[p])))),
        h('tbody', null, res.weeks.map(w => h('tr', { key: w.week },
          h('td', null, fD(w.week)), h('td', { className: 'n', style: { color: 'var(--ink)', fontWeight: 400 } }, w.sorties),
          h('td', { className: 'n', style: { background: heat(w.budget ? w.usedB / w.budget : null) } }, `${Math.round(w.usedB)}h · ${w.budget ? Math.round(w.usedB / w.budget * 100) : 0}%`),
          ...MP().POOLS.filter(p => p !== 'SIM40').map(p => { const u = w.cap[p] ? w.used[p] / w.cap[p] : null; return h('td', { key: p, className: 'n', style: { background: heat(u) } }, u == null ? '—' : Math.round(u * 100) + '%'); })))))));

    // ── assumptions & proof
    const poolRows = MP().POOLS.map(p => h('tr', { key: p }, h('td', null, pl[p]), h('td', { className: 'n' }, m.pools[p].capH + ' ' + m.pools[p].unit), h('td', { className: 'n' }, m.pools[p].last7), h('td', { className: 'sub' }, m.pools[p].source)));
    const proof = h('div', { className: 'panel' },
      h('div', { className: 'ph' }, h('b', null, 'How this plan is built — and proof it matches reality')),
      h('div', { className: 'note' },
        h('div', null, `Baseline (the recent week, ${m.windows.base.map(fD).join('–')}): AP-127 flew ${m.counts.comp7} sorties; ${m.budget.last7Total} block hours on DA40/DA42/SIM = ${m.budget.perDay} h/day. Over 30 days it averaged ${m.budget.last30PerDay} h/day even as the mix moved from SIM to aircraft — the school gives the batch a stable share of its day, so that share is the plan's main constraint. Day-of-week shape (30 days): ${DOWS.map((n, i) => n + ' ' + m.budget.dowShape[i].toFixed(2)).join(' · ')}. Cancels ${(m.cancelRate30 * 100).toFixed(1)}% (30 days) are already netted out of these flown hours; the Monte-Carlo runs replay the real day-to-day swing (${m.budget.dayFactors.length} working days, sampled as 7-day blocks) plus a 6% SP no-show. The budget excludes the C172 (UPRT has its own aircraft and FI).`),
        h('div', { style: { marginTop: 6 } }, 'Course = 96 curriculum lessons + 5 Advanced UPRT (C172, 60 min) + 3 final skill checks as AP-126 flew them: SCPLME (CPL ME, DA42, 100 min), SCRSE (CPL/IR SE, DA40, 60 min), SIRME (IR ME, DA42, 120 min). Lesson durations are the median actual block time of each lesson across AP-124…129.')),
      h('table', null, h('thead', null, h('tr', null, h('th', null, 'Pool'), h('th', null, 'Cap used by plan'), h('th', null, 'AP-127 last 7d avg'), h('th', null, 'Source'))), h('tbody', null, poolRows)),
      h('div', { className: 'note' }, h('b', null, 'Backtests'), ' — stand at a past date, measure only what was known then, plan forward, compare with what each SP actually flew:'),
      h('table', null, h('thead', null, h('tr', null, h('th', null, 'Window'), h('th', null, 'Predicted'), h('th', null, 'Actual'), h('th', null, 'Batch error'), h('th', null, 'Per-SP error (MAE)'), h('th', null, 'Avg flown / SP'))),
        h('tbody', null, [bt, bt2].filter(Boolean).map(b => h('tr', { key: b.from }, h('td', null, `${fD(b.from)} → ${fD(b.to)} (${b.days}d)`), h('td', { className: 'n' }, b.predicted), h('td', { className: 'n' }, b.actual),
          h('td', { className: 'n' }, `${b.batchErrPct >= 0 ? '+' : ''}${b.batchErrPct.toFixed(1)}%`), h('td', { className: 'n' }, '±' + b.mae), h('td', { className: 'n' }, b.avgActual))))),
      h('div', { className: 'note' }, h('b', null, 'Self-check '), sc ? h('span', { className: sc.pass ? 'pass' : 'fail' }, sc.pass ? 'PASS' : 'FAIL') : null,
        h('ul', { style: { margin: '6px 0 0', paddingLeft: 18 } }, (sc ? sc.checks : []).map((c, i) => h('li', { key: i }, h('span', { className: c.pass ? 'pass' : 'fail' }, c.pass ? '✓ ' : '✗ '), c.name, c.detail ? h('span', { className: 'sub' }, ' — ' + c.detail) : null)))),
      h('div', { className: 'note sub' }, 'P50/P80 replay the last 30 days\u2019 day-to-day swing in whole 7-day blocks (the 24\u201325 Oct stand-down included) plus a 6% SP no-show; they do NOT include longer stand-downs, leave or maintenance, so the real spread is wider. An UPRT sortie normally takes the SP\u2019s day (only 9 of 166 UPRT sorties had another sortie the same day), so more C172 capacity pulls UPRT forward but can push a few lessons later. The C172 and its FI sit outside the AP-127 hour budget. '), h('div', { className: 'note sub' }, 'Not modelled: individual leave, aircraft maintenance downtime and weather seasons beyond the last 30 days — add days off above, or lower a pool cap, to try them. The plan re-measures itself from the live feed every time the page loads.'));

    return h('div', { className: 'mp' },
      h('div', { className: 'row', style: { justifyContent: 'space-between' } },
        h('div', null, h('h2', null, 'AP-127 Master Plan'), h('div', { className: 'sub' }, `as of ${fDY(asOf)} · plan starts ${fD(MP().util.addDays(asOf, 1))} · ${res.runs} seeded Monte-Carlo runs · ops feed ${((window.FLIGHT_DATA && window.FLIGHT_DATA.fetchedAt) || '').slice(0, 16).replace('T', ' ')}Z`)),
        h('button', { className: 'chip' + (ui.showCtl ? ' sel' : ''), onClick: () => setUi(u => Object.assign({}, u, { showCtl: !u.showCtl })) }, ui.showCtl ? 'Hide scenario' : 'Scenario ⚙')),
      kpis, ctl, grid, table, heatT, proof);
  }

  window.MasterPlanView = MasterPlanView;
})();
