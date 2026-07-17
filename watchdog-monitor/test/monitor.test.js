import { describe, it, expect } from 'vitest';
import { evaluate, decideAlert, CONFIRM_DOWN } from '../src/index.js';

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
});
