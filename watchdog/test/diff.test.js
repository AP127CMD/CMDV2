import { describe, it, expect } from 'vitest';
import { buildSnapshot, diffSnapshots, suppressActualPairs } from '../src/diff.js';
import { matchesBatchFilter } from '../src/index.js';

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
