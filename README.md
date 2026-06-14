# AP127 V2 — Command Center

A single **native** dashboard (one React SPA, no iframes) that combines the AP127 tools
into one place for students and leaders to monitor everything, timely and effortlessly:

| Source | What it brought |
|--------|-----------------|
| [AP127_Command_Center](https://github.com/nuguitar/AP127_Command_Center) | Operations — live schedule from the Flight Operations Portal: Today, Board, Gantt, Weekly, Roster, Calendar, Ops Analytics, Slot Finder, Auto Slot Finder |
| [AP127_DashboardR1](https://github.com/nuguitar/AP127_DashboardR1) | AP127 Detail — curriculum-aligned squadron progress: ranking, pace bands, combined / race / timeline charts |
| [AP127_NGT_001](https://github.com/nuguitar/AP127_NGT_001) | Training Program — all four batches (AP124/126/127/129): All-Batches overview, School Performance, and the client-side scheduler Simulation |

…plus the **unifying** views built for V2:

- **Home** — "AP127 COMMAND CENTER" landing: AP-127 operational snapshot (schedule pulse,
  batch/instructor/fleet breakdown, sortable AP-127 Spotlight) combined with cohort-progress
  KPIs — all driven by a date picker.
- **Cross-Check** — reconciles the two *independent* data sources and flags **conflicts**
  (a lesson present in one system but missing in the other) and **review** items
  (matched lesson where flight time or date disagrees beyond tolerance).
- **Student Lens** (top bar) — one student's Operations schedule ⇄ Progress lessons ⇄ plan.
- **User Guide** — explains every view and the logic behind it.

## Navigation

```
HOME ◎        combined landing — operational day snapshot (Day Glance) + cohort-progress digest
SCHEDULE      one screen · layout switch: Day ▦ · Gantt ▭ · Week ▦ · Month ▦ · Roster ▥
OPERATIONS    Ops Analytics ◫ · Aircraft Status ✦
PROGRESS      AP127 Detail ▰ · Student Lens 👤
TRAINING PGM  Curriculum Plans ▤ · School Perf. ◷ · Simulation ◈ / ⚖ / ◆
INTEGRITY     Cross-Check ⇄   (amber dot when review/conflict items exist)
HELP          User Guide ?
SYSTEM        Watchdog ◉ · CF Usage ☁
```

Five former Operations pages (Board, Gantt, Weekly, Calendar, Roster) are now **layout modes
of the single Schedule screen** — selected from a chip-bar, sharing one filter/date/focus
state (Schedule's "Day" layout = the sortable Board). Old hash routes (`#/board`, `#/gantt`, …)
still resolve for bookmarks.

**Day Glance** is now folded into **Home**: the landing page carries the single-day operational
dashboard (schedule pulse, status mix, batch/instructor/fleet load, AP-127 spotlight) above the
cohort-progress digest, with a date picker. `#/today` redirects to Home.

It's one shared React context — no iframes, no CSS/JS collisions. The top bar carries the
Student-Lens picker, unified PROG/OPS freshness dots, the Cross-Check ⇄ chip, a theme
switch (cockpit / light / warm), and a burger that collapses the sidebar to an icon rail.
Batch colours are consistent across every view (AP124 blue · AP126 green · AP127 magenta ·
AP128 orange · AP129 yellow). `legacy.html` preserves the original v1 iframe shell;
`app.html` redirects to `index.html`.

## Data

Two independent feeds, each with a live fetch + a bundled snapshot fallback:

| File | Holds | Live source |
|------|-------|-------------|
| `flight-data.js` | `window.FLIGHT_DATA` — all flights (scheduled + actuals) | mirror of Command Center's published `flight-data.js` |
| `progress-data.js` | `window.PROGRESS_DATA` — AP127 `ap127[]` students + `cur127[]` curriculum | `ap127-data-api` Cloudflare worker (fetched live; snapshot is the fallback) |
| `ngt-data.js` | `window.NGT_CACHE` — all 4 batches + `monthly` + curricula | mirror of NGT_001's `cache.json` (Training Program views) |

All three are refreshed hourly by `.github/workflows/refresh-data.yml` (commits only on real
change). Call-sign / instructor / aircraft are assigned to AP127 students **by name** via the
`AP127_ROSTER` in `js/shared.js` — never by array position — so a student missing or reordered
upstream can never shift everyone else's labels.

### Cross-check logic (`assets/reconcile.js`)

For every AP127 student, each lesson is matched across both sources:

- Names are bridged (`"Akaravit Khwanngam"` ⇄ `"AKARAVIT K."`); lesson codes are
  normalised (`"CDGL 04/1"` → `"CDGL 04"`).
- Only the window both sources cover is compared (Operations keeps a rolling history;
  Progress reaches further back).
- Each pairing is classified **OK** / **REVIEW** (time Δ > 20m or date Δ > 1d, both
  adjustable) / **CONFLICT** (present one side, missing the other).

## Structure

```
index.html              # THE unified single-page app (was app.html) — boots <App/> into #root
app.html                # redirect → index.html (kept for old bookmarks)
legacy.html             # the original v1 iframe shell (Home/Ops/Progress/Cross-Check)
flight-data.js          # operations snapshot  (window.FLIGHT_DATA)
progress-data.js        # AP127 progress snapshot (window.PROGRESS_DATA) — live fetch w/ fallback
ngt-data.js             # NGT_001 cache.json mirror (window.NGT_CACHE) — all 4 batches + monthly + curricula
css/
  theme.css             # design tokens + 3 themes (cockpit / light / warm)
  progress.css          # scoped dark palette for the AP127 Detail dashboard (.ap127-progress)
  program.css           # NGT_001 styles scoped under .ngt-prog (Training Program views)
js/
  shared.js             # unified context (AppProvider/useData), atoms, drawer
  view-*.js             # one file per view (ops reused from CC; cohort = AP127 Detail from DashboardR1)
  view-overview.js      # role-aware Overview (home)
  view-crosscheck.js    # native Cross-Check over the shared reconciliation
  view-program.js       # full NGT_001 parity: All-Batches Overview / School Perf. / Simulation
  shell.js              # sidebar + top bar + routing + Student Lens + boots AP127App
assets/
  reconcile.js          # shared cross-check engine (pure, no DOM)
scripts/refresh_snapshots.mjs   # mirrors all 3 upstreams (CC flight-data, progress worker, NGT cache.json)
legacy support: overview/ crosscheck/ ops/ progress/  # iframed only by legacy.html
```

## Refreshing the bundled snapshots

**Automated (default).** `.github/workflows/refresh-data.yml` runs hourly (and on manual
dispatch). It executes `scripts/refresh_snapshots.mjs`, which mirrors three upstreams:

- `flight-data.js` ← Command Center's published copy
  (`raw.githubusercontent.com/nuguitar/AP127_Command_Center/main/flight-data.js`).
  CC owns the Playwright scrape; V2 just tracks its output, so the ops data can't drift.
- `progress-data.js` ← the `ap127-data-api` Cloudflare Worker (the same endpoint the app
  fetches live), re-wrapped as `window.PROGRESS_DATA`.
- `ngt-data.js` ← AP127_NGT_001's published `cache.json`
  (`raw.githubusercontent.com/nuguitar/AP127_NGT_001/main/cache.json`) — all four batches
  + monthly + curricula, re-wrapped as `window.NGT_CACHE` for the Training Program views.

It commits only on change; Pages (deploy-from-branch) auto-rebuilds on push. The data
includes carry **no `?v=` token**, so a refresh reaches clients within the Pages ~10-min
cache. On failure it opens a `refresh-failure` issue. Run it by hand from the **Actions** tab.

**Manual / local** (same effect as the workflow):

```bash
node scripts/refresh_snapshots.mjs   # no dependencies (Node 18+ global fetch)
```

Progress is also fetched live in the browser on every load, so it stays current without
rebuilding; the snapshot only serves as an offline fallback.

## Run locally

```bash
python3 -m http.server 8127   # then open http://localhost:8127
```

Static site — deploy to GitHub Pages by serving the repo root.
