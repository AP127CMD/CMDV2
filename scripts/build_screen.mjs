#!/usr/bin/env node
/* ============================================================================
 * AP127 Smart Screen — compact feed builder  →  screen.json (~6 KB)
 *
 * The ESP32 desk screen (MicroProject/AP127_Screen) has ~200 KB of free RAM and
 * cannot load the 3.4 MB ops feed or the 200 KB progress feed. This script
 * boils both down to the handful of numbers the screen shows.
 *
 * Zero copied maths: it runs CMDV2's OWN engine files in a Node vm —
 *   js/shared.js (feed-normalisation prefix only: dedup, cancel joins, aliases,
 *                 non-flight exclusion, roster, holidays — everything above the
 *                 "Maintenance & leave helpers" marker)
 *   assets/reconcile.js, js/ap127-targets-data.js, js/ap127-v5-model.js,
 *   js/ap127-stats-model.js, and opsAugmentV5() lifted out of view-cohort-v5.js
 * so every number equals what the AP127 Detail V5 / Batch Stats tabs show.
 *
 * Usage:  node scripts/build_screen.mjs [outFile]     (default: screen.json)
 * Run by .github/workflows/screen-feed.yml every 10 min; published to the
 * `screen-data` branch (single force-pushed commit, [CI Skip]).
 * Hours are block time (durMin) everywhere — never airborne.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, 'screen.json');
const FEED_URL = 'https://ap127-data.anusorn-tanmetha.workers.dev/flight-data.js';
const PROGRESS_URL = 'https://ap127-data-api.anusorn-tanmetha.workers.dev';
const ME_NICK = process.env.SCREEN_ME || 'A-SORN';          // the screen's owner (CMDV2 call sign)
const LESSONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/screen-lessons.json'), 'utf8'));

const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'ap127-screen-feed' } });
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise(res => setTimeout(res, 2000 * i));
    }
  }
}

// ── Load the feeds + CMDV2 engine into one sandbox ───────────────────────
const [feedJs, progressTxt] = await Promise.all([get(FEED_URL), get(PROGRESS_URL)]);
const progress = JSON.parse(progressTxt);
if (!Array.isArray(progress.ap127) || !progress.ap127.length) throw new Error('progress feed has no ap127 students');

const sandbox = { console, Intl, Date, Math, JSON, Set, Map, localStorage: { getItem: () => null, setItem() {} } };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.React = {};   // shared.js line 2 destructures hooks; the prefix we run never calls them
vm.createContext(sandbox);
const run = (code, name) => vm.runInContext(code, sandbox, { filename: name });

run(feedJs, 'flight-data.js');
if (!sandbox.FLIGHT_DATA || !Array.isArray(sandbox.FLIGHT_DATA.flights)) throw new Error('flight feed did not define FLIGHT_DATA.flights');
run(read('assets/reconcile.js'), 'reconcile.js');
run(read('js/ap127-targets-data.js'), 'ap127-targets-data.js');
run(read('js/ap127-v5-model.js'), 'ap127-v5-model.js');
run(read('js/ap127-stats-model.js'), 'ap127-stats-model.js');

const shared = read('js/shared.js');
const cut = shared.indexOf('// ─── Maintenance & leave helpers');
if (cut < 0) throw new Error('shared.js slice marker not found — update build_screen.mjs');
const S = run(shared.slice(0, cut) + '\n;({ FLIGHTS, AP127_ROSTER, AP127_FI_FULL, AP127_HOLIDAYS, AP127_STUDENT_ALIASES, injectNicks, bkkToday, bkkNowMin, fMin });', 'shared.js[prefix]');

// opsAugmentV5 — lifted verbatim out of view-cohort-v5.js by brace matching.
const v5 = read('js/view-cohort-v5.js');
const a0 = v5.indexOf('function opsAugmentV5(');
if (a0 < 0) throw new Error('opsAugmentV5 not found in view-cohort-v5.js — update build_screen.mjs');
let depth = 0, a1 = v5.indexOf('{', a0);
for (let i = a1; i < v5.length; i++) { if (v5[i] === '{') depth++; else if (v5[i] === '}' && --depth === 0) { a1 = i + 1; break; } }
const opsAugment = run('(' + v5.slice(a0, a1) + ')', 'opsAugmentV5');

// ── Progress model (same call as view-stats.js) ──────────────────────────
S.injectNicks(progress.ap127);
const aug = opsAugment(progress.ap127, progress.cur127);
const model = sandbox.AP127V5Model.buildModel(aug.students, progress.cur127, { updatedAt: progress._updated, force: true });
const check = sandbox.AP127V5Model.selfCheck(model);

const today = S.bkkToday();
const nowMin = S.bkkNowMin();
const addD = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tomorrow = addD(today, 1);
const hm = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const isAP = b => sandbox.AP127Reconcile.isAP127(b);
const r1 = x => Math.round(x * 10) / 10;

const roster = S.AP127_ROSTER.map(([name, nick, fi, se]) => ({ name, nick, fi, se, key: sandbox.AP127Reconcile.ccKeyFromFull(name) }));
const meR = roster.find(r => r.nick === ME_NICK);
if (!meR) throw new Error('owner call sign ' + ME_NICK + ' not in AP127_ROSTER');
const nickOf = student => {
  const raw = String(student || '').toUpperCase().trim();
  const k = S.AP127_STUDENT_ALIASES[raw] || raw;
  const r = roster.find(x => x.key === k);
  return r ? r.nick : null;
};
const lessonNo = l => { const m = /(\d+)\s*(?:\/\d+)?\s*$/.exec(String(l || '')); return m ? +m[1] : null; };
const lessonInfo = l => LESSONS[String(lessonNo(l))] || null;
const stCode = s => s === 'Completed' ? 'C' : s === 'Canceled' ? 'X' : 'P';
const shortName = n => String(n || '').replace(/\s*\(Unplanned\)\s*$/i, '').trim();
const tailOf = f => String(f.tail || '').replace(/\s*\(SIM\)\s*$/i, '');

// ── My flights ───────────────────────────────────────────────────────────
const FL = S.FLIGHTS.filter(f => f.date && !f._virtual);
const mine = FL.filter(f => nickOf(f.student) === ME_NICK)
  .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
const flightOut = f => {
  const li = lessonInfo(f.lesson);
  return {
    id: f.id, d: f.date, s: f.start || '', e: f.end || '', l: f.lesson || '', t: li ? li.title : '',
    c: li ? li.cond : (f.cond || ''), fi: shortName(f.instructor), ac: tailOf(f), ty: f.type || '',
    sim: f.isSim ? 1 : 0, st: stCode(f.status), m: f.durMin || 0,
    ...(f.routeFrom ? { rt: f.routeFrom + (f.routeTo ? '→' + f.routeTo : '') } : {}),
  };
};
const upcoming = mine.filter(f => f.status !== 'Canceled' && f.status !== 'Completed' &&
  (f.date > today || (f.date === today && (hm(f.end) ?? 1440) > nowMin))).slice(0, 6).map(flightOut);
const recent = mine.filter(f => f.status === 'Completed').slice(-3).reverse().map(flightOut);

// ── Today / tomorrow (AP127 + whole school) ──────────────────────────────
const dayStats = (date, pred) => {
  const rows = FL.filter(f => f.date === date && pred(f) && f.student);
  const done = rows.filter(f => f.status === 'Completed');
  return {
    n: rows.filter(f => f.status !== 'Canceled').length,
    done: done.length,
    canx: rows.filter(f => f.status === 'Canceled').length,
    hrs: r1(done.reduce((a, f) => a + S.fMin(f), 0) / 60),
    sim: rows.filter(f => f.isSim && f.status !== 'Canceled').length,
  };
};
const bars = date => FL.filter(f => f.date === date && isAP(f.batch) && f.student && hm(f.start) != null && hm(f.end) != null)
  .sort((a, b) => hm(a.start) - hm(b.start) || String(a.student).localeCompare(String(b.student)))
  .slice(0, 48)
  .map(f => [hm(f.start), hm(f.end), stCode(f.status), f.isSim ? 1 : 0, nickOf(f.student) === ME_NICK ? 1 : 0, nickOf(f.student) || shortName(f.student).split(' ')[0]]);
const firstLast = date => {
  const t = FL.filter(f => f.date === date && isAP(f.batch) && f.status !== 'Canceled' && hm(f.start) != null).map(f => f.start).sort();
  return t.length ? [t[0], t[t.length - 1]] : null;
};

// ── Batch (V5 model) ─────────────────────────────────────────────────────
const b = model.batch;
const me = model.students.find(s => s.nick === ME_NICK || sandbox.AP127Reconcile.ccKeyFromFull(s.name) === meR.key);
const ranked = model.students.slice().sort((x, y) => y.lessonsCompleted - x.lessonsCompleted || y.hoursEffective - x.hoursEffective);
const phases = (model.phases || []).map(p => ({ l: p.phase.label.replace('Phase ', ''), c: p.phase.c, d: p.done, s: p.slots }));

// ── Last 7 days (Batch Stats engine) ─────────────────────────────────────
const Stats = sandbox.AP127Stats;
const base = Stats.build({
  flights: S.FLIGHTS, roster: roster.map(r => ({ name: r.name, nick: r.nick, se: r.se, fi: S.AP127_FI_FULL[r.fi] || r.fi })),
  leaves: [], log: [], progress: model, aliases: S.AP127_STUDENT_ALIASES, holidays: S.AP127_HOLIDAYS, today,
});
const wk = Stats.summarize(base, { from: addD(today, -6), to: today, gran: 'day' }).kpi;

// ── My training stats (MY STATS page): today / this week / this month / all time ──
// Block time only (fMin), completed sorties, CMDV2's de-duplicated FLIGHTS. Lessons = first
// completions from the V5 model (same rule as the Batch Stats tab).
const myDone = FL.filter(f => f.status === 'Completed' && !f.isNonFlight && nickOf(f.student) === ME_NICK);
const apDone = FL.filter(f => f.status === 'Completed' && !f.isNonFlight && nickOf(f.student));
const dowMon = d => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
const weekStart = addD(today, -dowMon(today));
const monthStart = today.slice(0, 8) + '01';
const tagOf = f => (String(f.flightType || '') + ' ' + String(f.cond || '')).toUpperCase();
const statsFor = from => {
  const rows = myDone.filter(f => f.date >= from && f.date <= today);
  const mins = rows.reduce((a, f) => a + S.fMin(f), 0);
  const simM = rows.filter(f => f.isSim).reduce((a, f) => a + S.fMin(f), 0);
  const les = me ? me.flown.filter(f => !f.isRetake && f.date >= from && f.date <= today).length : 0;
  const batchM = apDone.filter(f => f.date >= from && f.date <= today).reduce((a, f) => a + S.fMin(f), 0);
  return {
    n: rows.length, h: r1(mins / 60), ac: r1((mins - simM) / 60), sim: r1(simM / 60), les,
    ldg: rows.reduce((a, f) => a + (+f.ldg || 0), 0), app: rows.reduce((a, f) => a + (+f.inst || 0), 0),
    solo: r1(rows.filter(f => /SOLO|SPIC/.test(tagOf(f))).reduce((a, f) => a + S.fMin(f), 0) / 60),
    night: r1(rows.filter(f => /NIGHT/.test(tagOf(f))).reduce((a, f) => a + S.fMin(f), 0) / 60),
    xc: rows.filter(f => /XC/.test(tagOf(f))).length,
    avg: r1(batchM / 60 / roster.length),
  };
};
const firstDay = myDone.map(f => f.date).sort()[0] || today;
const longest = myDone.slice().sort((a, b) => S.fMin(b) - S.fMin(a))[0];
const tails = {};
myDone.filter(f => !f.isSim && f.tail).forEach(f => { const t = tailOf(f); tails[t] = (tails[t] || 0) + 1; });
const topAc = Object.entries(tails).sort((a, b) => b[1] - a[1])[0];
const weeks = [...new Set(myDone.map(f => addD(f.date, -dowMon(f.date))))].sort();
let streak = 0, wkRun = 0, prev = null;
weeks.forEach(w => { wkRun = prev && addD(prev, 7) === w ? wkRun + 1 : 1; streak = Math.max(streak, wkRun); prev = w; });
const HEAT_DAYS = 112;
const perDay = {};
myDone.forEach(f => { perDay[f.date] = (perDay[f.date] || 0) + S.fMin(f); });
const heat = [];
for (let i = HEAT_DAYS - 1; i >= 0; i--) heat.push(Math.round((perDay[addD(today, -i)] || 0) / 10));
const ts = {
  wk0: weekStart, mo0: monthStart, since: firstDay,
  d: statsFor(today), w: statsFor(weekStart), m: statsFor(monthStart), a: statsFor(firstDay),
  rec: {
    lm: longest ? S.fMin(longest) : 0, ll: longest ? longest.lesson : '', ld: longest ? longest.date : '',
    ac: topAc ? topAc[0] : '', acn: topAc ? topAc[1] : 0, streak,
  },
  heat,
};

const out = {
  v: 1,
  gen: new Date().toISOString(),
  feedAt: sandbox.FLIGHT_DATA.fetchedAt || null,
  progAt: progress._updated || null,
  today, nowMin,
  ok: check.pass,
  me: {
    nick: ME_NICK, name: meR.name, se: meR.se, fi: S.AP127_FI_FULL[meR.fi] || meR.fi,
    done: me ? me.lessonsCompleted : null, total: model.curriculum.count,
    pct: me ? r1(me.lessonsCompleted / model.curriculum.count * 100) : null,
    hrs: me ? r1(me.hoursEffective) : null, totHrs: model.curriculum.totalHours,
    rank: me ? ranked.indexOf(me) + 1 : null, of: ranked.length,
    vsT: me ? me.vsTarget : null, lesD: me ? r1(me.lesDelta) : null, hrsD: me ? r1(me.hrsDelta) : null,
    etc: me ? me.etcDate : null, risk: me ? !!me.atRisk : null, idle: me ? me.idleDays : null,
    next: me && me.nextLesson ? (me.nextLesson.lesson || me.nextLesson) : null,
  },
  up: upcoming,
  last: recent,
  day: {
    ap: dayStats(today, f => isAP(f.batch)), all: dayStats(today, () => true),
    span: firstLast(today), bars: bars(today),
  },
  tmr: { d: tomorrow, ap: dayStats(tomorrow, f => isAP(f.batch)), span: firstLast(tomorrow) },
  batch: {
    n: b.n, pct: r1(b.progressPct), les: b.lessonsDone, slots: b.lessonSlots,
    lesD: Math.round(b.lessonsDelta), hrs: Math.round(b.hoursDone), hrsD: Math.round(b.hoursDelta),
    avgL: r1(b.avgLessons), tgt: b.targetLessonToday != null ? r1(b.targetLessonToday) : null,
    behind: b.vsTargetToday ? b.vsTargetToday.behindCount : null,
    onTime: model.etc.onTime, atRisk: model.etc.atRisk, planEnd: model.curriculum.planEndDate || null,
    phases,
  },
  wk: {
    sorties: wk.sorties, hrs: r1(wk.hours), ac: r1(wk.acHours), sim: r1(wk.simHours),
    canx: wk.cancels, lessons: wk.lessons,
    cr: wk.cancelRate != null ? Math.round(wk.cancelRate * 100) : null,
  },
  ts,
  board: ranked.map(s => [s.nick || s.name.split(' ')[0], s.lessonsCompleted, s.nick === ME_NICK ? 1 : 0, s.vsTarget == null ? null : Math.round(s.vsTarget)]),
};

const json = JSON.stringify(out);
fs.writeFileSync(OUT, json);
console.log(`screen.json: ${json.length} B · up ${upcoming.length} · board ${out.board.length} · selfCheck ${check.pass ? 'PASS' : 'FAIL'} · feed ${out.feedAt}`);
if (json.length > 12000) { console.error('screen.json exceeds the ESP32 12 KB budget'); process.exit(2); }
