import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatMessage, formatSummary, sendTelegram } from '../src/telegram.js';

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
  it('ADDED: SP on line 1, FI on line 2, date/time on line 3', () => {
    const msg = formatMessage({ type: 'ADDED', flight: BASE_FLIGHT, diff: {} }, ROSTER);
    const lines = msg.split('\n');
    expect(lines[0]).toBe('✈️ New flight');
    expect(lines[1]).toContain('SIWAKORN P.');
    expect(lines[1]).toContain('@siwakorn_p');
    expect(lines[2]).toContain('ITTIPOL P.');
    expect(lines[3]).toContain('08:00–09:30');
    expect(msg).toContain('CDGL 04');
    expect(msg).toContain('HS-NGT');
  });

  it('ADDED: plain name when no username', () => {
    const flight = { ...BASE_FLIGHT, student: 'AKARAVIT K.' };
    const msg = formatMessage({ type: 'ADDED', flight, diff: {} }, ROSTER);
    expect(msg).toContain('AKARAVIT K.');
    expect(msg).not.toContain('@');
  });

  it('ADDED with Completed status shows ✅ Flight completed', () => {
    const flight = { ...BASE_FLIGHT, status: 'Completed' };
    const msg = formatMessage({ type: 'ADDED', flight, diff: {} }, ROSTER);
    const lines = msg.split('\n');
    expect(lines[0]).toBe('✅ Flight completed');
    expect(lines[1]).toContain('SIWAKORN P.');
    expect(lines[1]).toContain('@siwakorn_p');
    expect(lines[2]).toContain('ITTIPOL P.');
    expect(msg).not.toContain('✈️');
  });

  it('REMOVED: FI on line 2', () => {
    const msg = formatMessage({ type: 'REMOVED', flight: BASE_FLIGHT, diff: {} }, ROSTER);
    const lines = msg.split('\n');
    expect(lines[0]).toBe('❌ Flight cancelled');
    expect(lines[1]).toContain('SIWAKORN P.');
    expect(lines[1]).toContain('@siwakorn_p');
    expect(lines[2]).toContain('ITTIPOL P.');
    expect(msg).toContain('CDGL 04');
  });

  it('STATUS → Completed shows ✅ Flight completed', () => {
    const msg = formatMessage(
      { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'Completed' },
        diff: { status: { from: 'Pending', to: 'Completed' } } },
      ROSTER,
    );
    const lines = msg.split('\n');
    expect(lines[0]).toBe('✅ Flight completed');
    expect(lines[1]).toContain('SIWAKORN P.');
    expect(lines[1]).toContain('@siwakorn_p');
    expect(lines[2]).toContain('ITTIPOL P.');
    expect(msg).not.toContain('🔄');
  });

  it('STATUS → Completed WITH recorded actual times shows completed (not "updated") + planned→actual', () => {
    const msg = formatMessage(
      { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'Completed', start: '08:34', end: '09:58' },
        diff: { status: { from: 'Pending', to: 'Completed' },
                start: { from: '08:00', to: '08:34' }, end: { from: '09:30', to: '09:58' } } },
      ROSTER,
    );
    const lines = msg.split('\n');
    expect(lines[0]).toBe('✅ Flight completed');
    expect(msg).not.toContain('⚠️');           // the reported bug: was "⚠️ Flight updated"
    expect(msg).toContain('08:34–09:58');      // actual flown times
    expect(msg).toContain('08:00–09:30');      // planned times, shown as reference
  });

  it('STATUS → Canceled bundled with a time change is not mislabeled "Flight updated"', () => {
    const msg = formatMessage(
      { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'Canceled', start: '10:00' },
        diff: { status: { from: 'Pending', to: 'Canceled' }, start: { from: '08:00', to: '10:00' } } },
      ROSTER,
    );
    const lines = msg.split('\n');
    expect(lines[0]).toBe('🔄 Status update');
    expect(msg).not.toContain('⚠️ Flight updated');
    expect(msg).toContain('Canceled');
    expect(msg).toContain('08:00');
    expect(msg).toContain('10:00');
  });

  it('STATUS → Canceled shows 🔄 status update', () => {
    const msg = formatMessage(
      { type: 'STATUS', flight: BASE_FLIGHT,
        diff: { status: { from: 'Pending', to: 'Canceled' } } },
      ROSTER,
    );
    const lines = msg.split('\n');
    expect(lines[0]).toBe('🔄 Status update');
    expect(lines[1]).toContain('SIWAKORN P.');
    expect(lines[1]).toContain('@siwakorn_p');
    expect(lines[2]).toContain('ITTIPOL P.');
    expect(msg).toContain('Pending');
    expect(msg).toContain('Canceled');
    expect(msg).not.toContain('✅');
  });

  it('CHANGED: FI on line 2', () => {
    const msg = formatMessage(
      { type: 'CHANGED', flight: { ...BASE_FLIGHT, start: '10:00', tail: 'HS-TPT' },
        diff: { start: { from: '08:00', to: '10:00' }, tail: { from: 'HS-NGT', to: 'HS-TPT' } } },
      ROSTER,
    );
    const lines = msg.split('\n');
    expect(lines[0]).toBe('⚠️ Flight updated');
    expect(lines[1]).toContain('SIWAKORN P.');
    expect(lines[1]).toContain('@siwakorn_p');
    expect(lines[2]).toContain('ITTIPOL P.');
    expect(msg).toContain('08:00');
    expect(msg).toContain('10:00');
  });
});

describe('sendTelegram', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns message_id on success', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { message_id: 42 } }),
    })));
    const id = await sendTelegram('TOKEN', '-100123', 'hello');
    expect(id).toBe(42);
  });

  it('throws on Telegram API error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: false, description: 'Bad Request' }),
    })));
    await expect(sendTelegram('TOKEN', '-100123', 'hello')).rejects.toThrow('Bad Request');
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 401 })));
    await expect(sendTelegram('TOKEN', '-100123', 'hello')).rejects.toThrow('401');
  });
});

describe('formatSummary (bounded mass-change message)', () => {
  const ev = (type) => ({ type, flight: { student: 'X' }, diff: {} });

  it('counts events by type and names the destination', () => {
    const msg = formatSummary('AP127', [ev('ADDED'), ev('ADDED'), ev('REMOVED'), ev('CHANGED')]);
    expect(msg).toContain('4 flight updates');
    expect(msg).toContain('AP127');
    expect(msg).toContain('2 new/updated');
    expect(msg).toContain('1 cancelled');
    expect(msg).toContain('1 changed');
    expect(msg).toContain('dashboard');
  });

  it('handles a single type', () => {
    const msg = formatSummary('Nu', [ev('REMOVED'), ev('REMOVED')]);
    expect(msg).toContain('2 flight updates');
    expect(msg).toContain('2 cancelled');
  });
});
