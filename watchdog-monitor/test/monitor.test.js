import { describe, it, expect } from 'vitest';
import { evaluate, decideAlert, CONFIRM_DOWN } from '../src/index.js';

describe('evaluate (status → down/up verdict)', () => {
  it('unreachable /status (fetch failed) is DOWN', () => {
    expect(evaluate(null, false).down).toBe(true);
    expect(evaluate(null, false).reason).toMatch(/unreachable/);
  });

  it('healthy watchdog is UP', () => {
    expect(evaluate({ healthy: true, staleMinutes: 3, enabled: true }, true).down).toBe(false);
  });

  it('healthy:false with a long stale gap is DOWN and names the gap', () => {
    const v = evaluate({ healthy: false, staleMinutes: 45, enabled: true, lastError: null }, true);
    expect(v.down).toBe(true);
    expect(v.reason).toMatch(/45 min/);
  });

  it('healthy:false with a lastError is DOWN and surfaces the error', () => {
    const v = evaluate({ healthy: false, staleMinutes: 5, enabled: true, lastError: 'Upstream HTTP 502' }, true);
    expect(v.down).toBe(true);
    expect(v.reason).toMatch(/502/);
  });

  it('intentionally disabled watchdog is NOT treated as down', () => {
    expect(evaluate({ healthy: false, enabled: false }, true).down).toBe(false);
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
