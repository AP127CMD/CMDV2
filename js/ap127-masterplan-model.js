/* ============================================================================
 * AP127 MASTER PLAN — per-SP, lesson-by-lesson, resource-constrained planner
 *
 * Answers: "given how the school is ACTUALLY flying AP-127 right now, when does
 * each SP fly each remaining lesson, finish lesson 96, finish the 5 Advanced
 * UPRT sorties (C172) and pass the 3 final skill checks — and what moves that?"
 *
 * Not a re-run of Simulation 1/2/3 (school-level, multi-batch, Math.random) nor
 * V6's forecast cone (batch-total velocity). This one schedules every remaining
 * sortie of every SP onto a calendar, one day at a time, against:
 *   1. the AP-127 daily BUDGET — block hours/day the school gives AP-127 as a
 *      whole. Measured: 43.7 h/day over 30 days vs 43.8 h/day in the last week,
 *      while the mix swung from SIM to aircraft — the school allocates the batch
 *      a stable share of its day, so this is the primary constraint.
 *   2. POOL caps per resource type (DA40 CS, DA40 TDI, DA40 SIM, DA42 SIM, DA42,
 *      C172 for AUPRT, examiners for checks) — peak AP-127 usage, or AP-126's
 *      measured throughput where AP-127 has no history yet (DA42, checks).
 *   3. the SP — max sorties/day, max sorties/rolling week, own SE aircraft type.
 *   4. the FI — each assigned FI flies a capped number of AP-127 sorties/day.
 *
 * Rules (same as ap127-v5-model / ap127-v6-forecast):
 *   - pure: no DOM, no globals mutated; runs under Node (module.exports)
 *   - deterministic: seeded mulberry32 only — never Math.random — so the page,
 *     a screenshot and a re-run always show the same dates
 *   - every default is MEASURED from the live feed at load time (measure()) and
 *     carries its source label; the UI lets the user override any of them
 *   - hours = block time (durMin), never airborne
 *
 * Namespace: AP127MasterPlan.
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AP127MasterPlan = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  // ── dates (UTC-keyed YYYY-MM-DD, same convention as AP127V5Model) ─────────
  const DAY = 86400000;
  const ymd = d => d.toISOString().slice(0, 10);
  const pd = s => new Date(s + 'T00:00:00Z');
  const addDays = (s, n) => { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const diff = (a, b) => Math.round((pd(a) - pd(b)) / DAY);
  const dow = s => pd(s).getUTCDay();
  function todayBKK() { const n = new Date(); return ymd(new Date(n.getTime() + (n.getTimezoneOffset() + 420) * 60000)); }

  // Seeded PRNG — same generator V6 uses.
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ── course structure ───────────────────────────────────────────────────────
  // 96 curriculum lessons (cur127) + 5 Advanced UPRT (C172) + 3 final skill
  // checks. The checks are the ones AP-126 flew after lesson 96 (measured):
  //   SCPLME  CPL ME skill check     DA42   100 min
  //   SCRSE   CPL/IR SE skill check  DA40    60 min
  //   SIRME   IR ME skill check      DA42   120 min  (16/28 AP-126 SPs needed a 2nd sortie)
  const CHECKS = [
    { code: 'SCPLME', label: 'CPL ME check', pool: 'DA42', mins: 100 },
    { code: 'SCRSE',  label: 'CPL/IR SE check', pool: 'SE', mins: 60 },
    { code: 'SIRME',  label: 'IR ME check', pool: 'DA42', mins: 120 },
  ];
  const AUPRT_N = 5, AUPRT_MINS = 60;
  const POOLS = ['DA40CS', 'DA40TDI', 'SIM40', 'SIM42', 'DA42', 'C172', 'EXAM'];
  const POOL_LABEL = { DA40CS: 'DA40 CS', DA40TDI: 'DA40 TDI', SIM40: 'DA40 SIM', SIM42: 'DA42 SIM', DA42: 'DA42', C172: 'C172 (UPRT)', EXAM: 'Examiners' };
  // Thai public holidays not yet in shared.js's AP127_HOLIDAYS (which ends 31 Dec 2026).
  // Editable on the page; kept here, not in shared.js (DB_Share mirrors shared.js).
  const EXTRA_HOLIDAYS = ['2027-01-01'];

  const lessonNum = c => { const m = String(c || '').match(/(\d+)\s*$/); return m ? +m[1] : null; };
  const keyFromFull = name => { const p = String(name || '').trim().split(/\s+/); if (!p[0]) return ''; return p.length < 2 ? p[0].toUpperCase() : (p[0] + ' ' + p[1][0]).toUpperCase() + '.'; };
  const normName = n => String(n || '').replace(/\s*\(unplanned\)\s*/i, '').trim().toUpperCase();
  const isAP127 = b => String(b || '').replace(/[^a-z0-9]/gi, '').toUpperCase().includes('AP127');
  const isAP126 = b => String(b || '').replace(/[^a-z0-9]/gi, '').toUpperCase() === 'AP126';
  const isAuprt = l => /AUPRT/i.test(l || '');
  const checkOf = l => { const s = String(l || '').trim().toUpperCase(); return CHECKS.find(c => s === c.code || s.startsWith(c.code + ' ')) || null; };
  const seType = se => /TDI/i.test(se || '') ? 'DA40TDI' : 'DA40CS';

  // Pool of a flight in the ops feed — by isSim + aircraft type (not tail regex).
  function poolOfFlight(f) {
    const t = String(f.type || ''), tl = String(f.tail || '');
    const sim = f.isSim || /sim/i.test(t) || /\(sim\)/i.test(tl);
    if (sim) return /DA42/i.test(t) ? 'SIM42' : /R44/i.test(t) ? null : 'SIM40';
    if (/C172/i.test(t)) return 'C172';
    if (/DA42/i.test(t)) return 'DA42';
    if (/DA40\s*CS/i.test(t)) return 'DA40CS';
    if (/DA40\s*TDI/i.test(t)) return 'DA40TDI';
    if (/^HS-TV/i.test(tl)) return 'DA40CS';
    return null;
  }
  // Pool a curriculum lesson needs, for an SP with SE type `se`.
  function poolOfLesson(num, se) {
    if (num >= 56 && num <= 67) return 'SIM40';
    if (num === 91 || num === 92) return 'SIM42';
    if (num >= 93 && num <= 96) return 'DA42';
    return se;
  }
  const isFlightRow = f => f && f.date && f.student && !/,/.test(f.student) && !f.isNonFlight && !f.isStandby
    && !/ground|meeting|brief|classroom|school/i.test(f.lesson || '') && (f.durMin || 0) > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // STATE — where every SP is at the END of `through` (flights dated ≤ through are history).
  // Progress feed (curriculum lessons) ∪ ops feed (same-day completions, AUPRT,
  // checks — which Progress does not carry).
  // ─────────────────────────────────────────────────────────────────────────
  function buildState(ctx, through) {
    const asOf = addDays(through, 1);
    const cur = (ctx.curriculum || []).map(c => ({ code: c.lesson, num: lessonNum(c.lesson), planned: c.planned_mins || 0 })).filter(c => c.num != null);
    const flights = (ctx.flights || []).filter(f => isAP127(f.batch) && f.date && f.date < asOf);
    const byKey = {};
    flights.forEach(f => { (byKey[normName(f.student)] = byKey[normName(f.student)] || []).push(f); });
    const sps = (ctx.students || []).map(s => {
      const key = keyFromFull(s.name);
      const ops = (byKey[key] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const done = new Map();                                     // lesson num -> date
      (s.flown || []).forEach(f => { const n = lessonNum(f.lesson); if (n != null && f.date && f.date < asOf && !done.has(n)) done.set(n, f.date); });
      ops.filter(f => f.status === 'Completed' && !isAuprt(f.lesson) && !checkOf(f.lesson)).forEach(f => { const n = lessonNum(f.lesson); if (n != null && n <= 96 && !done.has(n)) done.set(n, f.date); });
      const auprt = new Set(); ops.filter(f => f.status === 'Completed' && isAuprt(f.lesson)).forEach(f => { const n = lessonNum(f.lesson); if (n) auprt.add(n); });
      const checks = new Set(); ops.filter(f => f.status === 'Completed' && checkOf(f.lesson)).forEach(f => checks.add(checkOf(f.lesson).code));
      const se = seType(s.se);
      const remaining = cur.filter(c => !done.has(c.num)).map(c => ({ kind: 'lesson', code: c.code, num: c.num, pool: poolOfLesson(c.num, se), planned: c.planned }));
      const lastDate = [...done.values(), ...ops.filter(f => f.status === 'Completed').map(f => f.date)].sort().pop() || '';
      const date96 = done.get(96) || null;
      return {
        id: String(s.catc_id), name: s.name, key, nick: s.nick || '', fi: s.fi || '', se,
        doneCount: done.size, doneNums: done, date96,
        auprtDone: auprt.size, auprtStarted: auprt.size > 0, checksDone: [...checks],
        remaining, lastDate,
        schoolFinish: s.finish || null,
      };
    });
    return { asOf: through, sps, curriculum: cur };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MEASURE — every default, from the live feed. Returns values + their source.
  //   7-day window  → capacity LEVEL (budget, pools)      — "the recent week"
  //   30-day window → realism SHAPE (DOW profile, cancel rate, caps, variance)
  //   AP-126        → pools AP-127 hasn't used yet (DA42 phase, checks)
  // ─────────────────────────────────────────────────────────────────────────
  function measure(ctx, asOf, o) {
    const opt = o || {};
    const W7 = opt.baseDays || 7, W30 = 30;
    const hol = new Set([...(ctx.holidays || []), ...EXTRA_HOLIDAYS]);
    const all = (ctx.flights || []).filter(f => f.date && f.date < asOf);
    const ap = all.filter(f => isAP127(f.batch) && isFlightRow(f));
    const comp = ap.filter(f => f.status === 'Completed');
    const from7 = addDays(asOf, -W7), from30 = addDays(asOf, -W30);
    const in7 = comp.filter(f => f.date >= from7), in30 = comp.filter(f => f.date >= from30);
    const days30 = []; for (let d = from30; d < asOf; d = addDays(d, 1)) days30.push(d);
    const hoursOn = {}; in30.forEach(f => { hoursOn[f.date] = (hoursOn[f.date] || 0) + f.durMin / 60; });
    // a "dead" day = holiday or a day AP-127 flew nothing (e.g. the 24–25 Oct stand-down)
    const live30 = days30.filter(d => !hol.has(d) && (hoursOn[d] || 0) > 0);

    // DOW shape from 30 days of live days: mean hours per weekday-of-week, normalised to mean 1.
    const dsum = [0, 0, 0, 0, 0, 0, 0], dn = [0, 0, 0, 0, 0, 0, 0];
    live30.forEach(d => { dsum[dow(d)] += hoursOn[d]; dn[dow(d)]++; });
    const dmean = dsum.map((s, i) => dn[i] ? s / dn[i] : 0);
    const avgD = dmean.reduce((a, b) => a + b, 0) / 7 || 1;
    const dowShape = dmean.map(v => v / avgD);

    // Budget: last-7-day block hours, scaled to a full week for any holiday/dead day inside it.
    let h7 = 0, shape7 = 0;
    for (let d = from7; d < asOf; d = addDays(d, 1)) {
      const hd = comp.filter(f => f.date === d).reduce((a, f) => a + f.durMin / 60, 0);
      h7 += hd; if (!hol.has(d) && hd > 0) shape7 += dowShape[dow(d)];
    }
    const budgetPerDay = shape7 ? h7 / shape7 : 0;               // h/day on a shape-1.0 day
    const h30 = in30.reduce((a, f) => a + f.durMin / 60, 0);

    // Daily variance: each live day's hours ÷ (budget-shape expectation) — bootstrapped in MC.
    const mean30 = live30.length ? live30.reduce((a, d) => a + hoursOn[d] / (dowShape[dow(d)] || 1), 0) / live30.length : 1;
    const dayFactors = live30.map(d => +(hoursOn[d] / (dowShape[dow(d)] || 1) / mean30).toFixed(3));

    // Pools. AP-127 peak daily hours in 30 days (and mean of last 7 days) per pool.
    const byPoolDay = {};
    in30.forEach(f => { const p = poolOfFlight(f); if (!p) return; const k = p + '|' + f.date; byPoolDay[k] = (byPoolDay[k] || 0) + f.durMin / 60; });
    const peak = p => Math.max(0, ...Object.entries(byPoolDay).filter(([k]) => k.startsWith(p + '|')).map(([, v]) => v));
    const sum7 = p => in7.filter(f => poolOfFlight(f) === p).reduce((a, f) => a + f.durMin / 60, 0);
    const pools = {};
    ['DA40CS', 'DA40TDI', 'SIM40'].forEach(p => {
      pools[p] = { capH: +peak(p).toFixed(1), last7: +(sum7(p) / W7).toFixed(1), source: 'AP-127 busiest day, last 30 days', unit: 'h/day' };
    });

    // DA42 + DA42 SIM: AP-126's ME phase (lessons 91–96), mean of its days with ≥3 sorties.
    const a126 = all.filter(f => isAP126(f.batch) && f.status === 'Completed' && isFlightRow(f));
    const me = a126.filter(f => { const n = lessonNum(f.lesson); return n >= 91 && n <= 96 && !isAuprt(f.lesson) && !checkOf(f.lesson); });
    const meDay = {}; me.forEach(f => { const p = poolOfFlight(f); if (p !== 'DA42' && p !== 'SIM42') return; const k = f.date; meDay[k] = meDay[k] || { DA42: 0, SIM42: 0, n42: 0, ns: 0 }; meDay[k][p] += f.durMin / 60; if (p === 'DA42') meDay[k].n42++; else meDay[k].ns++; });
    const busy42 = Object.values(meDay).filter(v => v.n42 >= 3), busyS = Object.values(meDay).filter(v => v.ns >= 2);
    const mean = (a, k) => a.length ? a.reduce((s, v) => s + v[k], 0) / a.length : 0;
    pools.DA42 = { capH: +(mean(busy42, 'DA42') || 16).toFixed(1), last7: +(sum7('DA42') / W7).toFixed(1), source: busy42.length ? `AP-126 ME phase, mean of ${busy42.length} busy days` : 'default (no AP-126 history)', unit: 'h/day' };
    pools.SIM42 = { capH: +(mean(busyS, 'SIM42') || 5).toFixed(1), last7: +(sum7('SIM42') / W7).toFixed(1), source: busyS.length ? `AP-126 ME sim, mean of ${busyS.length} busy days` : 'default', unit: 'h/day' };

    // C172 / AUPRT: last 7 days, sorties per operating day + operating days per week.
    const up7 = in7.filter(f => isAuprt(f.lesson)), up30 = in30.filter(f => isAuprt(f.lesson));
    const upDays7 = new Set(up7.map(f => f.date));
    const upDow = [0, 0, 0, 0, 0, 0, 0]; new Set(up30.map(f => f.date)).forEach(d => upDow[dow(d)]++);
    const upPerDay = upDays7.size ? up7.length / upDays7.size : (up30.length ? up30.length / new Set(up30.map(f => f.date)).size : 3);
    const upFI = new Set(up30.map(f => f.instructor).filter(Boolean));
    const upTails = new Set(up30.map(f => String(f.tail || '').replace(/\s.*/, '')).filter(Boolean));
    pools.C172 = { capH: +upPerDay.toFixed(1), last7: +(up7.length / W7).toFixed(1), source: upDays7.size ? `AP-127 last ${W7} days: ${up7.length} sorties on ${upDays7.size} days` : 'AP-127 last 30 days', unit: 'sorties/op-day',
      opDays: upDow.map(n => n > 0), aircraft: Math.max(1, upTails.size), fis: [...upFI], tails: [...upTails] };
    // AP-126 reference for UPRT
    const up126 = a126.filter(f => isAuprt(f.lesson)); const up126d = new Set(up126.map(f => f.date));
    pools.C172.ref126 = up126d.size ? +(up126.length / up126d.size).toFixed(1) : null;

    // Examiners: AP-126 checks per active day; gap from own lesson 96 to first check.
    const ck = a126.filter(f => checkOf(f.lesson)); const ckDays = new Set(ck.map(f => f.date));
    const examiners = new Set(ck.map(f => f.instructor).filter(Boolean));
    pools.EXAM = { capH: ckDays.size ? +(ck.length / ckDays.size).toFixed(1) : 5, last7: 0, source: ckDays.size ? `AP-126: ${ck.length} check sorties on ${ckDays.size} days, ${examiners.size} examiners` : 'default', unit: 'checks/day', examiners: [...examiners] };
    const by126 = {}; a126.forEach(f => { (by126[normName(f.student)] = by126[normName(f.student)] || []).push(f); });
    const gaps = [], sirme = [];
    Object.values(by126).forEach(a => {
      const d96 = a.filter(f => lessonNum(f.lesson) === 96 && !checkOf(f.lesson)).map(f => f.date).sort()[0];
      const c = a.filter(f => checkOf(f.lesson)).map(f => f.date).sort();
      if (d96 && c.length) gaps.push(diff(c[0], d96));
      const s = a.filter(f => (checkOf(f.lesson) || {}).code === 'SIRME').length; if (s) sirme.push(s);
    });
    gaps.sort((a, b) => a - b);
    const sirmeRefly = sirme.length ? sirme.filter(n => n > 1).length / sirme.length : 0.5;

    // Durations: median actual block per lesson number (all batches, this curriculum family), else planned.
    const durs = {};
    all.filter(f => f.status === 'Completed' && isFlightRow(f) && !isAuprt(f.lesson) && !checkOf(f.lesson) && /^AP-12[4-9]/.test(f.batch || '')).forEach(f => {
      const n = lessonNum(f.lesson); if (n == null || n > 96 || /\/\d+\s*$/.test(f.lesson)) return; (durs[n] = durs[n] || []).push(f.durMin);
    });
    const medDur = {}; Object.entries(durs).forEach(([n, a]) => { if (a.length >= 5) { a.sort((x, y) => x - y); medDur[n] = a[Math.floor(a.length / 2)]; } });

    // Cancel rate (30d, AP-127) and per-SP / per-FI caps.
    const can30 = ap.filter(f => f.date >= from30 && f.status === 'Canceled').length;
    const spDay = {}, fiDay = {}, spWeek = {};
    in30.forEach(f => {
      const k = normName(f.student) + '|' + f.date; spDay[k] = (spDay[k] || 0) + 1;
      if (f.instructor) { const kf = normName(f.instructor) + '|' + f.date; fiDay[kf] = (fiDay[kf] || 0) + 1; }
    });
    // max sorties per SP in any rolling 7 days (last 30 days), p90 across SPs
    const spDates = {}; in30.forEach(f => { (spDates[normName(f.student)] = spDates[normName(f.student)] || []).push(f.date); });
    Object.entries(spDates).forEach(([k, ds]) => { ds.sort(); let best = 0; ds.forEach((d, i) => { let n = 0; for (let j = i; j < ds.length && diff(ds[j], d) < 7; j++) n++; best = Math.max(best, n); }); spWeek[k] = best; });
    const pct = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0; };
    const fiVals = Object.values(fiDay);

    // Per-SP recent pace (sorties, last 14 days) — used by the 'as-is' priority policy.
    const from14 = addDays(asOf, -14);
    const pace14 = {}; comp.filter(f => f.date >= from14).forEach(f => { const k = normName(f.student); pace14[k] = (pace14[k] || 0) + 1; });

    // AUPRT eligibility as practised: lowest curriculum lesson count at which an AP-127 SP started UPRT.
    let auprtFrom = null;
    const st = buildState(ctx, addDays(asOf, -1));
    st.sps.forEach(s => {
      const first = comp.filter(f => normName(f.student) === s.key && isAuprt(f.lesson)).map(f => f.date).sort()[0];
      if (!first) return; const at = [...s.doneNums.values()].filter(d => d < first).length;
      auprtFrom = auprtFrom == null ? at : Math.min(auprtFrom, at);
    });

    return {
      asOf, windows: { base: [from7, addDays(asOf, -1)], shape: [from30, addDays(asOf, -1)] },
      holidays: [...hol].sort(),
      budget: { perDay: +budgetPerDay.toFixed(1), last7Total: +h7.toFixed(1), last30PerDay: +(h30 / W30).toFixed(1), dowShape: dowShape.map(v => +v.toFixed(3)), dayFactors },
      pools, durations: medDur,
      cancelRate30: (in30.length + can30) ? can30 / (in30.length + can30) : 0,
      spMaxPerDay: Math.max(1, pct(Object.values(spDay), 0.98)),
      spMaxPerWeek: Math.max(3, pct(Object.values(spWeek), 0.9)),
      fiMaxPerDay: Math.max(1, pct(fiVals, 0.95)),
      pace14,
      auprtFrom: auprtFrom == null ? 80 : auprtFrom,
      checkGap: { min: gaps[0] != null ? gaps[0] : 14, median: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 21, n: gaps.length },
      sirmeRefly: +sirmeRefly.toFixed(2),
      counts: { comp7: in7.length, comp30: in30.length, can30 },
    };
  }

  // Default simulation parameters from a measurement. Every one is a UI control.
  function defaults(m) {
    return {
      budgetPerDay: m.budget.perDay,            // AP-127 block hours on an average (shape 1.0) day
      budgetScale: 1,                           // ×  (what-if: more/less share of the school)
      dowShape: m.budget.dowShape.slice(),
      poolCap: Object.fromEntries(POOLS.map(p => [p, m.pools[p].capH])),
      poolScale: Object.fromEntries(POOLS.map(p => [p, 1])),
      c172OpDays: m.pools.C172.opDays.some(Boolean) ? m.pools.C172.opDays.slice() : [false, true, true, true, true, true, false],
      spMaxPerDay: 1,                           // curriculum/check sorties per SP per day (SIM 91+92 may pair)
      spMaxPerWeek: m.spMaxPerWeek,
      fiMaxPerDay: m.fiMaxPerDay,
      auprtFrom: m.auprtFrom,                   // curriculum lessons done before UPRT may start
      auprtPolicy: 'spare',                     // 'spare' = fit into C172 slots as practised | 'after96'
      checkMode: 'individual',                  // 'individual' = own lesson 96 + gap | 'batch' = window opens when batch % done
      checkGap: m.checkGap.min,
      checkBatchPct: 90,
      sirmeRefly: m.sirmeRefly,
      priority: 'pace',                         // 'pace' (as-is) | 'behind' (catch the tail up) | 'leaders'
      extraHolidays: [],
      runs: 60, seed: 127,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SIMULATE — one run, day by day from `start` until everything is done.
  //   stochastic=false → the PLAN: capacity at its measured level every day
  //   stochastic=true  → a Monte-Carlo run: daily capacity bootstrapped from the
  //                      last 30 days' real day-to-day variation, SP no-shows
  // ─────────────────────────────────────────────────────────────────────────
  function simulate(state, m, P, o) {
    const opt = o || {};
    const rnd = mulberry32((opt.seed || P.seed || 127) >>> 0);
    const stoch = !!opt.stochastic;
    const start = opt.start || state.asOf, stopAt = opt.until || addDays(start, 400);
    const hol = new Set([...(m.holidays || []), ...(P.extraHolidays || [])]);
    const dur = n => (m.durations[n] || null);
    const booked = opt.booked || {};                              // key -> date -> [{kind,num}]
    const sps = state.sps.map(s => {
      const q = s.remaining.map(r => ({ ...r, mins: dur(r.num) || r.planned || 90 }));
      const checks = CHECKS.filter(c => !s.checksDone.includes(c.code)).map(c => ({ kind: 'check', code: c.code, pool: c.pool === 'SE' ? s.se : c.pool, mins: c.mins,
        refly: c.code === 'SIRME' && rnd() < P.sirmeRefly }));
      return { s, q, qi: 0, done: s.doneCount, date96: s.date96, auprt: s.auprtDone, checks, ci: 0, lastCheck: null,
        hist: [], log: [], pace: m.pace14[s.key] || 0 };
    });
    const out = { days: [], perSP: {} };
    const meanPace = sps.reduce((t, x) => t + x.pace, 0) / (sps.length || 1);
    const factors = m.budget.dayFactors && m.budget.dayFactors.length ? m.budget.dayFactors : [1];
    const allDone = () => sps.every(x => x.qi >= x.q.length && x.auprt >= AUPRT_N && x.ci >= x.checks.length);
    // batch check window (checkMode 'batch')
    let checkOpen = null;

    for (let d = start; d <= stopAt && !allDone(); d = addDays(d, 1)) {
      const wd = dow(d);
      const isHol = hol.has(d);
      const f = stoch ? factors[Math.floor(rnd() * factors.length)] : 1;
      const budget = isHol ? 0 : P.budgetPerDay * P.budgetScale * (P.dowShape[wd] || 0) * f;
      const cap = {}; POOLS.forEach(p => { cap[p] = isHol ? 0 : P.poolCap[p] * P.poolScale[p] * (p === 'EXAM' || p === 'C172' ? 1 : Math.min(1.25, f)); });
      if (!P.c172OpDays[wd]) cap.C172 = 0;
      if (wd === 0 || wd === 6) cap.EXAM = 0;                    // AP-126's checks were all weekdays bar 2 sorties
      const used = Object.fromEntries(POOLS.map(p => [p, 0])); let usedB = 0;
      const fiLoad = {}, spToday = {};
      const day = { date: d, hol: isHol, budget, cap, used, usedB: 0, n: 0 };

      if (P.checkMode === 'batch' && !checkOpen) {
        const n96 = sps.filter(x => x.date96).length;
        if (n96 / sps.length * 100 >= P.checkBatchPct) { const last = sps.map(x => x.date96).filter(Boolean).sort().pop(); checkOpen = addDays(last, P.checkGap); }
      }

      // candidate builder ------------------------------------------------------
      const fits = (pool, mins, x) => {
        const h = mins / 60;
        if (pool === 'C172') { if (used.C172 + 1 > cap.C172 + 0.5) return false; }
        else if (pool === 'EXAM') return false;
        else if (used[pool] + h / 2 > cap[pool]) return false;
        if (usedB + h / 2 > budget) return false;
        const fi = x.s.fi; if (fi && pool !== 'C172' && (fiLoad[fi] || 0) >= P.fiMaxPerDay) return false;
        return true;
      };
      const take = (x, item, pool, mins, extra) => {
        const h = mins / 60;
        if (pool === 'C172') used.C172 += 1; else used[pool] += h;
        if (extra === 'check') used.EXAM += 1;
        usedB += h; if (x.s.fi && pool !== 'C172' && extra !== 'check') fiLoad[x.s.fi] = (fiLoad[x.s.fi] || 0) + 1;
        spToday[x.s.id] = (spToday[x.s.id] || 0) + 1; x.hist.push(d);
        x.log.push({ date: d, kind: item.kind, code: item.code, num: item.num || null, pool, mins });
        day.n++;
      };
      const weekCount = x => { let n = 0; for (let i = x.hist.length - 1; i >= 0 && diff(d, x.hist[i]) < 7; i--) n++; return n; };
      const avail = x => !stoch || rnd() > 0.06;                 // ~6% SP no-show (sick/leave/admin) in MC runs only

      // priority order of SPs for the main (curriculum/check) queue
      // Rotation: the SP who has waited longest flies first — how a scheduler
      // actually spreads a fleet over a batch. 'pace' weights the wait by each
      // SP's own share of the last 14 days (so the SPs flying more now keep doing
      // so); 'behind' / 'leaders' add a bias toward the tail / the front.
      const progs = sps.map(x => x.done + x.ci), minP = Math.min(...progs), maxP = Math.max(...progs);
      const order = sps.filter(x => avail(x)).map(x => {
        const lastD = x.hist.length ? x.hist[x.hist.length - 1] : (x.s.lastDate || addDays(d, -3));
        const wait = Math.max(0, diff(d, lastD));
        const prog = x.done + x.ci;
        const w = P.priority === 'pace' ? Math.max(0.4, Math.min(1.6, meanPace ? x.pace / meanPace : 1)) : 1;
        let score = wait * w;
        if (P.priority === 'behind') score += (maxP - prog) * 0.35;
        if (P.priority === 'leaders') score += (prog - minP) * 0.35;
        return { x, score: score + (stoch ? rnd() * 0.9 : 0) + prog * 1e-4 };
      }).sort((a, b) => b.score - a.score).map(o2 => o2.x);

      // 0) forced: bookings already in the ops feed for this date
      sps.forEach(x => {
        const bk = (booked[x.s.key] || {})[d]; if (!bk) return;
        bk.forEach(b => {
          if (b.kind === 'lesson' && x.qi < x.q.length && x.q[x.qi].num === b.num) { const it = x.q[x.qi]; take(x, it, it.pool, it.mins); x.qi++; x.done++; if (it.num === 96) x.date96 = d; }
          else if (b.kind === 'auprt' && x.auprt < AUPRT_N) { take(x, { kind: 'auprt', code: 'AUPRT 0' + (x.auprt + 1) }, 'C172', AUPRT_MINS); x.auprt++; }
        });
      });

      // 1) AUPRT on the C172 — its own aircraft + FI, so it is filled first (as last week:
      //    16 UPRT sorties flew while the rest of the budget was full), one per SP per day
      const upCand = sps.filter(x => x.auprt < AUPRT_N && (P.auprtPolicy === 'after96' ? !!x.date96 : (x.done >= P.auprtFrom || x.auprt > 0)) && (spToday[x.s.id] || 0) < 2)
        .sort((a, b) => (b.auprt > 0) - (a.auprt > 0) || b.auprt - a.auprt || b.done - a.done);
      upCand.forEach(x => {
        if (stoch && rnd() < 0.06) return;
        if (!fits('C172', AUPRT_MINS, x)) return;
        take(x, { kind: 'auprt', code: 'AUPRT 0' + (x.auprt + 1) }, 'C172', AUPRT_MINS); x.auprt++;
      });

      // 2) curriculum lessons & checks
      for (let pass = 0; pass < 2; pass++) {                      // 2nd pass lets ME-sim 91+92 pair on one day
        order.forEach(x => {
          const n = spToday[x.s.id] || 0;
          if (x.qi < x.q.length) {
            const it = x.q[x.qi];
            const limit = it.pool === 'SIM42' || it.pool === 'SIM40' ? 2 : P.spMaxPerDay;
            if (n >= limit || (pass === 1 && it.pool !== 'SIM42' && it.pool !== 'SIM40')) return;
            if (n > 0 && x.log.length && x.log[x.log.length - 1].date === d && x.log[x.log.length - 1].pool !== it.pool) return;
            if (weekCount(x) >= P.spMaxPerWeek) return;
            if (!fits(it.pool, it.mins, x)) return;
            take(x, it, it.pool, it.mins); x.qi++; x.done++; if (it.num === 96) x.date96 = d;
            return;
          }
          if (pass === 1 || n > 0 || x.ci >= x.checks.length) return;
          // checks
          if (!x.date96) return;
          if (P.checkMode === 'batch' ? (!checkOpen || d < checkOpen) : diff(d, x.date96) < P.checkGap) return;
          if (x.lastCheck && diff(d, x.lastCheck) < 1) return;
          if (used.EXAM + 1 > cap.EXAM + 0.5) return;
          const c = x.checks[x.ci];
          const h = c.mins / 60;
          if (c.pool !== 'C172' && used[c.pool] + h / 2 > cap[c.pool]) return;
          if (usedB + h / 2 > budget) return;
          take(x, c, c.pool, c.mins, 'check'); x.lastCheck = d;
          if (c.refly) c.refly = false; else x.ci++;               // a SIRME re-fly costs one more check day
        });
      }

      day.usedB = usedB;
      out.days.push(day);
    }

    sps.forEach(x => {
      const last = k => { const l = x.log.filter(e => e.kind === k); return l.length ? l[l.length - 1].date : null; };
      const lessonsDone = x.qi >= x.q.length;
      const d96 = x.date96 || (lessonsDone ? (last('lesson') || x.s.date96) : null);
      const dUp = x.auprt >= AUPRT_N ? (last('auprt') || 'done') : null;
      const dCk = x.ci >= x.checks.length ? (last('check') || 'done') : null;
      const complete = d96 && dUp && dCk ? [d96, dUp, dCk].filter(v => v !== 'done').sort().pop() || 'done' : null;
      const d90 = (x.log.find(e => e.kind === 'lesson' && e.num === 90) || {}).date || (x.s.doneNums.get(90) || null);
      out.perSP[x.s.id] = { log: x.log, date90: d90, date96: d96, dateAuprt: dUp, dateChecks: dCk, complete, sorties: x.log.length };
    });
    out.end = out.days.length ? out.days[out.days.length - 1].date : start;
    out.finished = allDone();
    return out;
  }

  // Bookings already in the feed (status not Completed/Canceled, date >= start).
  function bookingsFrom(ctx, start) {
    const m = {};
    (ctx.flights || []).filter(f => isAP127(f.batch) && f.date >= start && f.status !== 'Completed' && f.status !== 'Canceled' && isFlightRow(f)).forEach(f => {
      const k = normName(f.student), n = lessonNum(f.lesson);
      const kind = isAuprt(f.lesson) ? 'auprt' : checkOf(f.lesson) ? 'check' : 'lesson';
      ((m[k] = m[k] || {})[f.date] = m[k][f.date] || []).push({ kind, num: n });
    });
    return m;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PLAN — the deterministic plan + Monte-Carlo percentiles (P50/P80 per SP).
  // ─────────────────────────────────────────────────────────────────────────
  function pctDate(dates, p) {
    const a = dates.filter(Boolean).filter(v => v !== 'done').sort(); if (!a.length) return dates.includes('done') ? 'done' : null;
    if (dates.some(v => !v)) { /* unfinished runs count as later than any date */ }
    const n = dates.length, idx = Math.min(n - 1, Math.ceil(p * n) - 1);
    const sorted = dates.map(v => v || '9999-12-31').map(v => v === 'done' ? '0000-00-00' : v).sort();
    const v = sorted[idx]; return v === '9999-12-31' ? null : v === '0000-00-00' ? 'done' : v;
  }
  function plan(ctx, P, o) {
    const opt = o || {};
    const asOf = opt.asOf || ctx.asOf || todayBKK();
    const m = opt.measured || measure(ctx, asOf);
    const params = P || defaults(m);
    const state = buildState(ctx, asOf);                         // today's completed flights are history
    const start = addDays(asOf, 1);                              // the plan starts tomorrow
    const booked = bookingsFrom(ctx, start);
    const base = simulate(state, m, params, { stochastic: false, seed: params.seed, booked, start });
    const runs = [];
    for (let i = 0; i < (params.runs || 0); i++) runs.push(simulate(state, m, params, { stochastic: true, seed: (params.seed * 7919 + i * 104729) >>> 0, booked, start }));
    const perSP = {};
    state.sps.forEach(s => {
      const r = runs.map(x => x.perSP[s.id]);
      perSP[s.id] = {
        plan: base.perSP[s.id],
        p50: { date96: pctDate(r.map(v => v.date96), 0.5), complete: pctDate(r.map(v => v.complete), 0.5) },
        p80: { date96: pctDate(r.map(v => v.date96), 0.8), complete: pctDate(r.map(v => v.complete), 0.8) },
      };
    });
    const batchEnd = runs.map(r => { const c = Object.values(r.perSP).map(v => v.complete); return c.some(v => !v) ? null : c.filter(v => v !== 'done').sort().pop() || 'done'; });
    const batch96 = runs.map(r => { const c = Object.values(r.perSP).map(v => v.date96); return c.some(v => !v) ? null : c.filter(v => v !== 'done').sort().pop() || 'done'; });
    const baseEnd = Object.values(base.perSP).map(v => v.complete);
    const base96 = Object.values(base.perSP).map(v => v.date96);
    // Weekly saturation from the plan: used ÷ capacity per pool and for the budget.
    const weeks = {};
    base.days.forEach(dd => {
      const wk = addDays(dd.date, -((dow(dd.date) + 6) % 7));
      const w = weeks[wk] = weeks[wk] || { week: wk, budget: 0, usedB: 0, cap: Object.fromEntries(POOLS.map(p => [p, 0])), used: Object.fromEntries(POOLS.map(p => [p, 0])), sorties: 0 };
      w.budget += dd.budget; w.usedB += dd.usedB; w.sorties += dd.n;
      POOLS.forEach(p => { w.cap[p] += dd.cap[p]; w.used[p] += dd.used[p]; });
    });
    return {
      asOf, measured: m, params, state, base, runs: runs.length, perSP,
      batch: {
        plan96: base96.some(v => !v) ? null : base96.filter(v => v !== 'done').sort().pop(),
        planComplete: baseEnd.some(v => !v) ? null : baseEnd.filter(v => v !== 'done').sort().pop(),
        p50_96: pctDate(batch96, 0.5), p80_96: pctDate(batch96, 0.8),
        p50: pctDate(batchEnd, 0.5), p80: pctDate(batchEnd, 0.8),
      },
      weeks: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BACKTEST — stand at `from`, measure only what was known then, simulate to
  // `to`, compare with what each SP actually flew. The evidence that the
  // planner reproduces how this school really moves AP-127.
  // ─────────────────────────────────────────────────────────────────────────
  function backtest(ctx, from, to, P0) {
    const m = measure(ctx, from);
    const P = Object.assign(defaults(m), P0 || {});
    const state = buildState(ctx, addDays(from, -1));
    const sim = simulate(state, m, P, { stochastic: false, start: from, until: to, booked: {} });
    const endState = buildState(ctx, to);
    const rows = state.sps.map(s => {
      const e = endState.sps.find(x => x.id === s.id);
      const act = (e.doneCount - s.doneCount) + (e.auprtDone - s.auprtDone) + (e.checksDone.length - s.checksDone.length);
      const actL = e.doneCount - s.doneCount;
      const pr = sim.perSP[s.id].log.filter(l => l.date <= to);
      const predL = pr.filter(l => l.kind === 'lesson').length;
      return { id: s.id, name: s.name, actual: act, predicted: pr.length, actualLessons: actL, predictedLessons: predL, err: pr.length - act };
    });
    const sumA = rows.reduce((a, r) => a + r.actual, 0), sumP = rows.reduce((a, r) => a + r.predicted, 0);
    const mae = rows.reduce((a, r) => a + Math.abs(r.err), 0) / (rows.length || 1);
    const avgA = sumA / (rows.length || 1);
    return { from, to, days: diff(to, from) + 1, rows, actual: sumA, predicted: sumP, batchErrPct: sumA ? (sumP - sumA) / sumA * 100 : 0, mae: +mae.toFixed(2), avgActual: +avgA.toFixed(2), budgetPerDay: m.budget.perDay };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Self-check invariants — shown on the page.
  // ─────────────────────────────────────────────────────────────────────────
  function selfCheck(res, bt) {
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail });
    const sps = res.state.sps;
    ok('every SP has a plan', sps.every(s => res.perSP[s.id] && res.perSP[s.id].plan), sps.length + ' SPs');
    ok('plan finishes every SP', res.base.finished, res.batch.planComplete || 'unfinished');
    const allLessons = sps.every(s => res.perSP[s.id].plan.log.filter(l => l.kind === 'lesson').length === s.remaining.length);
    ok('every remaining lesson scheduled exactly once', allLessons, sps.reduce((a, s) => a + s.remaining.length, 0) + ' lessons');
    const ordered = sps.every(s => { const l = res.perSP[s.id].plan.log.filter(x => x.kind === 'lesson'); return l.every((x, i) => i === 0 || x.date >= l[i - 1].date); });
    ok('lessons stay in curriculum order', ordered);
    const noHol = res.base.days.every(d => !d.hol || d.n === 0);
    ok('nothing scheduled on a holiday', noHol);
    const over = res.base.days.filter(d => d.usedB > d.budget + 3.01);
    ok('daily budget respected (±½ sortie rounding)', over.length === 0, over.length + ' days over');
    const ckAfter = sps.every(s => { const p = res.perSP[s.id].plan; const c = p.log.filter(x => x.kind === 'check'); return !c.length || (p.date96 && c[0].date > p.date96); });
    ok('checks only after lesson 96', ckAfter);
    if (bt) ok(`backtest ${bt.from}→${bt.to}: batch within ±15%`, Math.abs(bt.batchErrPct) <= 15, `${bt.predicted} predicted vs ${bt.actual} actual (${bt.batchErrPct >= 0 ? '+' : ''}${bt.batchErrPct.toFixed(1)}%), MAE ${bt.mae}/SP`);
    return { pass: out.every(r => r.pass), checks: out };
  }

  return { measure, defaults, buildState, simulate, plan, backtest, selfCheck, bookingsFrom,
    CHECKS, AUPRT_N, POOLS, POOL_LABEL, EXTRA_HOLIDAYS, util: { addDays, diff, dow, todayBKK, lessonNum, keyFromFull, poolOfFlight } };
}));
