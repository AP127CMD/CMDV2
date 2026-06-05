// view-aircraft.js — CATC Aircraft Status live feed + cross-check
// Source "Operations"    : /aircraft-status-cache.json  (local ops snapshot)
// Source "Maint. Sheet"  : Google Sheets CSV, fetched live + 5-min auto-refresh
(function () {
  const { useState, useEffect, useMemo, useCallback } = React;
  const CSV_URL   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTOc87NylhUtL_17hM8TWNKucAqhO84TPlK4l_H704A8AGc0Idhdt5FoggsPtwR1uCVyZixOyPppZ3B/pub?gid=1661381999&single=true&output=csv';
  const CACHE_URL = '/aircraft-status-cache.json';

  const DEFAULT_MODELS = ['Diamond DA40 TDI', 'Diamond DA40 CS'];

  // ── Parsers ────────────────────────────────────────────────────────────────
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
    if (!raw || raw === 'N/A' || raw.trim() === '') return { display: raw || '—', totalHours: null };
    const parts = raw.trim().split(':');
    if (parts.length < 2) return { display: raw, totalHours: null };
    const hPart = parts[0], mPart = parts[1].padStart(2,'0');
    const h = parseInt(hPart,10), m = parseInt(mPart,10);
    return { display: `${hPart}:${mPart}`, totalHours: isNaN(h)||isNaN(m) ? null : h+m/60 };
  }

  const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

  function extractFlyableDate(remarks) {
    if (!remarks) return null;
    const m = remarks.match(/flyable\s+on\s+(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{2,4})/i);
    if (!m) return null;
    const day = parseInt(m[1],10), mon = MONTHS[m[2].toLowerCase().slice(0,3)];
    if (!mon) return null;
    const yr = m[3].length===2 ? 2000+parseInt(m[3],10) : parseInt(m[3],10);
    return { display:`${day} ${m[2].slice(0,3)} ${yr}`, iso:`${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}` };
  }

  function normDate(s) {
    if (!s || s==='N/A') return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
    if (m) { const mon=MONTHS[m[2].toLowerCase().slice(0,3)]; if(!mon)return null; return `${m[3]}-${String(mon).padStart(2,'0')}-${String(parseInt(m[1],10)).padStart(2,'0')}`; }
    return null;
  }

  function parseCSVData(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length<3) return {meta:{},aircraft:[]};
    const r0 = parseCSVRow(lines[0]);
    const meta = { lastUpdate:r0[3]||'', updatedBy:r0[6]||'' };
    const aircraft = [];
    for (let i=2;i<lines.length;i++) {
      const f = parseCSVRow(lines[i]); if(!f[0]||!f[1]) continue;
      const toInt = s => { const x=parseInt(String(s).replace(/,/g,''),10); return isNaN(x)?null:x; };
      const rawRemarks = (f[11]||'').replace(/^\(|\)$/g,'').trim();
      const dueIn = parseDueIn(f[5]);
      aircraft.push({ item:f[0], reg:f[1], model:f[2]||'',
        flyable:(f[3]||'').toLowerCase()==='yes',
        lastFlight:f[4]||'', lastFlightIso:normDate(f[4]),
        dueInDisplay:dueIn.display, dueInHours:dueIn.totalHours,
        acCertDate:f[6]||'', acCertDays:toInt(f[7]),
        coaCertDate:f[8]||'', coaCertDays:toInt(f[9]),
        insurance:f[10]||'', remarks:rawRemarks,
        flyableDate:extractFlyableDate(rawRemarks) });
    }
    return { meta, aircraft };
  }

  function normCacheRecord(r) {
    const dueIn = parseDueIn(r.dueInHours||'');
    const raw = (r.maintenanceRemarks||'').replace(/^\(|\)$/g,'').trim();
    return { reg:r.registration, model:r.model||'', flyable:!!r.flyable,
      lastFlight:r.lastFlight||'', dueInDisplay:dueIn.display,
      acCertDate:r.aircraftCertExpiry||'', coaCertDate:r.coaCertExpiry||'',
      remarks:raw, flyableDate:extractFlyableDate(raw) };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function daysColor(d) {
    if (d===null) return 'var(--ink-4,#555)';
    if (d<0) return 'var(--col-cancel)';
    if (d<=60) return '#ff8c42';
    if (d<=120) return 'var(--col-pending)';
    return 'var(--col-done)';
  }
  const shortModel = m => m.replace('Diamond ','').replace('Robinson ','');

  function DaysCell({date,days}) {
    const col = daysColor(days);
    return (
      <td className="mono" style={{padding:'5px 8px',textAlign:'center',verticalAlign:'middle'}}>
        <div style={{fontSize:10,color:'var(--ink-3)'}}>{date||'—'}</div>
        {days!==null && <div style={{fontSize:10,color:col,fontWeight:700,marginTop:1}}>{days<0?`EXP (${days}d)`:`${days}d`}</div>}
      </td>
    );
  }

  // ── Cross-check diff cell — shows "ops val → maint val" when changed ──────
  // val: { ops, maint }  critical: bool  fmt: display formatter
  function DiffCell({ops, maint, critical, multiline}) {
    const changed = ops !== maint;
    const cellStyle = {padding:'6px 8px', verticalAlign:'middle'};
    if (!changed) {
      return <td className="mono" style={{...cellStyle,color:'var(--ink-4,#555)',fontSize:11}}>{maint||'—'}</td>;
    }
    const newCol = critical ? 'var(--col-cancel)' : 'var(--col-done)';
    return (
      <td className="mono" style={{...cellStyle}}>
        <div style={{fontSize:10,color:'var(--ink-4,#555)',textDecoration:'line-through',marginBottom:multiline?3:0}}>
          {ops||'—'}
        </div>
        <div style={{fontSize:11,color:newCol,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
          <span style={{fontSize:9,opacity:0.7}}>↳</span>{maint||'—'}
        </div>
      </td>
    );
  }

  function FlyableDiffCell({opsFly, maintFly}) {
    const changed = opsFly !== maintFly;
    const maintCol = maintFly ? 'var(--col-done)' : 'var(--col-cancel)';
    const opsCol   = opsFly  ? 'var(--col-done)' : 'var(--col-cancel)';
    const badge = (fly, col) => (
      <span className="mono uc" style={{fontSize:10,fontWeight:700,color:col,
        background:`color-mix(in oklch,${col} 15%,transparent)`,
        border:`1px solid ${col}`,borderRadius:4,padding:'2px 7px',whiteSpace:'nowrap'}}>
        {fly ? '✔ FLY' : '✘ GND'}
      </span>
    );
    if (!changed) {
      return (
        <td style={{padding:'6px 8px',textAlign:'center',opacity:0.5}}>
          {badge(maintFly, maintCol)}
        </td>
      );
    }
    return (
      <td style={{padding:'6px 8px',textAlign:'center'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            {badge(opsFly, opsCol)}
            <span style={{color:'var(--ink-3)',fontSize:12}}>→</span>
            {badge(maintFly, maintCol)}
          </div>
          {!maintFly && opsFly && <span className="mono uc" style={{fontSize:9,color:'var(--col-cancel)',fontWeight:700}}>⚠ grounded</span>}
          {maintFly && !opsFly && <span className="mono uc" style={{fontSize:9,color:'var(--col-done)',fontWeight:700}}>✓ restored</span>}
        </div>
      </td>
    );
  }

  // ── Main component ─────────────────────────────────────────────────────────
  function AircraftStatusView() {
    const [liveData,  setLiveData]  = useState(null);
    const [cacheData, setCacheData] = useState(null);
    const [liveError, setLiveError] = useState(null);
    const [cacheError,setCacheError]= useState(null);
    const [loading,   setLoading]   = useState(true);
    const [lastFetch, setLastFetch] = useState(null);
    const [tab,       setTab]       = useState('status');

    // Shared filters — used by both Status and Cross-Check tabs
    const [filterModels,  setFilterModels]  = useState(DEFAULT_MODELS);
    const [filterFlyable, setFilterFlyable] = useState('All');

    // Status tab sort
    const [sortCol, setSortCol] = useState('item');
    const [sortAsc, setSortAsc] = useState(true);

    // Cross-check severity filter
    const [xFilter, setXFilter] = useState('changed');  // 'all' | 'changed' | 'critical'

    const loadLive = useCallback(async () => {
      setLoading(true);
      try {
        const res = await fetch(CSV_URL); if(!res.ok) throw new Error(`HTTP ${res.status}`);
        setLiveData(parseCSVData(await res.text())); setLastFetch(Date.now()); setLiveError(null);
      } catch(e) { setLiveError(e.message); } finally { setLoading(false); }
    }, []);

    const loadCache = useCallback(async () => {
      try {
        const res = await fetch(CACHE_URL); if(!res.ok) throw new Error(`HTTP ${res.status}`);
        setCacheData((await res.json()).map(normCacheRecord)); setCacheError(null);
      } catch(e) { setCacheError(e.message); }
    }, []);

    useEffect(() => { loadLive(); loadCache(); }, [loadLive, loadCache]);
    useEffect(() => { const t = setInterval(loadLive, 5*60*1000); return () => clearInterval(t); }, [loadLive]);

    const toggleModel = m => setFilterModels(prev =>
      m==='All' ? [] : prev.includes(m) ? prev.filter(x=>x!==m) : [...prev,m]);

    // ── Derived data ──────────────────────────────────────────────────────────
    const { models, filteredStatus, stats } = useMemo(() => {
      if (!liveData) return {models:[],filteredStatus:[],stats:{}};
      const ac = liveData.aircraft;
      const models = [...new Set(ac.map(a=>a.model))];
      let filtered = ac;
      if (filterModels.length>0) filtered = filtered.filter(a=>filterModels.includes(a.model));
      if (filterFlyable==='Flyable')  filtered = filtered.filter(a=>a.flyable);
      if (filterFlyable==='Grounded') filtered = filtered.filter(a=>!a.flyable);
      filtered = [...filtered].sort((a,b) => {
        let va,vb;
        if (['acCertDays','coaCertDays'].includes(sortCol)) { va=a[sortCol]??9999; vb=b[sortCol]??9999; }
        else if (sortCol==='flyable')       { va=a.flyable?0:1;          vb=b.flyable?0:1; }
        else if (sortCol==='dueInHours')    { va=a.dueInHours??9999;      vb=b.dueInHours??9999; }
        else if (sortCol==='flyableDate')   { va=a.flyableDate?.iso||'9999'; vb=b.flyableDate?.iso||'9999'; }
        else if (sortCol==='lastFlightIso') { va=a.lastFlightIso||'';    vb=b.lastFlightIso||''; }
        else { va=String(a[sortCol]||''); vb=String(b[sortCol]||''); }
        return va<vb?(sortAsc?-1:1):va>vb?(sortAsc?1:-1):0;
      });
      const flyable  = ac.filter(a=>a.flyable).length;
      const expiring = ac.filter(a=>(a.acCertDays!==null&&a.acCertDays>=0&&a.acCertDays<=60)||(a.coaCertDays!==null&&a.coaCertDays>=0&&a.coaCertDays<=60)).length;
      const stats = { total:ac.length, flyable, grounded:ac.length-flyable, expiring,
        byModel:models.map(m=>({model:m,total:ac.filter(a=>a.model===m).length,flyable:ac.filter(a=>a.model===m&&a.flyable).length})) };
      return {models,filteredStatus:filtered,stats};
    }, [liveData,filterModels,filterFlyable,sortCol,sortAsc]);

    // Cross-check rows — one per aircraft, same model+flyable filter as Status tab
    const { xRows, xSummary } = useMemo(() => {
      if (!liveData||!cacheData) return {xRows:[],xSummary:{critical:0,changed:0,total:0}};
      const cacheMap = Object.fromEntries(cacheData.map(r=>[r.reg,r]));

      // Apply same filters as Status tab (scope to what the user is looking at)
      let ac = liveData.aircraft;
      if (filterModels.length>0) ac = ac.filter(a=>filterModels.includes(a.model));
      if (filterFlyable==='Flyable')  ac = ac.filter(a=>a.flyable);
      if (filterFlyable==='Grounded') ac = ac.filter(a=>!a.flyable);

      const rows = ac.map(live => {
        const ops = cacheMap[live.reg];
        if (!ops) return { live, ops:null, flyableChanged:false, changedFields:[], diffCount:1, missingFromOps:true };

        const flyableChanged = ops.flyable !== live.flyable;
        const changedFields = [];
        if (ops.lastFlight   !== live.lastFlight)   changedFields.push('lastFlight');
        if (ops.dueInDisplay !== live.dueInDisplay)  changedFields.push('dueIn');
        if (ops.acCertDate   !== live.acCertDate)   changedFields.push('acCert');
        if (ops.coaCertDate  !== live.coaCertDate)  changedFields.push('coaCert');
        // Remarks: compare normalized (no wrapping parens, trimmed)
        const opR  = ops.remarks.toLowerCase().replace(/\s+/g,' ').trim();
        const mnR  = live.remarks.toLowerCase().replace(/\s+/g,' ').trim();
        if (opR !== mnR) changedFields.push('remarks');
        // Est flyable date
        const opFD = ops.flyableDate?.iso||''; const mnFD = live.flyableDate?.iso||'';
        if (opFD !== mnFD) changedFields.push('flyableDate');

        return { live, ops, flyableChanged, changedFields, diffCount: (flyableChanged?1:0)+changedFields.length, missingFromOps:false };
      });

      // Sort: critical first, then most changes, then in-sync
      rows.sort((a,b) => {
        if (a.flyableChanged !== b.flyableChanged) return a.flyableChanged?-1:1;
        return b.diffCount - a.diffCount;
      });

      const changed  = rows.filter(r=>r.flyableChanged||r.changedFields.length>0||r.missingFromOps);
      const critical = rows.filter(r=>r.flyableChanged||r.missingFromOps);
      const xSummary = {total:rows.length, changed:changed.length, critical:critical.length};

      let xRows = rows;
      if (xFilter==='critical') xRows = critical;
      else if (xFilter==='changed') xRows = changed;

      return {xRows, xSummary};
    }, [liveData,cacheData,filterModels,filterFlyable,xFilter]);

    const onSort = col => { if(sortCol===col)setSortAsc(a=>!a); else{setSortCol(col);setSortAsc(true);} };
    const SortH = ({col,children,align}) => {
      const active = sortCol===col;
      return <th className="mono uc" onClick={()=>onSort(col)} style={{padding:'6px 8px',textAlign:align||'left',fontSize:9,color:active?'var(--highlight)':'var(--ink-3)',fontWeight:600,borderBottom:'1px solid var(--line)',whiteSpace:'nowrap',position:'sticky',top:0,background:'var(--bg-2)',cursor:'pointer',userSelect:'none'}}>{children}{active?(sortAsc?' ▲':' ▼'):''}</th>;
    };

    if (loading&&!liveData) return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--ink-3)'}}>
        <div className="mono" style={{textAlign:'center'}}><div style={{fontSize:32,marginBottom:10}}>✦</div><div>Loading aircraft status…</div></div>
      </div>
    );
    if (liveError&&!liveData) return (
      <div style={{padding:24}}>
        <div className="mono" style={{color:'var(--col-cancel)',marginBottom:12}}>Failed to load: {liveError}</div>
        <button className="chip" onClick={loadLive}>Retry</button>
      </div>
    );

    const allModelsSelected = filterModels.length===0;
    const today = typeof localToday==='function' ? localToday() : new Date().toISOString().slice(0,10);

    // ── Tab label for cross-check ─────────────────────────────────────────────
    const xTabLabel = !cacheData ? 'Cross-Check'
      : xSummary.critical>0 ? `Cross-Check · ⚠ ${xSummary.critical} critical`
      : xSummary.changed>0  ? `Cross-Check · ${xSummary.changed} changed`
      : 'Cross-Check · ✓ in sync';

    // ── Shared filter bar (used by both tabs) ─────────────────────────────────
    const FilterBar = () => (
      <div style={{flexShrink:0,padding:'6px 16px',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',borderBottom:'1px solid var(--line)',background:'var(--bg-2)'}}>
        <span className="mono uc" style={{fontSize:10,color:'var(--ink-3)'}}>Model:</span>
        <button className={'chip'+(allModelsSelected?' sel':'')} onClick={()=>setFilterModels([])} style={{fontSize:10,padding:'3px 8px'}}>All</button>
        {models.map(m=>(
          <button key={m} className={'chip'+(filterModels.includes(m)?' sel':'')} onClick={()=>toggleModel(m)} style={{fontSize:10,padding:'3px 8px'}}>{shortModel(m)}</button>
        ))}
        <div style={{width:1,background:'var(--line)',height:16,margin:'0 2px'}}/>
        {['All','Flyable','Grounded'].map(f=>(
          <button key={f} className={'chip'+(filterFlyable===f?' sel':'')} onClick={()=>setFilterFlyable(f)} style={{fontSize:10,padding:'3px 8px'}}>{f}</button>
        ))}
        <span className="mono" style={{marginLeft:'auto',fontSize:10,color:'var(--ink-3)'}}>
          {tab==='status' ? `${filteredStatus.length} aircraft` : `${xRows.length} aircraft`}
        </span>
      </div>
    );

    return (
      <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>

        {/* Header */}
        <div style={{flexShrink:0,padding:'10px 16px',background:'var(--bg-2)',borderBottom:'1px solid var(--line)',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div>
            <div className="head uc" style={{fontWeight:700,fontSize:15,letterSpacing:1}}>✦ CATC Aircraft Status</div>
            {liveData?.meta && (
              <div className="mono" style={{fontSize:10,color:'var(--ink-3)',marginTop:2}}>
                Maint. Sheet updated: <b style={{color:'var(--ink-2)'}}>{liveData.meta.lastUpdate}</b>
                {liveData.meta.updatedBy && <span> · By: {liveData.meta.updatedBy}</span>}
                {lastFetch && <span style={{marginLeft:8}}>· Fetched: <span style={{color:'var(--col-done)'}}>{new Date(lastFetch).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></span>}
                {cacheError && <span style={{marginLeft:8,color:'var(--col-cancel)'}}>· Ops cache error: {cacheError}</span>}
              </div>
            )}
          </div>
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
            {loading && <span className="mono" style={{fontSize:10,color:'var(--col-pending)'}}>⟳ refreshing…</span>}
            {liveError && <span className="mono" style={{fontSize:10,color:'var(--col-cancel)'}}>⚠ {liveError}</span>}
            <button className="chip" onClick={loadLive} disabled={loading}>⟳ Refresh</button>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{flexShrink:0,padding:'10px 16px',display:'flex',gap:10,flexWrap:'wrap',borderBottom:'1px solid var(--line)',alignItems:'stretch'}}>
          {[{val:stats.total,label:'Total',col:'var(--ink-1)',border:'var(--line)'},
            {val:stats.flyable,label:'Flyable',col:'var(--col-done)',border:'var(--col-done)'},
            {val:stats.grounded,label:'Grounded',col:'var(--col-cancel)',border:'var(--col-cancel)'},
            {val:stats.expiring,label:'≤60d cert',col:'#ff8c42',border:'#ff8c42'}].map(({val,label,col,border})=>(
            <div key={label} style={{background:'var(--surface)',border:`1px solid ${border}`,borderRadius:8,padding:'7px 14px',textAlign:'center',minWidth:64}}>
              <div className="mono" style={{fontSize:22,fontWeight:700,color:col,lineHeight:1}}>{val}</div>
              <div className="mono uc" style={{fontSize:9,color:'var(--ink-3)',marginTop:3}}>{label}</div>
            </div>
          ))}
          <div style={{width:1,background:'var(--line)',alignSelf:'stretch',margin:'0 4px'}}/>
          {stats.byModel?.map(m=>(
            <div key={m.model} style={{background:'var(--surface)',border:'1px solid var(--line)',borderRadius:8,padding:'6px 12px',minWidth:90}}>
              <div className="mono" style={{fontSize:10,color:'var(--ink-2)',fontWeight:600,whiteSpace:'nowrap'}}>{shortModel(m.model)}</div>
              <div className="mono" style={{fontSize:12,marginTop:3}}>
                <span style={{color:'var(--col-done)',fontWeight:700}}>{m.flyable}</span>
                <span style={{color:'var(--ink-3)'}}> / {m.total}</span>
                <span className="uc" style={{color:'var(--ink-4,#555)',fontSize:9,marginLeft:4}}>fly</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{flexShrink:0,padding:'0 16px',background:'var(--bg-2)',borderBottom:'1px solid var(--line)',display:'flex',gap:0}}>
          {[{id:'status',label:'Status'},{id:'crosscheck',label:xTabLabel}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className="mono uc"
              style={{background:'none',border:'none',borderBottom:tab===t.id?'2px solid var(--highlight)':'2px solid transparent',
                color:tab===t.id?'var(--highlight)':'var(--ink-3)',fontSize:10.5,fontWeight:600,
                padding:'9px 14px',cursor:'pointer',letterSpacing:0.5}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Shared filter bar */}
        <FilterBar />

        {/* ════════════════════ STATUS TAB ════════════════════ */}
        {tab==='status' && (
          <div style={{flex:1,overflow:'auto',padding:'8px 16px'}}>
            <div style={{display:'flex',gap:16,marginBottom:8,flexWrap:'wrap'}}>
              {[{col:'var(--col-done)',label:'> 120 days'},{col:'var(--col-pending)',label:'61–120 days'},{col:'#ff8c42',label:'1–60 days'},{col:'var(--col-cancel)',label:'Expired'}].map(({col,label})=>(
                <div key={label} style={{display:'flex',alignItems:'center',gap:5}}>
                  <span style={{width:9,height:9,borderRadius:2,background:col,display:'inline-block',flexShrink:0}}/>
                  <span className="mono" style={{fontSize:10,color:'var(--ink-3)'}}>{label}</span>
                </div>
              ))}
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
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
                  <th className="mono uc" style={{padding:'6px 8px',fontSize:9,color:'var(--ink-3)',fontWeight:600,borderBottom:'1px solid var(--line)',whiteSpace:'nowrap',position:'sticky',top:0,background:'var(--bg-2)'}}>Insurance</th>
                  <SortH col="flyableDate">Est. Flyable</SortH>
                  <th className="mono uc" style={{padding:'6px 8px',fontSize:9,color:'var(--ink-3)',fontWeight:600,borderBottom:'1px solid var(--line)',position:'sticky',top:0,background:'var(--bg-2)'}}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredStatus.map((ac,i) => {
                  const rowBg = i%2===0?'transparent':'color-mix(in oklch,var(--surface) 50%,transparent)';
                  const flyCol = ac.flyable?'var(--col-done)':'var(--col-cancel)';
                  let flyDateCol='var(--col-done)';
                  if (ac.flyableDate) flyDateCol=ac.flyableDate.iso<today?'var(--col-cancel)':ac.flyableDate.iso<=today.slice(0,8)+'30'?'#ff8c42':'var(--col-done)';
                  return (
                    <tr key={ac.reg} style={{background:rowBg}}>
                      <td className="mono" style={{padding:'6px 8px',color:'var(--ink-3)',fontSize:11,textAlign:'center'}}>{ac.item}</td>
                      <td style={{padding:'6px 8px'}}><span className="mono" style={{color:'var(--highlight)',fontWeight:600,fontSize:13}}>{ac.reg}</span></td>
                      <td className="mono" style={{padding:'6px 8px',color:'var(--ink-2)',fontSize:11,whiteSpace:'nowrap'}}>{shortModel(ac.model)}</td>
                      <td style={{padding:'6px 8px',textAlign:'center'}}>
                        <span className="mono uc" style={{fontSize:10,fontWeight:700,color:flyCol,background:`color-mix(in oklch,${flyCol} 15%,transparent)`,border:`1px solid ${flyCol}`,borderRadius:4,padding:'2px 7px',whiteSpace:'nowrap'}}>
                          {ac.flyable?'✔ FLY':'✘ GND'}
                        </span>
                      </td>
                      <td className="mono" style={{padding:'6px 8px',color:'var(--ink-2)',fontSize:11,whiteSpace:'nowrap'}}>{ac.lastFlight||'—'}</td>
                      <td className="mono" style={{padding:'6px 8px',color:'var(--ink-2)',fontSize:11,whiteSpace:'nowrap',textAlign:'right'}}>{ac.dueInDisplay}</td>
                      <DaysCell date={ac.acCertDate} days={ac.acCertDays}/>
                      <DaysCell date={ac.coaCertDate} days={ac.coaCertDays}/>
                      <td className="mono" style={{padding:'6px 8px',color:'var(--ink-2)',fontSize:11,whiteSpace:'nowrap'}}>{ac.insurance||'—'}</td>
                      <td style={{padding:'6px 8px',textAlign:'center',whiteSpace:'nowrap'}}>
                        {ac.flyableDate
                          ? <span className="mono" style={{fontSize:11,fontWeight:700,color:flyDateCol}}>{ac.flyableDate.display}</span>
                          : ac.flyable
                            ? <span className="mono" style={{fontSize:10,color:'var(--col-done)'}}>Ready</span>
                            : <span className="mono" style={{fontSize:10,color:'var(--ink-4,#555)'}}>—</span>}
                      </td>
                      <td style={{padding:'6px 8px',maxWidth:200}}>
                        {ac.remarks && <span className="mono" style={{fontSize:10,color:'var(--ink-3)',lineHeight:1.5,display:'block'}}>{ac.remarks}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ════════════════════ CROSS-CHECK TAB ════════════════════ */}
        {tab==='crosscheck' && (
          <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>

            {/* Severity filter + summary + source legend */}
            <div style={{flexShrink:0,padding:'8px 16px',display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',borderBottom:'1px solid var(--line)',background:'var(--bg-2)'}}>
              {/* Source labels */}
              <div style={{display:'flex',gap:16}}>
                <div className="mono" style={{fontSize:10}}>
                  <span style={{color:'var(--ink-3)'}}>Operations: </span>
                  <span style={{color:'var(--ink-2)'}}>local snapshot</span>
                </div>
                <div style={{color:'var(--ink-4,#555)',fontSize:12}}>vs</div>
                <div className="mono" style={{fontSize:10}}>
                  <span style={{color:'var(--ink-3)'}}>Maint. Sheet: </span>
                  <span style={{color:'var(--col-done)'}}>{liveData?.meta?.lastUpdate||'—'}</span>
                </div>
              </div>

              <div style={{display:'flex',gap:8,alignItems:'center',marginLeft:'auto'}}>
                {[{id:'critical',label:'Critical'},{id:'changed',label:'Changed'},{id:'all',label:'All'}].map(f=>(
                  <button key={f.id} className={'chip'+(xFilter===f.id?' sel':'')} onClick={()=>setXFilter(f.id)} style={{fontSize:10,padding:'3px 8px'}}>{f.label}</button>
                ))}
                {cacheData && (
                  <div style={{display:'flex',gap:16,marginLeft:8}}>
                    {[{val:xSummary.critical,label:'Critical',col:'var(--col-cancel)'},
                      {val:xSummary.changed, label:'Changed', col:'var(--col-pending)'},
                      {val:xSummary.total,   label:'Total',   col:'var(--ink-3)'}].map(({val,label,col})=>(
                      <div key={label} className="mono" style={{textAlign:'center'}}>
                        <div style={{fontSize:17,fontWeight:700,color:col,lineHeight:1}}>{val}</div>
                        <div className="uc" style={{fontSize:9,color:'var(--ink-4,#555)'}}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!cacheData ? (
              <div style={{padding:24}}>
                {cacheError
                  ? <div className="mono" style={{color:'var(--col-cancel)'}}>Failed to load ops data: {cacheError} <button className="chip" onClick={loadCache} style={{marginLeft:12}}>Retry</button></div>
                  : <div className="mono" style={{color:'var(--ink-3)'}}>Loading ops data…</div>}
              </div>
            ) : (
              <div style={{flex:1,overflow:'auto',padding:'8px 16px'}}>
                {xRows.length===0 ? (
                  <div className="mono" style={{color:'var(--col-done)',padding:'32px',textAlign:'center',fontSize:13}}>
                    ✓ All aircraft are in sync between Operations and Maintenance Sheet.
                  </div>
                ) : (
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr>
                        {/* Column headers */}
                        {['Registration','Flyable','Last Flight','Due In','Est. Flyable','Remarks'].map((h,hi)=>(
                          <th key={h} className="mono uc" style={{padding:'6px 8px',textAlign:hi<=1?'left':'left',fontSize:9,color:'var(--ink-3)',fontWeight:600,borderBottom:'1px solid var(--line)',whiteSpace:'nowrap',position:'sticky',top:0,background:'var(--bg-2)'}}>
                            {h}
                          </th>
                        ))}
                        <th className="mono uc" style={{padding:'6px 8px',fontSize:9,color:'var(--ink-3)',fontWeight:600,borderBottom:'1px solid var(--line)',position:'sticky',top:0,background:'var(--bg-2)',textAlign:'right'}}>Δ</th>
                      </tr>
                      {/* Sub-header: which row is ops vs maint */}
                      <tr style={{background:'var(--bg-2)'}}>
                        <td style={{padding:'2px 8px 5px',borderBottom:'1px solid var(--line)'}}/>
                        {['Flyable','Last Flight','Due In','Est. Flyable','Remarks'].map(h=>(
                          <td key={h} style={{padding:'2px 8px 5px',borderBottom:'1px solid var(--line)'}}>
                            <div className="mono" style={{fontSize:8,color:'var(--ink-4,#555)',lineHeight:1.4}}>
                              <span style={{textDecoration:'line-through'}}>Ops</span>
                              <span style={{margin:'0 3px',opacity:0.5}}>↳</span>
                              <span style={{color:'var(--ink-3)'}}>Maint.</span>
                            </div>
                          </td>
                        ))}
                        <td style={{padding:'2px 8px 5px',borderBottom:'1px solid var(--line)'}}/>
                      </tr>
                    </thead>
                    <tbody>
                      {xRows.map((row, ri) => {
                        const {live,ops,flyableChanged,changedFields,diffCount,missingFromOps} = row;
                        const rowTint = flyableChanged||missingFromOps
                          ? 'color-mix(in oklch,var(--col-cancel) 7%,transparent)'
                          : diffCount>0
                            ? 'color-mix(in oklch,var(--col-pending) 5%,transparent)'
                            : ri%2===0?'transparent':'color-mix(in oklch,var(--surface) 50%,transparent)';

                        const opsFlyDisp  = ops ? (ops.flyable?'YES':'NO')  : '—';
                        const maintFlyDisp= live.flyable?'YES':'NO';

                        return (
                          <tr key={live.reg} style={{background:rowTint,borderTop:'1px solid var(--line)'}}>
                            {/* Registration */}
                            <td style={{padding:'8px 8px',verticalAlign:'middle'}}>
                              <div>
                                <span className="mono" style={{color:'var(--highlight)',fontWeight:600,fontSize:13}}>{live.reg}</span>
                                <div className="mono" style={{fontSize:10,color:'var(--ink-3)',marginTop:2}}>{shortModel(live.model)}</div>
                              </div>
                            </td>

                            {/* Flyable diff */}
                            <FlyableDiffCell opsFlyable={ops?ops.flyable:null} maintFlyable={live.flyable}/>

                            {/* Last Flight */}
                            <DiffCell
                              ops={ops?.lastFlight||'—'}
                              maint={live.lastFlight||'—'}
                              critical={false}/>

                            {/* Due In */}
                            <DiffCell
                              ops={ops?.dueInDisplay||'—'}
                              maint={live.dueInDisplay||'—'}
                              critical={false}/>

                            {/* Est. Flyable date */}
                            <DiffCell
                              ops={ops?.flyableDate?.display||'—'}
                              maint={live.flyableDate?.display||'—'}
                              critical={false}/>

                            {/* Remarks */}
                            <DiffCell
                              ops={ops?.remarks||'—'}
                              maint={live.remarks||'—'}
                              critical={false}
                              multiline={true}/>

                            {/* Δ summary */}
                            <td style={{padding:'8px 8px',textAlign:'right',whiteSpace:'nowrap',verticalAlign:'middle'}}>
                              {missingFromOps ? (
                                <span className="mono uc" style={{fontSize:9,color:'var(--col-pending)',border:'1px solid var(--col-pending)',borderRadius:4,padding:'2px 6px'}}>new</span>
                              ) : flyableChanged ? (
                                <span className="mono uc" style={{fontSize:9,color:'var(--col-cancel)',fontWeight:700,border:'1px solid var(--col-cancel)',borderRadius:4,padding:'2px 6px'}}>⚠ flyable</span>
                              ) : diffCount>0 ? (
                                <span className="mono" style={{fontSize:9,color:'var(--col-pending)',border:'1px solid var(--col-pending)',borderRadius:4,padding:'2px 6px'}}>{diffCount} change{diffCount!==1?'s':''}</span>
                              ) : (
                                <span className="mono" style={{fontSize:9,color:'var(--col-done)',opacity:0.6}}>✓ sync</span>
                              )}
                            </td>
                          </tr>
                        );
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
