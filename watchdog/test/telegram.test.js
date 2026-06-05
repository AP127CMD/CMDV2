import { describe, it, expect } from 'vitest';
import { formatMessage } from '../src/telegram.js';

const ROSTER = [
  { scheduleName: 'SIWAKORN P.', telegramUsername: 'siwakorn_p' },
  { scheduleName: 'AKARAVIT K.', telegramUsername: null },
];

const BASE_FLIGHT = {
  id: '100', date: '2026-06-10', start: '08:00', end: '09:30',
  status: 'Pending', student: 'SIWAKORN P.', instructor: 'ITTIPOL P.',
  lesson: 'CDGL 04', tail: 'HS-NGT',
};

describe('formatMessage', () => {
  it('ADDED uses @mention when username mapped', () => {
    const msg = formatMessage({ type: 'ADDED', flight: BASE_FLIGHT, diff: {} }, ROSTER);
    expect(msg).toContain('@siwakorn_p');
    expect(msg).toContain('✈️');
    expect(msg).toContain('CDGL 04');
    expect(msg).toContain('HS-NGT');
    expect(msg).toContain('ITTIPOL P.');
    expect(msg).toContain('08:00–09:30');
  });

  it('ADDED uses plain name when no username', () => {
    const flight = { ...BASE_FLIGHT, student: 'AKARAVIT K.' };
    const msg = formatMessage({ type: 'ADDED', flight, diff: {} }, ROSTER);
    expect(msg).toContain('AKARAVIT K.');
    expect(msg).not.toContain('@');
  });

  it('REMOVED shows cancel emoji and lesson', () => {
    const msg = formatMessage({ type: 'REMOVED', flight: BASE_FLIGHT, diff: {} }, ROSTER);
    expect(msg).toContain('❌');
    expect(msg).toContain('CDGL 04');
    expect(msg).toContain('@siwakorn_p');
  });

  it('STATUS shows old and new status', () => {
    const msg = formatMessage(
      { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'Completed' },
        diff: { status: { from: 'Pending', to: 'Completed' } } },
      ROSTER,
    );
    expect(msg).toContain('🔄');
    expect(msg).toContain('Pending');
    expect(msg).toContain('Completed');
  });

  it('CHANGED shows changed fields', () => {
    const msg = formatMessage(
      { type: 'CHANGED', flight: { ...BASE_FLIGHT, start: '10:00', tail: 'HS-TPT' },
        diff: { start: { from: '08:00', to: '10:00' }, tail: { from: 'HS-NGT', to: 'HS-TPT' } } },
      ROSTER,
    );
    expect(msg).toContain('⚠️');
    expect(msg).toContain('08:00');
    expect(msg).toContain('10:00');
    expect(msg).toContain('HS-NGT');
    expect(msg).toContain('HS-TPT');
  });
});
