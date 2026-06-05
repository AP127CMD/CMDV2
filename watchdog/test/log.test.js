import { describe, it, expect, beforeEach } from 'vitest';
import { appendLog, getLog } from '../src/log.js';

// Minimal KV mock: in-memory Map
function makeKV() {
  const store = new Map();
  return {
    async get(key, type) {
      const val = store.get(key);
      return val === undefined ? null : val;
    },
    async put(key, value) { store.set(key, value); },
    _store: store,
  };
}

const ENTRY = { type: 'ADDED', flightId: '100', student: 'SIWAKORN P.',
  lesson: 'CDGL 04', date: '2026-06-10', start: '08:00', end: '09:30',
  tail: 'HS-NGT', instructor: 'ITTIPOL P.', diff: {} };

describe('appendLog + getLog', () => {
  it('appends entry to base key', async () => {
    const kv = makeKV();
    await appendLog(kv, [ENTRY], '2026-06-05T14:00:00Z');
    const log = await getLog(kv, '2026-06');
    expect(log).toHaveLength(1);
    expect(log[0].type).toBe('ADDED');
    expect(log[0].ts).toBe('2026-06-05T14:00:00Z');
  });

  it('accumulates multiple appends', async () => {
    const kv = makeKV();
    await appendLog(kv, [ENTRY], '2026-06-05T14:00:00Z');
    await appendLog(kv, [{ ...ENTRY, flightId: '101' }], '2026-06-05T14:05:00Z');
    const log = await getLog(kv, '2026-06');
    expect(log).toHaveLength(2);
  });

  it('returns empty array for a month with no data', async () => {
    const kv = makeKV();
    const log = await getLog(kv, '2025-01');
    expect(log).toEqual([]);
  });

  it('starts a new shard when base exceeds 20 MB', async () => {
    const kv = makeKV();
    // Pre-fill base key with 21 MB of data
    const big = JSON.stringify(Array(1100).fill({ ...ENTRY, padding: 'x'.repeat(20000) }));
    await kv.put('watchdog:log:2026-06', big);
    await appendLog(kv, [ENTRY], '2026-06-05T14:00:00Z');
    // New shard-A should exist
    const shardA = kv._store.get('watchdog:log:2026-06-A');
    expect(shardA).toBeTruthy();
    const parsed = JSON.parse(shardA);
    expect(parsed).toHaveLength(1);
  });

  it('getLog merges base + shards in timestamp order', async () => {
    const kv = makeKV();
    await kv.put('watchdog:log:2026-06',   JSON.stringify([{ ...ENTRY, ts: '2026-06-05T12:00:00Z' }]));
    await kv.put('watchdog:log:2026-06-A', JSON.stringify([{ ...ENTRY, ts: '2026-06-05T14:00:00Z' }]));
    const log = await getLog(kv, '2026-06');
    expect(log).toHaveLength(2);
    expect(log[0].ts).toBe('2026-06-05T14:00:00Z'); // descending
  });
});
