# CMDV2 — Claude Code Context

@~/AP127_Docs/claude/ap127-ecosystem.md

> Template: What it is · Rules & gotchas · Commands · Where history lives. Keep ≤ 200 lines; state only what is
> true now and edit lines in place. Dated notes / per-version write-ups go to `REVAMP.md` (change log) and
> `docs/NOTES.md` — never here.

## What this project is
Unified ops + progress SPA. Merges CMD CTR (operations) + DB001 (progress) in one native React app.
GitHub: `AP127CMD/CMDV2` | Live: https://ap127-ngt2.pages.dev | Local: `/Users/nugui/AP127_V2/`

**⚠️ `js/shared.js` and `js/view-cohort-v4.js` are no longer CMDV2-only (2026-08-02).** DB_Share
(`ap127-dashboardr1.pages.dev`) live-mirrors the "AP127 Detail V4" tab by proxying these two files
straight from this site (plus `assets/reconcile.js`, `flight-data.js`, `progress-data.js`,
`css/theme.css`, `css/progress.css`) through its own Cloudflare Pages Function — no copy, no build
step, it just fetches these files' current content on every DB_Share page load. A breaking change
to either file (removed export, renamed `window.*` global, a new dependency on `js/shell.js` or
another view) breaks DB_Share too. After editing either file, load
`https://ap127-dashboardr1.pages.dev` and confirm it still renders. Design:
`docs/superpowers/specs/2026-08-02-mirror-cmdv2-detail-v4-design.md`. **`js/view-cohort-v5.js` (new,
2026-08-12) and `js/view-cohort-v6.js` (new, 2026-09-06) are NOT part of this mirror** — DB_Share
only proxies the two files named above; V5 and V6 are additive and don't touch either of them
(verify with `git diff --stat js/view-cohort-v4.js js/shared.js css/progress.css` before every
commit — must stay empty).

## The three AP127 Detail tabs — what each one is for
- **AP127 Detail** (`js/view-cohort.js`) — the original DashboardR1 port. Frozen.
- **AP127 Detail V4** (`js/view-cohort-v4.js`) — 16 stacked panels, ~25 rounds of additive feedback.
  Frozen, and **live-proxied by DB_Share**, so it must not be touched.
- **AP127 Detail V5** (`js/view-cohort-v5.js` + `ap127-v5-model.js` + `ap127-v5-layout.js`) — the
  consolidated 5-section rebuild with the admin-customisable layout. **`js/ap127-v5-model.js` is the
  shared metrics engine: V5 AND V6 both read every present-tense number from it.** A change there
  moves both tabs — that is deliberate (they can never disagree), but it means the 12 invariants in
  its `selfCheck()` are load-bearing for two tabs, not one.
- **AP127 Detail V6** (`js/view-cohort-v6.js` + `ap127-v6-forecast.js` + `css/cohort-v6.css`) — the
  scroll-through briefing (deck → history → situation → forecast → batch → integrity), with the
  seeded prediction engine and the TG report. Adds no present-tense maths of its own.

**`js/ap127-v6-forecast.js` is seeded on purpose.** The Monte Carlo uses a fixed-seed mulberry32 so
the screen, the report preview and the exported PDF always show the same dates. Do not "improve" it
with `Math.random()` — a forecast that moves on every render cannot be put in front of a TG.


## Current state
- All `index.html` script tags at `?v=p207`; `ops/index.html` at `?v=r42` (2026-10-11 — Batch Stats moved under Cross-Check). Next bump: **p208**.

## ⚠️ Update rule — do this after EVERY code change
1. Bump `?v=pNN` token on ALL `<script>` tags in `index.html` — next must be `p208` (all currently at p207; `ops/index.html` is on its own `?v=rNN`, now r42)
2. Add entry to `REVAMP.md` change log: `| 2026-MM-DD | Description (pNN) |`
3. Update the **Current state** line above (new token, one-line summary) — edit it in place; the full write-up belongs in `REVAMP.md`, not this file
4. Update `/Users/nugui/AP127_Docs/README.md` §2.4 (add to §10 log) — then push AP127_Docs
5. `git add . && git commit -m "pNN: <what changed>" && git pull --rebase && git push`

## Verify actual state — run before starting
```bash
grep -o '?v=p[0-9]*' index.html | sort -u                                   # all tokens (may differ per file)
grep -E 'view-overview|shell\.js|view-watchdog|view-cf-usage|view-crosscheck' index.html  # Babel vs plain per file
git log --oneline | grep -v "chore: refresh data" | head -6                 # last real changes
```

# CMDV2 — Claude Code Context

## ⚠️ Data plane (2026-09-06)
- **`flight-data.js` is DELETED from this repo.** The 5 browser entrypoints (`index.html`,
  `legacy.html`, `ops/index.html`, `crosscheck/index.html`, `overview/index.html`) load it from
  `https://ap127-data.anusorn-tanmetha.workers.dev/flight-data.js` (a stateless raw.github proxy
  Worker in `flight-schedule-feed/data-worker/`). `scripts/refresh_snapshots.mjs` no longer
  mirrors flight-data; `ngt-data` now reads `cache.json` from that Worker.
- **`refresh-data.yml` commits carry `[CI Skip]`** so they don't trigger a Pages build. The
  committed `progress-data.js` / `ngt-data.js` snapshots (runtime-fetched fallbacks) now ship on
  real code deploys, not hourly. A real code push must NOT contain `[CI Skip]`.
- **watchdog:** new `POST /notify` (X-API-Key: `NOTIFY_KEY` secret) runs the diff immediately;
  cron tightened `*/5` → `*/2`. `FLIGHT_SRC` stays on raw.github (a Worker can't fetch a
  same-account `*.workers.dev` URL — CF 1042). Redeploy: `cd watchdog && npx wrangler deploy`.
- Design: `flight-schedule-feed/docs/superpowers/specs/2026-09-06-r2-data-plane-decoupling-design.md`.

## Screen feed dependency (ESP32 desk screens)
The ESP32 desk screen (`/Users/nugui/CLAUDE/MicroProject/AP127_Screen`) reads `screen.json` from the
`screen-data` branch, rebuilt every 10 min by `.github/workflows/screen-feed.yml`. The builder runs
CMDV2's own engine files in a Node vm, so it breaks (loudly — the workflow fails) if either of these
changes: **(1)** the `// ─── Maintenance & leave helpers` marker in `js/shared.js` (everything above it
must stay runnable without React/DOM — it is executed with a stubbed `React`), **(2)** the function name
`opsAugmentV5(` in `js/view-cohort-v5.js`. Rename either → update `build_screen.mjs` in the same commit.
Verify: `node scripts/build_screen.mjs /tmp/screen.json` → prints `selfCheck PASS`. The branch is a single
force-pushed `[CI Skip]` commit — never merge it into main.

## Key facts — things that trip up new sessions
- **Watchdog was silently down for 19h (2026-07-20T07:55Z → 2026-07-21T02:50Z) — recovered by plain redeploy.**
  Same CPU-hard-kill signature as prior incidents. The dead-man's-switch monitor detected it correctly
  (`alertedDown:true`) but **still cannot send Telegram alerts — its `TELEGRAM_BOT_TOKEN` secret has never
  been set.** This is a REPEAT ask: `cd watchdog-monitor && npx wrangler secret put TELEGRAM_BOT_TOKEN`
  (same value as the main watchdog). Until set, every future outage repeats this same silent blind spot.
  See AP127_Docs §10 (2026-07-21 entry) for full incident detail, including a known side effect (flight
  changes on the outage's calendar day can go permanently unnotified once the date rolls past — open decision,
  not yet fixed).
- **KV free-tier limit is per-ACCOUNT, not per-namespace (2026-07-17).** The 1,000 writes/day ceiling is shared
  across all namespaces — **2 as of 2026-09-02** (`ap127-watchdog`, `AP127_STUDENT_DATA`); the two
  `AP127_CHAT_KV*` namespaces were deleted with the Chatbot. The watchdog's
  `/cf-usage` now queries **account-wide grouped by namespace** (`kv.*` = account totals, `kvByNamespace[]` =
  attribution) — it previously hardcoded the watchdog namespace and under-reported by ~2×. Measured normal day:
  writes 48% (watchdog ~221 + `AP127_STUDENT_DATA` ~220 [DB_Share, private/no local dir] + chat ~40); reads 1%.
  Constrained dimension is **writes**. **2026-09-02: two large write sources removed** — the Chatbot's ~40/day
  went with its deletion, and DB001's `push-to-kv.js` (up to 288/day, PUTting unchanged bytes every run) now
  reads-then-compares and writes only on real change. See AP127_Docs §6.9/§10.
- **Check `<script>` type per file before editing** — `view-overview.js` uses `type="text/babel"`; `shell.js`, `view-watchdog.js`, `view-cf-usage.js`, `view-crosscheck.js` are plain `<script>`. Run the grep above to confirm.
- Cache-bust = bump `?v=pNN` on ALL `<script>` tags — use find-replace in `index.html`, NOT `?cb=`
- Drive views in preview: `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'viewId'}))` (not hash change)
- Read `REVAMP.md` change log before making changes — avoids duplicating or breaking prior work
- Watchdog worker redeploy: `cd /Users/nugui/AP127_V2/watchdog && npx wrangler deploy`
- **Watchdog CORS:** `watchdog/src/index.js` `ALLOWED_ORIGINS` contains only
  `https://ap127-ngt2.pages.dev` as of **2026-09-02** — the `https://ap127-v3.pages.dev` entry added
  2026-07-10 for CMDV3's own Watchdog admin view was removed when CMDV3 was retired. If adding a consumer
  later, extend the Set the same way; `DEFAULT_ORIGIN` stays V2's URL as the ACO fallback.
- **Watchdog now reports data freshness, not just its own liveness (2026-09-02).** It persists the feed's
  `fetchedAt` into `watchdog:status` as `feedFetchedAt`, **carried forward and never refreshed on quiet
  runs** — that divergence from `lastRun` is the signal that the pipeline died while the watchdog stayed
  healthy. `watchdog-monitor` alerts on it at 60 min via its own `monitor:feedState`. Do not "helpfully"
  refresh `feedFetchedAt` on skip runs; that would silently destroy the detector.
- **CI (2026-06-29):** `scripts/refresh_snapshots.mjs` isolates each of the 3 upstreams — a transient blip (e.g. ap127-data-api 50-byte response) keeps the prior snapshot and continues; only a total outage fails. `refresh-data.yml` push is race-proof (retry + `rebase -X theirs`). Do NOT make a single source's failure fatal again.
- **Watchdog "Exceeded CPU Limit" crash-loop (2026-07-11):** every 5-min cron tick was hard-killed by the CF runtime (silent — no catchable JS exception, so `lastError` in `/status` never shows it) following the CMD_CTR Ops Portal migration (see CMD_CTR/CLAUDE.md, AP127_Docs §10). Root cause never fully pinned down — ruled out diff/event-volume (reset `watchdog:snapshot` in KV to match live data, still crashed on a 0-event run) and ruled out any single computation step (added temporary per-step `console.log` timing via `wrangler tail`; every step measured sub-millisecond to a few hundred ms of I/O wait). A plain `wrangler deploy` (fresh isolate, no code change) resolved it — confirmed stable across 3 consecutive clean ticks. Likely an isolate-level issue tied to the stale, unusually-long-lived worker instance rather than the new code/data itself.
  - **If this recurs:** don't assume it's diff-size-related again — instrument with per-step `console.log(Date.now())` timing + `wrangler tail`, and try a plain redeploy (no code change needed) before spending time on data-volume theories.
  - **Also did:** manually reset `watchdog:snapshot` in KV (namespace `b42f3202c5364f91aef3837132d6ccd5`) to match CMD_CTR's live `flight-data.js` at the time, since it had gone stale during the 18-hour CMD_CTR outage — this wasn't the actual fix, but was a reasonable precaution regardless (avoids ever re-diffing that stale window).


## Where history lives
- `REVAMP.md` — the per-change log (pNN rows). Read it before changing anything.
- `docs/NOTES.md` — dated notes and the full per-version "Last known" history moved out of this file on 2026-10-24 (verbatim).
- AP127_Docs §2.4 and §10 — master reference + incident log: https://ap127-docs.pages.dev
