import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildCombinedMessages, sendTelegram, MAX_MESSAGE_CHARS } from '../src/telegram.js';

const ROSTER = [
  { scheduleName: 'SIWAKORN P.', telegramUsername: 'siwakorn_p' },
  { scheduleName: 'AKARAVIT K.', telegramUsername: null },
];

const BASE_FLIGHT = {
  id: '100', date: '2026-06-10', start: '08:00', end: '09:30',
  status: 'Pending', student: 'SIWAKORN P.', instructor: 'ITTIPOL P.',
  lesson: 'CDGL 04', tail: 'HS-NGT',
};

describe('buildCombinedMessages', () => {
  it('single ADDED event: header says "1 update", group header shown, SP+FI+full time range+tail all present', () => {
    const [msg] = buildCombinedMessages('AP127', [{ type: 'ADDED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    const lines = msg.split('\n');
    expect(lines[0]).toBe('📋 AP127 — 1 update');
    expect(lines[1]).toBe('✈️ New');
    expect(msg).toContain('SIWAKORN P.');
    expect(msg).toContain('@siwakorn_p');
    expect(msg).toContain('FI ITTIPOL P.');
    expect(msg).toContain('08:00–09:30');
    expect(msg).toContain('HS-NGT');
  });

  it('plain name (no @) when the SP has no mapped Telegram username', () => {
    const flight = { ...BASE_FLIGHT, student: 'AKARAVIT K.' };
    const [msg] = buildCombinedMessages('AP127', [{ type: 'ADDED', flight, diff: {} }], ROSTER);
    expect(msg).toContain('AKARAVIT K.');
    expect(msg).not.toContain('@');
  });

  it('plural header for multiple events: "N updates"', () => {
    const events = [
      { type: 'ADDED', flight: BASE_FLIGHT, diff: {} },
      { type: 'REMOVED', flight: { ...BASE_FLIGHT, id: '101' }, diff: {} },
    ];
    const [msg] = buildCombinedMessages('AP127', events, ROSTER);
    expect(msg.split('\n')[0]).toBe('📋 AP127 — 2 updates');
  });

  it('header omits the destination label segment when destLabel is falsy', () => {
    const [msg] = buildCombinedMessages('', [{ type: 'ADDED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    expect(msg.split('\n')[0]).toBe('📋 1 update');
  });

  it('groups in urgency order (Cancelled, Changed, Status update, New, Completed); empty groups omitted', () => {
    const events = [
      { type: 'ADDED', flight: { ...BASE_FLIGHT, id: '1' }, diff: {} }, // New
      { type: 'REMOVED', flight: { ...BASE_FLIGHT, id: '2' }, diff: {} }, // Cancelled
      { type: 'CHANGED', flight: { ...BASE_FLIGHT, id: '3', tail: 'HS-TPT' },
        diff: { tail: { from: 'HS-NGT', to: 'HS-TPT' } } }, // Changed
    ];
    const [msg] = buildCombinedMessages('AP127', events, ROSTER);
    const known = ['❌ Cancelled', '⚠️ Changed', '🔄 Status update', '✈️ New', '✅ Completed'];
    const headerLines = msg.split('\n').filter(l => known.includes(l));
    expect(headerLines).toEqual(['❌ Cancelled', '⚠️ Changed', '✈️ New']);
  });

  it('REMOVED is in the Cancelled group and shows the flight\'s full time range', () => {
    const [msg] = buildCombinedMessages('AP127', [{ type: 'REMOVED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    expect(msg).toContain('❌ Cancelled');
    expect(msg).toContain('08:00–09:30');
  });

  it('a same-id reassignment REMOVED shows who replaced the old owner (2026-07-26 fix)', () => {
    const event = { type: 'REMOVED', flight: { ...BASE_FLIGHT, student: 'ANUSORN T.', lesson: 'CDXV 32' },
      diff: { reassignedTo: { student: 'PARAMUTT C.', batch: 'AP-126' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('❌ Cancelled');
    expect(msg).toContain('ANUSORN T.');
    expect(msg).toContain('reassigned to PARAMUTT C. (AP-126)');
  });

  it('a same-id reassignment ADDED shows who it was reassigned from', () => {
    const event = { type: 'ADDED', flight: { ...BASE_FLIGHT, student: 'PARAMUTT C.', lesson: 'CDXI 73', batch: 'AP-126' },
      diff: { reassignedFrom: { student: 'ANUSORN T.', batch: 'AP-127' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('✈️ New');
    expect(msg).toContain('PARAMUTT C.');
    expect(msg).toContain('reassigned from ANUSORN T. (AP-127)');
  });

  it('a normal REMOVED/ADDED with no reassignment shows no reassignment line', () => {
    const [msg] = buildCombinedMessages('AP127', [{ type: 'REMOVED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    expect(msg).not.toContain('reassigned');
  });

  it('STATUS → Canceled is in the Cancelled group, not a separate Status update group', () => {
    const event = { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'Canceled' },
      diff: { status: { from: 'Pending', to: 'Canceled' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('❌ Cancelled');
    expect(msg).not.toContain('🔄 Status update');
  });

  it('a non-completion, non-cancellation STATUS change is in Status update and shows the transition', () => {
    const event = { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'On-Hold' },
      diff: { status: { from: 'Pending', to: 'On-Hold' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('🔄 Status update');
    expect(msg).toContain('Pending→On-Hold');
  });

  it('a time change always shows the full old range and full new range together, never a bare start time', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, start: '08:30', end: '10:15' },
      diff: { start: { from: '08:00', to: '08:30' }, end: { from: '09:30', to: '10:15' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('08:00–09:30 → 08:30–10:15');
  });

  it('an unchanged time still renders as a full range with no arrow', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, tail: 'HS-TPT' },
      diff: { tail: { from: 'HS-NGT', to: 'HS-TPT' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('08:00–09:30');
    expect(msg).not.toContain('→ 08:00–09:30');
  });

  it('a tail change is shown as an arrow inline', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, tail: 'HS-TPT' },
      diff: { tail: { from: 'HS-NGT', to: 'HS-TPT' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('HS-NGT→HS-TPT');
  });

  it('Completed via in-place STATUS transition shows planned→flew, tail, and FI', () => {
    const event = { type: 'STATUS',
      flight: { ...BASE_FLIGHT, student: 'RATTANASUDA', lesson: 'LPC SEP', instructor: 'WUTTHICHAI L.',
                 tail: 'HS-TPX', date: '2026-07-17', start: '08:34', end: '09:58' },
      diff: { status: { from: 'Pending', to: 'Completed' },
              start: { from: '08:30', to: '08:34' }, end: { from: '10:10', to: '09:58' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('✅ Completed');
    expect(msg).toContain('RATTANASUDA — LPC SEP · FI WUTTHICHAI L.');
    expect(msg).toContain('planned 08:30–10:10 → flew 08:34–09:58 · HS-TPX');
  });

  it('Completed via ADDED (ACTUAL_ONLY record, no diff) shows the plain flown time, not "planned → flew"', () => {
    const event = { type: 'ADDED',
      flight: { ...BASE_FLIGHT, status: 'Completed', lesson: 'CDGL 03', tail: 'HS-TPT' }, diff: {} };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('✅ Completed');
    expect(msg).not.toContain('planned');
    expect(msg).toContain('08:00–09:30 · HS-TPT');
  });

  it('Completed shows touch-and-go count and actual clock times with collision-free labels', () => {
    const event = { type: 'STATUS',
      flight: { ...BASE_FLIGHT, status: 'Completed', to: 1, ldg: 1, tkoff: '08:34', ldgTime: '09:56', inst: 0 },
      diff: { status: { from: 'Pending', to: 'Completed' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('1 T/O · 1 LDG · TO 08:34 · LDG 09:56');
    expect(msg).not.toContain('INST'); // inst is 0 — must not show
  });

  it('Completed omits actual-data fields entirely when the feed has none (older records)', () => {
    const event = { type: 'ADDED', flight: { ...BASE_FLIGHT, status: 'Completed' }, diff: {} };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).not.toContain('T/O');
    expect(msg).not.toContain(' TO ');
    expect(msg).not.toContain('LDG');
  });

  it('Completed shows INST only when non-zero', () => {
    const event = { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'Completed', inst: 2 },
      diff: { status: { from: 'Pending', to: 'Completed' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('INST 2');
  });

  it('actual clock times of "00:00" are treated as not-recorded and omitted, even when counts are present', () => {
    const event = { type: 'STATUS',
      flight: { ...BASE_FLIGHT, status: 'Completed', tkoff: '00:00', ldgTime: '00:00', to: 2, ldg: 2 },
      diff: { status: { from: 'Pending', to: 'Completed' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('2 T/O · 2 LDG');
    expect(msg).not.toContain('TO 00:00');
    expect(msg).not.toContain('LDG 00:00');
  });

  it('splits into multiple chunks when content exceeds the char budget; each chunk stays under the Telegram limit', () => {
    // 30 synthetic Completed events with full actual data (the densest per-event block) forces a
    // real overflow past MAX_MESSAGE_CHARS without needing to mock the constant.
    const events = Array.from({ length: 30 }, (_, i) => ({
      type: 'STATUS',
      flight: { id: String(i), date: '2026-07-25', start: '08:00', end: '09:30',
        status: 'Completed', student: `STUDENT ${i} WITH A FAIRLY LONG NAME`, instructor: 'SOME INSTRUCTOR NAME',
        lesson: 'CDGL 01', tail: 'HS-NGT', to: 2, ldg: 2, tkoff: '08:02', ldgTime: '09:28', inst: 5 },
      diff: { status: { from: 'Pending', to: 'Completed' },
              start: { from: '08:00', to: '08:02' }, end: { from: '09:30', to: '09:28' } },
    }));
    const messages = buildCombinedMessages('AP127', events, []);
    expect(messages.length).toBeGreaterThan(1);
    for (const msg of messages) expect(msg.length).toBeLessThanOrEqual(4096);
    expect(messages[0].split('\n')[0]).toMatch(/\(1\/\d+\)$/);
    expect(messages[1].split('\n')[0]).toMatch(/\(2\/\d+\)$/);
    // The group header must reappear in every chunk that has events, not just the first.
    for (const msg of messages) expect(msg).toContain('✅ Completed');
  });

  it('MAX_MESSAGE_CHARS leaves headroom under Telegram\'s 4096 hard limit', () => {
    expect(MAX_MESSAGE_CHARS).toBeLessThan(4096);
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
