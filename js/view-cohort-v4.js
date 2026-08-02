/* ============================================================================
 * AP127 V2 — AP127 DETAIL V4 (redesigned duplicate of view-cohort.js).
 * IIFE-scoped like the original so its consts/lets never collide; the only
 * cross-file surface is `window.*`, so every window-exposed name below carries
 * a V4 suffix and every DOM id is prefixed d127v4-/tt-*-v4. Internal helper
 * names are kept IDENTICAL to view-cohort.js on purpose (same math, easy to
 * diff) — that's safe because they never leave this closure. See REVAMP.md.
 * ==========================================================================*/
(function () {
  const MARKUP = `
<div class="d127-wrap">
  <div class="d127-wrap">
    <div class="d127-title">
      <h1>AP<b>127</b> PROGRESS <span>V4</span></h1>
      <div class="d127-subtitle" id="d127v4-subtitle">Progress retrieved from CATC FTC records and master plan — redesigned view</div>
      <div class="d127v4-hours-badge" title="Every &quot;hours&quot; figure on this tab (KPI card, Pace Monitor, Progress Ranking, Combined Progress vs Plan, Batch Lead/Lag History, Individual Lead/Lag vs Plan, Actual vs Planned, Daily Output, Roster) uses each lesson's STANDARD/PLANNED duration from the curriculum — not the flight's actual logged clock time. A flight only falls back to its actual logged duration if its lesson code isn't found in the curriculum at all (rare). This keeps &quot;hours done&quot; directly comparable to &quot;hours planned,&quot; since both are built from the same standard durations, at the cost of not reflecting real day-to-day block-time variance (weather holds, extra circuits, etc).">
        <span class="d127v4-hours-badge-dot"></span>HOURS = EFFECTIVE <span class="d127v4-hours-badge-sub">(standard duration per lesson, not actual logged time)</span>
      </div>
    </div>
    <div class="d127v4-sticky">
      <div id="tt-banner-v4" style="display:none;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);border-radius:5px;padding:6px 10px;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#f59e0b">
        <span>⏪ TIME TRAVEL MODE — data as of <span id="tt-banner-date-v4">-</span></span>
        <span style="flex:1"></span>
        <button onclick="setCohortAsOfV4(null)" style="background:#f59e0b;color:#000;border:0;border-radius:3px;padding:2px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;cursor:pointer">Return to Live</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#6e7681;flex-shrink:0">HISTORY</span>
        <div id="tt-track-v4" style="position:relative;flex:1;height:14px;background:var(--s2);border-radius:3px;cursor:pointer;touch-action:none;user-select:none">
          <div id="tt-ticks-v4" style="position:absolute;inset:0;pointer-events:none"></div>
          <div id="tt-thumb-v4" style="position:absolute;top:-3px;left:100%;transform:translateX(-50%);width:4px;height:20px;background:#38bdf8;border-radius:2px;cursor:grab;touch-action:none">
            <div id="tt-chip-v4" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);background:#30363d;border:1px solid #444;border-radius:3px;padding:1px 6px;font-size:9px;font-family:'JetBrains Mono',monospace;color:#e6edf3;white-space:nowrap;pointer-events:none">Today</div>
          </div>
        </div>
        <button onclick="setCohortAsOfV4(null)" id="tt-live-btn-v4" style="background:#1a2f1a;border:1px solid #4ade80;color:#4ade80;border-radius:3px;padding:2px 7px;font-size:9px;font-family:'JetBrains Mono',monospace;cursor:pointer;flex-shrink:0">LIVE ●</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="d127v4-q" placeholder="Search name..." oninput="renderAP127DetailV4()" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:5px;padding:6px 9px;font-size:12px;outline:none;flex:1;min-width:180px">
        <select id="d127v4-sort" onchange="renderAP127DetailV4()" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:5px;padding:6px 9px;font-size:11px">
          <option value="behind">Sort: Most behind first</option>
          <option value="ahead">Sort: Most ahead first</option>
          <option value="hours">Sort: Most hours first</option>
          <option value="name">Sort: Name A-Z</option>
        </select>
        <input type="date" id="tt-date-input-v4" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:3px;padding:5px 6px;font-size:11px;font-family:'JetBrains Mono',monospace" onchange="setCohortAsOfV4(this.value||null)">
        <button onclick="setCohortAsOfV4(null)" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx3);border-radius:3px;padding:5px 8px;font-size:10px;font-family:'JetBrains Mono',monospace;cursor:pointer">Live</button>
        <span class="d127-meta" id="d127v4-meta">-</span>
      </div>
    </div>
    <div class="d127-kpis">
      <div class="d127-kpi"><div class="d127-kl">Batch Progress</div><div class="d127-kv" id="d127v4-k-prg">-</div><div class="d127-ks" id="d127v4-k-prg-s">Done vs Total</div></div>
      <div class="d127-kpi"><div class="d127-kl">Students</div><div class="d127-kv" id="d127v4-k-stu">-</div><div class="d127-ks" id="d127v4-k-stu-s">on the AP127 curriculum</div></div>
      <div class="d127-kpi"><div class="d127-kl" title="Effective hours — each lesson's standard curriculum duration, not the flight's actual logged time. See the HOURS = EFFECTIVE badge above.">Hrs Done / Plan</div><div class="d127-kv" id="d127v4-k-hrs">-</div><div class="d127-ks" id="d127v4-k-hrs-s">vs plan today</div></div>
      <div class="d127-kpi"><div class="d127-kl">Lessons Done / Plan</div><div class="d127-kv" id="d127v4-k-les">-</div><div class="d127-ks" id="d127v4-k-les-s">vs plan today</div></div>
    </div>
    <div class="d127-panel d127-pace-panel">
      <div class="d127-h" style="flex-wrap:wrap;gap:6px">
        <span class="d127-t">Pace Monitor · Situation vs Target</span>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <span style="color:var(--tx3);font-size:10px;font-family:'JetBrains Mono',monospace">ACTUAL RANGE:</span>
          <select id="d127v4-pace-range" class="d127-wsel" onchange="renderAP127PaceV4()">
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30" selected>Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="0">All time</option>
          </select>
        </div>
      </div>
      <div class="d127-body" id="d127v4-pace-body"></div>
    </div>
    <div class="d127-grid">
      <div class="d127-panel">
        <div class="d127-h"><span class="d127-t">Progress Ranking</span><span style="display:flex;align-items:center;gap:8px"><button class="d127-reset" id="d127v4-reset" title="Reset sort to default" onclick="ap127ResetSortV4()">⟳ Reset</button><span class="d127-s" id="d127v4-asof">As of -</span></span></div>
        <div class="d127-table-wrap">
          <table class="d127-table">
            <thead><tr>
              <th>Rank</th>
              <th data-key="name" title="Sort by name">Name</th>
              <th data-key="nick" title="Sort by call sign">CALL<br>SIGN</th>
              <th data-key="se" title="Sort by single-engine type">SE<br>TYPE</th>
              <th data-key="fi" title="Sort by Flight Instructor">FI</th>
              <th data-key="ahead" title="Sort by progress (most ahead first)">Progress</th>
              <th data-key="hours" title="Sort by hours done (most first). Effective hours — standard duration per lesson, not actual logged time.">HRS<br>DONE</th>
              <th data-key="ahead" title="Sort by lessons done (most first)">LESSON<br>DONE</th>
              <th data-key="lastLesson" title="Sort by last lesson code">Last<br>Lesson</th>
              <th data-key="lastFlt" title="Sort by last flight date (newest first)">Last FLT</th>
              <th data-key="idle" title="Sort by idle days (most idle first)">IDLE<br>DAYS</th>
              <th data-key="dayDelta" title="DAY Delta = today − planned date of last completed lesson. Positive = delay.">DAY<br>Delta</th>
              <th data-key="hrsDelta" title="HRS Delta = actual hours flown − planned curriculum hours up to today.">HRS<br>Delta</th>
            </tr></thead>
            <tbody id="d127v4-rows"></tbody>
          </table>
        </div>
      </div>
      <div class="d127-side">
        <div class="d127-panel"><div class="d127-h"><span class="d127-t">Pace Distribution</span><span class="d127-s">count by lessons done</span></div><div class="d127-body"><div style="position:relative;height:190px"><canvas id="d127v4-band-chart"></canvas></div></div></div>
        <div class="d127-panel"><div class="d127-h"><span class="d127-t">Needs Attention</span><span class="d127-s">idle &gt;5d or behind</span></div><div class="d127-body" id="d127v4-watchlist"></div></div>
        <div class="d127-panel"><div class="d127-h"><span class="d127-t">Recent Flight</span><span class="d127-s">Latest updates</span></div><div class="d127-body d127-act" id="d127v4-activity"></div></div>
        <div class="d127-panel">
          <div class="d127-h"><span class="d127-t">Lesson Codes</span><span class="d127-s">Quick legend</span></div>
          <div class="d127-body d127-legend">
            <div><div class="d127-code">GL</div><div class="d127-desc">General handling</div></div>
            <div><div class="d127-code">IL / IF</div><div class="d127-desc">Instrument phases</div></div>
            <div><div class="d127-code">XV / XI</div><div class="d127-desc">Cross-country</div></div>
            <div><div class="d127-code">NL</div><div class="d127-desc">Night flights</div></div>
            <div><div class="d127-code">SP / PIC</div><div class="d127-desc">Solo / SPIC</div></div>
            <div><div class="d127-code">M</div><div class="d127-desc">Multi-engine</div></div>
          </div>
        </div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h" style="flex-wrap:wrap;gap:6px">
        <span class="d127-t">Combined Progress vs Plan</span>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <button class="cpv-btn" data-f="today" onclick="setCPVFilterV4('today')">To Today</button>
          <button class="cpv-btn sel" data-f="proj"    onclick="setCPVFilterV4('proj')">To Proj. End</button>
          <span style="width:1px;height:14px;background:var(--bd);display:inline-block;margin:0 2px"></span>
          <button class="cpv-btn cpv-mode"     data-m="lessons" onclick="setCPVModeV4('lessons')">Lessons</button>
          <button class="cpv-btn cpv-mode sel" data-m="hours"   onclick="setCPVModeV4('hours')">Hours</button>
          <span style="width:1px;height:14px;background:var(--bd);display:inline-block;margin:0 2px"></span>
          <button class="cpv-btn" onclick="cpvResetZoomV4()" title="Reset zoom">⟳ Zoom</button>
        </div>
      </div>
      <div class="d127-body">
        <div class="cpv-kpis" id="cpv-kpis-v4"></div>
        <div style="position:relative;height:300px"><canvas id="d127v4-combined"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h" style="flex-wrap:wrap;gap:6px">
        <span class="d127-t">Batch Lead/Lag History</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="cpv-btn hist-batch-mode-v4 sel" data-m="hours"   onclick="setHistBatchModeV4('hours')">Hours</button>
          <button class="cpv-btn hist-batch-mode-v4"     data-m="lessons" onclick="setHistBatchModeV4('lessons')">Lessons</button>
        </div>
      </div>
      <div class="d127-body">
        <div class="d127-note">Batch-wide cumulative actual − planned. Above zero = ahead of curriculum schedule; below = behind. Zero line = on plan.</div>
        <div class="cpv-kpis" id="hist-batch-kpis-v4"></div>
        <div style="position:relative;height:220px"><canvas id="d127v4-hist-batch"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h" style="flex-wrap:wrap;gap:6px">
        <span class="d127-t">Daily Output · Lessons &amp; Hours</span>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <button class="cpv-btn lb-unit sel" data-u="hours" onclick="setLBUnitV4('hours')">Hours</button>
          <button class="cpv-btn lb-unit" data-u="lessons" onclick="setLBUnitV4('lessons')">Lessons</button>
          <span style="width:1px;height:14px;background:var(--bd);display:inline-block;margin:0 2px"></span>
          <button class="cpv-btn lb-period sel" data-p="day" onclick="setLBPeriodV4('day')">Day</button>
          <button class="cpv-btn lb-period" data-p="week" onclick="setLBPeriodV4('week')">Week</button>
          <button class="cpv-btn lb-period" data-p="month" onclick="setLBPeriodV4('month')">Month</button>
          <span style="width:1px;height:14px;background:var(--bd);display:inline-block;margin:0 2px"></span>
          <button class="cpv-btn lb-showall" onclick="setLBShowAllV4()" title="Toggle whether periods with zero flights are shown">Hide off days</button>
        </div>
      </div>
      <div class="d127-body">
        <div class="d127-note">Bars = batch total per period, including days with no flights by default. Blue line = moving average (7d / 4wk / 3mo depending on view). Hover for exact values.</div>
        <div style="position:relative;height:280px"><canvas id="d127v4-lessonbar"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h"><span class="d127-t">Actual vs Planned</span><span class="d127-s" id="d127v4-race-meta">All students with planned baseline</span></div>
      <div class="d127-body">
        <div class="d127-note">Solid lines are actual cumulative lessons to current date. Dashed line is planned target from curriculum dates.</div>
        <div style="position:relative;height:330px"><canvas id="d127v4-race"></canvas></div>
        <div id="d127v4-race-toggles" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;padding:8px;background:var(--s2);border-radius:4px;font-size:11px"></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h"><span class="d127-t">Consecutive &amp; Idle Streaks</span><span class="d127-s">+days flying streak · −days idle streak</span></div>
      <div class="d127-body">
        <div class="d127-note">Shares color &amp; student filter with Actual vs Planned above — click a name there to isolate here too. Thick magenta = batch average.</div>
        <div style="position:relative;height:300px"><canvas id="d127v4-considle"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h">
        <span class="d127-t">Individual Lead/Lag vs Plan</span>
        <span class="d127-s">Shares hours/lessons mode &amp; student filters with Actual vs Planned</span>
      </div>
      <div class="d127-body">
        <div class="d127-note">Per-student delta (actual − planned). Above zero = ahead; below zero = behind. Thick magenta = batch avg. Use student toggles above to focus.</div>
        <div style="position:relative;height:300px"><canvas id="d127v4-hist-solo"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h"><span class="d127-t">Flight Timeline vs Progress</span><span class="d127-s" id="d127v4-tl-meta">-</span></div>
      <div class="d127-body">
        <div class="d127-note">Rows are sorted leader to lagger. Dots mark dates each student actually flew, colored by lesson phase. Red segments mark gaps &gt; 7 days. Click any dot for details.</div>
        <div class="d127-phase-legend" id="d127v4-phase-legend"></div>
        <div id="d127v4-timeline-wrap" style="position:relative;height:330px;width:100%"><canvas id="d127v4-timeline"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h"><span class="d127-t">Overall Progress Bar View</span><span class="d127-s">x-axis = lesson number · stacked by syllabus phase</span></div>
      <div class="d127-body">
        <div class="d127-note">First row is the MASTER PLAN — the full 96-lesson curriculum, for direct comparison against every SP below it. Each bar is split into segments per official curriculum phase (same colors as Flight Timeline and the Roster below). White dashed lines mark where each phase starts; amber dotted lines mark finer syllabus key points (Initial Solo, Instrument, Cross-Country, Sim, Multi-Engine, Checkride). Text at bar end = current/next lesson.</div>
        <div class="d127-phase-legend" id="d127v4-overall-legend"></div>
        <div style="position:relative;height:600px;width:100%"><canvas id="d127v4-overall"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h"><span class="d127-t">Phase Progress Funnel</span><span class="d127-s">Batch-wide completion by curriculum phase</span></div>
      <div class="d127-body">
        <div class="d127-note">Done vs remaining lesson-slots (students × phase lessons) — shows where the batch is bottlenecked.</div>
        <div style="position:relative;height:260px"><canvas id="d127v4-funnel"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h" style="flex-wrap:wrap;gap:6px">
        <span class="d127-t">AP127 Roster</span>
        <div style="display:flex;gap:6px;align-items:center">
          <select id="d127v4-roster-range" class="d127-wsel" onchange="buildAP127RosterV4()">
            <option value="30" selected>Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="0">All time</option>
          </select>
        </div>
      </div>
      <div class="d127-body">
        <div class="d127-note">Day-by-day activity heatmap (colored by lesson phase, hover a cell for detail) plus totals grouped by instructor — both scoped to the range above.</div>
        <div id="d127v4-heat"></div>
        <div class="d127v4-sec-lbl" style="margin-top:16px" id="d127v4-fi-heading">By Instructor</div>
        <div id="d127v4-fi-roster" class="d127v4-fi-grid"></div>
      </div>
    </div>
  </div>
<div class="toast" id="toast-v4"></div>
<div class="d127-draw-ov" id="d127v4-draw-ov" onclick="closeAP127DrawerV4()">
  <div class="d127-draw" onclick="event.stopPropagation()">
    <div class="d127-dh">
      <div><div class="d127-dn" id="d127v4-d-name">-</div><div class="d127-dm" id="d127v4-d-meta">-</div></div>
      <button class="d127-close" onclick="closeAP127DrawerV4()">Close</button>
    </div>
    <div id="d127v4-d-kpis" style="display:flex;gap:10px;flex-wrap:wrap;padding:10px 16px 0;border-bottom:1px solid var(--bd)"></div>
    <div class="d127-dg">
      <div class="d127-list" style="overflow-y:auto;max-height:45vh"><div class="d127-lh">Completed Flights</div><div id="d127v4-d-flown"></div></div>
      <div class="d127-list" style="overflow-y:auto;max-height:45vh"><div class="d127-lh">Planned Flights</div><div id="d127v4-d-plan"></div></div>
    </div>
  </div>
</div>
`;

  // ---------- data helpers (verbatim math from view-cohort.js; IIFE-scoped so identical names are safe) ----------
const AP127_NICKS=["A-VIT","A-SORN","A-RUT","B-SET","J-YU","K-PONG","K-YA","K-KORN","K-SEE","KRIT","M-PHAN","N-PON","N-KALP","N-PHAT","P-THAN","P-KORN","P-KUL","P-DET","S-SIT","S-KORN","S-WITCH","S-WAN","T-KORN","T-WAJ","V-PHON","W-PHOL","W-POL","W-PONG"];
const AP127_FI=["W-CHAI","P-YUTH","P-YA","S-TI","N-TORN","I-POL","SN-TI","S-TI","A-WAT","W-NU","K-POL","C-CHAI","P-YUTH","SN-TI","E-PHOB","K-POL","S-WAN","N-TORN","E-PHOB","I-POL","K-CHAI","K-CHAI","P-YA","S-WAN","C-CHAI","W-NU","W-CHAI","A-WAT"];
const AP127_SE=["DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-TDI"];
const HOL=new Set(["2026-05-01","2026-05-04","2026-05-13","2026-06-01","2026-06-03","2026-07-28","2026-07-29","2026-07-30","2026-08-12","2026-10-13","2026-10-23","2026-12-07","2026-12-10","2026-12-31"]);
const AP127_FI_FULL={"W-CHAI":"WUTTHICHAI L.","P-YUTH":"PHAHOLYUTH P.","P-YA":"PARINYA B.","S-TI":"SANTI SUK.","N-TORN":"NAPATTORN S.","I-POL":"ITTIPOL P.","SN-TI":"SANTI PO.","A-WAT":"THAWATANAN P.","W-NU":"WISANU T.","K-POL":"KOONPHOL U.","C-CHAI":"CHAROENCHAI U.","E-PHOB":"EKKAPHOP R.","S-WAN":"SOWAN C.","K-CHAI":"KITTICHAI C."};

let G=null;
const CHARTS={};
let AP127_VIEW_ROWS=[];
let tmr=null;

function escHtml(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function toast(msg,type="ok"){const el=document.getElementById("toast-v4");if(!el)return;el.textContent=msg;el.className="toast "+type+" show";clearTimeout(tmr);tmr=setTimeout(()=>el.classList.remove("show"),4000);}
function fd(ds){if(!ds||ds==="COMPLETE"||ds==="N/A")return ds;try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"2-digit"});}catch{return ds;}}
function hm(m){if(!m)return"";return Math.floor(m/60)+"h"+(m%60?String(m%60).padStart(2,"0")+"m":"");}
function mkC(id,cfg){const ctx=document.getElementById(id);if(!ctx)return null;const ex=Chart.getChart(ctx);if(ex)ex.destroy();return new Chart(ctx,cfg);}

function ap127TodayBKK(){const now=new Date();const bkk=new Date(now.getTime()+(now.getTimezoneOffset()+420)*60000);return bkk.toISOString().slice(0,10);}
function ap127AsOf(){return COHORT_AS_OF||ap127TodayBKK();}
function ap127AsOfStudents(){
  const asOf=ap127AsOf();
  const all=G?.ap127||[];
  if(!COHORT_AS_OF)return all;
  const cur=G?.cur127||[];
  return all.map(s=>{
    const flown=(s.flown||[]).filter(f=>f.date&&f.date<=asOf);
    const total=s.total||0;
    const done=flown.length;
    const flownSet=new Set(flown.map(f=>(f.lesson||'').toUpperCase().trim()));
    const nx=cur.find(c=>!flownSet.has((c.lesson||'').toUpperCase().trim()));
    return{...s,flown,done,pct:total?+(done/total*100).toFixed(1):0,remaining:Math.max(0,total-done),next_lesson:nx?nx.lesson:'COMPLETE'};
  });
}
function _scrBatchStart(){const all=G?.ap127||[];return all.flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort()[0]||ap127TodayBKK();}
function _scrDateFromFrac(frac){const s=new Date(_scrBatchStart()+'T00:00:00').getTime(),e=new Date(ap127TodayBKK()+'T00:00:00').getTime();return new Date(s+frac*(e-s)).toISOString().slice(0,10);}
function _scrSetThumb(frac){const th=document.getElementById('tt-thumb-v4'),ch=document.getElementById('tt-chip-v4');if(!th)return;th.style.left=(frac*100)+'%';if(ch){const ds=frac>=0.99?ap127TodayBKK():_scrDateFromFrac(frac);ch.textContent=ds?ap127ShortDate(ds):'';}}
let _scrDebounce=null;
// Authoritative 4-phase curriculum structure — lesson-NUMBER ranges (not code-prefix guesses),
// pulled from the syllabus.json backing https://ap127-flight-training.pages.dev (Study > Diagram):
// Phase I "Basic Flight Training" 1-13, Phase II "Consolidation and IFR Introduction" 14-32,
// Phase III "Advanced VFR and Night Flying" 33-55, Phase IV "IFR and Multi-Engine Training" 56-96.
// Every AP127 lesson code ends in its curriculum lesson number (e.g. "CSPGL 36" = lesson 36), so
// phase membership is exact, not inferred from the code's letters. Colors match that site's own
// Ph.1-4 timeline bar. Used consistently here for the Timeline dots, Roster heatmap, Phase Funnel,
// and Overall Progress bars so "phase" means the same thing (and the same color) everywhere in V4.
const AP127_SYLLABUS_PHASES=[
  {n:1,label:"Phase I",  title:"Basic Flight Training",           lo:1, hi:13,c:"#38bdf8"},
  {n:2,label:"Phase II", title:"Consolidation & IFR Introduction", lo:14,hi:32,c:"#4ade80"},
  {n:3,label:"Phase III",title:"Advanced VFR & Night Flying",      lo:33,hi:55,c:"#f59e0b"},
  {n:4,label:"Phase IV", title:"IFR & Multi-Engine Training",      lo:56,hi:96,c:"#a78bfa"},
];
const AP127_PHASE_OTHER={label:"Other",title:"Unrecognized lesson code",c:"#6b7280"};
function ap127LessonNum(code){const m=String(code||"").match(/(\d+)\s*$/);return m?parseInt(m[1],10):null;}
function ap127SyllabusPhase(code){
  const n=ap127LessonNum(code);
  if(n==null)return AP127_PHASE_OTHER;
  return AP127_SYLLABUS_PHASES.find(p=>n>=p.lo&&n<=p.hi)||AP127_PHASE_OTHER;
}
function ap127IdleLineColor(d){if(d<=2)return"#e6edf3";if(d<=5)return"#fbbf24";return"#ff6b6b";}
function ap127ShortName(n){const p=n.trim().split(/\s+/);return p.length<2?n:p[0]+" "+p[p.length-1][0]+".";}
function ap127FmtDate(ds){if(!ds)return"-";if(ds==="TBC")return"TBC";try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}catch{return ds;}}
function ap127ShortDate(ds){if(!ds)return"-";if(ds==="TBC")return"TBC";try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short"});}catch{return ds;}}
function ap127FlightMins(f){return f.actual_mins||f.mins||0;}
// Canonical "hours per flight" convention: the curriculum's STANDARD/planned duration for that
// lesson code wins, falling back to the flight's own logged duration only if the code isn't in the
// curriculum map. This is what the KPI card and Progress Ranking table have always used (inherited
// unchanged from the original AP127 Detail tab's own ap127Hours()). Several charts added across
// earlier V4 rounds (Actual vs Planned, Combined Progress's chart line, Batch Lead/Lag History,
// Individual Lead/Lag vs Plan, Daily Output, Roster) had independently reinvented this per-flight
// sum with the fallback order REVERSED (actual-first) or with no fallback at all — same real flights,
// a different number, because standard and actual durations aren't always identical. Every one of
// those was changed to call this same lessonsMap[lesson]||ap127FlightMins(f) formula so "hours done"
// means the same thing everywhere in this tab. See REVAMP.md's dated entry for the full audit.
function ap127Hours(s){const cur=G?.cur127||[];const lessonsMap={};cur.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});return ((s.flown||[]).reduce((a,f)=>a+(lessonsMap[f.lesson]||ap127FlightMins(f)),0))/60;}
function ap127CurriculumHours(){return ((G?.cur127||[]).reduce((a,c)=>a+(c.planned_mins||c.mins||0),0))/60;}
function ap127PlannedHoursAsOf(today){return ((G?.cur127||[]).filter(c=>c.planned_date&&c.planned_date<=today).reduce((a,c)=>a+(c.planned_mins||0),0))/60;}
function ap127FmtNum(n,d=1){return Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});}
function ap127LastFlightDate(s){return (s.flown||[]).map(f=>f.date).filter(Boolean).sort().at(-1)||"";}
function ap127IdleDays(s,asOf){const last=ap127LastFlightDate(s);return last&&asOf?Math.max(0,ap127DateDiff(asOf,last)||0):9999;}
function ap127DateDiff(a,b){if(!a||!b)return null;const ad=new Date(a+"T00:00:00"),bd=new Date(b+"T00:00:00");if(Number.isNaN(ad)||Number.isNaN(bd))return null;return Math.round((ad-bd)/86400000);}
function ap127DayDelta(s,planMap,today){const last=(s.flown||[]).at(-1);if(!last)return null;const planDate=planMap[last.lesson];if(!planDate)return null;const delta=ap127DateDiff(today,planDate);return delta;}
function ap127PaceSort(arr,asOf){return [...arr].sort((a,b)=>(b.done||0)-(a.done||0)||ap127IdleDays(a,asOf)-ap127IdleDays(b,asOf));}
function ap127BehindSort(arr,asOf){return [...arr].sort((a,b)=>(a.done||0)-(b.done||0)||ap127IdleDays(b,asOf)-ap127IdleDays(a,asOf));}
function ap127SortRows(arr,asOf="",planMap={},today=""){
  const mode=document.getElementById("d127v4-sort")?.value||"behind";
  const cmpStr=(a,b)=>(a||"").toString().localeCompare((b||"").toString());
  if(mode==="ahead")return ap127PaceSort(arr,asOf);
  if(mode==="hours")return [...arr].sort((a,b)=>ap127Hours(b)-ap127Hours(a)||(b.done||0)-(a.done||0));
  if(mode==="name")return [...arr].sort((a,b)=>a.name.localeCompare(b.name));
  if(mode==="nick")return [...arr].sort((a,b)=>cmpStr(a.nick,b.nick));
  if(mode==="se")return [...arr].sort((a,b)=>cmpStr(a.se,b.se)||(b.done||0)-(a.done||0));
  if(mode==="fi")return [...arr].sort((a,b)=>cmpStr(a.fi,b.fi)||(b.done||0)-(a.done||0));
  if(mode==="lastLesson")return [...arr].sort((a,b)=>cmpStr((a.flown||[]).at(-1)?.lesson||a.next_lesson,(b.flown||[]).at(-1)?.lesson||b.next_lesson));
  if(mode==="lastFlt")return [...arr].sort((a,b)=>(ap127LastFlightDate(b)||"").localeCompare(ap127LastFlightDate(a)||""));
  if(mode==="idle")return [...arr].sort((a,b)=>ap127IdleDays(b,asOf)-ap127IdleDays(a,asOf));
  if(mode==="dayDelta"){const f=s=>{const v=ap127DayDelta(s,planMap,today);return v===null?-Infinity:v;};return [...arr].sort((a,b)=>f(b)-f(a));}
  if(mode==="hrsDelta"){const ph=ap127PlannedHoursAsOf(today);const f=s=>ap127Hours(s)-ph;return [...arr].sort((a,b)=>f(a)-f(b));}
  return ap127BehindSort(arr,asOf);
}
function ap127ResetSort(){
  const sel=document.getElementById("d127v4-sort");
  if(sel){[...sel.querySelectorAll("option[data-dyn='1']")].forEach(o=>o.remove());sel.value="behind";}
  const q=document.getElementById("d127v4-q");if(q)q.value="";
  renderAP127Detail();
}
function ap127HeaderClick(key){
  const sel=document.getElementById("d127v4-sort");
  if(!sel||!key)return;
  if(![...sel.options].some(o=>o.value===key)){const o=document.createElement("option");o.value=key;o.textContent="Sort: "+key;o.dataset.dyn="1";sel.appendChild(o);}
  sel.value=key;
  renderAP127Detail();
}
function ap127RankClass(rank,total){if(rank<=3)return"bad";if(rank<=Math.ceil(total*.4))return"mid";return"ok";}

// ── Pace Monitor v2 — current situation vs target, at a glance ──
function renderAP127Pace(){
  if(!G||!G.ap127)return;
  const all=ap127AsOfStudents();const n=all.length;if(!n)return;
  const cur=G.cur127||[];
  const today=ap127AsOf();
  const planEndDate=cur.map(c=>c.planned_date).filter(Boolean).sort().at(-1)||"";
  const currHrs=ap127CurriculumHours();
  const currLes=cur.length||(all[0]?.total||0);
  const lessonsMap={};cur.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const fHrsOf=f=>(lessonsMap[f.lesson]||ap127FlightMins(f))/60;
  const allFlownDates=all.flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort();
  const batchStart=allFlownDates[0]||today;
  const daysFromStart=Math.max(ap127DateDiff(today,batchStart),1);
  const totalHrsDone=all.reduce((a,s)=>a+(s.flown||[]).reduce((b,f)=>b+fHrsOf(f),0),0);
  const totalLesDone=all.reduce((a,s)=>a+(s.done||0),0);

  const rangeEl=document.getElementById("d127v4-pace-range");
  const rangeVal=rangeEl?parseInt(rangeEl.value||"30"):30;
  const rangeDays=rangeVal===0?daysFromStart:rangeVal;
  const rangeStart=rangeVal===0?batchStart:(()=>{const d=new Date(today+"T00:00:00");d.setDate(d.getDate()-rangeVal);return d.toISOString().slice(0,10);})();
  const rangeLabel=rangeVal===0?`all time · ${ap127ShortDate(batchStart)} → today`:`last ${rangeDays}d · ${ap127ShortDate(rangeStart)} → today`;

  let actHrs=0,actLes=0;
  all.forEach(s=>{const wf=(s.flown||[]).filter(f=>f.date&&f.date>=rangeStart&&f.date<=today);actLes+=wf.length;actHrs+=wf.reduce((a,f)=>a+fHrsOf(f),0);});
  const aHrDayB=actHrs/rangeDays;      const aHrWkB=aHrDayB*7;
  const aHrWkSP=aHrWkB/n;
  const aLesDayB=actLes/rangeDays;     const aLesWkB=aLesDayB*7;
  const aLesWkSP=aLesWkB/n;

  const remHrsB=Math.max((currHrs*n)-totalHrsDone,0);
  const remLesB=Math.max((currLes*n)-totalLesDone,0);
  const daysRem=planEndDate?Math.max(ap127DateDiff(planEndDate,today),0):null;
  let nHrWkB=null,nHrWkSP=null,nLesWkB=null,nLesWkSP=null;
  if(daysRem!==null&&daysRem>0){
    const nHrDayB=remHrsB/daysRem; nHrWkB=nHrDayB*7; nHrWkSP=nHrWkB/n;
    const nLesDayB=remLesB/daysRem; nLesWkB=nLesDayB*7; nLesWkSP=nLesWkB/n;
  }
  const gHrWk=nHrWkSP!==null?aHrWkSP-nHrWkSP:null;
  const gLesWk=nLesWkSP!==null?aLesWkSP-nLesWkSP:null;

  const avgHrsDone=totalHrsDone/n;
  const avgRemHrs=Math.max(currHrs-avgHrsDone,0);
  const allTimeDaySP=avgHrsDone/daysFromStart;
  let etcDate=null;
  if(allTimeDaySP>0&&avgRemHrs>0){etcDate=new Date(new Date(today+"T00:00:00").getTime()+(avgRemHrs/allTimeDaySP)*86400000).toISOString().slice(0,10);}
  else if(avgRemHrs<=0){etcDate=today;}
  let onTime=0,atRisk=0;const etcDelays=[];
  all.forEach(s=>{
    const sHrs=(s.flown||[]).reduce((a,f)=>a+fHrsOf(f),0);
    const sRem=Math.max(currHrs-sHrs,0);const sPace=sHrs/daysFromStart;
    let sEtc;
    if(sPace>0&&sRem>0){sEtc=new Date(new Date(today+"T00:00:00").getTime()+(sRem/sPace)*86400000).toISOString().slice(0,10);}
    else if(sRem<=0){sEtc=today;}else{sEtc="9999-12-31";}
    if(planEndDate&&sEtc>planEndDate){atRisk++;etcDelays.push(ap127DateDiff(sEtc,planEndDate));}
    else onTime++;
  });
  const avgDelay=etcDelays.length?Math.round(etcDelays.reduce((a,v)=>a+v,0)/etcDelays.length):0;

  const fH=h=>h===null?"—":h>=100?h.toFixed(0)+"h":h>=10?h.toFixed(1)+"h":h.toFixed(2)+"h";
  const fL=l=>l===null?"—":l>=100?l.toFixed(0)+" les":l>=10?l.toFixed(1)+" les":l.toFixed(2)+" les";

  // actual/need are always WEEKLY figures — the sub-line always shows the same day+month
  // breakdown underneath both the 1-SP and 28-SP sections, so "per week" never gets confused
  // with "per month" (previously one section's sub-line said "/day", the other said "/month").
  const bullet=(label,actual,need,fmt)=>{
    const has=need!==null&&need!==undefined;
    const max=Math.max(actual,has?need:0,0.0001)*1.18;
    const actPct=Math.min(100,(actual/max)*100);
    const needPct=has?Math.min(100,(need/max)*100):0;
    const ahead=has&&actual>=need;
    const color=!has?"var(--tx3)":ahead?"var(--done)":"#ef4444";
    const sub=`≈ ${fmt(actual/7)} / day · ${fmt(actual*4.345)} / month`;
    return `<div class="d127v4-bullet-row">
      <div class="d127v4-bullet-lbl"><span>${label}</span><span><b>${fmt(actual)}</b> <span style="color:var(--tx3)">/ target ${has?fmt(need):"—"}</span></span></div>
      <div class="d127v4-bullet-track">
        <div class="d127v4-bullet-fill" style="width:${actPct}%;background:${color}"></div>
        ${has?`<div class="d127v4-bullet-target" style="left:${needPct}%" title="Target: ${fmt(need)}"></div>`:""}
      </div>
      <div style="font-size:9px;color:var(--tx3);margin-top:3px;font-family:'JetBrains Mono',monospace">${sub}</div>
    </div>`;
  };

  const etcColor=(etcDate&&planEndDate&&etcDate>planEndDate)?"#ef4444":"var(--done)";
  const etcSub=etcDate&&planEndDate&&etcDate>planEndDate?`+${ap127DateDiff(etcDate,planEndDate)}d past plan`:etcDate&&planEndDate?"on/before plan":"—";
  const riskColor=atRisk>0?"#ef4444":"var(--done)";
  const actionMsg=gHrWk!==null&&gHrWk<0
    ?`Batch needs <b style="color:#ef4444">${fH(Math.abs(gHrWk))} / ${fL(Math.abs(gLesWk||0))} more per SP per week</b> to finish by plan date.`
    :gHrWk!==null?`Batch is <b style="color:var(--done)">${fH(gHrWk)} / ${fL(gLesWk||0)} per SP/wk ahead</b> of required pace — on track.`
    :"Plan end date unavailable — required pace can't be computed.";

  const cardsHtml=`<div class="d127v4-cards">
    <div class="d127v4-card"><div class="d127-kl">Plan End</div><div class="d127-kv" style="color:var(--tx3)">${planEndDate?ap127ShortDate(planEndDate):"TBC"}</div></div>
    <div class="d127v4-card"><div class="d127-kl">Cohort ETC</div><div class="d127-kv" style="color:${etcColor}">${etcDate?ap127ShortDate(etcDate):"—"}</div><div class="d127-ks">${etcSub}</div></div>
    <div class="d127v4-card"><div class="d127-kl">On Track</div><div class="d127-kv" style="color:var(--done)">${onTime}</div><div class="d127-ks">of ${n} SP</div></div>
    <div class="d127v4-card"><div class="d127-kl">At Risk</div><div class="d127-kv" style="color:${riskColor}">${atRisk}</div><div class="d127-ks">${atRisk>0?"avg +"+avgDelay+"d":"none"}</div></div>
  </div>`;

  const bulletsHtml=`
    <div class="d127v4-sec-lbl">1 SP · Per Week Pace</div>
    <div class="d127v4-bullets">
      ${bullet("Hours / wk",aHrWkSP,nHrWkSP,fH)}
      ${bullet("Lessons / wk",aLesWkSP,nLesWkSP,fL)}
    </div>
    <div class="d127v4-sec-lbl">28 SP · Batch Total Per Week</div>
    <div class="d127v4-bullets">
      ${bullet("Hours / wk",aHrWkB,nHrWkB,fH)}
      ${bullet("Lessons / wk",aLesWkB,nLesWkB,fL)}
    </div>
    <div class="d127v4-action-banner">
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Required Action</div>
      ${actionMsg}
      <div style="margin-top:4px;color:var(--tx3);font-size:10px">Actual measured over <b style="color:var(--tx2)">${rangeLabel}</b> · remaining ${remHrsB.toFixed(1)}h / ${remLesB} les batch-wide</div>
    </div>`;

  const el=document.getElementById("d127v4-pace-body");
  if(el)el.innerHTML=cardsHtml+bulletsHtml;
}

function renderAP127Detail(){
  if(!G||!G.ap127)return;
  if(window.ChartDataLabels){try{Chart.register(window.ChartDataLabels);}catch(e){}}
  const today0=ap127AsOf();
  const all=ap127AsOfStudents();
  const total=all.length;
  const curriculum=all[0]?.total||0;
  const curriculumHrs=ap127CurriculumHours();
  const doneAll=all.reduce((a,s)=>a+(s.done||0),0);
  const hrsAll=all.reduce((a,s)=>a+ap127Hours(s),0);
  const avgDone=total?doneAll/total:0;
  const maxDate=all.flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort().at(-1)||"";
  const prg=(total&&curriculum)?(doneAll/(total*curriculum)*100):0;
  const planMap={};(G.cur127||[]).forEach(c=>{if(c.lesson&&c.planned_date)planMap[c.lesson]=c.planned_date;});
  const expDone=(G.cur127||[]).filter(c=>c.planned_date&&c.planned_date<=today0).length;
  let onTrack=0; all.forEach(s=>{ if((s.done||0)>=avgDone) onTrack++; });
  const setT=(id,t)=>{const e=document.getElementById(id);if(e)e.textContent=t;};
  const setH=(id,h)=>{const e=document.getElementById(id);if(e)e.innerHTML=h;};
  setT("d127v4-k-stu",total||"-");
  setH("d127v4-k-stu-s",`${curriculum||0} les · ${curriculumHrs.toFixed(0)}h curriculum <span style="color:var(--tx3)">*</span>`);
  const stuSubEl=document.getElementById("d127v4-k-stu-s");
  if(stuSubEl)stuSubEl.title=`The ${curriculum}-lesson / ${curriculumHrs.toFixed(0)}h AP127 curriculum excludes Advanced UPRT (+5 lessons / +5h), which is tracked separately from the core syllabus.`;
  setT("d127v4-k-prg",prg.toFixed(1)+"%");
  setT("d127v4-k-prg-s",`${doneAll} les / ${ap127FmtNum(hrsAll,1)}h of ${total*curriculum} les / ${(total*curriculumHrs).toFixed(0)}h flown`);
  const totalPlannedHrsToday=ap127PlannedHoursAsOf(today0)*total;
  const hrsVariance=hrsAll-totalPlannedHrsToday;
  const hrsVarColor=hrsVariance>=0?"var(--done)":"#ef4444";
  setH("d127v4-k-hrs",`<span style="color:${hrsVarColor};font-size:22px">${hrsVariance>=0?"+":""}${hrsVariance.toFixed(1)}h</span>`);
  setH("d127v4-k-hrs-s",`<span style="color:${hrsVarColor}">${hrsVariance>=0?"ahead":"behind"} plan</span> <span style="color:var(--tx3)">(${ap127FmtNum(hrsAll,1)} / ${ap127FmtNum(totalPlannedHrsToday,0)})</span>`);
  const totalExpectedLessons=expDone*total;
  const lesVariance=doneAll-totalExpectedLessons;
  const lesVarColor=lesVariance>=0?"var(--done)":"#ef4444";
  setH("d127v4-k-les",`<span style="color:${lesVarColor};font-size:22px">${lesVariance>=0?"+":""}${lesVariance}</span>`);
  setH("d127v4-k-les-s",`<span style="color:${lesVarColor}">${lesVariance>=0?"ahead":"behind"} plan</span> <span style="color:var(--tx3)">(${doneAll} / ${totalExpectedLessons})</span>`);
  setT("d127v4-meta",`${doneAll} lessons done · Avg ${avgDone.toFixed(1)} · ${onTrack}/${total} on track`);

  const today=today0;
  const q=(document.getElementById("d127v4-q")?.value||"").toLowerCase().trim();
  let rows=ap127SortRows(all,today,planMap,today);
  if(q)rows=rows.filter(s=>s.name.toLowerCase().includes(q)||(s.nick||"").toLowerCase().includes(q)||(s.fi||"").toLowerCase().includes(q));
  AP127_VIEW_ROWS=rows;
  const updTxt=G._updated?new Date(G._updated).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
  document.getElementById("d127v4-asof").textContent=`Updated ${updTxt}`;

  const paced=ap127PaceSort(all,today);
  const leaderDone=paced[0]?.done||0,lagDone=paced.at(-1)?.done||0;
  const spread=Math.max(leaderDone-lagDone,1),step=Math.max(Math.ceil(spread/3),1);
  const aheadLo=leaderDone-step+1,midLo=leaderDone-step*2+1;
  const getBandColor=(done)=>{if(done>=aheadLo)return"#7be9b8";if(done>=midLo)return"#ffd67a";return"#ffa0a0";};
  const tbody=document.getElementById("d127v4-rows");
  const plannedHrsToday=ap127PlannedHoursAsOf(today);
  const sortedByDone=[...all].sort((a,b)=>(a.done||0)-(b.done||0));
  const avgPctAll=curriculum?rows.reduce((a,s)=>a+(s.done||0),0)/rows.length/curriculum*100:0;
  const sumHrsAll=rows.reduce((a,s)=>a+ap127Hours(s),0);
  const sumDoneAll=rows.reduce((a,s)=>a+(s.done||0),0);
  const validIdles=rows.map(s=>ap127IdleDays(s,today)).filter(v=>v!==9999);
  const avgIdleAll=validIdles.length?(validIdles.reduce((a,v)=>a+v,0)/validIdles.length):0;
  const validDayDeltas=rows.map(s=>ap127DayDelta(s,planMap,today)).filter(v=>v!==null);
  const avgDayDeltaAll=validDayDeltas.length?Math.round(validDayDeltas.reduce((a,v)=>a+v,0)/validDayDeltas.length):0;
  const sumHrsDeltaAll=rows.reduce((a,s)=>a+(ap127Hours(s)-plannedHrsToday),0);
  const lagLastLes=(sortedByDone[0]?.flown||[]).at(-1)?.lesson||sortedByDone[0]?.next_lesson||'-';
  const leadLastLes=(sortedByDone.at(-1)?.flown||[]).at(-1)?.lesson||sortedByDone.at(-1)?.next_lesson||'-';
  const allLastDates=all.map(s=>ap127LastFlightDate(s)).filter(Boolean).sort();
  const minFltDate=allLastDates[0]?ap127ShortDate(allLastDates[0]):'-';
  const maxFltDate=allLastDates.at(-1)?ap127ShortDate(allLastDates.at(-1)):'-';
  const totalRowHtml=`<tr class="d127-total-row"><td colspan="2" style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--c127);font-weight:700;letter-spacing:.5px">AP127 · ${rows.length} SPs</td><td>-</td><td>-</td><td>-</td><td style="padding:0 5px"><span class="d127-pbg"><span class="d127-pf" style="width:${avgPctAll.toFixed(1)}%"></span></span><span class="d127-mono" style="font-size:9px">${avgPctAll.toFixed(0)}%</span></td><td class="d127-mono" style="color:var(--c127)">${sumHrsAll.toFixed(1)}</td><td class="d127-mono" style="color:var(--c127)">${sumDoneAll}</td><td class="d127-mono" style="font-size:9px">${lagLastLes}→${leadLastLes}</td><td class="d127-mono" style="font-size:9px">${minFltDate}–${maxFltDate}</td><td class="d127-mono">${avgIdleAll.toFixed(0)}d</td><td class="d127-mono" style="color:${avgDayDeltaAll>=0?'#ff6b6b':'var(--done)'}">${avgDayDeltaAll>=0?'+':''}${avgDayDeltaAll}d</td><td class="d127-mono" style="color:${sumHrsDeltaAll>=0?'var(--done)':'#ff6b6b'}">${sumHrsDeltaAll>=0?'+':''}${sumHrsDeltaAll.toFixed(1)}h</td></tr>`;
  tbody.innerHTML=totalRowHtml+rows.map((s,idx)=>{
    const rank=idx+1,pct=curriculum?((s.done||0)/curriculum*100):0;
    const hrs=ap127Hours(s);
    const hrsDelta=hrs-plannedHrsToday;
    const hrsDeltaTxt=(hrsDelta>=0?"+":"")+hrsDelta.toFixed(1)+"h";
    const hrsDeltaColor=hrsDelta>=0?"#51cf66":"#ff6b6b";
    const idle=ap127IdleDays(s,today);
    const idleTxt=idle===9999?"-":idle.toString();
    let idleStyle="";
    if(idle!==9999){if(idle<=2)idleStyle="color:var(--tx)";else if(idle<=5)idleStyle="color:#fbbf24";else if(idle<=10)idleStyle="color:#ff6b6b";else idleStyle="color:#ff6b6b;background:rgba(255,255,255,0.85);border-radius:3px;padding:1px 5px;font-weight:700";}
    const dayDelta=ap127DayDelta(s,planMap,today);
    const dayDeltaTxt=dayDelta===null?"-":(dayDelta>=0?`+${dayDelta}d`:`${dayDelta}d`);
    const dayDeltaColor=dayDelta===null?"":dayDelta>0?"#ff6b6b":"#51cf66";
    const rankColor=getBandColor(s.done||0);
    const last=(s.flown||[]).at(-1)||{};
    const flewToday=last.date===today;
    return `<tr onclick="openAP127DrawerV4(${idx})"><td><span class="d127-rank" style="background:${rankColor};color:#000">${rank}</span>${flewToday?'<span class="d127-today-dot" title="Flew today"></span>':""}</td><td><div class="d127-name">${ap127ShortName(s.name)}</div></td><td class="d127-mono" style="font-weight:700;color:var(--c127)">${s.nick||"-"}</td><td class="d127-mono" style="color:${s.se==="DA40-TDI"?"#fb923c":"#38bdf8"};font-weight:600">${s.se||"-"}</td><td class="d127-mono">${AP127_FI_FULL[s.fi]||s.fi||"-"}</td><td style="padding:0 4px"><span class="d127-pbg"><span class="d127-pf" style="width:${pct.toFixed(1)}%"></span></span><span class="d127-mono" style="font-size:9px">${pct.toFixed(0)}%</span></td><td class="d127-mono">${hrs.toFixed(1)}</td><td class="d127-mono">${s.done||0}</td><td class="d127-mono">${last.lesson||s.next_lesson||"-"}</td><td class="d127-mono">${ap127ShortDate(last.date)}</td><td class="d127-mono" style="${idleStyle}">${idleTxt}</td><td class="d127-mono" style="color:${dayDeltaColor}">${dayDeltaTxt}</td><td class="d127-mono" style="color:${hrsDeltaColor}">${hrsDeltaTxt}</td></tr>`;
  }).join("");
  const curSort=document.getElementById("d127v4-sort")?.value||"behind";
  document.querySelectorAll(".d127-table th[data-key]").forEach(th=>{
    th.onclick=()=>ap127HeaderClick(th.getAttribute("data-key"));
    const existing=th.querySelector(".d127-sarr");if(existing)existing.remove();
    if(th.getAttribute("data-key")===curSort){const s=document.createElement("span");s.className="d127-sarr";s.textContent="▼";th.appendChild(s);}
  });

  const recent=[...all].map(s=>({s,last:(s.flown||[]).at(-1)||{}})).filter(x=>x.last.date).sort((a,b)=>(b.last.date||"").localeCompare(a.last.date||"")||(b.s.done||0)-(a.s.done||0)).slice(0,8);
  document.getElementById("d127v4-activity").innerHTML=recent.map(x=>`<div class="d127-ai"><div class="d127-an">${ap127ShortName(x.s.name)} · ${x.last.lesson||"-"}</div><div class="d127-ad">${ap127ShortDate(x.last.date)} · ${ap127Hours(x.s).toFixed(2)} hrs · ${x.s.done||0}/${curriculum}</div></div>`).join("")||`<div class="d127-ad">No activity yet.</div>`;

  buildAP127CombinedChart();
  buildAP127Timeline(all,curriculum,maxDate);
  buildAP127RaceChart(all,curriculum,maxDate);
  buildAP127ConsIdle(all,today0);
  buildAP127OverallChart(all,curriculum,maxDate);
  buildAP127HistBatch();
  buildAP127HistSolo();
  buildAP127PaceBand(all,today0);
  buildAP127LessonBar();
  buildAP127Funnel(all,today0);
  buildAP127Watchlist(all,today0);
  buildAP127Roster();
  updateScrubber();
  renderAP127Pace();
}
function openAP127Drawer(idx){
  const s=AP127_VIEW_ROWS[idx];if(!s)return;
  const total=s.total||0,done=s.done||0;
  const setH=(id,h)=>{const e=document.getElementById(id);if(e)e.innerHTML=h;};
  document.getElementById("d127v4-d-name").textContent=s.name;
  document.getElementById("d127v4-d-meta").textContent=`${s.catc_id||"-"} · ${s.nick||"-"} · FI: ${s.fi||"-"} · ${s.se||"-"}`;
  const today0=ap127AsOf();
  const planMap={};(G.cur127||[]).forEach(c=>{if(c.lesson&&c.planned_date)planMap[c.lesson]=c.planned_date;});
  const idle=ap127IdleDays(s,today0);
  const dayDelta=ap127DayDelta(s,planMap,today0);
  const hrs=ap127Hours(s);
  const hrsDelta=hrs-ap127PlannedHoursAsOf(today0);
  const kpiItem=(label,val,color)=>`<div style="min-width:68px;text-align:center;padding:6px 10px 8px;background:var(--s2);border-radius:4px"><div class="d127-kl" style="margin-bottom:2px">${label}</div><div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;color:${color||'var(--tx)'};line-height:1.1">${val}</div></div>`;
  setH("d127v4-d-kpis",[
    kpiItem("Lessons",`${done} / ${total}`,"var(--c127)"),
    kpiItem("Hours",hrs.toFixed(1)+"h","var(--tx)"),
    kpiItem("Idle",idle===9999?"—":idle+"d",idle<=2?"var(--tx)":idle<=5?"#fbbf24":"#ff6b6b"),
    kpiItem("Day Δ",dayDelta===null?"—":(dayDelta>=0?"+":"")+dayDelta+"d",dayDelta===null?"var(--tx3)":dayDelta>0?"#ff6b6b":"#51cf66"),
    kpiItem("Hrs Δ",(hrsDelta>=0?"+":"")+hrsDelta.toFixed(1)+"h",hrsDelta>=0?"#51cf66":"#ff6b6b"),
  ].join(""));
  const flown=(s.flown||[]).slice().reverse();
  setH("d127v4-d-flown",flown.length?flown.map(f=>`<div class="d127-li"><div class="d127-ldt">${ap127ShortDate(f.date)}</div><div class="d127-ll">${f.lesson||"-"}</div><div class="d127-ld">${hm(ap127FlightMins(f))}</div></div>`).join(""):`<div class="d127-ad">No completed flights.</div>`);
  const plan=(s.planned||[]);
  setH("d127v4-d-plan",plan.length?plan.map(p=>`<div class="d127-li"><div class="d127-ldt">${ap127ShortDate(p.date)}</div><div class="d127-ll">${p.lesson||"-"}</div><div class="d127-ld">${hm(p.mins||p.planned_mins||0)}</div></div>`).join(""):`<div class="d127-ad">No planned flights.</div>`);
  document.getElementById("d127v4-draw-ov").classList.add("show");
}
function closeAP127Drawer(){const el=document.getElementById("d127v4-draw-ov");if(el)el.classList.remove("show");}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAP127Drawer();});

function buildAP127Timeline(all,curriculum,maxDate){
  const sorted=ap127PaceSort(all,ap127AsOf());
  const wrap=document.getElementById("d127v4-timeline-wrap");
  if(wrap)wrap.style.height=Math.max(420,sorted.length*22)+"px";
  const today=ap127AsOf();
  const DAY=86400000;
  const toDayNum=ds=>{const d=new Date(ds+"T12:00:00Z");return Math.floor(d.getTime()/DAY);};
  const allDates=[];
  sorted.forEach(s=>(s.flown||[]).forEach(f=>{if(f.date)allDates.push(f.date);}));
  if(!allDates.length)allDates.push(today);
  const minDay=Math.min(...allDates.map(toDayNum));
  const todayDay=toDayNum(today);
  const maxDay=Math.max(todayDay,...allDates.map(toDayNum));
  const span=Math.max(maxDay-minDay,1);
  const rightPad=Math.max(6,Math.ceil(span*0.08));
  const xMin=minDay-1,xMax=maxDay+rightPad;
  const countX=maxDay+1;
  const legend=document.getElementById("d127v4-phase-legend");
  if(legend){
    const items=AP127_SYLLABUS_PHASES.map(d=>`<span class="d127-pc" title="${escHtml(d.title)}"><span class="d127-pdot" style="background:${d.c}"></span>${d.label}</span>`).join("");
    legend.innerHTML=items+`<span class="d127-pc" style="margin-left:10px"><span class="d127-pdot" style="background:#fca5a5;border-radius:2px;width:14px;height:3px"></span>gap &gt; 7 days</span><span class="d127-pc"><span class="d127-pdot" style="background:#e6edf3;border-radius:2px;width:14px;height:3px"></span>idle 1-2d</span><span class="d127-pc"><span class="d127-pdot" style="background:#fbbf24;border-radius:2px;width:14px;height:3px"></span>idle 3-5d</span><span class="d127-pc"><span class="d127-pdot" style="background:#ff6b6b;border-radius:2px;width:14px;height:3px"></span>idle &gt;5d</span><span class="d127-pc"><span class="d127-pdot" style="background:#f59e0b;width:2px;height:10px;border-radius:0"></span>today</span>`;
  }
  const phaseColor=code=>ap127SyllabusPhase(code).c;
  const datasets=[];
  sorted.forEach((s,idx)=>{
    const flights=(s.flown||[]).filter(f=>f.date).sort((a,b)=>a.date.localeCompare(b.date));
    const pts=flights.map(f=>({x:toDayNum(f.date),y:idx+1,date:f.date,lesson:f.lesson||"-",mins:ap127FlightMins(f),sIdx:idx,studentName:s.name}));
    const colors=flights.map(f=>phaseColor(f.lesson));
    datasets.push({
      label:ap127ShortName(s.name),
      data:pts,
      showLine:true,
      borderColor:"rgba(180,180,180,0.35)",
      borderWidth:0.8,
      pointRadius:3.2,
      pointHoverRadius:5,
      pointHitRadius:8,
      pointBackgroundColor:colors,
      pointBorderWidth:0,
      tension:0,
      segment:{
        borderColor:ctx=>{
          const a=ctx.p0?.raw,b=ctx.p1?.raw;
          if(!a||!b)return "rgba(180,180,180,0.35)";
          return (b.x-a.x)>7?"#fca5a5":"rgba(180,180,180,0.35)";
        },
        borderWidth:ctx=>{
          const a=ctx.p0?.raw,b=ctx.p1?.raw;
          if(!a||!b)return 0.8;
          return (b.x-a.x)>7?1.4:0.8;
        }
      }
    });
    if(flights.length){
      const lastFlightDay=pts[pts.length-1].x;
      const idleDays=todayDay-lastFlightDay;
      if(idleDays>0){
        const idleColor=ap127IdleLineColor(idleDays);
        datasets.push({
          label:"__idle_"+idx,
          data:[{x:lastFlightDay,y:idx+1},{x:todayDay,y:idx+1}],
          showLine:true,
          borderColor:idleColor,
          borderWidth:idleDays>10?2:1.4,
          borderDash:[3,3],
          pointRadius:0,
          pointHoverRadius:0,
          pointHitRadius:0,
          _isIdle:true,
          _idleDays:idleDays,
          _idleColor:idleColor
        });
      }
      datasets.push({
        label:"__count_"+idx,
        data:[{x:countX,y:idx+1,_count:flights.length}],
        showLine:false,
        pointRadius:0,
        pointHoverRadius:0,
        pointHitRadius:0,
        _isCount:true,
        _countText:`· ${flights.length} flt`
      });
    }
  });
  datasets.push({
    label:"__today",
    data:[{x:todayDay,y:0.5},{x:todayDay,y:sorted.length+0.5}],
    showLine:true,
    borderColor:"#f59e0b",
    borderWidth:1.4,
    borderDash:[5,4],
    pointRadius:0,
    pointHoverRadius:0,
    pointHitRadius:0,
    _isToday:true
  });
  const countPlugin={
    id:"d127v4CountLabels",
    afterDatasetsDraw(chart){
      const{ctx}=chart;
      ctx.save();ctx.font="9px JetBrains Mono, monospace";ctx.fillStyle="#8b949e";ctx.textAlign="left";ctx.textBaseline="middle";
      chart.data.datasets.forEach((ds,di)=>{
        if(!ds._isCount)return;
        const meta=chart.getDatasetMeta(di);if(meta.hidden)return;
        const pt=meta.data[0];if(!pt)return;
        ctx.fillText(ds._countText,pt.x+4,pt.y);
      });
      ctx.restore();
    }
  };
  const gapPlugin={
    id:"d127v4GapLabels",
    afterDatasetsDraw(chart){
      const{ctx}=chart;
      ctx.save();ctx.font="700 8.5px JetBrains Mono, monospace";ctx.textAlign="center";ctx.textBaseline="middle";
      chart.data.datasets.forEach((ds,di)=>{
        if(ds._isToday||ds._isCount||ds._isIdle)return;
        const meta=chart.getDatasetMeta(di);if(meta.hidden)return;
        const pts=meta.data||[];
        for(let i=1;i<pts.length;i++){
          const a=ds.data[i-1],b=ds.data[i];
          if(!a||!b)continue;
          const gap=b.x-a.x;
          if(gap<=7)continue;
          const px=(pts[i-1].x+pts[i].x)/2;
          const py=pts[i].y-7;
          const txt=`${gap}d`;
          const w=ctx.measureText(txt).width+4;
          ctx.fillStyle="rgba(13,17,23,0.85)";ctx.fillRect(px-w/2,py-5,w,10);
          ctx.fillStyle="#fca5a5";ctx.fillText(txt,px,py);
        }
      });
      ctx.restore();
    }
  };
  const idlePlugin={
    id:"d127v4IdleLabels",
    afterDatasetsDraw(chart){
      const{ctx}=chart;
      ctx.save();ctx.font="700 8.5px JetBrains Mono, monospace";ctx.textAlign="center";ctx.textBaseline="middle";
      chart.data.datasets.forEach((ds,di)=>{
        if(!ds._isIdle)return;
        const meta=chart.getDatasetMeta(di);if(meta.hidden)return;
        const pts=meta.data||[];if(pts.length<2)return;
        const px=(pts[0].x+pts[1].x)/2;
        const py=pts[1].y-7;
        const txt=`${ds._idleDays}d`;
        const w=ctx.measureText(txt).width+4;
        ctx.fillStyle="rgba(13,17,23,0.85)";ctx.fillRect(px-w/2,py-5,w,10);
        ctx.fillStyle=ds._idleColor;ctx.fillText(txt,px,py);
      });
      ctx.restore();
    }
  };
  const labelPlugin={
    id:"d127v4RowLabels",
    afterDatasetsDraw(chart){
      const{ctx,scales:{y}}=chart;
      if(!y||sorted.length<2)return;
      const cell=Math.abs(y.getPixelForValue(2)-y.getPixelForValue(1));
      ctx.save();ctx.font="7px JetBrains Mono, monospace";ctx.fillStyle="#8b949e";ctx.textAlign="right";ctx.textBaseline="middle";
      for(let i=0;i<sorted.length;i++){
        const py=y.getPixelForValue(i+1)+cell/2;
        ctx.fillText(`${i+1}. ${ap127ShortName(sorted[i].name)}`,y.left+y.width-6,py);
      }
      ctx.restore();
    }
  };
  CHARTS.ap127timeline=mkC("d127v4-timeline",{
    type:"line",
    data:{datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      parsing:false,
      onClick:(evt,els,chart)=>{
        if(!els||!els.length)return;
        const el=els[0];const ds=chart.data.datasets[el.datasetIndex];if(!ds||ds._isToday||ds._isCount||ds._isIdle)return;
        const raw=ds.data[el.index];if(!raw||raw.sIdx==null)return;
        const student=sorted[raw.sIdx];if(!student)return;
        const viewIdx=AP127_VIEW_ROWS.findIndex(s=>s.catc_id===student.catc_id);
        if(viewIdx>=0)openAP127Drawer(viewIdx);
      },
      plugins:{
        datalabels:{display:false},
        legend:{display:false},
        tooltip:{
          filter:(item)=>{const ds=item.chart.data.datasets[item.datasetIndex];return !ds._isToday&&!ds._isCount&&!ds._isIdle;},
          callbacks:{
            title:(ctx)=>{const r=ctx[0]?.raw;return r?ap127FmtDate(r.date):"";},
            label:(ctx)=>{const r=ctx.raw;if(!r)return"";return `${ap127ShortName(r.studentName||ctx.dataset.label)} · ${r.lesson} · ${hm(r.mins||0)}`;}
          }
        }
      },
      scales:{
        x:{
          type:"linear",
          min:xMin,
          max:xMax,
          ticks:{
            font:{family:"JetBrains Mono",size:8},
            color:"#6e7681",
            maxRotation:0,
            autoSkip:true,
            maxTicksLimit:14,
            callback:v=>{const d=new Date(Math.round(v)*DAY);return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});}
          },
          grid:{color:"#21262d"}
        },
        y:{
          reverse:true,
          min:.5,
          max:sorted.length+.5,
          afterFit:scale=>{scale.width=100;},
          ticks:{
            stepSize:1,
            autoSkip:false,
            font:{family:"JetBrains Mono",size:7},
            color:"#8b949e",
            callback:()=>""
          },
          grid:{color:"#21262d",offset:false}
        }
      }
    },
    plugins:[countPlugin,gapPlugin,idlePlugin,labelPlugin]
  });
  const lead=sorted[0],lag=sorted.at(-1);
  document.getElementById("d127v4-tl-meta").textContent=lead&&lag?`Leader ${ap127ShortName(lead.name)} (${lead.done||0}/${curriculum}) · Lag ${ap127ShortName(lag.name)} (${lag.done||0}/${curriculum})`:"-";
}

let AP127_RACE_SOLO=null;
let AP127_RACE_MODE='lessons';
function setAP127RaceMode(m){
  AP127_RACE_MODE=m;
  const allR=ap127AsOfStudents();
  const maxD=allR.flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort().at(-1)||"";
  buildAP127RaceChart(allR,G.cur127?.length||101,maxD);
  buildAP127HistSolo();
  buildAP127ConsIdle(allR,ap127AsOf());
}
function buildAP127RaceChart(all,curriculum,maxDate){
  const today=ap127AsOf();
  const racers=ap127PaceSort(all,today);
  const isHrs=AP127_RACE_MODE==='hours';
  const curMap={};(G.cur127||[]).forEach(c=>{curMap[c.lesson]=c.planned_mins||0;});

  const plannedDates=(G.cur127||[]).map(c=>c.planned_date).filter(d=>d&&d<=today).sort();
  const dateSet=new Set(plannedDates);
  dateSet.add(today);
  racers.forEach(s=>(s.flown||[]).forEach(f=>{if(f.date&&f.date<=today)dateSet.add(f.date);}));
  const labels=[...dateSet].sort();

  const cumSeries=(flights)=>{
    const flightDates=new Set(flights.map(f=>f.date));
    const byDate={};
    flights.forEach(f=>{
      const v=isHrs?((curMap[f.lesson]||ap127FlightMins(f))/60):1;
      byDate[f.date]=(byDate[f.date]||0)+v;
    });
    let run=0;
    return labels.map(d=>{
      run+=(byDate[d]||0);
      return {y:+run.toFixed(2),r:flightDates.has(d)?3:0};
    });
  };

  const planByDate={};
  if(isHrs){
    (G.cur127||[]).forEach(c=>{if(!c.planned_date||c.planned_date>today)return;planByDate[c.planned_date]=(planByDate[c.planned_date]||0)+(c.planned_mins||0)/60;});
  } else {
    plannedDates.forEach(d=>{planByDate[d]=(planByDate[d]||0)+1;});
  }
  let planRun=0;
  const planData=labels.map(d=>{planRun+=(planByDate[d]||0);return +planRun.toFixed(2);});

  const datasets=[{
    label:"Planned Target",
    data:planData,
    borderColor:"#cbd5e1",pointRadius:0,tension:.25,borderDash:[6,4],borderWidth:2
  }];

  racers.forEach((s,i)=>{
    const hue=(i*360/Math.max(racers.length,1)).toFixed(0);
    const col=`hsla(${hue},85%,62%,0.8)`;
    const nick=ap127ShortName(s.name);
    const flights=(s.flown||[]).filter(f=>f.date&&f.date<=today).sort((a,b)=>a.date.localeCompare(b.date));
    const visible=AP127_RACE_SOLO===null||AP127_RACE_SOLO===nick;
    const pts=cumSeries(flights);
    datasets.push({
      label:nick,
      data:pts.map(p=>p.y),
      borderColor:col,
      pointRadius:pts.map(p=>p.r),
      pointHoverRadius:pts.map(p=>p.r?5:0),
      pointBackgroundColor:col,
      pointBorderWidth:0,
      tension:.18,
      borderWidth:visible?1.5:0,
      hidden:!visible
    });
  });

  const avgData=labels.map((_,li)=>{
    let sum=0,cnt=0;
    datasets.forEach(ds=>{
      if(ds.label==='Planned Target')return;
      const v=ds.data[li];
      if(typeof v==='number'){sum+=v;cnt++;}
    });
    return cnt?+(sum/cnt).toFixed(2):0;
  });
  datasets.push({
    label:'Batch Avg',
    data:avgData,
    borderColor:'#e88aff',
    borderWidth:3,
    pointRadius:0,
    tension:.18,
    borderDash:[],
    order:999
  });

  CHARTS.ap127race=mkC("d127v4-race",{
    type:"line",data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{datalabels:{display:false},legend:{display:false},tooltip:{callbacks:{
        title:(ctx)=>ap127FmtDate(ctx[0]?.label||""),
        label:(ctx)=>`${ctx.dataset.label}: ${isHrs?ctx.parsed.y.toFixed(1)+" hrs":ctx.parsed.y+" les"}`
      }}},
      scales:{
        x:{ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681",maxTicksLimit:18},grid:{color:"#21262d"}},
        y:{beginAtZero:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",callback:v=>isHrs?v.toFixed(0)+"h":v},grid:{color:"#21262d"}}
      }
    }
  });

  const togglesDiv=document.getElementById("d127v4-race-toggles");
  togglesDiv.innerHTML="";

  const modeRow=document.createElement("div");
  modeRow.style.cssText="display:flex;gap:6px;align-items:center;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--bd)";
  ['lessons','hours'].forEach(m=>{
    const sel=AP127_RACE_MODE===m;
    const btn=document.createElement("button");
    btn.textContent=m==='lessons'?'Lessons':'Hours';
    btn.style.cssText=`padding:4px 10px;background:${sel?"#e88aff":"#30363d"};color:${sel?"#000":"#8b949e"};border:0;border-radius:3px;cursor:pointer;font-weight:${sel?"700":"400"};font-size:10px;font-family:'JetBrains Mono',monospace`;
    btn.onclick=()=>setAP127RaceMode(m);
    modeRow.appendChild(btn);
  });
  const avgNote=document.createElement("span");
  avgNote.style.cssText="font-family:'JetBrains Mono',monospace;font-size:9px;color:#e88aff;margin-left:8px";
  avgNote.textContent="◆ thick = batch avg";
  modeRow.appendChild(avgNote);
  togglesDiv.appendChild(modeRow);

  const allBtn=document.createElement("button");
  allBtn.textContent="ALL";
  allBtn.style.cssText=`padding:4px 10px;background:${AP127_RACE_SOLO===null?"#4ade80":"#30363d"};color:${AP127_RACE_SOLO===null?"#000":"#8b949e"};border:0;border-radius:3px;cursor:pointer;font-weight:700;font-size:10px;font-family:'JetBrains Mono',monospace`;
  allBtn.onclick=()=>{AP127_RACE_SOLO=null;buildAP127RaceChart(all,curriculum,maxDate);buildAP127HistSolo();buildAP127ConsIdle(all,ap127AsOf());};
  togglesDiv.appendChild(allBtn);
  racers.forEach(s=>{
    const nick=ap127ShortName(s.name);
    const active=AP127_RACE_SOLO===nick;
    const btn=document.createElement("button");
    btn.textContent=nick;
    btn.style.cssText=`padding:4px 8px;background:${active?"#38bdf8":"#30363d"};color:${active?"#000":"#8b949e"};border:0;border-radius:3px;cursor:pointer;font-size:10px;font-family:'JetBrains Mono',monospace`;
    btn.onclick=()=>{AP127_RACE_SOLO=active?null:nick;buildAP127RaceChart(all,curriculum,maxDate);buildAP127HistSolo();buildAP127ConsIdle(all,ap127AsOf());};
    togglesDiv.appendChild(btn);
  });
  document.getElementById("d127v4-race-meta").textContent=`${all.length} students · to ${ap127FmtDate(today)} · ${isHrs?"hours":"lessons"} mode · planned baseline`;
}

// ── Consecutive & Idle streak chart — shares AP127_RACE_SOLO + hue formula with Actual vs Planned ──
// UTC throughout (parse with a "Z" suffix, step with setUTCDate, read back via toISOString) —
// parsing as LOCAL midnight and then serializing via toISOString (which is always UTC) silently
// shifts every generated date string by a day in any timezone east of UTC, e.g. Bangkok UTC+7:
// local midnight of "2026-08-02" serializes as "2026-08-01". That made the Roster's "highlight
// today" feature never match anything — `today` (from the timezone-safe ap127TodayBKK()) never
// appeared in the generated day list at all. Confirmed live before fixing: 0 matches for
// .d127v4-heat-today anywhere in the DOM.
function ap127AllDatesRange(start,end){
  const out=[];let d=new Date(start+"T00:00:00Z");const endD=new Date(end+"T00:00:00Z");
  let guard=0;
  while(d<=endD&&guard<3650){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);guard++;}
  return out;
}
function ap127StreakSeries(student,days){
  const flownSet=new Set((student.flown||[]).map(f=>f.date));
  let streak=0;
  return days.map(d=>{streak=flownSet.has(d)?(streak>0?streak+1:1):(streak<0?streak-1:-1);return{x:d,y:streak};});
}
function buildAP127ConsIdle(all,asOf){
  if(!all.length)return;
  const today=asOf;
  const racers=ap127PaceSort(all,today);
  const allFlownDates=all.flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort();
  const start=allFlownDates[0]||today;
  const days=ap127AllDatesRange(start,today);
  const datasets=[{label:"Zero",data:days.map(d=>({x:d,y:0})),borderColor:"rgba(255,255,255,0.18)",borderWidth:1,borderDash:[4,3],pointRadius:0,tension:0,order:0}];
  const allSeries=[];
  racers.forEach((s,i)=>{
    const hue=(i*360/Math.max(racers.length,1)).toFixed(0);
    const col=`hsla(${hue},85%,62%,0.8)`;
    const nick=ap127ShortName(s.name);
    const visible=AP127_RACE_SOLO===null||AP127_RACE_SOLO===nick;
    const series=ap127StreakSeries(s,days);
    allSeries.push(series);
    datasets.push({label:nick,data:series,borderColor:col,borderWidth:visible?1.3:0,pointRadius:0,tension:0,hidden:!visible,order:1});
  });
  const avgData=days.map((d,di)=>{
    const vals=allSeries.map(sd=>sd[di].y);
    return{x:d,y:+(vals.reduce((a,v)=>a+v,0)/vals.length).toFixed(2)};
  });
  datasets.push({label:"Batch Avg",data:avgData,borderColor:"#e88aff",borderWidth:3,pointRadius:0,tension:.15,order:999});
  CHARTS.ap127consIdle=mkC("d127v4-considle",{
    type:"line",data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      parsing:{xAxisKey:"x",yAxisKey:"y"},
      interaction:{mode:"index",intersect:false},
      plugins:{
        datalabels:{display:false},legend:{display:false},
        tooltip:{callbacks:{
          title:ctx=>{const r=ctx[0]?.raw;return r?ap127FmtDate(r.x):"";},
          label:ctx=>{if(ctx.dataset.label==="Zero")return null;const v=ctx.raw?.y;if(v==null)return null;return `${ctx.dataset.label}: ${v>0?"+"+v+"d flying":v<0?v+"d idle":"—"}`;}
        }}
      },
      scales:{
        x:{type:"time",time:{unit:"month",displayFormats:{day:"d MMM",week:"d MMM",month:"MMM yy"}},ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681",maxTicksLimit:14,source:"auto"},grid:{color:"#21262d"}},
        y:{ticks:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",callback:v=>v>0?"+"+v:v},grid:{color:"#21262d"}}
      }
    }
  });
}

// Finer syllabus milestones beyond the 4 phase boundaries — found by walking G.cur127 in lesson-
// number order and matching the same code-letter decoder the phase classifier uses (D=Dual,
// S=Solo, SP=SPIC, M=Multi-Engine, trailing C=Check). Returns the FIRST lesson number hitting each
// category, plus every checkride lesson (there are exactly 4 in the curriculum). idx = lessonNum-1,
// same "lessons completed before this one starts" convention as the phase boundaries.
function ap127KeyPoints(cur){
  const norm=c=>String(c||"").trim();
  const stripNum=c=>norm(c).replace(/\s*\d+\s*$/,"");
  const byNum=[...cur].filter(c=>ap127LessonNum(c.lesson)!=null).sort((a,b)=>ap127LessonNum(a.lesson)-ap127LessonNum(b.lesson));
  const firstMatch=test=>{const c=byNum.find(c=>test(norm(c.lesson)));return c?ap127LessonNum(c.lesson):null;};
  const pts=[];
  const add=(label,num)=>{if(num!=null)pts.push({idx:num-1,label});};
  add("Initial Solo",firstMatch(c=>/^CS/i.test(c)));
  add("Instrument",firstMatch(c=>/IF|IL/i.test(c)));
  add("Cross-Country",firstMatch(c=>/XV|XI/i.test(c)));
  add("Sim",firstMatch(c=>/\(SIM\)/i.test(c)));
  add("Multi-Engine",firstMatch(c=>/^CM/i.test(c)));
  byNum.forEach(c=>{const n=ap127LessonNum(c.lesson);if(n!=null&&/C$/i.test(stripNum(c.lesson)))pts.push({idx:n-1,label:"Checkride"});});
  return pts;
}
// ── Overall Progress Bar View v5 — a "MASTER PLAN" reference row (the full curriculum, always
// 100% filled) sits first, above every SP's own stacked-by-phase bar, so each SP's progress reads
// directly against the complete plan. Phase-boundary lines (bold) and finer syllabus key points
// (Initial Solo/Instrument/Cross-Country/Sim/Multi-Engine/Checkride, thinner) both draw as vertical
// guides spanning the whole chart; a marker that lands on the same lesson as a phase boundary
// merges into that boundary's label instead of drawing a second overlapping line. ──
function buildAP127OverallChart(all,curriculum,maxDate){
  const sorted=ap127PaceSort(all,ap127AsOf());
  const cur=G.cur127||[];
  const totalLessons=cur.length||curriculum||96;
  const inPhase=(code,p)=>{const n=ap127LessonNum(code);return n!=null&&n>=p.lo&&n<=p.hi;};
  const datasets=AP127_SYLLABUS_PHASES.map(p=>({
    label:p.label,
    data:[p.hi-p.lo+1,...sorted.map(s=>(s.flown||[]).filter(f=>inPhase(f.lesson,p)).length)],
    backgroundColor:p.c,
    stack:"prog",
  }));
  const remainingData=[0,...sorted.map(s=>Math.max(0,totalLessons-(s.done||0)))];
  datasets.push({label:"Remaining",data:remainingData,backgroundColor:"rgba(255,255,255,0.06)",stack:"prog"});
  const labels=["MASTER PLAN",...sorted.map(s=>ap127ShortName(s.name))];

  const boundaries=AP127_SYLLABUS_PHASES.slice(1).map(p=>({idx:p.lo-1,label:p.label,kind:"phase"})); // Phase I starts at 0, no line needed
  const markers=[...boundaries];
  ap127KeyPoints(cur).forEach(kp=>{
    const existing=markers.find(m=>m.idx===kp.idx);
    if(existing)existing.label+=" · "+kp.label;
    else markers.push({idx:kp.idx,label:kp.label,kind:"key"});
  });
  markers.sort((a,b)=>a.idx-b.idx);

  const currentLabelPlugin={
    id:"d127v4CurrentLabel",
    afterDatasetsDraw(chart){
      const{ctx}=chart;
      ctx.save();ctx.font="9px JetBrains Mono, monospace";ctx.fillStyle="#8b949e";ctx.textAlign="left";ctx.textBaseline="middle";
      const meta=chart.getDatasetMeta(AP127_SYLLABUS_PHASES.length-1); // end of the last real phase segment = done position
      sorted.forEach((s,i)=>{
        const bar=meta.data[i+1];if(!bar)return; // +1: row 0 is the Master Plan reference, not a student
        const last=(s.flown||[]).at(-1);
        const txt=(s.next_lesson==="COMPLETE"?"✓ COMPLETE":(s.next_lesson||last?.lesson||"-"));
        ctx.fillText(txt,bar.x+4,bar.y);
      });
      ctx.restore();
    }
  };
  const markerPlugin={
    id:"d127v4Markers",
    afterDatasetsDraw(chart){
      const{ctx,scales:{x,y}}=chart;
      ctx.save();
      markers.forEach((m,i)=>{
        const px=x.getPixelForValue(m.idx);
        const isPhase=m.kind==="phase";
        ctx.strokeStyle=isPhase?"rgba(255,255,255,0.32)":"rgba(250,204,21,0.5)";
        ctx.lineWidth=isPhase?1.2:1;
        ctx.setLineDash(isPhase?[4,3]:[2,3]);
        ctx.beginPath();ctx.moveTo(px,y.top);ctx.lineTo(px,y.bottom);ctx.stroke();
        ctx.setLineDash([]);
        const tier=i%3; // stagger labels of nearby markers onto 3 rows so dense clusters (checkrides
        // 1 lesson apart, or a key point landing right next to a phase boundary) don't overlap
        const nearRightEdge=(x.right-px)<95; // flip alignment so labels near lesson 96 don't run off-canvas
        ctx.font=isPhase?"700 8.5px JetBrains Mono, monospace":"8px JetBrains Mono, monospace";
        ctx.fillStyle=isPhase?"#c9d1d9":"#facc15";
        ctx.textAlign=nearRightEdge?"right":"left";ctx.textBaseline="top";
        ctx.fillText(m.label,px+(nearRightEdge?-3:3),y.top+2+tier*11);
      });
      ctx.restore();
    }
  };
  const legend=document.getElementById("d127v4-overall-legend");
  if(legend){
    legend.innerHTML=AP127_SYLLABUS_PHASES.map(d=>`<span class="d127-pc" title="${escHtml(d.title)}"><span class="d127-pdot" style="background:${d.c}"></span>${d.label}</span>`).join("")
      +`<span class="d127-pc" style="margin-left:10px"><span class="d127-pdot" style="background:rgba(255,255,255,0.32);border-radius:2px;width:14px;height:3px"></span>phase boundary</span>`
      +`<span class="d127-pc"><span class="d127-pdot" style="background:#facc15;border-radius:2px;width:14px;height:3px"></span>key point</span>`;
  }
  CHARTS.ap127overall=mkC("d127v4-overall",{
    type:"bar",
    data:{labels,datasets},
    options:{
      indexAxis:"y",responsive:true,maintainAspectRatio:false,
      plugins:{
        datalabels:{display:false},
        legend:{display:false},
        tooltip:{filter:item=>item.dataset.label!=="Remaining",callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.parsed.x} lessons`}}
      },
      scales:{
        x:{stacked:true,min:0,max:totalLessons,ticks:{font:{family:"JetBrains Mono",size:8},color:"#8b949e"},grid:{color:"#21262d"},title:{display:true,text:"Lesson number",color:"#6e7681",font:{family:"JetBrains Mono",size:8}}},
        y:{stacked:true,afterFit:scale=>{scale.width=100;},ticks:{font:{family:"JetBrains Mono",size:8},color:ctx=>ctx.index===0?"#e88aff":"#8b949e",autoSkip:false},grid:{color:"#21262d"}}
      }
    },
    plugins:[currentLabelPlugin,markerPlugin]
  });
}

let CPV_FILTER='proj';
let CPV_MODE='hours';
let HIST_BATCH_MODE='hours';
let COHORT_AS_OF=null;
function cpvResetZoom(){
  const chart=CHARTS.ap127combined;
  if(!chart)return;
  delete chart.options.scales.y.min;
  delete chart.options.scales.y.max;
  chart.resetZoom();
  chart.update('none');
}
function setCPVFilter(f){
  CPV_FILTER=f;
  document.querySelectorAll('.cpv-btn[data-f]').forEach(b=>b.classList.toggle('sel',b.dataset.f===f));
  buildAP127CombinedChart();
}
function setCPVMode(m){
  CPV_MODE=m;
  document.querySelectorAll('.cpv-mode').forEach(b=>b.classList.toggle('sel',b.dataset.m===m));
  buildAP127CombinedChart();
}
function buildAP127CombinedChart(){
  const all=ap127AsOfStudents();if(!all.length)return;
  const today=ap127AsOf();
  const n=all.length;
  const curriculum=G.cur127||[];
  const isHrs=CPV_MODE==='hours';
  const unit=isHrs?'hrs':'lessons';

  const lessonsMap={};curriculum.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});

  const actualByDate={};
  all.forEach(s=>(s.flown||[]).forEach(f=>{
    if(!f.date||f.date>today)return;
    const v=isHrs?(lessonsMap[f.lesson]||ap127FlightMins(f)||0)/60:1;
    actualByDate[f.date]=(actualByDate[f.date]||0)+v;
  }));
  const totalDone=isHrs?all.reduce((a,s)=>a+ap127Hours(s),0):all.reduce((a,s)=>a+(s.done||0),0);
  const actualDates=Object.keys(actualByDate).sort();
  const firstDate=actualDates[0]||today;

  const planByDate={};
  curriculum.forEach(c=>{
    if(!c.planned_date)return;
    const v=isHrs?(c.planned_mins||0)*n/60:n;
    planByDate[c.planned_date]=(planByDate[c.planned_date]||0)+v;
  });
  const totalPlan=isHrs?curriculum.reduce((a,c)=>a+(c.planned_mins||0),0)*n/60:(curriculum.length||101)*n;
  const planDates=Object.keys(planByDate).sort();
  const planEnd=planDates.at(-1)||today;

  const daysSinceStart=Math.max(1,Math.round((new Date(today+'T12:00:00Z')-new Date(firstDate+'T12:00:00Z'))/86400000));
  const thirtyAgo=new Date(new Date(today+'T12:00:00Z').getTime()-30*86400000).toISOString().slice(0,10);
  const fifteenAgo=new Date(new Date(today+'T12:00:00Z').getTime()-15*86400000).toISOString().slice(0,10);
  const recent30=Object.entries(actualByDate).filter(([d])=>d>=thirtyAgo).reduce((a,[,v])=>a+v,0);
  const recent15=Object.entries(actualByDate).filter(([d])=>d>=fifteenAgo).reduce((a,[,v])=>a+v,0);
  const pace30=Math.max(recent30>0?recent30/30:totalDone/daysSinceStart,0.001);
  const pace15=Math.max(recent15>0?recent15/15:pace30,0.001);

  const remaining=Math.max(totalPlan-totalDone,0);
  const projDaysLeft30=remaining/pace30;
  const projDaysLeft15=remaining/pace15;
  const projEndDate30=new Date(new Date(today+'T12:00:00Z').getTime()+projDaysLeft30*86400000).toISOString().slice(0,10);
  const projEndDate15=new Date(new Date(today+'T12:00:00Z').getTime()+projDaysLeft15*86400000).toISOString().slice(0,10);

  const planByToday=Math.min(planDates.filter(d=>d<=today).reduce((a,d)=>a+(planByDate[d]||0),0),totalPlan);
  const variance=totalDone-planByToday;

  const endDate=CPV_FILTER==='today'?today:[planEnd,projEndDate30,projEndDate15].sort().at(-1);

  const planSeries=[];let rPlan=0;
  planDates.filter(d=>d<=endDate).forEach(d=>{
    rPlan=Math.min(rPlan+(planByDate[d]||0),totalPlan);
    planSeries.push({x:d,y:+rPlan.toFixed(2)});
  });
  if(planSeries.length&&planSeries.at(-1).x<endDate)planSeries.push({x:endDate,y:+rPlan.toFixed(2)});

  const actSeries=[];let rAct=0;
  actualDates.filter(d=>d<=today&&d<=endDate).forEach(d=>{
    rAct+=(actualByDate[d]||0);
    actSeries.push({x:d,y:+rAct.toFixed(2)});
  });
  if(actSeries.length&&actSeries.at(-1).x<today&&today<=endDate)actSeries.push({x:today,y:+rAct.toFixed(2)});

  const showProj=CPV_FILTER!=='today';
  const projSeries30=showProj?[{x:today,y:+totalDone.toFixed(2)},{x:projEndDate30,y:+Math.min(totalDone+projDaysLeft30*pace30,totalPlan).toFixed(2)}]:[];
  const projSeries15=showProj?[{x:today,y:+totalDone.toFixed(2)},{x:projEndDate15,y:+Math.min(totalDone+projDaysLeft15*pace15,totalPlan).toFixed(2)}]:[];

  const totalSeries=[{x:firstDate,y:+totalPlan.toFixed(2)},{x:endDate,y:+totalPlan.toFixed(2)}];
  const todaySeries=[{x:today,y:0},{x:today,y:totalPlan*1.08}];

  const fmt=v=>isHrs?v.toFixed(1):String(Math.round(v));
  const pct=(totalDone/totalPlan*100).toFixed(1);
  const varDays=Math.round(Math.abs(variance)/pace30);
  const varStr=variance>=0?`+${varDays}d ahead`:`${varDays}d behind`;
  const varC=variance>=0?'var(--done)':'#ef4444';
  const kpiEl=document.getElementById('cpv-kpis-v4');
  if(kpiEl)kpiEl.innerHTML=[
    {l:'Done / Total',v:`${fmt(totalDone)} / ${fmt(totalPlan)}`,s:`${pct}% complete`,c:'var(--c127)'},
    {l:'Proj 30d Finish',v:ap127FmtDate(projEndDate30),s:`${(pace30*7).toFixed(1)} ${unit}/wk`,c:'#38bdf8'},
    {l:'Proj 15d Finish',v:ap127FmtDate(projEndDate15),s:`${(pace15*7).toFixed(1)} ${unit}/wk`,c:'#fb923c'},
    {l:'Plan Finish',v:ap127FmtDate(planEnd),s:'per curriculum',c:'#8b949e'},
    {l:'vs Plan Today',v:`${variance>=0?'+':''}${isHrs?variance.toFixed(1):Math.round(variance)} ${unit}`,s:varStr,c:varC},
  ].map(k=>`<div class="cpv-kpi"><div class="cpv-kl">${k.l}</div><div class="cpv-kv" style="color:${k.c}">${k.v}</div><div class="cpv-ks">${k.s}</div></div>`).join('');

  CHARTS.ap127combined=mkC('d127v4-combined',{
    type:'line',
    data:{datasets:[
      {label:'Plan',    data:planSeries,  borderColor:'#cbd5e1',borderDash:[6,4],borderWidth:1.5,pointRadius:0,tension:0,order:3},
      {label:'Actual',  data:actSeries,   borderColor:'#e88aff',borderWidth:2.5, pointRadius:0,tension:0,order:1},
      {label:'Proj 30d',data:projSeries30,borderColor:'#38bdf8',borderDash:[3,3],borderWidth:1.5,pointRadius:0,tension:0,order:2},
      {label:'Proj 15d',data:projSeries15,borderColor:'#fb923c',borderDash:[3,3],borderWidth:1.5,pointRadius:0,tension:0,order:2},
      {label:'Total',   data:totalSeries, borderColor:'rgba(74,222,128,0.22)',borderDash:[2,5],borderWidth:1,pointRadius:0,order:4},
      {label:'Today',   data:todaySeries, borderColor:'rgba(245,158,11,0.6)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,order:0},
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      parsing:{xAxisKey:'x',yAxisKey:'y'},
      interaction:{mode:'index',intersect:false},
      plugins:{
        datalabels:{display:false},
        legend:{display:true,labels:{color:'#8b949e',font:{family:'JetBrains Mono',size:9},boxWidth:18,padding:10,filter:item=>item.text!=='Today'&&item.text!=='Total'}},
        tooltip:{callbacks:{
          title:ctx=>{const r=ctx[0]?.raw;return r?ap127FmtDate(r.x):'';},
          label:ctx=>{
            if(ctx.dataset.label==='Today'||ctx.dataset.label==='Total')return null;
            const v=ctx.raw?.y;if(v==null)return null;
            return `${ctx.dataset.label}: ${isHrs?v.toFixed(1)+' hrs':Math.round(v)+' lessons'}`;
          }
        }},
        zoom:{
          zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'x',onZoomComplete:({chart})=>ap127FitY(chart)},
          pan:{enabled:true,mode:'x',onPanComplete:({chart})=>ap127FitY(chart)},
        }
      },
      scales:{
        x:{type:'time',time:{unit:'month',displayFormats:{day:'d MMM',week:'d MMM',month:'MMM yy'}},
          ticks:{font:{family:'JetBrains Mono',size:8},color:'#6e7681',maxTicksLimit:14,source:'auto'},grid:{color:'#21262d'}},
        y:{beginAtZero:false,
          ticks:{font:{family:'JetBrains Mono',size:9},color:'#8b949e',callback:v=>isHrs?v.toFixed(0)+'h':v},
          grid:{color:'#21262d'}}
      }
    }
  });
  ap127FitY(CHARTS.ap127combined);
}
function setHistBatchMode(m){
  HIST_BATCH_MODE=m;
  document.querySelectorAll('.hist-batch-mode-v4').forEach(b=>b.classList.toggle('sel',b.dataset.m===m));
  buildAP127HistBatch();
}
function buildAP127HistBatch(){
  const all=ap127AsOfStudents();if(!all.length)return;
  const today=ap127AsOf();
  const curriculum=G.cur127||[];
  const isHrs=HIST_BATCH_MODE==='hours';
  const n=all.length;
  const lessonsMap={};curriculum.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const dateSet=new Set();
  all.forEach(s=>(s.flown||[]).forEach(f=>{if(f.date&&f.date<=today)dateSet.add(f.date);}));
  curriculum.forEach(c=>{if(c.planned_date&&c.planned_date<=today)dateSet.add(c.planned_date);});
  const labels=[...dateSet].sort();
  if(!labels.length)return;
  const actualByDate={};
  all.forEach(s=>(s.flown||[]).forEach(f=>{
    if(!f.date||f.date>today)return;
    const v=isHrs?(lessonsMap[f.lesson]||ap127FlightMins(f)||0)/60:1;
    actualByDate[f.date]=(actualByDate[f.date]||0)+v;
  }));
  const planByDate={};
  curriculum.forEach(c=>{
    if(!c.planned_date||c.planned_date>today)return;
    const v=isHrs?(c.planned_mins||0)*n/60:n;
    planByDate[c.planned_date]=(planByDate[c.planned_date]||0)+v;
  });
  let rAct=0,rPlan=0;
  const deltas=[];
  const batchData=labels.map(d=>{
    rAct+=(actualByDate[d]||0);
    rPlan+=(planByDate[d]||0);
    const delta=+(rAct-rPlan).toFixed(2);
    deltas.push(delta);
    return{x:d,y:delta};
  });
  const nowDelta=deltas.at(-1)||0;
  const bestDelta=Math.max(...deltas);
  const worstDelta=Math.min(...deltas);
  const fmt=v=>(v>=0?'+':'')+(isHrs?v.toFixed(1)+'h':Math.round(v)+' les');
  const kpiEl=document.getElementById('hist-batch-kpis-v4');
  if(kpiEl)kpiEl.innerHTML=[
    {l:'Now',  v:fmt(nowDelta),   c:nowDelta>=0?'var(--done)':'#ef4444', s:'vs plan today'},
    {l:'Best', v:fmt(bestDelta),  c:'var(--done)',                        s:'peak lead ever'},
    {l:'Worst',v:fmt(worstDelta), c:'#ff6b6b',                           s:'peak lag ever'},
  ].map(k=>`<div class="cpv-kpi"><div class="cpv-kl">${k.l}</div><div class="cpv-kv" style="color:${k.c}">${k.v}</div><div class="cpv-ks">${k.s}</div></div>`).join('');
  CHARTS.ap127histBatch=mkC('d127v4-hist-batch',{
    type:'line',
    data:{datasets:[{
      label:'Batch Δ',
      data:batchData,
      borderColor:'#e88aff',
      borderWidth:2,
      pointRadius:0,
      pointHoverRadius:4,
      pointHoverBackgroundColor:'#e88aff',
      tension:0.15,
      fill:{target:{value:0},above:'rgba(74,222,128,0.12)',below:'rgba(239,68,68,0.12)'}
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,
      parsing:{xAxisKey:'x',yAxisKey:'y'},
      interaction:{mode:'index',intersect:false},
      plugins:{
        datalabels:{display:false},
        legend:{display:false},
        tooltip:{callbacks:{
          title:ctx=>{const r=ctx[0]?.raw;return r?ap127FmtDate(r.x):'';},
          label:ctx=>{const v=ctx.raw?.y;if(v==null)return null;return`Batch Δ: ${isHrs?v.toFixed(1)+'h':Math.round(v)+' les'}`;}
        }}
      },
      scales:{
        x:{type:'time',time:{unit:'month',displayFormats:{day:'d MMM',week:'d MMM',month:'MMM yy'}},
          ticks:{font:{family:'JetBrains Mono',size:8},color:'#6e7681',maxTicksLimit:14,source:'auto'},
          grid:{color:'#21262d'}},
        y:{ticks:{font:{family:'JetBrains Mono',size:9},color:'#8b949e',callback:v=>isHrs?v.toFixed(0)+'h':v},
          grid:{color:'#21262d'}}
      }
    }
  });
}
function buildAP127HistSolo(){
  const all=ap127AsOfStudents();if(!all.length)return;
  const today=ap127AsOf();
  const curriculum=G.cur127||[];
  const isHrs=AP127_RACE_MODE==='hours';
  const lessonsMap={};curriculum.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const racers=ap127PaceSort(all,today);
  const dateSet=new Set();
  racers.forEach(s=>(s.flown||[]).forEach(f=>{if(f.date&&f.date<=today)dateSet.add(f.date);}));
  curriculum.forEach(c=>{if(c.planned_date&&c.planned_date<=today)dateSet.add(c.planned_date);});
  const labels=[...dateSet].sort();
  if(!labels.length)return;
  const planByDate={};
  curriculum.forEach(c=>{
    if(!c.planned_date||c.planned_date>today)return;
    const v=isHrs?(c.planned_mins||0)/60:1;
    planByDate[c.planned_date]=(planByDate[c.planned_date]||0)+v;
  });
  let rPlan=0;
  const planCum=labels.map(d=>{rPlan+=(planByDate[d]||0);return +rPlan.toFixed(2);});
  const datasets=[{
    label:'Zero',
    data:labels.map(d=>({x:d,y:0})),
    borderColor:'rgba(255,255,255,0.18)',
    borderWidth:1,
    borderDash:[4,3],
    pointRadius:0,
    tension:0,
    order:0
  }];
  const allDeltas=[];
  racers.forEach((s,i)=>{
    const hue=(i*360/Math.max(racers.length,1)).toFixed(0);
    const col=`hsla(${hue},85%,62%,0.8)`;
    const nick=ap127ShortName(s.name);
    const visible=AP127_RACE_SOLO===null||AP127_RACE_SOLO===nick;
    const flightsByDate={};
    (s.flown||[]).filter(f=>f.date&&f.date<=today).forEach(f=>{
      const v=isHrs?(lessonsMap[f.lesson]||ap127FlightMins(f)||0)/60:1;
      flightsByDate[f.date]=(flightsByDate[f.date]||0)+v;
    });
    let rAct=0;
    const data=labels.map((d,li)=>{
      rAct+=(flightsByDate[d]||0);
      return{x:d,y:+(rAct-planCum[li]).toFixed(2)};
    });
    allDeltas.push(data.map(p=>p.y));
    datasets.push({
      label:nick,
      data,
      borderColor:col,
      borderWidth:visible?1.5:0,
      pointRadius:0,
      tension:0.15,
      hidden:!visible,
      order:1
    });
  });
  const avgData=labels.map((d,li)=>{
    const vals=allDeltas.map(sd=>sd[li]);
    return{x:d,y:vals.length?+(vals.reduce((a,v)=>a+v,0)/vals.length).toFixed(2):0};
  });
  datasets.push({
    label:'Batch Avg',
    data:avgData,
    borderColor:'#e88aff',
    borderWidth:3,
    pointRadius:0,
    tension:0.15,
    order:999
  });
  CHARTS.ap127histSolo=mkC('d127v4-hist-solo',{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      parsing:{xAxisKey:'x',yAxisKey:'y'},
      interaction:{mode:'index',intersect:false},
      plugins:{
        datalabels:{display:false},
        legend:{display:false},
        tooltip:{callbacks:{
          title:ctx=>{const r=ctx[0]?.raw;return r?ap127FmtDate(r.x):'';},
          label:ctx=>{
            if(ctx.dataset.label==='Zero')return null;
            const v=ctx.raw?.y;if(v==null)return null;
            return`${ctx.dataset.label}: ${isHrs?v.toFixed(1)+'h':Math.round(v)+' les'}`;
          }
        }}
      },
      scales:{
        x:{type:'time',time:{unit:'month',displayFormats:{day:'d MMM',week:'d MMM',month:'MMM yy'}},
          ticks:{font:{family:'JetBrains Mono',size:8},color:'#6e7681',maxTicksLimit:14,source:'auto'},
          grid:{color:'#21262d'}},
        y:{ticks:{font:{family:'JetBrains Mono',size:9},color:'#8b949e',callback:v=>isHrs?v.toFixed(0)+'h':v},
          grid:{color:'#21262d'}}
      }
    }
  });
}
function ap127FitY(chart){
  try{
    const xMin=chart.scales.x.min,xMax=chart.scales.x.max;
    let yMin=Infinity,yMax=-Infinity;
    chart.data.datasets.forEach(ds=>{
      if(ds.label==='Today'||ds.label==='Total')return;
      (ds.data||[]).forEach(pt=>{
        const t=pt.x instanceof Date?pt.x.getTime():(typeof pt.x==='number'?pt.x:new Date(pt.x).getTime());
        if(t>=xMin&&t<=xMax){if(pt.y<yMin)yMin=pt.y;if(pt.y>yMax)yMax=pt.y;}
      });
    });
    if(!isFinite(yMin)||!isFinite(yMax))return;
    const pad=Math.max((yMax-yMin)*0.06,1);
    chart.options.scales.y.min=Math.max(0,yMin-pad);
    chart.options.scales.y.max=yMax+pad;
    chart.update('none');
  }catch(e){}
}

// ── Pace Band v2 — distribution histogram + smoothed curve, replaces the old 3-band text list ──
function buildAP127PaceBand(all,asOf){
  if(!all.length)return;
  const doneVals=all.map(s=>s.done||0);
  const min=Math.min(...doneVals),max=Math.max(...doneVals);
  const span=Math.max(max-min,1);
  const binCount=Math.min(9,Math.max(4,new Set(doneVals).size));
  const binW=Math.max(1,Math.ceil(span/binCount));
  const bins=[];
  for(let lo=min;lo<=max;lo+=binW){bins.push({lo,hi:Math.min(lo+binW-1,max),students:[]});}
  if(!bins.length)bins.push({lo:min,hi:max,students:[]});
  all.forEach(s=>{const d=s.done||0;let b=bins.find(bb=>d>=bb.lo&&d<=bb.hi);if(!b)b=bins[bins.length-1];b.students.push(s);});
  const labels=bins.map(b=>b.lo===b.hi?`${b.lo}`:`${b.lo}–${b.hi}`);
  const counts=bins.map(b=>b.students.length);
  const curve=counts.map((v,i)=>{
    const prev=counts[i-1]??v, next=counts[i+1]??v;
    return +((prev+v*2+next)/4).toFixed(2);
  });
  const avgDone=doneVals.reduce((a,v)=>a+v,0)/doneVals.length;
  // avgDone is a MEAN, almost always fractional (e.g. 32.96) — bins are integer-bounded, so a
  // `<=hi` test leaves a gap no fractional value between hi and the next lo can ever land in
  // (32.96 matches neither [31,32] nor [33,34]), silently falling through to the bins.length-1
  // fallback below and drawing the line at the far end of the chart regardless of the real average.
  // Bin i actually covers the continuous range [lo, hi+1) once you account for "hi" being an
  // inclusive integer count, so match against that instead.
  let avgBinIdx=bins.findIndex(b=>avgDone>=b.lo&&avgDone<b.hi+1);
  if(avgBinIdx<0)avgBinIdx=avgDone<bins[0].lo?0:bins.length-1;
  // Fractional position of avgDone WITHIN its bin's range — findIndex alone only tells us which
  // bin, and getPixelForValue(index) on a category axis always lands on that bin's dead center, so
  // the line used to visually snap to the middle of the bin regardless of where in the bin's actual
  // [lo,hi] range the average really fell. Interpolate using the pixel width of one category step.
  const avgBin=bins[avgBinIdx];
  const avgFrac=Math.min(1,Math.max(0,(avgDone-avgBin.lo)/Math.max(1,(avgBin.hi-avgBin.lo+1))));
  const maxCount=Math.max(...counts,1);
  const barColors=bins.map(b=>{
    const mid=(b.lo+b.hi)/2;
    const frac=(mid-min)/span;
    return frac>=0.66?"#7be9b8":frac>=0.33?"#ffd67a":"#ffa0a0";
  });
  const avgLinePlugin={
    id:"d127v4AvgLine",
    afterDatasetsDraw(chart){
      const{ctx,scales:{x,y}}=chart;
      const catW=bins.length>1?(x.getPixelForValue(1)-x.getPixelForValue(0)):(x.right-x.left);
      const px=x.getPixelForValue(avgBinIdx)-catW/2+avgFrac*catW;
      ctx.save();ctx.strokeStyle="#e88aff";ctx.lineWidth=1.6;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.moveTo(px,y.top);ctx.lineTo(px,y.bottom);ctx.stroke();
      ctx.setLineDash([]);ctx.fillStyle="#e88aff";ctx.font="700 8px JetBrains Mono, monospace";ctx.textAlign="center";
      ctx.fillText(`AVG ${avgDone.toFixed(1)}`,px,Math.max(y.top-4,8));
      ctx.restore();
    }
  };
  CHARTS.ap127band=mkC("d127v4-band-chart",{
    type:"bar",
    data:{labels,datasets:[
      {type:"bar",label:"Students",data:counts,backgroundColor:barColors,borderRadius:3,order:2,barPercentage:.7},
      {type:"line",label:"Distribution curve",data:curve,borderColor:"#38bdf8",borderWidth:2,pointRadius:0,tension:.4,fill:false,order:1},
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,layout:{padding:{top:14}},
      plugins:{
        legend:{display:false},
        datalabels:{display:ctx=>ctx.dataset.type==="bar"&&ctx.dataset.data[ctx.dataIndex]>0,anchor:"end",align:"top",color:"#8b949e",font:{family:"JetBrains Mono",size:9}},
        tooltip:{callbacks:{
          title:ctx=>`${ctx[0].label} lessons done`,
          label:ctx=>{
            if(ctx.dataset.type!=="bar")return null;
            const bin=bins[ctx.dataIndex];
            if(!bin||!bin.students.length)return "0 students";
            return [`${bin.students.length} student${bin.students.length===1?"":"s"}:`,...bin.students.map(s=>ap127ShortName(s.name))];
          },
        }}
      },
      scales:{
        x:{ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681"},grid:{display:false}},
        y:{beginAtZero:true,ticks:{stepSize:1,font:{family:"JetBrains Mono",size:9},color:"#8b949e"},grid:{color:"#21262d"},max:maxCount+1}
      }
    },
    plugins:[avgLinePlugin]
  });
}

// ── Daily Output bar + moving average — Day/Week/Month, Lessons/Hours ──
let AP127V4_LB_UNIT="hours";
let AP127V4_LB_PERIOD="day";
let AP127V4_LB_SHOWALL=true; // include off-periods (zero flights) by default — toggle to hide them
function setLBUnit(u){AP127V4_LB_UNIT=u;document.querySelectorAll(".lb-unit").forEach(b=>b.classList.toggle("sel",b.dataset.u===u));buildAP127LessonBar();}
function setLBPeriod(p){AP127V4_LB_PERIOD=p;document.querySelectorAll(".lb-period").forEach(b=>b.classList.toggle("sel",b.dataset.p===p));buildAP127LessonBar();}
function setLBShowAll(){
  AP127V4_LB_SHOWALL=!AP127V4_LB_SHOWALL;
  document.querySelectorAll(".lb-showall").forEach(b=>b.classList.toggle("sel",!AP127V4_LB_SHOWALL));
  buildAP127LessonBar();
}
function ap127v4WeekStart(ds){const d=new Date(ds+"T00:00:00Z");const dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);return d.toISOString().slice(0,10);}
function ap127v4PeriodKey(ds,period){
  if(period==="day")return ds;
  if(period==="week")return ap127v4WeekStart(ds);
  return ds.slice(0,7)+"-01";
}
function ap127v4PeriodRange(start,end,period){
  if(period==="day")return ap127AllDatesRange(start,end);
  const out=[];
  let guard=0;
  if(period==="week"){
    let d=new Date(ap127v4WeekStart(start)+"T00:00:00Z");
    const endD=new Date(ap127v4WeekStart(end)+"T00:00:00Z");
    while(d<=endD&&guard<520){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+7);guard++;}
    return out;
  }
  let d=new Date(start.slice(0,7)+"-01T00:00:00Z");
  const endD=new Date(end.slice(0,7)+"-01T00:00:00Z");
  while(d<=endD&&guard<240){out.push(d.toISOString().slice(0,7)+"-01");d.setUTCMonth(d.getUTCMonth()+1);guard++;}
  return out;
}
function buildAP127LessonBar(){
  const all=ap127AsOfStudents();if(!all.length)return;
  const today=ap127AsOf();
  const cur=G.cur127||[];
  const lessonsMap={};cur.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const isHrs=AP127V4_LB_UNIT==="hours";
  const period=AP127V4_LB_PERIOD;
  const byPeriod={};
  let firstDate=null;
  all.forEach(s=>(s.flown||[]).forEach(f=>{
    if(!f.date||f.date>today)return;
    if(firstDate===null||f.date<firstDate)firstDate=f.date;
    const key=ap127v4PeriodKey(f.date,period);
    const v=isHrs?(lessonsMap[f.lesson]||ap127FlightMins(f)||0)/60:1;
    byPeriod[key]=(byPeriod[key]||0)+v;
  }));
  if(firstDate===null)return;
  const allKeys=ap127v4PeriodRange(firstDate,today,period);
  const keys=AP127V4_LB_SHOWALL?allKeys:allKeys.filter(k=>byPeriod[k]>0);
  if(!keys.length)return;
  const values=keys.map(k=>+((byPeriod[k]||0).toFixed(2)));
  const maWindow=period==="day"?7:period==="week"?4:3;
  const ma=values.map((_,i)=>{
    const lo=Math.max(0,i-maWindow+1);
    const slice=values.slice(lo,i+1);
    return +(slice.reduce((a,v)=>a+v,0)/slice.length).toFixed(2);
  });
  const fmtLbl=k=>period==="month"?new Date(k+"T00:00:00").toLocaleDateString("en-GB",{month:"short",year:"2-digit"}):ap127ShortDate(k);
  const labels=keys.map(fmtLbl);
  const showLabels=keys.length<=45;
  CHARTS.ap127lessonBar=mkC("d127v4-lessonbar",{
    type:"bar",
    data:{labels,datasets:[
      {type:"bar",label:isHrs?"Hours":"Lessons",data:values,backgroundColor:"rgba(232,138,255,0.55)",borderRadius:2,order:2},
      {type:"line",label:`${maWindow}-period moving avg`,data:ma,borderColor:"#38bdf8",borderWidth:2,pointRadius:0,tension:.25,order:1},
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:true,labels:{color:"#8b949e",font:{family:"JetBrains Mono",size:9},boxWidth:14}},
        datalabels:{
          display:ctx=>showLabels&&ctx.dataset.type==="bar"&&ctx.dataset.data[ctx.dataIndex]>0,
          anchor:"end",align:"top",color:"#8b949e",font:{family:"JetBrains Mono",size:7},
          formatter:v=>isHrs?v.toFixed(1):v
        },
        tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${isHrs?ctx.parsed.y.toFixed(1)+"h":ctx.parsed.y}`}}
      },
      scales:{
        x:{ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681",maxRotation:0,autoSkip:true,maxTicksLimit:16},grid:{display:false}},
        y:{beginAtZero:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",callback:v=>isHrs?v.toFixed(0)+"h":v},grid:{color:"#21262d"}}
      }
    }
  });
}

// ── Phase Progress Funnel — batch-wide done vs remaining slots per curriculum phase ──
function buildAP127Funnel(all){
  if(!all.length)return;
  const cur=G.cur127||[];
  const n=all.length;
  const inPhase=(code,p)=>{const num=ap127LessonNum(code);return num!=null&&num>=p.lo&&num<=p.hi;};
  const phaseSlots=AP127_SYLLABUS_PHASES.map(p=>({...p,total:cur.filter(c=>inPhase(c.lesson,p)).length}));
  const labels=phaseSlots.map(p=>p.label);
  const doneData=phaseSlots.map(p=>{
    let done=0;
    all.forEach(s=>{done+=(s.flown||[]).filter(f=>inPhase(f.lesson,p)).length;});
    return done;
  });
  const totalSlots=phaseSlots.map(p=>p.total*n);
  const remData=totalSlots.map((t,i)=>Math.max(0,t-doneData[i]));
  CHARTS.ap127funnel=mkC("d127v4-funnel",{
    type:"bar",
    data:{labels,datasets:[
      {label:"Done",data:doneData,backgroundColor:phaseSlots.map(p=>p.c),stack:"f"},
      {label:"Remaining",data:remData,backgroundColor:"rgba(255,255,255,0.07)",stack:"f"},
    ]},
    options:{
      indexAxis:"y",responsive:true,maintainAspectRatio:false,
      plugins:{
        datalabels:{
          display:ctx=>ctx.dataset.label==="Done"&&ctx.dataset.data[ctx.dataIndex]>0,
          color:"#0d1117",font:{family:"JetBrains Mono",size:9,weight:"700"},anchor:"center",align:"center",
          formatter:(v,ctx)=>{const t=totalSlots[ctx.dataIndex];return t?Math.round(v/t*100)+"%":"";}
        },
        legend:{display:true,labels:{color:"#8b949e",font:{family:"JetBrains Mono",size:9},boxWidth:10}},
        tooltip:{callbacks:{label:ctx=>{const t=totalSlots[ctx.dataIndex];return `${ctx.dataset.label}: ${ctx.raw} / ${t} slots`;}}}
      },
      scales:{
        x:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:8},color:"#8b949e"},grid:{color:"#21262d"}},
        y:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:9},color:"#8b949e"},grid:{display:false}}
      }
    }
  });
}

// ── Needs Attention watchlist ──
function buildAP127Watchlist(all,today){
  const el=document.getElementById("d127v4-watchlist");if(!el)return;
  const items=all.map(s=>{const hrs=ap127Hours(s);return{s,idle:ap127IdleDays(s,today),hrsDelta:hrs-ap127PlannedHoursAsOf(today)};})
    .filter(x=>x.idle>=5||x.hrsDelta<=-3)
    .sort((a,b)=>b.idle-a.idle||a.hrsDelta-b.hrsDelta)
    .slice(0,10);
  if(!items.length){el.innerHTML=`<div class="d127v4-watch-empty">No students idle &gt;5d or significantly behind. 🎉</div>`;return;}
  el.innerHTML=items.map(x=>{
    const idx=AP127_VIEW_ROWS.findIndex(r=>r.catc_id===x.s.catc_id);
    const badgeColor=x.idle>=10?"#ef4444":x.idle>=5?"#fbbf24":"var(--tx3)";
    return `<div class="d127v4-watch-item" onclick="openAP127DrawerV4(${idx})">
      <span class="d127v4-watch-name">${ap127ShortName(x.s.name)}</span>
      <span class="d127v4-watch-badge" style="background:${badgeColor}22;color:${badgeColor}">${x.idle===9999?"never flown":x.idle+"d idle"}</span>
      <span class="d127v4-watch-sub" style="color:${x.hrsDelta<0?'#ff6b6b':'var(--done)'}">${x.hrsDelta>=0?"+":""}${x.hrsDelta.toFixed(1)}h</span>
    </div>`;
  }).join("");
}

// ── AP127 Roster — day-by-day phase heatmap + all-time totals grouped by instructor ──
function buildAP127Roster(){
  if(!G||!G.ap127)return;
  const all=ap127AsOfStudents();if(!all.length)return;
  const today=ap127AsOf();
  // Same "planned/standard mins first, actual as fallback" convention as ap127Hours() (the KPI
  // card / Progress Ranking table's own helper) — kept consistent with every other hours figure
  // in this tab. See the note on ap127Hours() below for why this one formula is now used everywhere.
  const lessonsMap={};(G.cur127||[]).forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const hrsOf=f=>(lessonsMap[f.lesson]||ap127FlightMins(f)||0)/60;
  const rangeEl=document.getElementById("d127v4-roster-range");
  const rangeVal=rangeEl?parseInt(rangeEl.value||"30"):30;
  const batchStart=all.flatMap(s=>(s.flown||[]).map(f=>f.date).filter(Boolean)).sort()[0]||today;
  const start=rangeVal===0?batchStart:(()=>{const d=new Date(today+"T00:00:00");d.setDate(d.getDate()-rangeVal);return d.toISOString().slice(0,10);})();
  const rangeLabel=rangeVal===0?`All time · since ${ap127ShortDate(batchStart)}`:`Last ${rangeVal}d`;
  const heading=document.getElementById("d127v4-fi-heading");
  if(heading)heading.textContent=`By Instructor · ${rangeLabel}`;
  const days=ap127AllDatesRange(start,today);
  const sorted=[...all].sort((a,b)=>a.name.localeCompare(b.name));

  const CELL_W=Math.max(7,Math.min(15,Math.floor(760/Math.max(days.length,1))));
  let heatHtml=`<table class="d127v4-heat-table"><thead><tr><th class="d127v4-heat-name">Name</th><th class="d127v4-heat-total">Total</th>`;
  let lastMonth=null;
  days.forEach((d,i)=>{
    const dObj=new Date(d+"T12:00:00Z");
    const isMon=dObj.getUTCDay()===1;
    const show=i===0||isMon||CELL_W>=14;
    const month=dObj.getUTCMonth();
    const newMonth=month!==lastMonth;
    if(show)lastMonth=month;
    const lbl=show?(newMonth?dObj.toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"}):String(dObj.getUTCDate())):"";
    const todayCol=d===today?" d127v4-heat-today-col":"";
    heatHtml+=`<th class="${todayCol}" style="width:${CELL_W}px;min-width:${CELL_W}px;padding:0" title="${d===today?"Today · "+ap127FmtDate(d):""}">${lbl?`<div class="d127v4-heat-daylbl">${lbl}</div>`:""}</th>`;
  });
  heatHtml+=`</tr></thead><tbody>`;
  sorted.forEach(s=>{
    const inRange=(s.flown||[]).filter(f=>f.date&&f.date>=start&&f.date<=today);
    const totalHrs=inRange.reduce((a,f)=>a+hrsOf(f),0);
    const viewIdx=AP127_VIEW_ROWS.findIndex(r=>r.catc_id===s.catc_id);
    heatHtml+=`<tr><td class="d127v4-heat-name"><b>${ap127ShortName(s.name)}</b></td><td class="d127v4-heat-total">${inRange.length}L · ${totalHrs.toFixed(1)}h</td>`;
    days.forEach(d=>{
      const dayFlights=(s.flown||[]).filter(f=>f.date===d);
      const isToday=d===today;
      let bg="var(--s3)",title=`${ap127ShortName(s.name)} · ${ap127FmtDate(d)}: no flight`;
      if(dayFlights.length){
        const ph=ap127SyllabusPhase(dayFlights[0].lesson);
        bg=ph.c;
        const detail=dayFlights.map(f=>`${f.lesson} (${hm(ap127FlightMins(f))||"—"})`).join(", ");
        title=`${ap127ShortName(s.name)} · ${ap127FmtDate(d)} · ${detail}${viewIdx>=0?" · click for detail":""}`;
      }
      const clickable=dayFlights.length&&viewIdx>=0;
      const cls="d127v4-heat-cell"+(isToday?" d127v4-heat-today":"");
      heatHtml+=`<td style="padding:1px"><div class="${cls}" style="background:${bg};${clickable?"cursor:pointer":""}" title="${escHtml(title)}" ${clickable?`onclick="openAP127DrawerV4(${viewIdx})"`:""}></div></td>`;
    });
    heatHtml+=`</tr>`;
  });
  heatHtml+=`</tbody></table>`;
  const heatEl=document.getElementById("d127v4-heat");
  if(heatEl)heatEl.innerHTML=`<div class="d127v4-heat-wrap">${heatHtml}</div>`;

  const rangeFlown=s=>(s.flown||[]).filter(f=>f.date&&f.date>=start&&f.date<=today);
  const rangeHours=s=>rangeFlown(s).reduce((a,f)=>a+hrsOf(f),0);
  const byFI={};
  all.forEach(s=>{
    const fi=AP127_FI_FULL[s.fi]||s.fi||"Unassigned";
    (byFI[fi]=byFI[fi]||[]).push(s);
  });
  const fiKeys=Object.keys(byFI).sort((a,b)=>byFI[b].length-byFI[a].length||a.localeCompare(b));
  const fiEl=document.getElementById("d127v4-fi-roster");
  if(fiEl)fiEl.innerHTML=fiKeys.map(fi=>{
    const students=byFI[fi].slice().sort((a,b)=>rangeFlown(b).length-rangeFlown(a).length);
    const totalHrs=students.reduce((a,s)=>a+rangeHours(s),0);
    const totalLes=students.reduce((a,s)=>a+rangeFlown(s).length,0);
    return `<div class="d127v4-fi-group">
      <div class="d127v4-fi-hdr"><span>${fi}</span><span style="color:var(--tx3);font-weight:400">${students.length} SP · ${totalLes} les · ${totalHrs.toFixed(1)}h</span></div>
      ${students.map(s=>{
        const last=rangeFlown(s).at(-1);
        return `<div class="d127v4-fi-row">
          <b>${ap127ShortName(s.name)}</b>
          <span class="d127-mono" style="color:var(--tx3);width:44px;text-align:right;flex-shrink:0">${rangeFlown(s).length}L</span>
          <span class="d127-mono" style="color:var(--tx3);width:44px;text-align:right;flex-shrink:0">${rangeHours(s).toFixed(1)}h</span>
          <span class="d127-mono" style="color:var(--tx3);width:56px;text-align:right;flex-shrink:0">${last?ap127ShortDate(last.date):"-"}</span>
        </div>`;
      }).join("")}
    </div>`;
  }).join("");
}

function setCohortAsOf(ds){
  COHORT_AS_OF=ds||null;
  renderAP127Detail();
}
function updateScrubber(){
  if(!G?.ap127)return;
  const bs=_scrBatchStart(),rt=ap127TodayBKK();
  const msS=new Date(bs+'T00:00:00').getTime(),msE=new Date(rt+'T00:00:00').getTime(),span=msE-msS||1;
  const frac=COHORT_AS_OF?Math.max(0,Math.min(0.99,(new Date(COHORT_AS_OF+'T00:00:00').getTime()-msS)/span)):1;
  _scrSetThumb(frac);
  const ticks=document.getElementById('tt-ticks-v4');
  if(ticks){
    ticks.innerHTML='';
    let d=new Date(bs+'T00:00:00');d.setDate(1);d.setMonth(d.getMonth()+1);
    while(d.getTime()<=msE){
      const f=(d.getTime()-msS)/span;
      const t=document.createElement('span');
      t.style.cssText=`position:absolute;left:${f*100}%;transform:translateX(-50%);font-family:'JetBrains Mono',monospace;font-size:9px;color:#6e7681;top:14px;pointer-events:none;white-space:nowrap`;
      t.textContent=d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
      ticks.appendChild(t);
      d.setMonth(d.getMonth()+1);
    }
  }
  const banner=document.getElementById('tt-banner-v4');
  const bdate=document.getElementById('tt-banner-date-v4');
  if(banner){banner.style.display=COHORT_AS_OF?'flex':'none';}
  if(bdate&&COHORT_AS_OF)bdate.textContent=ap127FmtDate(COHORT_AS_OF);
  const dateInput=document.getElementById('tt-date-input-v4');
  if(dateInput){dateInput.min=bs;dateInput.max=rt;dateInput.value=COHORT_AS_OF||rt;}
  const sub=document.getElementById('d127v4-subtitle');
  if(sub)sub.textContent=COHORT_AS_OF?`Viewing data as of ${ap127FmtDate(COHORT_AS_OF)} — live data paused`:'Progress retrieved from CATC FTC records and master plan — redesigned view';
  const liveBtn=document.getElementById('tt-live-btn-v4');
  if(liveBtn){liveBtn.style.background=COHORT_AS_OF?'var(--s2)':'#1a2f1a';liveBtn.style.borderColor=COHORT_AS_OF?'var(--bd)':'#4ade80';liveBtn.style.color=COHORT_AS_OF?'var(--tx3)':'#4ade80';}
}
function initScrubber(){
  const track=document.getElementById('tt-track-v4');
  if(!track||track._init)return;
  track._init=true;
  let drag=false;
  const px=e=>{const r=track.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));};
  const move=f=>{
    _scrSetThumb(f);
    clearTimeout(_scrDebounce);
    _scrDebounce=setTimeout(()=>setCohortAsOf(f>=0.99?null:_scrDateFromFrac(f)),150);
  };
  track.addEventListener('pointerdown',e=>{drag=true;track.setPointerCapture(e.pointerId);move(px(e));});
  track.addEventListener('pointermove',e=>{if(drag)move(px(e));});
  track.addEventListener('pointerup',()=>{drag=false;});
}

function mountProgress(data){ G = data; initScrubber(); renderAP127Detail(); }
function destroyProgress(){ try { Object.values(CHARTS).forEach(c => { try { c && c.destroy(); } catch(e){} }); } catch(e){} }

function opsAugment(students, curriculum) {
  const R = window.AP127Reconcile;
  const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
  if (!R || !Array.isArray(students)) return { students, syncCount: 0, opsAt: null };
  const comp = {}, sched = {};
  flights.forEach(f => {
    if (!f.student || !f.lesson || !R.isAP127(f.batch)) return;
    const k = R.ccNameNorm(f.student), nl = R.normLesson(f.lesson);
    if (f.status === 'Completed' && f.date) { (comp[k] = comp[k] || {})[nl] = f; }
    else if (f.status !== 'Canceled' && f.date) { const m = (sched[k] = sched[k] || {}); if (!m[nl] || f.date < m[nl]) m[nl] = f.date; }
  });
  const curNorm = new Set((curriculum || []).map(c => R.normLesson(c.lesson)));
  let syncCount = 0;
  const out = students.map(s => {
    const key = R.ccKeyFromFull(s.name);
    const flownNorm = new Set((s.flown || []).map(f => R.normLesson(f.lesson)));
    const extra = [];
    Object.keys(comp[key] || {}).forEach(nl => {
      if (!flownNorm.has(nl) && curNorm.has(nl)) { const f = comp[key][nl]; extra.push({ lesson: f.lesson, actual_mins: f.durMin || f.actual_mins || 0, actual_ft: f.duration || '', date: f.date, _ops: true }); }
    });
    const flown = (extra.length ? [...(s.flown || []), ...extra] : (s.flown || [])).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (extra.length) syncCount++;
    const total = s.total || (curriculum || []).length;
    const done = flown.length;
    const flownSet = new Set(flown.map(f => R.normLesson(f.lesson)));
    const nx = (curriculum || []).find(c => !flownSet.has(R.normLesson(c.lesson)));
    const m = sched[key] || {};
    const planned = (s.planned || []).map(p => ({ ...p, date: m[R.normLesson(p.lesson)] || 'TBC' }));
    return { ...s, flown, done, total, remaining: Math.max(0, total - done), pct: total ? +(done / total * 100).toFixed(1) : 0, next_lesson: nx ? nx.lesson : 'COMPLETE', planned };
  });
  return { students: out, syncCount, opsAt: (window.FLIGHT_DATA && window.FLIGHT_DATA.fetchedAt) || null };
}

  const { useRef, useEffect } = React;
  function CohortViewV4() {
    const d = window.useData();
    const ref = useRef(null);
    useEffect(() => {
      if (!ref.current) return;
      ref.current.innerHTML = MARKUP;
      const aug = opsAugment(d.students, d.curriculum);
      mountProgress({ ap127: aug.students, cur127: d.curriculum, _updated: d.progressMeta && d.progressMeta.updated, _opsSync: aug.syncCount, _opsAt: aug.opsAt });
      return () => destroyProgress();
    }, [d.students, d.curriculum]);
    return React.createElement('div', { className: 'ap127-progress', ref, style: { height: '100%', overflow: 'auto', padding: 14 } });
  }
  window.CohortViewV4 = CohortViewV4;

  Object.assign(window, {
    renderAP127DetailV4: renderAP127Detail,
    renderAP127PaceV4: renderAP127Pace,
    ap127ResetSortV4: ap127ResetSort,
    ap127HeaderClickV4: ap127HeaderClick,
    setCPVFilterV4: setCPVFilter,
    setCPVModeV4: setCPVMode,
    cpvResetZoomV4: cpvResetZoom,
    openAP127DrawerV4: openAP127Drawer,
    closeAP127DrawerV4: closeAP127Drawer,
    setAP127RaceModeV4: setAP127RaceMode,
    setHistBatchModeV4: setHistBatchMode,
    buildAP127HistBatchV4: buildAP127HistBatch,
    buildAP127HistSoloV4: buildAP127HistSolo,
    setCohortAsOfV4: setCohortAsOf,
    ap127AsOfV4: ap127AsOf,
    setLBUnitV4: setLBUnit,
    setLBPeriodV4: setLBPeriod,
    setLBShowAllV4: setLBShowAll,
    buildAP127RosterV4: buildAP127Roster,
    CHARTS_V4: CHARTS,
  });
})();
