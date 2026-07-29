# Ops Analytics Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six follow-up changes to the already-shipped Ops Analytics tab (`js/view-summary.js`): fix chart data-labels only rendering on hover, add per-bar stack totals, include Sim flights by default with a lighter-shade visual split (charts + composition strip) and separate KPI stats, group the student roster by batch, and add a new Batch Summary section comparing all-time progress against curriculum plan.

**Architecture:** All changes land in the existing `js/view-summary.js` (currently 976 lines). No new files. Each task is a surgical, self-contained modification to specific functions/useMemos already in the file — this is now live, previously-reviewed code, so every task must leave the file in a fully working state (no partial/broken intermediate states).

**Tech Stack:** Same as the shipped feature — React 18 (no build step), Chart.js 4.4.1 + chartjs-plugin-datalabels, `window.NGT_CACHE` (a second, separate data feed from `FLIGHTS`, used only by the new Batch Summary section).

## Global Constraints

- Only `js/view-summary.js` changes until the final task (cache-bust bump in `index.html` + doc updates, same as the original feature's Task 12).
- `hoursOf(f)` (existing function, unchanged) returns 0 for any non-`'Completed'` flight regardless of Sim status — this governs both "real" and "sim" hours identically (a sim flight's hours only count once it's actually Completed).
- **`BreakdownTable` and both `RosterHeatmap`/`CumulativeTable` sections are explicitly NOT touched by the Sim/Real split** — they keep showing combined (Sim+Real) totals, per the approved spec's scoping. Only `KpiStrip`, `CompositionStrip`, and the 4 `StackedBatchChart` instances get the split.
- `sResolveColor`/`getComputedStyle(document.documentElement)`-based color resolution has a known, pre-existing, documented theme-invariance limitation (always resolves the `:root`/cockpit theme's values regardless of the actually-active theme) — this plan's new lighter-tint color helper (`sLightenOklch`) builds on top of already-resolved colors and inherits this same limitation, consistently with the rest of the file. Not a regression, not something to fix here.
- No automated test suite exists for view files in this project — verification is manual, in the browser, via `preview_start({name:"ap127v2"})` (a plain `python3 -m http.server` on port 7423) + the fetch(`cache:'no-store'`)+Babel-transpile+eval reload technique established throughout the original feature's implementation (documented in every prior task's report under `.superpowers/sdd/`).
- Spec reference: `docs/superpowers/specs/2026-07-29-ops-analytics-followup-design.md`.

---

## Current file anchors (read `js/view-summary.js` yourself before starting — these line numbers are a snapshot, confirm against the live file)

- `sBatchColor`/`sResolveColor`: lines 64-77
- `KpiStrip`/`Tile`: lines 136-164
- `CompositionStrip`: lines 169-210
- `StackedBatchChart`: lines 260-329
- `RosterHeatmap`: lines 332-418
- `SummaryBoard` state block: lines 489-506
- `filteredFlights`: lines 557-573
- `kpi`: lines 575-603
- `batchStats`/`batchesPresent`/`compositionSlices`: lines 605-640
- `days`/`dailyBuckets`/`dayLabels`/`dailyCountSeries`/`dailyHoursSeries`: lines 642-666
- `weekLabelKeys`/`monthLabelKeys`/`weeklyBuckets`/`monthlyBuckets`/`weekLabels`/`monthLabels`/`weeklySeries`/`monthlySeries`: lines 668-703
- `rosterStudents`/`studentDayMap`/`studentBatchMap`/`studentValueOf`/`studentColorOf`/`handleStudentCellClick`: lines 705-742
- `resetFilters`/`filtersActive`: lines 844-854
- Render tree (`<KpiStrip>` through the two `<CumulativeTable>` calls): lines 955-967

---

### Task 13: Chart fixes — animation, per-bar stack totals, Sim/Real split (all 4 charts)

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `sBatchColor`, `sResolveColor` (existing, Task 1 of the original plan); `filteredFlights`, `hoursOf`, `batchesPresent`, `days` (existing).
- Produces: new `sLightenOklch(cssColor, amount?)` helper (also consumed by Task 14's `CompositionStrip`). `StackedBatchChart`'s `series` prop contract CHANGES from `{ [batch]: number[] }` to `{ [batch]: { real: number[], sim: number[] } }` — every call site must be updated in this same task (there are 4, all in this task's scope).

- [ ] **Step 1: Add the `sLightenOklch` helper**

In `js/view-summary.js`, add this function right after `sResolveColor` (after the line ending `return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';\n  }`):

```js
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
```

- [ ] **Step 2: Replace `dailyBuckets` to split real/sim**

Find the `dailyBuckets` useMemo (currently around line 644):

```js
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
```

Replace it with:

```js
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
```

- [ ] **Step 3: Replace `dailyCountSeries`/`dailyHoursSeries` to the new `{real,sim}` shape**

Find (currently around line 657):

```js
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

Replace with:

```js
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
```

- [ ] **Step 4: Replace `weeklyBuckets`/`monthlyBuckets` and their series to the new shape**

Find (currently around line 671):

```js
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

Replace with:

```js
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
```

- [ ] **Step 5: Replace `StackedBatchChart`**

Replace the entire `StackedBatchChart` function (from `// ── StackedBatchChart — reusable Chart.js stacked bar, shared by all 4 chart panels ──` through its closing `}` before `// ── RosterHeatmap`) with:

```js
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
```

Note: the 4 `<StackedBatchChart .../>` JSX call sites in the render tree (around line 958-961) do **not** need to change — they already just pass `labels`/`batches`/`series`/`unit`, and `series` now naturally has the new shape from Steps 2-4.

- [ ] **Step 2 verify: browser check**

`preview_start({name:"ap127v2"})`, navigate, then via `javascript_tool`:
```js
(async () => {
  const res = await fetch('/js/view-summary.js', { cache: 'no-store' });
  const code = await res.text();
  const transpiled = window.Babel.transform(code, { presets: ['react'] }).code;
  eval(transpiled);
  window.dispatchEvent(new CustomEvent('ap127-go', { detail: 'analytics' }));
})();
```
Confirm zero console errors. Confirm all 4 charts render with data labels **visible immediately on first paint, without hovering**. Confirm each stacked bar shows a total figure above it, and spot-check one bar's total against the sum of its visible segments. Confirm each batch now has TWO legend entries (e.g. "AP-127" and "AP-127 (SIM)") and no "TOTAL" legend entry appears. Since `simOn` still defaults to `false` at this point in the plan (Task 15 flips it), sim segments will be empty/invisible for now unless you manually toggle the SIMULATOR filter on — toggle it on via FILTERS to confirm sim segments render in a visibly lighter tint of their batch's color.

- [ ] **Step 3: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "feat(analytics): chart fixes — animation timing, stack totals, Sim/Real split"
```

---

### Task 14: Composition strip — Sim/Real split

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `sLightenOklch`, `sResolveColor`, `sBatchColor` (Task 13/existing); `filteredFlights`, `hoursOf` (existing).
- Produces: `batchStats` gains two new fields (`realHours`, `simHours`) — additive only, existing `completedHours` field is UNCHANGED (still consumed as-is by `BreakdownTable`, which must keep working identically). `compositionSlices`' slice objects gain `realHours`/`simHours`/`realPct`/`simPct` fields alongside the existing `hours`/`pct`.

- [ ] **Step 1: Add `realHours`/`simHours` to `batchStats`**

Find `batchStats` (currently around line 605):

```js
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
```

Replace with:

```js
    const batchStats = useMemo(() => {
      const m = {};
      filteredFlights.forEach(f => {
        const b = f.batch || 'Unknown';
        if (!m[b]) m[b] = { batch: b, total: 0, pending: 0, completed: 0, canceled: 0, standby: 0, bookedHours: 0, completedHours: 0, realHours: 0, simHours: 0 };
        m[b].total++;
        m[b].bookedHours += (f.durMin || 0) / 60;
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
```

- [ ] **Step 2: Add `realHours`/`simHours`/`realPct`/`simPct` to `compositionSlices`**

Find `compositionSlices` (currently around line 628):

```js
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

Replace with:

```js
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
```

- [ ] **Step 3: Replace `CompositionStrip` to render the split bar + legend**

Replace the entire `CompositionStrip` function with:

```js
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
                    style={{ flex: s.simHours, background: sLightenOklch(sResolveColor(s.color)), opacity: 0.9 }}/>
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
```

- [ ] **Step 4: Verify in the browser**

Reload via the fetch+transpile+eval technique. Toggle FILTERS → SIMULATOR on, and switch the header's period/batch so some sim flights are in range. Confirm the composition bar shows a lighter-tint segment adjacent to each batch's solid segment, the legend line shows the `(X.Xh sim)` suffix when a batch has sim hours, and `BreakdownTable` (rendered further down, unaffected by this task) still shows its original combined numbers unchanged.

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "feat(analytics): composition strip Sim/Real split"
```

---

### Task 15: KPI strip — SIM HOURS tile, real-only rate tiles, Sim default ON

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `filteredFlights`, `hoursOf` (existing).
- Produces: `kpi.simHours` (new field); `kpi.completedHours`/`kpi.completionRate`/`kpi.cancellationRate`/`kpi.avgHoursPerFlight`/`kpi.ap127SharePct` now compute **real-only** (excluding Sim flights) — a behavior change from the shipped version. `kpi.total`/`kpi.pending`/`kpi.completed`/`kpi.canceled`/`kpi.standby`/`kpi.sim`/`kpi.bookedHours`/`kpi.activeBatches`/`kpi.activeStudents` are UNCHANGED (still include Sim flights in their raw counts).

- [ ] **Step 1: Replace the `kpi` useMemo**

Find `kpi` (currently around line 575):

```js
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

Replace with:

```js
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
        s.bookedHours += (f.durMin || 0) / 60;
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
```

- [ ] **Step 2: Add the SIM HOURS tile to `KpiStrip`**

Find `KpiStrip` and its `HOURS` tile line:

```js
        <Tile label="HOURS" value={kpi.completedHours.toFixed(1)} color="var(--col-done)"/>
```

Replace with (adds the `sub` label + a new tile right after it):

```js
        <Tile label="HOURS" value={kpi.completedHours.toFixed(1)} color="var(--col-done)" sub="real only"/>
        <Tile label="SIM HOURS" value={kpi.simHours.toFixed(1)} color="var(--col-sim)"/>
```

- [ ] **Step 3: Flip the `simOn` default and fix `resetFilters`/`filtersActive` to match**

Find (currently around line 505):

```js
    const [simOn, setSimOn]                 = useState(false);
```

Replace with:

```js
    const [simOn, setSimOn]                 = useState(true);
```

Find `resetFilters` (currently around line 844):

```js
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

Replace with:

```js
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
```

- [ ] **Step 4: Verify in the browser**

Reload via fetch+transpile+eval. Confirm on fresh load: SIMULATOR shows "SHOWING SIM" by default (no manual toggle needed), the KPI strip has both HOURS ("real only" sub-label) and a new SIM HOURS tile. Toggle SIMULATOR off via FILTERS and confirm HOURS/COMPLETION/CANCELLATION/AVG H/FLIGHT do **not** change (they were already real-only), while SIM/SIM HOURS drop to 0. Toggle it back on and confirm SIM HOURS becomes nonzero again if any sim flights exist in the current period/batch selection. Click "RESET TO DEFAULT" after changing SIMULATOR off, and confirm it correctly flips back to "SHOWING SIM" (on).

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "feat(analytics): KPI Sim Hours tile, real-only rate tiles, Sim default ON"
```

---

### Task 16: Student roster grouped by batch

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `studentBatchMap`, `AP_BATCH_ORDER`, `sBatchColor` (existing/Task 1).
- Produces: `RosterHeatmap` gains an optional `groupOf` prop (`row => {key, color} | null`) — when omitted (as the instructor call site continues to do), behavior is byte-identical to before. `rosterStudents`'s sort order changes from plain alphabetical to batch-grouped-then-alphabetical.

- [ ] **Step 1: Reorder `studentBatchMap` before `rosterStudents`, and change `rosterStudents`'s sort**

Find (currently around line 705-735, in this exact order — `rosterStudents` first, then `studentDayMap`, then `studentBatchMap`):

```js
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
```

Replace with (note the reordering — `studentDayMap` and `studentBatchMap` now come BEFORE `rosterStudents`, since `rosterStudents` needs `studentBatchMap` for its sort):

```js
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
```

- [ ] **Step 2: Add a `studentGroupOf` callback**

Right after `studentColorOf` (find the line `const studentColorOf = useCallback(row => sResolveColor(sBatchColor(studentBatchMap[row])), [studentBatchMap]);`), add immediately below it:

```js
    const studentGroupOf = useCallback(row => {
      const b = studentBatchMap[row];
      return { key: b || 'Unknown', color: sBatchColor(b) };
    }, [studentBatchMap]);
```

- [ ] **Step 3: Extend `RosterHeatmap` to support optional grouping**

Find the `RosterHeatmap` function signature line:

```js
  function RosterHeatmap({ title, rows, days, today, valueOf, colorOf, onCellClick }) {
```

Replace with:

```js
  function RosterHeatmap({ title, rows, days, today, valueOf, colorOf, onCellClick, groupOf }) {
```

Then, still inside `RosterHeatmap`, find this block (right after the `maxCell` useMemo, before the `if (rows.length === 0)` empty-state check):

```js
    const maxCell = useMemo(() => {
      let mx = 0.25;
      rows.forEach(r => days.forEach(d => { const v = valueOf(r, d); if (v > mx) mx = v; }));
      return mx;
    }, [rows, days, valueOf]);

    if (rows.length === 0) {
```

Replace with (adds a `renderItems` useMemo right after `maxCell`, keeping the empty-state check on `rows.length` unchanged):

```js
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
```

Now find the `<tbody>` block:

```js
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
                          title={v > 0 ? `${row} · ${d} · ${v.toFixed(1)}h` : `${row} · ${d}: —`}
                          style={{ width: CELL_W, height: CELL_H, padding: 0, background: cellBg, border: cellBorder, borderRadius: 2, cursor: v > 0 ? 'pointer' : 'default' }}/>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
```

Replace with:

```js
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
                          title={v > 0 ? `${row} · ${d} · ${v.toFixed(1)}h` : `${row} · ${d}: —`}
                          style={{ width: CELL_W, height: CELL_H, padding: 0, background: cellBg, border: cellBorder, borderRadius: 2, cursor: v > 0 ? 'pointer' : 'default' }}/>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
```

- [ ] **Step 4: Pass `groupOf` at the student roster's render call site only**

Find (in the render tree, currently around line 964):

```js
            <RosterHeatmap title="▦ STUDENT ACTIVITY — click cell for detail" rows={rosterStudents} days={days} today={today} valueOf={studentValueOf} colorOf={studentColorOf} onCellClick={handleStudentCellClick}/>
```

Replace with:

```js
            <RosterHeatmap title="▦ STUDENT ACTIVITY — click cell for detail" rows={rosterStudents} days={days} today={today} valueOf={studentValueOf} colorOf={studentColorOf} onCellClick={handleStudentCellClick} groupOf={studentGroupOf}/>
```

The instructor `<RosterHeatmap .../>` call site (further down) must NOT be changed — it should still omit `groupOf` entirely, so instructors keep rendering as a flat list.

- [ ] **Step 5: Verify in the browser**

Reload via fetch+transpile+eval. Confirm the student roster now shows batch-colored header rows (AP-124/126/127/128/129 in that order, only batches actually present, each showing a student count) with student rows grouped beneath the correct header, matching the batch order/colors already used in the "STUDENT ALL-TIME SUMMARY" table below it. Confirm clicking a student's cell still opens the drawer correctly (regression check on `onCellClick`). Confirm the **instructor** roster (further down) is completely unchanged — still a flat list, no batch headers.

- [ ] **Step 6: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "feat(analytics): student roster grouped by batch"
```

---

### Task 17: Batch Summary — data layer (curriculum/plan helpers + useMemo)

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `window.NGT_CACHE` (global, populated by `ngt-data.js`, loaded before this file — same source `sBuildCurMap` already reads from Task 1); `AP_BATCH_ORDER`, `batchAllowed`, `today` (existing).
- Produces: `sBatchRoster(batch)`, `sBatchCurriculum(batch)`, `sBatchTargetDate(batch, roster)` (module-level helpers); `batchSummaryRows` (`SummaryBoard`-local useMemo, array of per-batch objects, consumed by Task 18's `BatchSummary` component).

- [ ] **Step 1: Add the batch-roster/curriculum/target-date helpers**

Add these module-level helpers right after `sBuildCurMap`/`sEffectiveMins` (after the `sEffectiveMins` function's closing `}`, before `// ── Batch color system ──`):

```js
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
```

- [ ] **Step 2: Add the `batchSummaryRows` useMemo inside `SummaryBoard`**

Add this right after the `cumulStudentGroups` useMemo (after its closing `}, [batchAllowed, hoursOf]);` line, before `const handleCumulRowClick = ...`):

```js
    const batchSummaryRows = useMemo(() => {
      return AP_BATCH_ORDER.filter(b => batchAllowed(b)).map(batch => {
        const roster = sBatchRoster(batch);
        if (roster.length === 0) {
          return { batch, hasPlanData: false };
        }
        let lessonsDone = 0, lessonsTotal = 0, hoursDone = 0, hoursTotal = 0;
        roster.forEach(s => {
          lessonsDone += s.done || 0;
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
```

- [ ] **Step 3: Verify with a Node spot-check (pure data logic, no DOM needed)**

Run this to sanity-check the roster/curriculum math against the real live data file before it's wired into JSX:

```bash
cd /Users/nugui/AP127_V2
node -e "
const fs = require('fs');
global.window = {};
eval(fs.readFileSync('ngt-data.js','utf8'));
const G = window.NGT_CACHE;
const BATCH_ROSTER_KEY = { 'AP-124': 'ap124', 'AP-126': 'ap126', 'AP-127': 'ap127', 'AP-129': 'ap129' };
const BATCH_CUR_KEY = { 'AP-124': 'cur124', 'AP-126': 'cur126', 'AP-127': 'cur127' };
function sBatchRoster(b) { const k = BATCH_ROSTER_KEY[b]; return (k && G[k]) || []; }
function sBatchCurriculum(b) { const k = BATCH_CUR_KEY[b]; return (k && G[k]) || null; }
function sBatchTargetDate(b, roster) {
  const cur = sBatchCurriculum(b);
  if (cur && cur.length) return cur[cur.length-1].planned_date;
  let latest = null;
  roster.forEach(s => { if (s.finish && (!latest || s.finish > latest)) latest = s.finish; });
  return latest;
}
['AP-124','AP-126','AP-127','AP-128','AP-129'].forEach(batch => {
  const roster = sBatchRoster(batch);
  if (roster.length === 0) { console.log(batch, '-> NO PLAN DATA (expected for AP-128)'); return; }
  let lessonsDone=0, lessonsTotal=0, hoursDone=0, hoursTotal=0;
  roster.forEach(s => {
    lessonsDone += s.done||0; lessonsTotal += s.total||0;
    const doneMin = (s.flown||[]).reduce((a,f)=>a+(f.actual_mins||0),0);
    const remMin = (s.planned||[]).reduce((a,p)=>a+(p.mins||0),0);
    hoursDone += doneMin/60; hoursTotal += (doneMin+remMin)/60;
  });
  const target = sBatchTargetDate(batch, roster);
  console.log(batch, 'students=',roster.length,'lessons=',lessonsDone+'/'+lessonsTotal,'hours=',hoursDone.toFixed(1)+'/'+hoursTotal.toFixed(1),'target=',target);
});
"
```

Expected: 4 real rows (AP-124/126/127/129) with plausible non-zero students/lessons/hours and a target date, and `AP-128 -> NO PLAN DATA (expected for AP-128)`. If any batch besides AP-128 shows 0 students or a `null` target, stop and report — that indicates a data-shape mismatch this step's logic needs to be re-checked against.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "feat(analytics): Batch Summary data layer (roster/curriculum/target-date helpers)"
```

---

### Task 18: Batch Summary — component + render

**Files:**
- Modify: `js/view-summary.js`

**Interfaces:**
- Consumes: `batchSummaryRows` (Task 17); `HIGHLIGHT_BATCH`, `sBatchColor` (existing).
- Produces: `<BatchSummary/>` component, rendered between `<CompositionStrip/>` and the 4-chart grid.

- [ ] **Step 1: Add the `BatchSummary` component**

Add this above `function SummaryBoard()` (e.g. right after `PresetChip`/`MetricChip`, before the `// ══...SummaryBoard` banner comment):

```js
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
```

- [ ] **Step 2: Render `<BatchSummary/>` between the composition strip and the chart grid**

Find (in the render tree):

```js
            <CompositionStrip slices={compositionSlices} metricLabel={metric}/>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
```

Replace with:

```js
            <CompositionStrip slices={compositionSlices} metricLabel={metric}/>
            <BatchSummary rows={batchSummaryRows}/>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
```

- [ ] **Step 3: Verify in the browser**

Reload via fetch+transpile+eval. Confirm a "BATCH SUMMARY" table renders between the composition strip and the 4-chart grid, with 5 rows (AP-124/126/127/128/129 under the default AP-only batch filter), AP-128 showing "NO PLAN DATA" spanning its row, and the other 4 rows showing plausible students/lessons/hours/remaining/pace figures. Cross-check at least one row's numbers against the Task 17 Node spot-check output. Open FILTERS, switch BATCH to a single custom batch (e.g. just AP-127), and confirm Batch Summary narrows to just that one row (same `batchAllowed`-governed behavior as the cumulative tables). Confirm zero console errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-summary.js
git commit -m "feat(analytics): Batch Summary component + render"
```

---

### Task 19: Final integration verification, cache-bust, docs

**Files:**
- Modify: `js/view-summary.js` (fix-if-needed only, per Step 1)
- Modify: `index.html` (cache-bust bump)
- Modify: `REVAMP.md`, `CLAUDE.md` (change log)

**Interfaces:** None — wrap-up task, no new code interfaces.

- [ ] **Step 1: Full end-to-end verification pass**

Using the fetch+transpile+eval reload technique, walk through: default load (Completed + AP-only + 30D + Effective metric + Sim ON) → confirm data labels visible without hovering on all 4 charts → confirm a total figure above every stacked bar → toggle SIMULATOR off/on and confirm KPI/composition/chart sim segments respond correctly while HOURS/COMPLETION/etc. stay real-only-stable → confirm student roster shows batch-grouped headers → confirm Batch Summary renders with AP-128 showing "NO PLAN DATA" and the other 4 batches showing plausible numbers, narrowing correctly when the BATCH filter changes → click a chart legend entry, a roster cell, a cumulative-table row, and a Batch Summary row's batch name (no click behavior expected there, just confirm nothing throws) → zero console errors throughout. Fix anything broken in `js/view-summary.js` now, before moving to cache-bust (this is the last chance before the version token changes).

- [ ] **Step 2: Bump the cache-bust token**

```bash
cd /Users/nugui/AP127_V2
CUR=$(grep -o '?v=p[0-9]*' index.html | sort -u | head -1 | grep -o '[0-9]*')
NEXT=$((CUR + 1))
sed -i '' "s/?v=p${CUR}/?v=p${NEXT}/g" index.html
grep -c "?v=p${NEXT}" index.html
```

Expected: current token is `p118` (per this project's `CLAUDE.md`), bumping to `p119`; the final grep should show the same count as `grep -o '?v=p[0-9]*' index.html | sort -u` reported before the bump (confirms every tag was updated).

- [ ] **Step 3: Update `REVAMP.md`**

Append a new dated entry (following the file's existing format — see the `p118` entry immediately above it for style) summarizing: chart data-label hover-only rendering fixed (`animation:false`); per-stack total labels added to all 4 charts; Sim flights now included by default with a lighter-tint visual split in the 4 charts + composition strip, plus a dedicated KPI SIM HOURS tile (existing HOURS/COMPLETION/CANCELLATION/AVG H/FLIGHT tiles now real-only); student roster grouped by batch; new Batch Summary section (all-time lessons/hours done vs. curriculum plan, time/lessons/hours remaining, required pace — AP-128 shows "no plan data" since it has none in the feed). Reference `docs/superpowers/specs/2026-07-29-ops-analytics-followup-design.md` and `docs/superpowers/plans/2026-07-29-ops-analytics-followup.md`.

- [ ] **Step 4: Update `CLAUDE.md`**

Bump the update-rule's "next must be pNN" token to one past what Step 2 produced, and prepend a new "Last known" entry summarizing this change (same style as the existing entries), pointing at the spec/plan files above.

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add index.html REVAMP.md CLAUDE.md
git commit -m "pNEXT: Ops Analytics follow-up — chart fixes, Sim split, batch-grouped roster, Batch Summary"
```

(Replace `pNEXT` with the actual token from Step 2, e.g. `p119: ...`. If Step 1 required a code fix, that fix should already be a separate prior commit to `js/view-summary.js`, not bundled into this docs/cache-bust commit.)

- [ ] **Step 6: Push everything**

The user has explicitly asked to push all of this work once implemented (both this follow-up and the original Ops Analytics rebuild, which was left staged locally pending review). Push both repos:

```bash
cd /Users/nugui/AP127_V2
git push

cd /Users/nugui/AP127_Docs
git push
```

Report the final pushed commit SHAs for both repos. Note: pushing `AP127_V2`'s `main` triggers a live Cloudflare Pages deploy to `ap127-ngt2.pages.dev` (Git-integrated, no manual deploy step) — this is expected and intended per the user's explicit request, not a side effect to flag as a concern.

---

## Self-review

**Spec coverage** — every item in `docs/superpowers/specs/2026-07-29-ops-analytics-followup-design.md`'s "Changes" section maps to a task: item 1 (hover fix) → Task 13 Step 5 (`animation:false`); item 2 (stack totals) → Task 13 Step 5 (TOTAL dataset); item 3 (Sim split) → Tasks 13-15 (charts, composition, KPI); item 4 (roster grouping) → Task 16; item 5 (hours "blank dates") → explicitly no task, confirmed as correct existing behavior in the spec itself; item 6 (Batch Summary) → Tasks 17-18. Final wrap-up (cache-bust/docs/push) → Task 19.

**Placeholder scan** — no TBD/TODO; every step has complete code or an exact verification checklist.

**Type consistency** — `StackedBatchChart`'s `series` shape (`{batch: {real, sim}}`) is defined once in Task 13 and consumed identically by all 4 render call sites (unchanged JSX, only the underlying `useMemo`s that produce `series` changed shape — verified the call sites don't need edits). `RosterHeatmap`'s new `groupOf` prop is optional and backward-compatible — the instructor call site is explicitly called out as unchanged in Task 16 Step 4. `batchSummaryRows`' row shape (`{batch, hasPlanData, students?, lessonsDone?, ...}`) is defined once in Task 17 and consumed by exactly one component (`BatchSummary`, Task 18) with matching field names throughout.
