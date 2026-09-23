import { describe, it, expect } from 'vitest';
import {
  routeCodes, legRoute, flightLegs, spanMinutes, fmtMinutes, tripComplete, legsSignature,
  settleCompletions, nextHeldDueAt, isCompletionEvent, SETTLE_MS, MAX_HOLD_MS,
} from '../src/completion.js';

// Real 2026-09-23 SETASIT P. CSXV 45 XC legs (see CMD_CTR scripts/tests/test_flight_legs.py).
const L1 = { leg: '1', routeFrom: 'VTPH', routeTo: 'VTSB', blockOff: '06:30', tkoff: '06:40', ldgTime: '08:35', blockOn: '08:40' };
const L2 = { leg: '2', routeFrom: 'VTSB', routeTo: 'VTSE', blockOff: '08:46', tkoff: '08:50', ldgTime: '10:20', blockOn: '10:25' };
const L3 = { leg: '3', routeFrom: 'VTSE', routeTo: 'VTPH', blockOff: '10:30', tkoff: '10:36', ldgTime: '11:47', blockOn: '11:52' };

const done = (over = {}) => ({ id: 'X', status: 'Completed', date: '2026-09-23', ...over });

describe('routes', () => {
  it('flattens the free-text route forms seen live, collapsing repeated codes', () => {
    expect(routeCodes('VTPH', 'VTSE-VTPH')).toEqual(['VTPH', 'VTSE', 'VTPH']);
    expect(routeCodes('VTPH-VTBP-VTSE', 'VTPH')).toEqual(['VTPH', 'VTBP', 'VTSE', 'VTPH']);
    expect(routeCodes('VTPH - KHAOWANG', 'VTPH')).toEqual(['VTPH', 'KHAOWANG', 'VTPH']);
    expect(routeCodes('VTPH', 'HOTEL -VTPH')).toEqual(['VTPH', 'HOTEL', 'VTPH']);
    expect(routeCodes('VTPH-VTBU', 'VTBU-VTPH')).toEqual(['VTPH', 'VTBU', 'VTPH']);
    expect(routeCodes(null, '-')).toEqual([]);
  });

  it('a local sortie reads X→X, never a bare code', () => {
    expect(legRoute({ routeFrom: 'VTPH', routeTo: 'VTPH' })).toBe('VTPH→VTPH');
    expect(legRoute({ routeFrom: 'VTPH', routeTo: 'VTSB' })).toBe('VTPH→VTSB');
    expect(legRoute({})).toBe('—');
  });
});

describe('flightLegs', () => {
  it('uses `legs` when present, else the flight\'s own record as one leg, else nothing', () => {
    expect(flightLegs(done({ legs: [L1, L2] }))).toEqual([L1, L2]);
    const own = flightLegs(done({ leg: '3', ...L3, legs: undefined }));
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ leg: '3', routeFrom: 'VTSE', blockOn: '11:52' });
    expect(flightLegs(done({ start: '06:30', end: '07:45' }))).toEqual([]);
  });
});

describe('durations', () => {
  it('span and format, across midnight, null when a time is missing', () => {
    expect(spanMinutes('06:30', '08:40')).toBe(130);
    expect(spanMinutes('23:50', '00:20')).toBe(30);
    expect(spanMinutes('06:30', null)).toBeNull();
    expect(fmtMinutes(311)).toBe('5:11');
    expect(fmtMinutes(50)).toBe('0:50');
  });
});

describe('tripComplete', () => {
  it('unnumbered single record (ordinary local sortie) → complete, nothing to wait for', () => {
    expect(tripComplete(done({ routeFrom: 'VTPH', routeTo: 'VTPH', blockOff: '06:30' }))).toBe(true);
    expect(tripComplete(done())).toBe(true); // no record at all → nothing to wait for either
  });
  it('legs 1..n that return to the start → complete', () => {
    expect(tripComplete(done({ legs: [L1, L2, L3] }))).toBe(true);
  });
  it('one-way, or a gap in the numbering → not yet', () => {
    expect(tripComplete(done({ leg: '1', ...L1 }))).toBe(false);          // VTPH→VTSB only
    expect(tripComplete(done({ legs: [L1, L3] }))).toBe(false);           // leg 2 missing
    expect(tripComplete(done({ legs: [L1, L2] }))).toBe(false);           // not back yet
  });
});

describe('settleCompletions', () => {
  const T0 = Date.parse('2026-09-23T07:30:00Z');
  const completion = flight => ({ type: 'ADDED', diff: {}, flight });
  const other = { type: 'REMOVED', diff: {}, flight: { id: 'Y', status: 'Pending' } };

  it('passes non-completions and complete trips straight through', () => {
    const local = done({ id: 'L', routeFrom: 'VTPH', routeTo: 'VTPH', blockOff: '06:30' });
    const r = settleCompletions({ events: [other, completion(local)], nowMs: T0 });
    expect(r.events.map(e => e.flight.id)).toEqual(['Y', 'L']);
    expect(r.held).toEqual({});
    expect(r.dirty).toBe(false);
  });

  it('holds a leg-1-only XC, then releases it ONCE with all three legs when the trip closes', () => {
    const leg1 = done({ leg: '1', ...L1 });
    const r1 = settleCompletions({ events: [completion(leg1)], nowMs: T0 });
    expect(r1.events).toEqual([]);
    expect(Object.keys(r1.held)).toEqual(['X']);
    expect(nextHeldDueAt(r1.held)).toBe(T0 + SETTLE_MS);

    // Next feed: the Flight Records for legs 2 and 3 have landed. No new diff event for X.
    const snap = { X: done({ leg: '3', ...L3, legs: [L1, L2, L3] }) };
    const r2 = settleCompletions({ events: [], held: r1.held, snap, nowMs: T0 + 7 * 60e3 });
    expect(r2.events).toHaveLength(1);
    expect(r2.events[0].type).toBe('ADDED');
    expect(r2.events[0].flight.legs).toHaveLength(3);
    expect(r2.held).toEqual({});
  });

  it('a one-way trip is released once its legs stop changing for SETTLE_MS', () => {
    const leg1 = done({ leg: '1', ...L1 });
    const { held } = settleCompletions({ events: [completion(leg1)], nowMs: T0 });
    const snap = { X: leg1 };
    expect(settleCompletions({ held, snap, nowMs: T0 + SETTLE_MS - 1 }).events).toEqual([]);
    const r = settleCompletions({ held, snap, nowMs: T0 + SETTLE_MS });
    expect(r.events.map(e => e.flight.id)).toEqual(['X']);
  });

  it('new legs restart the settle clock; MAX_HOLD_MS releases regardless', () => {
    const leg1 = done({ leg: '1', ...L1 });
    let { held } = settleCompletions({ events: [completion(leg1)], nowMs: T0 });
    ({ held } = settleCompletions({ held, snap: { X: done({ legs: [L1, L2] }) }, nowMs: T0 + 9 * 60e3 }));
    expect(held.X.changedAt).toBe(T0 + 9 * 60e3);
    expect(settleCompletions({ held, snap: { X: done({ legs: [L1, L2] }) }, nowMs: T0 + 12 * 60e3 }).events).toEqual([]);
    expect(settleCompletions({ held, nowMs: T0 + MAX_HOLD_MS }).events).toHaveLength(1);
  });

  it('a quiet run (no snapshot) can still release on time, with the last flight it saw', () => {
    const leg1 = done({ leg: '1', ...L1 });
    const { held } = settleCompletions({ events: [completion(leg1)], nowMs: T0 });
    const r = settleCompletions({ held, snap: null, nowMs: T0 + SETTLE_MS });
    expect(r.events[0].flight).toEqual(leg1);
  });

  it('drops a hold quietly when the flight is gone or no longer Completed', () => {
    const { held } = settleCompletions({ events: [completion(done({ leg: '1', ...L1 }))], nowMs: T0 });
    for (const snap of [{}, { X: done({ status: 'Canceled' }) }]) {
      const r = settleCompletions({ held, snap, nowMs: T0 + 60e3 });
      expect(r.events).toEqual([]);
      expect(r.held).toEqual({});
      expect(r.dirty).toBe(true);
    }
  });

  it('keeps the original event type/diff on release (in-place STATUS completion)', () => {
    const e = { type: 'STATUS', diff: { status: { from: 'Pending', to: 'Completed' } }, flight: done({ leg: '1', ...L1 }) };
    expect(isCompletionEvent(e)).toBe(true);
    const { held } = settleCompletions({ events: [e], nowMs: T0 });
    const [rel] = settleCompletions({ held, nowMs: T0 + MAX_HOLD_MS }).events;
    expect(rel.type).toBe('STATUS');
    expect(rel.diff.status.to).toBe('Completed');
  });

  it('legsSignature ignores non-leg fields', () => {
    expect(legsSignature(done({ legs: [L1] , lesson: 'A' }))).toBe(legsSignature(done({ legs: [L1], lesson: 'B' })));
  });
});
