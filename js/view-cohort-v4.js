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
      <div class="d127v4-hours-badge" title="Every &quot;hours&quot; figure on this tab (KPI card, Pace Monitor, Progress Ranking, Combined Progress vs Plan, Batch Lagging History, Individual Lead/Lag vs Plan, Actual vs Planned, Daily Output, Roster) uses each lesson's STANDARD/PLANNED duration from the curriculum — not the flight's actual logged clock time. A flight only falls back to its actual logged duration if its lesson code isn't found in the curriculum at all (rare). This keeps &quot;hours done&quot; directly comparable to &quot;hours planned,&quot; since both are built from the same standard durations, at the cost of not reflecting real day-to-day block-time variance (weather holds, extra circuits, etc).">
        <span class="d127v4-hours-badge-dot"></span>HOURS = EFFECTIVE <span class="d127v4-hours-badge-sub">(standard duration per lesson, not actual logged time)</span>
      </div>
      <button class="d127-reset" id="d127v4-export-btn" style="margin-top:8px;margin-left:8px;vertical-align:top" title="Export this tab's current data as a PDF report — builds a document in memory, does not change anything on screen" onclick="ap127ExportPDFV4()">⬇ Export PDF</button>
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
        <input id="d127v4-q" placeholder="Search name..." oninput="ap127RowsDebounced()" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:5px;padding:6px 9px;font-size:12px;outline:none;flex:1;min-width:180px">
        <select id="d127v4-sort" onchange="renderAP127RowsV4()" style="background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:5px;padding:6px 9px;font-size:11px">
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
      </div>
      <div class="d127-body" id="d127v4-pace-body"></div>
    </div>
    <div class="d127v4-split-grid" id="d127v4-split-grid">
      <div class="d127-panel">
        <div class="d127-h"><span class="d127-t">Progress Ranking</span><span style="display:flex;align-items:center;gap:8px"><button class="d127-reset" id="d127v4-reset" title="Reset sort to default" onclick="ap127ResetSortV4()">⟳ Reset</button><span class="d127-s" id="d127v4-asof">As of -</span></span></div>
        <div class="d127-table-wrap">
          <table class="d127-table">
            <thead><tr>
              <th title="Position in the current sort order. Badge color = performance tier (lessons done, whole-cohort tercile) — independent of which column you're sorted by.">Rank</th>
              <th data-key="name" title="Sort by name">Name</th>
              <th data-key="nick" title="Sort by call sign">CALL<br>SIGN</th>
              <th data-key="se" title="Sort by single-engine type">SE<br>TYPE</th>
              <th data-key="fi" title="Sort by Flight Instructor">FI</th>
              <th data-key="ahead" title="Sort by progress (most ahead first)">Progress</th>
              <th data-key="hours" title="Sort by hours done (most first). Effective hours — standard duration per lesson, not actual logged time.">HRS<br>DONE</th>
              <th data-key="donelessons" title="Sort by lessons done (most first)">LESSON<br>DONE</th>
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
      <div class="d127v4-split-handle" id="d127v4-split-handle" title="Drag to resize"></div>
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
        <span class="d127-t">Batch Lagging History</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="cpv-btn hist-batch-mode-v4 sel" data-m="hours"   onclick="setHistBatchModeV4('hours')">Hours</button>
          <button class="cpv-btn hist-batch-mode-v4"     data-m="lessons" onclick="setHistBatchModeV4('lessons')">Lessons</button>
        </div>
      </div>
      <div class="d127-body">
        <div class="d127-note">Batch-wide cumulative lag behind curriculum schedule (planned − actual, floored at zero) over time. Flat at zero = on plan or ahead; the higher the line, the further behind.</div>
        <div class="cpv-kpis" id="hist-batch-kpis-v4"></div>
        <div style="position:relative;height:220px"><canvas id="d127v4-hist-batch"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h" style="flex-wrap:wrap;gap:6px">
        <span class="d127-t">Daily Output · Lessons &amp; Hours<button class="d127-info-btn" title="Click for an explanation of this chart" onclick="ap127ToggleLBInfoV4()">ⓘ</button></span>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
          <button class="cpv-btn lb-unit sel" data-u="hours" onclick="setLBUnitV4('hours')">Hours</button>
          <button class="cpv-btn lb-unit" data-u="lessons" onclick="setLBUnitV4('lessons')">Lessons</button>
          <span style="width:1px;height:14px;background:var(--bd);display:inline-block;margin:0 2px"></span>
          <button class="cpv-btn lb-period sel" data-p="day" onclick="setLBPeriodV4('day')">Day</button>
          <button class="cpv-btn lb-period" data-p="week" onclick="setLBPeriodV4('week')">Week</button>
          <button class="cpv-btn lb-period" data-p="month" onclick="setLBPeriodV4('month')">Month</button>
          <span style="width:1px;height:14px;background:var(--bd);display:inline-block;margin:0 2px"></span>
          <button class="cpv-btn lb-showall" onclick="setLBShowAllV4()" title="Toggle whether periods with zero flights are shown">Hide off days</button>
          <button class="cpv-btn lb-breakdown" onclick="ap127ToggleLBBreakdownV4()" title="Split each bar into Dual / Solo / Simulator lessons">By Type</button>
          <span style="width:1px;height:14px;background:var(--bd);display:inline-block;margin:0 2px"></span>
          <input type="date" id="d127v4-lb-start" class="d127-wsel" style="padding:5px 6px" title="Range start (blank = earliest flight)" onchange="ap127SetLBRangeV4('start',this.value)">
          <span style="color:var(--tx3);font-size:10px">–</span>
          <input type="date" id="d127v4-lb-end" class="d127-wsel" style="padding:5px 6px" title="Range end (blank = today)" onchange="ap127SetLBRangeV4('end',this.value)">
          <button class="d127-reset" title="Reset to full range" onclick="ap127ResetLBRangeV4()">⟳ Full range</button>
        </div>
      </div>
      <div class="d127-body">
        <div class="d127-note" id="d127v4-lb-note" style="display:none">Bars = batch total per period, including days with no flights by default (toggle to hide them), full history by default (set a custom range above). Blue moving-average line = 7d / 4wk / 3mo. The still-forming current period (marked ◐) is drawn with a dashed outline, capped by a hollow "~" bar projecting where it might land based on data so far — it's excluded from the target comparison since a partial period isn't a fair fight against a full-period target. Instead, the rose/blue lines + gap bracket compare the latest fully-CLOSED period's own actual against today's required pace (same formula as the Pace Monitor's "Per Day/Week/Month" tables above). Faint vertical lines mark each week (Day view) or month (Week view). "By Type" splits each bar into Dual / Solo / Simulator lessons. Hover for exact values.</div>
        <div class="d127v4-lb-kpis" id="d127v4-lb-kpis"></div>
        <div class="d127-phase-legend" id="d127v4-lb-legend" style="display:none"></div>
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
        <div class="d127-note">Shares color &amp; student filter with Actual vs Planned above — click a name there to isolate here too. Thick magenta = batch average. Every SP's streak is walked from the BATCH's earliest-ever flown date, not their own start — a late-starting SP shows as "idle" for every day before they personally began, so a deep-negative average early in the chart usually reflects staggered enrollment, not the whole batch stalling.</div>
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
      <div class="d127-h">
        <span class="d127-t">Overall Progress Bar View</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="d127-s">x-axis = lesson number · stacked by syllabus phase</span>
          <span class="d127v4-zoom-ctl">
            <button class="d127-reset" title="Zoom out" onclick="ap127OverallZoomV4(0.8)">−</button>
            <button class="d127-reset" title="Zoom in" onclick="ap127OverallZoomV4(1.25)">+</button>
            <button class="d127-reset" title="Reset zoom/pan" onclick="ap127OverallResetZoomV4()">⟳ Reset View</button>
          </span>
        </span>
      </div>
      <div class="d127-body">
        <div class="d127-note">The SYLLABUS strip above the chart is the full 96-lesson curriculum and zooms together with the chart — click a segment for full phase detail, click a milestone icon to see what it means. Every SP bar below is split into segments per official curriculum phase (same colors as Flight Timeline and the Roster), lined up against the same lesson-number axis; text at bar end = current/next lesson. Use the +/− buttons (or pinch, or Ctrl/⌘+scroll) to zoom, drag to pan, drag the bottom-right corner to resize.</div>
        <div class="d127-phase-legend" id="d127v4-overall-legend"></div>
        <div id="d127v4-syllabus-strip"></div>
        <div class="d127v4-overall-wrap" id="d127v4-overall-wrap"><canvas id="d127v4-overall"></canvas></div>
      </div>
    </div>
    <div class="d127-panel">
      <div class="d127-h"><span class="d127-t">Lesson Completion Matrix</span><span class="d127-s" id="d127v4-lm-sub">-</span></div>
      <div class="d127-body">
        <div class="d127-note">Every SP × every curriculum lesson, at a glance — colored cells are completed lessons (click one for detail), the amber ring marks each SP's next lesson, a small dot marks a retaken lesson. Rose-flagged columns are AP127 Target checkpoints; the <b>vs Target</b> column is each SP's lead/lag (lessons) against the single closest checkpoint. The bottom row shows what share of the batch has completed each lesson — a quick way to spot bottleneck lessons.</div>
        <div class="d127-phase-legend" id="d127v4-lm-legend"></div>
        <div id="d127v4-lesson-matrix"></div>
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
<div class="d127-draw-ov" id="d127v4-syl-modal-ov" onclick="closeAP127SyllabusModalV4()">
  <div class="d127-draw d127v4-syl-modal" onclick="event.stopPropagation()">
    <div class="d127-dh">
      <div><div class="d127-dn" id="d127v4-syl-modal-title">-</div><div class="d127-dm" id="d127v4-syl-modal-sub">-</div></div>
      <button class="d127-close" onclick="closeAP127SyllabusModalV4()">Close</button>
    </div>
    <div class="d127v4-syl-modal-body" id="d127v4-syl-modal-body"></div>
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
// Animations default OFF for every chart on this tab (unless a caller explicitly opts in) — with
// 10+ Chart.js instances rebuilt together on any real data refresh, letting each animate its
// entrance independently is a visible, unnecessary source of jank; a single central default here
// covers every mkC() call site instead of needing per-chart edits.
function mkC(id,cfg){const ctx=document.getElementById(id);if(!ctx)return null;const ex=Chart.getChart(ctx);if(ex)ex.destroy();cfg.options=cfg.options||{};if(cfg.options.animation===undefined)cfg.options.animation=false;return new Chart(ctx,cfg);}

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
// Hour totals (hrs) are each phase's own sum of standard lesson durations from the authoritative
// syllabus (ap127-flight-training.pages.dev/data/syllabus.json), not a share of the 180h total —
// verified they add up to exactly 180h (14+25+45+96).
// objective/standard text is trimmed verbatim from the authoritative syllabus.json's per-phase
// "objective" and "completionStandard" fields — used by the SYLLABUS strip's click-to-detail modal.
const AP127_SYLLABUS_PHASES=[
  {n:1,label:"Phase I",  title:"Basic Flight Training",           lo:1, hi:13,c:"#38bdf8",hrs:14,
   blurb:"First air experience through first solo — basic handling, circuits, emergency procedures.",
   objective:"Provide the trainee with the fundamental flight skills and essential airmanship required to safely conduct a first solo flight. Training focuses on basic aircraft handling, traffic pattern operations, and emergency procedures under the supervision of a flight instructor.",
   standard:"The trainee shall demonstrate sufficient competence in basic aircraft handling, normal procedures, and emergency operations to be recommended for the first solo flight."},
  {n:2,label:"Phase II", title:"Consolidation & IFR Introduction", lo:14,hi:32,c:"#4ade80",hrs:25,
   blurb:"Solo consolidation, navigation, and first instrument-flying exposure.",
   objective:"Consolidate basic flight skills and introduce instrument flying. The trainee will progress from first solo to solo cross-country, while developing IFR navigation skills using radio navigation aids.",
   standard:"The trainee shall demonstrate competence in solo general handling, basic instrument flight, radio navigation aid use, and VFR cross-country navigation, and must be qualified for solo cross-country flight."},
  {n:3,label:"Phase III",title:"Advanced VFR & Night Flying",      lo:33,hi:55,c:"#f59e0b",hrs:45,
   blurb:"SPIC cross-country, radio nav aids, night qualification, Phase III skill checks.",
   objective:"Develop advanced VFR cross-country and PIC (SPIC) skills, complete night flight qualification, and pass Phase III skill checks. The trainee will act as student PIC on all cross-country flights.",
   standard:"The trainee shall complete the solo long cross-country, achieve night qualification, and pass both the general handling check and VFR cross-country check as student PIC."},
  {n:4,label:"Phase IV", title:"IFR & Multi-Engine Training",      lo:56,hi:96,c:"#a78bfa",hrs:96,
   blurb:"Full IFR competence, simulator training, multi-engine conversion, final checkrides.",
   objective:"Develop full IFR competence on single-engine and multi-engine aircraft, including simulator training, IFR cross-country operations as student PIC, and multi-engine conversion. Culminates in completion of all course requirements for the CPL/IR licence.",
   standard:"The trainee shall complete all IFR training, pass the IFR cross-country check, complete multi-engine training, and pass the final MEP IFR cross-country check."},
];
// Overall Progress Bar View ONLY — Phase IV split into 4 contiguous sub-segments so SIM vs REAL
// and single- vs multi-engine training are visually distinguishable, per explicit request. Ranges
// and hour totals verified against syllabus.json (each lesson's own duration, summed): every
// Phase IV lesson (56-96) falls in exactly one sub-range, and 28+59+2+7=96h matches Phase IV's
// total. Deliberately NOT folded into AP127_SYLLABUS_PHASES/ap127SyllabusPhase() — those stay a
// flat 4-phase scheme because Flight Timeline, Roster, and Phase Progress Funnel all key off them
// for a consistent "same phase = same color" convention that isn't part of this request.
// phaseIdx points back at the AP127_SYLLABUS_PHASES index the detail modal should open for a
// click on that segment; meIntro marks the one segment whose LEFT boundary is the SE→ME aircraft
// changeover, drawn as a bold solid divider instead of the usual dashed phase-boundary line.
const AP127_BAR_SEGMENTS=[
  {label:"Phase I",  title:"Basic Flight Training",             lo:1, hi:13,c:"#38bdf8",hrs:14,phaseIdx:0},
  {label:"Phase II", title:"Consolidation & IFR Introduction",   lo:14,hi:32,c:"#4ade80",hrs:25,phaseIdx:1},
  {label:"Phase III",title:"Advanced VFR & Night Flying",        lo:33,hi:55,c:"#f59e0b",hrs:45,phaseIdx:2},
  {label:"IFR Sim",  title:"Phase IV · IFR Simulator (FNPT II)", lo:56,hi:67,c:"#93c5fd",hrs:28,phaseIdx:3},
  {label:"IFR Real", title:"Phase IV · IFR Aircraft (SE)",       lo:68,hi:90,c:"#a78bfa",hrs:59,phaseIdx:3},
  {label:"ME Sim",   title:"Phase IV · Multi-Engine Simulator",  lo:91,hi:92,c:"#f9a8d4",hrs:2, phaseIdx:3,meIntro:true},
  {label:"ME Real",  title:"Phase IV · Multi-Engine Aircraft",   lo:93,hi:96,c:"#ec4899",hrs:7, phaseIdx:3},
];
const AP127_PHASE_OTHER={label:"Other",title:"Unrecognized lesson code",c:"#6b7280"};
function ap127LessonNum(code){const m=String(code||"").match(/(\d+)\s*$/);return m?parseInt(m[1],10):null;}
function ap127SyllabusPhase(code){
  const n=ap127LessonNum(code);
  if(n==null)return AP127_PHASE_OTHER;
  return AP127_SYLLABUS_PHASES.find(p=>n>=p.lo&&n<=p.hi)||AP127_PHASE_OTHER;
}
function ap127IdleLineColor(d){if(d<=2)return"#e6edf3";if(d<=5)return"#fbbf24";return"#ff6b6b";}
// Lesson TYPE (Dual / Solo / Simulator) — a different axis than syllabus phase, used by the Daily
// Output chart's breakdown toggle. Every code starts with a fixed leading "C", then an optional
// "M" (multi-engine), then the letter that actually carries Dual/Solo/SPIC meaning ("D","S","SP")
// per the syllabus's own lessonCodeKey; "(SIM)" anywhere in the code overrides to Simulator
// regardless of Dual/Solo, since that's a different device, not a different instruction style.
// SPIC ("SP...") buckets into Solo — both mean flying without an instructor on board, which is
// the distinction that matters for this 3-way split. Verified against every code pattern seen in
// the curriculum (CDGL→Dual, CSGL/CSPGL→Solo, CDIF(SIM)/CMDIF(SIM)→Simulator, CMDGL→Dual,
// CMSPXI→Solo).
// Dual = the app's signature magenta accent (var(--c127)/#e88aff, used everywhere else in this
// tab), Solo = mustard (deliberately a duller, more brownish yellow than the bright gold #facc15
// already used for target-checkpoint flags/key-point ticks elsewhere, so the two don't get
// visually confused). Simulator deliberately darkened from an earlier, lighter violet (#a78bfa)
// — measured perceived luminance had it landing almost identical to Solo's mustard (~160 vs ~160
// on a 0-299 scale) and uncomfortably close to Dual's magenta too, meaning the three colors were
// distinguishable mainly by HUE alone with almost no lightness gap backing it up — a real risk for
// colorblind viewers, since magenta/violet sit close together under deuteranopia/protanopia. The
// darker indigo (~111 luminance) reads as the same "Simulator" hue family while sitting well below
// both other segments in brightness.
const AP127_LESSON_TYPE_COLORS={Dual:"#e88aff",Solo:"#d4a017",Simulator:"#6d5cd6"};
function ap127LessonType(code){
  const c=String(code||"").trim();
  if(/\(SIM\)/i.test(c))return"Simulator";
  const body=c.replace(/\(SIM\)/i,"").replace(/\s*\d+\s*$/,"");
  const rest=body.replace(/^C/i,"").replace(/^M/i,"");
  if(/^SP/i.test(rest))return"Solo";
  if(/^S/i.test(rest))return"Solo";
  if(/^D/i.test(rest))return"Dual";
  return"Dual";
}
function ap127ShortName(n){const p=n.trim().split(/\s+/);return p.length<2?n:p[0]+" "+p[p.length-1][0]+".";}
function ap127FmtDate(ds){if(!ds)return"-";if(ds==="TBC")return"TBC";try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}catch{return ds;}}
function ap127ShortDate(ds){if(!ds)return"-";if(ds==="TBC")return"TBC";try{return new Date(ds+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short"});}catch{return ds;}}
function ap127FlightMins(f){return f.actual_mins||f.mins||0;}
// Canonical "hours per flight" convention: the curriculum's STANDARD/planned duration for that
// lesson code wins, falling back to the flight's own logged duration only if the code isn't in the
// curriculum map. This is what the KPI card and Progress Ranking table have always used (inherited
// unchanged from the original AP127 Detail tab's own ap127Hours()). Several charts added across
// earlier V4 rounds (Actual vs Planned, Combined Progress's chart line, Batch Lagging History,
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
  if(mode==="ahead"||mode==="donelessons")return ap127PaceSort(arr,asOf);
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
  renderAP127Rows();
}
// Friendly labels for sort keys that only ever get added dynamically (via a header click) rather
// than existing as a hand-written <option> in the markup — without this map they'd show the raw
// internal key ("Sort: hrsDelta") instead of a readable name.
const AP127_SORT_LABELS={nick:"Call Sign",se:"SE Type",fi:"Instructor",lastLesson:"Last Lesson",lastFlt:"Last Flight",idle:"Idle Days",dayDelta:"DAY Delta",hrsDelta:"HRS Delta",donelessons:"Lessons Done"};
function ap127HeaderClick(key){
  const sel=document.getElementById("d127v4-sort");
  if(!sel||!key)return;
  if(![...sel.options].some(o=>o.value===key)){const o=document.createElement("option");o.value=key;o.textContent="Sort: "+(AP127_SORT_LABELS[key]||key);o.dataset.dyn="1";sel.appendChild(o);}
  sel.value=key;
  renderAP127Rows();
}
// Debounced search — renderAP127Rows() is cheap on its own (no charts/heatmaps touched), but
// still no reason to re-render on every single keystroke while someone is mid-word.
let _ap127RowsDebounce=null;
function ap127RowsDebounced(){
  clearTimeout(_ap127RowsDebounce);
  _ap127RowsDebounce=setTimeout(renderAP127Rows,120);
}

// ── Pace Monitor v2 — current situation vs target, at a glance ──
// Shared "required batch pace" calc — the single source of truth for reqDay/Week/MonthHrsB/LesB,
// used by BOTH the Pace Monitor table (renderAP127Pace) and the Daily Output chart's target-line
// overlay (buildAP127LessonBar), so the two can never independently drift the way this tab's
// several competing "hours done" formulas once did before being unified (see ap127Hours()'s own
// comment). Returns null only when there are no students at all; when the plan end date/remaining
// days can't be determined, the req* fields come back null but remHrsB/remLesB/n are still valid.
// `overdue`/`daysOverdue` distinguish "plan end date has already passed" from "no plan end date
// exists at all" — both used to collapse into the same null req* state, which made the Required
// Action banner say "Plan end date unavailable" even while the Plan End KPI card right above it
// correctly showed a real date + "0d remaining" for the exact same batch.
function ap127RequiredPace(){
  const all=ap127AsOfStudents();if(!all.length)return null;
  const cur=G.cur127||[];
  const today=ap127AsOf();
  const n=all.length;
  const currHrs=ap127CurriculumHours();
  const currLes=cur.length||(all[0]?.total||0);
  const lessonsMap={};cur.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const fHrsOf=f=>(lessonsMap[f.lesson]||ap127FlightMins(f))/60;
  const totalHrsDone=all.reduce((a,s)=>a+(s.flown||[]).reduce((b,f)=>b+fHrsOf(f),0),0);
  const totalLesDone=all.reduce((a,s)=>a+(s.done||0),0);
  const remHrsB=Math.max((currHrs*n)-totalHrsDone,0);
  const remLesB=Math.max((currLes*n)-totalLesDone,0);
  const planEndDate=cur.map(c=>c.planned_date).filter(Boolean).sort().at(-1)||"";
  const rawDaysRem=planEndDate?ap127DateDiff(planEndDate,today):null;
  const overdue=rawDaysRem!==null&&rawDaysRem<0;
  const daysOverdue=overdue?Math.abs(rawDaysRem):0;
  const daysRem=rawDaysRem===null?null:Math.max(rawDaysRem,0);
  if(daysRem===null||daysRem<=0)return{n,remHrsB,remLesB,daysRem,planEndDate,overdue,daysOverdue,reqDayHrsB:null,reqDayLesB:null,reqWeekHrsB:null,reqWeekLesB:null,reqMonthHrsB:null,reqMonthLesB:null};
  const reqDayHrsB=remHrsB/daysRem,reqDayLesB=remLesB/daysRem;
  return{n,remHrsB,remLesB,daysRem,planEndDate,overdue,daysOverdue,reqDayHrsB,reqDayLesB,reqWeekHrsB:reqDayHrsB*7,reqWeekLesB:reqDayLesB*7,reqMonthHrsB:reqDayHrsB*30.44,reqMonthLesB:reqDayLesB*30.44};
}
// Shared "actual batch pace" calc — the exact same period-appropriate rolling window Pace Monitor
// uses (Day = trailing 7d ÷ 7, Week = trailing 14d ÷ 2, Month = trailing 30d directly), paired
// with ap127RequiredPace() so the Daily Output chart's target/gap overlay shows numbers that are
// PROVABLY identical to the Pace Monitor table's — not a lookalike computed independently, which
// is exactly the class of bug this tab had before (see ap127Hours()'s own comment on that).
function ap127ActualPace(){
  const all=ap127AsOfStudents();if(!all.length)return null;
  const cur=G.cur127||[];
  const today=ap127AsOf();
  const lessonsMap={};cur.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const fHrsOf=f=>(lessonsMap[f.lesson]||ap127FlightMins(f))/60;
  const over=days=>{
    // UTC throughout (parse+step+serialize in UTC) — parsing as LOCAL midnight then serializing
    // via toISOString (always UTC) silently shifts the result back a day in any timezone east of
    // UTC (Bangkok is UTC+7), widening every "trailing N days" window here by a day. Same bug
    // class already fixed in ap127AllDatesRange()/ap127v4WeekStart() — see their comments.
    const start=(()=>{const d=new Date(today+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);})();
    let hrs=0,les=0;
    all.forEach(s=>{const wf=(s.flown||[]).filter(f=>f.date&&f.date>=start&&f.date<=today);les+=wf.length;hrs+=wf.reduce((a,f)=>a+fHrsOf(f),0);});
    return{hrs,les};
  };
  const w7=over(7),w14=over(14),w30=over(30);
  return{actDayHrsB:w7.hrs/7,actDayLesB:w7.les/7,actWeekHrsB:w14.hrs/2,actWeekLesB:w14.les/2,actMonthHrsB:w30.hrs,actMonthLesB:w30.les};
}
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

  // Actual pace: same period-appropriate rolling window ap127ActualPace() computes (wider window
  // = steadier signal for the coarser period) — see that function's comment for the exact windows.
  const actPace=ap127ActualPace();
  const actDayHrsB=actPace?actPace.actDayHrsB:0,       actDayLesB=actPace?actPace.actDayLesB:0;
  const actWeekHrsB=actPace?actPace.actWeekHrsB:0,     actWeekLesB=actPace?actPace.actWeekLesB:0;
  const actMonthHrsB=actPace?actPace.actMonthHrsB:0,   actMonthLesB=actPace?actPace.actMonthLesB:0;

  const reqPace=ap127RequiredPace();
  const hasReq=!!(reqPace&&reqPace.reqDayHrsB!=null);
  const daysRem=reqPace?reqPace.daysRem:null;
  const remHrsB=reqPace?reqPace.remHrsB:0,          remLesB=reqPace?reqPace.remLesB:0;
  const reqDayHrsB=hasReq?reqPace.reqDayHrsB:null,     reqDayLesB=hasReq?reqPace.reqDayLesB:null;
  const reqWeekHrsB=hasReq?reqPace.reqWeekHrsB:null,   reqWeekLesB=hasReq?reqPace.reqWeekLesB:null;
  const reqMonthHrsB=hasReq?reqPace.reqMonthHrsB:null, reqMonthLesB=hasReq?reqPace.reqMonthLesB:null;

  const gHrWkBatch=hasReq?actWeekHrsB-reqWeekHrsB:null;

  // Per-SP ETC (estimated completion date). A never-flown SP (sHrs===0) has no measurable pace, so
  // its ETC falls to a "never at this rate" sentinel (9999-12-31) — correctly counted as at-risk,
  // but its ~2.9-million-day "delay" must NOT be averaged in with everyone else's real delays below
  // (it would swamp the "avg +Xd" figure into a meaningless number the moment any one SP is at 0h).
  let onTime=0,atRisk=0,neverStarted=0;const etcDelays=[];
  all.forEach(s=>{
    const sHrs=(s.flown||[]).reduce((a,f)=>a+fHrsOf(f),0);
    const sRem=Math.max(currHrs-sHrs,0);const sPace=sHrs/daysFromStart;
    let sEtc;
    if(sPace>0&&sRem>0){sEtc=new Date(new Date(today+"T00:00:00Z").getTime()+(sRem/sPace)*86400000).toISOString().slice(0,10);}
    else if(sRem<=0){sEtc=today;}else{sEtc="9999-12-31";}
    if(planEndDate&&sEtc>planEndDate){
      atRisk++;
      if(sHrs>0)etcDelays.push(ap127DateDiff(sEtc,planEndDate));else neverStarted++;
    }
    else onTime++;
  });
  const avgDelay=etcDelays.length?Math.round(etcDelays.reduce((a,v)=>a+v,0)/etcDelays.length):0;
  const atRiskSub=atRisk===0?"none":etcDelays.length?`avg +${avgDelay}d${neverStarted?` (+${neverStarted} not started)`:""}`:`${neverStarted} not started`;

  const fH=h=>h===null?"—":h>=100?h.toFixed(0)+"h":h>=10?h.toFixed(1)+"h":h.toFixed(2)+"h";
  const fL=l=>l===null?"—":l>=100?l.toFixed(0)+" les":l>=10?l.toFixed(1)+" les":l.toFixed(2)+" les";

  const riskColor=atRisk>0?"#ef4444":"var(--done)";
  // "Overdue" (plan end date known but already passed) gets its own message, distinct from "no plan
  // data at all" — previously both collapsed into the same "unavailable" text even while the Plan
  // End KPI card two lines below correctly showed the real date + "0d remaining" for the same batch.
  const isOverdue=!!(reqPace&&reqPace.overdue);
  const actionMsg=gHrWkBatch!==null&&gHrWkBatch<0
    ?`Batch needs <b style="color:#ef4444">${fH(Math.abs(gHrWkBatch))} more hours per week</b> (all 28 SP combined) to finish by plan date.`
    :gHrWkBatch!==null?`Batch is <b style="color:var(--done)">${fH(gHrWkBatch)} per week ahead</b> of required pace — on track.`
    :isOverdue?`Plan end date (${ap127ShortDate(reqPace.planEndDate)}) has passed — batch is <b style="color:#ef4444">${reqPace.daysOverdue}d overdue</b>. Required pace can no longer be computed against it.`
    :"Plan end date unavailable — required pace can't be computed.";

  const cardsHtml=`<div class="d127v4-cards">
    <div class="d127v4-card"><div class="d127-kl">Plan End</div><div class="d127-kv" style="color:var(--tx3)">${planEndDate?ap127ShortDate(planEndDate):"TBC"}</div><div class="d127-ks">${isOverdue?`overdue by ${reqPace.daysOverdue}d`:daysRem!==null?daysRem+"d remaining":"—"}</div></div>
    <div class="d127v4-card"><div class="d127-kl">On Track</div><div class="d127-kv" style="color:var(--done)">${onTime}</div><div class="d127-ks">of ${n} SP</div></div>
    <div class="d127v4-card"><div class="d127-kl">At Risk</div><div class="d127-kv" style="color:${riskColor}">${atRisk}</div><div class="d127-ks">${atRiskSub}</div></div>
  </div>`;

  // Compact Required/Actual/Gap table — one row per period (Month/Week/Day), Hours + Lessons
  // side by side, replacing the earlier one-card-per-metric big-number layout.
  const gapCell=(req,act,fmt)=>{
    const has=req!==null&&req!==undefined;
    const gap=has?act-req:null;
    const color=!has?"var(--tx3)":gap>=0?"var(--done)":"#ef4444";
    return `<td style="color:${color};font-weight:600">${has?`${gap>=0?"+":"-"}${fmt(Math.abs(gap))}`:"—"}</td>`;
  };
  const statRow=(period,windowNote,reqHr,actHr,reqLes,actLes)=>`<tr>
    <td class="d127v4-pace-t-period">${period}<div class="d127v4-pace-t-note">${windowNote}</div></td>
    <td>${reqHr!==null&&reqHr!==undefined?fH(reqHr):"—"}</td><td style="color:var(--tx)">${fH(actHr)}</td>${gapCell(reqHr,actHr,fH)}
    <td>${reqLes!==null&&reqLes!==undefined?fL(reqLes):"—"}</td><td style="color:var(--tx)">${fL(actLes)}</td>${gapCell(reqLes,actLes,fL)}
  </tr>`;
  const paceTable=(title,rowsHtml)=>`
    <div class="d127v4-pace-tbl-wrap">
      <div class="d127v4-sec-lbl">${title}</div>
      <table class="d127v4-pace-tbl">
        <thead>
          <tr><th rowspan="2">Period</th><th colspan="3">Hours</th><th colspan="3">Lessons</th></tr>
          <tr><th>Req</th><th>Act</th><th>Gap</th><th>Req</th><th>Act</th><th>Gap</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  const bulletsHtml=`
    <div class="d127v4-pace-tbls">
      ${paceTable("1 SP · Pace vs Target",
        statRow("Month","actual = 30d",hasReq?reqMonthHrsB/n:null,actMonthHrsB/n,hasReq?reqMonthLesB/n:null,actMonthLesB/n)+
        statRow("Week","actual = 2wk avg/wk",hasReq?reqWeekHrsB/n:null,actWeekHrsB/n,hasReq?reqWeekLesB/n:null,actWeekLesB/n)+
        statRow("Day","actual = 7d avg/day",hasReq?reqDayHrsB/n:null,actDayHrsB/n,hasReq?reqDayLesB/n:null,actDayLesB/n))}
      ${paceTable("28 SP · Batch Total vs Target",
        statRow("Month","actual = 30d",reqMonthHrsB,actMonthHrsB,reqMonthLesB,actMonthLesB)+
        statRow("Week","actual = 2wk avg/wk",reqWeekHrsB,actWeekHrsB,reqWeekLesB,actWeekLesB)+
        statRow("Day","actual = 7d avg/day",reqDayHrsB,actDayHrsB,reqDayLesB,actDayLesB))}
    </div>
    <div class="d127v4-action-banner">
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Required Action</div>
      ${actionMsg}
      <div style="margin-top:4px;color:var(--tx3);font-size:10px">Remaining ${remHrsB.toFixed(1)}h / ${remLesB} les batch-wide</div>
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
  // "at/above cohort avg" (NOT "on track") — that word is reserved for the Pace Monitor's own
  // plan-based On Track card just below (ETC <= plan end date), a different, incompatible measure.
  // This line means only "at/above the batch's own average lessons-done", which by construction
  // always tags roughly half the batch regardless of whether the whole batch is ahead of plan.
  setT("d127v4-meta",`${doneAll} lessons done · Avg ${avgDone.toFixed(1)} · ${onTrack}/${total} at/above avg`);

  renderAP127Rows();

  const recent=[...all].map(s=>({s,last:(s.flown||[]).at(-1)||{}})).filter(x=>x.last.date).sort((a,b)=>(b.last.date||"").localeCompare(a.last.date||"")||(b.s.done||0)-(a.s.done||0)).slice(0,8);
  document.getElementById("d127v4-activity").innerHTML=recent.map(x=>`<div class="d127-ai"><div class="d127-an">${ap127ShortName(x.s.name)} · ${x.last.lesson||"-"}</div><div class="d127-ad">${ap127ShortDate(x.last.date)} · ${ap127Hours(x.s).toFixed(2)} hrs · ${x.s.done||0}/${curriculum}</div></div>`).join("")||`<div class="d127-ad">No activity yet.</div>`;

  buildAP127CombinedChart();
  buildAP127Timeline(all,curriculum,maxDate);
  buildAP127RaceChart(all,curriculum,maxDate);
  buildAP127ConsIdle(all,today0);
  buildAP127OverallChart(all,curriculum,maxDate);
  buildAP127LessonMatrix();
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
// Progress Ranking table only — pulled out of renderAP127Detail() because the search box, sort
// dropdown, header-click sort, and Reset Sort ALL only affect row filtering/ordering here, never
// any chart or heatmap (every one of those reads the unfiltered student list, not this function's
// search-filtered `rows`). Before this split, typing in the search box fired a full rebuild of
// 12+ Chart.js instances plus the Roster and Lesson Completion Matrix heatmaps (thousands of DOM
// nodes) on every single keystroke — the main cause of the tab feeling laggy. Search/sort/reset
// now call this directly instead of the full renderAP127Detail().
function renderAP127Rows(){
  if(!G||!G.ap127)return;
  const today=ap127AsOf();
  const all=ap127AsOfStudents();
  const curriculum=all[0]?.total||0;
  const planMap={};(G.cur127||[]).forEach(c=>{if(c.lesson&&c.planned_date)planMap[c.lesson]=c.planned_date;});
  const q=(document.getElementById("d127v4-q")?.value||"").toLowerCase().trim();
  let rows=ap127SortRows(all,today,planMap,today);
  if(q)rows=rows.filter(s=>s.name.toLowerCase().includes(q)||(s.nick||"").toLowerCase().includes(q)||(s.fi||"").toLowerCase().includes(q));
  AP127_VIEW_ROWS=rows;
  const updTxt=G._updated?new Date(G._updated).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
  const asofEl=document.getElementById("d127v4-asof");if(asofEl)asofEl.textContent=`Updated ${updTxt}`;

  const paced=ap127PaceSort(all,today);
  const leaderDone=paced[0]?.done||0,lagDone=paced.at(-1)?.done||0;
  const spread=Math.max(leaderDone-lagDone,1),step=Math.max(Math.ceil(spread/3),1);
  const aheadLo=leaderDone-step+1,midLo=leaderDone-step*2+1;
  const getBandColor=(done)=>{if(done>=aheadLo)return"#7be9b8";if(done>=midLo)return"#ffd67a";return"#ffa0a0";};
  const tbody=document.getElementById("d127v4-rows");
  if(!tbody)return;
  const plannedHrsToday=ap127PlannedHoursAsOf(today);
  // Total row = totals for what's currently shown (the search-filtered `rows`), not the whole
  // cohort — every figure below reads from `rows`, never the unfiltered `all`, so the row stays
  // internally consistent no matter what's typed in the search box. Guarded against rows.length===0
  // (a search matching nobody previously rendered a literal "NaN%").
  const sortedByDone=[...rows].sort((a,b)=>(a.done||0)-(b.done||0));
  const avgPctAll=(curriculum&&rows.length)?rows.reduce((a,s)=>a+(s.done||0),0)/rows.length/curriculum*100:0;
  const sumHrsAll=rows.reduce((a,s)=>a+ap127Hours(s),0);
  const sumDoneAll=rows.reduce((a,s)=>a+(s.done||0),0);
  const validIdles=rows.map(s=>ap127IdleDays(s,today)).filter(v=>v!==9999);
  const avgIdleAll=validIdles.length?(validIdles.reduce((a,v)=>a+v,0)/validIdles.length):0;
  const validDayDeltas=rows.map(s=>ap127DayDelta(s,planMap,today)).filter(v=>v!==null);
  const avgDayDeltaAll=validDayDeltas.length?Math.round(validDayDeltas.reduce((a,v)=>a+v,0)/validDayDeltas.length):0;
  const sumHrsDeltaAll=rows.reduce((a,s)=>a+(ap127Hours(s)-plannedHrsToday),0);
  const lagLastLes=(sortedByDone[0]?.flown||[]).at(-1)?.lesson||sortedByDone[0]?.next_lesson||'-';
  const leadLastLes=(sortedByDone.at(-1)?.flown||[]).at(-1)?.lesson||sortedByDone.at(-1)?.next_lesson||'-';
  const allLastDates=rows.map(s=>ap127LastFlightDate(s)).filter(Boolean).sort();
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
    const key=th.getAttribute("data-key");
    th.onclick=()=>ap127HeaderClick(key);
    th.tabIndex=0;th.setAttribute("role","button");
    th.onkeydown=(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();ap127HeaderClick(key);}};
    th.setAttribute("aria-sort",key===curSort?"descending":"none");
    const existing=th.querySelector(".d127-sarr");if(existing)existing.remove();
    if(key===curSort){const s=document.createElement("span");s.className="d127-sarr";s.textContent="▼";th.appendChild(s);}
  });
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
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeAP127Drawer();closeAP127SyllabusModal();}});

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
    legend.innerHTML=items+`<span class="d127-pc" style="margin-left:10px"><span class="d127-pdot" style="background:#fca5a5;border-radius:2px;width:14px;height:3px"></span>gap &gt; 7 days</span><span class="d127-pc"><span class="d127-pdot" style="background:#e6edf3;border-radius:2px;width:14px;height:3px"></span>idle 1-2d</span><span class="d127-pc"><span class="d127-pdot" style="background:#fbbf24;border-radius:2px;width:14px;height:3px"></span>idle 3-5d</span><span class="d127-pc"><span class="d127-pdot" style="background:#ff6b6b;border-radius:2px;width:14px;height:3px"></span>idle &gt;5d</span><span class="d127-pc"><span class="d127-pdot" style="background:#f59e0b;width:2px;height:10px;border-radius:0"></span>today</span><span class="d127-pc"><span class="d127-pdot" style="background:#f43f5e;border-radius:2px;width:14px;height:3px"></span>AP127 target date</span><span class="d127-pc"><span class="d127-pdot" style="background:transparent;border:1.5px solid #6e7681;border-radius:50%;width:8px;height:8px"></span>not started</span>`;
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
    } else {
      // Never-flown SP: every other activity state on this chart gets a colored cue (a dot for
      // each flight, a dashed idle tail when they've gone quiet) — a student who simply hasn't
      // started yet previously got nothing at all, an empty row indistinguishable from a
      // data-load glitch. A hollow ring at the plot's left edge reads as "not started" instead.
      datasets.push({
        label:"__notstarted_"+idx,
        data:[{x:minDay,y:idx+1,sIdx:idx,studentName:s.name}],
        showLine:false,
        pointStyle:"circle",
        pointRadius:5,
        pointHoverRadius:6,
        pointHitRadius:8,
        pointBackgroundColor:"rgba(0,0,0,0)",
        pointBorderColor:"#6e7681",
        pointBorderWidth:1.5,
        _isNotStarted:true
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
  // AP127 Targets overlay — one thin dashed rose line per batch-wide checkpoint date
  // (js/ap127-targets-data.js, edited via the System-tab "AP127 Targets" page), labeled with its
  // target lesson number, so the calendar cadence the batch is meant to keep is visible directly
  // against actual flight activity below.
  const targetLinesPlugin={
    id:"d127v4TimelineTargets",
    afterDatasetsDraw(chart){
      const targets=window.ap127GetMilestoneTargets?window.ap127GetMilestoneTargets():[];
      if(!targets.length)return;
      const{ctx,scales:{x,y}}=chart;
      ctx.save();
      targets.forEach(t=>{
        const dayNum=toDayNum(t.date);
        if(dayNum<x.min||dayNum>x.max)return;
        const px=x.getPixelForValue(dayNum);
        ctx.strokeStyle="rgba(244,63,94,0.5)";ctx.lineWidth=1;ctx.setLineDash([3,3]);
        ctx.beginPath();ctx.moveTo(px,y.top);ctx.lineTo(px,y.bottom);ctx.stroke();
        ctx.setLineDash([]);
        ctx.font="700 7.5px JetBrains Mono, monospace";ctx.fillStyle="#f43f5e";ctx.textAlign="center";ctx.textBaseline="bottom";
        ctx.fillText(`L${t.lesson}`,px,y.top-1);
      });
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
        let viewIdx=AP127_VIEW_ROWS.findIndex(s=>s.catc_id===student.catc_id);
        if(viewIdx<0){
          // Clicked SP isn't in the current search-filtered Progress Ranking rows — previously
          // this silently did nothing. openAP127Drawer() only indexes into AP127_VIEW_ROWS (same
          // array every other click-to-drawer entry point in this tab uses), so the fix is to
          // clear whatever search is hiding them rather than build a second drawer-render path.
          const q=document.getElementById("d127v4-q");if(q)q.value="";
          renderAP127Rows();
          viewIdx=AP127_VIEW_ROWS.findIndex(s=>s.catc_id===student.catc_id);
        }
        if(viewIdx>=0)openAP127Drawer(viewIdx);
      },
      plugins:{
        datalabels:{display:false},
        legend:{display:false},
        tooltip:{
          filter:(item)=>{const ds=item.chart.data.datasets[item.datasetIndex];return !ds._isToday&&!ds._isCount&&!ds._isIdle;},
          callbacks:{
            title:(ctx)=>{const r=ctx[0]?.raw;if(ctx[0]?.dataset?._isNotStarted)return ap127ShortName(r.studentName);return r?ap127FmtDate(r.date):"";},
            label:(ctx)=>{const r=ctx.raw;if(!r)return"";if(ctx.dataset._isNotStarted)return"Not started yet";return `${ap127ShortName(r.studentName||ctx.dataset.label)} · ${r.lesson} · ${hm(r.mins||0)}`;}
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
    plugins:[countPlugin,gapPlugin,idlePlugin,labelPlugin,targetLinesPlugin]
  });
  const lead=sorted[0],lag=sorted.at(-1);
  document.getElementById("d127v4-tl-meta").textContent=lead&&lag?`Leader ${ap127ShortName(lead.name)} (${lead.done||0}/${curriculum}) · Lag ${ap127ShortName(lag.name)} (${lag.done||0}/${curriculum})`:"-";
}

// Stable per-student line color, keyed by catc_id rather than sort position. Race, Cons/Idle
// (and any future per-SP-line chart) previously computed hue as `i*360/n` off `ap127PaceSort`'s
// index — since that sort order shifts on essentially every render (any SP passing another, or
// scrubbing the As-Of time-travel slider to a different date), the same student's line color
// would visibly drift across a session even though both charts used the identical formula and so
// stayed consistent with EACH OTHER at any single moment. Recomputed only when batch membership
// actually changes (cheap on ~28 students), so a given catc_id keeps the same hue all session.
let AP127_STUDENT_HUES=null,AP127_STUDENT_HUES_KEY="";
function ap127StudentHue(catc_id,allStudents){
  const ids=[...new Set(allStudents.map(s=>s.catc_id))].sort();
  const key=ids.join(",");
  if(key!==AP127_STUDENT_HUES_KEY){
    AP127_STUDENT_HUES={};
    ids.forEach((id,i)=>{AP127_STUDENT_HUES[id]=Math.round(i*360/Math.max(ids.length,1));});
    AP127_STUDENT_HUES_KEY=key;
  }
  return AP127_STUDENT_HUES[catc_id]??0;
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
  // Each dataset's points carry their own {x:date,y:value} pair (rather than a shared plain-number
  // array read off a parallel `labels` array) so the chart can use a genuine `type:'time'` x-axis —
  // `labels` alone forces Chart.js into a category axis, which gives equal pixel width to a 1-day
  // gap and a 60-day gap between flights alike, visually distorting exactly the pace-over-time
  // comparison this chart exists to show. Matches the pattern Cons/Idle and Combined Progress
  // already use correctly.
  const planData=labels.map(d=>{planRun+=(planByDate[d]||0);return {x:d,y:+planRun.toFixed(2)};});

  const datasets=[{
    label:"Planned Target",
    data:planData,
    borderColor:"#cbd5e1",pointRadius:0,tension:.25,borderDash:[6,4],borderWidth:2
  }];

  racers.forEach((s)=>{
    const hue=ap127StudentHue(s.catc_id,racers);
    const col=`hsla(${hue},85%,62%,0.8)`;
    const nick=ap127ShortName(s.name);
    const flights=(s.flown||[]).filter(f=>f.date&&f.date<=today).sort((a,b)=>a.date.localeCompare(b.date));
    const visible=AP127_RACE_SOLO===null||AP127_RACE_SOLO===nick;
    const pts=cumSeries(flights);
    datasets.push({
      label:nick,
      data:pts.map((p,idx)=>({x:labels[idx],y:p.y})),
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

  const avgData=labels.map((d,li)=>{
    let sum=0,cnt=0;
    datasets.forEach(ds=>{
      if(ds.label==='Planned Target')return;
      const v=ds.data[li]?.y;
      if(typeof v==='number'){sum+=v;cnt++;}
    });
    return {x:d,y:cnt?+(sum/cnt).toFixed(2):0};
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
    type:"line",data:{datasets},
    options:{responsive:true,maintainAspectRatio:false,
      parsing:{xAxisKey:"x",yAxisKey:"y"},
      interaction:{mode:"index",intersect:false},
      plugins:{datalabels:{display:false},legend:{display:false},tooltip:{callbacks:{
        title:(ctx)=>{const r=ctx[0]?.raw;return r?ap127FmtDate(r.x):"";},
        label:(ctx)=>{const v=ctx.raw?.y;if(v==null)return null;return `${ctx.dataset.label}: ${isHrs?v.toFixed(1)+" hrs":v+" les"}`;}
      }}},
      scales:{
        x:{type:"time",time:{unit:"month",displayFormats:{day:"d MMM",week:"d MMM",month:"MMM yy"}},ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681",maxTicksLimit:18,source:"auto"},grid:{color:"#21262d"}},
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
  racers.forEach((s)=>{
    const hue=ap127StudentHue(s.catc_id,racers);
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
// category, plus every checkride lesson (there are exactly 4 in the curriculum, per the authoritative
// syllabus at ap127-flight-training.pages.dev/data/syllabus.json). idx = lessonNum-1, same
// "lessons completed before this one starts" convention as the phase boundaries.
//
// Checkride detection is `/(?<!X)C$/i` on the number-stripped code, NOT a bare `/C$/i` — a bare
// trailing-C test also matches Night/VFR/IFR Cross-Country codes (e.g. "CDNXC 48"), which end in
// "...XC" and are NOT checkrides, only sharing the same last letter. The negative lookbehind for
// "X" excludes those while still matching every real check code (CSPGLC, CSPXVC, CSPXIC,
// CMSPXIC — the "C" they end on isn't part of an "XC" cross-country token).
const AP127_CHECKRIDE_DETAIL={
  CSPGLC:"GH",CSPXVC:"VFR XC",CSPXIC:"IFR XC",CMSPXIC:"ME IFR XC",
};
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
  byNum.forEach(c=>{
    const n=ap127LessonNum(c.lesson);const base=stripNum(c.lesson);
    if(n!=null&&/(?<!X)C$/i.test(base))pts.push({idx:n-1,label:`Checkride · ${AP127_CHECKRIDE_DETAIL[base.toUpperCase()]||base}`});
  });
  return pts;
}
// Milestone type lookup — one place mapping a ap127KeyPoints() label to its type key, used by both
// the icon renderer (ap127KeyPointIconSvg) and the click-to-expand explanation modal
// (openAP127MilestoneModalV4) so the two never drift out of sync with each other.
const AP127_MILESTONE_TYPES=[
  {test:l=>l.startsWith("Checkride"),key:"checkride",
   explain:"An official in-flight test — a Skill Check — assessing the trainee against a defined proficiency standard. Passing is a formal requirement to progress to the next phase or complete the course; failing means additional training before a re-test."},
  {test:l=>l.startsWith("Initial Solo"),key:"solo",
   explain:"The trainee's first flight without an instructor on board. A foundational milestone: it requires demonstrated competence in basic aircraft handling, normal procedures, and emergency operations, per Phase I's completion standard."},
  {test:l=>l.startsWith("Instrument"),key:"instrument",
   explain:"First exposure to flying by reference to instruments alone — attitude, heading, altitude — rather than outside visual cues. The foundation of IFR (Instrument Flight Rules) competence, developed further through Phase II and Phase IV."},
  {test:l=>l.startsWith("Cross-Country"),key:"xc",
   explain:"A flight to a landing point a defined distance from the departure aerodrome, developing navigation, flight planning, and diversion skills. Flown dual first, then solo/SPIC as proficiency builds through Phase II and III."},
  {test:l=>l.startsWith("Sim"),key:"sim",
   explain:"Training conducted in a Flight Navigation Procedures Trainer (FNPT II) rather than the actual aircraft — a cost-effective, repeatable way to practice IFR procedures and abnormal/emergency scenarios before flying them for real."},
  {test:l=>l.startsWith("Multi-Engine"),key:"me",
   explain:"The first lesson on a twin-engine aircraft — introduces asymmetric-thrust handling, engine-out procedures, and the added systems complexity of a multi-engine type, building toward the Multi-Engine Piston (MEP) rating."},
];
function ap127MilestoneMeta(label){return AP127_MILESTONE_TYPES.find(t=>t.test(label))||{key:"other",explain:""};}
// Small stroke-based inline SVG icons (14x14 viewBox, single-color via currentColor) — matches the
// minimal geometric convention already established by ViewIcon() in js/shared.js, replacing the
// earlier full-color emoji set (a user-reported ask for something "more professional"): a plain
// aircraft silhouette (Solo), a gauge/needle (Instrument), a dashed route to a waypoint diamond
// (Cross-Country), a monitor (Sim), two propeller discs (Multi-Engine), a shield+check (Checkride).
function ap127KeyPointIconSvg(label,size){
  size=size||13;
  const key=ap127MilestoneMeta(label).key;
  const s=`width="${size}" height="${size}" viewBox="0 0 14 14"`;
  if(key==="checkride")return`<svg ${s} fill="none" stroke="currentColor" stroke-width="1.2"><path d="M7 1.3 L12 3 L12 7.2 C12 10 9.8 12 7 12.8 C4.2 12 2 10 2 7.2 L2 3 Z"/><path d="M4.6 7.1 L6.2 8.7 L9.4 5.3" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if(key==="solo")return`<svg ${s} fill="currentColor"><path d="M7 1 L8.2 4.6 L12.6 6.9 L12.6 8.1 L8.2 7.1 L8.6 10.9 L10.3 12.1 L10.3 12.9 L7 12.1 L3.7 12.9 L3.7 12.1 L5.4 10.9 L5.8 7.1 L1.4 8.1 L1.4 6.9 L5.8 4.6 Z"/></svg>`;
  if(key==="instrument")return`<svg ${s} fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="7" cy="7" r="5.5"/><line x1="7" y1="7" x2="7" y2="2.4" stroke-width="1.3" stroke-linecap="round"/><line x1="7" y1="7" x2="9.8" y2="8.6" stroke-width="1.3" stroke-linecap="round"/><circle cx="7" cy="7" r="0.9" fill="currentColor" stroke="none"/></svg>`;
  if(key==="xc")return`<svg ${s} fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.5 11 Q5 3 12.3 3" stroke-dasharray="2 1.6"/><circle cx="1.5" cy="11" r="1.3" fill="currentColor" stroke="none"/><path d="M12.3 1.3 L13.5 3 L12.3 4.7 L11.1 3 Z" fill="currentColor" stroke="none"/></svg>`;
  if(key==="sim")return`<svg ${s} fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.5" y="2.5" width="11" height="7.5" rx="1"/><line x1="4.5" y1="12.3" x2="9.5" y2="12.3" stroke-linecap="round"/><line x1="7" y1="10" x2="7" y2="12.3"/></svg>`;
  if(key==="me")return`<svg ${s} fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="4" cy="7" r="3"/><circle cx="4" cy="7" r="0.8" fill="currentColor" stroke="none"/><circle cx="10" cy="7" r="3"/><circle cx="10" cy="7" r="0.8" fill="currentColor" stroke="none"/></svg>`;
  return`<svg ${s} fill="currentColor"><circle cx="7" cy="7" r="2.5"/></svg>`;
}
// kps from the most recent ap127SyllabusStrip() render — openAP127MilestoneModal(i) looks a
// clicked icon back up by its index into this (unfiltered) list. AP127_OVERALL_TOTAL is the
// current build's total lesson count, needed by ap127SyncSyllabusStrip() outside buildAP127OverallChart's closure.
let AP127_OVERALL_KPS=[];
let AP127_OVERALL_TOTAL=96;
// ── SYLLABUS strip — a rich, standalone HTML timeline (not a Chart.js row) rendered directly above
// the Overall Progress chart, sized and positioned to read as one continuous lesson-number axis
// with the per-SP bars beneath it (same 100px left gutter as the chart's y-axis label column).
// Moved out of the chart entirely (v5 drew it as a same-height "MASTER PLAN" bar-chart row)
// because a stacked-bar row can only hold a single line of canvas text — not enough room for phase
// name + description + hour/lesson counts + milestone icons all at once, and canvas text can't do
// hover tooltips or clicks for the "why" behind each phase. It is now ALSO the only place
// phase/milestone detail is displayed at all — the chart itself no longer draws any marker lines
// or labels over the SP rows (see buildAP127OverallChart's comment for why that was removed).
//
// viewMin/viewMax (in the same 0..totalLessons "lesson count" units as the chart's x-axis) let the
// strip zoom together with the chart: ap127SyncSyllabusStrip() re-renders this with the chart's
// current visible x-range on every zoom/pan, so segments/icons outside that range are dropped and
// the visible ones are rescaled to fill the width — the exact same window the chart is showing.
function ap127SyllabusStrip(cur,totalLessons,viewMin,viewMax){
  if(viewMin==null)viewMin=0;
  if(viewMax==null)viewMax=totalLessons;
  viewMin=Math.max(0,viewMin);viewMax=Math.min(totalLessons,viewMax);
  const rangeSpan=Math.max(viewMax-viewMin,0.0001);
  const zoomed=viewMin>0.5||viewMax<totalLessons-0.5;
  const kps=ap127KeyPoints(cur);
  AP127_OVERALL_KPS=kps;
  const totalHrs=AP127_SYLLABUS_PHASES.reduce((a,p)=>a+p.hrs,0);
  const segHtml=AP127_BAR_SEGMENTS.map(seg=>{
    const vlo=Math.max(seg.lo-1,viewMin),vhi=Math.min(seg.hi,viewMax);
    if(vhi<=vlo)return"";
    const wPct=(vhi-vlo)/rangeSpan*100;
    return `<div class="d127v4-syl-phase${seg.meIntro?" d127v4-syl-phase-me-div":""}" style="width:${wPct}%;background:${seg.c}" title="${escHtml(seg.title)} · Lessons ${seg.lo}–${seg.hi} · ${seg.hrs}h — click for full phase detail" onclick="openAP127SyllabusModalV4(${seg.phaseIdx})">
      <div class="d127v4-syl-phase-n">${seg.label}</div>
      <div class="d127v4-syl-phase-m">L${seg.lo}–${seg.hi} · ${seg.hrs}h</div>
    </div>`;
  }).filter(Boolean).join("");
  // Alternate an icon down a row when it lands within 2 lessons of another VISIBLE one — e.g. the
  // two GH/VFR-XC checkrides at L54/55, or a Checkride/Multi-Engine pair landing right on the bold
  // SE→ME phase divider (~L90/91) — without this they visually merge into one indistinguishable
  // cluster at default zoom. .d127v4-syl-kp-alt (CSS) shifts icon+tick down within the strip.
  // `kps` isn't sorted by lesson number (checkrides are appended after the type-based
  // first-matches), so proximity is determined on a lesson-sorted COPY; the original array index
  // `i` is preserved for openAP127MilestoneModalV4(i), which reads AP127_OVERALL_KPS in the
  // original (unsorted) order.
  const visibleKps=kps.map((k,i)=>({k,i,lesson:k.idx+1})).filter(x=>x.lesson>=viewMin&&x.lesson<=viewMax);
  const altIdxSet=new Set();
  const byLessonAsc=[...visibleKps].sort((a,b)=>a.lesson-b.lesson);
  for(let j=1;j<byLessonAsc.length;j++){
    if(byLessonAsc[j].lesson-byLessonAsc[j-1].lesson<=2)altIdxSet.add(byLessonAsc[j].i);
  }
  const kpHtml=visibleKps.map(({k,i,lesson})=>{
    const leftPct=Math.max(1,Math.min(99,(lesson-viewMin)/rangeSpan*100));
    const isCR=k.label.startsWith("Checkride");
    const alt=altIdxSet.has(i);
    return `<div class="d127v4-syl-kp${isCR?" d127v4-syl-kp-cr":""}${alt?" d127v4-syl-kp-alt":""}" style="left:${leftPct}%" title="${escHtml(k.label)} · Lesson ${lesson} — click to expand" onclick="openAP127MilestoneModalV4(${i})">
      <span class="d127v4-syl-kp-tick"></span>
      <span class="d127v4-syl-kp-ic">${ap127KeyPointIconSvg(k.label,13)}</span>
    </div>`;
  }).filter(Boolean).join("");
  const subLabel=zoomed
    ?`showing lessons ${Math.round(viewMin)}–${Math.round(viewMax)} of ${totalLessons} (zoomed with chart)`
    :`${totalLessons} lessons · ${totalHrs}h · CATC CPL/IR Integrated Course`;
  // AP127 Targets overlay — where the whole batch is expected to be TODAY (or the As-Of date, if
  // scrubbed) per the batch-wide milestone schedule (js/ap127-targets-data.js, edited via the
  // System-tab "AP127 Targets" page). Drawn as a single distinct rose/red marker, deliberately not
  // styled like the phase-boundary/milestone visuals so it doesn't read as "part of the syllabus"
  // — it's an external pacing target, not curriculum structure.
  const todayLesson=window.ap127TargetLessonForDate?window.ap127TargetLessonForDate(ap127AsOf()):null;
  let targetHtml="";
  if(todayLesson!=null&&todayLesson>=viewMin&&todayLesson<=viewMax){
    const tPct=Math.max(0,Math.min(100,(todayLesson-viewMin)/rangeSpan*100));
    targetHtml=`<div class="d127v4-syl-target" style="left:${tPct}%" title="AP127 Target: every SP at Lesson ${Math.round(todayLesson)} by ${ap127FmtDate(ap127AsOf())}"><span class="d127v4-syl-target-lbl">TARGET · L${Math.round(todayLesson)}</span></div>`;
  }
  return `<div class="d127v4-syllabus">
    <div class="d127v4-syllabus-hd">
      <span class="d127v4-syllabus-lbl">✦ SYLLABUS</span>
      <span class="d127v4-syllabus-sub">${subLabel} — click a segment or icon for full detail</span>
    </div>
    <div class="d127v4-syllabus-track">
      <div class="d127v4-syl-kps">${kpHtml}</div>
      <div class="d127v4-syl-phases">${segHtml}</div>
      ${targetHtml}
    </div>
  </div>`;
}
// Sets the SYLLABUS strip's HTML, then measures each phase block's actual rendered width and adds
// a "narrow" class to any that are too thin for their name+hour label to be legible — e.g. the
// 2-lesson "ME Sim" segment (~2% of the strip at default zoom) previously let the label silently
// ellipsis-clip to nothing, with no signal to the viewer that a segment even has a name. Can't be
// done in pure CSS since these are flex-basis percentages of a container whose real pixel width
// isn't known until layout runs — hence the rAF measurement pass after every (re)render.
function ap127SetSyllabusStripHtml(stripEl,html){
  if(!stripEl)return;
  stripEl.innerHTML=html;
  requestAnimationFrame(()=>{
    stripEl.querySelectorAll(".d127v4-syl-phase").forEach(el=>{
      el.classList.toggle("d127v4-syl-phase-narrow",el.clientWidth<34);
    });
  });
}
// Re-renders the SYLLABUS strip from the Overall Progress chart's CURRENT visible x-range —
// called after every zoom/pan/reset (wheel, pinch, drag-pan via the zoom-plugin callbacks; the
// +/-/Reset buttons via explicit calls in ap127OverallZoom/ap127OverallResetZoom, since relying
// solely on plugin callbacks firing for programmatic .zoom()/.resetZoom() calls isn't guaranteed
// across versions) so the strip always matches what the chart is actually showing.
function ap127SyncSyllabusStrip(){
  const chart=CHARTS.ap127overall;
  const stripEl=document.getElementById("d127v4-syllabus-strip");
  if(!chart||!stripEl||!G)return;
  const xs=chart.scales.x;if(!xs)return;
  ap127SetSyllabusStripHtml(stripEl,ap127SyllabusStrip(G.cur127||[],AP127_OVERALL_TOTAL,xs.min,xs.max));
}
// Click-to-detail modal for a SYLLABUS phase block. Shared across all AP127_BAR_SEGMENTS entries —
// Phase IV's 4 sub-segments (IFR/ME × Sim/Real) all point at the same phaseIdx (3) and open one
// modal showing the combined phase objective/standard plus a breakdown of its sub-segments.
function openAP127SyllabusModal(phaseIdx){
  const p=AP127_SYLLABUS_PHASES[phaseIdx];if(!p)return;
  const cur=(G&&G.cur127)||[];
  const kps=ap127KeyPoints(cur).filter(k=>{const n=k.idx+1;return n>=p.lo&&n<=p.hi;});
  const subs=AP127_BAR_SEGMENTS.filter(s=>s.phaseIdx===phaseIdx);
  const hasSubs=subs.length>1;
  const setT=(id,t)=>{const e=document.getElementById(id);if(e)e.textContent=t;};
  setT("d127v4-syl-modal-title",`${p.label} — ${p.title}`);
  setT("d127v4-syl-modal-sub",`Lessons ${p.lo}–${p.hi} · ${p.hrs}h of ${AP127_SYLLABUS_PHASES.reduce((a,x)=>a+x.hrs,0)}h total curriculum`);
  let html=`<div class="d127v4-syl-modal-sec"><div class="d127v4-syl-modal-h">Objective</div><p>${escHtml(p.objective)}</p></div>`;
  html+=`<div class="d127v4-syl-modal-sec"><div class="d127v4-syl-modal-h">Completion Standard</div><p>${escHtml(p.standard)}</p></div>`;
  if(hasSubs){
    html+=`<div class="d127v4-syl-modal-sec"><div class="d127v4-syl-modal-h">Breakdown</div>`+
      subs.map(s=>`<div class="d127v4-syl-modal-subrow"><span class="d127v4-syl-modal-subdot" style="background:${s.c}"></span><b>${escHtml(s.label)}</b> <span style="color:var(--tx3)">Lessons ${s.lo}–${s.hi} · ${s.hrs}h</span></div>`).join("")+
      `</div>`;
  }
  if(kps.length){
    html+=`<div class="d127v4-syl-modal-sec"><div class="d127v4-syl-modal-h">Milestones in this phase</div>`+
      kps.map(k=>`<div class="d127v4-syl-modal-kp"><span class="d127v4-syl-modal-kp-ic">${ap127KeyPointIconSvg(k.label,14)}</span> ${escHtml(k.label)} <span style="color:var(--tx3)">· Lesson ${k.idx+1}</span></div>`).join("")+
      `</div>`;
  }
  const body=document.getElementById("d127v4-syl-modal-body");
  if(body)body.innerHTML=html;
  const ov=document.getElementById("d127v4-syl-modal-ov");
  if(ov)ov.classList.add("show");
}
function closeAP127SyllabusModal(){const el=document.getElementById("d127v4-syl-modal-ov");if(el)el.classList.remove("show");}
// Click-to-expand explanation for a single milestone icon (Solo/Instrument/Cross-Country/Sim/
// Multi-Engine/Checkride) — shares the same modal DOM as openAP127SyllabusModal (a phase-block
// click and a milestone-icon click are just two ways of populating one generic detail drawer).
// `i` indexes AP127_OVERALL_KPS, the unfiltered list captured by the most recent
// ap127SyllabusStrip() render, so it stays valid regardless of which milestones are currently
// hidden by the zoomed view.
function openAP127MilestoneModal(i){
  const k=AP127_OVERALL_KPS[i];if(!k)return;
  const lesson=k.idx+1;
  const seg=AP127_BAR_SEGMENTS.find(s=>lesson>=s.lo&&lesson<=s.hi);
  const meta=ap127MilestoneMeta(k.label);
  const titleEl=document.getElementById("d127v4-syl-modal-title");
  if(titleEl)titleEl.innerHTML=`<span class="d127v4-syl-modal-title-ic">${ap127KeyPointIconSvg(k.label,18)}</span>${escHtml(k.label)}`;
  const subEl=document.getElementById("d127v4-syl-modal-sub");
  if(subEl)subEl.textContent=`Lesson ${lesson}${seg?` · ${seg.title}`:""}`;
  const body=document.getElementById("d127v4-syl-modal-body");
  if(body)body.innerHTML=`<div class="d127v4-syl-modal-sec"><div class="d127v4-syl-modal-h">What this milestone means</div><p>${escHtml(meta.explain)}</p></div>`;
  const ov=document.getElementById("d127v4-syl-modal-ov");
  if(ov)ov.classList.add("show");
}
// ── Overall Progress Bar View v6 — every SP's own stacked-by-phase bar reads directly against the
// SYLLABUS strip rendered above the chart (ap127SyllabusStrip; no longer a same-height chart row —
// see that function's comment for why). Phase boundaries, key points, and checkrides are now shown
// ONLY in the SYLLABUS strip (as segment blocks / clickable icons) — earlier versions ALSO drew
// them as vertical guide lines with text labels over the SP rows via a markerPlugin, but that
// duplicated the same phase name in two places on screen and cluttered the SP rows themselves
// (user-reported). The per-SP chart now shows just the plain phase-colored stacked bars plus each
// SP's current/next-lesson text (currentLabelPlugin) — genuinely per-SP data, not a repeat of
// syllabus-wide information the strip already covers. ──
function buildAP127OverallChart(all,curriculum,maxDate){
  const sorted=ap127PaceSort(all,ap127AsOf());
  const cur=G.cur127||[];
  const totalLessons=cur.length||curriculum||96;
  AP127_OVERALL_TOTAL=totalLessons;
  const inSeg=(code,seg)=>{const n=ap127LessonNum(code);return n!=null&&n>=seg.lo&&n<=seg.hi;};
  const datasets=AP127_BAR_SEGMENTS.map(seg=>({
    label:seg.label,
    data:sorted.map(s=>(s.flown||[]).filter(f=>inSeg(f.lesson,seg)).length),
    backgroundColor:seg.c,
    stack:"prog",
  }));
  const remainingData=sorted.map(s=>Math.max(0,totalLessons-(s.done||0)));
  datasets.push({label:"Remaining",data:remainingData,backgroundColor:"rgba(255,255,255,0.06)",stack:"prog"});
  const labels=sorted.map(s=>ap127ShortName(s.name));

  const stripEl=document.getElementById("d127v4-syllabus-strip");
  ap127SetSyllabusStripHtml(stripEl,ap127SyllabusStrip(cur,totalLessons,0,totalLessons));

  // AP127 Targets: today's (or the As-Of date's) interpolated target lesson — every SP is expected
  // to have reached at least this lesson. Used to color each SP's current/next-lesson label
  // (green = at/ahead of target, rose = behind) and to draw one single reference line on the chart
  // (targetLinePlugin) — kept deliberately minimal (one line, not per-row) per the earlier
  // decluttering pass; only currentLabelPlugin's existing per-row text gets a color, no new lines
  // added per row.
  const todayTargetLesson=window.ap127TargetLessonForDate?window.ap127TargetLessonForDate(ap127AsOf()):null;
  const currentLabelPlugin={
    id:"d127v4CurrentLabel",
    afterDatasetsDraw(chart){
      const{ctx}=chart;
      ctx.save();ctx.font="9px JetBrains Mono, monospace";ctx.textAlign="left";ctx.textBaseline="middle";
      const meta=chart.getDatasetMeta(AP127_BAR_SEGMENTS.length-1); // end of the last real segment = done position
      sorted.forEach((s,i)=>{
        const bar=meta.data[i];if(!bar)return;
        const last=(s.flown||[]).at(-1);
        const txt=(s.next_lesson==="COMPLETE"?"✓ COMPLETE":(s.next_lesson||last?.lesson||"-"));
        const hit=todayTargetLesson==null?null:(s.done||0)>=todayTargetLesson;
        ctx.fillStyle=hit==null?"#8b949e":hit?"#4ade80":"#f43f5e";
        ctx.fillText(txt,bar.x+4,bar.y);
      });
      ctx.restore();
    }
  };
  const targetLinePlugin={
    id:"d127v4TargetLine",
    afterDatasetsDraw(chart){
      if(todayTargetLesson==null)return;
      const{ctx,scales:{x,y}}=chart;
      if(todayTargetLesson<x.min||todayTargetLesson>x.max)return;
      const px=x.getPixelForValue(todayTargetLesson);
      ctx.save();
      ctx.strokeStyle="#f43f5e";ctx.lineWidth=1.5;ctx.setLineDash([5,3]);
      ctx.beginPath();ctx.moveTo(px,y.top);ctx.lineTo(px,y.bottom);ctx.stroke();
      ctx.setLineDash([]);
      ctx.font="700 8px JetBrains Mono, monospace";ctx.fillStyle="#f43f5e";ctx.textAlign="center";ctx.textBaseline="bottom";
      ctx.fillText(`TARGET · L${Math.round(todayTargetLesson)}`,px,y.top-2);
      ctx.restore();
    }
  };
  const legend=document.getElementById("d127v4-overall-legend");
  if(legend){
    // The two extra chips at the end spell out what currentLabelPlugin's green/rose bar-end text
    // color means — it's vs. the AP127 TARGET (the batch-wide pacing schedule), a different
    // reference than "Plan" (the curriculum's own planned_date schedule, used everywhere else in
    // this tab, e.g. Combined Progress vs Plan) — without this, green/rose text reads as generic
    // "good/bad" with no stated reference, easily mistaken for tracking Plan instead.
    legend.innerHTML=AP127_BAR_SEGMENTS.map(d=>`<span class="d127-pc" title="${escHtml(d.title)}"><span class="d127-pdot" style="background:${d.c}"></span>${d.label}</span>`).join("")
      +`<span class="d127-pc" style="margin-left:10px"><span class="d127-pdot" style="background:#ec4899;border-radius:2px;width:14px;height:3px"></span>SE→ME changeover</span>`
      +`<span class="d127-pc"><span class="d127-pdot" style="background:#f43f5e;border-radius:2px;width:14px;height:3px"></span>AP127 target</span>`
      +`<span class="d127-pc" title="Bar-end lesson text color = vs AP127 Target, not vs Plan"><span class="d127-pdot" style="background:#4ade80;border-radius:50%;width:8px;height:8px"></span>text = at/ahead of target</span>`
      +`<span class="d127-pc" title="Bar-end lesson text color = vs AP127 Target, not vs Plan"><span class="d127-pdot" style="background:#f43f5e;border-radius:50%;width:8px;height:8px"></span>text = behind target</span>`;
  }
  CHARTS.ap127overall=mkC("d127v4-overall",{
    type:"bar",
    data:{labels,datasets},
    options:{
      indexAxis:"y",responsive:true,maintainAspectRatio:false,
      plugins:{
        datalabels:{display:false},
        legend:{display:false},
        tooltip:{filter:item=>item.dataset.label!=="Remaining",callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.parsed.x} lessons`}},
        // Interactive pan/zoom (chartjs-plugin-zoom, already loaded globally — same plugin the
        // Combined Progress vs Plan chart uses via cpvResetZoom). 'xy' mode lets a wide batch
        // scroll/zoom both across lesson number (x) and down through SP rows (y). Bare mouse-wheel
        // zoom was dropped (user-reported: "all over the place... very sensitive") — a wheel
        // handler on a chart embedded in a normally-scrolling page fires on every incidental
        // scroll-past, not just deliberate zoom intent. Wheel zoom now requires holding Ctrl/⌘
        // (modifierKey) at a slower speed, so plain scrolling behaves like plain scrolling; the
        // +/− buttons (ap127OverallZoomV4) are the primary, predictable, discoverable zoom control.
        // Pinch stays unconditional since a two-finger touch gesture is inherently deliberate.
        zoom:{
          zoom:{wheel:{enabled:true,modifierKey:"ctrl",speed:0.06},pinch:{enabled:true},mode:"xy",onZoomComplete:()=>ap127SyncSyllabusStrip()},
          pan:{enabled:true,mode:"xy",onPanComplete:()=>ap127SyncSyllabusStrip()},
        }
      },
      scales:{
        x:{stacked:true,min:0,max:totalLessons,ticks:{font:{family:"JetBrains Mono",size:8},color:"#8b949e"},grid:{color:"#21262d"},title:{display:true,text:"Lesson number",color:"#6e7681",font:{family:"JetBrains Mono",size:8}}},
        y:{stacked:true,afterFit:scale=>{scale.width=100;},ticks:{font:{family:"JetBrains Mono",size:8},color:"#8b949e",autoSkip:false},grid:{color:"#21262d"}}
      }
    },
    plugins:[currentLabelPlugin,targetLinePlugin]
  });
}

function ap127OverallResetZoom(){
  const chart=CHARTS.ap127overall;
  if(chart&&chart.resetZoom)chart.resetZoom();
  ap127SyncSyllabusStrip();
}
// Explicit +/− zoom buttons — the primary zoom control (see the zoom-plugin comment in
// buildAP127OverallChart for why bare wheel-zoom was removed). A fixed 1.25x/0.8x step per click
// is predictable; repeated clicks compound smoothly since chart.zoom() multiplies the current
// range each call.
function ap127OverallZoom(factor){
  const chart=CHARTS.ap127overall;
  if(chart&&chart.zoom)chart.zoom(factor);
  ap127SyncSyllabusStrip();
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

  // AP127 Targets overlay — a batch-wide milestone schedule (date -> the lesson number every SP is
  // expected to have reached by then; window.ap127TargetLessonForDate/ap127GetMilestoneTargets,
  // js/ap127-targets-data.js), independent of the curriculum's own planned_date schedule (Plan
  // above). Converted to this chart's batch-aggregate units: lessons mode = target lesson x n
  // students; hours mode = cumulative planned hours through that lesson x n students (each
  // lesson's own standard duration, summed — same "hours" convention as everywhere else in this tab).
  const targetsRaw=(window.ap127GetMilestoneTargets?window.ap127GetMilestoneTargets():[]).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const curByLessonNum=[...curriculum].filter(c=>ap127LessonNum(c.lesson)!=null).sort((a,b)=>ap127LessonNum(a.lesson)-ap127LessonNum(b.lesson));
  const cumPlannedMinsToLesson=lessonNum=>{let mins=0;for(const c of curByLessonNum){if(ap127LessonNum(c.lesson)>lessonNum)break;mins+=c.planned_mins||0;}return mins;};
  const targetBatchValue=lessonNum=>isHrs?cumPlannedMinsToLesson(lessonNum)*n/60:lessonNum*n;
  // Clipped to endDate exactly like planSeries/actSeries above — without this, selecting "To Today"
  // (CPV_FILTER==='today') had no visible effect on the x-axis: Chart.js autoscales x to the union
  // of every dataset's points, and the Targets schedule's own points run out to 2026-11-29
  // regardless of the filter, so the "zoom to what's happened so far" toggle was silently defeated
  // the moment this series was added (p140). scales.x.min/max below is a second, belt-and-braces
  // fix so no future dataset can do this again even if a filter step here is missed.
  const targetSeries=targetsRaw.filter(t=>t.date<=endDate).map(t=>({x:t.date,y:+targetBatchValue(t.lesson).toFixed(2)}));
  const todayTargetLesson=window.ap127TargetLessonForDate?window.ap127TargetLessonForDate(today,targetsRaw):null;
  const targetVariance=todayTargetLesson!=null?totalDone-targetBatchValue(todayTargetLesson):null;

  const fmt=v=>isHrs?v.toFixed(1):String(Math.round(v));
  const pct=(totalDone/totalPlan*100).toFixed(1);
  const varDays=Math.round(Math.abs(variance)/pace30);
  const varStr=variance>=0?`+${varDays}d ahead`:`${varDays}d behind`;
  const varC=variance>=0?'var(--done)':'#ef4444';
  const kpis=[
    {l:'Done / Total',v:`${fmt(totalDone)} / ${fmt(totalPlan)}`,s:`${pct}% complete`,c:'var(--c127)'},
    {l:'Proj 30d Finish',v:ap127FmtDate(projEndDate30),s:`${(pace30*7).toFixed(1)} ${unit}/wk`,c:'#38bdf8'},
    {l:'Proj 15d Finish',v:ap127FmtDate(projEndDate15),s:`${(pace15*7).toFixed(1)} ${unit}/wk`,c:'#fb923c'},
    {l:'Plan Finish',v:ap127FmtDate(planEnd),s:'per curriculum',c:'#8b949e'},
    {l:'vs Plan Today',v:`${variance>=0?'+':''}${isHrs?variance.toFixed(1):Math.round(variance)} ${unit}`,s:varStr,c:varC},
  ];
  if(todayTargetLesson!=null){
    const tvC=targetVariance>=0?'var(--done)':'#f43f5e';
    kpis.push({l:'vs Target Today',v:`${targetVariance>=0?'+':''}${isHrs?targetVariance.toFixed(1):Math.round(targetVariance)} ${unit}`,s:`target = every SP at L${Math.round(todayTargetLesson)}`,c:tvC});
  }
  const kpiEl=document.getElementById('cpv-kpis-v4');
  if(kpiEl)kpiEl.innerHTML=kpis.map(k=>`<div class="cpv-kpi"><div class="cpv-kl">${k.l}</div><div class="cpv-kv" style="color:${k.c}">${k.v}</div><div class="cpv-ks">${k.s}</div></div>`).join('');

  CHARTS.ap127combined=mkC('d127v4-combined',{
    type:'line',
    data:{datasets:[
      {label:'Plan',    data:planSeries,  borderColor:'#cbd5e1',borderDash:[6,4],borderWidth:1.5,pointRadius:0,tension:0,order:3},
      {label:'Target',  data:targetSeries,borderColor:'#f43f5e',borderDash:[5,2],borderWidth:2,pointRadius:2.5,pointBackgroundColor:'#f43f5e',pointBorderWidth:0,tension:0,order:1.5},
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
        x:{type:'time',min:firstDate,max:endDate,time:{unit:'month',displayFormats:{day:'d MMM',week:'d MMM',month:'MMM yy'}},
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
  // Lag-only view: this chart's whole purpose is tracking how far behind schedule the batch is,
  // and the batch is realistically always behind (never meaningfully ahead), so a signed
  // lead/lag line spent almost all its time in negative territory with the "ahead" half of the
  // scale doing nothing. Flipped per explicit request: y = max(0, planned − actual) — floored at
  // zero, so a day the batch is on-plan OR ahead reads as flat zero, not a dip below the axis.
  let rAct=0,rPlan=0;
  const lags=[];
  const batchData=labels.map(d=>{
    rAct+=(actualByDate[d]||0);
    rPlan+=(planByDate[d]||0);
    const lag=Math.max(0,+(rPlan-rAct).toFixed(2));
    lags.push(lag);
    return{x:d,y:lag};
  });
  const nowLag=lags.at(-1)||0;
  const worstLag=Math.max(...lags);
  const bestLag=Math.min(...lags);
  const fmt=v=>isHrs?v.toFixed(1)+'h':Math.round(v)+' les';
  const kpiEl=document.getElementById('hist-batch-kpis-v4');
  if(kpiEl)kpiEl.innerHTML=[
    {l:'Now',       v:nowLag>0?fmt(nowLag):'On plan',   c:nowLag>0?'#ef4444':'var(--done)', s:'behind schedule today'},
    {l:'Best',      v:fmt(bestLag),                      c:bestLag>0?'var(--tx)':'var(--done)', s:'closest to plan ever'},
    {l:'Worst',     v:fmt(worstLag),                     c:'#ef4444',                        s:'peak lag ever'},
  ].map(k=>`<div class="cpv-kpi"><div class="cpv-kl">${k.l}</div><div class="cpv-kv" style="color:${k.c}">${k.v}</div><div class="cpv-ks">${k.s}</div></div>`).join('');
  CHARTS.ap127histBatch=mkC('d127v4-hist-batch',{
    type:'line',
    data:{datasets:[{
      label:'Batch Lag',
      data:batchData,
      borderColor:'#ef4444',
      borderWidth:2,
      pointRadius:0,
      pointHoverRadius:4,
      pointHoverBackgroundColor:'#ef4444',
      tension:0.15,
      fill:{target:{value:0},above:'rgba(239,68,68,0.14)'}
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
          label:ctx=>{const v=ctx.raw?.y;if(v==null)return null;return v>0?`Lag: ${isHrs?v.toFixed(1)+'h':Math.round(v)+' les'} behind`:'On plan or ahead';}
        }}
      },
      scales:{
        x:{type:'time',time:{unit:'month',displayFormats:{day:'d MMM',week:'d MMM',month:'MMM yy'}},
          ticks:{font:{family:'JetBrains Mono',size:8},color:'#6e7681',maxTicksLimit:14,source:'auto'},
          grid:{color:'#21262d'}},
        y:{beginAtZero:true,ticks:{font:{family:'JetBrains Mono',size:9},color:'#8b949e',callback:v=>isHrs?v.toFixed(0)+'h':v},
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
      // Skip hidden datasets — without this, isolating a single SP in Pace Distribution (solo) via
      // AP127_RACE_SOLO (hidden:true on every other student's dataset, not removed) still let
      // every OTHER student's Y-range pull the auto-fit wide, defeating the point of isolating one.
      if(ds.hidden)return;
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
let AP127V4_LB_START=null; // custom range start ("YYYY-MM-DD"), null = earliest flight (full range default)
let AP127V4_LB_END=null;   // custom range end, null = today
let AP127V4_LB_BREAKDOWN=false; // split each bar into Dual/Solo/Simulator lessons
function setLBUnit(u){AP127V4_LB_UNIT=u;document.querySelectorAll(".lb-unit").forEach(b=>b.classList.toggle("sel",b.dataset.u===u));buildAP127LessonBar();}
function setLBPeriod(p){AP127V4_LB_PERIOD=p;document.querySelectorAll(".lb-period").forEach(b=>b.classList.toggle("sel",b.dataset.p===p));buildAP127LessonBar();}
function setLBShowAll(){
  AP127V4_LB_SHOWALL=!AP127V4_LB_SHOWALL;
  document.querySelectorAll(".lb-showall").forEach(b=>b.classList.toggle("sel",!AP127V4_LB_SHOWALL));
  buildAP127LessonBar();
}
function ap127SetLBRange(which,val){
  if(which==="start")AP127V4_LB_START=val||null;else AP127V4_LB_END=val||null;
  buildAP127LessonBar();
}
function ap127ResetLBRange(){
  AP127V4_LB_START=null;AP127V4_LB_END=null;
  const s=document.getElementById("d127v4-lb-start");if(s)s.value="";
  const e=document.getElementById("d127v4-lb-end");if(e)e.value="";
  buildAP127LessonBar();
}
function ap127ToggleLBBreakdown(){
  AP127V4_LB_BREAKDOWN=!AP127V4_LB_BREAKDOWN;
  document.querySelectorAll(".lb-breakdown").forEach(b=>b.classList.toggle("sel",AP127V4_LB_BREAKDOWN));
  buildAP127LessonBar();
}
// The panel's explanation paragraph is hidden by default behind the ⓘ button in the header —
// same content, just not taking up space until someone actually wants it.
function ap127ToggleLBInfo(){
  const el=document.getElementById("d127v4-lb-note");
  if(el)el.style.display=el.style.display==="none"?"":"none";
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
// Simple linear projection for an in-progress period: "if the rest of this period keeps pace with
// what's logged so far, where would it end up." Day view has no meaningful sub-day data to
// extrapolate from (a day IS this chart's finest grain), so it returns actualSoFar unchanged —
// honest rather than inventing a number from nothing.
function ap127v4ProjectPeriod(key,period,actualSoFar,today){
  if(period==="day")return actualSoFar;
  const start=new Date(key+"T00:00:00Z");
  const elapsedDays=Math.max(1,Math.floor((new Date(today+"T00:00:00Z")-start)/86400000)+1);
  const totalDays=period==="week"?7:new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
  const frac=Math.min(1,elapsedDays/totalDays);
  return frac>0?actualSoFar/frac:actualSoFar;
}
function buildAP127LessonBar(){
  const all=ap127AsOfStudents();if(!all.length)return;
  const today=ap127AsOf();
  const cur=G.cur127||[];
  const lessonsMap={};cur.forEach(c=>{lessonsMap[c.lesson]=c.planned_mins||0;});
  const isHrs=AP127V4_LB_UNIT==="hours";
  const period=AP127V4_LB_PERIOD;
  const breakdown=AP127V4_LB_BREAKDOWN;

  let firstFlownDate=null;
  all.forEach(s=>(s.flown||[]).forEach(f=>{if(f.date&&f.date<=today&&(firstFlownDate===null||f.date<firstFlownDate))firstFlownDate=f.date;}));
  if(firstFlownDate===null)return;
  // Date range: defaults to full history (earliest flight → today); a custom start/end from the
  // panel's date inputs narrows it. End is clamped to never exceed today (no data past it anyway);
  // start is honored even if before any real flight (an intentionally wide "expected range" view
  // just renders leading zero bars, which is a legitimate thing to want to see).
  let rangeStart=AP127V4_LB_START||firstFlownDate;
  let rangeEnd=(AP127V4_LB_END&&AP127V4_LB_END<today)?AP127V4_LB_END:today;
  if(rangeStart>rangeEnd)rangeStart=rangeEnd;
  const atToday=rangeEnd===today;

  const byPeriod={},byPeriodType={};
  all.forEach(s=>(s.flown||[]).forEach(f=>{
    if(!f.date||f.date<rangeStart||f.date>rangeEnd)return;
    const key=ap127v4PeriodKey(f.date,period);
    const v=isHrs?(lessonsMap[f.lesson]||ap127FlightMins(f)||0)/60:1;
    byPeriod[key]=(byPeriod[key]||0)+v;
    // Always accumulated (not gated behind the "By Type" bar-view toggle) — the KPI summary row
    // below needs Dual/Solo/Simulator totals regardless of whether the stacked breakdown is
    // currently shown on the bars themselves.
    const t=ap127LessonType(f.lesson);
    const bucket=byPeriodType[key]=byPeriodType[key]||{Dual:0,Solo:0,Simulator:0};
    bucket[t]+=v;
  }));
  const allKeys=ap127v4PeriodRange(rangeStart,rangeEnd,period);
  const keys=AP127V4_LB_SHOWALL?allKeys:allKeys.filter(k=>byPeriod[k]>0);
  if(!keys.length)return;
  const values=keys.map(k=>+((byPeriod[k]||0).toFixed(2)));
  const dualVals=keys.map(k=>+((byPeriodType[k]?.Dual||0).toFixed(2)));
  const soloVals=keys.map(k=>+((byPeriodType[k]?.Solo||0).toFixed(2)));
  const simVals=keys.map(k=>+((byPeriodType[k]?.Simulator||0).toFixed(2)));
  const maWindow=period==="day"?7:period==="week"?4:3;
  const ma=values.map((_,i)=>{
    const lo=Math.max(0,i-maWindow+1);
    const slice=values.slice(lo,i+1);
    return +(slice.reduce((a,v)=>a+v,0)/slice.length).toFixed(2);
  });
  const fmtLbl=k=>period==="month"?new Date(k+"T00:00:00").toLocaleDateString("en-GB",{month:"short",year:"2-digit"}):ap127ShortDate(k);
  const labels=keys.map(fmtLbl);
  const showLabels=keys.length<=45;
  const fmtVal=v=>isHrs?v.toFixed(1)+"h":Math.round(v)+" les";

  // Compact summary row (Total / Dual / Solo / Simulator) for whatever's currently visible —
  // same date range / unit / "Hide off days" filter as the bars themselves, independent of
  // whether the "By Type" stacked view is toggled on.
  const kpiEl=document.getElementById("d127v4-lb-kpis");
  if(kpiEl){
    const totalSum=values.reduce((a,v)=>a+v,0);
    const dualSum=dualVals.reduce((a,v)=>a+v,0);
    const soloSum=soloVals.reduce((a,v)=>a+v,0);
    const simSum=simVals.reduce((a,v)=>a+v,0);
    const pct=v=>totalSum>0?Math.round(v/totalSum*100)+"%":"—";
    const kpi=(label,val,sub,color)=>`<div class="cpv-kpi"><div class="cpv-kl">${label}</div><div class="cpv-kv" style="color:${color}">${val}</div><div class="cpv-ks">${sub}</div></div>`;
    kpiEl.innerHTML=
      kpi("Total",fmtVal(totalSum),`${keys.length} ${period}${keys.length===1?"":"s"}`,"var(--c127)")+
      kpi("Dual",fmtVal(dualSum),pct(dualSum),AP127_LESSON_TYPE_COLORS.Dual)+
      kpi("Solo",fmtVal(soloSum),pct(soloSum),AP127_LESSON_TYPE_COLORS.Solo)+
      kpi("Simulator",fmtVal(simSum),pct(simSum),AP127_LESSON_TYPE_COLORS.Simulator);
  }

  // The latest bar is "open" (still forming) whenever it's the period today falls inside — a Day
  // bar for today, or the Week/Month bar that today is partway through. An open period's total is
  // inherently partial, so it's excluded from the target/gap comparison (below) and gets its own
  // distinct visual treatment (hollow dashed outline + a projected "where might this land" cap —
  // see the bar-dataset construction and lbOpenPlugin further down).
  const openIdx=keys.length-1;
  const latestIsOpen=atToday&&keys[openIdx]===ap127v4PeriodKey(today,period);

  // AP127 required-pace target — reuses ap127RequiredPace(), the exact formula the Pace Monitor's
  // Per Day/Week/Month tables use (see that function's own comment), so THIS number is provably
  // identical to Pace Monitor's "Required" figure. "Actual" is the latest CLOSED bar's own raw
  // value (not the still-forming open bar's partial total — comparing a partial period against a
  // full-period target is misleading, and not the open bar, since a number that doesn't
  // correspond to what's drawn there would be confusing — see gapIdx below) and not a smoothed
  // rolling-window figure either (an earlier version tried that specifically so the gap number
  // matched Pace Monitor's exactly, but that meant the line floated away from any real bar, which
  // was worse). Only drawn when the visible range extends to today AND there's an actual closed
  // bar to compare against.
  // gapIdx must reference the CALENDAR period immediately before today's period, not just
  // "whatever entry precedes openIdx in `keys`" — when "Hide off days" (AP127V4_LB_SHOWALL=false)
  // strips zero-activity periods out of `keys`, the entry right before openIdx can be an
  // arbitrarily older, non-adjacent period (e.g. several idle days/weeks back), silently breaking
  // the "latest CLOSED period" claim this overlay's own legend/note makes. Resolve the true
  // immediately-preceding key against the unfiltered `allKeys` first, then look it up in the
  // (possibly filtered) `keys`/`values` arrays actually being plotted; if that exact period was
  // filtered out (zero activity), gapIdx comes back -1 and the existing `gapIdx>=0` guard on
  // showTarget below correctly suppresses the overlay rather than silently comparing against a
  // stale bar. With "Hide off days" off (the default), keys===allKeys and this reduces to the
  // original openIdx-1.
  const gapIdx=latestIsOpen?(()=>{
    const openKeyPos=allKeys.indexOf(keys[openIdx]);
    const prevCalKey=openKeyPos>0?allKeys[openKeyPos-1]:null;
    return prevCalKey!=null?keys.indexOf(prevCalKey):-1;
  })():openIdx;
  const reqPace=ap127RequiredPace();
  const target=(reqPace&&atToday)
    ?(period==="day"?(isHrs?reqPace.reqDayHrsB:reqPace.reqDayLesB)
      :period==="week"?(isHrs?reqPace.reqWeekHrsB:reqPace.reqWeekLesB)
      :(isHrs?reqPace.reqMonthHrsB:reqPace.reqMonthLesB))
    :null;
  const showTarget=target!=null&&atToday&&gapIdx>=0;
  const actualPace=showTarget?values[gapIdx]:null;
  const gap=showTarget?(actualPace-target):null;

  // Open-bar projection: linear extrapolation from days-elapsed-so-far within the period (see
  // ap127v4ProjectPeriod's own comment on why Day view can't meaningfully project further).
  const projectedTotal=latestIsOpen?ap127v4ProjectPeriod(keys[openIdx],period,values[openIdx],today):null;
  const projectedRemainder=latestIsOpen?Math.max(0,projectedTotal-values[openIdx]):0;
  const projectedVals=latestIsOpen?keys.map((_,i)=>i===openIdx?+projectedRemainder.toFixed(2):0):null;
  if(latestIsOpen)labels[openIdx]=labels[openIdx]+" ◐";

  const legendEl=document.getElementById("d127v4-lb-legend");
  if(legendEl){
    const bits=[];
    if(showTarget){
      bits.push(`<span class="d127-pc"><span class="d127-pdot" style="background:#f43f5e;border-radius:2px;width:14px;height:3px"></span>Required</span>`);
      bits.push(`<span class="d127-pc"><span class="d127-pdot" style="background:#38bdf8;border-radius:2px;width:14px;height:3px"></span>Actual (latest closed ${period})</span>`);
      bits.push(`<span class="d127-pc" style="color:var(--tx3)">— Required = same calc as the Pace Monitor's Per ${period==="day"?"Day":period==="week"?"Week":"Month"} row above (batch total)</span>`);
    }
    if(latestIsOpen){
      bits.push(`<span class="d127-pc"><span class="d127-pdot" style="background:transparent;border:1.5px dashed #e88aff;border-radius:2px;width:14px;height:3px"></span>◐ = still forming, dashed cap = projected close</span>`);
    }
    if(bits.length){legendEl.style.display="";legendEl.innerHTML=bits.join("");}
    else legendEl.style.display="none";
  }

  // Open bar gets a white dashed outline (instead of the plain solid fill every closed bar has)
  // so it visually reads as "still forming, not final data" at a glance.
  const openBorderColor=ctx=>latestIsOpen&&ctx.dataIndex===openIdx?"#ffffff":"transparent";
  const openBorderWidth=ctx=>latestIsOpen&&ctx.dataIndex===openIdx?1.5:0;
  const openBorderDash=ctx=>latestIsOpen&&ctx.dataIndex===openIdx?[3,2]:[];

  const datasets=[];
  if(breakdown){
    const segLbl=(vals,color)=>({
      display:ctx=>showLabels&&vals[ctx.dataIndex]>0,
      anchor:"center",align:"center",color:"#0d1117",font:{family:"JetBrains Mono",size:6.5,weight:"700"},
      formatter:v=>isHrs?v.toFixed(1):v
    });
    datasets.push({type:"bar",label:"Dual",data:dualVals,backgroundColor:AP127_LESSON_TYPE_COLORS.Dual,borderColor:openBorderColor,borderWidth:openBorderWidth,borderDash:openBorderDash,stack:"lb",order:3,datalabels:segLbl(dualVals)});
    datasets.push({type:"bar",label:"Solo",data:soloVals,backgroundColor:AP127_LESSON_TYPE_COLORS.Solo,borderColor:openBorderColor,borderWidth:openBorderWidth,borderDash:openBorderDash,stack:"lb",order:3,datalabels:segLbl(soloVals)});
    datasets.push({type:"bar",label:"Simulator",data:simVals,backgroundColor:AP127_LESSON_TYPE_COLORS.Simulator,borderColor:openBorderColor,borderWidth:openBorderWidth,borderDash:openBorderDash,stack:"lb",order:3,datalabels:{
      display:ctx=>showLabels&&(dualVals[ctx.dataIndex]+soloVals[ctx.dataIndex]+simVals[ctx.dataIndex])>0,
      anchor:"end",align:"top",color:"#c9d1d9",font:{family:"JetBrains Mono",size:7,weight:"700"},
      formatter:(v,ctx)=>{const i=ctx.dataIndex;const t=dualVals[i]+soloVals[i]+simVals[i];return isHrs?t.toFixed(1):t;}
    }});
  }else{
    datasets.push({type:"bar",label:isHrs?"Hours":"Lessons",data:values,backgroundColor:"rgba(232,138,255,0.55)",borderColor:openBorderColor,borderWidth:openBorderWidth,borderDash:openBorderDash,borderRadius:2,order:3,stack:"lb"});
  }
  if(latestIsOpen){
    // Hollow dashed "ghost" cap stacked on top of the open bar's real (partial) data, sized to the
    // PROJECTED remainder — reads as "here's roughly where this period might close," distinct
    // from every solid, final bar. Datalabel shows the projected TOTAL (not just the remainder).
    datasets.push({type:"bar",label:"Projected (est.)",data:projectedVals,backgroundColor:"rgba(232,138,255,0.06)",borderColor:"#e88aff",borderWidth:1.5,borderDash:[4,3],stack:"lb",order:2,datalabels:{
      display:ctx=>projectedVals[ctx.dataIndex]>0,
      anchor:"end",align:"top",color:"#e88aff",font:{family:"JetBrains Mono",size:7,weight:"700"},
      formatter:(v,ctx)=>`~${fmtVal(values[ctx.dataIndex]+v)}`
    }});
  }
  datasets.push({type:"line",label:`${maWindow}-period moving avg`,data:ma,borderColor:"#38bdf8",borderWidth:2,pointRadius:0,tension:.25,order:1,datalabels:{display:false}});

  // Vertical separators: week boundaries (Mondays) in Day view, month boundaries in Week view —
  // Month view needs none since each bar already IS a month.
  const lbSepPlugin=(period==="day"||period==="week")?{
    id:"d127v4LBSep",
    afterDatasetsDraw(chart){
      const{ctx,scales:{y}}=chart;
      const meta=chart.getDatasetMeta(0);
      ctx.save();
      keys.forEach((k,i)=>{
        if(i===0)return;
        let isBoundary=false,label="";
        if(period==="day"){
          isBoundary=new Date(k+"T12:00:00Z").getUTCDay()===1;
        }else{
          isBoundary=k.slice(0,7)!==keys[i-1].slice(0,7);
          if(isBoundary)label=new Date(k+"T12:00:00Z").toLocaleDateString("en-GB",{month:"short"});
        }
        if(!isBoundary)return;
        const bar=meta.data[i];if(!bar)return;
        const lineX=bar.x-(bar.width||10)/2-1;
        ctx.strokeStyle="rgba(255,255,255,0.16)";ctx.lineWidth=1;ctx.setLineDash([2,2]);
        ctx.beginPath();ctx.moveTo(lineX,y.top);ctx.lineTo(lineX,y.bottom);ctx.stroke();
        ctx.setLineDash([]);
        if(label){
          ctx.font="700 8px JetBrains Mono, monospace";ctx.fillStyle="#6e7681";ctx.textAlign="left";ctx.textBaseline="top";
          ctx.fillText(label,lineX+3,y.top+2);
        }
      });
      ctx.restore();
    }
  }:null;

  // Target line + actual-vs-target gap bracket, localized to the latest CLOSED bar (gapIdx — one
  // to the left of the still-open latest bar, when there is one). Labels anchor to the LEFT
  // regardless, since even when gapIdx isn't the very last bar, the open bar immediately to its
  // right is typically narrow/close enough that a right-side label risks colliding with it or the
  // canvas edge — left is always safe.
  const lbTargetPlugin=showTarget?{
    id:"d127v4LBTarget",
    afterDatasetsDraw(chart){
      const{ctx,scales:{y}}=chart;
      const idx=gapIdx;
      const meta=chart.getDatasetMeta(0);
      const bar=meta.data[idx];if(!bar)return;
      const barX=bar.x,halfW=(bar.width||14)/2;
      const targetY=y.getPixelForValue(target);
      const actualY=y.getPixelForValue(actualPace);
      const gapColor=gap>=0?"#4ade80":"#f43f5e";
      const tx=barX-halfW-9;
      ctx.save();
      // Required (rose, from Pace Monitor's formula) and Actual (blue, the latest CLOSED bar's
      // own value) reference lines — both span just that bar's column, each labeled. Since Actual
      // is the bar's own value, this blue line always sits exactly level with that bar's own top.
      ctx.strokeStyle="#f43f5e";ctx.lineWidth=2;ctx.setLineDash([4,3]);
      ctx.beginPath();ctx.moveTo(barX-halfW-6,targetY);ctx.lineTo(barX+halfW+6,targetY);ctx.stroke();
      ctx.strokeStyle="#38bdf8";ctx.lineWidth=1.5;ctx.setLineDash([3,2]);
      ctx.beginPath();ctx.moveTo(barX-halfW-6,actualY);ctx.lineTo(barX+halfW+6,actualY);ctx.stroke();
      ctx.setLineDash([]);
      ctx.font="700 9px JetBrains Mono, monospace";ctx.textAlign="right";ctx.textBaseline="middle";
      ctx.fillStyle="#f43f5e";ctx.fillText(`Required ${fmtVal(target)}`,tx,targetY);
      ctx.fillStyle="#38bdf8";ctx.fillText(`Actual ${fmtVal(actualPace)}`,tx,actualY);
      // Vertical gap bracket between the two reference lines (Actual sits at the bar's own top,
      // so this also visually reads as "bar top vs required pace").
      ctx.strokeStyle=gapColor;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(barX,actualY);ctx.lineTo(barX,targetY);ctx.stroke();
      ctx.beginPath();ctx.moveTo(barX-4,actualY);ctx.lineTo(barX+4,actualY);ctx.moveTo(barX-4,targetY);ctx.lineTo(barX+4,targetY);ctx.stroke();
      ctx.font="700 9px JetBrains Mono, monospace";ctx.fillStyle=gapColor;ctx.textAlign="right";ctx.textBaseline="middle";
      ctx.fillText(`${gap>=0?"+":""}${fmtVal(gap)} gap`,tx,(actualY+targetY)/2);
      ctx.restore();
    }
  }:null;

  const yMax=Math.max(1,...values,...(showTarget?[target,actualPace]:[]),...(latestIsOpen?[projectedTotal]:[]))*1.2;
  CHARTS.ap127lessonBar=mkC("d127v4-lessonbar",{
    type:"bar",
    data:{labels,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{display:true,labels:{color:"#8b949e",font:{family:"JetBrains Mono",size:9},boxWidth:14}},
        datalabels:{
          display:ctx=>showLabels&&!breakdown&&ctx.dataset.type==="bar"&&ctx.dataset.data[ctx.dataIndex]>0,
          anchor:"end",align:"top",color:"#8b949e",font:{family:"JetBrains Mono",size:7},
          formatter:v=>isHrs?v.toFixed(1):v
        },
        tooltip:{callbacks:{label:ctx=>{
          if(ctx.dataset.label==="Projected (est.)")return`Projected total: ~${fmtVal(values[ctx.dataIndex]+ctx.parsed.y)}`;
          return`${ctx.dataset.label}: ${isHrs?ctx.parsed.y.toFixed(1)+"h":ctx.parsed.y}`;
        }}}
      },
      scales:{
        x:{stacked:true,ticks:{font:{family:"JetBrains Mono",size:8},color:"#6e7681",maxRotation:0,autoSkip:true,maxTicksLimit:16},grid:{display:false}},
        y:{stacked:true,beginAtZero:true,suggestedMax:yMax,ticks:{font:{family:"JetBrains Mono",size:9},color:"#8b949e",callback:v=>isHrs?v.toFixed(0)+"h":v},grid:{color:"#21262d"}}
      }
    },
    plugins:[lbSepPlugin,lbTargetPlugin].filter(Boolean)
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
    all.forEach(s=>{
      // Dedup per (student, lesson NUMBER) before counting — a retaken lesson previously counted
      // once per flight record, letting a phase's "Done" segment exceed its own slot total
      // (totalSlots below assumes exactly one completion per curriculum lesson per student) and
      // show over 100% on the datalabel. Same "credit once per SP" principle as the p143 Ops
      // Analytics effective-hours fix.
      const seen=new Set();
      (s.flown||[]).forEach(f=>{
        if(!inPhase(f.lesson,p))return;
        const num=ap127LessonNum(f.lesson);
        if(num==null||seen.has(num))return;
        seen.add(num);done++;
      });
    });
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

// ── Lesson Completion Matrix — a Roster-style heatmap turned 90°: columns are curriculum LESSON
// NUMBER (1..96, fixed) instead of calendar date, so it answers "who's done what" rather than
// "who flew when." Rows are sorted most-behind-target-first (not the usual pace sort) since the
// whole point of this view is spotting AP127 Target lead/lag at a glance. Target-checkpoint
// columns get a rose flag + highlighted border; each SP's next lesson gets an amber ring; a
// retaken lesson gets a small dot badge; a footer row shows batch-wide %-complete per lesson
// (bottleneck spotting) using the same intensity-shading idea as a calendar heatmap, just on the
// lesson axis instead of the date axis. ──
function buildAP127LessonMatrix(){
  if(!G||!G.ap127)return;
  const all=ap127AsOfStudents();if(!all.length)return;
  const today=ap127AsOf();
  const cur=G.cur127||[];
  const totalLessons=cur.length||96;
  const targets=(window.ap127GetMilestoneTargets?window.ap127GetMilestoneTargets():[]).slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const targetByLesson={};targets.forEach(t=>{targetByLesson[t.lesson]=t;});
  const closest=window.ap127ClosestMilestoneTarget?window.ap127ClosestMilestoneTarget(today,targets):null;

  const perSP=all.map(s=>{
    const byLesson={};
    (s.flown||[]).forEach(f=>{
      const n=ap127LessonNum(f.lesson);
      if(n==null)return;
      (byLesson[n]=byLesson[n]||[]).push(f);
    });
    // Unique lesson count (Object.keys(byLesson) is already deduped by lesson NUMBER above),
    // not the raw s.done flight-record count — a student who retook one lesson would otherwise
    // show vsClosest one unit more favorable than reality, since s.done counts every flight
    // including retakes. Same double-count family as the Funnel's phase-completion bug, smaller
    // blast radius (off by ~1 per retake here vs. able to exceed 100% there).
    const uniqueDone=Object.keys(byLesson).length;
    const vsClosest=closest?uniqueDone-closest.lesson:null;
    const nextNum=ap127LessonNum(s.next_lesson);
    return{s,byLesson,vsClosest,nextNum};
  });
  perSP.sort((a,b)=>{
    if(a.vsClosest==null||b.vsClosest==null)return a.s.name.localeCompare(b.s.name);
    return a.vsClosest-b.vsClosest||a.s.name.localeCompare(b.s.name);
  });

  const subEl=document.getElementById("d127v4-lm-sub");
  if(subEl)subEl.textContent=closest?`Sorted by lead/lag vs closest target · ${ap127FmtDate(closest.date)} → Lesson ${closest.lesson}`:"AP127 Targets not configured";

  const legend=document.getElementById("d127v4-lm-legend");
  if(legend){
    legend.innerHTML=AP127_BAR_SEGMENTS.map(d=>`<span class="d127-pc" title="${escHtml(d.title)}"><span class="d127-pdot" style="background:${d.c}"></span>${d.label}</span>`).join("")
      +`<span class="d127-pc" style="margin-left:10px"><span class="d127v4-lm-flag" style="position:static;margin:0 4px 0 0"></span>target checkpoint</span>`
      +`<span class="d127-pc"><span class="d127v4-lm-cell-next" style="width:10px;height:10px;display:inline-block;border-radius:2px;margin-right:4px"></span>next lesson</span>`
      +`<span class="d127-pc"><span class="d127v4-lm-retake-dot" style="position:static;display:inline-block;margin-right:4px"></span>retaken</span>`;
  }

  const CELL_W=Math.max(6,Math.min(13,Math.floor(1000/totalLessons)));
  let headPhase=`<tr class="d127v4-lm-phaserow"><th class="d127v4-lm-name"></th><th class="d127v4-lm-vs"></th>`;
  AP127_BAR_SEGMENTS.forEach(seg=>{
    const span=Math.min(seg.hi,totalLessons)-seg.lo+1;if(span<=0)return;
    headPhase+=`<th colspan="${span}" style="background:${seg.c}" title="${escHtml(seg.title)} · Lessons ${seg.lo}–${Math.min(seg.hi,totalLessons)}"><span class="d127v4-lm-phaselbl">${seg.label}</span></th>`;
  });
  headPhase+="</tr>";

  let headNum=`<tr><th class="d127v4-lm-name">Name</th><th class="d127v4-lm-vs" title="Lead/lag vs the closest AP127 Target checkpoint">${closest?`vs L${closest.lesson}`:"vs Target"}</th>`;
  for(let n=1;n<=totalLessons;n++){
    const tgt=targetByLesson[n];
    const show=n===1||n===totalLessons||n%5===0||tgt;
    headNum+=`<th class="${tgt?"d127v4-lm-target-col":""}" style="width:${CELL_W}px;min-width:${CELL_W}px" title="${tgt?`AP127 Target: Lesson ${n} by ${ap127FmtDate(tgt.date)}`:"Lesson "+n}">${show?`<div class="d127v4-lm-numlbl">${n}</div>`:""}${tgt?'<div class="d127v4-lm-flag"></div>':""}</th>`;
  }
  headNum+="</tr>";

  let bodyHtml="";
  perSP.forEach(({s,byLesson,vsClosest,nextNum})=>{
    const viewIdx=AP127_VIEW_ROWS.findIndex(r=>r.catc_id===s.catc_id);
    const vsColor=vsClosest==null?"var(--tx3)":vsClosest>=0?"var(--done)":"#f43f5e";
    const vsTxt=vsClosest==null?"—":`${vsClosest>=0?"+":""}${vsClosest}`;
    bodyHtml+=`<tr><td class="d127v4-lm-name"><b>${ap127ShortName(s.name)}</b></td><td class="d127v4-lm-vs" style="color:${vsColor}">${vsTxt}</td>`;
    for(let n=1;n<=totalLessons;n++){
      const flights=byLesson[n];
      const tgt=targetByLesson[n];
      const isNext=n===nextNum;
      let bg="var(--s3)",cls="d127v4-lm-cell",title=`${ap127ShortName(s.name)} · Lesson ${n} — not yet flown`,inner="";
      if(flights&&flights.length){
        const ph=ap127SyllabusPhase(String(n));
        bg=ph.c;
        const detail=flights.map(f=>`${ap127FmtDate(f.date)} (${hm(ap127FlightMins(f))||"—"})`).join(", ");
        title=`${ap127ShortName(s.name)} · Lesson ${n} · ${detail}${flights.length>1?" · retaken":""}${viewIdx>=0?" · click for detail":""}`;
        if(flights.length>1)inner='<span class="d127v4-lm-retake-dot"></span>';
      }else if(isNext){
        cls+=" d127v4-lm-cell-next";
        title=`${ap127ShortName(s.name)} · Lesson ${n} — next up`;
      }
      const clickable=flights&&flights.length&&viewIdx>=0;
      bodyHtml+=`<td style="padding:1px"><div class="${cls}${tgt?" d127v4-lm-target-col":""}" style="background:${bg};${clickable?"cursor:pointer":""}" title="${escHtml(title)}" ${clickable?`onclick="openAP127DrawerV4(${viewIdx})"`:""}>${inner}</div></td>`;
    }
    bodyHtml+="</tr>";
  });

  let footHtml=`<tr class="d127v4-lm-footrow"><td class="d127v4-lm-name">BATCH %</td><td class="d127v4-lm-vs"></td>`;
  for(let n=1;n<=totalLessons;n++){
    const doneCount=perSP.filter(p=>p.byLesson[n]&&p.byLesson[n].length).length;
    const pct=perSP.length?doneCount/perSP.length:0;
    const tgt=targetByLesson[n];
    footHtml+=`<td style="padding:1px"><div class="d127v4-lm-cell${tgt?" d127v4-lm-target-col":""}" style="background:color-mix(in oklch, var(--c127) ${Math.round(pct*100)}%, transparent)" title="Lesson ${n} · ${Math.round(pct*100)}% of batch complete (${doneCount}/${perSP.length})"></div></td>`;
  }
  footHtml+="</tr>";

  const el=document.getElementById("d127v4-lesson-matrix");
  if(el)el.innerHTML=`<div class="d127v4-lm-wrap"><table class="d127v4-lm-table"><thead>${headPhase}${headNum}</thead><tbody>${bodyHtml}</tbody><tfoot>${footHtml}</tfoot></table></div>`;
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
  // UTC throughout — same local-parse/UTC-serialize bug already fixed in ap127AllDatesRange()/
  // ap127ActualPace(); left unfixed here it shifts "Last Nd" back a day east of UTC (Bangkok).
  const start=rangeVal===0?batchStart:(()=>{const d=new Date(today+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-rangeVal);return d.toISOString().slice(0,10);})();
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

// Draggable splitter between Progress Ranking and the side column (Pace Distribution etc). Width
// persists to localStorage so it survives tab switches/reloads; a saved width from a much
// narrower/wider viewport is clamped back into range rather than trusted blindly.
function ap127InitSplit(){
  const grid=document.getElementById('d127v4-split-grid');
  const handle=document.getElementById('d127v4-split-handle');
  if(!grid||!handle||handle._init)return;
  handle._init=true;
  const MIN=280;
  const apply=leftPx=>{grid.style.gridTemplateColumns=`${leftPx}px 8px 1fr`;};
  const saved=parseInt(localStorage.getItem('ap127v4SplitLeftPx')||'',10);
  if(!isNaN(saved)){
    // Deferred to the next frame: called right after innerHTML is set, the grid hasn't been
    // laid out yet, so getBoundingClientRect().width reads 0 here and the clamp collapses the
    // saved width down to MIN every time. One rAF later, layout has committed and width is real.
    requestAnimationFrame(()=>{
      const max=Math.max(MIN,grid.getBoundingClientRect().width-8-MIN);
      apply(Math.max(MIN,Math.min(max,saved)));
    });
  }
  let dragging=false;
  const move=e=>{
    if(!dragging)return;
    const r=grid.getBoundingClientRect();
    const max=Math.max(MIN,r.width-8-MIN);
    const leftPx=Math.max(MIN,Math.min(max,e.clientX-r.left));
    apply(leftPx);
  };
  handle.addEventListener('pointerdown',e=>{dragging=true;handle.classList.add('d127v4-dragging');handle.setPointerCapture(e.pointerId);move(e);});
  handle.addEventListener('pointermove',move);
  handle.addEventListener('pointerup',()=>{
    dragging=false;handle.classList.remove('d127v4-dragging');
    const w=grid.style.gridTemplateColumns.split(' ')[0];
    if(w)localStorage.setItem('ap127v4SplitLeftPx',parseInt(w,10));
  });
}

function mountProgress(data){ G = data; initScrubber(); ap127InitSplit(); renderAP127Detail(); }
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

// ── PDF export — "Export PDF" button, snaps the tab's current state ──────────
// Deliberately reads the ALREADY-RENDERED DOM (KPI cards, Pace Monitor tables, Progress Ranking
// rows, chart canvases via Chart.js's own toBase64Image()) rather than recomputing anything from
// G/ap127AsOfStudents() independently — that guarantees the PDF is byte-for-byte what's on screen
// at the moment of export (including any active search filter, sort, time-travel As-Of date, or
// custom Daily Output range), with zero risk of a second, drifted copy of the app's formulas. Runs
// entirely client-side against an in-memory jsPDF document; nothing on the live page is touched or
// changed, except a brief, read-only html2canvas screenshot of the Roster/Lesson Matrix (they're
// plain DOM tables, not Chart.js canvases, so they can't use the same image-export trick).
// Libraries: jsPDF + jspdf-autotable + html2canvas, all loaded via CDN in index.html.
async function ap127ExportPDF(){
  if(!window.jspdf||!window.jspdf.jsPDF){toast("PDF library failed to load — check your connection","er");return;}
  const btn=document.getElementById("d127v4-export-btn");
  const origLabel=btn?btn.textContent:"";
  if(btn){btn.disabled=true;btn.textContent="⏳ Generating…";}
  toast("Generating PDF report…");
  try{
    const { jsPDF }=window.jspdf;
    const doc=new jsPDF({unit:"pt",format:"letter"});
    const MARGIN=44;
    const INK=[13,17,23],RED=[220,38,38],GREEN=[22,163,74],GREY=[110,118,129],MAGENTA=[192,79,214],LGREY=[229,231,235],PANEL=[248,249,251];
    const today=ap127AsOf();
    const isLive=!COHORT_AS_OF;
    let page=1;

    const pageDims=()=>{const s=doc.internal.pageSize;return{w:s.getWidth(),h:s.getHeight()};};
    const footer=()=>{
      const{w,h}=pageDims();
      doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(...GREY);
      doc.text("AP127 Progress Report"+(isLive?" — LIVE":" — time-travel as of "+ap127FmtDate(today)),MARGIN,h-24);
      doc.text("Page "+page,w-MARGIN,h-24,{align:"right"});
      doc.setDrawColor(...LGREY);doc.line(MARGIN,h-34,w-MARGIN,h-34);
    };
    const newPage=(landscape)=>{footer();doc.addPage("letter",landscape?"landscape":"portrait");page++;};
    const sectionTitle=(t,y)=>{doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(...MAGENTA);doc.text(t,MARGIN,y);return y+16;};
    const kpiRow=(y,cards,w0)=>{
      const{w}=pageDims();const cw=(w-2*MARGIN)/cards.length;
      cards.forEach((c,i)=>{
        const x=MARGIN+i*cw;
        doc.setDrawColor(...LGREY);doc.setFillColor(...PANEL);
        doc.roundedRect(x+2,y,cw-8,58,3,3,"FD");
        doc.setFont("helvetica","bold");doc.setFontSize(7.5);doc.setTextColor(...GREY);
        doc.text(c.l,x+cw/2-4,y+16,{align:"center"});
        doc.setFont("helvetica","bold");doc.setFontSize(15);doc.setTextColor(...(c.c||INK));
        doc.text(c.v,x+cw/2-4,y+35,{align:"center"});
        doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(...GREY);
        doc.text(c.s,x+cw/2-4,y+48,{align:"center",maxWidth:cw-14});
      });
      return y+70;
    };
    // Chart.js's own PNG export — crisp (reads the canvas's actual, already-devicePixelRatio-scaled
    // bitmap), always in sync with whatever's currently drawn (zoom/pan state, active toggles).
    const addChartImage=(chartKey,y,maxW,maxH)=>{
      const chart=CHARTS[chartKey];if(!chart)return y;
      const img=chart.toBase64Image("image/png",1);
      const iw=chart.canvas.width,ih=chart.canvas.height;
      const scale=Math.min(maxW/iw,maxH/ih);
      const w=iw*scale,h=ih*scale;
      // "MEDIUM" engages jsPDF's own PNG re-compression — its default embed is near-uncompressed
      // (confirmed via `pdfimages -list`, which showed every chart image at 100% storage ratio,
      // ~9 chart images alone bloating an early build of this feature to 21MB+). Chart backgrounds
      // are transparent (Chart.js's default), so this stays PNG rather than JPEG to preserve that.
      doc.addImage(img,"PNG",MARGIN,y,w,h,undefined,"MEDIUM");
      return y+h+10;
    };
    const noteText=(t,y,w)=>{
      doc.setFont("helvetica","italic");doc.setFontSize(8.5);doc.setTextColor(...GREY);
      const lines=doc.splitTextToSize(t,w||(pageDims().w-2*MARGIN));
      doc.text(lines,MARGIN,y);
      return y+lines.length*10+6;
    };
    // .innerText (not .textContent) — respects rendered line breaks (many cells here are two lines
    // via <br>, e.g. "SE<br>TYPE" or "Month<br>(30d)"; .textContent has no concept of layout and
    // would run them together as "SETYPE"/"Month(30d)" with zero separating space).
    const txt=(el)=>(el?.innerText||el?.textContent||"").replace(/\s+/g," ").trim();
    // Reads an already-rendered HTML table's rows into a plain string[][] — used for every table in
    // this export (Progress Ranking, Pace Monitor, Watchlist) so the PDF can never disagree with
    // what's on screen; jspdf-autotable renders them as real, selectable text, not a screenshot.
    const readTable=(sel)=>Array.from(document.querySelectorAll(sel)).map(tr=>
      Array.from(tr.children).map(td=>txt(td)));

    const all=ap127AsOfStudents();
    const n=all.length;
    const curriculum=G.cur127||[];
    const curriculumHrs=ap127CurriculumHours();

    // ---------------------------------------------------------------- COVER + BATCH SUMMARY
    doc.setFont("helvetica","bold");doc.setFontSize(22);doc.setTextColor(...INK);
    doc.text("AP127 PROGRESS REPORT",MARGIN,80);
    doc.setFont("helvetica","normal");doc.setFontSize(11);doc.setTextColor(...GREY);
    doc.text("Batch AP-127 · CATC CPL/IR Integrated Course · Snapshot export",MARGIN,98);
    let y=130;
    doc.setFontSize(9.5);
    [["Report generated",new Date().toISOString().slice(0,16).replace("T"," ")+" UTC"],
     ["Data as of",isLive?ap127FmtDate(today)+" (live)":ap127FmtDate(today)+" (time travel)"],
     ["Students",n+" SP"],
     ["Curriculum",`${curriculum.length} lessons · ${curriculumHrs.toFixed(0)}h`]].forEach(([k,v])=>{
      doc.setFont("helvetica","bold");doc.setTextColor(...GREY);doc.text(k,MARGIN,y);
      doc.setFont("helvetica","normal");doc.setTextColor(...INK);doc.text(String(v),MARGIN+130,y);
      y+=16;
    });
    y+=16;
    y=sectionTitle("Batch Summary",y);
    const gt=(id)=>document.getElementById(id)?.textContent?.trim()||"—";
    const hrsNeg=gt("d127v4-k-hrs").trim().startsWith("-");
    const lesNeg=gt("d127v4-k-les").trim().startsWith("-");
    y=kpiRow(y,[
      {l:"BATCH PROGRESS",v:gt("d127v4-k-prg"),s:gt("d127v4-k-prg-s")},
      {l:"STUDENTS",v:gt("d127v4-k-stu"),s:gt("d127v4-k-stu-s")},
      {l:"HRS DONE / PLAN",v:gt("d127v4-k-hrs"),s:gt("d127v4-k-hrs-s"),c:hrsNeg?RED:GREEN},
      {l:"LESSONS DONE / PLAN",v:gt("d127v4-k-les"),s:gt("d127v4-k-les-s"),c:lesNeg?RED:GREEN},
    ]);
    y=noteText(gt("d127v4-meta"),y+8);

    // ---------------------------------------------------------------- PACE MONITOR
    y=sectionTitle("Pace Monitor · Situation vs Target",y+10);
    const paceCards=Array.from(document.querySelectorAll("#d127v4-pace-body .d127v4-card")).map(c=>({
      l:c.querySelector(".d127-kl")?.textContent.trim(),
      v:c.querySelector(".d127-kv")?.textContent.trim(),
      s:c.querySelector(".d127-ks")?.textContent.trim(),
    }));
    if(paceCards.length)y=kpiRow(y,paceCards.map(c=>({...c,c:/^-|^0$/.test(c.v)&&c.l==="At Risk"?RED:undefined})));
    const paceTables=document.querySelectorAll("#d127v4-pace-body .d127v4-pace-tbl-wrap");
    paceTables.forEach(wrap=>{
      const title=txt(wrap.querySelector(".d127v4-sec-lbl"));
      const rows=Array.from(wrap.querySelectorAll("tbody tr")).map(tr=>
        Array.from(tr.children).map(td=>txt(td)));
      doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(...INK);doc.text(title,MARGIN,y+10);
      doc.autoTable({
        startY:y+16,margin:{left:MARGIN,right:MARGIN},
        head:[["Period","Req (h)","Act (h)","Gap (h)","Req (les)","Act (les)","Gap (les)"]],
        body:rows,styles:{fontSize:8,cellPadding:4},headStyles:{fillColor:INK,textColor:255},
        columnStyles:{0:{fontStyle:"bold"}},
      });
      y=doc.lastAutoTable.finalY+14;
    });
    const actionMsg=txt(document.querySelector("#d127v4-pace-body .d127v4-action-banner"));
    if(actionMsg){
      const{w}=pageDims();
      const lines=doc.splitTextToSize(actionMsg,w-2*MARGIN-20);
      const bh=lines.length*11+16;
      doc.setFillColor(254,242,242);doc.setDrawColor(...RED);doc.roundedRect(MARGIN,y,w-2*MARGIN,bh,3,3,"FD");
      doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(...INK);
      doc.text(lines,MARGIN+10,y+16);
    }

    // ---------------------------------------------------------------- DAILY OUTPUT + BATCH LAGGING
    newPage(false);y=60;
    y=sectionTitle("Daily Output · Lessons & Hours",y);
    const lbEl=document.getElementById("d127v4-lb-kpis");
    if(lbEl){
      const chunks=lbEl.innerText.trim().split("\n");
      const cards=[];
      for(let i=0;i<chunks.length;i+=3)cards.push({l:chunks[i],v:chunks[i+1],s:chunks[i+2]});
      if(cards.length)y=kpiRow(y,cards);
    }
    y+=6;
    y=addChartImage("ap127lessonBar",y,pageDims().w-2*MARGIN,300);
    y=noteText("Bars = batch total per period. Required (rose line) = same calc as the Pace Monitor's Per Day/Week/Month row above.",y);

    y=sectionTitle("Batch Lagging History",y+10);
    y=addChartImage("ap127histBatch",y,pageDims().w-2*MARGIN,220);

    // ---------------------------------------------------------------- COMBINED PROGRESS + FUNNEL
    newPage(false);y=60;
    y=sectionTitle("Combined Progress vs Plan",y);
    y=addChartImage("ap127combined",y,pageDims().w-2*MARGIN,320);

    y=sectionTitle("Phase Progress Funnel",y+10);
    y=addChartImage("ap127funnel",y,pageDims().w-2*MARGIN,190);

    // ---------------------------------------------------------------- PACE DISTRIBUTION + INDIVIDUAL LEAD/LAG
    newPage(false);y=60;
    y=sectionTitle("Pace Distribution",y);
    y=addChartImage("ap127band",y,pageDims().w-2*MARGIN,260);

    y=sectionTitle("Individual Lead/Lag vs Plan",y+10);
    y=addChartImage("ap127histSolo",y,pageDims().w-2*MARGIN,260);

    // ---------------------------------------------------------------- ACTUAL VS PLANNED + CONS/IDLE
    newPage(false);y=60;
    y=sectionTitle("Actual vs Planned",y);
    y=addChartImage("ap127race",y,pageDims().w-2*MARGIN,300);

    y=sectionTitle("Consecutive & Idle Streaks",y+10);
    y=addChartImage("ap127consIdle",y,pageDims().w-2*MARGIN,260);

    // ---------------------------------------------------------------- WATCHLIST
    newPage(false);y=60;
    y=sectionTitle("Needs Attention (Watchlist)",y);
    const watchRows=Array.from(document.querySelectorAll("#d127v4-watchlist .d127v4-watch-item")).map(it=>[
      it.querySelector(".d127v4-watch-name")?.textContent.trim()||"",
      it.querySelector(".d127v4-watch-badge")?.textContent.trim()||"",
      it.querySelector(".d127v4-watch-sub")?.textContent.trim()||"",
    ]);
    if(watchRows.length){
      doc.autoTable({
        startY:y,margin:{left:MARGIN,right:MARGIN},
        head:[["Student","Idle","Hrs Δ"]],body:watchRows,
        styles:{fontSize:9,cellPadding:4},headStyles:{fillColor:INK,textColor:255},
      });
      y=doc.lastAutoTable.finalY+10;
    } else {
      y=noteText("No students idle >5d or significantly behind plan.",y);
    }

    // ---------------------------------------------------------------- FLIGHT TIMELINE (landscape, can be tall)
    newPage(true);y=60;
    y=sectionTitle("Flight Timeline vs Progress",y);
    addChartImage("ap127timeline",y,pageDims().w-2*MARGIN,pageDims().h-y-50);

    // ---------------------------------------------------------------- OVERALL PROGRESS (landscape)
    newPage(true);y=60;
    y=sectionTitle("Overall Progress Bar View — all "+n+" SP",y);
    addChartImage("ap127overall",y,pageDims().w-2*MARGIN,pageDims().h-y-50);

    // ---------------------------------------------------------------- PROGRESS RANKING (landscape table)
    newPage(true);y=60;
    y=sectionTitle("Progress Ranking — full table ("+n+" SP)",y);
    const rankHead=Array.from(document.querySelectorAll(".d127-table thead th")).map(th=>txt(th));
    const rankRows=readTable("#d127v4-rows tr");
    doc.autoTable({
      startY:y,margin:{left:MARGIN,right:MARGIN},
      head:[rankHead],body:rankRows,
      styles:{fontSize:7,cellPadding:3},headStyles:{fillColor:INK,textColor:255,fontSize:7.5},
      didParseCell:(data)=>{
        if(data.row.index===0&&data.section==="body")data.cell.styles.fillColor=[243,232,255];
      },
    });

    // ---------------------------------------------------------------- ROSTER + LESSON MATRIX (html2canvas)
    // html2canvas 1.4.1's own CSS color parser doesn't understand modern color functions
    // (color-mix()/oklch()) — this codebase's Lesson Matrix footer row uses exactly that
    // (`color-mix(in oklch, var(--c127) X%, transparent)` for its batch-%-complete shading) and
    // html2canvas throws "Attempting to parse an unsupported color function" the moment it hits
    // it. Worked around by screenshotting a TEMPORARY, off-screen CLONE — not the live element —
    // with every color-mix()-using node's background swapped for the plain rgb() the browser
    // already resolved it to (read via getComputedStyle on the still-mounted original, which
    // resolves color-mix/oklch to a concrete color same as it does for on-screen rendering).
    // html2canvas only ever sees the clone, so this never touches or affects anything visible.
    if(window.html2canvas){
      const cloneForCanvas=(realEl)=>{
        const clone=realEl.cloneNode(true);
        const realNodes=realEl.querySelectorAll('[style*="color-mix"]');
        const cloneNodes=clone.querySelectorAll('[style*="color-mix"]');
        realNodes.forEach((real,i)=>{
          if(cloneNodes[i])cloneNodes[i].style.background=getComputedStyle(real).backgroundColor;
        });
        clone.style.position="fixed";clone.style.top="-99999px";clone.style.left="0";
        clone.style.background=getComputedStyle(realEl).backgroundColor||getComputedStyle(document.body).backgroundColor;
        document.body.appendChild(clone);
        return clone;
      };
      // Belt-and-braces: this app's theme system defines its base palette as oklch() (css/theme.css
      // :root vars) and uses color-mix(in oklch,...) throughout multiple stylesheets, not just the
      // one inline case cloneForCanvas patches — a full fix would mean rewriting the capture target's
      // entire computed style tree, out of scope for this pass. If html2canvas still can't render a
      // given panel despite the clone patch, fall back to a plain data table (Name + its one real
      // summary column — the heatmap's day/lesson cells carry no text, only color, so they're not
      // worth dumping) rather than letting the whole export fail.
      const shot=async(elId,title,nameSel,valSel,valLabel)=>{
        const el=document.getElementById(elId);if(!el)return;
        newPage(true);y=60;
        y=sectionTitle(title,y);
        toast("Capturing "+title+"…");
        try{
          const clone=cloneForCanvas(el);
          let canvas;
          try{
            canvas=await window.html2canvas(clone,{scale:1.5,backgroundColor:getComputedStyle(document.body).backgroundColor||"#0d1117"});
          }finally{
            clone.remove();
          }
          const img=canvas.toDataURL("image/png");
          const{w:pw,h:ph}=pageDims();
          const scale=Math.min((pw-2*MARGIN)/canvas.width,(ph-y-50)/canvas.height,1);
          doc.addImage(img,"PNG",MARGIN,y,canvas.width*scale,canvas.height*scale,undefined,"MEDIUM");
        }catch(err){
          console.warn("ap127ExportPDF: html2canvas capture failed for #"+elId+", falling back to a text table:",err);
          y=noteText("Full-color screenshot capture isn't available in this environment (the in-browser screenshot library can't render some of this app's CSS colors) — showing the underlying data as a text table instead.",y);
          const rows=Array.from(el.querySelectorAll("tbody tr, tfoot tr")).map(tr=>{
            const nameCell=tr.querySelector(nameSel),valCell=tr.querySelector(valSel);
            return nameCell?[txt(nameCell),valCell?txt(valCell):""]:null;
          }).filter(Boolean);
          if(rows.length){
            doc.autoTable({startY:y+4,margin:{left:MARGIN,right:MARGIN},head:[["Name",valLabel]],body:rows,
              styles:{fontSize:8,cellPadding:3},headStyles:{fillColor:INK,textColor:255}});
          }
        }
      };
      await shot("d127v4-heat","Roster — Day-by-Day Activity Heatmap",".d127v4-heat-name",".d127v4-heat-total","Total (les · hrs)");
      await shot("d127v4-lesson-matrix","Lesson Completion Matrix",".d127v4-lm-name",".d127v4-lm-vs","vs Target");
    }

    footer();
    doc.save(`AP127_Progress_Report_${today}.pdf`);
    toast("PDF report downloaded");
  }catch(e){
    console.error("ap127ExportPDF failed:",e);
    toast("PDF export failed — see console for details","er");
  }finally{
    if(btn){btn.disabled=false;btn.textContent=origLabel||"⬇ Export PDF";}
  }
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
    renderAP127RowsV4: renderAP127Rows,
    ap127RowsDebounced,
    renderAP127PaceV4: renderAP127Pace,
    ap127ResetSortV4: ap127ResetSort,
    ap127HeaderClickV4: ap127HeaderClick,
    setCPVFilterV4: setCPVFilter,
    setCPVModeV4: setCPVMode,
    cpvResetZoomV4: cpvResetZoom,
    ap127OverallResetZoomV4: ap127OverallResetZoom,
    ap127OverallZoomV4: ap127OverallZoom,
    openAP127DrawerV4: openAP127Drawer,
    closeAP127DrawerV4: closeAP127Drawer,
    openAP127SyllabusModalV4: openAP127SyllabusModal,
    closeAP127SyllabusModalV4: closeAP127SyllabusModal,
    openAP127MilestoneModalV4: openAP127MilestoneModal,
    setAP127RaceModeV4: setAP127RaceMode,
    setHistBatchModeV4: setHistBatchMode,
    buildAP127HistBatchV4: buildAP127HistBatch,
    buildAP127HistSoloV4: buildAP127HistSolo,
    setCohortAsOfV4: setCohortAsOf,
    ap127AsOfV4: ap127AsOf,
    setLBUnitV4: setLBUnit,
    setLBPeriodV4: setLBPeriod,
    setLBShowAllV4: setLBShowAll,
    ap127SetLBRangeV4: ap127SetLBRange,
    ap127ResetLBRangeV4: ap127ResetLBRange,
    ap127ToggleLBBreakdownV4: ap127ToggleLBBreakdown,
    ap127ToggleLBInfoV4: ap127ToggleLBInfo,
    buildAP127RosterV4: buildAP127Roster,
    ap127ExportPDFV4: ap127ExportPDF,
    CHARTS_V4: CHARTS,
  });
})();
