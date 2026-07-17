// AP127 Watchdog dead-man's-switch monitor.
//
// The main ap127-watchdog worker can die SILENTLY: a Cloudflare CPU hard-kill on the scheduled
// invocation bypasses the try/catch, so /status.lastError stays null while notifications quietly
// stop (see AP127_Docs §10 — the recurring "Exceeded CPU Limit" incident). Nothing inside that
// worker can report on itself once its own isolate is being killed. This is a SEPARATE worker with
// its own script and cron, so it keeps observing even when the watchdog is down.
//
// It polls the watchdog's public /status every 10 min and, when the watchdog is unhealthy for two
// consecutive checks (~20 min — one bad reading is tolerated to avoid false alarms), sends ONE
// Telegram alert. It sends a single recovery message when the watchdog comes back. State is kept in
// the shared KV under `monitor:*` so alerts fire on transitions only, never on every tick.

const STATE_KEY = 'monitor:state';

// Healthy quiet runs only refresh the watchdog's status every ~25 min (its quiet-skip), so a gap up
// to 25 min is normal; >30 min means the scheduled run is genuinely not completing.
export const STALE_LIMIT_MIN = 30;

// Two consecutive unhealthy checks before alerting (~20 min at the 10-min cron) — tolerates a
// single transient blip (e.g. a one-off caught upstream error) without paging.
export const CONFIRM_DOWN = 2;

// Down/up verdict computed from the watchdog's OWN KV state — NOT an HTTP call. This is deliberate:
// (1) a same-account Worker→`*.workers.dev` fetch is blocked by Cloudflare (error 1042), and
// (2) more importantly, the failure we're guarding against is a silent CPU hard-kill, and a killed
// watchdog stops WRITING KV — so a frozen `watchdog:status.lastRun` is the truest death signal, and
// it needs the watchdog's HTTP endpoint to be neither reachable nor even alive.
//   status  = parsed `watchdog:status` (or null)   config = parsed `watchdog:config` (or null)
export function evaluate(status, config, nowMs) {
  if (config && config.enabled === false) return { down: false, reason: 'disabled by config (intentional)' };
  if (!status || !status.lastRun) return { down: true, reason: 'watchdog has no status in KV (never ran / KV cleared)' };
  if (status.lastError) return { down: true, reason: `error: ${status.lastError}` };
  const staleMin = Math.round((nowMs - new Date(status.lastRun).getTime()) / 60000);
  if (staleMin > STALE_LIMIT_MIN) return { down: true, reason: `no run for ${staleMin} min (watchdog:status frozen)` };
  return { down: false, reason: 'ok' };
}

// Pure transition machine: given the persisted state and this check's down-ness, decide whether to
// alert and what the next state is. Alerts on down (after CONFIRM_DOWN in a row) and on recovery.
export function decideAlert(prev, down) {
  const downStreak = down ? (prev.downStreak || 0) + 1 : 0;
  let alertedDown = prev.alertedDown || false;
  let alert = null;
  if (!alertedDown && downStreak >= CONFIRM_DOWN) { alert = 'down'; alertedDown = true; }
  else if (alertedDown && !down) { alert = 'up'; alertedDown = false; }
  return { state: { alertedDown, downStreak }, alert };
}

// Pick where to send the alert: reuse the watchdog's own config (the admin 'Nu' destination by
// default, else the first enabled one), so no separate chat-id needs configuring. Falls back to the
// TELEGRAM_CHAT_ID var if config has no usable destination.
async function pickTarget(env) {
  try {
    const raw = await env.KV.get('watchdog:config', 'text');
    const cfg = raw ? JSON.parse(raw) : {};
    const dests = cfg.destinations || [];
    const label = env.MONITOR_DEST_LABEL || 'Nu';
    const pick = dests.find(d => d.label === label && d.chatId)
      || dests.find(d => d.enabled !== false && d.chatId)
      || dests.find(d => d.chatId);
    if (pick) return { chatId: pick.chatId, threadId: pick.threadId || null };
  } catch { /* fall through */ }
  if (env.TELEGRAM_CHAT_ID) return { chatId: env.TELEGRAM_CHAT_ID, threadId: null };
  return null;
}

async function sendTelegram(token, chatId, text, threadId) {
  const body = { chat_id: chatId, text };
  if (threadId) body.message_thread_id = threadId;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
}

async function readJson(kv, key) {
  const raw = await kv.get(key, 'text');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function runMonitor(env, nowMs = Date.now()) {
  // Read the watchdog's own KV state directly — no HTTP to the watchdog (see evaluate()).
  const status = await readJson(env.KV, 'watchdog:status');
  const config = await readJson(env.KV, 'watchdog:config');

  const verdict = evaluate(status, config, nowMs);
  const prevRaw = await env.KV.get(STATE_KEY, 'text');
  const prev = prevRaw ? JSON.parse(prevRaw) : { alertedDown: false, downStreak: 0 };
  const { state, alert } = decideAlert(prev, verdict.down);

  if (alert && env.TELEGRAM_BOT_TOKEN) {
    const target = await pickTarget(env);
    if (target) {
      const text = alert === 'down'
        ? `🚨 AP127 Watchdog DOWN\n${verdict.reason}\nFlight notifications are NOT being sent — check ap127-watchdog.`
        : `✅ AP127 Watchdog recovered\nIt is running normally again.`;
      try { await sendTelegram(env.TELEGRAM_BOT_TOKEN, target.chatId, text, target.threadId); }
      catch (e) { console.error('monitor alert send failed:', e.message); }
    }
  }

  await env.KV.put(STATE_KEY, JSON.stringify({
    ...state, reason: verdict.reason, lastCheck: new Date().toISOString(),
  }));
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runMonitor(env));
  },
  // Tiny status endpoint so the monitor itself is inspectable (and so a curl can confirm deploy).
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/state') {
      const raw = await env.KV.get(STATE_KEY, 'text');
      return new Response(raw || '{}', { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('ap127-watchdog-monitor', { status: 200 });
  },
};
