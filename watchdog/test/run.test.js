import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index.js';

// Integration test for the full runWatchdog() pipeline, driven through worker.scheduled().
// Reproduces the 2026-09-07 PICHAKORN J. incident: recording ONE flight complete produced FOUR
// Telegram notices (Completed, Cancelled, New, Completed) because the feed flapped between "planned
// row present" and "ACTUAL_ONLY row present" across watchdog runs — partly genuine cross-run
// staging, partly a lagging raw.githubusercontent.com edge serving an older version than the
// snapshot already reflected.

const PLANNED_ID = 'BK-AP-127-PICH-WU1FV';
const ACTUAL_ID = `ACTUAL_ONLY_${PLANNED_ID}`;

// dated "today" in Asia/Bangkok so isActionable() lets it through
function today() {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
}

function feed(fetchedAt, flights) {
  return `window.FLIGHT_DATA = ${JSON.stringify({ fetchedAt, flights, cancellations: [] })};`;
}

const plannedFlight = () => ({
  id: PLANNED_ID, batch: 'AP-127', date: today(), start: '11:30', end: '13:30',
  status: 'Pending', student: 'PICHAKORN J.', instructor: 'KOONPHOL U.', lesson: 'CDXV 32', tail: 'HS-TVC', type: 'DA40CS',
});
const actualFlight = () => ({
  ...plannedFlight(), id: ACTUAL_ID, status: 'Completed', to: 1, ldg: 1, tkoff: '11:40', ldgTime: '13:10',
});

// A dozen filler flights so isAnomalousDrop() (needs a baseline ≥ 20 and a >50% drop) never trips
// on the tiny swings between our two feed versions.
const filler = () => Array.from({ length: 24 }, (_, i) => ({
  id: `F${i}`, batch: 'AP-129', date: today(), start: '08:00', end: '09:00', status: 'Pending',
  student: `S${i}`, instructor: 'X', lesson: 'L', tail: 'HS-A', type: 'DA40CS',
}));

let kv, telegramSends, feedText;

beforeEach(() => {
  const store = new Map();
  kv = {
    get: async (k) => (store.has(k) ? store.get(k) : null),
    put: async (k, v) => void store.set(k, v),
    _store: store,
  };
  telegramSends = [];
  feedText = feed('2026-09-07T07:19:00Z', [...filler(), plannedFlight()]);

  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    if (String(url).includes('api.telegram.org')) {
      telegramSends.push(JSON.parse(opts.body));
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    // raw.githubusercontent.com feed
    return new Response(feedText, { status: 200 });
  }));
  // The pipeline sleeps 3.5s between Telegram sends (rate-limit spacing) — collapse it.
  vi.stubGlobal('setTimeout', (cb) => { cb(); return 0; });
});

afterEach(() => vi.unstubAllGlobals());

async function run() {
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(Promise.resolve(p)) };
  await worker.scheduled({}, { KV: kv, TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '99' }, ctx);
  await Promise.all(pending);
}

// Establish a snapshot baseline (the very first run diffs against an empty snapshot and would
// "ADD" every flight), then discard whatever that baseline run notified.
async function baseline() {
  await run();
  telegramSends.length = 0;
}

function notices() {
  // Each Telegram send is one combined message; pull the group headers that appear in it.
  return telegramSends.flatMap((s) => {
    const t = s.text || '';
    return ['❌ Cancelled', '✈️ New', '✅ Completed', '🔄 Status update', '⚠️ Changed']
      .filter((g) => t.includes(g));
  });
}

describe('runWatchdog — staged/flapping "record actual" completion (PICHAKORN J. incident)', () => {
  it('a clean atomic completion sends exactly one ✅ Completed', async () => {
    await baseline();                                        // planned row
    feedText = feed('2026-09-07T07:54:00Z', [...filler(), actualFlight()]);
    await run();                                             // planned → ACTUAL_ONLY Completed
    expect(notices()).toEqual(['✅ Completed']);
  });

  it('a stale CDN re-read of the older feed does NOT roll back into New + Cancelled', async () => {
    await baseline();                                        // planned
    feedText = feed('2026-09-07T07:54:00Z', [...filler(), actualFlight()]);
    await run();                                             // → Completed (1 notice)
    // lagging edge now serves the OLD version again
    feedText = feed('2026-09-07T07:19:00Z', [...filler(), plannedFlight()]);
    await run();
    feedText = feed('2026-09-07T07:54:00Z', [...filler(), actualFlight()]);
    await run();                                             // edge catches up again
    expect(notices()).toEqual(['✅ Completed']);              // still just the one, no New/Cancelled
  });

  it('a genuinely-new commit that momentarily drops the ACTUAL_ONLY row fires nothing extra', async () => {
    await baseline();
    feedText = feed('2026-09-07T07:54:00Z', [...filler(), actualFlight()]);
    await run();                                             // → Completed
    // new commit, new timestamp, but the scrape lost the ACTUAL_ONLY row for this pull
    feedText = feed('2026-09-07T07:59:00Z', [...filler(), plannedFlight()]);
    await run();
    expect(notices()).toEqual(['✅ Completed']);
  });
});

// 2026-09-24: per-leg Completed notices + the settle hold (completion.js). Students submit an XC's
// Flight Records in a burst (SETASIT P., 2026-09-23: three legs within ~3 min); a scrape that lands
// mid-burst sees leg 1 only. The notice must wait and go out ONCE, with every leg.
describe('runWatchdog — multi-leg completion is held until the trip is on record', () => {
  const XC_ID = 'ACTUAL_ONLY_BK-AP-127-SETA-EHX3N';
  const L = [
    { leg: '1', routeFrom: 'VTPH', routeTo: 'VTSB', blockOff: '06:30', tkoff: '06:40', ldgTime: '08:35', blockOn: '08:40', to: 1, ldg: 1 },
    { leg: '2', routeFrom: 'VTSB', routeTo: 'VTSE', blockOff: '08:46', tkoff: '08:50', ldgTime: '10:20', blockOn: '10:25', to: 1, ldg: 1 },
    { leg: '3', routeFrom: 'VTSE', routeTo: 'VTPH', blockOff: '10:30', tkoff: '10:36', ldgTime: '11:47', blockOn: '11:52', to: 1, ldg: 1 },
  ];
  const xcBooked = () => ({ id: 'BK-AP-127-SETA-EHX3N', batch: 'AP-127', date: today(), start: '06:30', end: '11:30',
    status: 'Pending', student: 'SETASIT P.', instructor: 'SANTI PO.', lesson: 'CSXV 45', tail: 'HS-TPO', type: 'DA40TDI' });
  const xcDone = (legs) => ({ ...xcBooked(), id: XC_ID, status: 'Completed', flightType: 'Solo',
    ...legs[legs.length - 1], ...(legs.length > 1 ? { legs } : {}) });

  let now;
  beforeEach(() => { now = Date.now(); vi.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => vi.restoreAllMocks());

  it('leg-1-only scrape → no notice; next scrape with all legs → ONE notice with the full table', async () => {
    feedText = feed('2026-09-07T07:00:00Z', [...filler(), xcBooked()]);
    await baseline();
    feedText = feed('2026-09-07T07:10:00Z', [...filler(), xcDone([L[0]])]);
    await run();
    expect(notices()).toEqual([]);                           // held — leg 1 alone is VTPH→VTSB

    now += 7 * 60e3;
    feedText = feed('2026-09-07T07:17:00Z', [...filler(), xcDone(L)]);
    await run();
    expect(notices()).toEqual(['✅ Completed']);
    const sent = telegramSends[0];
    expect(sent.parse_mode).toBe('HTML');
    expect(sent.text).toContain('- 🗺️ VTPH → VTSB → VTSE → VTPH');
    expect(sent.text).toContain('1 VTPH→VTSB 06:30 06:40 08:35 08:40');
    expect(sent.text).toContain('3 VTSE→VTPH 10:30 10:36 11:47 11:52');

    now += 7 * 60e3;
    feedText = feed('2026-09-07T07:24:00Z', [...filler(), xcDone(L)]);
    await run();
    expect(notices()).toEqual(['✅ Completed']);              // and never again
  });

  it('a one-way leg waits through quiet runs and goes out on the next scrape that adds nothing', async () => {
    feedText = feed('2026-09-07T07:00:00Z', [...filler(), xcBooked()]);
    await baseline();
    feedText = feed('2026-09-07T07:10:00Z', [...filler(), xcDone([L[0]])]);
    await run();
    now += 20 * 60e3;
    await run();                                             // same feed (quiet run) — keep waiting
    expect(notices()).toEqual([]);
    now += 20 * 60e3;
    feedText = feed('2026-09-07T07:50:00Z', [...filler(), xcDone([L[0]])]);
    await run();                                             // next scrape, still only leg 1 → send
    expect(notices()).toEqual(['✅ Completed']);
    expect(telegramSends[0].text).toContain('1 VTPH→VTSB 06:30 06:40 08:35 08:40');
    now += 60 * 60e3;
    await run();
    expect(notices()).toEqual(['✅ Completed']);
  });

  it('a feed that stops changing still releases the hold at MAX_HOLD_MS (quiet run)', async () => {
    feedText = feed('2026-09-07T07:00:00Z', [...filler(), xcBooked()]);
    await baseline();
    feedText = feed('2026-09-07T07:10:00Z', [...filler(), xcDone([L[0]])]);
    await run();
    now += 59 * 60e3;
    await run();
    expect(notices()).toEqual([]);
    now += 60e3;
    await run();
    expect(notices()).toEqual(['✅ Completed']);
  });
});

// 2026-09-24 regression: the stabilizers carried flights forward after they aged OUT of the window
// (a flight leaving the window also looks "lost"), so the stored snapshot grew without bound — found
// live at 832 entries (07-25 → 09-25) vs ~176 in window, which tripped the bad-feed guard on every
// feed change. prevSnap is now window-filtered on load.
describe('runWatchdog — snapshot stays bounded to the window', () => {
  const daysAgo = n => new Date(Date.now() + 7 * 3600e3 - n * 864e5).toISOString().slice(0, 10);

  it('prunes out-of-window carried-forward flights without notifying, and never trips the bad-feed guard', async () => {
    // Stored snapshot: today's 25 flights + 700 stale completed/cancelled records from weeks ago.
    const stale = {};
    for (let i = 0; i < 700; i++) {
      const id = i % 2 ? `ACTUAL_ONLY_BK-OLD-${i}` : `BK-OLD-${i}`;
      stale[id] = { id, date: daysAgo(5 + (i % 40)), start: '08:00', end: '09:00', student: `OLD${i}`,
        batch: 'AP-127', status: i % 2 ? 'Completed' : 'Canceled', lesson: 'L', tail: 'HS-A' };
    }
    await baseline();                                           // today's feed → real snapshot
    const real = JSON.parse(kv._store.get('watchdog:snapshot'));
    kv._store.set('watchdog:snapshot', JSON.stringify({ ...real, ...stale }));

    feedText = feed('2026-09-07T08:00:00Z', [...filler(), plannedFlight()]); // new sig, same flights
    await run();
    const status = JSON.parse(kv._store.get('watchdog:status'));
    expect(status.lastError).toBeNull();
    expect(status.anomalyStreak).toBe(0);
    expect(notices()).toEqual([]);                              // pruning past flights is silent
    const stored = JSON.parse(kv._store.get('watchdog:snapshot'));
    expect(Object.keys(stored)).toHaveLength(Object.keys(real).length);
    expect(Object.keys(stored).some(k => k.includes('OLD'))).toBe(false);
  });
});
