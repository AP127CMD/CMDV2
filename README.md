# AP127 V2 — Command & Progress

A single dashboard that **combines** the two AP127 tools into one place for students
and their leaders to monitor everything, timely and effortlessly:

| Source | What it brought |
|--------|-----------------|
| [AP127_Command_Center](https://github.com/nuguitar/AP127_Command_Center) | Operations — live schedule scraped from the Flight Operations Portal: Day Glance, Board, Gantt, Weekly, Analytics, Roster, Auto Slot Finder, Calendar |
| [AP127_DashboardR1](https://github.com/nuguitar/AP127_DashboardR1) | Progress — curriculum-aligned student progress: ranking, pace bands, combined / race / timeline charts |

…plus two **new** unifying views built for V2:

- **Home / Overview** — at-a-glance landing: today on the line, cohort progress, pace
  leaders, students behind plan, and a live alerts feed.
- **Cross-Check** — reconciles the two *independent* data sources and flags **conflicts**
  (a lesson present in one system but missing in the other) and **review** items
  (matched lesson where flight time or date disagrees beyond tolerance).

## Tabs

```
HOME ◎   OPERATIONS ✈   PROGRESS ▰   CROSS-CHECK ⇄
```

Each sub-app runs in its own iframe, so all original features work unchanged and there
are no CSS/JS collisions. The shell adds a shared header with a unified data-freshness
indicator (PROG + OPS) and a live conflict badge on the Cross-Check tab. The Home tab's
tiles and links jump between tabs.

## Data

Two independent feeds, each with a live fetch + a bundled snapshot fallback:

| File | Holds | Live source |
|------|-------|-------------|
| `flight-data.js` | `window.FLIGHT_DATA` — all flights (scheduled + actuals) | Command Center GitHub Action snapshot |
| `progress-data.js` | `window.PROGRESS_DATA` — `ap127[]` students + `cur127[]` curriculum | `ap127-data-api` Cloudflare worker (fetched live; snapshot is the fallback) |

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
progress-data.js        # progress snapshot     (window.PROGRESS_DATA) — live fetch w/ fallback
css/
  theme.css             # design tokens + 3 themes (cockpit / light / warm)
  progress.css          # scoped dark palette for the ported Progress dashboard
js/
  shared.js             # unified context (AppProvider/useData), atoms, drawer
  view-*.js             # one file per view (ops reused from CC; cohort from DashboardR1)
  view-overview.js      # role-aware Overview (home)
  view-crosscheck.js    # native Cross-Check over the shared reconciliation
  shell.js              # sidebar + top bar + routing + Student Lens + boots AP127App
assets/
  reconcile.js          # shared cross-check engine (pure, no DOM)
legacy support: overview/ crosscheck/ ops/ progress/  # iframed only by legacy.html
```

## Refreshing the bundled snapshots

```bash
# progress
printf 'window.PROGRESS_DATA = ' > progress-data.js
curl -s https://ap127-data-api.anusorn-tanmetha.workers.dev >> progress-data.js
printf ';\n' >> progress-data.js

# operations — copy the latest from the Command Center repo
cp ../AP127_Command_Center/flight-data.js flight-data.js && cp flight-data.js ops/flight-data.js
```

Progress is also fetched live in the browser on every load, so it stays current without
rebuilding; the snapshot only serves as an offline fallback.

## Run locally

```bash
python3 -m http.server 8127   # then open http://localhost:8127
```

Static site — deploy to GitHub Pages by serving the repo root.
