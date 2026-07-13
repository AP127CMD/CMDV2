import { buildSnapshot, diffSnapshots, suppressActualPairs } from './diff.js';
import { formatMessage, sendTelegram } from './telegram.js';
import { appendLog, getLog } from './log.js';

const FLIGHT_SRC = 'https://raw.githubusercontent.com/AP127CMD/CMD_CTR/main/flight-data.js';

// Sites allowed to call this Worker.
const ALLOWED_ORIGINS = new Set([
  'https://ap127-ngt2.pages.dev',
  'https://ap127-v3.pages.dev',
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


// Migration cleanup: the academy rebuilt the Ops Portal 2026-07-10/11 with no notice, which left
// the Watchdog's diff baseline stale and caused repeated floods of spurious REMOVED events for
// past flights as CMD_CTR's own scraper re-synced (recurred across multiple runs, not a one-off).
// Per explicit request: any event for a flight scheduled before this moment is ignored entirely
// (no Telegram send, no log entry) — a clean start. Self-obsoleting: becomes a permanent no-op
// once every tracked flight is dated after the cutoff, so it's safe to leave in place indefinitely.
export const NOTICE_CUTOFF_MS = Date.parse('2026-07-11T12:00:00Z'); // 19:00 Asia/Bangkok, 2026-07-11

export function flightTimestampMs(flight) {
  if (!flight?.date) return 0;
  const time = flight.start || '00:00';
  const ms = Date.parse(`${flight.date}T${time}:00+07:00`);
  return Number.isNaN(ms) ? 0 : ms;
}

// CPU budget guard. The upstream feed carries ~3 months of past flights (4000+ records, ~1.4 MB)
// but the watchdog only ever notifies on upcoming ones. Parsing + snapshotting + diffing the full
// history every 5 min pushed the scheduled invocation over Cloudflare's CPU limit as the dataset
// grew — a hard kill that bypasses the try/catch, so it failed silently (see AP127_Docs §10, the
// recurring "Exceeded CPU Limit" incident). We restrict the snapshot/diff to a rolling forward
// window: flights dated on/after (today − HORIZON) in Asia/Bangkok. This cuts the stored snapshot
// ~95% (1.1 MB → ~50 KB) and, crucially, CAPS it — history no longer accumulates into the hot path.
// HORIZON gives a small look-back so same-day edits/cancellations of already-started flights still
// diff correctly. Past flights are excluded here AND by NOTICE_CUTOFF_MS below (belt and suspenders).
export const SNAPSHOT_HORIZON_MS = 2 * 24 * 60 * 60 * 1000; // 2 days look-back

export function withinSnapshotWindow(flight, nowMs) {
  return flightTimestampMs(flight) >= nowMs - SNAPSHOT_HORIZON_MS;
}

// batchFilter: '*' = all, string = exact match, '!X' = exclude X, string[] = any of list
export function matchesBatchFilter(filter, flightBatch) {
  if (!filter || filter === '*') return true;
  if (Array.isArray(filter)) return filter.includes(flightBatch);
  if (filter.startsWith('!')) return flightBatch !== filter.slice(1);
  return flightBatch === filter;
}

async function runWatchdog(env) {
  const ts = new Date().toISOString();
  const prevStatus = await loadStatus(env.KV);

  try {
    const config = await loadConfig(env.KV);
    if (!config.enabled) return;

    const data = await fetchFlights();
    // Only snapshot/diff the rolling forward window — keeps CPU bounded (see SNAPSHOT_HORIZON_MS).
    const nowMs = Date.now();
    const relevant = (data.flights || []).filter(f => withinSnapshotWindow(f, nowMs));
    const newSnap = buildSnapshot(relevant);

    const prevRaw = await env.KV.get('watchdog:snapshot', 'text');
    const prevSnap = prevRaw ? JSON.parse(prevRaw) : {};

    const events = diffSnapshots(prevSnap, newSnap);
    const typeFiltered = events.filter(e => config.eventTypes?.[e.type] !== false);
    // Suppress "record actual" pairs: when a flight is completed, the system cancels
    // the planned entry and adds a new ACTUAL_ONLY entry. Don't notify either half.
    const actualFiltered = suppressActualPairs(typeFiltered);
    // Migration cleanup cutoff — see NOTICE_CUTOFF_MS.
    const filtered = actualFiltered.filter(e => flightTimestampMs(e.flight) >= NOTICE_CUTOFF_MS);

    // Only write snapshot when something changed (or first run) — saves KV write quota
    if (filtered.length > 0 || !prevRaw) {
      await env.KV.put('watchdog:snapshot', JSON.stringify(newSnap));
    }

    // Destinations: from config, or fall back to env var (legacy single-chat)
    const allDests = config.destinations?.length
      ? config.destinations
      : [{ label: 'Default', chatId: env.TELEGRAM_CHAT_ID, threadId: null, mention: true, enabled: true, batchFilter: '*' }];

    const logEntries = [];
    for (const event of filtered) {
      const flightBatch = event.flight.batch || 'AP-127';
      for (const dest of allDests) {
        // Skip disabled destinations
        if (dest.enabled === false) continue;
        if (!matchesBatchFilter(dest.batchFilter, flightBatch)) continue;
        if (dest.studentFilter && event.flight.student !== dest.studentFilter) continue;
        // mention:true → pass roster for @username lookup; false → plain name only
        const roster = dest.mention !== false ? (config.roster || []) : [];
        const msg = formatMessage(event, roster);
        try {
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, dest.chatId, msg, dest.threadId);
        } catch (e) {
          console.error(`Telegram send to "${dest.label}" failed:`, e.message);
        }
        // 3.5 s gap keeps per-chat rate under Telegram's 20 msg/min limit
        await new Promise(r => setTimeout(r, 3500));
      }
      logEntries.push({
        type: event.type, flightId: event.flight.id, student: event.flight.student,
        lesson: event.flight.lesson, date: event.flight.date,
        start: event.flight.start, end: event.flight.end,
        tail: event.flight.tail, instructor: event.flight.instructor, diff: event.diff,
      });
    }
    await appendLog(env.KV, logEntries, ts);

    // Skip status write on quiet runs — only write when something happened,
    // on first run, on error, or if > 25 min since last status update.
    // This cuts idle KV writes from 288/day to ~58/day.
    const lastRunMs = prevStatus.lastRun ? new Date(prevStatus.lastRun).getTime() : 0;
    const staleSince = Date.now() - lastRunMs;
    if (filtered.length > 0 || !prevStatus.lastRun || staleSince > 25 * 60 * 1000) {
      await env.KV.put('watchdog:status', JSON.stringify({
        lastRun: ts,
        lastChange: filtered.length > 0 ? ts : (prevStatus.lastChange || null),
        lastError: null,
        runCount: (prevStatus.runCount || 0) + 1,
      }));
    }
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

  // GET /cf-usage
  if (url.pathname === '/cf-usage' && request.method === 'GET') {
    if (request.headers.get('X-API-Key') !== env.WATCHDOG_API_KEY) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
      return json({ error: 'CF_API_TOKEN and CF_ACCOUNT_ID secrets not configured' }, 503);
    }

    // 5-minute KV cache to avoid hammering CF Analytics API
    const cacheKey = 'watchdog:cf-usage-cache';
    const cachedRaw = await env.KV.get(cacheKey, 'text');
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (Date.now() - cached._cachedAt < 5 * 60 * 1000) {
        return json({ ...cached, _cached: true });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const KV_NS_ID = 'b42f3202c5364f91aef3837132d6ccd5';

    const query = `{
      viewer {
        accounts(filter: {accountTag: "${env.CF_ACCOUNT_ID}"}) {
          kvOperationsAdaptiveGroups(
            filter: {date_geq: "${today}", date_leq: "${today}", namespaceId: "${KV_NS_ID}"}
            limit: 100
          ) {
            dimensions { actionType }
            sum { requests }
          }
          workersInvocationsAdaptive(
            filter: {date_geq: "${today}", date_leq: "${today}", scriptName: "ap127-watchdog"}
            limit: 10
          ) {
            sum { requests subrequests }
          }
        }
      }
    }`;

    let gqlData;
    try {
      const gqlRes = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        },
        body: JSON.stringify({ query }),
      });
      if (!gqlRes.ok) throw new Error(`CF GraphQL HTTP ${gqlRes.status}`);
      gqlData = await gqlRes.json();
    } catch (e) {
      return json({ error: `CF API error: ${e.message}` }, 502);
    }

    if (gqlData.errors?.length) {
      return json({ error: gqlData.errors[0].message }, 502);
    }

    const account = gqlData.data?.viewer?.accounts?.[0] || {};
    const kvGroups = account.kvOperationsAdaptiveGroups || [];
    const workerGroups = account.workersInvocationsAdaptive || [];

    const kvByType = {};
    for (const g of kvGroups) {
      const t = g.dimensions.actionType;
      kvByType[t] = (kvByType[t] || 0) + (g.sum.requests || 0);
    }

    const result = {
      date: today,
      kv: {
        reads:   kvByType.read   || 0,
        writes:  kvByType.write  || 0,
        deletes: kvByType.delete || 0,
        lists:   kvByType.list   || 0,
      },
      worker: {
        requests: workerGroups.reduce((s, g) => s + (g.sum.requests || 0), 0),
      },
      limits: {
        kvReads: 100000, kvWrites: 1000, kvDeletes: 1000, kvLists: 1000,
        workerRequests: 100000,
      },
      _cachedAt: Date.now(),
    };

    await env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 600 });
    return json(result);
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
