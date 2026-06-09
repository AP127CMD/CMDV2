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
  return entry?.telegramUsername ? `@${entry.telegramUsername}` : (student || '—');
}

export function formatMessage(event, roster) {
  const { type, flight: f, diff } = event;
  const sp = spMention(f.student, roster);
  const d = fmtDate(f.date);
  const t = f.start && f.end ? `${f.start}–${f.end}` : (f.start || '—');

  if (type === 'ADDED') {
    return [
      `✈️ New flight scheduled`,
      `SP: ${sp}`,
      `📅 ${d}  ${t}`,
      `📖 Lesson: ${f.lesson || '—'}`,
      `🛩 ${f.tail || '—'}  |  FI: ${f.instructor || '—'}`,
    ].join('\n');
  }

  if (type === 'REMOVED') {
    return [
      `❌ Flight cancelled`,
      `SP: ${sp}`,
      `📅 ${d}  ${t}`,
      `📖 Lesson: ${f.lesson || '—'}`,
    ].join('\n');
  }

  if (type === 'STATUS') {
    return [
      `🔄 Status update`,
      `SP: ${sp}`,
      `📅 ${d}  ${t}`,
      `📖 ${f.lesson || '—'}  ${diff.status?.from || '—'} → ${diff.status?.to || '—'}`,
    ].join('\n');
  }

  // CHANGED
  const lines = [`⚠️ Flight updated`, `SP: ${sp}`, `📅 ${d}`];
  if (diff.start || diff.end) {
    const fromT = `${diff.start?.from ?? f.start}–${diff.end?.from ?? f.end}`;
    const toT   = `${diff.start?.to   ?? f.start}–${diff.end?.to   ?? f.end}`;
    lines.push(`⏰ Time: ${fromT} → ${toT}`);
  }
  if (diff.date)       lines.push(`📅 Date: ${diff.date.from} → ${diff.date.to}`);
  if (diff.tail)       lines.push(`🛩 Aircraft: ${diff.tail.from} → ${diff.tail.to}`);
  if (diff.instructor) lines.push(`👨‍✈️ FI: ${diff.instructor.from} → ${diff.instructor.to}`);
  if (diff.lesson)     lines.push(`📖 Lesson: ${diff.lesson.from} → ${diff.lesson.to}`);
  return lines.join('\n');
}

export async function sendTelegram(token, chatId, text, threadId) {
  const body = { chat_id: chatId, text };
  if (threadId) body.message_thread_id = threadId;
  const res = await fetch(`${TELEGRAM_BASE}${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${data.description || 'unknown error'}`);
  return data.result.message_id;
}
