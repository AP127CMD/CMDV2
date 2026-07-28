// view-summary.js — Ops Analytics: batch-centric flight analytics
// Period select, comprehensive filter panel, KPI strip, batch composition,
// 4 stacked bar-over-time charts, batch breakdown table, student/instructor rosters.
(function () {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;

  // ── Date range helpers ──────────────────────────────────────────────────
  function sAddDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function sDayRange(start, end) {
    const arr = []; let c = start;
    while (c <= end && arr.length < 400) { arr.push(c); c = sAddDays(c, 1); }
    return arr;
  }
  function sPresetRange(preset, today) {
    if (preset === '14d') return { from: sAddDays(today, -13), to: today };
    if (preset === '30d') return { from: sAddDays(today, -29), to: today };
    if (preset === '90d') return { from: sAddDays(today, -89), to: today };
    return { from: sAddDays(today, -29), to: today };
  }
  function sWeekKey(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
    dt.setUTCDate(dt.getUTCDate() - dow);
    return dt.toISOString().slice(0, 10);
  }
  function sMonthKey(dateStr) { return dateStr.slice(0, 7); }

  const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function sFmtShort(dateStr) { const { day, mo } = fmtDay(dateStr); return String(day).padStart(2,'0') + ' ' + mo; }
  function sFmtWeek(weekKey) { return 'WK ' + sFmtShort(weekKey); }
  function sFmtMonth(monthKey) { const [y, m] = monthKey.split('-'); return MONTH_ABBR[Number(m) - 1] + ' ' + y.slice(2); }

  // ── Effective vs block hours (curriculum planned minutes per lesson) ───
  // Ported from view-aircraft.js's uBuildCurMap/uEffectiveMins — that file wraps itself
  // in its own IIFE and doesn't expose these on window, so each view keeps its own copy.
  function sBuildCurMap() {
    const G = window.NGT_CACHE;
    const map = {};
    [G?.cur124 || [], G?.cur126 || [], G?.cur127 || []].forEach(cur =>
      cur.forEach(c => { if (c.lesson && c.planned_mins != null) map[c.lesson] = c.planned_mins; })
    );
    return map;
  }
  function sEffectiveMins(f, curMap) {
    const lesson = (f.lesson || '').trim();
    if (!lesson) return f.durMin || 0;
    if (curMap[lesson] != null) return curMap[lesson];
    if (lesson.includes('/')) {
      const base = lesson.replace(/\/\d+$/, '');
      const part = parseInt(lesson.split('/').pop(), 10) || 1;
      return part === 1 ? (curMap[base] != null ? curMap[base] : f.durMin || 0) : 0;
    }
    return f.durMin || 0;
  }

  // ── Batch color system ───────────────────────────────────────────────────
  const AP_BATCH_ORDER = ['AP-124', 'AP-126', 'AP-127', 'AP-128', 'AP-129'];
  const NON_AP_PALETTE = ['oklch(0.65 0.03 250)', 'oklch(0.62 0.03 90)', 'oklch(0.60 0.03 20)', 'oklch(0.66 0.03 160)'];
  function sBatchColor(batch) {
    const b = batch || 'Unknown';
    const idx = AP_BATCH_ORDER.indexOf(b);
    if (idx !== -1) return `var(--batch-ap${b.slice(3)})`;
    let h = 0;
    for (let i = 0; i < b.length; i++) h = (h * 31 + b.charCodeAt(i)) >>> 0;
    return NON_AP_PALETTE[h % NON_AP_PALETTE.length];
  }
  // Canvas fillStyle can't consume var(--x) — resolve to the literal value for Chart.js.
  function sResolveColor(cssColor) {
    if (!cssColor.startsWith('var(')) return cssColor;
    const varName = cssColor.slice(4, -1).split(',')[0].trim();
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
  }

  // Aircraft type order/labels — duplicated from view-aircraft.js's U_TYPE_ORDER (IIFE-scoped there, not exported).
  const S_TYPE_ORDER = ['DA40TDI', 'DA40CS', 'C172', 'DA42TDI', 'DA42NG', 'R44', 'DA40_SIM', 'DA42_SIM', 'R44_SIM'];

  // Generic multi-select chip picker. selected === null means "all" (matches the
  // convention FilterBar already uses elsewhere in this app for filters.batches etc).
  function MultiSelectChips({ label, options, selected, onChange, colorOf, searchable }) {
    const [q, setQ] = useState('');
    const isAll = !selected || selected.length === 0;
    const isSel = v => isAll || selected.includes(v);
    const toggle = v => {
      if (isAll) { onChange([v]); return; }
      const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v];
      onChange(next.length === options.length || next.length === 0 ? null : next);
    };
    const shown = searchable && q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)', flex: 1 }}>{label}</span>
          {!isAll && (
            <span onClick={() => onChange(null)} className="mono uc" style={{ fontSize: 7, padding: '1px 5px', borderRadius: 2, cursor: 'pointer', border: '1px solid var(--line)', color: 'var(--ink-3)' }}>ALL</span>
          )}
        </div>
        {searchable && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="search…"
            style={{ fontSize: 9, padding: '3px 6px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit' }}/>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxHeight: 100, overflowY: 'auto' }}>
          {shown.map(v => {
            const on = isSel(v);
            const col = colorOf ? colorOf(v) : 'var(--ink-2)';
            return (
              <span key={v} onClick={() => toggle(v)} className="mono uc" style={{
                padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                background: on ? `color-mix(in oklch,${col} 16%,transparent)` : 'transparent',
                border: `1px solid ${on ? col : 'var(--line)'}`, color: on ? col : 'var(--ink-3)',
                fontWeight: on ? 600 : 400,
              }}>{v}</span>
            );
          })}
          {shown.length === 0 && <span className="mono" style={{ fontSize: 8, color: 'var(--ink-3)' }}>no matches</span>}
        </div>
      </div>
    );
  }

  function statusColor(s) {
    if (s === 'Pending') return 'var(--col-pending)';
    if (s === 'Completed') return 'var(--col-done)';
    if (s === 'Canceled') return 'var(--col-cancel)';
    if (s === 'Standby') return 'var(--col-stby)';
    return 'var(--ink-2)';
  }

  // ──────────────────────────────────────────────────────────────────────
  // KpiStrip — 13-tile summary: totals, breakdown by status, rates, hours.
  // ──────────────────────────────────────────────────────────────────────
  function KpiStrip({ kpi, isMobile }) {
    const Tile = ({ label, value, color, sub }) => (
      <div style={{ padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, borderTop: `2px solid ${color}`, minWidth: 76 }}>
        <div className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{label}</div>
        <div className="num" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1, color: 'var(--ink)', marginTop: 2 }}>{value}</div>
        {sub && <div className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>}
      </div>
    );
    const pct = v => (v == null ? '—' : `${v.toFixed(0)}%`);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(auto-fit,minmax(96px,1fr))', gap: 8 }}>
        <Tile label="TOTAL" value={kpi.total} color="var(--ink-2)" sub={`${kpi.bookedHours.toFixed(0)}h booked`}/>
        <Tile label="PENDING" value={kpi.pending} color="var(--col-pending)"/>
        <Tile label="COMPLETED" value={kpi.completed} color="var(--col-done)"/>
        <Tile label="CANCELED" value={kpi.canceled} color="var(--col-cancel)"/>
        <Tile label="STANDBY" value={kpi.standby} color="var(--col-stby)"/>
        <Tile label="SIM" value={kpi.sim} color="var(--col-sim)"/>
        <Tile label="HOURS" value={kpi.completedHours.toFixed(1)} color="var(--col-done)"/>
        <Tile label="COMPLETION" value={pct(kpi.completionRate)} color="var(--col-done)"/>
        <Tile label="CANCELLATION" value={pct(kpi.cancellationRate)} color="var(--col-cancel)"/>
        <Tile label="AVG H/FLIGHT" value={kpi.avgHoursPerFlight == null ? '—' : kpi.avgHoursPerFlight.toFixed(1)} color="var(--ink-2)"/>
        <Tile label="BATCHES" value={kpi.activeBatches} color="var(--ink-2)"/>
        <Tile label="STUDENTS" value={kpi.activeStudents} color="var(--ink-2)"/>
        <Tile label="AP-127 SHARE" value={pct(kpi.ap127SharePct)} color="var(--highlight)"/>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // CompositionStrip — batch composition stacked bar + legend
  // ──────────────────────────────────────────────────────────────────────
  function CompositionStrip({ slices, metricLabel }) {
    if (slices.length === 0) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>NO BATCHES IN FILTERED SET</span>
        </div>
      );
    }
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>BATCH COMPOSITION</div>
          <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>SHARE OF {metricLabel.toUpperCase()} HOURS IN PERIOD</div>
        </div>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--line)' }}>
            {slices.map(s => (
              <div key={s.batch} title={`${s.batch}: ${s.pct.toFixed(1)}% · ${s.hours.toFixed(1)}h`}
                style={{ width: `${Math.max(s.pct, 0.5)}%`, background: s.color, opacity: 0.88 }}/>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
            {slices.map(s => (
              <div key={s.batch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }}/>
                <span className="mono uc" style={{ fontSize: 10, color: s.batch === HIGHLIGHT_BATCH ? 'var(--highlight)' : 'var(--ink-2)', fontWeight: s.batch === HIGHLIGHT_BATCH ? 700 : 400 }}>{s.batch}</span>
                <span className="mono num" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{s.flights} flt · {s.hours.toFixed(1)}h · {s.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── StackedBatchChart — reusable Chart.js stacked bar (Task 6, reused by Task 7) ──
  function StackedBatchChart({ title, subtitle, labels, batches, series, unit }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
      if (!canvasRef.current) return;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      if (window.ChartDataLabels) { try { Chart.register(window.ChartDataLabels); } catch (e) {} }

      const cs = getComputedStyle(document.documentElement);
      const ink3 = cs.getPropertyValue('--ink-3').trim() || '#888';
      const lineC = cs.getPropertyValue('--line').trim() || '#333';

      const datasets = batches.map(b => {
        const col = sResolveColor(sBatchColor(b));
        return {
          label: b,
          data: (series[b] || labels.map(() => 0)).map(v => +v.toFixed(unit === 'hours' ? 2 : 0)),
          backgroundColor: col,
          borderColor: col,
          borderWidth: 0.5,
          stack: 'batches',
          datalabels: {
            color: '#0b0e14',
            font: { family: 'monospace', size: 8, weight: '600' },
            display: ctx => {
              const v = ctx.dataset.data[ctx.dataIndex];
              const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
              const bar = meta.data[ctx.dataIndex];
              return v > 0 && bar && bar.height > 11;
            },
            formatter: v => (v > 0 ? (unit === 'hours' ? v.toFixed(1) : String(v)) : null),
            anchor: 'center', align: 'center',
          },
        };
      });

      const ctx = canvasRef.current.getContext('2d');
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top', labels: { color: ink3, font: { family: 'monospace', size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Number(c.raw).toFixed(unit === 'hours' ? 1 : 0)}${unit === 'hours' ? 'h' : ''}` } },
          },
          scales: {
            x: { stacked: true, ticks: { color: ink3, font: { family: 'monospace', size: 8 }, maxRotation: 45, maxTicksLimit: 24 }, grid: { color: lineC } },
            y: { stacked: true, beginAtZero: true, ticks: { color: ink3, font: { family: 'monospace', size: 9 }, callback: v => (unit === 'hours' ? v + 'h' : v) }, grid: { color: lineC } },
          },
        },
      });

      return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    }, [labels, batches, series, unit]);

    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>{title}</div>
          {subtitle && <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        <div style={{ padding: '10px 12px', height: 240, position: 'relative' }}>
          <canvas ref={canvasRef}/>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // SummaryBoard — placeholder shell for now; filled in by Tasks 2-11.
  // ══════════════════════════════════════════════════════════════════════
  function SummaryBoard() {
    const app = useApp();
    const { isMobile } = app;
    const today = localToday();

    const [preset, setPreset]         = useState('30d'); // '14d' | '30d' | '90d' | 'custom'
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo]     = useState('');
    const [metric, setMetric]         = useState('effective'); // 'effective' | 'block'

    const [statusSel, setStatusSel]         = useState(['Completed']);
    const [batchMode, setBatchMode]         = useState('ap'); // 'ap' | 'all' | 'custom'
    const [customBatches, setCustomBatches] = useState([]);
    const [instructorSel, setInstructorSel] = useState(null);
    const [studentSel, setStudentSel]       = useState(null);
    const [typeSel, setTypeSel]             = useState(null);
    const [simOn, setSimOn]                 = useState(false);
    const [filterOpen, setFilterOpen]       = useState(false);

    const { from, to } = useMemo(() => {
      if (preset === 'custom' && customFrom && customTo && customFrom <= customTo) {
        return { from: customFrom, to: customTo };
      }
      return sPresetRange(preset, today);
    }, [preset, customFrom, customTo, today]);

    // Seed the custom range the first time CUSTOM is picked, so it starts as a sane 30d window.
    useEffect(() => {
      if (preset === 'custom' && !customFrom && !customTo) {
        const r = sPresetRange('30d', today);
        setCustomFrom(r.from);
        setCustomTo(r.to);
      }
    }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

    const allBatchNames = useMemo(() => [...new Set(FLIGHTS.map(f => f.batch))].filter(Boolean).sort(), []);
    const allInstructors = useMemo(() => [...new Set(FLIGHTS.map(f => f.instructor))].filter(Boolean).sort(), []);
    const allStudents = useMemo(() => [...new Set(FLIGHTS.map(f => f.student))].filter(Boolean).sort(), []);
    const tailToType = useMemo(() => {
      const m = {};
      RESOURCES.forEach(r => { if (r.tail) m[r.tail] = r.acType || 'Unknown'; });
      return m;
    }, []);
    const typeOptions = useMemo(() => {
      const present = new Set(RESOURCES.filter(r => r.acType && !/Classroom/i.test(r.acType)).map(r => r.acType));
      return S_TYPE_ORDER.filter(t => present.has(t));
    }, []);

    // Seed custom batches with the AP-only default the first time CUSTOM mode is picked.
    useEffect(() => {
      if (batchMode === 'custom' && customBatches.length === 0) {
        setCustomBatches(allBatchNames.filter(b => /^AP-/i.test(b)));
      }
    }, [batchMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const batchAllowed = useCallback(b => {
      if (batchMode === 'ap') return /^AP-/i.test(b || '');
      if (batchMode === 'all') return true;
      return customBatches.includes(b);
    }, [batchMode, customBatches]);

    const curMap = useMemo(() => (metric === 'effective' ? sBuildCurMap() : {}), [metric]);
    const hoursOf = useCallback(f => {
      if (f.status !== 'Completed') return 0;
      const mins = metric === 'effective' ? sEffectiveMins(f, curMap) : (f.durMin || 0);
      return mins / 60;
    }, [metric, curMap]);

    const filteredFlights = useMemo(() => {
      return FLIGHTS.filter(f => {
        if (!f.date || f.date < from || f.date > to) return false;
        if (!batchAllowed(f.batch)) return false;
        if (statusSel && statusSel.length > 0 && !statusSel.includes(f.status)) return false;
        if (instructorSel && !instructorSel.includes(f.instructor)) return false;
        if (studentSel && !studentSel.includes(f.student)) return false;
        if (typeSel && !typeSel.includes(tailToType[f.tail] || 'Unknown')) return false;
        if (!simOn && f.isSim) return false;
        return true;
      });
    }, [from, to, batchAllowed, statusSel, instructorSel, studentSel, typeSel, simOn, tailToType]);

    const kpi = useMemo(() => {
      const s = { total: filteredFlights.length, pending: 0, completed: 0, canceled: 0, standby: 0, sim: 0, bookedHours: 0, completedHours: 0 };
      const batchSet = new Set();
      const studentSet = new Set();
      let ap127Hours = 0;
      filteredFlights.forEach(f => {
        if (f.status === 'Pending') s.pending++;
        if (f.status === 'Completed') s.completed++;
        if (f.status === 'Canceled') s.canceled++;
        if (f.isStandby) s.standby++;
        if (f.isSim) s.sim++;
        s.bookedHours += (f.durMin || 0) / 60;
        const h = hoursOf(f);
        s.completedHours += h;
        if (f.batch === HIGHLIGHT_BATCH) ap127Hours += h;
        if (f.batch) batchSet.add(f.batch);
        if (f.student) studentSet.add(f.student);
      });
      const settled = s.completed + s.canceled;
      return {
        ...s,
        completionRate: settled ? (s.completed / settled) * 100 : null,
        cancellationRate: settled ? (s.canceled / settled) * 100 : null,
        avgHoursPerFlight: s.completed ? s.completedHours / s.completed : null,
        activeBatches: batchSet.size,
        activeStudents: studentSet.size,
        ap127SharePct: s.completedHours > 0 ? (ap127Hours / s.completedHours) * 100 : null,
      };
    }, [filteredFlights, hoursOf]);

    const batchStats = useMemo(() => {
      const m = {};
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        if (!m[b]) m[b] = { batch: b, total: 0, pending: 0, completed: 0, canceled: 0, standby: 0, bookedHours: 0, completedHours: 0 };
        m[b].total++;
        m[b].bookedHours += (f.durMin || 0) / 60;
        m[b].completedHours += hoursOf(f);
        if (f.status === 'Pending') m[b].pending++;
        if (f.status === 'Completed') m[b].completed++;
        if (f.status === 'Canceled') m[b].canceled++;
        if (f.isStandby) m[b].standby++;
      });
      return Object.values(m);
    }, [filteredFlights, hoursOf]);

    const batchesPresent = useMemo(() => {
      const names = batchStats.map(b => b.batch);
      const apOnes = AP_BATCH_ORDER.filter(b => names.includes(b));
      const others = names.filter(b => !AP_BATCH_ORDER.includes(b)).sort();
      return [...apOnes, ...others];
    }, [batchStats]);

    const compositionSlices = useMemo(() => {
      const total = batchStats.reduce((a, b) => a + b.completedHours, 0);
      return [...batchStats]
        .filter(b => b.completedHours > 0 || b.total > 0)
        .sort((a, b) => b.completedHours - a.completedHours)
        .map(b => ({
          batch: b.batch,
          color: sBatchColor(b.batch),
          flights: b.total,
          hours: b.completedHours,
          pct: total > 0 ? (b.completedHours / total) * 100 : 0,
        }));
    }, [batchStats]);

    const days = useMemo(() => sDayRange(from, to), [from, to]);

    const dailyBuckets = useMemo(() => {
      const countMap = {}; // batch -> date -> count
      const hourMap = {};  // batch -> date -> hours
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        if (!countMap[b]) { countMap[b] = {}; hourMap[b] = {}; }
        countMap[b][f.date] = (countMap[b][f.date] || 0) + 1;
        hourMap[b][f.date] = (hourMap[b][f.date] || 0) + hoursOf(f);
      });
      return { countMap, hourMap };
    }, [filteredFlights, hoursOf]);

    const dayLabels = useMemo(() => days.map(sFmtShort), [days]);
    const dailyCountSeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => { s[b] = days.map(d => (dailyBuckets.countMap[b] || {})[d] || 0); });
      return s;
    }, [batchesPresent, days, dailyBuckets]);
    const dailyHoursSeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => { s[b] = days.map(d => (dailyBuckets.hourMap[b] || {})[d] || 0); });
      return s;
    }, [batchesPresent, days, dailyBuckets]);

    const weekLabelKeys = useMemo(() => { const set = new Set(); days.forEach(d => set.add(sWeekKey(d))); return [...set].sort(); }, [days]);
    const monthLabelKeys = useMemo(() => { const set = new Set(); days.forEach(d => set.add(sMonthKey(d))); return [...set].sort(); }, [days]);

    const weeklyBuckets = useMemo(() => {
      const m = {}; // batch -> weekKey -> hours
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        const wk = sWeekKey(f.date);
        if (!m[b]) m[b] = {};
        m[b][wk] = (m[b][wk] || 0) + hoursOf(f);
      });
      return m;
    }, [filteredFlights, hoursOf]);
    const monthlyBuckets = useMemo(() => {
      const m = {}; // batch -> monthKey -> hours
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        const mk = sMonthKey(f.date);
        if (!m[b]) m[b] = {};
        m[b][mk] = (m[b][mk] || 0) + hoursOf(f);
      });
      return m;
    }, [filteredFlights, hoursOf]);

    const weekLabels = useMemo(() => weekLabelKeys.map(sFmtWeek), [weekLabelKeys]);
    const monthLabels = useMemo(() => monthLabelKeys.map(sFmtMonth), [monthLabelKeys]);
    const weeklySeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => { s[b] = weekLabelKeys.map(wk => (weeklyBuckets[b] || {})[wk] || 0); });
      return s;
    }, [batchesPresent, weekLabelKeys, weeklyBuckets]);
    const monthlySeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => { s[b] = monthLabelKeys.map(mk => (monthlyBuckets[b] || {})[mk] || 0); });
      return s;
    }, [batchesPresent, monthLabelKeys, monthlyBuckets]);

    const resetFilters = () => {
      setStatusSel(['Completed']);
      setBatchMode('ap');
      setCustomBatches([]);
      setInstructorSel(null);
      setStudentSel(null);
      setTypeSel(null);
      setSimOn(false);
    };
    const filtersActive = statusSel.length !== 1 || statusSel[0] !== 'Completed'
      || batchMode !== 'ap' || !!instructorSel || !!studentSel || !!typeSel || simOn;

    const PresetChip = ({ p, label }) => (
      <span onClick={() => setPreset(p)} className="mono uc" style={{
        padding: '3px 9px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
        background: preset === p ? 'color-mix(in oklch,var(--ink-2) 14%,var(--surface))' : 'transparent',
        border: `1px solid ${preset === p ? 'var(--ink-2)' : 'var(--line)'}`,
        color: preset === p ? 'var(--ink)' : 'var(--ink-3)', fontWeight: preset === p ? 600 : 400,
      }}>{label}</span>
    );

    const MetricChip = ({ m, label }) => (
      <span onClick={() => setMetric(m)} className="mono uc" style={{
        padding: '3px 9px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
        background: metric === m ? 'color-mix(in oklch,var(--highlight) 14%,var(--surface))' : 'transparent',
        border: `1px solid ${metric === m ? 'var(--highlight)' : 'var(--line)'}`,
        color: metric === m ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: metric === m ? 600 : 400,
      }}>{label}</span>
    );

    return (
      <ArtboardShell style={{ display: 'flex', flexDirection: 'column' }}>
        <ThemeStyle/>
        <div style={{ minHeight: 38, padding: '0 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', rowGap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--col-pending)', boxShadow: '0 0 8px var(--col-pending)' }}/>
            <ViewIcon id="analytics" size={12} color="var(--ink-2)"/>
            <div className="mono uc" style={{ fontSize: 11, fontWeight: 600 }}>OPS ANALYTICS</div>
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
            <PresetChip p="14d" label="14D"/>
            <PresetChip p="30d" label="30D"/>
            <PresetChip p="90d" label="90D"/>
            <PresetChip p="custom" label="CUSTOM"/>
          </div>

          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <DateCalendarTrigger value={customFrom} onChange={setCustomFrom} dateSet={DATE_SET}/>
              <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>→</span>
              <DateCalendarTrigger value={customTo} onChange={setCustomTo} dateSet={DATE_SET}/>
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
            <MetricChip m="effective" label="EFFECTIVE"/>
            <MetricChip m="block" label="BLOCK"/>
          </div>

          <FocusControls/>

          <div style={{ flex: 1 }}/>
          <RefreshButton/>
          <LastUpdate/>
        </div>

        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span onClick={() => setFilterOpen(v => !v)} className="mono uc" style={{
              padding: '4px 8px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${filterOpen || filtersActive ? 'var(--col-pending)' : 'var(--line)'}`,
              background: filterOpen || filtersActive ? 'color-mix(in oklch,var(--col-pending) 10%,transparent)' : 'transparent',
              color: filterOpen || filtersActive ? 'var(--col-pending)' : 'var(--ink-3)',
              fontWeight: filtersActive ? 600 : 400,
            }}>FILTERS {filterOpen ? '▲' : '▾'}</span>
            {filtersActive && (
              <span onClick={resetFilters} className="mono uc" style={{ fontSize: 8, padding: '3px 7px', borderRadius: 3, cursor: 'pointer', border: '1px solid var(--line)', color: 'var(--ink-3)' }}>RESET TO DEFAULT</span>
            )}
          </div>
          {filterOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6 }}>
              <MultiSelectChips label="STATUS" options={['Pending','Completed','Canceled','Standby']} selected={statusSel.length ? statusSel : null} onChange={v => setStatusSel(v || [])} colorOf={statusColor}/>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>BATCH</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['ap','AP ONLY'],['all','ALL'],['custom','CUSTOM']].map(([m,lbl]) => (
                    <span key={m} onClick={() => setBatchMode(m)} className="mono uc" style={{
                      padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                      background: batchMode === m ? 'color-mix(in oklch,var(--ink-2) 16%,transparent)' : 'transparent',
                      border: `1px solid ${batchMode === m ? 'var(--ink-2)' : 'var(--line)'}`,
                      color: batchMode === m ? 'var(--ink)' : 'var(--ink-3)', fontWeight: batchMode === m ? 600 : 400,
                    }}>{lbl}</span>
                  ))}
                </div>
                {batchMode === 'custom' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxHeight: 100, overflowY: 'auto' }}>
                    {allBatchNames.map(b => {
                      const on = customBatches.includes(b);
                      const col = sBatchColor(b);
                      return (
                        <span key={b} onClick={() => setCustomBatches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
                          className="mono uc" style={{
                            padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                            background: on ? `color-mix(in oklch,${col} 16%,transparent)` : 'transparent',
                            border: `1px solid ${on ? col : 'var(--line)'}`, color: on ? col : 'var(--ink-3)', fontWeight: on ? 600 : 400,
                          }}>{b}</span>
                      );
                    })}
                  </div>
                )}
              </div>
              <MultiSelectChips label="INSTRUCTOR" options={allInstructors} selected={instructorSel} onChange={setInstructorSel} searchable/>
              <MultiSelectChips label="STUDENT" options={allStudents} selected={studentSel} onChange={setStudentSel} searchable/>
              <MultiSelectChips label="AIRCRAFT TYPE" options={typeOptions} selected={typeSel} onChange={setTypeSel}/>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>SIMULATOR</span>
                <span onClick={() => setSimOn(v => !v)} className="mono uc" style={{
                  padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer', width: 'fit-content',
                  background: simOn ? 'color-mix(in oklch,var(--col-sim) 16%,transparent)' : 'transparent',
                  border: `1px solid ${simOn ? 'var(--col-sim)' : 'var(--line)'}`, color: simOn ? 'var(--col-sim)' : 'var(--ink-3)',
                }}>{simOn ? 'SHOWING SIM' : 'HIDING SIM'}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ padding: '10px 10px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <KpiStrip kpi={kpi} isMobile={isMobile}/>
            <CompositionStrip slices={compositionSlices} metricLabel={metric}/>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <StackedBatchChart title="DAILY FLIGHT COUNT BY BATCH" subtitle="STACKED · ONE BAR PER DAY" labels={dayLabels} batches={batchesPresent} series={dailyCountSeries} unit="flights"/>
              <StackedBatchChart title="DAILY FLIGHT HOURS BY BATCH" subtitle={`STACKED · ${metric.toUpperCase()} HOURS`} labels={dayLabels} batches={batchesPresent} series={dailyHoursSeries} unit="hours"/>
              <StackedBatchChart title="WEEKLY HOURS BY BATCH" subtitle="MONDAY-START WEEKS" labels={weekLabels} batches={batchesPresent} series={weeklySeries} unit="hours"/>
              <StackedBatchChart title="MONTHLY HOURS BY BATCH" subtitle="CALENDAR MONTH" labels={monthLabels} batches={batchesPresent} series={monthlySeries} unit="hours"/>
            </div>
          </div>
        </div>
        <Drawer/>
      </ArtboardShell>
    );
  }

  window.SummaryBoard = SummaryBoard;
})();
