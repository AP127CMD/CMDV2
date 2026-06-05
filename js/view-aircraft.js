// view-aircraft.js — CATC Aircraft Status  (Fleet tab + OPS Cross-Check tab)
// Fleet data : Google Sheets CSV fetched live + 5-min auto-refresh
// Cross-check: compares Sheet "Flyable?" vs window.FLIGHT_DATA.resources.isMaint
(function () {
  const { useState, useEffect, useMemo, useCallback } = React;
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
  // isMaint:true → GND,  isMaint:false/absent → FLY
  // SIM / Classroom entries excluded.
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

  // ── Main component ─────────────────────────────────────────────────────────
  function AircraftStatusView() {
    const [data,      setData]      = useState(null);
    const [error,     setError]     = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [lastFetch, setLastFetch] = useState(null);
    const [tab,       setTab]       = useState('fleet');
    const [filterModels,  setFilterModels]  = useState(DEFAULT_MODELS);
    const [filterFlyable, setFilterFlyable] = useState('All');
    const [sortCol, setSortCol] = useState('item');
    const [sortAsc, setSortAsc] = useState(true);
    const [xFilter, setXFilter] = useState('conflict'); // 'all' | 'conflict' | 'missing'

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
    const { xRowsAll, xRowsFiltered, xSummary } = useMemo(() => {
      if (!data) return { xRowsAll: [], xRowsFiltered: [], xSummary: { ok: 0, conflict: 0, missing: 0 } };
      const ac = data.aircraft;

      const rows = ac.map(sheet => {
        const ops = opsMap[sheet.reg] || null;
        // ops null = aircraft in sheet but not in FLIGHT_DATA.resources at all
        const opsFly = ops ? !ops.isMaint : null;   // null = not in OPS
        const sheetFly = sheet.flyable;
        const conflict = ops !== null && opsFly !== sheetFly;
        const missing  = ops === null;
        return { sheet, ops, opsFly, sheetFly, conflict, missing };
      });

      // Sort: conflicts first, then missing, then ok; within group by reg
      rows.sort((a, b) => {
        const rankA = a.conflict ? 0 : a.missing ? 1 : 2;
        const rankB = b.conflict ? 0 : b.missing ? 1 : 2;
        if (rankA !== rankB) return rankA - rankB;
        return a.sheet.reg.localeCompare(b.sheet.reg);
      });

      const ok       = rows.filter(r => !r.conflict && !r.missing).length;
      const conflict = rows.filter(r => r.conflict).length;
      const missing  = rows.filter(r => r.missing).length;
      const xSummary = { ok, conflict, missing, total: rows.length };

      let xRowsFiltered = rows;
      if (xFilter === 'conflict') xRowsFiltered = rows.filter(r => r.conflict);
      else if (xFilter === 'missing') xRowsFiltered = rows.filter(r => r.missing);

      return { xRowsAll: rows, xRowsFiltered, xSummary };
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

    if (loading && !data) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)' }}>
        <div className="mono" style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 10 }}>✦</div><div>Loading aircraft status…</div></div>
      </div>
    );
    if (error && !data) return (
      <div style={{ padding: 24 }}>
        <div className="mono" style={{ color: 'var(--col-cancel)', marginBottom: 12 }}>Failed to load: {error}</div>
        <button className="chip" onClick={load}>Retry</button>
      </div>
    );

    const today = typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0, 10);
    const allModelsSelected = filterModels.length === 0;

    // Cross-check tab badge
    const xBadge = data && xSummary.conflict > 0
      ? <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: 'var(--col-cancel)', background: 'color-mix(in oklch,var(--col-cancel) 18%,transparent)', border: '1px solid var(--col-cancel)', borderRadius: 10, padding: '1px 6px' }}>{xSummary.conflict}</span>
      : data && xSummary.conflict === 0
        ? <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--col-done)', opacity: 0.8 }}>✓</span>
        : null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '10px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="head uc" style={{ fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>✦ CATC Aircraft Status</div>
            {data?.meta && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                Sheet updated: <b style={{ color: 'var(--ink-2)' }}>{data.meta.lastUpdate}</b>
                {data.meta.updatedBy && <span> · By: {data.meta.updatedBy}</span>}
                {lastFetch && <span style={{ marginLeft: 8 }}>· Fetched: <span style={{ color: 'var(--col-done)' }}>{new Date(lastFetch).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></span>}
              </div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading && <span className="mono" style={{ fontSize: 10, color: 'var(--col-pending)' }}>⟳ refreshing…</span>}
            {error   && <span className="mono" style={{ fontSize: 10, color: 'var(--col-cancel)' }}>⚠ {error}</span>}
            <button className="chip" onClick={load} disabled={loading}>⟳ Refresh</button>
          </div>
        </div>

        {/* ── Summary strip ──────────────────────────────────────────────── */}
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

        {/* ── Sub-tab bar ────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '0 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)', display: 'flex' }}>
          {[{ id: 'fleet', label: 'Fleet' }, { id: 'crosscheck', label: 'OPS Cross-Check' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="mono uc"
              style={{ background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid var(--highlight)' : '2px solid transparent', color: tab === t.id ? 'var(--highlight)' : 'var(--ink-3)', fontSize: 10.5, fontWeight: 600, padding: '9px 14px', cursor: 'pointer', letterSpacing: 0.5, display: 'flex', alignItems: 'center' }}>
              {t.label}{t.id === 'crosscheck' ? xBadge : null}
            </button>
          ))}
        </div>

        {/* ── Shared filter bar ──────────────────────────────────────────── */}
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

        {/* ══════════════════ FLEET TAB ══════════════════════════════════════ */}
        {tab === 'fleet' && (
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
        )}

        {/* ══════════════════ CROSS-CHECK TAB ════════════════════════════════ */}
        {tab === 'crosscheck' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

            {/* Cross-check controls */}
            <div style={{ flexShrink: 0, padding: '8px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
              {/* Source legend */}
              <div className="mono" style={{ fontSize: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--ink-3)' }}>OPS source:</span>
                <span style={{ color: 'var(--ink-2)' }}>FLIGHT_DATA.resources (isMaint)</span>
                <span style={{ color: 'var(--ink-4,#555)' }}>vs</span>
                <span style={{ color: 'var(--ink-3)' }}>Sheet:</span>
                <span style={{ color: 'var(--col-done)' }}>{data?.meta?.lastUpdate || '—'} · {data?.meta?.updatedBy || ''}</span>
              </div>
              {/* Filter + summary */}
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
                        return (
                          <span className="mono uc" style={{ fontSize: 10, fontWeight: 700, color: col, background: `color-mix(in oklch,${col} 15%,transparent)`, border: `1px solid ${col}`, borderRadius: 4, padding: '2px 7px', opacity: dimmed ? 0.45 : 1 }}>
                            {fly ? '✔ FLY' : '✘ GND'}
                          </span>
                        );
                      };

                      let flyDateCol = 'var(--col-done)';
                      if (sheet.flyableDate) flyDateCol = sheet.flyableDate.iso < today ? 'var(--col-cancel)' : '#ff8c42';

                      return (
                        <tr key={sheet.reg} style={{ background: rowBg, borderTop: '1px solid var(--line)' }}>
                          <td style={{ padding: '8px 8px', verticalAlign: 'middle' }}>
                            <span className="mono" style={{ color: 'var(--highlight)', fontWeight: 600, fontSize: 13 }}>{sheet.reg}</span>
                          </td>
                          <td className="mono" style={{ padding: '8px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{shortModel(sheet.model)}</td>
                          {/* OPS status */}
                          <td style={{ padding: '8px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                            {missing
                              ? <span className="mono uc" style={{ fontSize: 9, color: 'var(--col-pending)', border: '1px solid var(--col-pending)', borderRadius: 4, padding: '2px 6px' }}>not in OPS</span>
                              : flyBadge(opsFly, !conflict)}
                          </td>
                          {/* Sheet status */}
                          <td style={{ padding: '8px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                            {flyBadge(sheetFly, !conflict && !missing)}
                          </td>
                          {/* Match indicator */}
                          <td style={{ padding: '8px 8px', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {missing ? (
                              <span className="mono uc" style={{ fontSize: 9, color: 'var(--col-pending)' }}>—</span>
                            ) : conflict ? (
                              <span className="mono uc" style={{ fontSize: 10, fontWeight: 700, color: 'var(--col-cancel)' }}>⚠ MISMATCH</span>
                            ) : (
                              <span className="mono" style={{ fontSize: 10, color: 'var(--col-done)', opacity: 0.7 }}>✓ OK</span>
                            )}
                          </td>
                          {/* Est. Flyable */}
                          <td style={{ padding: '8px 8px', textAlign: 'left', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {sheet.flyableDate
                              ? <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: flyDateCol }}>{sheet.flyableDate.display}</span>
                              : sheet.flyable
                                ? <span className="mono" style={{ fontSize: 10, color: 'var(--col-done)' }}>Ready</span>
                                : <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4,#555)' }}>—</span>}
                          </td>
                          {/* Remarks */}
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
        )}
      </div>
    );
  }

  window.AircraftStatusView = AircraftStatusView;
})();
