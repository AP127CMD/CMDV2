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
  // own logged duration). PROG's flown[] is already one record per completed
  // lesson (not per booking), so no dedup is needed on this side — confirmed
  // during the original investigation (its counts were never inflated).
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

  // OPS-side effective-hours dedup — mirrors js/view-summary.js's
  // sBuildEffectiveCreditSet(): a curriculum lesson is required once per SP. Every
  // Completed flight is grouped into a "family" by BASE lesson code (any "/N" suffix
  // stripped) — covers a lesson logged as 2+ unsuffixed duplicate bookings, a lesson
  // logged bare on one date plus properly "/1,/2,/3"-split on another (bare and "/1"
  // both mean "part 1" — confirmed live 2026-08-05 via student NAPATH T., lesson
  // CSXV 45), AND a lesson logged ONLY as continuation legs with no "/1"/bare leg ever
  // recorded (confirmed live: 8 such cases across the whole dataset, ~9h — previously
  // credited 0 despite Progress showing the lesson done). One credited representative
  // per family: prefer a "part 1" (bare or "/1") row if any exists (latest date/time
  // wins among those); only when the family has none does the earliest-available
  // continuation leg stand in. Computed globally (every Completed OPS flight, not just
  // the 3 target months) so the credited row — and the month it falls in — matches
  // exactly what the (now-fixed) Ops Analytics tab shows.
  function baseLessonCode(l) { return String(l || '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/\/\d+\s*$/, ''); }
  function lessonPartNum(l) { const m = String(l || '').trim().match(/\/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 1; }
  function buildEffectiveCreditSet(flights) {
    const families = new Map(); // "student|BASECODE" -> {f,idx}[]
    flights.forEach((f, idx) => {
      if (f.status !== 'Completed' || !f.student || !f.lesson) return;
      const key = f.student + '|' + baseLessonCode(f.lesson);
      if (!families.has(key)) families.set(key, []);
      families.get(key).push({ f, idx });
    });
    // Set of flight OBJECT REFERENCES, not `.id` — some Ops Portal rows share identical
    // `.id` values (a known upstream ACTUAL_ONLY_ id-generation bug), so `.id` can't
    // safely identify the single credited row; object identity can.
    const credited = new Set();
    families.forEach(entries => {
      const part1 = entries.filter(e => lessonPartNum(e.f.lesson) === 1);
      const pool = part1.length ? part1 : entries;
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
    // Only effective-hours accumulation is deduped (see buildEffectiveCreditSet) —
    // Actual/Block mode legitimately sums every real booking's logged block time.
    const credited = hoursMode === 'effective' ? buildEffectiveCreditSet(window.FLIGHTS || []) : null;

    const ops = {};
    BATCHES.forEach(({ label }) => { ops[label] = {}; MONTHS.forEach(m => ops[label][m] = { hours: 0, count: 0, byStu: {} }); });
    (window.FLIGHTS || []).forEach(f => {
      if (f.status !== 'Completed' || !f.date) return;
      const mk = f.date.slice(0, 7);
      if (!MONTHS.includes(mk)) return;
      const b = BATCHES.find(x => x.label === f.batch);
      if (!b) return;
      const deduped = hoursMode === 'effective' && f.lesson && !credited.has(f);
      // The credited row gets its full curriculum-standard duration by BASE lesson
      // code — not effMinsFromDur()'s own "/N" part parsing, which would wrongly
      // return 0 for a credited row that's a continuation leg (the "no part-1
      // anywhere" fallback case in buildEffectiveCreditSet).
      const hrs = deduped ? 0 : (hoursMode === 'effective'
        ? (f.lesson ? (curMap[baseLessonCode(f.lesson)] != null ? curMap[baseLessonCode(f.lesson)] : f.durMin || 0) / 60 : effMinsFromDur(f, curMap) / 60)
        : (f.durMin || 0) / 60);
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
   * Root-cause diagnostics across all in-scope batches/months.
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

  /**
   * Full bidirectional hours reconciliation ledger. Unlike computeDiagnostics()
   * (one-directional: only asks "does this OPS-completed flight have a PROG
   * record"), this accounts for every hour of Δ between OPS and PROG in BOTH
   * directions, itemized down to student+lesson+date, validated against the
   * observed Δ so nothing is left as an unexplained aggregate gap:
   *
   *   Δ(PROG − OPS) = structural + opsPending + opsCanceled + progTrueGap
   *                   + progDrift − opsOrphan − opsDrift  (+ residual)
   *
   * - structural:   PROG lesson code that NEVER appears in FLIGHTS at all (any
   *                 student/batch/status) — not a flight-booking lesson type at
   *                 all (e.g. a ground/academic item), so it structurally can't
   *                 be tracked by the Ops Portal. Permanent, not a data gap.
   * - opsPending:   matching Ops booking exists (same student+lesson) but its
   *                 status is still Pending — flown per Progress, Ops hasn't
   *                 marked it Completed yet. Self-heals when Ops catches up.
   * - opsCanceled:  matching Ops booking exists but is marked Canceled — a real
   *                 conflict worth a human look (flown-but-cancelled).
   * - progTrueGap:  no Ops record at all for that student+lesson, any status,
   *                 any date — a genuine missing Ops Portal entry.
   * - progDrift:    a matching OPS credit exists, but only in a DIFFERENT
   *                 month — contributes to PROG's total this month with no
   *                 OPS counterpart in this same month (and the reverse:
   *                 opsDrift is the same phenomenon from the OPS side).
   * - opsOrphan:    OPS-credited lesson this month with no PROG record at all,
   *                 any date — Progress hasn't logged it yet (opposite lag
   *                 direction from opsPending/progTrueGap).
   * - residual:     Δ minus everything above — should be ~0. Confirmed live
   *                 2026-08-05 across all 6 batch/month rows after fixing two
   *                 real bugs the residual pointed at: (1) a lesson-code
   *                 spelling mismatch between the Ops Portal and the
   *                 curriculum/Progress ("CDNXV 48" vs "CDNXC 48", same
   *                 lesson — fixed in js/shared.js's AP_LESSON_CODE_ALIASES),
   *                 and (2) buildEffectiveCreditSet() not recognizing bare and
   *                 "/1" as the same "part 1", and not crediting a lesson
   *                 logged only as continuation legs with no "/1"/bare leg at
   *                 all (both fixed in its family-grouping rewrite). 5 of 6
   *                 rows now reconcile to an exact 0 residual; the 6th is off
   *                 by 0.01h (rounding only).
   *
   * @param {'effective'|'actual'} hoursMode
   * @returns {object} keyed "BATCH|MONTH" -> {opsHours, progHours, delta, categories, residual}
   */
  function computeLedger(hoursMode) {
    const R = window.AP127Reconcile;
    const curMap = hoursMode === 'effective' ? buildCurMap() : {};
    const { key: opsStudentKey } = opsStudentKeyBuilder();
    const credited = hoursMode === 'effective' ? buildEffectiveCreditSet(window.FLIGHTS || []) : null;
    // Every call site below only invokes minsOps() on rows already confirmed credited
    // (or in Actual/Block mode, where dedup doesn't apply) — so in effective mode this
    // always resolves by BASE lesson code, matching js/view-summary.js's hoursOf().
    const minsOps = f => hoursMode === 'effective'
      ? (f.lesson ? (curMap[baseLessonCode(f.lesson)] != null ? curMap[baseLessonCode(f.lesson)] : f.durMin || 0) : f.durMin || 0)
      : (f.durMin || 0);
    const minsProg = f => hoursMode === 'effective' ? effMinsFromActual(f, curMap) : (f.actual_mins || 0);

    // Every lesson code that appears anywhere in FLIGHTS at all — tells "genuinely
    // never tracked by the Ops Portal" apart from "tracked, just not this booking."
    const anyOpsLessonCodes = new Set((window.FLIGHTS || []).map(f => normLesson(f.lesson)).filter(Boolean));

    const ledger = {};
    BATCHES.forEach(({ label, ngtKey }) => {
      const opsCredited = [];
      (window.FLIGHTS || []).forEach(f => {
        if (f.status !== 'Completed' || f.batch !== label || !f.lesson) return;
        if (hoursMode === 'effective' && !credited.has(f)) return;
        opsCredited.push({ student: opsStudentKey(f.student), lesson: normLesson(f.lesson), date: f.date, mins: minsOps(f) });
      });
      const progAll = [];
      (window.NGT_CACHE?.[ngtKey] || []).forEach(s => {
        const sk = R.ccKeyFromFull(s.name);
        (s.flown || []).forEach(f => { if (!f.date) return; progAll.push({ student: sk, lesson: normLesson(f.lesson), date: f.date, mins: minsProg(f) }); });
      });
      function indexBy(arr) { const m = {}; arr.forEach(x => { const k = x.student + '|' + x.lesson; (m[k] = m[k] || []).push(x); }); return m; }
      const opsIdx = indexBy(opsCredited), progIdx = indexBy(progAll);

      MONTHS.forEach(mk => {
        const opsMonth = opsCredited.filter(x => x.date.slice(0, 7) === mk);
        const progMonth = progAll.filter(x => x.date.slice(0, 7) === mk);
        const opsHours = opsMonth.reduce((a, x) => a + x.mins, 0) / 60;
        const progHours = progMonth.reduce((a, x) => a + x.mins, 0) / 60;

        const progOrphans = [], progDrift = [];
        progMonth.forEach(x => {
          const m = opsIdx[x.student + '|' + x.lesson];
          if (!m) { progOrphans.push(x); return; }
          if (!m.some(o => o.date.slice(0, 7) === mk)) progDrift.push(x);
        });
        const opsOrphans = [], opsDrift = [];
        opsMonth.forEach(x => {
          const m = progIdx[x.student + '|' + x.lesson];
          if (!m) { opsOrphans.push(x); return; }
          if (!m.some(p => p.date.slice(0, 7) === mk)) opsDrift.push(x);
        });

        const structural = [], opsPending = [], opsCanceled = [], progTrueGap = [];
        progOrphans.forEach(x => {
          if (!anyOpsLessonCodes.has(x.lesson)) { structural.push(x); return; }
          const cands = (window.FLIGHTS || []).filter(f => f.batch === label && normLesson(f.lesson) === x.lesson && opsStudentKey(f.student) === x.student);
          if (!cands.length) { progTrueGap.push({ ...x, opsStatus: null, opsDate: null }); return; }
          const closest = cands.slice().sort((a, b) => Math.abs(new Date(a.date) - new Date(x.date)) - Math.abs(new Date(b.date) - new Date(x.date)))[0];
          if (closest.status === 'Pending') opsPending.push({ ...x, opsStatus: 'Pending', opsDate: closest.date });
          else if (closest.status === 'Canceled') opsCanceled.push({ ...x, opsStatus: 'Canceled', opsDate: closest.date });
          else progTrueGap.push({ ...x, opsStatus: closest.status, opsDate: closest.date });
        });

        const sumH = arr => +(arr.reduce((a, x) => a + x.mins, 0) / 60).toFixed(2);
        const categories = {
          structural: { n: structural.length, h: sumH(structural), lines: structural },
          opsPending: { n: opsPending.length, h: sumH(opsPending), lines: opsPending },
          opsCanceled: { n: opsCanceled.length, h: sumH(opsCanceled), lines: opsCanceled },
          progTrueGap: { n: progTrueGap.length, h: sumH(progTrueGap), lines: progTrueGap },
          progDrift: { n: progDrift.length, h: sumH(progDrift), lines: progDrift },
          opsOrphan: { n: opsOrphans.length, h: sumH(opsOrphans), lines: opsOrphans },
          opsDrift: { n: opsDrift.length, h: sumH(opsDrift), lines: opsDrift },
        };
        const delta = +(progHours - opsHours).toFixed(2);
        const explained = +(categories.structural.h + categories.opsPending.h + categories.opsCanceled.h +
          categories.progTrueGap.h + categories.progDrift.h - categories.opsOrphan.h - categories.opsDrift.h).toFixed(2);
        const residual = +(delta - explained).toFixed(2);

        ledger[label + '|' + mk] = { opsHours: +opsHours.toFixed(2), progHours: +progHours.toFixed(2), delta, categories, residual };
      });
    });
    return ledger;
  }

  window.AP127MonthlyCC = { BATCHES, MONTHS, MONTH_LABEL, buildCurMap, effMinsFromDur, effMinsFromActual, computeMonthly, computeDiagnostics, computeLedger };
})();
