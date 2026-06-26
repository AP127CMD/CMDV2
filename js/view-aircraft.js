// view-aircraft.js — CATC Aircraft Status  (Fleet · OPS Cross-Check · Utilization · FI Stat · SP Stat)
// Fleet data : Google Sheets CSV fetched live + 5-min auto-refresh
// Cross-check: compares Sheet "Flyable?" vs window.FLIGHT_DATA.resources.isMaint
// Utilization: block/airborne hours from FLIGHT_DATA.flights — roster heatmap + charts
(function () {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTOc87NylhUtL_17hM8TWNKucAqhO84TPlK4l_H704A8AGc0Idhdt5FoggsPtwR1uCVyZixOyPppZ3B/pub?gid=1661381999&single=true&output=csv';
  const DEFAULT_MODELS = ['Diamond DA40 TDI', 'Diamond DA40 CS'];

  // ── CSV parsers ────────────────────────────────────────────────────────────
  function parseCSVRow(line) {
    const fields = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    fields.push(cur.trim()); return fields;
  }

  function parseDueIn(raw) {
    if (!raw || raw === 'N/A' || !raw.trim()) return { display: raw || '—', totalHours: null };
    const p = raw.trim().split(':');
    if (p.length < 2) return { display: raw, totalHours: null };
    const h = parseInt(p[0], 10), m = parseInt(p[1].padStart(2, '0'), 10);
    return { display: `${p[0]}:${p[1].padStart(2, '0')}`, totalHours: isNaN(h) || isNaN(m) ? null : h + m / 60 };
  }

  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

  function extractFlyableDate(remarks) {
    if (!remarks) return null;
    const m = remarks.match(/flyable\s+on\s+(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{2,4})/i);
    if (!m) return null;
    const day = parseInt(m[1], 10), mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (!mon) return null;
    const yr = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return { display: `${day} ${m[2].slice(0,3)} ${yr}`, iso: `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}` };
  }

  function normDate(s) {
    if (!s || s === 'N/A') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
    if (!m) return null;
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)]; if (!mon) return null;
    return `${m[3]}-${String(mon).padStart(2,'0')}-${String(parseInt(m[1],10)).padStart(2,'0')}`;
  }

  function parseCSVData(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 3) return { meta: {}, aircraft: [] };
    const r0 = parseCSVRow(lines[0]);
    const meta = { lastUpdate: r0[3] || '', updatedBy: r0[6] || '' };
    const aircraft = [];
    for (let i = 2; i < lines.length; i++) {
      const f = parseCSVRow(lines[i]); if (!f[0] || !f[1]) continue;
      const toInt = s => { const x = parseInt(String(s).replace(/,/g,''), 10); return isNaN(x) ? null : x; };
      const rawRemarks = (f[11] || '').replace(/^\(|\)$/g, '').trim();
      const dueIn = parseDueIn(f[5]);
      aircraft.push({
        item: f[0], reg: f[1], model: f[2] || '',
        flyable: (f[3] || '').toLowerCase() === 'yes',
        lastFlight: f[4] || '', lastFlightIso: normDate(f[4]),
        dueInDisplay: dueIn.display, dueInHours: dueIn.totalHours,
        acCertDate: f[6] || '', acCertDays: toInt(f[7]),
        coaCertDate: f[8] || '', coaCertDays: toInt(f[9]),
        insurance: f[10] || '', remarks: rawRemarks,
        flyableDate: extractFlyableDate(rawRemarks),
      });
    }
    return { meta, aircraft };
  }

  // ── Build OPS lookup from window.FLIGHT_DATA.resources ────────────────────
  function buildOpsMap() {
    const resources = (window.FLIGHT_DATA && window.FLIGHT_DATA.resources) || [];
    const map = {};
    resources.forEach(r => {
      if (!r.tail || /SIM|Classroom/i.test(r.acType || '')) return;
      map[r.tail] = { tail: r.tail, acType: r.acType || '', isMaint: !!r.isMaint };
    });
    return map;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function daysColor(d) {
    if (d === null) return 'var(--ink-4,#555)';
    if (d < 0)    return 'var(--col-cancel)';
    if (d <= 60)  return '#ff8c42';
    if (d <= 120) return 'var(--col-pending)';
    return 'var(--col-done)';
  }
  const shortModel = m => m.replace('Diamond ', '').replace('Robinson ', '');

  function DaysCell({ date, days }) {
    const col = daysColor(days);
    return (
      <td className="mono" style={{ padding: '5px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{date || '—'}</div>
        {days !== null && <div style={{ fontSize: 10, color: col, fontWeight: 700, marginTop: 1 }}>{days < 0 ? `EXP (${days}d)` : `${days}d`}</div>}
      </td>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UTILIZATION TAB
  // ══════════════════════════════════════════════════════════════════════════

  const PS_PALETTE = ['#4a9eff','#2dd4bf','#fb923c','#a78bfa','#e879f9','#fbbf24','#22d3ee','#f87171','#c084fc','#86efac','#fdba74','#67e8f9'];

  const U_TYPE_ORDER = ['DA40TDI','DA40CS','C172','DA42TDI','DA42NG','R44','DA40_SIM','DA42_SIM','R44_SIM'];
  const U_TYPE_COLORS = {
    DA40TDI: '#4a9eff', DA40CS: '#2dd4bf', C172: '#fb923c',
    DA42TDI: '#a78bfa', DA42NG: '#e879f9', R44: '#fbbf24',
    DA40_SIM: '#64748b', DA42_SIM: '#94a3b8', R44_SIM: '#475569',
  };
  const U_TYPE_LABELS = {
    DA40TDI: 'DA40 TDI', DA40CS: 'DA40 CS', C172: 'C172',
    DA42TDI: 'DA42 TDI', DA42NG: 'DA42 NG', R44: 'R44 Heli',
    DA40_SIM: 'DA40 Sim', DA42_SIM: 'DA42 Sim', R44_SIM: 'R44 Sim',
  };

  function uIsSim(acType) { return /SIM/i.test(acType || ''); }

  function uNormTail(t) {
    if (!t) return 'UNKNOWN';
    let s = t.trim().toUpperCase().replace(/\s+-\s+|\s+/g, '-');
    if (/^HS[A-Z0-9]{3,5}$/.test(s)) s = 'HS-' + s.slice(2);
    return s;
  }

  function uParseAirborneMin(s) {
    if (!s || s === '00:00') return 0;
    const p = s.split(':');
    if (p.length < 2) return 0;
    const h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    return (isNaN(h) || isNaN(m)) ? 0 : h * 60 + m;
  }

  function uAddDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function uDayRange(start, end) {
    const arr = []; let c = start;
    while (c <= end && arr.length < 366) { arr.push(c); c = uAddDays(c, 1); }
    return arr;
  }

  function uPresetRange(p, today) {
    if (p === '1d')    return { from: today, to: today };
    if (p === '7d')    return { from: uAddDays(today, -6), to: today };
    if (p === '30d')   return { from: uAddDays(today, -29), to: today };
    if (p === '90d')   return { from: uAddDays(today, -89), to: today };
    if (p === 'month') { const [y, m] = today.split('-'); return { from: `${y}-${m}-01`, to: today }; }
    return { from: uAddDays(today, -29), to: today };
  }

  function uFmtDate(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }

  function uFmtH(h) { return (!h || h < 0.04) ? '—' : h.toFixed(1) + 'h'; }

  function UtilizationTab() {
    const today = typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0, 10);

    const [preset,     setPreset]     = useState('30d');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo,   setCustomTo]   = useState('');
    const [typeFilter, setTypeFilter] = useState([]);   // [] = all types
    const [showSims,   setShowSims]   = useState(false);
    const [metric,     setMetric]     = useState('block');
    const [incPend,    setIncPend]    = useState(false);
    const [ap127Only,  setAp127Only]  = useState(false);
    const [drawer,     setDrawer]     = useState(null); // {tail, tailLabel, date} | null
    const [collapsed,  setCollapsed]  = useState({});

    const dailyCanvasRef = useRef(null);
    const dailyChartRef  = useRef(null);

    // ── Date range ──────────────────────────────────────────────────────────
    const { from, to } = useMemo(() => {
      if (preset === 'custom' && customFrom && customTo && customFrom <= customTo)
        return { from: customFrom, to: customTo };
      return uPresetRange(preset, today);
    }, [preset, customFrom, customTo, today]);

    const days = useMemo(() => uDayRange(from, to), [from, to]);

    // ── Normalized resources map: normTail → {acType, isMaint} ─────────────
    const normOps = useMemo(() => {
      const m = {};
      ((window.FLIGHT_DATA && window.FLIGHT_DATA.resources) || []).forEach(r => {
        if (r.tail) m[uNormTail(r.tail)] = { acType: r.acType || 'Unknown', isMaint: !!r.isMaint };
      });
      return m;
    }, []);

    // ── Fleet roster grouped by type ────────────────────────────────────────
    const fleetByType = useMemo(() => {
      const byType = {};
      ((window.FLIGHT_DATA && window.FLIGHT_DATA.resources) || []).forEach(r => {
        if (!r.tail) return;
        const isS = uIsSim(r.acType);
        if (!showSims && isS) return;
        const t = r.acType || 'Unknown';
        if (!byType[t]) byType[t] = [];
        byType[t].push({ tail: r.tail, normTail: uNormTail(r.tail), isMaint: !!r.isMaint, isSim: isS });
      });
      return byType;
    }, [showSims]);

    // Available type chips
    const availTypes = useMemo(() => {
      const types = new Set(((window.FLIGHT_DATA && window.FLIGHT_DATA.resources) || []).map(r => r.acType).filter(Boolean));
      return U_TYPE_ORDER.filter(t => types.has(t) && (showSims || !uIsSim(t)));
    }, [showSims]);

    // ── Flight metrics ──────────────────────────────────────────────────────
    const { flightsByTailDay, tailTotals, dayTotals, typeDayTotals, kpi } = useMemo(() => {
      const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
      const flightsByTailDay = {};
      const tailTotals = {};
      const dayTotals = {};
      const typeDayTotals = {};
      let compCount = 0;

      flights.forEach(f => {
        if (!f.date || f.date < from || f.date > to) return;
        if (f.status === 'Canceled') return;
        if (!incPend && f.status !== 'Completed') return;
        if (!f.tail || /\(SIM\)/i.test(f.tail)) return;

        const nt = uNormTail(f.tail);
        const info = normOps[nt];
        const acType = info ? info.acType : 'Unknown';
        if (uIsSim(acType) && !showSims) return;
        if (typeFilter.length > 0 && !typeFilter.includes(acType)) return;
        if (ap127Only && !isAP127Batch(f.batch)) return;

        const blockMins  = f.durMin || 0;
        const airborneMin = f.airborne ? uParseAirborneMin(f.airborne) : 0;
        const useMins    = (metric === 'airborne' && airborneMin > 0) ? airborneMin : blockMins;
        const h          = useMins / 60;
        const usedFallback = metric === 'airborne' && airborneMin === 0 && blockMins > 0;

        const rec = { ...f, _h: h, _block: blockMins / 60, _airborne: airborneMin / 60, _acType: acType, _usedFallback: usedFallback };

        if (!flightsByTailDay[nt]) flightsByTailDay[nt] = {};
        if (!flightsByTailDay[nt][f.date]) flightsByTailDay[nt][f.date] = [];
        flightsByTailDay[nt][f.date].push(rec);

        tailTotals[nt] = (tailTotals[nt] || 0) + h;
        dayTotals[f.date] = (dayTotals[f.date] || 0) + h;

        if (!typeDayTotals[acType]) typeDayTotals[acType] = {};
        typeDayTotals[acType][f.date] = (typeDayTotals[acType][f.date] || 0) + h;

        if (f.status === 'Completed') compCount++;
      });

      const activeTailKeys = Object.keys(tailTotals).filter(t => tailTotals[t] > 0);
      const totalHours = Object.values(tailTotals).reduce((s, v) => s + v, 0);
      const avgPerTail = activeTailKeys.length > 0 ? totalHours / activeTailKeys.length : 0;
      const busiestTail = activeTailKeys.length > 0
        ? activeTailKeys.reduce((a, b) => tailTotals[a] >= tailTotals[b] ? a : b)
        : null;

      const kpi = {
        totalHours, compCount, activeTails: activeTailKeys.length,
        avgPerTail, busiestTail, busiestHours: busiestTail ? tailTotals[busiestTail] : 0,
      };

      return { flightsByTailDay, tailTotals, dayTotals, typeDayTotals, kpi };
    }, [from, to, typeFilter, showSims, metric, incPend, ap127Only, normOps]);

    // ── Max cell hours (for heatmap color scale) ────────────────────────────
    const hmTypes = U_TYPE_ORDER.filter(t => fleetByType[t] && fleetByType[t].length > 0);
    const maxCellH = useMemo(() => {
      let mx = 0.5;
      hmTypes.forEach(t => {
        (fleetByType[t] || []).forEach(ac => {
          days.forEach(d => {
            const h = ((flightsByTailDay[ac.normTail] || {})[d] || []).reduce((s, f) => s + f._h, 0);
            if (h > mx) mx = h;
          });
        });
      });
      return mx;
    }, [flightsByTailDay, fleetByType, hmTypes, days]);

    // ── Daily stacked bar chart ─────────────────────────────────────────────
    useEffect(() => {
      if (!dailyCanvasRef.current) return;
      if (dailyChartRef.current) { dailyChartRef.current.destroy(); dailyChartRef.current = null; }

      const cs = getComputedStyle(document.documentElement);
      const ink3  = cs.getPropertyValue('--ink-3').trim()  || 'rgba(136,136,136,0.8)';
      const lineC = cs.getPropertyValue('--line').trim()   || 'rgba(60,60,60,0.4)';

      const activeTypes = U_TYPE_ORDER.filter(t => {
        if (!showSims && uIsSim(t)) return false;
        if (typeFilter.length > 0 && !typeFilter.includes(t)) return false;
        return Object.keys(typeDayTotals[t] || {}).length > 0;
      });

      const datasets = activeTypes.map(t => ({
        label: U_TYPE_LABELS[t] || t,
        data: days.map(d => +((typeDayTotals[t] || {})[d] || 0).toFixed(2)),
        backgroundColor: (U_TYPE_COLORS[t] || '#64748b') + 'cc',
        borderColor:      U_TYPE_COLORS[t] || '#64748b',
        borderWidth: 0.5,
        stack: 'fleet',
      }));

      // Fleet total line overlay
      datasets.push({
        label: 'Fleet Total',
        data: days.map(d => +((dayTotals[d] || 0)).toFixed(2)),
        type: 'line',
        borderColor: 'rgba(255,255,255,0.35)',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.2,
        order: -1,
      });

      const ctx = dailyCanvasRef.current.getContext('2d');
      dailyChartRef.current = new Chart(ctx, {
        type: 'bar',
        data: { labels: days.map(d => uFmtDate(d)), datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true, position: 'top',
              labels: { color: ink3, font: { family: 'monospace', size: 10 }, boxWidth: 12, padding: 10 },
            },
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Number(c.raw).toFixed(1)}h` } },
            datalabels: { display: false },
          },
          scales: {
            x: {
              stacked: true,
              ticks: { color: ink3, font: { family: 'monospace', size: 9 }, maxRotation: 45, maxTicksLimit: 20 },
              grid: { color: lineC },
            },
            y: {
              stacked: true,
              ticks: { color: ink3, font: { family: 'monospace', size: 9 }, callback: v => v + 'h' },
              grid: { color: lineC },
              title: { display: true, text: metric === 'block' ? 'Block Hours' : 'Airborne Hours', color: ink3, font: { size: 10 } },
            },
          },
        },
      });

      return () => { if (dailyChartRef.current) { dailyChartRef.current.destroy(); dailyChartRef.current = null; } };
    }, [days, dayTotals, typeDayTotals, typeFilter, showSims, metric]);

    // ── Drawer derived data ─────────────────────────────────────────────────
    const drawerData = useMemo(() => {
      if (!drawer) return null;
      const nt = drawer.tail;
      const allForTail = Object.values(flightsByTailDay[nt] || {}).flat();
      const periodH  = allForTail.reduce((s, f) => s + f._h, 0);
      const selDate  = drawer.date;
      const dow      = new Date(selDate + 'T12:00:00Z').getUTCDay();
      const wkStart  = uAddDays(selDate, -(dow === 0 ? 6 : dow - 1));
      const wkEnd    = uAddDays(wkStart, 6);
      const selMonth = selDate.slice(0, 7);
      const weekH    = allForTail.filter(f => f.date >= wkStart && f.date <= wkEnd).reduce((s, f) => s + f._h, 0);
      const monthH   = allForTail.filter(f => f.date.slice(0, 7) === selMonth).reduce((s, f) => s + f._h, 0);
      const dayH     = allForTail.filter(f => f.date === selDate).reduce((s, f) => s + f._h, 0);
      const dayFlights = (flightsByTailDay[nt] || {})[selDate] || [];
      return { periodH, weekH, monthH, dayH, wkStart, selMonth, dayFlights };
    }, [drawer, flightsByTailDay]);

    // ── Handlers ────────────────────────────────────────────────────────────
    const toggleType     = t => setTypeFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    const toggleCollapse = t => setCollapsed(prev => ({ ...prev, [t]: !prev[t] }));
    const handleCellClick = (normTail, tailLabel, date, hasFlights) => {
      if (!hasFlights) return;
      setDrawer(prev => (prev && prev.tail === normTail && prev.date === date) ? null : { tail: normTail, tailLabel, date });
    };

    const CELL_W = Math.max(12, Math.min(30, Math.floor(780 / Math.max(days.length, 1))));
    const CELL_H = 22;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '6px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>Period:</span>
          {[['1d','Today'],['7d','7d'],['30d','30d'],['90d','90d'],['month','This Month'],['custom','Custom']].map(([p, lbl]) => (
            <button key={p} className={'chip' + (preset === p ? ' sel' : '')} onClick={() => setPreset(p)} style={{ fontSize: 10, padding: '3px 8px' }}>{lbl}</button>
          ))}
          {preset === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ fontSize: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', color: 'var(--ink-1)', fontFamily: 'monospace' }} />
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ fontSize: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', color: 'var(--ink-1)', fontFamily: 'monospace' }} />
            </>
          )}

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>Type:</span>
          <button className={'chip' + (typeFilter.length === 0 ? ' sel' : '')} onClick={() => setTypeFilter([])} style={{ fontSize: 10, padding: '3px 8px' }}>All</button>
          {availTypes.map(t => (
            <button key={t} className={'chip' + (typeFilter.includes(t) ? ' sel' : '')} onClick={() => toggleType(t)}
              style={{ fontSize: 10, padding: '3px 8px', ...(typeFilter.includes(t) ? { borderColor: U_TYPE_COLORS[t], color: U_TYPE_COLORS[t] } : {}) }}>
              {U_TYPE_LABELS[t] || t}
            </button>
          ))}

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <button className={'chip' + (showSims ? ' sel' : '')} onClick={() => setShowSims(s => !s)} style={{ fontSize: 10, padding: '3px 8px' }}>+ Sims</button>

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>Metric:</span>
          <button className={'chip' + (metric === 'block'    ? ' sel' : '')} onClick={() => setMetric('block')}    style={{ fontSize: 10, padding: '3px 8px' }}>Block</button>
          <button className={'chip' + (metric === 'airborne' ? ' sel' : '')} onClick={() => setMetric('airborne')} style={{ fontSize: 10, padding: '3px 8px' }}>Airborne</button>

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <button className={'chip' + (incPend ? ' sel' : '')} onClick={() => setIncPend(s => !s)} style={{ fontSize: 10, padding: '3px 8px' }}>+ Pending</button>

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <button onClick={() => setAp127Only(s => !s)}
            style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: `1px solid ${ap127Only ? 'var(--highlight)' : 'var(--line)'}`, background: ap127Only ? 'color-mix(in oklch,var(--highlight) 14%,var(--surface))' : 'transparent', color: ap127Only ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: ap127Only ? 700 : 400, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 0.3, transition: 'all .1s' }}>
            ◆ AP-127
          </button>

          <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {uFmtDate(from)} – {uFmtDate(to)} · {days.length}d · {kpi.compCount} flights · {kpi.totalHours.toFixed(1)}h
          </span>
        </div>

        {/* ── KPI strip ───────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '8px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', alignItems: 'stretch' }}>
          {[
            { val: kpi.totalHours.toFixed(1) + 'h', label: metric === 'block' ? 'Block Hours' : 'Airborne Hrs', col: 'var(--highlight)' },
            { val: kpi.compCount,                    label: 'Flights Done',   col: 'var(--col-done)'  },
            { val: kpi.activeTails,                  label: 'Active A/C',     col: 'var(--ink-1)'     },
            { val: uFmtH(kpi.avgPerTail),            label: 'Avg / Aircraft', col: 'var(--ink-2)'     },
          ].map(({ val, label, col }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 14px', textAlign: 'center', minWidth: 72 }}>
              <div className="mono" style={{ fontSize: String(val).length > 7 ? 14 : 20, fontWeight: 700, color: col, lineHeight: 1 }}>{val}</div>
              <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 3, whiteSpace: 'nowrap' }}>{label}</div>
            </div>
          ))}
          {kpi.busiestTail && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 14px', textAlign: 'center', minWidth: 96 }}>
              <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: '#fb923c', lineHeight: 1 }}>{kpi.busiestTail}</div>
              <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 3, whiteSpace: 'nowrap' }}>Busiest · {uFmtH(kpi.busiestHours)}</div>
            </div>
          )}
          {metric === 'airborne' && (
            <div className="mono" style={{ fontSize: 9, color: 'var(--col-pending)', padding: '7px 10px', alignSelf: 'center' }}>
              ⚠ Falls back to block time if airborne not recorded
            </div>
          )}
        </div>

        {/* ── Scrollable main content ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Fleet load distribution ────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
              <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: 0.5 }}>◫ Fleet Load Distribution — {days.length}d</span>
              {kpi.activeTails > 0 && (
                <span className="mono" style={{ fontSize: 9, color: 'var(--ink-4,#555)' }}>fleet avg {uFmtH(kpi.avgPerTail)} per active aircraft</span>
              )}
            </div>
            {(() => {
              const entries = [];
              hmTypes.forEach(t => {
                (fleetByType[t] || []).forEach(ac => {
                  entries.push({ ...ac, acType: t, hours: tailTotals[ac.normTail] || 0 });
                });
              });
              entries.sort((a, b) => b.hours - a.hours);
              const maxH = Math.max(...entries.map(a => a.hours), 0.1);
              const avgPct = Math.min(100, (kpi.avgPerTail / maxH) * 100);

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {entries.map(ac => {
                    const pct = (ac.hours / maxH) * 100;
                    const col = U_TYPE_COLORS[ac.acType] || '#64748b';
                    const isEmpty = ac.hours < 0.01;
                    const isAboveAvg = ac.hours > kpi.avgPerTail + 0.1 && !isEmpty;
                    return (
                      <div key={ac.normTail} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono" style={{ width: 82, fontSize: 10, color: 'var(--ink-2)', flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {ac.tail}{ac.isMaint && <span style={{ marginLeft: 3, fontSize: 9 }}>🔧</span>}
                        </span>
                        <div style={{ flex: 1, height: 15, background: 'var(--surface)', borderRadius: 3, overflow: 'visible', position: 'relative', border: '1px solid var(--line)' }}>
                          {!isEmpty && (
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: col + 'bb', borderRadius: 3 }} />
                          )}
                          {/* avg marker */}
                          {kpi.activeTails > 0 && (
                            <div style={{ position: 'absolute', left: `${avgPct}%`, top: -2, bottom: -2, width: 1, background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
                          )}
                        </div>
                        <span className="mono" style={{ width: 38, fontSize: 10, color: isEmpty ? 'var(--ink-4,#555)' : isAboveAvg ? '#fb923c' : 'var(--ink-2)', textAlign: 'right', flexShrink: 0 }}>
                          {isEmpty ? '—' : uFmtH(ac.hours)}
                        </span>
                        <span className="mono uc" style={{ width: 54, fontSize: 9, color: col, flexShrink: 0 }}>{U_TYPE_LABELS[ac.acType] || ac.acType}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ── Daily utilization chart ────────────────────────────────── */}
          <div>
            <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 10, fontWeight: 600, letterSpacing: 0.5 }}>
              ◷ Daily Hours by Type — {metric === 'block' ? 'Block' : 'Airborne'}
            </div>
            <div style={{ height: 200, position: 'relative' }}>
              <canvas ref={dailyCanvasRef} style={{ display: 'block' }} />
            </div>
          </div>

          {/* ── Roster heatmap ────────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: 0.5 }}>
                ▦ Utilization Roster — click cell for detail
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {[['low', 15], ['med', 45], ['high', 80]].map(([lbl, pct]) => (
                  <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 2, display: 'inline-block', background: `color-mix(in oklch, var(--highlight) ${pct}%, transparent)` }} />
                    <span className="mono" style={{ fontSize: 9, color: 'var(--ink-4,#555)' }}>{lbl}</span>
                  </span>
                ))}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 10 }}>🔧</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--ink-4,#555)' }}>maint</span>
                </span>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 1 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 88, padding: '2px 6px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-2)', zIndex: 2 }}>
                      <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-4,#555)' }}>A/C</span>
                    </th>
                    <th style={{ minWidth: 42, padding: '2px 4px', textAlign: 'right', position: 'sticky', left: 88, background: 'var(--bg-2)', zIndex: 2 }}>
                      <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-4,#555)' }}>Period</span>
                    </th>
                    {days.map((d, i) => {
                      const dObj = new Date(d + 'T12:00:00Z');
                      const dow  = dObj.getUTCDay();
                      const isMon = dow === 1;
                      const isToday = d === today;
                      const showLabel = i === 0 || isMon || CELL_W >= 22;
                      const showMonth = i === 0 || isMon;
                      return (
                        <th key={d} style={{ width: CELL_W, minWidth: CELL_W, padding: 0, textAlign: 'center', verticalAlign: 'bottom', borderLeft: isMon && i > 0 ? '1px solid var(--line)' : 'none' }}>
                          {showLabel && (
                            <div className="mono" style={{ fontSize: 7, color: isToday ? 'var(--highlight)' : 'var(--ink-4,#555)', fontWeight: isToday ? 700 : 400 }}>
                              {dObj.getUTCDate()}
                            </div>
                          )}
                          {showMonth && (
                            <div className="mono" style={{ fontSize: 7, color: 'var(--ink-4,#555)' }}>
                              {dObj.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {hmTypes.map(acType => {
                    const tails    = fleetByType[acType] || [];
                    const isCollapsed = collapsed[acType];
                    const typeH    = tails.reduce((s, ac) => s + (tailTotals[ac.normTail] || 0), 0);
                    const col      = U_TYPE_COLORS[acType] || '#64748b';
                    // Hide entire type group when no aircraft have flights (e.g. filtered by AP127)
                    if (typeH === 0) return null;
                    const visibleTails = tails.filter(ac => (tailTotals[ac.normTail] || 0) > 0);
                    return (
                      <React.Fragment key={acType}>
                        {/* Type group header */}
                        <tr onClick={() => toggleCollapse(acType)} style={{ cursor: 'pointer' }}>
                          <td colSpan={days.length + 2}
                            style={{ padding: '4px 6px', background: `color-mix(in oklch, ${col} 10%, var(--surface))`, borderRadius: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: col, fontSize: 10 }}>{isCollapsed ? '▶' : '▼'}</span>
                              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: col }}>{U_TYPE_LABELS[acType] || acType}</span>
                              <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{visibleTails.length} aircraft · {uFmtH(typeH)}</span>
                            </div>
                          </td>
                        </tr>
                        {/* Aircraft rows — skip tails with no matching flights */}
                        {!isCollapsed && visibleTails.map(ac => {
                          const totalH  = tailTotals[ac.normTail] || 0;
                          const isSelected = drawer && drawer.tail === ac.normTail;
                          return (
                            <tr key={ac.normTail} style={{ background: isSelected ? `color-mix(in oklch, ${col} 5%, transparent)` : 'transparent' }}>
                              {/* Tail label */}
                              <td style={{ padding: '1px 6px', position: 'sticky', left: 0, background: isSelected ? `color-mix(in oklch, ${col} 8%, var(--bg-2))` : 'var(--bg-2)', zIndex: 1, whiteSpace: 'nowrap', borderRight: '1px solid var(--line)' }}>
                                <span className="mono" style={{ fontSize: 10, color: isSelected ? col : 'var(--ink-2)', fontWeight: totalH > 0 ? 600 : 400 }}>
                                  {ac.tail}
                                </span>
                                {ac.isMaint && <span style={{ fontSize: 9, marginLeft: 3 }}>🔧</span>}
                              </td>
                              {/* Period total */}
                              <td style={{ padding: '1px 4px 1px 0', textAlign: 'right', position: 'sticky', left: 88, background: isSelected ? `color-mix(in oklch, ${col} 8%, var(--bg-2))` : 'var(--bg-2)', zIndex: 1, borderRight: '1px solid var(--line)' }}>
                                <span className="mono" style={{ fontSize: 9, color: totalH > 0 ? 'var(--ink-2)' : 'var(--ink-4,#555)', fontWeight: 600 }}>
                                  {uFmtH(totalH)}
                                </span>
                              </td>
                              {/* Day cells */}
                              {days.map((d, di) => {
                                const dayFlights = ((flightsByTailDay[ac.normTail] || {})[d] || []);
                                const h          = dayFlights.reduce((s, f) => s + f._h, 0);
                                const intensity  = h <= 0 ? 0 : Math.min(1, h / maxCellH);
                                const isCellSel  = drawer && drawer.tail === ac.normTail && drawer.date === d;
                                const isMon      = new Date(d + 'T12:00:00Z').getUTCDay() === 1;
                                const isToday    = d === today;
                                const hasPending = dayFlights.some(f => f.status === 'Pending');

                                let cellBg     = 'transparent';
                                let cellBorder = `1px solid var(--line)`;

                                if (h > 0) {
                                  const intPct = Math.round(Math.max(12, intensity * 82));
                                  cellBg     = `color-mix(in oklch, ${col} ${intPct}%, transparent)`;
                                  cellBorder = `1px solid color-mix(in oklch, ${col} ${Math.min(100, intPct + 18)}%, transparent)`;
                                } else if (ac.isMaint) {
                                  cellBg     = 'color-mix(in oklch, var(--col-cancel) 8%, transparent)';
                                  cellBorder = '1px solid color-mix(in oklch, var(--col-cancel) 18%, transparent)';
                                }

                                if (isCellSel) cellBorder = `2px solid var(--highlight)`;
                                if (isToday)   cellBorder = `1px solid var(--highlight)`;
                                if (isMon && di > 0 && !isCellSel) cellBorder = `1px solid var(--line)`;

                                return (
                                  <td key={d}
                                    onClick={() => handleCellClick(ac.normTail, ac.tail, d, dayFlights.length > 0)}
                                    title={h > 0
                                      ? `${ac.tail} · ${uFmtDate(d)} · ${uFmtH(h)}${hasPending ? ' (incl. pending)' : ''}`
                                      : ac.isMaint ? `${ac.tail}: In maintenance` : `${ac.tail} · ${uFmtDate(d)}: Idle`}
                                    style={{
                                      width: CELL_W, height: CELL_H, padding: 0, textAlign: 'center', verticalAlign: 'middle',
                                      background: cellBg, border: cellBorder, borderRadius: 2,
                                      cursor: dayFlights.length > 0 ? 'pointer' : 'default',
                                      borderLeft: isMon && di > 0 ? '1px solid color-mix(in oklch,var(--line) 200%,transparent)' : undefined,
                                      outline: isToday && !isCellSel ? '1px solid color-mix(in oklch,var(--highlight) 50%,transparent)' : 'none',
                                      outlineOffset: '-1px',
                                    }}>
                                    {h > 0 && CELL_W >= 20 && (
                                      <span className="mono" style={{ fontSize: 7, color: intensity > 0.55 ? 'rgba(255,255,255,0.9)' : 'var(--ink-2)', fontWeight: 600, lineHeight: 1, userSelect: 'none' }}>
                                        {h.toFixed(1)}
                                      </span>
                                    )}
                                    {ac.isMaint && h === 0 && CELL_W >= 14 && (
                                      <span style={{ fontSize: 8, userSelect: 'none' }}>🔧</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {kpi.compCount === 0 && (
              <div className="mono" style={{ color: 'var(--ink-4,#555)', textAlign: 'center', padding: '40px 0', fontSize: 12 }}>
                No completed flights in this period. Adjust filters or date range.
              </div>
            )}
          </div>
        </div>

        {/* ── Detail drawer ──────────────────────────────────────────────────── */}
        {drawer && drawerData && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, background: 'var(--bg-2)', borderLeft: '2px solid var(--line)', display: 'flex', flexDirection: 'column', zIndex: 30, boxShadow: '-6px 0 20px color-mix(in oklch, #000 30%, transparent)' }}>
            {/* Drawer header */}
            <div style={{ flexShrink: 0, padding: '10px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--highlight)' }}>{drawer.tailLabel}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{uFmtDate(drawer.date)}</div>
              </div>
              <button className="chip" onClick={() => setDrawer(null)} style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 10px' }}>✕</button>
            </div>
            {/* Totals summary */}
            <div style={{ flexShrink: 0, padding: '8px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'This day', val: uFmtH(drawerData.dayH),    col: 'var(--highlight)' },
                { label: `Wk ${uFmtDate(drawerData.wkStart)}`,       val: uFmtH(drawerData.weekH), col: 'var(--ink-1)' },
                { label: new Date(drawer.date + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }), val: uFmtH(drawerData.monthH), col: 'var(--ink-1)' },
                { label: `${uFmtDate(from)}–${uFmtDate(to)}`,       val: uFmtH(drawerData.periodH), col: 'var(--ink-2)' },
              ].map(({ label, val, col }) => (
                <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px', textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: col, lineHeight: 1 }}>{val}</div>
                  <div className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
                </div>
              ))}
            </div>
            {/* Flight list */}
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 16px' }}>
              <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', padding: '8px 0 4px', fontWeight: 600 }}>
                {drawerData.dayFlights.length} flight{drawerData.dayFlights.length !== 1 ? 's' : ''} on {uFmtDate(drawer.date)}
              </div>
              {drawerData.dayFlights.length === 0 ? (
                <div className="mono" style={{ color: 'var(--ink-4,#555)', textAlign: 'center', padding: '20px 0', fontSize: 12 }}>No flights on this day</div>
              ) : (
                [...drawerData.dayFlights].sort((a, b) => (a.start || '').localeCompare(b.start || '')).map((f, i) => {
                  const stCol = f.status === 'Pending' ? 'var(--col-pending)' : f.status === 'Canceled' ? 'var(--col-cancel)' : 'var(--col-done)';
                  return (
                    <div key={f.id || i} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 600 }}>{f.start || '?'}–{f.end || '?'}</span>
                        <span className="mono uc" style={{ fontSize: 9, fontWeight: 700, color: stCol, border: `1px solid ${stCol}`, borderRadius: 3, padding: '1px 5px' }}>{f.status}</span>
                        {f._usedFallback && <span className="mono" style={{ fontSize: 8, color: 'var(--col-pending)' }}>~blk</span>}
                        <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--highlight)', fontWeight: 700 }}>{uFmtH(f._h)}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', marginBottom: 2 }}>
                        <span style={{ color: 'var(--ink-3)' }}>Student: </span>{f.student || '—'}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', marginBottom: 2 }}>
                        <span style={{ color: 'var(--ink-3)' }}>Instructor: </span>{f.instructor || '—'}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                        {f.batch   && <span style={{ marginRight: 10 }}>Batch: <span style={{ color: 'var(--ink-2)' }}>{f.batch}</span></span>}
                        {f.lesson  && <span>Lesson: <span style={{ color: 'var(--ink-2)' }}>{f.lesson}</span></span>}
                      </div>
                      {metric === 'airborne' && f._airborne > 0 && (
                        <div className="mono" style={{ fontSize: 9, color: 'var(--ink-4,#555)', marginTop: 3 }}>
                          Block {uFmtH(f._block)} · Airborne {uFmtH(f._airborne)}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FI STAT + SP STAT TAB  (shared component, mode = 'fi' | 'sp')
  // ══════════════════════════════════════════════════════════════════════════

  function PersonStatTab({ mode }) {
    const personField = mode === 'fi' ? 'instructor' : 'student';
    const modeLabel   = mode === 'fi' ? 'Flight Instructor' : 'Student Pilot';
    const modeShort   = mode === 'fi' ? 'FI' : 'SP';
    const baseColor   = mode === 'fi' ? '#06b6d4' : '#a78bfa';

    const today = typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0, 10);

    const [preset,     setPreset]     = useState('30d');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo,   setCustomTo]   = useState('');
    const [typeFilter, setTypeFilter] = useState([]);
    const [showSims,   setShowSims]   = useState(false);
    const [metric,     setMetric]     = useState('block');
    const [incPend,    setIncPend]    = useState(false);
    const [ap127Only,  setAp127Only]  = useState(false);
    const [drawer,     setDrawer]     = useState(null);
    const [collapsed,  setCollapsed]  = useState({});

    const dailyCanvasRef = useRef(null);
    const dailyChartRef  = useRef(null);

    // ── Date range ──────────────────────────────────────────────────────────
    const { from, to } = useMemo(() => {
      if (preset === 'custom' && customFrom && customTo && customFrom <= customTo)
        return { from: customFrom, to: customTo };
      return uPresetRange(preset, today);
    }, [preset, customFrom, customTo, today]);

    const days = useMemo(() => uDayRange(from, to), [from, to]);

    // ── Available type chips ─────────────────────────────────────────────────
    const availTypes = useMemo(() => {
      const types = new Set(((window.FLIGHT_DATA && window.FLIGHT_DATA.resources) || []).map(r => r.acType).filter(Boolean));
      return U_TYPE_ORDER.filter(t => types.has(t) && (showSims || !uIsSim(t)));
    }, [showSims]);

    // ── Flight metrics ───────────────────────────────────────────────────────
    const { flightsByPersonDay, personTotals, dayTotals, typeDayTotals, personGroups, kpi } = useMemo(() => {
      const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
      const flightsByPersonDay = {};
      const personTotals       = {};
      const dayTotals          = {};
      const typeDayTotals      = {};
      const personBatchCounts  = {};
      let compCount = 0;

      flights.forEach(f => {
        if (!f.date || f.date < from || f.date > to) return;
        if (f.status === 'Canceled') return;
        if (!incPend && f.status !== 'Completed') return;
        const acType = f.type || 'Unknown';
        if (f.isSim && !showSims) return;
        if (typeFilter.length > 0 && !typeFilter.includes(acType)) return;
        if (ap127Only && !isAP127Batch(f.batch)) return;

        const person = f[personField];
        if (!person) return;

        const blockMins    = f.durMin || 0;
        const airborneMin  = f.airborne ? uParseAirborneMin(f.airborne) : 0;
        const useMins      = (metric === 'airborne' && airborneMin > 0) ? airborneMin : blockMins;
        const h            = useMins / 60;
        const usedFallback = metric === 'airborne' && airborneMin === 0 && blockMins > 0;

        const rec = { ...f, _h: h, _block: blockMins / 60, _airborne: airborneMin / 60, _acType: acType, _usedFallback: usedFallback };

        if (!flightsByPersonDay[person]) flightsByPersonDay[person] = {};
        if (!flightsByPersonDay[person][f.date]) flightsByPersonDay[person][f.date] = [];
        flightsByPersonDay[person][f.date].push(rec);

        personTotals[person]  = (personTotals[person] || 0) + h;
        dayTotals[f.date]     = (dayTotals[f.date] || 0) + h;

        if (!typeDayTotals[acType]) typeDayTotals[acType] = {};
        typeDayTotals[acType][f.date] = (typeDayTotals[acType][f.date] || 0) + h;

        if (f.status === 'Completed') compCount++;

        if (mode === 'sp' && f.batch) {
          if (!personBatchCounts[person]) personBatchCounts[person] = {};
          personBatchCounts[person][f.batch] = (personBatchCounts[person][f.batch] || 0) + 1;
        }
      });

      // Derive primary batch per SP
      const personPrimaryBatch = {};
      if (mode === 'sp') {
        Object.entries(personBatchCounts).forEach(([person, bc]) => {
          personPrimaryBatch[person] = Object.entries(bc).sort((a, b) => b[1] - a[1])[0][0];
        });
      }

      // Build groups
      let personGroups;
      if (mode === 'fi') {
        const sorted = Object.keys(personTotals).sort((a, b) => (personTotals[b] || 0) - (personTotals[a] || 0));
        personGroups = [{ id: '__fi__', label: 'Flight Instructors', color: baseColor, persons: sorted }];
      } else {
        const batchMap = {};
        Object.keys(personTotals).forEach(person => {
          const batch = personPrimaryBatch[person] || 'Unknown';
          if (!batchMap[batch]) batchMap[batch] = [];
          batchMap[batch].push(person);
        });
        const groups = Object.entries(batchMap).map(([batch, persons], i) => ({
          id: batch, label: batch, color: PS_PALETTE[i % PS_PALETTE.length],
          totalH: persons.reduce((s, p) => s + (personTotals[p] || 0), 0),
          persons: persons.sort((a, b) => (personTotals[b] || 0) - (personTotals[a] || 0)),
        })).sort((a, b) => b.totalH - a.totalH);
        groups.forEach((g, i) => { g.color = PS_PALETTE[i % PS_PALETTE.length]; });
        personGroups = groups;
      }

      // KPI
      const activePersons = Object.keys(personTotals).filter(p => personTotals[p] > 0);
      const totalHours = activePersons.reduce((s, p) => s + personTotals[p], 0);
      const avgPerPerson = activePersons.length > 0 ? totalHours / activePersons.length : 0;
      const busiestPerson = activePersons.length > 0
        ? activePersons.reduce((a, b) => (personTotals[a] || 0) >= (personTotals[b] || 0) ? a : b)
        : null;

      return {
        flightsByPersonDay, personTotals, dayTotals, typeDayTotals, personGroups,
        kpi: { totalHours, compCount, activePersons: activePersons.length, avgPerPerson, busiestPerson, busiestHours: busiestPerson ? personTotals[busiestPerson] : 0 },
      };
    }, [from, to, typeFilter, showSims, metric, incPend, ap127Only, personField, mode]);

    // ── Max cell H ──────────────────────────────────────────────────────────
    const maxCellH = useMemo(() => {
      let mx = 0.5;
      personGroups.forEach(g => g.persons.forEach(person => days.forEach(d => {
        const h = ((flightsByPersonDay[person] || {})[d] || []).reduce((s, f) => s + f._h, 0);
        if (h > mx) mx = h;
      })));
      return mx;
    }, [flightsByPersonDay, personGroups, days]);

    // ── Daily stacked bar chart (by A/C type, same as UtilizationTab) ──────
    useEffect(() => {
      if (!dailyCanvasRef.current) return;
      if (dailyChartRef.current) { dailyChartRef.current.destroy(); dailyChartRef.current = null; }
      const cs    = getComputedStyle(document.documentElement);
      const ink3  = cs.getPropertyValue('--ink-3').trim()  || 'rgba(136,136,136,0.8)';
      const lineC = cs.getPropertyValue('--line').trim()   || 'rgba(60,60,60,0.4)';
      const activeTypes = U_TYPE_ORDER.filter(t => {
        if (!showSims && uIsSim(t)) return false;
        if (typeFilter.length > 0 && !typeFilter.includes(t)) return false;
        return Object.keys(typeDayTotals[t] || {}).length > 0;
      });
      const datasets = activeTypes.map(t => ({
        label: U_TYPE_LABELS[t] || t,
        data: days.map(d => +((typeDayTotals[t] || {})[d] || 0).toFixed(2)),
        backgroundColor: (U_TYPE_COLORS[t] || '#64748b') + 'cc',
        borderColor: U_TYPE_COLORS[t] || '#64748b', borderWidth: 0.5, stack: 'fleet',
      }));
      datasets.push({
        label: 'Total',
        data: days.map(d => +((dayTotals[d] || 0)).toFixed(2)),
        type: 'line', borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1.5,
        borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.2, order: -1,
      });
      const ctx = dailyCanvasRef.current.getContext('2d');
      dailyChartRef.current = new Chart(ctx, {
        type: 'bar',
        data: { labels: days.map(d => uFmtDate(d)), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top', labels: { color: ink3, font: { family: 'monospace', size: 10 }, boxWidth: 12, padding: 10 } },
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Number(c.raw).toFixed(1)}h` } },
            datalabels: { display: false },
          },
          scales: {
            x: { stacked: true, ticks: { color: ink3, font: { family: 'monospace', size: 9 }, maxRotation: 45, maxTicksLimit: 20 }, grid: { color: lineC } },
            y: { stacked: true, ticks: { color: ink3, font: { family: 'monospace', size: 9 }, callback: v => v + 'h' }, grid: { color: lineC }, title: { display: true, text: metric === 'block' ? 'Block Hours' : 'Airborne Hours', color: ink3, font: { size: 10 } } },
          },
        },
      });
      return () => { if (dailyChartRef.current) { dailyChartRef.current.destroy(); dailyChartRef.current = null; } };
    }, [days, dayTotals, typeDayTotals, typeFilter, showSims, metric]);

    // ── Drawer derived data ──────────────────────────────────────────────────
    const drawerData = useMemo(() => {
      if (!drawer) return null;
      const person      = drawer.person;
      const allForP     = Object.values(flightsByPersonDay[person] || {}).flat();
      const selDate     = drawer.date;
      const dow         = new Date(selDate + 'T12:00:00Z').getUTCDay();
      const wkStart     = uAddDays(selDate, -(dow === 0 ? 6 : dow - 1));
      const selMonth    = selDate.slice(0, 7);
      const periodH     = allForP.reduce((s, f) => s + f._h, 0);
      const weekH       = allForP.filter(f => f.date >= wkStart && f.date <= uAddDays(wkStart, 6)).reduce((s, f) => s + f._h, 0);
      const monthH      = allForP.filter(f => f.date.slice(0, 7) === selMonth).reduce((s, f) => s + f._h, 0);
      const dayH        = allForP.filter(f => f.date === selDate).reduce((s, f) => s + f._h, 0);
      const dayFlights  = (flightsByPersonDay[person] || {})[selDate] || [];
      return { periodH, weekH, monthH, dayH, wkStart, selMonth, dayFlights };
    }, [drawer, flightsByPersonDay]);

    // ── Handlers ────────────────────────────────────────────────────────────
    const toggleType     = t => setTypeFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    const toggleCollapse = id => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    const handleCellClick = (person, date, hasFlights) => {
      if (!hasFlights) return;
      setDrawer(prev => (prev && prev.person === person && prev.date === date) ? null : { person, date });
    };

    const CELL_W = Math.max(12, Math.min(30, Math.floor(780 / Math.max(days.length, 1))));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* ── Filter bar ──────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '6px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>Period:</span>
          {[['1d','Today'],['7d','7d'],['30d','30d'],['90d','90d'],['month','This Month'],['custom','Custom']].map(([p, lbl]) => (
            <button key={p} className={'chip' + (preset === p ? ' sel' : '')} onClick={() => setPreset(p)} style={{ fontSize: 10, padding: '3px 8px' }}>{lbl}</button>
          ))}
          {preset === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ fontSize: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', color: 'var(--ink-1)', fontFamily: 'monospace' }} />
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ fontSize: 10, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', color: 'var(--ink-1)', fontFamily: 'monospace' }} />
            </>
          )}

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>Type:</span>
          <button className={'chip' + (typeFilter.length === 0 ? ' sel' : '')} onClick={() => setTypeFilter([])} style={{ fontSize: 10, padding: '3px 8px' }}>All</button>
          {availTypes.map(t => (
            <button key={t} className={'chip' + (typeFilter.includes(t) ? ' sel' : '')} onClick={() => toggleType(t)}
              style={{ fontSize: 10, padding: '3px 8px', ...(typeFilter.includes(t) ? { borderColor: U_TYPE_COLORS[t], color: U_TYPE_COLORS[t] } : {}) }}>
              {U_TYPE_LABELS[t] || t}
            </button>
          ))}

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <button className={'chip' + (showSims ? ' sel' : '')} onClick={() => setShowSims(s => !s)} style={{ fontSize: 10, padding: '3px 8px' }}>+ Sims</button>

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>Metric:</span>
          <button className={'chip' + (metric === 'block'    ? ' sel' : '')} onClick={() => setMetric('block')}    style={{ fontSize: 10, padding: '3px 8px' }}>Block</button>
          <button className={'chip' + (metric === 'airborne' ? ' sel' : '')} onClick={() => setMetric('airborne')} style={{ fontSize: 10, padding: '3px 8px' }}>Airborne</button>

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <button className={'chip' + (incPend ? ' sel' : '')} onClick={() => setIncPend(s => !s)} style={{ fontSize: 10, padding: '3px 8px' }}>+ Pending</button>

          <div style={{ width: 1, background: 'var(--line)', height: 14, margin: '0 2px' }} />
          <button onClick={() => setAp127Only(s => !s)}
            style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: `1px solid ${ap127Only ? 'var(--highlight)' : 'var(--line)'}`, background: ap127Only ? 'color-mix(in oklch,var(--highlight) 14%,var(--surface))' : 'transparent', color: ap127Only ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: ap127Only ? 700 : 400, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: 0.3, transition: 'all .1s' }}>
            ◆ AP-127
          </button>

          <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
            {uFmtDate(from)} – {uFmtDate(to)} · {days.length}d · {kpi.compCount} flights · {kpi.totalHours.toFixed(1)}h
          </span>
        </div>

        {/* ── KPI strip ───────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '8px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', alignItems: 'stretch' }}>
          {[
            { val: kpi.totalHours.toFixed(1) + 'h', label: metric === 'block' ? 'Block Hours' : 'Airborne Hrs', col: baseColor },
            { val: kpi.compCount,                    label: 'Flights Done',          col: 'var(--col-done)'  },
            { val: kpi.activePersons,                label: `Active ${modeShort}s`,  col: 'var(--ink-1)'     },
            { val: uFmtH(kpi.avgPerPerson),          label: `Avg / ${modeShort}`,    col: 'var(--ink-2)'     },
          ].map(({ val, label, col }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 14px', textAlign: 'center', minWidth: 72 }}>
              <div className="mono" style={{ fontSize: String(val).length > 7 ? 14 : 20, fontWeight: 700, color: col, lineHeight: 1 }}>{val}</div>
              <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 3, whiteSpace: 'nowrap' }}>{label}</div>
            </div>
          ))}
          {kpi.busiestPerson && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 14px', textAlign: 'center', minWidth: 96 }}>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: '#fb923c', lineHeight: 1 }}>{kpi.busiestPerson}</div>
              <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 3, whiteSpace: 'nowrap' }}>Busiest · {uFmtH(kpi.busiestHours)}</div>
            </div>
          )}
          {metric === 'airborne' && (
            <div className="mono" style={{ fontSize: 9, color: 'var(--col-pending)', padding: '7px 10px', alignSelf: 'center' }}>
              ⚠ Falls back to block time if airborne not recorded
            </div>
          )}
        </div>

        {/* ── Scrollable main content ──────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Load distribution ────────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
              <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: 0.5 }}>◫ {modeShort} Load Distribution — {days.length}d</span>
              {kpi.activePersons > 0 && <span className="mono" style={{ fontSize: 9, color: 'var(--ink-4,#555)' }}>avg {uFmtH(kpi.avgPerPerson)} per active {modeShort}</span>}
            </div>
            {(() => {
              const entries = personGroups.flatMap(g => g.persons.map(p => ({ person: p, hours: personTotals[p] || 0, color: g.color })));
              entries.sort((a, b) => b.hours - a.hours);
              const maxH   = Math.max(...entries.map(e => e.hours), 0.1);
              const avgPct = Math.min(100, (kpi.avgPerPerson / maxH) * 100);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {entries.filter(e => e.hours > 0).map(e => {
                    const pct = (e.hours / maxH) * 100;
                    const isAboveAvg = e.hours > kpi.avgPerPerson + 0.1;
                    return (
                      <div key={e.person} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="mono" style={{ width: 160, fontSize: 10, color: 'var(--ink-2)', flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.person}</span>
                        <div style={{ flex: 1, height: 15, background: 'var(--surface)', borderRadius: 3, position: 'relative', border: '1px solid var(--line)' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: e.color + 'bb', borderRadius: 3 }} />
                          {kpi.activePersons > 1 && <div style={{ position: 'absolute', left: `${avgPct}%`, top: -2, bottom: -2, width: 1, background: 'rgba(255,255,255,0.3)', pointerEvents: 'none' }} />}
                        </div>
                        <span className="mono" style={{ width: 38, fontSize: 10, color: isAboveAvg ? '#fb923c' : 'var(--ink-2)', textAlign: 'right', flexShrink: 0 }}>{uFmtH(e.hours)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ── Daily hours chart ─────────────────────────────────────────── */}
          <div>
            <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 10, fontWeight: 600, letterSpacing: 0.5 }}>
              ◷ Daily Hours by A/C Type — {metric === 'block' ? 'Block' : 'Airborne'}
            </div>
            <div style={{ height: 200, position: 'relative' }}>
              <canvas ref={dailyCanvasRef} style={{ display: 'block' }} />
            </div>
          </div>

          {/* ── Roster heatmap ────────────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: 0.5 }}>
                ▦ {modeLabel} Roster — click cell for detail
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {[['low', 15], ['med', 45], ['high', 80]].map(([lbl, pct]) => (
                  <span key={lbl} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 2, display: 'inline-block', background: `color-mix(in oklch, ${baseColor} ${pct}%, transparent)` }} />
                    <span className="mono" style={{ fontSize: 9, color: 'var(--ink-4,#555)' }}>{lbl}</span>
                  </span>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 1 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 168, padding: '2px 6px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-2)', zIndex: 2 }}>
                      <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-4,#555)' }}>{modeShort}</span>
                    </th>
                    <th style={{ minWidth: 42, padding: '2px 4px', textAlign: 'right', position: 'sticky', left: 168, background: 'var(--bg-2)', zIndex: 2 }}>
                      <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-4,#555)' }}>Period</span>
                    </th>
                    {days.map((d, i) => {
                      const dObj  = new Date(d + 'T12:00:00Z');
                      const dow   = dObj.getUTCDay();
                      const isMon = dow === 1;
                      const isTod = d === today;
                      const showL = i === 0 || isMon || CELL_W >= 22;
                      const showM = i === 0 || isMon;
                      return (
                        <th key={d} style={{ width: CELL_W, minWidth: CELL_W, padding: 0, textAlign: 'center', verticalAlign: 'bottom', borderLeft: isMon && i > 0 ? '1px solid var(--line)' : 'none' }}>
                          {showL && <div className="mono" style={{ fontSize: 7, color: isTod ? 'var(--highlight)' : 'var(--ink-4,#555)', fontWeight: isTod ? 700 : 400 }}>{dObj.getUTCDate()}</div>}
                          {showM && <div className="mono" style={{ fontSize: 7, color: 'var(--ink-4,#555)' }}>{dObj.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {personGroups.map(group => {
                    const groupH  = group.persons.reduce((s, p) => s + (personTotals[p] || 0), 0);
                    if (groupH === 0) return null;
                    const col       = group.color;
                    const isCollG   = collapsed[group.id];
                    const visPeople = group.persons.filter(p => (personTotals[p] || 0) > 0);
                    return (
                      <React.Fragment key={group.id}>
                        {/* Group header */}
                        <tr onClick={() => toggleCollapse(group.id)} style={{ cursor: 'pointer' }}>
                          <td colSpan={days.length + 2} style={{ padding: '4px 6px', background: `color-mix(in oklch, ${col} 10%, var(--surface))`, borderRadius: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: col, fontSize: 10 }}>{isCollG ? '▶' : '▼'}</span>
                              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: col }}>{group.label}</span>
                              <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{visPeople.length} {modeShort}{visPeople.length !== 1 ? 's' : ''} · {uFmtH(groupH)}</span>
                            </div>
                          </td>
                        </tr>
                        {/* Person rows */}
                        {!isCollG && visPeople.map(person => {
                          const totalH    = personTotals[person] || 0;
                          const isSel     = drawer && drawer.person === person;
                          return (
                            <tr key={person} style={{ background: isSel ? `color-mix(in oklch, ${col} 5%, transparent)` : 'transparent' }}>
                              <td style={{ padding: '1px 6px', position: 'sticky', left: 0, background: isSel ? `color-mix(in oklch, ${col} 8%, var(--bg-2))` : 'var(--bg-2)', zIndex: 1, borderRight: '1px solid var(--line)', maxWidth: 168, overflow: 'hidden' }}>
                                <span className="mono" title={person} style={{ fontSize: 10, color: isSel ? col : 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{person}</span>
                              </td>
                              <td style={{ padding: '1px 4px 1px 0', textAlign: 'right', position: 'sticky', left: 168, background: isSel ? `color-mix(in oklch, ${col} 8%, var(--bg-2))` : 'var(--bg-2)', zIndex: 1, borderRight: '1px solid var(--line)' }}>
                                <span className="mono" style={{ fontSize: 9, color: 'var(--ink-2)', fontWeight: 600 }}>{uFmtH(totalH)}</span>
                              </td>
                              {days.map((d, di) => {
                                const dayFlights = ((flightsByPersonDay[person] || {})[d] || []);
                                const h          = dayFlights.reduce((s, f) => s + f._h, 0);
                                const intensity  = h <= 0 ? 0 : Math.min(1, h / maxCellH);
                                const isCellSel  = isSel && drawer.date === d;
                                const isMon      = new Date(d + 'T12:00:00Z').getUTCDay() === 1;
                                const isTod      = d === today;
                                const hasPend    = dayFlights.some(f => f.status === 'Pending');

                                let cellBg  = 'transparent';
                                let cellBrd = '1px solid var(--line)';
                                if (h > 0) {
                                  const intPct = Math.round(Math.max(12, intensity * 82));
                                  cellBg  = `color-mix(in oklch, ${col} ${intPct}%, transparent)`;
                                  cellBrd = `1px solid color-mix(in oklch, ${col} ${Math.min(100, intPct + 18)}%, transparent)`;
                                }
                                if (isCellSel) cellBrd = '2px solid var(--highlight)';
                                if (isTod)     cellBrd = '1px solid var(--highlight)';
                                if (isMon && di > 0 && !isCellSel) cellBrd = '1px solid var(--line)';

                                return (
                                  <td key={d}
                                    onClick={() => handleCellClick(person, d, dayFlights.length > 0)}
                                    title={h > 0 ? `${person} · ${uFmtDate(d)} · ${uFmtH(h)}${hasPend ? ' (incl. pending)' : ''}` : `${person} · ${uFmtDate(d)}: No flights`}
                                    style={{
                                      width: CELL_W, height: 22, padding: 0, textAlign: 'center', verticalAlign: 'middle',
                                      background: cellBg, border: cellBrd, borderRadius: 2,
                                      cursor: dayFlights.length > 0 ? 'pointer' : 'default',
                                      borderLeft: isMon && di > 0 ? '1px solid color-mix(in oklch,var(--line) 200%,transparent)' : undefined,
                                      outline: isTod && !isCellSel ? '1px solid color-mix(in oklch,var(--highlight) 50%,transparent)' : 'none',
                                      outlineOffset: '-1px',
                                    }}>
                                    {h > 0 && CELL_W >= 20 && (
                                      <span className="mono" style={{ fontSize: 7, color: intensity > 0.55 ? 'rgba(255,255,255,0.9)' : 'var(--ink-2)', fontWeight: 600, lineHeight: 1, userSelect: 'none' }}>
                                        {h.toFixed(1)}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {kpi.compCount === 0 && (
              <div className="mono" style={{ color: 'var(--ink-4,#555)', textAlign: 'center', padding: '40px 0', fontSize: 12 }}>
                No completed flights in this period. Adjust filters or date range.
              </div>
            )}
          </div>
        </div>

        {/* ── Detail drawer ───────────────────────────────────────────────── */}
        {drawer && drawerData && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, background: 'var(--bg-2)', borderLeft: '2px solid var(--line)', display: 'flex', flexDirection: 'column', zIndex: 30, boxShadow: '-6px 0 20px color-mix(in oklch, #000 30%, transparent)' }}>
            <div style={{ flexShrink: 0, padding: '10px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--highlight)', lineHeight: 1.2 }}>{drawer.person}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{uFmtDate(drawer.date)}</div>
              </div>
              <button className="chip" onClick={() => setDrawer(null)} style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 10px' }}>✕</button>
            </div>
            <div style={{ flexShrink: 0, padding: '8px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'This day', val: uFmtH(drawerData.dayH), col: 'var(--highlight)' },
                { label: `Wk ${uFmtDate(drawerData.wkStart)}`,   val: uFmtH(drawerData.weekH),   col: 'var(--ink-1)' },
                { label: new Date(drawer.date + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }), val: uFmtH(drawerData.monthH), col: 'var(--ink-1)' },
                { label: `${uFmtDate(from)}–${uFmtDate(to)}`,   val: uFmtH(drawerData.periodH), col: 'var(--ink-2)' },
              ].map(({ label, val, col }) => (
                <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px', textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: col, lineHeight: 1 }}>{val}</div>
                  <div className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 16px' }}>
              <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', padding: '8px 0 4px', fontWeight: 600 }}>
                {drawerData.dayFlights.length} flight{drawerData.dayFlights.length !== 1 ? 's' : ''} on {uFmtDate(drawer.date)}
              </div>
              {drawerData.dayFlights.length === 0 ? (
                <div className="mono" style={{ color: 'var(--ink-4,#555)', textAlign: 'center', padding: '20px 0', fontSize: 12 }}>No flights on this day</div>
              ) : (
                [...drawerData.dayFlights].sort((a, b) => (a.start || '').localeCompare(b.start || '')).map((f, i) => {
                  const stCol = f.status === 'Pending' ? 'var(--col-pending)' : f.status === 'Canceled' ? 'var(--col-cancel)' : 'var(--col-done)';
                  return (
                    <div key={f.id || i} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 600 }}>{f.start || '?'}–{f.end || '?'}</span>
                        <span className="mono uc" style={{ fontSize: 9, fontWeight: 700, color: stCol, border: `1px solid ${stCol}`, borderRadius: 3, padding: '1px 5px' }}>{f.status}</span>
                        {f._usedFallback && <span className="mono" style={{ fontSize: 8, color: 'var(--col-pending)' }}>~blk</span>}
                        <span className="mono" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--highlight)', fontWeight: 700 }}>{uFmtH(f._h)}</span>
                      </div>
                      {mode === 'fi'
                        ? <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', marginBottom: 2 }}><span style={{ color: 'var(--ink-3)' }}>Student: </span>{f.student || '—'}</div>
                        : <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', marginBottom: 2 }}><span style={{ color: 'var(--ink-3)' }}>Instructor: </span>{f.instructor || '—'}</div>
                      }
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', marginBottom: 2 }}>
                        <span style={{ color: 'var(--ink-3)' }}>A/C: </span>{f.tail || '—'}
                        {f.type && <span style={{ color: 'var(--ink-3)', marginLeft: 8 }}>({f.type})</span>}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                        {f.batch  && <span style={{ marginRight: 10 }}>Batch: <span style={{ color: 'var(--ink-2)' }}>{f.batch}</span></span>}
                        {f.lesson && <span>Lesson: <span style={{ color: 'var(--ink-2)' }}>{f.lesson}</span></span>}
                      </div>
                      {metric === 'airborne' && f._airborne > 0 && (
                        <div className="mono" style={{ fontSize: 9, color: 'var(--ink-4,#555)', marginTop: 3 }}>Block {uFmtH(f._block)} · Airborne {uFmtH(f._airborne)}</div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN COMPONENT
  // ══════════════════════════════════════════════════════════════════════════

  function AircraftStatusView() {
    const [data,          setData]         = useState(null);
    const [error,         setError]        = useState(null);
    const [loading,       setLoading]      = useState(true);
    const [lastFetch,     setLastFetch]    = useState(null);
    const [tab,           setTab]          = useState('fleet');
    const [filterModels,  setFilterModels] = useState(DEFAULT_MODELS);
    const [filterFlyable, setFilterFlyable]= useState('All');
    const [sortCol,       setSortCol]      = useState('item');
    const [sortAsc,       setSortAsc]      = useState(true);
    const [xFilter,       setXFilter]      = useState('conflict');

    const load = useCallback(async () => {
      setLoading(true);
      try {
        const res = await fetch(CSV_URL); if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(parseCSVData(await res.text())); setLastFetch(Date.now()); setError(null);
      } catch (e) { setError(e.message); } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, [load]);

    const opsMap = useMemo(() => buildOpsMap(), []);

    const toggleModel = m => setFilterModels(prev =>
      m === 'All' ? [] : prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

    // ── Derived: fleet tab ─────────────────────────────────────────────────
    const { models, filteredFleet, stats } = useMemo(() => {
      if (!data) return { models: [], filteredFleet: [], stats: {} };
      const ac = data.aircraft;
      const models = [...new Set(ac.map(a => a.model))];
      let filtered = ac;
      if (filterModels.length > 0) filtered = filtered.filter(a => filterModels.includes(a.model));
      if (filterFlyable === 'Flyable')  filtered = filtered.filter(a => a.flyable);
      if (filterFlyable === 'Grounded') filtered = filtered.filter(a => !a.flyable);
      filtered = [...filtered].sort((a, b) => {
        let va, vb;
        if (['acCertDays','coaCertDays'].includes(sortCol))   { va = a[sortCol] ?? 9999;        vb = b[sortCol] ?? 9999; }
        else if (sortCol === 'flyable')     { va = a.flyable ? 0 : 1;          vb = b.flyable ? 0 : 1; }
        else if (sortCol === 'dueInHours')  { va = a.dueInHours ?? 9999;       vb = b.dueInHours ?? 9999; }
        else if (sortCol === 'flyableDate') { va = a.flyableDate?.iso || '9999'; vb = b.flyableDate?.iso || '9999'; }
        else if (sortCol === 'lastFlightIso') { va = a.lastFlightIso || '';    vb = b.lastFlightIso || ''; }
        else { va = String(a[sortCol] || ''); vb = String(b[sortCol] || ''); }
        return va < vb ? (sortAsc ? -1 : 1) : va > vb ? (sortAsc ? 1 : -1) : 0;
      });
      const flyable  = ac.filter(a => a.flyable).length;
      const expiring = ac.filter(a => (a.acCertDays !== null && a.acCertDays >= 0 && a.acCertDays <= 60) || (a.coaCertDays !== null && a.coaCertDays >= 0 && a.coaCertDays <= 60)).length;
      const stats = { total: ac.length, flyable, grounded: ac.length - flyable, expiring,
        byModel: models.map(m => ({ model: m, total: ac.filter(a => a.model === m).length, flyable: ac.filter(a => a.model === m && a.flyable).length })) };
      return { models, filteredFleet: filtered, stats };
    }, [data, filterModels, filterFlyable, sortCol, sortAsc]);

    // ── Derived: cross-check tab ───────────────────────────────────────────
    const { xRowsFiltered, xSummary } = useMemo(() => {
      if (!data) return { xRowsFiltered: [], xSummary: { ok: 0, conflict: 0, missing: 0 } };
      const ac = data.aircraft;
      const rows = ac.map(sheet => {
        const ops     = opsMap[sheet.reg] || null;
        const opsFly  = ops ? !ops.isMaint : null;
        const sheetFly= sheet.flyable;
        const conflict= ops !== null && opsFly !== sheetFly;
        const missing = ops === null;
        return { sheet, ops, opsFly, sheetFly, conflict, missing };
      });
      rows.sort((a, b) => {
        const ra = a.conflict ? 0 : a.missing ? 1 : 2;
        const rb = b.conflict ? 0 : b.missing ? 1 : 2;
        return ra !== rb ? ra - rb : a.sheet.reg.localeCompare(b.sheet.reg);
      });
      const ok       = rows.filter(r => !r.conflict && !r.missing).length;
      const conflict = rows.filter(r => r.conflict).length;
      const missing  = rows.filter(r => r.missing).length;
      const xSummary = { ok, conflict, missing, total: rows.length };
      let xRowsFiltered = rows;
      if (xFilter === 'conflict') xRowsFiltered = rows.filter(r => r.conflict);
      else if (xFilter === 'missing') xRowsFiltered = rows.filter(r => r.missing);
      return { xRowsFiltered, xSummary };
    }, [data, opsMap, xFilter]);

    const onSort = col => { if (sortCol === col) setSortAsc(a => !a); else { setSortCol(col); setSortAsc(true); } };
    const SortH = ({ col, children, align }) => {
      const active = sortCol === col;
      return (
        <th className="mono uc" onClick={() => onSort(col)}
          style={{ padding: '6px 8px', textAlign: align || 'left', fontSize: 9, color: active ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-2)', cursor: 'pointer', userSelect: 'none' }}>
          {children}{active ? (sortAsc ? ' ▲' : ' ▼') : ''}
        </th>
      );
    };

    const today = typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0, 10);
    const allModelsSelected = filterModels.length === 0;

    const xBadge = data && xSummary.conflict > 0
      ? <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: 'var(--col-cancel)', background: 'color-mix(in oklch,var(--col-cancel) 18%,transparent)', border: '1px solid var(--col-cancel)', borderRadius: 10, padding: '1px 6px' }}>{xSummary.conflict}</span>
      : data && xSummary.conflict === 0
        ? <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--col-done)', opacity: 0.8 }}>✓</span>
        : null;

    const sheetTabs = tab === 'fleet' || tab === 'crosscheck';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '10px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="head uc" style={{ fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>✦ CATC Aircraft Status</div>
            {data?.meta && sheetTabs && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                Sheet updated: <b style={{ color: 'var(--ink-2)' }}>{data.meta.lastUpdate}</b>
                {data.meta.updatedBy && <span> · By: {data.meta.updatedBy}</span>}
                {lastFetch && <span style={{ marginLeft: 8 }}>· Fetched: <span style={{ color: 'var(--col-done)' }}>{new Date(lastFetch).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></span>}
              </div>
            )}
            {!sheetTabs && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                Source: flight schedule data · completed flights · block time default
              </div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading && sheetTabs && <span className="mono" style={{ fontSize: 10, color: 'var(--col-pending)' }}>⟳ refreshing…</span>}
            {error   && sheetTabs && <span className="mono" style={{ fontSize: 10, color: 'var(--col-cancel)' }}>⚠ {error}</span>}
            {sheetTabs && <button className="chip" onClick={load} disabled={loading}>⟳ Refresh</button>}
          </div>
        </div>

        {/* ── Fleet summary strip (fleet/crosscheck only) ─────────────────── */}
        {sheetTabs && data && (
          <div style={{ flexShrink: 0, padding: '10px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', alignItems: 'stretch' }}>
            {[{ val: stats.total, label: 'Total', col: 'var(--ink-1)', border: 'var(--line)' },
              { val: stats.flyable,  label: 'Flyable',   col: 'var(--col-done)',   border: 'var(--col-done)' },
              { val: stats.grounded, label: 'Grounded',  col: 'var(--col-cancel)', border: 'var(--col-cancel)' },
              { val: stats.expiring, label: '≤60d cert', col: '#ff8c42',           border: '#ff8c42' }
            ].map(({ val, label, col, border }) => (
              <div key={label} style={{ background: 'var(--surface)', border: `1px solid ${border}`, borderRadius: 8, padding: '7px 14px', textAlign: 'center', minWidth: 64 }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: col, lineHeight: 1 }}>{val}</div>
                <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 3 }}>{label}</div>
              </div>
            ))}
            <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', margin: '0 4px' }} />
            {stats.byModel?.map(m => (
              <div key={m.model} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', minWidth: 90 }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{shortModel(m.model)}</div>
                <div className="mono" style={{ fontSize: 12, marginTop: 3 }}>
                  <span style={{ color: 'var(--col-done)', fontWeight: 700 }}>{m.flyable}</span>
                  <span style={{ color: 'var(--ink-3)' }}> / {m.total}</span>
                  <span className="uc" style={{ color: 'var(--ink-4,#555)', fontSize: 9, marginLeft: 4 }}>fly</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Sub-tab bar ────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '0 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)', display: 'flex' }}>
          {[
            { id: 'fleet',       label: 'Fleet' },
            { id: 'crosscheck',  label: 'OPS Cross-Check' },
            { id: 'utilization', label: 'Utilization' },
            { id: 'fi-stat',     label: 'FI Stat' },
            { id: 'sp-stat',     label: 'SP Stat' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="mono uc"
              style={{ background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid var(--highlight)' : '2px solid transparent', color: tab === t.id ? 'var(--highlight)' : 'var(--ink-3)', fontSize: 10.5, fontWeight: 600, padding: '9px 14px', cursor: 'pointer', letterSpacing: 0.5, display: 'flex', alignItems: 'center' }}>
              {t.label}{t.id === 'crosscheck' ? xBadge : null}
            </button>
          ))}
        </div>

        {/* ── Shared filter bar (fleet / crosscheck only) ─────────────────── */}
        {sheetTabs && (
          <div style={{ flexShrink: 0, padding: '6px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
            <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)' }}>Model:</span>
            <button className={'chip' + (allModelsSelected ? ' sel' : '')} onClick={() => setFilterModels([])} style={{ fontSize: 10, padding: '3px 8px' }}>All</button>
            {models.map(m => (
              <button key={m} className={'chip' + (filterModels.includes(m) ? ' sel' : '')} onClick={() => toggleModel(m)} style={{ fontSize: 10, padding: '3px 8px' }}>{shortModel(m)}</button>
            ))}
            <div style={{ width: 1, background: 'var(--line)', height: 16, margin: '0 2px' }} />
            {['All', 'Flyable', 'Grounded'].map(f => (
              <button key={f} className={'chip' + (filterFlyable === f ? ' sel' : '')} onClick={() => setFilterFlyable(f)} style={{ fontSize: 10, padding: '3px 8px' }}>{f}</button>
            ))}
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-3)' }}>
              {tab === 'fleet' ? `${filteredFleet.length} aircraft` : `${xRowsFiltered.length} aircraft`}
            </span>
          </div>
        )}

        {/* ══════════════════ FLEET TAB ══════════════════════════════════════ */}
        {tab === 'fleet' && (
          loading && !data ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--ink-3)' }}>
              <div className="mono" style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 10 }}>✦</div><div>Loading aircraft status…</div></div>
            </div>
          ) : error && !data ? (
            <div style={{ padding: 24 }}>
              <div className="mono" style={{ color: 'var(--col-cancel)', marginBottom: 12 }}>Failed to load: {error}</div>
              <button className="chip" onClick={load}>Retry</button>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                {[{ col: 'var(--col-done)', label: '> 120 days' }, { col: 'var(--col-pending)', label: '61–120 days' }, { col: '#ff8c42', label: '1–60 days' }, { col: 'var(--col-cancel)', label: 'Expired' }].map(({ col, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: col, display: 'inline-block', flexShrink: 0 }} />
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{label}</span>
                  </div>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <SortH col="item" align="center">#</SortH>
                    <SortH col="reg">Registration</SortH>
                    <SortH col="model">Model</SortH>
                    <SortH col="flyable" align="center">Status</SortH>
                    <SortH col="lastFlightIso">Last Flight</SortH>
                    <SortH col="dueInHours">Due In</SortH>
                    <SortH col="acCertDays" align="center">A/C Cert</SortH>
                    <SortH col="coaCertDays" align="center">CoA Cert</SortH>
                    <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Insurance</th>
                    <SortH col="flyableDate">Est. Flyable</SortH>
                    <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFleet.map((ac, i) => {
                    const rowBg = i % 2 === 0 ? 'transparent' : 'color-mix(in oklch,var(--surface) 50%,transparent)';
                    const flyCol = ac.flyable ? 'var(--col-done)' : 'var(--col-cancel)';
                    let flyDateCol = 'var(--col-done)';
                    if (ac.flyableDate) flyDateCol = ac.flyableDate.iso < today ? 'var(--col-cancel)' : ac.flyableDate.iso <= today.slice(0,8) + '30' ? '#ff8c42' : 'var(--col-done)';
                    return (
                      <tr key={ac.reg} style={{ background: rowBg }}>
                        <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-3)', fontSize: 11, textAlign: 'center' }}>{ac.item}</td>
                        <td style={{ padding: '6px 8px' }}><span className="mono" style={{ color: 'var(--highlight)', fontWeight: 600, fontSize: 13 }}>{ac.reg}</span></td>
                        <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{shortModel(ac.model)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <span className="mono uc" style={{ fontSize: 10, fontWeight: 700, color: flyCol, background: `color-mix(in oklch,${flyCol} 15%,transparent)`, border: `1px solid ${flyCol}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                            {ac.flyable ? '✔ FLY' : '✘ GND'}
                          </span>
                        </td>
                        <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{ac.lastFlight || '—'}</td>
                        <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right' }}>{ac.dueInDisplay}</td>
                        <DaysCell date={ac.acCertDate} days={ac.acCertDays} />
                        <DaysCell date={ac.coaCertDate} days={ac.coaCertDays} />
                        <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{ac.insurance || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {ac.flyableDate
                            ? <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: flyDateCol }}>{ac.flyableDate.display}</span>
                            : ac.flyable
                              ? <span className="mono" style={{ fontSize: 10, color: 'var(--col-done)' }}>Ready</span>
                              : <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4,#555)' }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 8px', maxWidth: 200 }}>
                          {ac.remarks && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', lineHeight: 1.5, display: 'block' }}>{ac.remarks}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ══════════════════ CROSS-CHECK TAB ════════════════════════════════ */}
        {tab === 'crosscheck' && (
          loading && !data ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--ink-3)' }}>
              <div className="mono" style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 10 }}>✦</div><div>Loading aircraft status…</div></div>
            </div>
          ) : error && !data ? (
            <div style={{ padding: 24 }}>
              <div className="mono" style={{ color: 'var(--col-cancel)', marginBottom: 12 }}>Failed to load: {error}</div>
              <button className="chip" onClick={load}>Retry</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ flexShrink: 0, padding: '8px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                <div className="mono" style={{ fontSize: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--ink-3)' }}>OPS source:</span>
                  <span style={{ color: 'var(--ink-2)' }}>FLIGHT_DATA.resources (isMaint)</span>
                  <span style={{ color: 'var(--ink-4,#555)' }}>vs</span>
                  <span style={{ color: 'var(--ink-3)' }}>Sheet:</span>
                  <span style={{ color: 'var(--col-done)' }}>{data?.meta?.lastUpdate || '—'} · {data?.meta?.updatedBy || ''}</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {[{ id: 'conflict', label: 'Conflicts' }, { id: 'missing', label: 'Missing from OPS' }, { id: 'all', label: 'All' }].map(f => (
                    <button key={f.id} className={'chip' + (xFilter === f.id ? ' sel' : '')} onClick={() => setXFilter(f.id)} style={{ fontSize: 10, padding: '3px 8px' }}>{f.label}</button>
                  ))}
                  <div style={{ display: 'flex', gap: 14, marginLeft: 8 }}>
                    {[{ val: xSummary.conflict, label: 'Conflict', col: 'var(--col-cancel)' },
                      { val: xSummary.missing,  label: 'Missing',  col: 'var(--col-pending)' },
                      { val: xSummary.ok,       label: 'OK',       col: 'var(--col-done)' }
                    ].map(({ val, label, col }) => (
                      <div key={label} className="mono" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: col, lineHeight: 1 }}>{val}</div>
                        <div className="uc" style={{ fontSize: 9, color: 'var(--ink-4,#555)' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
                {xRowsFiltered.length === 0 ? (
                  <div className="mono" style={{ color: 'var(--col-done)', padding: '40px', textAlign: 'center', fontSize: 13 }}>
                    ✓ No {xFilter === 'conflict' ? 'conflicts' : xFilter === 'missing' ? 'missing aircraft' : 'items'} found.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Registration</th>
                        <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Model</th>
                        <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', textAlign: 'center', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>OPS<br/><span style={{fontWeight:400,opacity:0.7}}>(isMaint)</span></th>
                        <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', textAlign: 'center', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Sheet<br/><span style={{fontWeight:400,opacity:0.7}}>(Flyable?)</span></th>
                        <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', textAlign: 'center', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Match</th>
                        <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Est. Flyable</th>
                        <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {xRowsFiltered.map((row, i) => {
                        const { sheet, ops, opsFly, sheetFly, conflict, missing } = row;
                        const rowBg = conflict
                          ? 'color-mix(in oklch,var(--col-cancel) 8%,transparent)'
                          : missing
                            ? 'color-mix(in oklch,var(--col-pending) 6%,transparent)'
                            : i % 2 === 0 ? 'transparent' : 'color-mix(in oklch,var(--surface) 50%,transparent)';
                        const flyBadge = (fly, dimmed) => {
                          if (fly === null) return <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4,#555)' }}>—</span>;
                          const col = fly ? 'var(--col-done)' : 'var(--col-cancel)';
                          return <span className="mono uc" style={{ fontSize: 10, fontWeight: 700, color: col, background: `color-mix(in oklch,${col} 15%,transparent)`, border: `1px solid ${col}`, borderRadius: 4, padding: '2px 7px', opacity: dimmed ? 0.45 : 1 }}>{fly ? '✔ FLY' : '✘ GND'}</span>;
                        };
                        let flyDateCol = 'var(--col-done)';
                        if (sheet.flyableDate) flyDateCol = sheet.flyableDate.iso < today ? 'var(--col-cancel)' : '#ff8c42';
                        return (
                          <tr key={sheet.reg} style={{ background: rowBg, borderTop: '1px solid var(--line)' }}>
                            <td style={{ padding: '8px 8px' }}><span className="mono" style={{ color: 'var(--highlight)', fontWeight: 600, fontSize: 13 }}>{sheet.reg}</span></td>
                            <td className="mono" style={{ padding: '8px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{shortModel(sheet.model)}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                              {missing ? <span className="mono uc" style={{ fontSize: 9, color: 'var(--col-pending)', border: '1px solid var(--col-pending)', borderRadius: 4, padding: '2px 6px' }}>not in OPS</span> : flyBadge(opsFly, !conflict)}
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'center', verticalAlign: 'middle' }}>{flyBadge(sheetFly, !conflict && !missing)}</td>
                            <td style={{ padding: '8px 8px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                              {missing ? <span className="mono uc" style={{ fontSize: 9, color: 'var(--col-pending)' }}>—</span>
                                : conflict ? <span className="mono uc" style={{ fontSize: 10, fontWeight: 700, color: 'var(--col-cancel)' }}>⚠ MISMATCH</span>
                                : <span className="mono" style={{ fontSize: 10, color: 'var(--col-done)', opacity: 0.7 }}>✓ OK</span>}
                            </td>
                            <td style={{ padding: '8px 8px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                              {sheet.flyableDate ? <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: flyDateCol }}>{sheet.flyableDate.display}</span>
                                : sheet.flyable ? <span className="mono" style={{ fontSize: 10, color: 'var(--col-done)' }}>Ready</span>
                                : <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4,#555)' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 8px', maxWidth: 280, verticalAlign: 'middle' }}>
                              {sheet.remarks && <span className="mono" style={{ fontSize: 10, color: conflict ? 'var(--col-pending)' : 'var(--ink-3)', lineHeight: 1.5, display: 'block' }}>{sheet.remarks}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )
        )}

        {/* ══════════════════ UTILIZATION TAB ════════════════════════════════ */}
        {tab === 'utilization' && <UtilizationTab />}
        {tab === 'fi-stat'     && <PersonStatTab mode="fi" />}
        {tab === 'sp-stat'     && <PersonStatTab mode="sp" />}

      </div>
    );
  }

  window.AircraftStatusView = AircraftStatusView;
})();
