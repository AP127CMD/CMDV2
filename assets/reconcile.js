/* ============================================================================
 * AP127 V2 — Cross-Check Reconciliation Engine
 * ----------------------------------------------------------------------------
 * Pure (no-DOM) functions that compare the two independent AP127 data sources:
 *
 *   1. OPERATIONS  (window.FLIGHT_DATA.flights)
 *        Flat list of every scheduled/actual flight scraped from the Flight
 *        Operations Portal — all batches, scheduled + post-flight actuals.
 *
 *   2. PROGRESS    (window.PROGRESS_DATA.ap127 / .cur127)
 *        AP127-only, curriculum-aligned per-student progress from the
 *        ap127-data-api worker. Each student carries flown[] + planned[].
 *
 * The two systems are populated independently, so disagreements between them
 * are exactly the "conflicts" the dashboard must surface. This engine pairs
 * AP127 flown lessons across the sources and classifies every pairing as
 * OK / REVIEW / CONFLICT.
 *
 * Exposed as window.AP127Reconcile.
 * ==========================================================================*/
(function () {
  // --- helpers --------------------------------------------------------------

  // Operations stores names as "FIRSTNAME L." (upper). Progress stores full
  // names "Firstname Lastname". Build the operations-style key from a full name.
  function ccKeyFromFull(name) {
    const p = String(name || '').trim().split(/\s+/);
    if (!p[0]) return '';
    if (p.length < 2) return p[0].toUpperCase();
    return (p[0] + ' ' + p[1][0]).toUpperCase() + '.';
  }

  // Normalise an operations student name for keying (strip "(Unplanned)" etc).
  function ccNameNorm(name) {
    return String(name || '').replace(/\s*\(Unplanned\)\s*/i, '').trim().toUpperCase();
  }

  // Normalise a lesson code: upper, collapse spaces, drop a trailing "/n"
  // repeat marker (e.g. "CDGL 04/1" -> "CDGL 04").
  function normLesson(l) {
    return String(l || '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/\/\d+\s*$/, '');
  }

  // "H:MM" or "HH:MM" -> minutes.
  function hmToMin(s) {
    if (!s) return null;
    const m = String(s).match(/(\d+):(\d+)/);
    return m ? (+m[1] * 60 + +m[2]) : null;
  }

  function isAP127(batch) {
    return String(batch || '').replace(/[^a-z0-9]/gi, '').toUpperCase().includes('AP127');
  }

  function dateDiff(a, b) {
    if (!a || !b) return null;
    const ad = new Date(a + 'T00:00:00'), bd = new Date(b + 'T00:00:00');
    if (isNaN(ad) || isNaN(bd)) return null;
    return Math.round((ad - bd) / 86400000);
  }

  // --- core -----------------------------------------------------------------

  /**
   * @param {object} flightData  window.FLIGHT_DATA
   * @param {object} progressData window.PROGRESS_DATA
   * @param {object} [opts] { durTolMin=20, dateTolDays=1 }
   * @returns {{rows:Array, perStudent:Array, totals:object}}
   */
  function reconcile(flightData, progressData, opts) {
    opts = opts || {};
    const durTol = opts.durTolMin != null ? opts.durTolMin : 20;
    const dateTol = opts.dateTolDays != null ? opts.dateTolDays : 1;

    const flights = (flightData && flightData.flights) || [];
    const students = (progressData && progressData.ap127) || [];

    // Completed AP127 ops flights, grouped by normalised student key.
    const ccByStudent = {};
    let ccMinDate = null;
    flights
      .filter(f => isAP127(f.batch) && f.status === 'Completed' && f.student && f.lesson)
      .forEach(f => {
        const k = ccNameNorm(f.student);
        (ccByStudent[k] = ccByStudent[k] || []).push(f);
        if (f.date && (!ccMinDate || f.date < ccMinDate)) ccMinDate = f.date;
      });

    // Only compare within the window both sources cover. Operations history is
    // a rolling window; progress goes back further. Flown lessons earlier than
    // the earliest ops record can't be cross-checked and aren't real conflicts.
    const windowStart = ccMinDate || '0000-00-00';

    const rows = [];
    const perStudent = [];

    students.forEach(s => {
      const key = ccKeyFromFull(s.name);
      const ccList = ccByStudent[key] || [];
      const ccByLesson = {};
      ccList.forEach(f => {
        const nl = normLesson(f.lesson);
        (ccByLesson[nl] = ccByLesson[nl] || []).push(f);
      });

      const flown = (s.flown || []).filter(f => f.date && f.date >= windowStart);
      const flownLessons = new Set(flown.map(f => normLesson(f.lesson)));
      let ok = 0, review = 0, conflict = 0;

      // Direction 1: Progress -> Operations
      flown.forEach(pf => {
        const nl = normLesson(pf.lesson);
        const matches = ccByLesson[nl] || [];
        if (!matches.length) {
          rows.push({
            student: s.name, nick: s.nick, key, lesson: pf.lesson, date: pf.date,
            type: 'missing_in_ops', sev: 'conflict',
            detail: 'Logged in Progress but no matching Completed flight in Operations'
          });
          conflict++;
          return;
        }
        const exact = matches.find(m => m.date === pf.date);
        const m = exact || matches.slice().sort((a, b) =>
          Math.abs(dateDiff(a.date, pf.date)) - Math.abs(dateDiff(b.date, pf.date)))[0];
        const ccMin = hmToMin(m.airborne) != null ? hmToMin(m.airborne) : hmToMin(m.duration);
        const pMin = pf.actual_mins;
        const issues = [];
        const dd = dateDiff(m.date, pf.date);
        if (!exact && dd != null && Math.abs(dd) > dateTol) {
          issues.push('date Δ ' + (dd > 0 ? '+' : '') + dd + 'd (ops ' + m.date + ')');
        }
        if (ccMin != null && pMin != null && Math.abs(ccMin - pMin) > durTol) {
          issues.push('time Δ ' + (pMin - ccMin > 0 ? '+' : '') + (pMin - ccMin) + 'm (ops ' + ccMin + 'm · prog ' + pMin + 'm)');
        }
        if (issues.length) {
          rows.push({
            student: s.name, nick: s.nick, key, lesson: pf.lesson, date: pf.date,
            type: 'review', sev: 'review', detail: issues.join('; '),
            opsDate: m.date, opsMin: ccMin, progMin: pMin
          });
          review++;
        } else {
          ok++;
        }
      });

      // Direction 2: Operations -> Progress
      Object.keys(ccByLesson).forEach(nl => {
        if (!flownLessons.has(nl)) {
          const f = ccByLesson[nl][0];
          rows.push({
            student: s.name, nick: s.nick, key, lesson: f.lesson, date: f.date,
            type: 'missing_in_progress', sev: 'conflict',
            detail: 'Completed in Operations but not logged in Progress'
          });
          conflict++;
        }
      });

      perStudent.push({
        name: s.name, nick: s.nick, key,
        matched: ccList.length > 0,
        progDone: s.done != null ? s.done : (s.flown || []).length,
        ccCompleted: ccList.length,
        ok, review, conflict,
        checked: ok + review + conflict
      });
    });

    // Operations AP127 students with no matching progress record.
    const progKeys = new Set(students.map(s => ccKeyFromFull(s.name)));
    const orphanOps = Object.keys(ccByStudent).filter(k => !progKeys.has(k));

    const totals = {
      students: students.length,
      ok: perStudent.reduce((a, s) => a + s.ok, 0),
      review: perStudent.reduce((a, s) => a + s.review, 0),
      conflict: perStudent.reduce((a, s) => a + s.conflict, 0),
      orphanOps,
      windowStart
    };
    totals.checked = totals.ok + totals.review + totals.conflict;
    totals.consistency = totals.checked ? Math.round((totals.ok / totals.checked) * 100) : 100;

    return { rows, perStudent, totals };
  }

  window.AP127Reconcile = { reconcile, isAP127, ccKeyFromFull, ccNameNorm, normLesson, hmToMin, dateDiff };
})();
