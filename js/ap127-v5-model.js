/* ============================================================================
 * AP127 V5 — METRICS MODEL
 *
 * The ONLY place any AP127 number is computed for the "AP127 Detail V5" tab.
 * Every formula here is ported from js/view-cohort-v4.js with the V4 line number
 * in a comment, so the two can be diffed by hand. Two deliberate divergences are
 * marked F1 / F2 and explained at their site (see also
 * docs/superpowers/specs/2026-08-12-ap127-detail-v5-design.md §2.4).
 *
 * Rules this file obeys:
 *   - pure: no DOM reads, no DOM writes, no globals mutated
 *   - every derived list is pre-indexed once, so no consumer ever re-scans
 *     `flown[]` per cell the way V4's Roster does (view-cohort-v4.js:2710)
 *   - `ap127Hours()`-style helpers that rebuilt a 96-entry lessonsMap on EVERY
 *     call (view-cohort-v4.js:419) are replaced by one map built once per model
 *   - runs unmodified under Node (module.exports at the bottom) so the model can
 *     be verified against the real progress snapshot without a browser
 *
 * Nothing in this file is shared with V4, V3 or DB_Share. Namespace: AP127V5Model.
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AP127V5Model = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // Curriculum structure — verbatim from view-cohort-v4.js:330 / :358.
  // Lesson-NUMBER ranges from the authoritative syllabus.json backing
  // ap127-flight-training.pages.dev. Every AP127 lesson code ends in its
  // curriculum lesson number, so phase membership is exact, not inferred.
  // ─────────────────────────────────────────────────────────────────────────
  const PHASES = [
    { n: 1, label: 'Phase I',   title: 'Basic Flight Training',            lo: 1,  hi: 13, c: '#38bdf8', hrs: 14,
      blurb: 'First air experience through first solo — basic handling, circuits, emergency procedures.',
      objective: 'Provide the trainee with the fundamental flight skills and essential airmanship required to safely conduct a first solo flight. Training focuses on basic aircraft handling, traffic pattern operations, and emergency procedures under the supervision of a flight instructor.',
      standard: 'The trainee shall demonstrate sufficient competence in basic aircraft handling, normal procedures, and emergency operations to be recommended for the first solo flight.' },
    { n: 2, label: 'Phase II',  title: 'Consolidation & IFR Introduction', lo: 14, hi: 32, c: '#4ade80', hrs: 25,
      blurb: 'Solo consolidation, navigation, and first instrument-flying exposure.',
      objective: 'Consolidate basic flight skills and introduce instrument flying. The trainee will progress from first solo to solo cross-country, while developing IFR navigation skills using radio navigation aids.',
      standard: 'The trainee shall demonstrate competence in solo general handling, basic instrument flight, radio navigation aid use, and VFR cross-country navigation, and must be qualified for solo cross-country flight.' },
    { n: 3, label: 'Phase III', title: 'Advanced VFR & Night Flying',      lo: 33, hi: 55, c: '#f59e0b', hrs: 45,
      blurb: 'SPIC cross-country, radio nav aids, night qualification, Phase III skill checks.',
      objective: 'Develop advanced VFR cross-country and PIC (SPIC) skills, complete night flight qualification, and pass Phase III skill checks. The trainee will act as student PIC on all cross-country flights.',
      standard: 'The trainee shall complete the solo long cross-country, achieve night qualification, and pass both the general handling check and VFR cross-country check as student PIC.' },
    { n: 4, label: 'Phase IV',  title: 'IFR & Multi-Engine Training',      lo: 56, hi: 96, c: '#a78bfa', hrs: 96,
      blurb: 'Full IFR competence, simulator training, multi-engine conversion, final checkrides.',
      objective: 'Develop full IFR competence on single-engine and multi-engine aircraft, including simulator training, IFR cross-country operations as student PIC, and multi-engine conversion. Culminates in completion of all course requirements for the CPL/IR licence.',
      standard: 'The trainee shall complete all IFR training, pass the IFR cross-country check, complete multi-engine training, and pass the final MEP IFR cross-country check.' },
  ];

  // Finer 7-segment split used by the Curriculum Grid's phase band (V4 used this
  // for Overall Progress Bar View only — view-cohort-v4.js:358). Phase IV broken
  // into SIM/REAL × SE/ME. 28+59+2+7 = 96h = Phase IV's own total.
  const SEGMENTS = [
    { label: 'Phase I',   title: 'Basic Flight Training',             lo: 1,  hi: 13, c: '#38bdf8', hrs: 14, phaseIdx: 0 },
    { label: 'Phase II',  title: 'Consolidation & IFR Introduction',  lo: 14, hi: 32, c: '#4ade80', hrs: 25, phaseIdx: 1 },
    { label: 'Phase III', title: 'Advanced VFR & Night Flying',       lo: 33, hi: 55, c: '#f59e0b', hrs: 45, phaseIdx: 2 },
    { label: 'IFR Sim',   title: 'Phase IV · IFR Simulator (FNPT II)', lo: 56, hi: 67, c: '#93c5fd', hrs: 28, phaseIdx: 3 },
    { label: 'IFR Real',  title: 'Phase IV · IFR Aircraft (SE)',      lo: 68, hi: 90, c: '#a78bfa', hrs: 59, phaseIdx: 3 },
    { label: 'ME Sim',    title: 'Phase IV · Multi-Engine Simulator', lo: 91, hi: 92, c: '#f9a8d4', hrs: 2,  phaseIdx: 3, meIntro: true },
    { label: 'ME Real',   title: 'Phase IV · Multi-Engine Aircraft',  lo: 93, hi: 96, c: '#ec4899', hrs: 7,  phaseIdx: 3 },
  ];
  const PHASE_OTHER = { label: 'Other', title: 'Unrecognized lesson code', c: '#6b7280', n: 0 };

  // view-cohort-v4.js:394 — Dual = the app's magenta accent, Solo = a duller mustard
  // (distinct from the bright gold used for target flags), Simulator darkened to open
  // a real lightness gap from both (colour-blind safety, see V4's own note).
  const TYPE_COLORS = { Dual: '#e88aff', Solo: '#d4a017', Simulator: '#6d5cd6' };

  // view-cohort-v4.js:1338 — the 4 real checkride codes and what each one checks.
  const CHECKRIDE_DETAIL = { CSPGLC: 'GH', CSPXVC: 'VFR XC', CSPXIC: 'IFR XC', CMSPXIC: 'ME IFR XC' };

  const MILESTONE_TYPES = [
    { key: 'solo',       test: l => /Initial Solo/i.test(l),   explain: 'First flight with no instructor on board. Cleared only after basic handling, circuits and emergency procedures are all to standard.' },
    { key: 'instrument', test: l => /Instrument/i.test(l),     explain: 'First instrument-flying lesson — flying by reference to instruments alone, the foundation of the whole IFR half of the course.' },
    { key: 'xc',         test: l => /Cross-Country/i.test(l),  explain: 'First navigation flight away from the local area, planned and flown to another airfield.' },
    { key: 'sim',        test: l => /Sim/i.test(l),            explain: 'Simulator (FNPT II) training begins — procedures and failures that are impractical or unsafe to rehearse in the aircraft.' },
    { key: 'me',         test: l => /Multi-Engine/i.test(l),   explain: 'Multi-engine conversion begins — a different aircraft, asymmetric handling, and its own set of limitations.' },
    { key: 'check',      test: l => /Checkride/i.test(l),      explain: 'A formal skill check with an examiner. Progress past this point depends on passing it.' },
  ];

  const FI_FULL = { 'W-CHAI': 'WUTTHICHAI L.', 'P-YUTH': 'PHAHOLYUTH P.', 'P-YA': 'PARINYA B.', 'S-TI': 'SANTI SUK.', 'N-TORN': 'NAPATTORN S.', 'I-POL': 'ITTIPOL P.', 'SN-TI': 'SANTI PO.', 'A-WAT': 'THAWATANAN P.', 'W-NU': 'WISANU T.', 'K-POL': 'KOONPHOL U.', 'C-CHAI': 'CHAROENCHAI U.', 'E-PHOB': 'EKKAPHOP R.', 'S-WAN': 'SOWAN C.', 'K-CHAI': 'KITTICHAI C.' };

  const DAY_MS = 86400000;

  // ─────────────────────────────────────────────────────────────────────────
  // Date primitives. Every one parses AND serialises in UTC. V4 accumulated
  // three separate bugs from parsing "YYYY-MM-DD" as LOCAL midnight and then
  // serialising with toISOString() (always UTC), which silently shifts the
  // result back a day anywhere east of UTC — Bangkok is UTC+7. Fixed at
  // view-cohort-v4.js:519, :1272 and :2682 individually; here there is one
  // implementation so the bug class cannot recur.
  // ─────────────────────────────────────────────────────────────────────────
  const ymd = d => d.toISOString().slice(0, 10);
  const parseDay = ds => new Date(ds + 'T00:00:00Z');
  function addDays(ds, n) { const d = parseDay(ds); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function dateDiff(a, b) {                                   // v4:425 — a − b in whole days
    if (!a || !b) return null;
    const ad = parseDay(a), bd = parseDay(b);
    if (Number.isNaN(ad.getTime()) || Number.isNaN(bd.getTime())) return null;
    return Math.round((ad - bd) / DAY_MS);
  }
  function todayBKK() {                                       // v4:297
    const now = new Date();
    return ymd(new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60000));
  }
  function datesRange(start, end, cap) {                      // v4:1271
    const out = []; let d = parseDay(start); const endD = parseDay(end); let guard = 0;
    const lim = cap || 3650;
    while (d <= endD && guard < lim) { out.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 1); guard++; }
    return out;
  }
  function weekStart(ds) {                                    // v4:2185 — ISO week (Mon)
    const d = parseDay(ds); const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow); return ymd(d);
  }
  function periodKey(ds, period) {                            // v4:2186
    if (period === 'day') return ds;
    if (period === 'week') return weekStart(ds);
    return ds.slice(0, 7) + '-01';
  }
  function periodRange(start, end, period) {                  // v4:2191
    if (period === 'day') return datesRange(start, end);
    const out = []; let guard = 0;
    if (period === 'week') {
      let d = parseDay(weekStart(start)); const endD = parseDay(weekStart(end));
      while (d <= endD && guard < 520) { out.push(ymd(d)); d.setUTCDate(d.getUTCDate() + 7); guard++; }
      return out;
    }
    let d = parseDay(start.slice(0, 7) + '-01'); const endD = parseDay(end.slice(0, 7) + '-01');
    while (d <= endD && guard < 240) { out.push(ymd(d).slice(0, 7) + '-01'); d.setUTCMonth(d.getUTCMonth() + 1); guard++; }
    return out;
  }
  function periodDays(key, period) {                          // total calendar days in the period
    if (period === 'day') return 1;
    if (period === 'week') return 7;
    const d = parseDay(key);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lesson helpers — v4:368, :369, :395, :405
  // ─────────────────────────────────────────────────────────────────────────
  function lessonNum(code) { const m = String(code || '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : null; }
  function phaseOfNum(n) { return n == null ? PHASE_OTHER : (PHASES.find(p => n >= p.lo && n <= p.hi) || PHASE_OTHER); }
  function segmentOfNum(n) { return n == null ? PHASE_OTHER : (SEGMENTS.find(p => n >= p.lo && n <= p.hi) || PHASE_OTHER); }
  function lessonType(code) {                                 // v4:395
    const c = String(code || '').trim();
    if (/\(SIM\)/i.test(c)) return 'Simulator';
    const rest = c.replace(/\(SIM\)/i, '').replace(/\s*\d+\s*$/, '').replace(/^C/i, '').replace(/^M/i, '');
    if (/^SP/i.test(rest)) return 'Solo';
    if (/^S/i.test(rest)) return 'Solo';
    if (/^D/i.test(rest)) return 'Dual';
    return 'Dual';
  }
  function shortName(n) { const p = String(n || '').trim().split(/\s+/); return p.length < 2 ? String(n || '') : p[0] + ' ' + p[p.length - 1][0] + '.'; }
  function flightMins(f) { return f.actual_mins || f.mins || 0; }   // v4:408

  // Stable per-SP hue keyed on identity, not sort position — v4:1103. Sort order
  // shifts whenever relative rank changes (progress, or scrubbing the As-Of
  // slider), which made a student's line colour visibly drift mid-session.
  function studentHue(catcId, ids) {
    const sorted = ids.slice().sort();
    const i = sorted.indexOf(String(catcId));
    return i < 0 ? 0 : Math.round(i * 360 / Math.max(sorted.length, 1));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Curriculum index — built ONCE per model
  // ─────────────────────────────────────────────────────────────────────────
  function buildCurriculum(cur) {
    const lessons = (cur || []).map((c, i) => {
      const num = lessonNum(c.lesson);
      return {
        order: i, lesson: c.lesson, num,
        plannedMins: c.planned_mins || c.mins || 0,
        plannedDate: c.planned_date || null,
        phase: phaseOfNum(num), segment: segmentOfNum(num), type: lessonType(c.lesson),
      };
    });
    const minsByCode = {};                                    // v4:419's lessonsMap, built once
    const byNum = {}, byCode = {};
    lessons.forEach(l => { minsByCode[l.lesson] = l.plannedMins; byCode[l.lesson] = l; if (l.num != null) byNum[l.num] = l; });

    const byNumAsc = lessons.filter(l => l.num != null).slice().sort((a, b) => a.num - b.num);
    // Cumulative planned minutes through lesson N — v4:1784, but prefix-summed
    // instead of re-walking the whole curriculum on every lookup.
    const cumMins = []; let acc = 0;
    byNumAsc.forEach(l => { acc += l.plannedMins; cumMins.push({ num: l.num, mins: acc }); });
    function cumPlannedMinsToLesson(n) {
      let out = 0;
      for (const e of cumMins) { if (e.num > n) break; out = e.mins; }
      return out;
    }

    const datedAsc = lessons.filter(l => l.plannedDate).slice().sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const planEndDate = datedAsc.length ? datedAsc[datedAsc.length - 1].plannedDate : '';
    // Prefix sums over the plan schedule so "planned as of date D" is a binary-ish
    // scan instead of a full filter+reduce per call (v4:421 did the latter, and
    // v4:2544 called it once per student inside a map).
    const planPrefix = []; let pm = 0, pl = 0;
    datedAsc.forEach(l => { pm += l.plannedMins; pl += 1; planPrefix.push({ date: l.plannedDate, mins: pm, lessons: pl }); });
    function planAsOf(date) {
      let out = { mins: 0, lessons: 0 };
      for (const e of planPrefix) { if (e.date > date) break; out = e; }
      return out;
    }

    const totalMins = lessons.reduce((a, l) => a + l.plannedMins, 0);
    return {
      lessons, byNum, byCode, byNumAsc, minsByCode,
      count: lessons.length,
      totalHours: totalMins / 60,                             // v4:420
      planEndDate,
      cumPlannedMinsToLesson,
      plannedHoursAsOf: d => planAsOf(d).mins / 60,            // v4:421
      plannedLessonsAsOf: d => planAsOf(d).lessons,            // v4:660
      planByDate: (() => { const m = {}; datedAsc.forEach(l => { m[l.plannedDate] = (m[l.plannedDate] || 0) + l.plannedMins; }); return m; })(),
      planLessonCountByDate: (() => { const m = {}; datedAsc.forEach(l => { m[l.plannedDate] = (m[l.plannedDate] || 0) + 1; }); return m; })(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Milestones / key points — v4:1341
  // ─────────────────────────────────────────────────────────────────────────
  function keyPoints(curModel) {
    const byNum = curModel.byNumAsc;
    const norm = c => String(c || '').trim();
    const stripNum = c => norm(c).replace(/\s*\d+\s*$/, '');
    const firstMatch = test => { const l = byNum.find(l => test(norm(l.lesson))); return l ? l.num : null; };
    const pts = [];
    const add = (label, num) => { if (num != null) pts.push({ num, idx: num - 1, label }); };
    add('Initial Solo', firstMatch(c => /^CS/i.test(c)));
    add('Instrument', firstMatch(c => /IF|IL/i.test(c)));
    add('Cross-Country', firstMatch(c => /XV|XI/i.test(c)));
    add('Sim', firstMatch(c => /\(SIM\)/i.test(c)));
    add('Multi-Engine', firstMatch(c => /^CM/i.test(c)));
    // Checkrides: `/(?<!X)C$/i`, NOT a bare `/C$/i` — a bare trailing-C test also
    // matches cross-country codes ending "…XC" (e.g. "CDNXC 48"), which are not
    // checks. v4:1132's own note documents this false positive.
    byNum.forEach(l => {
      const s = stripNum(l.lesson);
      if (/(?<!X)C$/i.test(s)) {
        const detail = CHECKRIDE_DETAIL[s.toUpperCase()];
        add('Checkride' + (detail ? ' · ' + detail : ''), l.num);
      }
    });
    return pts;
  }
  function milestoneMeta(label) { return MILESTONE_TYPES.find(t => t.test(label)) || { key: 'other', explain: '' }; }

  // ─────────────────────────────────────────────────────────────────────────
  // Targets — the batch-wide milestone schedule from js/ap127-targets-data.js.
  // Injected so the model stays pure and testable; falls back to the globals.
  // ─────────────────────────────────────────────────────────────────────────
  function buildTargets(list, curModel, nStudents) {
    const sorted = (list || []).slice().filter(t => t && t.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const byLesson = {}; sorted.forEach(t => { byLesson[t.lesson] = t; });
    function lessonForDate(ds) {                              // ap127-targets-data.js's own interpolation
      if (!sorted.length) return null;
      if (ds <= sorted[0].date) return ds === sorted[0].date ? sorted[0].lesson : 0;
      const last = sorted[sorted.length - 1];
      if (ds >= last.date) return last.lesson;
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1], b = sorted[i];
        if (ds <= b.date) {
          const span = dateDiff(b.date, a.date) || 1;
          const gone = dateDiff(ds, a.date) || 0;
          return a.lesson + (b.lesson - a.lesson) * (gone / span);
        }
      }
      return last.lesson;
    }
    function closestTo(ds) {                                  // nearest checkpoint by date, ties earlier
      if (!sorted.length) return null;
      let best = null, bestD = Infinity;
      sorted.forEach(t => { const d = Math.abs(dateDiff(t.date, ds) || 0); if (d < bestD) { bestD = d; best = t; } });
      return best;
    }
    // Batch-aggregate value of a target lesson number, in the requested unit —
    // v4:1785. Lessons: lesson × n. Hours: cumulative planned hours through that
    // lesson × n, built from the curriculum's own per-lesson standard durations,
    // so it sits on the same axis as Actual and Plan.
    const batchValue = (n, unit) => unit === 'hours'
      ? curModel.cumPlannedMinsToLesson(n) * nStudents / 60
      : n * nStudents;
    return { list: sorted, byLesson, lessonForDate, closestTo, batchValue };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Per-student build
  // ─────────────────────────────────────────────────────────────────────────
  function buildStudent(s, curModel, asOf, ids) {
    // As-of clipping — v4:299/:305. A model is always built for one As-Of date,
    // so this is the only place flights are filtered by date.
    const raw = (s.flown || []).filter(f => f.date && f.date <= asOf)
      .slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const seenNum = new Set();
    const flown = raw.map(f => {
      const num = lessonNum(f.lesson);
      const std = curModel.minsByCode[f.lesson];
      // "Effective" minutes: the curriculum's STANDARD duration for that lesson
      // wins; the flight's own logged duration is a fallback used only when the
      // code isn't in the curriculum at all. v4:419, and the badge on the tab.
      const effMins = (std || flightMins(f)) || 0;
      const isRetake = num != null && seenNum.has(num);
      if (num != null) seenNum.add(num);
      return {
        date: f.date, lesson: f.lesson, num,
        phase: phaseOfNum(num), segment: segmentOfNum(num), type: lessonType(f.lesson),
        loggedMins: flightMins(f), effMins, isRetake,
        fromOps: !!f._ops,
      };
    });

    const flownByDate = {}, flownByNum = {};
    flown.forEach(f => {
      (flownByDate[f.date] = flownByDate[f.date] || []).push(f);
      if (f.num != null) (flownByNum[f.num] = flownByNum[f.num] || []).push(f);
    });

    const flightRecords = flown.length;                       // v4's s.done
    const lessonsCompleted = seenNum.size;                    // v4's matrix uniqueDone (:2590)
    const retakes = flightRecords - lessonsCompleted;

    // ── F2 (deliberate divergence from V4) ──────────────────────────────────
    // hoursEffective credits each distinct curriculum lesson ONCE, even if it was
    // flown more than once. V4's ap127Hours() (:419) sums every record, so a
    // retake re-credits a full standard lesson duration — which contradicts the
    // rule already set for Ops Analytics in p143 ("a curriculum lesson's
    // effective hours count once per SP, no matter how many bookings reference
    // it") and made this tab disagree with that one about the same batch.
    // hoursLogged keeps V4's exact all-records sum so no training time is hidden;
    // it is shown in the SP drawer and reconciled against hoursEffective there.
    const hoursEffective = flown.reduce((a, f) => a + (f.isRetake ? 0 : f.effMins), 0) / 60;
    const hoursLogged = flown.reduce((a, f) => a + f.effMins, 0) / 60;   // === v4 ap127Hours()

    const total = s.total || curModel.count || 0;
    // ── F1 (deliberate divergence from V4) ──────────────────────────────────
    // Progress is measured in distinct lessons completed, not flight records.
    // V4's headline used the record count while its own Lesson Matrix (:2590) and
    // Phase Funnel (:2504) both deduplicated — so the same page reported two
    // different "lessons done" for the same batch.
    const pct = total ? +(lessonsCompleted / total * 100).toFixed(1) : 0;

    // Next lesson = first curriculum lesson with no completed record. V4 already
    // computed this from the deduplicated set (:309/:2872), which is why its
    // `done` count and its `next_lesson` could disagree.
    const nextLesson = curModel.lessons.find(l => !(l.num != null && flownByNum[l.num]));
    const lastFlight = flown.length ? flown[flown.length - 1] : null;
    const lastDate = lastFlight ? lastFlight.date : '';
    const firstDate = flown.length ? flown[0].date : '';

    const idleDays = lastDate ? Math.max(0, dateDiff(asOf, lastDate) || 0) : null;   // v4:424 (null, not 9999)
    // DAY delta = asOf − planned date of the last completed lesson. v4:426.
    const lastPlanDate = lastFlight && lastFlight.num != null && curModel.byNum[lastFlight.num]
      ? curModel.byNum[lastFlight.num].plannedDate : null;
    const dayDelta = lastPlanDate ? dateDiff(asOf, lastPlanDate) : null;

    const plannedHrs = curModel.plannedHoursAsOf(asOf);
    const plannedLes = curModel.plannedLessonsAsOf(asOf);
    const hrsDelta = hoursEffective - plannedHrs;              // v4:757
    const lesDelta = lessonsCompleted - plannedLes;

    return {
      ref: s,
      catc_id: s.catc_id, name: s.name, shortName: shortName(s.name),
      nick: s.nick || '', se: s.se || '', fi: s.fi || '', fiFull: FI_FULL[s.fi] || s.fi || '',
      batch: s.batch || '',
      flown, flownByDate, flownByNum, lessonNums: seenNum,
      firstDate, lastDate, lastFlight,
      flightRecords, lessonsCompleted, retakes,
      hoursEffective, hoursLogged,
      total, remaining: Math.max(0, total - lessonsCompleted), pct,
      nextLesson: nextLesson ? nextLesson.lesson : 'COMPLETE',
      nextNum: nextLesson ? nextLesson.num : null,
      idleDays, dayDelta, hrsDelta, lesDelta,
      planned: s.planned || [],
      hue: studentHue(s.catc_id, ids),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Batch aggregates, required/actual pace, series, phases, distribution
  // ─────────────────────────────────────────────────────────────────────────
  function buildPace(sps, curModel, asOf) {
    // Required pace — v4:481. Single source of truth for reqDay/Week/Month, used
    // by both the Pace panel and the Daily Output target overlay so the two can
    // never drift apart.
    const n = sps.length;
    if (!n) return null;
    const currHrs = curModel.totalHours;
    const currLes = curModel.count || (sps[0] ? sps[0].total : 0);
    const totalHrsDone = sps.reduce((a, s) => a + s.hoursEffective, 0);
    const totalLesDone = sps.reduce((a, s) => a + s.lessonsCompleted, 0);
    const remHrsB = Math.max((currHrs * n) - totalHrsDone, 0);
    const remLesB = Math.max((currLes * n) - totalLesDone, 0);
    const planEndDate = curModel.planEndDate;
    const rawDaysRem = planEndDate ? dateDiff(planEndDate, asOf) : null;
    const overdue = rawDaysRem !== null && rawDaysRem < 0;
    const daysOverdue = overdue ? Math.abs(rawDaysRem) : 0;
    const daysRem = rawDaysRem === null ? null : Math.max(rawDaysRem, 0);
    const base = { n, remHrsB, remLesB, daysRem, planEndDate, overdue, daysOverdue };
    if (daysRem === null || daysRem <= 0) {
      return Object.assign(base, { reqDayHrsB: null, reqDayLesB: null, reqWeekHrsB: null, reqWeekLesB: null, reqMonthHrsB: null, reqMonthLesB: null });
    }
    const reqDayHrsB = remHrsB / daysRem, reqDayLesB = remLesB / daysRem;
    return Object.assign(base, {
      reqDayHrsB, reqDayLesB,
      reqWeekHrsB: reqDayHrsB * 7, reqWeekLesB: reqDayLesB * 7,
      reqMonthHrsB: reqDayHrsB * 30.44, reqMonthLesB: reqDayLesB * 30.44,   // avg Gregorian month
    });
  }

  function buildActualPace(sps, asOf) {
    // v4:508 — the same period-matched rolling windows the Pace panel uses:
    // Day = trailing 7d ÷ 7, Week = trailing 14d ÷ 2, Month = trailing 30d.
    // Wider window for the coarser period = steadier signal.
    if (!sps.length) return null;
    const over = days => {
      const start = addDays(asOf, -days);
      let hrs = 0, les = 0;
      sps.forEach(s => s.flown.forEach(f => {
        if (f.date >= start && f.date <= asOf) { les++; hrs += f.effMins / 60; }
      }));
      return { hrs, les };
    };
    const w7 = over(7), w14 = over(14), w30 = over(30);
    return {
      actDayHrsB: w7.hrs / 7, actDayLesB: w7.les / 7,
      actWeekHrsB: w14.hrs / 2, actWeekLesB: w14.les / 2,
      actMonthHrsB: w30.hrs, actMonthLesB: w30.les,
    };
  }

  function buildSeries(sps, curModel, asOf, targets) {
    // Cumulative Actual / Plan / Target / lag, in BOTH units, in one pass over
    // the flight list. V4 rebuilt near-identical series independently in four
    // chart builders (:1706, :1862, :1945, :1123) — the direct cause of its
    // "same flights, different totals" bug class.
    const n = sps.length;
    const actH = {}, actL = {};
    sps.forEach(s => s.flown.forEach(f => {
      actH[f.date] = (actH[f.date] || 0) + f.effMins / 60;
      actL[f.date] = (actL[f.date] || 0) + 1;
      // NOTE: the Actual line intentionally counts every record (activity over
      // time). Retake credit only affects the *totals* compared against plan.
    }));
    const planH = {}, planL = {};
    Object.keys(curModel.planByDate).forEach(d => { planH[d] = curModel.planByDate[d] * n / 60; });
    Object.keys(curModel.planLessonCountByDate).forEach(d => { planL[d] = curModel.planLessonCountByDate[d] * n; });

    const allDates = [...new Set([...Object.keys(actH), ...Object.keys(planH)])].sort();
    const upto = allDates.filter(d => d <= asOf);

    const mk = (aMap, pMap) => {
      let ra = 0, rp = 0;
      const actual = [], plan = [], lag = [];
      upto.forEach(d => {
        ra += (aMap[d] || 0); rp += (pMap[d] || 0);
        actual.push({ x: d, y: +ra.toFixed(2) });
        plan.push({ x: d, y: +rp.toFixed(2) });
        // Lag-only, floored at zero — v4:1896. The batch is realistically always
        // behind, so a signed line spent its life in negative territory.
        lag.push({ x: d, y: Math.max(0, +(rp - ra).toFixed(2)) });
      });
      // Plan drawn to the curriculum's FULL finish date, not clipped to asOf —
      // "Plane [sic Plan] should show up to the finish date not current date"
      // (round 3 feedback). Actual/lag stay clipped to asOf since there's no
      // real data past today; the reference schedule itself isn't time-travel-
      // dependent, so it can run all the way to planEndDate regardless.
      let rpFull = 0;
      const planFull = Object.keys(pMap).sort().map(d => { rpFull += pMap[d] || 0; return { x: d, y: +rpFull.toFixed(2) }; });
      return { actual, plan, planFull, lag, dates: upto };
    };
    const hours = mk(actH, planH), lessons = mk(actL, planL);

    const targetSeries = unit => targets.list.map(t => ({ x: t.date, y: +targets.batchValue(t.lesson, unit).toFixed(2) }));
    return {
      actualByDate: { hours: actH, lessons: actL },
      hours, lessons,
      target: { hours: targetSeries('hours'), lessons: targetSeries('lessons') },
      allPlanDates: Object.keys(planH).sort(),
    };
  }

  function buildPhaseFunnel(sps, curModel) {
    // v4:2489, with the p151 per-(student, lesson number) dedup so a retaken
    // lesson can't push a phase's Done segment past its own slot total.
    const n = sps.length;
    return PHASES.map(p => {
      const lessonsInPhase = curModel.lessons.filter(l => l.num != null && l.num >= p.lo && l.num <= p.hi);
      const slots = lessonsInPhase.length * n;
      let done = 0;
      sps.forEach(s => { s.lessonNums.forEach(num => { if (num >= p.lo && num <= p.hi) done++; }); });
      return { phase: p, lessons: lessonsInPhase.length, slots, done, remaining: Math.max(0, slots - done), pct: slots ? done / slots : 0 };
    });
  }

  function buildDistribution(sps) {
    // v4:2069 — histogram of lessons completed, with the fixed continuous-range
    // bin match (a fractional mean fell through every `<=hi` test and silently
    // landed in the last bin) plus the within-bin fraction for exact placement.
    if (!sps.length) return null;
    const vals = sps.map(s => s.lessonsCompleted);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = Math.max(max - min, 1);
    const binCount = Math.min(9, Math.max(4, new Set(vals).size));
    const binW = Math.max(1, Math.ceil(span / binCount));
    const bins = [];
    for (let lo = min; lo <= max; lo += binW) bins.push({ lo, hi: Math.min(lo + binW - 1, max), students: [] });
    if (!bins.length) bins.push({ lo: min, hi: max, students: [] });
    sps.forEach(s => {
      const d = s.lessonsCompleted;
      let b = bins.find(bb => d >= bb.lo && d <= bb.hi);
      if (!b) b = bins[bins.length - 1];
      b.students.push(s);
    });
    const counts = bins.map(b => b.students.length);
    const curve = counts.map((v, i) => {
      const prev = counts[i - 1] == null ? v : counts[i - 1];
      const next = counts[i + 1] == null ? v : counts[i + 1];
      return +((prev + v * 2 + next) / 4).toFixed(2);
    });
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
    let avgBinIdx = bins.findIndex(b => avg >= b.lo && avg < b.hi + 1);
    if (avgBinIdx < 0) avgBinIdx = avg < bins[0].lo ? 0 : bins.length - 1;
    const ab = bins[avgBinIdx];
    const avgFrac = Math.min(1, Math.max(0, (avg - ab.lo) / Math.max(1, (ab.hi - ab.lo + 1))));
    const sortedVals = vals.slice().sort((a, b) => a - b);
    const q = p => sortedVals[Math.min(sortedVals.length - 1, Math.max(0, Math.round((sortedVals.length - 1) * p)))];
    return { bins, counts, curve, avg, avgBinIdx, avgFrac, min, max, median: q(0.5), q1: q(0.25), q3: q(0.75) };
  }

  function buildEtc(sps, curModel, asOf, batchStart) {
    // Per-SP estimated completion date — v4:560. A never-flown SP has no
    // measurable pace, so it gets an explicit `never` flag rather than V4's
    // 9999-12-31 sentinel, whose ~2.9-million-day "delay" could swamp the
    // at-risk average the moment any one SP sat at zero hours.
    const daysFromStart = Math.max(dateDiff(asOf, batchStart) || 1, 1);
    const planEnd = curModel.planEndDate;
    const currHrs = curModel.totalHours;
    let onTime = 0, atRisk = 0, neverStarted = 0;
    const delays = [];
    sps.forEach(s => {
      const rem = Math.max(currHrs - s.hoursEffective, 0);
      const pace = s.hoursEffective / daysFromStart;
      let etc = null, never = false;
      if (rem <= 0) etc = asOf;
      else if (pace > 0) etc = ymd(new Date(parseDay(asOf).getTime() + (rem / pace) * DAY_MS));
      else never = true;
      const risk = never || (planEnd && etc && etc > planEnd);
      if (risk) { atRisk++; if (never) neverStarted++; else delays.push(dateDiff(etc, planEnd)); }
      else onTime++;
      s.etcDate = etc; s.etcNever = never; s.atRisk = !!risk;
    });
    const avgDelay = delays.length ? Math.round(delays.reduce((a, v) => a + v, 0) / delays.length) : 0;
    return { onTime, atRisk, neverStarted, avgDelay, delays };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Daily Output — period accumulation, moving average, open-period projection
  // ─────────────────────────────────────────────────────────────────────────
  function buildOutput(model, o) {
    // v4:2218. `unit`: hours|lessons · `period`: day|week|month ·
    // `showAll`: include zero-flight periods · `start`/`end`: optional clamp.
    const opts = o || {};
    const unit = opts.unit || 'hours', period = opts.period || 'day';
    const showAll = opts.showAll !== false;
    const asOf = model.asOf;
    const start = opts.start || model.batchStart;
    const end = (opts.end && opts.end < asOf) ? opts.end : asOf;

    const byPeriod = {}, byType = {};
    model.students.forEach(s => s.flown.forEach(f => {
      if (f.date < start || f.date > end) return;
      const k = periodKey(f.date, period);
      const v = unit === 'hours' ? f.effMins / 60 : 1;
      byPeriod[k] = (byPeriod[k] || 0) + v;
      const t = byType[k] || (byType[k] = { Dual: 0, Solo: 0, Simulator: 0 });
      t[f.type] += v;
    }));

    let keys = showAll ? periodRange(start, end, period) : Object.keys(byPeriod).sort();
    if (!keys.length) keys = Object.keys(byPeriod).sort();
    const values = keys.map(k => +(byPeriod[k] || 0).toFixed(2));
    const stacks = keys.map(k => byType[k] || { Dual: 0, Solo: 0, Simulator: 0 });

    // Moving average — 7d / 4wk / 3mo, matching the window the period implies.
    const win = period === 'day' ? 7 : period === 'week' ? 4 : 3;
    const ma = values.map((_, i) => {
      const from = Math.max(0, i - win + 1);
      const slice = values.slice(from, i + 1);
      return +(slice.reduce((a, v) => a + v, 0) / slice.length).toFixed(2);
    });

    // Which bar is the still-forming current period, and which is therefore the
    // latest CLOSED one to compare against target — v4:2 (p147). Resolved on the
    // true calendar-adjacent period first, then looked up in the (possibly
    // filtered) key list; if that period was filtered out, no gap is reported
    // rather than silently comparing against a weeks-old period.
    const openKey = periodKey(asOf, period);
    const openIdx = keys.indexOf(openKey);
    const latestIsOpen = openIdx >= 0 && end >= asOf;
    let gapKey = openKey;
    if (latestIsOpen) {
      const prevDay = period === 'day' ? addDays(openKey, -1)
        : period === 'week' ? addDays(openKey, -7)
        : ymd(new Date(Date.UTC(parseDay(openKey).getUTCFullYear(), parseDay(openKey).getUTCMonth() - 1, 1)));
      gapKey = periodKey(prevDay, period);
    }
    const gapIdx = keys.indexOf(gapKey);

    // Linear projection for the in-progress period. Day view returns the actual
    // unchanged — a day is this chart's finest grain, so there is nothing to
    // extrapolate from and inventing a number would be dishonest. v4:2210.
    let projected = null;
    if (latestIsOpen && period !== 'day') {
      const elapsed = Math.max(1, (dateDiff(asOf, openKey) || 0) + 1);
      const total = periodDays(openKey, period);
      const frac = Math.min(1, elapsed / total);
      const actual = values[openIdx] || 0;
      projected = { idx: openIdx, total: +(frac > 0 ? actual / frac : actual).toFixed(2), actual, frac };
    }

    const totals = { all: 0, Dual: 0, Solo: 0, Simulator: 0 };
    stacks.forEach(s => { totals.Dual += s.Dual; totals.Solo += s.Solo; totals.Simulator += s.Simulator; });
    totals.all = totals.Dual + totals.Solo + totals.Simulator;

    return { unit, period, keys, values, stacks, ma, openIdx, latestIsOpen, gapIdx, projected, totals, start, end, periodCount: keys.length };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Streaks, activity grid, watchlist
  // ─────────────────────────────────────────────────────────────────────────
  function buildStreaks(model) {
    // v4:1277. Every SP's streak is walked from the BATCH's earliest flown date,
    // not their own start — a late-starting SP therefore reads as idle for every
    // day before they personally began. Surfaced in the panel note rather than
    // silently misread as the whole batch stalling.
    const days = datesRange(model.batchStart, model.asOf);
    const perSP = model.students.map(s => {
      let streak = 0;
      return {
        sp: s,
        series: days.map(d => {
          streak = s.flownByDate[d] ? (streak > 0 ? streak + 1 : 1) : (streak < 0 ? streak - 1 : -1);
          return { x: d, y: streak };
        }),
      };
    });
    const avg = days.map((d, i) => ({
      x: d,
      y: perSP.length ? +(perSP.reduce((a, p) => a + p.series[i].y, 0) / perSP.length).toFixed(2) : 0,
    }));
    return { days, perSP, avg };
  }

  function buildWatchlist(model, o) {
    // v4:2542 — idle ≥5d OR ≥3h behind plan, worst first. `plannedHoursAsOf` is
    // read once here instead of once per student (V4 re-ran the whole curriculum
    // filter+reduce inside the map).
    const opts = o || {};
    const idleMin = opts.idleMin == null ? 5 : opts.idleMin;
    const hrsMax = opts.hrsMax == null ? -3 : opts.hrsMax;
    return model.students
      .map(s => ({ sp: s, idle: s.idleDays, neverFlown: s.idleDays === null, hrsDelta: s.hrsDelta }))
      .filter(x => x.neverFlown || x.idle >= idleMin || x.hrsDelta <= hrsMax)
      .sort((a, b) => (b.neverFlown - a.neverFlown) || ((b.idle || 0) - (a.idle || 0)) || (a.hrsDelta - b.hrsDelta))
      .slice(0, opts.limit || 12);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sorting — v4:429. Exposed as a comparator factory so the roster table never
  // reaches into the DOM for its sort key the way V4 does (:430).
  // ─────────────────────────────────────────────────────────────────────────
  const SORTS = {
    behind:      (a, b) => (a.lessonsCompleted - b.lessonsCompleted) || ((b.idleDays || 0) - (a.idleDays || 0)),
    ahead:       (a, b) => (b.lessonsCompleted - a.lessonsCompleted) || ((a.idleDays || 0) - (b.idleDays || 0)),
    donelessons: (a, b) => (b.lessonsCompleted - a.lessonsCompleted) || ((a.idleDays || 0) - (b.idleDays || 0)),
    hours:       (a, b) => (b.hoursEffective - a.hoursEffective) || (b.lessonsCompleted - a.lessonsCompleted),
    name:        (a, b) => a.name.localeCompare(b.name),
    nick:        (a, b) => String(a.nick).localeCompare(String(b.nick)),
    se:          (a, b) => String(a.se).localeCompare(String(b.se)) || (b.lessonsCompleted - a.lessonsCompleted),
    fi:          (a, b) => String(a.fiFull).localeCompare(String(b.fiFull)) || (b.lessonsCompleted - a.lessonsCompleted),
    lastLesson:  (a, b) => String((a.lastFlight && a.lastFlight.lesson) || a.nextLesson).localeCompare(String((b.lastFlight && b.lastFlight.lesson) || b.nextLesson)),
    lastFlt:     (a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || '')),
    idle:        (a, b) => (b.idleDays == null ? Infinity : b.idleDays) - (a.idleDays == null ? Infinity : a.idleDays),
    dayDelta:    (a, b) => (b.dayDelta == null ? -Infinity : b.dayDelta) - (a.dayDelta == null ? -Infinity : a.dayDelta),
    hrsDelta:    (a, b) => a.hrsDelta - b.hrsDelta,
    vsTarget:    (a, b) => (a.vsTarget == null ? Infinity : a.vsTarget) - (b.vsTarget == null ? Infinity : b.vsTarget),
  };
  const SORT_LABELS = {
    behind: 'Most behind first', ahead: 'Most ahead first', hours: 'Most hours first', name: 'Name A-Z',
    nick: 'Call sign', se: 'SE type', fi: 'Instructor', lastLesson: 'Last lesson', lastFlt: 'Last flight',
    idle: 'Idle days', dayDelta: 'Day delta', hrsDelta: 'Hours delta', donelessons: 'Lessons done', vsTarget: 'vs Target',
  };
  function sortStudents(sps, key) {
    const cmp = SORTS[key] || SORTS.behind;
    return sps.slice().sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buildModel — the entry point. Memoised on identity + as-of.
  // ─────────────────────────────────────────────────────────────────────────
  let _cache = null;
  function buildModel(students, curriculum, o) {
    const opts = o || {};
    const asOf = opts.asOf || todayBKK();
    const targetsList = opts.targets || (typeof window !== 'undefined' && window.ap127GetMilestoneTargets ? window.ap127GetMilestoneTargets() : []);
    if (_cache && _cache.studentsRef === students && _cache.curriculumRef === curriculum
        && _cache.asOf === asOf && _cache.targetsRef === targetsList && !opts.force) {
      return _cache.model;
    }

    const curModel = buildCurriculum(curriculum);
    const ids = (students || []).map(s => String(s.catc_id));
    const sps = (students || []).map(s => buildStudent(s, curModel, asOf, ids));

    const allFlownDates = sps.flatMap(s => s.flown.map(f => f.date)).sort();
    const batchStart = allFlownDates[0] || asOf;
    const maxFlownDate = allFlownDates.length ? allFlownDates[allFlownDates.length - 1] : '';

    const targets = buildTargets(targetsList, curModel, sps.length);
    const targetLessonToday = targets.list.length ? targets.lessonForDate(asOf) : null;
    const closestTarget = targets.closestTo(asOf);
    sps.forEach(s => { s.vsTarget = closestTarget ? s.lessonsCompleted - closestTarget.lesson : null; });

    const n = sps.length;
    const lessonsDone = sps.reduce((a, s) => a + s.lessonsCompleted, 0);
    const recordsDone = sps.reduce((a, s) => a + s.flightRecords, 0);
    const hoursDone = sps.reduce((a, s) => a + s.hoursEffective, 0);
    const hoursLogged = sps.reduce((a, s) => a + s.hoursLogged, 0);
    const retakes = sps.reduce((a, s) => a + s.retakes, 0);
    const retakeStudents = sps.filter(s => s.retakes > 0).length;

    const plannedHrsPerSP = curModel.plannedHoursAsOf(asOf);
    const plannedLesPerSP = curModel.plannedLessonsAsOf(asOf);
    const batch = {
      n,
      lessonsDone, recordsDone, retakes, retakeStudents,
      hoursDone, hoursLogged,
      lessonSlots: n * curModel.count,
      hourSlots: n * curModel.totalHours,
      progressPct: (n && curModel.count) ? lessonsDone / (n * curModel.count) * 100 : 0,
      plannedHoursToday: plannedHrsPerSP * n,
      plannedLessonsToday: plannedLesPerSP * n,
      hoursDelta: hoursDone - plannedHrsPerSP * n,
      lessonsDelta: lessonsDone - plannedLesPerSP * n,
      avgLessons: n ? lessonsDone / n : 0,
      avgHours: n ? hoursDone / n : 0,
      targetLessonToday,
      closestTarget,
      vsTargetToday: targetLessonToday == null ? null : {
        hours: hoursDone - targets.batchValue(targetLessonToday, 'hours'),
        lessons: lessonsDone - targets.batchValue(targetLessonToday, 'lessons'),
        behindCount: sps.filter(s => s.lessonsCompleted < targetLessonToday).length,
      },
    };

    const pace = buildPace(sps, curModel, asOf);
    const actualPace = buildActualPace(sps, asOf);
    const etc = buildEtc(sps, curModel, asOf, batchStart);
    const series = buildSeries(sps, curModel, asOf, targets);
    const phases = buildPhaseFunnel(sps, curModel);
    const distribution = buildDistribution(sps);

    const model = {
      asOf, isLive: !opts.asOf, todayBKK: todayBKK(),
      batchStart, maxFlownDate,
      updatedAt: opts.updatedAt || null,
      curriculum: curModel,
      students: sps,
      byId: Object.fromEntries(sps.map(s => [String(s.catc_id), s])),
      batch, pace, actualPace, etc, series, phases, distribution, targets,
      keyPoints: keyPoints(curModel),
      phasesDef: PHASES, segmentsDef: SEGMENTS, typeColors: TYPE_COLORS,
      // lazily-derived views
      output: o2 => buildOutput(model, o2),
      streaks: () => buildStreaks(model),
      watchlist: o2 => buildWatchlist(model, o2),
      sort: key => sortStudents(sps, key),
    };

    _cache = { studentsRef: students, curriculumRef: curriculum, asOf, targetsRef: targetsList, model };
    return model;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Self-check invariants. Rendered on the page and printed in the report so
  // the numbers can be audited without reading code.
  // ─────────────────────────────────────────────────────────────────────────
  function selfCheck(model) {
    const out = [];
    const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.01 : tol);
    const add = (id, label, pass, detail) => out.push({ id, label, pass: !!pass, detail });

    const sumH = model.students.reduce((a, s) => a + s.hoursEffective, 0);
    add('sum-hours', 'Σ per-SP effective hours = batch hours',
      near(sumH, model.batch.hoursDone), sumH.toFixed(2) + ' vs ' + model.batch.hoursDone.toFixed(2));

    const sumL = model.students.reduce((a, s) => a + s.lessonsCompleted, 0);
    add('sum-lessons', 'Σ per-SP lessons completed = batch lessons',
      sumL === model.batch.lessonsDone, sumL + ' vs ' + model.batch.lessonsDone);

    add('retakes', 'flight records − lessons completed = retakes',
      model.batch.recordsDone - model.batch.lessonsDone === model.batch.retakes,
      model.batch.recordsDone + ' − ' + model.batch.lessonsDone + ' = ' + model.batch.retakes);

    const badPhase = model.phases.filter(p => p.done + p.remaining !== p.slots || p.done > p.slots);
    add('phase-slots', 'every phase: done + remaining = slots, done ≤ slots',
      badPhase.length === 0, badPhase.length ? badPhase.map(p => p.phase.label).join(', ') : model.phases.map(p => Math.round(p.pct * 100) + '%').join(' · '));

    const overCur = model.students.filter(s => s.lessonsCompleted > model.curriculum.count);
    add('cur-cap', 'no SP has more lessons completed than the curriculum has',
      overCur.length === 0, overCur.length ? overCur.map(s => s.shortName).join(', ') : model.curriculum.count + ' lessons');

    const lastLag = model.series.hours.lag.length ? model.series.hours.lag[model.series.hours.lag.length - 1].y : 0;
    const expectLag = Math.max(0, -model.batch.hoursDelta);
    add('lag-kpi', 'final lag value = −(hours Δ), floored at 0',
      near(lastLag, expectLag, 0.5), lastLag.toFixed(1) + 'h vs ' + expectLag.toFixed(1) + 'h');

    const noPhase = [];
    model.students.forEach(s => s.flown.forEach(f => { if (f.phase === PHASE_OTHER) noPhase.push(f.lesson); }));
    add('phase-map', 'every flown lesson code resolves to a syllabus phase',
      noPhase.length === 0, noPhase.length ? [...new Set(noPhase)].join(', ') : 'all codes mapped');

    const notInCur = [];
    model.students.forEach(s => s.flown.forEach(f => { if (!(f.lesson in model.curriculum.minsByCode)) notInCur.push(f.lesson); }));
    add('cur-map', 'every flown lesson code exists in the curriculum',
      notInCur.length === 0, notInCur.length ? [...new Set(notInCur)].join(', ') : 'all codes found');

    let mono = true;
    for (let i = 1; i < model.targets.list.length; i++) if (model.targets.list[i].lesson < model.targets.list[i - 1].lesson) mono = false;
    add('target-mono', 'target schedule is monotonic in lesson number',
      mono, model.targets.list.length + ' checkpoints');

    const etcTotal = model.etc.onTime + model.etc.atRisk;
    add('etc-total', 'on-track + at-risk = student count',
      etcTotal === model.batch.n, etcTotal + ' vs ' + model.batch.n);

    const dedupeOk = model.students.every(s => s.hoursEffective <= s.hoursLogged + 0.001);
    add('eff-vs-logged', 'effective hours ≤ logged hours for every SP',
      dedupeOk, model.batch.hoursDone.toFixed(1) + 'h eff vs ' + model.batch.hoursLogged.toFixed(1) + 'h logged');

    return { pass: out.every(r => r.pass), checks: out };
  }

  return {
    buildModel, selfCheck, buildOutput, buildStreaks, buildWatchlist, sortStudents,
    keyPoints, milestoneMeta,
    PHASES, SEGMENTS, PHASE_OTHER, TYPE_COLORS, CHECKRIDE_DETAIL, MILESTONE_TYPES, FI_FULL, SORTS, SORT_LABELS,
    util: { ymd, parseDay, addDays, dateDiff, todayBKK, datesRange, weekStart, periodKey, periodRange, periodDays, lessonNum, phaseOfNum, segmentOfNum, lessonType, shortName, flightMins, studentHue },
  };
}));
