# CMDV2 — Claude Code Context

## What this project is
Unified ops + progress SPA for AP127. Combines CMD CTR (operations) and DB001 (student progress) in one native React app.
GitHub: `AP127CMD/CMDV2`. Live: `https://ap127-ngt2.pages.dev`. Local: `/Users/nugui/AP127_V2/`.

## Current state
- Version token: `?v=p86` — **BUMP ON EVERY JS CHANGE** (`p86` → `p87` etc.)
- Last significant change: 2026-06-16 (p86 — Combined Progress chart defaults; Proj 30d/15d lines; signed vs-Plan-Today)
- Active branch: main (direct-to-main)

## Key facts
- 11 Babel JSX views + 7 plain-script views; check each file's `<script>` tag before adding `type="text/babel"`
- `shell.js`, `view-watchdog.js`, `view-cf-usage.js`, `view-crosscheck.js`, `view-overview.js` are plain `<script>` — **NOT** Babel; do not add `type="text/babel"` to them
- Drive views in preview via: `window.dispatchEvent(new CustomEvent('ap127-go',{detail:'<viewId>'}))`  (not hash change)
- Cache-busting = bump `?v=pNN` token on ALL `<script>` tags — NOT `?cb=`; find-replace across `index.html`
- Watchdog worker redeploy: `cd /Users/nugui/AP127_V2/watchdog && npx wrangler deploy`
- **REVAMP.md** is the feature audit log — read §12 change log before making changes so you don't duplicate or break prior work
- Old repo `nuguitar/AP127_V2` is **private/archived** — use `AP127CMD/CMDV2` only

## Update rule
After every code change in this session:
1. Bump `?v=pNN` token in `index.html` (find-replace all occurrences)
2. Add entry to `REVAMP.md` §12 change log (date, token, what changed)
3. Update this file (version token + last change line above)
4. Update `/Users/nugui/AP127_Docs/README.md` (§2.4)
5. `git add . && git commit && git push` this repo
6. `cd /Users/nugui/AP127_Docs && git add README.md && git commit -m "docs: ..." && git push`

## Master reference
Full architecture, deployment steps, secrets, and reproduce-from-scratch guide:
https://ap127-docs.pages.dev  (source: `/Users/nugui/AP127_Docs/README.md`)
