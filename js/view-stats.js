/* AP127 V2 — Batch Stats (Progress → "Batch Stats").
 *
 * One page answering "how is the batch doing, and who is carrying it?":
 *   Overview · Flying · Cancels & changes · Leave · Contribution
 * with one control bar (period · group-by · whole batch / one SP) shared by
 * every section. All maths lives in js/ap127-stats-model.js (pure, Node-tested);
 * this file only fetches, lays out and draws.
 *
 * Refreshes itself: the ops feed, the progress feed and the watchdog change log
 * are all fetched live on page load, so new flights, cancels, changes and leave
 * show up with no code change.
 *
 * Plain script (React.createElement, no JSX). Reads shared.js globals lazily at
 * render time (shared.js is Babel-compiled and runs after this file loads).
 */
(function () {
  const { useState, useMemo, useEffect, useRef } = React;
  const h = React.createElement;
  const WATCHDOG_URL = 'https://ap127-watchdog.anusorn-tanmetha.workers.dev';
  const LOG_FIRST_MONTH = '2026-06';            // watchdog log starts 05 Jun 2026
  const LS = 'ap127v2-stats-ui';
  const loadUI = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const saveUI = s => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} };

  // ── Formatting ──────────────────────────────────────────────────────────
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOWN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const fD = s => s ? `${+s.slice(8, 10)} ${MON[+s.slice(5, 7) - 1]}` : '—';
  const fDY = s => s ? `${fD(s)} ${s.slice(2, 4)}` : '—';
  const fM = s => `${MON[+s.slice(5, 7) - 1]} ${s.slice(2, 4)}`;
  const fBucket = (b, g) => g === 'month' ? fM(b) : g === 'week' ? 'wk ' + fD(b) : fD(b);
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const n1 = v => (Math.round((v || 0) * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const hrs = v => n1(v) + 'h';
  const pct = (v, d) => ((v || 0) * 100).toFixed(d == null ? 1 : d) + '%';
  const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + n0(Math.abs(v));
  const days = v => (Math.round((v || 0) * 2) / 2).toString().replace(/\.0$/, '');
  const tint = (c, p) => `color-mix(in oklch, ${c} ${p}%, transparent)`;

  // ── Colours: read theme tokens from <body> (the theme attribute lives there)
  //    and resolve them to rgb through a 1px canvas, so Chart.js's colour
  //    parser never sees oklch().
  const _cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (_cv) { _cv.width = _cv.height = 1; }
  const rgb = css => {
    try {
      const x = _cv.getContext('2d', { willReadFrequently: true });
      x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = css; x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`;
    } catch (e) { return css; }
  };
  const alpha = (c, a) => c.replace(/^rgb\((.*)\)$/, `rgba($1,${a})`);
  const tok = name => rgb(getComputedStyle(document.body).getPropertyValue(name).trim() || '#888');
  const palette = () => ({
    ink: tok('--ink'), ink2: tok('--ink-2'), ink3: tok('--ink-3'), line: tok('--line-soft'),
    acc: tok('--highlight'), done: tok('--col-done'), cancel: tok('--col-cancel'), pend: tok('--col-pending'),
    sim: tok('--col-sim'), stby: tok('--col-stby'), solo: tok('--col-solo'), surface: tok('--surface'),
  });
  const CANCEL_COL = { wx: '--col-stby', ac: '--col-pending', sp: '--highlight', fi: '--col-sim', ops: '--col-done', other: '--ink-3' };
  const CHANGE_COL = { time: '--col-pending', ac: '--col-stby', fi: '--col-sim', lesson: '--highlight' };
  const LEAVE_COL = { sick: 'oklch(0.66 0.17 25)', medical: 'oklch(0.70 0.15 350)', personal: 'oklch(0.68 0.13 255)', annual: 'oklch(0.72 0.14 150)', duty: 'oklch(0.76 0.14 80)', training: 'oklch(0.70 0.12 200)', exam: 'oklch(0.66 0.15 295)', other: 'oklch(0.62 0.03 245)' };
  const LEAVE_LABEL = { sick: 'Sick', medical: 'Medical', personal: 'Personal', annual: 'Annual', duty: 'Official duty', training: 'Training', exam: 'Exam / CAAT', other: 'Other' };

  // ── Change-log loader (one fetch per month, cached for the session) ─────
  let _logPromise = null;
  function loadLog(today) {
    if (_logPromise) return _logPromise;
    const months = [];
    for (let m = LOG_FIRST_MONTH; m <= today.slice(0, 7);) {
      months.push(m);
      const y = +m.slice(0, 4), mo = +m.slice(5, 7);
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    }
    _logPromise = Promise.allSettled(months.map(m => fetch(`${WATCHDOG_URL}/log?month=${m}`).then(r => r.ok ? r.json() : Promise.reject(r.status))))
      .then(rs => {
        const ok = rs.filter(r => r.status === 'fulfilled');
        if (!ok.length) throw new Error('change log unavailable');
        return { entries: ok.flatMap(r => Array.isArray(r.value) ? r.value : []), months: months.length, loaded: ok.length };
      });
    _logPromise.catch(() => { _logPromise = null; });   // allow a retry on the next visit
    return _logPromise;
  }

  // ── OPS ⇄ PROGRESS augmentation ─────────────────────────────────────────
  // The same rule AP127 Detail V5 (opsAugmentV5) and V6 (opsAugment) apply: an
  // Ops booking marked Completed for a curriculum lesson the Progress feed hasn't
  // posted yet is credited. Kept identical so this tab's lesson counts always
  // equal V5/V6's on the same day. Uses AP127Reconcile's key helpers.
  function opsAugment(students, curriculum) {
    const R = window.AP127Reconcile;
    const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
    if (!R || !Array.isArray(students)) return { students, extraLessons: 0 };
    const comp = {};
    flights.forEach(f => {
      if (!f.student || !f.lesson || !R.isAP127(f.batch)) return;
      if (f.status === 'Completed' && f.date) { const k = R.ccNameNorm(f.student); (comp[k] = comp[k] || {})[R.normLesson(f.lesson)] = f; }
    });
    const curNorm = new Set((curriculum || []).map(c => R.normLesson(c.lesson)));
    let extraLessons = 0;
    const out = students.map(s => {
      const key = R.ccKeyFromFull(s.name);
      const flownNorm = new Set((s.flown || []).map(f => R.normLesson(f.lesson)));
      const extra = [];
      Object.keys(comp[key] || {}).forEach(nl => {
        if (!flownNorm.has(nl) && curNorm.has(nl)) {
          const f = comp[key][nl];
          extra.push({ lesson: f.lesson, actual_mins: f.durMin || f.actual_mins || 0, actual_ft: f.duration || '', date: f.date, _ops: true });
        }
      });
      if (!extra.length) return s;
      extraLessons += extra.length;
      return Object.assign({}, s, { flown: [...(s.flown || []), ...extra].sort((a, b) => (a.date || '').localeCompare(b.date || '')), total: s.total || (curriculum || []).length });
    });
    return { students: out, extraLessons };
  }

  // ── Atoms ───────────────────────────────────────────────────────────────
  const Label = ({ children, style }) => h('span', { className: 'mono uc', style: Object.assign({ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em' }, style) }, children);
  const Chip = ({ on, onClick, children, title }) => h('button', { className: 'chip' + (on ? ' sel' : ''), onClick, title, style: { whiteSpace: 'nowrap' } }, children);
  const Info = ({ text }) => h('span', { title: text, style: { cursor: 'help', color: 'var(--ink-3)', fontSize: 11, marginLeft: 4 } }, 'ⓘ');

  function Kpi({ label, value, sub, tone, title }) {
    return h('div', { className: 'kpi' + (tone ? ' ' + tone : ''), title },
      h('div', { className: 'kl' }, label),
      h('div', { className: 'kv', style: { fontSize: 26 } }, value),
      sub ? h('div', { className: 'ks' }, sub) : null);
  }

  function Panel({ title, sub, info, right, children, pad = true, style }) {
    return h('div', { className: 'panel', style: Object.assign({ minWidth: 0 }, style) },
      h('div', { className: 'ph' },
        h('div', { style: { minWidth: 0 } },
          h('div', { className: 'mono uc', style: { fontSize: 11, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.08em' } }, title, info ? h(Info, { text: info }) : null),
          sub ? h('div', { style: { fontSize: 11, color: 'var(--ink-3)', marginTop: 2 } }, sub) : null),
        right || null),
      h('div', { className: pad ? 'pb' : '', style: { minWidth: 0 } }, children));
  }

  const Grid = ({ min = 320, children, gap = 12 }) => h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap } }, children);

  // Horizontal proportion bars (reason breakdowns etc.) — DOM, theme-correct.
  function Bars({ rows, total, fmt, empty }) {
    if (!rows.length) return h('div', { style: { fontSize: 12, color: 'var(--ink-3)', padding: '6px 0' } }, empty || 'Nothing in this period.');
    const max = Math.max(1, ...rows.map(r => r.v));
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 } },
      rows.map(r => h('div', { key: r.k, title: r.title || '' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3, gap: 8 } },
          h('span', { style: { color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.label),
          h('span', { className: 'mono', style: { color: 'var(--ink)', whiteSpace: 'nowrap' } }, fmt ? fmt(r.v) : n0(r.v),
            total ? h('span', { style: { color: 'var(--ink-3)', marginLeft: 6 } }, pct(r.v / total, 0)) : null)),
        h('div', { style: { height: 7, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' } },
          h('div', { style: { width: (r.v / max * 100) + '%', height: '100%', background: r.c || 'var(--highlight)', borderRadius: 4 } })))));
  }

  // Sortable table with a sticky first column.
  function Table({ cols, rows, initial, maxHeight, onRow, foot }) {
    const [sort, setSort] = useState(initial || { k: cols[1].k, dir: -1 });
    const sorted = useMemo(() => {
      const c = cols.find(x => x.k === sort.k);
      const val = c && c.sv ? c.sv : (r => r[sort.k]);
      return rows.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
      });
    }, [rows, sort]);
    const th = { position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2, padding: '7px 8px', textAlign: 'right', fontSize: 9, color: 'var(--ink-3)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
    const td = { padding: '6px 8px', textAlign: 'right', fontSize: 12, borderBottom: '1px solid var(--line-soft)', whiteSpace: 'nowrap' };
    const stick = { position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1, textAlign: 'left' };
    return h('div', { style: { overflow: 'auto', maxHeight: maxHeight || 'none' } },
      h('table', { style: { borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontVariantNumeric: 'tabular-nums' } },
        h('thead', null, h('tr', null, cols.map((c, i) => h('th', {
          key: c.k, className: 'mono uc', title: c.title || '', tabIndex: 0, role: 'button',
          'aria-sort': sort.k === c.k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none',
          onClick: () => setSort(s => ({ k: c.k, dir: s.k === c.k ? -s.dir : (c.asc ? 1 : -1) })),
          onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSort(s => ({ k: c.k, dir: s.k === c.k ? -s.dir : (c.asc ? 1 : -1) })); } },
          style: Object.assign({}, th, i === 0 ? Object.assign({}, stick, { zIndex: 3, top: 0 }) : {}, sort.k === c.k ? { color: 'var(--highlight)' } : {}),
        }, c.label, sort.k === c.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '')))),
        h('tbody', null, sorted.map((r, ri) => h('tr', { key: r.key || ri, onClick: onRow ? () => onRow(r) : undefined, style: { cursor: onRow ? 'pointer' : 'default' } },
          cols.map((c, i) => h('td', { key: c.k, title: c.tip ? c.tip(r) : '', style: Object.assign({}, td, i === 0 ? stick : {}, c.style ? c.style(r) : {}) }, c.f ? c.f(r, ri) : r[c.k]))))),
        foot ? h('tfoot', null, h('tr', null, cols.map((c, i) => h('td', { key: c.k, style: Object.assign({}, td, { fontWeight: 700, borderTop: '1px solid var(--line)', color: 'var(--ink)' }, i === 0 ? stick : {}) }, foot[c.k] != null ? foot[c.k] : '')))) : null));
  }

  // Chart.js canvas. `cfg(pal)` builds the config from the current palette.
  function ChartBox({ cfg, height = 260, deps }) {
    const ref = useRef(null);
    useEffect(() => {
      if (!ref.current || !window.Chart) return;
      const c = cfg(palette());
      if (!c) return;
      c.options = c.options || {};
      c.options.responsive = true; c.options.maintainAspectRatio = false; c.options.animation = false;
      c.options.plugins = Object.assign({ datalabels: { display: false } }, c.options.plugins || {});
      const ch = new window.Chart(ref.current, c);
      return () => ch.destroy();
    }, deps);
    return h('div', { style: { position: 'relative', height, minWidth: 0 } }, h('canvas', { ref }));
  }

  const axes = (pal, o) => {
    const ox = o || {};
    return {
      x: Object.assign({ stacked: !!ox.stacked, grid: { display: false }, ticks: { color: pal.ink3, font: { size: 10 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } }, ox.x || {}),
      y: Object.assign({ stacked: !!ox.stacked, beginAtZero: true, grid: { color: pal.line }, ticks: { color: pal.ink3, font: { size: 10 } }, title: ox.yTitle ? { display: true, text: ox.yTitle, color: pal.ink3, font: { size: 10 } } : undefined }, ox.y || {}),
    };
  };
  const legend = pal => ({ position: 'bottom', labels: { color: pal.ink2, boxWidth: 10, boxHeight: 10, font: { size: 11 } } });
  const tooltip = { mode: 'index', intersect: false };

  // ── Batch activity heatmap (GitHub-style; weeks × weekdays) ─────────────
  function Heatmap({ daily, from, to, holidays, metric }) {
    const U = window.AP127Stats.util;
    const byDate = new Map(daily.map(d => [d.date, d]));
    const start = U.weekStart(from);
    const weeks = [];
    for (let w = start; w <= to; w = U.addD(w, 7)) weeks.push(w);
    const val = d => d ? (metric === 'sorties' ? d.sorties : d.mins / 60) : 0;
    const max = Math.max(1, ...daily.map(val));
    const cell = Math.max(11, Math.min(20, Math.floor(1100 / (weeks.length + 2)) - 3));   // fill the panel on short ranges
    return h('div', { style: { overflowX: 'auto', paddingBottom: 4 } },
      h('div', { style: { display: 'inline-grid', gridTemplateColumns: `28px repeat(${weeks.length}, ${cell}px)`, gridAutoRows: cell + 'px', gap: 3, alignItems: 'center' } },
        h('span'), weeks.map((w, i) => h('span', { key: 'm' + w, className: 'mono', style: { fontSize: 9, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'visible' } },
          (i === 0 || w.slice(5, 7) !== weeks[i - 1].slice(5, 7)) ? MON[+w.slice(5, 7) - 1] : '')),
        [1, 2, 3, 4, 5, 6, 0].map((dw, r) => [
          h('span', { key: 'l' + dw, className: 'mono', style: { fontSize: 9, color: 'var(--ink-3)' } }, r % 2 === 0 ? DOWN[dw] : ''),
          weeks.map(w => {
            const d = U.addD(w, r);
            if (d < from || d > to) return h('span', { key: d });
            const rec = byDate.get(d), v = val(rec), wk = dw === 0 || dw === 6 || holidays.has(d);
            const bg = v > 0 ? `color-mix(in oklch, var(--highlight) ${Math.round(18 + 82 * v / max)}%, var(--bg-2))` : 'var(--bg-2)';
            return h('span', { key: d, title: `${DOWN[dw]} ${fDY(d)}${holidays.has(d) ? ' · holiday' : ''}\n${rec ? `${rec.sorties} sorties · ${hrs(rec.mins / 60)} · ${rec.sps} SP` : 'no flying'}`,
              style: { width: cell, height: cell, borderRadius: 3, background: bg, outline: wk ? '1px solid ' + tint('var(--col-pending)', 55) : 'none', outlineOffset: -1 } });
          }),
        ])),
      h('div', { style: { display: 'flex', gap: 14, marginTop: 8, fontSize: 10, color: 'var(--ink-3)', flexWrap: 'wrap', alignItems: 'center' } },
        h('span', null, 'Less'),
        [0, 25, 50, 75, 100].map(p => h('span', { key: p, style: { width: 11, height: 11, borderRadius: 2, display: 'inline-block', background: p ? `color-mix(in oklch, var(--highlight) ${18 + 0.82 * p}%, var(--bg-2))` : 'var(--bg-2)' } })),
        h('span', null, 'More'),
        h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } }, h('span', { style: { width: 11, height: 11, borderRadius: 2, display: 'inline-block', outline: '1px solid ' + tint('var(--col-pending)', 70) } }), 'weekend / holiday')));
  }

  // ════════════════════════════════════════════════════════════════════════
  function StatsView() {
    const d = window.useApp ? window.useApp() : window.useData();
    const today = window.bkkToday ? window.bkkToday() : new Date().toISOString().slice(0, 10);
    const saved = useMemo(loadUI, []);
    const [tab, setTab] = useState(saved.tab || 'overview');
    const [preset, setPreset] = useState(saved.preset || 'all');
    const [custom, setCustom] = useState({ from: '', to: '' });
    const [gran, setGran] = useState(saved.gran || 'week');
    const [sp, setSp] = useState(null);
    const [log, setLog] = useState({ state: 'loading', entries: null });
    const [themeTick, setThemeTick] = useState(0);
    const [heatMetric, setHeatMetric] = useState('hours');

    useEffect(() => { saveUI({ tab, preset, gran }); }, [tab, preset, gran]);
    useEffect(() => {
      let live = true;
      loadLog(today).then(r => { if (live) setLog({ state: r.loaded < r.months ? 'partial' : 'ok', entries: r.entries }); })
        .catch(() => { if (live) setLog({ state: 'error', entries: null }); });
      return () => { live = false; };
    }, []);
    useEffect(() => {   // charts re-colour when the theme switches
      const mo = new MutationObserver(() => setThemeTick(t => t + 1));
      mo.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
      return () => mo.disconnect();
    }, []);

    const Stats = window.AP127Stats;
    const roster = useMemo(() => (window.AP127_ROSTER || []).map(([name, nick, fi, se]) => ({
      name, nick, se, fi: (window.AP127_FI_FULL && window.AP127_FI_FULL[fi]) || fi, fiNick: fi,
    })), []);
    const progress = useMemo(() => {
      if (!window.AP127V5Model || !d.students || !d.students.length) return null;
      try {
        const aug = opsAugment(d.students, d.curriculum);
        const m = window.AP127V5Model.buildModel(aug.students, d.curriculum, { updatedAt: d.progressMeta && d.progressMeta.updated });
        m._opsExtra = aug.extraLessons;
        return m;
      } catch (e) { console.warn('[stats] progress model failed', e); return null; }
    }, [d.students, d.curriculum]);
    const base = useMemo(() => Stats.build({
      flights: d.FLIGHTS || window.FLIGHTS || [],
      roster,
      leaves: window.AP127Leave ? window.AP127Leave.records() : [],
      log: log.entries || [],
      progress,
      aliases: window.AP127_STUDENT_ALIASES || {},
      holidays: d.HOLIDAYS || new Set(),
      today,
    }), [progress, log.entries, roster]);

    const U = Stats.util;
    const range = useMemo(() => {
      const first = base.firstDate;
      const r = { all: [first, today], d90: [U.addD(today, -89), today], d30: [U.addD(today, -29), today], d7: [U.addD(today, -6), today],
        mtd: [today.slice(0, 8) + '01', today],
        lastm: (() => { const f = U.addD(today.slice(0, 8) + '01', -1); return [f.slice(0, 8) + '01', f]; })(),
        custom: [custom.from || first, custom.to || today] }[preset] || [first, today];
      return [r[0] < first ? first : r[0], r[1]];
    }, [preset, custom, base.firstDate, today]);
    const S = useMemo(() => Stats.summarize(base, { from: range[0], to: range[1], gran, sp }), [base, range, gran, sp]);
    const check = useMemo(() => Stats.selfCheck(base, S), [base, S]);
    const deps = [S, themeTick];
    const spInfo = sp ? base.byKey.get(sp) : null;
    const nick = k => (base.byKey.get(k) || {}).nick || k;

    // ── Control bar ───────────────────────────────────────────────────────
    const PRESETS = [['all', 'All time'], ['d90', '90 days'], ['d30', '30 days'], ['d7', '7 days'], ['mtd', 'This month'], ['lastm', 'Last month'], ['custom', 'Custom']];
    const TABS = [['overview', 'Overview'], ['flying', 'Flying'], ['disrupt', 'Cancels & changes'], ['leave', 'Leave'], ['contrib', 'Contribution']];
    const inputStyle = { background: 'var(--bg-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, padding: '4px 6px', fontSize: 11, fontFamily: 'JetBrains Mono,monospace' };
    const bar = h('div', { style: { position: d.isMobile ? 'static' : 'sticky', top: 0, zIndex: 20, background: 'var(--bg)', padding: '10px 0 10px', borderBottom: '1px solid var(--line-soft)', marginBottom: 14 } },
      h('div', { style: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' } },
        h('div', { style: { display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' } }, h(Label, { style: { marginRight: 2 } }, 'Period'),
          PRESETS.map(([k, l]) => h(Chip, { key: k, on: preset === k, onClick: () => setPreset(k) }, l)),
          preset === 'custom' ? h('span', { style: { display: 'inline-flex', gap: 4, alignItems: 'center' } },
            h('input', { type: 'date', value: custom.from || base.firstDate, min: base.firstDate, max: today, onChange: e => setCustom(c => Object.assign({}, c, { from: e.target.value })), style: inputStyle }),
            h('span', { className: 'muted' }, '→'),
            h('input', { type: 'date', value: custom.to || today, min: base.firstDate, max: today, onChange: e => setCustom(c => Object.assign({}, c, { to: e.target.value })), style: inputStyle })) : null),
        h('div', { style: { display: 'flex', gap: 5, alignItems: 'center' } }, h(Label, { style: { marginRight: 2 } }, 'Group by'),
          [['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => h(Chip, { key: k, on: gran === k, onClick: () => setGran(k) }, l))),
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } }, h(Label, null, 'Who'),
          h('select', { value: sp || '', onChange: e => setSp(e.target.value || null), style: Object.assign({}, inputStyle, { fontSize: 12, padding: '5px 8px', maxWidth: 260 }) },
            h('option', { value: '' }, `Whole batch (${base.roster.length} SP)`),
            base.roster.slice().sort((a, b) => a.nick.localeCompare(b.nick)).map(r => h('option', { key: r.key, value: r.key }, `${r.nick} · ${r.name}`))),
          sp ? h(Chip, { on: false, onClick: () => setSp(null) }, '✕ batch') : null)),
      h('div', { style: { display: 'flex', gap: 2, marginTop: 10, borderBottom: '1px solid var(--line)', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' } },
        TABS.map(([k, l]) => h('button', { key: k, onClick: () => setTab(k), className: 'mono uc',
          style: { background: 'transparent', border: 'none', borderBottom: '2px solid ' + (tab === k ? 'var(--highlight)' : 'transparent'), color: tab === k ? 'var(--highlight)' : 'var(--ink-2)', padding: '8px 12px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: tab === k ? 700 : 500, marginBottom: 0 } }, l))));

    const K = S.kpi;
    const rangeLabel = `${fDY(S.from)} → ${fDY(S.to)} · ${K.rangeDays} days`;
    const whoLabel = spInfo ? `${spInfo.nick} · ${spInfo.name}` : `AP127 · ${base.roster.length} SP`;

    // ── Shared chart configs ──────────────────────────────────────────────
    const labels = S.series.map(r => fBucket(r.b, gran));
    const hoursChart = pal => ({
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Aircraft hours', data: S.series.map(r => +(r.acMin / 60).toFixed(2)), backgroundColor: alpha(pal.acc, 0.85), stack: 'h', yAxisID: 'y', order: 2 },
        { label: 'SIM hours', data: S.series.map(r => +(r.simMin / 60).toFixed(2)), backgroundColor: alpha(pal.sim, 0.85), stack: 'h', yAxisID: 'y', order: 2 },
        { label: 'Lessons completed', type: 'line', data: S.series.map(r => r.lessons), borderColor: pal.done, backgroundColor: pal.done, pointRadius: gran === 'day' ? 0 : 2, borderWidth: 2, cubicInterpolationMode: 'monotone', yAxisID: 'y2', order: 1, stack: 'l' },
      ] },
      options: { interaction: tooltip, plugins: { legend: legend(pal), tooltip: Object.assign({}, tooltip, { callbacks: { label: c => `${c.dataset.label}: ${c.dataset.yAxisID === 'y2' ? c.raw : n1(c.raw) + 'h'}` } }) },
        scales: Object.assign(axes(pal, { stacked: true, yTitle: 'block hours' }), { y2: { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: pal.done, font: { size: 10 } }, title: { display: true, text: 'lessons', color: pal.done, font: { size: 10 } } } }) },
    });

    // ── Sections ──────────────────────────────────────────────────────────
    const header = h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 4 } },
      h('div', null,
        h('div', { className: 'mono uc', style: { fontSize: 10, color: 'var(--highlight)', letterSpacing: '0.14em' } }, 'AP127 · Batch performance'),
        h('h1', { style: { margin: '2px 0 0', fontSize: 24, fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, color: 'var(--ink)' } }, 'Batch Stats'),
        h('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 } }, whoLabel, ' · ', rangeLabel)),
      h('div', { className: 'mono', style: { fontSize: 10, color: 'var(--ink-3)', textAlign: d.isMobile ? 'left' : 'right', lineHeight: 1.6 } },
        h('div', null, 'Ops feed ', h('b', { style: { color: 'var(--ink-2)' } }, window.FLIGHT_DATA && window.FLIGHT_DATA.fetchedAt ? new Date(window.FLIGHT_DATA.fetchedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')),
        h('div', null, 'Progress feed ', h('b', { style: { color: 'var(--ink-2)' } }, d.progressMeta && d.progressMeta.updated ? new Date(d.progressMeta.updated).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')),
        h('div', null, 'Change log ', h('b', { style: { color: log.state === 'error' ? 'var(--col-cancel)' : 'var(--ink-2)' } },
          log.state === 'loading' ? 'loading…' : log.state === 'error' ? 'unavailable' : `${fD(base.logFrom)} → ${fD(base.logTo)}${log.state === 'partial' ? ' (partial)' : ''}`))));

    // SP profile strip (focus mode)
    const spRow = sp ? S.spRows[0] : null;
    const batchAll = useMemo(() => Stats.summarize(base, { from: range[0], to: range[1], gran }), [base, range, gran]);
    // Competition ranking (ties share a rank): 1 + number of SP strictly better.
    const rankOf = (k, field, low) => {
      const me = batchAll.spRows.find(r => r.key === k);
      if (!me) return null;
      return 1 + batchAll.spRows.filter(r => low ? r[field] < me[field] : r[field] > me[field]).length;
    };
    const profile = spRow ? h('div', { className: 'panel', style: { marginBottom: 14, borderColor: tint('var(--highlight)', 50) } },
      h('div', { className: 'pb', style: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' } },
        h('div', { style: { minWidth: 180 } },
          h('div', { style: { fontFamily: 'Rajdhani,sans-serif', fontSize: 26, fontWeight: 700, color: 'var(--highlight)', lineHeight: 1 } }, spInfo.nick),
          h('div', { style: { fontSize: 13, color: 'var(--ink)' } }, spInfo.name),
          h('div', { style: { fontSize: 11, color: 'var(--ink-3)' } }, `FI ${spInfo.fi} · ${spInfo.se}`)),
        spRow.progress ? h('div', { style: { flex: '1 1 220px' } },
          h(Label, null, 'Course progress (all time)'),
          h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
            h('b', { style: { fontSize: 20, fontFamily: 'Rajdhani,sans-serif' } }, `${spRow.progress.lessonsCompleted}/${spRow.progress.total}`),
            h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--ink-2)' } }, pct(spRow.progress.pct / 100)),
            h('span', { className: 'mono', style: { fontSize: 11, color: spRow.progress.lesDelta >= 0 ? 'var(--col-done)' : 'var(--col-cancel)' } }, `${sign(spRow.progress.lesDelta)} les vs plan`)),
          h('div', { style: { height: 8, background: 'var(--bg-2)', borderRadius: 4, marginTop: 4, overflow: 'hidden' } }, h('div', { style: { width: spRow.progress.pct + '%', height: '100%', background: 'var(--highlight)' } })),
          h('div', { style: { fontSize: 11, color: 'var(--ink-3)', marginTop: 3 } }, `Next ${spRow.progress.nextLesson} · last flown ${fDY(spRow.progress.lastFlown)}${spRow.progress.idleDays ? ` (${spRow.progress.idleDays}d ago)` : ''}`)) : null,
        h('div', { style: { display: 'flex', gap: 16, flexWrap: 'wrap' } },
          [['Hours rank', rankOf(sp, 'hours')], ['Lessons rank', rankOf(sp, 'lessons')], ['Extra-mile rank', rankOf(sp, 'extra')], ['Fewest leave', rankOf(sp, 'leaveDays', true)]]
            .map(([l, v]) => h('div', { key: l, style: { textAlign: 'center' } }, h(Label, null, l), h('div', { style: { fontFamily: 'Rajdhani,sans-serif', fontSize: 22, fontWeight: 700, color: v <= 3 ? 'var(--col-done)' : v >= base.roster.length - 2 ? 'var(--col-cancel)' : 'var(--ink)' } }, `#${v}`, h('span', { style: { fontSize: 12, color: 'var(--ink-3)' } }, ` /${base.roster.length}`))))))) : null;

    // OVERVIEW ─────────────────────────────────────────────────────────────
    const overview = () => {
      const pm = progress;
      const nSP = base.roster.length;
      const progRows = (sp ? S.spRows : batchAll.spRows).filter(r => r.progress).slice().sort((a, b) => b.progress.lessonsCompleted - a.progress.lessonsCompleted);
      const plannedPerSP = pm && pm.batch.n ? pm.batch.plannedLessonsToday / pm.batch.n : null;
      const curCount = base.curriculumCount;
      // A week / month only partly inside the period is flagged, so a short period's "best month" isn't misread.
      const partial = (b, g) => {
        if (g === 'day') return '';
        const a = g === 'month' ? b + '-01' : b;
        const e = g === 'month' ? U.addD(U.bucketOf(U.addD(a, 31), 'month') + '-01', -1) : U.addD(a, 6);
        return (a < S.from || e > S.to) ? ' (part)' : '';
      };
      const RecRow = (g, label) => {
        const r = S.records[g];
        return h('tr', { key: g },
          h('td', { style: { padding: '6px 8px', color: 'var(--ink-2)' } }, label),
          h('td', { className: 'mono', style: { padding: '6px 8px', textAlign: 'right' } }, hrs(r.avgHours)),
          h('td', { className: 'mono', style: { padding: '6px 8px', textAlign: 'right' } }, n1(r.avgLessons)),
          sp ? null : h('td', { className: 'mono', style: { padding: '6px 8px', textAlign: 'right', color: 'var(--ink-2)' } }, hrs(r.avgHoursPerSP)),
          sp ? null : h('td', { className: 'mono', style: { padding: '6px 8px', textAlign: 'right', color: 'var(--ink-2)' } }, n1(r.avgLessonsPerSP)),
          h('td', { className: 'mono', style: { padding: '6px 8px', textAlign: 'right', color: 'var(--col-done)' } }, r.bestHours ? `${hrs(r.bestHours[1])} · ${fBucket(r.bestHours[0], g)}${partial(r.bestHours[0], g)}` : '—'),
          h('td', { className: 'mono', style: { padding: '6px 8px', textAlign: 'right', color: 'var(--col-done)' } }, r.bestLessons ? `${r.bestLessons[1]} · ${fBucket(r.bestLessons[0], g)}${partial(r.bestLessons[0], g)}` : '—'));
      };
      const thS = { padding: '6px 8px', textAlign: 'right', fontSize: 9, color: 'var(--ink-3)', borderBottom: '1px solid var(--line)', fontWeight: 600 };
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { className: 'kpis' },
          h(Kpi, { label: 'Lessons completed', value: n0(K.lessons), sub: pm ? (sp ? `${spRow && spRow.progress ? spRow.progress.lessonsCompleted : 0}/${curCount} all time` : `${n0(pm.batch.lessonsDone)}/${n0(pm.batch.lessonSlots)} all time · ${pct(pm.batch.progressPct / 100)}`) : 'in period', tone: 'acc', title: 'Distinct curriculum lessons completed in the period (Progress feed; retakes not counted twice).' }),
          h(Kpi, { label: 'Block hours flown', value: hrs(K.hours), sub: `${hrs(K.acHours)} aircraft · ${hrs(K.simHours)} SIM`, title: 'Block time (durMin) of completed sorties — never airborne time.' }),
          h(Kpi, { label: 'Sorties', value: n0(K.sorties), sub: `${n0(K.acSorties)} aircraft · ${n0(K.simSorties)} SIM · ${K.flyDays} flying days` }),
          h(Kpi, { label: sp ? 'Hours / week' : 'Hours / SP / week', value: hrs(K.hoursPerSPWeek), sub: `${n1(K.lessonsPerWeek / (sp ? 1 : nSP))} lessons / ${sp ? '' : 'SP / '}week`, title: 'Calendar average over the whole period.' }),
          h(Kpi, { label: 'Multi-sortie days', value: n0(K.doubleSpDays), sub: `${K.tripleSpDays} with 3+ · of ${n0(K.spDays)} SP-days flown`, tone: 'ok', title: Stats.DEF.double }),
          h(Kpi, { label: 'Weekend / holiday', value: n0(K.weekend), sub: `${hrs(K.weekendHours)} · ${pct(K.weekend / (K.sorties || 1), 0)} of sorties`, tone: 'ok', title: Stats.DEF.weekend + ' or ' + Stats.DEF.holiday }),
          h(Kpi, { label: 'Early / late', value: `${K.early} / ${K.late}`, sub: 'before 07:00 / after 18:00', tone: 'ok', title: Stats.DEF.early + ' · ' + Stats.DEF.late }),
          h(Kpi, { label: 'Cancelled', value: n0(K.cancels), sub: `${pct(K.cancelRate)} of bookings · ${K.cancelSelf} student-caused`, tone: 'bad', title: Stats.DEF.cancelRate }),
          h(Kpi, { label: 'Changed / removed', value: `${n0(K.changes)} / ${n0(K.removals)}`, sub: base.hasLog ? `since ${fD(base.logFrom)} (watchdog log)` : 'change log unavailable', tone: 'rev' }),
          h(Kpi, { label: 'Leave days', value: days(K.leaveDays), sub: `${K.leaveRecs} records · median ${K.medianLead == null ? '—' : K.medianLead + 'd'} notice`, tone: 'rev', title: 'Person-days on leave in the period (half-days count 0.5, overlaps never double-count).' })),
        h(Panel, { title: 'Hours & lessons over time', sub: `per ${gran} · ${whoLabel}`, info: 'Bars: completed block hours split aircraft / SIM (ops feed). Line: distinct curriculum lessons completed (progress feed).' },
          h(ChartBox, { cfg: hoursChart, deps, height: 280 })),
        h(Grid, { min: 420 },
          h(Panel, { title: 'Rate & records', sub: rangeLabel, info: 'Averages are calendar averages over the period (every day counts, flying or not). Best = the single highest day / week / month in the period.' },
            h('div', { style: { overflowX: 'auto' } }, h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
              h('thead', null, h('tr', null,
                h('th', { className: 'mono uc', style: Object.assign({}, thS, { textAlign: 'left' }) }, 'Per'),
                h('th', { className: 'mono uc', style: thS }, 'Hours'), h('th', { className: 'mono uc', style: thS }, 'Lessons'),
                sp ? null : h('th', { className: 'mono uc', style: thS }, 'h / SP'), sp ? null : h('th', { className: 'mono uc', style: thS }, 'Les / SP'),
                h('th', { className: 'mono uc', style: thS }, 'Best hours'), h('th', { className: 'mono uc', style: thS }, 'Best lessons'))),
              h('tbody', null, RecRow('day', 'Day'), RecRow('week', 'Week'), RecRow('month', 'Month'))))),
          h(Panel, { title: 'Course progress', sub: sp ? 'all time · this SP' : `all time · ${progRows.length} SP · line = plan today`, info: 'Distinct lessons completed of the 96-lesson curriculum (progress feed — the same numbers as AP127 Detail V5/V6). The tick marks where the curriculum plan says each SP should be today. Click a row to focus that SP.' },
            pm ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 330, overflowY: 'auto', paddingRight: 4 } },
              !sp ? h('div', { style: { marginBottom: 8 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12 } }, h('b', null, 'Whole batch'), h('span', { className: 'mono' }, `${n0(pm.batch.lessonsDone)} / ${n0(pm.batch.lessonSlots)} · `, h('span', { style: { color: pm.batch.lessonsDelta >= 0 ? 'var(--col-done)' : 'var(--col-cancel)' } }, `${sign(pm.batch.lessonsDelta)} vs plan`))),
                h('div', { style: { position: 'relative', height: 10, background: 'var(--bg-2)', borderRadius: 5, overflow: 'hidden', marginTop: 3 } },
                  h('div', { style: { width: pm.batch.progressPct + '%', height: '100%', background: 'var(--highlight)' } }),
                  plannedPerSP != null ? h('div', { style: { position: 'absolute', top: 0, bottom: 0, left: Math.min(100, plannedPerSP / curCount * 100) + '%', width: 2, background: 'var(--ink)' } }) : null)) : null,
              progRows.map(r => h('div', { key: r.key, onClick: () => setSp(r.key), style: { display: 'grid', gridTemplateColumns: '64px 1fr 74px', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 11 }, title: `${r.name} · ${r.progress.lessonsCompleted}/${r.progress.total} · ${sign(r.progress.lesDelta)} lessons vs plan · next ${r.progress.nextLesson}` },
                h('span', { className: 'mono', style: { color: 'var(--ink-2)' } }, r.nick),
                h('div', { style: { position: 'relative', height: 8, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden' } },
                  h('div', { style: { width: r.progress.pct + '%', height: '100%', background: r.progress.lesDelta >= 0 ? 'var(--col-done)' : 'var(--highlight)' } }),
                  plannedPerSP != null ? h('div', { style: { position: 'absolute', top: 0, bottom: 0, left: Math.min(100, plannedPerSP / curCount * 100) + '%', width: 2, background: 'var(--ink)' } }) : null),
                h('span', { className: 'mono', style: { textAlign: 'right', color: 'var(--ink)' } }, `${r.progress.lessonsCompleted} `, h('span', { style: { color: r.progress.lesDelta >= 0 ? 'var(--col-done)' : 'var(--col-cancel)' } }, sign(r.progress.lesDelta)))))) : h('div', { className: 'muted' }, 'Waiting for the progress feed…'))),
        h(Grid, { min: 420 },
          h(Panel, { title: 'Disruptions at a glance', sub: 'cancel reasons in the period' },
            h(Bars, { empty: 'No cancelled bookings in this period.', total: K.cancels, rows: Stats.CANCEL_CATS.map(c => ({ k: c.k, label: c.label, v: S.cancelByCat[c.k] || 0, c: `var(${CANCEL_COL[c.k]})` })).filter(r => r.v).sort((a, b) => b.v - a.v) })),
          h(Panel, { title: 'Leave at a glance', sub: 'leave days by reason in the period' },
            h(Bars, { empty: 'No leave in this period.', total: K.leaveDays, fmt: v => days(v) + 'd', rows: Object.entries(S.leaveDaysByReason).map(([k, v]) => ({ k, label: LEAVE_LABEL[k] || k, v, c: LEAVE_COL[k] })).sort((a, b) => b.v - a.v) }))));
    };

    // FLYING ───────────────────────────────────────────────────────────────
    const flying = () => {
      const dowCfg = pal => ({ type: 'bar', data: { labels: [1, 2, 3, 4, 5, 6, 0].map(i => DOWN[i]), datasets: [
        { label: 'Block hours', data: [1, 2, 3, 4, 5, 6, 0].map(i => +(S.byDow[i].mins / 60).toFixed(1)), backgroundColor: [1, 2, 3, 4, 5, 6, 0].map(i => i === 0 || i === 6 ? alpha(pal.pend, 0.9) : alpha(pal.acc, 0.8)) }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${n1(c.raw)}h · ${S.byDow[[1, 2, 3, 4, 5, 6, 0][c.dataIndex]].sorties} sorties` } } }, scales: axes(pal, { yTitle: 'block hours' }) } });
      const hourCfg = pal => { const hs = S.byHour.filter(x => x.h >= 5 && x.h <= 22); return { type: 'bar', data: { labels: hs.map(x => String(x.h).padStart(2, '0')), datasets: [
        { label: 'Sorties starting', data: hs.map(x => x.sorties), backgroundColor: hs.map(x => x.h < 7 ? alpha(pal.stby, 0.9) : x.h >= 17 ? alpha(pal.sim, 0.9) : alpha(pal.acc, 0.7)) }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => `${c[0].label}:00–${c[0].label}:59`, label: c => `${c.raw} sorties` } } }, scales: axes(pal, { yTitle: 'sorties' }) } }; };
      const extraCfg = pal => ({ type: 'bar', data: { labels, datasets: [
        { label: 'Weekend / holiday', data: S.series.map(r => r.weekend), backgroundColor: alpha(pal.pend, 0.9), stack: 'e' },
        { label: 'Early (<07:00)', data: S.series.map(r => r.early), backgroundColor: alpha(pal.stby, 0.9), stack: 'e' },
        { label: 'Late (>18:00)', data: S.series.map(r => r.late), backgroundColor: alpha(pal.sim, 0.9), stack: 'e' },
        { label: 'Multi-sortie days', type: 'line', data: S.series.map(r => r.doubleDays), borderColor: pal.done, backgroundColor: pal.done, pointRadius: gran === 'day' ? 0 : 2, borderWidth: 2, stack: 'd' },
      ] }, options: { interaction: tooltip, plugins: { legend: legend(pal), tooltip }, scales: axes(pal, { stacked: true, yTitle: 'sorties / days' }) } });
      const rows = S.spRows;
      const tot = f => rows.reduce((a, r) => a + f(r), 0);
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { className: 'kpis' },
          h(Kpi, { label: 'Block hours', value: hrs(K.hours), sub: `${hrs(K.acHours)} aircraft · ${hrs(K.simHours)} SIM` }),
          h(Kpi, { label: 'Sorties', value: n0(K.sorties), sub: `${K.flyDays} flying days · ${hrs(K.hoursPerFlyDay)} / flying day` }),
          h(Kpi, { label: 'Multi-sortie days', value: n0(K.doubleSpDays), sub: `${pct(K.doubleSpDays / (K.spDays || 1), 0)} of SP-days · ${K.tripleSpDays} triples`, tone: 'ok', title: Stats.DEF.double }),
          h(Kpi, { label: 'Weekend / holiday', value: n0(K.weekend), sub: hrs(K.weekendHours), tone: 'ok' }),
          h(Kpi, { label: 'Early starts', value: n0(K.early), sub: 'scheduled before 07:00', tone: 'ok' }),
          h(Kpi, { label: 'Late finishes', value: n0(K.late), sub: 'scheduled after 18:00', tone: 'ok' })),
        h(Panel, { title: 'Hours & lessons over time', sub: `per ${gran}` }, h(ChartBox, { cfg: hoursChart, deps, height: 260 })),
        h(Panel, { title: 'Daily activity', sub: 'every day in the period · outlined = weekend / holiday', info: 'Each square is one calendar day, shaded by the batch\'s (or SP\'s) completed block hours. Hover for the day\'s sorties, hours and how many SP flew.',
          right: h('div', { style: { display: 'flex', gap: 4 } }, h(Chip, { on: heatMetric === 'hours', onClick: () => setHeatMetric('hours') }, 'Hours'), h(Chip, { on: heatMetric === 'sorties', onClick: () => setHeatMetric('sorties') }, 'Sorties')) },
          h(Heatmap, { daily: S.daily, from: S.from, to: S.to, holidays: base.holidays, metric: heatMetric })),
        h(Grid, { min: 380 },
          h(Panel, { title: 'By day of week', sub: 'block hours · weekend in amber' }, h(ChartBox, { cfg: dowCfg, deps, height: 220 })),
          h(Panel, { title: 'By start time', sub: 'sorties per scheduled start hour · early in blue, evening in violet' }, h(ChartBox, { cfg: hourCfg, deps, height: 220 }))),
        h(Panel, { title: 'Extra effort over time', sub: `per ${gran} — the flying that goes beyond a normal weekday slot`, info: Stats.DEF.extra }, h(ChartBox, { cfg: extraCfg, deps, height: 240 })),
        h(Panel, { title: 'Per SP — flying', sub: 'click a row to focus that SP · click a header to sort', pad: false },
          h(Table, { initial: { k: 'hours', dir: -1 }, maxHeight: 520, onRow: r => setSp(sp ? null : r.key), rows,
            foot: { nick: 'Total', sorties: n0(tot(r => r.sorties)), hours: n1(tot(r => r.hours)), ac: n1(tot(r => r.acMin) / 60), sim: n1(tot(r => r.simMin) / 60), flyDays: n0(tot(r => r.flyDays)), doubleDays: n0(tot(r => r.doubleDays)), weekend: n0(tot(r => r.weekend)), early: n0(tot(r => r.early)), late: n0(tot(r => r.late)) },
            cols: [
              { k: 'nick', label: 'SP', asc: true, f: r => h('span', { title: r.name }, h('b', null, r.nick), h('span', { style: { color: 'var(--ink-3)', marginLeft: 6, fontSize: 11 } }, r.name.split(' ')[0])) },
              { k: 'sorties', label: 'Sorties' },
              { k: 'hours', label: 'Block h', f: r => n1(r.hours) },
              { k: 'ac', label: 'A/C h', sv: r => r.acMin, f: r => n1(r.acMin / 60) },
              { k: 'sim', label: 'SIM h', sv: r => r.simMin, f: r => n1(r.simMin / 60) },
              { k: 'flyDays', label: 'Fly days' },
              { k: 'hoursPerFlyDay', label: 'h / fly day', f: r => n1(r.hoursPerFlyDay) },
              { k: 'doubleDays', label: '2+ / day', title: Stats.DEF.double, style: r => ({ color: r.doubleDays ? 'var(--col-done)' : 'var(--ink-3)' }) },
              { k: 'maxDay', label: 'Max / day', tip: r => r.maxDayDate ? `${r.maxDay} sorties on ${fDY(r.maxDayDate)}` : '' },
              { k: 'weekend', label: 'Wknd / hol' },
              { k: 'early', label: 'Early' },
              { k: 'late', label: 'Late' },
            ] })));
    };

    // DISRUPTIONS ──────────────────────────────────────────────────────────
    const disrupt = () => {
      const cancelCfg = pal => ({ type: 'bar', data: { labels, datasets: Stats.CANCEL_CATS.map(c => ({ label: c.label, data: S.series.map(r => r.cancelByCat[c.k] || 0), backgroundColor: alpha(tok(CANCEL_COL[c.k]), 0.9), stack: 'c' })) },
        options: { interaction: tooltip, plugins: { legend: legend(pal), tooltip }, scales: axes(pal, { stacked: true, yTitle: 'cancelled bookings' }) } });
      const changeCfg = pal => ({ type: 'bar', data: { labels, datasets: [
        { label: 'Changed', data: S.series.map(r => r.changes), backgroundColor: alpha(pal.pend, 0.85), stack: 'a' },
        { label: 'Removed', data: S.series.map(r => r.removals), backgroundColor: alpha(pal.cancel, 0.85), stack: 'b' },
        { label: 'Cancelled', data: S.series.map(r => r.cancels), backgroundColor: alpha(pal.ink3, 0.7), stack: 'c' },
      ] }, options: { interaction: tooltip, plugins: { legend: legend(pal), tooltip }, scales: axes(pal, { yTitle: 'bookings' }) } });
      const rows = S.spRows;
      const tot = f => rows.reduce((a, r) => a + f(r), 0);
      const recent = [].concat(
        S.cancels.map(c => ({ key: 'c' + c.id, date: c.date, sp: c.sp, lesson: c.lesson, what: 'Cancelled', col: 'var(--col-cancel)', detail: c.reason + (c.remarks ? ' — ' + c.remarks : '') })),
        S.changes.map(c => ({ key: 'h' + c.id, date: c.date, sp: c.sp, lesson: c.lesson, what: 'Changed', col: 'var(--col-pending)', detail: c.cats.map(k => (Stats.CHANGE_CATS.find(x => x.k === k) || {}).label).join(', ') + ` · ${c.events.length} edit${c.events.length > 1 ? 's' : ''}` })),
        S.removals.map(r => ({ key: 'r' + r.id, date: r.date, sp: r.sp, lesson: r.lesson, what: 'Removed', col: 'var(--ink-3)', detail: `booking deleted ${fD(r.tsDay)}${r.start ? ' · was ' + r.start : ''}` })))
        .sort((a, b) => b.date.localeCompare(a.date) || a.what.localeCompare(b.what));
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { className: 'kpis' },
          h(Kpi, { label: 'Cancelled', value: n0(K.cancels), sub: `${pct(K.cancelRate)} of all bookings`, tone: 'bad', title: Stats.DEF.cancelRate }),
          h(Kpi, { label: 'Weather', value: n0(S.cancelByCat.wx || 0), sub: pct((S.cancelByCat.wx || 0) / (K.cancels || 1), 0) + ' of cancels' }),
          h(Kpi, { label: 'Aircraft', value: n0(S.cancelByCat.ac || 0), sub: pct((S.cancelByCat.ac || 0) / (K.cancels || 1), 0) + ' of cancels' }),
          h(Kpi, { label: 'Student-caused', value: n0(K.cancelSelf), sub: 'sick / medical', tone: K.cancelSelf ? 'rev' : 'ok' }),
          h(Kpi, { label: 'Changed', value: n0(K.changes), sub: 'bookings moved / re-crewed', tone: 'rev', title: 'Distinct bookings whose time, date, aircraft, instructor or lesson was edited after it was published (watchdog log). Filling in a TBD aircraft is not counted.' }),
          h(Kpi, { label: 'Removed', value: n0(K.removals), sub: 'deleted before the day, not rebooked', tone: 'bad', title: 'Bookings deleted from the schedule before their own date, with no replacement booking for the same SP / day / lesson (watchdog log).' })),
        !base.hasLog ? h('div', { className: 'panel pb', style: { color: 'var(--col-pending)', fontSize: 12 } }, log.state === 'loading' ? 'Loading the schedule-change history…' : 'The schedule-change history (watchdog log) could not be loaded, so Changed and Removed show 0. Cancels come from the ops feed and are unaffected.') : null,
        h(Grid, { min: 420 },
          h(Panel, { title: 'Cancel reasons', sub: 'grouped · hover for the portal reasons', info: 'The portal\'s "Other" reasons are re-read from the free-text remark when it names a cause (e.g. "Late Aircraft" → Aircraft).' },
            h(Bars, { total: K.cancels, rows: Stats.CANCEL_CATS.map(c => ({ k: c.k, label: c.label, v: S.cancelByCat[c.k] || 0, c: `var(${CANCEL_COL[c.k]})`,
              title: Object.entries(S.cancelByReason).filter(([r]) => Stats.cancelCat(r) === c.k || (c.k === 'other' && /^other$|no reason/i.test(r))).map(([r, n]) => `${r}: ${n}`).join('\n') })).filter(r => r.v).sort((a, b) => b.v - a.v) })),
          h(Panel, { title: 'What changed', sub: `${n0(K.changes)} changed bookings · one booking can change in several ways` },
            h(Bars, { rows: Stats.CHANGE_CATS.map(c => ({ k: c.k, label: c.label, v: S.changeByCat[c.k] || 0, c: `var(${CHANGE_COL[c.k]})` })) }))),
        h(Panel, { title: 'Cancels by reason over time', sub: `per ${gran}` }, h(ChartBox, { cfg: cancelCfg, deps, height: 240 })),
        h(Panel, { title: 'Changes, removals & cancels over time', sub: `per ${gran} · by flight date` }, h(ChartBox, { cfg: changeCfg, deps, height: 240 })),
        h(Panel, { title: 'Per SP — disruptions', sub: 'click a row to focus that SP', pad: false },
          h(Table, { initial: { k: 'cancels', dir: -1 }, maxHeight: 520, onRow: r => setSp(sp ? null : r.key), rows,
            foot: { nick: 'Total', cancels: n0(tot(r => r.cancels)), cancelSelf: n0(tot(r => r.cancelSelf)), wx: n0(tot(r => r.cancelByCat.wx || 0)), ac: n0(tot(r => r.cancelByCat.ac || 0)), changes: n0(tot(r => r.changes)), removals: n0(tot(r => r.removals)) },
            cols: [
              { k: 'nick', label: 'SP', asc: true, f: r => h('b', { title: r.name }, r.nick) },
              { k: 'cancels', label: 'Cancelled', style: r => ({ color: r.cancels ? 'var(--col-cancel)' : 'var(--ink-3)' }) },
              { k: 'cancelRate', label: 'Rate', f: r => pct(r.cancelRate, 0), title: Stats.DEF.cancelRate },
              { k: 'wx', label: 'Weather', sv: r => r.cancelByCat.wx || 0, f: r => r.cancelByCat.wx || 0 },
              { k: 'ac', label: 'Aircraft', sv: r => r.cancelByCat.ac || 0, f: r => r.cancelByCat.ac || 0 },
              { k: 'cancelSelf', label: 'Student', title: 'Cancels whose reason is student sick / medical' },
              { k: 'changes', label: 'Changed' },
              { k: 'removals', label: 'Removed' },
            ] })),
        h(Panel, { title: 'Disruption log', sub: `${recent.length} events in the period · newest first`, pad: false },
          h(Table, { initial: { k: 'date', dir: -1 }, maxHeight: 420, rows: recent.slice(0, 400),
            cols: [
              { k: 'date', label: 'Flight date', f: r => fDY(r.date) },
              { k: 'what', label: 'What', asc: true, f: r => h('span', { style: { color: r.col, fontWeight: 600 } }, r.what), style: () => ({ textAlign: 'left' }) },
              { k: 'sp', label: 'SP', asc: true, f: r => nick(r.sp), style: () => ({ textAlign: 'left' }) },
              { k: 'lesson', label: 'Lesson', asc: true, style: () => ({ textAlign: 'left' }) },
              { k: 'detail', label: 'Detail', asc: true, style: () => ({ textAlign: 'left', whiteSpace: 'normal', minWidth: 220, color: 'var(--ink-2)' }) },
            ] })));
    };

    // LEAVE ────────────────────────────────────────────────────────────────
    const leave = () => {
      const cats = Object.keys(LEAVE_LABEL);
      const leaveCfg = pal => ({ type: 'bar', data: { labels, datasets: cats.map(c => ({ label: LEAVE_LABEL[c], data: S.series.map(r => r.leaveByCat[c] || 0), backgroundColor: alpha(rgb(LEAVE_COL[c]), 0.9), stack: 'l' })).filter(ds => ds.data.some(v => v)) },
        options: { interaction: tooltip, plugins: { legend: legend(pal), tooltip }, scales: axes(pal, { stacked: true, yTitle: 'person-days on leave' }) } });
      const leadCfg = pal => ({ type: 'bar', data: { labels: S.leadBuckets.map(b => b.label), datasets: [{ label: 'Leave records', data: S.leadBuckets.map(b => b.n), backgroundColor: S.leadBuckets.map(b => b.k === 'retro' || b.k === 'same' ? alpha(pal.cancel, 0.85) : b.k === 'd1' ? alpha(pal.pend, 0.85) : alpha(pal.done, 0.85)) }] },
        options: { plugins: { legend: { display: false } }, scales: axes(pal, { yTitle: 'leave records', x: { ticks: { color: pal.ink3, font: { size: 9 }, autoSkip: false, maxRotation: 0 } } }) } });
      const dowCfg = pal => ({ type: 'bar', data: { labels: [1, 2, 3, 4, 5, 6, 0].map(i => DOWN[i]), datasets: [{ label: 'Leave days', data: [1, 2, 3, 4, 5, 6, 0].map(i => S.byDow[i].leaveDays), backgroundColor: alpha(pal.pend, 0.85) }] },
        options: { plugins: { legend: { display: false } }, scales: axes(pal, { yTitle: 'person-days' }) } });
      const rows = S.spRows;
      const tot = f => rows.reduce((a, r) => a + f(r), 0);
      const reasonRows = Object.entries(S.leaveByReason).map(([k, v]) => ({ k, label: k, v })).sort((a, b) => b.v - a.v);
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { className: 'kpis' },
          h(Kpi, { label: 'Leave days', value: days(K.leaveDays), sub: sp ? 'in the period' : `${n1(K.leaveDays / base.roster.length)} per SP`, tone: 'rev' }),
          h(Kpi, { label: 'Leave records', value: n0(K.leaveRecs), sub: sp ? '' : `${K.leaveSPs}/${base.roster.length} SP took leave` }),
          h(Kpi, { label: 'Median notice', value: K.medianLead == null ? '—' : K.medianLead + 'd', sub: 'recorded → leave start', title: Stats.DEF.lead }),
          h(Kpi, { label: 'Short notice', value: n0((S.leadBuckets.find(b => b.k === 'd1') || {}).n || 0), sub: '1–2 days ahead', tone: 'rev' }),
          h(Kpi, { label: 'Same day / after', value: n0(S.leadBuckets.filter(b => b.k === 'same' || b.k === 'retro').reduce((a, b) => a + b.n, 0)), sub: 'recorded on or after the start date', tone: 'bad' }),
          h(Kpi, { label: 'Top reason', value: reasonRows[0] ? reasonRows[0].label.replace(' Leave', '') : '—', sub: reasonRows[0] ? `${reasonRows[0].v} records · ${pct(reasonRows[0].v / (K.leaveRecs || 1), 0)}` : '' })),
        h(Panel, { title: 'Leave over time', sub: `person-days per ${gran}, by reason` }, h(ChartBox, { cfg: leaveCfg, deps, height: 250 })),
        h(Grid, { min: 340 },
          h(Panel, { title: 'Reasons', sub: 'leave records, as entered in the portal' }, h(Bars, { total: K.leaveRecs, rows: reasonRows.map(r => Object.assign(r, { c: 'var(--col-pending)' })) })),
          h(Panel, { title: 'How far ahead it is recorded', sub: 'leave start − date recorded in the portal', info: Stats.DEF.lead + '. Red = recorded on or after the day it started; amber = 1–2 days ahead.' }, h(ChartBox, { cfg: leadCfg, deps, height: 220 })),
          h(Panel, { title: 'Day of week', sub: 'person-days on leave' }, h(ChartBox, { cfg: dowCfg, deps, height: 220 }))),
        h(Panel, { title: 'Per SP — leave', sub: 'click a row to focus that SP', pad: false },
          h(Table, { initial: { k: 'leaveDays', dir: -1 }, maxHeight: 520, onRow: r => setSp(sp ? null : r.key), rows,
            foot: { nick: 'Total', leaveRecs: n0(tot(r => r.leaveRecs)), leaveDays: days(tot(r => r.leaveDays)), retro: n0(tot(r => r.retro)) },
            cols: [
              { k: 'nick', label: 'SP', asc: true, f: r => h('b', { title: r.name }, r.nick) },
              { k: 'leaveRecs', label: 'Records' },
              { k: 'leaveDays', label: 'Days', f: r => days(r.leaveDays), style: r => ({ color: r.leaveDays ? 'var(--ink)' : 'var(--ink-3)' }) },
              { k: 'medianLead', label: 'Median notice', f: r => r.medianLead == null ? '—' : r.medianLead + 'd', title: Stats.DEF.lead },
              { k: 'retro', label: 'Late-recorded', title: 'Recorded after the leave had already started' },
              { k: 'topLeaveReason', label: 'Top reason', asc: true, style: () => ({ textAlign: 'left' }) },
            ] })),
        h(Panel, { title: 'Leave records', sub: `${S.leaves.length} in the period · newest first`, pad: false },
          h(Table, { initial: { k: 'start', dir: -1 }, maxHeight: 420, rows: S.leaves.map(l => Object.assign({}, l, { key: l.key, n: l.unit * (U.diffD(l.start, l.end) + 1) })),
            cols: [
              { k: 'start', label: 'Leave', f: r => r.start === r.end ? fDY(r.start) : `${fD(r.start)} → ${fDY(r.end)}`, style: () => ({ textAlign: 'left' }) },
              { k: 'sp', label: 'SP', asc: true, f: r => nick(r.sp), style: () => ({ textAlign: 'left' }) },
              { k: 'n', label: 'Days', f: r => days(r.n) + (r.half ? ' · ' + r.half : '') },
              { k: 'reason', label: 'Reason', asc: true, style: () => ({ textAlign: 'left' }) },
              { k: 'recordDate', label: 'Recorded', f: r => fDY(r.recordDate) },
              { k: 'lead', label: 'Notice', f: r => r.lead == null ? '—' : r.lead < 0 ? `${-r.lead}d late` : r.lead === 0 ? 'same day' : r.lead + 'd', style: r => ({ color: r.lead != null && r.lead <= 0 ? 'var(--col-cancel)' : r.lead != null && r.lead <= 2 ? 'var(--col-pending)' : 'var(--ink-2)' }) },
              { k: 'note', label: 'Note', asc: true, style: () => ({ textAlign: 'left', whiteSpace: 'normal', minWidth: 160, color: 'var(--ink-3)' }) },
            ] })));
    };

    // CONTRIBUTION ─────────────────────────────────────────────────────────
    const contrib = () => {
      const rows = batchAll.spRows;   // always the whole batch — contribution is relative
      const n = rows.length || 1;
      const avgLes = rows.reduce((a, r) => a + r.lessons, 0) / n;
      const fair = 1 / n;
      const order = rows.slice().sort((a, b) => b.lessons - a.lessons || b.hours - a.hours);
      const shareCfg = pal => ({ type: 'bar', data: { labels: order.map(r => r.nick), datasets: [
        { label: 'Share of batch lessons', data: order.map(r => +(r.lessonShare * 100).toFixed(2)), backgroundColor: order.map(r => r.key === sp ? pal.acc : r.lessonShare >= fair ? alpha(pal.done, 0.85) : alpha(pal.ink3, 0.55)) },
        { label: `Fair share (1/${n} = ${(fair * 100).toFixed(1)}%)`, type: 'line', data: order.map(() => +(fair * 100).toFixed(2)), borderColor: pal.pend, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0 },
      ] }, options: { plugins: { legend: legend(pal), tooltip: { callbacks: { label: c => c.datasetIndex === 0 ? `${n1(c.raw)}% · ${order[c.dataIndex].lessons} lessons · ${hrs(order[c.dataIndex].hours)}` : c.dataset.label } } },
        scales: axes(pal, { yTitle: '% of batch lessons', x: { ticks: { color: pal.ink3, font: { size: 9 }, autoSkip: false, maxRotation: 70, minRotation: 50 } } }) } });
      const exOrder = rows.slice().sort((a, b) => b.extra - a.extra);
      const extraCfg = pal => ({ type: 'bar', data: { labels: exOrder.map(r => r.nick), datasets: [
        { label: 'Weekend / holiday', data: exOrder.map(r => r.weekend), backgroundColor: alpha(pal.pend, 0.9), stack: 'x' },
        { label: 'Early', data: exOrder.map(r => r.early), backgroundColor: alpha(pal.stby, 0.9), stack: 'x' },
        { label: 'Late', data: exOrder.map(r => r.late), backgroundColor: alpha(pal.sim, 0.9), stack: 'x' },
        { label: 'Extra same-day sorties', data: exOrder.map(r => r.extra - r.weekend - r.early - r.late), backgroundColor: alpha(pal.done, 0.9), stack: 'x' },
      ] }, options: { interaction: tooltip, plugins: { legend: legend(pal), tooltip }, scales: axes(pal, { stacked: true, yTitle: 'extra-mile sorties', x: { stacked: true, ticks: { color: pal.ink3, font: { size: 9 }, autoSkip: false, maxRotation: 70, minRotation: 50 } } }) } });
      const hl = r => r.key === sp ? { background: tint('var(--highlight)', 14) } : {};
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { className: 'panel pb', style: { fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 } },
          h('b', { style: { color: 'var(--ink)' } }, 'How to read this. '),
          'Contribution compares each SP with the batch over the selected period: ', h('b', null, 'share of batch lessons'), ' (fair share = 1/', n, ' = ', (fair * 100).toFixed(1), '%), ',
          h('b', null, '× batch average'), ' (1.00 = exactly average), and ', h('b', null, 'extra-mile sorties'), ' — ', Stats.DEF.extra.toLowerCase(), '. ',
          'Leave days and student-caused cancels show availability. Nothing here is a grade: weather, aircraft and the FI\'s roster shape most of it.'),
        h(Panel, { title: 'Share of batch lessons', sub: `${rangeLabel} · green = at or above fair share`, info: 'Distinct curriculum lessons each SP completed in the period, as a share of everything the batch completed.' }, h(ChartBox, { cfg: shareCfg, deps, height: 280 })),
        h(Panel, { title: 'Extra-mile sorties', sub: 'flying beyond a normal weekday slot', info: Stats.DEF.extra }, h(ChartBox, { cfg: extraCfg, deps, height: 280 })),
        h(Panel, { title: 'Contribution leaderboard', sub: 'whole batch · click a row to focus that SP · click a header to sort', pad: false },
          h(Table, { initial: { k: 'lessons', dir: -1 }, maxHeight: 640, onRow: r => setSp(sp === r.key ? null : r.key), rows,
            cols: [
              { k: 'nick', label: 'SP', asc: true, f: r => h('span', { title: `${r.name} · FI ${r.fi}` }, h('b', null, r.nick)), style: hl },
              { k: 'allTime', label: 'Course', sv: r => r.progress ? r.progress.lessonsCompleted : -1, f: r => r.progress ? `${r.progress.lessonsCompleted}/${r.progress.total}` : '—', title: 'All-time lessons completed (progress feed)', style: hl },
              { k: 'vsPlan', label: 'vs plan', sv: r => r.progress ? r.progress.lesDelta : null, f: r => r.progress ? sign(r.progress.lesDelta) : '—', style: r => Object.assign({ color: r.progress && r.progress.lesDelta >= 0 ? 'var(--col-done)' : 'var(--col-cancel)' }, hl(r)), title: 'All-time lessons vs where the curriculum plan says this SP should be today' },
              { k: 'lessons', label: 'Lessons', style: hl, title: 'Lessons completed in the period' },
              { k: 'lessonShare', label: 'Share', f: r => pct(r.lessonShare), style: r => Object.assign({ color: r.lessonShare >= fair ? 'var(--col-done)' : 'var(--ink-2)' }, hl(r)) },
              { k: 'index', label: '× avg', sv: r => avgLes ? r.lessons / avgLes : 0, f: r => avgLes ? (r.lessons / avgLes).toFixed(2) : '—', style: hl, title: 'Lessons in the period ÷ batch average' },
              { k: 'hours', label: 'Block h', f: r => n1(r.hours), style: hl },
              { k: 'hourShare', label: 'h share', f: r => pct(r.hourShare), style: hl },
              { k: 'extra', label: 'Extra mile', style: r => Object.assign({ color: 'var(--col-done)', fontWeight: 600 }, hl(r)), title: Stats.DEF.extra, tip: r => `weekend/holiday ${r.weekend} · early ${r.early} · late ${r.late} · extra same-day ${r.extra - r.weekend - r.early - r.late}` },
              { k: 'doubleDays', label: '2+ days', style: hl, title: Stats.DEF.double },
              { k: 'cancelSelf', label: 'Own cancels', style: r => Object.assign({ color: r.cancelSelf ? 'var(--col-cancel)' : 'var(--ink-3)' }, hl(r)), title: 'Cancels whose reason is student sick / medical' },
              { k: 'leaveDays', label: 'Leave d', f: r => days(r.leaveDays), style: hl },
            ] })));
    };

    // Integrity footer
    const integrity = h('details', { className: 'panel', style: { marginTop: 14 } },
      h('summary', { className: 'mono uc', style: { padding: '10px 12px', cursor: 'pointer', fontSize: 10, color: check.pass ? 'var(--col-done)' : 'var(--col-cancel)' } },
        `Integrity · ${check.checks.filter(c => c.pass).length} / ${check.checks.length} checks pass`, check.warnings.length ? h('span', { style: { color: 'var(--col-pending)', marginLeft: 8 } }, `· ${check.warnings.length} data note${check.warnings.length > 1 ? 's' : ''}`) : null),
      h('div', { className: 'pb', style: { fontSize: 12, color: 'var(--ink-2)', display: 'grid', gap: 12 } },
        h('div', null, check.checks.map(c => h('div', { key: c.label }, h('span', { style: { color: c.pass ? 'var(--col-done)' : 'var(--col-cancel)' } }, c.pass ? '✓ ' : '✗ '), c.label))),
        check.warnings.length ? h('div', null, h(Label, null, 'Data notes'), check.warnings.map(w => h('div', { key: w, style: { color: 'var(--col-pending)' } }, '• ', w))) : null,
        h('div', null, h(Label, null, 'Definitions & sources'),
          h('div', null, '• Hours are block time (scheduled/actual block, durMin) of completed sorties — never airborne time. Ground school and meetings are excluded.'),
          h('div', null, '• Lessons = distinct curriculum lessons completed (progress feed + Ops completions not yet posted to it — the same engine and rule as AP127 Detail V5/V6', progress && progress._opsExtra ? `; ${progress._opsExtra} lesson(s) credited from Ops today` : '', ').'),
          h('div', null, '• Cancels: ops feed incl. the separate cancellations record. Changes & removals: watchdog change log (from ', fD(base.logFrom), ').'),
          h('div', null, '• Leave: portal leave records, de-duplicated; notice uses the form submission time of the record.'),
          Object.entries(Stats.DEF).map(([k, v]) => h('div', { key: k }, `• ${k}: ${v}`)))));

    const body = { overview, flying, disrupt, leave, contrib }[tab] || overview;
    return h('div', { style: { height: '100%', overflowY: 'auto', overflowX: 'hidden' } },
      h('div', { style: { padding: d.isMobile ? '12px 12px 40px' : '16px 20px 40px', maxWidth: 1500, margin: '0 auto' } },
        header, bar, profile,
        // keyed by tab so React never reuses one tab's chart canvas for another tab's chart
        h('div', { key: tab }, body()),
        integrity));
  }

  window.StatsView = StatsView;
})();
