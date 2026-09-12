import { describe, it, expect } from 'vitest';
import {
  evaluate, evaluateFeed, evaluatePi, decideAlert, CONFIRM_DOWN, DATA_STALE_LIMIT_MIN,
  HEARTBEAT_MS, PI_HEARTBEAT_STALE_MIN, PI_HEARTBEAT_WRITE_GATE_MIN, runMonitor,
} from '../src/index.js';
import worker from '../src/index.js';

// Minimal in-memory KV that counts writes — lets us assert the write-budget behavior.
function mockKV(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    puts: 0,
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async put(key, val) { this.puts++; store.set(key, val); },
  };
}

describe('evaluate (watchdog KV state → down/up verdict)', () => {
  const NOW = Date.parse('2026-07-17T08:00:00Z');
  const ago = (min) => new Date(NOW - min * 60000).toISOString();

  it('no status in KV (never ran / cleared) is DOWN', () => {
    expect(evaluate(null, null, NOW).down).toBe(true);
    expect(evaluate(null, null, NOW).reason).toMatch(/no status/);
  });

  it('a recent lastRun with no error is UP', () => {
    expect(evaluate({ lastRun: ago(3), lastError: null }, { enabled: true }, NOW).down).toBe(false);
  });

  it('a lastRun stale beyond the limit is DOWN and names the gap', () => {
    const v = evaluate({ lastRun: ago(45), lastError: null }, { enabled: true }, NOW);
    expect(v.down).toBe(true);
    expect(v.reason).toMatch(/45 min/);
  });

  it('a quiet gap up to ~25 min is still UP (watchdog only heartbeats every 25 min)', () => {
    expect(evaluate({ lastRun: ago(24), lastError: null }, { enabled: true }, NOW).down).toBe(false);
  });

  it('a persisted lastError is DOWN and surfaces the error', () => {
    const v = evaluate({ lastRun: ago(2), lastError: 'Upstream HTTP 502' }, { enabled: true }, NOW);
    expect(v.down).toBe(true);
    expect(v.reason).toMatch(/502/);
  });

  it('intentionally disabled watchdog is NOT treated as down', () => {
    expect(evaluate({ lastRun: ago(999), lastError: null }, { enabled: false }, NOW).down).toBe(false);
  });
});

describe('decideAlert (transition machine)', () => {
  const fresh = { alertedDown: false, downStreak: 0 };

  it('a single down reading does NOT alert (tolerates one blip)', () => {
    const r = decideAlert(fresh, true);
    expect(r.alert).toBe(null);
    expect(r.state.downStreak).toBe(1);
  });

  it('alerts DOWN only after CONFIRM_DOWN consecutive down readings', () => {
    let s = fresh;
    for (let i = 0; i < CONFIRM_DOWN - 1; i++) s = decideAlert(s, true).state;
    const r = decideAlert(s, true);
    expect(r.alert).toBe('down');
    expect(r.state.alertedDown).toBe(true);
  });

  it('does not re-alert while it stays down', () => {
    const down = { alertedDown: true, downStreak: 5 };
    expect(decideAlert(down, true).alert).toBe(null);
  });

  it('alerts UP (recovery) once when it comes back after having alerted', () => {
    const down = { alertedDown: true, downStreak: 5 };
    const r = decideAlert(down, false);
    expect(r.alert).toBe('up');
    expect(r.state.alertedDown).toBe(false);
    expect(r.state.downStreak).toBe(0);
  });

  it('a blip that recovers before CONFIRM_DOWN never alerts (no down, no phantom recovery)', () => {
    const oneBlip = decideAlert(fresh, true).state;   // streak 1, not alerted
    const recovered = decideAlert(oneBlip, false);
    expect(recovered.alert).toBe(null);
    expect(recovered.state.downStreak).toBe(0);
  });

  it('clamps downStreak at CONFIRM_DOWN so a prolonged outage stops changing state', () => {
    let s = { alertedDown: true, downStreak: CONFIRM_DOWN };
    for (let i = 0; i < 5; i++) s = decideAlert(s, true).state;
    expect(s.downStreak).toBe(CONFIRM_DOWN); // never grows past the cap
  });
});

describe('runMonitor KV write budget (free-tier: skip writes when nothing changed)', () => {
  const NOW = Date.parse('2026-07-17T08:00:00Z');
  const healthyStatus = JSON.stringify({ lastRun: new Date(NOW - 3 * 60000).toISOString(), lastError: null });
  const config = JSON.stringify({ enabled: true, destinations: [] });

  it('a healthy steady tick with fresh heartbeat does NOT write', () => {
    const kv = mockKV({
      'watchdog:status': healthyStatus,
      'watchdog:config': config,
      'monitor:state': JSON.stringify({ alertedDown: false, downStreak: 0, lastCheck: new Date(NOW - 60000).toISOString() }),
    });
    return runMonitor({ KV: kv }, NOW).then(() => expect(kv.puts).toBe(0));
  });

  it('writes once when the heartbeat is due even if nothing changed', () => {
    const kv = mockKV({
      'watchdog:status': healthyStatus,
      'watchdog:config': config,
      'monitor:state': JSON.stringify({ alertedDown: false, downStreak: 0, lastCheck: new Date(NOW - HEARTBEAT_MS - 1).toISOString() }),
    });
    return runMonitor({ KV: kv }, NOW).then(() => expect(kv.puts).toBe(1));
  });

  it('writes when the state changes (a down reading advances the streak)', () => {
    const kv = mockKV({
      'watchdog:status': JSON.stringify({ lastRun: new Date(NOW - 90 * 60000).toISOString(), lastError: null }),
      'watchdog:config': config,
      'monitor:state': JSON.stringify({ alertedDown: false, downStreak: 0, lastCheck: new Date(NOW - 60000).toISOString() }),
    });
    return runMonitor({ KV: kv }, NOW).then(() => expect(kv.puts).toBe(1));
  });
});

describe('evaluateFeed (flight-data staleness → down/up verdict)', () => {
  const NOW = Date.parse('2026-09-02T08:00:00Z');
  const ago = (min) => new Date(NOW - min * 60000).toISOString();
  const st = (min) => ({ lastRun: ago(1), feedFetchedAt: ago(min) });

  it('fresh feed is UP', () => {
    const v = evaluateFeed(st(5), null, NOW);
    expect(v.down).toBe(false);
    expect(v.ageMin).toBe(5);
  });

  // The whole point of the detector: the Pi gates at 6 min and the cloud
  // fallback takes over at 35, so anything under an hour is still a window in
  // which the system is expected to self-heal without paging anyone.
  it('stale but still inside the cloud-fallback window is UP', () => {
    expect(evaluateFeed(st(40), null, NOW).down).toBe(false);
    expect(evaluateFeed(st(DATA_STALE_LIMIT_MIN), null, NOW).down).toBe(false);
  });

  it('past the limit is DOWN and says both paths failed', () => {
    const v = evaluateFeed(st(DATA_STALE_LIMIT_MIN + 1), null, NOW);
    expect(v.down).toBe(true);
    expect(v.reason).toMatch(/both appear down/);
  });

  // Must not page on every deploy just because the watchdog hasn't done a full
  // pass yet — liveness is already covered by evaluate().
  it('missing feedFetchedAt is treated as healthy, not as an alert', () => {
    expect(evaluateFeed({ lastRun: ago(1) }, null, NOW).down).toBe(false);
    expect(evaluateFeed(null, null, NOW).down).toBe(false);
  });

  it('an intentionally disabled watchdog never reports stale data', () => {
    expect(evaluateFeed(st(999), { enabled: false }, NOW).down).toBe(false);
  });

  it('unparseable feedFetchedAt fails safe (no alert)', () => {
    expect(evaluateFeed({ feedFetchedAt: 'not-a-date' }, null, NOW).down).toBe(false);
  });
});

describe('evaluatePi (Pi heartbeat staleness → down/up verdict)', () => {
  const NOW = Date.parse('2026-09-12T08:00:00Z');
  const ago = (min) => new Date(NOW - min * 60000).toISOString();

  it('a fresh heartbeat is UP', () => {
    const v = evaluatePi({ ts: ago(3) }, null, NOW);
    expect(v.down).toBe(false);
    expect(v.ageMin).toBe(3);
  });

  it('a heartbeat right at the limit is still UP', () => {
    expect(evaluatePi({ ts: ago(PI_HEARTBEAT_STALE_MIN) }, null, NOW).down).toBe(false);
  });

  it('past the limit is DOWN and names the gap', () => {
    const v = evaluatePi({ ts: ago(PI_HEARTBEAT_STALE_MIN + 1) }, null, NOW);
    expect(v.down).toBe(true);
    expect(v.reason).toMatch(/no heartbeat from the Pi/);
  });

  // Must not page the moment this monitor is deployed, before the Pi-side script has
  // shipped the heartbeat call — same convention as evaluateFeed's missing-field handling.
  it('no heartbeat ever received is treated as healthy, not as an alert', () => {
    expect(evaluatePi(null, null, NOW).down).toBe(false);
    expect(evaluatePi({}, null, NOW).down).toBe(false);
  });

  it('an intentionally disabled watchdog never reports a dead Pi', () => {
    expect(evaluatePi({ ts: ago(9999) }, { enabled: false }, NOW).down).toBe(false);
  });

  it('unparseable timestamp fails safe (no alert)', () => {
    expect(evaluatePi({ ts: 'not-a-date' }, null, NOW).down).toBe(false);
  });
});

describe('/pi-heartbeat endpoint', () => {
  const env = (kv, key = 'secret123') => ({ KV: kv, PI_HEARTBEAT_KEY: key });
  const post = (extraHeaders = {}) =>
    new Request('https://x/pi-heartbeat', { method: 'POST', headers: extraHeaders });

  it('rejects a request with no key configured on the worker', async () => {
    const res = await worker.fetch(post({ 'X-API-Key': 'anything' }), env(mockKV(), undefined));
    expect(res.status).toBe(401);
  });

  it('rejects a request with a missing or wrong X-API-Key', async () => {
    const kv = mockKV();
    expect((await worker.fetch(post(), env(kv))).status).toBe(401);
    expect((await worker.fetch(post({ 'X-API-Key': 'wrong' }), env(kv))).status).toBe(401);
    expect(kv.puts).toBe(0);
  });

  it('accepts the correct key and writes a heartbeat on first call', async () => {
    const kv = mockKV();
    const res = await worker.fetch(post({ 'X-API-Key': 'secret123' }), env(kv));
    expect(res.status).toBe(200);
    expect(kv.puts).toBe(1);
  });

  it('rate-gates: a second call inside the write-gate window does NOT write again', async () => {
    const kv = mockKV({ 'monitor:piHeartbeat': JSON.stringify({ ts: new Date().toISOString() }) });
    const res = await worker.fetch(post({ 'X-API-Key': 'secret123' }), env(kv));
    expect(res.status).toBe(200); // still 200 — the Pi doesn't need to know or care
    expect(kv.puts).toBe(0);
  });

  it('writes again once the write-gate window has passed', async () => {
    const staleTs = new Date(Date.now() - (PI_HEARTBEAT_WRITE_GATE_MIN + 1) * 60000).toISOString();
    const kv = mockKV({ 'monitor:piHeartbeat': JSON.stringify({ ts: staleTs }) });
    const res = await worker.fetch(post({ 'X-API-Key': 'secret123' }), env(kv));
    expect(res.status).toBe(200);
    expect(kv.puts).toBe(1);
  });
});

describe('Pi heartbeat is a third, independent alert channel', () => {
  const NOW = Date.parse('2026-09-12T08:00:00Z');
  const ago = (min) => new Date(NOW - min * 60000).toISOString();

  // The exact blind spot this was built for: watchdog alive, feed fresh (cloud fallback
  // covering it perfectly), yet the Pi itself has been unreachable for well over an hour.
  it('pages on a dead Pi even though the watchdog and the feed are both healthy', async () => {
    const kv = mockKV({
      'watchdog:status': JSON.stringify({ lastRun: ago(2), feedFetchedAt: ago(5) }),
      'monitor:piHeartbeat': JSON.stringify({ ts: ago(PI_HEARTBEAT_STALE_MIN + 5) }),
    });
    const sent = [];
    const env = { KV: kv, TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' };
    globalThis.fetch = async (_url, opts) => {
      sent.push(JSON.parse(opts.body).text);
      return { ok: true };
    };
    for (let i = 0; i < CONFIRM_DOWN; i++) await runMonitor(env, NOW);
    expect(sent.some((m) => /Pi is unreachable/.test(m))).toBe(true);
    expect(sent.some((m) => /Watchdog DOWN/.test(m))).toBe(false);
    expect(sent.some((m) => /flight data STALE/.test(m))).toBe(false);
  });

  it('recovers with one all-clear once the heartbeat resumes', async () => {
    const kv = mockKV({
      'watchdog:status': JSON.stringify({ lastRun: ago(2), feedFetchedAt: ago(5) }),
      'monitor:piState': JSON.stringify({ alertedDown: true, downStreak: CONFIRM_DOWN }),
      'monitor:piHeartbeat': JSON.stringify({ ts: ago(1) }),
    });
    const sent = [];
    const env = { KV: kv, TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1' };
    globalThis.fetch = async (_url, opts) => { sent.push(JSON.parse(opts.body).text); return { ok: true }; };
    await runMonitor(env, NOW);
    expect(sent.some((m) => /Pi is back/.test(m))).toBe(true);
  });
});

describe('feed staleness is an independent alert channel', () => {
  const NOW = Date.parse('2026-09-02T08:00:00Z');
  const ago = (min) => new Date(NOW - min * 60000).toISOString();

  // A healthy watchdog reporting a dead feed is the exact blind spot this was
  // added for — the liveness channel must stay quiet while the feed channel pages.
  it('pages on a stale feed even though the watchdog itself is alive', async () => {
    const kv = mockKV({
      'watchdog:status': JSON.stringify({ lastRun: ago(2), feedFetchedAt: ago(300) }),
    });
    const sent = [];
    const env = {
      KV: kv,
      TELEGRAM_BOT_TOKEN: 't',
      TELEGRAM_CHAT_ID: '1',
      fetch: undefined,
    };
    globalThis.fetch = async (_url, opts) => {
      sent.push(JSON.parse(opts.body).text);
      return { ok: true };
    };
    // CONFIRM_DOWN consecutive checks before it alerts.
    for (let i = 0; i < CONFIRM_DOWN; i++) await runMonitor(env, NOW);
    expect(sent.some((m) => /flight data STALE/.test(m))).toBe(true);
    expect(sent.some((m) => /Watchdog DOWN/.test(m))).toBe(false);
  });
});
