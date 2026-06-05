import { buildSnapshot, diffSnapshots } from './diff.js';
import { formatMessage, sendTelegram } from './telegram.js';
import { appendLog, getLog } from './log.js';

const FLIGHT_SRC = 'https://raw.githubusercontent.com/AP127CMD/CMD_CTR/main/flight-data.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://ap127-cmdv2.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

const DEFAULT_CONFIG = {
  enabled: true,
  roster: [],
  eventTypes: { ADDED: true, REMOVED: true, CHANGED: true, STATUS: true },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

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
    const filtered = events.filter(e => config.eventTypes?.[e.type] !== false);

    // Save snapshot first — if Telegram fails, next run won't replay the same events
    await env.KV.put('watchdog:snapshot', JSON.stringify(newSnap));

    const logEntries = [];
    for (const event of filtered) {
      const msg = formatMessage(event, config.roster || []);
      try {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, msg);
      } catch (e) {
        // Log the failure but continue — snapshot is already saved
        console.error('Telegram send failed:', e.message);
      }
      logEntries.push({
        type: event.type, flightId: event.flight.id, student: event.flight.student,
        lesson: event.flight.lesson, date: event.flight.date,
        start: event.flight.start, end: event.flight.end,
        tail: event.flight.tail, instructor: event.flight.instructor, diff: event.diff,
      });
      // Avoid Telegram rate limit (30 msg/sec global, 1 msg/sec per chat)
      if (filtered.length > 1) await new Promise(r => setTimeout(r, 1000));
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

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
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
    const msgId = await sendTelegram(
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_CHAT_ID,
      '✅ AP127 Watchdog test message — bot is connected.',
    );
    return json({ ok: true, messageId: msgId });
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
