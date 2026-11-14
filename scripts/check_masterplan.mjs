// Verify the Master Plan engine (js/ap127-masterplan-model.js) against the LIVE feeds, under Node.
//   node scripts/check_masterplan.mjs            → measured baseline, plan headline, backtests, self-check
//   node scripts/check_masterplan.mjs 2026-11-14 → same, standing at a given as-of date
// Uses the ops feed exactly as the browser does: shared.js's data prefix (dedup + FLIGHTS) run in a vm.
// Exits 1 if the self-check fails.
import fs from 'node:fs'; import vm from 'node:vm'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
const get = async u => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); };

const fd = await get('https://ap127-data.anusorn-tanmetha.workers.dev/flight-data.js');
let progSrc; try { const j = await get('https://ap127-data-api.anusorn-tanmetha.workers.dev/'); progSrc = 'window.PROGRESS_DATA=' + j; }
catch (e) { progSrc = fs.readFileSync(ROOT + 'progress-data.js', 'utf8'); console.log('(progress: live API unavailable, using committed snapshot)'); }

const sb = { console: { log() {}, warn() {}, error() {} }, Intl, Date, Math, JSON, Set, Map, localStorage: { getItem: () => null, setItem() {} } };
sb.window = sb; sb.globalThis = sb; sb.React = {}; vm.createContext(sb);
vm.runInContext(fd, sb); vm.runInContext(progSrc, sb);
const sh = fs.readFileSync(ROOT + 'js/shared.js', 'utf8');
const S = vm.runInContext(sh.slice(0, sh.indexOf('// ─── Maintenance & leave helpers')) + '\n;({FLIGHTS,AP127_HOLIDAYS})', sb);
const MP = require(ROOT + 'js/ap127-masterplan-model.js');
const ctx = { students: sb.PROGRESS_DATA.ap127, curriculum: sb.PROGRESS_DATA.cur127, flights: S.FLIGHTS, holidays: [...S.AP127_HOLIDAYS] };

const asOf = process.argv[2] || MP.util.todayBKK();
const m = MP.measure(ctx, asOf);
console.log(`as of ${asOf} · feed ${sb.FLIGHT_DATA.fetchedAt} · ${S.FLIGHTS.length} rows`);
console.log(`budget ${m.budget.perDay} h/day (last 7d ${m.budget.last7Total}h, 30d avg ${m.budget.last30PerDay} h/day) · DOW ${m.budget.dowShape.join(' ')}`);
for (const [k, v] of Object.entries(m.pools)) console.log(`  ${k.padEnd(8)} ${String(v.capH).padStart(5)} ${v.unit.padEnd(15)} last7 ${v.last7}  — ${v.source}`);
console.log(`  cancel30 ${(m.cancelRate30 * 100).toFixed(1)}% · SP max/wk ${m.spMaxPerWeek} · FI max/day ${m.fiMaxPerDay} · UPRT from L${m.auprtFrom} · check gap ${JSON.stringify(m.checkGap)} · SIRME refly ${m.sirmeRefly}`);
const t = Date.now(); const r = MP.plan(ctx, null, { asOf, measured: m });
console.log(`plan (${Date.now() - t} ms): lesson 96 all ${r.batch.plan96} (P50 ${r.batch.p50_96}, P80 ${r.batch.p80_96}) · course complete ${r.batch.planComplete} (P50 ${r.batch.p50}, P80 ${r.batch.p80})`);
const A = MP.util.addDays;
const bts = [[A(asOf, -7), A(asOf, -1)], [A(asOf, -11), A(asOf, -1)], [A(asOf, -18), A(asOf, -1)]].map(([a, b]) => MP.backtest(ctx, a, b));
bts.forEach(b => console.log(`backtest ${b.from}→${b.to}: predicted ${b.predicted} vs actual ${b.actual} (${b.batchErrPct.toFixed(1)}%) · MAE ${b.mae}/SP (avg flown ${b.avgActual}/SP)`));
const sc = MP.selfCheck(r, bts[0]);
sc.checks.forEach(c => console.log(`  ${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`));
console.log('selfCheck ' + (sc.pass ? 'PASS' : 'FAIL'));
process.exit(sc.pass ? 0 : 1);
