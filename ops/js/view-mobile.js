// Mobile companion — agenda / kanban / cal
const { useState: useS_m, useMemo: useM_m } = React;

function MobileBoard() {
  const app = useApp();
  const [tab, setTab]           = useS_m('agenda');
  const [settings, setSettings] = useS_m(false);
  const flights = app.dayFlights;
  const { wd, mo, day } = fmtDay(app.date);

  return (
    <ArtboardShell style={{ display:'flex', flexDirection:'column' }}>
      <ThemeStyle/>
      {/* Status bar */}
      <div className="mono num" style={{ height:28, padding:'0 18px', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, background:'var(--bg-2)' }}>
        <span>9:41</span>
        <span style={{ display:'flex',gap:5 }}>●●● ◉ ▮▮</span>
      </div>

      {/* Header */}
      <div style={{ padding:'12px 18px 8px', borderBottom:'1px solid var(--line-soft)', display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
        <div>
          <div className="mono uc" style={{ fontSize:9, color:'var(--ink-3)' }}>{wd}DAY</div>
          <div style={{ fontSize:24, fontWeight:600, lineHeight:1.05 }}>
            {String(day).padStart(2,'0')} <span style={{ color:'var(--ink-3)', fontSize:14 }}>{mo}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div className="mono uc" style={{
            padding:'4px 10px', fontSize:10, borderRadius:4,
            background:'var(--surface)', color:'var(--ink-2)', border:'1px solid var(--line)',
          }}>{flights.length} FLT</div>
          <button onClick={()=>setSettings(v=>!v)} style={{
            width:32, height:32, borderRadius:6, border:`1px solid ${settings?'var(--col-pending)':'var(--line)'}`,
            background:settings?'color-mix(in oklch,var(--col-pending) 14%,var(--surface))':'var(--surface)',
            color:settings?'var(--col-pending)':'var(--ink-2)', cursor:'pointer', fontSize:14,
          }}>⚙</button>
        </div>
      </div>

      {/* Date strip */}
      <div style={{ padding:'8px 14px', overflowX:'auto', flexShrink:0 }}>
        <DateStrip compact/>
      </div>

      {/* Tab bar */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', margin:'0 18px', padding:3, borderRadius:8, background:'var(--surface)', border:'1px solid var(--line)', flexShrink:0 }}>
        {[['agenda','AGENDA'],['kanban','KANBAN'],['cal','CAL']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className="mono uc"
            style={{ padding:'7px 4px', fontSize:10, borderRadius:6, cursor:'pointer', border:'none',
              background:tab===k?'var(--bg-2)':'transparent',
              color:tab===k?'var(--ink)':'var(--ink-3)', fontWeight:tab===k?600:400 }}>{l}</button>
        ))}
      </div>

      {/* Quick search */}
      <div style={{ padding:'8px 18px 4px', flexShrink:0 }}>
        <div style={{ position:'relative' }}>
          <input value={app.filters.search} onChange={e=>app.setFilters(f=>({...f,search:e.target.value}))}
            placeholder="Search student, lesson, tail…"
            style={{ width:'100%', background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--line)', borderRadius:6, padding:'7px 10px 7px 26px', fontSize:12, outline:'none', fontFamily:'inherit', boxSizing:'border-box' }}/>
          <span style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--ink-3)' }}>⌕</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {tab==='agenda'  && <AgendaTab  flights={flights}/>}
        {tab==='kanban'  && <KanbanTab  flights={flights}/>}
        {tab==='cal'     && <CalendarTab/>}
      </div>

      {/* Bottom nav */}
      <div style={{ padding:'8px 0 14px', borderTop:'1px solid var(--line-soft)', display:'grid', gridTemplateColumns:'repeat(4,1fr)', background:'var(--bg-2)', flexShrink:0 }}>
        {[['◇','BOARD'],['▤','LIST'],['◷','PILOTS'],['◉','ME']].map(([g,l],i)=>(
          <div key={i} className="mono uc" style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:3,color:i===0?'var(--col-pending)':'var(--ink-3)',fontSize:9 }}>
            <span style={{ fontSize:14,lineHeight:1 }}>{g}</span><span>{l}</span>
          </div>
        ))}
      </div>

      {/* Settings bottom sheet */}
      {settings && (
        <div onClick={()=>setSettings(false)} style={{ position:'absolute',inset:0,background:'oklch(0 0 0 / 0.35)',display:'flex',alignItems:'flex-end',zIndex:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'100%',background:'var(--surface)',borderRadius:'14px 14px 0 0',padding:'16px 18px 24px',display:'flex',flexDirection:'column',gap:14 }}>
            <div style={{ width:36,height:4,borderRadius:999,background:'var(--line)',margin:'0 auto 4px' }}/>
            <div className="mono uc" style={{ fontSize:9,color:'var(--ink-3)' }}>SETTINGS</div>
            <SettingRow label="THEME">
              {['cockpit','light','board'].map(th=>(
                <MiniChip key={th} on={app.tweaks.theme===th} onClick={()=>app.setTweak('theme',th)}>{th}</MiniChip>
              ))}
            </SettingRow>
            <SettingRow label="AP-127 FOCUS">
              <MiniChip on={app.highlightAP127} onClick={()=>app.setHighlightAP127(v=>!v)} color="var(--highlight)">
                {app.highlightAP127?'ON':'OFF'}
              </MiniChip>
            </SettingRow>
            <SettingRow label="SHOW SIM">
              <MiniChip on={app.tweaks.showSim} onClick={()=>app.setTweak('showSim',!app.tweaks.showSim)} color="var(--col-sim)">
                {app.tweaks.showSim?'YES':'NO'}
              </MiniChip>
            </SettingRow>
            <SettingRow label="SHOW STANDBY">
              <MiniChip on={app.tweaks.showStandby} onClick={()=>app.setTweak('showStandby',!app.tweaks.showStandby)} color="var(--col-stby)">
                {app.tweaks.showStandby?'YES':'NO'}
              </MiniChip>
            </SettingRow>
          </div>
        </div>
      )}

      <Drawer/>
    </ArtboardShell>
  );
}

function SettingRow({ label, children }) {
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
      <span className="mono uc" style={{ fontSize:10,color:'var(--ink-2)' }}>{label}</span>
      <div style={{ display:'flex',gap:6 }}>{children}</div>
    </div>
  );
}
function MiniChip({ on, onClick, children, color='var(--ink-2)' }) {
  return (
    <button onClick={onClick} className="mono uc" style={{
      padding:'5px 12px', fontSize:10, borderRadius:4, cursor:'pointer',
      border:`1px solid ${on?color:'var(--line)'}`,
      background:on?`color-mix(in oklch,${color} 14%,var(--surface))`:'transparent',
      color:on?color:'var(--ink-3)', fontWeight:on?600:400,
    }}>{children}</button>
  );
}

function AgendaTab({ flights }) {
  const app = useApp();
  const sorted = useM_m(()=>[...flights].sort((a,b)=>(minutesOf(a.start)||0)-(minutesOf(b.start)||0)),[flights]);
  const buckets = useM_m(()=>{
    const b={'EARLY':[],'MID-MORNING':[],'AFTERNOON':[],'EVENING':[]};
    sorted.forEach(f=>{ const m=minutesOf(f.start)||0; if(m<9*60)b['EARLY'].push(f); else if(m<13*60)b['MID-MORNING'].push(f); else if(m<17*60)b['AFTERNOON'].push(f); else b['EVENING'].push(f); });
    return b;
  },[sorted]);
  return (
    <div style={{ overflowY:'auto',flex:1,padding:'4px 14px 14px' }}>
      {Object.entries(buckets).map(([k,list])=>list.length===0?null:(
        <div key={k} style={{ marginBottom:12 }}>
          <div className="mono uc" style={{ fontSize:9,color:'var(--ink-3)',padding:'8px 4px 6px',display:'flex',justifyContent:'space-between' }}>
            <span>{k}</span><span>{list.length}</span>
          </div>
          {list.map(f=><AgendaCard key={f.id} f={f} onClick={()=>app.setDrawer(f.id)} hlOn={app.highlightAP127}/>)}
        </div>
      ))}
      {sorted.length===0&&<div className="mono uc" style={{ padding:40,textAlign:'center',color:'var(--ink-3)',fontSize:10 }}>No flights match.</div>}
    </div>
  );
}

function AgendaCard({ f, onClick, hlOn }) {
  const color = STATUS_COLOR(f);
  const alpha = flightAlpha(f, hlOn);
  return (
    <button onClick={onClick} style={{
      width:'100%', textAlign:'left', position:'relative',
      padding:'10px 12px 10px 14px', marginBottom:6,
      background:'var(--surface)', border:'1px solid var(--line)',
      borderLeft:`3px solid ${color}`, borderRadius:8, cursor:'pointer',
      color:'var(--ink)', display:'flex', flexDirection:'column', gap:5,
      opacity: f.status==='Canceled'?alpha*0.55:alpha,
    }}>
      <div style={{ display:'flex',alignItems:'baseline',gap:10 }}>
        <span className="mono num" style={{ fontSize:16,fontWeight:600 }}>{f.start}</span>
        <span className="mono" style={{ fontSize:10,color:'var(--ink-3)' }}>→ {f.end}</span>
        <span style={{flex:1}}/>
        <StatusPill status={f.status}/>
      </div>
      <div style={{ fontSize:13,fontWeight:500,lineHeight:1.2 }}>{f.student||'—'}</div>
      <div style={{ display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' }}>
        <FlightDot f={f}/>
        <span className="mono uc" style={{ fontSize:9,color:f.batch===HIGHLIGHT_BATCH?'var(--highlight)':'var(--ink-2)',fontWeight:f.batch===HIGHLIGHT_BATCH?600:500 }}>{f.batch}</span>
        <span className="mono" style={{ fontSize:9,color:'var(--ink-3)' }}>· {f.lesson}</span>
        {f.isStandby&&<StandbyTag/>}
        <span style={{flex:1}}/>
        <span className="mono" style={{ fontSize:9,padding:'1px 6px',borderRadius:3,background:'var(--bg-2)',border:'1px solid var(--line)',color:'var(--ink-2)' }}>{f.tail||'TBD'}</span>
      </div>
      {f.cond&&<ConditionTag cond={f.cond}/>}
    </button>
  );
}

function KanbanTab({ flights }) {
  const app = useApp();
  return (
    <div style={{ flex:1,display:'flex',gap:8,overflowX:'auto',padding:'6px 14px 14px',scrollSnapType:'x mandatory' }}>
      {['Pending','Completed','Canceled'].map(c=>{
        const list = flights.filter(f=>f.status===c).sort((a,b)=>(minutesOf(a.start)||0)-(minutesOf(b.start)||0));
        const col  = STATUS[c].fg;
        return (
          <div key={c} style={{ minWidth:230,scrollSnapAlign:'start',background:'var(--surface)',border:'1px solid var(--line)',borderTop:`2px solid ${col}`,borderRadius:8,display:'flex',flexDirection:'column',overflow:'hidden' }}>
            <div style={{ padding:'9px 12px',borderBottom:'1px solid var(--line)',display:'flex',justifyContent:'space-between' }}>
              <span className="mono uc" style={{ fontSize:10,color:col,fontWeight:600 }}>{STATUS[c].label}</span>
              <span className="mono num" style={{ fontSize:11,color:'var(--ink-3)' }}>{list.length}</span>
            </div>
            <div style={{ overflowY:'auto',flex:1,padding:8,display:'flex',flexDirection:'column',gap:5 }}>
              {list.map(f=>{
                const alpha=flightAlpha(f,app.highlightAP127);
                return (
                  <button key={f.id} onClick={()=>app.setDrawer(f.id)} style={{
                    textAlign:'left',padding:'8px 10px',position:'relative',
                    background:'var(--bg-2)',border:'1px solid var(--line)',
                    borderLeft:`2px solid ${STATUS_COLOR(f)}`,borderRadius:6,cursor:'pointer',
                    color:'var(--ink)',display:'flex',flexDirection:'column',gap:4,opacity:alpha,
                  }}>
                    <div className="mono num" style={{ fontSize:12,fontWeight:600 }}>{f.start} <span style={{ color:'var(--ink-3)',fontSize:9,fontWeight:400 }}>· {f.duration}</span></div>
                    <div style={{ fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{f.student||'—'}</div>
                    <div style={{ display:'flex',gap:6,alignItems:'center',flexWrap:'wrap' }}>
                      <FlightDot f={f}/>
                      <span className="mono uc" style={{ fontSize:9,color:f.batch===HIGHLIGHT_BATCH?'var(--highlight)':'var(--ink-3)' }}>{f.batch}</span>
                      {f.isStandby&&<StandbyTag/>}
                      <span style={{flex:1}}/>
                      <span className="mono" style={{ fontSize:9,color:'var(--ink-3)' }}>{f.tail||'TBD'}</span>
                    </div>
                  </button>
                );
              })}
              {list.length===0&&<div className="mono uc" style={{ padding:20,textAlign:'center',color:'var(--ink-3)',fontSize:9 }}>—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarTab() {
  const app=useApp();
  const year=2026, month=5;
  const first=new Date(Date.UTC(year,month-1,1));
  const firstWd=first.getUTCDay();
  const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  const counts={}, ap127counts={};
  FLIGHTS.forEach(f=>{ if(f.date.startsWith(`${year}-${String(month).padStart(2,'0')}`)){counts[f.date]=(counts[f.date]||0)+1;} });
  FLIGHTS.filter(f=>f.batch===HIGHLIGHT_BATCH).forEach(f=>{ ap127counts[f.date]=(ap127counts[f.date]||0)+1; });
  const cells=[];
  for(let i=0;i<firstWd;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  while(cells.length%7) cells.push(null);
  const today=new Date().toISOString().slice(0,10);
  return (
    <div style={{ padding:'8px 18px 14px',overflowY:'auto',flex:1 }}>
      <div className="mono uc" style={{ fontSize:10,color:'var(--ink-2)',padding:'4px 0 8px',display:'flex',justifyContent:'space-between' }}>
        <span>MAY 2026</span>
        <span style={{color:'var(--ink-3)'}}>{Object.values(counts).reduce((a,b)=>a+b,0)} FLT</span>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4 }}>
        {['S','M','T','W','T','F','S'].map((w,i)=>(
          <div key={i} className="mono uc" style={{ fontSize:9,color:'var(--ink-3)',textAlign:'center',padding:'4px 0' }}>{w}</div>
        ))}
        {cells.map((d,i)=>{
          if(d===null) return <div key={i}/>;
          const ds=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const c=counts[ds]||0, a=ap127counts[ds]||0;
          const sel=ds===app.date, has=c>0, tod=ds===today, past=ds<today;
          return (
            <button key={i} onClick={()=>has&&app.setDate(ds)} disabled={!has}
              style={{
                aspectRatio:'1',background:sel?'color-mix(in oklch,var(--col-pending) 18%,var(--surface))':has?'var(--surface)':'transparent',
                border:`1px solid ${sel?'var(--col-pending)':tod?'var(--col-pending)':has?'var(--line)':'var(--line-soft)'}`,
                borderRadius:6,cursor:has?'pointer':'default',color:past&&!sel?'var(--ink-3)':'var(--ink)',
                opacity:past&&!sel?0.45:1,display:'flex',flexDirection:'column',padding:4,fontSize:10,
              }}>
              <span className="mono num" style={{ fontSize:11,fontWeight:500,alignSelf:'flex-start' }}>{d}</span>
              {has&&(
                <div style={{ marginTop:'auto',display:'flex',gap:2,alignItems:'center',justifyContent:'center',flexWrap:'wrap' }}>
                  {Array.from({length:Math.min(c,4)}).map((_,j)=>(
                    <span key={j} style={{ width:4,height:4,borderRadius:999,background:j<a?'var(--highlight)':'var(--col-pending)' }}/>
                  ))}
                  {c>4&&<span className="mono" style={{ fontSize:7,color:'var(--ink-3)' }}>+{c-4}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mono uc" style={{ display:'flex',gap:14,fontSize:9,color:'var(--ink-3)',marginTop:12 }}>
        <span style={{display:'flex',gap:5,alignItems:'center'}}><span style={{width:5,height:5,borderRadius:999,background:'var(--col-pending)'}}/>FLIGHT</span>
        <span style={{display:'flex',gap:5,alignItems:'center'}}><span style={{width:5,height:5,borderRadius:999,background:'var(--highlight)'}}/>AP-127</span>
      </div>
    </div>
  );
}

window.MobileBoard = MobileBoard;
