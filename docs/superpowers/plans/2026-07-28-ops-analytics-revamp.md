# Ops Analytics Tab Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entire Ops Analytics tab (`js/view-summary.js`) with a batch-centric analytics view: period presets, a comprehensive local filter panel, an expanded KPI strip, a batch composition strip, four stacked-bar-over-time charts with data labels, the batch breakdown table, and student/instructor roster sections (day heatmap + all-time cumulative summary).

**Architecture:** Single self-contained file (`js/view-summary.js`, `type="text/babel"`, wrapped in an IIFE like `view-aircraft.js` to avoid leaking helper names into the shared global scope other Babel-compiled view files execute in). One top-level `SummaryBoard()` component holds all state; six small presentational subcomponents (`KpiStrip`, `CompositionStrip`, `BreakdownTable`, `StackedBatchChart`, `RosterHeatmap`, `CumulativeTable`) are pure-props components reused across sections. `window.SummaryBoard` stays the export so `js/shell.js`'s routing table (`analytics: window.SummaryBoard`) needs no change.

**Tech Stack:** React 18 (global, no build step, Babel Standalone in-browser), Chart.js 4.4.1 + `chartjs-plugin-datalabels` (both already loaded via CDN in `index.html`), existing shared components from `js/shared.js` (`ArtboardShell`, `ThemeStyle`, `FocusControls`, `RefreshButton`, `LastUpdate`, `DateCalendarTrigger`, `Drawer`, `useApp`).

## Global Constraints

- Keep the file self-contained: duplicate small helpers locally rather than reaching into `view-aircraft.js`'s IIFE-scoped internals (it does not expose them on `window`).
- Default filter state on load: status = Completed only, batch = AP-* only (`batchMode: 'ap'`), instructor/student/type = all, sim = off.
- Hours metric toggle (`EFFECTIVE` default / `BLOCK`) drives every hours figure on the tab (KPI, composition, charts, breakdown table, both rosters) via one shared `hoursOf(f)` function.
- No `index.html` or `js/shell.js` changes except the final cache-bust token bump (Task 12).
- No automated test suite exists for view files in this project (no-build CDN app) — verification is manual, in the browser preview, using `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'analytics'}))` to jump straight to the tab (documented in this project's `CLAUDE.md`). Pure helper functions with no DOM dependency (Task 1) get a throwaway Node assertion check instead, since they don't need a browser.
- Spec reference: `docs/superpowers/specs/2026-07-28-ops-analytics-revamp-design.md`.

---

## Shared data facts (verified against the live data files — needed by later tasks, don't re-derive)

- `RESOURCES` entries have a clean `acType` field (`'DA40TDI'|'DA40CS'|'C172'|'DA42TDI'|'DA42NG'|'R44'|'DA40_SIM'|'DA42_SIM'|'R44_SIM'`, plus `'Classroom'` to exclude) — this is the correct source for an "aircraft type" filter. **`f.type` on a flight is NOT a clean aircraft type** — real observed values include `'DA40 (SIM)'`, `'Classroom'`, `'Dual'`, `'PIC'`, `'SPIC'`, `'Solo'`, `null`, mixed with type-like strings. The aircraft-type filter must map `f.tail` → `RESOURCES` → `acType`, exactly like `view-aircraft.js`'s Utilization tab does.
- `--batch-ap124`, `--batch-ap126`, `--batch-ap127`, `--batch-ap128`, `--batch-ap129` CSS custom properties already exist in `css/theme.css` (all three theme variants) — canonical batch colors.
- `window.NGT_CACHE` has `cur124`, `cur126`, `cur127` curriculum arrays (each entry `{lesson, planned_mins}`) — **no `cur128`/`cur129`**, so Effective-hours mode falls back to block time for AP-128/AP-129 flights (same fallback `uEffectiveMins` already uses in `view-aircraft.js`).
- `DATE_SET` (a `Set` of every date string in `ALL_DATES`), `ALL_DATES`, `FLIGHTS`, `HIGHLIGHT_BATCH`, `localToday`, `fmtDay`, `RESOURCES` are all top-level `const`/`function` declarations in `js/shared.js` (a plain, non-module `<script>`), which classic `<script>` tags — including this project's `type="text/babel"` files — share as one global lexical scope. They are used directly (no `window.` prefix) exactly like the old `view-summary.js` already did.
- `fmtDay(d)` returns `{ wd, mo, day, y }` (e.g. `{wd:'TUE', mo:'JUL', day:28, y:2026}`).

---

### Task 1: File skeleton, pure helpers, IIFE wrapper

**Files:**
- Modify: `js/view-summary.js` (full rewrite — delete all existing content: `flownMin_s`, `BATCH_COLORS`, `DonutChart`, old `BreakdownTable`, old `SummaryBoard`)

**Interfaces:**
- Produces (used by every later task): `sAddDays(iso, n)`, `sDayRange(start, end)`, `sPresetRange(preset, today)`, `sBuildCurMap()`, `sEffectiveMins(f, curMap)`, `sBatchColor(batch)` → CSS color string, `sResolveColor(cssColor)` → literal color for canvas, `sWeekKey(dateStr)` → Monday-date string, `sMonthKey(dateStr)` → `YYYY-MM`, `sFmtShort(dateStr)`, `sFmtWeek(weekKey)`, `sFmtMonth(monthKey)`, constants `AP_BATCH_ORDER`, `NON_AP_PALETTE`, `S_TYPE_ORDER`. `window.SummaryBoard` (minimal placeholder for now, replaced incrementally by later tasks).

- [ ] **Step 1: Verify the pure date/color helper logic with a throwaway Node script (no DOM, so no browser needed)**

Run:

```bash
node -e "
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
  const dow = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}
function sMonthKey(dateStr) { return dateStr.slice(0, 7); }
const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); console.log('OK: ' + msg); };
assert(sAddDays('2026-07-28', 1) === '2026-07-29', 'sAddDays forward');
assert(sAddDays('2026-07-28', -28) === '2026-06-30', 'sAddDays across month');
const r14 = sPresetRange('14d', '2026-07-28');
assert(r14.from === '2026-07-15' && r14.to === '2026-07-28', 'sPresetRange 14d');
const r30 = sPresetRange('30d', '2026-07-28');
assert(r30.from === '2026-06-29' && r30.to === '2026-07-28', 'sPresetRange 30d');
const r90 = sPresetRange('90d', '2026-07-28');
assert(r90.from === '2026-04-30' && r90.to === '2026-07-28', 'sPresetRange 90d');
const days = sDayRange('2026-07-27', '2026-07-29');
assert(days.length === 3 && days[0] === '2026-07-27' && days[2] === '2026-07-29', 'sDayRange inclusive');
assert(sWeekKey('2026-07-28') === '2026-07-27', 'sWeekKey mid-week (Tue -> preceding Mon)');
assert(sWeekKey('2026-07-27') === '2026-07-27', 'sWeekKey on Monday (identity)');
assert(sMonthKey('2026-07-28') === '2026-07', 'sMonthKey');
console.log('ALL PASS');
"
```

Expected: every line prints `OK: ...` and the script ends with `ALL PASS`. These are the exact function bodies that go into the file in Step 2 — this just proves the logic in isolation before it's wired into JSX.

- [ ] **Step 2: Write the full file skeleton**

Replace the entire contents of `js/view-summary.js` with:

```jsx
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
```

- [ ] **Step 3: Verify the tab loads without console errors**

In the browser preview: open the app, run `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'analytics'}))` in the console (or click the "Ops Analytics" sidebar item). Confirm:
- The header shows "OPS ANALYTICS" and the placeholder text.
- No red errors in the browser console (check for Babel syntax errors or `ReferenceError`s — a typo in the IIFE would show up here immediately).

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): skeleton + pure date/color helpers for Ops Analytics revamp"
```

---

### Task 2: Header — period presets, custom calendar range, metric toggle, focus controls

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `sPresetRange`, `sAddDays` (Task 1); `ArtboardShell`, `ThemeStyle`, `ViewIcon`, `FocusControls`, `RefreshButton`, `LastUpdate`, `DateCalendarTrigger`, `useApp`, `localToday`, `DATE_SET`, `Drawer` (shared.js globals).
- Produces: `SummaryBoard`'s `preset`, `setPreset`, `customFrom`, `setCustomFrom`, `customTo`, `setCustomTo`, `metric`, `setMetric`, and derived `today`, `{from, to}` — all consumed by every later task in this file.

- [ ] **Step 1: Replace the `SummaryBoard` function body with the header**

In `js/view-summary.js`, replace the entire `function SummaryBoard() { ... }` block with:

```jsx
  function SummaryBoard() {
    const app = useApp();
    const { isMobile } = app;
    const today = localToday();

    const [preset, setPreset]         = useState('30d'); // '14d' | '30d' | '90d' | 'custom'
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo]     = useState('');
    const [metric, setMetric]         = useState('effective'); // 'effective' | 'block'

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

    const PresetChip = ({ p, label }) => (
      <span onClick={() => setPreset(p)} className="mono uc" style={{
        padding: '3px 9px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
        background: preset === p ? 'color-mix(in oklch,var(--ink-2) 14%,var(--surface))' : 'transparent',
        border: `1px solid ${preset === p ? 'var(--ink-2)' : 'var(--line)'}`,
        color: preset === p ? 'var(--ink)' : 'var(--ink-3)', fontWeight: preset === p ? 600 : 400,
      }}>{label}</span>
    );

    const MetricChip = ({ m, label }) => (
      <span onClick={() => setMetric(m)} className="mono uc" style={{
        padding: '3px 9px', fontSize: 9, borderRadius: 4, cursor: 'pointer',
        background: metric === m ? 'color-mix(in oklch,var(--highlight) 14%,var(--surface))' : 'transparent',
        border: `1px solid ${metric === m ? 'var(--highlight)' : 'var(--line)'}`,
        color: metric === m ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: metric === m ? 600 : 400,
      }}>{label}</span>
    );

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
            <PresetChip p="14d" label="14D"/>
            <PresetChip p="30d" label="30D"/>
            <PresetChip p="90d" label="90D"/>
            <PresetChip p="custom" label="CUSTOM"/>
          </div>

          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <DateCalendarTrigger value={customFrom} onChange={setCustomFrom} dateSet={DATE_SET}/>
              <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>→</span>
              <DateCalendarTrigger value={customTo} onChange={setCustomTo} dateSet={DATE_SET}/>
            </div>
          )}

          <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
            <MetricChip m="effective" label="EFFECTIVE"/>
            <MetricChip m="block" label="BLOCK"/>
          </div>

          <FocusControls/>

          <div style={{ flex: 1 }}/>
          <RefreshButton/>
          <LastUpdate/>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{from} → {to} · body sections land in later tasks</span>
        </div>
        <Drawer/>
      </ArtboardShell>
    );
  }
```

- [ ] **Step 2: Verify in the browser**

Navigate to the Analytics tab. Confirm:
- `14D`/`30D`/`90D`/`CUSTOM` chips are clickable and the highlighted one changes.
- Clicking `CUSTOM` reveals two date-calendar triggers seeded to a 30-day window; changing either updates the placeholder text's `from → to` range.
- `EFFECTIVE`/`BLOCK` chips toggle.
- The ◆ AP-127 / ONLY chips from `FocusControls` render and toggle (they affect global state shared with other tabs — that's expected, not a bug).
- No console errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): header with period presets, custom range, metric toggle"
```

---

### Task 3: Comprehensive filter panel + filtered flight set

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `FLIGHTS`, `RESOURCES` (shared.js globals); `S_TYPE_ORDER`, `sBatchColor`, `sBuildCurMap`, `sEffectiveMins` (Task 1); `from`, `to`, `metric` (Task 2).
- Produces: `filteredFlights` (array), `hoursOf(f)` (function), `batchAllowed(batch)` (function) — consumed by every section task from here on (4-11).

- [ ] **Step 1: Add the `MultiSelectChips` subcomponent**

In `js/view-summary.js`, add this function **above** `function SummaryBoard()`:

```jsx
  // Generic multi-select chip picker. selected === null means "all" (matches the
  // convention FilterBar already uses elsewhere in this app for filters.batches etc).
  function MultiSelectChips({ label, options, selected, onChange, colorOf, searchable }) {
    const [q, setQ] = useState('');
    const isAll = !selected || selected.length === 0;
    const isSel = v => isAll || selected.includes(v);
    const toggle = v => {
      if (isAll) { onChange([v]); return; } // first click from "all" isolates just this item
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
```

- [ ] **Step 2: Add filter state, derived lists, `filteredFlights`, and `hoursOf` inside `SummaryBoard`**

Insert this block right after the `metric`/`setMetric` state line (before the `{ from, to }` useMemo):

```jsx
    const [statusSel, setStatusSel]         = useState(['Completed']);
    const [batchMode, setBatchMode]         = useState('ap'); // 'ap' | 'all' | 'custom'
    const [customBatches, setCustomBatches] = useState([]);
    const [instructorSel, setInstructorSel] = useState(null);
    const [studentSel, setStudentSel]       = useState(null);
    const [typeSel, setTypeSel]             = useState(null);
    const [simOn, setSimOn]                 = useState(false);
    const [filterOpen, setFilterOpen]       = useState(false);
```

Then, after the `{ from, to }` / custom-range `useEffect` block from Task 2, add:

```jsx
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
    const hoursOf = useCallback(f => {
      if (f.status !== 'Completed') return 0;
      const mins = metric === 'effective' ? sEffectiveMins(f, curMap) : (f.durMin || 0);
      return mins / 60;
    }, [metric, curMap]);

    const filteredFlights = useMemo(() => {
      return FLIGHTS.filter(f => {
        if (!f.date || f.date < from || f.date > to) return false;
        if (!batchAllowed(f.batch)) return false;
        if (statusSel && statusSel.length > 0 && !statusSel.includes(f.status)) return false;
        if (instructorSel && !instructorSel.includes(f.instructor)) return false;
        if (studentSel && !studentSel.includes(f.student)) return false;
        if (typeSel && !typeSel.includes(tailToType[f.tail] || 'Unknown')) return false;
        if (!simOn && f.isSim) return false;
        return true;
      });
    }, [from, to, batchAllowed, statusSel, instructorSel, studentSel, typeSel, simOn, tailToType]);

    const resetFilters = () => {
      setStatusSel(['Completed']);
      setBatchMode('ap');
      setCustomBatches([]);
      setInstructorSel(null);
      setStudentSel(null);
      setTypeSel(null);
      setSimOn(false);
    };
    const filtersActive = statusSel.length !== 1 || statusSel[0] !== 'Completed'
      || batchMode !== 'ap' || !!instructorSel || !!studentSel || !!typeSel || simOn;
```

- [ ] **Step 3: Render the filter panel and a temporary verification readout**

Replace the placeholder `<div style={{ flex: 1, ... }}>...</div>` body block from Task 2 with:

```jsx
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

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{filteredFlights.length} flights matched · body sections land in later tasks</span>
        </div>
```

- [ ] **Step 4: Verify in the browser**

Navigate to the Analytics tab. Confirm:
- On load, the "flights matched" count is non-zero and reflects Completed + AP-* batches for the default 30-day window.
- Opening FILTERS and switching BATCH to `ALL` increases the count (non-AP batches like `HP-55`, `TCAR` now included).
- Toggling STATUS to include `Pending`/`Canceled` changes the count.
- Typing in the STUDENT search box filters the chip list; selecting one narrows the count to just that student's flights.
- `RESET TO DEFAULT` appears once any filter changes, and clicking it restores the original count.
- No console errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): comprehensive filter panel + filteredFlights/hoursOf"
```

---

### Task 4: KPI strip

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `filteredFlights`, `hoursOf` (Task 3); `HIGHLIGHT_BATCH` (shared.js global).
- Produces: `kpi` object, `<KpiStrip/>` component — `kpi` also feeds nothing else downstream (composition/batch stats are computed independently in Task 5), so no new shared interface beyond the component itself.

- [ ] **Step 1: Add the `KpiStrip` component**

Add above `function SummaryBoard()`:

```jsx
  function KpiStrip({ kpi, isMobile }) {
    const Tile = ({ label, value, color, sub }) => (
      <div style={{ padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, borderTop: `2px solid ${color}`, minWidth: 76 }}>
        <div className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)' }}>{label}</div>
        <div className="num" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1, color: 'var(--ink)', marginTop: 2 }}>{value}</div>
        {sub && <div className="mono uc" style={{ fontSize: 8, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>}
      </div>
    );
    const pct = v => (v == null ? '—' : `${v.toFixed(0)}%`);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(auto-fit,minmax(96px,1fr))', gap: 8 }}>
        <Tile label="TOTAL" value={kpi.total} color="var(--ink-2)" sub={`${kpi.bookedHours.toFixed(0)}h booked`}/>
        <Tile label="PENDING" value={kpi.pending} color="var(--col-pending)"/>
        <Tile label="COMPLETED" value={kpi.completed} color="var(--col-done)"/>
        <Tile label="CANCELED" value={kpi.canceled} color="var(--col-cancel)"/>
        <Tile label="STANDBY" value={kpi.standby} color="var(--col-stby)"/>
        <Tile label="SIM" value={kpi.sim} color="var(--col-sim)"/>
        <Tile label="HOURS" value={kpi.completedHours.toFixed(1)} color="var(--col-done)"/>
        <Tile label="COMPLETION" value={pct(kpi.completionRate)} color="var(--col-done)"/>
        <Tile label="CANCELLATION" value={pct(kpi.cancellationRate)} color="var(--col-cancel)"/>
        <Tile label="AVG H/FLIGHT" value={kpi.avgHoursPerFlight == null ? '—' : kpi.avgHoursPerFlight.toFixed(1)} color="var(--ink-2)"/>
        <Tile label="BATCHES" value={kpi.activeBatches} color="var(--ink-2)"/>
        <Tile label="STUDENTS" value={kpi.activeStudents} color="var(--ink-2)"/>
        <Tile label="AP-127 SHARE" value={pct(kpi.ap127SharePct)} color="var(--highlight)"/>
      </div>
    );
  }
```

- [ ] **Step 2: Compute `kpi` inside `SummaryBoard` and render `<KpiStrip/>`**

Add this `useMemo` right after the `filteredFlights` block from Task 3:

```jsx
    const kpi = useMemo(() => {
      const s = { total: filteredFlights.length, pending: 0, completed: 0, canceled: 0, standby: 0, sim: 0, bookedHours: 0, completedHours: 0 };
      const batchSet = new Set();
      const studentSet = new Set();
      let ap127Hours = 0;
      filteredFlights.forEach(f => {
        if (f.status === 'Pending') s.pending++;
        if (f.status === 'Completed') s.completed++;
        if (f.status === 'Canceled') s.canceled++;
        if (f.isStandby) s.standby++;
        if (f.isSim) s.sim++;
        s.bookedHours += (f.durMin || 0) / 60;
        const h = hoursOf(f);
        s.completedHours += h;
        if (f.batch === HIGHLIGHT_BATCH) ap127Hours += h;
        if (f.batch) batchSet.add(f.batch);
        if (f.student) studentSet.add(f.student);
      });
      const settled = s.completed + s.canceled;
      return {
        ...s,
        completionRate: settled ? (s.completed / settled) * 100 : null,
        cancellationRate: settled ? (s.canceled / settled) * 100 : null,
        avgHoursPerFlight: s.completed ? s.completedHours / s.completed : null,
        activeBatches: batchSet.size,
        activeStudents: studentSet.size,
        ap127SharePct: s.completedHours > 0 ? (ap127Hours / s.completedHours) * 100 : null,
      };
    }, [filteredFlights, hoursOf]);
```

Then replace the temporary `<div style={{ flex: 1, ...}}>{filteredFlights.length} flights matched...</div>` block from Task 3 with:

```jsx
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ padding: '10px 10px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <KpiStrip kpi={kpi} isMobile={isMobile}/>
          </div>
        </div>
```

- [ ] **Step 3: Verify in the browser**

Navigate to Analytics. Confirm all 13 KPI tiles render with plausible numbers (e.g. COMPLETION should read close to 100% since the default filter is Completed-only, so CANCELLATION reads 0%/— given no canceled flights are in the default set). Toggle STATUS to include Canceled and confirm COMPLETION/CANCELLATION rates now reflect a real completed-vs-canceled mix. Toggle `BLOCK` metric and confirm the HOURS tile changes (effective vs block hours differ for lessons with curriculum data).

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): KPI strip with completion/cancellation rate, AP-127 share"
```

---

### Task 5: Batch stats + composition strip

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `filteredFlights`, `hoursOf` (Task 3); `sBatchColor`, `AP_BATCH_ORDER` (Task 1); `HIGHLIGHT_BATCH` (shared.js).
- Produces: `batchStats` (array, also consumed by Task 6 charts and Task 8 breakdown table), `batchesPresent` (ordered batch-name array, also consumed by Task 6/7 charts).

- [ ] **Step 1: Add the `CompositionStrip` component**

Add above `function SummaryBoard()`:

```jsx
  function CompositionStrip({ slices, metricLabel }) {
    if (slices.length === 0) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
          <span className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)' }}>NO BATCHES IN FILTERED SET</span>
        </div>
      );
    }
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="mono uc" style={{ fontSize: 10, color: 'var(--ink)', fontWeight: 600 }}>BATCH COMPOSITION</div>
          <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 1 }}>SHARE OF {metricLabel.toUpperCase()} HOURS IN PERIOD</div>
        </div>
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', height: 22, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--line)' }}>
            {slices.map(s => (
              <div key={s.batch} title={`${s.batch}: ${s.pct.toFixed(1)}% · ${s.hours.toFixed(1)}h`}
                style={{ width: `${Math.max(s.pct, 0.5)}%`, background: s.color, opacity: 0.88 }}/>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
            {slices.map(s => (
              <div key={s.batch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }}/>
                <span className="mono uc" style={{ fontSize: 10, color: s.batch === HIGHLIGHT_BATCH ? 'var(--highlight)' : 'var(--ink-2)', fontWeight: s.batch === HIGHLIGHT_BATCH ? 700 : 400 }}>{s.batch}</span>
                <span className="mono num" style={{ fontSize: 9, color: 'var(--ink-3)' }}>{s.flights} flt · {s.hours.toFixed(1)}h · {s.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
```

- [ ] **Step 2: Compute `batchStats`, `batchesPresent`, `compositionSlices` inside `SummaryBoard`**

Add right after the `kpi` `useMemo` from Task 4:

```jsx
    const batchStats = useMemo(() => {
      const m = {};
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        if (!m[b]) m[b] = { batch: b, total: 0, pending: 0, completed: 0, canceled: 0, standby: 0, bookedHours: 0, completedHours: 0 };
        m[b].total++;
        m[b].bookedHours += (f.durMin || 0) / 60;
        m[b].completedHours += hoursOf(f);
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
          pct: total > 0 ? (b.completedHours / total) * 100 : 0,
        }));
    }, [batchStats]);
```

Then add `<CompositionStrip/>` right after `<KpiStrip .../>` in the render:

```jsx
            <KpiStrip kpi={kpi} isMobile={isMobile}/>
            <CompositionStrip slices={compositionSlices} metricLabel={metric}/>
```

- [ ] **Step 3: Verify in the browser**

Confirm the composition strip renders a horizontal stacked bar with one segment per AP batch present, plus a legend below showing flight count / hours / % per batch, using the same colors as elsewhere in the app (AP-127 should be the same magenta/pink used across the rest of the app). Hovering a segment shows a tooltip with batch/percent/hours. Switching BATCH filter to `ALL` should add non-AP batches with grey-scale colors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): batch stats + composition strip"
```

---

### Task 6: Chart component + daily count/hours charts

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `batchesPresent`, `batchStats` (Task 5); `filteredFlights`, `hoursOf` (Task 3); `sBatchColor`, `sResolveColor`, `sFmtShort` (Task 1); global `Chart`, `window.ChartDataLabels` (CDN, already loaded in `index.html`).
- Produces: `<StackedBatchChart/>` component (also reused by Task 7), `days` array (also consumed by Tasks 9/11 roster heatmaps).

- [ ] **Step 1: Add the `StackedBatchChart` component**

Add above `function SummaryBoard()`:

```jsx
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

      const datasets = batches.map(b => {
        const col = sResolveColor(sBatchColor(b));
        return {
          label: b,
          data: (series[b] || labels.map(() => 0)).map(v => +v.toFixed(unit === 'hours' ? 2 : 0)),
          backgroundColor: col,
          borderColor: col,
          borderWidth: 0.5,
          stack: 'batches',
          datalabels: {
            color: '#0b0e14',
            font: { family: 'monospace', size: 8, weight: '600' },
            display: ctx => {
              const v = ctx.dataset.data[ctx.dataIndex];
              const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
              const bar = meta.data[ctx.dataIndex];
              return v > 0 && bar && bar.height > 11;
            },
            formatter: v => (v > 0 ? (unit === 'hours' ? v.toFixed(1) : String(v)) : null),
            anchor: 'center', align: 'center',
          },
        };
      });

      const ctx = canvasRef.current.getContext('2d');
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top', labels: { color: ink3, font: { family: 'monospace', size: 9 }, boxWidth: 10, padding: 8 } },
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${Number(c.raw).toFixed(unit === 'hours' ? 1 : 0)}${unit === 'hours' ? 'h' : ''}` } },
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
```

- [ ] **Step 2: Compute `days`, daily bucket data, and render the two daily charts**

Add right after `compositionSlices` from Task 5:

```jsx
    const days = useMemo(() => sDayRange(from, to), [from, to]);

    const dailyBuckets = useMemo(() => {
      const countMap = {}; // batch -> date -> count
      const hourMap = {};  // batch -> date -> hours
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        if (!countMap[b]) { countMap[b] = {}; hourMap[b] = {}; }
        countMap[b][f.date] = (countMap[b][f.date] || 0) + 1;
        hourMap[b][f.date] = (hourMap[b][f.date] || 0) + hoursOf(f);
      });
      return { countMap, hourMap };
    }, [filteredFlights, hoursOf]);

    const dayLabels = useMemo(() => days.map(sFmtShort), [days]);
    const dailyCountSeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => { s[b] = days.map(d => (dailyBuckets.countMap[b] || {})[d] || 0); });
      return s;
    }, [batchesPresent, days, dailyBuckets]);
    const dailyHoursSeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => { s[b] = days.map(d => (dailyBuckets.hourMap[b] || {})[d] || 0); });
      return s;
    }, [batchesPresent, days, dailyBuckets]);
```

Then, in the render, add the two-column chart grid right after `<CompositionStrip .../>`:

```jsx
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <StackedBatchChart title="DAILY FLIGHT COUNT BY BATCH" subtitle="STACKED · ONE BAR PER DAY" labels={dayLabels} batches={batchesPresent} series={dailyCountSeries} unit="flights"/>
              <StackedBatchChart title="DAILY FLIGHT HOURS BY BATCH" subtitle={`STACKED · ${metric.toUpperCase()} HOURS`} labels={dayLabels} batches={batchesPresent} series={dailyHoursSeries} unit="hours"/>
            </div>
```

- [ ] **Step 3: Verify in the browser**

Confirm both charts render stacked bars, one bar per day in the selected period, colored per batch matching the composition strip's legend colors. Data labels appear inside segments large enough to fit them, and are hidden on tiny segments. Click a batch name in a chart's own legend — that chart's bars for that batch toggle visibility; the other chart and the rest of the page are unaffected. Switch preset to `90D` and confirm the x-axis still renders (rotated/thinned labels, no overflow crash).

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): StackedBatchChart + daily count/hours charts with datalabels"
```

---

### Task 7: Weekly + monthly hours charts

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `StackedBatchChart` (Task 6); `days`, `filteredFlights`, `hoursOf`, `batchesPresent` (Tasks 3/5/6); `sWeekKey`, `sMonthKey`, `sFmtWeek`, `sFmtMonth` (Task 1).
- Produces: nothing new consumed by later tasks — this task is a leaf addition to the chart grid.

- [ ] **Step 1: Compute weekly/monthly buckets and render the two additional charts**

Add right after the `dailyHoursSeries` `useMemo` from Task 6:

```jsx
    const weekLabelKeys = useMemo(() => { const set = new Set(); days.forEach(d => set.add(sWeekKey(d))); return [...set].sort(); }, [days]);
    const monthLabelKeys = useMemo(() => { const set = new Set(); days.forEach(d => set.add(sMonthKey(d))); return [...set].sort(); }, [days]);

    const weeklyBuckets = useMemo(() => {
      const m = {}; // batch -> weekKey -> hours
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        const wk = sWeekKey(f.date);
        if (!m[b]) m[b] = {};
        m[b][wk] = (m[b][wk] || 0) + hoursOf(f);
      });
      return m;
    }, [filteredFlights, hoursOf]);
    const monthlyBuckets = useMemo(() => {
      const m = {}; // batch -> monthKey -> hours
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        const mk = sMonthKey(f.date);
        if (!m[b]) m[b] = {};
        m[b][mk] = (m[b][mk] || 0) + hoursOf(f);
      });
      return m;
    }, [filteredFlights, hoursOf]);

    const weekLabels = useMemo(() => weekLabelKeys.map(sFmtWeek), [weekLabelKeys]);
    const monthLabels = useMemo(() => monthLabelKeys.map(sFmtMonth), [monthLabelKeys]);
    const weeklySeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => { s[b] = weekLabelKeys.map(wk => (weeklyBuckets[b] || {})[wk] || 0); });
      return s;
    }, [batchesPresent, weekLabelKeys, weeklyBuckets]);
    const monthlySeries = useMemo(() => {
      const s = {};
      batchesPresent.forEach(b => { s[b] = monthLabelKeys.map(mk => (monthlyBuckets[b] || {})[mk] || 0); });
      return s;
    }, [batchesPresent, monthLabelKeys, monthlyBuckets]);
```

Then extend the chart grid from Task 6 to include both new charts:

```jsx
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <StackedBatchChart title="DAILY FLIGHT COUNT BY BATCH" subtitle="STACKED · ONE BAR PER DAY" labels={dayLabels} batches={batchesPresent} series={dailyCountSeries} unit="flights"/>
              <StackedBatchChart title="DAILY FLIGHT HOURS BY BATCH" subtitle={`STACKED · ${metric.toUpperCase()} HOURS`} labels={dayLabels} batches={batchesPresent} series={dailyHoursSeries} unit="hours"/>
              <StackedBatchChart title="WEEKLY HOURS BY BATCH" subtitle="MONDAY-START WEEKS" labels={weekLabels} batches={batchesPresent} series={weeklySeries} unit="hours"/>
              <StackedBatchChart title="MONTHLY HOURS BY BATCH" subtitle="CALENDAR MONTH" labels={monthLabels} batches={batchesPresent} series={monthlySeries} unit="hours"/>
            </div>
```

- [ ] **Step 2: Verify in the browser**

Confirm all 4 charts now render in a 2×2 grid. Switch preset to `14D` and confirm the weekly chart shows ~2 bars and the monthly chart shows 1 bar (still renders, doesn't crash on a short range). Switch to `90D` and confirm weekly shows ~13 bars, monthly ~3-4 bars.

- [ ] **Step 3: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): weekly + monthly hours-by-batch charts"
```

---

### Task 8: Batch breakdown table

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `batchStats` (Task 5); `HIGHLIGHT_BATCH`, `LeaveBadge`, `leavesOnDate`, `localToday` (shared.js globals).
- Produces: `<BreakdownTable/>` component — leaf addition, nothing downstream depends on it.

- [ ] **Step 1: Add the `BreakdownTable` component**

Add above `function SummaryBoard()` (this is the same visual design the old file used, ported as-is since the spec keeps it):

```jsx
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
                  {todayLeaves[name] && <LeaveBadge reason={todayLeaves[name]}/>}
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
```

- [ ] **Step 2: Render it below the chart grid**

Add right after the 2×2 chart grid `<div>` from Task 7:

```jsx
            <BreakdownTable title="BATCH BREAKDOWN" subtitle="PENDING · COMPLETED · CANCELED · STANDBY" rows={batchStats}/>
```

- [ ] **Step 3: Verify in the browser**

Confirm a horizontal-bar table renders below the charts, one row per batch, sorted by completed hours descending, with the same Pending/Completed/Canceled/Standby colored segments as the old Ops Analytics tab used. AP-127's row should be highlighted (magenta text).

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): batch breakdown table"
```

---

### Task 9: Student roster — day-by-day heatmap

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `filteredFlights`, `hoursOf` (Task 3); `days` (Task 6); `sBatchColor` (Task 1); `useApp` (for `setDrawer`).
- Produces: `<RosterHeatmap/>` component (also reused by Task 11 for instructors), `rosterStudents`, `studentDayMap`, `studentBatchMap` (local to this section, not consumed elsewhere).

- [ ] **Step 1: Add the `RosterHeatmap` component**

Add above `function SummaryBoard()`:

```jsx
  function RosterHeatmap({ title, rows, days, today, valueOf, colorOf, onCellClick }) {
    const CELL_W = Math.max(10, Math.min(26, Math.floor(700 / Math.max(days.length, 1))));
    const CELL_H = 20;
    const maxCell = useMemo(() => {
      let mx = 0.25;
      rows.forEach(r => days.forEach(d => { const v = valueOf(r, d); if (v > mx) mx = v; }));
      return mx;
    }, [rows, days, valueOf]);

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
              {rows.map(row => {
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
                      const col = colorOf(row, d);
                      const intensity = v <= 0 ? 0 : Math.min(1, v / maxCell);
                      let cellBg = 'transparent';
                      let cellBorder = '1px solid var(--line)';
                      if (v > 0) {
                        const pct = Math.round(Math.max(14, intensity * 85));
                        cellBg = `color-mix(in oklch, ${col} ${pct}%, transparent)`;
                        cellBorder = `1px solid color-mix(in oklch, ${col} ${Math.min(100, pct + 15)}%, transparent)`;
                      }
                      if (d === today) cellBorder = '1px solid var(--highlight)';
                      return (
                        <td key={d} onClick={() => onCellClick(row, d)}
                          title={v > 0 ? `${row} · ${d} · ${v.toFixed(1)}h` : `${row} · ${d}: —`}
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
```

- [ ] **Step 2: Compute student roster data and render the heatmap**

Add right after the `<BreakdownTable/>`-feeding code from Task 8 (after `batchStats`/`batchesPresent`, anywhere before the return statement — place it after the weekly/monthly bucket code from Task 7):

```jsx
    const rosterStudents = useMemo(() => {
      const set = new Set();
      filteredFlights.forEach(f => { if (f.student) set.add(f.student); });
      return [...set].sort();
    }, [filteredFlights]);

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

    const studentValueOf = useCallback((row, d) => (studentDayMap[row] || {})[d] || 0, [studentDayMap]);
    const studentColorOf = useCallback(row => sResolveColor(sBatchColor(studentBatchMap[row])), [studentBatchMap]);
    const handleStudentCellClick = useCallback((row, d) => {
      const dayFlights = filteredFlights.filter(f => f.student === row && f.date === d);
      if (dayFlights.length > 0) app.setDrawer(dayFlights[dayFlights.length - 1].id);
    }, [filteredFlights, app]);
```

Then render it right after `<BreakdownTable .../>` from Task 8:

```jsx
            <RosterHeatmap title="▦ STUDENT ACTIVITY — click cell for detail" rows={rosterStudents} days={days} today={today} valueOf={studentValueOf} colorOf={studentColorOf} onCellClick={handleStudentCellClick}/>
```

- [ ] **Step 3: Verify in the browser**

Confirm the heatmap renders one row per student who has a filtered flight in the period, columns for each day, cells colored by that student's batch (AP-127 students should show the same magenta used everywhere else), with opacity increasing for more hours that day. Click a colored cell — the shared flight detail drawer (right-side panel) should open showing that day's flight for that student. Click an empty cell — nothing happens.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): student roster day-by-day heatmap"
```

---

### Task 10: Student roster — cumulative summary table

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `FLIGHTS` (shared.js global, all-time — NOT `filteredFlights`); `batchAllowed`, `hoursOf` (Task 3); `sBatchColor`, `AP_BATCH_ORDER` (Task 1); `useApp` (for `setDrawer`).
- Produces: `<CumulativeTable/>` component (also reused by Task 11 for instructors).

- [ ] **Step 1: Add the `CumulativeTable` component**

Add above `function SummaryBoard()`:

```jsx
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
```

- [ ] **Step 2: Compute `cumulStudentGroups` and render the table**

Add right after the student heatmap code from Task 9:

```jsx
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

    const handleCumulRowClick = useCallback(r => { if (r.latestId) app.setDrawer(r.latestId); }, [app]);
```

Then render it right after `<RosterHeatmap .../>` (student) from Task 9:

```jsx
            <CumulativeTable title="STUDENT ALL-TIME SUMMARY" groups={cumulStudentGroups} showBatchGroups onRowClick={handleCumulRowClick}/>
```

- [ ] **Step 3: Verify in the browser**

Confirm the table renders batch-grouped header rows (AP-124/126/127/128/129, in that order, only for batches actually present) each followed by student rows sorted by all-time completed hours descending, showing latest flight date + lesson code, total completed lessons, and total completed hours. **Change the period preset (e.g. 14D → 90D) and confirm this table's numbers do NOT change** — it's all-time, not period-scoped, per the design decision. Click a student row — the flight detail drawer opens showing their most recent flight.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): student roster all-time cumulative summary table"
```

---

### Task 11: Instructor roster — day heatmap + cumulative table

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `RosterHeatmap` (Task 9), `CumulativeTable` (Task 10); `filteredFlights`, `hoursOf`, `instructorSel` (Task 3); `FLIGHTS`, `days` (Tasks 3/6).
- Produces: nothing new consumed elsewhere — leaf addition.

- [ ] **Step 1: Compute instructor roster data**

Add right after the `handleCumulRowClick` line from Task 10:

```jsx
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
```

- [ ] **Step 2: Render both instructor sections**

Add right after `<CumulativeTable .../>` (student) from Task 10:

```jsx
            <RosterHeatmap title="▦ INSTRUCTOR ACTIVITY — click cell for detail" rows={rosterInstructors} days={days} today={today} valueOf={instructorValueOf} colorOf={instructorColorOf} onCellClick={handleInstructorCellClick}/>
            <CumulativeTable title="INSTRUCTOR ALL-TIME SUMMARY" groups={cumulInstructorGroups} showBatchGroups={false} onRowClick={handleCumulRowClick}/>
```

- [ ] **Step 3: Verify in the browser**

Confirm the instructor heatmap renders, cell colors reflecting whichever batch that instructor flew the most hours with on that specific day (an instructor teaching both AP-127 and AP-124 students in the same period should show cells in different colors on different days). Confirm the instructor cumulative table renders as a single flat list (no batch group headers), sorted by all-time hours descending. Open FILTERS, select a single instructor in the INSTRUCTOR filter — confirm the cumulative table narrows to just that instructor while the student cumulative table (governed by batch filter, Task 10) is unaffected.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "wip(analytics): instructor roster day heatmap + all-time cumulative summary"
```

---

### Task 12: Mobile pass, cache-bust, docs, final commit

**Files:**
- Modify: `js/view-summary.js` (mobile layout check only, fix if broken)
- Modify: `index.html` (bump `?v=pNN` on all `<script>` tags)
- Modify: `REVAMP.md` (change log entry)
- Modify: `CLAUDE.md` (Verify section)
- Modify: `/Users/nugui/AP127_Docs/README.md` (§2.4 + §10 log entry)

**Interfaces:** None — this is the wrap-up task, no new code interfaces.

- [ ] **Step 1: Mobile layout check**

In the browser preview, use the resize/viewport tool to switch to a mobile width (~390px). Navigate to Analytics. Confirm:
- KPI strip wraps to 3 columns (per `isMobile` prop already wired in Task 4).
- The 2×2 chart grid collapses to a single column (already wired via `isMobile ? '1fr' : '1fr 1fr'` in Task 7).
- Roster heatmap tables scroll horizontally inside their own container (`overflowX: 'auto'` already set in Task 9) without the page itself gaining horizontal scroll.
- Filter panel's `repeat(auto-fit,minmax(150px,1fr))` grid stacks to fewer columns without overlapping text.

If anything overflows the viewport horizontally at the page level (not inside an intentionally-scrollable table), fix the offending element's `overflow`/`minWidth` in `js/view-summary.js` before continuing.

- [ ] **Step 2: Determine the current cache-bust token and bump it**

```bash
cd /Users/nugui/AP127_V2
grep -o '?v=p[0-9]*' index.html | sort -u
```

Expected: a single token, e.g. `?v=p116`. Take the number, add 1 (e.g. `p117`), then replace every occurrence:

```bash
cd /Users/nugui/AP127_V2
CUR=$(grep -o '?v=p[0-9]*' index.html | sort -u | head -1 | grep -o '[0-9]*')
NEXT=$((CUR + 1))
sed -i '' "s/?v=p${CUR}/?v=p${NEXT}/g" index.html
grep -c "?v=p${NEXT}" index.html
```

Expected: a count matching the number of `<script>` tags with a `?v=` token (should equal the count from the `grep -o` above, confirming every tag was bumped, none missed).

- [ ] **Step 3: Update `REVAMP.md`**

Append a new dated entry to the change log at the end of `REVAMP.md`, following the file's existing format (see the most recent entries for style — a `###` heading naming the feature + date + token, then a short paragraph). Include: what was replaced (old donut+3-table Analytics tab), what's new (period presets, comprehensive filter, 13-tile KPI strip, composition strip, 4 charts with datalabels, batch breakdown table, student/instructor day heatmaps + all-time cumulative summaries), and the file touched (`js/view-summary.js`, full rewrite).

- [ ] **Step 4: Update this project's `CLAUDE.md`**

In `/Users/nugui/AP127_V2/CLAUDE.md`, update the "⚠️ Update rule" step 1 target token to the next one after `pNEXT` (i.e. if this session shipped `p117`, the rule now says "next must be `p118`"), and update the "Last known" line at the top of the Verify section to describe this change (new token, one-sentence summary, pointing at the spec file `docs/superpowers/specs/2026-07-28-ops-analytics-revamp-design.md` for full detail) — prepended before the existing `p116` entry, following the file's existing running-log style.

- [ ] **Step 5: Update `/Users/nugui/AP127_Docs/README.md`**

Add a bullet to §2.4 (CMDV2 section) describing the Ops Analytics revamp, and a dated entry in §10 (activity log) matching the log's existing format. Then:

```bash
cd /Users/nugui/AP127_Docs
git add README.md
git commit -m "docs: CMDV2 Ops Analytics tab revamp (pNEXT)"
git push
```

(Replace `pNEXT` with the actual token from Step 2, e.g. `p117`.)

If GitHub Actions doesn't auto-deploy within a few minutes, run:

```bash
npx wrangler pages deploy /Users/nugui/AP127_Docs --project-name ap127-docs --branch main
```

- [ ] **Step 6: Final commit in AP127_V2**

```bash
cd /Users/nugui/AP127_V2
git add index.html REVAMP.md CLAUDE.md
git commit -m "pNEXT: Ops Analytics tab full revamp — batch-centric KPIs, composition, 4 charts, rosters"
```

(Replace `pNEXT` with the actual token, e.g. `p117: ...`.)

- [ ] **Step 7: Full end-to-end verification pass**

Reload the app fresh (hard refresh to bypass cache, confirming the new `?v=pNEXT` token is actually being served — check via browser dev tools Network tab that `view-summary.js` loads with the new token). Walk through: default load (Completed + AP-only + 30D + Effective) → change each filter dimension individually and confirm the KPI/composition/charts/tables/rosters all update consistently → switch metric to Block and confirm hours figures change → switch through all 4 period presets and CUSTOM → click a chart legend entry → click a roster heatmap cell → click a cumulative table row → confirm the drawer opens each time with correct flight data → confirm zero console errors throughout.

---

## Self-review

**Spec coverage** — every section of `docs/superpowers/specs/2026-07-28-ops-analytics-revamp-design.md` maps to a task: §1 header → Task 2; §2 filter panel → Task 3; §3 KPI strip → Task 4; §4 composition strip → Task 5; §5 four charts → Tasks 6-7; §6 breakdown table → Task 8; §7 student roster → Tasks 9-10; §8 instructor roster → Task 11; deploy/docs notes → Task 12. The "click batch in legend toggles it" chart-interactivity decision and the datalabels requirement are both in Task 6's `StackedBatchChart`. The "AP127 only" quick button decision (reuse `<FocusControls/>`) is in Task 2.

**Placeholder scan** — no TBD/TODO markers; every step has complete, runnable code. The one intentional non-final marker is the "body sections land in later tasks" placeholder text in Tasks 2-3, which is explicitly replaced by name in Task 4 Step 2 — not a vague instruction, a literal `Ctrl+F`-able string with a stated replacement point.

**Type consistency** — verified `hoursOf`, `batchAllowed`, `filteredFlights`, `days`, `batchesPresent`, `batchStats` are defined once (Tasks 3, 5, 6) and referenced with the same names in every later task. `RosterHeatmap`'s `valueOf(row, d)` / `colorOf(row, d)` signature is used identically for both students (Task 9) and instructors (Task 11). `CumulativeTable`'s `groups` shape (`{key, color, rows, totalLessons, totalHours}`, each row `{name, latestDate, latestLesson, latestId, lessons, hours}`) is identical between the student (Task 10) and instructor (Task 11) call sites.
