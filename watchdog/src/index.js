import { buildSnapshot, diffSnapshots, suppressActualPairs } from './diff.js';
import { formatMessage, formatSummary, sendTelegram } from './telegram.js';
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

async function fetchFeedText() {
  const res = await fetch(FLIGHT_SRC, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  return res.text();
}

function parseFeed(text) {
  const idx = text.indexOf('window.FLIGHT_DATA =');
  if (idx === -1) throw new Error('window.FLIGHT_DATA not found in upstream');
  const jsonStr = text.slice(idx + 'window.FLIGHT_DATA ='.length).trim().replace(/;\s*$/, '');
  return JSON.parse(jsonStr);
}

// Cheap change-signal that avoids the ~1.4 MB JSON.parse on unchanged runs (the dominant CPU cost
// on the Free plan). `fetchedAt` sits at the very start of the payload and only changes when
// CMD_CTR commits new data (its pipeline commits ONLY on real data change), so (fetchedAt + byte
// length) uniquely identifies a feed version. Length is a belt-and-suspenders guard against the
// near-impossible same-second regeneration with different content.
export function extractFeedSig(text) {
  const head = (text || '').slice(0, 400);
  const m = head.match(/"fetchedAt"\s*:\s*"([^"]+)"/);
  return `${m ? m[1] : '?'}|${(text || '').length}`;
}

async function loadConfig(kv) {
  const raw = await kv.get('watchdog:config', 'text');
  return raw ? JSON.parse(raw) : DEFAULT_CONFIG;
}

async function loadStatus(kv) {
  const raw = await kv.get('watchdog:status', 'text');
  return raw ? JSON.parse(raw)
    : { lastRun: null, lastChange: null, lastError: null, runCount: 0, feedSig: null, anomalyStreak: 0 };
}


export function flightTimestampMs(flight) {
  if (!flight?.date) return 0;
  const time = flight.start || '00:00';
  const ms = Date.parse(`${flight.date}T${time}:00+07:00`);
  return Number.isNaN(ms) ? 0 : ms;
}

// Actionable filter — only NOTIFY/LOG for flights dated today or later in Asia/Bangkok. Replaces
// the earlier fixed NOTICE_CUTOFF_MS (a hardcoded 2026-07-11 date that went stale the moment
// "today" moved past it — it began letting 2-3-day-old flights fire notifications, observed live).
// This rolling rule never expires and matches intent: only upcoming/today flights are actionable.
// It is intentionally SEPARATE from withinSnapshotWindow(): the snapshot keeps a small look-back so
// same-day/recent flights diff correctly, but changes to already-past flights are never notified.
export function bangkokDateStr(nowMs) {
  return new Date(nowMs + 7 * 60 * 60 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD in +07:00
}
export function isActionable(flight, todayStr) {
  return !!flight?.date && flight.date >= todayStr;
}

// Bad-feed guard. A truncated/empty/stale upstream fetch (GitHub hiccup, a broken CMD_CTR publish,
// or mid-migration churn) makes in-window flights momentarily vanish → the diff fires a burst of
// spurious REMOVED events AND overwrites the snapshot with the bad data, which then re-ADDs them all
// next run. We detect a sudden severe shrinkage and HOLD the run (don't touch the snapshot, don't
// notify). To avoid permanently blocking a GENUINE mass change, we only hold up to ANOMALY_MAX_STREAK
// consecutive runs (~15 min), then accept. Requires a real baseline first (ANOMALY_MIN_BASELINE).
export const ANOMALY_MIN_BASELINE = 20;
export const ANOMALY_DROP_RATIO = 0.5;  // >50% sudden drop = suspect
export const ANOMALY_MAX_STREAK = 3;
export function isAnomalousDrop(prevCount, newCount) {
  return prevCount >= ANOMALY_MIN_BASELINE && newCount < prevCount * ANOMALY_DROP_RATIO;
}

// CPU budget guard. The upstream feed carries ~3 months of past flights (4000+ records, ~1.4 MB)
// but the watchdog only ever notifies on upcoming ones. Parsing + snapshotting + diffing the full
// history every 5 min pushed the scheduled invocation over Cloudflare's CPU limit as the dataset
// grew — a hard kill that bypasses the try/catch, so it failed silently (see AP127_Docs §10, the
// recurring "Exceeded CPU Limit" incident). Confirmed 2026-07-14: this account is on the Workers
// **Free plan** (Cloudflare rejects raising `limits.cpu_ms` — "not supported for the Free plan"),
// so the CPU cap is a hard, non-negotiable ~10ms per invocation — a once-daily full-history check
// would fail exactly the same way, every single day. We restrict the snapshot/diff to a BOUNDED
// rolling window (both back AND forward) — flights dated within
// [today − SNAPSHOT_LOOKBACK_MS, today + SNAPSHOT_LOOKAHEAD_MS] in Asia/Bangkok. This cuts the
// stored snapshot ~95% (1.1 MB → ~50 KB) and, crucially, CAPS it in both directions — history
// (and any future growth in how far ahead the academy books) can no longer accumulate into the hot
// path. LOOKBACK gives a small grace window so same-day edits/cancellations of already-started
// flights still diff correctly. This window governs the SNAPSHOT/DIFF only; whether an event is
// actually NOTIFIED/LOGGED is a separate, stricter decision — see isActionable() (today or later).
//
// A flight scheduled further out than LOOKAHEAD is simply not in today's snapshot yet — it is NOT
// silently dropped. As days pass and it crosses into the window, it's a new key in newSnap that
// wasn't in the previous (smaller) snapshot, so diffSnapshots() naturally fires ADDED for it, same
// as any other new booking. No extra code needed; this is inherent to the id-keyed diff design —
// see the "flight enters window" tests below.
export const SNAPSHOT_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;  // 3 days back
export const SNAPSHOT_LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000; // 14 days forward

export function withinSnapshotWindow(flight, nowMs) {
  const ts = flightTimestampMs(flight);
  if (ts === 0) return false; // no date — never track
  return ts >= nowMs - SNAPSHOT_LOOKBACK_MS && ts <= nowMs + SNAPSHOT_LOOKAHEAD_MS;
}

// batchFilter: '*' = all, string = exact match, '!X' = exclude X, string[] = any of list
export function matchesBatchFilter(filter, flightBatch) {
  if (!filter || filter === '*') return true;
  if (Array.isArray(filter)) return filter.includes(flightBatch);
  if (filter.startsWith('!')) return flightBatch !== filter.slice(1);
  return flightBatch === filter;
}

// Wall-clock guard. Each Telegram send is followed by a 3.5 s gap (Telegram's ~20 msg/min limit),
// so a mass-change run could otherwise blow the invocation's wall-clock limit (e.g. 26 events ×
// 3.5 s ≈ 91 s) and get killed — a fresh silent-failure vector, especially if a broad destination
// (e.g. the whole AP127 group) is enabled. planNotifications() routes each destination's matched
// events, and flags any destination with more than MAX_SENDS_PER_DEST for a single SUMMARY message
// instead of individual spam. The full detail is still written to the log either way.
export const MAX_SENDS_PER_DEST = 8;
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
    if (items.length) plan.push({ dest, items, summarize: items.length > MAX_SENDS_PER_DEST });
  }
  return plan;
}

async function runWatchdog(env) {
  const ts = new Date().toISOString();
  const nowMs = Date.now();
  const prevStatus = await loadStatus(env.KV);
  const lastRunMs = prevStatus.lastRun ? new Date(prevStatus.lastRun).getTime() : 0;
  const quietStale = nowMs - lastRunMs > 25 * 60 * 1000;

  // Single status writer. Preserves carried fields (feedSig, anomalyStreak) unless overridden.
  // `changed` marks an actionable change (advances lastChange). `force` writes even on a quiet run
  // (used when we must persist feedSig / anomalyStreak). Otherwise the 25-min quiet-skip applies,
  // which keeps idle KV writes low while still refreshing the heartbeat at least every 25 min.
  const writeStatus = async ({ changed = false, force = false, ...fields } = {}) => {
    if (!changed && !force && !quietStale && prevStatus.lastRun) return;
    await env.KV.put('watchdog:status', JSON.stringify({
      lastRun: ts,
      lastChange: changed ? ts : (prevStatus.lastChange || null),
      lastError: null,
      runCount: (prevStatus.runCount || 0) + 1,
      feedSig: prevStatus.feedSig ?? null,
      anomalyStreak: prevStatus.anomalyStreak || 0,
      ...fields,
    }));
  };

  try {
    const config = await loadConfig(env.KV);
    if (!config.enabled) return;

    const text = await fetchFeedText();
    const sig = extractFeedSig(text);

    // Skip-on-unchanged: identical feed to the last PROCESSED version → nothing to diff. Avoids the
    // ~1.4 MB JSON.parse (the dominant CPU cost) entirely. Gated on having processed before, so the
    // first run after (re)deploy always does a full pass. The download already happened (I/O, not CPU).
    if (prevStatus.feedSig && sig === prevStatus.feedSig) {
      await writeStatus(); // heartbeat only, subject to the 25-min quiet-skip
      return;
    }

    // Only snapshot/diff the bounded rolling window — keeps CPU bounded regardless of feed history
    // growth (see SNAPSHOT_LOOKBACK_MS / SNAPSHOT_LOOKAHEAD_MS).
    const data = parseFeed(text);
    const relevant = (data.flights || []).filter(f => withinSnapshotWindow(f, nowMs));
    const newSnap = buildSnapshot(relevant);
    const newCount = Object.keys(newSnap).length;

    const prevRaw = await env.KV.get('watchdog:snapshot', 'text');
    const prevSnap = prevRaw ? JSON.parse(prevRaw) : {};
    const prevCount = Object.keys(prevSnap).length;

    // Bad-feed guard (see isAnomalousDrop). Hold — but not forever — on a suspicious sudden shrink.
    const streak = prevStatus.anomalyStreak || 0;
    if (isAnomalousDrop(prevCount, newCount) && streak < ANOMALY_MAX_STREAK) {
      // Do NOT persist the new feedSig (so the next run re-evaluates) and do NOT touch the snapshot.
      await writeStatus({
        force: true,
        anomalyStreak: streak + 1,
        lastError: `suspected bad feed: ${prevCount}→${newCount} flights, held (${streak + 1}/${ANOMALY_MAX_STREAK})`,
      });
      return;
    }

    const events = diffSnapshots(prevSnap, newSnap);
    const typeFiltered = events.filter(e => config.eventTypes?.[e.type] !== false);
    // Suppress "record actual" pairs: when a flight is completed the system cancels the planned
    // entry and adds a new ACTUAL_ONLY entry. Don't notify either half.
    const deduped = suppressActualPairs(typeFiltered);
    // Notify/log only actionable events (flight today or later, Bangkok). Past-in-window churn is
    // used to keep the snapshot consistent but never surfaced.
    const todayStr = bangkokDateStr(nowMs);
    const notifiable = deduped.filter(e => isActionable(e.flight, todayStr));

    // Update snapshot whenever the window changed at all (or first run) — keeps the baseline exactly
    // current so non-actionable churn doesn't re-diff every run. Independent of notify gating.
    if (events.length > 0 || !prevRaw) {
      await env.KV.put('watchdog:snapshot', JSON.stringify(newSnap));
    }

    // Destinations: from config, or fall back to env var (legacy single-chat).
    const allDests = config.destinations?.length
      ? config.destinations
      : [{ label: 'Default', chatId: env.TELEGRAM_CHAT_ID, threadId: null, mention: true, enabled: true, batchFilter: '*' }];

    // Send (bounded per destination — summary instead of individual spam beyond MAX_SENDS_PER_DEST).
    for (const { dest, items, summarize } of planNotifications(notifiable, allDests)) {
      try {
        if (summarize) {
          await sendTelegram(env.TELEGRAM_BOT_TOKEN, dest.chatId, formatSummary(dest.label, items), dest.threadId);
          await new Promise(r => setTimeout(r, 3500));
        } else {
          const roster = dest.mention !== false ? (config.roster || []) : [];
          for (const e of items) {
            await sendTelegram(env.TELEGRAM_BOT_TOKEN, dest.chatId, formatMessage(e, roster), dest.threadId);
            await new Promise(r => setTimeout(r, 3500)); // Telegram ~20 msg/min per chat
          }
        }
      } catch (e) {
        console.error(`Telegram send to "${dest.label}" failed:`, e.message);
      }
    }

    // Log every actionable event (full detail retained even when Telegram was summarized).
    const logEntries = notifiable.map(e => ({
      type: e.type, flightId: e.flight.id, student: e.flight.student,
      lesson: e.flight.lesson, date: e.flight.date, start: e.flight.start,
      end: e.flight.end, tail: e.flight.tail, instructor: e.flight.instructor, diff: e.diff,
    }));
    await appendLog(env.KV, logEntries, ts);

    // Feed changed → always persist the new sig (enables skip-on-unchanged next run) + reset streak.
    await writeStatus({ force: true, changed: notifiable.length > 0, feedSig: sig, anomalyStreak: 0 });
  } catch (err) {
    await env.KV.put('watchdog:status', JSON.stringify({
      ...prevStatus, lastRun: ts, lastError: err.message,
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

  // GET /status — includes computed staleness so an external dead-man's-switch is trivial.
  // NOTE: a quiet (no-change) run only refreshes lastRun every ~25 min, so staleMinutes up to ~25
  // is normal/healthy; > 30 means the scheduled worker is genuinely not completing (e.g. the CPU
  // hard-kill failure mode, which is otherwise invisible because it bypasses the error handler).
  if (url.pathname === '/status' && request.method === 'GET') {
    const status = await loadStatus(env.KV);
    const config = await loadConfig(env.KV);
    const lastRunMs = status.lastRun ? new Date(status.lastRun).getTime() : 0;
    const staleMinutes = lastRunMs ? Math.round((Date.now() - lastRunMs) / 60000) : null;
    return json({
      ...status,
      enabled: config.enabled,
      staleMinutes,
      healthy: staleMinutes != null && staleMinutes <= 30 && !status.lastError,
    });
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

    // KV free-tier limits are per-ACCOUNT, not per-namespace — so usage must be summed across every
    // namespace (the watchdog shares the account's 1,000 writes/day with the Chatbot, student-data,
    // etc.). We query account-wide, grouped by namespaceId, and report both the account total (what
    // counts against the limit) and a per-namespace breakdown (who is spending it).
    const NS_NAMES = {
      '718adf1e171842c7bf837421a14122c7': 'AP127_CHAT_KV',
      'ef9a8ffa0d2141a188d59241484cf602': 'AP127_CHAT_KV_preview',
      'c5c88c813d8d4f668f6081506ad98bcd': 'AP127_STUDENT_DATA',
      'b42f3202c5364f91aef3837132d6ccd5': 'ap127-watchdog',
    };

    const query = `{
      viewer {
        accounts(filter: {accountTag: "${env.CF_ACCOUNT_ID}"}) {
          kvOperationsAdaptiveGroups(
            filter: {date_geq: "${today}", date_leq: "${today}"}
            limit: 1000
          ) {
            dimensions { actionType namespaceId }
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

    const kvByType = {};                 // account-wide totals (what counts against the limit)
    const nsMap = {};                    // per-namespace breakdown
    for (const g of kvGroups) {
      const t = g.dimensions.actionType;
      const nsId = g.dimensions.namespaceId;
      const n = g.sum.requests || 0;
      kvByType[t] = (kvByType[t] || 0) + n;
      const ns = nsMap[nsId] || (nsMap[nsId] = { id: nsId, name: NS_NAMES[nsId] || nsId, reads: 0, writes: 0, deletes: 0, lists: 0 });
      if (t === 'read') ns.reads += n;
      else if (t === 'write') ns.writes += n;
      else if (t === 'delete') ns.deletes += n;
      else if (t === 'list') ns.lists += n;
    }

    const result = {
      date: today,
      kv: {
        reads:   kvByType.read   || 0,
        writes:  kvByType.write  || 0,
        deletes: kvByType.delete || 0,
        lists:   kvByType.list   || 0,
      },
      // Per-namespace attribution, biggest writer first (writes are the constrained dimension).
      kvByNamespace: Object.values(nsMap).sort((a, b) => b.writes - a.writes),
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
