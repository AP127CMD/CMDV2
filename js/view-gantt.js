// Gantt timeline — rows = instructor / tail / batch
const { useMemo: useM_g, useState: useS_g, useEffect: useE_g, useRef: useR_g, useLayoutEffect: useLE_g } = React;

const DAY_FALLBACK_START = 6;  // used only when the day has no flights
const DAY_FALLBACK_END   = 18; // used only when the day has no flights
const EDGE_PAD_MIN       = 30; // breathing room added before first / after last flight

// Current time-of-day in Bangkok, expressed as minutes since midnight.
const bkkNowMin = () => {
  const n = new Date();
  const b = new Date(n.getTime() + (n.getTimezoneOffset() + 420) * 60000);
  return b.getUTCHours() * 60 + b.getUTCMinutes();
};

// Helper: detect non-flight activities (meetings, briefings, ground school)
const isMeetingFlt = f => /meeting|briefing|debrief|ground.school/i.test(f.lesson || '') || /meeting|recurrent/i.test(f.batch || '');
// Solo = any flight whose CONDITION (or lesson, as fallback) contains "solo"
// anywhere — covers "Solo", "Solo/Nav", "Night Solo", etc. The marker lives in
// f.cond in the flight feed (lesson rarely carries it).
const isSoloFlt = f => /solo/i.test(f.cond || '') || /solo/i.test(f.lesson || '');

// Set of all instructor names across full dataset (computed once)
const ALL_GANTT_FI_NAMES = new Set(FLIGHTS.map(f => f.instructor).filter(Boolean));

function GanttBoard() {
  const app      = useApp();
  const { isMobile } = app;
  const groupBy  = app.tweaks.groupBy || 'tail';
  const TRACK_LEFT  = isMobile ? 90  : 190;
  const TRACK_RIGHT = isMobile ? 64  : 180;
  const PX_PER_HOUR = 60; // minimum px per hour — drives horizontal scroll width

  // Override dayFlights: include ALL activity types (bypass showSim filter)
  const flights = useM_g(() => {
    const { date, filters, hideOthers, highlightAP127 } = app;
    return FLIGHTS.filter(x => {
      if (x.date !== date) return false;
      // intentionally omit showSim/showStandby filters — GANTT shows all activity types
      if (filters.batches     && !filters.batches.includes(x.batch))          return false;
      if (filters.instructors && !filters.instructors.includes(x.instructor))  return false;
      if (filters.tails       && !filters.tails.includes(x.tail))              return false;
      if (filters.statuses) {
        const matchStatus = filters.statuses.includes(x.status);
        const matchStby   = filters.statuses.includes('Standby') && x.isStandby;
        if (!matchStatus && !matchStby) return false;
      }
      if (hideOthers && highlightAP127 && !isAP127Batch(x.batch)) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [x.student, x.instructor, x.batch, x.lesson, x.tail, x.type].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [app.date, app.filters, app.hideOthers, app.highlightAP127]);

  // Timeline bounds fit the actual day: floor(first start) → ceil(last end), each
  // with EDGE_PAD_MIN of breathing room. No empty 06–08 / 12–18 dead space on a
  // light day. Falls back to a sensible default window when there are no flights.
  const { HOUR_START, hourEnd } = useM_g(() => {
    let minMin = Infinity, maxMin = -Infinity;
    flights.forEach(f => {
      const s = minutesOf(f.start), e = minutesOf(f.end);
      if (s != null) { minMin = Math.min(minMin, s); maxMin = Math.max(maxMin, e ?? s + (f.durMin || 60)); }
      if (e != null) maxMin = Math.max(maxMin, e);
    });
    if (minMin === Infinity) return { HOUR_START: DAY_FALLBACK_START, hourEnd: DAY_FALLBACK_END };
    const start = Math.max(0,  Math.floor((minMin - EDGE_PAD_MIN) / 60));
    const end   = Math.min(24, Math.ceil ((maxMin + EDGE_PAD_MIN) / 60));
    return { HOUR_START: start, hourEnd: Math.max(start + 1, end) };
  }, [flights]);
  const hourSpan = hourEnd - HOUR_START;

  // Responsive timeline: measure the viewport and shrink px/hour so the whole day
  // (head → end of every row) fits without horizontal scroll on narrow screens.
  // Only when even the floor won't fit does it fall back to scrolling.
  const scrollRef = useR_g(null);
  const [viewW, setViewW] = useS_g(0);
  useLE_g(() => {
    const el = scrollRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(es => { setViewW(es[0].contentRect.width); });
    ro.observe(el); setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const PX_FLOOR = isMobile ? 12 : 20;          // min px/hour before we allow scrolling
  const avail = viewW - TRACK_LEFT - TRACK_RIGHT;
  // Auto-fit px/hour: shrink the day to fit the viewport (clamped). On mobile keep a
  // readable floor so bar labels stay legible even if it means horizontal scroll.
  const fitPxPerHour = (viewW > 0 && hourSpan > 0)
    ? Math.max(isMobile ? 46 : PX_FLOOR, Math.min(90, avail / hourSpan))
    : PX_PER_HOUR;
  // Zoom override: null = follow auto-fit; a number = explicit px/hour (enables scroll).
  const [zoom, setZoom] = useS_g(null);
  const pxPerHour = zoom == null ? fitPxPerHour : zoom;
  const ZOOM_MIN = 8, ZOOM_MAX = 160, ZOOM_STEP = 1.4;
  const zoomBy = factor => setZoom(Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pxPerHour * factor))));
  const ZoomChip = ({ label, title, onClick, active }) => (
    <button onClick={onClick} title={title} className="mono uc" style={{
      padding:'2px 7px', fontSize:9, borderRadius:3, cursor:'pointer', minWidth:22,
      border:`1px solid ${active?'var(--ink-2)':'var(--line)'}`,
      background:active?`color-mix(in oklch,var(--ink-2) 14%,var(--surface))`:'transparent',
      color:active?'var(--ink-2)':'var(--ink-3)', fontWeight:active?600:400, transition:'all .1s',
    }}>{label}</button>
  );

  // "Now" marker — only when viewing today (Bangkok) and within the visible window.
  const isToday = app.date === bkkToday();
  const [nowMin, setNowMin] = useS_g(bkkNowMin());
  useE_g(() => {
    if (!isToday) return;
    setNowMin(bkkNowMin());
    const id = setInterval(() => setNowMin(bkkNowMin()), 60000);
    return () => clearInterval(id);
  }, [isToday]);
  const nowPct = (isToday && nowMin >= HOUR_START*60 && nowMin <= hourEnd*60)
    ? ((nowMin - HOUR_START*60) / (hourSpan*60)) * 100 : null;

  const rows = useM_g(()=>{
    const map = {};
    flights.forEach(f=>{
      const key = (groupBy==='instructor'?f.instructor:groupBy==='tail'?f.tail:f.batch)||'—';
      (map[key]||(map[key]=[])).push(f);

      // In instructor view: if the student is also a known FI, add this flight to their row too
      // (shows the FI is busy as a student pilot during this time)
      if (groupBy === 'instructor' && f.student && f.student !== key && ALL_GANTT_FI_NAMES.has(f.student)) {
        const fiKey = f.student;
        (map[fiKey]||(map[fiKey]=[])).push({ ...f, _asFiStudent: true });
      }
    });
    return Object.entries(map)
      .map(([k,v])=>({ key:k, flights:v.sort((a,b)=>(minutesOf(a.start)||0)-(minutesOf(b.start)||0)) }))
      .sort((a,b)=>{
        // Tail focus: sort by aircraft type first, then tail number alphabetically
        if (groupBy === 'tail') {
          const aType = a.flights[0]?.type || '';
          const bType = b.flights[0]?.type || '';
          if (aType !== bType) return aType.localeCompare(bType);
        }
        return a.key.localeCompare(b.key);
      });
  },[flights,groupBy]);

  const { wd, mo, day } = fmtDay(app.date);

  const GrpChip = ({ g, label }) => (
    <button onClick={()=>app.setTweak('groupBy',g)} className="mono uc" style={{
      padding:'2px 8px', fontSize:8, borderRadius:3, cursor:'pointer',
      border:`1px solid ${app.tweaks.groupBy===g?'var(--ink-2)':'var(--line)'}`,
      background:app.tweaks.groupBy===g?`color-mix(in oklch,var(--ink-2) 14%,var(--surface))`:'transparent',
      color:app.tweaks.groupBy===g?'var(--ink-2)':'var(--ink-3)',
      fontWeight:app.tweaks.groupBy===g?600:400, transition:'all .1s',
    }}>{label||g}</button>
  );

  return (
    <ArtboardShell style={{ display:'flex', flexDirection:'column' }}>
      <ThemeStyle/>
      {/* Header */}
      <div style={{ padding:'0 16px', borderBottom:'1px solid var(--line)', background:'var(--bg-2)', display:'flex', alignItems:'center', gap:8, flexShrink:0, minHeight:38, flexWrap:'wrap' }}>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <span style={{ width:8,height:8,borderRadius:999,background:'var(--col-pending)',boxShadow:'0 0 8px var(--col-pending)' }}/>
          <ViewIcon id="gantt" size={12} color="var(--ink-2)"/>
          <div className="mono uc" style={{ fontSize:11,fontWeight:600 }}>GANTT</div>
        </div>
        <div style={{ display:'flex',gap:4,alignItems:'center' }}>
          <span className="mono uc" style={{ fontSize:8,color:'var(--ink-3)' }}>FOCUS</span>
          <GrpChip g="tail" label="A/C"/>
          <GrpChip g="instructor"/>
          <GrpChip g="batch"/>
        </div>
        <div style={{ display:'flex',gap:3,alignItems:'center' }}>
          <span className="mono uc" style={{ fontSize:8,color:'var(--ink-3)' }}>ZOOM</span>
          <ZoomChip label="−" title="Zoom out" onClick={()=>zoomBy(1/ZOOM_STEP)}/>
          <ZoomChip label="FIT" title="Fit timeline to width" onClick={()=>setZoom(null)} active={zoom==null}/>
          <ZoomChip label="+" title="Zoom in" onClick={()=>zoomBy(ZOOM_STEP)}/>
        </div>
        <div style={{flex:1}}/>
        <FocusControls/>
        {!isMobile && <div className="mono num" style={{ fontSize:11,color:'var(--ink-3)' }}>{String(day).padStart(2,'0')} {mo} · {wd}</div>}
        <RefreshButton/>
        <LastUpdate/>
      </div>

      {/* Date + filter — shared canonical block */}
      <DateFilterRow/>

      {/* Timeline */}
      <div style={{ margin:'2px 6px 6px', flex:1, minHeight:0, border:'1px solid var(--line)', borderRadius:6, background:'var(--surface)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Single scroll viewport — scrolls both axes. On mobile the inner content
            gets a min-width so the timeline isn't cramped; the hour ruler stays
            pinned to the top and the label column stays pinned to the left while
            you swipe/scroll. (One scroll container is required for position:sticky
            to track the same scroll on both axes.) */}
        <div ref={scrollRef} style={{ flex:1, minHeight:0, overflow:'auto' }}>
          {/* Width fits the viewport (pxPerHour shrinks on narrow screens so head→end
              stay visible); only an extremely cramped viewport triggers scroll. */}
          <div style={{ minWidth: Math.round(TRACK_LEFT + TRACK_RIGHT + hourSpan * pxPerHour) }}>
            {/* Hour ruler — sticky to the top of the viewport */}
            <div style={{ display:'grid', gridTemplateColumns:`${TRACK_LEFT}px 1fr ${TRACK_RIGHT}px`, borderBottom:'1px solid var(--line)', background:'var(--bg-2)', position:'sticky', top:0, zIndex:4 }}>
              <div className="mono uc" style={{ padding:'9px 14px', fontSize:9, color:'var(--ink-3)',
                position:'sticky', left:0, zIndex:5, background:'var(--bg-2)' }}>
                {groupBy.toUpperCase()} · {rows.length}
              </div>
              <div style={{ position:'relative', height:34, overflow:'hidden' }}>
                {Array.from({length:hourSpan+1}).map((_,i)=>{
                  const h=HOUR_START+i;
                  const showLabel = !isMobile || h % 3 === 0;
                  return (
                    <div key={i} className="mono num" style={{
                      position:'absolute', left:`${(i/hourSpan)*100}%`, top:0, bottom:0,
                      borderLeft:i===0?'none':'1px solid var(--line-soft)',
                      paddingLeft:5, fontSize:isMobile?9:10, color:'var(--ink-3)', display:'flex', alignItems:'center',
                      whiteSpace:'nowrap',
                    }}>{showLabel ? `${h}` : ''}</div>
                  );
                })}
                {nowPct != null && (
                  <div style={{ position:'absolute', left:`${nowPct}%`, top:0, bottom:0, display:'flex', alignItems:'center', transform:'translateX(-1px)', pointerEvents:'none', zIndex:1 }}>
                    <div style={{ width:2, position:'absolute', top:0, bottom:0, background:'var(--highlight)', opacity:0.85 }}/>
                    <span className="mono uc" style={{ fontSize:7, fontWeight:700, color:'var(--highlight)', background:'var(--bg-2)', padding:'0 2px', marginLeft:3 }}>NOW</span>
                  </div>
                )}
              </div>
              <div className="mono uc" style={{ padding:'9px 14px', fontSize:9, color:'var(--ink-3)', borderLeft:'1px solid var(--line)' }}>
                {groupBy==='instructor' ? `DUTY ${HOUR_START}–${hourEnd}` : groupBy==='tail' ? 'A/C HRS' : 'BATCH HRS'}
              </div>
            </div>

            {/* Rows */}
            <div>
              {rows.map((r,ri)=>{
            const totalMin = r.flights.reduce((a,b)=>a+(b.durMin||0),0);
            const hasHL    = r.flights.some(f=>f.batch===HIGHLIGHT_BATCH);
            const rowAlpha = app.highlightAP127&&!hasHL ? 0.28 : 1;
            const dateLeaveMap = leavesOnDate(app.date);
            const rowOnLeave   = groupBy === 'instructor' && dateLeaveMap[r.key];
            const rowOnMaint   = groupBy === 'tail'       && isTailMaint(r.key);

            const rightMetric = (() => {
              if (groupBy === 'instructor') {
                const starts = r.flights.map(f=>minutesOf(f.start)).filter(v=>v!=null);
                const ends   = r.flights.map(f=>minutesOf(f.end)).filter(v=>v!=null);
                if (!starts.length) return { label:'DUTY', value:'—', sub:'' };
                const dutyMin = Math.max(...ends) - Math.min(...starts);
                const h = Math.floor(dutyMin/60), m = dutyMin%60;
                const firstStart = r.flights.reduce((a,b)=>(minutesOf(a.start)||9999)<(minutesOf(b.start)||9999)?a:b).start;
                const lastEnd    = r.flights.reduce((a,b)=>(minutesOf(a.end)||0)>(minutesOf(b.end)||0)?a:b).end;
                return { label:'DUTY', value:`${h}h${String(m).padStart(2,'0')}`, sub:`${firstStart}–${lastEnd}` };
              }
              const h = Math.floor(totalMin/60), m = totalMin%60;
              return { label: groupBy==='tail'?'A/C HRS':'FLT HRS', value:`${h}h${String(m).padStart(2,'0')}`, sub:`${r.flights.length} FLT` };
            })();

            // Overlap lanes: pack flights into sub-rows so overlapping schedules are
            // all visible and individually clickable (no stacked, unreachable bars).
            // When grouping by instructor, solo flights get their own lane band BELOW
            // the instructor's dual flights (they never share a lane with dual sorties).
            const isSoloRow = f => isSoloFlt(f) && !f._asFiStudent;
            const packLanes = list => {
              const ends = []; const map = new Map();
              [...list].sort((a,b)=>(minutesOf(a.start)||0)-(minutesOf(b.start)||0)).forEach(f=>{
                const s = minutesOf(f.start)||0;
                const e = minutesOf(f.end) || (s + (f.durMin||60));
                let lane = ends.findIndex(end => end <= s);
                if (lane === -1) { lane = ends.length; ends.push(e); }
                else ends[lane] = e;
                map.set(f, lane);
              });
              return { map, count: ends.length };
            };
            const splitSolo = groupBy === 'instructor';
            const dualList  = splitSolo ? r.flights.filter(f => !isSoloRow(f)) : r.flights;
            const soloList  = splitSolo ? r.flights.filter(f =>  isSoloRow(f)) : [];
            const dualPack  = packLanes(dualList);
            const soloPack  = packLanes(soloList);
            const dualLaneN = Math.max(splitSolo ? 0 : 1, dualPack.count);
            const flightLane = new Map();
            dualPack.map.forEach((lane, f) => flightLane.set(f, lane));
            soloPack.map.forEach((lane, f) => flightLane.set(f, dualLaneN + lane)); // offset below dual
            const laneCount = Math.max(1, dualLaneN + soloPack.count);
            const LANE_H = isMobile ? 30 : 48;
            const rowH   = Math.max(54, laneCount*LANE_H + 6);

            return (
              <div key={r.key} style={{
                display:'grid', gridTemplateColumns:`${TRACK_LEFT}px 1fr ${TRACK_RIGHT}px`,
                borderBottom:'1px solid var(--line-soft)', minHeight:rowH,
                background:ri%2?'transparent':'color-mix(in oklch,var(--ink) 1.2%,transparent)',
                opacity:rowAlpha, transition:'opacity .15s',
              }}>
                <div style={{ padding: isMobile?'4px 6px':'8px 10px', display:'flex', alignItems:'center', borderRight:'1px solid var(--line)', overflow:'hidden',
                  position:'sticky', left:0, zIndex:2, background:'var(--bg-2)' }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:isMobile?10:12, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      color: rowOnMaint ? 'var(--col-cancel)' : 'var(--ink)' }}>{r.key}</div>
                    <div style={{ display:'flex', gap:4, marginTop:2, flexWrap:'wrap' }}>
                      {rowOnMaint && <GndBadge/>}
                      {rowOnLeave && <LeaveBadge reason={rowOnLeave}/>}
                    </div>
                  </div>
                </div>
                <div style={{ position:'relative' }}>
                  {Array.from({length:hourSpan+1}).map((_,i)=>(
                    <div key={i} style={{ position:'absolute',left:`${(i/hourSpan)*100}%`,top:0,bottom:0,borderLeft:'1px solid var(--line-soft)',opacity:i%2?0.5:1 }}/>
                  ))}
                  {nowPct != null && (
                    <div style={{ position:'absolute', left:`${nowPct}%`, top:0, bottom:0, width:2,
                      background:'var(--highlight)', boxShadow:'0 0 6px var(--highlight)', opacity:0.85,
                      zIndex:0, pointerEvents:'none' }}/>
                  )}
                  {r.flights.map((f,fi)=>{
                    if (!f.start) return null;
                    const startMin  = (minutesOf(f.start)||0) - HOUR_START*60;
                    const totalSpan = hourSpan*60;
                    const left      = Math.max(0,(startMin/totalSpan)*100);
                    const width     = ((f.durMin||60)/totalSpan)*100;
                    const isFiSP    = !!f._asFiStudent;
                    const isMtg     = isMeetingFlt(f);
                    const isSolo    = !isFiSP && isSoloFlt(f);
                    // SOLO uses status color (dashed border marks it visually); SIM uses status color with dotted border.
                    const color     = isFiSP ? 'var(--col-stby)' : isMtg ? 'var(--ink-3)' : STATUS_COLOR(f);
                    const done      = f.status==='Completed';
                    const dim       = f.status==='Canceled';
                    const stby      = f.isStandby;
                    const dotted    = f.isSim && !isFiSP;           // SIM → dotted border, status color
                    const dashed    = !dotted && (stby||isFiSP||isSolo); // SOLO/STBY/FI-AS-SP → dashed
                    const lane      = flightLane.get(f) || 0;
                    // Short display labels
                    const shortBatch = (f.batch||'').replace('-','');  // "AP-127" → "AP127"
                    const shortTail  = f.tail ? f.tail[0]+f.tail.slice(-2) : 'TBD'; // "HS-TVG" → "HVG"
                    return (
                      <button key={f.id+fi+(isFiSP?'s':'')} onClick={()=>app.setDrawer(f.id)}
                        title={isFiSP
                          ? `${f.start}–${f.end} · ${f.student} flying as SP · instr: ${f.instructor} · ${f.lesson}`
                          : isSolo
                            ? `${f.start}–${f.end} · ${f.student||''} SOLO · ${f.lesson} · monitor: ${f.instructor||'—'}`
                            : `${f.start}–${f.end} · ${f.student||f.instructor||''} · ${f.lesson}`}
                        style={{
                          position:'absolute', left:`${left}%`, width:`calc(${width}% - 2px)`,
                          top: lane*LANE_H + 3, height: LANE_H - 6,
                          background:`color-mix(in oklch,${color} ${stby?8:isFiSP?10:18}%,var(--surface))`,
                          border:`${dotted?'1px dotted':dashed?'1px dashed':'1px solid'} ${color}`,
                          borderLeft:`3px ${dotted?'dotted':dashed?'dashed':'solid'} ${color}`,
                          borderRadius:4, padding:'2px 5px', textAlign:'left',
                          cursor:'pointer', overflow:'hidden', color:'var(--ink)',
                          opacity: dim?0.4:isFiSP?0.75:1,
                          textDecoration: dim?'line-through':'none',
                          zIndex: 1,
                        }}>
                        {/* Line 1 — SP name + status marker (no SOLO badge; dashed border marks solo) */}
                        <div style={{ display:'flex', alignItems:'center', gap:4, lineHeight:1.15 }}>
                          <span style={{ fontSize:isMobile?9:11, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, minWidth:0 }}>
                            {isMtg ? (f.lesson || f.batch || '—') : (f.student || f.instructor || '—')}
                          </span>
                          {isFiSP && <span style={{color:'var(--col-stby)',fontSize:7,fontWeight:600,flexShrink:0}}>AS SP</span>}
                          {!isFiSP && done && <span style={{color:'var(--col-done)',fontSize:9,flexShrink:0}}>✓</span>}
                          {!isFiSP && stby && <span style={{color:'var(--col-stby)',fontSize:8,flexShrink:0}}>STBY</span>}
                          {!isFiSP && isMtg && <span style={{color:'var(--ink-3)',fontSize:7,flexShrink:0}}>MTG</span>}
                        </div>
                        {/* Line 2 — short Batch · short A/C, always shown (incl. mobile) */}
                        <div className="mono uc" style={{ fontSize:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'flex',gap:4,alignItems:'center',marginTop:1 }}>
                          <span style={{color:f.batch===HIGHLIGHT_BATCH?'var(--highlight)':'var(--ink-3)',fontWeight:f.batch===HIGHLIGHT_BATCH?600:400}}>{shortBatch||'—'}</span>
                          <span style={{color:'var(--ink-3)'}}>·</span>
                          <span style={{color:isTailMaint(f.tail)?'var(--col-cancel)':'var(--ink-3)',fontWeight:isTailMaint(f.tail)?600:400}}>{shortTail}</span>
                          {isTailMaint(f.tail) && <GndBadge/>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ padding: isMobile?'6px 8px':'10px 14px',borderLeft:'1px solid var(--line)',display:'flex',flexDirection:'column',justifyContent:'center',gap:1 }}>
                  <div className="mono uc" style={{ fontSize:isMobile?7:8,color:'var(--ink-3)' }}>{rightMetric.label}</div>
                  <div className="mono num" style={{ fontSize:isMobile?11:14,fontWeight:600,color:'var(--ink)' }}>{rightMetric.value}</div>
                  {!isMobile && <div className="mono" style={{ fontSize:9,color:'var(--ink-3)' }}>{rightMetric.sub}</div>}
                </div>
              </div>
            );
          })}
          {rows.length===0&&(
            <div className="mono uc" style={{ padding:40,textAlign:'center',color:'var(--ink-3)',fontSize:10 }}>No flights match current filters.</div>
          )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mono uc" style={{ display:'flex',gap:10,padding:'7px 16px',fontSize:9,color:'var(--ink-3)',borderTop:'1px solid var(--line)',background:'var(--bg-2)',flexShrink:0,flexWrap:'wrap' }}>
          {[['PENDING','var(--col-pending)'],['COMPLETED','var(--col-done)'],['CANCELED','var(--col-cancel)'],['STANDBY','var(--col-stby)']].map(([l,c])=>(
            <span key={l} style={{ display:'flex',gap:5,alignItems:'center' }}>
              <span style={{ width:12,height:7,background:`color-mix(in oklch,${c} 20%,var(--surface))`,border:`1px ${l==='STANDBY'?'dashed':'solid'} ${c}`,borderRadius:2 }}/>
              {l}
            </span>
          ))}
          <span style={{ display:'flex',gap:5,alignItems:'center' }}>
            <span style={{ width:12,height:7,background:`color-mix(in oklch,var(--col-pending) 18%,var(--surface))`,border:'1px dotted var(--col-pending)',borderRadius:2 }}/>
            SIM
          </span>
          <span style={{ display:'flex',gap:5,alignItems:'center' }}>
            <span style={{ width:12,height:7,background:`color-mix(in oklch,var(--col-pending) 18%,var(--surface))`,border:'1px dashed var(--col-pending)',borderRadius:2 }}/>
            SOLO
          </span>
          <span style={{ display:'flex',gap:5,alignItems:'center' }}>
            <span style={{ width:12,height:7,background:`color-mix(in oklch,var(--col-stby) 10%,var(--surface))`,border:'1px dashed var(--col-stby)',borderRadius:2 }}/>
            FI AS SP
          </span>
          <span style={{ display:'flex',gap:5,alignItems:'center' }}>
            <span style={{ width:12,height:7,background:'color-mix(in oklch,var(--ink-3) 15%,var(--surface))',border:'1px solid var(--ink-3)',borderRadius:2 }}/>
            MTG/OTHER
          </span>
          <span style={{flex:1}}/>
          <span>CLICK A BAR FOR DETAILS</span>
        </div>
      </div>
      <Drawer/>
    </ArtboardShell>
  );
}

window.GanttBoard = GanttBoard;
