# DB_Share → mirror CMDV2 "AP127 Detail V4" tab (design)

Date: 2026-08-02

## Problem

`ap127-dashboardr1.pages.dev` (repo `AP127CMD/DB_Share`) is currently served by
`student.html`, a hand-maintained duplicate of AP127_V2's old `view-cohort.js`
view, kept in sync by a chain in the DB001 repo (`build-student.js` extracts
marked sections from DB001's own `index.html` into `student.html`,
`sync-dashboardr1.js` then pushes it to DB_Share, both run from DB001's hourly
`update-cache.yml`).

The user wants DB_Share to instead show **exactly** CMDV2's ("AP127_V2")
current "AP127 Detail V4" tab (`js/view-cohort-v4.js`), as a bare, single-page
site with no other tabs/navigation, and to keep mirroring it automatically as
CMDV2 changes — with **no way for a visitor to discover or reach CMDV2 itself**
(no visible domain reference, no in-app navigation back to the main site).

## Approach

**Same-origin proxy, not a static copy.** DB_Share gains one new file, a
Cloudflare Pages Function at `functions/mirror/[[path]].js`. Any request to
`/mirror/<path>` on DB_Share is fetched server-side from
`https://ap127-ngt2.pages.dev/<path>` and streamed back with the original
content-type. Because the fetch happens on Cloudflare's edge, not in the
visitor's browser, nothing in DB_Share's page source, DOM, or Network tab ever
names `ap127-ngt2.pages.dev`.

DB_Share's `index.html` is rewritten to:
1. Load React/ReactDOM/Babel/Chart.js + plugins from the same public CDNs
   CMDV2 already uses (unrelated third-party domains — fine to reference
   directly, they reveal nothing about CMDV2).
2. Load, in this order, via the `/mirror/...` proxy path:
   `assets/reconcile.js`, `flight-data.js`, `progress-data.js`,
   `js/shared.js` (`text/babel`), `js/view-cohort-v4.js` (`text/babel`).
3. Load `css/theme.css` and `css/progress.css` via `/mirror/css/...`
   (`<link rel="stylesheet">` — same proxy path works for CSS, function just
   returns `text/css`).
4. A small inline boot script renders
   `<AppProvider><CohortViewV4 /></AppProvider>` into `#root`. No
   `js/shell.js`, no sidebar, no other view files — confirmed
   `view-cohort-v4.js` has no calls into the tab-switching shell (no
   `d.go(...)`, no `window.dispatchEvent('ap127-go', ...)`), so there is no
   in-app path from this page to any other CMDV2 view.

No build step, no GitHub Action, no PAT, no manual sync task. Every full page
load re-fetches current files through the proxy, so any future CMDV2 change —
new `?v=pNN`, new chart, bug fix — appears on DB_Share on next load. (CMDV2's
own script tags carry `?v=pNN` cache-bust tokens for same-day multi-deploy
cache-busting; DB_Share's proxied requests omit the query string entirely —
same convention CMDV2 already uses for its data snapshot files — since a fresh
proxy fetch each load makes that unnecessary here.)

The one pre-existing genuine cross-origin call, `shared.js`'s live progress
fetch to `https://ap127-data-api.anusorn-tanmetha.workers.dev`, is unaffected:
it's a data API (not the CMDV2 site) already CORS-allowlisted for
`ap127-dashboardr1.pages.dev` in `data-api/worker.js`, and reveals nothing
about CMDV2's domain either.

## What does NOT change

- `AP127_NGT_001` (DB001): `student.html`, `build-student.js`,
  `sync-dashboardr1.js`, `push-to-kv.js` all stay in the repo untouched. Per
  explicit direction, these are left in place rather than deleted — they're
  simply no longer the thing that produces DB_Share's content.
- `push-to-kv.js` / the `AP127_STUDENT_DATA` KV / `data-api` worker are **not**
  touched — that pipeline feeds `ap127-data-api`, which CMDV2 and CMDV3 also
  depend on for live progress data; it is not DB_Share-specific despite the
  superficial naming adjacency.
- CMDV2 (`AP127_V2`) itself is untouched — DB_Share only ever reads its
  already-public, already-deployed files through the proxy.

## What DOES change

- DB001's `.github/workflows/update-cache.yml`: remove the
  `Push student.html to AP127_DashboardR1` step (and its
  `GH_PAT_DASHBOARDR1`/`CF_WORKER_URL` env block), so it stops overwriting
  DB_Share's new `index.html` every hour. The step, not the underlying files,
  is what's removed.
- `AP127CMD/DB_Share`: new `functions/mirror/[[path]].js`, rewritten
  `index.html`, `wrangler.jsonc` reviewed (Pages Functions need no wrangler
  config beyond the existing Pages project — confirm no conflicting settings).

## Data flow (unchanged from CMDV2's own load path)

`flight-data.js` / `progress-data.js` are bundled snapshots refreshed by
CMDV2's existing CI pipeline (`ap127-dispatcher` → GitHub Actions → commit →
CF Pages redeploy) — DB_Share picks up the same freshness cadence
automatically through the proxy, no separate refresh job needed. Live
progress additionally re-fetches from `ap127-data-api` in-browser exactly as
it does on CMDV2 itself.

## Testing / verification

- Local: serve DB_Share's static files + a local stand-in for the proxy (or
  temporarily point the boot script at CMDV2's live URLs directly) to confirm
  the V4 view renders, KPIs populate, drawer opens — before wiring the real
  Pages Function.
- Deployed: load `https://ap127-dashboardr1.pages.dev`, confirm in DevTools
  Network tab that every request is same-origin (`/mirror/...` or a public
  CDN) — zero requests to `ap127-ngt2.pages.dev`. Confirm page renders
  identically to CMDV2's "AP127 Detail V4" tab. Confirm no console errors.

## Risks / trade-offs

- DB_Share now has a **hard runtime dependency** on `ap127-ngt2.pages.dev`
  being up — if CMDV2's Pages deployment is down, DB_Share is down too. This
  is inherent to "mirror," accepted by the user.
- `flight-data.js` is ~2MB; proxying it naively means Cloudflare's edge
  refetches it from CMDV2 on every DB_Share page load. The Pages Function
  uses the Cache API with a 60-second TTL (`Cache-Control: public,
  max-age=60` on the proxied response, and `caches.default.match/put` inside
  the function) for every proxied path — one shared 60s cache regardless of
  file type, simple and consistent. This bounds origin fetches to at most
  once per file per minute across all visitors, while staying well inside
  "close enough to live" for a dashboard that itself treats data as fresh
  within minutes (CMDV2's own progress fetch has no caching guarantee
  stronger than this).
