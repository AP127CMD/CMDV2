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

  // Aircraft type order/labels — duplicated from view-aircraft.js's U_TYPE_ORDER (IIFE-scoped there, not exported).
  const S_TYPE_ORDER = ['DA40TDI', 'DA40CS', 'C172', 'DA42TDI', 'DA42NG', 'R44', 'DA40_SIM', 'DA42_SIM', 'R44_SIM'];

  // ══════════════════════════════════════════════════════════════════════
  // SummaryBoard — placeholder shell for now; filled in by Tasks 2-11.
  // ══════════════════════════════════════════════════════════════════════
  function SummaryBoard() {
    return (
      <ArtboardShell style={{ display: 'flex', flexDirection: 'column' }}>
        <ThemeStyle/>
        <div style={{ minHeight: 38, padding: '0 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ViewIcon id="analytics" size={12} color="var(--ink-2)"/>
          <div className="mono uc" style={{ fontSize: 11, fontWeight: 600 }}>OPS ANALYTICS</div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)' }}>Rebuilding — see implementation plan</span>
        </div>
        <Drawer/>
      </ArtboardShell>
    );
  }

  window.SummaryBoard = SummaryBoard;
})();
