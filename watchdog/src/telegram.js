const TELEGRAM_BASE = 'https://api.telegram.org/bot';

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
}

function spMention(student, roster) {
  const entry = (roster || []).find(r => r.scheduleName === student);
  const name = student || '—';
  return entry?.telegramUsername ? `${name} (@${entry.telegramUsername})` : name;
}

// Detail lines for the fields that changed in a diff (shared by CHANGED and STATUS updates).
// `skipStatus` omits the status transition itself (STATUS renders that on the lesson line).
function changeDetailLines(diff, f, { skipStatus = false } = {}) {
  const lines = [];
  if (diff.start || diff.end) {
    const fromT = `${diff.start?.from ?? f.start}–${diff.end?.from ?? f.end}`;
    const toT   = `${diff.start?.to   ?? f.start}–${diff.end?.to   ?? f.end}`;
    lines.push(`⏰ ${fromT} → ${toT}`);
  }
  if (diff.date)       lines.push(`📅 ${diff.date.from} → ${diff.date.to}`);
  if (diff.tail)       lines.push(`🛩 ${diff.tail.from} → ${diff.tail.to}`);
  if (diff.instructor) lines.push(`👨‍✈️ ${diff.instructor.from} → ${diff.instructor.to}`);
  if (diff.lesson)     lines.push(`📖 ${diff.lesson.from} → ${diff.lesson.to}`);
  if (!skipStatus && diff.status) lines.push(`🔖 ${diff.status.from ?? '—'} → ${diff.status.to ?? '—'}`);
  return lines;
}

export function formatMessage(event, roster) {
  const { type, flight: f, diff = {} } = event;
  const sp = spMention(f.student, roster);
  const fi = f.instructor || '—';
  const d = fmtDate(f.date);
  const t = f.start && f.end ? `${f.start}–${f.end}` : (f.start || '—');
  const head = (title) => [title, `SP: ${sp}`, `FI: ${fi}`, `📅 ${d}  ${t}`, `📖 ${f.lesson || '—'}`];

  // Flight completed — reached either as an ADDED ACTUAL_ONLY record (status Completed) or as an
  // in-place STATUS transition to Completed. Both mean "the flight flew"; show one completion card.
  const completed = f.status === 'Completed'
    && (type === 'ADDED' || (type === 'STATUS' && diff.status?.to === 'Completed'));
  if (completed) {
    const lines = [...head('✅ Flight completed'), `🛩 ${f.tail || '—'}`];
    // When completion also recorded the actual flown times, show planned → actual for context.
    if (diff.start || diff.end) {
      const planned = `${diff.start?.from ?? f.start}–${diff.end?.from ?? f.end}`;
      const flew    = `${diff.start?.to   ?? f.start}–${diff.end?.to   ?? f.end}`;
      if (planned !== flew) lines.push(`🕐 planned ${planned} → flew ${flew}`);
    }
    return lines.join('\n');
  }

  if (type === 'ADDED') {
    return [...head('✈️ New flight'), `🛩 ${f.tail || '—'}`].join('\n');
  }

  if (type === 'REMOVED') {
    return head('❌ Flight cancelled').join('\n');
  }

  if (type === 'STATUS') {
    const lines = [
      `🔄 Status update`,
      `SP: ${sp}`,
      `FI: ${fi}`,
      `📅 ${d}  ${t}`,
      `📖 ${f.lesson || '—'}  ${diff.status?.from || '—'} → ${diff.status?.to || '—'}`,
    ];
    // Append any fields (times, tail, instructor, date) that changed alongside the status, so a
    // bundled reschedule-and-cancel/confirm isn't reduced to just the status line.
    lines.push(...changeDetailLines(diff, f, { skipStatus: true }));
    return lines.join('\n');
  }

  // CHANGED — show current full details, then separator, then what changed
  const lines = [...head('⚠️ Flight updated'), `🛩 ${f.tail || '—'}`, `—————————————`];
  lines.push(...changeDetailLines(diff, f));
  return lines.join('\n');
}

// Compact summary sent to a destination when a single run produced more matched events than we want
// to fire individually (mass reschedule / bad-feed burst). Bounds spam + wall-clock; full per-event
// detail is still written to the log and visible in the dashboard.
export function formatSummary(destLabel, events) {
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
  const order = ['ADDED', 'CHANGED', 'STATUS', 'REMOVED'];
  const verb = { ADDED: 'new/updated', CHANGED: 'changed', STATUS: 'status', REMOVED: 'cancelled' };
  const parts = order.filter(t => counts[t]).map(t => `${counts[t]} ${verb[t]}`);
  return [
    `📋 ${events.length} flight updates${destLabel ? ` — ${destLabel}` : ''}`,
    parts.join(' · '),
    `(too many to list individually — open the Watchdog dashboard for details)`,
  ].join('\n');
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
