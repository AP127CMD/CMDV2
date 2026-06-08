# AP127 Watchdog — Design Spec
**Date:** 2026-06-05  
**Status:** Approved  

---

## 1. Overview

A serverless watchdog that monitors the AP127 flight schedule every 5 minutes and sends Telegram notifications to the relevant SP (student pilot) whenever their schedule changes. All infrastructure runs on Cloudflare's free tier — no server required. Configuration and log browsing are exposed through a new **Watchdog** tab in CMDV2.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Cloudflare Worker: ap127-watchdog                              │
│                                                                 │
│  [Cron trigger: */5 * * * *]                                    │
│       │                                                         │
│       ▼                                                         │
│  1. Fetch flight-data.js upstream (CMD_CTR raw GitHub)          │
│  2. Load previous snapshot from KV (watchdog:snapshot)          │
│  3. Filter AP127 flights only (batch === "AP-127")              │
│  4. Diff new vs previous snapshot                               │
│  5. For each change event:                                      │
│       - Resolve SP name → Telegram @username (from KV config)   │
│       - POST message to Telegram Bot API                        │
│  6. Append events to monthly log bucket in KV                   │
│  7. Save new snapshot + update status heartbeat in KV           │
│                                                                 │
│  [HTTP API — called by CMDV2 Watchdog tab]                      │
│       GET  /status    → last run time, last change, enabled     │
│       GET  /config    → SP roster mapping + settings            │
│       POST /config    → update mapping (requires API key)       │
│       GET  /log?month=YYYY-MM  → notification history           │
│       POST /test      → send a test Telegram message            │
└─────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  Cloudflare KV namespace: AP127_WD                             │
│  watchdog:snapshot         — flat-key flight map (diff base)   │
│  watchdog:config           — SP roster mapping + prefs         │
│  watchdog:status           — last run meta (ts, error, count)  │
│  watchdog:log:YYYY-MM      — monthly log bucket (append-only)  │
│  watchdog:log:YYYY-MM-A/B  — auto-shards if bucket > 20 MB     │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  CMDV2: js/view-watchdog.js            │
│  New sidebar group "System" → Watchdog │
│  Reads: /status  /config  /log         │
│  Writes: /config (with API key prompt) │
└────────────────────────────────────────┘
```

### Worker environment variables (set in CF dashboard / wrangler.toml)

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_CHAT_ID` | Target group chat ID |
| `WATCHDOG_API_KEY` | Secret for POST /config from the tab |
| `KV` | KV namespace binding → `AP127_WD` |

---

## 3. Data Source

Upstream: `https://raw.githubusercontent.com/AP127CMD/CMD_CTR/main/flight-data.js`  
Same source used by the existing `refresh_snapshots.mjs` workflow. The Worker fetches the raw JS, extracts `window.FLIGHT_DATA`, and filters `batch === "AP-127"`.

---

## 4. Snapshot Format

Stored in `watchdog:snapshot` as a flat JSON object keyed by flight `id`:

```json
{
  "2959": {
    "id": "2959",
    "date": "2026-06-10",
    "start": "08:00",
    "end": "09:30",
    "status": "Pending",
    "student": "SIWAKORN P.",
    "instructor": "ITTIPOL P.",
    "lesson": "CDGL 04",
    "tail": "HS-NGT",
    "type": "DA40TDI"
  }
}
```

**Tracked fields** (changes to any of these fire an event):  
`date`, `start`, `end`, `status`, `instructor`, `tail`, `lesson`

**Not tracked:** `tkoff`, `ldgTime`, `airborne`, `to`, `ldg`, `inst`, `cond`, `isSim`, `isStandby`, `durMin`, `duration`

---

## 5. Diff Logic

Each cron run:

1. Fetch upstream, parse `window.FLIGHT_DATA.flights`, filter `batch === "AP-127"`
2. Build a new flat map keyed by `id`
3. Load `watchdog:snapshot` (previous map)
4. Classify each flight:
   - **ADDED** — `id` in new map, not in previous
   - **REMOVED** — `id` in previous map, not in new (cancelled)
   - **CHANGED** — `id` in both; any tracked field differs
   - **STATUS** — subset of CHANGED where only `status` differs (separate message template)
5. Zero changes → silent run; update `watchdog:status` heartbeat only
6. Write events to log, send Telegram messages, overwrite snapshot

---

## 6. Log Storage

### Monthly buckets
Logs are stored under `watchdog:log:YYYY-MM` — one KV key per calendar month, append-only, never deleted.

### Log entry schema
```json
{
  "ts": "2026-06-05T14:35:00Z",
  "type": "ADDED",
  "flightId": "2959",
  "student": "SIWAKORN P.",
  "lesson": "CDGL 04",
  "date": "2026-06-10",
  "start": "08:00",
  "end": "09:30",
  "tail": "HS-NGT",
  "instructor": "ITTIPOL P.",
  "diff": {}
}
```

For CHANGED/STATUS events, `diff` contains before/after values:
```json
"diff": { "start": { "from": "08:00", "to": "10:00" }, "tail": { "from": "HS-NGT", "to": "HS-TPT" } }
```

### Auto-sharding guard
Before appending to a monthly bucket, the Worker checks the serialised size. If it exceeds **20 MB**:
- The current key (`watchdog:log:YYYY-MM`) is renamed to `watchdog:log:YYYY-MM-A`
- A fresh `watchdog:log:YYYY-MM-B` is started
- The tab's `/log` endpoint fetches all shards for the requested month and merges them before returning

At realistic volumes (~300–3,000 entries/month × ~300 bytes), this guard will never trigger. It exists to prevent a hard KV 25 MB value-size failure.

---

## 7. Telegram Notification Format

Messages are sent to the configured group chat. If the SP has a mapped `@username`, they are mentioned; otherwise their schedule name is used as plain text.

**New flight added:**
```
✈️ New flight scheduled
SP: @siwakorn_p
📅 10 Jun 2026  08:00–09:30
📖 Lesson: CDGL 04
🛩 HS-NGT  |  FI: ITTIPOL P.
```

**Flight changed:**
```
⚠️ Flight updated
SP: @siwakorn_p
📅 10 Jun 2026
⏰ Time: 08:00–09:30 → 10:00–11:30
🛩 Aircraft: HS-NGT → HS-TPT
```

**Flight cancelled:**
```
❌ Flight cancelled
SP: @siwakorn_p
📅 10 Jun 2026  08:00–09:30
📖 Lesson: CDGL 04
```

**Status change:**
```
🔄 Status update
SP: @siwakorn_p
📅 10 Jun 2026  08:00–09:30
📖 CDGL 04 → Completed
```

Multiple change events in one cycle → separate messages, one per event.

---

## 8. Config Schema

Stored in `watchdog:config`:

```json
{
  "enabled": true,
  "roster": [
    { "scheduleName": "SIWAKORN P.", "telegramUsername": "siwakorn_p" },
    { "scheduleName": "AKARAVIT K.", "telegramUsername": null }
  ],
  "eventTypes": {
    "ADDED": true,
    "REMOVED": true,
    "CHANGED": true,
    "STATUS": true
  }
}
```

- `telegramUsername`: stored without `@`; null = SP will be named as plain text
- `eventTypes`: per-type on/off toggles (extensible — add new keys for future notification types)
- `roster` is seeded from `AP127_ROSTER` in `shared.js` on first deploy; managed via the tab thereafter

---

## 9. HTTP API

All endpoints are on the `ap127-watchdog` Worker URL. CORS uses an allowlist that reflects the request Origin — `ap127-cmdv2-ngt-imp1.pages.dev` (primary) and the legacy `ap127-cmdv2.pages.dev`.

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/status` | none | `{ lastRun, lastChange, lastError, enabled, runCount }` |
| GET | `/config` | none | full config object |
| POST | `/config` | `X-API-Key` header | updated config object |
| GET | `/log?month=YYYY-MM` | none | merged array of log entries for that month |
| POST | `/test` | `X-API-Key` header | `{ ok, messageId }` |

Rate limiting: POST endpoints reject if called more than 10×/minute per IP.

---

## 10. Watchdog Tab (view-watchdog.js)

New sidebar entry: **System** group → **Watchdog** (icon `◉`).

### Layout

**① Status strip** (top)
- Coloured dot: green = last run OK, red = last run errored
- Last run timestamp, last change detected timestamp
- `[Test Notify]` button → POST /test → confirms bot is connected

**② SP Roster mapping** (middle)
- Table: one row per AP127 student from `AP127_ROSTER`
- Columns: Schedule name | Telegram @username | Edit button
- Unmapped SPs shown with italic *(unmapped)* — notifications still sent, no @mention
- On first Edit click: modal prompts for `WATCHDOG_API_KEY` (stored in `localStorage('wd-key')` for session)
- Save → POST /config

**③ Notification log** (bottom, scrollable)
- Month picker (defaults to current month)
- Loads `GET /log?month=YYYY-MM`
- Each row: timestamp | event icon | student | lesson | summary of change
- All history preserved; browse any past month

---

## 11. Extensibility

The system is designed to add future notification channels or event types without restructuring:

- **New event types**: add a key to `config.eventTypes` and a new message formatter in the Worker
- **New channels** (e.g. LINE, email): add a `notifiers[]` array to config; each notifier has a `type` + credentials; the Worker iterates notifiers per event
- **Other batches**: remove the `batch === "AP-127"` filter or make it a config array

---

## 12. Deployment Steps

1. Create Telegram bot via @BotFather → obtain `TELEGRAM_BOT_TOKEN`
2. Add bot to the AP127 Telegram group; get `TELEGRAM_CHAT_ID` via `getUpdates`
3. Create `ap127-watchdog` Worker in Cloudflare dashboard (or `wrangler init`)
4. Create KV namespace `AP127_WD`; bind as `KV` in `wrangler.toml`
5. Set env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `WATCHDOG_API_KEY`
6. Deploy Worker with cron trigger `*/5 * * * *`
7. Seed `watchdog:config` with roster from `shared.js` AP127_ROSTER
8. Add `view-watchdog.js` to CMDV2; update `shell.js` nav groups; bump `?v=` token
9. Add CORS origin `ap127-cmdv2.pages.dev` to Worker
10. Click `[Test Notify]` in the tab to verify end-to-end

---

## 13. Files to Create / Modify

| File | Action |
|---|---|
| `watchdog/wrangler.toml` | New — Worker config + KV binding + cron |
| `watchdog/src/index.js` | New — Worker entry: cron handler + HTTP API |
| `watchdog/src/diff.js` | New — snapshot diff logic |
| `watchdog/src/telegram.js` | New — message formatter + Telegram API caller |
| `watchdog/src/log.js` | New — KV log append + auto-shard guard |
| `js/view-watchdog.js` | New — Watchdog tab React view |
| `js/shell.js` | Modify — add System nav group + Watchdog entry |
| `index.html` | Modify — add view-watchdog.js script tag; bump `?v=` |
