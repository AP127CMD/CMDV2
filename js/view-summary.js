// view-summary.js — Ops Analytics: batch-centric flight analytics
// Period select, comprehensive filter panel, KPI strip, batch composition,
// 4 stacked bar-over-time charts, batch breakdown table, student/instructor rosters.
(function () {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;

  // ── Date range helpers ──────────────────────────────────────────────────
  function sAddDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function sDayRange(start, end) {
    const arr = []; let c = start;
    while (c <= end && arr.length < 400) { arr.push(c); c = sAddDays(c, 1); }
    return arr;
  }
  function sPresetRange(preset, today) {
    if (preset === '14d') return { from: sAddDays(today, -13), to: today };
    if (preset === '30d') return { from: sAddDays(today, -29), to: today };
    if (preset === '90d') return { from: sAddDays(today, -89), to: today };
    return { from: sAddDays(today, -29), to: today };
  }
  function sWeekKey(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
    dt.setUTCDate(dt.getUTCDate() - dow);
    return dt.toISOString().slice(0, 10);
  }
  function sMonthKey(dateStr) { return dateStr.slice(0, 7); }

  const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  function sFmtShort(dateStr) { const { day, mo } = fmtDay(dateStr); return String(day).padStart(2,'0') + ' ' + mo; }
  function sFmtWeek(weekKey) { return 'WK ' + sFmtShort(weekKey); }
  function sFmtMonth(monthKey) { const [y, m] = monthKey.split('-'); return MONTH_ABBR[Number(m) - 1] + ' ' + y.slice(2); }

  // ── Effective vs block hours (curriculum planned minutes per lesson) ───
  // Ported from view-aircraft.js's uBuildCurMap/uEffectiveMins — that file wraps itself
  // in its own IIFE and doesn't expose these on window, so each view keeps its own copy.
  function sBuildCurMap() {
    const G = window.NGT_CACHE;
    const map = {};
    [G?.cur124 || [], G?.cur126 || [], G?.cur127 || []].forEach(cur =>
      cur.forEach(c => { if (c.lesson && c.planned_mins != null) map[c.lesson] = c.planned_mins; })
    );
    return map;
  }
  function sEffectiveMins(f, curMap) {
    const lesson = (f.lesson || '').trim();
    if (!lesson) return f.durMin || 0;
    if (curMap[lesson] != null) return curMap[lesson];
    if (lesson.includes('/')) {
      const base = lesson.replace(/\/\d+$/, '');
      const part = parseInt(lesson.split('/').pop(), 10) || 1;
      return part === 1 ? (curMap[base] != null ? curMap[base] : f.durMin || 0) : 0;
    }
    return f.durMin || 0;
  }

  // ── Effective-hours dedup: a curriculum lesson is only "required by the syllabus"
  // once per SP. Every Completed flight for a student is grouped into a "family" by its
  // BASE lesson code (any "/N" suffix stripped) — this covers a lesson logged as 2+
  // unsuffixed duplicate bookings (a multi-leg session split into extra rows with no
  // "/2" convention used), AND a lesson logged as bare on one date plus properly
  // "/1,/2,/3"-split on another (bare and "/1" both mean "part 1" to the curriculum —
  // confirmed live 2026-08-05: student NAPATH T., lesson CSXV 45, a 45-minute bare
  // booking 2026-05-22 too short to be the real completion, alongside a full
  // "/1,/2,/3" 3-leg booking 2026-05-26 that Progress's own single flown record
  // matches — both were separately credited before this fix, double-counting one
  // lesson as two), AND a lesson logged ONLY as continuation legs with no "/1"/bare
  // leg ever recorded at all (confirmed live: 8 such cases across the whole dataset,
  // ~9h — previously credited 0 despite Progress showing the lesson done).
  // One credited representative per family: prefer a "part 1" (bare or "/1") row if
  // any exists (latest date/time wins among those); only when the family has NO part-1
  // row at all does the earliest-available continuation leg stand in for it. The
  // credited row always gets the lesson's full curriculum-standard duration (looked up
  // by BASE code, not by parsing its own suffix) — every other row in the family gets 0
  // *effective* hours (still counted in flight totals/block hours).
  // Computed once over ALL Completed flights (not the period-filtered set) so it gives
  // the same single credit regardless of which view/date-range is reading it — the
  // all-time cumulative roster (`cumulStudentGroups`) and the period-filtered charts
  // must agree on which single booking "is" the lesson.
  function sBaseLessonCode(lesson) {
    return String(lesson || '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/\/\d+\s*$/, '');
  }
  function sLessonPartNum(lesson) {
    const m = String(lesson || '').trim().match(/\/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : 1; // bare (no "/N" at all) counts as part 1
  }
  function sBuildEffectiveCreditSet(flights) {
    const families = new Map(); // "student|BASECODE" -> {f,idx}[]  (every suffix variant + bare, together)
    flights.forEach((f, idx) => {
      if (f.status !== 'Completed' || !f.student || !f.lesson) return;
      const key = f.student + '|' + sBaseLessonCode(f.lesson);
      if (!families.has(key)) families.set(key, []);
      families.get(key).push({ f, idx });
    });
    // Set of flight OBJECT REFERENCES, not `.id` — confirmed live that some rows share
    // identical `.id` values (a known upstream ACTUAL_ONLY_ id-generation bug, see
    // CLAUDE.md), so `.id` can't safely identify "is this the one credited row"; object
    // identity can, since every aggregation reads the same FLIGHTS array references.
    const credited = new Set();
    families.forEach(entries => {
      const part1 = entries.filter(e => sLessonPartNum(e.f.lesson) === 1);
      const pool = part1.length ? part1 : entries; // no part-1 row anywhere → best-available continuation leg stands in
      const rep = pool.length === 1 ? pool[0].f : pool.slice().sort((a, b) => {
        if (a.f.date !== b.f.date) return a.f.date < b.f.date ? 1 : -1;
        const as = a.f.start || '', bs = b.f.start || '';
        if (as !== bs) return as < bs ? 1 : -1;
        return b.idx - a.idx;
      })[0].f;
      credited.add(rep);
    });
    return credited;
  }

  // ── Lesson sequence check: flight training is sequential — a SP who has completed
  // curriculum lesson N should, in the ordinary case, also have completed every lesson
  // before N. This does NOT change any hours total (flag, don't fabricate — see
  // docs/superpowers/specs/2026-08-04-crosscheck-monthly-ops-prog-design.md) — it only
  // surfaces SPs whose completed-lesson set has a gap, for human follow-up.
  //
  // Sourced from window.NGT_CACHE's flown[] (the Progress feed), NOT window.FLIGHTS —
  // confirmed live that FLIGHTS is a ROLLING WINDOW of Ops Portal history (this is
  // documented behavior — see assets/reconcile.js's own comment: "Operations history
  // is a rolling window; progress goes back further"), so a long-finished batch like
  // AP-124 has most of its early lesson-by-lesson bookings aged out of FLIGHTS even
  // though every lesson was genuinely flown; checking against FLIGHTS produced a wall
  // of false "missing" lessons for exactly this reason. NGT_CACHE's flown[] is each
  // student's full completed-lesson history with no retention window, so it's the
  // reliable ground truth for "has this lesson ever been logged done." Reuses
  // sBaseLessonCode() defined above (part of the effective-hours dedup) — same
  // "strip any /N suffix" normalization serves both features.
  function sBuildLessonOrderMap() {
    const G = window.NGT_CACHE;
    const orderFor = cur => (cur || []).map(c => c.lesson).filter(Boolean);
    const cur127 = orderFor(G?.cur127);
    return {
      'AP-124': orderFor(G?.cur124),
      'AP-126': orderFor(G?.cur126),
      'AP-127': cur127,
      'AP-129': cur127, // AP-129 has no curriculum of its own — shares AP-127's (same convention as js/view-program.js's collectCurriculumPlan())
    };
  }
  function sBuildSequenceGaps(batchAllowed) {
    const orderMap = sBuildLessonOrderMap();
    const gaps = [];
    Object.keys(orderMap).forEach(batch => {
      const order = orderMap[batch];
      if (!order.length || !batchAllowed(batch)) return; // no curriculum for this batch, or filtered out
      const orderIndex = new Map(order.map((l, i) => [sBaseLessonCode(l), i]));
      sBatchRoster(batch).forEach(s => {
        const done = new Set((s.flown || []).map(f => sBaseLessonCode(f.lesson)).filter(Boolean));
        let maxIdx = -1;
        done.forEach(code => { const idx = orderIndex.get(code); if (idx != null && idx > maxIdx) maxIdx = idx; });
        if (maxIdx < 0) return; // nothing this student flew maps to a known curriculum lesson
        const missing = [];
        for (let i = 0; i < maxIdx; i++) { const code = order[i]; if (!done.has(sBaseLessonCode(code))) missing.push(code); }
        if (missing.length) gaps.push({ batch, student: s.nick || s.name, reached: order[maxIdx], missing });
      });
    });
    return gaps.sort((a, b) => a.batch === b.batch ? b.missing.length - a.missing.length : a.batch.localeCompare(b.batch));
  }

  // ── Batch Summary: progress-vs-plan lookups (window.NGT_CACHE, a separate data
  // feed from FLIGHTS — the same one js/view-cohort.js's Progress tab already uses) ──
  // AP-128 intentionally has no entry: it has zero data in the current feed.
  const BATCH_ROSTER_KEY = { 'AP-124': 'ap124', 'AP-126': 'ap126', 'AP-127': 'ap127', 'AP-129': 'ap129' };
  const BATCH_CUR_KEY = { 'AP-124': 'cur124', 'AP-126': 'cur126', 'AP-127': 'cur127' };

  function sBatchRoster(batch) {
    const key = BATCH_ROSTER_KEY[batch];
    return (key && window.NGT_CACHE && window.NGT_CACHE[key]) || [];
  }
  function sBatchCurriculum(batch) {
    const key = BATCH_CUR_KEY[batch];
    return (key && window.NGT_CACHE && window.NGT_CACHE[key]) || null;
  }
  // Target completion date: the shared curriculum's own official last planned_date where one
  // exists (AP-124/126/127); otherwise the latest of the batch's students' own individually
  // computed `finish` dates (AP-129, which has no shared curriculum array).
  function sBatchTargetDate(batch, roster) {
    const cur = sBatchCurriculum(batch);
    if (cur && cur.length) return cur[cur.length - 1].planned_date;
    let latest = null;
    roster.forEach(s => { if (s.finish && (!latest || s.finish > latest)) latest = s.finish; });
    return latest;
  }

  // ── Batch color system ───────────────────────────────────────────────────
  const AP_BATCH_ORDER = ['AP-124', 'AP-126', 'AP-127', 'AP-128', 'AP-129'];
  const NON_AP_PALETTE = ['oklch(0.65 0.03 250)', 'oklch(0.62 0.03 90)', 'oklch(0.60 0.03 20)', 'oklch(0.66 0.03 160)'];
  function sBatchColor(batch) {
    const b = batch || 'Unknown';
    const idx = AP_BATCH_ORDER.indexOf(b);
    if (idx !== -1) return `var(--batch-ap${b.slice(3)})`;
    let h = 0;
    for (let i = 0; i < b.length; i++) h = (h * 31 + b.charCodeAt(i)) >>> 0;
    return NON_AP_PALETTE[h % NON_AP_PALETTE.length];
  }
  // Canvas fillStyle can't consume var(--x) — resolve to the literal value for Chart.js.
  function sResolveColor(cssColor) {
    if (!cssColor.startsWith('var(')) return cssColor;
    const varName = cssColor.slice(4, -1).split(',')[0].trim();
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
  }
  // Lightens an already-resolved oklch(...) color for the Sim-flight visual split.
  // Takes a literal color (from sResolveColor), NOT a var(--x) reference.
  function sLightenOklch(cssColor, amount) {
    const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(cssColor);
    if (!m) return cssColor;
    const L = Math.min(0.97, parseFloat(m[1]) + (amount != null ? amount : 0.16));
    const C = parseFloat(m[2]) * 0.7;
    const H = m[3];
    return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${H})`;
  }

  // Aircraft type order/labels — duplicated from view-aircraft.js's U_TYPE_ORDER (IIFE-scoped there, not exported).
  const S_TYPE_ORDER = ['DA40TDI', 'DA40CS', 'C172', 'DA42TDI', 'DA42NG', 'R44', 'DA40_SIM', 'DA42_SIM', 'R44_SIM'];

  // Generic multi-select chip picker. selected === null means "all" (matches the
  // convention FilterBar already uses elsewhere in this app for filters.batches etc).
  function MultiSelectChips({ label, options, selected, onChange, colorOf, searchable }) {
    const [q, setQ] = useState('');
    const isAll = !selected || selected.length === 0;
    const isSel = v => isAll || selected.includes(v);
    const toggle = v => {
      if (isAll) { onChange([v]); return; }
      const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v];
      onChange(next.length === options.length || next.length === 0 ? null : next);
    };
    const shown = searchable && q ? options.filter(o => o.toLowerCase().includes(q.toLowerCase())) : options;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)', flex: 1 }}>{label}</span>
          {!isAll && (
            <span onClick={() => onChange(null)} className="mono uc" style={{ fontSize: 7, padding: '1px 5px', borderRadius: 2, cursor: 'pointer', border: '1px solid var(--line)', color: 'var(--ink-3)' }}>ALL</span>
          )}
        </div>
        {searchable && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="search…"
            style={{ fontSize: 9, padding: '3px 6px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit' }}/>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxHeight: 100, overflowY: 'auto' }}>
          {shown.map(v => {
            const on = isSel(v);
            const col = colorOf ? colorOf(v) : 'var(--ink-2)';
            return (
              <span key={v} onClick={() => toggle(v)} className="mono uc" style={{
                padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                background: on ? `color-mix(in oklch,${col} 16%,transparent)` : 'transparent',
                border: `1px solid ${on ? col : 'var(--line)'}`, color: on ? col : 'var(--ink-3)',
                fontWeight: on ? 600 : 400,
              }}>{v}</span>
            );
          })}
          {shown.length === 0 && <span className="mono" style={{ fontSize: 8, color: 'var(--ink-3)' }}>no matches</span>}
        </div>
      </div>
    );
  }

  function statusColor(s) {
    if (s === 'Pending') return 'var(--col-pending)';
    if (s === 'Completed') return 'var(--col-done)';
    if (s === 'Canceled') return 'var(--col-cancel)';
    if (s === 'Standby') return 'var(--col-stby)';
    return 'var(--ink-2)';
  }

  // ──────────────────────────────────────────────────────────────────────
  // KpiStrip — 13-tile summary: totals, breakdown by status, rates, hours.
  // ──────────────────────────────────────────────────────────────────────
  function Tile({ label, value, color, sub }) {
    return (
      <div style={{ padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, borderTop: `2px solid ${color}`, minWidth: 76 }}>
        <div className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{label}</div>
        <div className="num" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1, color: 'var(--ink)', marginTop: 2 }}>{value}</div>
        {sub && <div className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>}
      </div>
    );
  }
  function KpiStrip({ kpi, isMobile }) {
    const pct = v => (v == null ? '—' : `${v.toFixed(0)}%`);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(auto-fit,minmax(96px,1fr))', gap: 8 }}>
        <Tile label="TOTAL" value={kpi.total} color="var(--ink-2)" sub={`${kpi.bookedHours.toFixed(0)}h booked`}/>
        <Tile label="PENDING" value={kpi.pending} color="var(--col-pending)"/>
        <Tile label="COMPLETED" value={kpi.completed} color="var(--col-done)"/>
        <Tile label="CANCELED" value={kpi.canceled} color="var(--col-cancel)"/>
        <Tile label="STANDBY" value={kpi.standby} color="var(--col-stby)"/>
        <Tile label="SIM" value={kpi.sim} color="var(--col-sim)"/>
        <Tile label="HOURS" value={kpi.completedHours.toFixed(1)} color="var(--col-done)" sub="real only"/>
        <Tile label="SIM HOURS" value={kpi.simHours.toFixed(1)} color="var(--col-sim)"/>
        <Tile label="COMPLETION" value={pct(kpi.completionRate)} color="var(--col-done)"/>
        <Tile label="CANCELLATION" value={pct(kpi.cancellationRate)} color="var(--col-cancel)"/>
        <Tile label="AVG H/FLIGHT" value={kpi.avgHoursPerFlight == null ? '—' : kpi.avgHoursPerFlight.toFixed(1)} color="var(--ink-2)"/>
        <Tile label="BATCHES" value={kpi.activeBatches} color="var(--ink-2)"/>
        <Tile label="STUDENTS" value={kpi.activeStudents} color="var(--ink-2)"/>
        <Tile label="AP-127 SHARE" value={pct(kpi.ap127SharePct)} color="var(--highlight)"/>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // CompositionStrip — batch composition stacked bar + legend, split real/sim
  // ──────────────────────────────────────────────────────────────────────
  function CompositionStrip({ slices, metricLabel }) {
    if (slices.length === 0) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>NO BATCHES IN FILTERED SET</span>
        </div>
      );
    }
    const totalHours = slices.reduce((a, s) => a + s.hours, 0);
    if (totalHours === 0) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>NO COMPLETED HOURS IN FILTERED SET</span>
        </div>
      );
    }
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>BATCH COMPOSITION</div>
          <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>SHARE OF {metricLabel.toUpperCase()} HOURS IN PERIOD · SOLID = REAL · LIGHT = SIM</div>
        </div>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--line)' }}>
            {slices.map(s => (
              <div key={s.batch} style={{ width: `${Math.max(s.pct, 0.5)}%`, display: 'flex' }}>
                {s.realHours > 0 && (
                  <div title={`${s.batch} real: ${s.realPct.toFixed(1)}% · ${s.realHours.toFixed(1)}h`}
                    style={{ flex: s.realHours, background: s.color, opacity: 0.9 }}/>
                )}
                {s.simHours > 0 && (
                  <div title={`${s.batch} sim: ${s.simPct.toFixed(1)}% · ${s.simHours.toFixed(1)}h`}
                    style={{ flex: s.simHours, background: `color-mix(in oklab, ${s.color} 55%, var(--surface))`, opacity: 0.9 }}/>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
            {slices.map(s => (
              <div key={s.batch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }}/>
                <span className="mono uc" style={{ fontSize: 10, color: s.batch === HIGHLIGHT_BATCH ? 'var(--highlight)' : 'var(--ink-2)', fontWeight: s.batch === HIGHLIGHT_BATCH ? 700 : 400 }}>{s.batch}</span>
                <span className="mono num" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{s.flights} flt · {s.hours.toFixed(1)}h · {s.pct.toFixed(1)}%{s.simHours > 0 ? ` (${s.simHours.toFixed(1)}h sim)` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── BreakdownTable — batch breakdown horizontal-bar table ──
  function BreakdownTable({ title, subtitle, rows, nameKey = 'batch' }) {
    const sorted = [...rows].sort((a, b) => (b.completedHours || 0) - (a.completedHours || 0));
    const maxHours = Math.max(...sorted.map(r => r.completedHours || 0), 0.01);
    const todayLeaves = leavesOnDate(localToday());

    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>{title}</div>
          {subtitle && <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.length === 0 && <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', padding: '8px 0' }}>NO DATA</div>}
          {sorted.map(r => {
            const name = r[nameKey];
            const isHL = name === HIGHLIGHT_BATCH;
            const barW = `${(((r.completedHours || 0) / maxHours) * 100).toFixed(1)}%`;
            return (
              <div key={name} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 120, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                  <span className="mono uc" style={{ fontSize: 10, color: isHL ? 'var(--highlight)' : 'var(--ink-2)', fontWeight: isHL ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</span>
                  {nameKey !== 'batch' && todayLeaves[name] && <LeaveBadge reason={todayLeaves[name]}/>}
                </div>
                <div style={{ flex: 1, height: 18, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: barW, height: '100%', display: 'flex', gap: 1, transition: 'width .3s' }}>
                    {r.pending > 0 && <div title={`Pending: ${r.pending}`} style={{ flex: r.pending, background: 'var(--col-pending)', opacity: 0.85 }}/>}
                    {r.completed > 0 && <div title={`Completed: ${r.completed}`} style={{ flex: r.completed, background: 'var(--col-done)', opacity: 0.85 }}/>}
                    {r.canceled > 0 && <div title={`Canceled: ${r.canceled}`} style={{ flex: r.canceled, background: 'var(--col-cancel)', opacity: 0.85 }}/>}
                    {r.standby > 0 && <div title={`Standby: ${r.standby}`} style={{ flex: r.standby, background: 'var(--col-stby)', opacity: 0.85 }}/>}
                    {r.total === 0 && <div style={{ flex: 1, background: 'var(--line)', opacity: 0.2 }}/>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  <div className="mono num" style={{ fontSize: 9, color: 'var(--col-done)', textAlign: 'right', width: 20 }} title="Completed">{r.completed}</div>
                  <div className="mono" style={{ fontSize: 8, color: 'var(--ink-3)' }}>/</div>
                  <div className="mono num" style={{ fontSize: 9, color: 'var(--col-cancel)', textAlign: 'right', width: 20 }} title="Canceled">{r.canceled}</div>
                  <div className="mono num" style={{ width: 52, fontSize: 9, color: 'var(--col-done)', textAlign: 'right' }} title="Completed hours">✓{(r.completedHours || 0).toFixed(1)}h</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── StackedBatchChart — reusable Chart.js stacked bar, shared by all 4 chart panels ──
  // series[batch] = { real: number[], sim: number[] } — real renders solid batch color,
  // sim renders a lighter tint of the same color, both stacked into one bar per batch.
  // A zero-height "TOTAL" dataset anchors a grand-total label above each full stack.
  function StackedBatchChart({ title, subtitle, labels, batches, series, unit }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    useEffect(() => {
      if (!canvasRef.current) return;
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      if (window.ChartDataLabels) { try { Chart.register(window.ChartDataLabels); } catch (e) {} }

      const cs = getComputedStyle(document.documentElement);
      const ink3 = cs.getPropertyValue('--ink-3').trim() || '#888';
      const lineC = cs.getPropertyValue('--line').trim() || '#333';
      const labelColor = cs.getPropertyValue('--bg').trim() || '#0b0e14';

      const totals = labels.map((_, i) => batches.reduce((sum, b) => {
        const bs = series[b] || { real: [], sim: [] };
        return sum + (bs.real[i] || 0) + (bs.sim[i] || 0);
      }, 0));

      const fmtVal = v => (unit === 'hours' ? v.toFixed(1) : String(v));
      const datalabelsFor = () => ({
        color: labelColor,
        font: { family: 'monospace', size: 8, weight: '600' },
        display: ctx => {
          const v = ctx.dataset.data[ctx.dataIndex];
          const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
          const bar = meta.data[ctx.dataIndex];
          return v > 0 && bar && bar.height > 11;
        },
        formatter: v => (v > 0 ? fmtVal(v) : null),
        anchor: 'center', align: 'center',
      });

      const datasets = [];
      batches.forEach(b => {
        const bs = series[b] || { real: [], sim: [] };
        const realCol = sResolveColor(sBatchColor(b));
        const simCol = sLightenOklch(realCol);
        datasets.push({
          label: b,
          data: bs.real.map(v => +v.toFixed(unit === 'hours' ? 2 : 0)),
          backgroundColor: realCol, borderColor: realCol, borderWidth: 0.5,
          stack: 'batches', datalabels: datalabelsFor(),
        });
        datasets.push({
          label: b + ' (SIM)',
          data: bs.sim.map(v => +v.toFixed(unit === 'hours' ? 2 : 0)),
          backgroundColor: simCol, borderColor: simCol, borderWidth: 0.5,
          stack: 'batches', datalabels: datalabelsFor(),
        });
      });
      datasets.push({
        label: 'TOTAL',
        data: labels.map(() => 0),
        backgroundColor: 'transparent', borderWidth: 0, stack: 'batches',
        datalabels: {
          color: ink3, font: { family: 'monospace', size: 9, weight: '700' },
          display: ctx => totals[ctx.dataIndex] > 0,
          formatter: (v, ctx) => fmtVal(totals[ctx.dataIndex]),
          anchor: 'end', align: 'end', offset: 4,
        },
      });

      const ctx = canvasRef.current.getContext('2d');
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: {
            legend: {
              display: true, position: 'top',
              labels: { color: ink3, font: { family: 'monospace', size: 9 }, boxWidth: 10, padding: 8, filter: item => item.text !== 'TOTAL' },
            },
            tooltip: {
              filter: item => item.dataset.label !== 'TOTAL',
              callbacks: { label: c => `${c.dataset.label}: ${Number(c.raw).toFixed(unit === 'hours' ? 1 : 0)}${unit === 'hours' ? 'h' : ''}` },
            },
          },
          scales: {
            x: { stacked: true, ticks: { color: ink3, font: { family: 'monospace', size: 8 }, maxRotation: 45, maxTicksLimit: 24 }, grid: { color: lineC } },
            y: { stacked: true, beginAtZero: true, ticks: { color: ink3, font: { family: 'monospace', size: 9 }, callback: v => (unit === 'hours' ? v + 'h' : v) }, grid: { color: lineC } },
          },
        },
      });

      return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    }, [labels, batches, series, unit]);

    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>{title}</div>
          {subtitle && <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        <div style={{ padding: '10px 12px', height: 240, position: 'relative' }}>
          <canvas ref={canvasRef}/>
        </div>
      </div>
    );
  }

  // ── RosterHeatmap — generic sticky-header day-by-person intensity table, reused by the instructor roster ──
  function RosterHeatmap({ title, rows, days, today, valueOf, colorOf, onCellClick, groupOf }) {
    const CELL_W = Math.max(10, Math.min(26, Math.floor(700 / Math.max(days.length, 1))));
    const CELL_H = 20;
    const maxCell = useMemo(() => {
      let mx = 0.25;
      rows.forEach(r => days.forEach(d => { const v = valueOf(r, d); if (v > mx) mx = v; }));
      return mx;
    }, [rows, days, valueOf]);

    const renderItems = useMemo(() => {
      if (!groupOf) return rows.map(r => ({ type: 'row', name: r }));
      const byKey = {};
      const order = [];
      rows.forEach(r => {
        const g = groupOf(r) || { key: 'Unknown', color: 'var(--ink-3)' };
        if (!byKey[g.key]) { byKey[g.key] = { color: g.color, rows: [] }; order.push(g.key); }
        byKey[g.key].rows.push(r);
      });
      const items = [];
      order.forEach(key => {
        items.push({ type: 'header', key, color: byKey[key].color, count: byKey[key].rows.length });
        byKey[key].rows.forEach(r => items.push({ type: 'row', name: r }));
      });
      return items;
    }, [rows, groupOf]);

    if (rows.length === 0) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 20, textAlign: 'center' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>NO DATA IN PERIOD</span>
        </div>
      );
    }

    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>{title}</div>
        </div>
        <div style={{ overflowX: 'auto', padding: '8px 0' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 1 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 110, padding: '2px 10px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-2)', zIndex: 2 }}>
                  <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>NAME</span>
                </th>
                <th style={{ minWidth: 48, padding: '2px 6px', textAlign: 'right', position: 'sticky', left: 110, background: 'var(--bg-2)', zIndex: 2 }}>
                  <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>TOTAL</span>
                </th>
                {days.map((d, i) => {
                  const dObj = new Date(d + 'T12:00:00Z');
                  const isMon = dObj.getUTCDay() === 1;
                  const isToday = d === today;
                  const showLabel = i === 0 || isMon || CELL_W >= 20;
                  return (
                    <th key={d} style={{ width: CELL_W, minWidth: CELL_W, padding: 0, textAlign: 'center', verticalAlign: 'bottom', borderLeft: isMon && i > 0 ? '1px solid var(--line)' : 'none' }}>
                      {showLabel && (
                        <div className="mono" style={{ fontSize: 7, color: isToday ? 'var(--highlight)' : 'var(--ink-4,#555)', fontWeight: isToday ? 700 : 400 }}>
                          {dObj.getUTCDate()}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {renderItems.map(item => {
                if (item.type === 'header') {
                  return (
                    <tr key={'hdr-' + item.key}>
                      <td colSpan={2 + days.length} style={{ padding: '4px 10px', background: `color-mix(in oklch, ${item.color} 10%, var(--surface))`, position: 'sticky', left: 0 }}>
                        <span className="mono uc" style={{ fontSize: 9, fontWeight: 700, color: item.color }}>{item.key}</span>
                        <span className="mono" style={{ fontSize: 8, color: 'var(--ink-3)', marginLeft: 6 }}>{item.count}</span>
                      </td>
                    </tr>
                  );
                }
                const row = item.name;
                const total = days.reduce((s, d) => s + valueOf(row, d), 0);
                return (
                  <tr key={row}>
                    <td style={{ padding: '1px 10px', position: 'sticky', left: 0, background: 'var(--bg-2)', zIndex: 1, whiteSpace: 'nowrap', borderRight: '1px solid var(--line)' }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', fontWeight: 600 }}>{row}</span>
                    </td>
                    <td style={{ padding: '1px 6px', position: 'sticky', left: 110, background: 'var(--bg-2)', zIndex: 1, textAlign: 'right', borderRight: '1px solid var(--line)' }}>
                      <span className="mono num" style={{ fontSize: 9, color: 'var(--ink-2)', fontWeight: 600 }}>{total.toFixed(1)}h</span>
                    </td>
                    {days.map(d => {
                      const v = valueOf(row, d);
                      const intensity = v <= 0 ? 0 : Math.min(1, v / maxCell);
                      let cellBg = 'transparent';
                      let cellBorder = '1px solid var(--line)';
                      if (v > 0) {
                        const col = colorOf(row, d);
                        const pct = Math.round(Math.max(14, intensity * 85));
                        cellBg = `color-mix(in oklch, ${col} ${pct}%, transparent)`;
                        cellBorder = `1px solid color-mix(in oklch, ${col} ${Math.min(100, pct + 15)}%, transparent)`;
                      }
                      if (d === today) cellBorder = '1px solid var(--highlight)';
                      return (
                        <td key={d} onClick={() => onCellClick(row, d)}
                          title={v > 0 ? `${row} · ${d} · ${v.toFixed(2)}h` : `${row} · ${d}: —`}
                          style={{ width: CELL_W, height: CELL_H, padding: 0, background: cellBg, border: cellBorder, borderRadius: 2, cursor: v > 0 ? 'pointer' : 'default' }}/>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── CumulativeTable — generic batch-grouped all-time summary list, reused by the instructor roster ──
  function CumulativeTable({ title, groups, showBatchGroups, onRowClick }) {
    const empty = groups.length === 0 || groups.every(g => g.rows.length === 0);
    if (empty) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: 20, textAlign: 'center' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>NO DATA</span>
        </div>
      );
    }
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>{title}</div>
          <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>LATEST FLIGHT · ALL-TIME COMPLETED LESSONS / HOURS</div>
        </div>
        <div style={{ padding: '6px 0' }}>
          {groups.map(g => (
            <div key={g.key}>
              {showBatchGroups && (
                <div style={{ padding: '5px 16px', background: `color-mix(in oklch, ${g.color} 10%, var(--surface))`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: g.color, flexShrink: 0 }}/>
                  <span className="mono uc" style={{ fontSize: 10, fontWeight: 700, color: g.color }}>{g.key}</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{g.rows.length} · {g.totalLessons} lessons · {g.totalHours.toFixed(1)}h</span>
                </div>
              )}
              {g.rows.map(r => (
                <div key={r.name} onClick={() => onRowClick(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 16px', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</span>
                  <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)', width: 70, flexShrink: 0 }}>{r.latestDate || '—'}</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.latestLesson}</span>
                  <span className="mono num" style={{ fontSize: 9, color: 'var(--ink-2)', width: 36, textAlign: 'right', flexShrink: 0 }}>{r.lessons}</span>
                  <span className="mono num" style={{ fontSize: 9, color: 'var(--col-done)', width: 52, textAlign: 'right', flexShrink: 0 }}>{r.hours.toFixed(1)}h</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function PresetChip({ p, label, preset, setPreset }) {
    return (
      <span onClick={() => setPreset(p)} className="mono uc" style={{
        padding: '3px 9px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
        background: preset === p ? 'color-mix(in oklch,var(--ink-2) 14%,var(--surface))' : 'transparent',
        border: `1px solid ${preset === p ? 'var(--ink-2)' : 'var(--line)'}`,
        color: preset === p ? 'var(--ink)' : 'var(--ink-3)', fontWeight: preset === p ? 600 : 400,
      }}>{label}</span>
    );
  }

  function MetricChip({ m, label, metric, setMetric }) {
    return (
      <span onClick={() => setMetric(m)} className="mono uc" style={{
        padding: '3px 9px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
        background: metric === m ? 'color-mix(in oklch,var(--highlight) 14%,var(--surface))' : 'transparent',
        border: `1px solid ${metric === m ? 'var(--highlight)' : 'var(--line)'}`,
        color: metric === m ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: metric === m ? 600 : 400,
      }}>{label}</span>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // BatchSummary — all-time progress vs. curriculum plan, per batch
  // ──────────────────────────────────────────────────────────────────────
  function BatchSummary({ rows }) {
    if (rows.length === 0) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>NO BATCHES IN FILTERED SET</span>
        </div>
      );
    }
    const fmtH = v => (v == null ? '—' : v.toFixed(1) + 'h');
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>BATCH SUMMARY</div>
          <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>ALL-TIME PROGRESS VS CURRICULUM PLAN</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['BATCH', 'STUDENTS', 'LESSONS', 'HOURS', 'TIME REMAINING', 'LESSONS REM.', 'HOURS REM.', 'REQUIRED PACE'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: h === 'BATCH' ? 'left' : 'right', whiteSpace: 'nowrap' }}>
                    <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isHL = r.batch === HIGHLIGHT_BATCH;
                const col = sBatchColor(r.batch);
                if (!r.hasPlanData) {
                  return (
                    <tr key={r.batch} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: '6px 10px' }}>
                        <span className="mono uc" style={{ fontSize: 10, color: isHL ? 'var(--highlight)' : 'var(--ink-2)', fontWeight: isHL ? 700 : 400 }}>{r.batch}</span>
                      </td>
                      <td colSpan={7} style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>NO PLAN DATA</span>
                      </td>
                    </tr>
                  );
                }
                const paceLabel = r.complete ? 'DONE' : r.overdue ? 'OVERDUE' : `${(r.hoursPerDay || 0).toFixed(2)}h/d · ${(r.lessonsPerDay || 0).toFixed(2)}L/d`;
                const paceColor = r.complete ? 'var(--col-done)' : r.overdue ? 'var(--col-cancel)' : 'var(--ink-2)';
                return (
                  <tr key={r.batch} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '6px 10px' }}>
                      <span className="mono uc" style={{ fontSize: 10, color: isHL ? 'var(--highlight)' : 'var(--ink-2)', fontWeight: isHL ? 700 : 400 }}>{r.batch}</span>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}><span className="mono num" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.students}</span></td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}><span className="mono num" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.lessonsDone} / {r.lessonsTotal}</span></td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}><span className="mono num" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{fmtH(r.hoursDone)} / {fmtH(r.hoursTotal)}</span></td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}><span className="mono num" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.daysRemaining != null ? `${r.daysRemaining}d` : '—'}</span></td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}><span className="mono num" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.lessonsRemaining}</span></td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}><span className="mono num" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{fmtH(r.hoursRemaining)}</span></td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}><span className="mono num" style={{ fontSize: 10, color: paceColor, fontWeight: 600 }}>{paceLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function SequenceGapPanel({ rows }) {
    if (rows.length === 0) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--col-done, #3fb950)' }}>✓ NO SEQUENCE GAPS — every SP's completed lessons have no missing prior lesson</span>
        </div>
      );
    }
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>LESSON SEQUENCE CHECK</div>
          <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>
            {rows.length} SP{rows.length !== 1 ? 's' : ''} completed a lesson without an earlier one logged — investigate, not auto-fixed
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['BATCH', 'SP', 'REACHED', 'MISSING PRIOR LESSON(S)'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: h === 'MISSING PRIOR LESSON(S)' ? 'left' : 'left', whiteSpace: 'nowrap' }}>
                    <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isHL = r.batch === HIGHLIGHT_BATCH;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '6px 10px' }}><span className="mono uc" style={{ fontSize: 10, color: isHL ? 'var(--highlight)' : 'var(--ink-2)', fontWeight: isHL ? 700 : 400 }}>{r.batch}</span></td>
                    <td style={{ padding: '6px 10px' }}><span className="mono" style={{ fontSize: 10, color: 'var(--ink)' }}>{r.student}</span></td>
                    <td style={{ padding: '6px 10px' }}><span className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{r.reached}</span></td>
                    <td style={{ padding: '6px 10px' }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--col-cancel, #f85149)' }}>{r.missing.join(', ')}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // SummaryBoard — top-level Ops Analytics tab: period/metric header, filter
  // panel, KPI strip, batch composition, charts, breakdown table, rosters.
  // ══════════════════════════════════════════════════════════════════════
  function SummaryBoard() {
    const app = useApp();
    const { isMobile, highlightAP127, hideOthers } = app;
    const today = localToday();

    const [preset, setPreset]         = useState('30d'); // '14d' | '30d' | '90d' | 'custom'
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo]     = useState('');
    const [metric, setMetric]         = useState('effective'); // 'effective' | 'block'

    const [statusSel, setStatusSel]         = useState(['Completed']);
    const [batchMode, setBatchMode]         = useState('ap'); // 'ap' | 'all' | 'custom'
    const [customBatches, setCustomBatches] = useState([]);
    const [instructorSel, setInstructorSel] = useState(null);
    const [studentSel, setStudentSel]       = useState(null);
    const [typeSel, setTypeSel]             = useState(null);
    const [simOn, setSimOn]                 = useState(true);
    const [filterOpen, setFilterOpen]       = useState(false);

    const { from, to } = useMemo(() => {
      if (preset === 'custom' && customFrom && customTo && customFrom <= customTo) {
        return { from: customFrom, to: customTo };
      }
      return sPresetRange(preset, today);
    }, [preset, customFrom, customTo, today]);

    // Seed the custom range the first time CUSTOM is picked, so it starts as a sane 30d window.
    useEffect(() => {
      if (preset === 'custom' && !customFrom && !customTo) {
        const r = sPresetRange('30d', today);
        setCustomFrom(r.from);
        setCustomTo(r.to);
      }
    }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

    const allBatchNames = useMemo(() => [...new Set(FLIGHTS.map(f => f.batch))].filter(Boolean).sort(), []);
    const allInstructors = useMemo(() => [...new Set(FLIGHTS.map(f => f.instructor))].filter(Boolean).sort(), []);
    const allStudents = useMemo(() => [...new Set(FLIGHTS.map(f => f.student))].filter(Boolean).sort(), []);
    const tailToType = useMemo(() => {
      const m = {};
      RESOURCES.forEach(r => { if (r.tail) m[r.tail] = r.acType || 'Unknown'; });
      return m;
    }, []);
    const typeOptions = useMemo(() => {
      const present = new Set(RESOURCES.filter(r => r.acType && !/Classroom/i.test(r.acType)).map(r => r.acType));
      return S_TYPE_ORDER.filter(t => present.has(t));
    }, []);

    // Seed custom batches with the AP-only default the first time CUSTOM mode is picked.
    useEffect(() => {
      if (batchMode === 'custom' && customBatches.length === 0) {
        setCustomBatches(allBatchNames.filter(b => /^AP-/i.test(b)));
      }
    }, [batchMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const batchAllowed = useCallback(b => {
      if (batchMode === 'ap') return /^AP-/i.test(b || '');
      if (batchMode === 'all') return true;
      return customBatches.includes(b);
    }, [batchMode, customBatches]);

    const curMap = useMemo(() => (metric === 'effective' ? sBuildCurMap() : {}), [metric]);
    // Global (all-time, not period-filtered) — see sBuildEffectiveCreditSet's comment for why.
    const effectiveCredited = useMemo(() => sBuildEffectiveCreditSet(FLIGHTS), []);
    const hoursOf = useCallback(f => {
      if (f.status !== 'Completed') return 0;
      // Meetings / ground school are not flight hours (2026-08-31). Guard here
      // too, not just in fHrs(): the 'effective' branch below bypasses fHrs()
      // entirely and would otherwise credit a meeting its curriculum duration.
      if (f.isNonFlight) return 0;
      if (metric !== 'effective') return fHrs(f);
      // Effective hours: each curriculum lesson counts once per SP. A flight with no
      // lesson code can't be deduped (nothing to match against) and passes through.
      if (f.lesson && !effectiveCredited.has(f)) return 0;
      // The credited row always gets the lesson's full curriculum-standard duration
      // looked up by its BASE code — NOT via sEffectiveMins()'s own "/N" part parsing,
      // which would wrongly return 0 for a credited row that's a continuation leg (the
      // sBuildEffectiveCreditSet "no part-1 anywhere" fallback case).
      if (f.lesson) return (curMap[sBaseLessonCode(f.lesson)] != null ? curMap[sBaseLessonCode(f.lesson)] : f.durMin || 0) / 60;
      return sEffectiveMins(f, curMap) / 60;
    }, [metric, curMap, effectiveCredited]);

    const filteredFlights = useMemo(() => {
      return FLIGHTS.filter(f => {
        if (!f.date || f.date < from || f.date > to) return false;
        if (!batchAllowed(f.batch)) return false;
        if (statusSel && statusSel.length > 0) {
          const matchStatus = statusSel.includes(f.status);
          const matchStby = statusSel.includes('Standby') && f.isStandby;
          if (!matchStatus && !matchStby) return false;
        }
        if (instructorSel && !instructorSel.includes(f.instructor)) return false;
        if (studentSel && !studentSel.includes(f.student)) return false;
        if (typeSel && !typeSel.includes(tailToType[f.tail] || 'Unknown')) return false;
        if (!simOn && f.isSim) return false;
        if (hideOthers && highlightAP127 && !isAP127Batch(f.batch)) return false;
        return true;
      });
    }, [from, to, batchAllowed, statusSel, instructorSel, studentSel, typeSel, simOn, tailToType, hideOthers, highlightAP127]);

    const kpi = useMemo(() => {
      const s = { total: filteredFlights.length, pending: 0, completed: 0, canceled: 0, standby: 0, sim: 0, bookedHours: 0, completedHours: 0, simHours: 0 };
      let realCompleted = 0, realCanceled = 0;
      const batchSet = new Set();
      const studentSet = new Set();
      let ap127Hours = 0;
      filteredFlights.forEach(f => {
        if (f.status === 'Pending') s.pending++;
        if (f.status === 'Completed') s.completed++;
        if (f.status === 'Canceled') s.canceled++;
        if (f.isStandby) s.standby++;
        if (f.isSim) s.sim++;
        s.bookedHours += fHrs(f);
        const h = hoursOf(f);
        if (f.isSim) {
          s.simHours += h;
        } else {
          s.completedHours += h;
          if (f.status === 'Completed') realCompleted++;
          if (f.status === 'Canceled') realCanceled++;
          if (f.batch === HIGHLIGHT_BATCH) ap127Hours += h;
        }
        if (f.batch) batchSet.add(f.batch);
        if (f.student) studentSet.add(f.student);
      });
      const settled = realCompleted + realCanceled;
      return {
        ...s,
        completionRate: settled ? (realCompleted / settled) * 100 : null,
        cancellationRate: settled ? (realCanceled / settled) * 100 : null,
        avgHoursPerFlight: realCompleted ? s.completedHours / realCompleted : null,
        activeBatches: batchSet.size,
        activeStudents: studentSet.size,
        ap127SharePct: s.completedHours > 0 ? (ap127Hours / s.completedHours) * 100 : null,
      };
    }, [filteredFlights, hoursOf]);

    const batchStats = useMemo(() => {
      const m = {};
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        if (!m[b]) m[b] = { batch: b, total: 0, pending: 0, completed: 0, canceled: 0, standby: 0, bookedHours: 0, completedHours: 0, realHours: 0, simHours: 0 };
        m[b].total++;
        m[b].bookedHours += fHrs(f);
        const h = hoursOf(f);
        m[b].completedHours += h;
        if (f.isSim) m[b].simHours += h; else m[b].realHours += h;
        if (f.status === 'Pending') m[b].pending++;
        if (f.status === 'Completed') m[b].completed++;
        if (f.status === 'Canceled') m[b].canceled++;
        if (f.isStandby) m[b].standby++;
      });
      return Object.values(m);
    }, [filteredFlights, hoursOf]);

    const batchesPresent = useMemo(() => {
      const names = batchStats.map(b => b.batch);
      const apOnes = AP_BATCH_ORDER.filter(b => names.includes(b));
      const others = names.filter(b => !AP_BATCH_ORDER.includes(b)).sort();
      return [...apOnes, ...others];
    }, [batchStats]);

    const compositionSlices = useMemo(() => {
      const total = batchStats.reduce((a, b) => a + b.completedHours, 0);
      return [...batchStats]
        .filter(b => b.completedHours > 0 || b.total > 0)
        .sort((a, b) => b.completedHours - a.completedHours)
        .map(b => ({
          batch: b.batch,
          color: sBatchColor(b.batch),
          flights: b.total,
          hours: b.completedHours,
          realHours: b.realHours,
          simHours: b.simHours,
          pct: total > 0 ? (b.completedHours / total) * 100 : 0,
          realPct: total > 0 ? (b.realHours / total) * 100 : 0,
          simPct: total > 0 ? (b.simHours / total) * 100 : 0,
        }));
    }, [batchStats]);

    const days = useMemo(() => sDayRange(from, to), [from, to]);

    const dailyBuckets = useMemo(() => {
      const countReal = {}, countSim = {}, hourReal = {}, hourSim = {};
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        const target = f.isSim ? { c: countSim, h: hourSim } : { c: countReal, h: hourReal };
        if (!target.c[b]) target.c[b] = {};
        if (!target.h[b]) target.h[b] = {};
        target.c[b][f.date] = (target.c[b][f.date] || 0) + 1;
        target.h[b][f.date] = (target.h[b][f.date] || 0) + hoursOf(f);
      });
      return { countReal, countSim, hourReal, hourSim };
    }, [filteredFlights, hoursOf]);

    const dayLabels = useMemo(() => days.map(sFmtShort), [days]);
    const dailyCountSeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => {
        s[b] = {
          real: days.map(d => (dailyBuckets.countReal[b] || {})[d] || 0),
          sim: days.map(d => (dailyBuckets.countSim[b] || {})[d] || 0),
        };
      });
      return s;
    }, [batchesPresent, days, dailyBuckets]);
    const dailyHoursSeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => {
        s[b] = {
          real: days.map(d => (dailyBuckets.hourReal[b] || {})[d] || 0),
          sim: days.map(d => (dailyBuckets.hourSim[b] || {})[d] || 0),
        };
      });
      return s;
    }, [batchesPresent, days, dailyBuckets]);

    const weekLabelKeys = useMemo(() => { const set = new Set(); days.forEach(d => set.add(sWeekKey(d))); return [...set].sort(); }, [days]);
    const monthLabelKeys = useMemo(() => { const set = new Set(); days.forEach(d => set.add(sMonthKey(d))); return [...set].sort(); }, [days]);

    const weeklyBuckets = useMemo(() => {
      const real = {}, sim = {};
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        const wk = sWeekKey(f.date);
        const target = f.isSim ? sim : real;
        if (!target[b]) target[b] = {};
        target[b][wk] = (target[b][wk] || 0) + hoursOf(f);
      });
      return { real, sim };
    }, [filteredFlights, hoursOf]);
    const monthlyBuckets = useMemo(() => {
      const real = {}, sim = {};
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        const mk = sMonthKey(f.date);
        const target = f.isSim ? sim : real;
        if (!target[b]) target[b] = {};
        target[b][mk] = (target[b][mk] || 0) + hoursOf(f);
      });
      return { real, sim };
    }, [filteredFlights, hoursOf]);

    const weekLabels = useMemo(() => weekLabelKeys.map(sFmtWeek), [weekLabelKeys]);
    const monthLabels = useMemo(() => monthLabelKeys.map(sFmtMonth), [monthLabelKeys]);
    const weeklySeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => {
        s[b] = {
          real: weekLabelKeys.map(wk => (weeklyBuckets.real[b] || {})[wk] || 0),
          sim: weekLabelKeys.map(wk => (weeklyBuckets.sim[b] || {})[wk] || 0),
        };
      });
      return s;
    }, [batchesPresent, weekLabelKeys, weeklyBuckets]);
    const monthlySeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => {
        s[b] = {
          real: monthLabelKeys.map(mk => (monthlyBuckets.real[b] || {})[mk] || 0),
          sim: monthLabelKeys.map(mk => (monthlyBuckets.sim[b] || {})[mk] || 0),
        };
      });
      return s;
    }, [batchesPresent, monthLabelKeys, monthlyBuckets]);

    const studentDayMap = useMemo(() => {
      const m = {};
      filteredFlights.forEach(f => {
        if (!f.student) return;
        if (!m[f.student]) m[f.student] = {};
        m[f.student][f.date] = (m[f.student][f.date] || 0) + hoursOf(f);
      });
      return m;
    }, [filteredFlights, hoursOf]);

    const studentBatchMap = useMemo(() => {
      const counts = {};
      filteredFlights.forEach(f => {
        if (!f.student) return;
        if (!counts[f.student]) counts[f.student] = {};
        const b = f.batch || 'Unknown';
        counts[f.student][b] = (counts[f.student][b] || 0) + 1;
      });
      const m = {};
      Object.keys(counts).forEach(name => {
        const entries = Object.entries(counts[name]).sort((a, b) => b[1] - a[1]);
        m[name] = entries[0][0];
      });
      return m;
    }, [filteredFlights]);

    const rosterStudents = useMemo(() => {
      const set = new Set();
      filteredFlights.forEach(f => { if (f.student) set.add(f.student); });
      const names = [...set];
      names.sort((a, b) => {
        const ia = AP_BATCH_ORDER.indexOf(studentBatchMap[a]);
        const ib = AP_BATCH_ORDER.indexOf(studentBatchMap[b]);
        const oa = ia === -1 ? 999 : ia, ob = ib === -1 ? 999 : ib;
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b);
      });
      return names;
    }, [filteredFlights, studentBatchMap]);

    const studentValueOf = useCallback((row, d) => (studentDayMap[row] || {})[d] || 0, [studentDayMap]);
    const studentColorOf = useCallback(row => sResolveColor(sBatchColor(studentBatchMap[row])), [studentBatchMap]);
    const studentGroupOf = useCallback(row => {
      const b = studentBatchMap[row];
      return { key: b || 'Unknown', color: sBatchColor(b) };
    }, [studentBatchMap]);
    const handleStudentCellClick = useCallback((row, d) => {
      const dayFlights = filteredFlights.filter(f => f.student === row && f.date === d);
      if (dayFlights.length > 0) app.setDrawer(dayFlights[dayFlights.length - 1].id);
    }, [filteredFlights, app]);

    const cumulStudentGroups = useMemo(() => {
      const byStudent = {};
      FLIGHTS.forEach(f => {
        if (!f.student) return;
        if (!batchAllowed(f.batch)) return;
        if (!byStudent[f.student]) byStudent[f.student] = [];
        byStudent[f.student].push(f);
      });
      const rows = Object.keys(byStudent).map(name => {
        const flights = byStudent[name];
        let latest = null;
        let lessons = 0, hours = 0;
        const batchCount = {};
        flights.forEach(f => {
          if (!latest || f.date > latest.date) latest = f;
          if (f.status === 'Completed') { lessons++; hours += hoursOf(f); }
          const b = f.batch || 'Unknown';
          batchCount[b] = (batchCount[b] || 0) + 1;
        });
        const dominantBatch = Object.entries(batchCount).sort((a, b) => b[1] - a[1])[0][0];
        return { name, batch: dominantBatch, latestDate: latest.date, latestLesson: latest.lesson || '—', latestId: latest.id, lessons, hours };
      });
      const byBatch = {};
      rows.forEach(r => { if (!byBatch[r.batch]) byBatch[r.batch] = []; byBatch[r.batch].push(r); });
      const order = [...AP_BATCH_ORDER.filter(b => byBatch[b]), ...Object.keys(byBatch).filter(b => !AP_BATCH_ORDER.includes(b)).sort()];
      return order.map(b => {
        const rs = byBatch[b].sort((a, z) => z.hours - a.hours);
        return {
          key: b, color: sBatchColor(b), rows: rs,
          totalLessons: rs.reduce((a, r) => a + r.lessons, 0),
          totalHours: rs.reduce((a, r) => a + r.hours, 0),
        };
      });
    }, [batchAllowed, hoursOf]);

    const batchSummaryRows = useMemo(() => {
      return AP_BATCH_ORDER.filter(b => batchAllowed(b)).map(batch => {
        const roster = sBatchRoster(batch);
        if (roster.length === 0) {
          return { batch, hasPlanData: false };
        }
        let lessonsDone = 0, lessonsTotal = 0, hoursDone = 0, hoursTotal = 0;
        roster.forEach(s => {
          lessonsDone += (s.flown || []).length;
          lessonsTotal += s.total || 0;
          const doneMin = (s.flown || []).reduce((a, f) => a + (f.actual_mins || 0), 0);
          const remMin = (s.planned || []).reduce((a, p) => a + (p.mins || 0), 0);
          hoursDone += doneMin / 60;
          hoursTotal += (doneMin + remMin) / 60;
        });
        const targetDate = sBatchTargetDate(batch, roster);
        const daysRemaining = targetDate
          ? Math.round((new Date(targetDate + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000)
          : null;
        const lessonsRemaining = lessonsTotal - lessonsDone;
        const hoursRemaining = hoursTotal - hoursDone;
        const complete = lessonsRemaining <= 0;
        const overdue = !complete && daysRemaining != null && daysRemaining <= 0;
        const canPace = !complete && !overdue && daysRemaining != null && daysRemaining > 0;
        return {
          batch, hasPlanData: true, students: roster.length,
          lessonsDone, lessonsTotal, lessonsRemaining,
          hoursDone, hoursTotal, hoursRemaining,
          targetDate, daysRemaining, complete, overdue,
          hoursPerDay: canPace ? hoursRemaining / daysRemaining : null,
          lessonsPerDay: canPace ? lessonsRemaining / daysRemaining : null,
        };
      });
    }, [batchAllowed, today]);

    // All-time, batch-filtered — same scope as Batch Summary above (period selector doesn't apply).
    const sequenceGapRows = useMemo(() => sBuildSequenceGaps(batchAllowed), [batchAllowed]);

    const handleCumulRowClick = useCallback(r => { if (r.latestId) app.setDrawer(r.latestId); }, [app]);

    const rosterInstructors = useMemo(() => {
      const set = new Set();
      filteredFlights.forEach(f => { if (f.instructor) set.add(f.instructor); });
      return [...set].sort();
    }, [filteredFlights]);

    const instructorDayData = useMemo(() => {
      const hours = {};      // instructor -> date -> hours
      const batchHours = {}; // instructor -> date -> batch -> hours
      filteredFlights.forEach(f => {
        if (!f.instructor) return;
        const h = hoursOf(f);
        if (!hours[f.instructor]) { hours[f.instructor] = {}; batchHours[f.instructor] = {}; }
        hours[f.instructor][f.date] = (hours[f.instructor][f.date] || 0) + h;
        if (!batchHours[f.instructor][f.date]) batchHours[f.instructor][f.date] = {};
        const b = f.batch || 'Unknown';
        batchHours[f.instructor][f.date][b] = (batchHours[f.instructor][f.date][b] || 0) + h;
      });
      const dominantBatch = {};
      Object.keys(batchHours).forEach(name => {
        dominantBatch[name] = {};
        Object.keys(batchHours[name]).forEach(date => {
          const entries = Object.entries(batchHours[name][date]).sort((a, b) => b[1] - a[1]);
          dominantBatch[name][date] = entries.length ? entries[0][0] : 'Unknown';
        });
      });
      return { hours, dominantBatch };
    }, [filteredFlights, hoursOf]);

    const instructorValueOf = useCallback((row, d) => (instructorDayData.hours[row] || {})[d] || 0, [instructorDayData]);
    const instructorColorOf = useCallback((row, d) => sResolveColor(sBatchColor((instructorDayData.dominantBatch[row] || {})[d])), [instructorDayData]);
    const handleInstructorCellClick = useCallback((row, d) => {
      const dayFlights = filteredFlights.filter(f => f.instructor === row && f.date === d);
      if (dayFlights.length > 0) app.setDrawer(dayFlights[dayFlights.length - 1].id);
    }, [filteredFlights, app]);

    const cumulInstructorRows = useMemo(() => {
      const byInstr = {};
      FLIGHTS.forEach(f => {
        if (!f.instructor) return;
        if (instructorSel && !instructorSel.includes(f.instructor)) return;
        if (!byInstr[f.instructor]) byInstr[f.instructor] = [];
        byInstr[f.instructor].push(f);
      });
      const rows = Object.keys(byInstr).map(name => {
        const flights = byInstr[name];
        let latest = null, lessons = 0, hours = 0;
        flights.forEach(f => {
          if (!latest || f.date > latest.date) latest = f;
          if (f.status === 'Completed') { lessons++; hours += hoursOf(f); }
        });
        return { name, latestDate: latest.date, latestLesson: latest.lesson || '—', latestId: latest.id, lessons, hours };
      });
      rows.sort((a, b) => b.hours - a.hours);
      return rows;
    }, [instructorSel, hoursOf]);

    const cumulInstructorGroups = useMemo(() => ([{
      key: 'ALL INSTRUCTORS', color: 'var(--ink-2)', rows: cumulInstructorRows,
      totalLessons: cumulInstructorRows.reduce((a, r) => a + r.lessons, 0),
      totalHours: cumulInstructorRows.reduce((a, r) => a + r.hours, 0),
    }]), [cumulInstructorRows]);

    const resetFilters = () => {
      setStatusSel(['Completed']);
      setBatchMode('ap');
      setCustomBatches([]);
      setInstructorSel(null);
      setStudentSel(null);
      setTypeSel(null);
      setSimOn(true);
    };
    const filtersActive = statusSel.length !== 1 || statusSel[0] !== 'Completed'
      || batchMode !== 'ap' || !!instructorSel || !!studentSel || !!typeSel || !simOn;

    return (
      <ArtboardShell style={{ display: 'flex', flexDirection: 'column' }}>
        <ThemeStyle/>
        <div style={{ minHeight: 38, padding: '0 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', rowGap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--col-pending)', boxShadow: '0 0 8px var(--col-pending)' }}/>
            <ViewIcon id="analytics" size={12} color="var(--ink-2)"/>
            <div className="mono uc" style={{ fontSize: 11, fontWeight: 600 }}>OPS ANALYTICS</div>
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
            <PresetChip p="14d" label="14D" preset={preset} setPreset={setPreset}/>
            <PresetChip p="30d" label="30D" preset={preset} setPreset={setPreset}/>
            <PresetChip p="90d" label="90D" preset={preset} setPreset={setPreset}/>
            <PresetChip p="custom" label="CUSTOM" preset={preset} setPreset={setPreset}/>
          </div>

          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <DateCalendarTrigger value={customFrom} onChange={setCustomFrom} dateSet={DATE_SET}/>
              <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>→</span>
              <DateCalendarTrigger value={customTo} onChange={setCustomTo} dateSet={DATE_SET}/>
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
            <MetricChip m="effective" label="EFFECTIVE" metric={metric} setMetric={setMetric}/>
            <MetricChip m="block" label="BLOCK" metric={metric} setMetric={setMetric}/>
          </div>

          <FocusControls/>

          <div style={{ flex: 1 }}/>
          <RefreshButton/>
          <LastUpdate/>
        </div>

        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span onClick={() => setFilterOpen(v => !v)} className="mono uc" style={{
              padding: '4px 8px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${filterOpen || filtersActive ? 'var(--col-pending)' : 'var(--line)'}`,
              background: filterOpen || filtersActive ? 'color-mix(in oklch,var(--col-pending) 10%,transparent)' : 'transparent',
              color: filterOpen || filtersActive ? 'var(--col-pending)' : 'var(--ink-3)',
              fontWeight: filtersActive ? 600 : 400,
            }}>FILTERS {filterOpen ? '▲' : '▾'}</span>
            {filtersActive && (
              <span onClick={resetFilters} className="mono uc" style={{ fontSize: 8, padding: '3px 7px', borderRadius: 3, cursor: 'pointer', border: '1px solid var(--line)', color: 'var(--ink-3)' }}>RESET TO DEFAULT</span>
            )}
          </div>
          {filterOpen && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6 }}>
              <MultiSelectChips label="STATUS" options={['Pending','Completed','Canceled','Standby']} selected={statusSel.length ? statusSel : null} onChange={v => setStatusSel(v || [])} colorOf={statusColor}/>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>BATCH</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[['ap','AP ONLY'],['all','ALL'],['custom','CUSTOM']].map(([m,lbl]) => (
                    <span key={m} onClick={() => setBatchMode(m)} className="mono uc" style={{
                      padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                      background: batchMode === m ? 'color-mix(in oklch,var(--ink-2) 16%,transparent)' : 'transparent',
                      border: `1px solid ${batchMode === m ? 'var(--ink-2)' : 'var(--line)'}`,
                      color: batchMode === m ? 'var(--ink)' : 'var(--ink-3)', fontWeight: batchMode === m ? 600 : 400,
                    }}>{lbl}</span>
                  ))}
                </div>
                {batchMode === 'custom' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxHeight: 100, overflowY: 'auto' }}>
                    {allBatchNames.map(b => {
                      const on = customBatches.includes(b);
                      const col = sBatchColor(b);
                      return (
                        <span key={b} onClick={() => setCustomBatches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
                          className="mono uc" style={{
                            padding: '2px 7px', fontSize: 9, borderRadius: 3, cursor: 'pointer',
                            background: on ? `color-mix(in oklch,${col} 16%,transparent)` : 'transparent',
                            border: `1px solid ${on ? col : 'var(--line)'}`, color: on ? col : 'var(--ink-3)', fontWeight: on ? 600 : 400,
                          }}>{b}</span>
                      );
                    })}
                  </div>
                )}
              </div>
              <MultiSelectChips label="INSTRUCTOR" options={allInstructors} selected={instructorSel} onChange={setInstructorSel} searchable/>
              <MultiSelectChips label="STUDENT" options={allStudents} selected={studentSel} onChange={setStudentSel} searchable/>
              <MultiSelectChips label="AIRCRAFT TYPE" options={typeOptions} selected={typeSel} onChange={setTypeSel}/>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>SIMULATOR</span>
                <span onClick={() => setSimOn(v => !v)} className="mono uc" style={{
                  padding: '2px 8px', fontSize: 9, borderRadius: 3, cursor: 'pointer', width: 'fit-content',
                  background: simOn ? 'color-mix(in oklch,var(--col-sim) 16%,transparent)' : 'transparent',
                  border: `1px solid ${simOn ? 'var(--col-sim)' : 'var(--line)'}`, color: simOn ? 'var(--col-sim)' : 'var(--ink-3)',
                }}>{simOn ? 'SHOWING SIM' : 'HIDING SIM'}</span>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ padding: '10px 10px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <KpiStrip kpi={kpi} isMobile={isMobile}/>
            <CompositionStrip slices={compositionSlices} metricLabel={metric}/>
            <BatchSummary rows={batchSummaryRows}/>
            <SequenceGapPanel rows={sequenceGapRows}/>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <StackedBatchChart title="DAILY FLIGHT COUNT BY BATCH" subtitle="STACKED · ONE BAR PER DAY" labels={dayLabels} batches={batchesPresent} series={dailyCountSeries} unit="flights"/>
              <StackedBatchChart title="DAILY FLIGHT HOURS BY BATCH" subtitle={`STACKED · ${metric.toUpperCase()} HOURS`} labels={dayLabels} batches={batchesPresent} series={dailyHoursSeries} unit="hours"/>
              <StackedBatchChart title="WEEKLY HOURS BY BATCH" subtitle="MONDAY-START WEEKS" labels={weekLabels} batches={batchesPresent} series={weeklySeries} unit="hours"/>
              <StackedBatchChart title="MONTHLY HOURS BY BATCH" subtitle="CALENDAR MONTH" labels={monthLabels} batches={batchesPresent} series={monthlySeries} unit="hours"/>
            </div>
            <BreakdownTable title="BATCH BREAKDOWN" subtitle="PENDING · COMPLETED · CANCELED · STANDBY" rows={batchStats}/>
            <RosterHeatmap title="▦ STUDENT ACTIVITY — click cell for detail" rows={rosterStudents} days={days} today={today} valueOf={studentValueOf} colorOf={studentColorOf} onCellClick={handleStudentCellClick} groupOf={studentGroupOf}/>
            <CumulativeTable title="STUDENT ALL-TIME SUMMARY" groups={cumulStudentGroups} showBatchGroups onRowClick={handleCumulRowClick}/>
            <RosterHeatmap title="▦ INSTRUCTOR ACTIVITY — click cell for detail" rows={rosterInstructors} days={days} today={today} valueOf={instructorValueOf} colorOf={instructorColorOf} onCellClick={handleInstructorCellClick}/>
            <CumulativeTable title="INSTRUCTOR ALL-TIME SUMMARY" groups={cumulInstructorGroups} showBatchGroups={false} onRowClick={handleCumulRowClick}/>
          </div>
        </div>
        <Drawer/>
      </ArtboardShell>
    );
  }

  window.SummaryBoard = SummaryBoard;
})();
