import { describe, it, expect } from 'vitest';
import { appendLog, getLog } from '../src/log.js';

// Minimal KV mock: in-memory Map with a Cloudflare-style list({prefix, cursor}).
function makeKV() {
  const store = new Map();
  return {
    async get(key) {
      const val = store.get(key);
      return val === undefined ? null : val;
    },
    async put(key, value) { store.set(key, value); },
    async list({ prefix = '' } = {}) {
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).sort().map(name => ({ name }));
      return { keys, list_complete: true, cursor: undefined };
    },
    _store: store,
  };
}

const ENTRY = { type: 'ADDED', flightId: '100', student: 'SIWAKORN P.',
  lesson: 'CDGL 04', date: '2026-06-10', start: '08:00', end: '09:30',
  tail: 'HS-NGT', instructor: 'ITTIPOL P.', diff: {} };

describe('appendLog + getLog (day-sharded)', () => {
  it('appends entry to the per-day key', async () => {
    const kv = makeKV();
    await appendLog(kv, [ENTRY], '2026-06-05T14:00:00Z');
    expect(kv._store.has('watchdog:log:2026-06-05')).toBe(true); // day key, not month blob
    const log = await getLog(kv, '2026-06');
    expect(log).toHaveLength(1);
    expect(log[0].ts).toBe('2026-06-05T14:00:00Z');
  });

  it('accumulates multiple appends on the same day into one day key', async () => {
    const kv = makeKV();
    await appendLog(kv, [ENTRY], '2026-06-05T14:00:00Z');
    await appendLog(kv, [{ ...ENTRY, flightId: '101' }], '2026-06-05T14:05:00Z');
    expect(JSON.parse(kv._store.get('watchdog:log:2026-06-05'))).toHaveLength(2);
    expect(await getLog(kv, '2026-06')).toHaveLength(2);
  });

  it('separates different days into separate keys but one month aggregates them', async () => {
    const kv = makeKV();
    await appendLog(kv, [ENTRY], '2026-06-05T14:00:00Z');
    await appendLog(kv, [{ ...ENTRY, flightId: '102' }], '2026-06-07T09:00:00Z');
    expect(kv._store.has('watchdog:log:2026-06-05')).toBe(true);
    expect(kv._store.has('watchdog:log:2026-06-07')).toBe(true);
    const log = await getLog(kv, '2026-06');
    expect(log).toHaveLength(2);
    expect(log[0].ts).toBe('2026-06-07T09:00:00Z'); // descending by ts
  });

  it('does not bleed across months', async () => {
    const kv = makeKV();
    await appendLog(kv, [ENTRY], '2026-06-30T23:00:00Z');
    await appendLog(kv, [{ ...ENTRY, flightId: '200' }], '2026-07-01T01:00:00Z');
    expect(await getLog(kv, '2026-06')).toHaveLength(1);
    expect(await getLog(kv, '2026-07')).toHaveLength(1);
  });

  it('returns empty array for a month with no data', async () => {
    const kv = makeKV();
    expect(await getLog(kv, '2025-01')).toEqual([]);
  });

  it('BACKWARD COMPAT: still reads a legacy per-month blob and lettered shards', async () => {
    const kv = makeKV();
    // Simulate pre-day-shard data
    kv._store.set('watchdog:log:2026-05',   JSON.stringify([{ ...ENTRY, ts: '2026-05-05T12:00:00Z' }]));
    kv._store.set('watchdog:log:2026-05-A', JSON.stringify([{ ...ENTRY, ts: '2026-05-05T14:00:00Z' }]));
    // Plus a new day key in the same month
    await appendLog(kv, [{ ...ENTRY, flightId: '999' }], '2026-05-06T08:00:00Z');
    const log = await getLog(kv, '2026-05');
    expect(log).toHaveLength(3);
    expect(log[0].ts).toBe('2026-05-06T08:00:00Z'); // newest first
  });

  it('appendLog with no entries is a no-op', async () => {
    const kv = makeKV();
    await appendLog(kv, [], '2026-06-05T14:00:00Z');
    expect(kv._store.size).toBe(0);
  });
});
