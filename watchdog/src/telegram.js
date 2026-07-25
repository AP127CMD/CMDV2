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
