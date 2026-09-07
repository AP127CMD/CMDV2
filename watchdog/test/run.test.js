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
