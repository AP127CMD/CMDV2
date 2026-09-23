import { flightLegs, legRoute, routeCodes, spanMinutes, fmtMinutes } from './completion.js';

const TELEGRAM_BASE = 'https://api.telegram.org/bot';

// 2026-09-24: combined messages are sent with parse_mode=HTML so the Completed notice's per-leg
// table can be a monospace <pre> block (columns line up on a phone). Every piece of text in a
// message therefore goes through escapeHtml — names, remarks (often free Thai text), routes.
// sendTelegram() still falls back to plain text if Telegram ever rejects the markup.
export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A block's lines are plain strings (escaped here) or { html } (pre-built, already safe).
function joinLines(lines) {
  return lines.map(l => (typeof l === 'string' ? escapeHtml(l) : l.html)).join('\n');
}

// The per-leg table (plain text — the caller escapes it into a <pre>):
//   # Route     Off   T/O   LDG   On
//   1 VTPH→VTSB 06:30 06:40 08:35 08:40
// Route is padded to the widest leg so the four time columns stay aligned; a missing time is --:--.
function legTable(legs) {
  const t = v => (/^\d{1,2}:\d{2}$/.test(String(v ?? '')) ? String(v).padStart(5, '0') : '--:--');
  const rows = legs.map((l, i) => ({
    n: String(l.leg || (legs.length === 1 ? '1' : i + 1)),
    route: legRoute(l),
    times: [l.blockOff, l.tkoff, l.ldgTime, l.blockOn].map(t).join(' '),
  }));
  const nw = Math.max(1, ...rows.map(r => r.n.length));
  const rw = Math.max(5, ...rows.map(r => r.route.length));
  return [`${'#'.padEnd(nw)} ${'Route'.padEnd(rw)} Off   T/O   LDG   On`,
    ...rows.map(r => `${r.n.padEnd(nw)} ${r.route.padEnd(rw)} ${r.times}`)].join('\n');
}

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
  const isCancelledShape = type === 'REMOVED'
    || (type === 'STATUS' && diff.status?.to === 'Canceled')
    // 2026-07-27: stabilizeCancelledFlights (diff.js) can rebuild a cancelled booking's tracking
    // post-flap as a fresh ADDED with flight.status already 'Canceled' — not via STATUS or REMOVED.
    // Real incident: this fell through to 'new' and rendered "✈️ New" for an actually-cancelled flight.
    || (type === 'ADDED' && f.status === 'Canceled');
  // 2026-08-06: recover_vanished_bookings() (fetch_schedule.py) marks `flight.recovered` true
  // when a booking vanished with no Cancel Record ever found (removed via some portal path
  // other than the Cancel Flight form) — there's no reason to show, so route it to its own
  // group instead of looking like a normal, explained cancellation.
  if (isCancelledShape && f.recovered) return 'removed';
  if (isCancelledShape) return 'cancelled';
  if (type === 'STATUS' && diff.status?.to === 'Completed') return 'completed';
  if (type === 'ADDED' && f.status === 'Completed') return 'completed';
  if (type === 'ADDED') return 'new';
  if (type === 'CHANGED') return 'changed';
  return 'status'; // STATUS events that are neither a completion nor a cancellation
}

const GROUPS = [
  { key: 'cancelled', emoji: '❌', label: 'Cancelled' },
  { key: 'removed',   emoji: '🗑️', label: 'Removed' },
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

// Renders one event's compact block. 2026-07-26 redesign (real-user report: the prior single
// packed line wrapped mid-arrow on a phone screen — "line-cut"). Shape:
//   {typeEmoji} {SP} ({@handle})
//   {unchanged context: lesson · 🗣️ FI · 📅 date}      (only fields that did NOT change)
//   - {icon} {value}                                    (one dash-bulleted line per fact)
//   - {icon} {old} → 🆕 {new}                            (changed fact — 🆕 marks the current side)
// A changed lesson/FI/date is promoted OUT of the context line into its own dash line, so it's
// never shown twice. Every line stays well under a phone's wrap width (see design doc).
function renderEventBlock(event, roster) {
  const { flight: f, diff = {} } = event;
  const sp = spMention(f.student, roster);
  const group = classifyForGrouping(event);
  const emoji = GROUPS.find(g => g.key === group).emoji;
  const currentRange = timeRange(f.start, f.end);

  const lines = [`${emoji} ${sp}`];

  // Cancel reason/remarks (diff.js's attachCancelReasons) — rendered later in this function,
  // appended after all other facts, since it's the least time-critical detail.
  const reasonLines = [];
  if (diff.cancelReason?.reason)  reasonLines.push(`- 📝 ${diff.cancelReason.reason}`);
  if (diff.cancelReason?.remarks) reasonLines.push(`- 💬 ${diff.cancelReason.remarks}`);
  // 2026-08-06: a 'removed' event never has a Cancel Record (that's what makes it 'removed'
  // instead of 'cancelled' — see classifyForGrouping) — say so explicitly rather than just
  // silently showing fewer lines than a normal Cancelled notice, which read as broken/incomplete.
  if (group === 'removed') reasonLines.push('- ⚠️ no Cancel Flight record found — removed from the schedule directly, verify with ops/instructor');

  // Reassignment context (diff.js synthesizes this): the old owner's cancellation names who
  // replaced them, the new owner's new-flight line names who it came from.
  let reassignLine = null;
  if (diff.reassignedTo)   reassignLine = `- ↪ reassigned to ${diff.reassignedTo.student} (${diff.reassignedTo.batch})`;
  if (diff.reassignedFrom) reassignLine = `- ↪ reassigned from ${diff.reassignedFrom.student} (${diff.reassignedFrom.batch})`;

  if (group === 'completed') {
    // 2026-09-24 redesign: show the FLIGHT RECORD, not the booking — every leg with its block
    // off / take-off / landing / block on and where it went (see completion.js). The table is a
    // monospace <pre> block so the four time columns line up on a phone; everything else stays one
    // fact per dash line. No 🆕 anywhere — this is a factual record, not a change to flag.
    const legs = flightLegs(f);
    lines.push([f.lesson || '—', f.flightType, `📅 ${fmtDateShort(f.date)}`].filter(Boolean).join(' · '));
    const tails = [...new Set(legs.map(l => l.tail || f.tail).filter(Boolean))];
    const fi = f.instructor && f.instructor !== '-' ? `🗣️ ${f.instructor}` : null;
    lines.push(`- ${[fi, `🛩 ${(tails.length ? tails : [f.tail || '—']).join(', ')}`].filter(Boolean).join(' · ')}`);

    if (legs.length === 0) {
      // Completed, but nobody has entered the flight record yet (seen live: BK-AP-129-RAVE-000IR).
      lines.push(`- 📋 Planned ${currentRange} · flight record not entered yet`);
    } else {
      if (legs.length > 1) {
        lines.push(`- 🗺️ ${routeCodes(...legs.flatMap(l => [l.routeFrom, l.routeTo])).join(' → ')}`);
      }
      lines.push({ html: `<pre>${escapeHtml(legTable(legs))}</pre>` });
      const sum = pick => legs.reduce((acc, l) => { const v = pick(l); return v == null ? acc : (acc ?? 0) + v; }, null);
      const block = sum(l => spanMinutes(l.blockOff, l.blockOn));
      const air = sum(l => spanMinutes(l.tkoff, l.ldgTime));
      const durs = [block != null && `Block ${fmtMinutes(block)}`, air != null && `Air ${fmtMinutes(air)}`].filter(Boolean);
      if (durs.length) lines.push(`- ⏱ ${durs.join(' · ')}`);
      const tos = sum(l => l.to), ldgs = sum(l => l.ldg), inst = sum(l => l.inst);
      if (tos || ldgs) lines.push(`- 🛬 ${tos ?? 0} T/O · ${ldgs ?? 0} LDG${inst ? ` · ${inst} INST` : ''}`);
      const remarks = [...new Map(legs.filter(l => l.remark).map(l => [l.remark, l])).values()];
      for (const l of remarks) lines.push(`- 💬 ${legs.length > 1 && l.leg ? `Leg ${l.leg}: ` : ''}${l.remark}`);
    }
    if (reassignLine) lines.push(reassignLine);
    lines.push(...reasonLines);
    return joinLines(lines);
  }

  // Context line: lesson/FI/date, but only the ones that did NOT change (a changed one is
  // promoted to its own dash line below instead, so it's never shown twice).
  const contextParts = [];
  if (!diff.lesson)     contextParts.push(f.lesson || '—');
  if (!diff.instructor) contextParts.push(`🗣️ ${f.instructor || '—'}`);
  if (!diff.date)       contextParts.push(`📅 ${fmtDateShort(f.date)}`);
  if (contextParts.length) lines.push(contextParts.join(' · '));

  // Time — always shown (baseline fact for every non-completed group).
  if (diff.start || diff.end) {
    const fromRange = timeRange(diff.start?.from ?? f.start, diff.end?.from ?? f.end);
    lines.push(`- ⏰ ${fromRange} → 🆕 ${currentRange}`);
  } else {
    lines.push(`- ⏰ ${currentRange}`);
  }

  // Tail — always shown.
  if (diff.tail) lines.push(`- 🛩 ${diff.tail.from ?? '—'} → 🆕 ${diff.tail.to ?? '—'}`);
  else lines.push(`- 🛩 ${f.tail || '—'}`);

  // Promoted context changes.
  if (diff.lesson)     lines.push(`- 📖 ${diff.lesson.from ?? '—'} → 🆕 ${diff.lesson.to ?? '—'}`);
  if (diff.instructor) lines.push(`- 🗣️ ${diff.instructor.from ?? '—'} → 🆕 ${diff.instructor.to ?? '—'}`);
  if (diff.date)        lines.push(`- 📅 ${diff.date.from ?? '—'} → 🆕 ${diff.date.to ?? '—'}`);

  // 2026-07-26: type/cond/isSim/isStandby are diffable (diff.js) — show what changed, not just
  // that "something" did. Booleans render as plain words, not raw true/false.
  if (diff.type) lines.push(`- 🏷️ ${diff.type.from ?? '—'} → 🆕 ${diff.type.to ?? '—'}`);
  if (diff.cond) lines.push(`- 📌 ${diff.cond.from ?? '—'} → 🆕 ${diff.cond.to ?? '—'}`);
  if (diff.isSim)     lines.push(diff.isSim.to ? '- 🎮 🆕 now SIM' : '- 🎮 🆕 no longer SIM');
  if (diff.isStandby) lines.push(diff.isStandby.to ? '- ⏸️ 🆕 now STANDBY' : '- ⏸️ 🆕 no longer STANDBY');

  // Status transition (the 'status' group).
  if (group === 'status' && diff.status) lines.push(`- 🔖 ${diff.status.from ?? '—'} → 🆕 ${diff.status.to ?? '—'}`);

  if (reassignLine) lines.push(reassignLine);
  lines.push(...reasonLines);
  return joinLines(lines);
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
    const header = escapeHtml(`${group.emoji} ${group.label}`);
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
    const label = destLabel ? `${escapeHtml(destLabel)} — ` : '';
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
  // A non-2xx reply still carries Telegram's `description` — it's how the HTML fallback below
  // recognises a markup rejection — but don't assume a parseable body.
  const data = typeof res.json === 'function' ? await res.json().catch(() => ({})) : {};
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram HTTP ${res.status}: ${data.description || 'unknown error'}`);
  }
  return data.result.message_id;
}

// HTML → the plain text Telegram would have displayed (tags dropped, entities decoded).
export function htmlToPlain(html) {
  return String(html).replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

async function _sendWithRetry(token, body) {
  const result = await _doSend(token, body);
  if (result === null) return _doSend(token, body); // one retry after rate-limit wait
  return result;
}

// parseMode: omit for plain text (/test, the monitor); 'HTML' for combined notices. If Telegram
// rejects the markup ("can't parse entities") the SAME content is re-sent as plain text, so a
// rendering slip can cost the table's alignment but never the notification itself.
export async function sendTelegram(token, chatId, text, threadId, parseMode) {
  const body = { chat_id: chatId, text };
  if (threadId) body.message_thread_id = threadId;
  if (!parseMode) return _sendWithRetry(token, body);
  try {
    return await _sendWithRetry(token, { ...body, parse_mode: parseMode });
  } catch (e) {
    if (!/parse entities/i.test(e.message)) throw e;
    console.error(`Telegram rejected ${parseMode} markup (${e.message}) — resending as plain text`);
    return _sendWithRetry(token, { ...body, text: htmlToPlain(text) });
  }
}
