import { buildSnapshot, diffSnapshots, suppressActualPairs } from './diff.js';
import { formatMessage, sendTelegram } from './telegram.js';
import { appendLog, getLog } from './log.js';

const FLIGHT_SRC = 'https://raw.githubusercontent.com/AP127CMD/CMD_CTR/main/flight-data.js';

// Sites allowed to call this Worker.
const ALLOWED_ORIGINS = new Set([
  'https://ap127-ngt2.pages.dev',
]);
const DEFAULT_ORIGIN = 'https://ap127-ngt2.pages.dev';

// Reflect the caller's Origin when it's in the allowlist (an Access-Control-
// Allow-Origin header can only carry one value), else fall back to the primary.
function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Vary': 'Origin',
  };
}

const DEFAULT_CONFIG = {
  enabled: true,
  roster: [],
  eventTypes: { ADDED: true, REMOVED: true, CHANGED: true, STATUS: true },
};

async function fetchFlights() {
  const res = await fetch(FLIGHT_SRC, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  const text = await res.text();
  const idx = text.indexOf('window.FLIGHT_DATA =');
  if (idx === -1) throw new Error('window.FLIGHT_DATA not found in upstream');
  const jsonStr = text.slice(idx + 'window.FLIGHT_DATA ='.length).trim().replace(/;\s*$/, '');
  return JSON.parse(jsonStr);
}

async function loadConfig(kv) {
  const raw = await kv.get('watchdog:config', 'text');
  return raw ? JSON.parse(raw) : DEFAULT_CONFIG;
}

async function loadStatus(kv) {
  const raw = await kv.get('watchdog:status', 'text');
  return raw ? JSON.parse(raw) : { lastRun: null, lastChange: null, lastError: null, runCount: 0 };
}


async function runWatchdog(env) {
  const ts = new Date().toISOString();
  const prevStatus = await loadStatus(env.KV);

  try {
    const config = await loadConfig(env.KV);
    if (!config.enabled) return;

    const data = await fetchFlights();
    const newSnap = buildSnapshot(data.flights || []);

    const prevRaw = await env.KV.get('watchdog:snapshot', 'text');
    const prevSnap = prevRaw ? JSON.parse(prevRaw) : {};

    const events = diffSnapshots(prevSnap, newSnap);
    const typeFiltered = events.filter(e => config.eventTypes?.[e.type] !== false);
    // Suppress "record actual" pairs: when a flight is completed, the system cancels
    // the planned entry and adds a new ACTUAL_ONLY entry. Don't notify either half.
    const filtered = suppressActualPairs(typeFiltered);

    // Only write snapshot when something changed (or first run) — saves KV write quota
    if (filtered.length > 0 || !prevRaw) {
      await env.KV.put('watchdog:snapshot', JSON.stringify(newSnap));
    }

    // Destinations: from config, or fall back to env var (legacy single-chat)
    const destinations = config.destinations?.length
      ? config.destinations
      : [{ label: 'Default', chatId: env.TELEGRAM_CHAT_ID, threadId: null, mention: true }];

    const logEntries = [];
    for (const event of filtered) {
      for (const dest of destinations) {
        // mention:true → pass roster for @username lookup; false → plain name only
        const roster = dest.mention !== false ? (config.roster || []) : [];
        const msg = formatMessage(event, roster);
        try {
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, dest.chatId, msg, dest.threadId);
        } catch (e) {
          console.error(`Telegram send to "${dest.label}" failed:`, e.message);
        }
        // Avoid Telegram rate limit (1 msg/sec per chat)
        await new Promise(r => setTimeout(r, 1000));
      }
      logEntries.push({
        type: event.type, flightId: event.flight.id, student: event.flight.student,
        lesson: event.flight.lesson, date: event.flight.date,
        start: event.flight.start, end: event.flight.end,
        tail: event.flight.tail, instructor: event.flight.instructor, diff: event.diff,
      });
    }
    await appendLog(env.KV, logEntries, ts);
    await env.KV.put('watchdog:status', JSON.stringify({
      lastRun: ts,
      lastChange: filtered.length > 0 ? ts : (prevStatus.lastChange || null),
      lastError: null,
      runCount: (prevStatus.runCount || 0) + 1,
    }));
  } catch (err) {
    await env.KV.put('watchdog:status', JSON.stringify({
      ...prevStatus,
      lastRun: ts,
      lastError: err.message,
    }));
  }
}

async function handleFetch(request, env) {
  const url = new URL(request.url);
  const cors = corsHeaders(request);
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // GET /status
  if (url.pathname === '/status' && request.method === 'GET') {
    const status = await loadStatus(env.KV);
    const config = await loadConfig(env.KV);
    return json({ ...status, enabled: config.enabled });
  }

  // GET /config
  if (url.pathname === '/config' && request.method === 'GET') {
    return json(await loadConfig(env.KV));
  }

  // POST /config
  if (url.pathname === '/config' && request.method === 'POST') {
    if (request.headers.get('X-API-Key') !== env.WATCHDOG_API_KEY) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const body = await request.json();
    await env.KV.put('watchdog:config', JSON.stringify(body));
    return json({ ok: true });
  }

  // GET /log?month=YYYY-MM
  if (url.pathname === '/log' && request.method === 'GET') {
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return json({ error: 'Invalid month' }, 400);
    const entries = await getLog(env.KV, month);
    return json(entries);
  }

  // POST /test
  if (url.pathname === '/test' && request.method === 'POST') {
    if (request.headers.get('X-API-Key') !== env.WATCHDOG_API_KEY) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const body = request.headers.get('Content-Type')?.includes('application/json')
      ? await request.json().catch(() => ({})) : {};
    const { message, destLabel } = body;
    const config = await loadConfig(env.KV);
    const destinations = config.destinations?.length
      ? config.destinations
      : [{ chatId: env.TELEGRAM_CHAT_ID, threadId: null, label: 'Default' }];
    const targets = destLabel
      ? destinations.filter(d => d.label === destLabel)
      : destinations;
    const results = [];
    for (const dest of targets) {
      const text = message || `✅ AP127 Watchdog test — ${dest.label || 'Default'} is connected.`;
      const msgId = await sendTelegram(env.TELEGRAM_BOT_TOKEN, dest.chatId, text, dest.threadId);
      results.push({ label: dest.label, messageId: msgId });
    }
    return json({ ok: true, results });
  }

  return json({ error: 'Not found' }, 404);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWatchdog(env));
  },
  async fetch(request, env, ctx) {
    return handleFetch(request, env);
  },
};
