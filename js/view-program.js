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
  let G = null, SIM_G = null, EXTRA_BATCHES = [], AB = "ALL";
  const CHARTS = {};
  let CFG = { cap: 25, n129: 13, ap129start: "2026-06-01", horizon: 800, hourMode: false, weekendCap: 13, holidayCap: 13, _weAuto: true, _holAuto: true, recents: 3, upcomings: 8, showRest: true, showNextTag: true, cardH: 220, restReg: false, priority: null };
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
  const opts=chart.options?.plugins?.catcNowLine;
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
function runScheduler(batchData,curricula,extraBatches=[],startDate="",hourMode=false,weekendCap=0,holidayCap=0){
  const{cap,n129,ap129start,horizon}=CFG;
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
    for(let i=0;i<n;i++){if(iM[b][i]>=tot)continue;const gap=(CFG.restReg&&lmM[b][i]>=120)?2:1;if((wi-lwM[b][i])<gap)continue;out.push([(tot-iM[b][i])/wl,i]);}
    return out.sort((a,z)=>z[0]-a[0]);
  }
  wds.forEach((ds,wi)=>{
    let slots=ops[wi].cap;
    priorityOrder(CFG.priority).forEach(b=>{
      if(slots<=0)return;const cur=curricula[b]||[];
      for(const[,i]of elig(b,cur,wi)){if(slots<=0)break;const ix=iM[b][i];if(ix>=cur.length)continue;const p=cur[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM[b][i].push([ds,p.lesson,p.planned_mins]);lwM[b][i]=wi;lmM[b][i]=p.planned_mins;iM[b][i]=ix+1;slots-=cost;}
    });
    if(slots>0&&wi>=w129)for(const[,i]of elig("AP129",cur129,wi)){if(slots<=0)break;const ix=iM.AP129[i];if(ix>=cur129.length)continue;const p=cur129[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM.AP129[i].push([ds,p.lesson,p.planned_mins]);lwM.AP129[i]=wi;lmM.AP129[i]=p.planned_mins;iM.AP129[i]=ix+1;slots-=cost;}
    extraBatches.forEach((b,bi)=>{
      if(slots<=0||wi<wExtra[bi])return;
      const k=b.name;
      for(const[,i]of elig(k,cur129,wi,b.n)){if(slots<=0)break;const ix=iM[k][i];if(ix>=cur129.length)continue;const p=cur129[ix];const cost=hourMode?p.planned_mins/60:1;if(slots<cost)continue;schM[k][i].push([ds,p.lesson,p.planned_mins]);lwM[k][i]=wi;lmM[k][i]=p.planned_mins;iM[k][i]=ix+1;slots-=cost;}
    });
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
  if(recentTitle)recentTitle.textContent=`Recent ${recentN} Operating Days`;
  if(!allDates.length){
    ["pf-total-flights","pf-total-hours","pf-days","pf-avg","pf-peak","pf-med","pf-avg-h","pf-best-wd","pf-top-batch"].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent="-";});
    const sub=document.getElementById("pf-peak-sub");if(sub)sub.textContent="-";
    const sub2=document.getElementById("pf-best-wd-sub");if(sub2)sub2.textContent="-";
    const sub3=document.getElementById("pf-top-batch-sub");if(sub3)sub3.textContent="-";
    const recent=document.getElementById("pf-recent");if(recent)recent.innerHTML=`<div class="d127-ad">No historical data yet.</div>`;
    ["perfDailyF","perfDailyH","perfMonthly"].forEach(k=>{if(CHARTS[k]){CHARTS[k].destroy();CHARTS[k]=null;}});
    return;
  }
  const totalFlights=rec.length,totalHours=rec.reduce((a,r)=>a+r.mins,0)/60;
  const dm={};
  allDates.forEach(d=>{dm[d]={n:0,h:0,b:{AP124:0,AP126:0,AP127:0,AP129:0},bn:{AP124:0,AP126:0,AP127:0,AP129:0}};});
  rec.forEach(r=>{if(!dm[r.date])dm[r.date]={n:0,h:0,b:{AP124:0,AP126:0,AP127:0,AP129:0},bn:{AP124:0,AP126:0,AP127:0,AP129:0}};dm[r.date].n++;dm[r.date].h+=r.mins/60;dm[r.date].b[r.batch]=(dm[r.date].b[r.batch]||0)+(r.mins/60);dm[r.date].bn[r.batch]=(dm[r.date].bn[r.batch]||0)+1;});
  const dates=[...allDates];
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

  // Batch palette (canonical, matches TODAY view).
  const BPAL=[["AP124","rgba(75,163,247,.80)"],["AP126","rgba(122,207,126,.80)"],["AP127","rgba(232,138,255,.80)"],["AP129","rgba(233,189,99,.80)"]];
  const dailyOpts=(unit)=>({responsive:true,maintainAspectRatio:false,
    plugins:{legend:{labels:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",boxWidth:8}},
      tooltip:{callbacks:{title:([c])=>ap127FmtDate(dates[c.dataIndex]),footer:(items)=>"Total: "+items.reduce((a,i)=>a+(i.raw||0),0).toFixed(unit==="h"?1:0)+" "+(unit==="h"?"hrs":"flights")}}},
    scales:{x:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681",maxTicksLimit:18},grid:{color:"#21262d"}},
      y:{stacked:true,beginAtZero:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#6e7681"},grid:{color:"#21262d"},title:{display:true,text:unit==="h"?"hours / day":"flights / day",color:"#8b949e",font:{size:9,family:"JetBrains Mono"}}}}});
  // Daily FLIGHTS — stacked by batch.
  CHARTS.perfDailyF=mkC("c-perf-daily-f",{type:"bar",data:{labels:dates,datasets:BPAL.map(([b,c])=>({label:b,data:dates.map(d=>dm[d].bn[b]||0),backgroundColor:c,stack:"f"}))},options:dailyOpts("n")});
  observeChartResize('perfDailyF','wrap-perf-daily-f');
  // Daily HOURS — stacked by batch.
  CHARTS.perfDailyH=mkC("c-perf-daily-h",{type:"bar",data:{labels:dates,datasets:BPAL.map(([b,c])=>({label:b,data:dates.map(d=>+(dm[d].b[b]||0).toFixed(2)),backgroundColor:c,stack:"h"}))},options:dailyOpts("h")});
  observeChartResize('perfDailyH','wrap-perf-daily-h');

  const mm={};
  rec.forEach(r=>{const m=r.date.slice(0,7);if(!mm[m])mm[m]={AP124:0,AP126:0,AP127:0,AP129:0};mm[m][r.batch]+=r.mins/60;});
  const months=Object.keys(mm).sort();
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
      plugins:{legend:{labels:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",boxWidth:8}}},
      scales:{
        x:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681"},grid:{color:"#21262d"}},
        y:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#6e7681"},grid:{color:"#21262d"}}
      }
    }
  });
  observeChartResize('perfMonthly','wrap-perf-monthly');

  const recent=dates.filter(d=>dm[d].n>0).slice(-recentN).reverse();
  const BPAL_HEX={AP124:'#4ba3f7',AP126:'#7acf7e',AP127:'#e88aff',AP129:'#e9bd63'};
  const BPAL_KEYS=['AP124','AP126','AP127','AP129'];
  document.getElementById("pf-recent").innerHTML=recent.length?recent.map(d=>{
    const tot=dm[d].n;
    const segs=BPAL_KEYS.map(b=>{
      const pct=(dm[d].bn[b]||0)/tot*100;
      return pct>0?`<div style="flex:${pct.toFixed(1)};background:${BPAL_HEX[b]};height:100%"></div>`:'';
    }).join('');
    return`<div class="pf-day-card"><div class="pf-day-card-date">${ap127ShortDate(d)}</div><div class="pf-day-card-bar">${segs}</div><div class="pf-day-card-n">${tot}</div><div class="pf-day-card-h">${dm[d].h.toFixed(1)}h</div></div>`;
  }).join(''):`<div style="color:var(--tx3);font-size:10px;padding:10px">No data in range.</div>`;
}

function resetPerformanceFilters(){
  const today=ap127TodayBKK();
  const a=document.getElementById("pf-from"),b=document.getElementById("pf-to"),
        c=document.getElementById("pf-batch"),d=document.getElementById("pf-recent-n");
  if(a)a.value=getThreeMonthsAgo();
  if(b){b.value=today;b.max=today;}
  if(c)c.value="ALL";
  if(d)d.value="20";
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
  let OPS_SCHED = null;
  function opsSchedMap() {
    if (OPS_SCHED) return OPS_SCHED;
    OPS_SCHED = new Map();
    const R = window.AP127Reconcile;
    const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
    if (!R) return OPS_SCHED;
    flights.forEach(f => {
      if (!f.student || !f.lesson || !f.date || f.status === 'Canceled') return;
      if (!R.isAP127(f.batch)) return;
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

  // makeCard — NGT_001 verbatim EXCEPT future-lesson dates: the simulation's
  // projected date is replaced by the real Operations-scheduled date, or "TBC".
  function makeCard(s, rankClass = "") {
    const col = BC[s.batch], bg = BB[s.batch];
    const nick = s.nick ? `<span style="font-family:'JetBrains Mono',monospace;font-size:8px;padding:1px 3px;border-radius:2px;background:${bg};color:${col};margin-left:3px">${s.nick}</span>` : "";
    const fRows = (s.flown || []).slice(-CFG.recents).map(f => `<div class="lr"><div class="ld" style="background:var(--done)"></div><div class="ldate" style="color:var(--done)">${fd(f.date)}</div><div class="lname" style="color:var(--done)">${f.lesson}</div><div class="ldur">${f.actual_ft || hm(f.actual_mins)}</div></div>`).join("");
    let prev = (s.flown || []).at(-1)?.actual_mins || 60;
    const tbc = `<span style="color:var(--tx3);font-style:italic">TBC</span>`;
    const pRows = (s.planned || []).slice(0, CFG.upcomings).map(p => {
      const rest = CFG.showRest && prev >= 120; const lv = p.mins || p.planned_mins || 60; prev = lv;
      const sd = scheduledDateFor(s.name, p.lesson);
      const dCell = sd ? `<div class="ldate">${fd(sd)}</div>` : `<div class="ldate">${tbc}</div>`;
      return `<div class="lr"><div class="ld" style="background:${col};opacity:.5"></div>${dCell}<div class="lname" style="color:${col}">${p.lesson}</div><div class="ldur">${hm(lv)}${rest ? `<span class="lrest">+r</span>` : ""}</div></div>`;
    }).join("");
    const sep = (s.flown?.length && s.planned?.length) ? `<div class="lsep">▸ ${s.remaining} remaining · next ${Math.min(CFG.upcomings, s.remaining)} shown · dates from Operations schedule (TBC = not yet scheduled)</div>` : "";
    const more = (s.planned_total || 0) > CFG.upcomings ? `<div class="moret">+${s.planned_total - CFG.upcomings} more</div>` : "";
    const fin = s.finish === "COMPLETE" ? "COMPLETED" : fd(s.finish);
    const nextSched = s.next_lesson && s.next_lesson !== "COMPLETE" ? scheduledDateFor(s.name, s.next_lesson) : null;
    const ntag = CFG.showNextTag && s.next_lesson ? `<b style="color:${col}">${s.next_lesson}</b>` : "";
    const ndateTag = s.next_lesson && s.next_lesson !== "COMPLETE" ? `<span style="color:${nextSched ? 'var(--tx2)' : 'var(--tx3)'};margin-left:3px${nextSched ? '' : ';font-style:italic'}">${nextSched ? fd(nextSched) : 'TBC'}</span>` : "";
    return `<div class="scard${rankClass ? " status-" + rankClass : ""}"><div class="sh"><div><div class="sname">${s.name}${nick}</div><div class="smeta">${s.batch} · ${s.done}/${s.total}</div></div><div><div class="spct" style="color:${col}">${s.pct.toFixed(1)}%</div><div class="spct2">${s.remaining} left</div></div></div><div class="pb"><div class="pf" style="width:${Math.max(s.pct, .3)}%;background:${col}"></div></div><div class="sb2" style="max-height:${CFG.cardH}px">${fRows}${sep}${pRows}${more}</div><div class="sf2"><span style="font-size:10px;color:var(--tx3)">Next:${ntag ? ` ${ntag}${ndateTag}` : ""}</span><span class="ftag" style="background:${bg};color:${col};border:1px solid ${col}33">Finish: ${fin}</span></div></div>`;
  }

  // renderPlans — verbatim from NGT_001.
  function renderPlans() {
    const q = document.getElementById("si").value.toLowerCase(); const srt = document.getElementById("ss-sel").value;
    let arr = filtSt();
    if (q) arr = arr.filter(s => s.name.toLowerCase().includes(q) || (s.nick || "").toLowerCase().includes(q));
    if (srt === "finish") arr = [...arr].sort((a, b) => ((a.finish || "Z") < (b.finish || "Z") ? -1 : 1));
    else if (srt === "pct") arr = [...arr].sort((a, b) => b.pct - a.pct);
    else if (srt === "name") arr = [...arr].sort((a, b) => a.name.localeCompare(b.name));
    const rankMap = new Map();
    ["AP124", "AP126", "AP127", "AP129"].forEach(b => {
      const grp = arr.filter(s => s.batch === b).sort((a, z) => z.pct - a.pct);
      grp.forEach((s, i) => rankMap.set(s.catc_id, ap127RankClass(i + 1, grp.length)));
    });
    document.getElementById("sg").innerHTML = arr.map(s => makeCard(s, rankMap.get(s.catc_id) || "")).join("");
    document.getElementById("pc").textContent = arr.length + " students" + (AB === "ALL" ? "" : " · " + AB);
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
  Object.assign(window, { renderPerformance, resetPerformanceFilters, runSimulation, renderSimulation, addExtraBatch, removeExtraBatch, updateExtraBatch, toggleHourMode, onWeHolCapInput, propagateCapToWeHol, renderPlans, setPlansBatch, onRestRegChange, onPriorityChange, renderPriorityChips });

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
        <option value="batch">Batch order</option><option value="finish">Finish date</option>
        <option value="pct">Progress %</option><option value="name">Name A–Z</option>
      </select>
      <span id="pc" class="d127-meta"></span>
      <span class="d127-meta" style="margin-left:auto">Upcoming dates = Operations schedule · TBC = not yet scheduled</span>
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
        <option value="20">Recent 20 Operating Days</option>
        <option value="10">Recent 10 Operating Days</option>
        <option value="30">Recent 30 Operating Days</option>
        <option value="45">Recent 45 Operating Days</option>
      </select>
      <button id="pf-inc-we"  class="bt" onclick="this.classList.toggle('active');renderPerformance()">WE</button>
      <button id="pf-inc-hol" class="bt" onclick="this.classList.toggle('active');renderPerformance()">HOL</button>
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
    <div class="ch" id="pf-recent-title">Recent Operating Days</div>
    <div class="cs">Daily intensity — flights + hours per day</div>
    <div class="pf-day-grid" id="pf-recent"></div>
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
      return React.createElement('div', { className: 'ngt-prog', ref, style: { height: '100%', overflow: 'auto', padding: 14 } });
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
  window.ProgressDetailView = makeView(MK_PLANS, () => { AB = "ALL"; renderPlans(); });
})();
