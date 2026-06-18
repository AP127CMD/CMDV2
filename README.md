# AP127 V2 — Command Center

> 📚 **Master reference:** the whole AP127 ecosystem — all sites, Cloudflare Workers, data feeds, the auto-fetch pipeline, deployment, and the Telegram watchdog — is documented in **AP127_Docs**, live at **https://ap127-docs.pages.dev**.

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
- **Student Lens** (top bar) — one student across everything. A single cumulative-progress
  chart overlays the student's **Actual** vs **Plan** vs forward **Projection** (ETC), plus the
  **batch-average** curve and the **most-advanced SP** for context (responsive on mobile). Below
  it, a single **Lesson Log** table reconciles Operations + Progress into one sortable row-per-lesson
  view (canceled flights hidden); a coloured dot flags whether each lesson agrees in both sources,
  differs, or exists in only one (Ops-only / Progress-only / Scheduled / Planned-TBC).
- **Curriculum Plans** (Training Program) — per-student plan cards (all batches). Cards carry no
  rank edge-colour and no finish-date badge (finish projection lives only in the Simulation views).
  Click any card for a modal with **all** records: for **AP127** the reconciled OPS+PROG view with
  source dots and a "how this is processed" note; for other batches plain Progress-only records.
  AP127 upcoming dates come from the live Operations schedule (TBC = not yet scheduled); other
  batches show their projected plan dates.
- **User Guide** — explains every view and the logic behind it.

## Navigation

```
HOME ◎        combined landing — AP127 PROGRESS tile + filter bar + 9-tile day KPIs + Day Glance panels
SCHEDULE      one screen · layout switch: Day ▦ · Gantt ▭ · Week ▦ · Month ▦ · Roster ▥
OPERATIONS    Ops Analytics ◫ · Aircraft Status ✦
PLANNING      Slot Finder ⚡
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

**Day Glance** is now folded into **Home**: the landing page carries a single **AP127 PROGRESS**
cohort KPI tile, a **filter bar** (batch chips + SIM / STANDBY / CANCELED type toggles), a
**9-tile day KPI strip** (Total, Completed, Pending, Canceled, Hours, Sim, A/C Used, Instructors,
◆ AP-127), then the full Day Glance operational panels (Schedule Pulse, Status Mix, Batch
Breakdown, Instructor Load, Aircraft Fleet, AP-127 Spotlight) — all driven by a shared date
picker. `#/today` redirects to Home. Filter state lives in `DayGlancePanels` and propagates
through all stats and panels automatically.

It's one shared React context — no iframes, no CSS/JS collisions. The top bar carries the
Student-Lens picker, unified PROG/OPS freshness dots, the Cross-Check ⇄ chip, a theme
switch (cockpit / light / warm), and a burger that collapses the sidebar to an icon rail.
Batch colours are consistent across every view (AP124 blue · AP126 green · AP127 magenta ·
AP128 orange · AP129 yellow). `legacy.html` preserves the original v1 iframe shell;
`app.html` redirects to `index.html`.

## Ops Slot Finder — duty-hour logic

`ops/js/view-slotfinder.js` and `ops/js/view-autoslotfinder.js` contain the manual and auto slot
finders used by the Command Center ops page (`ops/index.html`).

**Duty-hour rule (updated 2026-06-16):**
- A proposed slot that falls **entirely within** an FI's already-committed duty window
  (`slot_start ≥ first_flight_start` and `slot_end ≤ last_flight_end`) is **always permitted**
  — the FI is already on duty, so inserting a flight between existing assignments adds no new
  duty time. No duty-limit check is applied.
- Any slot that **extends** the outer boundary (starts before the first flight or ends after the
  last flight) goes through the normal **7-hour span check** (`SF_MAX_DUTY = 420 min`). Exactly
  7 h is allowed; anything over is blocked.

**Lesson lookup + Solo flight logic (added 2026-06-16):**
- `ops/js/sf-lessons.js` defines `window.SF_LESSON_META` — all 96 lessons from CATC CPL-IR
  Vol 05 keyed by lesson code (e.g. `"CSGL 14"`, `"CDGL 01"`, `"CDIF(SIM) 56"`). Each entry
  holds `{ n, phase, title, durMin, type }` where `type` is `"Dual"`, `"Solo"`, or `"SPIC"`.
- **Solo** (`CSGL *`, `CSXV *`, `CSNL *` — 13 lessons): student flies alone. FI availability
  and duty limits are **not checked** — the FI may have a concurrent flight. However the FI
  **cannot be on leave** (leave check still applies via `candFIs` construction).
- **SPIC** (14 lessons: `CSPGL *`, `CSPXV *`, `CSPGLC *`, `CSPXVC *`, `CSPXI *`, `CSPXIC *`,
  `CMSPXI *`, `CMSPXIC *`): FI is in the plane as safety pilot — treated identically to Dual.
- **Dual** (all other 61 lessons): full FI availability + duty-limit checks as before.
- The **manual Slot Finder** has a LESSON picker (grouped by phase, 96 entries) that auto-fills
  the duration field and toggles Solo mode. Slot cards show a teal "SOLO · FI AVAIL. NOT CHECKED"
  badge when Solo mode is active.
- The **Auto Slot Finder** derives lesson type from each student's `next_lesson` field and shows
  a teal "SOLO" chip on student cards where applicable.
- Source reference: `ops/docs/lessons-96.md` (CATC CPL-IR Vol 05, Issue 02 Rev 00).

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
