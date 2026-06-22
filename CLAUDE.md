# CMDV2 — Claude Code Context

## ⚠️ Update rule — do this after EVERY code change
1. Bump `?v=pNN` token on ALL `<script>` tags in `index.html` — next must be `p97` (all currently at p96)
2. Add entry to `REVAMP.md` change log: `| 2026-MM-DD | Description (pNN) |`
3. Update the Verify section below with new token + change summary
4. Update `/Users/nugui/AP127_Docs/README.md` §2.4 (add to §10 log) — then push AP127_Docs
5. `git add . && git commit -m "pNN: <what changed>" && git pull --rebase && git push`

## What this project is
Unified ops + progress SPA. Merges CMD CTR (operations) + DB001 (progress) in one native React app.
GitHub: `AP127CMD/CMDV2` | Live: https://ap127-ngt2.pages.dev | Local: `/Users/nugui/AP127_V2/`

## Verify actual state — run before starting
```bash
grep -o '?v=p[0-9]*' index.html | sort -u                                   # all tokens (may differ per file)
grep -E 'view-overview|shell\.js|view-watchdog|view-cf-usage|view-crosscheck' index.html  # Babel vs plain per file
git log --oneline | grep -v "chore: refresh data" | head -6                 # last real changes
```
**Last known:** all files `p96` (2026-06-22 — Cross-Check keying fix: `(Unplanned)` ops records use full names/callsigns instead of "FIRST L."; new `opsStudentKey()` in `reconcile.js` reduces ops names to the canonical key + bridges callsigns via a nick→key map from progress rows. Consistency 87%→93%, conflicts 48→32, orphan ops 12→2. Remaining conflicts are now meaningful: normal Progress-lag + flown-but-"Pending" ops portal entries). p95 (same day) = integrity hardening: (I1) Bangkok-anchored `bkkToday`/`localToday`; (I2) tolerant `isAP127Batch`; (I3) `ACTUAL_ONLY` student|date|lesson dedup fallback; (I4) `validDate()`+holiday note; (U2) PROG freshness `'error'` dot. Next → `p97`.

## Key facts — things that trip up new sessions
- **Check `<script>` type per file before editing** — `view-overview.js` uses `type="text/babel"`; `shell.js`, `view-watchdog.js`, `view-cf-usage.js`, `view-crosscheck.js` are plain `<script>`. Run the grep above to confirm.
- Cache-bust = bump `?v=pNN` on ALL `<script>` tags — use find-replace in `index.html`, NOT `?cb=`
- Drive views in preview: `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'viewId'}))` (not hash change)
- Read `REVAMP.md` change log before making changes — avoids duplicating or breaking prior work
- Watchdog worker redeploy: `cd /Users/nugui/AP127_V2/watchdog && npx wrangler deploy`

## Master reference
Full architecture, deploy steps, secrets: https://ap127-docs.pages.dev  (§2.4)
