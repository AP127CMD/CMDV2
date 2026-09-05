/* ============================================================================
 * AP127 V6 — FORECAST, HISTORY & NARRATIVE ENGINE
 *
 * The "AP127 Detail V6" tab is built around three questions:
 *     HISTORY   — how did the batch get here?
 *     SITUATION — where exactly does it stand right now?
 *     PREDICTION — where does it end up, and what would change that?
 *
 * The SITUATION half is answered entirely by js/ap127-v5-model.js, which is
 * already audited line-by-line against V4 and carries 12 self-check invariants.
 * V6 does NOT recompute a single one of those numbers — it consumes the same
 * model object. This file adds only what V5's model has no concept of: the
 * shape of the past (velocity, streaks, turning points) and the shape of the
 * future (projections, a bootstrap forecast cone, per-SP completion risk and a
 * what-if capacity simulator).
 *
 * Rules this file obeys, same as the V5 model:
 *   - pure: no DOM, no globals mutated, no Date.now() outside todayBKK()
 *   - deterministic: the Monte Carlo uses a seeded PRNG, so the same model +
 *     the same options always produce byte-identical output. A forecast that
 *     changed every render could never be put in a PDF and defended.
 *   - runs unmodified under Node (module.exports at the bottom) so every
 *     number below can be verified against the real progress snapshot without
 *     a browser — see selfCheck() at the bottom.
 *
 * Namespace: AP127V6Forecast. Nothing here is shared with V4, V5 or DB_Share.
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AP127V6Forecast = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  const DAY_MS = 86400000;

  // Date helpers — deliberately re-derived here rather than reaching into
  // AP127V5Model.util, so this file has no load-order dependency and can be
  // required standalone under Node. Semantics are identical (UTC midnight
  // keyed by YYYY-MM-DD); selfCheck() asserts that by round-tripping the
  // model's own batchStart/asOf through them.
  const ymd = d => d.toISOString().slice(0, 10);
  const parseDay = ds => new Date(ds + 'T00:00:00Z');
  function addDays(ds, n) { const d = parseDay(ds); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function dateDiff(a, b) {
    if (!a || !b) return null;
    return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / DAY_MS);
  }
  function datesRange(start, end, cap) {
    const out = []; let d = start; let guard = 0; const lim = cap || 4000;
    while (d <= end && guard++ < lim) { out.push(d); d = addDays(d, 1); }
    return out;
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sum = arr => arr.reduce((a, v) => a + v, 0);
  const mean = arr => (arr.length ? sum(arr) / arr.length : 0);

  // Seeded PRNG (mulberry32). One line of arithmetic, no dependency, and a
  // fixed seed makes the whole forecast reproducible — the screen, the report
  // preview and the exported PDF all show the same P50 date.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Quantile of an ALREADY-SORTED ascending numeric array (linear interpolation).
  function quantileSorted(sorted, p) {
    if (!sorted.length) return 0;
    if (sorted.length === 1) return sorted[0];
    const idx = clamp(p, 0, 1) * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 1. DAILY SERIES — the raw material every projection below is built from
  //
  // model.series.actualByDate.{hours,lessons} are date→increment maps already
  // summed across the batch by the V5 model (buildSeries). We expand them to a
  // dense, gap-filled calendar array from batchStart..asOf, because a forecast
  // that resampled only FLYING days would systematically over-predict: the
  // zeros (weekends, weather, maintenance, holidays) are exactly the drag that
  // has to be carried forward.
  // ───────────────────────────────────────────────────────────────────────
  function dailySeries(model) {
    const hMap = (model.series && model.series.actualByDate && model.series.actualByDate.hours) || {};
    const lMap = (model.series && model.series.actualByDate && model.series.actualByDate.lessons) || {};
    const dates = datesRange(model.batchStart, model.asOf);
    const hours = dates.map(d => +(hMap[d] || 0));
    const lessons = dates.map(d => +(lMap[d] || 0));
    return { dates, hours, lessons };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 2. VELOCITY — how fast the batch is actually moving, several ways
  //
  // Every figure is BATCH hours (or lessons) per CALENDAR day, so it is
  // directly comparable to model.pace.reqDay*B without any rescaling.
  //
  // `ewma` is the headline "velocity now": an exponentially weighted mean with
  // a 14-day half-life. Preferred over a plain 7/14/30-day mean because a
  // single big Saturday shouldn't swing the projected finish date by weeks,
  // and a 30-day mean is too slow to notice a real recovery.
  // ───────────────────────────────────────────────────────────────────────
  function velocity(series, o) {
    const opts = o || {};
    const halfLife = opts.halfLife || 14;
    const key = opts.unit === 'lessons' ? 'lessons' : 'hours';
    const v = series[key], n = v.length;

    const trailing = days => {
      const from = Math.max(0, n - days);
      const win = v.slice(from);
      return win.length ? sum(win) / days : 0;   // divide by the NOMINAL window,
    };                                            // so a short history reads slow, not fast

    // EWMA over the whole history, most recent day weighted 1.
    const lambda = Math.pow(0.5, 1 / halfLife);
    let num = 0, den = 0;
    for (let i = n - 1, w = 1; i >= 0; i--, w *= lambda) { num += v[i] * w; den += w; }
    const ewma = den ? num / den : 0;

    // Best / worst sustained 30-day stretch — the honest ceiling and floor of
    // what this batch has actually demonstrated it can do, used as the optimistic
    // and pessimistic scenario rates rather than an invented percentage.
    let best30 = 0, worst30 = Infinity;
    if (n >= 30) {
      let run = sum(v.slice(0, 30));
      best30 = worst30 = run / 30;
      for (let i = 30; i < n; i++) {
        run += v[i] - v[i - 30];
        const r = run / 30;
        if (r > best30) best30 = r;
        if (r < worst30) worst30 = r;
      }
    } else {
      best30 = worst30 = mean(v);
    }
    if (!isFinite(worst30)) worst30 = 0;

    // Week-over-week trend: OLS slope over the last 8 complete weekly totals,
    // expressed as "change in batch output per week, per week".
    const weeks = [];
    for (let end = n; end - 7 >= 0 && weeks.length < 8; end -= 7) weeks.unshift(sum(v.slice(end - 7, end)));
    let trendPerWeek = 0;
    if (weeks.length >= 3) {
      const xs = weeks.map((_, i) => i), mx = mean(xs), my = mean(weeks);
      const den2 = sum(xs.map(x => (x - mx) * (x - mx)));
      trendPerWeek = den2 ? sum(xs.map((x, i) => (x - mx) * (weeks[i] - my))) / den2 : 0;
    }

    const active30 = v.slice(Math.max(0, n - 30)).filter(x => x > 0).length;
    const activeAll = v.filter(x => x > 0).length;

    return {
      unit: key,
      v7: trailing(7), v14: trailing(14), v30: trailing(30), v60: trailing(60),
      vAll: n ? sum(v) / n : 0,
      ewma, best30, worst30, trendPerWeek,
      weeks,
      activeDays30: active30, activeDaysAll: activeAll,
      utilisation30: active30 / 30,
      // Per-active-day intensity: what a flying day is worth when it happens.
      perActiveDay30: active30 ? sum(v.slice(Math.max(0, n - 30))) / active30 : 0,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3. DETERMINISTIC SCENARIOS
  //
  // "At rate R, when is the remaining work done?" — a straight line, stated as
  // such. These are the numbers a reader can check on a napkin; the Monte Carlo
  // below is what puts error bars around them.
  // ───────────────────────────────────────────────────────────────────────
  function projectAtRate(remaining, rate, asOf, capDays) {
    if (!(rate > 0)) return { rate: rate || 0, days: null, date: null, never: true };
    const days = Math.ceil(remaining / rate);
    const cap = capDays || 3650;
    if (days > cap) return { rate, days, date: null, never: true };
    return { rate, days, date: addDays(asOf, days), never: false };
  }

  function scenarios(model, vel, o) {
    const opts = o || {};
    const unit = opts.unit === 'lessons' ? 'lessons' : 'hours';
    const remaining = unit === 'lessons' ? model.pace.remLesB : model.pace.remHrsB;
    const planEnd = model.curriculum.planEndDate;
    const requiredRate = model.pace && (unit === 'lessons' ? model.pace.reqDayLesB : model.pace.reqDayHrsB);

    const mk = (key, label, rate, note) => {
      const p = projectAtRate(remaining, rate, model.asOf, 3650);
      return {
        key, label, note, rate: p.rate, days: p.days, date: p.date, never: p.never,
        slipDays: (p.date && planEnd) ? dateDiff(p.date, planEnd) : null,
      };
    };

    return {
      unit, remaining, planEnd, requiredRate: requiredRate == null ? null : requiredRate,
      list: [
        mk('now', 'Current pace', vel.ewma, '14-day half-life weighted average of actual daily output'),
        mk('best', 'Best sustained', vel.best30, 'the fastest 30-day stretch this batch has actually flown'),
        mk('recent', 'Last 30 days', vel.v30, 'plain mean over the last 30 calendar days'),
        mk('life', 'Since day one', vel.vAll, 'plain mean over the whole batch history'),
      ],
      // The plan's own implied rate, for reference — not a projection, a target.
      required: requiredRate == null ? null : {
        key: 'required', label: 'Required to hit plan', rate: requiredRate,
        date: planEnd, days: model.pace ? model.pace.daysRem : null, never: false, slipDays: 0,
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 4. MONTE CARLO — the forecast cone and the finish-date distribution
  //
  // Method: a MOVING-BLOCK BOOTSTRAP over the last `window` calendar days of
  // real batch output. Whole 7-day blocks are resampled, not individual days,
  // so the weekly rhythm the batch actually flies (a dead Sunday, a heavy
  // Wednesday) survives into the simulation. Sampling single days would
  // destroy that autocorrelation and produce an unrealistically narrow cone.
  //
  // Deliberately NOT fitted to a named distribution: the daily-output histogram
  // is a spike at zero plus a long right tail, which no tidy parametric family
  // describes honestly. Resampling the batch's own days makes no distributional
  // claim at all.
  //
  // `drift` scales every sampled block, which is how the what-if simulator and
  // the "trend continues" scenario are expressed without a second code path.
  // ───────────────────────────────────────────────────────────────────────
  function monteCarlo(model, series, o) {
    const opts = o || {};
    const unit = opts.unit === 'lessons' ? 'lessons' : 'hours';
    const v = series[unit];
    const sims = opts.sims || 1500;
    const seed = opts.seed == null ? 20260906 : opts.seed;
    const blockLen = opts.blockLen || 7;
    const drift = opts.drift == null ? 1 : opts.drift;      // capacity multiplier
    const addPerDay = opts.addPerDay || 0;                  // absolute extra per day
    const remaining = Math.max(0, (unit === 'lessons' ? model.pace.remLesB : model.pace.remHrsB) - 0);
    const horizonCap = opts.horizonCap || 900;

    const winDays = Math.min(v.length, opts.window || 90);
    const pool = v.slice(v.length - winDays);
    const nBlocks = Math.max(1, pool.length - blockLen + 1);

    const poolMean = mean(pool) * drift + addPerDay;
    // Expected horizon with 60% headroom, capped — long enough that the P90
    // path finishes inside it in every realistic case, short enough that the
    // cone arrays stay small.
    const horizon = remaining <= 0 ? 1
      : clamp(Math.ceil((remaining / Math.max(poolMean, 0.01)) * 1.6) + 21, 30, horizonCap);

    const rnd = mulberry32(seed);
    // cum[d * sims + s] — one flat Float32Array beats 900 separate arrays.
    const cum = new Float32Array(horizon * sims);
    const finishDay = new Int32Array(sims);

    for (let s = 0; s < sims; s++) {
      let acc = 0, done = -1;
      let blockPos = blockLen;          // force a fresh block draw on day 0
      let blockStart = 0;
      for (let d = 0; d < horizon; d++) {
        if (blockPos >= blockLen) { blockStart = Math.floor(rnd() * nBlocks); blockPos = 0; }
        const raw = pool[blockStart + blockPos] || 0;
        blockPos++;
        acc += raw * drift + addPerDay;
        cum[d * sims + s] = acc;
        if (done < 0 && acc >= remaining) done = d;
      }
      finishDay[s] = done < 0 ? -1 : done;
    }

    // Per-day quantiles of cumulative output → the cone.
    // Sampled every `step` days rather than daily: 900 sorts of 1500 elements
    // is wasteful when the cone is drawn at ~1px per few days anyway.
    const step = horizon > 240 ? 4 : horizon > 120 ? 2 : 1;
    const cone = [];
    const scratch = new Float64Array(sims);
    for (let d = 0; d < horizon; d += step) {
      for (let s = 0; s < sims; s++) scratch[s] = cum[d * sims + s];
      const sorted = Array.prototype.slice.call(scratch).sort((a, b) => a - b);
      cone.push({
        date: addDays(model.asOf, d + 1),
        p10: +quantileSorted(sorted, 0.10).toFixed(2),
        p50: +quantileSorted(sorted, 0.50).toFixed(2),
        p90: +quantileSorted(sorted, 0.90).toFixed(2),
      });
    }

    const finished = Array.prototype.slice.call(finishDay).filter(d => d >= 0).sort((a, b) => a - b);
    const pct = finished.length / sims;
    const q = p => (finished.length ? Math.round(quantileSorted(finished, p)) : null);
    const dayToDate = d => (d == null ? null : addDays(model.asOf, d + 1));

    // Finish-date histogram, bucketed by week, for the distribution chart.
    const hist = [];
    if (finished.length) {
      const lo = finished[0], hi = finished[finished.length - 1];
      const bucket = Math.max(7, Math.ceil((hi - lo + 1) / 26));   // ≤26 bars
      const counts = new Map();
      finished.forEach(d => { const b = Math.floor((d - lo) / bucket); counts.set(b, (counts.get(b) || 0) + 1); });
      const maxB = Math.floor((hi - lo) / bucket);
      for (let b = 0; b <= maxB; b++) {
        counts.set(b, counts.get(b) || 0);
        hist.push({
          date: dayToDate(lo + b * bucket),
          endDate: dayToDate(lo + (b + 1) * bucket - 1),
          n: counts.get(b),
          share: counts.get(b) / sims,
        });
      }
    }

    const planEnd = model.curriculum.planEndDate;
    const onPlan = planEnd ? finished.filter(d => dayToDate(d) <= planEnd).length / sims : null;

    return {
      unit, sims, seed, remaining, horizon, window: winDays, blockLen, drift, addPerDay,
      cone,
      completedShare: pct,
      finish: {
        p10: dayToDate(q(0.10)), p50: dayToDate(q(0.50)), p90: dayToDate(q(0.90)),
        p10Days: q(0.10), p50Days: q(0.50), p90Days: q(0.90),
      },
      hist,
      probOnPlan: onPlan,
      dailyMean: +poolMean.toFixed(3),
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 5. PER-SP COMPLETION RISK
  //
  // Method note — this is the part that is easy to get wrong, so it is spelled
  // out. The obvious approach (project every SP on their OWN trailing rate)
  // was built first and measured against the real snapshot: it produced ETC
  // dates spanning 2027 to 2034. That spread is noise, not signal. A single
  // 45-day window holds only 2-8 sorties per SP, and the batch had an 8-day
  // total stand-down inside it, so one extra or missing sortie moved an SP's
  // projected finish by years.
  //
  // What the school actually does is fly a LINE — a shared pool of aircraft,
  // instructors and slots — and the SPs move through it roughly together
  // (measured: 27 of 28 SP flew in the 31 Aug - 05 Sep catch-up push). So the
  // primary projection allocates the BATCH's forecast output across SPs by
  // their historical share of it:
  //
  //     rate(sp) = batchRate × share(sp),   Σ share(sp) = 1
  //     share(sp) = ½·(observed share) + ½·(1/N)
  //
  // The half-weight shrinkage toward an equal share is deliberate and is the
  // only tunable here: it keeps a genuinely faster SP ahead of a slower one
  // without letting a quiet fortnight throw someone into the 2030s. Because
  // the shares sum to 1, the per-SP rates sum back to the batch rate exactly —
  // asserted by the `sp-rate-sum` invariant in selfCheck().
  //
  // `ownRate` (that SP's isolated trailing rate) is kept and displayed beside
  // it as a diagnostic, clearly labelled, never as the headline.
  // ───────────────────────────────────────────────────────────────────────
  function perStudent(model, o) {
    const opts = o || {};
    const winDays = opts.window || 90;
    const batchRate = opts.batchRate || 0;
    const asOf = model.asOf;
    const from = addDays(asOf, -winDays + 1);
    const planEnd = model.curriculum.planEndDate;
    const curHrs = model.curriculum.totalHours;
    const curLes = model.curriculum.count;
    const N = model.students.length || 1;
    const equalShare = 1 / N;

    const winHours = model.students.map(sp => {
      let h = 0;
      sp.flown.forEach(f => { if (f.date >= from && !f.isRetake) h += f.effMins / 60; });
      return h;
    });
    const winTotal = sum(winHours);

    const rows = model.students.map((sp, i) => {
      const firstDate = sp.firstDate || model.batchStart;
      const lifeDays = Math.max(1, (dateDiff(asOf, firstDate) || 0) + 1);
      // Observed share falls back to the lifetime share, then to an equal share,
      // so a window with no batch flying at all can't divide by zero.
      const observedShare = winTotal > 0 ? winHours[i] / winTotal
        : (model.batch.hoursDone > 0 ? sp.hoursEffective / model.batch.hoursDone : equalShare);
      const share = 0.5 * observedShare + 0.5 * equalShare;
      const rate = batchRate * share;
      const ownRate = winHours[i] / winDays;
      const lifeRate = sp.hoursEffective / lifeDays;

      const remH = Math.max(0, curHrs - sp.hoursEffective);
      const remL = Math.max(0, curLes - sp.lessonsCompleted);
      const p = projectAtRate(remH, rate, asOf, 1825);          // 5-year horizon
      const own = projectAtRate(remH, ownRate, asOf, 1825);
      const slip = (p.date && planEnd) ? dateDiff(p.date, planEnd) : null;
      const risk = p.never ? 'critical'
        : slip == null ? 'unknown'
        : slip <= 0 ? 'on-plan'
        : slip <= 30 ? 'watch'
        : slip <= 120 ? 'behind'
        : 'critical';
      return {
        sp, catc_id: sp.catc_id, name: sp.name, shortName: sp.shortName, nick: sp.nick,
        hoursDone: sp.hoursEffective, lessonsDone: sp.lessonsCompleted, pct: sp.pct,
        remainingHours: remH, remainingLessons: remL,
        share, observedShare, rate, ownRate, lifeRate,
        stalled: !(winHours[i] > 0),
        etcDate: p.date, etcDays: p.days, never: p.never, slipDays: slip, risk,
        ownEtcDate: own.date, ownEtcDays: own.days, ownNever: own.never,
        idleDays: sp.idleDays, hrsDelta: sp.hrsDelta,
      };
    });

    // Relative standing WITHIN the batch. When the whole cohort is late, the
    // absolute risk band saturates at "critical" for everyone and stops being
    // useful for triage — this says who is late relative to their own peers.
    const finiteDays = rows.filter(r => r.etcDays != null).map(r => r.etcDays).sort((a, b) => a - b);
    const medianDays = finiteDays.length ? quantileSorted(finiteDays, 0.5) : null;
    rows.forEach(r => {
      r.vsCohortDays = (r.etcDays != null && medianDays != null) ? Math.round(r.etcDays - medianDays) : null;
      r.relative = r.vsCohortDays == null ? 'unknown'
        : r.vsCohortDays <= -14 ? 'ahead'
        : r.vsCohortDays >= 14 ? 'trailing'
        : 'typical';
    });

    const order = { 'on-plan': 0, watch: 1, behind: 2, critical: 3, unknown: 4 };
    rows.sort((a, b) => (order[b.risk] - order[a.risk]) || ((b.etcDays == null ? 1e9 : b.etcDays) - (a.etcDays == null ? 1e9 : a.etcDays)));

    const bands = { 'on-plan': 0, watch: 0, behind: 0, critical: 0, unknown: 0 };
    const rel = { ahead: 0, typical: 0, trailing: 0, unknown: 0 };
    rows.forEach(r => { bands[r.risk]++; rel[r.relative]++; });
    const finite = rows.filter(r => r.etcDate).map(r => r.etcDate).sort();
    return {
      rows, bands, relative: rel, window: winDays, batchRate, equalShare, medianDays,
      earliest: finite[0] || null,
      latest: finite.length ? finite[finite.length - 1] : null,
      // Batch completion = the LAST SP to finish, not the average one.
      batchFinish: rows.some(r => r.never) ? null : (finite.length ? finite[finite.length - 1] : null),
      neverCount: rows.filter(r => r.never).length,
      stalledCount: rows.filter(r => r.stalled).length,
      // Cohort spread: how many days separate the first and last SP to finish.
      spreadDays: finiteDays.length ? finiteDays[finiteDays.length - 1] - finiteDays[0] : null,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 6. HISTORY — turning points worth narrating
  //
  // Every entry carries the date and the raw figure behind it, so a reader can
  // go and check it in the Calendar/Syllabus panels. No entry is generated
  // from a threshold that isn't stated in its own text.
  // ───────────────────────────────────────────────────────────────────────
  function history(model, series) {
    const { dates, hours, lessons } = series;
    const ev = [];
    const add = (date, kind, title, detail, value) => { if (date) ev.push({ date, kind, title, detail, value }); };

    add(model.batchStart, 'start', 'Batch started flying',
      'First AP127 training flight recorded in the Progress system.', null);

    // Best single day / best week.
    let bi = 0; hours.forEach((v, i) => { if (v > hours[bi]) bi = i; });
    if (hours[bi] > 0) add(dates[bi], 'peak', 'Biggest single day',
      hours[bi].toFixed(1) + 'h flown across the batch — ' + lessons[bi] + ' lessons.', hours[bi]);

    let bw = -1, bwv = 0;
    for (let i = 0; i + 7 <= hours.length; i++) {
      const s = sum(hours.slice(i, i + 7));
      if (s > bwv) { bwv = s; bw = i; }
    }
    if (bw >= 0 && bwv > 0) add(dates[bw], 'peak', 'Strongest 7-day stretch',
      bwv.toFixed(1) + 'h in the week beginning ' + dates[bw] + ' (' + (bwv / 7).toFixed(1) + 'h/day).', bwv);

    // Stand-downs — every run of consecutive zero-output days. The longest is
    // always narrated; the most recent one is narrated too when it is a
    // different run, because "the batch stopped flying for 8 days three weeks
    // ago" is the kind of thing that explains a forecast and would otherwise
    // be buried under an older, longer gap.
    const runs = [];
    let run = 0, runStart = -1;
    hours.forEach((v, i) => {
      if (v === 0) { if (run === 0) runStart = i; run++; }
      else { if (run > 0) runs.push({ i0: runStart, i1: i - 1, n: run }); run = 0; }
    });
    if (run > 0) runs.push({ i0: runStart, i1: hours.length - 1, n: run });
    const longest = runs.slice().sort((a, b) => b.n - a.n)[0];
    const recent = runs.filter(r => r.n >= 4).slice(-1)[0];
    const standDown = (r, label) => add(dates[r.i0], 'gap', label,
      r.n + ' consecutive days with no AP127 flying (' + dates[r.i0] + ' → ' + dates[r.i1] + ').', r.n);
    if (longest && longest.n >= 3) standDown(longest, 'Longest stand-down');
    if (recent && longest && recent.i0 !== longest.i0) standDown(recent, 'Most recent stand-down');

    // Milestone firsts, driven by the model's own key-point definitions so the
    // labels can't drift from the Syllabus panel's.
    (model.keyPoints || []).forEach(kp => {
      let firstDate = null, count = 0;
      model.students.forEach(sp => {
        const hit = sp.flownByNum && sp.flownByNum[kp.num];
        if (hit && hit.length) {
          count++;
          const d = hit[0].date;
          if (!firstDate || d < firstDate) firstDate = d;
        }
      });
      if (firstDate) add(firstDate, 'milestone', kp.label + ' — first in the batch',
        'The first SP reached ' + kp.label + ' on this date. ' + count + ' of ' +
        model.students.length + ' have completed it as of ' + model.asOf + '.', count);
    });

    // The day the batch first fell behind curriculum plan, and by how much it
    // has grown since — the single most consequential fact in the history.
    const lag = (model.series.hours && model.series.hours.lag) || [];
    const firstLag = lag.find(p => p.y > 0);
    if (firstLag) add(firstLag.x, 'warn', 'Fell behind curriculum plan',
      'The curriculum plan starts before the batch flew its first sortie, so the shortfall opens on the plan’s own first day. It now stands at ' +
      (lag.length ? lag[lag.length - 1].y.toFixed(0) : '0') + 'h.', firstLag.y);

    // Regime change — is the batch currently in a recovery or a decline? A
    // ratio of the last 14 days against the 30 before them, reported only when
    // the shift is large enough (≥1.5× either way) to be worth a reader's
    // attention. Both windows are stated in the text so the claim is checkable.
    const n = hours.length;
    let regime = null;
    if (n >= 44) {
      const recentMean = mean(hours.slice(n - 14));
      const priorMean = mean(hours.slice(n - 44, n - 14));
      const ratio = priorMean > 0 ? recentMean / priorMean : (recentMean > 0 ? Infinity : 1);
      if (ratio >= 1.5 || ratio <= 1 / 1.5) {
        const up = ratio >= 1.5;
        regime = { up, ratio, recentMean, priorMean, since: dates[n - 14] };
        add(dates[n - 14], up ? 'recovery' : 'warn',
          up ? 'Output is recovering' : 'Output is falling away',
          'Last 14 days average ' + recentMean.toFixed(1) + 'h/day against ' + priorMean.toFixed(1) +
          'h/day over the 30 days before them (' + (isFinite(ratio) ? ratio.toFixed(1) + '×' : 'from a standstill') + ').',
          ratio);
      }
    }

    ev.sort((a, b) => a.date.localeCompare(b.date));

    // Monthly aggregation for the history ribbon.
    const months = {};
    dates.forEach((d, i) => {
      const k = d.slice(0, 7);
      const m = months[k] || (months[k] = { key: k, hours: 0, lessons: 0, days: 0, active: 0 });
      m.hours += hours[i]; m.lessons += lessons[i]; m.days++; if (hours[i] > 0) m.active++;
    });
    const monthList = Object.keys(months).sort().map(k => {
      const m = months[k];
      return { ...m, hours: +m.hours.toFixed(1), perDay: +(m.hours / m.days).toFixed(2), utilisation: m.active / m.days };
    });

    return { events: ev, months: monthList, totalDays: dates.length, standDowns: runs.map(r => ({ start: dates[r.i0], end: dates[r.i1], days: r.n })), regime };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 7. WHAT-IF — capacity simulator
  //
  // Two knobs, both expressed in units a scheduler can act on:
  //   sortieMultiplier — "run the line N% harder" (scales every sampled day)
  //   extraHoursPerDay — "add this much fixed extra output per day"
  // Returns the same shape as a scenario so the UI can drop it straight into
  // the same comparison table.
  // ───────────────────────────────────────────────────────────────────────
  function whatIf(model, series, o) {
    const opts = o || {};
    const unit = opts.unit === 'lessons' ? 'lessons' : 'hours';
    const mult = opts.sortieMultiplier == null ? 1 : opts.sortieMultiplier;
    const extra = opts.extraPerDay || 0;
    const win = opts.window || 90;
    const mc = monteCarlo(model, series, {
      unit, drift: mult, addPerDay: extra,
      // Same simulation count and seed as the headline forecast by default, so
      // the neutral scenario (1.00× / +0) reproduces it EXACTLY rather than
      // landing a few days off and reading as a contradiction on the page.
      sims: opts.sims || 1500, seed: opts.seed == null ? 20260906 : opts.seed,
      window: win,
    });
    // The rate quoted is the one the simulation actually runs on — the mean of
    // the resampled window, scaled — never the EWMA. A rate printed beside a
    // date must be the rate that produced it.
    const baseRate = +mean(series[unit].slice(Math.max(0, series[unit].length - win))).toFixed(3);
    const rate = mc.dailyMean;
    const remaining = unit === 'lessons' ? model.pace.remLesB : model.pace.remHrsB;
    const det = projectAtRate(remaining, rate, model.asOf, 3650);
    const planEnd = model.curriculum.planEndDate;
    return {
      unit, sortieMultiplier: mult, extraPerDay: extra, rate, baseRate, window: win,
      deterministic: det,
      p50: mc.finish.p50, p10: mc.finish.p10, p90: mc.finish.p90,
      probOnPlan: mc.probOnPlan,
      // Slip is measured off the SIMULATED median, the figure shown as the
      // headline of this scenario — not off the straight-line projection.
      slipDays: mc.finish.p50 && planEnd ? dateDiff(mc.finish.p50, planEnd) : null,
      deltaPerDay: rate - baseRate,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 8. TOP-LEVEL BUILD
  // ───────────────────────────────────────────────────────────────────────
  function buildForecast(model, o) {
    const opts = o || {};
    const series = dailySeries(model);
    const velH = velocity(series, { unit: 'hours' });
    const velL = velocity(series, { unit: 'lessons' });
    const scH = scenarios(model, velH, { unit: 'hours' });
    const scL = scenarios(model, velL, { unit: 'lessons' });
    const mcWindow = opts.window || 90;
    const mcH = monteCarlo(model, series, { unit: 'hours', sims: opts.sims || 1500, seed: opts.seed, window: mcWindow });
    const mcL = monteCarlo(model, series, { unit: 'lessons', sims: opts.sims || 1500, seed: opts.seed, window: mcWindow });
    // Per-SP projections are allocated from the SAME batch rate the Monte Carlo
    // resamples (the trailing-window mean), never from a second estimate — so
    // the SP table and the cone can't tell two different stories.
    const sp = perStudent(model, { window: mcWindow, batchRate: mcH.dailyMean });
    const hist = history(model, series);

    // RATE CARD — every rate the tab is allowed to display, each with the exact
    // window it came from. The UI reads from here; it never derives a rate of
    // its own. `basis` is what a reader would have to recompute to check it.
    const rateCard = [
      { key: 'ewma', label: 'Pace now', value: velH.ewma, basis: 'exponentially weighted, 14-day half-life' },
      { key: 'w7', label: 'Last 7 days', value: velH.v7, basis: 'total hours ÷ 7 calendar days' },
      { key: 'w30', label: 'Last 30 days', value: velH.v30, basis: 'total hours ÷ 30 calendar days' },
      { key: 'w90', label: 'Forecast basis', value: mcH.dailyMean, basis: 'mean of the ' + mcWindow + ' days the forecast resamples' },
      { key: 'life', label: 'Since day one', value: velH.vAll, basis: 'total hours ÷ ' + series.dates.length + ' days since first flight' },
      { key: 'best', label: 'Best sustained', value: velH.best30, basis: 'the batch’s fastest 30-day stretch to date' },
      { key: 'required', label: 'Required', value: model.pace ? model.pace.reqDayHrsB : null, basis: 'remaining work ÷ days left to plan end' },
    ];

    // The verdict — one sentence, computed once, used by the hero, the insight
    // reel and the report so all three can never disagree.
    const planEnd = model.curriculum.planEndDate;
    const p50 = mcH.finish.p50;
    const slip = p50 && planEnd ? dateDiff(p50, planEnd) : null;
    const grade = slip == null ? 'unknown'
      : slip <= 0 ? 'on-plan'
      : slip <= 30 ? 'watch'
      : slip <= 120 ? 'behind'
      : 'critical';

    return {
      asOf: model.asOf, isLive: model.isLive, generatedFrom: 'AP127V5Model',
      series, rateCard, window: mcWindow,
      velocity: { hours: velH, lessons: velL },
      scenarios: { hours: scH, lessons: scL },
      monteCarlo: { hours: mcH, lessons: mcL },
      students: sp,
      history: hist,
      verdict: {
        grade, slipDays: slip, p50, planEnd,
        probOnPlan: mcH.probOnPlan,
        requiredRate: model.pace ? model.pace.reqDayHrsB : null,
        // `actualRate` is deliberately the rate the FORECAST runs on (the mean
        // of the window the bootstrap resamples), not the EWMA. The headline
        // sentence puts this rate next to the P50 completion date, and a
        // reader must be able to divide the remaining work by the rate shown
        // and land near the date shown. The EWMA is a legitimate, more
        // responsive read of "pace right now" — it stays available as
        // `paceNow` and appears in the rate card — but pairing it with a date
        // it did not produce would make the two disagree on the same line.
        actualRate: mcH.dailyMean,
        paceNow: velH.ewma,
        rateWindow: mcWindow,
        rateGap: model.pace ? mcH.dailyMean - model.pace.reqDayHrsB : null,
      },
      whatIf: args => whatIf(model, series, args),
      util: { ymd, parseDay, addDays, dateDiff, datesRange, quantileSorted, mulberry32 },
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 9. SELF-CHECK — invariants, shown live in the tab's integrity footer
  //
  // These are not unit tests of the maths; they are claims about the OUTPUT
  // that must hold for the tab to be trustworthy, checked against the real
  // model every time the page builds. Any failure is rendered in the UI.
  // ───────────────────────────────────────────────────────────────────────
  function selfCheck(fc, model) {
    const out = [];
    const add = (id, label, pass, detail) => out.push({ id, label, pass: !!pass, detail });

    // Date helpers here must agree with the V5 model's.
    const rt = addDays(model.batchStart, dateDiff(model.asOf, model.batchStart));
    add('dates', 'Date arithmetic round-trips to the model\'s own asOf', rt === model.asOf,
      rt + ' vs ' + model.asOf);

    // The daily series must reconstitute the batch total exactly.
    const seriesTotal = sum(fc.series.hours);
    add('series-total', 'Daily series sums to the model\'s batch hours',
      Math.abs(seriesTotal - model.batch.hoursDone) < 0.01,
      seriesTotal.toFixed(2) + 'h vs ' + model.batch.hoursDone.toFixed(2) + 'h');

    const seriesLes = sum(fc.series.lessons);
    add('series-lessons', 'Daily series sums to the model\'s lessons done',
      Math.round(seriesLes) === model.batch.lessonsDone,
      Math.round(seriesLes) + ' vs ' + model.batch.lessonsDone);

    // Remaining work must be the model's, never a second opinion.
    add('remaining', 'Forecast remaining work equals the model\'s pace figure',
      Math.abs(fc.monteCarlo.hours.remaining - model.pace.remHrsB) < 0.01,
      fc.monteCarlo.hours.remaining.toFixed(2) + 'h vs ' + model.pace.remHrsB.toFixed(2) + 'h');

    // The cone must be ordered and monotone at every sample.
    const cone = fc.monteCarlo.hours.cone;
    const ordered = cone.every(p => p.p10 <= p.p50 + 1e-6 && p.p50 <= p.p90 + 1e-6);
    add('cone-order', 'Forecast cone is ordered P10 ≤ P50 ≤ P90 at every step', ordered,
      cone.length + ' sampled steps');
    let mono = true;
    for (let i = 1; i < cone.length; i++) if (cone[i].p50 + 1e-6 < cone[i - 1].p50) { mono = false; break; }
    add('cone-monotone', 'Cumulative forecast never decreases', mono, cone.length + ' steps');

    // P50 finish must sit inside the deterministic bracket implied by the two
    // extreme sustained rates the batch has actually flown. This is the check
    // that would catch a units error or an off-by-N in the resampler.
    const vel = fc.velocity.hours;
    const rem = model.pace.remHrsB;
    const fast = projectAtRate(rem, vel.best30, model.asOf).days;
    const slow = projectAtRate(rem, Math.max(vel.worst30, 0.01), model.asOf).days;
    const p50d = fc.monteCarlo.hours.finish.p50Days;
    add('p50-bracket', 'Median forecast sits between best- and worst-case sustained pace',
      p50d == null || (p50d >= fast - 2 && p50d <= slow + 2),
      'P50 ' + p50d + 'd · best30 ' + fast + 'd · worst30 ' + slow + 'd');

    // Determinism: same seed, same answer.
    const again = monteCarlo(model, fc.series, { unit: 'hours', sims: 300, seed: 1234 });
    const again2 = monteCarlo(model, fc.series, { unit: 'hours', sims: 300, seed: 1234 });
    add('deterministic', 'Same seed reproduces the same forecast exactly',
      again.finish.p50 === again2.finish.p50 && again.finish.p90 === again2.finish.p90,
      again.finish.p50 + ' / ' + again2.finish.p50);

    // Per-SP roll-up must account for every student, once.
    const bandTotal = Object.values(fc.students.bands).reduce((a, v) => a + v, 0);
    add('sp-cover', 'Every SP appears in exactly one risk band',
      bandTotal === model.students.length && fc.students.rows.length === model.students.length,
      bandTotal + ' banded / ' + fc.students.rows.length + ' rows / ' + model.students.length + ' SP');

    // Per-SP remaining hours must roll up to the batch remaining.
    const spRem = sum(fc.students.rows.map(r => r.remainingHours));
    add('sp-remaining', 'Per-SP remaining hours roll up to the batch remaining',
      Math.abs(spRem - model.pace.remHrsB) < 0.05,
      spRem.toFixed(2) + 'h vs ' + model.pace.remHrsB.toFixed(2) + 'h');

    // The share allocation must be a true partition of the batch rate — this is
    // the invariant that keeps the SP table and the forecast cone consistent.
    const shareSum = sum(fc.students.rows.map(r => r.share));
    add('sp-share', 'Per-SP capacity shares sum to exactly 1',
      Math.abs(shareSum - 1) < 1e-9, shareSum.toFixed(12));
    const rateSum = sum(fc.students.rows.map(r => r.rate));
    add('sp-rate-sum', 'Per-SP projected rates sum back to the batch forecast rate',
      Math.abs(rateSum - fc.monteCarlo.hours.dailyMean) < 1e-6,
      rateSum.toFixed(4) + ' vs ' + fc.monteCarlo.hours.dailyMean.toFixed(4) + ' h/day');

    // Every rate the UI is allowed to print must be a real, finite number.
    const badRate = fc.rateCard.filter(r => r.value != null && !(isFinite(r.value) && r.value >= 0));
    add('ratecard', 'Every published rate is finite and non-negative', badRate.length === 0,
      fc.rateCard.length + ' rates · ' + badRate.map(r => r.key).join(',') || 'all clean');

    // History months must cover the whole flown span with no missing day.
    const covered = fc.history.months.reduce((a, m) => a + m.days, 0);
    add('history-cover', 'History months cover every calendar day since batch start',
      covered === fc.history.totalDays, covered + ' vs ' + fc.history.totalDays + ' days');

    // What-if with neutral knobs must reproduce the base case.
    const neutral = fc.whatIf({ unit: 'hours', sortieMultiplier: 1, extraPerDay: 0 });
    add('whatif-neutral', 'What-if at 1.00× / +0h reproduces the headline forecast exactly',
      neutral.p50 === fc.monteCarlo.hours.finish.p50,
      neutral.p50 + ' vs ' + fc.monteCarlo.hours.finish.p50);
    add('whatif-rate', 'What-if quotes the rate its own simulation ran on',
      Math.abs(neutral.rate - fc.monteCarlo.hours.dailyMean) < 1e-6,
      neutral.rate.toFixed(3) + ' vs ' + fc.monteCarlo.hours.dailyMean.toFixed(3));

    return { pass: out.every(r => r.pass), checks: out };
  }

  return {
    buildForecast, selfCheck,
    dailySeries, velocity, scenarios, monteCarlo, perStudent, history, whatIf, projectAtRate,
    util: { ymd, parseDay, addDays, dateDiff, datesRange, quantileSorted, mulberry32, sum, mean, clamp },
  };
}));
