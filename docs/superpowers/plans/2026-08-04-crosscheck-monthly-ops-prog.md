# Cross-Check — Monthly OPS ⇄ PROG Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Monthly OPS ⇄ PROG" sub-view inside the existing Cross-Check
tab that reconciles Ops Analytics' and School Perf.'s monthly effective-hours
totals for AP-126/AP-127 across May/Jun/Jul 2026, with root-cause diagnostics
and a per-SP drill-down, computed live from already-loaded data.

**Architecture:** Pure client-side, no-build CDN-React (matches every other
view in this app). A new plain-JS computation module
(`js/crosscheck-monthly.js`, no JSX, exposes `window.AP127MonthlyCC`) holds
all the number-crunching as pure functions operating on `window.FLIGHTS` /
`window.NGT_CACHE`. `js/view-crosscheck.js` gains a top-level toggle between
the existing per-flight view and a new `MonthlyView` component that renders
the computed data.

**Tech Stack:** Plain JS (module) + React 18 via `React.createElement` (no
JSX — `js/view-crosscheck.js` is loaded as a plain `<script>`, not
`text/babel`, confirmed via `index.html:80`). No new dependencies.

## Global Constraints

- Diagnose only — do not modify `js/view-summary.js` or `js/view-program.js`
  calculation logic.
- Batches: AP-126, AP-127 only. Months: 2026-05, 2026-06, 2026-07 (hardcoded
  — this is a point-in-time diagnostic per the user's explicit ask, not a
  general-purpose date picker; document this scope choice in the UI itself).
- Effective-hours formula must byte-for-byte match `js/view-summary.js:38-59`
  (`sBuildCurMap`/`sEffectiveMins`) and `js/view-program.js:1440-1471`
  (`buildCurMap`/`collectEffectiveFlights`) — this is the whole point of the
  feature (showing *current site logic*, not a reinterpretation).
- No test framework exists in this repo's frontend (confirmed: no
  `package.json` test runner, no `tests/` dir under `AP127_V2/` — only the
  separate `watchdog`/`watchdog-monitor` Cloudflare Workers have vitest
  suites). Follow this project's established verification convention
  instead: manual live-browser checks via `javascript_tool`/console,
  documented inline in each task, matching every `REVAMP.md` entry's
  "Verified live" pattern.
- Cache-bust: bump `?v=pNN` on all `<script>` tags in `index.html` to the
  next token before considering this done (per `CLAUDE.md`'s update rule —
  confirm the current token via `grep -o '?v=p[0-9]*' index.html | sort -u`
  at execution time, since other work may have bumped it since this plan was
  written).

---

### Task 1: Computation module (`js/crosscheck-monthly.js`)

**Files:**
- Create: `js/crosscheck-monthly.js`
- Modify: `index.html` (add `<script src="js/crosscheck-monthly.js?v=pNN"></script>` immediately after the existing `<script src="assets/reconcile.js?v=pNN"></script>` line, since this module reuses `window.AP127Reconcile`'s name helpers and must load after it, but before `js/view-crosscheck.js`)

**Interfaces:**
- Consumes: `window.FLIGHTS` (array, populated by `js/shared.js` before any
  view renders), `window.NGT_CACHE` (object, from `ngt-data.js`),
  `window.AP127Reconcile.ccKeyFromFull`/`ccNameNorm` (from
  `assets/reconcile.js`, already loaded first in `index.html`).
- Produces: `window.AP127MonthlyCC = { BATCHES, MONTHS, buildCurMap,
  effMinsFromDur, effMinsFromActual, computeMonthly, computeDiagnostics }`
  — consumed by Task 2's React component.

- [ ] **Step 1: Write the module**

```js
/* ============================================================================
 * AP127 V2 — Cross-Check Monthly OPS ⇄ PROG reconciliation engine.
 * Pure (no-DOM) functions reconciling window.FLIGHTS (Ops Portal feed) against
 * window.NGT_CACHE (School progress feed) for AP-126/AP-127, May-Jul 2026,
 * using the SAME effective-hours formula each source tab already applies
 * (js/view-summary.js:38-59 / js/view-program.js:1440-1471) — this module
 * does not reinterpret either system, only reuses their existing conventions
 * side by side. See docs/superpowers/specs/2026-08-04-crosscheck-monthly-ops-prog-design.md.
 * Exposed as window.AP127MonthlyCC.
 * ==========================================================================*/
(function () {
  const BATCHES = [
    { label: 'AP-126', ngtKey: 'ap126' },
    { label: 'AP-127', ngtKey: 'ap127' },
  ];
  const MONTHS = ['2026-05', '2026-06', '2026-07'];
  const MONTH_LABEL = { '2026-05': 'MAY', '2026-06': 'JUN', '2026-07': 'JUL' };

  function normLesson(l) {
    return String(l || '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/\/\d+\s*$/, '');
  }
  function isSimLesson(l) { return !!(l && /\(SIM\)/i.test(l)); }

  // Identical convention to js/view-summary.js:38-48 and js/view-program.js:1440-1446 —
  // curriculum-standard planned_mins per lesson code, merged across cur124/126/127.
  function buildCurMap() {
    const G = window.NGT_CACHE;
    const map = {};
    [G?.cur124 || [], G?.cur126 || [], G?.cur127 || []].forEach(cur =>
      cur.forEach(c => { if (c.lesson && c.planned_mins != null) map[c.lesson] = c.planned_mins; })
    );
    return map;
  }
  // OPS-side effective minutes — mirrors js/view-summary.js:49-59 (sEffectiveMins),
  // fallback field is f.durMin (Ops Portal's own scraped block duration).
  function effMinsFromDur(f, curMap) {
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
  // PROG-side effective minutes — mirrors js/view-program.js:1447-1466
  // (collectEffectiveFlights), fallback field is f.actual_mins (progress feed's
  // own logged duration).
  function effMinsFromActual(f, curMap) {
    const lesson = (f.lesson || '').trim();
    if (!lesson) return f.actual_mins || 0;
    if (curMap[lesson] != null) return curMap[lesson];
    if (lesson.includes('/')) {
      const base = lesson.replace(/\/\d+$/, '');
      const part = parseInt(lesson.split('/').pop(), 10) || 1;
      return part === 1 ? (curMap[base] != null ? curMap[base] : f.actual_mins || 0) : 0;
    }
    return f.actual_mins || 0;
  }

  function opsStudentKeyBuilder() {
    const R = window.AP127Reconcile;
    const rosterBatchOf = {};   // canonical "First L." key -> 'AP-126'/'AP-127'
    const rosterNick = {};      // CALLSIGN -> canonical key
    BATCHES.forEach(({ label, ngtKey }) => {
      (window.NGT_CACHE?.[ngtKey] || []).forEach(s => {
        const k = R.ccKeyFromFull(s.name);
        rosterBatchOf[k] = label;
        if (s.nick) rosterNick[String(s.nick).toUpperCase()] = k;
      });
    });
    function key(raw) {
      const norm = R.ccNameNorm(raw);
      const reduced = R.ccKeyFromFull(norm);
      if (rosterBatchOf[reduced]) return reduced;
      if (rosterNick[norm]) return rosterNick[norm];
      return reduced;
    }
    return { key, rosterBatchOf };
  }

  /**
   * @param {'effective'|'actual'} hoursMode
   * @returns {{ops:object, prog:object}} keyed [batchLabel][month] = {hours,count,byStu:{key:{hours,count,nick}}}
   */
  function computeMonthly(hoursMode) {
    const curMap = hoursMode === 'effective' ? buildCurMap() : {};
    const R = window.AP127Reconcile;
    const { key: opsStudentKey } = opsStudentKeyBuilder();

    const ops = {};
    BATCHES.forEach(({ label }) => { ops[label] = {}; MONTHS.forEach(m => ops[label][m] = { hours: 0, count: 0, byStu: {} }); });
    (window.FLIGHTS || []).forEach(f => {
      if (f.status !== 'Completed' || !f.date) return;
      const mk = f.date.slice(0, 7);
      if (!MONTHS.includes(mk)) return;
      const b = BATCHES.find(x => x.label === f.batch);
      if (!b) return;
      const hrs = hoursMode === 'effective' ? effMinsFromDur(f, curMap) / 60 : (f.durMin || 0) / 60;
      const sk = opsStudentKey(f.student);
      const bucket = ops[b.label][mk];
      bucket.hours += hrs; bucket.count += 1;
      bucket.byStu[sk] = bucket.byStu[sk] || { hours: 0, count: 0 };
      bucket.byStu[sk].hours += hrs; bucket.byStu[sk].count += 1;
    });

    const prog = {};
    BATCHES.forEach(({ label }) => { prog[label] = {}; MONTHS.forEach(m => prog[label][m] = { hours: 0, count: 0, byStu: {} }); });
    BATCHES.forEach(({ label, ngtKey }) => {
      (window.NGT_CACHE?.[ngtKey] || []).forEach(s => {
        const sk = R.ccKeyFromFull(s.name);
        (s.flown || []).forEach(f => {
          if (!f.date) return;
          const mk = f.date.slice(0, 7);
          if (!MONTHS.includes(mk)) return;
          const hrs = hoursMode === 'effective' ? effMinsFromActual(f, curMap) / 60 : (f.actual_mins || 0) / 60;
          const bucket = prog[label][mk];
          bucket.hours += hrs; bucket.count += 1;
          bucket.byStu[sk] = bucket.byStu[sk] || { hours: 0, count: 0, nick: s.nick };
          bucket.byStu[sk].hours += hrs; bucket.byStu[sk].count += 1;
        });
      });
    });

    return { ops, prog };
  }

  /**
   * Root-cause diagnostics for the currently selected batch/month(s).
   * @returns {{multiLeg:Array, simMismatch:Array, dateDrift:Array, noMatch:Array, batchTagMismatch:Array}}
   */
  function computeDiagnostics() {
    const R = window.AP127Reconcile;
    const { key: opsStudentKey, rosterBatchOf } = opsStudentKeyBuilder();

    // Progress flown index: student|normLesson -> [dates], and student|normLesson|date -> true
    const flownExact = new Set();
    const flownByStuLesson = {};
    BATCHES.forEach(({ label, ngtKey }) => {
      (window.NGT_CACHE?.[ngtKey] || []).forEach(s => {
        const sk = R.ccKeyFromFull(s.name);
        (s.flown || []).forEach(f => {
          if (!f.date) return;
          const nl = normLesson(f.lesson);
          flownExact.add(sk + '|' + nl + '|' + f.date);
          (flownByStuLesson[sk + '|' + nl] = flownByStuLesson[sk + '|' + nl] || []).push(f.date);
        });
      });
    });

    const relevant = (window.FLIGHTS || []).filter(f =>
      f.status === 'Completed' && f.date && MONTHS.includes(f.date.slice(0, 7)) &&
      BATCHES.some(b => b.label === f.batch)
    );

    // Multi-leg: >1 Ops row sharing student+lesson+date.
    const groups = {};
    relevant.forEach(f => {
      const sk = opsStudentKey(f.student);
      const nl = normLesson(f.lesson);
      const gk = f.batch + '|' + sk + '|' + nl + '|' + f.date;
      (groups[gk] = groups[gk] || []).push(f);
    });
    const multiLeg = Object.entries(groups)
      .filter(([, rows]) => rows.length > 1)
      .map(([gk, rows]) => {
        const [batch, student, lesson, date] = gk.split('|');
        return { batch, student, lesson, date, rows: rows.map(f => ({ duration: f.duration, start: f.start, end: f.end, instructor: f.instructor, tail: f.tail })) };
      });

    // Date drift + no-match.
    const dateDrift = [], noMatch = [];
    relevant.forEach(f => {
      const sk = opsStudentKey(f.student);
      const nl = normLesson(f.lesson);
      if (flownExact.has(sk + '|' + nl + '|' + f.date)) return;
      const dates = flownByStuLesson[sk + '|' + nl] || [];
      if (dates.length) {
        dateDrift.push({ batch: f.batch, student: sk, lesson: f.lesson, opsDate: f.date, progDates: dates });
      } else {
        noMatch.push({ batch: f.batch, student: sk, lesson: f.lesson, date: f.date, duration: f.duration });
      }
    });

    // Sim-tag mismatch: per batch/month, PROG "(SIM)"-lesson count vs OPS isSim-flagged Completed count.
    const simMismatch = [];
    BATCHES.forEach(({ label, ngtKey }) => {
      MONTHS.forEach(mk => {
        let progSim = 0;
        (window.NGT_CACHE?.[ngtKey] || []).forEach(s => (s.flown || []).forEach(f => {
          if (f.date && f.date.slice(0, 7) === mk && isSimLesson(f.lesson)) progSim++;
        }));
        const opsSim = relevant.filter(f => f.batch === label && f.date.slice(0, 7) === mk && f.isSim).length;
        if (progSim !== opsSim) simMismatch.push({ batch: label, month: mk, progSim, opsSim, delta: progSim - opsSim });
      });
    });

    // Batch-tag mismatch: an Ops-completed flight (any batch tag, in-window) whose
    // student's PROG roster batch disagrees with (or is absent from) the tag.
    const batchTagMismatch = [];
    (window.FLIGHTS || []).forEach(f => {
      if (f.status !== 'Completed' || !f.date || !MONTHS.includes(f.date.slice(0, 7))) return;
      const sk = opsStudentKey(f.student);
      const rosterB = rosterBatchOf[sk];
      if (!rosterB) return;
      const taggedAP = BATCHES.some(b => b.label === f.batch);
      if (taggedAP && f.batch !== rosterB) {
        batchTagMismatch.push({ student: sk, date: f.date, opsTag: f.batch, rosterBatch: rosterB, lesson: f.lesson });
      } else if (!taggedAP) {
        batchTagMismatch.push({ student: sk, date: f.date, opsTag: f.batch || '(blank)', rosterBatch: rosterB, lesson: f.lesson });
      }
    });

    return { multiLeg, simMismatch, dateDrift, noMatch, batchTagMismatch };
  }

  window.AP127MonthlyCC = { BATCHES, MONTHS, MONTH_LABEL, buildCurMap, effMinsFromDur, effMinsFromActual, computeMonthly, computeDiagnostics };
})();
```

- [ ] **Step 2: Add the script tag to `index.html`**

Find this line (around `index.html:38-41`):
```html
<script src="assets/reconcile.js?v=p132"></script>
<script src="flight-data.js"></script>
```
Insert the new module directly after `reconcile.js`'s tag (data files can load
in either order relative to it — the module only reads `window.FLIGHTS`/
`window.NGT_CACHE` lazily inside its functions, never at load time — but it
must load after `reconcile.js` since `opsStudentKeyBuilder()` references
`window.AP127Reconcile` inside a function body, which is fine even if
`reconcile.js` loaded second, AND before `js/view-crosscheck.js`, which is
guaranteed since `view-crosscheck.js` loads near the very end of
`index.html`):
```html
<script src="assets/reconcile.js?v=p132"></script>
<script src="js/crosscheck-monthly.js?v=p132"></script>
<script src="flight-data.js"></script>
```
(Use whatever `pNN` token Task 4 settles on — write `p132` here only if that
is still the current token when you execute; otherwise match the token every
other tag in the file uses at that time.)

- [ ] **Step 3: Verify live in browser**

With the local static server running (`.claude/launch.json` config
`ap127v2`, `python3 -m http.server 7423 --directory /Users/nugui/AP127_V2`)
and the page loaded, run in the page console (via `javascript_tool`):
```js
JSON.stringify(window.AP127MonthlyCC.computeMonthly('effective').ops['AP-126']['2026-05'])
```
Expected output (matches the number recorded in the design spec):
```json
{"hours":523.166...,"count":227,"byStu":{...}}
```
(`hours` ≈ 523.17, `count` = 227.) Also run:
```js
JSON.stringify(window.AP127MonthlyCC.computeMonthly('effective').prog['AP-126']['2026-05'])
```
Expected: `hours` ≈ 482.0, `count` = 160. And:
```js
JSON.stringify(window.AP127MonthlyCC.computeDiagnostics().multiLeg.length)
```
Expected: a number ≥ 38 (May AP-126 alone contributed 38; other months/batch
add more) — confirms the multi-leg detector is finding the known cases.
If any of these don't match, re-check Step 1's formula against
`js/view-summary.js:38-59`/`js/view-program.js:1440-1471` for a transcription
error before proceeding.

- [ ] **Step 4: Commit**

```bash
git add js/crosscheck-monthly.js index.html
git commit -m "feat: add Monthly OPS⇄PROG reconciliation computation engine"
```

---

### Task 2: `MonthlyView` React component + tab-within-tab toggle

**Files:**
- Modify: `js/view-crosscheck.js` (full rewrite of the file's bottom export
  section to add the toggle + new component; the existing `CrossCheckView`
  function and its internals are otherwise untouched)

**Interfaces:**
- Consumes: `window.AP127MonthlyCC` (Task 1) — `BATCHES`, `MONTHS`,
  `MONTH_LABEL`, `computeMonthly(hoursMode)`, `computeDiagnostics()`.
- Produces: `window.CrossCheckView` (same global name as before — the shell
  (`js/shell.js`) already routes `'crosscheck': window.CrossCheckView`, no
  shell changes needed).

- [ ] **Step 1: Replace the top-level export in `js/view-crosscheck.js`**

The existing file (`js/view-crosscheck.js:1-93`) defines a single
`CrossCheckView` function and does `window.CrossCheckView = CrossCheckView;`
at the end. Change the final two lines (currently):
```js
  window.CrossCheckView = CrossCheckView;
})();
```
to instead rename the existing function to `PerFlightView` internally, add
the new `MonthlyView` component, and export a small wrapper
`CrossCheckShell` that toggles between them — keeping every line of the
existing per-flight logic (lines 6-90 of the current file) unchanged except
the function's name at its declaration (`function CrossCheckView()` →
`function PerFlightView()`) so the diff is minimal and reviewable.

Concretely, the new end-of-file block (replacing the current line 91
`window.CrossCheckView = CrossCheckView;` and closing `})();`) is:

```js
  function MonthlyView() {
    const [hoursMode, setHoursMode] = useState('effective'); // 'effective' | 'actual'
    const [batchFilter, setBatchFilter] = useState('ALL');   // 'ALL' | 'AP-126' | 'AP-127'
    const [openDiag, setOpenDiag] = useState({ multiLeg: false, sim: false, drift: false, noMatch: false, tag: false });
    const [openSP, setOpenSP] = useState({}); // `${batch}|${month}` -> bool

    const CC = window.AP127MonthlyCC;
    const { ops, prog } = useMemo(() => CC.computeMonthly(hoursMode), [hoursMode]);
    const diag = useMemo(() => CC.computeDiagnostics(), []);
    const batches = batchFilter === 'ALL' ? CC.BATCHES.map(b => b.label) : [batchFilter];

    const toggleDiag = k => setOpenDiag(s => ({ ...s, [k]: !s[k] }));
    const toggleSP = k => setOpenSP(s => ({ ...s, [k]: !s[k] }));

    const rows = [];
    batches.forEach(b => CC.MONTHS.forEach(m => {
      const o = ops[b][m], p = prog[b][m];
      const dH = o.hours - p.hours;
      const dPct = p.hours ? (dH / p.hours) * 100 : 0;
      rows.push({ batch: b, month: m, o, p, dH, dPct });
    }));

    const diagPanel = (key, title, count, body) => h('div', { className: 'panel' },
      h('div', { className: 'ph', style: { cursor: 'pointer' }, onClick: () => toggleDiag(key) },
        h('span', { className: 'pt' }, (openDiag[key] ? '▾ ' : '▸ ') + title),
        h('span', { className: 'ps' }, count + ' found')),
      openDiag[key] ? h('div', { style: { padding: '0 14px 14px' } }, body) : null);

    return h('div', { style: { display: 'grid', gap: 14 } },
      // controls
      h('div', { className: 'panel' }, h('div', { className: 'pb', style: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' } },
        h('span', { className: 'mono muted', style: { fontSize: 10 } }, 'HOURS'),
        ['effective', 'actual'].map(mval => h('span', { key: mval, className: 'chip' + (hoursMode === mval ? ' sel' : ''), onClick: () => setHoursMode(mval) }, mval === 'effective' ? 'Effective' : 'Actual')),
        h('span', { className: 'mono muted', style: { fontSize: 10, marginLeft: 10 } }, 'BATCH'),
        ['ALL', 'AP-126', 'AP-127'].map(bval => h('span', { key: bval, className: 'chip' + (batchFilter === bval ? ' sel' : ''), onClick: () => setBatchFilter(bval) }, bval)),
        h('span', { className: 'muted', style: { fontSize: 11, marginLeft: 'auto' } }, 'AP-126 / AP-127 · MAY–JUL 2026 · diagnose-only, no calculation changes'))),
      // headline table
      h('div', { className: 'panel' },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Monthly OPS ⇄ PROG'), h('span', { className: 'ps' }, rows.length + ' rows')),
        h('div', { style: { overflow: 'auto' } }, h('table', { className: 'tb' },
          h('thead', null, h('tr', null,
            h('th', null, 'Batch'), h('th', null, 'Month'),
            h('th', { className: 'n' }, 'OPS hrs'), h('th', { className: 'n' }, 'OPS flights'),
            h('th', { className: 'n' }, 'PROG hrs'), h('th', { className: 'n' }, 'PROG lessons'),
            h('th', { className: 'n' }, 'Δ hrs'), h('th', { className: 'n' }, 'Δ%'), h('th', null, ''))),
          h('tbody', null, rows.map((r, i) => {
            const spKey = r.batch + '|' + r.month;
            const flag = Math.abs(r.dPct) >= 5 ? 'bad' : Math.abs(r.dPct) >= 1 ? 'rev' : 'ok';
            return [
              h('tr', { key: i },
                h('td', null, r.batch), h('td', null, CC.MONTH_LABEL[r.month]),
                h('td', { className: 'n' }, r.o.hours.toFixed(1)), h('td', { className: 'n' }, r.o.count),
                h('td', { className: 'n' }, r.p.hours.toFixed(1)), h('td', { className: 'n' }, r.p.count),
                h('td', { className: 'n' }, (r.dH >= 0 ? '+' : '') + r.dH.toFixed(1)),
                h('td', { className: 'n' }, h('span', { className: 'pill ' + flag }, (r.dPct >= 0 ? '+' : '') + r.dPct.toFixed(1) + '%')),
                h('td', null, h('span', { className: 'chip', onClick: () => toggleSP(spKey) }, openSP[spKey] ? '▾ per-SP' : '▸ per-SP'))),
              openSP[spKey] ? h('tr', { key: i + '-sp' }, h('td', { colSpan: 9 }, renderPerSP(r))) : null,
            ];
          }))))),
      // diagnostics
      diagPanel('multiLeg', 'Multi-leg bookings (OPS double-counts one lesson)', diag.multiLeg.filter(inScope).length,
        renderMultiLeg(diag.multiLeg.filter(inScope))),
      diagPanel('sim', 'Sim-tag mismatch (PROG "(SIM)" lesson vs OPS isSim flag)', diag.simMismatch.filter(x => batches.includes(x.batch)).filter(x => x.delta !== 0).length,
        renderSimMismatch(diag.simMismatch.filter(x => batches.includes(x.batch)))),
      diagPanel('drift', 'Date drift (matched student+lesson, different date)', diag.dateDrift.filter(inScope).length,
        renderDrift(diag.dateDrift.filter(inScope))),
      diagPanel('noMatch', 'No PROG match (Ops-completed, not yet logged)', diag.noMatch.filter(inScope).length,
        renderNoMatch(diag.noMatch.filter(inScope))),
      diagPanel('tag', 'Batch-tag check (Ops tag vs PROG roster)', diag.batchTagMismatch.length,
        diag.batchTagMismatch.length === 0
          ? h('div', { className: 'empty' }, 'No mismatches — every AP-126/AP-127 student’s Ops flights are tagged with their correct roster batch ✓')
          : renderTagMismatch(diag.batchTagMismatch)),
      // why + how to fix
      h('div', { className: 'panel' }, h('div', { className: 'pb' },
        h('div', { className: 'pt', style: { marginBottom: 8 } }, 'Why they differ, and how to fix it'),
        h('ol', { style: { fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.7, paddingLeft: 18 } },
          h('li', null, h('b', null, 'Multi-leg bookings double-credit hours. '), 'When one curriculum lesson is flown across 2+ separate Ops Portal bookings on the same day, each booking independently gets the full curriculum-standard duration. Fix: tag continuation bookings with the existing "/2", "/3" split-lesson suffix convention (already supported by the effective-hours formula on both sides) instead of repeating the bare lesson code.'),
          h('li', null, h('b', null, 'Sim flights are tagged two different ways. '), 'Ops Analytics flags sim via a per-booking aircraft/tail-type field; Progress detects sim via a "(SIM)" marker baked into the curriculum lesson code. Fix: pick one source of truth (recommend the curriculum lesson code, since it is the more stable of the two) and derive the other system’s flag from it.'),
          h('li', null, h('b', null, 'Date drift is largely expected. '), 'A lesson can be flown on one date and logged into Progress a day or more later. Small (≤1-3 day) drift near month boundaries is normal lag, not a data error — the existing per-flight Cross-Check’s date-tolerance setting already accounts for this for AP127; this monthly view surfaces it for AP126 too.'),
          h('li', null, h('b', null, 'No-PROG-match entries are an actionable queue. '), 'These are real Ops-completed flights waiting on a Progress entry — worth a periodic check-in with whoever enters Progress data, not a bug to fix in code.'),
          h('li', null, h('b', null, 'Batch-tag mismatches, when present, mean the Ops Portal booking was tagged with the wrong cohort. '), 'Currently zero for AP-126/AP-127 — this check stays live so it surfaces immediately if that ever changes.')))));

    function inScope(x) { return batches.includes(x.batch); }
    function renderPerSP(r) {
      const keys = new Set([...Object.keys(r.o.byStu), ...Object.keys(r.p.byStu)]);
      const spRows = [...keys].map(k => {
        const o = r.o.byStu[k] || { hours: 0, count: 0 };
        const p = r.p.byStu[k] || { hours: 0, count: 0 };
        return { key: k, nick: p.nick || k, o, p, dH: o.hours - p.hours };
      }).sort((a, b) => Math.abs(b.dH) - Math.abs(a.dH));
      return h('div', { style: { padding: '8px 4px', maxHeight: 320, overflow: 'auto' } }, h('table', { className: 'tb' },
        h('thead', null, h('tr', null, h('th', null, 'SP'), h('th', { className: 'n' }, 'OPS hrs'), h('th', { className: 'n' }, 'OPS fl'), h('th', { className: 'n' }, 'PROG hrs'), h('th', { className: 'n' }, 'PROG les'), h('th', { className: 'n' }, 'Δ hrs'))),
        h('tbody', null, spRows.map((s, i) => h('tr', { key: i },
          h('td', null, s.nick), h('td', { className: 'n' }, s.o.hours.toFixed(1)), h('td', { className: 'n' }, s.o.count),
          h('td', { className: 'n' }, s.p.hours.toFixed(1)), h('td', { className: 'n' }, s.p.count),
          h('td', { className: 'n' }, (s.dH >= 0 ? '+' : '') + s.dH.toFixed(1)))))));
    }
    function renderMultiLeg(list) {
      if (!list.length) return h('div', { className: 'empty' }, 'None in current scope.');
      return h('div', { style: { display: 'grid', gap: 8 } }, list.map((g, i) => h('div', { key: i, className: 'mono', style: { fontSize: 11 } },
        g.batch + ' · ' + g.student + ' · ' + g.lesson + ' · ' + fd2(g.date) + ' — ' + g.rows.length + ' Ops rows: ' +
        g.rows.map(r => r.duration + ' (' + r.start + '-' + r.end + ', ' + r.instructor + ')').join('; '))));
    }
    function renderSimMismatch(list) {
      if (!list.length) return h('div', { className: 'empty' }, 'None in current scope.');
      return h('table', { className: 'tb' }, h('thead', null, h('tr', null, h('th', null, 'Batch'), h('th', null, 'Month'), h('th', { className: 'n' }, 'PROG sim'), h('th', { className: 'n' }, 'OPS sim'), h('th', { className: 'n' }, 'Δ'))),
        h('tbody', null, list.map((x, i) => h('tr', { key: i }, h('td', null, x.batch), h('td', null, CC.MONTH_LABEL[x.month]), h('td', { className: 'n' }, x.progSim), h('td', { className: 'n' }, x.opsSim), h('td', { className: 'n' }, (x.delta >= 0 ? '+' : '') + x.delta)))));
    }
    function renderDrift(list) {
      if (!list.length) return h('div', { className: 'empty' }, 'None in current scope.');
      return h('div', { style: { display: 'grid', gap: 6 } }, list.slice(0, 100).map((d, i) => h('div', { key: i, className: 'mono', style: { fontSize: 11 } },
        d.batch + ' · ' + d.student + ' · ' + d.lesson + ' — Ops ' + fd2(d.opsDate) + ' vs Prog ' + d.progDates.map(fd2).join(', '))));
    }
    function renderNoMatch(list) {
      if (!list.length) return h('div', { className: 'empty' }, 'None in current scope.');
      return h('div', { style: { display: 'grid', gap: 6 } }, list.slice(0, 100).map((n, i) => h('div', { key: i, className: 'mono', style: { fontSize: 11 } },
        n.batch + ' · ' + n.student + ' · ' + n.lesson + ' · ' + fd2(n.date) + ' · ' + n.duration)));
    }
    function renderTagMismatch(list) {
      return h('table', { className: 'tb' }, h('thead', null, h('tr', null, h('th', null, 'Student'), h('th', null, 'Date'), h('th', null, 'Ops tag'), h('th', null, 'Roster batch'), h('th', null, 'Lesson'))),
        h('tbody', null, list.map((x, i) => h('tr', { key: i }, h('td', null, x.student), h('td', null, fd2(x.date)), h('td', null, x.opsTag), h('td', null, x.rosterBatch), h('td', null, x.lesson)))));
    }
  }

  function CrossCheckShell() {
    const [mode, setMode] = useState('perflight'); // 'perflight' | 'monthly'
    return h('div', { style: { padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' } },
      h('div', { style: { display: 'flex', gap: 8 } },
        h('span', { className: 'chip' + (mode === 'perflight' ? ' sel' : ''), onClick: () => setMode('perflight') }, 'Per-Flight Reconciliation'),
        h('span', { className: 'chip' + (mode === 'monthly' ? ' sel' : ''), onClick: () => setMode('monthly') }, 'Monthly OPS ⇄ PROG')),
      mode === 'perflight' ? h(PerFlightView) : h(MonthlyView));
  }

  window.CrossCheckView = CrossCheckShell;
})();
```

Also rename the existing function's declaration line near the top of the
file (currently `function CrossCheckView() {` at `js/view-crosscheck.js:14`)
to `function PerFlightView() {`, and change its own top-level wrapper to
NOT return the padded/scrollable outer `div` anymore (that outer wrapper
moves to `CrossCheckShell` above, so both `PerFlightView` and `MonthlyView`
render as siblings under one shared padding/scroll container). Concretely,
in the existing function body, change the current return statement's outer
element:
```js
    return h('div', { style: { padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' } },
```
to:
```js
    return h('div', { style: { display: 'grid', gap: 14 } },
```
(same children, just drop the padding/overflow/height styles since
`CrossCheckShell` now owns those on its own wrapper).

No new date-format helper is needed — the existing `fd` constant
(`js/view-crosscheck.js:10`, already in module scope) does exactly what the
`MonthlyView` diagnostics renderers need. Every `fd2(...)` call in the
`MonthlyView` code block above (Step 1) refers to this same existing `fd`
function — rename all four occurrences (`renderMultiLeg`, `renderDrift`,
`renderNoMatch`, `renderTagMismatch`) from `fd2` to `fd` when transcribing
the code, so the file ends up with one date-format helper, not two.

- [ ] **Step 2: Bump the cache-bust token on this file's script tag**

In `index.html`, the line `<script src="js/view-crosscheck.js?v=p132"></script>`
must carry the same `pNN` token Task 4 settles on for this whole change set
(all touched files share one token per this project's convention — do not
give this file a different token than `crosscheck-monthly.js`).

- [ ] **Step 3: Verify live in browser**

Reload the page, open the Cross-Check tab. Confirm:
- Two chips render at the top: "Per-Flight Reconciliation" (selected by
  default) and "Monthly OPS ⇄ PROG".
- Clicking "Per-Flight Reconciliation" shows the exact same UI as before
  this change (KPIs, discrepancy table, per-student table) — use
  `read_page` to confirm the KPI row and both tables are present and
  populated, matching pre-change behavior.
- Clicking "Monthly OPS ⇄ PROG" shows the controls row, the headline table
  with 6 rows (2 batches × 3 months) when BATCH=ALL, and the 5 diagnostic
  panels (collapsed by default) plus the "why/how to fix" panel.
- Click a row's "▸ per-SP" chip — confirms it expands to a per-student
  table sorted by |Δ hrs| descending.
- Click the "Multi-leg bookings" diagnostic panel header — confirms it
  expands and lists entries (non-empty for AP-126, per the design spec's
  recorded findings).
- Switch HOURS to "Actual" — confirms the headline table's numbers change.
- Check the browser console (`read_console_messages`, `onlyErrors: true`) —
  expect zero errors.

- [ ] **Step 4: Commit**

```bash
git add js/view-crosscheck.js index.html
git commit -m "feat: add Monthly OPS⇄PROG view with root-cause diagnostics to Cross-Check tab"
```

---

### Task 3: Cross-verify computed numbers + mobile check + docs update + push

**Files:**
- Modify: `CLAUDE.md` (Verify section + change log entry)
- Modify: `REVAMP.md` (change log table row)
- Modify: `/Users/nugui/AP127_Docs/README.md` (§2.4 CMDV2 entry + §10 log)

- [ ] **Step 1: Cross-verify headline numbers against the design spec**

In the browser console, run:
```js
JSON.stringify(['AP-126','AP-127'].map(b => window.AP127MonthlyCC.MONTHS.map(m => {
  const {ops, prog} = window.AP127MonthlyCC.computeMonthly('effective');
  return {b, m, opsH: +ops[b][m].hours.toFixed(1), opsC: ops[b][m].count, progH: +prog[b][m].hours.toFixed(1), progC: prog[b][m].count};
})).flat())
```
Expected values (from the design spec's recorded findings — must match
exactly, since this is the same formula against the same live data):
- AP-126 May: ops 523.2/227, prog 482.0/160
- AP-126 Jun: ops 587.7/388, prog 635.5/371
- AP-126 Jul: ops 1073.0/453, prog 1059.5/446
- AP-127 May: ops 172.8/156, prog 172.3/152
- AP-127 Jun: ops 410.0/369, prog 431.3/379
- AP-127 Jul: ops 444.5/311, prog 440.7/307

If any value differs, do not proceed — re-check Task 1's formulas against
the live data first (the underlying `flight-data.js`/`ngt-data.js` snapshots
refresh hourly, so a small drift is expected if significant time has passed
since the design spec was written; re-derive fresh reference numbers with
the same ad hoc script used during design if so, rather than assuming a
transcription bug).

- [ ] **Step 2: Mobile viewport check**

Resize the browser to 390×844 (`resize_window`), reload, open Cross-Check →
Monthly OPS ⇄ PROG. Confirm the headline table scrolls horizontally within
its own container (no page-level horizontal overflow), and the controls row
wraps rather than overflowing. Take a screenshot for the record.

- [ ] **Step 3: Update `CLAUDE.md`**

Determine the actual next `pNN` token: run
`grep -o '?v=p[0-9]*' index.html | sort -u` — it must show exactly one token
after Tasks 1-2 (confirming every touched `<script>` tag was bumped
consistently). Prepend a new entry to the "Verify actual state" section's
"Last known" paragraph (following the exact style of the existing entries
already in the file) describing: new token, one-paragraph summary of the
Monthly OPS ⇄ PROG feature (what it computes, the 5 diagnostics, the
multi-leg root cause as the headline finding), files touched
(`js/crosscheck-monthly.js` new, `js/view-crosscheck.js`, `index.html`),
and "Verified live: ..." confirmation referencing Steps 1-2 of this task.

- [ ] **Step 4: Update `REVAMP.md`**

Add a new row to the change-log table (matching the existing table's exact
column format — check the table's header row for the current columns
before writing the new row) summarizing this feature, dated 2026-08-04,
with the `pNN` token, linking to
`docs/superpowers/specs/2026-08-04-crosscheck-monthly-ops-prog-design.md`
and this plan file.

- [ ] **Step 5: Update `/Users/nugui/AP127_Docs/README.md`**

Read the file's §2.4 (CMDV2) section first to match its existing format,
then: (a) update §2.4's summary/last-updated line for CMDV2, (b) add a
dated entry to §10 (the running log) describing the new feature and its
headline finding (multi-leg bookings double-crediting hours as the
dominant AP-126 discrepancy driver). Follow the Universal Update Rule in
`/Users/nugui/CLAUDE.md` exactly.

- [ ] **Step 6: Commit and push both repos**

```bash
cd /Users/nugui/AP127_V2
git add CLAUDE.md REVAMP.md docs/superpowers/plans/2026-08-04-crosscheck-monthly-ops-prog.md
git commit -m "pNN: Monthly OPS⇄PROG reconciliation view + docs"
git pull --rebase
git push
```
```bash
cd /Users/nugui/AP127_Docs
git add README.md
git commit -m "docs: log CMDV2 Monthly OPS⇄PROG reconciliation feature"
git push
```
(Replace `pNN` with the real token from Step 3. If GitHub Actions doesn't
auto-deploy `AP127_Docs` within a couple minutes, run the manual fallback
from `/Users/nugui/CLAUDE.md`'s Universal Update Rule step 4.)

- [ ] **Step 7: Final live confirmation**

Reload `https://ap127-ngt2.pages.dev` (the real deployed site, once CF
Pages picks up the push — Git-integrated auto-deploy per `CLAUDE.md`) and
confirm the Cross-Check tab's new "Monthly OPS ⇄ PROG" toggle is present
and functional there too, not just on the local static server.
