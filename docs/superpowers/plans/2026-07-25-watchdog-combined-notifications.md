# Watchdog Combined Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Watchdog's two-mode Telegram send strategy (individual messages, or a mentionless counts-only summary above 8 events) with a single mode that always sends one combined, fully-detailed, `@mention`-preserving message per destination per run — chunked only when Telegram's 4,096-char limit requires it — and add full actual-flight data (takeoff/landing counts, actual clock times, instrument time) to completed-flight lines.

**Architecture:** `watchdog/src/diff.js` gains five new display-only fields on `buildSnapshot()`'s output (not added to the diffable `TRACKED` list). `watchdog/src/telegram.js`'s `formatMessage()`/`formatSummary()` are replaced by a single `buildCombinedMessages(destLabel, events, roster)` that groups events by urgency, sorts by time, renders each event's compact block, and splits into multiple messages only on real overflow (two-pass: build bodies, then prepend finalized `(n/total)` headers). `watchdog/src/index.js`'s send loop and `planNotifications()` simplify accordingly — the `MAX_SENDS_PER_DEST`/`summarize` branching is removed entirely.

**Tech Stack:** Plain JS (Cloudflare Workers, ES modules), Vitest for tests, Wrangler CLI for deploy. No new dependencies.

## Global Constraints

- Telegram `sendMessage` hard limit: **4,096 characters** (UTF-8) per message — verified against the Bot API; the chunking budget must stay under this with headroom.
- `airborne`/`airborneMin` is never shown or used in any hours calculation anywhere in this ecosystem (established rule, `AP127_V3/src/components/FlightDrawer.tsx`) — do not add it to any message.
- Field labels for the new completed-flight actual data: touch-and-go **count** is `N T/O · N LDG` (slashed, count-prefixed); actual **clock times** are `TO HH:MM` / `LDG HH:MM` (unslashed, no count) — these must never render as identical text on the same line (a naming collision was caught and fixed during spec review 2026-07-25).
- Every SP with a matched event must be `@mentioned` in every run, regardless of batch size — this is the core requirement driving the whole change (see spec §1: a 19-hour-outage catch-up on 2026-07-21 sent 26 real events as one anonymous summary with zero mentions).
- Design spec: `docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md` — consult it for full rationale on any ambiguity not covered by this plan.

---

### Task 1: `diff.js` — carry actual-flight-record fields through the snapshot (display-only, not diffed)

**Files:**
- Modify: `watchdog/src/diff.js:3-15` (`buildSnapshot`)
- Test: `watchdog/test/diff.test.js`

**Interfaces:**
- Consumes: nothing new — same `flights` array shape as today (raw feed flight objects), which already carry `to`, `ldg`, `tkoff`, `ldgTime`, `inst` on `Completed`-status entries (confirmed against the live feed 2026-07-25).
- Produces: `buildSnapshot(flights)` returns the same shape as today PLUS five new keys per entry: `to`, `ldg`, `tkoff`, `ldgTime`, `inst` (each copied verbatim from the source flight, `undefined` if absent). `TRACKED` (line 1) is **unchanged** — these five fields are never diffed, so a flight whose only difference between two snapshots is one of these fields produces zero events. Task 2 (`telegram.js`) reads these five fields directly off `event.flight`.

- [ ] **Step 1: Write the failing tests**

Add to `watchdog/test/diff.test.js`, inside the existing `describe('buildSnapshot', () => { ... })` block (after the `'includes AP-126 batch flight'` test, before its closing `});`):

```js
  it('carries display-only actual-flight fields when present (2026-07-25 — not diffable, display only)', () => {
    const flights = [{ ...SAMPLE_FLIGHTS[0], to: 1, ldg: 1, tkoff: '08:34', ldgTime: '09:56', inst: 2 }];
    const snap = buildSnapshot(flights);
    expect(snap['100'].to).toBe(1);
    expect(snap['100'].ldg).toBe(1);
    expect(snap['100'].tkoff).toBe('08:34');
    expect(snap['100'].ldgTime).toBe('09:56');
    expect(snap['100'].inst).toBe(2);
  });
```

Add to the existing `describe('diffSnapshots', () => { ... })` block (after the `'returns empty array when nothing changed'` test, before its closing `});`):

```js
  it('a change to only the new display-only fields (to/ldg/tkoff/ldgTime/inst) produces zero events — not TRACKED', () => {
    const prev = { '100': { ...base['100'], to: 1, ldg: 1, tkoff: '08:00', ldgTime: '09:00', inst: 0 } };
    const next = { '100': { ...base['100'], to: 2, ldg: 2, tkoff: '08:05', ldgTime: '09:10', inst: 3 } };
    const events = diffSnapshots(prev, next);
    expect(events).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nugui/AP127_V2/watchdog && npx vitest run test/diff.test.js`
Expected: FAIL — `snap['100'].to` is `undefined`, not `1` (the field doesn't exist on the snapshot yet).

- [ ] **Step 3: Implement**

In `watchdog/src/diff.js`, replace the `buildSnapshot` function (lines 3-15) with:

```js
export function buildSnapshot(flights) {
  const snap = {};
  for (const f of flights) {
    if (!f.id) continue;
    snap[String(f.id)] = {
      id: String(f.id), batch: f.batch || '',
      date: f.date, start: f.start, end: f.end,
      status: f.status, student: f.student, instructor: f.instructor,
      lesson: f.lesson, tail: f.tail, type: f.type,
      // Display-only actual-flight-record fields (2026-07-25) — deliberately NOT added to TRACKED
      // above, so they never themselves trigger a diff event. They ride along on whatever event a
      // flight's TRACKED-field transition already produces (most commonly Pending→Completed) and
      // are rendered on the Completed message block by telegram.js's buildCombinedMessages().
      to: f.to, ldg: f.ldg, tkoff: f.tkoff, ldgTime: f.ldgTime, inst: f.inst,
    };
  }
  return snap;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nugui/AP127_V2/watchdog && npx vitest run test/diff.test.js`
Expected: PASS — all tests in the file, including the two new ones (should now be 52 tests, up from the current 50 — verify the current count first with the same command before this step if in doubt).

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add watchdog/src/diff.js watchdog/test/diff.test.js
git commit -m "watchdog: carry actual-flight fields (to/ldg/tkoff/ldgTime/inst) through buildSnapshot, display-only"
```

---

### Task 2: `telegram.js` — replace `formatMessage`/`formatSummary` with `buildCombinedMessages`

**Files:**
- Modify: `watchdog/src/telegram.js` (full rewrite of the message-building section, lines 1-100; `_doSend`/`sendTelegram`, lines 102-127, are unchanged)
- Test: `watchdog/test/telegram.test.js` (full replacement of the `formatMessage`/`formatSummary` describe blocks; the `sendTelegram` describe block, lines 130-154, is unchanged)

**Interfaces:**
- Consumes: an `events` array where each event is `{ type: 'ADDED'|'REMOVED'|'CHANGED'|'STATUS', flight: {...Task 1's snapshot shape...}, diff: {...} }` (unchanged shape from `diffSnapshots()`), and a `roster` array of `{ scheduleName, telegramUsername }`.
- Produces: `export function buildCombinedMessages(destLabel, events, roster)` → `string[]`. Callers (Task 3) always pass a non-empty `events` array. Also exports `MAX_MESSAGE_CHARS` (number, 4000). `formatMessage` and `formatSummary` no longer exist — Task 3 removes their only callers.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `watchdog/test/telegram.test.js` with:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nugui/AP127_V2/watchdog && npx vitest run test/telegram.test.js`
Expected: FAIL — `buildCombinedMessages` is not exported yet (`SyntaxError`/import error, since `src/telegram.js` doesn't define it).

- [ ] **Step 3: Implement**

Replace the entire contents of `watchdog/src/telegram.js` with:

```js
const TELEGRAM_BASE = 'https://api.telegram.org/bot';

function fmtDateShort(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short',
    });
  } catch { return dateStr; }
}

function spMention(student, roster) {
  const entry = (roster || []).find(r => r.scheduleName === student);
  const name = student || '—';
  return entry?.telegramUsername ? `${name} (@${entry.telegramUsername})` : name;
}

function timeRange(start, end) {
  return start && end ? `${start}–${end}` : (start || '—');
}

// Sortable key: zero-padded YYYY-MM-DD + HH:MM strings compare chronologically as plain strings —
// avoids importing index.js's flightTimestampMs (index.js imports FROM this file; importing back
// would create a circular dependency).
function sortKey(f) {
  return `${f.date || ''}T${f.start || '00:00'}`;
}

// Classifies a diffed event into one of the 5 urgency groups used by buildCombinedMessages — see
// docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md §3.
function classifyForGrouping(event) {
  const { type, flight: f, diff = {} } = event;
  if (type === 'REMOVED') return 'cancelled';
  if (type === 'STATUS' && diff.status?.to === 'Canceled') return 'cancelled';
  if (type === 'STATUS' && diff.status?.to === 'Completed') return 'completed';
  if (type === 'ADDED' && f.status === 'Completed') return 'completed';
  if (type === 'ADDED') return 'new';
  if (type === 'CHANGED') return 'changed';
  return 'status'; // STATUS events that are neither a completion nor a cancellation
}

const GROUPS = [
  { key: 'cancelled', emoji: '❌', label: 'Cancelled' },
  { key: 'changed',   emoji: '⚠️', label: 'Changed' },
  { key: 'status',    emoji: '🔄', label: 'Status update' },
  { key: 'new',       emoji: '✈️', label: 'New' },
  { key: 'completed', emoji: '✅', label: 'Completed' },
];

// Groups events by urgency, sorts each group by flight time, and drops empty groups.
function groupAndSortEvents(events) {
  const byKey = {};
  for (const e of events) {
    const key = classifyForGrouping(e);
    (byKey[key] ||= []).push(e);
  }
  return GROUPS
    .map(g => ({
      ...g,
      events: (byKey[g.key] || []).slice().sort((a, b) => sortKey(a.flight).localeCompare(sortKey(b.flight))),
    }))
    .filter(g => g.events.length > 0);
}

// Renders one event's compact block — no leading type emoji (the group header carries that).
function renderEventBlock(event, roster) {
  const { flight: f, diff = {} } = event;
  const sp         = spMention(f.student, roster);
  const fiText     = diff.instructor ? `${diff.instructor.from}→${diff.instructor.to}` : (f.instructor || '—');
  const tailText   = diff.tail       ? `${diff.tail.from}→${diff.tail.to}`             : (f.tail || '—');
  const lessonText = diff.lesson     ? `${diff.lesson.from}→${diff.lesson.to}`         : (f.lesson || '—');
  const dateText   = diff.date       ? `${diff.date.from}→${diff.date.to}`             : fmtDateShort(f.date);
  const currentRange = timeRange(f.start, f.end);
  const timeText = (diff.start || diff.end)
    ? `${timeRange(diff.start?.from ?? f.start, diff.end?.from ?? f.end)} → ${currentRange}`
    : currentRange;

  const group = classifyForGrouping(event);

  if (group === 'completed') {
    const flownText = (diff.start || diff.end)
      ? `planned ${timeRange(diff.start?.from ?? f.start, diff.end?.from ?? f.end)} → flew ${currentRange}`
      : currentRange;
    const lines = [
      `${sp} — ${lessonText} · FI ${fiText}`,
      `   ${fmtDateShort(f.date)}  ${flownText} · ${tailText}`,
    ];
    const actuals = [];
    if (f.to || f.ldg)                      actuals.push(`${f.to ?? 0} T/O · ${f.ldg ?? 0} LDG`);
    if (f.tkoff   && f.tkoff   !== '00:00') actuals.push(`TO ${f.tkoff}`);
    if (f.ldgTime && f.ldgTime !== '00:00') actuals.push(`LDG ${f.ldgTime}`);
    if (f.inst)                             actuals.push(`INST ${f.inst}`);
    if (actuals.length) lines.push(`   ${actuals.join(' · ')}`);
    return lines.join('\n');
  }

  const line2Parts = [`${dateText}  ${timeText}`, tailText];
  if (group === 'status') line2Parts.push(`${diff.status?.from ?? '—'}→${diff.status?.to ?? '—'}`);
  return [
    `${sp} — ${lessonText} · FI ${fiText}`,
    `   ${line2Parts.join(' · ')}`,
  ].join('\n');
}

// Telegram's sendMessage `text` hard limit is 4,096 chars (verified against the Bot API). Leave
// headroom for the header/page-indicator line rather than cutting right at the wire.
export const MAX_MESSAGE_CHARS = 4000;

// Builds one or more ready-to-send Telegram messages for a destination's matched events this run.
// Always combines — never a bare "N updates" summary with no detail (see design spec §1: the prior
// >8-events summary-only path left every affected SP unmentioned). Groups by urgency, sorts by time,
// renders each event, and splits into multiple messages only when content would exceed Telegram's
// hard limit — two-pass: build chunk bodies first, then prepend finalized "(n/total)" headers once
// the total chunk count is known (the header can't be written until the whole walk is done).
export function buildCombinedMessages(destLabel, events, roster) {
  const groups = groupAndSortEvents(events);
  const bodies = [];
  let current = '';

  function pushBlock(block) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (current && candidate.length > MAX_MESSAGE_CHARS) {
      bodies.push(current);
      current = block;
      return true; // started a new chunk
    }
    current = candidate;
    return false;
  }

  for (const group of groups) {
    const header = `${group.emoji} ${group.label}`;
    pushBlock(header);
    for (const event of group.events) {
      const startedNewChunk = pushBlock(renderEventBlock(event, roster));
      if (startedNewChunk) {
        // The chunk boundary split this event from its group header — re-show the header so the
        // new chunk's events are still labeled.
        current = `${header}\n\n${current}`;
      }
    }
  }
  if (current) bodies.push(current);

  const total = bodies.length;
  return bodies.map((body, i) => {
    const suffix = total > 1 ? ` (${i + 1}/${total})` : '';
    const label = destLabel ? `${destLabel} — ` : '';
    const header = `📋 ${label}${events.length} update${events.length === 1 ? '' : 's'}${suffix}`;
    return `${header}\n${body}`;
  });
}

async function _doSend(token, body) {
  const res = await fetch(`${TELEGRAM_BASE}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const wait = ((data.parameters?.retry_after) || 30) * 1000;
    await new Promise(r => setTimeout(r, wait));
    return null; // signal retry
  }
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${data.description || 'unknown error'}`);
  return data.result.message_id;
}

export async function sendTelegram(token, chatId, text, threadId) {
  const body = { chat_id: chatId, text };
  if (threadId) body.message_thread_id = threadId;
  const result = await _doSend(token, body);
  if (result === null) return _doSend(token, body); // one retry after rate-limit wait
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nugui/AP127_V2/watchdog && npx vitest run test/telegram.test.js`
Expected: PASS — all 22 tests (19 `buildCombinedMessages` + 3 `sendTelegram`).

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add watchdog/src/telegram.js watchdog/test/telegram.test.js
git commit -m "watchdog: replace formatMessage/formatSummary with buildCombinedMessages — always-combined, mention-preserving, chunked notifications"
```

---

### Task 3: `index.js` — wire in `buildCombinedMessages`, remove `MAX_SENDS_PER_DEST`/`summarize`

**Files:**
- Modify: `watchdog/src/index.js:2` (import), `watchdog/src/index.js:139-159` (`planNotifications`), `watchdog/src/index.js:244-260` (send loop)
- Modify: `watchdog/test/diff.test.js:3-6` (import), remove two obsolete tests

**Interfaces:**
- Consumes: `buildCombinedMessages` from Task 2 (`telegram.js`), `sendTelegram` (unchanged).
- Produces: `planNotifications(events, dests)` → `Array<{ dest, items }>` (the `summarize` field is removed from this return shape — Task 3 is the only place that shape is consumed, in the send loop below it).

- [ ] **Step 1: Update the import**

In `watchdog/src/index.js`, replace line 2:

```js
import { formatMessage, formatSummary, sendTelegram } from './telegram.js';
```

with:

```js
import { buildCombinedMessages, sendTelegram } from './telegram.js';
```

- [ ] **Step 2: Simplify `planNotifications` and remove `MAX_SENDS_PER_DEST`**

In `watchdog/src/index.js`, replace lines 139-159 (the comment block, `MAX_SENDS_PER_DEST` constant, and `planNotifications` function) with:

```js
// Routes each destination's matched events for this run (batch/student filter only). Sending
// strategy — one combined message, chunked only if needed — lives in telegram.js's
// buildCombinedMessages(); this function no longer decides "how many to send individually vs.
// summarize" (see docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md —
// the old MAX_SENDS_PER_DEST summarize-or-not split left every SP unmentioned during any burst
// above 8 events, confirmed on the 2026-07-21 19-hour-outage catch-up).
export function planNotifications(events, dests) {
  const plan = [];
  for (const dest of dests || []) {
    if (dest.enabled === false) continue;
    const items = events.filter(e => {
      const batch = e.flight.batch || 'AP-127';
      if (!matchesBatchFilter(dest.batchFilter, batch)) return false;
      if (dest.studentFilter && e.flight.student !== dest.studentFilter) return false;
      return true;
    });
    if (items.length) plan.push({ dest, items });
  }
  return plan;
}
```

- [ ] **Step 3: Simplify the send loop**

In `watchdog/src/index.js`, replace lines 244-260 (the `// Send (bounded per destination...` comment and its `for` loop) with:

```js
    // Send — one combined message per destination per run (chunked only if it would exceed
    // Telegram's char limit). Every matched SP is @mentioned in every run now, including bursts.
    for (const { dest, items } of planNotifications(notifiable, allDests)) {
      const roster = dest.mention !== false ? (config.roster || []) : [];
      const messages = buildCombinedMessages(dest.label, items, roster);
      try {
        for (const message of messages) {
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, dest.chatId, message, dest.threadId);
          await new Promise(r => setTimeout(r, 3500)); // Telegram ~20 msg/min per chat
        }
      } catch (e) {
        console.error(`Telegram send to "${dest.label}" failed:`, e.message);
      }
    }
```

- [ ] **Step 4: Update `diff.test.js`'s import and remove the obsolete `summarize` tests**

In `watchdog/test/diff.test.js`, replace the import block (lines 3-6):

```js
import { matchesBatchFilter, flightTimestampMs,
  SNAPSHOT_LOOKBACK_MS, SNAPSHOT_LOOKAHEAD_MS, withinSnapshotWindow,
  bangkokDateStr, isActionable, isAnomalousDrop, ANOMALY_MIN_BASELINE, ANOMALY_MAX_STREAK,
  extractFeedSig, planNotifications, MAX_SENDS_PER_DEST } from '../src/index.js';
```

with:

```js
import { matchesBatchFilter, flightTimestampMs,
  SNAPSHOT_LOOKBACK_MS, SNAPSHOT_LOOKAHEAD_MS, withinSnapshotWindow,
  bangkokDateStr, isActionable, isAnomalousDrop, ANOMALY_MIN_BASELINE, ANOMALY_MAX_STREAK,
  extractFeedSig, planNotifications } from '../src/index.js';
```

Then, inside `describe('planNotifications (bounded, filtered send routing)', ...)`, delete these two tests entirely (they test the removed `summarize` field):

```js
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
```

(Leave the `describe` block's other tests — `'routes events to matching enabled destinations only'`, `'respects studentFilter and batchFilter together'`, `'omits destinations with no matched events'` — unchanged; they don't reference `summarize`.)

- [ ] **Step 5: Run the full test suite to verify everything passes**

Run: `cd /Users/nugui/AP127_V2/watchdog && npx vitest run`
Expected: PASS — all three test files, **79 tests total**: `diff.test.js` 50 (52 after Task 1's +2, minus the 2 `summarize` tests removed in Step 4 here = net unchanged at 50, but 2 old tests swapped for 2 new ones), `log.test.js` 7 (unchanged), `telegram.test.js` 22 (Task 2, up from 14). Pre-plan baseline was 71 (50+7+14) — the net +8 is entirely `telegram.test.js`'s new coverage.

- [ ] **Step 6: Commit**

```bash
cd /Users/nugui/AP127_V2
git add watchdog/src/index.js watchdog/test/diff.test.js
git commit -m "watchdog: wire buildCombinedMessages into the send loop, remove MAX_SENDS_PER_DEST/summarize"
```

---

### Task 4: Deploy and verify live

**Files:** none (deploy + verification only)

**Interfaces:**
- Consumes: the deployed `ap127-watchdog` worker's public HTTP API (`/status`, `/test`) — no code interfaces.
- Produces: nothing consumed by later tasks; this is a terminal verification step.

- [ ] **Step 1: Final full test run before deploy**

Run: `cd /Users/nugui/AP127_V2/watchdog && npx vitest run`
Expected: PASS — all tests green (confirms Tasks 1-3 landed correctly together).

- [ ] **Step 2: Deploy**

Run: `cd /Users/nugui/AP127_V2/watchdog && npx wrangler deploy`
Expected: Output ends with `Deployed ap127-watchdog triggers` and the worker URL — no error.

- [ ] **Step 3: Verify the worker responds and is healthy**

Run: `curl -s "https://ap127-watchdog.anusorn-tanmetha.workers.dev/status"`
Expected: JSON with `"lastError":null` — a stale `staleMinutes` right after deploy is normal (waiting for the next `*/5` cron tick); re-check after ~5 minutes and expect `"healthy":true`.

- [ ] **Step 4: Smoke-test that the worker can still send Telegram messages post-deploy**

This uses the existing `/test` endpoint (bypasses `buildCombinedMessages`, but confirms the deploy is alive and `sendTelegram`/secrets still work — the only network-dependent piece Tasks 1-3 touched indirectly). Requires the `WATCHDOG_API_KEY` value.

Run:
```bash
curl -s -X POST "https://ap127-watchdog.anusorn-tanmetha.workers.dev/test" \
  -H "X-API-Key: <WATCHDOG_API_KEY>" -H "Content-Type: application/json" \
  -d '{"message":"Watchdog combined-notifications deploy — smoke test"}'
```
Expected: `{"ok":true,"results":[...]}` and the test message actually arrives in the configured Telegram destination(s).

- [ ] **Step 5: No commit needed — deploy is not a git-tracked action**

Skip to Task 5.

---

### Task 5: Update all docs (CLAUDE.md, REVAMP.md, AP127_Docs README.md)

**Files:**
- Modify: `AP127_V2/CLAUDE.md` (Verify section)
- Modify: `AP127_V2/REVAMP.md` (change log)
- Modify: `AP127_Docs/README.md` (§6.1, §6.3, §6.4, §6.7, new §10 entry, "Last updated" header)

**Interfaces:** none — documentation only, no code.

- [ ] **Step 1: `AP127_V2/CLAUDE.md`** — insert a new bullet immediately before the existing `**Watchdog (2026-07-17)**` bullet (search for the exact anchor text `Next → \`p110\`. **Watchdog (2026-07-17) — completion label fix`):

Insert this text right after `Next → \`p110\`. ` and right before `**Watchdog (2026-07-17)`:

```
**Watchdog (2026-07-25) — combined per-run notifications (spec: `docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md`):** Replaced the individual-message-or-summary split with a single mode: **every run sends one combined, fully-detailed message per destination**, `@mention`s every matched SP every time (fixes the 2026-07-21 outage-catch-up gap where a 26-event burst went out as one anonymous summary with zero mentions). Events group by urgency (❌ Cancelled → ⚠️ Changed → 🔄 Status update → ✈️ New → ✅ Completed, empty groups omitted), sorted by flight time within each group. Time is now **always** shown as a full `start–end` range (never a bare start), and a time change shows the full old range → full new range together. **Completed** flights now show full actual-flight data: touch-and-go count (`N T/O · N LDG`), actual clock times (`TO HH:MM · LDG HH:MM`, collision-distinct from the count label), and `INST N` (only when non-zero) — sourced from new display-only fields on `diff.js`'s `buildSnapshot()` (`to`/`ldg`/`tkoff`/`ldgTime`/`inst`, deliberately NOT added to `TRACKED` so they never themselves fire an event). Splits into multiple `(n/total)` messages only if content would exceed Telegram's 4,096-char hard limit (two-pass build: bodies first, headers once the total is known) — a typical mixed-event run stays well under one message, a 30-event all-Completed synthetic test confirmed correct multi-chunk splitting with the group header re-shown in each chunk. `formatMessage()`/`formatSummary()` and `MAX_SENDS_PER_DEST` are removed, replaced by `telegram.js`'s `buildCombinedMessages()`. 79 watchdog worker tests (up from 71 — see the spec for the full before/after; the separate `watchdog-monitor` package's 15 tests are unaffected by this change). No frontend/pNN change (backend worker only). Redeploy: `cd watchdog && npx wrangler deploy`.
```

- [ ] **Step 2: `AP127_V2/REVAMP.md`** — add a new row at the top of the change-log table (matching the style of the existing watchdog-backend-only row at line 397, which has no `pNN` token since no frontend file changed):

```
| 2026-07-25 | **Watchdog: combined per-run notifications, full completed-flight actual data** | Replaced individual-or-summary sending with always-one-combined-message-per-destination-per-run (grouped by urgency, chunked only past Telegram's 4096-char limit); every matched SP is now @mentioned in every run including large bursts (fixes the 2026-07-21 outage gap). Completed flights now show T/O·LDG count, actual TO/LDG clock times, and INST time. See `docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md`. | `watchdog/src/diff.js`, `watchdog/src/telegram.js`, `watchdog/src/index.js` |
```

- [ ] **Step 3: `AP127_Docs/README.md` §6.1** — replace the "What it does" paragraph:

Old:
```
### 6.1 What it does
Every 5 minutes it fetches the latest AP-127 flights, diffs them against the previous snapshot, and
sends a **Telegram message per change** to the affected student (or the group chat). All on the free tier.
```

New:
```
### 6.1 What it does
Every 5 minutes it fetches the latest AP-127 flights, diffs them against the previous snapshot, and
sends **one combined, fully-detailed Telegram message per destination** covering every change from
that run (chunked into multiple messages only if content would exceed Telegram's 4,096-char limit —
see §6.4). Every affected SP is `@mentioned` in every run, including large bursts. All on the free tier.
```

- [ ] **Step 4: `AP127_Docs/README.md` §6.3** — update the snapshot-fields bullet and the "Not tracked" bullet:

Old:
```
- Snapshot = flat map keyed by flight `id`, storing `date,start,end,status,student,instructor,lesson,tail,type`.
- **Tracked fields** (any change → event): `date, start, end, status, instructor, tail, lesson`.
- **Not tracked:** actuals (`tkoff,ldgTime,airborne,to,ldg,inst`), `cond,isSim,isStandby,durMin,duration`.
```

New:
```
- Snapshot = flat map keyed by flight `id`, storing `date,start,end,status,student,instructor,lesson,tail,type`
  plus (2026-07-25) display-only actual-flight fields `to,ldg,tkoff,ldgTime,inst`.
- **Tracked fields** (any change → event): `date, start, end, status, instructor, tail, lesson`.
- **Not tracked (never diffed, never fires an event on their own):** `to,ldg,tkoff,ldgTime,inst` — captured
  in the snapshot since 2026-07-25 purely for display on the Completed message (§6.4), NOT diffable; plus
  `airborne` (never captured at all — display-only rule, never used for hours, matches `AP127_V3`'s
  `FlightDrawer.tsx`), and `cond,isSim,isStandby,durMin,duration`.
```

- [ ] **Step 5: `AP127_Docs/README.md` §6.4** — full replacement:

Old:
```
### 6.4 Message formatting & sending (`src/telegram.js`)
- SP name → Telegram `@username` via the roster config (`roster[].scheduleName` → `telegramUsername`);
  falls back to the raw name if unmapped.
- Sends via Bot API `POST https://api.telegram.org/bot<TOKEN>/sendMessage` with `{chat_id, text}`.
- Rate-limit aware: 1 s pause between messages (Telegram = 30 msg/s global, 1 msg/s per chat).
```

New:
```
### 6.4 Message formatting & sending (`src/telegram.js`) — redesigned 2026-07-25
- **`buildCombinedMessages(destLabel, events, roster)`** replaces the old `formatMessage()`/`formatSummary()`
  split. Always builds ONE combined message per destination per run — never a bare counts-only summary — so
  every matched SP is `@mentioned` every time, including large bursts (the old `MAX_SENDS_PER_DEST`=8 summary
  path left every SP unmentioned above 8 events; confirmed silent on the 2026-07-21 19-hour-outage catch-up).
- **Grouped by urgency**, empty groups omitted: ❌ Cancelled → ⚠️ Changed → 🔄 Status update → ✈️ New →
  ✅ Completed. Sorted by flight time within each group.
- **Time is always the full `start–end` range**, never a bare start; a time change shows the full old range
  → full new range together (never an ambiguous single-time arrow).
- **Completed** shows full actual-flight data: `planned … → flew …` (or the plain flown range if there's no
  planned/actual diff — i.e. an `ACTUAL_ONLY` add), aircraft, touch-and-go count (`N T/O · N LDG`), actual
  clock times (`TO HH:MM · LDG HH:MM` — deliberately NOT `T/O`, to stay visually distinct from the count
  label on the same line), and `INST N` (only when non-zero, true for only ~18% of completions).
- SP name → Telegram `@username` via the roster config (`roster[].scheduleName` → `telegramUsername`);
  falls back to the raw name if unmapped.
- Sends via Bot API `POST https://api.telegram.org/bot<TOKEN>/sendMessage` with `{chat_id, text}`.
- **Chunking:** splits into multiple `(n/total)`-labeled messages only if content would exceed Telegram's
  **4,096-char hard limit** (`MAX_MESSAGE_CHARS`=4000 budget, headroom for the header). Two-pass build
  (bodies first, then finalized headers once the total chunk count is known). A group header is re-shown
  at the top of any chunk a group's events got split into, so a later chunk's events are never unlabeled.
- Rate-limit aware: 3.5 s pause between sends (Telegram ≈ 20 msg/min per chat) — now only between chunks
  or destinations, not per individual flight change, since there's normally just one send per destination.
- Full spec: `CMDV2/docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md`.
```

- [ ] **Step 6: `AP127_Docs/README.md` §6.7** — append a short note (find the existing §6.7 block and add this sentence to the end of it):

Append: `Snapshot entries are slightly larger since 2026-07-25 (5 new display-only fields per flight, §6.3) — no new key, same \`watchdog:snapshot\` key, no migration needed.`

- [ ] **Step 7: `AP127_Docs/README.md` — new §10 log entry**

Add to the top of §10 (immediately after the `## 10. Open items` header, before the existing newest entry):

```
**Resolved 2026-07-25 (Watchdog: combined per-run notifications, full completed-flight actual data):**
Replaced the individual-message-or-summary send strategy with always-one-combined-message-per-destination-
per-run, closing the gap found during the 2026-07-21 outage incident (a 26-event burst went out as one
anonymous "26 flight updates" summary with zero SP mentions). Every run now groups matched events by
urgency (Cancelled → Changed → Status update → New → Completed), sorts by flight time, and sends one
`@mention`-preserving message per destination — splitting into multiple `(n/total)` messages only if
content would exceed Telegram's verified 4,096-char hard limit (typical runs stay well under one message;
a 30-event synthetic all-Completed test confirmed correct multi-chunk splitting). Time is now always shown
as a full start–end range, never a bare start. Completed flights show full actual data — touch-and-go
count, actual TO/LDG clock times, and instrument time — sourced from new display-only fields added to
`diff.js`'s `buildSnapshot()` (deliberately excluded from `TRACKED` so they can't themselves trigger an
event). `formatMessage()`/`formatSummary()`/`MAX_SENDS_PER_DEST` removed, replaced by `telegram.js`'s
`buildCombinedMessages()`. 79 watchdog worker tests (was 71). Spec: `CMDV2/docs/superpowers/specs/2026-07-25-
watchdog-combined-notifications-design.md`. See §6.1/§6.3/§6.4/§6.7.
```

- [ ] **Step 8: `AP127_Docs/README.md` — update the "Last updated" header** (line 11)

Old (locate the current first sentence of the `> **Last updated:**` line):
```
> **Last updated:** 2026-07-21 (recovered a 19-hour silent watchdog outage via redeploy; found the monitor's Telegram alert secret was never set, so it detected the outage but couldn't send — action still pending). Previously:
```

New:
```
> **Last updated:** 2026-07-25 (Watchdog: combined per-run notifications — every matched SP is now @mentioned in every run including large bursts, plus full completed-flight actual data). Previously: 2026-07-21 (recovered a 19-hour silent watchdog outage via redeploy; found the monitor's Telegram alert secret was never set, so it detected the outage but couldn't send — action still pending). Previously:
```

(Keep everything after the second `Previously:` unchanged — this only prepends the new entry and demotes the 07-21 one to the next "Previously".)

- [ ] **Step 9: Commit and push both repos**

```bash
cd /Users/nugui/AP127_V2
git add CLAUDE.md REVAMP.md
git commit -m "docs: log combined per-run Watchdog notifications change"
git pull --rebase
git push

cd /Users/nugui/AP127_Docs
git add README.md
git commit -m "docs: Watchdog combined per-run notifications — §6.1/6.3/6.4/6.7 + §10 log entry"
git pull --rebase
git push
```

- [ ] **Step 10: Verify both pushes succeeded**

Run: `cd /Users/nugui/AP127_V2 && git log --oneline -1` and `cd /Users/nugui/AP127_Docs && git log --oneline -1`
Expected: each shows the commit just made, and `git status` in both is clean (no pending changes).
