# CMDV2 — Claude Code Context

## ⚠️ Update rule — do this after EVERY code change
1. Bump `?v=pNN` token on ALL `<script>` tags in `index.html` — next must be `p103` (all currently at p102)
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
**Last known:** all files `p105` (2026-06-26 — FI Stat + SP Stat: 2 new sub-tabs in Aircraft Status view; shared PersonStatTab component; FI=cyan flat roster, SP=per-batch colored grouped roster; full filter bar, load distribution, daily chart, detail drawer). p104 (2026-06-26 — Utilization: AP127 toggle + hidden zero-rows). Next → `p106`. **Watchdog (2026-06-23):** `telegram.test.js` — added missing SP `@username` assertion to `STATUS → Canceled` test; all 6 notification types now verified. Implementation was already correct; test coverage gap only (no deploy needed).

## Key facts — things that trip up new sessions
- **Check `<script>` type per file before editing** — `view-overview.js` uses `type="text/babel"`; `shell.js`, `view-watchdog.js`, `view-cf-usage.js`, `view-crosscheck.js` are plain `<script>`. Run the grep above to confirm.
- Cache-bust = bump `?v=pNN` on ALL `<script>` tags — use find-replace in `index.html`, NOT `?cb=`
- Drive views in preview: `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'viewId'}))` (not hash change)
- Read `REVAMP.md` change log before making changes — avoids duplicating or breaking prior work
- Watchdog worker redeploy: `cd /Users/nugui/AP127_V2/watchdog && npx wrangler deploy`

## Master reference
Full architecture, deploy steps, secrets: https://ap127-docs.pages.dev  (§2.4)
