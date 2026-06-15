/* ============================================================================
 * AP127 V2 — Full NGT_001 admin-dashboard parity. Embeds AP127_NGT_001's proven
 * scheduler + render/chart logic VERBATIM (IIFE-scoped so its consts don't collide
 * with shared.js / view-cohort.js), mounted natively into React containers — no
 * iframe. Data = the full cache.json (all 4 batches + monthly + curricula) bundled
 * as window.NGT_CACHE and refreshed hourly. Surfaces three views the AP127-only
 * DashboardR1 lacked: Multi-batch Overview, School's Performance, Simulation.
 * See REVAMP.md §3B (extended) and the NGT_001 PROJECT.md.
 * ==========================================================================*/
(function () {
  // ---- module globals + scheduler config (from NGT_001 index.html) ----
  let G = null, SIM_G = null, SIM2_G = null, EXTRA_BATCHES = [], SIM2_EXTRA_BATCHES = [], AB = "ALL";
  const CHARTS = {};
  let CFG = { cap: 25, n129: 13, ap129start: "2026-06-01", horizon: 800, hourMode: false, weekendCap: 13, holidayCap: 13, _weAuto: true, _holAuto: true, recents: 3, upcomings: 8, showRest: true, showNextTag: true, cardH: 220, restReg: false, priority: null };
  let SIM2_CFG = { cap: 25, n129: 13, ap129start: "2026-06-01", horizon: 800, hourMode: false, weekendCap: 13, holidayCap: 13, _weAuto: true, _holAuto: true, restReg: false, priority: null, schedulingMode: 'balanced', batchWeights: { AP124: 1.0, AP126: 1.0, AP127: 1.0, AP129: 1.0 } };
  // ---- Simulation 3 ("Decision Cockpit") globals — realism engine + multi-scenario, fully isolated from SIM1/SIM2 ----
  let SIM3_G = null, SIM3_EXTRA_BATCHES = [], SIM3_SCENARIOS = [], SIM3_BASELINE_ID = null, SIM3_ACTIVE_ID = null;
  let SIM3_CFG = null;                 // live editing config (active scenario mirror); seeded lazily from data
  let SIM3_MC_RUNNING = false, SIM3_MC_TOKEN = 0;
  let SIM3_PRESENT = false, SIM3_NARR_STEP = 0, SIM3_COMPARE_TAB = 'cards', SIM3_BEFORE_AFTER = false;
  const SIM3_LS_KEY = 'ap127v2-sim3-scenarios-v1';
  const SIM3_WEATHER_DEFAULT = { 1:.10, 2:.10, 3:.10, 4:.10, 5:.25, 6:.25, 7:.25, 8:.40, 9:.40, 10:.20, 11:.10, 12:.10 };
  const SIM3_SCN_COLORS = ['#9ca3af','#34d399','#f59e0b','#60a5fa','#f472b6','#a78bfa','#22d3ee','#fb923c'];
  const SIM3_PRESETS = {
    '+2ac':    { label:'+2 Aircraft',  apply:c=>{ c.sim3.fleetSize += 2; } },
    '+3fi':    { label:'+3 Instructors', apply:c=>{ c.sim3.instructors += 3; } },
    'monsoon': { label:'Monsoon Hit',  apply:c=>{ Object.keys(c.sim3.weather).forEach(m=>{ c.sim3.weather[m] = Math.min(0.9, c.sim3.weather[m] + 0.15); }); } },
    'dryStart':{ label:'Dry-season Push', apply:c=>{ Object.keys(c.sim3.weather).forEach(m=>{ c.sim3.weather[m] = Math.max(0, c.sim3.weather[m] - 0.08); }); c.sim3.availability = Math.min(0.95, c.sim3.availability + 0.07); } },
  };
  function toast(msg) { try { console.log("[program]", msg); } catch (e) {} }

  // ======================= begin verbatim NGT_001 logic =======================
/* ===== NGT_001 constants ===== */
const AP127_NICKS=["A-VIT","A-SORN","A-RUT","B-SET","J-YU","K-PONG","K-YA","K-KORN","K-SEE","KRIT","M-PHAN","N-PON","N-KALP","N-PHAT","P-THAN","P-KORN","P-KUL","P-DET","S-SIT","S-KORN","S-WITCH","S-WAN","T-KORN","T-WAJ","V-PHON","W-PHOL","W-POL","W-PONG"];
const AP127_FI=["W-CHAI","P-YUTH","P-YA","S-TI","N-TORN","I-POL","SN-TI","S-TI","A-WAT","W-NU","K-POL","C-CHAI","P-YUTH","SN-TI","E-PHOB","K-POL","S-WAN","N-TORN","E-PHOB","I-POL","K-CHAI","K-CHAI","P-YA","S-WAN","C-CHAI","W-NU","W-CHAI","A-WAT"];
const AP127_SE=["DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-TDI"];
const HOL=new Set(["2026-05-01","2026-05-04","2026-05-13","2026-06-01","2026-06-03","2026-07-28","2026-07-29","2026-07-30","2026-08-12","2026-10-13","2026-10-23","2026-12-07","2026-12-10","2026-12-31"]);
const AP127_FI_FULL={"W-CHAI":"WUTTHICHAI L.","P-YUTH":"PHAHOLYUTH P.","P-YA":"PARINYA B.","S-TI":"SANTI SUK.","N-TORN":"NAPATTORN S.","I-POL":"ITTIPOL P.","SN-TI":"SANTI PO.","A-WAT":"THAWATANAN P.","W-NU":"WISANU T.","K-POL":"KOONPHOL U.","C-CHAI":"CHAROENCHAI U.","E-PHOB":"EKKAPHOP R.","S-WAN":"SOWAN C.","K-CHAI":"KITTICHAI C."};
// ##AP127NICKS_END##
const BC={AP124:"#4ba3f7",AP126:"#7acf7e",AP127:"#e88aff",AP129:"#e9bd63"};
const BB={AP124:"rgba(75,163,247,.12)",AP126:"rgba(122,207,126,.12)",AP127:"rgba(232,138,255,.12)",AP129:"rgba(233,189,99,.12)"};

// Register global plugin for "NOW" vertical line on simulation capacity chart
/* ===== NOW-line chart plugin ===== */
Chart.register({id:"catcNowLine",afterDraw(chart){
  const opts=chart.config?.options?.plugins?.catcNowLine;
  if(!opts?.enabled||opts.idx==null||opts.idx<0)return;
  const xScale=chart.scales?.x;if(!xScale)return;
  const x=xScale.getPixelForValue(opts.idx);
  const{top,bottom}=chart.chartArea;
  const ctx=chart.ctx;
  ctx.save();
  ctx.strokeStyle="rgba(255,255,255,0.22)";ctx.lineWidth=1.5;ctx.setLineDash([3,3]);
  ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
  ctx.fillStyle="rgba(255,255,255,0.38)";ctx.font="7px 'JetBrains Mono',monospace";
  ctx.fillText("NOW",x+3,top+10);
  ctx.restore();
}});
/* Register chartjs-plugin-datalabels for School Perf monthly + recent charts */
try { if(window.ChartDataLabels) Chart.register(window.ChartDataLabels); } catch(e){}
/* ===== stackTotalLabels — draws total value above each stacked bar ===== */
Chart.register({id:"stackTotalLabels",afterDraw(chart){
  const opts=chart.config?.options?.plugins?.stackTotalLabels;
  if(!opts?.enabled||!opts.totals)return;
  const{ctx,chartArea,scales:{x:xs,y:ys}}=chart;if(!xs||!ys)return;
  ctx.save();
  ctx.fillStyle=opts.color||'rgba(230,237,243,0.90)';
  ctx.font=`600 ${opts.fs||7}px 'JetBrains Mono',monospace`;
  ctx.textAlign='center';ctx.textBaseline='bottom';
  const fmt=opts.fmt;
  opts.totals.forEach((t,i)=>{
    if(!t)return;
    const x=xs.getPixelForValue(i);
    const y=Math.max(chartArea.top+9,ys.getPixelForValue(t))-(opts.gap||3);
    ctx.fillText(fmt?fmt(t):String(t),x,y);
  });
  ctx.restore();
}});
/* ===== EXTRA_COLORS + escHtml ===== */
const EXTRA_COLORS=['#a78bfa','#f472b6','#34d399','#60a5fa','#fbbf24','#f87171'];
function escHtml(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
/* ===== scheduler ===== */
function isWD(ds){const d=new Date(ds+"T12:00:00Z"),dw=d.getUTCDay();return dw!==0&&dw!==6&&!HOL.has(ds);}
function getWDs(s,n){const a=[];let d=new Date(s+"T12:00:00Z");while(a.length<n){const ds=d.toISOString().slice(0,10);if(isWD(ds))a.push(ds);d.setUTCDate(d.getUTCDate()+1);}return a;}
function getOpDays(s,n,weekendCap,holidayCap,weekdayCap){
  const a=[];let d=new Date(s+"T12:00:00Z");
  while(a.length<n){
    const ds=d.toISOString().slice(0,10);
    const dw=d.getUTCDay(),isWE=dw===0||dw===6,isHol=HOL.has(ds);
    let cap=weekdayCap;
    if(isHol)cap=holidayCap;
    else if(isWE)cap=weekendCap;
    if(cap>0)a.push({ds,cap,isWE,isHol});
    d.setUTCDate(d.getUTCDate()+1);
  }
  return a;
}

function priorityOrder(p){
  if(p==='ap126')       return['AP126','AP124','AP127'];
  if(p==='ap126_ap127') return['AP126','AP127','AP124'];
  if(p==='ap127')       return['AP127','AP124','AP126'];
  return['AP124','AP126','AP127'];
}
function allocateDaySlots(batches,totalSlots,hourMode){
  const active=batches.filter(b=>b.eligCount>0);
  if(!active.length)return{};
  const effW=active.map(b=>(b.weight||1)*b.n);
  const totalW=effW.reduce((s,w)=>s+w,0);
  if(!totalW){const share=totalSlots/active.length;const r={};active.forEach(b=>{r[b.key]=hourMode?share:Math.floor(share);});return r;}
  if(hourMode){const r={};active.forEach((b,i)=>{r[b.key]=(effW[i]/totalW)*totalSlots;});return r;}
  const exact=active.map((b,i)=>(effW[i]/totalW)*totalSlots);
  const floors=exact.map(Math.floor);
  let leftover=totalSlots-floors.reduce((s,f)=>s+f,0);
  exact.map((e,i)=>[e-floors[i],i]).sort((a,b)=>b[0]-a[0]).forEach(([,i])=>{if(leftover>0){floors[i]++;leftover--;}});
  const r={};active.forEach((b,i)=>{r[b.key]=floors[i];});return r;
}
function runScheduler(batchData,curricula,extraBatches=[],startDate="",hourMode=false,weekendCap=0,holidayCap=0,altCFG){
  const cfg=altCFG||CFG;const{cap,n129,ap129start,horizon}=cfg;
  const ops=getOpDays(startDate||"2026-05-05",horizon,weekendCap,holidayCap,cap);
  const wds=ops.map(o=>o.ds);
  const w129=wds.findIndex(d=>d>=ap129start);
  const cur129=curricula.AP127||curricula.AP126||[];
  // Compute virtual op-day index (negative) for last-flight date relative to ops[0]
  // so eligibility gaps are respected from the real last flight, not reset to -99
  function computeLwM(ld){
    if(!ld||!wds[0])return -99;
    let cnt=0,d=new Date(ld+"T12:00:00Z");
    d.setUTCDate(d.getUTCDate()+1);
    const end=new Date(wds[0]+"T12:00:00Z");
    while(d<=end&&cnt<=20){
      const ds=d.toISOString().slice(0,10);
      const dw=d.getUTCDay(),isWE=dw===0||dw===6,isHol=HOL.has(ds);
      let opCap=cap;if(isHol)opCap=holidayCap;else if(isWE)opCap=weekendCap;
      if(opCap>0)cnt++;
      d.setUTCDate(d.getUTCDate()+1);
    }
    return -cnt;
  }
  const iM={},lwM={},lmM={},schM={};
  ["AP124","AP126","AP127"].forEach(b=>{
    const st=batchData[b]||[];iM[b]={};lwM[b]={};lmM[b]={};schM[b]={};
    st.forEach((s,i)=>{const ld=s.flown?.at(-1)?.date||"";iM[b][i]=s.done;lwM[b][i]=computeLwM(ld);lmM[b][i]=s.flown?.at(-1)?.actual_mins||0;schM[b][i]=[];});
  });
  iM.AP129={};lwM.AP129={};lmM.AP129={};schM.AP129={};
  for(let i=0;i<n129;i++){iM.AP129[i]=0;lwM.AP129[i]=-99;lmM.AP129[i]=0;schM.AP129[i]=[];}
  extraBatches.forEach(b=>{
    const k=b.name;iM[k]={};lwM[k]={};lmM[k]={};schM[k]={};
    for(let i=0;i<(b.n||0);i++){iM[k][i]=0;lwM[k][i]=-99;lmM[k][i]=0;schM[k][i]=[];}
  });
  const wExtra=extraBatches.map(b=>{const i=wds.findIndex(d=>d>=(b.start||"9999"));return i<0?wds.length:i;});
  function elig(b,cur,wi,overN){
    const tot=cur.length,wl=Math.max(horizon-wi,1),n=overN!==undefined?overN:(b==="AP129"?n129:(batchData[b]||[]).length),out=[];
    for(let i=0;i<n;i++){if(iM[b][i]>=tot)continue;const gap=(cfg.restReg&&lmM[b][i]>=120)?2:1;if((wi-lwM[b][i])<gap)continue;out.push([(tot-iM[b][i])/wl,i]);}
    return out.sort((a,z)=>z[0]-a[0]);
  }
  wds.forEach((ds,wi)=>{
    let slots=ops[wi].cap;
    if(cfg.schedulingMode!=='balanced'){
      // priority mode (original behaviour)
      priorityOrder(cfg.priority).forEach(b=>{
        if(slots<=0)return;const cur=curricula[b]||[];
        for(const[,i]of elig(b,cur,wi)){if(slots<=0)break;const ix=iM[b][i];if(ix>=cur.length)continue;const p=cur[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM[b][i].push([ds,p.lesson,p.planned_mins]);lwM[b][i]=wi;lmM[b][i]=p.planned_mins;iM[b][i]=ix+1;slots-=cost;}
      });
      if(slots>0&&wi>=w129)for(const[,i]of elig("AP129",cur129,wi)){if(slots<=0)break;const ix=iM.AP129[i];if(ix>=cur129.length)continue;const p=cur129[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM.AP129[i].push([ds,p.lesson,p.planned_mins]);lwM.AP129[i]=wi;lmM.AP129[i]=p.planned_mins;iM.AP129[i]=ix+1;slots-=cost;}
      extraBatches.forEach((b,bi)=>{
        if(slots<=0||wi<wExtra[bi])return;
        const k=b.name;
        for(const[,i]of elig(k,cur129,wi,b.n)){if(slots<=0)break;const ix=iM[k][i];if(ix>=cur129.length)continue;const p=cur129[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM[k][i].push([ds,p.lesson,p.planned_mins]);lwM[k][i]=wi;lmM[k][i]=p.planned_mins;iM[k][i]=ix+1;slots-=cost;}
      });
    }else{
      // balanced proportional mode
      const ab=[];
      ["AP124","AP126","AP127"].forEach(b=>{const cur=curricula[b]||[];const el=elig(b,cur,wi);if(el.length)ab.push({key:b,cur,weight:cfg.batchWeights[b]||1,n:(batchData[b]||[]).length,eligList:el});});
      if(wi>=w129){const el=elig("AP129",cur129,wi);if(el.length)ab.push({key:"AP129",cur:cur129,weight:cfg.batchWeights.AP129||1,n:n129,eligList:el});}
      extraBatches.forEach((b,bi)=>{if(wi<wExtra[bi])return;const k=b.name;const el=elig(k,cur129,wi,b.n);if(el.length)ab.push({key:k,cur:cur129,weight:b.weight||1,n:b.n||0,eligList:el});});
      const alloc=allocateDaySlots(ab.map(b=>({key:b.key,weight:b.weight,n:b.n,eligCount:b.eligList.length})),slots,hourMode);
      let unspent=0;
      ab.forEach(b=>{
        let quota=alloc[b.key]||0,used=0;
        for(const[,i]of b.eligList){
          if(used>=quota)break;
          const ix=iM[b.key][i];if(ix>=b.cur.length)continue;
          const p=b.cur[ix];const cost=hourMode?p.planned_mins/60:1;
          if(cost>quota-used)continue;
          schM[b.key][i].push([ds,p.lesson,p.planned_mins]);lwM[b.key][i]=wi;lmM[b.key][i]=p.planned_mins;iM[b.key][i]=ix+1;used+=cost;
        }
        unspent+=Math.max(0,quota-used);
      });
      if(unspent>0){
        for(const b of ab){
          if(unspent<=0)break;
          for(const[,i]of b.eligList){
            if(unspent<=0)break;
            const ix=iM[b.key][i];if(ix>=b.cur.length)continue;
            const p=b.cur[ix];const cost=hourMode?p.planned_mins/60:1;
            if(cost>unspent)continue;
            schM[b.key][i].push([ds,p.lesson,p.planned_mins]);lwM[b.key][i]=wi;lmM[b.key][i]=p.planned_mins;iM[b.key][i]=ix+1;unspent-=cost;
          }
        }
      }
    }
  });
  const dc={},wpm={};wds.forEach(d=>{const m=d.slice(0,7);wpm[m]=(wpm[m]||0)+1;});
  ["AP124","AP126","AP127","AP129"].forEach(b=>{
    const n=b==="AP129"?n129:(batchData[b]||[]).length;
    for(let i=0;i<n;i++)for(const[ds,,mins]of schM[b][i]||[]){const m=ds.slice(0,7);const val=hourMode?(mins||60)/60:1;if(!dc[m])dc[m]={t:0,"124":0,"126":0,"127":0,"129":0};dc[m].t+=val;dc[m][b.replace("AP","")]+=val;}
  });
  extraBatches.forEach(b=>{
    for(let i=0;i<(b.n||0);i++)for(const[ds,,mins]of schM[b.name][i]||[]){const m=ds.slice(0,7);const val=hourMode?(mins||60)/60:1;if(!dc[m])dc[m]={t:0,"124":0,"126":0,"127":0,"129":0};dc[m].t+=val;dc[m][b.name]=(dc[m][b.name]||0)+val;}
  });
  const monthly={};Object.entries(dc).forEach(([m,v])=>{const w=wpm[m]||1;const mo={t:+(v.t/w).toFixed(1),"124":+(v["124"]/w).toFixed(1),"126":+(v["126"]/w).toFixed(1),"127":+(v["127"]/w).toFixed(1),"129":+(v["129"]/w).toFixed(1)};extraBatches.forEach(b=>{mo[b.name]=+((v[b.name]||0)/w).toFixed(1);});monthly[m]=mo;});
  function mkSt(b,st,cur,sd){
    if(b==="AP129")return Array.from({length:n129},(_,i)=>({catc_id:"AP129-"+String(i+1).padStart(2,"0"),name:"Student "+String(i+1).padStart(2,"0"),batch:"AP129",done:0,total:cur.length,remaining:cur.length,pct:0,flown:[],next_lesson:cur[0]?.lesson||"",planned:(sd[i]||[]).map(p=>Array.isArray(p)?{date:p[0],lesson:p[1],mins:p[2]}:p),planned_total:(sd[i]||[]).length,finish:(sd[i]||[]).at(-1)?.[0]||(sd[i]||[]).at(-1)?.date||"N/A"}));
    return(st||[]).map((s,i)=>{const pl=sd[i]||[];const pl2=pl.map(p=>Array.isArray(p)?{date:p[0],lesson:p[1],mins:p[2]}:p);return{...s,planned:pl2,planned_total:pl2.length,finish:pl2.at(-1)?.date||pl.at(-1)?.[0]||(s.remaining===0?"COMPLETE":"N/A")};});
  }
  const result={ap124:mkSt("AP124",batchData.AP124,curricula.AP124||[],schM.AP124),ap126:mkSt("AP126",batchData.AP126,curricula.AP126||[],schM.AP126),ap127:mkSt("AP127",batchData.AP127,curricula.AP127||[],schM.AP127),ap129:mkSt("AP129",[],cur129,schM.AP129),monthly,cap,hourMode,weekendCap,holidayCap,cur124:curricula.AP124,cur126:curricula.AP126,cur127:curricula.AP127};
  extraBatches.forEach(b=>{
    result["extra_"+b.name]=Array.from({length:b.n||0},(_,i)=>({catc_id:b.name+"-"+String(i+1).padStart(2,"0"),name:"Student "+String(i+1).padStart(2,"0"),batch:b.name,done:0,total:cur129.length,remaining:cur129.length,pct:0,flown:[],next_lesson:cur129[0]?.lesson||"",planned:(schM[b.name][i]||[]).map(p=>Array.isArray(p)?{date:p[0],lesson:p[1],mins:p[2]}:p),planned_total:(schM[b.name][i]||[]).length,finish:(schM[b.name][i]||[]).at(-1)?.[0]||"N/A"}));
  });
  result.extra_batches=extraBatches;
  return result;
}

/* ===== helpers ===== */
function fd(ds){if(!ds||ds==="COMPLETE"||ds==="N/A")return ds;try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"});}catch{return ds;}}
function fm(ds){try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{month:"short",year:"numeric"});}catch{return ds;}}
function hm(m){if(!m)return"";return Math.floor(m/60)+"h"+(m%60?String(m%60).padStart(2,"0")+"m":"");}
function allSt(){const a=[];["ap124","ap126","ap127","ap129"].forEach(k=>(G[k]||[]).forEach(s=>a.push(s)));return a;}
function filtSt(){return AB==="ALL"?allSt():allSt().filter(s=>s.batch===AB);}
function lastFin(k){const d=(G[k]||[]).map(s=>s.finish).filter(f=>f&&f!=="COMPLETE"&&f!=="N/A").sort();return d.at(-1)||null;}

/* ===== observeChartResize ===== */
function observeChartResize(chartKey,wrapperId){
  if(typeof ResizeObserver==='undefined')return;
  const el=document.getElementById(wrapperId);
  if(!el||!CHARTS[chartKey])return;
  const ro=new ResizeObserver(()=>{CHARTS[chartKey]&&CHARTS[chartKey].resize();});
  ro.observe(el);
  if(!CHARTS._ro)CHARTS._ro=[];
  CHARTS._ro.push(ro);
}
/* ===== renderStats ===== */
function renderStats(){
  const cnt={AP124:(G.ap124||[]).length,AP126:(G.ap126||[]).length,AP127:(G.ap127||[]).length,AP129:(G.ap129||[]).length};
  const fin=k=>lastFin(k)?fm(lastFin(k)):"—";
  document.getElementById("ss").innerHTML=`<div class="sc ca"><div class="sl">Total Students</div><div class="sv">${cnt.AP124+cnt.AP126+cnt.AP127+cnt.AP129}</div><div class="ss2">4 batches · ${CFG.cap}/day cap</div></div><div class="sc c124"><div class="sl">AP124 · ${cnt.AP124}</div><div class="sv" style="color:var(--c124)">${fin("ap124")}</div><div class="ss2">97-lesson curriculum</div></div><div class="sc c126"><div class="sl">AP126 · ${cnt.AP126}</div><div class="sv" style="color:var(--c126)">${fin("ap126")}</div><div class="ss2">101-lesson curriculum</div></div><div class="sc c127"><div class="sl">AP127 · ${cnt.AP127}</div><div class="sv" style="color:var(--c127)">${fin("ap127")}</div><div class="ss2">101-lesson curriculum</div></div><div class="sc c129"><div class="sl">AP129 · ${cnt.AP129}</div><div class="sv" style="color:var(--c129)">${fin("ap129")}</div><div class="ss2">Starts ${CFG.ap129start}</div></div>`;
}

/* ===== charts: mkC/copts/buildLoad/buildProg/buildBC ===== */
function mkC(id,cfg){const ctx=document.getElementById(id);if(!ctx)return null;const ex=Chart.getChart(ctx);if(ex)ex.destroy();return new Chart(ctx,cfg);}
function copts(sx={},sy={},extra={}){return{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",boxWidth:8}},...(extra.p||{})},scales:{x:{ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681"},...sx},y:{ticks:{font:{family:"JetBrains Mono",size:9},color:"#6e7681"},...sy}}};}
function buildLoad(){
  const M=Object.keys(G.monthly||{}).sort();
  const lbl=M.map(m=>{const[y,mo]=m.split("-");return["","J","F","M","A","M","J","J","A","S","O","N","D"][+mo]+"'"+y.slice(2);});
  const v=k=>M.map(m=>(G.monthly[m]||{})[k]||0);
  CHARTS.load=mkC("c-load",{type:"bar",data:{labels:lbl,datasets:[{label:"AP124",data:v("124"),backgroundColor:"rgba(75,163,247,.75)",stack:"s"},{label:"AP126",data:v("126"),backgroundColor:"rgba(122,207,126,.75)",stack:"s"},{label:"AP127",data:v("127"),backgroundColor:"rgba(232,138,255,.75)",stack:"s"},{label:"AP129",data:v("129"),backgroundColor:"rgba(233,189,99,.75)",stack:"s"},{label:"Cap",data:Array(lbl.length).fill(CFG.cap),type:"line",borderColor:"#f59e0b",borderWidth:1.5,borderDash:[5,3],pointRadius:0,fill:false}]},options:copts({stacked:true,grid:{color:"#21262d"}},{stacked:true,max:Math.max(CFG.cap+3,28),grid:{color:"#21262d"}})});
}
function buildProg(){
  const st=allSt();
  CHARTS.prog=mkC("c-prog",{type:"bar",data:{labels:st.map(s=>ap127ShortName(s.name)),datasets:[{label:"Done",data:st.map(s=>s.done),backgroundColor:st.map(s=>BC[s.batch]+"88"),stack:"s"},{label:"Remaining",data:st.map(s=>s.remaining),backgroundColor:"rgba(48,54,61,.5)",stack:"s"}]},options:copts({stacked:true,ticks:{font:{family:"JetBrains Mono",size:6},color:"#6e7681",maxRotation:90},grid:{color:"#21262d"}},{stacked:true,grid:{color:"#21262d"}})});
}
function buildBC(cid,infId,k,col){
  const st=G[k]||[];const avgP=st.length?(st.reduce((a,s)=>a+s.pct,0)/st.length).toFixed(1):0;const fins=st.map(s=>s.finish).filter(f=>f&&f!=="COMPLETE"&&f!=="N/A").sort();
  document.getElementById(infId).textContent="Avg "+avgP+"% · Est. "+(fins.length?fm(fins.at(-1)):"—");
  CHARTS[cid]=mkC(cid,{type:"bar",data:{labels:st.map(s=>ap127ShortName(s.name)),datasets:[{label:"Done",data:st.map(s=>s.done),backgroundColor:col+"99",stack:"s"},{label:"Remaining",data:st.map(s=>s.remaining),backgroundColor:"rgba(48,54,61,.5)",stack:"s"}]},options:{...copts({stacked:true,ticks:{font:{family:"JetBrains Mono",size:7},color:"#6e7681",maxRotation:90},grid:{color:"#21262d"}},{stacked:true,grid:{color:"#21262d"}}),plugins:{legend:{display:false}}}});
}

/* ===== simulation ===== */
function addExtraBatch(){
  const colorIdx=EXTRA_BATCHES.length%EXTRA_COLORS.length;
  EXTRA_BATCHES.push({id:Date.now(),name:"APXXX",n:10,start:"2026-07-01",color:EXTRA_COLORS[colorIdx]});
  renderSimExtraList();
}
function removeExtraBatch(id){EXTRA_BATCHES=EXTRA_BATCHES.filter(b=>b.id!==id);renderSimExtraList();}
function updateExtraBatch(id,key,val){const b=EXTRA_BATCHES.find(x=>x.id===id);if(b)b[key]=key==="n"?Math.max(1,+val||1):val;}
function renderSimExtraList(){
  const el=document.getElementById("sim-extra-list");if(!el)return;
  if(!EXTRA_BATCHES.length){el.innerHTML="";return;}
  el.innerHTML=EXTRA_BATCHES.map(b=>`<div class="sim-extra-row">
    <div class="sim-extra-badge" style="background:${b.color}"></div>
    <input style="width:90px" placeholder="Name" value="${escHtml(b.name)}" oninput="updateExtraBatch(${b.id},'name',this.value)">
    <input type="number" style="width:64px" min="1" max="60" placeholder="N students" value="${b.n}" oninput="updateExtraBatch(${b.id},'n',+this.value)">
    <input style="width:116px" placeholder="YYYY-MM-DD" value="${escHtml(b.start)}" oninput="updateExtraBatch(${b.id},'start',this.value)">
    <span style="font-size:9px;color:var(--tx3);flex:1">101 lessons</span>
    <button class="sim-extra-del" onclick="removeExtraBatch(${b.id})">✕</button>
  </div>`).join("");
}
function runSimulation(){
  if(!G){toast("No data — load cache first","wa");return;}
  const capEl=document.getElementById("sim-cap"),horEl=document.getElementById("sim-hor"),s129El=document.getElementById("sim-129s");
  CFG.cap=+(capEl?.value)||25;
  CFG.horizon=+(horEl?.value)||800;
  CFG.ap129start=s129El?.value||"2026-06-01";
  CFG.n129=13;
  const weEl=document.getElementById("sim-wecap"),holEl=document.getElementById("sim-holcap");
  CFG.weekendCap=Math.max(0,+(weEl?.value)||0);
  CFG.holidayCap=Math.max(0,+(holEl?.value)||0);
  const bd={AP124:G.ap124||[],AP126:G.ap126||[],AP127:G.ap127||[]};
  const cur={AP124:G.cur124||[],AP126:G.cur126||[],AP127:G.cur127||[]};
  const t0=Date.now();
  const _d=new Date(Date.now()+7*3600000);_d.setUTCDate(_d.getUTCDate()+1);
  const tomorrowBKK=_d.toISOString().slice(0,10);
  SIM_G=runScheduler(bd,cur,EXTRA_BATCHES,tomorrowBKK,CFG.hourMode||false,CFG.weekendCap,CFG.holidayCap);
  SIM_G.ap127?.forEach((s,i)=>{s.nick=AP127_NICKS[i]||"";s.fi=AP127_FI[i]||"";s.se=AP127_SE[i]||"";});
  const ms=Date.now()-t0;
  const statusEl=document.getElementById("sim-status");
  if(statusEl)statusEl.textContent=`Done in ${ms}ms · cap ${CFG.cap}/day · WE ${CFG.weekendCap} · Hol ${CFG.holidayCap} · ${CFG.horizon}wd horizon`;
  renderSimFinish();
  buildSimCapacityChart();
  toast("Simulation complete","ok");
}
function renderSimulation(){
  if(!G)return;
  const capEl=document.getElementById("sim-cap"),horEl=document.getElementById("sim-hor"),s129El=document.getElementById("sim-129s");
  if(capEl){capEl.value=CFG.cap;document.getElementById("sim-cap-v").textContent=CFG.cap;}
  if(horEl){horEl.value=CFG.horizon;document.getElementById("sim-hor-v").textContent=CFG.horizon;}
  if(s129El)s129El.value=CFG.ap129start;
  const weEl=document.getElementById("sim-wecap"),holEl=document.getElementById("sim-holcap");
  if(weEl){weEl.value=CFG.weekendCap;document.getElementById("sim-wecap-v").textContent=CFG.weekendCap;}
  if(holEl){holEl.value=CFG.holidayCap;document.getElementById("sim-holcap-v").textContent=CFG.holidayCap;}
  const rrEl=document.getElementById("sim-rest-reg");if(rrEl)rrEl.checked=CFG.restReg;
  renderSimExtraList();
  renderPriorityChips();
  if(!SIM_G)runSimulation();
}
function propagateCapToWeHol(capVal){
  const cap=+capVal||0;
  const half=Math.round(cap*0.5);
  if(CFG._weAuto){const el=document.getElementById("sim-wecap");if(el){el.value=half;document.getElementById("sim-wecap-v").textContent=half;CFG.weekendCap=half;}}
  if(CFG._holAuto){const el=document.getElementById("sim-holcap");if(el){el.value=half;document.getElementById("sim-holcap-v").textContent=half;CFG.holidayCap=half;}}
}
function onWeHolCapInput(kind){
  if(kind==="we"){const el=document.getElementById("sim-wecap");document.getElementById("sim-wecap-v").textContent=el.value;CFG.weekendCap=+el.value;CFG._weAuto=false;}
  else{const el=document.getElementById("sim-holcap");document.getElementById("sim-holcap-v").textContent=el.value;CFG.holidayCap=+el.value;CFG._holAuto=false;}
}
function renderSimFinish(){
  if(!SIM_G)return;
  const grid=document.getElementById("sim-finish-grid");if(!grid)return;
  const today=new Date().toISOString().slice(0,10);
  function fcard(name,col,students,startDate){
    const fins=students.map(s=>s.finish).filter(f=>f&&f!=="COMPLETE"&&f!=="N/A").sort();
    const last=fins.at(-1)||null;
    const done=students.reduce((a,s)=>a+(s.done||0),0);
    const tot=students.reduce((a,s)=>a+(s.total||0),0);
    const remaining=tot-done;
    const pct=tot?done/tot*100:0;
    const n=students.length;
    const sub=startDate?`${n} students · starts ${escHtml(startDate)}`:`${n} students · active`;
    const daysLeft=last?ap127DateDiff(last,today):null;
    const moLeft=daysLeft!==null?Math.ceil(daysLeft/30.4):null;
    const moTxt=moLeft!==null?(moLeft>0?moLeft+"mo":"done"):"—";
    return `<div class="sim-fcard" style="border-top-color:${col}">
      <div class="sim-fcard-name" style="color:${col}">${escHtml(name)}</div>
      <div class="sim-fcard-sub">${sub}</div>
      <div class="sim-fcard-lbl">PROJECTED LAST FINISH</div>
      <div class="sim-fcard-finish" style="color:${col}">${last?fm(last):"—"}</div>
      <div class="sim-fcard-bar"><div class="sim-fcard-barf" style="width:${pct.toFixed(1)}%;background:${col}"></div></div>
      <div class="sim-fcard-stats">
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v" style="color:${col}">${pct.toFixed(0)}%</div><div class="sim-fcard-stat-l">Done</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v">${last?fm(last):"—"}</div><div class="sim-fcard-stat-l">Last SP finish</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v" style="color:${col}">${moTxt}</div><div class="sim-fcard-stat-l">Months to go</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v">${remaining.toLocaleString()}</div><div class="sim-fcard-stat-l">Lessons left</div></div>
      </div>
    </div>`;
  }
  let html=fcard("AP124",BC.AP124,SIM_G.ap124||[],null);
  html+=fcard("AP126",BC.AP126,SIM_G.ap126||[],null);
  html+=fcard("AP127",BC.AP127,SIM_G.ap127||[],null);
  html+=fcard("AP129",BC.AP129,SIM_G.ap129||[],CFG.ap129start);
  (SIM_G.extra_batches||[]).forEach(b=>{html+=fcard(b.name,b.color,SIM_G["extra_"+b.name]||[],b.start);});
  grid.innerHTML=html;
}
function toggleHourMode(isHour){
  CFG.hourMode=isHour;
  document.getElementById("cap-mode-lbl").textContent=isHour?"Daily Hour Cap":"Daily Flight Cap";
  document.getElementById("cap-mode-desc").textContent=isHour?"Max total flight hours per day across all batches":"Max total flights per day across all batches";
  document.getElementById("cap-mode-unit").textContent=isHour?"hrs/day":"/day";
  const capEl=document.getElementById("sim-cap");
  if(isHour){capEl.max="200";capEl.step="5";capEl.value=40;}
  else{capEl.max="50";capEl.step="1";capEl.value=25;}
  document.getElementById("sim-cap-v").textContent=capEl.value;
  const weEl=document.getElementById("sim-wecap"),holEl=document.getElementById("sim-holcap");
  if(weEl&&holEl){
    if(isHour){weEl.max="200";weEl.step="5";holEl.max="200";holEl.step="5";document.getElementById("wecap-unit").textContent="hrs/day";document.getElementById("holcap-unit").textContent="hrs/day";}
    else{weEl.max="50";weEl.step="1";holEl.max="50";holEl.step="1";document.getElementById("wecap-unit").textContent="/day";document.getElementById("holcap-unit").textContent="/day";}
    CFG._weAuto=true;CFG._holAuto=true;
    propagateCapToWeHol(capEl.value);
  }
}
function buildHistoricalMonthly(isHour){
  const rec=collectHistoricalFlights();
  const acc={};const daySet={};
  rec.forEach(r=>{
    const m=r.date.slice(0,7);
    if(!acc[m])acc[m]={t:0,"124":0,"126":0,"127":0,"129":0};
    if(!daySet[m])daySet[m]=new Set();
    daySet[m].add(r.date);
    const val=isHour?(r.mins||0)/60:1;
    acc[m].t+=val;
    const k=r.batch.replace("AP","");
    acc[m][k]=(acc[m][k]||0)+val;
  });
  const out={};
  Object.entries(acc).forEach(([m,v])=>{
    const d=daySet[m]?.size||1;
    out[m]={t:+(v.t/d).toFixed(1),"124":+(v["124"]/d).toFixed(1),"126":+(v["126"]/d).toFixed(1),"127":+(v["127"]/d).toFixed(1),"129":+(v["129"]/d).toFixed(1),_actualDays:d};
  });
  return out;
}
function buildSimCapacityChart(){
  if(!SIM_G)return;
  const isHour=SIM_G.hourMode||false;
  const proj=SIM_G.monthly||{};
  const hist=buildHistoricalMonthly(isHour);
  const todayM=ap127TodayBKK().slice(0,7);
  const merged={};const srcMap={};
  Object.keys(hist).forEach(m=>{if(m<=todayM){merged[m]=hist[m];srcMap[m]="actual";}});
  Object.keys(proj).forEach(m=>{if(m>todayM&&!merged[m]){merged[m]=proj[m];srcMap[m]="projected";}});
  // Edge: if current month also has projection but no actuals, fall back to projection
  if(!merged[todayM]&&proj[todayM]){merged[todayM]=proj[todayM];srcMap[todayM]="projected";}
  const M=Object.keys(merged).sort();if(!M.length)return;
  const cap=CFG.cap;
  const unit=isHour?"hrs":"flights";
  const lbl=M.map(m=>{const[y,mo]=m.split("-");return["","J","F","M","A","M","J","J","A","S","O","N","D"][+mo]+"'"+y.slice(2);});
  const v=k=>M.map(m=>(merged[m]||{})[k]||0);
  const extras=SIM_G.extra_batches||[];
  const totals=M.map(m=>(merged[m]||{}).t||0);
  const datasets=[
    {label:"AP124",data:v("124"),backgroundColor:"rgba(75,163,247,.75)",stack:"s"},
    {label:"AP126",data:v("126"),backgroundColor:"rgba(122,207,126,.75)",stack:"s"},
    {label:"AP127",data:v("127"),backgroundColor:"rgba(232,138,255,.75)",stack:"s"},
    {label:"AP129",data:v("129"),backgroundColor:"rgba(233,189,99,.75)",stack:"s"},
    ...extras.map(b=>({label:b.name,data:v(b.name),backgroundColor:b.color+"bb",stack:"s"})),
    {label:"Cap",data:Array(lbl.length).fill(cap),type:"line",borderColor:"#f59e0b",borderWidth:1.5,borderDash:[5,3],pointRadius:0,fill:false}
  ];
  const todayIdx=M.indexOf(todayM);
  const titleEl=document.getElementById("sim-cap-title");
  if(titleEl)titleEl.textContent=isHour?"Monthly Flight Hours — actual past + projected future":"Monthly Flight Capacity — actual past + projected future";
  const subEl=document.getElementById("sim-cap-sub");
  if(subEl)subEl.textContent=`Past months = actual flights (incl. weekends/holidays) · Future = projection · WE cap ${SIM_G.weekendCap||0} · Hol cap ${SIM_G.holidayCap||0} · dashed = ${cap} ${isHour?"hrs":""}/day weekday cap${extras.length?" · "+extras.map(b=>b.name).join(", "):""}`;
  CHARTS.simCap=mkC("c-sim-cap",{type:"bar",data:{labels:lbl,datasets},options:{...copts(
    {stacked:true,grid:{color:"#21262d"}},
    {stacked:true,max:Math.max(cap+5,Math.max(...totals,0)+3),grid:{color:"#21262d"},title:{display:true,text:isHour?"avg hrs / operating day":"avg flights / operating day",color:"#8b949e",font:{size:9,family:"JetBrains Mono, monospace"}}}
  ),plugins:{...copts().plugins,catcNowLine:{enabled:true,idx:todayIdx},tooltip:{callbacks:{
    title:([ctx])=>{const m=M[ctx.dataIndex]||ctx.label;return `${m} · ${srcMap[m]==="actual"?"ACTUAL":"PROJECTED"}`;},
    afterBody:([ctx])=>{const m=M[ctx.dataIndex];const extra=srcMap[m]==="actual"?` · ${merged[m]?._actualDays||0} flight days`:"";return `Total: ${(totals[ctx.dataIndex]||0).toFixed(1)} ${unit} / Cap: ${cap}${isHour?" hrs":""}/day${extra}`;}
  }}}}});
}
/* ===== Simulation 2 — proportional scheduling ===== */
function addExtraBatch2(){const colorIdx=SIM2_EXTRA_BATCHES.length%EXTRA_COLORS.length;SIM2_EXTRA_BATCHES.push({id:Date.now(),name:"APXXX",n:10,start:"2026-07-01",color:EXTRA_COLORS[colorIdx],weight:1.0});renderSimExtraList2();}
function removeExtraBatch2(id){SIM2_EXTRA_BATCHES=SIM2_EXTRA_BATCHES.filter(b=>b.id!==id);renderSimExtraList2();}
function updateExtraBatch2(id,key,val){const b=SIM2_EXTRA_BATCHES.find(x=>x.id===id);if(b)b[key]=(key==='n')?Math.max(1,+val||1):(key==='weight')?Math.max(0.1,Math.min(5,+val||1)):val;}
function renderSimExtraList2(){
  const el=document.getElementById("s2-extra-list");if(!el)return;
  if(!SIM2_EXTRA_BATCHES.length){el.innerHTML="";return;}
  el.innerHTML=SIM2_EXTRA_BATCHES.map(b=>`<div class="sim-extra-row">
    <div class="sim-extra-badge" style="background:${b.color}"></div>
    <input style="width:90px" placeholder="Name" value="${escHtml(b.name)}" oninput="updateExtraBatch2(${b.id},'name',this.value)">
    <input type="number" style="width:64px" min="1" max="60" placeholder="N" value="${b.n}" oninput="updateExtraBatch2(${b.id},'n',+this.value)">
    <input style="width:116px" placeholder="YYYY-MM-DD" value="${escHtml(b.start)}" oninput="updateExtraBatch2(${b.id},'start',this.value)">
    <span style="font-size:9px;color:var(--tx3)">wt</span>
    <input type="number" style="width:52px" min="0.1" max="5" step="0.1" value="${(b.weight||1).toFixed(1)}" oninput="updateExtraBatch2(${b.id},'weight',+this.value)" title="Weight multiplier">
    <span style="font-size:9px;color:var(--tx3);flex:1">101 lessons</span>
    <button class="sim-extra-del" onclick="removeExtraBatch2(${b.id})">✕</button>
  </div>`).join("");
}
function onRestRegChange2(v){SIM2_CFG.restReg=v;}
function onPriorityChange2(val){SIM2_CFG.priority=(SIM2_CFG.priority===val)?null:val;renderPriorityChips2();}
function renderPriorityChips2(){
  ['ap126','ap126_ap127','ap127'].forEach(v=>{
    const el=document.getElementById('s2-pri-'+v);if(!el)return;
    const active=SIM2_CFG.priority===v;
    el.style.border=`1px solid ${active?'var(--c127)':'var(--bd)'}`;
    el.style.background=active?'color-mix(in oklch,var(--c127) 14%,var(--s1))':'transparent';
    el.style.color=active?'var(--c127)':'var(--tx3)';
    el.style.fontWeight=active?'600':'400';
  });
  const info=document.getElementById('s2-priority-info');if(!info)return;
  const labels={'ap126':'AP126 → AP124 → AP127','ap126_ap127':'AP126 → AP127 → AP124','ap127':'AP127 → AP124 → AP126'};
  if(SIM2_CFG.schedulingMode==='balanced'){
    const wts=["AP124","AP126","AP127","AP129"].map(b=>`${b}×${(SIM2_CFG.batchWeights[b]||1).toFixed(1)}`).join(' · ');
    info.textContent=`Balanced — ${wts}`;
  }else{info.textContent=SIM2_CFG.priority?labels[SIM2_CFG.priority]:'AP124 → AP126 → AP127 (default)';}
}
function onModeChange2(mode){SIM2_CFG.schedulingMode=mode;renderSchedulingModeUI2();}
function onWeightChange2(batch,val){
  SIM2_CFG.batchWeights[batch]=Math.max(0.5,Math.min(3.0,+val||1.0));
  document.getElementById('s2-wt-v-'+batch).textContent=SIM2_CFG.batchWeights[batch].toFixed(1);
}
function resetWeights2(){
  SIM2_CFG.batchWeights={AP124:1.0,AP126:1.0,AP127:1.0,AP129:1.0};
  SIM2_EXTRA_BATCHES.forEach(b=>{b.weight=1.0;});
  ["AP124","AP126","AP127","AP129"].forEach(b=>{const el=document.getElementById('s2-wt-'+b);if(el){el.value=1.0;document.getElementById('s2-wt-v-'+b).textContent='1.0';}});
  renderSimExtraList2();
}
function renderSchedulingModeUI2(){
  const isB=SIM2_CFG.schedulingMode==='balanced';
  ['balanced','priority'].forEach(m=>{
    const btn=document.getElementById('s2-mode-'+m);if(!btn)return;
    const active=(m==='balanced')===isB;
    const col=m==='balanced'?'var(--c126)':'var(--c127)';
    btn.style.border=`1px solid ${active?col:'var(--bd)'}`;
    btn.style.background=active?`color-mix(in oklch,${col} 14%,var(--s1))`:'transparent';
    btn.style.color=active?col:'var(--tx3)';
    btn.style.fontWeight=active?'600':'400';
  });
  const wtPanel=document.getElementById('s2-weight-panel');
  const priPanel=document.getElementById('s2-priority-panel');
  if(wtPanel)wtPanel.style.display=isB?'':'none';
  if(priPanel)priPanel.style.display=!isB?'':'none';
  renderPriorityChips2();
}
function propagateCapToWeHol2(capVal){
  const cap=+capVal||0;const half=Math.round(cap*0.5);
  if(SIM2_CFG._weAuto){const el=document.getElementById("s2-wecap");if(el){el.value=half;document.getElementById("s2-wecap-v").textContent=half;SIM2_CFG.weekendCap=half;}}
  if(SIM2_CFG._holAuto){const el=document.getElementById("s2-holcap");if(el){el.value=half;document.getElementById("s2-holcap-v").textContent=half;SIM2_CFG.holidayCap=half;}}
}
function onWeHolCapInput2(kind){
  if(kind==="we"){const el=document.getElementById("s2-wecap");document.getElementById("s2-wecap-v").textContent=el.value;SIM2_CFG.weekendCap=+el.value;SIM2_CFG._weAuto=false;}
  else{const el=document.getElementById("s2-holcap");document.getElementById("s2-holcap-v").textContent=el.value;SIM2_CFG.holidayCap=+el.value;SIM2_CFG._holAuto=false;}
}
function toggleHourMode2(isHour){
  SIM2_CFG.hourMode=isHour;
  document.getElementById("s2-cap-mode-lbl").textContent=isHour?"Daily Hour Cap":"Daily Flight Cap";
  document.getElementById("s2-cap-mode-desc").textContent=isHour?"Max total flight hours per day across all batches":"Max total flights per day across all batches";
  document.getElementById("s2-cap-mode-unit").textContent=isHour?"hrs/day":"/day";
  const capEl=document.getElementById("s2-cap");
  if(isHour){capEl.max="200";capEl.step="5";capEl.value=40;}
  else{capEl.max="50";capEl.step="1";capEl.value=25;}
  document.getElementById("s2-cap-v").textContent=capEl.value;
  const weEl=document.getElementById("s2-wecap"),holEl=document.getElementById("s2-holcap");
  if(weEl&&holEl){
    if(isHour){weEl.max="200";weEl.step="5";holEl.max="200";holEl.step="5";document.getElementById("s2-wecap-unit").textContent="hrs/day";document.getElementById("s2-holcap-unit").textContent="hrs/day";}
    else{weEl.max="50";weEl.step="1";holEl.max="50";holEl.step="1";document.getElementById("s2-wecap-unit").textContent="/day";document.getElementById("s2-holcap-unit").textContent="/day";}
    SIM2_CFG._weAuto=true;SIM2_CFG._holAuto=true;propagateCapToWeHol2(capEl.value);
  }
}
function renderSim2Finish(){
  if(!SIM2_G)return;
  const grid=document.getElementById("s2-finish-grid");if(!grid)return;
  const today=new Date().toISOString().slice(0,10);
  function fcard(name,col,students,startDate){
    const fins=students.map(s=>s.finish).filter(f=>f&&f!=="COMPLETE"&&f!=="N/A").sort();
    const last=fins.at(-1)||null;
    const done=students.reduce((a,s)=>a+(s.done||0),0);
    const tot=students.reduce((a,s)=>a+(s.total||0),0);
    const remaining=tot-done;
    const pct=tot?done/tot*100:0;
    const n=students.length;
    const sub=startDate?`${n} students · starts ${escHtml(startDate)}`:`${n} students · active`;
    const daysLeft=last?ap127DateDiff(last,today):null;
    const moLeft=daysLeft!==null?Math.ceil(daysLeft/30.4):null;
    const moTxt=moLeft!==null?(moLeft>0?moLeft+"mo":"done"):"—";
    return `<div class="sim-fcard" style="border-top-color:${col}">
      <div class="sim-fcard-name" style="color:${col}">${escHtml(name)}</div>
      <div class="sim-fcard-sub">${sub}</div>
      <div class="sim-fcard-lbl">PROJECTED LAST FINISH</div>
      <div class="sim-fcard-finish" style="color:${col}">${last?fm(last):"—"}</div>
      <div class="sim-fcard-bar"><div class="sim-fcard-barf" style="width:${pct.toFixed(1)}%;background:${col}"></div></div>
      <div class="sim-fcard-stats">
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v" style="color:${col}">${pct.toFixed(0)}%</div><div class="sim-fcard-stat-l">Done</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v">${last?fm(last):"—"}</div><div class="sim-fcard-stat-l">Last SP finish</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v" style="color:${col}">${moTxt}</div><div class="sim-fcard-stat-l">Months to go</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v">${remaining.toLocaleString()}</div><div class="sim-fcard-stat-l">Lessons left</div></div>
      </div>
    </div>`;
  }
  let html=fcard("AP124",BC.AP124,SIM2_G.ap124||[],null);
  html+=fcard("AP126",BC.AP126,SIM2_G.ap126||[],null);
  html+=fcard("AP127",BC.AP127,SIM2_G.ap127||[],null);
  html+=fcard("AP129",BC.AP129,SIM2_G.ap129||[],SIM2_CFG.ap129start);
  (SIM2_G.extra_batches||[]).forEach(b=>{html+=fcard(b.name,b.color,SIM2_G["extra_"+b.name]||[],b.start);});
  grid.innerHTML=html;
}
function buildSim2CapacityChart(){
  if(!SIM2_G)return;
  const isHour=SIM2_G.hourMode||false;
  const proj=SIM2_G.monthly||{};
  const hist=buildHistoricalMonthly(isHour);
  const todayM=ap127TodayBKK().slice(0,7);
  const merged={};const srcMap={};
  Object.keys(hist).forEach(m=>{if(m<=todayM){merged[m]=hist[m];srcMap[m]="actual";}});
  Object.keys(proj).forEach(m=>{if(m>todayM&&!merged[m]){merged[m]=proj[m];srcMap[m]="projected";}});
  if(!merged[todayM]&&proj[todayM]){merged[todayM]=proj[todayM];srcMap[todayM]="projected";}
  const M=Object.keys(merged).sort();if(!M.length)return;
  const cap=SIM2_CFG.cap;
  const unit=isHour?"hrs":"flights";
  const lbl=M.map(m=>{const[y,mo]=m.split("-");return["","J","F","M","A","M","J","J","A","S","O","N","D"][+mo]+"'"+y.slice(2);});
  const v=k=>M.map(m=>(merged[m]||{})[k]||0);
  const extras=SIM2_G.extra_batches||[];
  const totals=M.map(m=>(merged[m]||{}).t||0);
  const datasets=[
    {label:"AP124",data:v("124"),backgroundColor:"rgba(75,163,247,.75)",stack:"s"},
    {label:"AP126",data:v("126"),backgroundColor:"rgba(122,207,126,.75)",stack:"s"},
    {label:"AP127",data:v("127"),backgroundColor:"rgba(232,138,255,.75)",stack:"s"},
    {label:"AP129",data:v("129"),backgroundColor:"rgba(233,189,99,.75)",stack:"s"},
    ...extras.map(b=>({label:b.name,data:v(b.name),backgroundColor:b.color+"bb",stack:"s"})),
    {label:"Cap",data:Array(lbl.length).fill(cap),type:"line",borderColor:"#f59e0b",borderWidth:1.5,borderDash:[5,3],pointRadius:0,fill:false}
  ];
  const todayIdx=M.indexOf(todayM);
  const titleEl=document.getElementById("s2-cap-title");
  if(titleEl)titleEl.textContent=isHour?"Monthly Flight Hours — actual past + projected future":"Monthly Flight Capacity — actual past + projected future";
  const subEl=document.getElementById("s2-cap-sub");
  if(subEl)subEl.textContent=`Past months = actual flights · Future = projection · WE cap ${SIM2_G.weekendCap||0} · Hol cap ${SIM2_G.holidayCap||0} · dashed = ${cap} ${isHour?"hrs":""}/day weekday cap${extras.length?" · "+extras.map(b=>b.name).join(", "):""}`;
  CHARTS.sim2Cap=mkC("c-s2-cap",{type:"bar",data:{labels:lbl,datasets},options:{...copts(
    {stacked:true,grid:{color:"#21262d"}},
    {stacked:true,max:Math.max(cap+5,Math.max(...totals,0)+3),grid:{color:"#21262d"},title:{display:true,text:isHour?"avg hrs / operating day":"avg flights / operating day",color:"#8b949e",font:{size:9,family:"JetBrains Mono, monospace"}}}
  ),plugins:{...copts().plugins,catcNowLine:{enabled:true,idx:todayIdx},tooltip:{callbacks:{
    title:([ctx])=>{const m=M[ctx.dataIndex]||ctx.label;return `${m} · ${srcMap[m]==="actual"?"ACTUAL":"PROJECTED"}`;},
    afterBody:([ctx])=>{const m=M[ctx.dataIndex];const extra=srcMap[m]==="actual"?` · ${merged[m]?._actualDays||0} flight days`:"";return `Total: ${(totals[ctx.dataIndex]||0).toFixed(1)} ${unit} / Cap: ${cap}${isHour?" hrs":""}/day${extra}`;}
  }}}}});
}
function runSimulation2(){
  if(!G){toast("No data — load cache first");return;}
  const capEl=document.getElementById("s2-cap"),horEl=document.getElementById("s2-hor"),s129El=document.getElementById("s2-129s");
  SIM2_CFG.cap=+(capEl?.value)||25;
  SIM2_CFG.horizon=+(horEl?.value)||800;
  SIM2_CFG.ap129start=s129El?.value||"2026-06-01";
  SIM2_CFG.n129=13;
  const weEl=document.getElementById("s2-wecap"),holEl=document.getElementById("s2-holcap");
  SIM2_CFG.weekendCap=Math.max(0,+(weEl?.value)||0);
  SIM2_CFG.holidayCap=Math.max(0,+(holEl?.value)||0);
  const bd={AP124:G.ap124||[],AP126:G.ap126||[],AP127:G.ap127||[]};
  const cur={AP124:G.cur124||[],AP126:G.cur126||[],AP127:G.cur127||[]};
  const t0=Date.now();
  const _d=new Date(Date.now()+7*3600000);_d.setUTCDate(_d.getUTCDate()+1);
  const tomorrowBKK=_d.toISOString().slice(0,10);
  SIM2_G=runScheduler(bd,cur,SIM2_EXTRA_BATCHES,tomorrowBKK,SIM2_CFG.hourMode||false,SIM2_CFG.weekendCap,SIM2_CFG.holidayCap,SIM2_CFG);
  SIM2_G.ap127?.forEach((s,i)=>{s.nick=AP127_NICKS[i]||"";s.fi=AP127_FI[i]||"";s.se=AP127_SE[i]||"";});
  const ms=Date.now()-t0;
  const statusEl=document.getElementById("s2-status");
  if(statusEl){
    const modeStr=SIM2_CFG.schedulingMode==='balanced'
      ?`balanced · wt ${["AP124","AP126","AP127","AP129"].map(b=>(SIM2_CFG.batchWeights[b]||1).toFixed(1)).join('/')}`
      :`priority · ${SIM2_CFG.priority?({'ap126':'AP126 first','ap126_ap127':'AP126+AP127','ap127':'AP127 first'}[SIM2_CFG.priority]):'default'}`;
    statusEl.textContent=`Done in ${ms}ms · cap ${SIM2_CFG.cap}/day · WE ${SIM2_CFG.weekendCap} · Hol ${SIM2_CFG.holidayCap} · ${SIM2_CFG.horizon}wd · ${modeStr}`;
  }
  renderSim2Finish();
  buildSim2CapacityChart();
  toast("Simulation 2 complete");
}
function renderSimulation2(){
  if(!G)return;
  const capEl=document.getElementById("s2-cap"),horEl=document.getElementById("s2-hor"),s129El=document.getElementById("s2-129s");
  if(capEl){capEl.value=SIM2_CFG.cap;document.getElementById("s2-cap-v").textContent=SIM2_CFG.cap;}
  if(horEl){horEl.value=SIM2_CFG.horizon;document.getElementById("s2-hor-v").textContent=SIM2_CFG.horizon;}
  if(s129El)s129El.value=SIM2_CFG.ap129start;
  const weEl=document.getElementById("s2-wecap"),holEl=document.getElementById("s2-holcap");
  if(weEl){weEl.value=SIM2_CFG.weekendCap;document.getElementById("s2-wecap-v").textContent=SIM2_CFG.weekendCap;}
  if(holEl){holEl.value=SIM2_CFG.holidayCap;document.getElementById("s2-holcap-v").textContent=SIM2_CFG.holidayCap;}
  const rrEl=document.getElementById("s2-rest-reg");if(rrEl)rrEl.checked=SIM2_CFG.restReg;
  renderSimExtraList2();
  renderSchedulingModeUI2();
  ["AP124","AP126","AP127","AP129"].forEach(b=>{
    const el=document.getElementById('s2-wt-'+b);
    const w=SIM2_CFG.batchWeights[b]||1.0;
    if(el){el.value=w;document.getElementById('s2-wt-v-'+b).textContent=w.toFixed(1);}
  });
  if(!SIM2_G)runSimulation2();
}
/* ============================================================================
 * SIMULATION 3 — "Decision Cockpit": realism-driven, multi-scenario, CEO-ready.
 * Fully isolated: own scheduler (runScheduler3), own globals, own DOM (s3- ids).
 * SIM1/SIM2 code paths are never touched.
 * ==========================================================================*/
/* ----- small numeric utilities ----- */
function sim3Clamp(x,lo,hi){return Math.max(lo,Math.min(hi,x));}
function sim3Round1(x){return Math.round(x*10)/10;}
function sim3Clone(o){return JSON.parse(JSON.stringify(o));}
function sim3MonthNum(ds){return +ds.slice(5,7);}
let _sim3SpareGauss=null;
function sim3Gauss(mean,sd){ // Box–Muller (browser Math.random is available here)
  if(_sim3SpareGauss!=null){const g=_sim3SpareGauss;_sim3SpareGauss=null;return mean+sd*g;}
  let u=0,v=0;while(u===0)u=Math.random();while(v===0)v=Math.random();
  const r=Math.sqrt(-2*Math.log(u)),t=2*Math.PI*v;_sim3SpareGauss=r*Math.sin(t);return mean+sd*r*Math.cos(t);
}
/* ----- defaults seeded from real data, then user-tunable ----- */
function sim3SeededDefaults3(){
  // instructors = distinct AP127 flight instructors (data-backed)
  let instructors=14; try{instructors=new Set(AP127_FI.filter(Boolean)).size||14;}catch(e){}
  // avg sortie length from actual flown history (data-backed)
  let avg=1.2; try{const rec=collectHistoricalFlights();const m=rec.filter(r=>r.mins>0);if(m.length)avg=sim3Clamp((m.reduce((a,r)=>a+r.mins,0)/m.length)/60,0.7,2.2);}catch(e){}
  // fleet seed: from peak historical single-day throughput ÷ sorties-per-aircraft
  let fleet=12; try{const rec=collectHistoricalFlights();const byDay={};rec.forEach(r=>{byDay[r.date]=(byDay[r.date]||0)+1;});const peak=Math.max(0,...Object.values(byDay));if(peak>0)fleet=sim3Clamp(Math.ceil(peak/4),8,28);}catch(e){}
  return {instructors,avgSortieHrs:sim3Round1(avg),fleetSize:fleet};
}
function sim3DefaultCfg3(){
  const sd=sim3SeededDefaults3();
  return {
    cap:30, n129:13, ap129start:"2026-06-01", horizon:800, hourMode:false,
    weekendCap:0, holidayCap:0, _weAuto:true, _holAuto:true, restReg:true, priority:null,
    schedulingMode:'balanced', batchWeights:{AP124:1.0,AP126:1.0,AP127:1.0,AP129:1.0},
    sim3:{
      // ── Fleet & maintenance ──
      fleetSize:sd.fleetSize, availability:0.75, sortiesPerAc:4, avgSortieHrs:sd.avgSortieHrs,
      maintEnabled:false, maintHours:100, maintDays:5, snagRate:0.03,
      // ── Instructors ──
      instructors:sd.instructors, instructorAvail:0.85, sortiesPerInstr:2, studentsPerInstr:4,
      // ── Weather (Thailand monsoon profile, % of days cancelled per month) ──
      weather:Object.assign({},SIM3_WEATHER_DEFAULT),
      // ── Risk: checks, washback, attrition ──
      examinerSlotsPerWeek:5, checkGates:4, checkPassRate:0.85,
      washbackRate:0.15, attritionPerPhase:0.04, phases:4,
      // ── Monte-Carlo ──
      monteCarlo:true, mcTrials:160
    }
  };
}
/* ----- weather factor (fraction of capacity surviving cancellations) ----- */
function sim3WeatherFactor3(ds,s3){const c=s3.weather[sim3MonthNum(ds)]; return sim3Clamp(1-(c==null?0:c),0.05,1);}
/* ----- effective daily capacity: weather × min(aircraft, instructors, airfield) ----- */
function sim3EffectiveCap3(baseCap,ds,s3,fleetUp,hourMode){
  const wF=sim3WeatherFactor3(ds,s3);
  const ac1=Math.max(0,fleetUp)*Math.max(0,s3.sortiesPerAc);
  const in1=Math.max(0,s3.instructors)*sim3Clamp(s3.instructorAvail,0,1)*Math.max(0,s3.sortiesPerInstr);
  const k=hourMode?Math.max(0.1,s3.avgSortieHrs):1;          // convert flight-ceilings to chosen unit
  const acU=ac1*k, inU=in1*k, base=Math.max(0,baseCap);
  const hard=Math.min(acU,inU,base);
  let binding='airfield';
  if(acU<=inU&&acU<=base)binding='aircraft'; else if(inU<=acU&&inU<=base)binding='instructors';
  const eff=wF*hard;
  return {cap:hourMode?eff:Math.floor(eff+1e-9), binding, fleetUp, acU, inU, base, wF};
}
/* ----- washback: inflate a curriculum with repeat sorties so finish reflects repeats ----- */
function sim3InflateCurriculum3(cur,wb){
  if(!cur||!cur.length||!wb||wb<=0)return (cur||[]).slice();
  const extra=Math.round(cur.length*(1/(1-Math.min(wb,0.6))-1));
  if(extra<=0)return cur.slice();
  const out=[];const step=cur.length/extra;let next=step,added=0;
  for(let i=0;i<cur.length;i++){
    out.push(cur[i]);
    while(added<extra&&(i+1)>=next){const b=cur[i]||cur[cur.length-1];out.push({lesson:(b.lesson||"")+"·R",planned_mins:b.planned_mins||60,_repeat:true});added++;next+=step;}
  }
  while(added<extra){const b=cur[cur.length-1];out.push({lesson:(b.lesson||"")+"·R",planned_mins:b.planned_mins||60,_repeat:true});added++;}
  return out;
}
/* ----- examiner-queue finish drag (days), simplified & documented ----- */
function sim3ExaminerDragDays3(s3,activeStudents){
  const gates=Math.max(0,s3.checkGates||0);
  const retakeMul=1+(1-sim3Clamp(s3.checkPassRate,0.3,1));      // failed checks → extra gate demand
  const slots=Math.max(0.2,s3.examinerSlotsPerWeek||1);
  const demand=gates*retakeMul*Math.max(1,activeStudents);
  const weeks=demand/slots;                                      // total examiner-weeks of demand
  // spread across the cohort: per-student wait ≈ concurrency pressure
  const drag=(weeks*7)/Math.max(1,activeStudents)*Math.min(activeStudents,6)*0.5;
  return Math.round(sim3Clamp(drag,0,400));
}
/* ============================================================================
 * runScheduler3 — clone of runScheduler with realism hooks. Never called by SIM1/SIM2.
 * ==========================================================================*/
function runScheduler3(batchData,curricula,extraBatches,startDate,hourMode,weekendCap,holidayCap,cfg,stochastic){
  const s3=cfg.sim3;const{cap,n129,ap129start,horizon}=cfg;
  const ops=getOpDays(startDate||"2026-05-05",horizon,weekendCap,holidayCap,cap);
  const wds=ops.map(o=>o.ds);
  const w129=wds.findIndex(d=>d>=ap129start);
  // washback-inflated curricula (deterministic per-run; MC jitters the rate per trial)
  const wb=stochastic?sim3Clamp(sim3Gauss(s3.washbackRate,0.05),0,0.55):s3.washbackRate;
  const baseCur129=curricula.AP127||curricula.AP126||[];
  const cur={AP124:sim3InflateCurriculum3(curricula.AP124||[],wb),AP126:sim3InflateCurriculum3(curricula.AP126||[],wb),AP127:sim3InflateCurriculum3(curricula.AP127||[],wb)};
  const cur129=sim3InflateCurriculum3(baseCur129,wb);
  const origLen={AP124:(curricula.AP124||[]).length,AP126:(curricula.AP126||[]).length,AP127:(curricula.AP127||[]).length};
  function computeLwM(ld){
    if(!ld||!wds[0])return -99;let cnt=0,d=new Date(ld+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+1);
    const end=new Date(wds[0]+"T12:00:00Z");
    while(d<=end&&cnt<=20){const ds=d.toISOString().slice(0,10);const dw=d.getUTCDay(),isWE=dw===0||dw===6,isHol=HOL.has(ds);let opCap=cap;if(isHol)opCap=holidayCap;else if(isWE)opCap=weekendCap;if(opCap>0)cnt++;d.setUTCDate(d.getUTCDate()+1);}
    return -cnt;
  }
  const iM={},lwM={},lmM={},schM={};
  // already-complete students stay complete (washback inflation must not resurrect graduates)
  ["AP124","AP126","AP127"].forEach(b=>{const st=batchData[b]||[];iM[b]={};lwM[b]={};lmM[b]={};schM[b]={};st.forEach((s,i)=>{const ld=s.flown?.at(-1)?.date||"";const complete=(s.remaining===0)||(s.done>=origLen[b]);iM[b][i]=complete?cur[b].length:s.done;lwM[b][i]=computeLwM(ld);lmM[b][i]=s.flown?.at(-1)?.actual_mins||0;schM[b][i]=[];});});
  iM.AP129={};lwM.AP129={};lmM.AP129={};schM.AP129={};
  for(let i=0;i<n129;i++){iM.AP129[i]=0;lwM.AP129[i]=-99;lmM.AP129[i]=0;schM.AP129[i]=[];}
  extraBatches.forEach(b=>{const k=b.name;iM[k]={};lwM[k]={};lmM[k]={};schM[k]={};for(let i=0;i<(b.n||0);i++){iM[k][i]=0;lwM[k][i]=-99;lmM[k][i]=0;schM[k][i]=[];}});
  const wExtra=extraBatches.map(b=>{const i=wds.findIndex(d=>d>=(b.start||"9999"));return i<0?wds.length:i;});
  function elig(b,curr,wi,overN){
    const tot=curr.length,wl=Math.max(horizon-wi,1),n=overN!==undefined?overN:(b==="AP129"?n129:(batchData[b]||[]).length),out=[];
    for(let i=0;i<n;i++){if(iM[b][i]>=tot)continue;const gap=(cfg.restReg&&lmM[b][i]>=120)?2:1;if((wi-lwM[b][i])<gap)continue;out.push([(tot-iM[b][i])/wl,i]);}
    return out.sort((a,z)=>z[0]-a[0]);
  }
  // ── realism state + accumulators ──
  const tails=[];if(s3.maintEnabled){for(let i=0;i<Math.max(1,Math.round(s3.fleetSize));i++)tails.push({hours:Math.random()*(stochastic?s3.maintHours:0),downUntil:-1});}
  const quickFleetUp=Math.max(0,Math.round(s3.fleetSize*sim3Clamp(stochastic?sim3Gauss(s3.availability,0.06):s3.availability,0.3,0.98)));
  const bindTally={aircraft:0,instructors:0,airfield:0};
  let effSum=0,effDays=0,fleetUpSum=0,totalFlights=0,totalHours=0,lastFlightIdx=-1;
  const supplyDC={};                       // month → {sum, days} of effective cap per op day
  wds.forEach((ds,wi)=>{
    let fleetUp=quickFleetUp;
    if(s3.maintEnabled){const down=tails.reduce((a,t)=>a+(t.downUntil>wi?1:0),0);fleetUp=Math.max(0,tails.length-down);}
    const capObj=sim3EffectiveCap3(ops[wi].cap,ds,s3,fleetUp,hourMode);
    const slots0=capObj.cap;let slots=slots0;
    bindTally[capObj.binding]=(bindTally[capObj.binding]||0)+1;
    effSum+=slots0;effDays++;fleetUpSum+=fleetUp;
    const mo=ds.slice(0,7);if(!supplyDC[mo])supplyDC[mo]={sum:0,days:0};supplyDC[mo].sum+=slots0;supplyDC[mo].days++;
    if(slots>0){
      if(cfg.schedulingMode!=='balanced'){
        priorityOrder(cfg.priority).forEach(b=>{if(slots<=0)return;const cc=cur[b]||[];for(const[,i]of elig(b,cc,wi)){if(slots<=0)break;const ix=iM[b][i];if(ix>=cc.length)continue;const p=cc[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM[b][i].push([ds,p.lesson,p.planned_mins]);lwM[b][i]=wi;lmM[b][i]=p.planned_mins;iM[b][i]=ix+1;slots-=cost;}});
        if(slots>0&&wi>=w129)for(const[,i]of elig("AP129",cur129,wi)){if(slots<=0)break;const ix=iM.AP129[i];if(ix>=cur129.length)continue;const p=cur129[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM.AP129[i].push([ds,p.lesson,p.planned_mins]);lwM.AP129[i]=wi;lmM.AP129[i]=p.planned_mins;iM.AP129[i]=ix+1;slots-=cost;}
        extraBatches.forEach((b,bi)=>{if(slots<=0||wi<wExtra[bi])return;const k=b.name;for(const[,i]of elig(k,cur129,wi,b.n)){if(slots<=0)break;const ix=iM[k][i];if(ix>=cur129.length)continue;const p=cur129[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM[k][i].push([ds,p.lesson,p.planned_mins]);lwM[k][i]=wi;lmM[k][i]=p.planned_mins;iM[k][i]=ix+1;slots-=cost;}});
      }else{
        const ab=[];
        ["AP124","AP126","AP127"].forEach(b=>{const cc=cur[b]||[];const el=elig(b,cc,wi);if(el.length)ab.push({key:b,cur:cc,weight:cfg.batchWeights[b]||1,n:(batchData[b]||[]).length,eligList:el});});
        if(wi>=w129){const el=elig("AP129",cur129,wi);if(el.length)ab.push({key:"AP129",cur:cur129,weight:cfg.batchWeights.AP129||1,n:n129,eligList:el});}
        extraBatches.forEach((b,bi)=>{if(wi<wExtra[bi])return;const k=b.name;const el=elig(k,cur129,wi,b.n);if(el.length)ab.push({key:k,cur:cur129,weight:b.weight||1,n:b.n||0,eligList:el});});
        const alloc=allocateDaySlots(ab.map(b=>({key:b.key,weight:b.weight,n:b.n,eligCount:b.eligList.length})),slots,hourMode);
        let unspent=0;
        ab.forEach(b=>{let quota=alloc[b.key]||0,used=0;for(const[,i]of b.eligList){if(used>=quota)break;const ix=iM[b.key][i];if(ix>=b.cur.length)continue;const p=b.cur[ix];const cost=hourMode?p.planned_mins/60:1;if(cost>quota-used)continue;schM[b.key][i].push([ds,p.lesson,p.planned_mins]);lwM[b.key][i]=wi;lmM[b.key][i]=p.planned_mins;iM[b.key][i]=ix+1;used+=cost;}unspent+=Math.max(0,quota-used);});
        if(unspent>0){for(const b of ab){if(unspent<=0)break;for(const[,i]of b.eligList){if(unspent<=0)break;const ix=iM[b.key][i];if(ix>=b.cur.length)continue;const p=b.cur[ix];const cost=hourMode?p.planned_mins/60:1;if(cost>unspent)continue;schM[b.key][i].push([ds,p.lesson,p.planned_mins]);lwM[b.key][i]=wi;lmM[b.key][i]=p.planned_mins;iM[b.key][i]=ix+1;unspent-=cost;}}}
        slots=unspent;                 // balanced mode tracks consumption via unspent so `used` below is correct
      }
    }
    const used=slots0-slots;
    if(used>1e-9)lastFlightIdx=wi;
    const flightsToday=hourMode?used/Math.max(0.1,s3.avgSortieHrs):used;
    const hoursToday=hourMode?used:used*s3.avgSortieHrs;
    totalFlights+=flightsToday;totalHours+=hoursToday;
    if(s3.maintEnabled&&hoursToday>0){
      const up=tails.filter(t=>t.downUntil<=wi);const per=hoursToday/Math.max(1,up.length);
      up.forEach(t=>{t.hours+=per;if(t.hours>=s3.maintHours){t.downUntil=wi+s3.maintDays;t.hours=0;}else if(stochastic&&Math.random()<s3.snagRate){t.downUntil=wi+2;}});
    }
  });
  // monthly capacity (same shape as runScheduler) for the stacked chart
  const dc={},wpm={};wds.forEach(d=>{const m=d.slice(0,7);wpm[m]=(wpm[m]||0)+1;});
  ["AP124","AP126","AP127","AP129"].forEach(b=>{const n=b==="AP129"?n129:(batchData[b]||[]).length;for(let i=0;i<n;i++)for(const[ds,,mins]of schM[b][i]||[]){const m=ds.slice(0,7);const val=hourMode?(mins||60)/60:1;if(!dc[m])dc[m]={t:0,"124":0,"126":0,"127":0,"129":0};dc[m].t+=val;dc[m][b.replace("AP","")]+=val;}});
  extraBatches.forEach(b=>{for(let i=0;i<(b.n||0);i++)for(const[ds,,mins]of schM[b.name][i]||[]){const m=ds.slice(0,7);const val=hourMode?(mins||60)/60:1;if(!dc[m])dc[m]={t:0,"124":0,"126":0,"127":0,"129":0};dc[m].t+=val;dc[m][b.name]=(dc[m][b.name]||0)+val;}});
  const monthly={};Object.entries(dc).forEach(([m,v])=>{const w=wpm[m]||1;const mo={t:+(v.t/w).toFixed(1),"124":+(v["124"]/w).toFixed(1),"126":+(v["126"]/w).toFixed(1),"127":+(v["127"]/w).toFixed(1),"129":+(v["129"]/w).toFixed(1)};extraBatches.forEach(b=>{mo[b.name]=+((v[b.name]||0)/w).toFixed(1);});monthly[m]=mo;});
  const supplyByMonth={};Object.entries(supplyDC).forEach(([m,v])=>{supplyByMonth[m]=+(v.sum/Math.max(1,v.days)).toFixed(1);});
  // examiner-queue drag applied to each batch's finish date
  function applyDrag(arr,nActive){const drag=sim3ExaminerDragDays3(s3,nActive);if(drag<=0)return;arr.forEach(s=>{if(s.finish&&s.finish!=="COMPLETE"&&s.finish!=="N/A"){const d=new Date(s.finish+"T00:00:00");d.setDate(d.getDate()+drag);s.finish=d.toISOString().slice(0,10);}});}
  function mkSt(b,st,curr,sd){
    if(b==="AP129")return Array.from({length:n129},(_,i)=>({catc_id:"AP129-"+String(i+1).padStart(2,"0"),name:"Student "+String(i+1).padStart(2,"0"),batch:"AP129",done:0,total:curr.length,remaining:curr.length,pct:0,flown:[],next_lesson:curr[0]?.lesson||"",planned:(sd[i]||[]).map(p=>Array.isArray(p)?{date:p[0],lesson:p[1],mins:p[2]}:p),planned_total:(sd[i]||[]).length,finish:(sd[i]||[]).at(-1)?.[0]||"N/A"}));
    const ol=origLen[b]||curr.length;
    return(st||[]).map((s,i)=>{const pl=sd[i]||[];const pl2=pl.map(p=>Array.isArray(p)?{date:p[0],lesson:p[1],mins:p[2]}:p);const done=s.done||0;const complete=(s.remaining===0)||(done>=ol);const tot=complete?done:curr.length;return{...s,total:tot,remaining:complete?0:Math.max(0,tot-done),pct:complete?100:(tot?done/tot*100:0),planned:pl2,planned_total:pl2.length,finish:complete?"COMPLETE":(pl2.at(-1)?.date||"N/A")};});
  }
  const result={ap124:mkSt("AP124",batchData.AP124,cur.AP124,schM.AP124),ap126:mkSt("AP126",batchData.AP126,cur.AP126,schM.AP126),ap127:mkSt("AP127",batchData.AP127,cur.AP127,schM.AP127),ap129:mkSt("AP129",[],cur129,schM.AP129),monthly,cap,hourMode,weekendCap,holidayCap,cur124:cur.AP124,cur126:cur.AP126,cur127:cur.AP127};
  extraBatches.forEach(b=>{result["extra_"+b.name]=Array.from({length:b.n||0},(_,i)=>({catc_id:b.name+"-"+String(i+1).padStart(2,"0"),name:"Student "+String(i+1).padStart(2,"0"),batch:b.name,done:0,total:cur129.length,remaining:cur129.length,pct:0,flown:[],next_lesson:cur129[0]?.lesson||"",planned:(schM[b.name][i]||[]).map(p=>Array.isArray(p)?{date:p[0],lesson:p[1],mins:p[2]}:p),planned_total:(schM[b.name][i]||[]).length,finish:(schM[b.name][i]||[]).at(-1)?.[0]||"N/A"}));});
  result.extra_batches=extraBatches;
  applyDrag(result.ap124,(batchData.AP124||[]).length);applyDrag(result.ap126,(batchData.AP126||[]).length);applyDrag(result.ap127,(batchData.AP127||[]).length);applyDrag(result.ap129,n129);
  extraBatches.forEach(b=>applyDrag(result["extra_"+b.name],b.n||0));
  const opDaysActive=Math.max(1,lastFlightIdx+1);
  const fleetUpAvg=effDays?fleetUpSum/effDays:quickFleetUp;
  result.sim3={
    bindTally, effCapAvg:effDays?effSum/effDays:0, supplyByMonth,
    totalFlights:Math.round(totalFlights), totalHours:Math.round(totalHours),
    opDaysActive, opDaysTotal:wds.length, fleetUpAvg:sim3Round1(fleetUpAvg),
    sortiesPerDay:sim3Round1(totalFlights/opDaysActive),
    hrsPerAcPerDay:sim3Round1(totalHours/Math.max(0.1,fleetUpAvg*opDaysActive)),
    washbackUsed:+wb.toFixed(3)
  };
  return result;
}
/* ============================================================================
 * Monte-Carlo P50/P90 — chunked so the UI never freezes.
 * ==========================================================================*/
function sim3MonteCarlo3(cfg,onDone,onProgress){
  const s3=cfg.sim3;const trials=Math.max(20,Math.min(500,s3.mcTrials||160));
  const bd={AP124:G.ap124||[],AP126:G.ap126||[],AP127:G.ap127||[]};
  const cur={AP124:G.cur124||[],AP126:G.cur126||[],AP127:G.cur127||[]};
  const _d=new Date(Date.now()+7*3600000);_d.setUTCDate(_d.getUTCDate()+1);const tomorrowBKK=_d.toISOString().slice(0,10);
  const keys=["ap124","ap126","ap127","ap129"];
  const samples={ap124:[],ap126:[],ap127:[],ap129:[],overall:[]};
  const token=++SIM3_MC_TOKEN;SIM3_MC_RUNNING=true;
  let done=0;
  function batchRun(){
    if(token!==SIM3_MC_TOKEN)return;                  // superseded — abort silently
    const t0=Date.now();
    while(done<trials&&(Date.now()-t0)<28){
      const jc=sim3Clone(cfg);
      jc.sim3.availability=sim3Clamp(sim3Gauss(s3.availability,0.06),0.3,0.98);
      jc.sim3.instructorAvail=sim3Clamp(sim3Gauss(s3.instructorAvail,0.05),0.4,0.99);
      Object.keys(jc.sim3.weather).forEach(m=>{jc.sim3.weather[m]=sim3Clamp(sim3Gauss(s3.weather[m],0.08),0,0.92);});
      const r=runScheduler3(bd,cur,(cfg._extras||[]),tomorrowBKK,cfg.hourMode||false,cfg.weekendCap,cfg.holidayCap,jc,true);
      let overall=null;
      keys.forEach(k=>{const fins=(r[k]||[]).map(s=>s.finish).filter(f=>f&&f!=="COMPLETE"&&f!=="N/A").sort();const last=fins.at(-1)||null;if(last){samples[k].push(last);if(!overall||last>overall)overall=last;}});
      if(overall)samples.overall.push(overall);
      done++;
    }
    onProgress&&onProgress(done,trials);
    if(done<trials){ (window.requestIdleCallback||window.requestAnimationFrame||(cb=>setTimeout(cb,0)))(batchRun); }
    else{
      SIM3_MC_RUNNING=false;
      const pct=(arr,p)=>{if(!arr.length)return null;const s=arr.slice().sort();return s[sim3Clamp(Math.floor(p/100*s.length),0,s.length-1)];};
      const out={};["ap124","ap126","ap127","ap129","overall"].forEach(k=>{out[k]={p50:pct(samples[k],50),p90:pct(samples[k],90),n:samples[k].length};});
      out.trials=trials;onDone&&onDone(out);
    }
  }
  (window.requestIdleCallback||window.requestAnimationFrame||(cb=>setTimeout(cb,0)))(batchRun);
}
/* ============================================================================
 * KPI bundle for a scenario result.
 * ==========================================================================*/
function sim3LastFinish3(arr){const f=(arr||[]).map(s=>s.finish).filter(x=>x&&x!=="COMPLETE"&&x!=="N/A").sort();return f.at(-1)||null;}
function sim3ComputeKpis3(result,cfg){
  const today=ap127TodayBKK();const s3=cfg.sim3;const r3=result.sim3||{};
  const grad={AP124:sim3LastFinish3(result.ap124),AP126:sim3LastFinish3(result.ap126),AP127:sim3LastFinish3(result.ap127),AP129:sim3LastFinish3(result.ap129)};
  (result.extra_batches||[]).forEach(b=>{grad[b.name]=sim3LastFinish3(result["extra_"+b.name]);});
  const allFins=Object.values(grad).filter(Boolean).sort();const overall=allFins.at(-1)||null;
  const dleft=overall?ap127DateDiff(overall,today):null;
  const ttgMo=dleft!=null?Math.max(0,Math.ceil(dleft/30.4)):null;
  // utilizations
  const instrCeilDay=Math.max(0.1,s3.instructors*sim3Clamp(s3.instructorAvail,0,1)*s3.sortiesPerInstr);
  const instrUtil=sim3Clamp((r3.sortiesPerDay||0)/instrCeilDay*100,0,200);
  const hrsBand=r3.hrsPerAcPerDay||0;
  const fleetUtilStatus=hrsBand>6?'high':(hrsBand<3?'low':'ok');
  // binding mix
  const bt=r3.bindTally||{aircraft:0,instructors:0,airfield:0};const btTot=Math.max(1,bt.aircraft+bt.instructors+bt.airfield);
  const bindOrder=[['aircraft',bt.aircraft],['instructors',bt.instructors],['airfield',bt.airfield]].sort((a,b)=>b[1]-a[1]);
  const bindTop=bindOrder[0];const bindLbl={aircraft:'AIRCRAFT',instructors:'INSTRUCTORS',airfield:'AIRFIELD CAP'}[bindTop[0]];
  // at-risk: didn't finish within horizon
  let atRisk=0,totalStu=0;["ap124","ap126","ap127","ap129"].forEach(k=>{(result[k]||[]).forEach(s=>{totalStu++;if(!s.finish||s.finish==="N/A")atRisk++;});});
  (result.extra_batches||[]).forEach(b=>{(result["extra_"+b.name]||[]).forEach(s=>{totalStu++;if(!s.finish||s.finish==="N/A")atRisk++;});});
  // graduates delivered (attrition)
  const overallAttr=1-Math.pow(1-sim3Clamp(s3.attritionPerPhase,0,0.5),Math.max(1,s3.phases||4));
  const grads=Math.round(totalStu*(1-overallAttr));
  return {grad,overall,ttgMo,dleft,instrUtil:sim3Round1(instrUtil),hrsPerAcPerDay:hrsBand,fleetUtilStatus,sortiesPerDay:r3.sortiesPerDay||0,bindTop:bindTop[0],bindLbl,bindPct:Math.round(bindTop[1]/btTot*100),bindTally:bt,atRisk,totalStu,grads,overallAttr:Math.round(overallAttr*100),washbackUsed:r3.washbackUsed,mc:null};
}
/* ============================================================================
 * Scenario lifecycle — create / run / compare / persist.
 * ==========================================================================*/
function sim3ActiveScenario3(){return SIM3_SCENARIOS.find(s=>s.id===SIM3_ACTIVE_ID)||null;}
function sim3BaselineScenario3(){return SIM3_SCENARIOS.find(s=>s.id===SIM3_BASELINE_ID)||SIM3_SCENARIOS[0]||null;}
function sim3NewId3(){return Date.now()+Math.floor(Math.random()*1000);}
function sim3NewScenario3(name,cfg,color){const c=sim3Clone(cfg);if(!c._extras)c._extras=[];return {id:sim3NewId3(),name,color:color||SIM3_SCN_COLORS[SIM3_SCENARIOS.length%SIM3_SCN_COLORS.length],pinned:true,cfg:c,result:null,kpis:null,mc:null,mcRunning:false,annotations:[]};}
function sim3SetActive3(id){const scn=SIM3_SCENARIOS.find(s=>s.id===id);if(!scn)return;SIM3_ACTIVE_ID=id;SIM3_CFG=scn.cfg;if(!SIM3_CFG._extras)SIM3_CFG._extras=[];SIM3_EXTRA_BATCHES=SIM3_CFG._extras;}
function sim3SeedBaseline3(){const cfg=sim3DefaultCfg3();cfg._extras=[];const scn=sim3NewScenario3("Baseline",cfg,SIM3_SCN_COLORS[0]);SIM3_SCENARIOS=[scn];SIM3_BASELINE_ID=scn.id;sim3SetActive3(scn.id);}
function sim3DetRun3(scn){
  if(!G)return;
  const bd={AP124:G.ap124||[],AP126:G.ap126||[],AP127:G.ap127||[]};
  const cur={AP124:G.cur124||[],AP126:G.cur126||[],AP127:G.cur127||[]};
  const _d=new Date(Date.now()+7*3600000);_d.setUTCDate(_d.getUTCDate()+1);const tomorrowBKK=_d.toISOString().slice(0,10);
  const ex=scn.cfg._extras||[];
  scn.result=runScheduler3(bd,cur,ex,tomorrowBKK,scn.cfg.hourMode||false,scn.cfg.weekendCap,scn.cfg.holidayCap,scn.cfg,false);
  scn.result.ap127?.forEach((s,i)=>{s.nick=AP127_NICKS[i]||"";s.fi=AP127_FI[i]||"";s.se=AP127_SE[i]||"";});
  scn.kpis=sim3ComputeKpis3(scn.result,scn.cfg);
  if(scn.mc&&scn.kpis)scn.kpis.mc=scn.mc;          // keep last MC band until refreshed
}
function sim3RunMC3(scn){
  if(!scn||!scn.cfg.sim3.monteCarlo){scn.mcRunning=false;return;}
  scn.mcRunning=true;sim3RenderHero3();
  const cfg=sim3Clone(scn.cfg);cfg._extras=scn.cfg._extras||[];
  sim3MonteCarlo3(cfg,(mc)=>{scn.mc=mc;scn.mcRunning=false;if(scn.kpis)scn.kpis.mc=mc;sim3RenderHero3();sim3RenderScenarioCards3();sim3RenderFinish3();const pb=document.getElementById('s3-mc-bar');if(pb)pb.style.width='0%';},(d,t)=>{const pb=document.getElementById('s3-mc-bar');if(pb)pb.style.width=Math.round(d/t*100)+'%';});
}
function sim3RunAll3(){SIM3_SCENARIOS.forEach(scn=>sim3DetRun3(scn));const a=sim3ActiveScenario3();if(a)sim3RunMC3(a);sim3SaveAll3();}
function runSimulation3(){if(!G){toast("No data");return;}sim3RunAll3();sim3RenderHero3();sim3RenderScenarioStrip3();sim3RenderComparison3();sim3BuildCapacityChart3();sim3RenderFinish3();toast("Simulation 3 complete");}
let _sim3Deb=null;
function sim3LiveRecompute3(){
  const scn=sim3ActiveScenario3();if(!scn)return;
  sim3DetRun3(scn);
  sim3RenderHero3();sim3RenderScenarioStrip3();sim3RenderComparison3();sim3BuildCapacityChart3();sim3RenderFinish3();
  clearTimeout(_sim3Deb);
  if(scn.cfg.sim3.monteCarlo){scn.mcRunning=true;_sim3Deb=setTimeout(()=>sim3RunMC3(scn),450);}
  sim3SaveAll3();
}
function sim3AddScenario3(presetKey){
  const base=sim3ActiveScenario3()||sim3BaselineScenario3();
  const cfg=sim3Clone(base?base.cfg:sim3DefaultCfg3());
  let name="Scenario "+(SIM3_SCENARIOS.length+1);
  if(presetKey&&SIM3_PRESETS[presetKey]){SIM3_PRESETS[presetKey].apply(cfg);name=SIM3_PRESETS[presetKey].label;}
  const scn=sim3NewScenario3(name,cfg);SIM3_SCENARIOS.push(scn);sim3SetActive3(scn.id);
  sim3RenderControls3();sim3DetRun3(scn);sim3RunMC3(scn);
  sim3RenderHero3();sim3RenderScenarioStrip3();sim3RenderComparison3();sim3BuildCapacityChart3();sim3RenderFinish3();sim3SaveAll3();
}
function sim3DeleteScenario3(id){
  if(SIM3_SCENARIOS.length<=1)return;
  SIM3_SCENARIOS=SIM3_SCENARIOS.filter(s=>s.id!==id);
  if(SIM3_BASELINE_ID===id)SIM3_BASELINE_ID=SIM3_SCENARIOS[0].id;
  if(SIM3_ACTIVE_ID===id)sim3SetActive3(SIM3_SCENARIOS[0].id);
  sim3RenderControls3();sim3RenderHero3();sim3RenderScenarioStrip3();sim3RenderComparison3();sim3BuildCapacityChart3();sim3RenderFinish3();sim3SaveAll3();
}
function sim3DuplicateScenario3(id){const src=SIM3_SCENARIOS.find(s=>s.id===id);if(!src)return;const scn=sim3NewScenario3(src.name+" copy",src.cfg);SIM3_SCENARIOS.push(scn);sim3SetActive3(scn.id);sim3RenderControls3();sim3DetRun3(scn);sim3RunMC3(scn);sim3RenderScenarioStrip3();sim3RenderComparison3();sim3RenderHero3();sim3SaveAll3();}
function sim3SetBaseline3(id){SIM3_BASELINE_ID=id;sim3RenderScenarioStrip3();sim3RenderComparison3();sim3RenderHero3();sim3SaveAll3();}
function sim3PinScenario3(id){const s=SIM3_SCENARIOS.find(x=>x.id===id);if(s){s.pinned=!s.pinned;sim3RenderScenarioStrip3();sim3RenderComparison3();sim3SaveAll3();}}
function sim3RenameScenario3(id,name){const s=SIM3_SCENARIOS.find(x=>x.id===id);if(s){s.name=name;sim3SaveAll3();sim3RenderScenarioStrip3();sim3RenderComparison3();}}
function sim3SelectScenario3(id){sim3SetActive3(id);sim3RenderControls3();sim3RenderHero3();sim3RenderScenarioStrip3();sim3RenderComparison3();sim3BuildCapacityChart3();sim3RenderFinish3();const a=sim3ActiveScenario3();if(a&&a.cfg.sim3.monteCarlo&&!a.mc)sim3RunMC3(a);}
function sim3ResetDefaults3(){const scn=sim3ActiveScenario3();if(!scn)return;const d=sim3DefaultCfg3();d._extras=[];scn.cfg=d;sim3SetActive3(scn.id);sim3RenderControls3();sim3DetRun3(scn);sim3RunMC3(scn);sim3RenderHero3();sim3RenderScenarioStrip3();sim3RenderComparison3();sim3BuildCapacityChart3();sim3RenderFinish3();sim3SaveAll3();}
function sim3SaveAll3(){try{localStorage.setItem(SIM3_LS_KEY,JSON.stringify({scenarios:SIM3_SCENARIOS.map(s=>({id:s.id,name:s.name,color:s.color,pinned:s.pinned,cfg:s.cfg,annotations:s.annotations||[]})),baseline:SIM3_BASELINE_ID,active:SIM3_ACTIVE_ID}));}catch(e){}}
function sim3RestoreAll3(){
  try{const raw=localStorage.getItem(SIM3_LS_KEY);if(!raw)return false;const o=JSON.parse(raw);if(!o.scenarios||!o.scenarios.length)return false;
    SIM3_SCENARIOS=o.scenarios.map(s=>{const c=s.cfg;if(!c.sim3)return null;if(!c._extras)c._extras=[];if(!c.sim3.weather)c.sim3.weather=Object.assign({},SIM3_WEATHER_DEFAULT);return {id:s.id,name:s.name,color:s.color,pinned:s.pinned!==false,cfg:c,result:null,kpis:null,mc:null,mcRunning:false,annotations:s.annotations||[]};}).filter(Boolean);
    if(!SIM3_SCENARIOS.length)return false;
    SIM3_BASELINE_ID=o.baseline&&SIM3_SCENARIOS.some(s=>s.id===o.baseline)?o.baseline:SIM3_SCENARIOS[0].id;
    const act=o.active&&SIM3_SCENARIOS.some(s=>s.id===o.active)?o.active:SIM3_SCENARIOS[0].id;sim3SetActive3(act);return true;
  }catch(e){return false;}
}
/* ----- control input handlers (mutate active cfg, then live-recompute) ----- */
function sim3Field3(path,val,labelId,decimals){
  if(!SIM3_CFG)return;const parts=path.split('.');let o=SIM3_CFG;for(let i=0;i<parts.length-1;i++)o=o[parts[i]];o[parts[parts.length-1]]=+val;
  if(labelId){const el=document.getElementById(labelId);if(el)el.textContent=decimals==='pct'?Math.round(+val*100)+'%':(decimals!=null?(+val).toFixed(decimals):val);}
  sim3LiveRecompute3();
}
function sim3SetAp129Start3(val){if(!SIM3_CFG)return;SIM3_CFG.ap129start=val;sim3LiveRecompute3();}
function sim3Weather3(month,val,labelId){if(!SIM3_CFG)return;SIM3_CFG.sim3.weather[month]=+val;const el=document.getElementById(labelId);if(el)el.textContent=Math.round(+val*100)+'%';sim3LiveRecompute3();}
function sim3Toggle3(path,checked){if(!SIM3_CFG)return;const parts=path.split('.');let o=SIM3_CFG;for(let i=0;i<parts.length-1;i++)o=o[parts[i]];o[parts[parts.length-1]]=!!checked;sim3LiveRecompute3();}
function sim3OnMcToggle3(checked){if(!SIM3_CFG)return;SIM3_CFG.sim3.monteCarlo=!!checked;const scn=sim3ActiveScenario3();if(checked&&scn)sim3RunMC3(scn);else{if(scn){scn.mc=null;if(scn.kpis)scn.kpis.mc=null;}sim3RenderHero3();sim3RenderFinish3();sim3RenderScenarioCards3();}sim3SaveAll3();}
function sim3OnHardCapInput3(val){if(!SIM3_CFG)return;SIM3_CFG.cap=+val;document.getElementById('s3-cap-v').textContent=val;sim3LiveRecompute3();}
function sim3OnModeChange3(mode){if(!SIM3_CFG)return;SIM3_CFG.schedulingMode=mode;sim3RenderModeUI3();sim3LiveRecompute3();}
function sim3OnWeightChange3(batch,val){if(!SIM3_CFG)return;SIM3_CFG.batchWeights[batch]=sim3Clamp(+val,0.5,3);document.getElementById('s3-wt-v-'+batch).textContent=(+val).toFixed(1);sim3LiveRecompute3();}
function sim3ResetWeights3(){if(!SIM3_CFG)return;SIM3_CFG.batchWeights={AP124:1,AP126:1,AP127:1,AP129:1};["AP124","AP126","AP127","AP129"].forEach(b=>{const el=document.getElementById('s3-wt-'+b);if(el){el.value=1;document.getElementById('s3-wt-v-'+b).textContent='1.0';}});sim3LiveRecompute3();}
function sim3OnPriorityChange3(val){if(!SIM3_CFG)return;SIM3_CFG.priority=(SIM3_CFG.priority===val)?null:val;sim3RenderModeUI3();sim3LiveRecompute3();}
function sim3RenderModeUI3(){
  if(!SIM3_CFG)return;const isB=SIM3_CFG.schedulingMode==='balanced';
  ['balanced','priority'].forEach(m=>{const btn=document.getElementById('s3-mode-'+m);if(!btn)return;const active=(m==='balanced')===isB;const col=m==='balanced'?'var(--c129)':'var(--c127)';btn.style.border=`1px solid ${active?col:'var(--bd)'}`;btn.style.background=active?`color-mix(in oklch,${col} 16%,var(--s1))`:'transparent';btn.style.color=active?col:'var(--tx3)';btn.style.fontWeight=active?'600':'400';});
  const wt=document.getElementById('s3-weight-panel'),pr=document.getElementById('s3-priority-panel');if(wt)wt.style.display=isB?'':'none';if(pr)pr.style.display=isB?'none':'';
  ['ap126','ap126_ap127','ap127'].forEach(v=>{const el=document.getElementById('s3-pri-'+v);if(!el)return;const active=SIM3_CFG.priority===v;el.style.border=`1px solid ${active?'var(--c127)':'var(--bd)'}`;el.style.background=active?'color-mix(in oklch,var(--c127) 14%,var(--s1))':'transparent';el.style.color=active?'var(--c127)':'var(--tx3)';});
}
function sim3OnHourMode3(isHour){
  if(!SIM3_CFG)return;SIM3_CFG.hourMode=isHour;
  const capEl=document.getElementById('s3-cap');
  if(capEl){if(isHour){capEl.max="240";capEl.step="5";if(SIM3_CFG.cap<60)SIM3_CFG.cap=Math.round(SIM3_CFG.cap*SIM3_CFG.sim3.avgSortieHrs);}else{capEl.max="60";capEl.step="1";if(SIM3_CFG.cap>60)SIM3_CFG.cap=Math.round(SIM3_CFG.cap/SIM3_CFG.sim3.avgSortieHrs);}capEl.value=SIM3_CFG.cap;document.getElementById('s3-cap-v').textContent=SIM3_CFG.cap;}
  const u=document.getElementById('s3-cap-unit');if(u)u.textContent=isHour?'hrs/day':'/day';
  sim3LiveRecompute3();
}
/* ----- extra batches (per-scenario, stored in active cfg._extras) ----- */
function sim3AddExtra3(){if(!SIM3_CFG)return;const idx=SIM3_CFG._extras.length%EXTRA_COLORS.length;SIM3_CFG._extras.push({id:sim3NewId3(),name:"APXXX",n:10,start:"2026-07-01",color:EXTRA_COLORS[idx],weight:1.0});sim3RenderExtraList3();sim3LiveRecompute3();}
function sim3RemoveExtra3(id){if(!SIM3_CFG)return;SIM3_CFG._extras=SIM3_CFG._extras.filter(b=>b.id!==id);SIM3_EXTRA_BATCHES=SIM3_CFG._extras;sim3RenderExtraList3();sim3LiveRecompute3();}
function sim3UpdateExtra3(id,key,val){if(!SIM3_CFG)return;const b=SIM3_CFG._extras.find(x=>x.id===id);if(b)b[key]=(key==='n')?Math.max(1,+val||1):(key==='weight')?sim3Clamp(+val||1,0.1,5):val;sim3LiveRecompute3();}
function sim3RenderExtraList3(){
  const el=document.getElementById("s3-extra-list");if(!el)return;const ex=(SIM3_CFG&&SIM3_CFG._extras)||[];
  el.innerHTML=ex.map(b=>`<div class="sim-extra-row">
    <div class="sim-extra-badge" style="background:${b.color}"></div>
    <input style="width:90px" placeholder="Name" value="${escHtml(b.name)}" oninput="sim3UpdateExtra3(${b.id},'name',this.value)">
    <input type="number" style="width:60px" min="1" max="60" value="${b.n}" oninput="sim3UpdateExtra3(${b.id},'n',+this.value)">
    <input style="width:112px" placeholder="YYYY-MM-DD" value="${escHtml(b.start)}" oninput="sim3UpdateExtra3(${b.id},'start',this.value)">
    <span style="font-size:9px;color:var(--tx3)">wt</span>
    <input type="number" style="width:50px" min="0.1" max="5" step="0.1" value="${(b.weight||1).toFixed(1)}" oninput="sim3UpdateExtra3(${b.id},'weight',+this.value)">
    <button class="sim-extra-del" onclick="sim3RemoveExtra3(${b.id})">✕</button>
  </div>`).join("");
}
/* ============================================================================
 * SIM3 render layer — controls, hero KPIs, scenario strip, comparison, finish.
 * ==========================================================================*/
function sim3SetCtl3(id,val,labelId,decimals,pct){const el=document.getElementById(id);if(el)el.value=val;if(labelId){const l=document.getElementById(labelId);if(l)l.textContent=pct?Math.round(val*100)+'%':(decimals!=null?(+val).toFixed(decimals):val);}}
function sim3RenderControls3(){
  if(!SIM3_CFG)return;const s=SIM3_CFG.sim3;
  sim3SetCtl3('s3-cap',SIM3_CFG.cap,'s3-cap-v');
  const cu=document.getElementById('s3-cap-unit');if(cu)cu.textContent=SIM3_CFG.hourMode?'hrs/day':'/day';
  sim3SetCtl3('s3-hor',SIM3_CFG.horizon,'s3-hor-v');
  sim3SetCtl3('s3-wecap',SIM3_CFG.weekendCap,'s3-wecap-v');
  sim3SetCtl3('s3-holcap',SIM3_CFG.holidayCap,'s3-holcap-v');
  const r=document.getElementById('s3-rest-reg');if(r)r.checked=SIM3_CFG.restReg;
  const hm=document.getElementById('s3-hour-mode');if(hm)hm.checked=SIM3_CFG.hourMode;
  const s129=document.getElementById('s3-129s');if(s129)s129.value=SIM3_CFG.ap129start;
  sim3SetCtl3('s3-fleetSize',s.fleetSize,'s3-fleetSize-v');
  sim3SetCtl3('s3-availability',s.availability,'s3-availability-v',null,true);
  sim3SetCtl3('s3-sortiesPerAc',s.sortiesPerAc,'s3-sortiesPerAc-v',1);
  sim3SetCtl3('s3-avgSortieHrs',s.avgSortieHrs,'s3-avgSortieHrs-v',1);
  const me=document.getElementById('s3-maint');if(me)me.checked=s.maintEnabled;
  sim3SetCtl3('s3-maintHours',s.maintHours,'s3-maintHours-v');
  sim3SetCtl3('s3-maintDays',s.maintDays,'s3-maintDays-v');
  sim3SetCtl3('s3-snagRate',s.snagRate,'s3-snagRate-v',null,true);
  sim3SetCtl3('s3-instructors',s.instructors,'s3-instructors-v');
  sim3SetCtl3('s3-instructorAvail',s.instructorAvail,'s3-instructorAvail-v',null,true);
  sim3SetCtl3('s3-sortiesPerInstr',s.sortiesPerInstr,'s3-sortiesPerInstr-v',1);
  sim3SetCtl3('s3-studentsPerInstr',s.studentsPerInstr,'s3-studentsPerInstr-v');
  sim3SetCtl3('s3-examinerSlotsPerWeek',s.examinerSlotsPerWeek,'s3-examinerSlotsPerWeek-v');
  sim3SetCtl3('s3-checkGates',s.checkGates,'s3-checkGates-v');
  sim3SetCtl3('s3-checkPassRate',s.checkPassRate,'s3-checkPassRate-v',null,true);
  sim3SetCtl3('s3-washbackRate',s.washbackRate,'s3-washbackRate-v',null,true);
  sim3SetCtl3('s3-attritionPerPhase',s.attritionPerPhase,'s3-attritionPerPhase-v',null,true);
  const mc=document.getElementById('s3-mc');if(mc)mc.checked=s.monteCarlo;
  sim3SetCtl3('s3-mcTrials',s.mcTrials,'s3-mcTrials-v');
  ["AP124","AP126","AP127","AP129"].forEach(b=>sim3SetCtl3('s3-wt-'+b,SIM3_CFG.batchWeights[b]||1,'s3-wt-v-'+b,1));
  sim3RenderWeather3();sim3RenderExtraList3();sim3RenderModeUI3();
}
function sim3RenderWeather3(){
  const el=document.getElementById('s3-weather-grid');if(!el||!SIM3_CFG)return;
  const mon=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  el.innerHTML=mon.map((m,i)=>{const mm=i+1;const v=SIM3_CFG.sim3.weather[mm]||0;const hot=v>=0.3;return `<div class="s3-wx${hot?' hot':''}"><div class="s3-wx-m">${m}</div><input type="range" min="0" max="0.8" step="0.02" value="${v}" oninput="sim3Weather3(${mm},this.value,'s3-wx-v-${mm}')"><div class="s3-wx-v" id="s3-wx-v-${mm}">${Math.round(v*100)}%</div></div>`;}).join('');
}
/* ----- delta helpers ----- */
function sim3WeeksBetween3(a,b){const d=ap127DateDiff(a,b);return d==null?null:Math.round(d/7);}
function sim3DeltaDate3(activeDate,baseDate){
  if(!activeDate||!baseDate)return null;const w=sim3WeeksBetween3(activeDate,baseDate);if(w==null)return null;
  if(w===0)return{txt:'±0',color:'var(--tx3)',arrow:'='};
  const earlier=w<0;return{txt:(earlier?'−':'+')+Math.abs(w)+'w',color:earlier?'var(--done)':'#f87171',arrow:earlier?'▲':'▼'};
}
function sim3DeltaNum3(active,base,goodHigh,unit,dec){
  if(active==null||base==null)return null;const d=active-base;if(Math.abs(d)<(dec?0.05:0.5))return{txt:'±0',color:'var(--tx3)',arrow:'='};
  const good=goodHigh?d>0:d<0;return{txt:(d>0?'+':'')+(dec?d.toFixed(1):Math.round(d))+(unit||''),color:good?'var(--done)':'#f87171',arrow:d>0?'▲':'▼'};
}
/* ----- hero KPI row ----- */
function sim3KCard3(lbl,big,sub,accent,delta,extra){
  const d=delta?`<div class="s3-kpi-delta" style="color:${delta.color}">${delta.arrow} ${delta.txt} <span style="color:var(--tx3)">vs baseline</span></div>`:'';
  return `<div class="s3-kpi" style="border-top-color:${accent||'var(--c129)'}"><div class="s3-kpi-lbl">${lbl}</div><div class="s3-kpi-big" style="color:${accent||'var(--tx)'}">${big}</div><div class="s3-kpi-sub">${sub||''}</div>${d}${extra||''}</div>`;
}
function sim3RenderHero3(){
  const host=document.getElementById('s3-hero');if(!host)return;
  const base=sim3BaselineScenario3();
  const scn=(SIM3_PRESENT&&SIM3_BEFORE_AFTER&&base)?base:sim3ActiveScenario3();
  if(!scn||!scn.kpis){host.innerHTML='<div class="sim-hint">Run a scenario to see KPIs…</div>';return;}
  const k=scn.kpis,bk=(base&&base.kpis)?base.kpis:null,isBase=base&&scn.id===base.id;
  const col=scn.color;
  const mcLine=k.mc&&k.mc.overall&&k.mc.overall.p50?`<div class="s3-kpi-mc">P50 <b>${fm(k.mc.overall.p50)}</b> · P90 <b style="color:#f87171">${fm(k.mc.overall.p90)}</b></div>`:(scn.mcRunning?`<div class="s3-kpi-mc s3-mc-run">running Monte-Carlo…<div class="s3-mc-track"><div id="s3-mc-bar" class="s3-mc-fill"></div></div></div>`:'');
  const bandClr={ok:'var(--done)',high:'#f87171',low:'#fbbf24'}[k.fleetUtilStatus]||'var(--tx)';
  const bandTxt={ok:'healthy 4–6h',high:'over-stretched',low:'under-utilised'}[k.fleetUtilStatus]||'';
  let html='';
  html+=sim3KCard3('PROJECTED GRADUATION',fm(k.overall),'all batches complete',col,(!isBase&&bk)?sim3DeltaDate3(k.overall,bk.overall):null,mcLine);
  html+=sim3KCard3('TIME TO GRADUATE',(k.ttgMo!=null?k.ttgMo+' mo':'—'),'from today',col,(!isBase&&bk)?sim3DeltaNum3(k.ttgMo,bk.ttgMo,false,'mo'):null);
  html+=sim3KCard3('BINDING CONSTRAINT',k.bindLbl,k.bindPct+'% of operating days',(k.bindTop==='instructors'?'#f87171':k.bindTop==='aircraft'?'#60a5fa':'var(--c129)'),null,'<div class="s3-kpi-sub" style="margin-top:4px;color:var(--tx3)">the lever to pull first</div>');
  html+=sim3KCard3('FLEET LOAD',k.hrsPerAcPerDay+' h','per aircraft / day',bandClr,(!isBase&&bk)?sim3DeltaNum3(k.hrsPerAcPerDay,bk.hrsPerAcPerDay,false,'h',true):null,`<div class="s3-kpi-sub" style="color:${bandClr}">${bandTxt}</div>`);
  html+=sim3KCard3('INSTRUCTOR UTIL',k.instrUtil+' %','of instructor sortie ceiling','#a78bfa',(!isBase&&bk)?sim3DeltaNum3(k.instrUtil,bk.instrUtil,false,'%'):null);
  html+=sim3KCard3('GRADUATES DELIVERED',k.grads+' / '+k.totalStu,k.atRisk+' at-risk · '+k.overallAttr+'% attrition','var(--done)',(!isBase&&bk)?sim3DeltaNum3(k.grads,bk.grads,true,''):null);
  host.innerHTML=html;
}
/* ----- scenario manager strip ----- */
function sim3RenderScenarioStrip3(){
  const host=document.getElementById('s3-scn-strip');if(!host)return;const base=sim3BaselineScenario3();
  host.innerHTML=SIM3_SCENARIOS.map(s=>{
    const active=s.id===SIM3_ACTIVE_ID,isB=base&&s.id===base.id;
    const grad=s.kpis?fm(s.kpis.overall):'—';
    return `<div class="s3-chip${active?' active':''}" style="border-color:${active?s.color:'var(--bd)'}">
      <span class="s3-chip-sw" style="background:${s.color}"></span>
      <span class="s3-chip-body" onclick="sim3SelectScenario3(${s.id})">
        <input class="s3-chip-name" value="${escHtml(s.name)}" onchange="sim3RenameScenario3(${s.id},this.value)" onclick="event.stopPropagation()">
        <span class="s3-chip-grad">${grad}${isB?' · <b style="color:var(--c129)">BASE</b>':''}${s.mcRunning?' · <span style="color:#fbbf24">MC…</span>':''}</span>
      </span>
      <span class="s3-chip-acts">
        <button title="Set as baseline" class="s3-ib${isB?' on':''}" onclick="sim3SetBaseline3(${s.id})">★</button>
        <button title="Pin to overlay" class="s3-ib${s.pinned?' on':''}" onclick="sim3PinScenario3(${s.id})">📌</button>
        <button title="Duplicate" class="s3-ib" onclick="sim3DuplicateScenario3(${s.id})">⧉</button>
        <button title="Delete" class="s3-ib" onclick="sim3DeleteScenario3(${s.id})" ${SIM3_SCENARIOS.length<=1?'disabled':''}>✕</button>
      </span>
    </div>`;
  }).join('');
}
/* ----- comparison: tab router + scenario cards ----- */
function sim3SetCompareTab3(tab){SIM3_COMPARE_TAB=tab;sim3RenderComparison3();}
function sim3RenderComparison3(){
  ['cards','timeline','tornado','waterfall'].forEach(t=>{const b=document.getElementById('s3-cmp-tab-'+t);if(b){const on=t===SIM3_COMPARE_TAB;b.style.background=on?'color-mix(in oklch,var(--c129) 16%,var(--s1))':'transparent';b.style.color=on?'var(--c129)':'var(--tx3)';b.style.borderColor=on?'var(--c129)':'var(--bd)';b.style.fontWeight=on?'600':'400';}});
  ['cards','timeline','tornado','waterfall'].forEach(t=>{const p=document.getElementById('s3-cmp-'+t);if(p)p.style.display=(t===SIM3_COMPARE_TAB)?'':'none';});
  if(SIM3_COMPARE_TAB==='cards')sim3RenderScenarioCards3();
  else if(SIM3_COMPARE_TAB==='timeline')sim3RenderOverlayTimeline3();
  else if(SIM3_COMPARE_TAB==='tornado')sim3BuildTornado3();
  else if(SIM3_COMPARE_TAB==='waterfall')sim3BuildWaterfall3();
}
function sim3CmpRow3(label,val,delta){const d=delta?`<span class="s3-cc-d" style="color:${delta.color}">${delta.arrow}${delta.txt}</span>`:'';return `<div class="s3-cc-row"><span class="s3-cc-l">${label}</span><span class="s3-cc-v">${val}${d}</span></div>`;}
function sim3RenderScenarioCards3(){
  const host=document.getElementById('s3-cmp-cards');if(!host)return;const base=sim3BaselineScenario3();const bk=base&&base.kpis?base.kpis:null;
  host.innerHTML=SIM3_SCENARIOS.map(s=>{
    if(!s.kpis)return `<div class="s3-cc" style="border-top-color:${s.color}"><div class="s3-cc-h" style="color:${s.color}">${escHtml(s.name)}</div><div class="sim-hint">not run</div></div>`;
    const k=s.kpis,isB=base&&s.id===base.id;
    const D=(a,b)=>(!isB&&bk)?sim3DeltaDate3(a,b):null;
    const N=(a,b,gh,u,dc)=>(!isB&&bk)?sim3DeltaNum3(a,b,gh,u,dc):null;
    const mc=k.mc&&k.mc.overall&&k.mc.overall.p90?`<div class="s3-cc-mc">P50 ${fm(k.mc.overall.p50)} · P90 ${fm(k.mc.overall.p90)}</div>`:'';
    return `<div class="s3-cc${s.id===SIM3_ACTIVE_ID?' active':''}" style="border-top-color:${s.color}">
      <div class="s3-cc-h" style="color:${s.color}">${escHtml(s.name)}${isB?' <span style="font-size:8px;color:var(--c129)">BASE</span>':''}</div>
      <div class="s3-cc-big" style="color:${s.color}">${fm(k.overall)}</div>${mc}
      ${sim3CmpRow3('Time to grad',(k.ttgMo!=null?k.ttgMo+'mo':'—'),N(k.ttgMo,bk&&bk.ttgMo,false))}
      ${sim3CmpRow3('AP124',fm(k.grad.AP124),D(k.grad.AP124,bk&&bk.grad.AP124))}
      ${sim3CmpRow3('AP126',fm(k.grad.AP126),D(k.grad.AP126,bk&&bk.grad.AP126))}
      ${sim3CmpRow3('AP127',fm(k.grad.AP127),D(k.grad.AP127,bk&&bk.grad.AP127))}
      ${sim3CmpRow3('AP129',fm(k.grad.AP129),D(k.grad.AP129,bk&&bk.grad.AP129))}
      ${sim3CmpRow3('Sorties/day',k.sortiesPerDay,N(k.sortiesPerDay,bk&&bk.sortiesPerDay,true,'',true))}
      ${sim3CmpRow3('Fleet h/ac/day',k.hrsPerAcPerDay,N(k.hrsPerAcPerDay,bk&&bk.hrsPerAcPerDay,false,'',true))}
      ${sim3CmpRow3('Instr util',k.instrUtil+'%',N(k.instrUtil,bk&&bk.instrUtil,false,'%'))}
      ${sim3CmpRow3('Bottleneck',k.bindLbl+' '+k.bindPct+'%',null)}
      ${sim3CmpRow3('Grads',k.grads+'/'+k.totalStu,N(k.grads,bk&&bk.grads,true))}
    </div>`;
  }).join('');
}
/* ----- finish cards for active scenario (with P50/P90) ----- */
function sim3RenderFinish3(){
  const scn=sim3ActiveScenario3();const grid=document.getElementById('s3-finish-grid');if(!grid)return;if(!scn||!scn.result){grid.innerHTML='<div class="sim-hint">Run Simulation 3 to see finish dates.</div>';return;}
  const R=scn.result,mc=scn.mc||{},today=ap127TodayBKK();
  function fcard(name,col,students,startDate,mcKey){
    const fins=students.map(s=>s.finish).filter(f=>f&&f!=="COMPLETE"&&f!=="N/A").sort();const last=fins.at(-1)||null;
    const done=students.reduce((a,s)=>a+(s.done||0),0),tot=students.reduce((a,s)=>a+(s.total||0),0);
    const remaining=tot-done,pct=tot?done/tot*100:0,n=students.length;
    const sub=startDate?`${n} students · starts ${escHtml(startDate)}`:`${n} students · active`;
    const dl=last?ap127DateDiff(last,today):null,mo=dl!=null?Math.ceil(dl/30.4):null;const moTxt=mo!=null?(mo>0?mo+'mo':'done'):'—';
    const band=(mcKey&&mc[mcKey]&&mc[mcKey].p90)?`<div class="s3-fc-band">P50 <b>${fm(mc[mcKey].p50)}</b> · P90 <b style="color:#f87171">${fm(mc[mcKey].p90)}</b></div>`:'';
    return `<div class="sim-fcard" style="border-top-color:${col}">
      <div class="sim-fcard-name" style="color:${col}">${escHtml(name)}</div>
      <div class="sim-fcard-sub">${sub}</div>
      <div class="sim-fcard-lbl">PROJECTED LAST FINISH</div>
      <div class="sim-fcard-finish" style="color:${col}">${last?fm(last):'—'}</div>${band}
      <div class="sim-fcard-bar"><div class="sim-fcard-barf" style="width:${pct.toFixed(1)}%;background:${col}"></div></div>
      <div class="sim-fcard-stats">
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v" style="color:${col}">${pct.toFixed(0)}%</div><div class="sim-fcard-stat-l">Done</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v">${moTxt}</div><div class="sim-fcard-stat-l">Months to go</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v" style="color:${col}">${n}</div><div class="sim-fcard-stat-l">Students</div></div>
        <div class="sim-fcard-stat"><div class="sim-fcard-stat-v">${remaining.toLocaleString()}</div><div class="sim-fcard-stat-l">Sorties left</div></div>
      </div>
    </div>`;
  }
  let html=fcard("AP124",BC.AP124,R.ap124||[],null,'ap124');
  html+=fcard("AP126",BC.AP126,R.ap126||[],null,'ap126');
  html+=fcard("AP127",BC.AP127,R.ap127||[],null,'ap127');
  html+=fcard("AP129",BC.AP129,R.ap129||[],scn.cfg.ap129start,'ap129');
  (R.extra_batches||[]).forEach(b=>{html+=fcard(b.name,b.color,R["extra_"+b.name]||[],b.start,null);});
  grid.innerHTML=html;
}
/* ============================================================================
 * SIM3 charts — capacity (demand vs supply), tornado, waterfall, overlay timeline.
 * ==========================================================================*/
function sim3MonthLbls3(M){return M.map(m=>{const[y,mo]=m.split("-");return["","J","F","M","A","M","J","J","A","S","O","N","D"][+mo]+"'"+y.slice(2);});}
function sim3BuildCapacityChart3(){
  const scn=sim3ActiveScenario3();if(!scn||!scn.result)return;const R=scn.result;
  const isHour=R.hourMode||false;const proj=R.monthly||{};const hist=buildHistoricalMonthly(isHour);
  const todayM=ap127TodayBKK().slice(0,7);const merged={};const srcMap={};
  Object.keys(hist).forEach(m=>{if(m<=todayM){merged[m]=hist[m];srcMap[m]='actual';}});
  Object.keys(proj).forEach(m=>{if(m>todayM&&!merged[m]){merged[m]=proj[m];srcMap[m]='projected';}});
  if(!merged[todayM]&&proj[todayM]){merged[todayM]=proj[todayM];srcMap[todayM]='projected';}
  const M=Object.keys(merged).sort();if(!M.length)return;
  const cap=scn.cfg.cap,unit=isHour?'hrs':'flights';
  const lbl=sim3MonthLbls3(M);const v=k=>M.map(m=>(merged[m]||{})[k]||0);
  const extras=R.extra_batches||[];const totals=M.map(m=>(merged[m]||{}).t||0);
  const supplyMap=(R.sim3&&R.sim3.supplyByMonth)||{};
  const supply=M.map(m=>m>todayM?(supplyMap[m]!=null?supplyMap[m]:null):null);  // realism ceiling on future months
  const datasets=[
    {label:"AP124",data:v("124"),backgroundColor:"rgba(75,163,247,.75)",stack:"s"},
    {label:"AP126",data:v("126"),backgroundColor:"rgba(122,207,126,.75)",stack:"s"},
    {label:"AP127",data:v("127"),backgroundColor:"rgba(232,138,255,.75)",stack:"s"},
    {label:"AP129",data:v("129"),backgroundColor:"rgba(233,189,99,.75)",stack:"s"},
    ...extras.map(b=>({label:b.name,data:v(b.name),backgroundColor:b.color+"bb",stack:"s"})),
    {label:"Effective supply",data:supply,type:"line",borderColor:"#22d3ee",backgroundColor:"#22d3ee",borderWidth:2,pointRadius:0,fill:false,spanGaps:false,tension:.2},
    {label:"Hard cap",data:Array(lbl.length).fill(cap),type:"line",borderColor:"#6e7681",borderWidth:1.2,borderDash:[5,3],pointRadius:0,fill:false}
  ];
  const todayIdx=M.indexOf(todayM);
  const sub=document.getElementById('s3-cap-sub');if(sub)sub.textContent=`Bars = scheduled demand · cyan = weather/fleet/instructor-limited effective supply · grey dashed = ${cap} ${isHour?'hrs':''}/day hard ceiling · where bars meet cyan, supply binds`;
  CHARTS.sim3Cap=mkC("c-s3-cap",{type:"bar",data:{labels:lbl,datasets},options:{...copts(
    {stacked:true,grid:{color:"#21262d"}},
    {stacked:true,max:Math.max(cap+5,Math.max(...totals,0)+3),grid:{color:"#21262d"},title:{display:true,text:isHour?"avg hrs / operating day":"avg flights / operating day",color:"#8b949e",font:{size:9,family:"JetBrains Mono, monospace"}}}
  ),plugins:{...copts().plugins,catcNowLine:{enabled:true,idx:todayIdx},tooltip:{callbacks:{
    title:([ctx])=>{const m=M[ctx.dataIndex]||ctx.label;return `${m} · ${srcMap[m]==='actual'?'ACTUAL':'PROJECTED'}`;},
    afterBody:([ctx])=>{const m=M[ctx.dataIndex];const sup=supplyMap[m];return `Demand: ${(totals[ctx.dataIndex]||0).toFixed(1)} ${unit}/day${sup!=null?` · Supply ceiling: ${sup.toFixed(1)}`:''}`;}
  }}}}});
}
/* ----- run one deterministic scenario and return overall graduation date ----- */
function sim3FinishFor3(cfg){
  const bd={AP124:G.ap124||[],AP126:G.ap126||[],AP127:G.ap127||[]};
  const cur={AP124:G.cur124||[],AP126:G.cur126||[],AP127:G.cur127||[]};
  const _d=new Date(Date.now()+7*3600000);_d.setUTCDate(_d.getUTCDate()+1);const tm=_d.toISOString().slice(0,10);
  const r=runScheduler3(bd,cur,cfg._extras||[],tm,cfg.hourMode||false,cfg.weekendCap,cfg.holidayCap,cfg,false);
  const fins=[];["ap124","ap126","ap127","ap129"].forEach(k=>{const f=sim3LastFinish3(r[k]);if(f)fins.push(f);});
  return fins.sort().at(-1)||null;
}
/* ----- tornado: which single lever moves graduation most ----- */
function sim3BuildTornado3(){
  const scn=sim3ActiveScenario3();if(!scn||!scn.result){return;}
  const sub=document.getElementById('s3-tornado-sub');if(sub)sub.textContent='How far graduation moves if each lever is dialled one realistic step worse ↔ better (others held at this scenario).';
  const baseFinish=sim3FinishFor3(scn.cfg);if(!baseFinish){const t=document.getElementById('s3-tornado-empty');if(t)t.textContent='Scenario does not finish within horizon.';return;}
  const levers=[
    {label:'Aircraft fleet (±2)',mut:(c,s)=>c.sim3.fleetSize=Math.max(1,c.sim3.fleetSize+s*2)},
    {label:'Aircraft availability (±10%)',mut:(c,s)=>c.sim3.availability=sim3Clamp(c.sim3.availability+s*0.1,0.3,0.98)},
    {label:'Sorties / aircraft (±1)',mut:(c,s)=>c.sim3.sortiesPerAc=Math.max(0.5,c.sim3.sortiesPerAc+s)},
    {label:'Instructors (±3)',mut:(c,s)=>c.sim3.instructors=Math.max(1,c.sim3.instructors+s*3)},
    {label:'Instructor availability (±10%)',mut:(c,s)=>c.sim3.instructorAvail=sim3Clamp(c.sim3.instructorAvail+s*0.1,0.4,0.99)},
    {label:'Sorties / instructor (±1)',mut:(c,s)=>c.sim3.sortiesPerInstr=Math.max(0.5,c.sim3.sortiesPerInstr+s)},
    {label:'Weather severity (±10pt)',mut:(c,s)=>Object.keys(c.sim3.weather).forEach(m=>c.sim3.weather[m]=sim3Clamp(c.sim3.weather[m]-s*0.1,0,0.9))},
    {label:'Washback rate (±5pt)',mut:(c,s)=>c.sim3.washbackRate=sim3Clamp(c.sim3.washbackRate-s*0.05,0,0.5)},
    {label:'Daily hard cap (±5)',mut:(c,s)=>c.cap=Math.max(1,c.cap+s*5)},
  ];
  const rows=levers.map(L=>{
    const cLo=sim3Clone(scn.cfg);cLo._extras=scn.cfg._extras||[];L.mut(cLo,-1);
    const cHi=sim3Clone(scn.cfg);cHi._extras=scn.cfg._extras||[];L.mut(cHi,1);
    const wLo=sim3WeeksBetween3(sim3FinishFor3(cLo),baseFinish);
    const wHi=sim3WeeksBetween3(sim3FinishFor3(cHi),baseFinish);
    const lo=Math.min(wLo??0,wHi??0),hi=Math.max(wLo??0,wHi??0);
    return {label:L.label,lo,hi,span:hi-lo};
  }).filter(r=>r.span>0).sort((a,b)=>b.span-a.span).slice(0,8);
  if(!rows.length){const t=document.getElementById('s3-tornado-empty');if(t)t.textContent='No lever moves the date at this configuration.';CHARTS.sim3Torn&&CHARTS.sim3Torn.destroy&&CHARTS.sim3Torn.destroy();return;}
  const t=document.getElementById('s3-tornado-empty');if(t)t.textContent='';
  const labels=rows.map(r=>r.label);
  const data=rows.map(r=>[r.lo,r.hi]);
  const colors=rows.map(()=>'#e9bd63');
  CHARTS.sim3Torn=mkC("c-s3-tornado",{type:"bar",data:{labels,datasets:[{label:'Weeks vs scenario (− earlier · + later)',data,backgroundColor:colors,borderColor:'#f59e0b',borderWidth:1,borderSkipped:false}]},options:{indexAxis:'y',...copts(
    {grid:{color:"#21262d"},title:{display:true,text:'weeks earlier (−) / later (+) vs this scenario',color:"#8b949e",font:{size:9,family:"JetBrains Mono, monospace"}}},
    {grid:{display:false}}
  ),plugins:{...copts().plugins,legend:{display:false},tooltip:{callbacks:{label:(ctx)=>{const[a,b]=ctx.raw;return `${a>0?'+':''}${a}w … ${b>0?'+':''}${b}w  (swing ${b-a}w)`;}}}}}});
}
/* ----- waterfall: bridge from baseline graduation to active graduation, lever by lever ----- */
function sim3BuildWaterfall3(){
  const active=sim3ActiveScenario3();const base=sim3BaselineScenario3();
  const note=document.getElementById('s3-waterfall-empty');
  if(!active||!base){return;}
  if(active.id===base.id){if(note)note.textContent='Active scenario is the baseline. Select a different active scenario to see the bridge of which levers create the difference.';CHARTS.sim3Wf&&CHARTS.sim3Wf.destroy&&CHARTS.sim3Wf.destroy();const cv=document.getElementById('c-s3-waterfall');if(cv){const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);}return;}
  if(note)note.textContent='';
  const fields=[
    ['Daily hard cap',c=>c.cap,(c,v)=>c.cap=v],
    ['Aircraft fleet',c=>c.sim3.fleetSize,(c,v)=>c.sim3.fleetSize=v],
    ['Aircraft availability',c=>c.sim3.availability,(c,v)=>c.sim3.availability=v],
    ['Sorties / aircraft',c=>c.sim3.sortiesPerAc,(c,v)=>c.sim3.sortiesPerAc=v],
    ['Instructors',c=>c.sim3.instructors,(c,v)=>c.sim3.instructors=v],
    ['Instructor avail',c=>c.sim3.instructorAvail,(c,v)=>c.sim3.instructorAvail=v],
    ['Sorties / instructor',c=>c.sim3.sortiesPerInstr,(c,v)=>c.sim3.sortiesPerInstr=v],
    ['Washback rate',c=>c.sim3.washbackRate,(c,v)=>c.sim3.washbackRate=v],
    ['Weather profile',c=>JSON.stringify(c.sim3.weather),(c,v)=>c.sim3.weather=JSON.parse(v)],
  ];
  let cur=sim3Clone(base.cfg);cur._extras=base.cfg._extras||[];
  let prev=sim3FinishFor3(cur);const startFinish=prev;
  const steps=[];
  fields.forEach(([label,get,set])=>{
    const av=get(active.cfg);if(JSON.stringify(get(cur))===JSON.stringify(av))return;
    set(cur,typeof av==='string'?JSON.parse(av):av);
    const f=sim3FinishFor3(cur);const w=sim3WeeksBetween3(f,prev);if(w!=null&&w!==0)steps.push({label,w});prev=f;
  });
  const endFinish=prev;
  const labels=['Baseline',...steps.map(s=>s.label),'Active'];
  const totalW=sim3WeeksBetween3(endFinish,startFinish)||0;
  // floating bars: cumulative weeks from baseline (0)
  let cum=0;const bars=[];const colors=[];
  bars.push([0,0]);colors.push('#9ca3af');               // baseline anchor
  steps.forEach(s=>{const from=cum,to=cum+s.w;bars.push([Math.min(from,to),Math.max(from,to)]);colors.push(s.w<0?'#34d399':'#f87171');cum=to;});
  bars.push([Math.min(0,totalW),Math.max(0,totalW)]);colors.push(totalW<0?'var(--done)':'#f87171');  // net
  const sub=document.getElementById('s3-waterfall-sub');if(sub)sub.textContent=`Baseline ${fm(startFinish)} → Active ${fm(endFinish)} · net ${totalW>0?'+':''}${totalW} weeks. Green = pulls graduation earlier.`;
  CHARTS.sim3Wf=mkC("c-s3-waterfall",{type:"bar",data:{labels,datasets:[{label:'cumulative weeks',data:bars,backgroundColor:colors,borderWidth:0}]},options:{...copts(
    {grid:{display:false}},
    {grid:{color:"#21262d"},title:{display:true,text:'cumulative weeks from baseline graduation',color:"#8b949e",font:{size:9,family:"JetBrains Mono, monospace"}}}
  ),plugins:{...copts().plugins,legend:{display:false},tooltip:{callbacks:{label:(ctx)=>{const[a,b]=ctx.raw;const d=b-a;return `${d===0?'anchor':((labels[ctx.dataIndex]==='Active'?'net ':'')+(ctx.dataIndex>0&&ctx.dataIndex<=steps.length?(steps[ctx.dataIndex-1].w>0?'+':'')+steps[ctx.dataIndex-1].w+'w':'') )}`;}}}}}});
}
/* ----- overlay timeline: pinned scenarios on a shared axis, per batch ----- */
function sim3RenderOverlayTimeline3(){
  const host=document.getElementById('s3-timeline');if(!host)return;
  const pinned=SIM3_SCENARIOS.filter(s=>s.pinned&&s.kpis);
  if(!pinned.length){host.innerHTML='<div class="sim-hint">Pin one or more scenarios (📌) to overlay their batch timelines here.</div>';return;}
  const today=ap127TodayBKK();let maxD=today;
  pinned.forEach(s=>Object.values(s.kpis.grad).forEach(d=>{if(d&&d>maxD)maxD=d;}));
  const S=new Date('2026-05-01T00:00:00');const E=new Date(maxD+'T00:00:00');E.setMonth(E.getMonth()+1);const span=(E-S)||1;
  const pct=ds=>{if(!ds)return 0;return sim3Clamp((new Date(ds+'T00:00:00')-S)/span*100,0,100);};
  let marks='';for(let md=new Date(2026,4,1);md<=E;md=new Date(md.getFullYear(),md.getMonth()+3,1)){const p=(md-S)/span*100;if(p>=0&&p<=100)marks+=`<div class="s3-tl-tick" style="left:${p}%">${md.toLocaleDateString('en-GB',{month:'short',year:'2-digit'})}</div>`;}
  const nowP=pct(today);
  const base=sim3BaselineScenario3();
  const batches=[['AP124','2026-05-05',BC.AP124],['AP126','2026-05-05',BC.AP126],['AP127','2026-05-05',BC.AP127],['AP129',(SIM3_CFG&&SIM3_CFG.ap129start)||'2026-06-01',BC.AP129]];
  const rows=batches.map(([name,start,bcol])=>{
    const sp=pct(start);const h=10+pinned.length*11;
    const bars=pinned.map((s,si)=>{
      const g=s.kpis.grad[name];if(!g)return '';
      const w=pct(g);const baseG=base&&base.kpis?base.kpis.grad[name]:null;
      const dl=(base&&s.id!==base.id&&baseG)?sim3DeltaDate3(g,baseG):null;
      const top=6+si*11;
      return `<div class="s3-tl-bar" style="left:${sp}%;width:${Math.max(0.6,w-sp)}%;top:${top}px;background:${s.color}" title="${escHtml(s.name)} · ${fm(g)}"></div>`+
             `<div class="s3-tl-elbl" style="left:calc(${w}% + 4px);top:${top-2}px;color:${s.color}">${fm(g)}${dl?` <span style="color:${dl.color}">${dl.arrow}${dl.txt}</span>`:''}</div>`;
    }).join('');
    return `<div class="s3-tl-row" style="height:${h}px"><div class="s3-tl-lbl" style="color:${bcol}">${name}</div><div class="s3-tl-track" style="height:${h}px"><div class="s3-tl-now" style="left:${nowP}%"></div>${bars}</div></div>`;
  }).join('');
  const legend=pinned.map(s=>`<span class="s3-tl-leg"><span class="s3-tl-sw" style="background:${s.color}"></span>${escHtml(s.name)}</span>`).join('');
  host.innerHTML=`<div class="s3-tl-legend">${legend}</div><div class="s3-tl-axis">${marks}</div><div class="s3-tl-rows">${rows}</div>`;
}
/* ============================================================================
 * SIM3 presentation mode — fullscreen kiosk, big hero, before/after, narrative.
 * ==========================================================================*/
const SIM3_NARRATIVE=[
  {title:'Baseline projection',tab:'cards',say:'Where the academy lands today, under current fleet, instructors and weather.'},
  {title:'The binding constraint',tab:'tornado',say:'What is actually holding the date back — and which lever moves it most.'},
  {title:'The proposed fix',tab:'timeline',say:'Pinned scenarios overlaid — see graduation slide earlier.'},
  {title:'Bridge to the new date',tab:'waterfall',say:'Exactly how each decision contributes to the improvement.'},
];
function sim3EnterPresent3(){
  SIM3_PRESENT=true;SIM3_NARR_STEP=0;SIM3_BEFORE_AFTER=false;
  document.body.classList.add('s3-present');
  const root=document.querySelector('.ngt-prog');
  try{(root&&root.requestFullscreen)?root.requestFullscreen():null;}catch(e){}
  document.addEventListener('keydown',sim3KeyHandler3);
  document.addEventListener('fullscreenchange',sim3FsChange3);
  sim3ApplyNarrative3();sim3RenderHero3();
}
function sim3ExitPresent3(){
  SIM3_PRESENT=false;SIM3_BEFORE_AFTER=false;
  document.body.classList.remove('s3-present');
  try{if(document.fullscreenElement)document.exitFullscreen();}catch(e){}
  document.removeEventListener('keydown',sim3KeyHandler3);
  document.removeEventListener('fullscreenchange',sim3FsChange3);
  sim3RenderHero3();sim3RenderComparison3();
}
function sim3FsChange3(){if(!document.fullscreenElement&&SIM3_PRESENT)sim3ExitPresent3();}
function sim3KeyHandler3(e){
  if(!SIM3_PRESENT)return;
  if(e.key==='Escape'){sim3ExitPresent3();}
  else if(e.key==='ArrowRight'||e.key===' '){e.preventDefault();sim3NarrativeStep3(1);}
  else if(e.key==='ArrowLeft'){e.preventDefault();sim3NarrativeStep3(-1);}
  else if(e.key==='f'||e.key==='F'){sim3ToggleBeforeAfter3();}
}
function sim3NarrativeStep3(dir){SIM3_NARR_STEP=sim3Clamp(SIM3_NARR_STEP+dir,0,SIM3_NARRATIVE.length-1);sim3ApplyNarrative3();}
function sim3ApplyNarrative3(){
  const beat=SIM3_NARRATIVE[SIM3_NARR_STEP];if(!beat)return;
  SIM3_COMPARE_TAB=beat.tab;sim3RenderComparison3();
  const cap=document.getElementById('s3-present-caption');if(cap)cap.innerHTML=`<span class="s3-pc-step">${SIM3_NARR_STEP+1}/${SIM3_NARRATIVE.length}</span><b>${beat.title}</b> — ${beat.say}`;
  const dots=document.getElementById('s3-present-dots');if(dots)dots.innerHTML=SIM3_NARRATIVE.map((b,i)=>`<span class="s3-pd${i===SIM3_NARR_STEP?' on':''}"></span>`).join('');
}
function sim3ToggleBeforeAfter3(){SIM3_BEFORE_AFTER=!SIM3_BEFORE_AFTER;sim3RenderHero3();const b=document.getElementById('s3-ba-btn');if(b)b.textContent=SIM3_BEFORE_AFTER?'Showing: BASELINE':'Showing: PROPOSED';}
function sim3AddAnnotation3(){
  const scn=sim3ActiveScenario3();if(!scn)return;const txt=prompt('Annotation label (shown on the overlay timeline):');if(!txt)return;
  scn.annotations=scn.annotations||[];scn.annotations.push({txt});sim3SaveAll3();toast('Annotation added: '+txt);
}
/* ----- boot ----- */
function sim3Boot3(){
  if(!G)return;
  if(!SIM3_SCENARIOS.length){if(!sim3RestoreAll3())sim3SeedBaseline3();}
  if((!SIM3_ACTIVE_ID||!sim3ActiveScenario3())&&SIM3_SCENARIOS.length)sim3SetActive3(SIM3_SCENARIOS[0].id);
  sim3RenderControls3();
  sim3RunAll3();
  sim3RenderHero3();sim3RenderScenarioStrip3();sim3RenderComparison3();sim3BuildCapacityChart3();sim3RenderFinish3();
}
/* ===== renderTimeline ===== */
function renderTimeline(){
  const S=new Date("2026-04-01T00:00:00"),E=new Date("2027-12-01T00:00:00"),span=E-S;
  const pct=ds=>{if(!ds||ds==="N/A"||ds==="COMPLETE")return 97;return Math.min(97,Math.max(0,(new Date(ds+"T00:00:00")-S)/span*100));};
  let marks="";for(let md=new Date(2026,3,1);md<=E;md=new Date(md.getFullYear(),md.getMonth()+2,1)){const p=(md-S)/span*100;if(p>=0&&p<=100)marks+=`<div class="tl-tick" style="left:${p}%">${md.toLocaleDateString("en-GB",{month:"short",year:"2-digit"})}</div>`;}
  document.getElementById("tl-marks").innerHTML=marks;
  const rows=[{lbl:"AP124 ×9",k:"ap124",ck:"cur124",start:"2026-05-05",col:BC.AP124},{lbl:"AP126 ×28",k:"ap126",ck:"cur126",start:"2026-05-05",col:BC.AP126},{lbl:"AP127 ×28",k:"ap127",ck:"cur127",start:"2026-05-05",col:BC.AP127},{lbl:"AP129 ×"+CFG.n129,k:"ap129",ck:"cur127",start:CFG.ap129start,col:BC.AP129}];
  document.getElementById("tl-rows").innerHTML=rows.map(r=>{
    const sp=pct(r.start);const fin=lastFin(r.k);const finP=fin?pct(fin):97;const st=(G[r.k]||[])[0];const donePct=sp+(finP-sp)*(st?.done||0)/(st?.total||1);
    return `<div class="tl-row"><div class="tl-lbl">${r.lbl}</div><div class="tl-track"><div class="tl-plan" style="left:${sp}%;width:${finP-sp}%;background:${r.col}"></div><div class="tl-done" style="left:${sp}%;width:${Math.max(0,donePct-sp)}%;background:${r.col}"></div><div class="tl-elbl">${fin?fm(fin):"..."}</div></div></div>`;
  }).join("");
}

// ── CARDS ──
function makeCard(s,rankClass=""){
  const col=BC[s.batch],bg=BB[s.batch];
  const nick=s.nick?`<span style="font-family:'JetBrains Mono',monospace;font-size:8px;padding:1px 3px;border-radius:2px;background:${bg};color:${col};margin-left:3px">${s.nick}</span>`:"";
  const fRows=(s.flown||[]).slice(-CFG.recents).map(f=>`<div class="lr"><div class="ld" style="background:var(--done)"></div><div class="ldate" style="color:var(--done)">${fd(f.date)}</div><div class="lname" style="color:var(--done)">${f.lesson}</div><div class="ldur">${f.actual_ft||hm(f.actual_mins)}</div></div>`).join("");
  let prev=(s.flown||[]).at(-1)?.actual_mins||60;
  const pRows=(s.planned||[]).slice(0,CFG.upcomings).map(p=>{const rest=CFG.showRest&&prev>=120;const lv=p.mins||p.planned_mins||60;prev=lv;return`<div class="lr"><div class="ld" style="background:${col};opacity:.5"></div><div class="ldate">${fd(p.date)}</div><div class="lname" style="color:${col}">${p.lesson}</div><div class="ldur">${hm(lv)}${rest?`<span class="lrest">+r</span>`:""}</div></div>`;}).join("");
  const sep=(s.flown?.length&&s.planned?.length)?`<div class="lsep">▸ ${s.remaining} remaining · next ${Math.min(CFG.upcomings,s.remaining)} shown</div>`:"";
  const more=(s.planned_total||0)>CFG.upcomings?`<div class="moret">+${s.planned_total-CFG.upcomings} more</div>`:"";
  const fin=s.finish==="COMPLETE"?"COMPLETED":fd(s.finish);
  const nextDate=(s.planned||[])[0]?.date;
  const ntag=CFG.showNextTag&&s.next_lesson?`<b style="color:${col}">${s.next_lesson}</b>`:"";
  const ndateTag=nextDate?`<span style="color:var(--tx2);margin-left:3px">${fd(nextDate)}</span>`:"";
  return`<div class="scard${rankClass?" status-"+rankClass:""}"><div class="sh"><div><div class="sname">${s.name}${nick}</div><div class="smeta">${s.batch} · ${s.done}/${s.total}</div></div><div><div class="spct" style="color:${col}">${s.pct.toFixed(1)}%</div><div class="spct2">${s.remaining} left</div></div></div><div class="pb"><div class="pf" style="width:${Math.max(s.pct,.3)}%;background:${col}"></div></div><div class="sb2" style="max-height:${CFG.cardH}px">${fRows}${sep}${pRows}${more}</div><div class="sf2"><span style="font-size:10px;color:var(--tx3)">Next:${ntag?` ${ntag}${ndateTag}`:""}</span><span class="ftag" style="background:${bg};color:${col};border:1px solid ${col}33">Finish: ${fin}</span></div></div>`;
}
/* ===== misc helpers ===== */
function ap127TodayBKK(){const now=new Date();const bkk=new Date(now.getTime()+(now.getTimezoneOffset()+420)*60000);return bkk.toISOString().slice(0,10);}
function ap127ShortName(n){const p=n.trim().split(/\s+/);return p.length<2?n:p[0]+" "+p[p.length-1][0]+".";}
function ap127FmtDate(ds){if(!ds)return"-";try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}catch{return ds;}}
function ap127ShortDate(ds){if(!ds)return"-";try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short"});}catch{return ds;}}
function ap127FlightMins(f){return f.actual_mins||f.mins||0;}
function ap127DateDiff(a,b){if(!a||!b)return null;const ad=new Date(a+"T00:00:00"),bd=new Date(b+"T00:00:00");if(Number.isNaN(ad)||Number.isNaN(bd))return null;return Math.round((ad-bd)/86400000);}
/* ===== performance ===== */
function collectHistoricalFlights(){
  const rec=[];
  [["ap124","AP124"],["ap126","AP126"],["ap127","AP127"],["ap129","AP129"]].forEach(([k,b])=>{
    (G?.[k]||[]).forEach(s=>(s.flown||[]).forEach(f=>{if(f.date)rec.push({date:f.date,batch:b,mins:ap127FlightMins(f)});}));
  });
  return rec.sort((a,b)=>a.date.localeCompare(b.date));
}
function perfIsBusinessDay(ds){
  const d=new Date(ds+"T12:00:00Z");
  const dw=d.getUTCDay();
  return dw!==0&&dw!==6&&!HOL.has(ds);
}
function perfBusinessDates(start,end){
  const out=[];
  let d=new Date(start+"T12:00:00Z");
  const e=new Date(end+"T12:00:00Z");
  while(d<=e){
    const ds=d.toISOString().slice(0,10);
    if(perfIsBusinessDay(ds))out.push(ds);
    d.setUTCDate(d.getUTCDate()+1);
  }
  return out;
}
function perfDefaultEnd(recAll){
  return recAll.length?recAll.at(-1).date:new Date().toISOString().slice(0,10);
}
function getThreeMonthsAgo(){
  const today=ap127TodayBKK();
  const d=new Date(today+'T12:00:00Z');
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth()-3);
  return d.toISOString().slice(0,10);
}
function renderPerformance(){
  const today=ap127TodayBKK();
  const threeMonthsAgo=getThreeMonthsAgo();
  const recAll=collectHistoricalFlights().filter(r=>r.date<=today);
  const fromRaw=document.getElementById("pf-from")?.value||"";
  const toRaw=document.getElementById("pf-to")?.value||"";
  const from=fromRaw||threeMonthsAgo;
  const to=(toRaw&&toRaw<=today)?toRaw:today;
  const toEl=document.getElementById("pf-to");if(toEl){toEl.max=today;if(!toRaw)toEl.value=to;}
  const incWE=document.getElementById('pf-inc-we')?.classList.contains('active')||false;
  const incHol=document.getElementById('pf-inc-hol')?.classList.contains('active')||false;
  if(from>to){toast("Performance date range is invalid","wa");return;}
  const batch=document.getElementById("pf-batch")?.value||"ALL";
  const recentN=+(document.getElementById("pf-recent-n")?.value||20);
  const rec=recAll.filter(r=>r.date>=from&&r.date<=to&&(batch==="ALL"||r.batch===batch));
  const bizDates=perfBusinessDates(from,to);
  const opsSet=new Set(bizDates);
  rec.forEach(r=>opsSet.add(r.date));
  if(incWE){
    let cur=new Date(from+'T12:00:00Z');const end=new Date(to+'T12:00:00Z');
    while(cur<=end){const dw=cur.getUTCDay();if(dw===0||dw===6)opsSet.add(cur.toISOString().slice(0,10));cur.setUTCDate(cur.getUTCDate()+1);}
  }
  if(incHol){HOL.forEach(ds=>{if(ds>=from&&ds<=to)opsSet.add(ds);});}
  const allDates=[...opsSet].sort();
  const extraNonBiz=allDates.filter(d=>!bizDates.includes(d)).length;
  const filterNote=document.getElementById("pf-filter-note");
  if(filterNote){
    filterNote.textContent=`Filter: ${batch} | ${ap127FmtDate(from)} → ${ap127FmtDate(to)} | ${allDates.length} operating days${extraNonBiz?` (incl. ${extraNonBiz} weekend/holiday day${extraNonBiz>1?"s":""} with flights)`:""}`;
  }
  const recentTitle=document.getElementById("pf-recent-title");
  if(recentTitle)recentTitle.textContent=`Recent ${recentN} Calendar Days`;
  if(!allDates.length){
    ["pf-total-flights","pf-total-hours","pf-days","pf-avg","pf-peak","pf-med","pf-avg-h","pf-best-wd","pf-top-batch"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="-";});
    const sub=document.getElementById("pf-peak-sub");if(sub)sub.textContent="-";
    const sub2=document.getElementById("pf-best-wd-sub");if(sub2)sub2.textContent="-";
    const sub3=document.getElementById("pf-top-batch-sub");if(sub3)sub3.textContent="-";
    const recent=document.getElementById("pf-recent");if(recent)recent.innerHTML=`<div class="d127-ad">No historical data yet.</div>`;
    ["perfDailyF","perfDailyH","perfMonthly","perfMonthlyG","perfRecent"].forEach(k=>{if(CHARTS[k]){CHARTS[k].destroy();CHARTS[k]=null;}});
    const statsEl=document.getElementById('pf-recent-stats');if(statsEl)statsEl.innerHTML='';
    return;
  }
  const totalFlights=rec.length,totalHours=rec.reduce((a,r)=>a+r.mins,0)/60;
  const dm={};
  allDates.forEach(d=>{dm[d]={n:0,h:0,b:{AP124:0,AP126:0,AP127:0,AP129:0},bn:{AP124:0,AP126:0,AP127:0,AP129:0}};});
  rec.forEach(r=>{if(!dm[r.date])dm[r.date]={n:0,h:0,b:{AP124:0,AP126:0,AP127:0,AP129:0},bn:{AP124:0,AP126:0,AP127:0,AP129:0}};dm[r.date].n++;dm[r.date].h+=r.mins/60;dm[r.date].b[r.batch]=(dm[r.date].b[r.batch]||0)+(r.mins/60);dm[r.date].bn[r.batch]=(dm[r.date].bn[r.batch]||0)+1;});
  const dates=[...allDates];
  const rangeDays=dates.length;
  const thisYear=new Date(today+'T00:00:00').getFullYear();
  // Month-only label (used at every month boundary regardless of range)
  const xMonthLabel=(ds)=>{if(!ds)return null;try{const d=new Date(ds+'T00:00:00');const mo=d.toLocaleDateString('en-GB',{month:'short'});const yr=d.getFullYear();return yr===thisYear?mo:`${mo} '${String(yr).slice(2)}`;}catch{return null;}};
  // Day+month label (used at week/day ticks for shorter ranges)
  const xDayLabel=(ds)=>{if(!ds)return null;try{const d=new Date(ds+'T00:00:00');const mo=d.toLocaleDateString('en-GB',{month:'short'});const yr=d.getFullYear();const day=String(d.getDate()).padStart(2,'0');return yr===thisYear?`${day} ${mo}`:`${day} ${mo} '${String(yr).slice(2)}`;}catch{return null;}};
  // ISO week key so week-boundary detection works even when Monday is a holiday/weekend
  const isoWeek=(ds)=>{const d=new Date(ds+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=d.getUTCFullYear();return`${y}-${Math.ceil((((d-new Date(Date.UTC(y,0,1)))/86400000)+1)/7)}`;};
  const xTickFmt=(value,index)=>{
    const d=dates[index];if(!d)return null;
    const prev=index>0?dates[index-1]:null;
    const newMonth=!prev||prev.slice(0,7)!==d.slice(0,7);
    const newWeek=!prev||isoWeek(d)!==isoWeek(prev);
    if(newMonth)return xMonthLabel(d);
    if(rangeDays<=14)return xDayLabel(d);
    if(rangeDays<=60&&newWeek)return xDayLabel(d);
    return null;
  };
  // Tick color: month-start labels are brighter than week/day labels
  const xTickColor=(ctx)=>{
    const d=dates[ctx.index];if(!d)return'#6e7681';
    const prev=ctx.index>0?dates[ctx.index-1]:null;
    return(!prev||prev.slice(0,7)!==d.slice(0,7))?'#c9d1d9':'#6e7681';
  };
  const xGridColor=(ctx)=>{
    const d=dates[ctx.index];if(!d)return'#1a1f26';
    const prev=ctx.index>0?dates[ctx.index-1]:null;
    const newMonth=!prev||prev.slice(0,7)!==d.slice(0,7);
    const newWeek=!prev||isoWeek(d)!==isoWeek(prev);
    if(newMonth)return'rgba(255,255,255,0.18)';              // always: bright for month start
    if(rangeDays<=60&&newWeek)return'rgba(255,255,255,0.06)'; // short/medium: subtle week grid
    return'#1a1f26';
  };
  const days=dates.length,avg=totalFlights/days;
  const med=(()=>{const a=dates.map(d=>dm[d].n).sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;})();
  const avgHoursDay=totalHours/days;
  const peakDate=[...dates].sort((a,b)=>dm[b].n-dm[a].n||dm[b].h-dm[a].h)[0];
  const weekday=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const wd={0:0,1:0,2:0,3:0,4:0,5:0,6:0};
  dates.forEach(d=>{const w=new Date(d+"T00:00:00").getDay();wd[w]+=dm[d].n;});
  const bestW=Object.entries(wd).sort((a,b)=>b[1]-a[1])[0];
  const bh={AP124:0,AP126:0,AP127:0,AP129:0};
  rec.forEach(r=>{bh[r.batch]+=r.mins/60;});
  const topBatch=Object.entries(bh).sort((a,b)=>b[1]-a[1])[0];
  // 7-day rolling averages for daily chart overlays
  const rollingAvgF=dates.map((d,i)=>{const w=dates.slice(Math.max(0,i-6),i+1);return+(w.reduce((a,wd)=>a+dm[wd].n,0)/w.length).toFixed(2);});
  const rollingAvgH=dates.map((d,i)=>{const w=dates.slice(Math.max(0,i-6),i+1);return+(w.reduce((a,wd)=>a+dm[wd].h,0)/w.length).toFixed(2);});
  // 7-day vs prior-7 trend
  const last7D=dates.slice(-7),prior7D=dates.slice(-14,-7);
  const avg7=last7D.length?last7D.reduce((a,d)=>a+dm[d].n,0)/last7D.length:0;
  const avgP7=prior7D.length?prior7D.reduce((a,d)=>a+dm[d].n,0)/prior7D.length:0;
  const trendPct=prior7D.length?(avg7-avgP7)/avgP7*100:null;
  document.getElementById("pf-total-flights").textContent=totalFlights;
  document.getElementById("pf-total-hours").textContent=totalHours.toFixed(1);
  document.getElementById("pf-days").textContent=days;
  document.getElementById("pf-avg").textContent=avg.toFixed(2);
  document.getElementById("pf-peak").textContent=ap127FmtDate(peakDate);
  document.getElementById("pf-peak-sub").textContent=`${dm[peakDate].n} flights · ${dm[peakDate].h.toFixed(1)}h`;
  document.getElementById("pf-med").textContent=med.toFixed(1);
  document.getElementById("pf-avg-h").textContent=avgHoursDay.toFixed(2);
  document.getElementById("pf-best-wd").textContent=weekday[+bestW[0]];
  document.getElementById("pf-best-wd-sub").textContent=`${bestW[1]} flights`;
  document.getElementById("pf-top-batch").textContent=topBatch[0];
  document.getElementById("pf-top-batch-sub").textContent=`${topBatch[1].toFixed(1)}h`;
  // Trend insight strip
  const pfTrend=document.getElementById('pf-trend');
  if(pfTrend){
    const dir=trendPct===null?'':trendPct>2?'↑':trendPct<-2?'↓':'→';
    const col=trendPct===null?'':trendPct>2?'var(--c126)':trendPct<-2?'#f87171':'var(--tx3)';
    const pctTxt=trendPct!==null?` <span style="color:${col};font-weight:600">${dir} ${Math.abs(trendPct).toFixed(0)}%</span> vs prior 7 days`:'';
    pfTrend.innerHTML=`7-day avg: <strong>${avg7.toFixed(1)}</strong> fl/day${pctTxt} &nbsp;·&nbsp; Period avg: <strong>${avg.toFixed(1)}</strong> fl/day &nbsp;·&nbsp; ${days} operating days`;
  }

  // Batch palette (canonical, matches TODAY view).
  const BPAL=[["AP124","rgba(75,163,247,.80)"],["AP126","rgba(122,207,126,.80)"],["AP127","rgba(232,138,255,.80)"],["AP129","rgba(233,189,99,.80)"]];
  const dailyOpts=(unit)=>({responsive:true,maintainAspectRatio:false,
    plugins:{
      legend:{labels:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",boxWidth:8}},
      datalabels:{display:false},
      tooltip:{callbacks:{title:([c])=>ap127FmtDate(dates[c.dataIndex]),footer:(items)=>{const s=items.filter(i=>i.dataset.stack);return"Total: "+s.reduce((a,i)=>a+(i.raw||0),0).toFixed(unit==="h"?1:0)+" "+(unit==="h"?"hrs":"flights");}}}
    },
    scales:{
      x:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:8},color:xTickColor,callback:xTickFmt,maxTicksLimit:999,autoSkip:false,maxRotation:0,minRotation:0},grid:{color:xGridColor}},
      y:{stacked:true,beginAtZero:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#6e7681"},grid:{color:"#21262d"},title:{display:true,text:unit==="h"?"hours / day":"flights / day",color:"#8b949e",font:{size:9,family:"JetBrains Mono"}}}
    }
  });
  // Daily FLIGHTS — stacked by batch + 7-day rolling avg line.
  const _fOpts=dailyOpts("n");
  CHARTS.perfDailyF=mkC("c-perf-daily-f",{type:"bar",data:{labels:dates,datasets:[...BPAL.map(([b,c])=>({label:b,data:dates.map(d=>dm[d].bn[b]||0),backgroundColor:c,stack:"f",borderWidth:0})),{label:"Total",type:"line",data:dates.map(d=>dm[d].n),borderColor:"#f59e0b",borderWidth:1.5,pointRadius:0,fill:false,order:0,datalabels:{display:false}},{label:"7d Avg",type:"line",data:rollingAvgF,borderColor:"rgba(251,191,36,0.45)",borderWidth:1,borderDash:[4,2],pointRadius:0,fill:false,order:-1,datalabels:{display:false}}]},options:_fOpts});
  observeChartResize('perfDailyF','wrap-perf-daily-f');
  // Daily HOURS — stacked by batch + 7-day rolling avg line.
  const _hOpts=dailyOpts("h");
  CHARTS.perfDailyH=mkC("c-perf-daily-h",{type:"bar",data:{labels:dates,datasets:[...BPAL.map(([b,c])=>({label:b,data:dates.map(d=>+(dm[d].b[b]||0).toFixed(2)),backgroundColor:c,stack:"h",borderWidth:0})),{label:"Total",type:"line",data:dates.map(d=>+dm[d].h.toFixed(1)),borderColor:"#f59e0b",borderWidth:1.5,pointRadius:0,fill:false,order:0,datalabels:{display:false}},{label:"7d Avg",type:"line",data:rollingAvgH,borderColor:"rgba(251,191,36,0.45)",borderWidth:1,borderDash:[4,2],pointRadius:0,fill:false,order:-1,datalabels:{display:false}}]},options:_hOpts});
  observeChartResize('perfDailyH','wrap-perf-daily-h');

  const mm={};
  rec.forEach(r=>{const m=r.date.slice(0,7);if(!mm[m])mm[m]={AP124:0,AP126:0,AP127:0,AP129:0};mm[m][r.batch]+=r.mins/60;});
  const months=Object.keys(mm).sort();
  const monthlyTotals=months.map(m=>+(mm[m].AP124+mm[m].AP126+mm[m].AP127+mm[m].AP129).toFixed(1));
  CHARTS.perfMonthly=mkC("c-perf-monthly",{
    type:"bar",
    data:{
      labels:months,
      datasets:[
        {label:"AP124",data:months.map(m=>+mm[m].AP124.toFixed(1)),backgroundColor:"rgba(75,163,247,.72)",stack:"h"},
        {label:"AP126",data:months.map(m=>+mm[m].AP126.toFixed(1)),backgroundColor:"rgba(122,207,126,.72)",stack:"h"},
        {label:"AP127",data:months.map(m=>+mm[m].AP127.toFixed(1)),backgroundColor:"rgba(232,138,255,.72)",stack:"h"},
        {label:"AP129",data:months.map(m=>+mm[m].AP129.toFixed(1)),backgroundColor:"rgba(233,189,99,.72)",stack:"h"}
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{labels:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",boxWidth:8}},
        datalabels:{display:(ctx)=>ctx.dataset.data[ctx.dataIndex]>=0.5,color:'rgba(255,255,255,0.85)',font:{family:"JetBrains Mono",size:7},formatter:(v,ctx)=>{const n=ctx.dataset.data[ctx.dataIndex];return typeof n==='number'&&n>=0.5?n.toFixed(1):null;},anchor:'center',align:'center'},
        stackTotalLabels:{enabled:true,totals:monthlyTotals,fmt:v=>v.toFixed(1)}
      },
      scales:{
        x:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681"},grid:{color:"#21262d"}},
        y:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#6e7681"},grid:{color:"#21262d"}}
      }
    }
  });
  observeChartResize('perfMonthly','wrap-perf-monthly');

  CHARTS.perfMonthlyG=mkC("c-perf-monthly-g",{type:"bar",data:{labels:months,datasets:[
    {label:"AP124",data:months.map(m=>+(mm[m].AP124||0).toFixed(1)),backgroundColor:"rgba(75,163,247,.80)"},
    {label:"AP126",data:months.map(m=>+(mm[m].AP126||0).toFixed(1)),backgroundColor:"rgba(122,207,126,.80)"},
    {label:"AP127",data:months.map(m=>+(mm[m].AP127||0).toFixed(1)),backgroundColor:"rgba(232,138,255,.80)"},
    {label:"AP129",data:months.map(m=>+(mm[m].AP129||0).toFixed(1)),backgroundColor:"rgba(233,189,99,.80)"}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{
    legend:{labels:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",boxWidth:8}},
    datalabels:{display:(ctx)=>ctx.dataset.data[ctx.dataIndex]>=0.5,color:'rgba(230,237,243,0.90)',font:{family:"JetBrains Mono",size:7,weight:'600'},formatter:(v,ctx)=>{const n=ctx.dataset.data[ctx.dataIndex];return typeof n==='number'&&n>=0.5?n.toFixed(1):null;},anchor:'end',align:'end',offset:2}
  },scales:{
    x:{ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681"},grid:{color:"#21262d"}},
    y:{beginAtZero:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#6e7681"},grid:{color:"#21262d"},title:{display:true,text:"hours",color:"#8b949e",font:{size:9,family:"JetBrains Mono"}}}
  }}});
  observeChartResize('perfMonthlyG','wrap-perf-monthly-g');

  // Last recentN calendar days (oldest → newest), including WE/HOL with 0 flights
  const recent=[];
  for(let i=recentN-1;i>=0;i--){const _d=new Date(today+'T12:00:00Z');_d.setUTCDate(_d.getUTCDate()-i);const ds=_d.toISOString().slice(0,10);if(ds<=today){if(!dm[ds])dm[ds]={n:0,h:0,b:{AP124:0,AP126:0,AP127:0,AP129:0},bn:{AP124:0,AP126:0,AP127:0,AP129:0}};recent.push(ds);}}
  const BPAL_HEX={AP124:'#4ba3f7',AP126:'#7acf7e',AP127:'#e88aff',AP129:'#e9bd63'};
  const BPAL_KEYS=['AP124','AP126','AP127','AP129'];
  const BPAL_BG={AP124:'rgba(75,163,247,.80)',AP126:'rgba(122,207,126,.80)',AP127:'rgba(232,138,255,.80)',AP129:'rgba(233,189,99,.80)'};
  const recSubEl=document.getElementById('pf-recent-sub');
  const recFlightDays=recent.filter(d=>dm[d]?.n>0).length;
  if(recSubEl)recSubEl.textContent=`${recent.length} calendar days · ${recFlightDays} with flights`;
  if(recent.length){
    const recentTotals=recent.map(d=>dm[d].n||0);
    CHARTS.perfRecent=mkC('c-perf-recent',{type:'bar',data:{labels:recent.map(d=>ap127ShortDate(d)),datasets:[
      ...BPAL_KEYS.map(b=>({label:b,data:recent.map(d=>dm[d].bn[b]||0),backgroundColor:BPAL_BG[b],stack:'r'})),
      {label:'Total',type:'line',data:recentTotals,borderColor:'#f59e0b',borderWidth:1.5,pointRadius:2,pointBackgroundColor:'#f59e0b',fill:false,datalabels:{display:false}}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{
      legend:{labels:{font:{family:'JetBrains Mono',size:9},color:'#8b949e',boxWidth:8}},
      datalabels:{display:(ctx)=>ctx.datasetIndex<4&&(ctx.dataset.data[ctx.dataIndex]||0)>0,color:'rgba(255,255,255,0.85)',font:{family:'JetBrains Mono',size:7},formatter:(v,ctx)=>{const n=ctx.dataset.data[ctx.dataIndex];return typeof n==='number'&&n>0?n:null;},anchor:'center',align:'center'},
      stackTotalLabels:{enabled:true,totals:recentTotals},
      tooltip:{callbacks:{title:([c])=>ap127FmtDate(recent[c.dataIndex]),footer:(items)=>`Total: ${items.filter(i=>i.datasetIndex<4).reduce((a,i)=>a+(i.raw||0),0)} flights · ${(dm[recent[items[0]?.dataIndex]]?.h||0).toFixed(1)}h`}}
    },scales:{
      x:{stacked:true,ticks:{font:{family:'JetBrains Mono',size:8},color:'#6e7681',maxRotation:45},grid:{color:'#21262d'}},
      y:{stacked:true,beginAtZero:true,ticks:{font:{family:'JetBrains Mono',size:9},color:'#6e7681'},grid:{color:'#21262d'},title:{display:true,text:'flights/day',color:'#8b949e',font:{size:9,family:'JetBrains Mono'}}}
    }}});
    const totRec=recent.reduce((a,d)=>a+dm[d].n,0);
    const hrsRec=recent.reduce((a,d)=>a+dm[d].h,0);
    const bStats=BPAL_KEYS.map(b=>({b,n:recent.reduce((a,d)=>a+(dm[d].bn[b]||0),0),h:recent.reduce((a,d)=>a+(dm[d].b[b]||0),0)}));
    const statsEl=document.getElementById('pf-recent-stats');
    if(statsEl)statsEl.innerHTML=[
      `<div class="sc ca"><div class="sl">Total Flights</div><div class="sv">${totRec}</div><div class="ss2">${hrsRec.toFixed(1)}h · ${recent.length} days</div></div>`,
      ...bStats.map(s=>`<div class="sc c${s.b.replace('AP','')}"><div class="sl">${s.b}</div><div class="sv" style="color:${BPAL_HEX[s.b]}">${s.n}</div><div class="ss2">${s.h.toFixed(1)}h</div></div>`)
    ].join('');
  }else{const statsEl=document.getElementById('pf-recent-stats');if(statsEl)statsEl.innerHTML='';}

  // AP127-only stats
  const rec127=rec.filter(r=>r.batch==='AP127');
  const total127=rec127.length;
  const hours127=rec127.reduce((a,r)=>a+r.mins,0)/60;
  const dates127=[...new Set(rec127.map(r=>r.date))];
  const avg127=dates127.length?(total127/dates127.length):0;
  const peak127Entry=dates127.length?dates127.reduce((best,d)=>((dm[d]?.bn?.AP127||0)>(dm[best]?.bn?.AP127||0)?d:best),dates127[0]):null;
  const f127=id=>{const el=document.getElementById(id);return el||{textContent:''};};
  f127('pf-127-flights').textContent=total127||'-';
  f127('pf-127-hours').textContent=total127?hours127.toFixed(1):'-';
  f127('pf-127-days').textContent=dates127.length||'-';
  f127('pf-127-avg').textContent=total127?avg127.toFixed(2):'-';
  f127('pf-127-peak').textContent=peak127Entry?ap127FmtDate(peak127Entry):'-';
  const peakSub=document.getElementById('pf-127-peak-sub');
  if(peakSub)peakSub.textContent=peak127Entry?`${dm[peak127Entry]?.bn?.AP127||0} flights`:'';

  // Weekly performance summary table
  const wkOf=(ds)=>{const d=new Date(ds+'T12:00:00Z'),dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);return d.toISOString().slice(0,10);};
  const wkMap={};
  allDates.forEach(d=>{const wk=wkOf(d);if(!wkMap[wk])wkMap[wk]={wk,n:0,h:0,days:0,bn:{AP124:0,AP126:0,AP127:0,AP129:0}};wkMap[wk].days++;wkMap[wk].n+=dm[d].n;wkMap[wk].h+=dm[d].h;['AP124','AP126','AP127','AP129'].forEach(b=>{wkMap[wk].bn[b]+=(dm[d].bn[b]||0);});});
  const wks=Object.values(wkMap).sort((a,b)=>a.wk.localeCompare(b.wk));
  const maxWkN=Math.max(1,...wks.map(w=>w.n));
  const BHEX={AP124:'#4ba3f7',AP126:'#7acf7e',AP127:'#e88aff',AP129:'#e9bd63'};
  const wkEl=document.getElementById('pf-weekly');
  if(wkEl){
    if(!wks.length){wkEl.innerHTML='';}else{
      wkEl.innerHTML=`<table class="pf-week-tbl"><thead><tr>
        <th>Week of</th><th>Days</th><th colspan="2">Flights</th><th>Avg/day</th><th>Hours</th>
        <th style="color:${BHEX.AP124}">AP124</th><th style="color:${BHEX.AP126}">AP126</th>
        <th style="color:${BHEX.AP127}">AP127</th><th style="color:${BHEX.AP129}">AP129</th>
        <th>vs prior wk</th></tr></thead><tbody>
        ${wks.map((w,wi)=>{
          const avgD=w.days?(w.n/w.days).toFixed(1):'—';
          const prev=wi>0?wks[wi-1]:null;
          const dPct=prev&&prev.n?((w.n-prev.n)/prev.n*100):null;
          const dDir=dPct===null?'<span style="color:var(--tx3)">—</span>':dPct>5?`<span style="color:var(--c126)">↑ ${Math.abs(dPct).toFixed(0)}%</span>`:dPct<-5?`<span style="color:#f87171">↓ ${Math.abs(dPct).toFixed(0)}%</span>`:`<span style="color:var(--tx3)">→ ${Math.abs(dPct).toFixed(0)}%</span>`;
          const barW=Math.round(w.n/maxWkN*100);
          return `<tr>
            <td class="pf-week-date">${ap127ShortDate(w.wk)}</td>
            <td>${w.days}</td>
            <td style="font-weight:600">${w.n}</td>
            <td style="width:60px"><div style="width:${barW}%;height:3px;background:var(--c127);border-radius:2px;min-width:2px"></div></td>
            <td>${avgD}</td>
            <td>${w.h.toFixed(1)}</td>
            ${['AP124','AP126','AP127','AP129'].map(b=>`<td style="color:${BHEX[b]}">${w.bn[b]||0}</td>`).join('')}
            <td>${dDir}</td>
          </tr>`;
        }).join('')}
      </tbody></table>`;
    }
  }
}

function resetPerformanceFilters(){
  const today=ap127TodayBKK();
  const a=document.getElementById("pf-from"),b=document.getElementById("pf-to"),
        c=document.getElementById("pf-batch"),d=document.getElementById("pf-recent-n");
  if(a)a.value=getThreeMonthsAgo();
  if(b){b.value=today;b.max=today;}
  if(c)c.value="ALL";
  if(d)d.value="30";
  document.getElementById('pf-inc-we')?.classList.remove('active');
  document.getElementById('pf-inc-hol')?.classList.remove('active');
  ['pf-127-flights','pf-127-hours','pf-127-days','pf-127-avg','pf-127-peak'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.textContent='-';
  });
  const sub=document.getElementById('pf-127-peak-sub');if(sub)sub.textContent='-';
  renderPerformance();
}

  // ======================== end verbatim NGT_001 logic ========================

  // ---- Progress Detail (NGT_001 "Flight Plans"), with REAL scheduled dates ----
  // Per-batch rank colour (verbatim from NGT_001).
  function ap127RankClass(rank, total) { if (rank <= 3) return "bad"; if (rank <= Math.ceil(total * .4)) return "mid"; return "ok"; }

  // Map a student+lesson to its ACTUAL scheduled date from the Operations feed
  // (window.FLIGHT_DATA) — replacing the scheduler's projected date. Built once.
  // Keyed exactly like the cross-check engine so AP127 names/lessons line up.
  let OPS_SCHED = null, OPS_UPCOMING = null;
  function opsUpcomingMap() {
    if (OPS_UPCOMING) return OPS_UPCOMING;
    OPS_UPCOMING = new Map();
    const R = window.AP127Reconcile;
    const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
    if (!R) return OPS_UPCOMING;
    const bySL = new Map();
    flights.forEach(f => {
      if (!f.student || !f.lesson || f.status === 'Canceled' || f.status === 'Completed') return;
      const sk = R.ccNameNorm(f.student), lk = R.normLesson(f.lesson), mk = sk + '|' + lk;
      const prev = bySL.get(mk);
      if (!prev || f.date < prev.date) bySL.set(mk, f);
    });
    bySL.forEach((f, mk) => {
      const sk = mk.split('|')[0];
      if (!OPS_UPCOMING.has(sk)) OPS_UPCOMING.set(sk, []);
      OPS_UPCOMING.get(sk).push(f);
    });
    OPS_UPCOMING.forEach(arr => arr.sort((a, b) => (a.date || '').localeCompare(b.date || '')));
    return OPS_UPCOMING;
  }
  function opsUpcomingFor(fullName) {
    const R = window.AP127Reconcile;
    if (!R) return [];
    return opsUpcomingMap().get(R.ccKeyFromFull(fullName)) || [];
  }
  function opsSchedMap() {
    if (OPS_SCHED) return OPS_SCHED;
    OPS_SCHED = new Map();
    const R = window.AP127Reconcile;
    const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
    if (!R) return OPS_SCHED;
    flights.forEach(f => {
      if (!f.student || !f.lesson || !f.date || f.status === 'Canceled') return;
      const k = R.ccNameNorm(f.student) + '|' + R.normLesson(f.lesson);
      const prev = OPS_SCHED.get(k);
      // earliest non-cancelled scheduled date for that student+lesson
      if (!prev || f.date < prev) OPS_SCHED.set(k, f.date);
    });
    return OPS_SCHED;
  }
  function scheduledDateFor(fullName, lesson) {
    const R = window.AP127Reconcile;
    if (!R) return null;
    return opsSchedMap().get(R.ccKeyFromFull(fullName) + '|' + R.normLesson(lesson)) || null;
  }

  // makeCard — future-lesson dates come from the live Operations schedule for
  // all batches; TBC if not yet scheduled.
  function makeCard(s, rankClass = "") {
    const col = BC[s.batch], bg = BB[s.batch];
    const nick = s.nick ? `<span style="font-family:'JetBrains Mono',monospace;font-size:8px;padding:1px 3px;border-radius:2px;background:${bg};color:${col};margin-left:3px">${s.nick}</span>` : "";
    const fRows = (s.flown || []).slice(-CFG.recents).map(f => `<div class="lr"><div class="ld" style="background:var(--done)"></div><div class="ldate" style="color:var(--done)">${fd(f.date)}</div><div class="lname" style="color:var(--done)">${f.lesson}</div><div class="ldur">${f.actual_ft || hm(f.actual_mins)}</div></div>`).join("");
    const upcoming = opsUpcomingFor(s.name);
    const Rc = window.AP127Reconcile;
    const pRows = upcoming.slice(0, CFG.upcomings).map(f => {
      const lv = f.durMin || (Rc && Rc.hmToMin(f.duration)) || 60;
      return `<div class="lr"><div class="ld" style="background:${col};opacity:.5"></div><div class="ldate">${fd(f.date)}</div><div class="lname" style="color:${col}">${f.lesson}</div><div class="ldur">${hm(lv)}</div></div>`;
    }).join("");
    const sep = (s.flown?.length && upcoming.length) ? `<div class="lsep">▸ ${s.remaining} remaining · next ${Math.min(CFG.upcomings, upcoming.length)} scheduled shown</div>` : "";
    const more = upcoming.length > CFG.upcomings ? `<div class="moret">+${upcoming.length - CFG.upcomings} more</div>` : "";
    const nextOps = upcoming[0] || null;
    const nextLesson = (nextOps && nextOps.lesson) || (s.next_lesson && s.next_lesson !== "COMPLETE" ? s.next_lesson : null);
    const nextDate = nextOps ? nextOps.date : null;
    const ntag = CFG.showNextTag && nextLesson ? `<b style="color:${col}">${nextLesson}</b>` : "";
    const ndateTag = nextLesson ? `<span style="color:${nextDate ? 'var(--tx2)' : 'var(--tx3)'};margin-left:3px${nextDate ? '' : ';font-style:italic'}">${nextDate ? fd(nextDate) : 'TBC'}</span>` : "";
    return `<div class="scard" data-catc="${s.catc_id}" data-batch="${s.batch}" title="Click for all records"><div class="sh"><div><div class="sname">${s.name}${nick}</div><div class="smeta">${s.batch} · ${s.done}/${s.total}</div></div><div><div class="spct" style="color:${col}">${s.pct.toFixed(1)}%</div><div class="spct2">${s.remaining} left</div></div></div><div class="pb"><div class="pf" style="width:${Math.max(s.pct, .3)}%;background:${col}"></div></div><div class="sb2" style="max-height:${CFG.cardH}px">${fRows}${sep}${pRows}${more}</div><div class="sf2"><span style="font-size:10px;color:var(--tx3)">Next:${ntag ? ` ${ntag}${ndateTag}` : ""}</span><span class="ftag" style="background:${bg};color:${col};border:1px solid ${col}33">View all ›</span></div></div>`;
  }

  // ── SP detail modal — all records for one student (all batches: OPS+PROG) ──
  const SP_SRC = {
    both:   { c: "#22c55e", t: "Confirmed in both Operations & Progress" },
    review: { c: "#fbbf24", t: "In both, but date/duration differ — review" },
    ops:    { c: "#fb923c", t: "Flown in Operations, not yet posted to Progress" },
    prog:   { c: "#60a5fa", t: "Logged in Progress, no matching Operations flight" },
    sched:  { c: "#38bdf8", t: "Scheduled in Operations (upcoming)" },
    plan:   { c: "#6e7681", t: "Planned only — not yet scheduled (TBC)" },
  };
  function closeSpModal() {
    const m = document.getElementById("sp-modal"); if (m) m.remove();
    document.removeEventListener("keydown", spModalKey);
  }
  function spModalKey(e) { if (e.key === "Escape") closeSpModal(); }
  function buildSpRows(s) {
    const R = window.AP127Reconcile;
    const norm = l => R ? R.normLesson(l) : String(l || "").toUpperCase().trim();
    const flights = ((window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [])
      .filter(f => f.student && f.lesson && f.status !== "Canceled" && R && R.ccNameNorm(f.student) === R.ccKeyFromFull(s.name));
    const opsBy = {};
    flights.forEach(f => {
      const k = norm(f.lesson); const prev = opsBy[k];
      if (!prev || ((f.status === "Completed" && prev.status !== "Completed") || (f.status === prev.status && (f.date || "") < (prev.date || "")))) opsBy[k] = f;
    });
    const flownBy = {}; (s.flown || []).forEach(f => { if (f.lesson) flownBy[norm(f.lesson)] = f; });
    // modal shows only real records: PROG flown + OPS flights — no projected plan
    const keys = [...new Set([...Object.keys(flownBy), ...Object.keys(opsBy)])];
    return keys.map(k => {
      const pf = flownBy[k], op = opsBy[k], opsDone = op && op.status === "Completed";
      const lesson = (pf && pf.lesson) || (op && op.lesson) || k;
      let src, status, date, mins;
      if (pf || opsDone) {
        status = "Completed";
        date = (pf && pf.date) || (op && op.date) || "";
        mins = (pf && pf.actual_mins) || (op && R && R.hmToMin(op.duration)) || (op && op.durMin) || 0;
        if (pf && opsDone) {
          const dd = R ? R.dateDiff(op.date, pf.date) : 0;
          const oM = R ? R.hmToMin(op.duration) : null, pM = pf.actual_mins;
          src = ((dd != null && Math.abs(dd) > 1) || (oM != null && pM != null && Math.abs(oM - pM) > 20)) ? "review" : "both";
        } else src = pf ? "prog" : "ops";
      } else {
        date = (op && op.date) || "";
        mins = (op && op.durMin) || 0;
        status = "Scheduled"; src = "sched";
      }
      return { lesson, date, mins, status, src };
    });
  }
  function openSpModal(s) {
    closeSpModal();
    const col = BC[s.batch] || "#888", bg = BB[s.batch] || "rgba(255,255,255,.06)";
    const rows = buildSpRows(s);
    rows.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    const SC = { Completed: "var(--done)", Scheduled: "#38bdf8" };
    const rowHtml = rows.map(r => {
      const dotCell = `<td style="text-align:center">${r.src ? `<span title="${SP_SRC[r.src].t}" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${SP_SRC[r.src].c}"></span>` : ""}</td>`;
      return `<tr>${dotCell}<td style="white-space:nowrap;color:var(--tx2)">${r.date ? fd(r.date) : "—"}</td><td style="font-family:'JetBrains Mono',monospace">${r.lesson || "—"}</td><td style="text-align:right;color:var(--tx2)">${r.mins ? hm(r.mins) : "—"}</td><td><span style="font-size:9px;padding:1px 5px;border-radius:3px;color:${SC[r.status] || "var(--tx3)"};background:${(SC[r.status] || "var(--tx3)")}22">${r.status}</span></td></tr>`;
    }).join("");
    const legend = `<div class="sp-legend">${["both", "review", "ops", "prog", "sched"].map(k => `<span title="${SP_SRC[k].t}"><span class="sp-dot" style="background:${SP_SRC[k].c}"></span>${({ both: "Both agree", review: "Differ", ops: "Ops only", prog: "Prog only", sched: "Scheduled" })[k]}</span>`).join("")}</div>`;
    const note = `<div class="sp-note"><b>How this is processed:</b> Shows only real records — completed lessons from Progress (PROG) and flights from the live Operations schedule. No projected plan dates. Dots show agreement between the two systems.</div>`;
    const colW = 5;
    const ov = document.createElement("div");
    ov.id = "sp-modal"; ov.className = "sp-modal-ov";
    ov.innerHTML = `<div class="sp-modal" onclick="event.stopPropagation()">
      <div class="sp-modal-h" style="border-bottom:2px solid ${col}">
        <div><div class="sp-modal-name">${s.name}${s.nick ? ` <span style="font-size:10px;color:${col};background:${bg};padding:1px 5px;border-radius:3px;font-family:'JetBrains Mono',monospace">${s.nick}</span>` : ""}</div>
        <div class="sp-modal-meta">${s.batch} · ${s.done}/${s.total} lessons · ${s.pct.toFixed(1)}% · ${s.remaining} remaining</div></div>
        <button class="sp-modal-x" aria-label="Close">✕</button>
      </div>
      ${note}${legend}
      <div class="sp-modal-body">
        <table class="sp-table"><thead><tr><th style='width:24px'>●</th><th>Date</th><th>Lesson</th><th style="text-align:right">Hrs</th><th>Status</th></tr></thead>
        <tbody>${rowHtml || `<tr><td colspan="${colW}" style="text-align:center;color:var(--tx3);padding:18px">No records</td></tr>`}</tbody></table>
      </div>
    </div>`;
    ov.addEventListener("click", closeSpModal);
    ov.querySelector(".sp-modal-x").addEventListener("click", closeSpModal);
    // Append inside the .ngt-prog container so the scoped CSS variables resolve.
    (document.querySelector(".ngt-prog") || document.body).appendChild(ov);
    document.addEventListener("keydown", spModalKey);
  }

  // renderPlans — verbatim from NGT_001.
  function renderPlans() {
    const q = document.getElementById("si").value.toLowerCase(); const srt = document.getElementById("ss-sel").value;
    let arr = filtSt();
    if (q) arr = arr.filter(s => s.name.toLowerCase().includes(q) || (s.nick || "").toLowerCase().includes(q));
    if (srt === "pct") arr = [...arr].sort((a, b) => b.pct - a.pct);
    else if (srt === "name") arr = [...arr].sort((a, b) => a.name.localeCompare(b.name));
    const sg = document.getElementById("sg");
    sg.innerHTML = arr.map(s => makeCard(s)).join("");
    document.getElementById("pc").textContent = arr.length + " students" + (AB === "ALL" ? "" : " · " + AB);
    // Delegate card clicks → full-record modal (attached once).
    if (!sg._spBound) {
      sg.addEventListener("click", e => {
        const card = e.target.closest(".scard"); if (!card) return;
        const id = card.getAttribute("data-catc");
        const st = allSt().find(s => String(s.catc_id) === String(id));
        if (st) openSpModal(st);
      });
      sg._spBound = true;
    }
  }
  function setPlansBatch(b) { AB = b || "ALL"; renderPlans(); }

  function onRestRegChange(checked){ CFG.restReg=checked; }
  function onPriorityChange(val){
    CFG.priority=(CFG.priority===val)?null:val;
    renderPriorityChips();
  }
  function renderPriorityChips(){
    ['ap126','ap126_ap127','ap127'].forEach(v=>{
      const el=document.getElementById('sim-pri-'+v);
      if(!el)return;
      const active=CFG.priority===v;
      el.style.border=`1px solid ${active?'var(--c127)':'var(--bd)'}`;
      el.style.background=active?'color-mix(in oklch,var(--c127) 14%,var(--s1))':'transparent';
      el.style.color=active?'var(--c127)':'var(--tx3)';
      el.style.fontWeight=active?'600':'400';
    });
    const info=document.getElementById('sim-priority-info');
    if(!info)return;
    const labels={'ap126':'AP126 → AP124 → AP127','ap126_ap127':'AP126 → AP127 → AP124','ap127':'AP127 → AP124 → AP126'};
    info.textContent=CFG.priority?labels[CFG.priority]:'AP124 → AP126 → AP127 (default)';
  }

  // Expose inline-handler targets referenced by the embedded markup + generated rows.
  Object.assign(window, { renderPerformance, resetPerformanceFilters, runSimulation, renderSimulation, addExtraBatch, removeExtraBatch, updateExtraBatch, toggleHourMode, onWeHolCapInput, propagateCapToWeHol, renderPlans, setPlansBatch, onRestRegChange, onPriorityChange, renderPriorityChips,
    runSimulation2, renderSimulation2, addExtraBatch2, removeExtraBatch2, updateExtraBatch2, toggleHourMode2, onWeHolCapInput2, propagateCapToWeHol2, onRestRegChange2, onPriorityChange2, renderPriorityChips2, onModeChange2, onWeightChange2, resetWeights2, renderSchedulingModeUI2,
    runSimulation3, sim3Field3, sim3Weather3, sim3Toggle3, sim3OnMcToggle3, sim3OnHardCapInput3, sim3OnModeChange3, sim3OnWeightChange3, sim3ResetWeights3, sim3OnPriorityChange3, sim3OnHourMode3, sim3AddExtra3, sim3RemoveExtra3, sim3UpdateExtra3, sim3AddScenario3, sim3DeleteScenario3, sim3DuplicateScenario3, sim3SetBaseline3, sim3PinScenario3, sim3RenameScenario3, sim3SelectScenario3, sim3ResetDefaults3, sim3SetCompareTab3, sim3EnterPresent3, sim3ExitPresent3, sim3NarrativeStep3, sim3ToggleBeforeAfter3, sim3AddAnnotation3, sim3SetAp129Start3 });

  // ---- page markups (verbatim from NGT_001 index.html) ----
const MK_OVERVIEW = `
<div id="page-overview" class="page">
  <div class="ss" id="ss"></div>
  <div class="cr" id="cr-main">
    <div class="cb"><div class="ch">Daily Flight Load</div><div class="cs">Avg flights/workday · cap = dashed · Priority: AP124→AP126→AP127→AP129</div><div style="position:relative;height:190px"><canvas id="c-load"></canvas></div></div>
    <div class="cb"><div class="ch">All Students Progress</div><div class="cs">Lessons done vs remaining, by batch</div><div style="position:relative;height:190px"><canvas id="c-prog"></canvas></div></div>
  </div>
  <div class="tl-wrap">
    <div class="tl-title">Batch Timeline — planned dates · solid = completed · faded = remaining</div>
    <div class="tl-marks" id="tl-marks"></div>
    <div class="tl-rows" id="tl-rows"></div>
  </div>
  <div class="cr c3" id="cr-batch">
    <div class="cb"><div class="ch" style="color:var(--c124)">AP124</div><div class="cs" id="inf-124"></div><div style="position:relative;height:130px"><canvas id="c-124"></canvas></div></div>
    <div class="cb"><div class="ch" style="color:var(--c126)">AP126</div><div class="cs" id="inf-126"></div><div style="position:relative;height:130px"><canvas id="c-126"></canvas></div></div>
    <div class="cb"><div class="ch" style="color:var(--c127)">AP127</div><div class="cs" id="inf-127"></div><div style="position:relative;height:130px"><canvas id="c-127"></canvas></div></div>
  </div>
</div>

`;
const MK_PLANS = `
<div id="page-plans" class="page">
  <div class="pf-filter" style="margin-bottom:12px">
    <div class="pt">Progress Detail — per-student plan</div>
    <div class="fr">
      <input id="si" type="text" placeholder="Search name / callsign..." oninput="renderPlans()">
      <select id="pl-batch" onchange="setPlansBatch(this.value)">
        <option value="ALL">All batches</option>
        <option value="AP124">AP124</option><option value="AP126">AP126</option>
        <option value="AP127">AP127</option><option value="AP129">AP129</option>
      </select>
      <select id="ss-sel" onchange="renderPlans()">
        <option value="batch">Batch order</option>
        <option value="pct">Progress %</option><option value="name">Name A–Z</option>
      </select>
      <span id="pc" class="d127-meta"></span>
      <span class="d127-meta" style="margin-left:auto">Upcoming dates from live Operations schedule · TBC = not yet scheduled · click a card for all records</span>
    </div>
  </div>
  <div class="sg" id="sg"></div>
</div>

`;
const MK_PERF = `
<div id="page-performance" class="page">
  <div class="pf-filter">
    <div class="pt">Performance Filters</div>
    <div class="fr">
      <input id="pf-from" type="date" onchange="renderPerformance()">
      <input id="pf-to" type="date" onchange="renderPerformance()">
      <select id="pf-batch" onchange="renderPerformance()">
        <option value="ALL">All batches</option>
        <option value="AP124">AP124</option>
        <option value="AP126">AP126</option>
        <option value="AP127">AP127</option>
        <option value="AP129">AP129</option>
      </select>
      <select id="pf-recent-n" onchange="renderPerformance()">
        <option value="30">Recent 30 Days</option>
        <option value="20">Recent 20 Days</option>
        <option value="14">Recent 14 Days</option>
        <option value="45">Recent 45 Days</option>
      </select>
      <button id="pf-inc-we"  class="bt" onclick="this.classList.toggle('active');renderPerformance()">Incl WE</button>
      <button id="pf-inc-hol" class="bt" onclick="this.classList.toggle('active');renderPerformance()">Incl HOL</button>
      <button class="btn-s" onclick="resetPerformanceFilters()">Reset Filter</button>
      <span id="pf-filter-note" class="d127-meta">Historical view</span>
    </div>
  </div>
  <div class="ss">
    <div class="sc ca"><div class="sl">Total Historical Flights</div><div class="sv" id="pf-total-flights">-</div><div class="ss2">All completed flights</div></div>
    <div class="sc c124"><div class="sl">Total Historical Hours</div><div class="sv" style="color:var(--c124)" id="pf-total-hours">-</div><div class="ss2">Actual flown time</div></div>
    <div class="sc c126"><div class="sl">Business Days</div><div class="sv" style="color:var(--c126)" id="pf-days">-</div><div class="ss2">Weekdays excluding holidays</div></div>
    <div class="sc c127"><div class="sl">Avg Flights / Day</div><div class="sv" style="color:var(--c127)" id="pf-avg">-</div><div class="ss2">Historical average</div></div>
    <div class="sc c129"><div class="sl">Peak Day</div><div class="sv" style="color:var(--c129)" id="pf-peak">-</div><div class="ss2" id="pf-peak-sub">-</div></div>
  </div>
  <div class="ss" style="grid-template-columns:repeat(4,1fr)">
    <div class="sc c124"><div class="sl">Median Flights / Day</div><div class="sv" style="color:var(--c124)" id="pf-med">-</div><div class="ss2">Typical operating load</div></div>
    <div class="sc c126"><div class="sl">Avg Hours / Day</div><div class="sv" style="color:var(--c126)" id="pf-avg-h">-</div><div class="ss2">Daily intensity</div></div>
    <div class="sc c127"><div class="sl">Best Weekday</div><div class="sv" style="color:var(--c127)" id="pf-best-wd">-</div><div class="ss2" id="pf-best-wd-sub">-</div></div>
    <div class="sc c129"><div class="sl">Top Batch Share</div><div class="sv" style="color:var(--c129)" id="pf-top-batch">-</div><div class="ss2" id="pf-top-batch-sub">-</div></div>
  </div>
  <div style="font-size:9px;color:var(--c127);font-family:'JetBrains Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;padding:0 1px">AP127 Only</div>
  <div class="ss">
    <div class="sc c127"><div class="sl">AP127 Flights</div><div class="sv" style="color:var(--c127)" id="pf-127-flights">-</div><div class="ss2">in selected range</div></div>
    <div class="sc c127"><div class="sl">AP127 Hours</div><div class="sv" style="color:var(--c127)" id="pf-127-hours">-</div><div class="ss2">actual flown time</div></div>
    <div class="sc c127"><div class="sl">AP127 Ops Days</div><div class="sv" style="color:var(--c127)" id="pf-127-days">-</div><div class="ss2">days with AP127 flights</div></div>
    <div class="sc c127"><div class="sl">AP127 Avg / Day</div><div class="sv" style="color:var(--c127)" id="pf-127-avg">-</div><div class="ss2">per AP127 ops day</div></div>
    <div class="sc c127"><div class="sl">AP127 Peak Day</div><div class="sv" style="color:var(--c127)" id="pf-127-peak">-</div><div class="ss2" id="pf-127-peak-sub">-</div></div>
  </div>
  <div id="pf-trend" style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--tx2);margin:0 0 14px;padding:8px 14px;background:var(--s1);border-radius:5px;border:1px solid var(--bd)">—</div>
  <div class="cb">
    <div class="ch">Daily Flights by Batch</div>
    <div class="cs">Stacked bars · flights/day, coloured by batch</div>
    <div class="chart-resize-wrap" id="wrap-perf-daily-f"><canvas id="c-perf-daily-f"></canvas></div>
  </div>
  <div class="cb">
    <div class="ch">Daily Hours by Batch</div>
    <div class="cs">Stacked bars · flight-hours/day, coloured by batch</div>
    <div class="chart-resize-wrap" id="wrap-perf-daily-h"><canvas id="c-perf-daily-h"></canvas></div>
  </div>
  <div class="cb">
    <div class="ch">Monthly Actual Hours by Batch</div>
    <div class="cs">Historical stacked hours contribution</div>
    <div class="chart-resize-wrap" id="wrap-perf-monthly"><canvas id="c-perf-monthly"></canvas></div>
  </div>
  <div class="cb">
    <div class="ch">Monthly Hours — Side by Side</div>
    <div class="cs">Grouped bars · compare batch contributions per month</div>
    <div class="chart-resize-wrap" id="wrap-perf-monthly-g"><canvas id="c-perf-monthly-g"></canvas></div>
  </div>
  <div class="cb">
    <div class="ch" id="pf-recent-title">Recent Operating Days</div>
    <div class="cs" id="pf-recent-sub">Most recent N days with flights</div>
    <div style="position:relative;height:220px"><canvas id="c-perf-recent"></canvas></div>
    <div id="pf-recent-stats" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px"></div>
  </div>
  <div class="cb" style="margin-top:12px">
    <div class="ch">Weekly Performance</div>
    <div class="cs">Aggregated by calendar week (Mon–Sun) · ordered oldest → newest · vs prior wk = week-over-week flight count change</div>
    <div id="pf-weekly" style="overflow-x:auto;margin-top:8px"></div>
  </div>
</div>

`;
const MK_SIM = `
<div id="page-simulation" class="page">
  <div class="sim-wrap">
    <!-- Controls -->
    <div class="sim-controls">
      <div class="sim-ctrl-title">Scheduler Parameters</div>
      <div class="sim-ctrl-row">
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl" id="cap-mode-lbl">Daily Flight Cap</div>
          <div class="sim-ctrl-desc" id="cap-mode-desc">Max total flights per day across all batches</div>
          <div class="sim-ctrl-val">
            <input type="range" id="sim-cap" min="5" max="50" value="25" oninput="document.getElementById('sim-cap-v').textContent=this.value;propagateCapToWeHol(this.value)">
            <span class="sim-rv" id="sim-cap-v">25</span>
            <span style="font-size:10px;color:var(--tx3)" id="cap-mode-unit">/day</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">Cap Mode</div>
          <div class="sim-ctrl-desc">How daily capacity is measured</div>
          <div class="sim-ctrl-val" style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--tx3)">Flights</span>
            <label class="tsw"><input type="checkbox" id="sim-hour-mode" onchange="toggleHourMode(this.checked)"><span class="tsw-track"></span></label>
            <span style="font-size:10px;color:var(--tx3)">Hours</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">AP129 Start Date</div>
          <div class="sim-ctrl-desc">13 students (fixed) · uses AP127 curriculum</div>
          <div class="sim-ctrl-val">
            <input type="text" id="sim-129s" value="2026-06-01" placeholder="YYYY-MM-DD">
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">Planning Horizon</div>
          <div class="sim-ctrl-desc">Workdays to project forward from today</div>
          <div class="sim-ctrl-val">
            <input type="range" id="sim-hor" min="200" max="1200" step="50" value="800" oninput="document.getElementById('sim-hor-v').textContent=this.value">
            <span class="sim-rv" id="sim-hor-v">800</span>
            <span style="font-size:10px;color:var(--tx3)">days</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl" id="wecap-lbl">Weekend Cap</div>
          <div class="sim-ctrl-desc">Max flights/day on Sat & Sun · 0 disables weekend flying</div>
          <div class="sim-ctrl-val">
            <input type="range" id="sim-wecap" min="0" max="50" value="13" oninput="onWeHolCapInput('we')">
            <span class="sim-rv" id="sim-wecap-v">13</span>
            <span style="font-size:10px;color:var(--tx3)" id="wecap-unit">/day</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl" id="holcap-lbl">Holiday Cap</div>
          <div class="sim-ctrl-desc">Max flights/day on Thai public holidays · 0 disables holiday flying</div>
          <div class="sim-ctrl-val">
            <input type="range" id="sim-holcap" min="0" max="50" value="13" oninput="onWeHolCapInput('hol')">
            <span class="sim-rv" id="sim-holcap-v">13</span>
            <span style="font-size:10px;color:var(--tx3)" id="holcap-unit">/day</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">Resting Regulation</div>
          <div class="sim-ctrl-desc">After a flight ≥ 2 hrs, student skips 1 extra workday before next flight</div>
          <div class="sim-ctrl-val" style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--tx3)">Off</span>
            <label class="tsw"><input type="checkbox" id="sim-rest-reg" onchange="onRestRegChange(this.checked)"><span class="tsw-track"></span></label>
            <span style="font-size:10px;color:var(--tx3)">On</span>
          </div>
        </div>
      </div>
      <div class="sim-ctrl-title" style="margin-top:4px">Priority Regulation</div>
      <div style="font-size:10px;color:var(--tx3);margin-bottom:10px;line-height:1.5">Override default batch priority. Select one option, or none for default order.</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        <button id="sim-pri-ap126" class="bt" onclick="onPriorityChange('ap126')">AP126 first</button>
        <button id="sim-pri-ap126_ap127" class="bt" onclick="onPriorityChange('ap126_ap127')">AP126 + AP127 first</button>
        <button id="sim-pri-ap127" class="bt" onclick="onPriorityChange('ap127')">AP127 first</button>
      </div>
      <div class="sim-ctrl-title" style="margin-top:4px">Additional Batches</div>
      <div style="font-size:10px;color:var(--tx3);margin-bottom:10px;line-height:1.5">All additional batches use the AP127 curriculum (101 lessons). Priority after AP129.</div>
      <div id="sim-extra-list" class="sim-extra-list"></div>
      <button class="sim-add-btn" onclick="addExtraBatch()">+ Add Batch</button>
      <div style="margin-top:14px;display:flex;gap:8px;align-items:center">
        <button class="btn-p" style="background:var(--c127);border:none;font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;padding:7px 18px;border-radius:5px;color:#000;cursor:pointer" onclick="runSimulation()">▶ Run Simulation</button>
        <span id="sim-status" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--tx3)"></span>
      </div>
    </div>
    <!-- How simulation works -->
    <details class="sim-info-panel">
      <summary>How the Simulation Works</summary>
      <div class="sim-info-grid">
        <div class="sim-info-item">
          <div class="sim-info-lbl">Schedule start</div>
          <div class="sim-info-val">Today (Bangkok time) — only future workdays are scheduled</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Priority order</div>
          <div class="sim-info-val" id="sim-priority-info">AP124 → AP126 → AP127 (default)</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Daily cap</div>
          <div class="sim-info-val">Max N flights/day shared across all batches combined — higher-priority batches fill slots first</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Student eligibility</div>
          <div class="sim-info-val">Must wait <b>1 workday</b> after a lesson &lt; 120 min · <b>2 workdays</b> after a lesson ≥ 120 min (2 hr+). Within a batch, the student furthest behind their plan fills next.</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Workdays</div>
          <div class="sim-info-val">Monday–Friday only · 14 Thai public holidays in 2026 excluded</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Curriculum</div>
          <div class="sim-info-val"><span style="color:var(--c124)">AP124</span>: 97 lessons · <span style="color:var(--c126)">AP126</span> / <span style="color:var(--c127)">AP127</span> / <span style="color:var(--c129)">AP129</span> / Extra: 101 lessons (AP127 curriculum)</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">ETC basis</div>
          <div class="sim-info-val">Projected finish = date of the last student's last planned lesson. "Months to go" counts from today to that date.</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">AP124 / AP126 / AP127</div>
          <div class="sim-info-val">Actual flights already completed are locked in; only remaining lessons are scheduled forward from today</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">AP129 &amp; Extra batches</div>
          <div class="sim-info-val">Start from zero — all 101 lessons scheduled from the batch start date onward</div>
        </div>
      </div>
    </details>
    <!-- Finish date projection -->
    <div>
      <div class="sim-ctrl-title" style="margin-bottom:10px">Estimated Finish Dates</div>
      <div class="sim-finish-grid" id="sim-finish-grid">
        <div class="sim-hint">Click ▶ Run Simulation to see finish date projections.</div>
      </div>
    </div>
    <!-- Capacity chart -->
    <div class="cb">
      <div class="ch" id="sim-cap-title">Monthly Flight Capacity — avg flights/workday per batch</div>
      <div class="cs" id="sim-cap-sub">Stacked by batch · dashed = daily cap · run simulation to update</div>
      <div style="position:relative;height:310px"><canvas id="c-sim-cap"></canvas></div>
    </div>
  </div>
</div>

<!-- ##AP127PAGE_START## -->
`;

const MK_SIM2 = `
<div id="page-sim2" class="page">
  <div class="sim-wrap">
    <div class="sim-controls">
      <div class="sim-ctrl-title">Scheduler Parameters <span style="font-size:10px;color:var(--c126);font-weight:400;margin-left:6px">⚖ Simulation 2</span></div>
      <div class="sim-ctrl-row">
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl" id="s2-cap-mode-lbl">Daily Flight Cap</div>
          <div class="sim-ctrl-desc" id="s2-cap-mode-desc">Max total flights per day across all batches</div>
          <div class="sim-ctrl-val">
            <input type="range" id="s2-cap" min="5" max="50" value="25" oninput="document.getElementById('s2-cap-v').textContent=this.value;propagateCapToWeHol2(this.value)">
            <span class="sim-rv" id="s2-cap-v">25</span>
            <span style="font-size:10px;color:var(--tx3)" id="s2-cap-mode-unit">/day</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">Cap Mode</div>
          <div class="sim-ctrl-desc">How daily capacity is measured</div>
          <div class="sim-ctrl-val" style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--tx3)">Flights</span>
            <label class="tsw"><input type="checkbox" id="s2-hour-mode" onchange="toggleHourMode2(this.checked)"><span class="tsw-track"></span></label>
            <span style="font-size:10px;color:var(--tx3)">Hours</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">AP129 Start Date</div>
          <div class="sim-ctrl-desc">13 students (fixed) · uses AP127 curriculum</div>
          <div class="sim-ctrl-val">
            <input type="text" id="s2-129s" value="2026-06-01" placeholder="YYYY-MM-DD">
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">Planning Horizon</div>
          <div class="sim-ctrl-desc">Workdays to project forward from today</div>
          <div class="sim-ctrl-val">
            <input type="range" id="s2-hor" min="200" max="1200" step="50" value="800" oninput="document.getElementById('s2-hor-v').textContent=this.value">
            <span class="sim-rv" id="s2-hor-v">800</span>
            <span style="font-size:10px;color:var(--tx3)">days</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">Weekend Cap</div>
          <div class="sim-ctrl-desc">Max flights/day on Sat &amp; Sun · 0 disables weekend flying</div>
          <div class="sim-ctrl-val">
            <input type="range" id="s2-wecap" min="0" max="50" value="13" oninput="onWeHolCapInput2('we')">
            <span class="sim-rv" id="s2-wecap-v">13</span>
            <span style="font-size:10px;color:var(--tx3)" id="s2-wecap-unit">/day</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">Holiday Cap</div>
          <div class="sim-ctrl-desc">Max flights/day on Thai public holidays · 0 disables holiday flying</div>
          <div class="sim-ctrl-val">
            <input type="range" id="s2-holcap" min="0" max="50" value="13" oninput="onWeHolCapInput2('hol')">
            <span class="sim-rv" id="s2-holcap-v">13</span>
            <span style="font-size:10px;color:var(--tx3)" id="s2-holcap-unit">/day</span>
          </div>
        </div>
        <div class="sim-ctrl-item">
          <div class="sim-ctrl-lbl">Resting Regulation</div>
          <div class="sim-ctrl-desc">After a flight ≥ 2 hrs, student skips 1 extra workday before next flight</div>
          <div class="sim-ctrl-val" style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--tx3)">Off</span>
            <label class="tsw"><input type="checkbox" id="s2-rest-reg" onchange="onRestRegChange2(this.checked)"><span class="tsw-track"></span></label>
            <span style="font-size:10px;color:var(--tx3)">On</span>
          </div>
        </div>
      </div>
      <div class="sim-ctrl-title" style="margin-top:4px">Scheduling Mode</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
        <button id="s2-mode-balanced" class="bt" onclick="onModeChange2('balanced')">⚖ Balanced</button>
        <button id="s2-mode-priority" class="bt" onclick="onModeChange2('priority')">▶ Priority</button>
        <span style="font-size:9px;color:var(--tx3);margin-left:4px">Balanced: proportional by weight × students · Priority: strict fill order</span>
      </div>
      <div id="s2-weight-panel">
        <div style="font-size:10px;color:var(--tx3);margin-bottom:8px;line-height:1.5">Weight multiplier per batch. Effective share = weight × student count / total. Default 1.0 = proportional to batch size.</div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:8px">
          <div class="sim-ctrl-item">
            <div class="sim-ctrl-lbl" style="color:var(--c124)">AP124 weight</div>
            <div class="sim-ctrl-val">
              <input type="range" id="s2-wt-AP124" min="0.5" max="3.0" step="0.1" value="1.0" oninput="onWeightChange2('AP124',this.value)">
              <span class="sim-rv" id="s2-wt-v-AP124">1.0</span><span style="font-size:10px;color:var(--tx3)">×</span>
            </div>
          </div>
          <div class="sim-ctrl-item">
            <div class="sim-ctrl-lbl" style="color:var(--c126)">AP126 weight</div>
            <div class="sim-ctrl-val">
              <input type="range" id="s2-wt-AP126" min="0.5" max="3.0" step="0.1" value="1.0" oninput="onWeightChange2('AP126',this.value)">
              <span class="sim-rv" id="s2-wt-v-AP126">1.0</span><span style="font-size:10px;color:var(--tx3)">×</span>
            </div>
          </div>
          <div class="sim-ctrl-item">
            <div class="sim-ctrl-lbl" style="color:var(--c127)">AP127 weight</div>
            <div class="sim-ctrl-val">
              <input type="range" id="s2-wt-AP127" min="0.5" max="3.0" step="0.1" value="1.0" oninput="onWeightChange2('AP127',this.value)">
              <span class="sim-rv" id="s2-wt-v-AP127">1.0</span><span style="font-size:10px;color:var(--tx3)">×</span>
            </div>
          </div>
          <div class="sim-ctrl-item">
            <div class="sim-ctrl-lbl" style="color:var(--c129)">AP129 weight</div>
            <div class="sim-ctrl-val">
              <input type="range" id="s2-wt-AP129" min="0.5" max="3.0" step="0.1" value="1.0" oninput="onWeightChange2('AP129',this.value)">
              <span class="sim-rv" id="s2-wt-v-AP129">1.0</span><span style="font-size:10px;color:var(--tx3)">×</span>
            </div>
          </div>
        </div>
        <button class="sim-add-btn" style="margin-bottom:10px" onclick="resetWeights2()">↺ Reset weights</button>
      </div>
      <div id="s2-priority-panel" style="display:none">
        <div style="font-size:10px;color:var(--tx3);margin-bottom:10px;line-height:1.5">Override default batch priority. Select one option, or none for default order.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          <button id="s2-pri-ap126" class="bt" onclick="onPriorityChange2('ap126')">AP126 first</button>
          <button id="s2-pri-ap126_ap127" class="bt" onclick="onPriorityChange2('ap126_ap127')">AP126 + AP127 first</button>
          <button id="s2-pri-ap127" class="bt" onclick="onPriorityChange2('ap127')">AP127 first</button>
        </div>
      </div>
      <div class="sim-ctrl-title" style="margin-top:4px">Additional Batches</div>
      <div style="font-size:10px;color:var(--tx3);margin-bottom:10px;line-height:1.5">Additional batches use the AP127 curriculum (101 lessons). Add a weight multiplier per batch for balanced mode.</div>
      <div id="s2-extra-list" class="sim-extra-list"></div>
      <button class="sim-add-btn" onclick="addExtraBatch2()">+ Add Batch</button>
      <div style="margin-top:14px;display:flex;gap:8px;align-items:center">
        <button class="btn-p" style="background:var(--c126);border:none;font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;padding:7px 18px;border-radius:5px;color:#000;cursor:pointer" onclick="runSimulation2()">▶ Run Simulation 2</button>
        <span id="s2-status" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--tx3)"></span>
      </div>
    </div>
    <details class="sim-info-panel">
      <summary>How Simulation 2 Works</summary>
      <div class="sim-info-grid">
        <div class="sim-info-item">
          <div class="sim-info-lbl">Schedule start</div>
          <div class="sim-info-val">Today (Bangkok time) — only future workdays are scheduled</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Scheduling mode</div>
          <div class="sim-info-val" id="s2-priority-info">Balanced — AP124×1.0 · AP126×1.0 · AP127×1.0 · AP129×1.0</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Daily cap</div>
          <div class="sim-info-val">Max N flights/day shared across active batches. In <b>balanced</b> mode, each batch gets slots proportional to weight × student count — no batch starves another. In <b>priority</b> mode, higher-priority batches fill first (same as Simulation).</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Student eligibility</div>
          <div class="sim-info-val">Must wait <b>1 workday</b> after a lesson &lt; 120 min · <b>2 workdays</b> after a lesson ≥ 120 min. Within a batch, the student furthest behind their plan fills next.</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Workdays</div>
          <div class="sim-info-val">Monday–Friday only · Thai public holidays excluded · weekend/holiday caps configurable</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">Curriculum</div>
          <div class="sim-info-val"><span style="color:var(--c124)">AP124</span>: 97 lessons · <span style="color:var(--c126)">AP126</span> / <span style="color:var(--c127)">AP127</span> / <span style="color:var(--c129)">AP129</span> / Extra: 101 lessons (AP127 curriculum)</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">ETC basis</div>
          <div class="sim-info-val">Projected finish = date of the last student's last planned lesson.</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">AP124 / AP126 / AP127</div>
          <div class="sim-info-val">Actual flights already completed are locked in; only remaining lessons are scheduled forward</div>
        </div>
        <div class="sim-info-item">
          <div class="sim-info-lbl">AP129 &amp; Extra batches</div>
          <div class="sim-info-val">Start from zero — all 101 lessons scheduled from the batch start date onward</div>
        </div>
      </div>
    </details>
    <div>
      <div class="sim-ctrl-title" style="margin-bottom:10px">Estimated Finish Dates</div>
      <div class="sim-finish-grid" id="s2-finish-grid">
        <div class="sim-hint">Click ▶ Run Simulation 2 to see finish date projections.</div>
      </div>
    </div>
    <div class="cb">
      <div class="ch" id="s2-cap-title">Monthly Flight Capacity — avg flights/workday per batch</div>
      <div class="cs" id="s2-cap-sub">Stacked by batch · dashed = daily cap · run simulation to update</div>
      <div style="position:relative;height:310px"><canvas id="c-s2-cap"></canvas></div>
    </div>
  </div>
</div>
`;

const MK_SIM3 = `
<div id="page-sim3" class="page">
  <div class="sim-wrap s3-wrap">
    <div class="s3-topbar">
      <div class="s3-topbar-l">
        <span class="s3-badge">◆ SIMULATION 3 · DECISION COCKPIT</span>
        <span id="s3-assumptions" class="s3-assume"></span>
      </div>
      <div class="s3-topbar-r">
        <button class="s3-run" onclick="runSimulation3()">▶ Run All</button>
        <button class="s3-present-launch" onclick="sim3EnterPresent3()">⛶ Present to CEO</button>
      </div>
    </div>

    <div id="s3-present-bar" class="s3-present-bar">
      <button id="s3-ba-btn" class="bt" onclick="sim3ToggleBeforeAfter3()">Showing: PROPOSED</button>
      <div id="s3-present-caption" class="s3-present-cap"></div>
      <div class="s3-present-nav">
        <button class="bt" onclick="sim3NarrativeStep3(-1)">◀</button>
        <span id="s3-present-dots" class="s3-present-dots"></span>
        <button class="bt" onclick="sim3NarrativeStep3(1)">▶</button>
        <button class="bt" onclick="sim3ExitPresent3()">✕ Exit</button>
      </div>
    </div>

    <div id="s3-hero" class="s3-hero"></div>

    <div class="s3-section s3-hide-present">
      <div class="s3-sec-head">
        <span class="sim-ctrl-title" style="margin:0">Scenarios</span>
        <div class="s3-preset-btns">
          <button class="sim-add-btn" onclick="sim3AddScenario3()">+ Blank</button>
          <button class="sim-add-btn" onclick="sim3AddScenario3('+2ac')">+2 Aircraft</button>
          <button class="sim-add-btn" onclick="sim3AddScenario3('+3fi')">+3 Instructors</button>
          <button class="sim-add-btn" onclick="sim3AddScenario3('monsoon')">Monsoon Hit</button>
          <button class="sim-add-btn" onclick="sim3AddScenario3('dryStart')">Dry-season Push</button>
        </div>
      </div>
      <div id="s3-scn-strip" class="s3-scn-strip"></div>
      <div class="s3-hint-line">★ = baseline (all deltas compare to it) · 📌 = pinned to overlay timeline · editing the levers below tunes the <b>selected</b> scenario live.</div>
    </div>

    <div class="s3-section">
      <div class="s3-cmp-tabs">
        <button id="s3-cmp-tab-cards" class="bt" onclick="sim3SetCompareTab3('cards')">▦ Scenario Cards</button>
        <button id="s3-cmp-tab-timeline" class="bt" onclick="sim3SetCompareTab3('timeline')">▭ Overlay Timeline</button>
        <button id="s3-cmp-tab-tornado" class="bt" onclick="sim3SetCompareTab3('tornado')">◧ Tornado (sensitivity)</button>
        <button id="s3-cmp-tab-waterfall" class="bt" onclick="sim3SetCompareTab3('waterfall')">▤ Waterfall (bridge)</button>
      </div>
      <div id="s3-cmp-cards" class="s3-cmp-cards"></div>
      <div id="s3-cmp-timeline" style="display:none"><div id="s3-timeline" class="s3-timeline"></div></div>
      <div id="s3-cmp-tornado" style="display:none"><div class="cs" id="s3-tornado-sub"></div><div id="s3-tornado-empty" class="s3-hint-line"></div><div style="position:relative;height:320px"><canvas id="c-s3-tornado"></canvas></div></div>
      <div id="s3-cmp-waterfall" style="display:none"><div class="cs" id="s3-waterfall-sub"></div><div id="s3-waterfall-empty" class="s3-hint-line"></div><div style="position:relative;height:320px"><canvas id="c-s3-waterfall"></canvas></div></div>
    </div>

    <div class="cb s3-hide-present">
      <div class="ch">Monthly Demand vs Effective Supply — active scenario</div>
      <div class="cs" id="s3-cap-sub">Run to update</div>
      <div style="position:relative;height:300px"><canvas id="c-s3-cap"></canvas></div>
    </div>

    <div class="s3-hide-present">
      <div class="sim-ctrl-title" style="margin-bottom:10px">Estimated Finish Dates — active scenario · P50/P90 from Monte-Carlo</div>
      <div class="sim-finish-grid" id="s3-finish-grid"><div class="sim-hint">Run Simulation 3 to see finish dates.</div></div>
    </div>

    <details class="sim-info-panel s3-hide-present s3-levers" open>
      <summary>Scenario Levers — tune the selected scenario (updates live)</summary>
      <div class="s3-levers-body">

        <div class="sim-ctrl-title">✈ Fleet &amp; Maintenance <span class="s3-pill assume">ASSUMPTION</span><span class="s3-pill data" style="margin-left:4px">fleet seeded from peak history</span></div>
        <div class="sim-ctrl-row">
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Airworthy fleet</div><div class="sim-ctrl-desc">Trainers available to fly</div><div class="sim-ctrl-val"><input type="range" id="s3-fleetSize" min="4" max="30" step="1" value="12" oninput="sim3Field3('sim3.fleetSize',this.value,'s3-fleetSize-v',0)"><span class="sim-rv" id="s3-fleetSize-v">12</span><span class="s3-u">a/c</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Serviceability</div><div class="sim-ctrl-desc">% of fleet available on an average day</div><div class="sim-ctrl-val"><input type="range" id="s3-availability" min="0.4" max="0.98" step="0.01" value="0.75" oninput="sim3Field3('sim3.availability',this.value,'s3-availability-v','pct')"><span class="sim-rv" id="s3-availability-v">75%</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Sorties / aircraft</div><div class="sim-ctrl-desc">Turns per aircraft per operating day</div><div class="sim-ctrl-val"><input type="range" id="s3-sortiesPerAc" min="1" max="8" step="0.5" value="4" oninput="sim3Field3('sim3.sortiesPerAc',this.value,'s3-sortiesPerAc-v',1)"><span class="sim-rv" id="s3-sortiesPerAc-v">4.0</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Avg sortie length <span class="s3-pill data">DATA</span></div><div class="sim-ctrl-desc">Mean flight hours (from history)</div><div class="sim-ctrl-val"><input type="range" id="s3-avgSortieHrs" min="0.7" max="2.5" step="0.1" value="1.2" oninput="sim3Field3('sim3.avgSortieHrs',this.value,'s3-avgSortieHrs-v',1)"><span class="sim-rv" id="s3-avgSortieHrs-v">1.2</span><span class="s3-u">h</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Mechanistic maintenance</div><div class="sim-ctrl-desc">Model per-aircraft 100-hr checks + snags instead of a flat availability %</div><div class="sim-ctrl-val" style="gap:8px"><span class="s3-u">Off</span><label class="tsw"><input type="checkbox" id="s3-maint" onchange="sim3Toggle3('sim3.maintEnabled',this.checked)"><span class="tsw-track"></span></label><span class="s3-u">On</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Check interval</div><div class="sim-ctrl-desc">Flight hours between scheduled checks</div><div class="sim-ctrl-val"><input type="range" id="s3-maintHours" min="50" max="200" step="10" value="100" oninput="sim3Field3('sim3.maintHours',this.value,'s3-maintHours-v',0)"><span class="sim-rv" id="s3-maintHours-v">100</span><span class="s3-u">h</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Check downtime</div><div class="sim-ctrl-desc">Days an aircraft is grounded per check</div><div class="sim-ctrl-val"><input type="range" id="s3-maintDays" min="1" max="14" step="1" value="5" oninput="sim3Field3('sim3.maintDays',this.value,'s3-maintDays-v',0)"><span class="sim-rv" id="s3-maintDays-v">5</span><span class="s3-u">d</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Daily snag rate</div><div class="sim-ctrl-desc">Chance an aircraft goes u/s on a given day</div><div class="sim-ctrl-val"><input type="range" id="s3-snagRate" min="0" max="0.15" step="0.005" value="0.03" oninput="sim3Field3('sim3.snagRate',this.value,'s3-snagRate-v','pct')"><span class="sim-rv" id="s3-snagRate-v">3%</span></div></div>
        </div>

        <div class="sim-ctrl-title">👤 Instructors <span class="s3-pill data">count seeded from roster</span></div>
        <div class="sim-ctrl-row">
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Instructor headcount</div><div class="sim-ctrl-desc">Flight instructors available</div><div class="sim-ctrl-val"><input type="range" id="s3-instructors" min="4" max="40" step="1" value="14" oninput="sim3Field3('sim3.instructors',this.value,'s3-instructors-v',0)"><span class="sim-rv" id="s3-instructors-v">14</span><span class="s3-u">FI</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Instructor availability</div><div class="sim-ctrl-desc">% on the line (leave, ground duties netted out)</div><div class="sim-ctrl-val"><input type="range" id="s3-instructorAvail" min="0.4" max="0.99" step="0.01" value="0.85" oninput="sim3Field3('sim3.instructorAvail',this.value,'s3-instructorAvail-v','pct')"><span class="sim-rv" id="s3-instructorAvail-v">85%</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Sorties / instructor</div><div class="sim-ctrl-desc">Instructional sorties per FI per day</div><div class="sim-ctrl-val"><input type="range" id="s3-sortiesPerInstr" min="1" max="6" step="0.5" value="2" oninput="sim3Field3('sim3.sortiesPerInstr',this.value,'s3-sortiesPerInstr-v',1)"><span class="sim-rv" id="s3-sortiesPerInstr-v">2.0</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Students / instructor</div><div class="sim-ctrl-desc">Target ratio (reporting only)</div><div class="sim-ctrl-val"><input type="range" id="s3-studentsPerInstr" min="2" max="10" step="1" value="4" oninput="sim3Field3('sim3.studentsPerInstr',this.value,'s3-studentsPerInstr-v',0)"><span class="sim-rv" id="s3-studentsPerInstr-v">4</span></div></div>
        </div>

        <div class="sim-ctrl-title">⛅ Weather, Checks &amp; Attrition <span class="s3-pill assume">ASSUMPTION</span></div>
        <div class="s3-wx-wrap"><div class="s3-wx-title">Monthly cancellation rate — Thailand monsoon profile (drag any month)</div><div id="s3-weather-grid" class="s3-weather-grid"></div></div>
        <div class="sim-ctrl-row">
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Examiner slots / week</div><div class="sim-ctrl-desc">Checkride throughput across the academy</div><div class="sim-ctrl-val"><input type="range" id="s3-examinerSlotsPerWeek" min="1" max="20" step="1" value="5" oninput="sim3Field3('sim3.examinerSlotsPerWeek',this.value,'s3-examinerSlotsPerWeek-v',0)"><span class="sim-rv" id="s3-examinerSlotsPerWeek-v">5</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Check gates / student</div><div class="sim-ctrl-desc">Stage checks &amp; checkrides per student</div><div class="sim-ctrl-val"><input type="range" id="s3-checkGates" min="0" max="8" step="1" value="4" oninput="sim3Field3('sim3.checkGates',this.value,'s3-checkGates-v',0)"><span class="sim-rv" id="s3-checkGates-v">4</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Check pass rate</div><div class="sim-ctrl-desc">First-attempt pass — fails add examiner demand</div><div class="sim-ctrl-val"><input type="range" id="s3-checkPassRate" min="0.5" max="1" step="0.01" value="0.85" oninput="sim3Field3('sim3.checkPassRate',this.value,'s3-checkPassRate-v','pct')"><span class="sim-rv" id="s3-checkPassRate-v">85%</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Washback rate</div><div class="sim-ctrl-desc">Share of lessons repeated — inflates workload</div><div class="sim-ctrl-val"><input type="range" id="s3-washbackRate" min="0" max="0.4" step="0.01" value="0.15" oninput="sim3Field3('sim3.washbackRate',this.value,'s3-washbackRate-v','pct')"><span class="sim-rv" id="s3-washbackRate-v">15%</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Attrition / phase</div><div class="sim-ctrl-desc">Drop-out per training phase (graduates delivered)</div><div class="sim-ctrl-val"><input type="range" id="s3-attritionPerPhase" min="0" max="0.15" step="0.005" value="0.04" oninput="sim3Field3('sim3.attritionPerPhase',this.value,'s3-attritionPerPhase-v','pct')"><span class="sim-rv" id="s3-attritionPerPhase-v">4%</span></div></div>
        </div>

        <div class="sim-ctrl-title">⚖ Scheduling &amp; Operating Days</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <button id="s3-mode-balanced" class="bt" onclick="sim3OnModeChange3('balanced')">⚖ Balanced</button>
          <button id="s3-mode-priority" class="bt" onclick="sim3OnModeChange3('priority')">▶ Priority</button>
          <span class="s3-u">Balanced = proportional by weight × students · Priority = strict fill order</span>
        </div>
        <div id="s3-weight-panel">
          <div class="sim-ctrl-row">
            <div class="sim-ctrl-item"><div class="sim-ctrl-lbl" style="color:var(--c124)">AP124 weight</div><div class="sim-ctrl-val"><input type="range" id="s3-wt-AP124" min="0.5" max="3" step="0.1" value="1" oninput="sim3OnWeightChange3('AP124',this.value)"><span class="sim-rv" id="s3-wt-v-AP124">1.0</span><span class="s3-u">×</span></div></div>
            <div class="sim-ctrl-item"><div class="sim-ctrl-lbl" style="color:var(--c126)">AP126 weight</div><div class="sim-ctrl-val"><input type="range" id="s3-wt-AP126" min="0.5" max="3" step="0.1" value="1" oninput="sim3OnWeightChange3('AP126',this.value)"><span class="sim-rv" id="s3-wt-v-AP126">1.0</span><span class="s3-u">×</span></div></div>
            <div class="sim-ctrl-item"><div class="sim-ctrl-lbl" style="color:var(--c127)">AP127 weight</div><div class="sim-ctrl-val"><input type="range" id="s3-wt-AP127" min="0.5" max="3" step="0.1" value="1" oninput="sim3OnWeightChange3('AP127',this.value)"><span class="sim-rv" id="s3-wt-v-AP127">1.0</span><span class="s3-u">×</span></div></div>
            <div class="sim-ctrl-item"><div class="sim-ctrl-lbl" style="color:var(--c129)">AP129 weight</div><div class="sim-ctrl-val"><input type="range" id="s3-wt-AP129" min="0.5" max="3" step="0.1" value="1" oninput="sim3OnWeightChange3('AP129',this.value)"><span class="sim-rv" id="s3-wt-v-AP129">1.0</span><span class="s3-u">×</span></div></div>
          </div>
          <button class="sim-add-btn" style="margin-bottom:8px" onclick="sim3ResetWeights3()">↺ Reset weights</button>
        </div>
        <div id="s3-priority-panel" style="display:none">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <button id="s3-pri-ap126" class="bt" onclick="sim3OnPriorityChange3('ap126')">AP126 first</button>
            <button id="s3-pri-ap126_ap127" class="bt" onclick="sim3OnPriorityChange3('ap126_ap127')">AP126 + AP127 first</button>
            <button id="s3-pri-ap127" class="bt" onclick="sim3OnPriorityChange3('ap127')">AP127 first</button>
          </div>
        </div>
        <div class="sim-ctrl-row">
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Daily hard ceiling</div><div class="sim-ctrl-desc">Airfield/ATC max — realism factors reduce below this</div><div class="sim-ctrl-val"><input type="range" id="s3-cap" min="5" max="60" step="1" value="30" oninput="sim3OnHardCapInput3(this.value)"><span class="sim-rv" id="s3-cap-v">30</span><span class="s3-u" id="s3-cap-unit">/day</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Cap mode</div><div class="sim-ctrl-desc">Measure capacity in flights or hours</div><div class="sim-ctrl-val" style="gap:8px"><span class="s3-u">Flights</span><label class="tsw"><input type="checkbox" id="s3-hour-mode" onchange="sim3OnHourMode3(this.checked)"><span class="tsw-track"></span></label><span class="s3-u">Hours</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Planning horizon</div><div class="sim-ctrl-desc">Workdays projected forward</div><div class="sim-ctrl-val"><input type="range" id="s3-hor" min="200" max="1200" step="50" value="800" oninput="sim3Field3('horizon',this.value,'s3-hor-v',0)"><span class="sim-rv" id="s3-hor-v">800</span><span class="s3-u">d</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">AP129 start date</div><div class="sim-ctrl-desc">13 students · AP127 curriculum</div><div class="sim-ctrl-val"><input type="text" id="s3-129s" value="2026-06-01" placeholder="YYYY-MM-DD" oninput="sim3SetAp129Start3(this.value)"></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Weekend cap</div><div class="sim-ctrl-desc">Max sorties/day Sat &amp; Sun · 0 = no weekend flying</div><div class="sim-ctrl-val"><input type="range" id="s3-wecap" min="0" max="60" step="1" value="0" oninput="sim3Field3('weekendCap',this.value,'s3-wecap-v',0)"><span class="sim-rv" id="s3-wecap-v">0</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Holiday cap</div><div class="sim-ctrl-desc">Max sorties/day on Thai holidays · 0 = none</div><div class="sim-ctrl-val"><input type="range" id="s3-holcap" min="0" max="60" step="1" value="0" oninput="sim3Field3('holidayCap',this.value,'s3-holcap-v',0)"><span class="sim-rv" id="s3-holcap-v">0</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Resting regulation</div><div class="sim-ctrl-desc">Extra rest day after a long (≥2h) sortie</div><div class="sim-ctrl-val" style="gap:8px"><span class="s3-u">Off</span><label class="tsw"><input type="checkbox" id="s3-rest-reg" onchange="sim3Toggle3('restReg',this.checked)"><span class="tsw-track"></span></label><span class="s3-u">On</span></div></div>
        </div>

        <div class="sim-ctrl-title">🎲 Uncertainty (Monte-Carlo)</div>
        <div class="sim-ctrl-row">
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Confidence bands</div><div class="sim-ctrl-desc">Run many trials with random weather/availability/washback for P50 &amp; P90 dates</div><div class="sim-ctrl-val" style="gap:8px"><span class="s3-u">Off</span><label class="tsw"><input type="checkbox" id="s3-mc" onchange="sim3OnMcToggle3(this.checked)"><span class="tsw-track"></span></label><span class="s3-u">On</span></div></div>
          <div class="sim-ctrl-item"><div class="sim-ctrl-lbl">Trials</div><div class="sim-ctrl-desc">More = smoother bands, slower</div><div class="sim-ctrl-val"><input type="range" id="s3-mcTrials" min="40" max="500" step="20" value="160" oninput="sim3Field3('sim3.mcTrials',this.value,'s3-mcTrials-v',0)"><span class="sim-rv" id="s3-mcTrials-v">160</span></div></div>
        </div>

        <div class="sim-ctrl-title">➕ Additional Batches</div>
        <div id="s3-extra-list" class="sim-extra-list"></div>
        <button class="sim-add-btn" onclick="sim3AddExtra3()">+ Add Batch</button>
        <div style="margin-top:14px"><button class="sim-add-btn" onclick="sim3ResetDefaults3()">↺ Reset this scenario to defaults</button></div>
      </div>
    </details>

    <details class="sim-info-panel s3-hide-present">
      <summary>How Simulation 3 Works</summary>
      <div class="sim-info-grid">
        <div class="sim-info-item"><div class="sim-info-lbl">The core idea</div><div class="sim-info-val">Unlike Sim 1 (priority) and Sim 2 (balanced weights), the daily flight cap here is <b>computed from reality</b>: effective capacity = weather × min(aircraft ceiling, instructor ceiling, airfield ceiling). Turn the levers a CEO controls and watch graduation dates move.</div></div>
        <div class="sim-info-item"><div class="sim-info-lbl">Binding constraint</div><div class="sim-info-val">Every day the model records which ceiling was lowest — aircraft, instructors, or airfield. The KPI tells you what is actually holding the date back, so you invest in the right lever.</div></div>
        <div class="sim-info-item"><div class="sim-info-lbl">DATA vs ASSUMPTION</div><div class="sim-info-val"><span class="s3-pill data">DATA</span> inputs come from the live cache (student progress, curricula, holidays, instructor roster, avg sortie length). <span class="s3-pill assume">ASSUMPTION</span> inputs (fleet availability, weather, washback) are yours to set — shown so the board sees provenance.</div></div>
        <div class="sim-info-item"><div class="sim-info-lbl">Monte-Carlo P50/P90</div><div class="sim-info-val">Hundreds of trials randomise weather, serviceability and washback to give a likely date (P50) and a prudent worst-case (P90). Runs in the background; bands appear when ready.</div></div>
        <div class="sim-info-item"><div class="sim-info-lbl">Scenarios</div><div class="sim-info-val">Save named what-ifs (Baseline, +2 Aircraft, +3 Instructors, Monsoon). Compare with delta cards, an overlay timeline, a tornado sensitivity chart, and a waterfall bridge.</div></div>
        <div class="sim-info-item"><div class="sim-info-lbl">Washback &amp; attrition</div><div class="sim-info-val">Washback inflates each student's remaining sorties (repeats). Attrition reduces graduates delivered. Examiner-queue delay is added to each batch's finish.</div></div>
        <div class="sim-info-item"><div class="sim-info-lbl">Validity check</div><div class="sim-info-val">Fleet load (hours per aircraft per day) is shown against a healthy 4–6h band, so an implausible configuration is flagged before it reaches the board.</div></div>
        <div class="sim-info-item"><div class="sim-info-lbl">Present to CEO</div><div class="sim-info-val">⛶ launches a fullscreen kiosk: big hero number, before/after toggle (key <b>F</b>), and arrow-key narrative (Baseline → bottleneck → fix → bridge). Esc exits.</div></div>
      </div>
    </details>
  </div>
</div>
`;

  function initG() { if (!G && window.NGT_CACHE) G = window.NGT_CACHE; return G; }
  function destroy() {
    try { Object.values(CHARTS).forEach(c => { try { c && c.destroy?.(); } catch (e) {} }); } catch (e) {}
    try { (CHARTS._ro||[]).forEach(ro=>ro.disconnect()); CHARTS._ro=[]; } catch(e){}
  }

  const { useRef, useEffect } = React;
  function makeView(markup, render) {
    return function () {
      const ref = useRef(null);
      useEffect(() => {
        if (!ref.current) return;
        initG();
        if (!G) { ref.current.innerHTML = '<div style="padding:40px;text-align:center;color:#8b949e;font-family:monospace">Loading program data…</div>'; return; }
        ref.current.innerHTML = markup;
        try { render(); } catch (e) { console.error('[program] render error', e); }
        return () => destroy();
      }, []);
      return React.createElement('div', { className: 'ngt-prog', ref, style: { height: '100%', overflow: 'auto', padding: 14, minHeight: 0 } });
    };
  }

  window.ProgramOverviewView = makeView(MK_OVERVIEW, () => {
    renderStats(); buildLoad(); buildProg(); renderTimeline();
    buildBC('c-124', 'inf-124', 'ap124', BC.AP124);
    buildBC('c-126', 'inf-126', 'ap126', BC.AP126);
    buildBC('c-127', 'inf-127', 'ap127', BC.AP127);
  });
  window.SchoolPerformanceView = makeView(MK_PERF, () => { resetPerformanceFilters(); });
  window.SimulationView = makeView(MK_SIM, () => {
    renderSimulation();
    if (SIM_G) { renderSimFinish(); buildSimCapacityChart(); }
  });
  window.Simulation2View = makeView(MK_SIM2, () => {
    renderSimulation2();
    if (SIM2_G) { renderSim2Finish(); buildSim2CapacityChart(); }
  });
  window.Simulation3View = makeView(MK_SIM3, () => { sim3Boot3(); });
  window.ProgressDetailView = makeView(MK_PLANS, () => { AB = "ALL"; renderPlans(); });
})();
