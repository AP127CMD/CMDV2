import { describe, it, expect } from 'vitest';
import { buildSnapshot, diffSnapshots, suppressActualPairs } from '../src/diff.js';
import { matchesBatchFilter, flightTimestampMs,
  SNAPSHOT_LOOKBACK_MS, SNAPSHOT_LOOKAHEAD_MS, withinSnapshotWindow,
  bangkokDateStr, isActionable, isAnomalousDrop, ANOMALY_MIN_BASELINE, ANOMALY_MAX_STREAK,
  extractFeedSig, planNotifications, MAX_SENDS_PER_DEST } from '../src/index.js';

const SAMPLE_FLIGHTS = [
  { id: '100', batch: 'AP-127', date: '2026-06-10', start: '08:00', end: '09:30',
    status: 'Pending', student: 'SIWAKORN P.', instructor: 'ITTIPOL P.',
    lesson: 'CDGL 04', tail: 'HS-NGT', type: 'DA40TDI' },
  { id: '101', batch: 'AP-126', date: '2026-06-10', start: '10:00', end: '11:00',
    status: 'Pending', student: 'OTHER S.', instructor: 'FI-X',
    lesson: 'CDGL 01', tail: 'HS-TPT', type: 'DA40TDI' },
];

describe('buildSnapshot', () => {
  it('includes all flights regardless of batch', () => {
    const snap = buildSnapshot(SAMPLE_FLIGHTS);
    expect(Object.keys(snap).sort()).toEqual(['100', '101']);
  });

  it('maps by id and extracts tracked fields including batch', () => {
    const snap = buildSnapshot(SAMPLE_FLIGHTS);
    expect(snap['100']).toEqual({
      id: '100', batch: 'AP-127',
      date: '2026-06-10', start: '08:00', end: '09:30',
      status: 'Pending', student: 'SIWAKORN P.', instructor: 'ITTIPOL P.',
      lesson: 'CDGL 04', tail: 'HS-NGT', type: 'DA40TDI',
    });
  });

  it('includes AP-126 batch flight', () => {
    const snap = buildSnapshot(SAMPLE_FLIGHTS);
    expect(snap['101'].batch).toBe('AP-126');
  });
});

describe('diffSnapshots', () => {
  const base = {
    '100': { id: '100', date: '2026-06-10', start: '08:00', end: '09:30',
      status: 'Pending', student: 'SIWAKORN P.', instructor: 'ITTIPOL P.',
      lesson: 'CDGL 04', tail: 'HS-NGT', type: 'DA40TDI' },
  };

  it('detects ADDED when new id appears', () => {
    const next = {
      ...base,
      '200': { id: '200', date: '2026-06-11', start: '09:00', end: '10:30',
        status: 'Pending', student: 'AKARAVIT K.', instructor: 'W-CHAI',
        lesson: 'CDGL 05', tail: 'HS-NGT', type: 'DA40TDI' },
    };
    const events = diffSnapshots(base, next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ADDED');
    expect(events[0].flight.id).toBe('200');
  });

  it('detects REMOVED when id disappears', () => {
    const events = diffSnapshots(base, {});
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('REMOVED');
    expect(events[0].flight.id).toBe('100');
  });

  it('detects CHANGED when tracked field changes', () => {
    const next = { '100': { ...base['100'], start: '10:00', tail: 'HS-TPT' } };
    const events = diffSnapshots(base, next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('CHANGED');
    expect(events[0].diff).toEqual({
      start: { from: '08:00', to: '10:00' },
      tail: { from: 'HS-NGT', to: 'HS-TPT' },
    });
  });

  it('detects STATUS (only status changed)', () => {
    const next = { '100': { ...base['100'], status: 'Completed' } };
    const events = diffSnapshots(base, next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('STATUS');
    expect(events[0].diff).toEqual({ status: { from: 'Pending', to: 'Completed' } });
  });

  it('returns empty array when nothing changed', () => {
    const events = diffSnapshots(base, { ...base });
    expect(events).toHaveLength(0);
  });
});

describe('matchesBatchFilter', () => {
  it("'*' matches any batch", () => {
    expect(matchesBatchFilter('*', 'AP-127')).toBe(true);
    expect(matchesBatchFilter('*', 'HP-55')).toBe(true);
  });

  it('null/undefined filter matches any batch', () => {
    expect(matchesBatchFilter(null, 'AP-127')).toBe(true);
    expect(matchesBatchFilter(undefined, 'HP-55')).toBe(true);
  });

  it('exact string matches only that batch', () => {
    expect(matchesBatchFilter('AP-127', 'AP-127')).toBe(true);
    expect(matchesBatchFilter('AP-127', 'AP-126')).toBe(false);
  });

  it("'!X' excludes batch X and accepts all others", () => {
    expect(matchesBatchFilter('!AP-127', 'AP-127')).toBe(false);
    expect(matchesBatchFilter('!AP-127', 'HP-55')).toBe(true);
    expect(matchesBatchFilter('!AP-127', 'PPL-40')).toBe(true);
  });

  it('array filter matches any batch in the list', () => {
    const filter = ['HP-55', 'HP-57'];
    expect(matchesBatchFilter(filter, 'HP-55')).toBe(true);
    expect(matchesBatchFilter(filter, 'HP-57')).toBe(true);
    expect(matchesBatchFilter(filter, 'AP-127')).toBe(false);
    expect(matchesBatchFilter(filter, 'PPL-40')).toBe(false);
  });

  it('Other AP array covers AP-124/126/128/129', () => {
    const filter = ['AP-124', 'AP-126', 'AP-128', 'AP-129'];
    expect(matchesBatchFilter(filter, 'AP-124')).toBe(true);
    expect(matchesBatchFilter(filter, 'AP-127')).toBe(false);
  });
});

describe('flightTimestampMs', () => {
  it('computes an absolute Bangkok-local timestamp from date + start', () => {
    expect(flightTimestampMs({ date: '2026-07-11', start: '19:00' }))
      .toBe(Date.parse('2026-07-11T19:00:00+07:00'));
  });

  it('missing start time falls back to midnight Bangkok', () => {
    expect(flightTimestampMs({ date: '2026-07-12' })).toBe(Date.parse('2026-07-12T00:00:00+07:00'));
  });

  it('missing date returns 0 (always excluded, never crashes)', () => {
    expect(flightTimestampMs({})).toBe(0);
    expect(flightTimestampMs(null)).toBe(0);
  });
});

describe('bangkokDateStr / isActionable (rolling "today or later" notify filter)', () => {
  it('returns the Bangkok calendar date, not UTC', () => {
    // 2026-07-13T18:00Z is already 2026-07-14 01:00 in Bangkok (+07:00)
    expect(bangkokDateStr(Date.parse('2026-07-13T18:00:00Z'))).toBe('2026-07-14');
    // 2026-07-14T03:00Z is 2026-07-14 10:00 Bangkok
    expect(bangkokDateStr(Date.parse('2026-07-14T03:00:00Z'))).toBe('2026-07-14');
    // just before Bangkok midnight
    expect(bangkokDateStr(Date.parse('2026-07-13T16:59:00Z'))).toBe('2026-07-13');
  });

  it('today and future flights are actionable', () => {
    expect(isActionable({ date: '2026-07-14' }, '2026-07-14')).toBe(true);
    expect(isActionable({ date: '2026-07-20' }, '2026-07-14')).toBe(true);
  });

  it('yesterday/past flights are NOT actionable (the stale-cutoff bug this replaces)', () => {
    expect(isActionable({ date: '2026-07-13' }, '2026-07-14')).toBe(false);
    expect(isActionable({ date: '2026-07-12' }, '2026-07-14')).toBe(false);
  });

  it('a flight with no date is never actionable', () => {
    expect(isActionable({}, '2026-07-14')).toBe(false);
    expect(isActionable(null, '2026-07-14')).toBe(false);
  });
});

describe('isAnomalousDrop (bad/empty-feed guard)', () => {
  it('flags a sudden >50% shrink once a real baseline exists', () => {
    expect(isAnomalousDrop(200, 90)).toBe(true);   // 55% gone → suspect
    expect(isAnomalousDrop(200, 0)).toBe(true);    // empty feed → suspect
    expect(isAnomalousDrop(200, 120)).toBe(false); // 40% drop → within normal churn
  });

  it('does not flag before a real baseline (first runs / tiny data)', () => {
    expect(isAnomalousDrop(0, 0)).toBe(false);
    expect(isAnomalousDrop(ANOMALY_MIN_BASELINE - 1, 0)).toBe(false);
    expect(isAnomalousDrop(ANOMALY_MIN_BASELINE, 0)).toBe(true); // exactly at baseline, empty → suspect
  });

  it('MAX_STREAK is small enough to self-heal within ~15 min', () => {
    expect(ANOMALY_MAX_STREAK).toBeLessThanOrEqual(3);
  });
});

describe('extractFeedSig (skip-on-unchanged signal)', () => {
  const feed = (fetchedAt, tail = '') =>
    `// header\nwindow.FLIGHT_DATA = {"fetchedAt":"${fetchedAt}","tz":"Asia/Bangkok","flights":[${tail}]};`;

  it('same fetchedAt AND same length → identical signature', () => {
    expect(extractFeedSig(feed('2026-07-14T03:00:00Z'))).toBe(extractFeedSig(feed('2026-07-14T03:00:00Z')));
  });

  it('different fetchedAt → different signature', () => {
    expect(extractFeedSig(feed('2026-07-14T03:00:00Z')))
      .not.toBe(extractFeedSig(feed('2026-07-14T03:05:00Z')));
  });

  it('same fetchedAt but different length → different signature (belt-and-suspenders)', () => {
    expect(extractFeedSig(feed('2026-07-14T03:00:00Z')))
      .not.toBe(extractFeedSig(feed('2026-07-14T03:00:00Z', '{"id":"x"}')));
  });

  it('never throws on empty/garbage input', () => {
    expect(() => extractFeedSig('')).not.toThrow();
    expect(() => extractFeedSig(null)).not.toThrow();
    expect(extractFeedSig('no timestamp here')).toContain('?|');
  });
});

describe('planNotifications (bounded, filtered send routing)', () => {
  const ev = (student, batch = 'AP-127') => ({ type: 'ADDED', flight: { student, batch }, diff: {} });
  const dests = [
    { label: 'AP127', batchFilter: 'AP-127', enabled: true },
    { label: 'Nu', batchFilter: '*', studentFilter: 'ANUSORN T.', enabled: true },
    { label: 'HP', batchFilter: ['HP-55', 'HP-57'], enabled: false }, // disabled
  ];

  it('routes events to matching enabled destinations only', () => {
    const plan = planNotifications([ev('ANUSORN T.'), ev('OTHER S.')], dests);
    const byLabel = Object.fromEntries(plan.map(p => [p.dest.label, p.items.length]));
    expect(byLabel).toEqual({ AP127: 2, Nu: 1 }); // AP127 gets both, Nu only Anusorn, HP disabled → absent
  });

  it('respects studentFilter and batchFilter together', () => {
    const plan = planNotifications([ev('ANUSORN T.', 'HP-55')], dests);
    // AP127 batchFilter excludes HP-55; Nu is '*' but studentFilter matches → only Nu
    expect(plan.map(p => p.dest.label)).toEqual(['Nu']);
  });

  it('flags summarize when a destination exceeds MAX_SENDS_PER_DEST', () => {
    const many = Array.from({ length: MAX_SENDS_PER_DEST + 1 }, () => ev('ANUSORN T.'));
    const plan = planNotifications(many, dests);
    expect(plan.find(p => p.dest.label === 'AP127').summarize).toBe(true);
    expect(plan.find(p => p.dest.label === 'Nu').summarize).toBe(true);
  });

  it('does not summarize at or below the cap', () => {
    const some = Array.from({ length: MAX_SENDS_PER_DEST }, () => ev('ANUSORN T.'));
    const plan = planNotifications(some, dests);
    expect(plan.every(p => p.summarize === false)).toBe(true);
  });

  it('omits destinations with no matched events', () => {
    const plan = planNotifications([ev('OTHER S.', 'AP-126')], dests);
    // AP-126 matches neither AP127 (AP-127 only) nor Nu (student mismatch)
    expect(plan).toEqual([]);
  });
});

describe('withinSnapshotWindow (CPU-budget bounded rolling window)', () => {
  const now = Date.parse('2026-07-14T03:00:00+07:00'); // fixed "now" for determinism

  it('window constants are -3 days / +14 days', () => {
    expect(SNAPSHOT_LOOKBACK_MS).toBe(3 * 24 * 60 * 60 * 1000);
    expect(SNAPSHOT_LOOKAHEAD_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('keeps flights dated today', () => {
    expect(withinSnapshotWindow({ date: '2026-07-14', start: '08:00' }, now)).toBe(true);
  });

  it('keeps flights within the look-back window (up to 3 days ago)', () => {
    expect(withinSnapshotWindow({ date: '2026-07-13', start: '08:00' }, now)).toBe(true);
    expect(withinSnapshotWindow({ date: '2026-07-11', start: '03:00' }, now)).toBe(true); // exactly 3d back
  });

  it('keeps future flights within the 14-day look-ahead', () => {
    expect(withinSnapshotWindow({ date: '2026-07-17', start: '06:00' }, now)).toBe(true);
    expect(withinSnapshotWindow({ date: '2026-07-28', start: '03:00' }, now)).toBe(true); // exactly 14d ahead
  });

  it('drops old history that bloated the snapshot (the original CPU-limit cause)', () => {
    expect(withinSnapshotWindow({ date: '2026-04-20', start: '08:00' }, now)).toBe(false);
    expect(withinSnapshotWindow({ date: '2026-07-01', start: '08:00' }, now)).toBe(false);
  });

  it('drops far-future flights beyond the look-ahead — but only from TODAY\'s snapshot, not forever', () => {
    // A flight booked 20 days out isn't tracked yet. This is not data loss: see the
    // "flight enters window" test below — once it's within 14 days, the very next run
    // picks it up and fires ADDED, same as any other new booking.
    expect(withinSnapshotWindow({ date: '2026-08-05', start: '08:00' }, now)).toBe(false);
  });

  it('look-back boundary: exactly 3 days ago is kept, one minute beyond is dropped', () => {
    const atBoundary = now - SNAPSHOT_LOOKBACK_MS;
    expect(flightTimestampMs({ date: '2026-07-11', start: '03:00' })).toBe(atBoundary);
    expect(withinSnapshotWindow({ date: '2026-07-11', start: '03:00' }, now)).toBe(true);
    expect(withinSnapshotWindow({ date: '2026-07-11', start: '02:59' }, now)).toBe(false);
  });

  it('look-ahead boundary: exactly 14 days out is kept, one minute beyond is dropped', () => {
    const atBoundary = now + SNAPSHOT_LOOKAHEAD_MS;
    expect(flightTimestampMs({ date: '2026-07-28', start: '03:00' })).toBe(atBoundary);
    expect(withinSnapshotWindow({ date: '2026-07-28', start: '03:00' }, now)).toBe(true);
    expect(withinSnapshotWindow({ date: '2026-07-28', start: '03:01' }, now)).toBe(false);
  });

  it('flights with no date are excluded (never snapshot garbage)', () => {
    expect(withinSnapshotWindow({}, now)).toBe(false);
  });

  it('a flight aging INTO the window is not silently dropped — it fires ADDED', () => {
    // Simulates two consecutive runs, days apart, on a flight booked 20 days ahead of "day 1".
    const day1 = Date.parse('2026-07-14T03:00:00+07:00');
    const day8 = Date.parse('2026-07-21T03:00:00+07:00'); // 7 days later — flight now 13 days out
    const farFlight = { id: 'BK-FAR-1', batch: 'AP-127', date: '2026-08-03', start: '09:00', end: '10:00',
      status: 'Pending', student: 'ANUSORN T.', instructor: 'FI-X', lesson: 'CDGL 30', tail: 'HS-TVE', type: 'DA40' };

    // Day 1: 20 days out — outside the 14-day look-ahead, not in the snapshot.
    const relevantDay1 = [farFlight].filter(f => withinSnapshotWindow(f, day1));
    expect(relevantDay1).toHaveLength(0);
    const snapDay1 = buildSnapshot(relevantDay1);

    // Day 8: now 13 days out — inside the window. The diff against day 1's (empty-of-this-flight)
    // snapshot must fire ADDED, not silently absorb it as if it had always been there.
    const relevantDay8 = [farFlight].filter(f => withinSnapshotWindow(f, day8));
    expect(relevantDay8).toHaveLength(1);
    const snapDay8 = buildSnapshot(relevantDay8);

    const events = diffSnapshots(snapDay1, snapDay8);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ADDED');
    expect(events[0].flight.id).toBe('BK-FAR-1');
    expect(events[0].flight.student).toBe('ANUSORN T.');
  });
});

describe('suppressActualPairs', () => {
  const completed = { type: 'ADDED', flight: { id: 'ACTUAL_ONLY_200', status: 'Completed',
    student: 'SIWAKORN P.', lesson: 'CDGL 04' }, diff: {} };
  const removed  = { type: 'REMOVED', flight: { id: '100', status: 'Pending',
    student: 'SIWAKORN P.', lesson: 'CDGL 04' }, diff: {} };
  const canceled = { type: 'STATUS', flight: { id: '100', student: 'SIWAKORN P.',
    lesson: 'CDGL 04' }, diff: { status: { from: 'Pending', to: 'Canceled' } } };

  it('keeps ADDED(Completed) and suppresses paired REMOVED', () => {
    const result = suppressActualPairs([completed, removed]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ADDED');
    expect(result[0].flight.status).toBe('Completed');
  });

  it('keeps ADDED(Completed) and suppresses paired STATUS→Canceled', () => {
    const result = suppressActualPairs([completed, canceled]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ADDED');
  });

  it('keeps standalone ADDED(Completed) with no paired cancel', () => {
    const result = suppressActualPairs([completed]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('ADDED');
  });

  it('does not suppress unrelated events', () => {
    const other = { type: 'ADDED', flight: { id: '300', status: 'Pending',
      student: 'AKARAVIT K.', lesson: 'CDGL 05' }, diff: {} };
    const result = suppressActualPairs([completed, removed, other]);
    expect(result).toHaveLength(2);
    expect(result.find(e => e.flight.id === '300')).toBeTruthy();
  });
});
