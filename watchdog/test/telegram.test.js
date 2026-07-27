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

// 2026-07-26 redesign (real-user feedback: the prior single-line-per-event format wrapped mid-arrow
// on a phone screen — "line-cut"). New shape per event:
//   {typeEmoji} {SP} ({@handle})
//   {unchanged context: lesson · 🗣️ FI · 📅 date}
//   - {icon} {value, or old → 🆕 new if changed}   (one dash-bulleted line per fact)
// 🆕 sits directly before the NEW value inside an arrow so there's never ambiguity about which side
// is current. A changed lesson/FI/date is promoted OUT of the context line into its own dash line
// (avoids showing it twice). Completed drops the words "planned"/"flew" (icon-only: ⏰ then ✍️) and
// never shows 🆕 (it's a factual record, not something to flag as new).
describe('buildCombinedMessages', () => {
  it('single ADDED event: header, group header, type-emoji+SP line, context line, dash-bulleted facts', () => {
    const [msg] = buildCombinedMessages('AP127', [{ type: 'ADDED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    const lines = msg.split('\n');
    expect(lines[0]).toBe('📋 AP127 — 1 update');
    expect(lines[1]).toBe('✈️ New');
    expect(msg).toContain('✈️ SIWAKORN P. (@siwakorn_p)');
    expect(msg).toContain('CDGL 04 · 🗣️ ITTIPOL P. · 📅 10 Jun');
    expect(msg).toContain('- ⏰ 08:00–09:30');
    expect(msg).toContain('- 🛩 HS-NGT');
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

  it('REMOVED is in the Cancelled group, ❌ prefixes the SP line, full time shown as a dash line', () => {
    const [msg] = buildCombinedMessages('AP127', [{ type: 'REMOVED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    expect(msg).toContain('❌ Cancelled');
    expect(msg).toContain('❌ SIWAKORN P.');
    expect(msg).toContain('- ⏰ 08:00–09:30');
  });

  it('a same-id reassignment REMOVED shows who replaced the old owner', () => {
    const event = { type: 'REMOVED', flight: { ...BASE_FLIGHT, student: 'ANUSORN T.', lesson: 'CDXV 32' },
      diff: { reassignedTo: { student: 'PARAMUTT C.', batch: 'AP-126' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('❌ Cancelled');
    expect(msg).toContain('ANUSORN T.');
    expect(msg).toContain('- ↪ reassigned to PARAMUTT C. (AP-126)');
  });

  it('a same-id reassignment ADDED shows who it was reassigned from', () => {
    const event = { type: 'ADDED', flight: { ...BASE_FLIGHT, student: 'PARAMUTT C.', lesson: 'CDXI 73', batch: 'AP-126' },
      diff: { reassignedFrom: { student: 'ANUSORN T.', batch: 'AP-127' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('✈️ New');
    expect(msg).toContain('PARAMUTT C.');
    expect(msg).toContain('- ↪ reassigned from ANUSORN T. (AP-127)');
  });

  it('a normal REMOVED/ADDED with no reassignment shows no reassignment line', () => {
    const [msg] = buildCombinedMessages('AP127', [{ type: 'REMOVED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    expect(msg).not.toContain('reassigned');
  });

  // Real incident 2026-07-27: after stabilizeCancelledFlights (diff.js) rebuilds a cancelled
  // booking's tracking post-flap, it can fire as ADDED with flight.status already 'Canceled' —
  // not REMOVED or STATUS→Canceled. Confirmed live: this rendered as "✈️ New" for an actually-
  // cancelled flight (Napon S., CDXV 29) with no indication it was a cancellation at all.
  it('an ADDED event whose flight.status is already Canceled is grouped as Cancelled, not New', () => {
    const event = { type: 'ADDED', flight: { ...BASE_FLIGHT, status: 'Canceled' },
      diff: { cancelReason: { reason: 'Other', remarks: 'flight solo' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('❌ Cancelled');
    expect(msg).not.toContain('✈️ New');
    expect(msg).toContain('❌ SIWAKORN P.');
    expect(msg).toContain('- 📝 Other');
    expect(msg).toContain('- 💬 flight solo');
  });

  it('STATUS → Canceled is in the Cancelled group, not a separate Status update group', () => {
    const event = { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'Canceled' },
      diff: { status: { from: 'Pending', to: 'Canceled' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('❌ Cancelled');
    expect(msg).not.toContain('🔄 Status update');
  });

  it('a non-completion, non-cancellation STATUS change is in Status update, 🔄 prefixes SP, status line has 🆕', () => {
    const event = { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'On-Hold' },
      diff: { status: { from: 'Pending', to: 'On-Hold' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('🔄 Status update');
    expect(msg).toContain('🔄 SIWAKORN P.');
    expect(msg).toContain('- 🔖 Pending → 🆕 On-Hold');
  });

  it('a time change shows full old range → 🆕 full new range, 🆕 right before the new value', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, start: '08:30', end: '10:15' },
      diff: { start: { from: '08:00', to: '08:30' }, end: { from: '09:30', to: '10:15' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- ⏰ 08:00–09:30 → 🆕 08:30–10:15');
  });

  it('an unchanged time still renders as a full range with no arrow and no 🆕', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, tail: 'HS-TPT' },
      diff: { tail: { from: 'HS-NGT', to: 'HS-TPT' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- ⏰ 08:00–09:30');
    expect(msg).not.toContain('→ 08:00–09:30');
    expect(msg).not.toContain('🆕 08:00');
  });

  it('a tail change is its own dash line with 🆕 before the new value', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, tail: 'HS-TPT' },
      diff: { tail: { from: 'HS-NGT', to: 'HS-TPT' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 🛩 HS-NGT → 🆕 HS-TPT');
  });

  it('an unchanged FI/lesson/date stays in the compact context line (not its own dash line)', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, tail: 'HS-TPT' },
      diff: { tail: { from: 'HS-NGT', to: 'HS-TPT' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('CDGL 04 · 🗣️ ITTIPOL P. · 📅 10 Jun');
  });

  it('a changed FI is promoted out of the context line into its own dash line with 🆕', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, instructor: 'WUTTHICHAI L.' },
      diff: { instructor: { from: 'ITTIPOL P.', to: 'WUTTHICHAI L.' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 🗣️ ITTIPOL P. → 🆕 WUTTHICHAI L.');
    // context line drops FI since it moved to its own line, keeps lesson + date
    const contextLine = msg.split('\n').find(l => l.startsWith('CDGL 04'));
    expect(contextLine).toBe('CDGL 04 · 📅 10 Jun');
  });

  it('a changed lesson is promoted to its own dash line', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, lesson: 'CDGL 05' },
      diff: { lesson: { from: 'CDGL 04', to: 'CDGL 05' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 📖 CDGL 04 → 🆕 CDGL 05');
  });

  it('a changed date is promoted to its own dash line', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, date: '2026-06-11' },
      diff: { date: { from: '2026-06-10', to: '2026-06-11' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 📅 2026-06-10 → 🆕 2026-06-11');
  });

  it('a type (aircraft type) change is its own dash line with 🆕', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, type: 'DA42TDI' },
      diff: { type: { from: 'DA40TDI', to: 'DA42TDI' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 🏷️ DA40TDI → 🆕 DA42TDI');
  });

  it('a cond (flight condition) change is shown, including from null', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, cond: 'IR/Nav' },
      diff: { cond: { from: null, to: 'IR/Nav' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 📌 — → 🆕 IR/Nav');
  });

  it('an isSim change is shown in plain words with 🆕, not raw booleans', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, isSim: true },
      diff: { isSim: { from: false, to: true } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 🎮 🆕 now SIM');
  });

  it('an isStandby change is shown in plain words with 🆕', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, isStandby: true },
      diff: { isStandby: { from: false, to: true } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- ⏸️ 🆕 now STANDBY');
  });

  it('isSim/isStandby flipping back to false is also shown', () => {
    const event = { type: 'CHANGED', flight: { ...BASE_FLIGHT, isSim: false },
      diff: { isSim: { from: true, to: false } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 🎮 🆕 no longer SIM');
  });

  it('Completed: ✅ prefixes SP, no "planned"/"flew" words, no 🆕 anywhere, bare ⏰ then ✍️ lines', () => {
    const event = { type: 'STATUS',
      flight: { ...BASE_FLIGHT, student: 'RATTANASUDA', lesson: 'LPC SEP', instructor: 'WUTTHICHAI L.',
                 tail: 'HS-TPX', date: '2026-07-17', start: '08:34', end: '09:58' },
      diff: { status: { from: 'Pending', to: 'Completed' },
              start: { from: '08:30', to: '08:34' }, end: { from: '10:10', to: '09:58' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('✅ Completed');
    expect(msg).toContain('✅ RATTANASUDA');
    expect(msg).toContain('LPC SEP · 🗣️ WUTTHICHAI L. · 📅 17 Jul');
    expect(msg).toContain('- ⏰ 08:30–10:10');
    expect(msg).toContain('- ✍️ 08:34–09:58');
    expect(msg).toContain('- 🛩 HS-TPX');
    expect(msg).not.toContain('planned');
    expect(msg).not.toContain('flew');
    expect(msg).not.toContain('🆕');
  });

  it('Completed via ADDED (ACTUAL_ONLY record, no diff) shows only the ✍️ line, no ⏰ line', () => {
    const event = { type: 'ADDED',
      flight: { ...BASE_FLIGHT, status: 'Completed', lesson: 'CDGL 03', tail: 'HS-TPT' }, diff: {} };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('✅ Completed');
    expect(msg).toContain('- ✍️ 08:00–09:30');
    expect(msg).not.toContain('- ⏰');
  });

  it('Completed shows touch-and-go count and actual clock times on separate dash lines', () => {
    const event = { type: 'STATUS',
      flight: { ...BASE_FLIGHT, status: 'Completed', to: 1, ldg: 1, tkoff: '08:34', ldgTime: '09:56', inst: 0 },
      diff: { status: { from: 'Pending', to: 'Completed' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 🛬 1 T/O · 1 LDG');
    expect(msg).toContain('- 🕘 TO 08:34 · LDG 09:56');
    expect(msg).not.toContain('INST'); // inst is 0 — must not show
  });

  it('Completed omits actual-data lines entirely when the feed has none (older records)', () => {
    const event = { type: 'ADDED', flight: { ...BASE_FLIGHT, status: 'Completed' }, diff: {} };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).not.toContain('🛬');
    expect(msg).not.toContain('🕘');
  });

  it('Completed shows INST only when non-zero, on the 🕘 line', () => {
    const event = { type: 'STATUS', flight: { ...BASE_FLIGHT, status: 'Completed', inst: 2 },
      diff: { status: { from: 'Pending', to: 'Completed' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 🕘 INST 2');
  });

  it('actual clock times of "00:00" are treated as not-recorded and omitted, even when counts are present', () => {
    const event = { type: 'STATUS',
      flight: { ...BASE_FLIGHT, status: 'Completed', tkoff: '00:00', ldgTime: '00:00', to: 2, ldg: 2 },
      diff: { status: { from: 'Pending', to: 'Completed' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 🛬 2 T/O · 2 LDG');
    expect(msg).not.toContain('TO 00:00');
    expect(msg).not.toContain('LDG 00:00');
    expect(msg).not.toContain('🕘'); // both clock times absent and inst=0 → no 🕘 line at all
  });

  // 2026-07-26: cancelReason/remarks (joined by diff.js's attachCancelReasons) render as two
  // conditional dash lines — 📝 for the categorical reason, 💬 for free-text remarks. Verified
  // against real live data (see diff.test.js for the join logic itself).
  it('shows the cancel reason (📝) when present', () => {
    const event = { type: 'REMOVED', flight: BASE_FLIGHT, diff: { cancelReason: { reason: 'Weather (WX)' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 📝 Weather (WX)');
    expect(msg).not.toContain('💬');
  });

  it('shows both cancel reason and free-text remarks when both present', () => {
    const event = { type: 'REMOVED', flight: BASE_FLIGHT,
      diff: { cancelReason: { reason: 'Aircraft Trouble', remarks: 'MFD does not sync' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 📝 Aircraft Trouble');
    expect(msg).toContain('- 💬 MFD does not sync');
  });

  it('shows no cancel-reason lines when the field is absent (most cancellations, per real data)', () => {
    const [msg] = buildCombinedMessages('AP127', [{ type: 'REMOVED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    expect(msg).not.toContain('📝');
    expect(msg).not.toContain('💬');
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
