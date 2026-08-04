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

  window.AP127MonthlyCC = { BATCHES, MONTHS, MONTH_LABEL, buildCurMap, effMinsFromDur, effMinsFromActual, computeMonthly, computeDiagnostics };
})();
