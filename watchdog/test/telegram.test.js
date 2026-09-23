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

  // 2026-08-06: recover_vanished_bookings() (fetch_schedule.py) marks a synthesized Canceled
  // entry `recovered: true` only when no Cancel Record was ever found for it — a booking removed
  // via some portal path other than the Cancel Flight form (e.g. an Edit Request delete). There's
  // no reason to show for these, and showing them identically to a real Cancel-Flight cancellation
  // was confusing (user report) — they now group separately as "Removed", not "Cancelled".
  it('a REMOVED event whose flight is `recovered` groups as Removed, not Cancelled, and explains why there is no reason', () => {
    const flight = { ...BASE_FLIGHT, status: 'Canceled', recovered: true };
    const [msg] = buildCombinedMessages('AP127', [{ type: 'REMOVED', flight, diff: {} }], ROSTER);
    expect(msg).toContain('🗑️ Removed');
    expect(msg).not.toContain('❌ Cancelled');
    expect(msg).toContain('no Cancel Flight record found');
  });

  it('a STATUS → Canceled event whose flight is `recovered` also groups as Removed', () => {
    const flight = { ...BASE_FLIGHT, status: 'Canceled', recovered: true };
    const event = { type: 'STATUS', flight, diff: { status: { from: 'Pending', to: 'Canceled' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('🗑️ Removed');
    expect(msg).not.toContain('❌ Cancelled');
  });

  it('a REMOVED event with recovered=false (or absent) still groups as Cancelled as before', () => {
    const [msg] = buildCombinedMessages('AP127', [{ type: 'REMOVED', flight: BASE_FLIGHT, diff: {} }], ROSTER);
    expect(msg).toContain('❌ Cancelled');
    expect(msg).not.toContain('🗑️ Removed');
    expect(msg).not.toContain('no Cancel Flight record found');
  });

  it('a recovered Removed event still shows a real cancel reason if one exists (retroactive backfill case)', () => {
    const flight = { ...BASE_FLIGHT, status: 'Canceled', recovered: true };
    const event = { type: 'REMOVED', flight, diff: { cancelReason: { reason: 'Weather (WX)' } } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    // recovered is a scraper-side snapshot of "no reason at the time it vanished" — if diff.js's
    // attachCancelReasons still found one for this run, show it; the group label stays Removed
    // since `recovered` reflects the booking's own history, not just this run's join outcome.
    expect(msg).toContain('- 📝 Weather (WX)');
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

  // 2026-09-24 redesign: the Completed notice shows the FLIGHT RECORD, not the booked slot — leg,
  // block off, take-off, landing, block on, departure, destination — as a monospace <pre> table
  // (combined messages are sent with parse_mode=HTML). Fixtures mirror real 2026-09-23 records.
  const XC_LEGS = [
    { leg: '1', routeFrom: 'VTPH', routeTo: 'VTSB', blockOff: '06:30', tkoff: '06:40', ldgTime: '08:35', blockOn: '08:40', to: 1, ldg: 1, tail: 'HS-TPO' },
    { leg: '2', routeFrom: 'VTSB', routeTo: 'VTSE', blockOff: '08:46', tkoff: '08:50', ldgTime: '10:20', blockOn: '10:25', to: 1, ldg: 1, tail: 'HS-TPO' },
    { leg: '3', routeFrom: 'VTSE', routeTo: 'VTPH', blockOff: '10:30', tkoff: '10:36', ldgTime: '11:47', blockOn: '11:52', to: 1, ldg: 1, tail: 'HS-TPO' },
  ];
  const completedXc = (over = {}) => ({ type: 'ADDED', diff: {}, flight: {
    ...BASE_FLIGHT, id: 'ACTUAL_ONLY_BK-AP-127-SETA-EHX3N', status: 'Completed', student: 'SIWAKORN P.',
    lesson: 'CSXV 45', flightType: 'Solo', date: '2026-09-23', start: '06:30', end: '11:30', tail: 'HS-TPO',
    instructor: 'SANTI PO.', leg: '3', routeFrom: 'VTSE', routeTo: 'VTPH', legs: XC_LEGS, ...over } });

  it('Completed multi-leg: whole route, one table row per leg with off/T-O/LDG/on, totals', () => {
    const [msg] = buildCombinedMessages('AP127', [completedXc()], ROSTER);
    expect(msg).toContain('✅ SIWAKORN P. (@siwakorn_p)');
    expect(msg).toContain('CSXV 45 · Solo · 📅 23 Sept');
    expect(msg).toContain('- 🗣️ SANTI PO. · 🛩 HS-TPO');
    expect(msg).toContain('- 🗺️ VTPH → VTSB → VTSE → VTPH');
    expect(msg).toContain('<pre># Route     Off   T/O   LDG   On\n'
      + '1 VTPH→VTSB 06:30 06:40 08:35 08:40\n'
      + '2 VTSB→VTSE 08:46 08:50 10:20 10:25\n'
      + '3 VTSE→VTPH 10:30 10:36 11:47 11:52</pre>');
    // block 2:10 + 1:39 + 1:22 = 5:11 · air 1:55 + 1:30 + 1:11 = 4:36
    expect(msg).toContain('- ⏱ Block 5:11 · Air 4:36');
    expect(msg).toContain('- 🛬 3 T/O · 3 LDG');
    expect(msg).not.toContain('06:30–11:30'); // the booked slot is not the record
    expect(msg).not.toContain('🆕');
  });

  it('Completed single leg (in-place STATUS): one-row table from the flight\'s own record, no route line', () => {
    const event = { type: 'STATUS', diff: { status: { from: 'Pending', to: 'Completed' } },
      flight: { ...BASE_FLIGHT, status: 'Completed', flightType: 'Dual', routeFrom: 'VTPH', routeTo: 'VTPH',
                blockOff: '06:50', tkoff: '06:58', ldgTime: '07:48', blockOn: '07:50', to: 1, ldg: 1, inst: 0 } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('CDGL 04 · Dual · 📅 10 Jun');
    expect(msg).toContain('<pre># Route     Off   T/O   LDG   On\n1 VTPH→VTPH 06:50 06:58 07:48 07:50</pre>');
    expect(msg).toContain('- ⏱ Block 1:00 · Air 0:50');
    expect(msg).toContain('- 🛬 1 T/O · 1 LDG');
    expect(msg).not.toContain('🗺️');
    expect(msg).not.toContain('INST'); // inst is 0 — must not show
  });

  it('Completed keeps the leg number a single record carries (a /2 leg booked on its own)', () => {
    const event = { type: 'ADDED', diff: {}, flight: { ...BASE_FLIGHT, status: 'Completed', leg: '2',
      routeFrom: 'VTPH', routeTo: 'VTBP', blockOff: '11:00', tkoff: '11:10', ldgTime: '12:00', blockOn: '12:00' } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('\n2 VTPH→VTBP 11:00 11:10 12:00 12:00</pre>');
  });

  it('Completed shows INST when non-zero and a missing time as --:--', () => {
    const event = { type: 'ADDED', diff: {}, flight: { ...BASE_FLIGHT, status: 'Completed', inst: 2,
      routeFrom: 'VTPH', routeTo: 'VTPH', blockOff: '08:00', tkoff: '08:10', ldgTime: '09:40', to: 3, ldg: 3 } };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('1 VTPH→VTPH 08:00 08:10 09:40 --:--');
    expect(msg).toContain('- ⏱ Air 1:30');
    expect(msg).toContain('- 🛬 3 T/O · 3 LDG · 2 INST');
  });

  it('Completed with no flight record yet: says so and shows the planned slot instead', () => {
    const event = { type: 'ADDED', flight: { ...BASE_FLIGHT, status: 'Completed' }, diff: {} };
    const [msg] = buildCombinedMessages('AP127', [event], ROSTER);
    expect(msg).toContain('- 📋 Planned 08:00–09:30 · flight record not entered yet');
    expect(msg).not.toContain('<pre>');
    expect(msg).not.toContain('🛬');
  });

  it('Completed remarks: plain for one leg, prefixed with the leg on a multi-leg trip', () => {
    const one = { type: 'ADDED', diff: {}, flight: { ...BASE_FLIGHT, status: 'Completed', routeFrom: 'VTPH',
      routeTo: 'VTBP', blockOff: '06:35', remark: 'Incomplete mission due engine problem' } };
    expect(buildCombinedMessages('AP127', [one], ROSTER)[0]).toContain('- 💬 Incomplete mission due engine problem');
    const legs = XC_LEGS.map(l => (l.leg === '2' ? { ...l, remark: 'diverted wx' } : l));
    expect(buildCombinedMessages('AP127', [completedXc({ legs })], ROSTER)[0]).toContain('- 💬 Leg 2: diverted wx');
  });

  it('escapes HTML in every piece of text (parse_mode=HTML) — names, remarks, routes', () => {
    const event = { type: 'ADDED', diff: {}, flight: { ...BASE_FLIGHT, status: 'Completed', student: 'A<B> & C',
      routeFrom: 'VTPH', routeTo: '<X>', blockOff: '06:00', remark: 'x < y & z' } };
    const [msg] = buildCombinedMessages('Ops & <Admin>', [event], []);
    expect(msg).toContain('📋 Ops &amp; &lt;Admin&gt; — 1 update');
    expect(msg).toContain('✅ A&lt;B&gt; &amp; C');
    expect(msg).toContain('- 💬 x &lt; y &amp; z');
    expect(msg).not.toMatch(/<(?!\/?pre>)/); // the only raw tags are the table's own <pre></pre>
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

describe('sendTelegram — HTML parse mode (2026-09-24)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sends parse_mode=HTML when asked', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, result: { message_id: 7 } }) }));
    vi.stubGlobal('fetch', fetchMock);
    await sendTelegram('T', '1', '<pre>x</pre>', null, 'HTML');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ parse_mode: 'HTML', text: '<pre>x</pre>' });
  });

  it('falls back to plain text if Telegram rejects the markup — the notice is never lost', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400,
        json: () => Promise.resolve({ ok: false, description: "Bad Request: can't parse entities: unclosed tag" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true, result: { message_id: 8 } }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await sendTelegram('T', '1', 'a &amp; b\n<pre>1 VTPH→VTSB</pre>', null, 'HTML');
    expect(id).toBe(8);
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retry.parse_mode).toBeUndefined();
    expect(retry.text).toBe('a & b\n1 VTPH→VTSB');
  });

  it('does not swallow other errors in HTML mode', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 403,
      json: () => Promise.resolve({ ok: false, description: 'Forbidden: bot was kicked' }) })));
    await expect(sendTelegram('T', '1', 'x', null, 'HTML')).rejects.toThrow('403');
  });
});
