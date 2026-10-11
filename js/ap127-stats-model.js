/* ============================================================================
 * AP127 Batch Stats — METRICS ENGINE
 *
 * Pure functions behind the "Batch Stats" tab (js/view-stats.js). No DOM, no
 * globals mutated; runs unmodified under Node (module.exports at the bottom) so
 * every number can be checked against the live feeds without a browser.
 *
 * Sources (all fetched live on every page load, so the tab refreshes itself):
 *   - flights[]   ops feed after shared.js normalisation (window.FLIGHTS) —
 *                 sorties, BLOCK time (durMin), time of day, cancels
 *   - leaves[]    window.AP127Leave.records() — already de-duplicated, names
 *                 normalised; the form-key ids carry the RECORD timestamp
 *   - log[]       watchdog /log events (ADDED/CHANGED/STATUS/REMOVED) — the
 *                 only history of schedule changes and removals (from 30 Jun 2026)
 *   - progress    AP127V5Model.buildModel() — lessons completed per SP, the same
 *                 numbers the V5/V6 tabs show
 *
 * Hours are block time (durMin) everywhere — never airborne.
 * Namespace: AP127Stats.
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AP127Stats = api;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  // ── Date helpers (UTC arithmetic on YYYY-MM-DD strings) ─────────────────
  const D = s => new Date(s + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const addD = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const diffD = (a, b) => Math.round((D(b) - D(a)) / 864e5);          // b − a
  const dow = s => D(s).getUTCDay();                                   // 0 = Sun
  const weekStart = s => addD(s, -((dow(s) + 6) % 7));                 // Monday
  const bucketOf = (s, g) => g === 'month' ? s.slice(0, 7) : g === 'week' ? weekStart(s) : s;
  const buckets = (a, b, g) => {
    const out = [];
    if (!a || !b || a > b) return out;
    let s = g === 'month' ? a.slice(0, 7) + '-01' : g === 'week' ? weekStart(a) : a;
    while (s <= b) {
      out.push(bucketOf(s, g));
      if (g === 'month') { const d = D(s); d.setUTCMonth(d.getUTCMonth() + 1); s = iso(d); }
      else s = addD(s, g === 'week' ? 7 : 1);
    }
    return out;
  };
  const hm = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  // Watchdog timestamps are UTC ISO; the ops day is Bangkok (UTC+7, no DST).
  const bkkDate = ts => iso(new Date(Date.parse(ts) + 7 * 3600e3));

  // ── Definitions (shown on the page so every number is explainable) ──────
  const EARLY_BEFORE = 7 * 60;      // scheduled start before 07:00
  const LATE_AFTER = 18 * 60;       // scheduled end after 18:00 (sunset at VTPH ≈ 18:10–18:40)
  const DEF = {
    early: 'Scheduled start before 07:00',
    late: 'Scheduled end after 18:00 (after sunset)',
    weekend: 'Saturday or Sunday',
    holiday: 'Thai public holiday / academy non-flying day',
    double: 'A day on which the SP completed 2 or more sorties (aircraft or SIM)',
    extra: 'Weekend/holiday sorties + early sorties + late sorties + every sortie beyond the first on a multi-sortie day',
    cancelRate: 'Cancelled ÷ (completed + cancelled) bookings',
    lead: 'Leave start date − the date the leave was recorded in the portal',
  };

  // ── Cancellation reason → category ──────────────────────────────────────
  const CANCEL_CATS = [
    { k: 'wx',    label: 'Weather',      re: /weather|\bwx\b/i },
    { k: 'ac',    label: 'Aircraft',     re: /aircraft|technical|maint|a\/c/i },
    { k: 'sp',    label: 'Student',      re: /student/i },
    { k: 'fi',    label: 'Instructor',   re: /instructor/i },
    { k: 'ops',   label: 'Ops / schedule', re: /operational|schedul|atc|airport|runway/i },
    { k: 'other', label: 'Other',        re: /.*/ },
  ];
  const cancelCat = (reason, remarks) => {
    const r = String(reason || '');
    const hit = CANCEL_CATS.find(c => c.k !== 'other' && c.re.test(r));
    if (hit) return hit.k;
    // "Other" often carries the real cause in the free-text remark.
    const rm = String(remarks || '');
    const hit2 = CANCEL_CATS.find(c => c.k !== 'other' && c.re.test(rm));
    return hit2 ? hit2.k : 'other';
  };

  const CHANGE_CATS = [
    { k: 'time',  label: 'Time / date moved' },
    { k: 'ac',    label: 'Aircraft swapped' },
    { k: 'fi',    label: 'Instructor swapped' },
    { k: 'lesson', label: 'Lesson changed' },
  ];

  const LEAD_BUCKETS = [
    { k: 'retro', label: 'After start', test: d => d < 0 },
    { k: 'same',  label: 'Same day',         test: d => d === 0 },
    { k: 'd1',    label: '1–2 d',   test: d => d >= 1 && d <= 2 },
    { k: 'd3',    label: '3–7 d',   test: d => d >= 3 && d <= 7 },
    { k: 'd8',    label: '8–30 d',  test: d => d >= 8 && d <= 30 },
    { k: 'd31',   label: '> 30 d',  test: d => d > 30 },
  ];

  // "Akaravit Khwanngam" / "AKARAVIT KHWANNGAM" → "AKARAVIT K." (the ops feed's form).
  const nameKey = n => {
    const s = String(n || '').replace(/\s*\(unplanned\)\s*$/i, '').trim();
    if (!s) return '';
    if (/\.$/.test(s)) return s.toUpperCase().replace(/\s+/g, ' ');
    const p = s.split(/\s+/);
    return p.length < 2 ? p[0].toUpperCase() : (p[0] + ' ' + p[1][0]).toUpperCase() + '.';
  };

  // Form-key leave ids embed the submission time: "Leave Record|key|02/05/2026 15:49:13".
  const recordDateOf = ids => {
    let best = null;
    (ids || []).forEach(id => {
      const m = /\|key\|(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(id || '');
      if (!m) return;
      const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      if (!best || d < best) best = d;
    });
    return best;
  };

  // ════════════════════════════════════════════════════════════════════════
  // build() — normalise every source once. summarize() then slices by range.
  // ════════════════════════════════════════════════════════════════════════
  function build(input) {
    const o = input || {};
    const today = o.today || iso(new Date());
    const holidays = o.holidays || new Set();
    const aliases = o.aliases || {};
    const canon = n => {
      const raw = String(n || '').replace(/\s*\(unplanned\)\s*$/i, '').trim();
      const a = aliases[raw.toUpperCase()];
      return a || nameKey(raw);
    };

    // Roster: [{ key, name, nick, fi, se }]
    const roster = (o.roster || []).map(r => Object.assign({}, r, { key: r.key || nameKey(r.name) }));
    const byKey = new Map(roster.map(r => [r.key, r]));
    const isSP = k => byKey.has(k);
    const dayType = d => holidays.has(d) ? 'holiday' : (dow(d) === 0 || dow(d) === 6) ? 'weekend' : 'weekday';

    // ── Sorties & cancels ───────────────────────────────────────────────────
    const sorties = [], cancels = [];
    const presentKeys = new Set();          // student|date|lesson of every row in the feed
    const presentIds = new Set();
    (o.flights || []).forEach(f => {
      const k = canon(f.student);
      if (f.id) presentIds.add(f.id);
      if (!isSP(k) || !f.date) return;
      presentKeys.add(k + '|' + f.date + '|' + String(f.lesson || '').trim().toUpperCase());
      if (f.status === 'Completed' && !f.isNonFlight) {
        const s = hm(f.start), e = hm(f.end);
        sorties.push({
          id: f.id, sp: k, date: f.date, lesson: f.lesson || '', isSim: !!f.isSim,
          mins: +f.durMin || 0, start: f.start || '', end: f.end || '', startMin: s, endMin: e,
          dayType: dayType(f.date),
          early: s != null && s < EARLY_BEFORE,
          late: e != null && e > LATE_AFTER,
          tail: f.tail || '', fi: f.instructor || '', solo: /solo|spic/i.test(f.cond || ''),
        });
      } else if (f.status === 'Canceled') {
        cancels.push({
          id: f.id, sp: k, date: f.date, lesson: f.lesson || '', isSim: !!f.isSim,
          reason: f.cancelReason || '(no reason recorded)', remarks: f.cancelRemarks || '',
          cat: cancelCat(f.cancelReason, f.cancelRemarks), recovered: !!f.recovered,
          start: f.start || '', fi: f.instructor || '',
        });
      }
    });
    sorties.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    cancels.sort((a, b) => a.date.localeCompare(b.date));

    // Same-day sortie index → double days + "extra" sorties.
    const spDay = new Map();
    sorties.forEach(s => {
      const k = s.sp + '|' + s.date;
      if (!spDay.has(k)) spDay.set(k, []);
      spDay.get(k).push(s);
    });
    spDay.forEach(list => list.forEach((s, i) => { s.nthOfDay = i + 1; s.dayCount = list.length; }));

    // ── Schedule changes & removals (watchdog log) ─────────────────────────
    const changes = new Map();   // flightId → { sp, date, lesson, cats:Set, events:[] }
    const removed = new Map();
    let logFrom = null, logTo = null;
    (o.log || []).forEach(e => {
      if (!e || !e.ts) return;
      const k = canon(e.student);
      if (!isSP(k)) return;
      const tsDay = bkkDate(e.ts);
      if (!logFrom || tsDay < logFrom) logFrom = tsDay;
      if (!logTo || tsDay > logTo) logTo = tsDay;
      if (e.type === 'CHANGED') {
        const diff = e.diff || {};
        const cats = new Set();
        const real = (d) => d && d.from != null && String(d.from).trim() !== '' && !/^tbd$/i.test(String(d.from).trim());
        if ((diff.start && real(diff.start)) || (diff.end && real(diff.end)) || (diff.date && real(diff.date))) cats.add('time');
        if (diff.tail && real(diff.tail)) cats.add('ac');
        if (diff.instructor && real(diff.instructor)) cats.add('fi');
        if (diff.lesson && real(diff.lesson)) cats.add('lesson');
        if (!cats.size) return;
        if (!changes.has(e.flightId)) changes.set(e.flightId, { id: e.flightId, sp: k, date: e.date, lesson: e.lesson || '', cats: new Set(), events: [] });
        const c = changes.get(e.flightId);
        cats.forEach(x => c.cats.add(x));
        c.date = e.date;   // latest known flight date
        c.events.push({ ts: e.ts, tsDay, cats: [...cats], diff });
      } else if (e.type === 'REMOVED') {
        if (!e.flightId || String(e.flightId).startsWith('ACTUAL_ONLY')) return;   // planned→actual swap, not a removal
        const prev = removed.get(e.flightId);
        if (!prev || e.ts > prev.ts) removed.set(e.flightId, { id: e.flightId, sp: k, date: e.date, lesson: e.lesson || '', ts: e.ts, tsDay, start: e.start || '', fi: e.instructor || '' });
      }
    });
    // A REMOVED event is a genuine removal only if the booking is still gone, it was dropped
    // BEFORE its own date (afterwards it's just the feed archiving a past day), and no row for
    // the same SP / day / lesson exists now (that'd be a rebook or a cancel, counted elsewhere).
    const removals = [...removed.values()].filter(r =>
      !presentIds.has(r.id) && r.tsDay <= r.date &&
      !presentKeys.has(r.sp + '|' + r.date + '|' + String(r.lesson).trim().toUpperCase())
    ).sort((a, b) => a.date.localeCompare(b.date));
    const changeList = [...changes.values()].map(c => Object.assign(c, { cats: [...c.cats] }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── Leave ──────────────────────────────────────────────────────────────
    const leaves = (o.leaves || []).map(r => {
      const k = r.name && byKey.has(r.name) ? r.name : canon(r.rawName || r.name);
      if (!isSP(k)) return null;
      const rec = recordDateOf(r.ids);
      return {
        key: r.key, sp: k, start: r.start, end: r.end, unit: r.unit || 1, half: r.half || null,
        reason: r.reason || 'On leave', cat: r.cat || 'other', note: r.note || '',
        recordDate: rec, lead: rec ? diffD(rec, r.start) : null,
      };
    }).filter(Boolean).sort((a, b) => a.start.localeCompare(b.start));

    // ── Progress (V5 model) — lessons completed, by date ───────────────────
    const lessons = [];
    const progressBySp = new Map();
    const pm = o.progress;
    if (pm && pm.students) {
      pm.students.forEach(s => {
        const k = byKey.has(nameKey(s.name)) ? nameKey(s.name) : canon(s.name);
        if (!isSP(k)) return;
        progressBySp.set(k, {
          lessonsCompleted: s.lessonsCompleted, records: s.flightRecords, retakes: s.retakes,
          hoursEffective: s.hoursEffective, pct: s.pct, total: s.total,
          lesDelta: s.lesDelta, hrsDelta: s.hrsDelta, vsTarget: s.vsTarget,
          nextLesson: s.nextLesson, idleDays: s.idleDays, lastFlown: s.lastDate || null,
        });
        (s.flown || []).forEach(f => { if (!f.isRetake) lessons.push({ sp: k, date: f.date, lesson: f.lesson, phase: f.phase && f.phase.label }); });
      });
    }
    lessons.sort((a, b) => a.date.localeCompare(b.date));

    const allDates = [].concat(sorties.map(s => s.date), cancels.map(c => c.date), lessons.map(l => l.date));
    const firstDate = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : today;

    return {
      today, firstDate, roster, byKey, holidays,
      sorties, cancels, changes: changeList, removals, leaves, lessons, progressBySp,
      logFrom, logTo, hasLog: !!(o.log && o.log.length),
      curriculumCount: pm && pm.curriculum ? pm.curriculum.count : 96,
      batch: pm ? pm.batch : null,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // summarize(base, { from, to, sp, gran }) — every number on the page.
  // `sp` = roster key to focus one SP (null = whole batch).
  // ════════════════════════════════════════════════════════════════════════
  function summarize(base, opt) {
    const o = opt || {};
    const from = o.from || base.firstDate, to = o.to || base.today;
    const gran = o.gran || 'week';
    const inR = d => d && d >= from && d <= to;
    const focus = o.sp || null;
    const mine = x => !focus || x.sp === focus;

    const S = base.sorties.filter(s => inR(s.date) && mine(s));
    const C = base.cancels.filter(c => inR(c.date) && mine(c));
    const CH = base.changes.filter(c => inR(c.date) && mine(c));
    const RM = base.removals.filter(r => inR(r.date) && mine(r));
    const L = base.lessons.filter(l => inR(l.date) && mine(l));
    const LV = base.leaves.filter(l => l.end >= from && l.start <= to && mine(l));

    // Leave person-days, clipped to range; overlapping records never double-count.
    const leaveDays = new Map();   // sp|date → unit
    LV.forEach(l => {
      const a = l.start < from ? from : l.start, b = l.end > to ? to : l.end;
      for (let d = a; d <= b; d = addD(d, 1)) {
        const k = l.sp + '|' + d;
        leaveDays.set(k, Math.max(leaveDays.get(k) || 0, l.unit));
      }
    });

    const BK = buckets(from, to, gran);
    const series = {};
    BK.forEach(b => { series[b] = { b, acMin: 0, simMin: 0, sorties: 0, lessons: 0, cancels: 0, cancelByCat: {}, changes: 0, removals: 0, leaveDays: 0, leaveByCat: {}, weekend: 0, early: 0, late: 0, doubleDays: 0, flyDays: new Set() }; });
    const at = d => series[bucketOf(d, gran)];
    S.forEach(s => {
      const r = at(s.date); if (!r) return;
      r.sorties++; if (s.isSim) r.simMin += s.mins; else r.acMin += s.mins;
      if (s.dayType !== 'weekday') r.weekend++;
      if (s.early) r.early++;
      if (s.late) r.late++;
      if (s.nthOfDay === 2) r.doubleDays++;
      r.flyDays.add(s.date);
    });
    L.forEach(l => { const r = at(l.date); if (r) r.lessons++; });
    C.forEach(c => { const r = at(c.date); if (!r) return; r.cancels++; r.cancelByCat[c.cat] = (r.cancelByCat[c.cat] || 0) + 1; });
    CH.forEach(c => { const r = at(c.date); if (r) r.changes++; });
    RM.forEach(c => { const r = at(c.date); if (r) r.removals++; });
    const lvCatByDay = new Map();
    LV.forEach(l => {
      const a = l.start < from ? from : l.start, b = l.end > to ? to : l.end;
      for (let d = a; d <= b; d = addD(d, 1)) { const k = l.sp + '|' + d; if (!lvCatByDay.has(k)) lvCatByDay.set(k, l.cat); }
    });
    leaveDays.forEach((u, k) => {
      const d = k.split('|')[1], r = at(d); if (!r) return;
      r.leaveDays += u;
      const c = lvCatByDay.get(k) || 'other';
      r.leaveByCat[c] = (r.leaveByCat[c] || 0) + u;
    });
    const seriesArr = BK.map(b => Object.assign(series[b], { flyDays: series[b].flyDays.size }));

    // ── Per-day batch activity (heatmap) ───────────────────────────────────
    const daily = new Map();
    S.forEach(s => {
      if (!daily.has(s.date)) daily.set(s.date, { date: s.date, mins: 0, sorties: 0, sps: new Set() });
      const r = daily.get(s.date); r.mins += s.mins; r.sorties++; r.sps.add(s.sp);
    });
    const dailyArr = [...daily.values()].map(r => Object.assign(r, { sps: r.sps.size }));

    // ── Distributions ──────────────────────────────────────────────────────
    const byDow = [0, 1, 2, 3, 4, 5, 6].map(i => ({ dow: i, sorties: 0, mins: 0, leaveDays: 0 }));
    S.forEach(s => { const r = byDow[dow(s.date)]; r.sorties++; r.mins += s.mins; });
    leaveDays.forEach((u, k) => { byDow[dow(k.split('|')[1])].leaveDays += u; });
    const byHour = Array.from({ length: 24 }, (_, i) => ({ h: i, sorties: 0 }));
    S.forEach(s => { if (s.startMin != null) byHour[Math.floor(s.startMin / 60) % 24].sorties++; });

    const count = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x); m[k] = (m[k] || 0) + 1; }); return m; };
    const cancelByCat = count(C, c => c.cat);
    const cancelByReason = count(C, c => c.reason);
    const changeByCat = {}; CH.forEach(c => c.cats.forEach(k => { changeByCat[k] = (changeByCat[k] || 0) + 1; }));
    const leaveByReason = {}; const leaveDaysByReason = {};
    LV.forEach(l => { leaveByReason[l.reason] = (leaveByReason[l.reason] || 0) + 1; });
    leaveDays.forEach((u, k) => { const c = lvCatByDay.get(k) || 'other'; leaveDaysByReason[c] = (leaveDaysByReason[c] || 0) + u; });
    const leadKnown = LV.filter(l => l.lead != null);
    const leadBuckets = LEAD_BUCKETS.map(b => ({ k: b.k, label: b.label, n: leadKnown.filter(l => b.test(l.lead)).length }));
    const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

    // ── Per-SP table ───────────────────────────────────────────────────────
    const roster = focus ? base.roster.filter(r => r.key === focus) : base.roster;
    const per = new Map(roster.map(r => [r.key, {
      key: r.key, name: r.name, nick: r.nick, fi: r.fi, se: r.se,
      sorties: 0, acMin: 0, simMin: 0, flyDays: new Set(), doubleDays: 0, maxDay: 0, maxDayDate: null,
      weekend: 0, early: 0, late: 0, extra: 0, lessons: 0,
      cancels: 0, cancelSelf: 0, cancelByCat: {}, changes: 0, removals: 0,
      leaveRecs: 0, leaveDays: 0, leads: [], retro: 0, leaveByReason: {},
    }]));
    const daysBySp = new Map();
    S.forEach(s => {
      const p = per.get(s.sp); if (!p) return;
      p.sorties++; if (s.isSim) p.simMin += s.mins; else p.acMin += s.mins;
      p.flyDays.add(s.date);
      const k = s.sp + '|' + s.date; daysBySp.set(k, (daysBySp.get(k) || 0) + 1);
      if (s.dayType !== 'weekday') { p.weekend++; p.extra++; }
      if (s.early) { p.early++; p.extra++; }
      if (s.late) { p.late++; p.extra++; }
      if (s.nthOfDay >= 2) p.extra++;
    });
    daysBySp.forEach((n, k) => {
      const [sp, d] = k.split('|'); const p = per.get(sp); if (!p) return;
      if (n >= 2) p.doubleDays++;
      if (n > p.maxDay) { p.maxDay = n; p.maxDayDate = d; }
    });
    L.forEach(l => { const p = per.get(l.sp); if (p) p.lessons++; });
    C.forEach(c => { const p = per.get(c.sp); if (!p) return; p.cancels++; if (c.cat === 'sp') p.cancelSelf++; p.cancelByCat[c.cat] = (p.cancelByCat[c.cat] || 0) + 1; });
    CH.forEach(c => { const p = per.get(c.sp); if (p) p.changes++; });
    RM.forEach(c => { const p = per.get(c.sp); if (p) p.removals++; });
    LV.forEach(l => {
      const p = per.get(l.sp); if (!p) return;
      p.leaveRecs++; p.leaveByReason[l.reason] = (p.leaveByReason[l.reason] || 0) + 1;
      if (l.lead != null) { p.leads.push(l.lead); if (l.lead < 0) p.retro++; }
    });
    leaveDays.forEach((u, k) => { const p = per.get(k.split('|')[0]); if (p) p.leaveDays += u; });

    const totLessons = L.length, totMin = S.reduce((a, s) => a + s.mins, 0);
    const spRows = [...per.values()].map(p => {
      const mins = p.acMin + p.simMin, fd = p.flyDays.size;
      const prog = base.progressBySp.get(p.key) || null;
      const topReason = Object.entries(p.leaveByReason).sort((a, b) => b[1] - a[1])[0];
      return Object.assign(p, {
        flyDays: fd, mins, hours: mins / 60,
        hoursPerFlyDay: fd ? mins / 60 / fd : 0,
        cancelRate: (p.sorties + p.cancels) ? p.cancels / (p.sorties + p.cancels) : 0,
        lessonShare: totLessons ? p.lessons / totLessons : 0,
        hourShare: totMin ? mins / totMin : 0,
        medianLead: median(p.leads), topLeaveReason: topReason ? topReason[0] : '',
        progress: prog,
      });
    });

    // ── KPIs ───────────────────────────────────────────────────────────────
    const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
    const flyDaysBatch = new Set(S.map(s => s.date)).size;
    const spDays = new Map(); S.forEach(s => { const k = s.sp + '|' + s.date; spDays.set(k, (spDays.get(k) || 0) + 1); });
    const doubleSpDays = [...spDays.values()].filter(n => n >= 2).length;
    const nSP = roster.length || 1;
    const rangeDays = diffD(from, to) + 1;
    const kpi = {
      rangeDays, from, to,
      sorties: S.length, acSorties: S.filter(s => !s.isSim).length, simSorties: S.filter(s => s.isSim).length,
      hours: totMin / 60, acHours: sum(S.filter(s => !s.isSim), s => s.mins) / 60, simHours: sum(S.filter(s => s.isSim), s => s.mins) / 60,
      lessons: totLessons,
      flyDays: flyDaysBatch,
      hoursPerFlyDay: flyDaysBatch ? totMin / 60 / flyDaysBatch : 0,
      hoursPerSPWeek: rangeDays ? totMin / 60 / nSP / (rangeDays / 7) : 0,
      lessonsPerWeek: rangeDays ? totLessons / (rangeDays / 7) : 0,
      spDays: spDays.size, doubleSpDays,
      weekend: S.filter(s => s.dayType !== 'weekday').length,
      weekendHours: sum(S.filter(s => s.dayType !== 'weekday'), s => s.mins) / 60,
      early: S.filter(s => s.early).length, late: S.filter(s => s.late).length,
      extra: sum(spRows, r => r.extra),
      cancels: C.length, cancelRate: (S.length + C.length) ? C.length / (S.length + C.length) : 0,
      cancelSelf: C.filter(c => c.cat === 'sp').length,
      changes: CH.length, removals: RM.length,
      leaveRecs: LV.length, leaveDays: sum([...leaveDays.values()], u => u),
      leaveSPs: new Set(LV.map(l => l.sp)).size,
      medianLead: median(leadKnown.map(l => l.lead)), leadKnown: leadKnown.length,
      retroLeaves: leadKnown.filter(l => l.lead < 0).length,
    };

    // Best day / week / month (by block hours and by lessons) + average rates.
    const records = {};
    ['day', 'week', 'month'].forEach(g => {
      const hrs = {}, les = {};
      S.forEach(s => { const b = bucketOf(s.date, g); hrs[b] = (hrs[b] || 0) + s.mins / 60; });
      L.forEach(l => { const b = bucketOf(l.date, g); les[b] = (les[b] || 0) + 1; });
      const best = m => Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
      const per = g === 'day' ? 1 : g === 'week' ? 7 : 365.25 / 12;
      records[g] = {
        bestHours: best(hrs), bestLessons: best(les),
        avgHours: rangeDays ? totMin / 60 / rangeDays * per : 0,
        avgLessons: rangeDays ? totLessons / rangeDays * per : 0,
        avgHoursPerSP: rangeDays ? totMin / 60 / rangeDays * per / nSP : 0,
        avgLessonsPerSP: rangeDays ? totLessons / rangeDays * per / nSP : 0,
      };
    });
    const tripleSpDays = [...spDays.values()].filter(n => n >= 3).length;
    kpi.tripleSpDays = tripleSpDays;

    return {
      from, to, gran, focus, kpi, records, series: seriesArr, daily: dailyArr, byDow, byHour,
      cancelByCat, cancelByReason, changeByCat, leaveByReason, leaveDaysByReason, leadBuckets,
      spRows, sorties: S, cancels: C, changes: CH, removals: RM, leaves: LV, lessons: L,
    };
  }

  // ── Self-check: invariants that must hold for any range. Shown on the page.
  function selfCheck(base, sum) {
    const k = sum.kpi, rows = sum.spRows;
    const tot = (f) => rows.reduce((a, r) => a + f(r), 0);
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    const checks = [
      ['Per-SP sorties add up to the batch total', tot(r => r.sorties) === k.sorties],
      ['Per-SP block hours add up to the batch total', near(tot(r => r.hours), k.hours)],
      ['Aircraft + SIM hours = total hours', near(k.acHours + k.simHours, k.hours)],
      ['Per-SP cancels add up to the batch total', tot(r => r.cancels) === k.cancels],
      ['Per-SP leave days add up to the batch total', near(tot(r => r.leaveDays), k.leaveDays)],
      ['Series sorties add up to the batch total', sum.series.reduce((a, s) => a + s.sorties, 0) === k.sorties],
      ['Per-SP lessons add up to the batch total', tot(r => r.lessons) === k.lessons],
    ];
    // Data-quality warnings — facts about the FEED, not arithmetic failures of this page.
    const warnings = [];
    const sig = new Map();
    sum.sorties.forEach(s => { const key = [s.sp, s.date, s.start, s.lesson, s.tail].join('|'); sig.set(key, (sig.get(key) || []).concat(s)); });
    sig.forEach(list => { if (list.length > 1) warnings.push(`Possible duplicate flight record in the ops feed: ${list[0].sp} ${list[0].date} ${list[0].start} ${list[0].lesson} (${list.length} rows, ${list.map(x => x.mins + ' min').join(' / ')})`); });
    const noReason = sum.cancels.filter(c => /no reason/i.test(c.reason)).length;
    if (noReason) warnings.push(`${noReason} cancelled booking(s) have no cancel reason recorded in the portal — counted under "Other".`);
    if (!base.hasLog) warnings.push('Schedule-change history (watchdog log) could not be loaded — Changed / Removed show 0.');
    return { pass: checks.every(c => c[1]), checks: checks.map(([label, pass]) => ({ label, pass })), warnings };
  }

  return {
    build, summarize, selfCheck, nameKey, recordDateOf, cancelCat,
    CANCEL_CATS, CHANGE_CATS, LEAD_BUCKETS, DEF,
    util: { addD, diffD, dow, weekStart, bucketOf, buckets, bkkDate, hm },
  };
}));
