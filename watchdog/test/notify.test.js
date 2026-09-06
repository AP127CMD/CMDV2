import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

// A ctx whose waitUntil swallows the promise, so runWatchdog() never actually
// executes — these tests assert routing + auth on POST /notify only.
const ctx = { waitUntil: () => {} };

const env = () => ({
  WATCHDOG_API_KEY: 'k',
  // present so nothing throws if code paths touch them
  TELEGRAM_BOT_TOKEN: 't',
  TELEGRAM_CHAT_ID: '1',
  KV: {
    get: async () => null,
    put: async () => {},
  },
});

describe('POST /notify', () => {
  it('401 without the API key', async () => {
    const res = await worker.fetch(
      new Request('https://w/notify', { method: 'POST' }),
      env(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it('401 with a wrong API key', async () => {
    const res = await worker.fetch(
      new Request('https://w/notify', {
        method: 'POST',
        headers: { 'X-API-Key': 'nope' },
      }),
      env(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it('202 {ok:true} with the API key', async () => {
    const res = await worker.fetch(
      new Request('https://w/notify', {
        method: 'POST',
        headers: { 'X-API-Key': 'k' },
      }),
      env(),
      ctx,
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('GET /notify is not the push route (falls through to 404)', async () => {
    const res = await worker.fetch(
      new Request('https://w/notify', { method: 'GET' }),
      env(),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});
