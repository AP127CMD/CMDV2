// view-aircraft.js — CATC Aircraft Status live feed + cross-check against local snapshot
// Source A (live): Google Sheets pubhtml CSV, fetched on load + 5-minute auto-refresh
// Source B (cache): /aircraft-status-cache.json (bundled snapshot)
(function () {
  const { useState, useEffect, useMemo, useCallback } = React;
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTOc87NylhUtL_17hM8TWNKucAqhO84TPlK4l_H704A8AGc0Idhdt5FoggsPtwR1uCVyZixOyPppZ3B/pub?gid=1661381999&single=true&output=csv';
  const CACHE_URL = '/aircraft-status-cache.json';

  const DEFAULT_MODELS = ['Diamond DA40 TDI', 'Diamond DA40 CS'];

  // ── CSV parser ────────────────────────────────────────────────────────────
  function parseCSVRow(line) {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    fields.push(cur.trim());
    return fields;
  }

  // Parse HH:MM or HH:MM:SS → { display: "HH:MM", totalHours: number }
  function parseDueIn(raw) {
    if (!raw || raw === 'N/A' || raw.trim() === '') return { display: raw || '—', totalHours: null };
    const parts = raw.trim().split(':');
    if (parts.length < 2) return { display: raw, totalHours: null };
    const hPart = parts[0];
    const mPart = parts[1].padStart(2, '0');
    const h = parseInt(hPart, 10);
    const m = parseInt(mPart, 10);
    const totalHours = isNaN(h) || isNaN(m) ? null : h + m / 60;
    return { display: `${hPart}:${mPart}`, totalHours };
  }

  const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

  // Extract "Flyable on D Mon,YY" from remarks
  function extractFlyableDate(remarks) {
    if (!remarks) return null;
    const m = remarks.match(/flyable\s+on\s+(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{2,4})/i);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (!mon) return null;
    const yr = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    const iso = `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return { display: `${day} ${m[2].slice(0,3)} ${yr}`, iso };
  }

  // Normalize date strings to ISO "YYYY-MM-DD"
  function normDate(s) {
    if (!s || s === 'N/A') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD-Mon-YYYY
    const m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
    if (m) {
      const mon = MONTHS[m[2].toLowerCase().slice(0,3)];
      if (!mon) return null;
      return `${m[3]}-${String(mon).padStart(2,'0')}-${String(parseInt(m[1],10)).padStart(2,'0')}`;
    }
    return null;
  }

  function parseCSVData(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 3) return { meta: {}, aircraft: [] };
    const r0 = parseCSVRow(lines[0]);
    const meta = { lastUpdate: r0[3] || '', updatedBy: r0[6] || '' };
    const aircraft = [];
    for (let i = 2; i < lines.length; i++) {
      const f = parseCSVRow(lines[i]);
      if (!f[0] || !f[1]) continue;
      const toInt = s => { const x = parseInt(String(s).replace(/,/g, ''), 10); return isNaN(x) ? null : x; };
      const rawRemarks = (f[11] || '').replace(/^\(|\)$/g, '').trim();
      const dueIn = parseDueIn(f[5]);
      aircraft.push({
        item: f[0], reg: f[1], model: f[2] || '',
        flyable: (f[3] || '').toLowerCase() === 'yes',
        lastFlight: f[4] || '', lastFlightIso: normDate(f[4]),
        dueInDisplay: dueIn.display, dueInHours: dueIn.totalHours,
        acCertDate: f[6] || '', acCertDays: toInt(f[7]),
        coaCertDate: f[8] || '', coaCertDays: toInt(f[9]),
        insurance: f[10] || '',
        remarks: rawRemarks,
        flyableDate: extractFlyableDate(rawRemarks),
      });
    }
    return { meta, aircraft };
  }

  // Normalise cache JSON record to the same shape used in cross-check
  function normCacheRecord(r) {
    const dueIn = parseDueIn(r.dueInHours || '');
    const raw = (r.maintenanceRemarks || '').replace(/^\(|\)$/g, '').trim();
    return {
      reg: r.registration,
      model: r.model || '',
      flyable: !!r.flyable,
      lastFlight: r.lastFlight || '',
      lastFlightIso: normDate(r.lastFlight),
      dueInDisplay: dueIn.display,
      acCertDate: r.aircraftCertExpiry || '',
      coaCertDate: r.coaCertExpiry || '',
      remarks: raw,
      flyableDate: extractFlyableDate(raw),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function daysColor(days) {
    if (days === null) return 'var(--ink-4, #555)';
    if (days < 0) return 'var(--col-cancel)';
    if (days <= 60) return '#ff8c42';
    if (days <= 120) return 'var(--col-pending)';
    return 'var(--col-done)';
  }
  function shortModel(m) { return m.replace('Diamond ', '').replace('Robinson ', ''); }

  function DaysCell({ date, days }) {
    const col = daysColor(days);
    const label = days === null ? '—' : days < 0 ? `EXP (${days}d)` : `${days}d`;
    return (
      <td className="mono" style={{ padding: '5px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{date || '—'}</div>
        {days !== null && <div style={{ fontSize: 10, color: col, fontWeight: 700, marginTop: 1 }}>{label}</div>}
      </td>
    );
  }

  // ── Cross-check diff logic ────────────────────────────────────────────────
  const DIFF_FIELDS = [
    { key: 'flyable',    label: 'Flyable',      critical: true,  fmt: v => v ? 'YES' : 'NO' },
    { key: 'lastFlight', label: 'Last Flight',  critical: false, fmt: v => v || '—' },
    { key: 'dueInDisplay', label: 'Due In',     critical: false, fmt: v => v || '—' },
    { key: 'acCertDate', label: 'A/C Cert',     critical: false, fmt: v => v || '—' },
    { key: 'coaCertDate', label: 'CoA Cert',    critical: false, fmt: v => v || '—' },
    { key: 'remarks',    label: 'Remarks',      critical: false, fmt: v => v || '—' },
  ];

  function buildDiff(cacheMap, liveAC) {
    const result = [];
    // All live aircraft
    liveAC.forEach(live => {
      const cache = cacheMap[live.reg];
      const diffs = [];
      if (!cache) {
        diffs.push({ field: '—', label: 'New in sheet', cacheVal: '—', liveVal: '(new)', critical: false });
      } else {
        DIFF_FIELDS.forEach(f => {
          const cv = f.fmt(cache[f.key]);
          const lv = f.fmt(live[f.key]);
          if (cv !== lv) diffs.push({ field: f.key, label: f.label, cacheVal: cv, liveVal: lv, critical: f.critical });
        });
      }
      result.push({ reg: live.reg, model: live.model, flyable: live.flyable, diffs });
    });
    // Aircraft in cache but not in live sheet
    Object.keys(cacheMap).forEach(reg => {
      if (!liveAC.find(a => a.reg === reg)) {
        result.push({ reg, model: cacheMap[reg].model, flyable: cacheMap[reg].flyable,
          diffs: [{ field: '—', label: 'Missing from sheet', cacheVal: '(was present)', liveVal: '—', critical: true }] });
      }
    });
    return result;
  }

  // ── Main component ────────────────────────────────────────────────────────
  function AircraftStatusView() {
    const [liveData, setLiveData] = useState(null);
    const [cacheData, setCacheData] = useState(null);
    const [liveError, setLiveError] = useState(null);
    const [cacheError, setCacheError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastFetch, setLastFetch] = useState(null);
    const [tab, setTab] = useState('status');  // 'status' | 'crosscheck'

    // Status tab filters
    const [filterModels, setFilterModels] = useState(DEFAULT_MODELS);
    const [filterFlyable, setFilterFlyable] = useState('All');
    const [sortCol, setSortCol] = useState('item');
    const [sortAsc, setSortAsc] = useState(true);

    // Cross-check filters
    const [xFilter, setXFilter] = useState('changed');  // 'all' | 'changed' | 'critical'

    const loadLive = useCallback(async () => {
      setLoading(true);
      try {
        const res = await fetch(CSV_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setLiveData(parseCSVData(await res.text()));
        setLastFetch(Date.now());
        setLiveError(null);
      } catch (e) { setLiveError(e.message); }
      finally { setLoading(false); }
    }, []);

    const loadCache = useCallback(async () => {
      try {
        const res = await fetch(CACHE_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.json();
        setCacheData(arr.map(normCacheRecord));
        setCacheError(null);
      } catch (e) { setCacheError(e.message); }
    }, []);

    useEffect(() => { loadLive(); loadCache(); }, [loadLive, loadCache]);
    useEffect(() => { const t = setInterval(loadLive, 5 * 60 * 1000); return () => clearInterval(t); }, [loadLive]);

    const toggleModel = m => {
      setFilterModels(prev => m === 'All' ? [] : prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    };

    const { models, filtered, stats } = useMemo(() => {
      if (!liveData) return { models: [], filtered: [], stats: {} };
      const ac = liveData.aircraft;
      const models = [...new Set(ac.map(a => a.model))];
      let filtered = ac;
      if (filterModels.length > 0) filtered = filtered.filter(a => filterModels.includes(a.model));
      if (filterFlyable === 'Flyable') filtered = filtered.filter(a => a.flyable);
      if (filterFlyable === 'Grounded') filtered = filtered.filter(a => !a.flyable);
      filtered = [...filtered].sort((a, b) => {
        let va, vb;
        if (['acCertDays','coaCertDays'].includes(sortCol)) { va = a[sortCol]??9999; vb = b[sortCol]??9999; }
        else if (sortCol === 'flyable') { va = a.flyable?0:1; vb = b.flyable?0:1; }
        else if (sortCol === 'dueInHours') { va = a.dueInHours??9999; vb = b.dueInHours??9999; }
        else if (sortCol === 'flyableDate') { va = a.flyableDate?.iso||'9999'; vb = b.flyableDate?.iso||'9999'; }
        else if (sortCol === 'lastFlightIso') { va = a.lastFlightIso||''; vb = b.lastFlightIso||''; }
        else { va = String(a[sortCol]||''); vb = String(b[sortCol]||''); }
        return va < vb ? (sortAsc?-1:1) : va > vb ? (sortAsc?1:-1) : 0;
      });
      const flyable = ac.filter(a => a.flyable).length;
      const expiring = ac.filter(a => (a.acCertDays!==null&&a.acCertDays>=0&&a.acCertDays<=60)||(a.coaCertDays!==null&&a.coaCertDays>=0&&a.coaCertDays<=60)).length;
      const stats = { total: ac.length, flyable, grounded: ac.length-flyable, expiring,
        byModel: models.map(m => ({ model:m, total:ac.filter(a=>a.model===m).length, flyable:ac.filter(a=>a.model===m&&a.flyable).length })) };
      return { models, filtered, stats };
    }, [liveData, filterModels, filterFlyable, sortCol, sortAsc]);

    const { diffRows, xSummary } = useMemo(() => {
      if (!liveData || !cacheData) return { diffRows: [], xSummary: {} };
      const cacheMap = Object.fromEntries(cacheData.map(r => [r.reg, r]));
      const all = buildDiff(cacheMap, liveData.aircraft);
      const changed = all.filter(r => r.diffs.length > 0);
      const critical = changed.filter(r => r.diffs.some(d => d.critical));
      const xSummary = { total: all.length, changed: changed.length, critical: critical.length };
      let rows = xFilter === 'critical' ? critical : xFilter === 'changed' ? changed : all;
      return { diffRows: rows, xSummary };
    }, [liveData, cacheData, xFilter]);

    const onSort = col => { if (sortCol === col) setSortAsc(a => !a); else { setSortCol(col); setSortAsc(true); } };
    const SortH = ({ col, children, align }) => {
      const active = sortCol === col;
      return (
        <th className="mono uc" onClick={() => onSort(col)}
          style={{ padding: '6px 8px', textAlign: align||'left', fontSize: 9, color: active?'var(--highlight)':'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-2)', cursor: 'pointer', userSelect: 'none' }}>
          {children}{active?(sortAsc?' ▲':' ▼'):''}
        </th>
      );
    };

    if (loading && !liveData) {
      return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--ink-3)' }}>
          <div className="mono" style={{ textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>✦</div>
            <div>Loading aircraft status…</div>
          </div>
        </div>
      );
    }
    if (liveError && !liveData) {
      return (
        <div style={{ padding:24 }}>
          <div className="mono" style={{ color:'var(--col-cancel)', marginBottom:12 }}>Failed to load: {liveError}</div>
          <button className="chip" onClick={loadLive}>Retry</button>
        </div>
      );
    }

    const allModelsSelected = filterModels.length === 0;
    const today = (typeof localToday === 'function' ? localToday() : new Date().toISOString().slice(0,10));

    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

        {/* ── Header ── */}
        <div style={{ flexShrink:0, padding:'10px 16px', background:'var(--bg-2)', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div>
            <div className="head uc" style={{ fontWeight:700, fontSize:15, letterSpacing:1 }}>✦ CATC Aircraft Status</div>
            {liveData?.meta && (
              <div className="mono" style={{ fontSize:10, color:'var(--ink-3)', marginTop:2 }}>
                Sheet updated: <b style={{ color:'var(--ink-2)' }}>{liveData.meta.lastUpdate}</b>
                {liveData.meta.updatedBy && <span> · By: {liveData.meta.updatedBy}</span>}
                {lastFetch && <span style={{ marginLeft:8 }}>· Fetched: <span style={{ color:'var(--col-done)' }}>{new Date(lastFetch).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></span>}
                {cacheError && <span style={{ marginLeft:8, color:'var(--col-cancel)' }}>· Cache: {cacheError}</span>}
              </div>
            )}
          </div>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
            {loading && <span className="mono" style={{ fontSize:10, color:'var(--col-pending)' }}>⟳ refreshing…</span>}
            {liveError && <span className="mono" style={{ fontSize:10, color:'var(--col-cancel)' }}>⚠ {liveError}</span>}
            <button className="chip" onClick={loadLive} disabled={loading}>⟳ Refresh</button>
          </div>
        </div>

        {/* ── Summary strip ── */}
        <div style={{ flexShrink:0, padding:'10px 16px', display:'flex', gap:10, flexWrap:'wrap', borderBottom:'1px solid var(--line)', alignItems:'stretch' }}>
          {[
            { val:stats.total,    label:'Total',     col:'var(--ink-1)',     border:'var(--line)' },
            { val:stats.flyable,  label:'Flyable',   col:'var(--col-done)',  border:'var(--col-done)' },
            { val:stats.grounded, label:'Grounded',  col:'var(--col-cancel)',border:'var(--col-cancel)' },
            { val:stats.expiring, label:'≤60d cert', col:'#ff8c42',          border:'#ff8c42' },
          ].map(({ val, label, col, border }) => (
            <div key={label} style={{ background:'var(--surface)', border:`1px solid ${border}`, borderRadius:8, padding:'7px 14px', textAlign:'center', minWidth:64 }}>
              <div className="mono" style={{ fontSize:22, fontWeight:700, color:col, lineHeight:1 }}>{val}</div>
              <div className="mono uc" style={{ fontSize:9, color:'var(--ink-3)', marginTop:3 }}>{label}</div>
            </div>
          ))}
          <div style={{ width:1, background:'var(--line)', alignSelf:'stretch', margin:'0 4px' }} />
          {stats.byModel?.map(m => (
            <div key={m.model} style={{ background:'var(--surface)', border:'1px solid var(--line)', borderRadius:8, padding:'6px 12px', minWidth:90 }}>
              <div className="mono" style={{ fontSize:10, color:'var(--ink-2)', fontWeight:600, whiteSpace:'nowrap' }}>{shortModel(m.model)}</div>
              <div className="mono" style={{ fontSize:12, marginTop:3 }}>
                <span style={{ color:'var(--col-done)', fontWeight:700 }}>{m.flyable}</span>
                <span style={{ color:'var(--ink-3)' }}> / {m.total}</span>
                <span className="uc" style={{ color:'var(--ink-4,#555)', fontSize:9, marginLeft:4 }}>fly</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Tab bar ── */}
        <div style={{ flexShrink:0, padding:'0 16px', background:'var(--bg-2)', borderBottom:'1px solid var(--line)', display:'flex', gap:0 }}>
          {[
            { id:'status',     label:'Status' },
            { id:'crosscheck', label: cacheData
                ? `Cross-Check${xSummary.critical>0 ? ` · ⚠ ${xSummary.critical} critical` : xSummary.changed>0 ? ` · ${xSummary.changed} changed` : ' · ✓ in sync'}`
                : 'Cross-Check' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="mono uc"
              style={{ background:'none', border:'none', borderBottom: tab===t.id ? '2px solid var(--highlight)' : '2px solid transparent', color: tab===t.id ? 'var(--highlight)' : 'var(--ink-3)', fontSize:10.5, fontWeight:600, padding:'9px 14px', cursor:'pointer', letterSpacing:0.5 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── STATUS TAB ── */}
        {tab === 'status' && (
          <>
            {/* Filters */}
            <div style={{ flexShrink:0, padding:'6px 16px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', borderBottom:'1px solid var(--line)', background:'var(--bg-2)' }}>
              <span className="mono uc" style={{ fontSize:10, color:'var(--ink-3)' }}>Model:</span>
              <button className={'chip'+(allModelsSelected?' sel':'')} onClick={() => setFilterModels([])} style={{ fontSize:10, padding:'3px 8px' }}>All</button>
              {models.map(m => (
                <button key={m} className={'chip'+(filterModels.includes(m)?' sel':'')} onClick={() => toggleModel(m)} style={{ fontSize:10, padding:'3px 8px' }}>{shortModel(m)}</button>
              ))}
              <div style={{ width:1, background:'var(--line)', height:16, margin:'0 2px' }} />
              {['All','Flyable','Grounded'].map(f => (
                <button key={f} className={'chip'+(filterFlyable===f?' sel':'')} onClick={() => setFilterFlyable(f)} style={{ fontSize:10, padding:'3px 8px' }}>{f}</button>
              ))}
              <span className="mono" style={{ marginLeft:'auto', fontSize:10, color:'var(--ink-3)' }}>{filtered.length} aircraft</span>
            </div>

            {/* Table */}
            <div style={{ flex:1, overflow:'auto', padding:'8px 16px' }}>
              <div style={{ display:'flex', gap:16, marginBottom:8, flexWrap:'wrap' }}>
                {[{col:'var(--col-done)',label:'> 120 days'},{col:'var(--col-pending)',label:'61–120 days'},{col:'#ff8c42',label:'1–60 days'},{col:'var(--col-cancel)',label:'Expired'}].map(({col,label}) => (
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <span style={{ width:9, height:9, borderRadius:2, background:col, display:'inline-block', flexShrink:0 }} />
                    <span className="mono" style={{ fontSize:10, color:'var(--ink-3)' }}>{label}</span>
                  </div>
                ))}
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
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
                    <th className="mono uc" style={{ padding:'6px 8px', fontSize:9, color:'var(--ink-3)', fontWeight:600, borderBottom:'1px solid var(--line)', whiteSpace:'nowrap', position:'sticky', top:0, background:'var(--bg-2)' }}>Insurance</th>
                    <SortH col="flyableDate">Est. Flyable</SortH>
                    <th className="mono uc" style={{ padding:'6px 8px', fontSize:9, color:'var(--ink-3)', fontWeight:600, borderBottom:'1px solid var(--line)', position:'sticky', top:0, background:'var(--bg-2)' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ac, i) => {
                    const rowBg = i%2===0 ? 'transparent' : 'color-mix(in oklch, var(--surface) 50%, transparent)';
                    const flyCol = ac.flyable ? 'var(--col-done)' : 'var(--col-cancel)';
                    let flyDateCol = 'var(--col-done)';
                    if (ac.flyableDate) {
                      flyDateCol = ac.flyableDate.iso < today ? 'var(--col-cancel)' : ac.flyableDate.iso <= today.slice(0,8)+'30' ? '#ff8c42' : 'var(--col-done)';
                    }
                    return (
                      <tr key={ac.reg} style={{ background:rowBg }}>
                        <td className="mono" style={{ padding:'6px 8px', color:'var(--ink-3)', fontSize:11, textAlign:'center' }}>{ac.item}</td>
                        <td style={{ padding:'6px 8px' }}><span className="mono" style={{ color:'var(--highlight)', fontWeight:600, fontSize:13 }}>{ac.reg}</span></td>
                        <td className="mono" style={{ padding:'6px 8px', color:'var(--ink-2)', fontSize:11, whiteSpace:'nowrap' }}>{shortModel(ac.model)}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center' }}>
                          <span className="mono uc" style={{ fontSize:10, fontWeight:700, color:flyCol, background:`color-mix(in oklch, ${flyCol} 15%, transparent)`, border:`1px solid ${flyCol}`, borderRadius:4, padding:'2px 7px', whiteSpace:'nowrap' }}>
                            {ac.flyable ? '✔ FLY' : '✘ GND'}
                          </span>
                        </td>
                        <td className="mono" style={{ padding:'6px 8px', color:'var(--ink-2)', fontSize:11, whiteSpace:'nowrap' }}>{ac.lastFlight||'—'}</td>
                        <td className="mono" style={{ padding:'6px 8px', color:'var(--ink-2)', fontSize:11, whiteSpace:'nowrap', textAlign:'right' }}>{ac.dueInDisplay}</td>
                        <DaysCell date={ac.acCertDate} days={ac.acCertDays} />
                        <DaysCell date={ac.coaCertDate} days={ac.coaCertDays} />
                        <td className="mono" style={{ padding:'6px 8px', color:'var(--ink-2)', fontSize:11, whiteSpace:'nowrap' }}>{ac.insurance||'—'}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center', whiteSpace:'nowrap' }}>
                          {ac.flyableDate
                            ? <span className="mono" style={{ fontSize:11, fontWeight:700, color:flyDateCol }}>{ac.flyableDate.display}</span>
                            : ac.flyable
                              ? <span className="mono" style={{ fontSize:10, color:'var(--col-done)' }}>Ready</span>
                              : <span className="mono" style={{ fontSize:10, color:'var(--ink-4,#555)' }}>—</span>}
                        </td>
                        <td style={{ padding:'6px 8px', maxWidth:200 }}>
                          {ac.remarks && <span className="mono" style={{ fontSize:10, color:'var(--ink-3)', lineHeight:1.5, display:'block' }}>{ac.remarks}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── CROSS-CHECK TAB ── */}
        {tab === 'crosscheck' && (
          <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
            {/* Sub-filters + summary */}
            <div style={{ flexShrink:0, padding:'8px 16px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', borderBottom:'1px solid var(--line)', background:'var(--bg-2)' }}>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <span className="mono uc" style={{ fontSize:10, color:'var(--ink-3)' }}>Show:</span>
                {[{id:'critical',label:'Critical only'},{id:'changed',label:'Changed only'},{id:'all',label:'All aircraft'}].map(f => (
                  <button key={f.id} className={'chip'+(xFilter===f.id?' sel':'')} onClick={() => setXFilter(f.id)} style={{ fontSize:10, padding:'3px 8px' }}>{f.label}</button>
                ))}
              </div>
              {cacheData && (
                <div style={{ marginLeft:'auto', display:'flex', gap:16 }}>
                  {[
                    { val:xSummary.critical, label:'Critical', col:'var(--col-cancel)' },
                    { val:xSummary.changed,  label:'Changed',  col:'var(--col-pending)' },
                    { val:xSummary.total,    label:'Total A/C', col:'var(--ink-2)' },
                  ].map(({ val, label, col }) => (
                    <div key={label} className="mono" style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:col, lineHeight:1 }}>{val}</div>
                      <div className="uc" style={{ fontSize:9, color:'var(--ink-3)' }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Source legend */}
            <div style={{ flexShrink:0, padding:'6px 16px', display:'flex', gap:24, borderBottom:'1px solid var(--line)' }}>
              <div className="mono" style={{ fontSize:10 }}>
                <span style={{ color:'var(--ink-3)' }}>Source A (cache): </span>
                <span style={{ color:'var(--ink-2)' }}>aircraft-status-cache.json (local snapshot)</span>
              </div>
              <div className="mono" style={{ fontSize:10 }}>
                <span style={{ color:'var(--ink-3)' }}>Source B (live): </span>
                <span style={{ color:'var(--col-done)' }}>Google Sheets · {liveData?.meta?.lastUpdate}</span>
              </div>
            </div>

            {!cacheData && (
              <div style={{ padding:24 }}>
                {cacheError
                  ? <div className="mono" style={{ color:'var(--col-cancel)' }}>Failed to load cache: {cacheError}<button className="chip" onClick={loadCache} style={{ marginLeft:12 }}>Retry</button></div>
                  : <div className="mono" style={{ color:'var(--ink-3)' }}>Loading cache…</div>}
              </div>
            )}

            {cacheData && (
              <div style={{ flex:1, overflow:'auto', padding:'8px 16px' }}>
                {diffRows.length === 0 ? (
                  <div className="mono" style={{ color:'var(--col-done)', padding:24, textAlign:'center' }}>✓ No differences found — both sources are in sync.</div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr>
                        {['Registration','Model','Field','Cache (A)','Live Sheet (B)','Δ'].map(h => (
                          <th key={h} className="mono uc" style={{ padding:'6px 8px', textAlign:'left', fontSize:9, color:'var(--ink-3)', fontWeight:600, borderBottom:'1px solid var(--line)', whiteSpace:'nowrap', position:'sticky', top:0, background:'var(--bg-2)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {diffRows.map((row, ri) => {
                        if (row.diffs.length === 0) {
                          // No changes — show a single "in sync" row
                          return (
                            <tr key={row.reg} style={{ background: ri%2===0?'transparent':'color-mix(in oklch,var(--surface) 50%,transparent)' }}>
                              <td style={{ padding:'6px 8px' }}><span className="mono" style={{ color:'var(--ink-3)', fontSize:12 }}>{row.reg}</span></td>
                              <td className="mono" style={{ padding:'6px 8px', color:'var(--ink-4,#555)', fontSize:11 }}>{shortModel(row.model)}</td>
                              <td colSpan={4} className="mono" style={{ padding:'6px 8px', color:'var(--col-done)', fontSize:10 }}>✓ in sync</td>
                            </tr>
                          );
                        }
                        return row.diffs.map((d, di) => {
                          const isCritical = d.critical;
                          const bg = isCritical
                            ? 'color-mix(in oklch, var(--col-cancel) 8%, transparent)'
                            : di % 2 === 0 ? 'transparent' : 'color-mix(in oklch, var(--surface) 50%, transparent)';
                          const isNewOrMissing = d.field === '—';
                          return (
                            <tr key={row.reg + d.field} style={{ background: bg }}>
                              {di === 0 ? (
                                <td rowSpan={row.diffs.length} style={{ padding:'6px 8px', verticalAlign:'top', borderTop: ri>0?'1px solid var(--line)':'none' }}>
                                  <span className="mono" style={{ color: isCritical?'var(--col-cancel)':'var(--highlight)', fontWeight:600, fontSize:13 }}>{row.reg}</span>
                                  <div className="mono" style={{ fontSize:10, color:'var(--ink-3)', marginTop:2 }}>{shortModel(row.model)}</div>
                                </td>
                              ) : null}
                              {di === 0 ? (
                                <td rowSpan={row.diffs.length} style={{ padding:'6px 8px', verticalAlign:'top', borderTop: ri>0?'1px solid var(--line)':'none' }}>
                                  {/* flyable badge from live */}
                                  <span className="mono uc" style={{ fontSize:10, fontWeight:700,
                                    color: row.flyable?'var(--col-done)':'var(--col-cancel)',
                                    background: `color-mix(in oklch, ${row.flyable?'var(--col-done)':'var(--col-cancel)'} 15%, transparent)`,
                                    border: `1px solid ${row.flyable?'var(--col-done)':'var(--col-cancel)'}`,
                                    borderRadius:4, padding:'2px 7px' }}>
                                    {row.flyable ? '✔ FLY' : '✘ GND'}
                                  </span>
                                </td>
                              ) : null}
                              <td className="mono uc" style={{ padding:'6px 8px', fontSize:10, color: isCritical?'var(--col-cancel)':'var(--ink-3)', fontWeight: isCritical?700:400 }}>
                                {isCritical && '⚠ '}{d.label}
                              </td>
                              <td className="mono" style={{ padding:'6px 8px', fontSize:11, color:'var(--ink-3)', textDecoration: isNewOrMissing?'none':'line-through' }}>
                                {d.cacheVal}
                              </td>
                              <td className="mono" style={{ padding:'6px 8px', fontSize:11, color: isCritical?'var(--col-cancel)':'var(--col-done)', fontWeight: isCritical?700:400 }}>
                                {d.liveVal}
                              </td>
                              <td style={{ padding:'6px 8px', textAlign:'center' }}>
                                <span style={{ fontSize:14 }}>{isCritical ? '🔴' : '🟡'}</span>
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  window.AircraftStatusView = AircraftStatusView;
})();
