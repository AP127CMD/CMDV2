# CMDV2 — Claude Code Context

## Note (2026-08-26): CC's fetch pipeline paused — CMDV2's flight data is fully frozen until the Orange Pi 4 Pro is live

Not a CMDV2 bug — the whole chain upstream of it stopped on purpose. CMD_CTR's `fetch_schedule.yml`
(the ultimate source of `flight-data.js`, which this repo mirrors) has been failing every run since
2026-08-25 04:29 UTC because the Ops Portal now requires Google sign-in and Google's bot-detection
permanently blocks the CI-launched browser from completing it. A same-day backoff fix made the repeated
failures cheap, but every throttled run was still failing — so on 2026-08-26 the workflow was disabled
outright (`gh workflow disable`) and the CF dispatcher's trigger for it paused too, rather than left to
keep churning for no benefit. **Net effect: `flight-data.js` (CC and its CMDV2 mirror) is frozen at
whatever it last had, with no fallback of any kind, until either a durable fix goes live or someone
manually re-authenticates.** CMDV2's own `refresh-data.yml` cron still runs hourly — it just has
nothing new to mirror, so don't mistake a "successful" refresh run for fresh data; check
`flight-data.js`'s `fetchedAt` field directly if data staleness is ever in question.

**Durable fix in progress, not yet deployed:** an Orange Pi 4 Pro (4GB) running a persistent,
manually-signed-in real Chromium, with `fetch_schedule.py` attaching to it over CDP instead of
launching (and failing to log into) its own — the exact path already proven live once via a manual
run. Full detail: `flight-schedule-feed/CLAUDE.md` and `docker/README.md` (that repo), `AP127_Docs`
README §10 and §3.1, and `/Users/nugui/CLAUDE/HomeServer/` (2026-08-25/26 entries throughout).

## Note (2026-08-16): Watchdog's recurring "Exceeded CPU Limit" outage — root-caused for real this time, fixed at the source

User reported "Watchdog system is down??". Confirmed: `ap127-watchdog` had been silently dead since
2026-08-15 23:50 UTC (~8h) — `wrangler tail` showed `"*/5 * * * *" - Exceeded CPU Limit` on every
cron tick, the same signature as 3 prior incidents (2026-07-11/13, 2026-07-14 hardening, 2026-07-21
19h outage). Immediate recovery: a plain `cd watchdog && npx wrangler deploy` (fresh isolate, no code
change — same fix as every prior occurrence).

**Real root cause, found this time (previous incidents never fully pinned it down):** the upstream
feed had grown from ~1.4 MB (last hardening, 2026-07-14) to ~2.2 MB, and the full `JSON.parse` of the
WHOLE feed — done every 5 min, BEFORE `withinSnapshotWindow()` could filter it down — was the
dominant CPU cost, scaling with total feed size regardless of the 2026-07-14 windowing fix. An
in-worker fix was attempted first (regex-based "extract only the window's bytes, skip JSON.parse for
the rest") — 12 tests, all green, but benchmarked against the real live feed it came out **2x SLOWER**
than a plain full `JSON.parse` (V8's native parser beats a hand-rolled JS scan of comparable size).
Reverted before deploying, not shipped — see the CMDV2 git history around this date for the dead end
if it's ever worth retrying differently.

**Actual fix — filter at the source, not in the worker:** flight-schedule-feed (CMD_CTR)'s
`scripts/generate_flight_data.py` now also writes `flight-data-recent.js` — same data, filtered to a
generous `-4d/+15d` window and stripped of unused `instructors`/`resources`/`leaves` — see that repo's
CLAUDE.md for the full design. `watchdog/src/index.js`'s `FLIGHT_SRC` now points at it instead of the
full `flight-data.js`. Caught and fixed a real deploy gap along the way: `fetch_schedule.yml`'s commit
step used an explicit `git add` file list that didn't know about the new file — the first CI run after
the code change silently generated it but never committed it (confirmed via `gh api .../git/trees`),
caught before the watchdog was switched over, so no outage from this gap. **Verified live end-to-end:**
`/status` after the switch shows `feedSig` length `183234` (the new ~186 KB file, not 2.2 MB),
`healthy:true`, `staleMinutes:0`, and the next cron tick completed `"*/5 * * * *" - Ok` (no CPU-limit
kill) — first clean tick on the very first attempt with the new, ~91% smaller payload.

**Still open, flagged to the user, not yet actioned:** the dead-man's-switch monitor
(`ap127-watchdog-monitor`) still has `TELEGRAM_BOT_TOKEN` unset (`wrangler secret list` → `[]`,
confirmed live) — it can detect a future outage but still can't alert. This is now a 2nd session's
worth of "repeat ask" (first flagged 2026-07-21). User was given the exact command to run themselves
(so the token never passes through a chat transcript): `cd watchdog-monitor && npx wrangler secret put
TELEGRAM_BOT_TOKEN`.

## Note (2026-08-06): Watchdog now shows a distinct "Removed" notice, and notifications are back ON

AP127 notifications were turned back on and are working — but a real user report found recent cancel
notices showing no reason. Root cause was upstream in CMD_CTR: bookings removed via a portal path other
than the Cancel Flight form (e.g. an Edit Request's delete-entirely option) never get a Cancel Record
and never surface as status=Canceled in `getStudentSchedule` — they just vanish. CMD_CTR restored its
`recover_vanished_bookings()` safety net (removed by mistake during the RPC migration below) with a new
`recovered` flag, true only when no cancel reason is found anywhere for the booking. `diff.js`'s
`buildSnapshot()` now carries `recovered` through; `telegram.js`'s `classifyForGrouping()` routes these
to a new "🗑️ Removed" group instead of "❌ Cancelled" (per explicit user request — the two were getting
mixed up), with an explanatory line since there's no reason to show. A real cancel reason, if one is
still found for the run, displays regardless of group. Watchdog code touched:
`src/diff.js`, `src/telegram.js` (+ tests) — **needs `cd watchdog && npx wrangler deploy`, this is not
git-push-triggered.** See `flight-schedule-feed/CLAUDE.md` for the CMD_CTR-side half of this fix.

## Note (2026-07-27): CMD_CTR-side root cause of the notification flip-flop is fixed

The `2026-07-31` status flip-flop that caused duplicate Cancelled/Pending Telegram notices was root-caused
and fixed upstream in CMD_CTR (`flight-schedule-feed/CLAUDE.md` — the scraper's Timeline mode-switching
fetch, which could silently leak a stale Canceled-mode read, was replaced entirely with a direct RPC call
that can't produce that failure mode). AP127 Telegram notifications are still OFF as of this write —
re-enabling them is the user's call once they're satisfied the upstream fix is holding in production
(watch a few days of CI runs / real notifications before flipping `enabled: true` in the Watchdog
Destinations config). This session's watchdog-side defensive patches (`stabilizeCancelledFlights()`, the
bookingId-reassignment guard, the anomaly-drop guard, `suppressActualPairs()`) were built to compensate
for the now-fixed upstream flakiness — left in place deliberately (no evidence they cause harm by
staying, removing them is a separate future cleanup, not bundled into the upstream fix).

## ⚠️ Update rule — do this after EVERY code change
1. Bump `?v=pNN` token on ALL `<script>` tags in `index.html` — next must be `p176` (all currently at p175)
2. Add entry to `REVAMP.md` change log: `| 2026-MM-DD | Description (pNN) |`
3. Update the Verify section below with new token + change summary
4. Update `/Users/nugui/AP127_Docs/README.md` §2.4 (add to §10 log) — then push AP127_Docs
5. `git add . && git commit -m "pNN: <what changed>" && git pull --rebase && git push`

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
2026-08-12) is NOT part of this mirror** — DB_Share only proxies the two files named above; V5 is
additive and doesn't touch either of them (verify with `git diff --stat js/view-cohort-v4.js
js/shared.js css/progress.css` before every commit — must stay empty).

## Verify actual state — run before starting
```bash
grep -o '?v=p[0-9]*' index.html | sort -u                                   # all tokens (may differ per file)
grep -E 'view-overview|shell\.js|view-watchdog|view-cf-usage|view-crosscheck' index.html  # Babel vs plain per file
git log --oneline | grep -v "chore: refresh data" | head -6                 # last real changes
```
**Note (2026-08-07): Round E of the audit closed with a "ruled out" verdict, no code change.**
The last Tier-3 item — a theoretical lesson-code casing/whitespace mismatch that could make
`ap127Hours()`/`ap127RequiredPace()`/various `planMap` lookups silently diverge from
`ap127AsOfStudents()`'s normalized comparison — was checked directly against the live
`window.PROGRESS_DATA` (96 curriculum codes × 43 flown codes, zero mismatches, zero missing) and
ruled out as not currently live. No file touched; full reasoning in REVAMP.md's Round E entry.
**This closes the full 26-item audit from `.claude/plans/nested-sparking-tide.md` (Rounds A–E,
p149–p152, all shipped and deploy-verified).**

**Last known:** all files `p175` (2026-08-12 — **AP127 Detail V5 — round-3 feedback: Trend
accuracy + Report overhaul.** Trend: Progress vs Plan's Plan line now runs to the curriculum's
finish date (not clipped to today — new `series.*.planFull` in `js/ap127-v5-model.js`, computed
over the full planned-date range regardless of asOf, vs Actual/lag which correctly stay clipped to
asOf); "Target" renamed "Revised-target"; Output chart's Required overlay changed from a single dot
sitting on the moving-avg line (the reported "glitch" — it wasn't the average itself, just Required
visually fused onto it) to its own full-width dashed red reference line, plus a new plain-text
"Required · Actual · Gap" readout under the chart. Report: now dark by default (matches the site's
own cockpit theme — was hardcoded light despite an unused `.v5-report-dark` class already existing;
print stays light/ink-friendly via a `!important` override regardless), Executive Summary gained an
explicit "Hours done: X/Y (Z%) · Remaining: Wh" line, Pace vs Target headers spelled out
(Req→Required, Act→Actual), report Roster drops 4 columns (Call sign/Last lesson/Day Δ/vs target,
report-only — the live People panel's own column picker is untouched), and two V4-parity panels
were added to the report that weren't there before: Individual Lead/Lag vs Plan (all 28 SP,
`progressChartCfg()` now takes an optional override so this can force per-SP/gap mode independent
of the live command bar) and Lesson Completion Matrix (new compact print-safe HTML/CSS grid, not
a canvas — 96 lesson columns fit to the report's 703px width via `<colgroup>`, phase-colored,
retake-flagged). Full write-up: REVAMP.md's p175 entry.) p174 (2026-08-12 — **AP127 Detail V5 — UX/UI pass:**
sizing system (charts grow with series count then rely on zoom/pan instead of cramming; grids get
a Zoom stepper with an 11px readable floor instead of shrinking further), Syllabus + Calendar
rebuilt as one real `<table>` in the "modern roster" style (ref Aircraft Status SP Stat) with
restored V4 detail (lesson/phase/milestone click-through, target dates, today-target column, lag
indicator, daily hour+lesson totals, idle-gap dashes distinguishing closed vs still-open gaps),
Trend's Plan/Target lines fixed to scale per-SP instead of showing the 28-SP total against a
single student's line, command bar given labels+tooltips, and — the actual fix for reported
"stuttering" — Replay rewritten from a per-frame full-model-rebuild into a precomputed-timeline
engine (one prefix-sum pass, O(1) per-frame lookups, only KPI text + one chart dataset swap per
frame). Also fixed a real bug where grid cells silently compressed to ~20% of their declared width
(`table-layout:auto` + `contain:layout` ancestor — fixed with an explicit `<table>` width). Full
write-up incl. a debugging note about this dev server's stale-HTML-cache behavior: REVAMP.md's
p174 entry. Only V5's own files touched (`js/view-cohort-v5.js`, `js/ap127-v5-layout.js`,
`css/cohort-v5.css`); `git diff --stat` on the three DB_Share-proxied files confirmed empty.) p166
(2026-08-12 — **AP127 Detail V5 labelled as Draft** — sidebar
nav reads "AP127 Detail V5 (Draft)", in-page brand shows a DRAFT badge with a tooltip. Cosmetic
only, no ids changed. Files: `js/shell.js`, `js/view-cohort-v5.js`, `css/cohort-v5.css`.) p165
(2026-08-12 — **AP127 Detail V5 — first round of user feedback on
the p164 build.** Seven asks, all shipped:
1. **Broken Pulse layout root-caused to invalid span values, not styling** — the shipped default used
   `span: 7`/`span: 5` but only `.v5-span-4/6/8/12` existed in CSS, so `grid-column` was never set and
   both panels collapsed to one 1/12-wide column. All spans 1-12 now defined, validator accepts any
   integer 1-12, and Pace vs Target / Watchlist are full-width one-per-line as requested. Trend the
   same: Output and Streaks full width, Streaks below Output.
2. **Command bar made self-explanatory** — every group now has a visible label (MEASURE IN · SHOW ·
   PERIOD · DATA AS OF · FIND SP · ACTIONS) plus a plain-language tooltip, and chip wording moved from
   jargon to plain terms (`Batch`/`Per-SP`/`SP…` → `Whole batch`/`All SP`/`One SP…`).
3. **Trend Plan/Target now scale to scope — a real accuracy bug.** Both are batch totals (×28 SP); the
   per-SP view drew 28 student lines against them, ~28× too high. Now divided by student count when
   scope isn't batch and relabelled `Plan / SP` / `Target / SP`. **Second bug found doing this:** scope
   `sp` (one student) fell into the batch branch, so picking one SP drew the 28-SP aggregate instead of
   that SP. Fixed.
4. **PEOPLE renamed "Each SP"** (label only — panel ids unchanged so saved layouts/share links survive).
5. **SYLLABUS rebuilt as ONE roster-style grid** (Bars|Cells toggle removed), matching Aircraft Status'
   SP Stat idiom, with the V4 detail restored: click-through lesson detail, clickable phase band showing
   objective + completion standard, a key-point/milestone row, an ETC column, each of the 17 target
   columns labelled with its own DATE, a blue current-date (today's target lesson) column, and a red
   dashed lag band spanning each SP's gap to today's target. Phase funnel folded in as a summary strip.
6. **CALENDAR rebuilt in the same roster style** — per-cell hours, sticky name/period columns, month and
   Monday rules, today outlined, instructor grouping kept; plus sticky HOURS/DAY + LESSONS/DAY footer
   rows with batch grand totals, red dashed marking for idle runs ≥7d between flights, and amber dotted
   marking for SP still idle through to today.
7. Dead canvas-grid engine (`attachCanvasGrid`) and its tooltip CSS removed.

Also: `content-visibility:auto` is released once a panel mounts (`.v5-mounted`) — defensive only, NOT a
fix for a reproduced bug; the "stuck on Loading…" frames seen while testing were stale screenshot
captures (DOM verified correct each time, forced repaint showed the real grid).

Verified live: sticky identity columns measured to align exactly with the lesson grid and phase header
(257px vs 258px — first attempt had the phase band sliding under them, and a double-edged rose shadow on
17 target columns × 28 rows that made the grid unreadable; both fixed); lesson labels thinned every-5th →
every-10th after measuring real overlap at 13px columns; all three restored modals confirmed with correct
content; Calendar footer pinned and populated (1039.0h / 827L); parity harness 0 mismatches across 28 SP;
self-check 11/11; mobile 375px zero horizontal overflow on all five sections; V4 reloaded and unchanged
(10 charts, KPI 34.8%), `git diff --stat` on the three DB_Share-proxied files empty. Files touched:
`js/view-cohort-v5.js`, `js/ap127-v5-layout.js`, `css/cohort-v5.css`, `index.html`.) p164 (2026-08-12 — **New tab: AP127 Detail V5 — a redesigned,
consolidated successor to AP127 Detail V4, additive only (V4 stays exactly as-is).** User: "I want
to continue develop the AP127 DETAIL V4 tab... New version of AP127 DETAIL will be on a new tab
'AP127 DETAIL V5'... Keep all the current system and tab." Full design doc:
`docs/superpowers/specs/2026-08-12-ap127-detail-v5-design.md`; full build log with every bug found
during live verification: REVAMP.md's p164 entry.

**Why V4 needed this:** 16 stacked panels / 13 Chart.js instances / 2 ~5,000-node DOM heatmaps
after ~25 rounds of purely additive feedback (p121-p163) — laggy scrolling, duplicated charts,
inconsistent per-panel controls, no admin customisation, and a PDF export that doesn't look like
the page. Also found two real, live accuracy bugs in V4 (not fixed there — V4 is frozen; fixed only
in the new model): **F1** the headline "lessons done" (`s.done`, includes retakes) disagreed with
the Lesson Matrix/Phase Funnel's own deduped counts; **F2** `ap127Hours()` credits a retaken
lesson's full duration on every attempt, contradicting the p143 Ops Analytics rule ("count once per
SP"), so V4 and Ops Analytics disagreed about the same batch's hours.

**New files (nav: Progress → "AP127 Detail V5" / ◆ / `cohort-v5`):**
`js/ap127-v5-model.js` — the only place any V5 number is computed; every formula ported verbatim
from `view-cohort-v4.js` (line-numbered in comments) except the documented F1/F2 fix, which exposes
`lessonsCompleted`/`flightRecords`/`hoursEffective`/`hoursLogged` as four distinct quantities plus a
visible `retakes` count; runs unmodified under Node, verified against the live snapshot with 0
mismatches. `js/ap127-v5-layout.js` — the dynamic-layout config (presets, validator, localStorage +
revision log, `?v5layout=` share link, export-for-commit). `js/view-cohort-v5.js` — one global
command bar (replaces 9 independent V4 control sets), 5 lazily-mounted sections (Pulse/Trend/
People/Syllabus/Calendar), 16 V4 panels consolidated to 10 (the 4 actual-vs-plan charts → 1 chart;
the 2 DOM heatmaps → 1 canvas-drawn Activity Calendar; the 3 lesson-number views → 1 canvas-drawn
Curriculum Grid) — measured 115 DOM nodes / 3 live charts on Trend vs. V4's ~10,000-node heatmaps
alone. Plus a 10-generator Insight Reel, a Replay ("▶ Story") that drives the As-Of scrubber through
history with pauses at milestones, KPI count-up, an 11-check Self-Check footer, and a Report Sheet
feeding both `window.print()` (vector, real page numbers) and a raster PDF download (own per-page
footer drawn by jsPDF). `css/cohort-v5.css` — own hex/rgb palette, scoped `.ap127-v5` (deliberately
not the app's oklch() theme, so PDF export never fights it).

**11 real bugs found and fixed during live verification** (full detail in REVAMP.md's p164 entry):
chartjs-plugin-datalabels auto-registering globally off the CDN build and stamping raw coordinates
on every V5 chart · a missing `.util.` namespace on two model helper calls · `signed()`
double-negating negative values ("−-2" instead of "−2") · a stray leftover `container` reference
throwing inside the Output panel's update · a nested-hash routing conflict where V5's own section
deep-link would have made the OUTER app fail to restore its view on reload (fixed by moving to a
`?v5section=` query param instead) · the SP/Customise/Report overlays rendering fully transparent
because their CSS variables were scoped to `.ap127-v5` while the overlays (deliberately
`document.body`-appended, for correct `position:fixed` viewport coverage) sit outside it in the DOM
· the PDF download failing on html2canvas's `"unsupported color function oklch"` even with the
report sheet's own palette snapshotted to `rgb()`, because html2canvas clones the *whole document*
and still walked into this app's oklch() theme elsewhere on the page (fixed with an isolated iframe
containing only the hex/rgb V5 stylesheet) · report charts silently missing whenever generated from
a non-Trend section, since the report read the LIVE (possibly-destroyed) chart instances instead of
rendering its own · the PDF footer reading "Page 1" on every physical page (now a real per-page
running footer drawn directly by jsPDF) · a KPI count-up race between `requestAnimationFrame` and a
separate `setTimeout` that could let the tween's raw number permanently overwrite the correct
formatted text — root-caused via a live `MutationObserver` trace, fixed by giving the tween a single
`onDone` callback that owns the final state · missing keyboard/`aria-sort` affordance on the roster
table's sort headers (same gap V4 fixed in p149, applied here too).

**Verified live, end-to-end:** new `ap127V5ParityV5()` console harness — 0 mismatches vs. V4's own
formulas across all 28 SP for every non-divergent figure. Self-check 11/11 pass on live data, a
time-travelled As-Of, and throughout a full Replay run. All 5 sections exercised with real data
including canvas click-through to the SP drawer on both grids. Customise: hid a panel, Applied,
cold-reloaded — stayed hidden; Reset correctly restored the default. PDF download decoded from a
real intercepted `.save()` call and inspected with `pdfinfo`/`pdftoppm` (same technique as p163) —
valid multi-page PDF, both charts present, all 28 roster rows, correct running footer. Mobile 375px:
zero horizontal page overflow anywhere, including the 96-column Curriculum Grid canvas. V4 reloaded
after all of this — pixel-for-pixel unchanged, zero new console errors,
`git diff --stat js/view-cohort-v4.js js/shared.js css/progress.css` empty throughout. Files
touched: `js/ap127-v5-model.js` (new), `js/ap127-v5-layout.js` (new), `js/view-cohort-v5.js` (new),
`css/cohort-v5.css` (new), `index.html`, `js/shell.js`.) p163 (2026-08-09 — **AP127 Detail V4 — new "Export PDF" button:
snaps the tab's current state into a downloadable PDF report.** User: "No I want this tab export
function. To snap the current state as pdf. It should include all data in the page with proper
layout. But this should not effect the current look of the page. Pls design and propose to me with
example of today report." First delivered a design proposal + a hand-built example PDF (reportlab,
built from live-scraped data) for review; user picked "Screenshot via html2canvas" for how the
Roster/Lesson Matrix heatmaps should be handled, then the real in-app feature was built.

**Architecture:** entirely client-side — jsPDF + jspdf-autotable + html2canvas, all loaded via CDN
in `index.html` (no ?v= pin, matching how Chart.js/React are loaded — external libraries, not this
project's own versioned code). New `ap127ExportPDF()` deliberately reads the ALREADY-RENDERED DOM
(KPI cards, Pace Monitor tables, Progress Ranking rows via `.innerText`, chart canvases via Chart.js's
own `toBase64Image()`) rather than recomputing anything independently — guarantees the PDF is
byte-for-byte what's on screen (any active search filter, sort, time-travel As-Of date, custom Daily
Output range) with zero risk of a second, drifted copy of the app's formulas. New "⬇ Export PDF"
button added to the tab's title bar next to the existing "HOURS = EFFECTIVE" badge — purely
additive, zero change to any existing element's position/behavior. Report covers ALL of the tab's
data: cover + Batch Summary, Pace Monitor (cards + both Req/Act/Gap tables + action banner), Daily
Output (KPIs + chart), Batch Lagging History, Combined Progress vs Plan, Phase Progress Funnel,
Pace Distribution, Individual Lead/Lag vs Plan, Actual vs Planned, Consecutive & Idle Streaks,
Watchlist, Flight Timeline (landscape), Overall Progress (landscape), full Progress Ranking table
(landscape, all 28 SP + all 13 columns), Roster heatmap, Lesson Completion Matrix.

**Real bug found and fixed during live testing (not shipped blind):** html2canvas 1.4.1 can't parse
this app's `oklch()`/`color-mix(in oklch,...)` CSS — used pervasively in the theme system
(`css/theme.css`'s `:root` palette vars), not just one isolated spot — so a direct screenshot of the
Roster/Lesson Matrix threw `"Attempting to parse an unsupported color function oklch"` and aborted
the WHOLE export. Mitigated two ways: (1) `cloneForCanvas()` screenshots a temporary, off-screen
CLONE (not the live element) with any `color-mix()`-using inline style swapped for the plain
`rgb()` the browser already resolved it to; (2) since that alone didn't fully solve it (the failure
is deeper than one inline case), wrapped each heatmap capture in its own try/catch — on failure it
falls back to a real data table (Name + the one column that actually carries text, e.g. Roster's
Total or Lesson Matrix's vs-Target — the heatmap's day/lesson cells carry no text, only color, so
dumping them isn't useful) with a note explaining why. The export as a whole never fails because of
this; verified live both ways (forced-clone success path AND the real fallback path, both produce a
valid PDF).

**Second bug found and fixed during verification:** jsPDF's default PNG image embedding is
near-uncompressed (confirmed via `pdfimages -list` — every embedded chart image showed 100% storage
ratio, no compression at all) — an early full-export test came out to 21.5MB from ~9 chart images
alone. Fixed by passing jsPDF's `"MEDIUM"` compression option to every `addImage()` call (stays PNG,
not JPEG, to preserve the charts' transparent backgrounds) — cut the same export to 1.77MB, a ~12x
reduction, with no visible quality loss.

**Third set of fixes found during verification:** several `.textContent`-based DOM reads collapsed
`<br>`-separated header/label text with no space (e.g. "SE<br>TYPE" → "SETYPE", "Month<br>(30d)" →
"Month(30d)") — switched every such read to a new shared `txt()` helper using `.innerText` (which
respects rendered line breaks) instead. Also fixed the Roster/Lesson Matrix fallback tables
including a spurious blank/duplicate header row (`<thead>` rows were matching the same name/value
CSS selectors the real `<tbody>` rows use) — scoped the fallback's row query to `tbody tr, tfoot tr`.

**Verified live, end-to-end, for real** (not just "no console errors"): triggered the actual
`ap127ExportPDFV4()` button function in the browser, intercepted jsPDF's `.save()` to capture the
real generated PDF bytes (`.output('datauristring')`) instead of relying on an unobservable browser
download, decoded them back into an actual `.pdf` file, and inspected it directly —
`pdfinfo`/`pdftoppm`-rendered pages confirmed 11 pages, correct data on every page (KPI numbers,
Pace Monitor tables, all 6 embedded charts, the full 28-row Progress Ranking table, and the
Roster/Lesson Matrix fallback tables), zero garbled text, 1.77MB file size. Zero new console errors
beyond the pre-existing local-dev CORS fallback (the 3 `"ap127ExportPDF failed: oklch"` errors seen
in the console are stale, from the 3 attempts made *before* the try/catch fallback was added — not
from the final, verified-working code). Original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Files touched: `js/view-cohort-v4.js`, `index.html` (3 new CDN script
tags). Full write-up: REVAMP.md's p163 entry.) p162 (2026-08-08 — **AP127 Detail V4 — "Batch Lead/Lag History"
redesigned into "Batch Lagging History": flipped to a lag-only view, floored at zero.** User: "Now
I want to redesign the BATCH LEAD/LAG HISTORY chart. Due to it always lagging. I want to change to
Batch lagging chart. The Y axis show lag hour/lesson in positive. (Basically flip the current
one). If the progress is lead plan it will be be zero on the chart." Since the batch is
realistically always behind (never meaningfully ahead), the old signed lead/lag line spent almost
all its time in negative territory with the "ahead" half of the scale doing nothing.
`buildAP127HistBatch()`'s per-date value changed from `delta = actual − planned` (signed, could go
either way) to `lag = Math.max(0, planned − actual)` (always ≥0) — a day the batch is on-plan or
ahead now reads as flat zero instead of dipping below the axis. Y-axis given `beginAtZero:true`;
line/fill recolored solid red (`#ef4444`, was magenta with a green/red split fill) since the whole
chart is now "how bad is it," not a two-directional comparison; KPI cards relabeled from Now/Best/
Worst (peak lead / peak lag) to Now (current lag, or "On plan" if zero)/Best (lowest lag ever
reached)/Worst (peak lag ever) — dropped the +/− sign formatting since values are never negative.
Panel renamed "Batch Lead/Lag History" → "Batch Lagging History" throughout (panel title, the
top-of-tab "HOURS = EFFECTIVE" badge's chart-name list, an internal code comment). The other,
separate "Individual Lead/Lag vs Plan" chart (per-SP, still genuinely bidirectional since
individual students DO sometimes run ahead) was intentionally left untouched — out of scope, user
asked specifically about the batch chart. Verified live: Hours mode showed "949.0h behind schedule
today" / "28.0h closest to plan ever" / "958.1h peak lag ever" with an entirely red, always-
positive line growing from 0h to ~950h; switched to Lessons mode and confirmed the equivalent
values (409/28/581 les), all still positive; zero new console errors. Only file touched:
`js/view-cohort-v4.js`. Full write-up: REVAMP.md's p162 entry.) p161 (2026-08-08 — same-day follow-up: **audited every other CMDV2
tab/sub-tab for the p160 rounding-verification gap.** User: "Pls also check all other tab and
sub-tab in CMD V2 about this precision problem." Swept every `js/view-*.js` file — confirmed no
real accumulation bug anywhere (every hour total sums raw values, `.toFixed()` only at final
render). Found and fixed 2 more instances of the exact p160 gap (precise total, but tooltip capped
at 1dp with no way to verify it by hand): `js/view-summary.js`'s Ops Analytics `RosterHeatmap`
(Student/Instructor Activity) and `js/view-roster.js`'s PM Roster board — both cell tooltips now
`.toFixed(2)`. Checked clean: Cross-Check's Reconciliation Ledger (already 2dp + residual check,
better than the standard); AP127 Detail/V4 Roster (uses exact `hm()` minute formatting, not
decimal hours at all); Gantt/Board/Daily/Calendar (tooltips show raw start–end times or the exact
`f.duration` string; click-through opens the shared exact `Drawer()`); remaining `view-program.js`/
`shell.js` 1dp figures are aggregate KPI tiles, not itemized per-flight lists. Verified live:
Ops Analytics roster tooltip now reads "1.33h" (was "1.3h"); PM Roster tooltip reads "2.17h" (was
"2.2h"). Zero new console errors. Full write-up: REVAMP.md's p161 entry.) p160 (2026-08-08 — **Aircraft Status SP Stat/FI Stat/Utilization —
precise-value drilldown fix for a reported "rounding causes totals to be off" bug.** User: "When
flight time is 15 or 20 minutes these rounded as 0.3hr and it add up cause the total calculation
way off." Investigated via `superpowers:systematic-debugging` before touching code — **found the
summation math was already fully correct**: every total (`personTotals`/`dayTotals`/
`kpi.totalHours`/group totals) sums each flight's raw `durMin/60` float, `.toFixed(1)` applied only
once at final render, never fed back into further math. Verified live before the fix: SIRIKIAT B.
(30d) — hand-summing the displayed 1-decimal day cells gives 7.9h, but the app's own Total already
correctly showed 7.8h (= true 7.75h, not the rounded-cell sum). **Real bug: no way to verify that
by hand** — cell hover tooltips also rounded to 1 decimal, so hovering "for the exact number" gave
back the same rounded number, zero extra precision. Fixed with new `uFmtHPrecise()` (2dp) routed
through every manual-verification surface — cell tooltips + the click-to-open drawer (summary
tiles + each flight's line item) — in both `UtilizationTab` and `PersonStatTab` (covers
Utilization/FI Stat/SP Stat, same shared code). Compact heatmap cells and headline KPI numbers
deliberately left at 1 decimal, matching the rest of the app. Verified live: SIRIKIAT B.'s 21 Jul
cell tooltip now reads "0.75h" (was "0.8h"); its drawer shows This Day 0.75h / Wk 1.75h / Jul 2026
5.50h / period 7.75h, each hand-verifiable against the single 0.75h flight line item beneath it.
Zero new console errors. Only file touched: `js/view-aircraft.js`. Full write-up: REVAMP.md's p160
entry.) p159 (2026-08-08 — **Ops Analytics — SIM hours fixed: upstream
`isSim` flag was wrong for ≈67% of sim flights.** User: "In OPS ANALYTICS, hour of SIM look off,
check that too." Traced from the Cross-Check Monthly Ledger's own "Sim-tag mismatch" diagnostic
(previously flagged but unresolved): AP-126 June showed 0 Ops-flagged sim flights against
Progress's 100 logged sim lessons that month. Root cause confirmed directly against raw
`flight-data.js`: the Ops Portal feed spells the same simulator devices two different ways —
`"DA40 (SIM)"` (parenthetical, correctly flagged) and `"DA40_SIM"` (underscore, **always** flagged
`isSim:false` upstream, same for DA42/R44) — 481 of 713 sim flights dataset-wide (≈67%) mis-flagged,
concentrated in one window (2026-06-08 to 2026-07-10) that had already rolled out of the default
30-day view, which is why it read as "just the last 30 days look fine" until the Cross-Check
ledger's June/July rows exposed it starkly. Confirmed Aircraft Status was never affected — its own
`uIsSim()` already does a robust `/SIM/i` substring test rather than trusting the raw flag; every
other view reading `f.isSim` directly (Ops Analytics, Cross-Check) inherited the bug. Fixed with a
one-time load-time normalization in `js/shared.js` (same pattern as the p131/p158 alias fixes):
`f.isSim = true` whenever `/sim/i.test(type)` or `/\(sim\)/i.test(tail)`. Verified live: sim-tag
mismatch dropped from June Δ100/July Δ101 to June Δ1/July Δ4 (the tiny remainder is one
already-known "Ops booking still Pending" case, not a new bug); Ops Analytics' 90D view now
correctly shows AP-124 sim hours (18.0h) that were previously invisible; zero console errors. Only
file touched: `js/shared.js`.) p158 (2026-08-05 — **OPS ⇄ PROG exact reconciliation — root-caused
every remaining hour of Δ.** Follow-up to the same day's earlier fix (p143, effective-hours dedup +
lesson sequence check). User: "All should be match exactly... go through all detail as much as you
need... If still cannot make it the same then show me in the way that we can pin point all the
different points." Found and fixed **three more real bugs**, each confirmed live by comparing
matched-same-month totals record-by-record, not just aggregate hour totals: (1) **duplicate `.id`
values silently under-corrected the effective-hours dedup** — several Ops Portal rows share the
exact same `.id` (a known upstream issue, see the p116 entry below) so a `Set` of ids credited every
row sharing a duplicated id instead of just one; fixed by tracking flight object references instead.
(2) **A lesson-code spelling mismatch between the Ops Portal and the curriculum** — `"CDNXV 48"`
(Ops) and `"CDNXC 48"` (curriculum/Progress) are the same lesson, confirmed via 28 exact 1:1
student+date matches; fixed with a new `AP_LESSON_CODE_ALIASES` map in `js/shared.js`, same pattern
as the existing `AP127_STUDENT_ALIASES` fix, applied once at load time so every view benefits.
(3) **The dedup didn't treat bare and "/1" lesson codes as the same lesson**, and gave zero credit
to a lesson logged only as continuation legs ("/2","/3"...) with no "/1"/bare leg ever recorded;
rewrote `sBuildEffectiveCreditSet()` (`js/view-summary.js`) and its `js/crosscheck-monthly.js`
mirror around a "lesson family" (base code, any suffix stripped) with a part-1-preferred
representative pick. New **Reconciliation Ledger** panel in Cross-Check's "Monthly OPS ⇄ PROG"
view (`js/view-crosscheck.js`) — `computeLedger()` in `js/crosscheck-monthly.js` accounts for
every hour of Δ across 6 bidirectional categories (Ops-Pending, Ops-Canceled, structural,
true-gap, cross-month drift both directions, Progress-not-logged-yet), itemized to
student+lesson+date, with a printed residual so nothing is left unexplained. **Result: 5 of 6
batch/month rows now reconcile to an exact 0.00h residual; the 6th is 0.01h off (rounding only,
~0.6 minutes).** Superseded the prior day's one-directional dateDrift/noMatch diagnostic panels
(the ledger strictly subsumes them). Verified live: Ops Analytics renders correctly with the
updated formula, Block/Actual mode confirmed unchanged, ledger expand/collapse exercised at both
category and line-item level, mobile 390px checked, zero console errors throughout. Design:
`docs/superpowers/specs/2026-08-05-ops-prog-exact-reconciliation-design.md`. Only files touched:
`js/shared.js`, `js/view-summary.js`, `js/crosscheck-monthly.js`, `js/view-crosscheck.js`.) p154
(2026-08-07 — **AP127 Detail V4 — Daily Output: explanation
hidden behind an ⓘ icon, new Total/Dual/Solo/Simulator summary row.** User: "Hide the explanation
in an i icon" + "Add summary KPI card, not too big: Total, Total duo, Total solo, Total sim."
1. **Explanation collapsed behind a ⓘ button.** The panel's long explanation paragraph
   (`#d127v4-lb-note`) now starts `display:none`, toggled by a small round ⓘ button next to the
   panel title (new `ap127ToggleLBInfo()`/`ap127ToggleLBInfoV4`) — same text, just not taking up
   space until someone wants it.
2. **New compact 4-card summary row** (Total / Dual / Solo / Simulator) above the chart, reusing
   the existing `.cpv-kpi` component (shrunk slightly — 16px value font vs the usual 20px, per
   "not too big") in a new `.d127v4-lb-kpis` 4-column grid (2-column below 900px). Reflects the
   SAME currently-visible range/unit/"Hide off days" filter as the bars themselves — Total's
   subtitle shows the period count (e.g. "110 days"), Dual/Solo/Simulator's subtitles show % share
   of Total. Required removing the `if(breakdown)` gate around the Dual/Solo/Simulator
   accumulation in `buildAP127LessonBar()` so these totals are always computed, not only when the
   "By Type" stacked-bar view is toggled on.
Verified live: KPI math cross-checked exactly against the page's own headline figures — Lessons
mode showed Dual 637 + Solo 295 + Simulator 0 = 932, matching "932 lessons done" shown elsewhere
on the same page; Hours mode showed 68%/32%/0% split summing correctly; confirmed the cards update
correctly across unit (Hours/Lessons) and period (Day/Week/Month) toggles; confirmed the ⓘ toggle
shows/hides the note with no layout breakage. Zero new console errors beyond the pre-existing
local-dev CORS fallback. Original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css`. Full
write-up: REVAMP.md's p154 entry.
**Note: p153 was used by a concurrent session's Schedule Gantt fix (see below) — this session's
audit work had reached p152; that Gantt fix landed on `main` in between, so this Daily Output
change correctly took the next real available token, p154, not p153.**) p153
(2026-08-07 — **Schedule Gantt — AP-127 FOCUS dim fixed to be
per-flight, not per-row.** User-reported: "the AP127 quick button seem to a bit off. When it
active it should dim all other than AP127 SP but I found some other than AP127 still not dim."
Root cause (found via systematic debugging, confirmed against the correct pattern already used by
`view-board.js`/`view-weekly.js`): `view-gantt.js` computed dimming per ROW (`hasHL`/`rowAlpha` —
opacity 0.28 applied to the whole row `<div>` only when NONE of that row's flights were AP-127),
instead of per FLIGHT like every other view. Since Gantt groups rows by tail or instructor, a row
routinely mixes an AP-127 flight with a different batch's flight on the same tail/FI — that row's
`hasHL` was true, so `rowAlpha` stayed 1 and the whole row (including the non-AP-127 bars) rendered
at full brightness. Fixed by deleting the row-level `hasHL`/`rowAlpha` mechanism entirely and
applying the same shared `flightAlpha(f, app.highlightAP127)` helper Board/Weekly already use,
per flight bar, keyed off that flight's own `f.batch` — multiplied into the bar's existing
status-based opacity (`(dim?0.4:isFiSP?0.75:1) * hlAlpha`). Verified live (local static server):
toggled AP-127 FOCUS on in both A/C and INSTRUCTOR grouping — a tail (HS-TVC) and an instructor
(EKKAPHOP R.) each showing one AP-127 flight alongside a different-batch flight on the same
row now correctly show only the AP-127 bar at full brightness, the other bar dimmed; toggling
focus off restores full brightness across the board; zero new console errors (only the
pre-existing local-dev CORS fallback). Only file touched: `js/view-gantt.js`.) p152
(2026-08-07 — **AP127 Detail V4 — full stats/table/chart audit,
Round D: SYLLABUS strip + Overall Progress polish.** Continuation of the p149-p151 audit (plan:
`.claude/plans/nested-sparking-tide.md`). Fixes, all in `ap127SyllabusStrip()`/new
`ap127SetSyllabusStripHtml()`/`buildAP127OverallChart()`:
1. **Narrow phase segments (e.g. "ME Sim", 2 lessons ≈2% of strip width) no longer silently
   ellipsis-clip their label to nothing.** New `ap127SetSyllabusStripHtml(stripEl,html)` sets the
   strip's HTML then does a `requestAnimationFrame` pass measuring each `.d127v4-syl-phase`
   block's actual rendered pixel width (can't be done in pure CSS — these are flex-basis
   percentages of a container whose real px width isn't known until layout runs) and adds a
   `.d127v4-syl-phase-narrow` class (hides the now-unreadable text; hover tooltip/click-to-modal
   still work) to any block under 34px. Both render call sites (initial mount,
   `ap127SyncSyllabusStrip()` on every zoom/pan) now route through this helper. Verified live via
   a real zoom interaction (not just cold load, which can have `requestAnimationFrame` throttled
   in a background/inactive tab): zoomed until "Phase I" clipped to 16px, confirmed it correctly
   got `narrow:true`.
2. **Milestone icons that land within 2 lessons of each other no longer visually merge.** The two
   GH/VFR-XC checkrides (L54/55), Solo/Instrument (L14/15), and IFR-XC-checkride/Multi-Engine
   (L90/91, which also lands on the bold SE→ME phase divider) previously rendered as
   indistinguishable clusters. Proximity is computed on a lesson-number-sorted COPY of the visible
   milestone list (the underlying `kps` array isn't itself lesson-sorted — checkrides are appended
   after the type-based first-matches), then the later item in each close pair gets a new
   `.d127v4-syl-kp-alt` class (CSS) that shifts its icon+tick down within the strip so both stay
   legible; original array indices are preserved so `openAP127MilestoneModalV4(i)` still opens the
   right detail. **Caught and fixed a real bug in the first version of this fix during
   verification** — it compared each item only to whatever happened to precede it in the
   (unsorted) array with no `Math.abs()`, so e.g. Multi-Engine(91)→CheckrideGH(54) evaluated
   `54-91=-37 <= 2` as true (any negative number passes a bare `<=2` check), wrongly flagging
   unrelated distant milestones while being blind to true adjacent pairs that weren't array-
   adjacent (like L90/91). Verified live post-fix: exactly the intended pairs are flagged
   (`Instrument L15`, `VFR-XC L55`, `Sim L56` — chains onto 55 — and `Multi-Engine L91`), nothing
   else.
3. **Overall Progress bar-end text color (green=at/ahead, rose=behind) now states its own
   reference.** The color reflects standing vs. the AP127 batch-wide TARGET schedule — a different
   reference than "Plan" (the curriculum's own dates, used everywhere else in this tab, e.g.
   Combined Progress vs Plan) — but nothing in the panel said so, risking the color being read as
   tracking Plan instead. Added two legend chips ("text = at/ahead of target" / "text = behind
   target") with an explanatory tooltip.
Verified live throughout; zero new console errors beyond the pre-existing local-dev CORS fallback.
Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched. Only files
touched: `js/view-cohort-v4.js`, `css/progress.css`. Full write-up: REVAMP.md's p152 entry. Round
E (lesson-code normalization audit) still pending.) p151
(2026-08-07 — **AP127 Detail V4 — full stats/table/chart audit,
Round C: Daily Output + Funnel + Roster + Lesson Matrix fixes.** Continuation of the p149/p150
audit (plan: `.claude/plans/nested-sparking-tide.md`). Fixes:
1. **Timezone bug fixed in two more spots.** `ap127ActualPace()` (feeds Pace Monitor's Actual/Gap)
   and `buildAP127Roster()`'s date-range start both parsed `today` as local midnight then
   serialized via `toISOString()` (always UTC) — silently shifting the window back a day east of
   UTC (Bangkok). Same one-line fix already correct elsewhere in this file (`"T00:00:00Z"` +
   `setUTCDate`).
2. **Phase Progress Funnel could show over 100% from retaken lessons.** `doneData` counted every
   flown record in a phase with no dedup per (student, lesson NUMBER), while `totalSlots` assumed
   exactly one completion per lesson per student — a retake could push a phase's "Done" segment
   past its own total. Fixed with the same per-(student,lesson) dedup principle as the p143 Ops
   Analytics fix. Verified live: all 4 phases now compute to ≤100% (`[100,93,11,0]`), Done+Remaining
   exactly equals each phase's total slots by construction.
3. **Lesson Completion Matrix's lead/lag figure had the same smaller-blast-radius bug** — `vsClosest`
   used the raw `s.done` flight count (which includes retakes) instead of a per-lesson-deduped
   count. Fixed locally using the `byLesson` grouping already computed in that function (no change
   to the global `s.done`, which many other unrelated parts of the tab intentionally still use as
   a raw activity count).
4. **Roster table now has 2 sticky columns, matching the Lesson Matrix's existing pattern.** The
   Total (lessons/hours) column had no `position:sticky`, so it scrolled out of view on a wide date
   range while only the Name column stayed pinned. Now pinned at `left:82px` (66px on mobile),
   mirroring `.d127v4-lm-vs`.
5. **Daily Output's "latest closed period" can no longer silently point at a stale period.** With
   "Hide off days" on and a real idle gap right before today, `gapIdx` previously indexed into the
   *filtered* period-keys array, which could resolve to "the latest period with any activity" —
   possibly weeks older than the day/week/month immediately preceding today, contradicting the
   overlay's own "latest CLOSED period" claim. Now resolves the true calendar-adjacent period first,
   then looks it up in the filtered view; if that exact period was filtered out, the overlay is
   suppressed rather than showing a stale comparison (existing `gapIdx>=0` guard now does this
   correctly).
6. **Dual/Solo/Simulator palette contrast improved.** Measured perceived luminance had Solo
   (mustard) and Simulator (the old light violet `#a78bfa`) landing at nearly identical brightness
   (~160 vs ~160 on a 0-299 scale) — distinguishable mainly by hue alone, a real risk under
   deuteranopia/protanopia where magenta and violet sit close together. Simulator darkened to
   `#6d5cd6` (~111), giving a real lightness gap from both Dual and Solo while staying in the same
   hue family. Verified live: `Chart.getChart(...)`'s Simulator dataset confirms the new hex.
7. Also removed 2 pieces of dead code (`ap127v4PeriodEnd()`, unused; `.d127v4-heat-group` CSS rule,
   no matching JS usage) and fixed `ap127FitY()` to skip hidden datasets, so isolating one student
   in Pace Distribution (solo) actually tightens the Y-axis to just their line instead of still
   being pulled wide by every other (hidden) student.
Verified live throughout; zero new console errors beyond the pre-existing local-dev CORS fallback.
Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched. Only files
touched: `js/view-cohort-v4.js`, `css/progress.css`. Full write-up: REVAMP.md's p151 entry. Rounds
D (SYLLABUS strip/Overall Progress polish) and E (lesson-code normalization audit) still pending.)
p150
(2026-08-07 — **AP127 Detail V4 — full stats/table/chart audit,
Round B: Combined Progress + Race + Cons/Idle + Timeline chart fixes.** Continuation of the audit
started in p149 (plan: `.claude/plans/nested-sparking-tide.md`). Fixes, all in
`buildAP127CombinedChart()`/`buildAP127RaceChart()`/`buildAP127ConsIdle()`/`buildAP127Timeline()`:
1. **Combined Progress vs Plan's "To Today" filter actually works now.** `targetSeries` (the
   AP127 Targets overlay added in p140) wasn't clipped to `endDate` the way `planSeries`/`actSeries`
   already were — since Chart.js autoscales the x-axis to the union of every dataset's points, the
   Target schedule's own far-future points (through Nov 2026) kept the axis wide open regardless of
   the "To Today" toggle. Now clipped, plus explicit `scales.x.min/max` set so no future dataset can
   do this again. Verified live: switching to "To Today" now correctly shrinks the axis max from
   2028-12-02 (the long projection) down to today's date.
2. **Race chart ("Actual vs Planned") now plots on a real time axis, not a category axis.** Was
   missing `x:{type:'time'}` (its sibling charts, Cons/Idle and Combined Progress, already had it)
   — under a category axis a 1-day gap and a 60-day gap between flights got equal pixel width,
   distorting the exact pace-over-time comparison this chart exists to show. Converted every
   dataset's data to `{x,y}` pairs and added the same time-axis config the other two charts use.
3. **Per-student line color is now stable across a session, not tied to sort position.** Race and
   Cons/Idle both colored each SP by `i*360/n` off `ap127PaceSort`'s index — since that order shifts
   on every render where relative rank changes (progress, or scrubbing the As-Of time-travel
   slider), the same student's color could visibly drift. New shared `ap127StudentHue(catc_id,...)`
   assigns hue by a stable identity key (catc_id), recomputed only when batch membership actually
   changes. Verified live: time-traveled to 01 Jun 2026 (reordering the sort) and confirmed one
   student's line kept the identical hue (321°) before and after.
4. **Timeline chart: never-flown students no longer render as a blank row.** Every other activity
   state (flying, gone-idle) already got a colored visual cue; a student who simply hasn't started
   training yet got nothing at all — indistinguishable from a data-load glitch. Added a hollow ring
   marker at the plot's left edge plus a "not started" tooltip and legend chip. (No students in the
   live dataset currently trigger this path — verified by code review/syntax-check rather than a
   live before/after, same as a couple of Round A's zero-hour-student edge cases.)
5. **Timeline chart: dot-click no longer silently no-ops when the student is filtered out of the
   search box.** `onClick` resolved the clicked SP against `AP127_VIEW_ROWS` (search-filtered) with
   no fallback — clicking a dot for a student excluded by an active search did nothing, with zero
   feedback. Now clears the search and re-renders before retrying the lookup.
6. **Cons/Idle streak chart: added a note explaining early-batch negative average.** Every SP's
   streak is walked from the BATCH's earliest flown date, not their own start date, so a
   late-starting SP reads as "idle" for every day before they personally began — which can make the
   Batch Avg line read as deeply negative early on for reasons unrelated to pace. Panel note now
   calls this out explicitly instead of leaving it to be misread.
Verified live throughout (see individual items); zero new console errors beyond the pre-existing
local-dev CORS fallback. Original AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/
untouched. Only file touched: `js/view-cohort-v4.js`. Full write-up: REVAMP.md's p150 entry. Rounds
C (Daily Output/Funnel/Roster/Lesson Matrix), D (SYLLABUS strip/Overall Progress polish), and E
(lesson-code normalization audit) still pending.) p149
(2026-08-07 — **AP127 Detail V4 — full stats/table/chart audit,
Round A: Progress Ranking + Pace Monitor bug fixes.** User: "Pls go through all stat, table and
Charts in AP127 DETAIL V4. Suggest improvement idea and flaw that might currently there." Full
audit done via 3 parallel Explore agents covering every stat card, table, and chart in
`js/view-cohort-v4.js`, hand-verified the top findings against source, then implemented in tiered
rounds (plan: `.claude/plans/nested-sparking-tide.md`). Round A fixes, all in
`renderAP127Rows()`/`renderAP127Detail()`/`renderAP127Pace()`/`ap127RequiredPace()`/
`ap127HeaderClick()`:
1. **NaN% bug fixed.** Progress Ranking's Total row divided `0/0` when a search matched zero
   students, rendering literal "NaN%". Now guards `rows.length` and shows clean zeros.
2. **Total row no longer mixes filtered/unfiltered data.** `lagLastLes`/`leadLastLes`/
   `minFltDate`/`maxFltDate` now derive from the search-filtered `rows`, matching every other
   figure on that row (previously silently sourced from the full unfiltered cohort).
3. **"On track" terminology collision fixed.** The Progress Ranking meta line ("X/Y on track" —
   meant "at/above cohort avg") and the Pace Monitor's "On Track" KPI card (meant "ETC ≤ plan end
   date") used the same word for two different measures. Renamed the meta line to "at/above avg".
4. **Pace Monitor's "avg +Xd" no longer blows up from a never-flown student.** A 0-hour SP's ETC
   sentinel (`9999-12-31`) was getting averaged into the At Risk card's delay figure, capable of
   producing a meaningless multi-million-day average. Now excluded from the average and reported
   separately ("N not started").
5. **Plan-overdue state gets its own message.** Previously, once the batch passed its plan end
   date, the Required Action banner said "Plan end date unavailable" while the Plan End KPI card
   two lines above correctly showed the real date + "0d remaining" — same fact, contradictory
   text. `ap127RequiredPace()` now returns `overdue`/`daysOverdue`; both the KPI card ("overdue by
   Xd") and the action banner now agree.
6. Also fixed a latent UTC-parse timezone bug in the per-SP ETC calc (line ~553, matching the
   pattern already correct elsewhere in this file) plus several Tier-3 cleanups: removed dead
   `ap127RankClass()`, gave dynamically-added sort options friendly labels ("Sort: HRS Delta" not
   "Sort: hrsDelta"), split the LESSON DONE column onto its own `donelessons` sort key (was
   sharing `data-key="ahead"` with Progress %, causing the sort-arrow to appear on both
   simultaneously), added `tabindex`/`role="button"`/`aria-sort` to every sortable table header for
   keyboard/screen-reader support, and added an explanatory tooltip to the bare "Rank" header.
Verified live: reproduced every bug's trigger condition before and after (zero-match search → no
more NaN; time-traveled the As-Of scrubber to 01 Dec 2026, past the 27 Nov plan end, confirmed
"overdue by 4d" now shows consistently in both the KPI card and action banner instead of the old
contradictory pair); confirmed the LESSON DONE header's arrow/aria-sort no longer also lights up
Progress %'s header; confirmed every sortable `<th>` now carries `tabIndex=0`/`role="button"`.
Zero new console errors (only the pre-existing local-dev CORS fallback). Original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file touched:
`js/view-cohort-v4.js`. Full write-up: REVAMP.md's p149 entry. Rounds B–E (charts, Daily
Output/Funnel/Roster/Lesson Matrix, SYLLABUS strip polish, lesson-code normalization audit) still
pending — see the plan file for the full 26-item catalog.) p148
(2026-08-07 — **AP127 Detail V4 — Daily Output "By Type"
breakdown recolored: Dual = magenta, Solo = mustard.** User: "When By Type option is ON. Dual
should be in the Magenta and Solo in Mustard color." `AP127_LESSON_TYPE_COLORS` changed from
`{Dual:"#60a5fa",Solo:"#facc15",Simulator:"#a78bfa"}` to `{Dual:"#e88aff",Solo:"#d4a017",
Simulator:"#a78bfa"}` — Dual now uses the app's own signature magenta accent (`var(--c127)`/
`#e88aff`, used everywhere else in this tab) instead of a generic blue; Solo uses a deliberately
duller/browner mustard (`#d4a017`) rather than the bright gold `#facc15` already used elsewhere
for target-checkpoint flags/key-point ticks, so the two don't get visually confused. Simulator
unchanged. Verified live: enabled "By Type" on the Daily Output chart, `Chart.getChart(...)`
confirmed the 3 dataset `backgroundColor`s exactly (`#e88aff`/`#d4a017`/`#a78bfa`), screenshot
confirmed clear magenta/mustard/purple stacked segments with good contrast on the dark theme,
zero new console errors (only the pre-existing local-dev CORS fallback). Only file touched:
`js/view-cohort-v4.js`. Full write-up: REVAMP.md's p148 entry.) p147
(2026-08-07 — **AP127 Detail V4 — Daily Output: gap uses the
latest CLOSED period, current period shown hollow with a projected close.** User: "I think we
should calculate the gap by using the latest closed bar not the opening current bar" plus "For
current opening bar... change its appearance to be more distinguish, maybe a hollow bar with an
estimate where it may close by projecting from the current already have data for that bar."
1. **Gap uses the latest closed period.** New `openIdx`/`latestIsOpen` (is the latest bar the
   period today falls inside — a Day bar for today, or the Week/Month bar today is partway
   through) and `gapIdx` (= `openIdx-1` when open, else `openIdx`). The Required/Actual/Gap
   overlay now anchors on `gapIdx`'s bar instead of always the last one — comparing a full-period
   target against a still-forming partial period was misleading.
2. **Open bar shown hollow + projected.** New `ap127v4PeriodEnd()`/`ap127v4ProjectPeriod()`
   helpers; the latter linearly extrapolates from the elapsed-days fraction within the period
   (Day view returns actualSoFar unchanged — a day is this chart's finest grain, nothing to
   extrapolate from). The open bar's real (solid) portion gets a scriptable white dashed border
   (`ctx.dataIndex===openIdx`); a new stacked "Projected (est.)" dataset adds a hollow dashed cap
   on top sized to the projected remainder, labeled with the projected TOTAL (`~17.0h`, not just
   the remainder). Works identically with the Dual/Solo/Simulator breakdown on. The x-axis label
   for the open bar gets a "◐" suffix.
Verified live: Week view — Required 243.4h/Actual 26.7h/gap -216.7h anchored correctly on the
27 Jul (closed) bar, not 03 Aug (open, showing "~17.0h" projected — hand-verified: 12.17h actual
÷ (5/7 days elapsed) ≈ 17.04h, matches exactly); Month + breakdown together — Required 1058.5h /
Actual 442.8h (Jul, closed, matching its own stack-total datalabel) / gap -615.6h, Aug's open
bar showing "~110.0h" projected cap with a dashed white border on its real Dual/Solo segments.
Zero console errors beyond the pre-existing local-dev CORS fallback. Original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file touched:
`js/view-cohort-v4.js`. Full write-up: REVAMP.md's p147 entry.) p146
(2026-08-07 — **AP127 Detail V4 — Daily Output target overlay:
"Actual" fixed to the bar's own value.** User questioned p145's "Actual" line the moment they saw
it: "How the actual (blue dash line) is calculated? It should not cal actual I think." p145 had
made "Actual" the same smoothed rolling-window figure Pace Monitor uses (trailing 7d÷7 for Day
etc.) specifically so the gap number would exactly equal Pace Monitor's — but that meant the blue
line floated at a height that didn't correspond to anything actually drawn on the chart, which
reads as wrong/confusing on a bar chart (a number with no visible bar backing it). Fixed by making
"Actual" simply the latest bar's own raw value (`values[keys.length-1]`) — the blue line now
always sits exactly level with the bar's own top, and the gap bracket visually reads as "this
bar vs required." The Required/target number is UNCHANGED and still provably identical to Pace
Monitor's (still calls the shared `ap127RequiredPace()`) — only the Actual side changed. Legend
and panel note text corrected to stop claiming both numbers cross-check Pace Monitor (only
Required does now). Verified live: today's bar was 0 (no flights logged yet in this snapshot),
overlay correctly showed "Actual 0.0h" / "Required 34.8h" / "-34.8h gap" — the blue line sitting
right at the bar's own (empty) top, not floating at some unrelated smoothed value. Only file
touched: `js/view-cohort-v4.js`. Full write-up: REVAMP.md's p146 entry.) p145
(2026-08-07 — **AP127 Detail V4 — Daily Output chart: date
range, target/gap overlay, month/week separators, Dual/Solo/Simulator breakdown.** Four
improvements to the "Daily Output · Lessons & Hours" chart:
1. **Date range.** New start/end date inputs (default: full history, earliest flight → today).
   Custom range clips both the accumulation and the generated period-key range; end is clamped to
   never exceed today.
2. **Target/actual/gap overlay, cross-checked against Pace Monitor.** New shared helpers
   `ap127RequiredPace()` and `ap127ActualPace()` — the Pace Monitor table's own Required/Actual
   formulas, factored out so both it and this chart read identical numbers (verified live: Pace
   Monitor's Day row showed Req 34.8h / Act 4.83h / Gap -29.9h; the chart's overlay showed the
   exact same three numbers). Drawn only on the latest bar, only when it's genuinely today's
   period. The "actual" reference is the SAME rolling-window figure Pace Monitor uses (7d/day,
   14d-halved/week, 30d/month) — not the bar's own raw value — specifically so the gap number
   provably matches; the raw bar itself is left untouched, still showing per-period variance.
3. **Separators.** Faint vertical lines at each week boundary (Day view) or month boundary (Week
   view), with a month label in Week view.
4. **Dual/Solo/Simulator breakdown toggle.** New `ap127LessonType(code)` classifier (leading "C",
   optional "M" for multi-engine, then the letter that carries Dual/Solo/SPIC meaning per the
   syllabus's own code key; "(SIM)" anywhere overrides to Simulator; SPIC buckets into Solo — both
   mean flying without an instructor). "By Type" splits each bar into 3 stacked, distinctly
   colored segments, each with its own datalabel, plus a total-of-stack label on top.
Verified live: zero console errors beyond the pre-existing local-dev CORS fallback (unrelated,
happens on every local test in this session); original AP127 Detail (`js/view-cohort.js`)
confirmed still byte-identical/untouched. Files touched: `js/view-cohort-v4.js` only. Full
write-up: REVAMP.md's p145 entry.) p143 (2026-08-05 — **Ops Analytics — effective-hours counting fix +
lesson sequence check.** Follow-up to the previous day's Cross-Check "Monthly OPS ⇄ PROG"
diagnostic, which had found (but deliberately not fixed) that multi-leg Ops Portal bookings
double-credit curriculum hours. User set a hard rule: a curriculum lesson's effective hours count
**once per SP**, no matter how many Ops Portal bookings reference it — and asked for a check
surfacing SPs who show a later lesson complete without an earlier one logged (flag, don't
fabricate, per explicit decision). `js/view-summary.js`'s single shared `hoursOf()` (used by every
KPI/chart/table/roster in the tab — 9 call sites, confirmed by grep) now dedups Effective-mode
hours per (student, raw lesson code) globally, crediting only one representative booking (latest
date/time) per lesson; Block/Actual mode is untouched (real logged time per booking, correctly not
deduped). New `SequenceGapPanel`/`sBuildSequenceGaps()` flags any SP whose completed-lesson set has
a gap, sourced from `window.NGT_CACHE` (Progress feed), mounted after Batch Summary.
**Two real bugs caught during live verification, not just written and shipped:** (1) the dedup's
first version tracked credited rows by `f.id`, but live data showed several Ops Portal rows share
identical `.id` strings (pre-existing upstream id-generation issue, already documented below for
`ACTUAL_ONLY_*` records) — a plain `Set` of ids silently over-credited every row sharing a
duplicated id, undershooting the fix (AP-126 May corrected only 523.2h→510.2h instead of the true
523.2h→475.2h). Fixed by tracking flight **object references** instead of `.id` strings. (2) the
sequence-gap check's first version sourced "completed" from `window.FLIGHTS`, which is a documented
rolling window of Ops Portal history — for a long-finished batch like AP-124 this produced a wall
of false positives (a student who reached the final checkride reported as missing nearly the whole
curriculum, since their early lessons had aged out of the window). Fixed by sourcing from
`window.NGT_CACHE`'s non-windowed `flown[]` via the existing `sBatchRoster()` helper — gap count
dropped from 57 (mostly false) to 5 plausible single-lesson gaps. `js/crosscheck-monthly.js`
updated with the identical object-identity dedup so the Cross-Check Monthly view's "OPS hrs" column
keeps mirroring Ops Analytics' real (now-corrected) behavior — re-verified live: every AP-126/
AP-127 × May/Jun/Jul Δ% is now within ±10% (AP-126 May, the prior worst case, −1.4%). Verified
live: zero console errors, Block mode confirmed unchanged, mobile 390px checked. Design:
`docs/superpowers/specs/2026-08-05-ops-analytics-effective-hours-fix-design.md`. Only files
touched: `js/view-summary.js`, `js/crosscheck-monthly.js`, `js/view-crosscheck.js` (framing text
only).) p142 (2026-08-05 — **AP127 Detail V4 — performance fix: search box
no longer rebuilds the whole tab.** User-reported the tab "feel laggy." Root cause found by
reading the render wiring, not guessing: the search `<input>`'s `oninput` called
`renderAP127DetailV4()` directly — the FULL render orchestrator — on every single keystroke, with
zero debounce. That function unconditionally rebuilds 12+ Chart.js instances (each a destroy +
recreate) AND fully regenerates both heatmap-style tables (Roster, and the new p141 Lesson
Completion Matrix — together several thousand DOM nodes) on every call, even though NONE of that
depends on the search query — only the Progress Ranking table's row filter does. Fixed by
extracting a new `renderAP127Rows()` containing exactly the search/sort-dependent Progress Ranking
table logic (row filter, `AP127_VIEW_ROWS` assignment, total-row stats, tbody render, sort-arrow
indicators) out of `renderAP127Detail()`; the search input, sort dropdown, header-click sort, and
Reset Sort now all call this lightweight function instead of the full one — `renderAP127Detail()`
itself is unchanged and still does the full rebuild for genuine data-changing triggers (initial
mount, As-Of date scrubbing). Search input also gained a 120ms debounce
(`ap127RowsDebounced`/`_ap127RowsDebounce`) on top of that. Second fix: `mkC()` (the one shared
chart-creation helper every `build*Chart()` in this file goes through) now defaults
`animation:false` unless a caller opts in — with 12+ charts potentially rebuilding together on a
real data refresh, each animating its own ~1s entrance independently was a second, compounding
source of visible jank; one central default fixes it everywhere without touching each chart's own
config. Verified live: captured the Overall Progress chart's object reference and the Lesson
Matrix's innerHTML before typing "kraisee" in search — both were byte-identical afterward
(confirmed via `Chart.getChart('d127v4-overall') === capturedRef` and innerHTML string equality),
while the Progress Ranking table correctly filtered to the 1 matching row; same identity check for
the sort dropdown and Reset Sort (chart untouched in both cases); confirmed the full-render path
(As-Of date scrubbing) still correctly rebuilds the chart (`chartRebuilt: true`) and now reports
`animation: false` on the resulting instance. Zero console errors throughout. Original AP127
Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file touched:
`js/view-cohort-v4.js`. Full write-up: REVAMP.md's p142 entry.) p141
(2026-08-04 — **AP127 Detail V4 — new Lesson Completion
Matrix chart.** User asked for a Roster-style heatmap but with LESSON NUMBER (1-96) as the
columns instead of calendar date, showing who's completed what, with AP127 Target checkpoints
marked and each SP's lead/lag against the closest one. New `buildAP127LessonMatrix()`, new panel
between Overall Progress Bar View and Phase Progress Funnel. Design: rows sorted most-behind-
target-first (not the usual pace sort, since this view's whole point is target lead/lag); two
sticky columns (Name, "vs L{closest target lesson}" — colored green/rose) since 96 lesson columns
need horizontal scroll; a phase-color header band (`AP127_BAR_SEGMENTS`, same 7-segment scheme as
Overall Progress) plus lesson-number ticks every 5 lessons; target-checkpoint columns get a rose
flag in the header and a rose outline running down the whole column; completed-lesson cells are
phase-colored and clickable (opens the same student drawer as Roster); each SP's immediate next
lesson gets an amber ring; a retaken lesson gets a small blue dot badge; a footer "BATCH %" row
shades each lesson column by what fraction of the 28 SPs have completed it (bottleneck spotting,
reusing the `color-mix` intensity idea). New helper `ap127ClosestMilestoneTarget(dateStr,targets)`
added to `js/ap127-targets-data.js` (nearest schedule checkpoint by date, ties toward the earlier
one) alongside the existing interpolation helper. Verified live: header/phase-bands/target-flags
render correctly; sticky columns stay pinned while scrolling 96 columns wide; clicking a completed
cell opens the student drawer; zero console errors; original `js/view-cohort.js` confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `js/ap127-targets-data.js`,
`css/progress.css`. Full write-up: REVAMP.md's p141 entry.) p140 (2026-08-04 — **AP127 Targets — new batch-wide milestone
schedule feature.** User supplied a 17-checkpoint date→lesson-number schedule (9 Aug 2026 L30
through 29 Nov 2026 L96) that the whole AP127 batch is expected to keep pace with, and asked for
(1) an editable admin page under System with a revision record, (2) the schedule overlaid on every
AP127 Detail V4 chart/timeline so hit/miss is visible.

**Data model** (`js/ap127-targets-data.js`, new, loaded early — before `shell.js`):
`window.AP127_MILESTONE_TARGETS_DEFAULT` (the 17-entry array, the code default),
`ap127GetMilestoneTargets()` (returns a `localStorage` override if present, else the default),
`ap127TargetLessonForDate(dateStr)` (linear interpolation between the two bounding schedule
entries — before the first date returns 0, after the last returns that last lesson).

**No writable backend exists for this app** (static Cloudflare Pages deploy off committed data
files) — there is nowhere to persist a *shared* edit history server-side. Resolved honestly rather
than faked: the System-tab editor (`js/view-ap127-targets.js`, new nav entry `AP127 Targets`,
icon `⌖`) persists edits to `localStorage` (`ap127MilestoneTargetsOverride`) plus a local
`ap127MilestoneTargetsLog` revision log shown in the page — but this is **browser-local only**.
The durable, shared revision record is git history on `js/ap127-targets-data.js`, same as
everything else in this codebase — the editor's "Export for commit" panel pretty-prints the
current table as a ready-to-paste `AP127_MILESTONE_TARGETS_DEFAULT` array with a Copy button and
explicit instructions to commit it. Verified live: edited a row (L30→L32), confirmed it wrote to
`localStorage` and logged `"Changed 09 Aug 2026 · L30 → 09 Aug 2026 · L32"`; Reset-to-defaults
confirmed clearing the override.

**Chart/timeline overlays**, all reading the SAME `ap127GetMilestoneTargets()`/
`ap127TargetLessonForDate()` so they can never disagree with each other or the editor:
1. **Combined Progress vs Plan** — new "Target" line series (rose `#f43f5e`), the 17 checkpoints
   converted to this chart's batch-aggregate units (lessons mode: `target lesson × 28 SP`; hours
   mode: cumulative planned hours through that lesson, from the curriculum's own per-lesson
   durations, `× 28 SP`) so it's directly comparable to Actual/Plan on the same axis. New "vs
   Target Today" KPI card alongside the existing "vs Plan Today" one.
2. **Overall Progress Bar View** — a single rose dashed reference line + "TARGET · L{n}" label at
   today's (or the As-Of date's) interpolated target, drawn once in the SYLLABUS strip and once on
   the chart (`targetLinePlugin`) — deliberately ONE line, not per-row, consistent with the p139
   decluttering pass. Each SP's existing current/next-lesson text (`currentLabelPlugin`) is
   color-coded green (at/ahead of target) or rose (behind) instead of adding new line clutter.
   Verified live by time-traveling to 2026-09-01: target correctly interpolated to L43 (between
   the Aug30/L42 and Sep6/L46 checkpoints) and every SP's label correctly turned rose (all were
   behind L43 in that snapshot).
3. **Flight Timeline vs Progress** — one thin dashed rose vertical line per checkpoint date
   (`targetLinesPlugin`), labeled with its target lesson number, drawn against the same calendar
   x-axis as the per-SP flight dots.
Verified live throughout: zero console errors; original AP127 Detail (`js/view-cohort.js`)
confirmed still byte-identical/untouched. Files touched: new `js/ap127-targets-data.js`,
`js/view-ap127-targets.js`; modified `js/shell.js` (nav+registry), `js/view-cohort-v4.js`
(3 chart integrations), `index.html` (2 new script tags). Full write-up: REVAMP.md's p140 entry.)
p139 (2026-08-04 — **AP127 Detail V4 — Overall Progress: SYLLABUS
zooms with chart, clutter removed from SP rows, clickable milestone explanations, SVG icons.**
Thirteenth round of same-day feedback, four items:
1. **SYLLABUS zooms together with chart.** `ap127SyllabusStrip(cur,totalLessons,viewMin,viewMax)`
   now takes a visible-range window and clips/rescales phase segments + milestone icons to it
   instead of always showing the full 0..totalLessons range. New `ap127SyncSyllabusStrip()`
   re-renders it from `CHARTS.ap127overall.scales.x.min/max` — wired into the zoom-plugin's
   `onZoomComplete`/`onPanComplete` (wheel/pinch/drag-pan) AND called explicitly from
   `ap127OverallZoomV4`/`ap127OverallResetZoomV4` (the +/-/Reset buttons), since relying solely on
   plugin callbacks firing for programmatic `.zoom()`/`.resetZoom()` isn't guaranteed. Verified
   live: zooming to 1.6x showed "showing lessons 29–67 of 96 (zoomed with chart)" with Phase I
   correctly dropped (fully outside the window) and Phase III/IFR Sim correctly clipped.
2. **All phase/milestone display moved into the SYLLABUS strip only.** The chart's `markerPlugin`
   (vertical guide lines + text labels drawn over every SP row) is deleted entirely — it was
   literally duplicating the same phase name already shown in the strip once above, while
   cluttering the SP rows with overlapping text. Per-SP bars are now just clean phase-colored
   segments + the current/next-lesson label (genuinely per-SP data, kept). Legend trimmed to just
   the segment colors + the SE→ME changeover marker (the strip's own visuals, not removed ones).
3. **Milestone icons click-to-expand.** New `openAP127MilestoneModalV4(i)` reuses the same generic
   drawer as the phase-detail modal, showing a written explanation of what each milestone TYPE
   means (Solo/Instrument/Cross-Country/Sim/Multi-Engine/Checkride — new `AP127_MILESTONE_TYPES`
   lookup with one paragraph each), keyed by index into the last-rendered milestone list
   (`AP127_OVERALL_KPS`) so it stays valid across re-renders from zoom.
4. **Professional icon set.** Replaced the emoji icons (a second round of feedback after the
   pager→compass swap) with small stroke-based inline SVGs (14x14 viewBox, `currentColor`,
   ~1.2 stroke-width) matching the app's existing `ViewIcon()` convention in `js/shared.js` — an
   aircraft silhouette (Solo), gauge+needle (Instrument), dashed route+waypoint (Cross-Country),
   monitor (Sim), twin propeller discs (Multi-Engine), shield+check (Checkride). New
   `ap127KeyPointIconSvg(label,size)` used everywhere the old emoji function was.
Verified live throughout: zero console errors, original AP127 Detail (`js/view-cohort.js`)
confirmed still byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`,
`css/progress.css`. Full write-up: REVAMP.md's p139 entry.) p138
(2026-08-04 — **AP127 Detail V4 — Overall Progress: zoom UX
overhaul.** User-reported the p137 wheel-zoom was "all over the place... very sensitive" —
plain mouse-wheel zoom on a chart embedded in a normally-scrolling page fires on every incidental
scroll-past the chart, not just deliberate zoom intent, and there was no way to zoom in a
controlled, predictable step. Fixed with two changes: (1) explicit "−"/"+" zoom buttons
(`ap127OverallZoomV4(factor)`, calling Chart.js zoom-plugin's `chart.zoom()` with a fixed
1.25x/0.8x step per click) added next to the existing "⟳ Reset View" button — now the primary,
discoverable zoom control; (2) wheel-zoom gated behind `modifierKey:"ctrl"` at a slower `speed:0.06`
(was unconditional at default speed) — plain scrolling over the chart now behaves like plain
scrolling, Ctrl/⌘+scroll still zooms gently for power users, pinch-zoom stays unconditional since a
two-finger touch gesture is inherently deliberate. Verified live: `+` button confirmed
0-96→12-84 (1.25x zoom), plain wheel dispatch confirmed NO zoom (still 0-96), Ctrl+wheel dispatch
confirmed a gentle zoom, Reset button confirmed restoring 0-96 in all cases. Only files touched:
`js/view-cohort-v4.js`, `css/progress.css`. Full write-up: REVAMP.md's p138 entry.) p137
(2026-08-04 — **AP127 Detail V4 — Overall Progress: mobile
alignment fix, clickable SYLLABUS phases, Phase IV SIM/REAL + SE/ME split, aviation icons,
zoom/pan/resize.** Twelfth round of same-day feedback, five items in one pass:
1. **Mobile alignment fix.** A prior mobile media-query zeroed out the SYLLABUS strip's 100px left
   offset, but the chart's y-axis label column below it stays a fixed 100px at every viewport width
   — so the override actively broke alignment instead of fixing it. Removed; verified at 375px
   width that phase-color transitions in the strip now line up with the per-SP bars beneath.
2. **Clickable phase detail.** New modal (`openAP127SyllabusModalV4`/`closeAP127SyllabusModalV4`,
   markup reuses the existing `.d127-draw`/`.d127-dh` drawer styling) opens on any SYLLABUS segment
   click — shows the phase's objective and completion standard (trimmed verbatim from
   syllabus.json, new fields on `AP127_SYLLABUS_PHASES`), an hours/lesson breakdown when the phase
   has sub-segments, and every milestone that falls within it.
3. **Phase IV split.** New `AP127_BAR_SEGMENTS` (Overall Progress Bar View only — Flight Timeline/
   Roster/Phase Funnel still use the flat 4-phase `AP127_SYLLABUS_PHASES`) breaks Phase IV into 4
   contiguous, syllabus-verified sub-ranges: IFR Sim (L56-67, 28h), IFR Real (L68-90, 59h), ME Sim
   (L91-92, 2h), ME Real (L93-96, 7h) — distinct colors (blue/purple = SE, pink/magenta = ME;
   lighter = sim, saturated = real), each clickable into the same Phase IV modal. The SE→ME
   changeover (lesson 91) draws as a bold solid divider in both the SYLLABUS strip and the per-SP
   chart, vs. the usual dashed phase-boundary line.
4. **Aviation-appropriate icons.** `ap127KeyPointIcon()`'s previous set included a pager emoji for
   "Instrument" — replaced the full set: 🛫 Solo, 🧭 Instrument, 🗺️ Cross-Country, 🖥️ Sim,
   🌀 Multi-Engine, 🎖️ Checkride.
5. **Resizable + zoom/pan interactive.** Added chartjs-plugin-zoom (already loaded globally, same
   plugin the Combined Progress vs Plan chart uses) with wheel/pinch zoom + drag pan in 'xy' mode,
   plus a "⟳ Reset View" button (`ap127OverallResetZoomV4`). The canvas's container div is now
   CSS `resize:vertical` so the chart height is user-adjustable by dragging its corner.
Verified live: zero console errors throughout; phase-block clicks open the correct modal content
(including the no-breakdown path for single-segment phases); zoom/reset confirmed via direct chart
API calls (0-96 → 24-72 after 1.5x zoom, back to 0-96 on reset); original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only files touched:
`js/view-cohort-v4.js`, `css/progress.css`. Full write-up: REVAMP.md's p137 entry.) p136
(2026-08-04 — **Cross-Check — new "Monthly OPS ⇄ PROG"
reconciliation view.** User asked why AP-126/AP-127 monthly effective-hours totals differ between
"Ops Analytics" and the School side (named "School Analysis" but, per research, that tab has no
monthly-hours table at all — the real analog is "School Perf."'s Scorecard engine), for
May/Jun/Jul 2026, and wanted the comparison + root causes shown in a webpage, in the Cross-Check
tab. New `js/crosscheck-monthly.js` (plain script, no JSX) computes both sides live from
`window.FLIGHTS`/`window.NGT_CACHE`, reusing the exact same effective-hours formula each source
tab already applies (`sBuildCurMap`/`sEffectiveMins` from `js/view-summary.js:38-59`;
`buildCurMap`/`collectEffectiveFlights` from `js/view-program.js:1440-1471`) — this feature does
not reinterpret either system, only reconciles them side by side. `js/view-crosscheck.js` gained a
toggle between the existing per-flight reconciliation (renamed `PerFlightView` internally, behavior
unchanged) and a new `MonthlyView`: headline batch×month table (OPS hrs/flights vs PROG
hrs/lessons, Δ, Δ%), per-SP drill-down sorted by |Δ| descending, 5 root-cause diagnostic panels,
and a written "why + how to fix" panel. Diagnose-only — no changes to `view-summary.js`/
`view-program.js` calculation logic. **Headline finding:** both systems already use the identical
curriculum-standard effective-hours formula (not the root cause, contrary to the natural first
guess) — the real drivers are (1) **multi-leg Ops Portal bookings double-crediting one curriculum
lesson's full standard duration per booking** (May AP-126: 38 lesson-instances split across 63
extra Ops rows — the dominant driver of AP-126's May/Jun swings), (2) **sim-flight tagging
disagreement** (OPS `isSim` boolean vs. PROG's `"(SIM)"` lesson-code marker — AP-126 June: 100 PROG
sim-lesson completions vs. 0 OPS-flagged), (3) minor date-drift and progress-entry-lag noise
(AP-127 close every month, consistent with normal lag). Batch-tag mismatches checked and ruled out
(zero for AP-126/AP-127 in this window). Verified live: numbers cross-checked against an
independent ad hoc computation during design (exact match), toggle/diagnostics/per-SP drill-down
exercised, mobile 390px checked (table scrolls in its own container, no page overflow), zero
console errors, existing per-flight Cross-Check confirmed unchanged. Design:
`docs/superpowers/specs/2026-08-04-crosscheck-monthly-ops-prog-design.md`; plan:
`docs/superpowers/plans/2026-08-04-crosscheck-monthly-ops-prog.md`. Only files touched:
`js/crosscheck-monthly.js` (new), `js/view-crosscheck.js`, `index.html`.) p133 (2026-08-04 — **AP127 Detail V4 — Overall Progress: SYLLABUS
strip replaces the "MASTER PLAN" chart row.** Eleventh round of same-day feedback: "Make the
master plan bigger so we can fit all info inside the bar," "Add more detail from the syllabus...
add some creativity," "Change the MASTER PLAN to be SYLLABUS." The v5 design folded a "MASTER PLAN"
reference bar into the Chart.js stacked-bar dataset as row 0 (same height as every SP's own row,
one line of canvas text) — too cramped for phase name + description + hour/lesson counts +
milestone detail all at once, and canvas text can't do hover tooltips. Pulled it out of the chart
entirely: new `ap127SyllabusStrip(cur,totalLessons)` renders a standalone, much taller (56px vs a
per-SP row's ~20px) HTML/CSS timeline into a new `#d127v4-syllabus-strip` div directly above the
canvas — 4 phase blocks sized proportionally by lesson count, each showing phase number + title +
lesson range + hours, with a `title` tooltip carrying a one-line phase blurb (new `blurb` field on
`AP127_SYLLABUS_PHASES`, plus a verified `hrs` field per phase — summed each phase's own lesson
durations from the authoritative syllabus.json and confirmed 14+25+45+96=180h). Above the phase
row, every key point and checkride renders as an emoji-flagged pin (🛫 Solo, 📟 Instrument, 🧭
Cross-Country, 🖥️ Sim, ✈️ Multi-Engine, 🏁 Checkride) connected by a thin tick line down into its
phase segment, positioned by the same `lesson/totalLessons` percentage math as the chart's x-axis
below it so the two stay visually aligned (shared 100px left gutter matching the chart's y-axis
label column). `buildAP127OverallChart()` no longer prepends a row-0 entry to any dataset/label
array; the per-SP chart's `currentLabelPlugin` bar-index lookup dropped its `+1` offset
accordingly. All "MASTER PLAN" strings renamed to "SYLLABUS" (chart label removed since it's no
longer a chart row; panel description text; code comments). Verified live: zero console errors,
SYLLABUS strip's 9 milestone tooltips match the syllabus source data exactly (Initial Solo L14,
Instrument L15, Cross-Country L29, Sim L56, Multi-Engine L91, checkrides L54/55/90/96), original
AP127 Detail (`js/view-cohort.js`) confirmed still byte-identical/untouched. Only files touched:
`js/view-cohort-v4.js`, `css/progress.css`. Full write-up: REVAMP.md's p133 entry.) p132
(2026-08-04 — **AP127 Detail V4 — Pace Monitor compact table +
batch-focused action banner, resizable Progress-Ranking/side-panel splitter, Overall Progress
readability + checkride detail.** Tenth round of same-day feedback, three unrelated asks bundled
into one pass:
1. **Pace Monitor → compact table.** The p129 big-number stat cards (3 per period × 6 periods)
   were replaced with two compact tables (1 SP / 28 SP Batch Total), each 3 rows (Month/Week/Day) ×
   6 data columns (Hrs Req/Act/Gap, Les Req/Act/Gap) — same underlying numbers, far less vertical
   space. Required Action banner changed from a per-SP hours+lessons message to a single
   batch-wide hours-per-week figure per explicit request ("focus on batch's hrs need per week"):
   new `gHrWkBatch = actWeekHrsB - reqWeekHrsB` (no `/n`, no lessons).
2. **Resizable Progress Ranking / side-panel splitter.** The two-column layout below Progress
   Ranking used the shared `.d127-grid` class (still used as-is by the original AP127 Detail tab) —
   left untouched there; V4 now uses its own `.d127v4-split-grid` with a draggable
   `#d127v4-split-handle` between the two panels. Width persists to `localStorage`
   (`ap127v4SplitLeftPx`) via `ap127InitSplit()`, restored (clamped to viewport) on every mount.
   Bug caught in testing: the restore-on-mount clamp ran synchronously right after
   `innerHTML=MARKUP`, before the browser had laid out the new grid, so
   `getBoundingClientRect().width` read 0 and every restore collapsed to the 280px minimum
   regardless of the saved value — fixed by deferring the restore to `requestAnimationFrame`.
   Verified live: dragged the handle (735px), reloaded, confirmed it restored to 732px (correctly
   clamped against the real ~1020px grid width, not collapsed to 280px).
3. **Overall Progress — readable marker labels + checkride detail.** User-reported "Master plan
   and key point is difficult to read": the phase-boundary/key-point labels (`markerPlugin`) were
   flat-color canvas text drawn directly over the MASTER PLAN row's colored phase segments, so
   light text over light segments (or vice versa) was low-contrast. Fixed with a dark stroke-then-
   fill halo (`ctx.strokeText` in `rgba(13,17,23,0.9)` before `ctx.fillText`) — readable regardless
   of the segment color behind it. Also added checkride detail per user request ("add detail of
   each check ride flight"): `ap127KeyPoints()`'s generic `"Checkride"` label is now
   `"Checkride · <detail>"` via a new `AP127_CHECKRIDE_DETAIL` map (GH / VFR XC / IFR XC /
   ME IFR XC) keyed by the 4 real checkride codes (CSPGLC/CSPXVC/CSPXIC/CMSPXIC, confirmed against
   the authoritative syllabus.json). Fixed a real bug found while doing this: the old checkride
   regex was a bare `/C$/i` on the number-stripped code, which also matched Night/VFR/IFR
   Cross-Country codes ending "...XC" (e.g. "CDNXC 48" — Night Cross-Country, not a check) —
   confirmed live via the curriculum data that this produced a 5th, spurious "Checkride" marker.
   Fixed with a negative lookbehind, `/(?<!X)C$/i`, which still matches every real check code
   (their trailing C isn't part of an "XC" token) while excluding the false positive. Verified
   live: exactly 4 checkride markers now render, each with a distinct detail suffix, all legible
   against every phase color.

Verified live throughout: zero console errors, original AP127 Detail (`js/view-cohort.js`)
confirmed still byte-identical/untouched (`git diff --stat` empty). Only files touched:
`js/view-cohort-v4.js`, `css/progress.css`. Full write-up: REVAMP.md's p132 entry.) p131
(2026-08-04 — **OPS student-name alias normalization — 28
distinct AP-127 SPs.** User-reported: the same AP-127 SP was showing up under multiple spellings
in OPS data, fragmenting every OPS-side stat that groups by student (Ops Analytics "STUDENT
BREAKDOWN", Roster, Board, Slot Finder). Root cause: unplanned/manual bookings sometimes get
logged as the full legal name, the progress-feed nickname, or a differently-cased short form
instead of the standard "FIRST L." spelling — the same class of issue the `p96` Cross-Check fix
partially patched (see `REVAMP.md` line ~402), but that fix only normalized names *inside*
`reconcile.js`'s Cross-Check view, not the raw `FLIGHTS[].student` every other OPS view reads.
Confirmed live: 12 AP-127 SPs each had a second spelling — `MAETHAPHAN RUENGPRAPAIKIJSEREE` →
`MAETHAPHAN R.`, `WATCHARAPONG CHUAIDU` → `WATCHARAPONG C.`, `AKARAVIT KHWANNGAM` → `AKARAVIT K.`,
`SAETASIT P.` → `SETASIT P.`, `WATCHARAPHOL`/`WATCHARAPHOL VONGNOI` → `WATCHARAPHOL V.`,
`P-KORN`/`PICHAKORN JIRAPINYO` → `PICHAKORN J.`, `T-WAJ` → `TEERAWAJ C.`,
`JIRAYU AMORNSATITPAN` → `JIRAYU A.`, `W-POL` → `WATCHARAPOL A.`, `VASAPHON SINSAB` →
`VASAPHON S.` — all only ever seen on `(Unplanned)` rows. Fixed with a new `AP127_STUDENT_ALIASES`
map in `js/shared.js`, applied in the same load-time IIFE that already strips `" (Unplanned)"`
(`p106`), so every downstream view sees one canonical name per SP with no per-view changes needed.
Verified live: `FLIGHTS` now yields exactly 28 real AP-127 SP names + the pre-existing legitimate
`"All Students"` group-briefing entry (Long Brief/classroom, not a person) — was fragmented before.
Zero console errors. Only file touched: `js/shared.js`. Full write-up: `REVAMP.md`'s p131 entry.)
p130 (2026-08-03 — **School Perf — Scorecard batch-filter bug fix.**
User-reported "AP126 progress data broken" in Curriculum Prog + School Perf. Curriculum Prog
checked out fine live (batch dropdown correctly narrows to 28 AP126 students). Real bug was in
School Perf's "School Pace Scorecard": `renderScorecard()`'s per-batch KPI block hardcoded
`scKpis('ALL')` + `scKpis('AP127')` regardless of the selected batch-filter dropdown — selecting
AP126 (or AP124/AP129) updated the filter-note text and Monthly Variance table (already
batch-aware) but left the headline scorecard tiles + "AP127 Only" label frozen on AP127-only
figures, so AP126's pace/achievement numbers were never visible through that panel. Fixed by
computing `focusBatch = batch==='ALL' ? 'AP127' : batch` and rendering `scKpis(focusBatch)` with
a dynamic label (`#pf-sc-kpis-127-label`, was static "AP127 Only" markup text). Verified live:
selecting AP126 now shows a distinct, correct "AP126 ONLY" block (93% achievement, ON TRACK);
reselecting All batches reverts to the original "AP127 ONLY" figures (no regression); zero console
errors. Only file touched: `js/view-program.js`. Full write-up: REVAMP.md's p130 entry.) p129
(2026-08-02 — **AP127 Detail V4 — Pace Monitor: bar charts
replaced with big-number Required/Actual/Gap stats**, ninth round of same-day feedback. The p128
Day/Week/Month bar-chart redesign was itself replaced (not a bug fix — a straight ask for a
different visual language): "No more the bar chart. Just big number." Each of the 6 period-blocks
(Per Month / Per Week / Per Day × 1 SP / 28 SP Batch Total) is now a big-number stat trio —
Required, Actual, Gap — instead of a progress bar. The "Actual" figure per period now also uses a
period-matched rolling window instead of reusing one globally-selected range: Per Month = the
trailing-30-day total used directly (30d ≈ 1 month); Per Week = the trailing-14-day total halved
to a weekly rate (smoother than a bare 7-day sample); Per Day = the trailing-7-day total divided
by 7. The now-superseded "ACTUAL RANGE" dropdown (7/14/30/60d/all-time selector) was removed from
the markup since each period now sources its own fixed window. Required figures are computed
directly per period from `remaining ÷ daysRem` scaled by 7 (week) / 30.44 (month, average
Gregorian month length) rather than derived from a single weekly figure. Dead code from the old
bar-bullet system (`bullet()`, `periodBlock()`, `.d127v4-bullet-*`/`.d127v4-bullets` CSS) removed;
replaced with `stat()`/`statGroup()` and new `.d127v4-pace-stat*` CSS. Verified live: all 6
period-blocks show internally consistent numbers (per-SP figures = batch-wide ÷ 28, gap =
actual − required, batch Per Month required 1016h ÷ 28 = 36.3h matches the 1-SP Per Month
required), zero console errors, original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css`. Full
write-up: REVAMP.md's p129 entry.) p128 (2026-08-02 — **AP127 Detail V4 — Pace Monitor: Day/Week/Month
bars + Plan End countdown**, eighth round of same-day feedback. Removed the "Cohort ETC" card (a
single-number ETC computed from all-time average pace felt redundant next to the per-period bars
below it). "Plan End" card now shows a "Xd remaining" subline (days from today to the 27 Nov 2026
curriculum end date, reusing the already-computed `daysRem`). The Pace Monitor's actual-vs-target
bars — previously one "per week" bar per metric with a text-only day/month conversion footnote —
are now three fully separate bar pairs (Per Day / Per Week / Per Month), each showing its own
actual, target, and an explicit `(+/-Xh gap)` readout, for both the "1 SP" and "28 SP · Batch
Total" sections (12 bars total, up from 4). Cards grid dropped from 4 to 3 columns to match. Dead
code from the removed ETC card (`avgHrsDone`/`avgRemHrs`/`allTimeDaySP`/`etcDate` calc) removed
too. Verified live: bars render correctly for both sections, gap figures match actual-minus-target
by hand-check, zero console errors, original AP127 Detail (`js/view-cohort.js`) confirmed still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css`. Full
write-up: REVAMP.md's p128 entry.) p127 (2026-08-02 — **AP127 Detail V4 — KPI card hours + curriculum-hours
disclosure**, seventh round of same-day feedback. Two small KPI-card additions: (1) "Batch Progress"
card's subtext now shows hours done alongside lessons done — `923 les / 1,135.3h of 2688 les / 5040h
flown` — instead of lessons-only; (2) "Students" card's subtext now shows the curriculum's total hours
alongside its lesson count — `96 les · 180h curriculum` (180h = `ap127CurriculumHours()`, the sum of
every lesson's `planned_mins` in `G.cur127`, confirmed live against the raw progress-worker payload) —
with a `*` and a hover tooltip clarifying the 96-lesson/180h curriculum excludes Advanced UPRT (+5
lessons/+5h), which is tracked separately from the core AP127 syllabus (this exclusion is domain
knowledge from the user, not derived from `cur127` — the live data has no UPRT entries to check against).
Both figures reuse the existing `ap127Hours()`/`ap127CurriculumHours()` effective-hours convention, so
they stay consistent with every other hours figure on the tab. Verified live: both cards render
correctly, tooltip text confirmed via DOM inspection, zero console errors, original AP127 Detail
(`js/view-cohort.js`) still byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`,
`index.html` (cache-bust bump only). Full write-up: REVAMP.md's p127 entry.) p126 (2026-08-02 —
**AP127 Detail V4 — visible hours-convention badge**,
sixth round of same-day feedback. After the p125 fix standardized "hours done" to the effective-hours
convention (curriculum standard duration per lesson, not actual logged flight time) everywhere, user
asked which convention was actually in use, then asked for it to be shown on the page itself rather
than only explained in chat. Added a persistent, always-visible pill badge — "● HOURS = EFFECTIVE
(standard duration per lesson, not actual logged time)" — directly under the page title (not hidden
behind a hover), with a full-detail tooltip on hover covering every panel it applies to and the
fallback rule. Also added shorter reinforcing tooltips to the KPI card's "Hrs Done / Plan" label and
the Progress Ranking table's "HRS DONE" column header. Verified live: badge renders correctly above
the sticky toolbar, zero console errors, original AP127 Detail (`js/view-cohort.js`) still
byte-identical/untouched. Only files touched: `js/view-cohort-v4.js`, `css/progress.css`. Full
write-up: REVAMP.md's p126 entry.) p125 (2026-08-02 — **AP127 Detail V4 — cross-chart consistency pass**,
fifth round of same-day feedback, and the most consequential one: found and fixed a real numeric
discrepancy, not just UX polish. **Root cause: two competing "hours per flight" formulas coexisted
across the tab.** `ap127Hours()` (used by the KPI card, Progress Ranking table, Pace Monitor —
inherited unchanged from the original tab) computes each flight's hours as
`lessonsMap[lesson]||actualMins` (curriculum's standard duration wins, actual logged duration is
only a fallback). Six panels added across earlier V4 rounds — Actual vs Planned, Combined Progress's
chart line, Batch Lead/Lag History, Individual Lead/Lag vs Plan, Daily Output, and the Roster —
had each independently reinvented the same per-flight sum with the fallback order REVERSED
(`actualMins||lessonsMap[lesson]`) or dropped entirely (Roster: actual-only, no fallback). Same real
flights, different totals, because standard and actual durations aren't always identical. User
caught it by comparing Batch Lead/Lag History's "Now" (-880.7h at the time) against the KPI card
and Combined Progress vs Plan's "vs Plan Today," which agreed with each other but not with Batch
Lead/Lag. Fixed by rewriting all six sites to call the same `lessonsMap[lesson]||actualMins`
formula (Roster gained its own local `lessonsMap`/`hrsOf()` since it didn't have one). Re-verified
live: KPI card, Combined Progress vs Plan, and Batch Lead/Lag History now all show **-880.7h**
identically (was -880.7h / -880.7h / a different number before the fix); lessons mode spot-checked
too (-337 across all three, was already consistent since lesson *counting* was never ambiguous —
only the hours *conversion* per lesson was). Also this round: (1) **Pace Distribution's average
line was landing in the wrong bin entirely**, not just off-center — `avgDone` is a fractional mean
(e.g. 32.96) but bins are integer-bounded (`[31,32]`, `[33,34]`, ...), so a `>=lo && <=hi` match
left a gap no fractional value could ever land in, silently falling through to the "last bin"
fallback and drawing the line at the far right of the chart regardless of the real average; fixed
by matching against the bin's true continuous range `[lo, hi+1)`, then interpolating the exact
pixel position within that bin (the fix from the previous session only handled the second half of
this — worth re-verifying claimed fixes against real rendered output, which is exactly how this
deeper bug surfaced). Pace Distribution bars now also show the full SP name list on hover, not just
a count. (2) **Roster "today" highlight matched nothing** — `ap127AllDatesRange()` (and two sibling
helpers) parsed date strings as LOCAL midnight but serialized via `.toISOString()` (always UTC),
silently shifting every generated date backward by one day in any timezone east of UTC (Bangkok
included) — the exact bug class this project's CLAUDE.md already documents from prior `bkkToday()`/
`bkkNowMin()` incidents, just newly reintroduced in V4-only code. Fixed by parsing and stepping in
UTC throughout. Roster flight cells are now clickable (opens the same student drawer used
elsewhere). (3) **Overall Progress Bar View gained a "MASTER PLAN" reference row** (the full
96-lesson curriculum, always 100% filled, as row 0) plus finer syllabus key points beyond the 4
phase boundaries — Initial Solo (lesson 14), Instrument (15), Cross-Country (29), Sim (56),
Multi-Engine (91), and all 4 Checkride lessons (54/55/90/96) — computed dynamically from
`G.cur127`'s own lesson codes via the same decoder key as the phase classifier, not hardcoded.
Verified live end-to-end: both tabs, zero console errors, original AP127 Detail
(`js/view-cohort.js`) confirmed still byte-identical/untouched. Only file touched:
`js/view-cohort-v4.js`. Full write-up: REVAMP.md's p125 entry.) p124 (2026-08-02 — **AP127 Detail V4 — Pace Monitor clarity + Daily
Output off-days toggle**, fourth round of same-day feedback. (1) **Pace Monitor's day/month
sub-labels were asymmetric and confusing** — the "1 SP" section's bullets showed "≈ X / day"
underneath, the "28 SP" section's showed "≈ X / month" underneath, both under an identically-worded
"Hours / wk" header, so it read like two different metrics rather than the same weekly figure
broken down two ways. Fixed by having the shared `bullet()` helper always compute and show BOTH
`≈ X/day · Y/month` under every bullet (1 SP and 28 SP alike) — one consistent format everywhere,
no more guessing which section's footnote means what. (2) **Daily Output chart now includes
zero-flight days by default** — previously `byPeriod` only ever got a key for periods that had at
least one flight, so off-days were silently absent from the x-axis entirely (a quiet week looked
compressed, not idle). New `ap127v4PeriodRange()` generates the full day/week/month sequence from
the batch's first flown date to today regardless of activity; a new toggle button ("Hide off days",
off by default) switches back to the old activity-only view when a denser chart is preferred. Only
file touched: `js/view-cohort-v4.js`. Verified live: both tabs, zero console errors, toggle
re-checked both states, bullet sub-labels re-checked in both Pace Monitor sections. Full write-up:
REVAMP.md's p124 entry.) p123 (2026-08-02 — **AP127 Detail V4 — authoritative syllabus phases**,
third round of same-day feedback on the `p122` build below. Discovered the real curriculum structure
by fetching `data/syllabus.json` from the user-referenced `https://ap127-flight-training.pages.dev`
(Study > Diagram tab): 4 official phases, exact lesson-NUMBER ranges (Phase I 1-13 "Basic Flight
Training", Phase II 14-32 "Consolidation and IFR Introduction", Phase III 33-55 "Advanced VFR and
Night Flying", Phase IV 56-96 "IFR and Multi-Engine Training") plus a lesson-code decoder key
(C=Check suffix, D=Dual, S=Solo, SP=SPIC, M=Multi-Engine, G/I/N/X=activity letters). Replaced the
old prefix/substring-guessing `ap127LessonPhase()` with `ap127SyllabusPhase()` — exact, since every
lesson code ends in its curriculum lesson number (e.g. "CSPGL 36" = lesson 36) and phase membership
is a direct number-range lookup, no more inference. Applied this SAME classifier everywhere "phase"
appears in V4 — Flight Timeline dots, Roster heatmap cells, Phase Progress Funnel, and Overall
Progress — so they're now colour-consistent (previously Overall Progress used one ad hoc scheme,
Timeline/Roster another). Overall Progress Bar View rebuilt again: back to a STACKED bar per SP (one
segment per phase, up to 4), with fixed dashed boundary lines at the exact lesson numbers each phase
starts (14/33/56) — this replaces the two prior attempts (stacked-by-guessed-phase in `p121`, then
single-bar-with-approximate-milestones in `p122`) now that the real boundaries are known. Removed
the Weekday Activity Pattern chart (user's bonus-feature call, not requested). Roster: no more SP
callsign under the name, Total column now shows lesson count alongside hours ("18L · 24.7h"), day
headers show month on the first visible column of each month, cell hover text now includes flight
duration, default range dropped to 30 days (matching By-Instructor's own default), and both the
heatmap and the row/column CSS were tightened further for density. Verified live (local static
server): both tabs, zero console errors, Overall Progress boundary lines land exactly at lesson
14/33/56 as expected, Phase Progress Funnel now shows real per-phase completion (100%/92%/11%/0% at
verification time) instead of one lumped bucket. Only files touched: `js/view-cohort-v4.js`,
`css/progress.css`. Full write-up: REVAMP.md's p123 entry.) p122 (2026-08-02 — **AP127 Detail V4 follow-up round**, same day as the
`p121` build below, per direct user feedback after using the live `p121` tab. (1) **Overall Progress
Bar View reworked again** — user wanted the stacked-by-phase bars replaced with a single bar per SP
(x-axis = lesson number reached, no accumulation/stacking), colored by the phase of their last-flown
lesson (still no per-student rainbow), plus dashed vertical lines marking where the curriculum's major
stages first begin ("Initial Solo", "Multiengine" — derived from `G.cur127` in curriculum order via a
new coarse 3-bucket `ap127OverallStage()` classifier: `CM*`-prefixed = Multiengine, any `SP`/`PIC`
substring = Initial Solo, else the implicit starting stage — no line needed at position 0). A static
phase-color legend row (reusing the Timeline's dot-legend pattern) replaces the old per-dataset Chart.js
legend, since a single-dataset bar with a `backgroundColor` array can't drive one. (2) **Roster range
now goes to "All time"** — added a `value="0"` option to `#d127v4-roster-range` (same pattern as the
Pace Monitor's range select), heatmap start falls back to `batchStart` when 0. (3) **By-Instructor
list now respects the same range selector** (previously always all-time regardless of the heatmap's
range) — a `rangeFlown()`/`rangeHours()` helper filters each student's `flown` to `[start, today]`
before summing, and the section heading updates to show the active range (e.g. "By Instructor · All
time · since 20 Apr"). (4) **By-Instructor made compact** — `#d127v4-fi-roster` is now a CSS grid
(`repeat(auto-fill, minmax(310px,1fr))`, was a single flat column) with tighter row padding/font-size;
first attempt at 260px columns + wider stat-column widths truncated names to "Napon…"/"Vasap…" —
fixed by widening the grid minmax to 310px AND shrinking the 3 stat-column widths (44/44/56px, was
60/52/80px), verified live that full "First L." names render without ellipsis again. Verified live
(local static server): both AP127 Detail and AP127 Detail V4, zero console errors, phase-milestone
lines and both roster range selectors exercised. Only file touched: `js/view-cohort-v4.js` (+
`css/progress.css` for the grid/row tightening). Full write-up: REVAMP.md's p122 entry.) p121 (2026-08-02 — **New tab: AP127 Detail V4** — a full redesigned
duplicate of AP127 Detail (`js/view-cohort.js`, untouched, byte-identical) at a new sidebar entry
`cohort-v4` / `js/view-cohort-v4.js` (new file, ~1850 lines). Fixed the sticky time-slider covering
the tab title (reordered markup, `top:0` sticky toolbar) — reproduced live on the original tab first
to confirm the bug, fix applied to V4 only. Redesigned Pace Monitor (bullet-bar actual-vs-target +
headline cards, same math as original), Pace Band (histogram + smoothed curve + avg line, was a
3-band chip list), and Overall Progress Bar View (x-axis now spans the full curriculum, stacked by
curriculum phase instead of one rainbow hue per student — this also exposed and fixed, V4-only, a
real gap in `ap127LessonPhase`'s prefix-anchored regexes, which missed almost every real compound
lesson code like `CSPGL 36`/`CDXV 29` and dumped them all into "Other"). Added 4 new charts/panels:
Consecutive & Idle Streaks (shares its student-filter/color state with Actual vs Planned), Daily
Output bar+moving-average (day/week/month), Phase Progress Funnel, Weekday Activity Pattern, plus an
AP127-only Roster (day-by-day phase heatmap + instructor-grouped cumulative totals, adapted from Ops
Analytics' roster pattern) and a "Needs Attention" watchlist. Every other panel (Combined Progress vs
Plan, Batch Lead/Lag History, Actual vs Planned, Individual Lead/Lag vs Plan, Flight Timeline vs
Progress, drawer) is carried over with identical behavior. Isolation: every DOM id is
`d127v4-`/`tt-*-v4` prefixed and every `window`-exposed function carries a `...V4` key (verified by
script, not eyeballed) so both tabs' scripts coexist without clobbering each other's globals — only
files touched: `js/view-cohort-v4.js` (new), `js/shell.js`, `index.html`, `css/progress.css`. Verified
live via a local static server: both tabs exercised end-to-end (sort/search/scrubber/toggles/drawer),
zero console errors, mobile 375px checked. Full write-up: REVAMP.md's p121 entry.) p120 (2026-07-29 — **Ops Analytics follow-up whole-branch review fixes.**
A final review of the p119 follow-up round (see the p119 entry below for what that round built) found
2 Important, emergent-only issues: (1) Batch Summary's lesson-done counts drifted after visiting other
tabs — `js/view-program.js`'s `normalizeStudentDone()` mutates the same `window.NGT_CACHE` student
objects `batchSummaryRows` reads (`s.done`), verified live (AP-127: 907→949 after a Program-tab visit,
desyncing LESSONS REM. from HOURS REM.); fixed by reading `(s.flown||[]).length` instead — same array
`hoursDone` already sums, immune to the mutation, re-verified held at 907 across the round-trip. (2)
Composition strip's Sim tint broke outside the default theme — resolved via the same pre-existing
`getComputedStyle(document.documentElement)` theme-invariance limitation as the canvas charts, but this
was the FIRST theme-invariant color in this component's DOM output (previously pure CSS-var/theme-
correct). First fix attempt (`color-mix(in oklch,...)`) removed the theme-invariance but rotated hue by
up to 74° in the DEFAULT theme (AP-128 sim segment rendered magenta); switched to `color-mix(in
oklab,...)` (rectangular space, holds hue within ~2-5°), re-verified via computed-style extraction for
all 5 batches. Both fixes re-reviewed clean. Known non-blocking follow-ups (documented in `REVAMP.md`'s
p120 entry, not fixed this round): non-AP roster group ordering not alphabetical, stack-total labels
can drift ~0.1h from segment-label sum in an edge case, per-chart legend now 2× entries with only-half
toggling, growing sim/real bucket-builder duplication (candidate for a shared helper next round),
`sBatchRoster` doesn't guard a malformed (non-array) `NGT_CACHE` entry, `BATCH_ROSTER_KEY`/
`BATCH_CUR_KEY` are a second batch-identity registry that could drift from `AP_BATCH_ORDER`, and the
strip's sim tint darkens while the charts' sim tint lightens (same concept, inconsistent direction).
Only file touched: `js/view-summary.js`.) p119 (2026-07-29 — **Ops Analytics follow-up — chart fixes, Sim
split, batch-grouped roster, Batch Summary.** Six follow-up changes to the Ops Analytics tab
based on user feedback after using the live `p118` rebuild, built via a 19-task subagent-driven
plan (Tasks 13-18 code, Task 19 wrap-up: full end-to-end regression + cache-bust + docs). (1)
**Chart data-labels only rendering on hover, fixed** — `StackedBatchChart` had no `animation`
override, so the default entrance animation raced the datalabels plugin's height check; set
`animation: false`, labels now correct from first paint. (2) **Per-stack total labels** added
to all 4 charts (daily count, daily hours, weekly hours, monthly hours) via a zero-height
`TOTAL` dataset. (3) **Sim flights now included by default** (`SIMULATOR` filter defaults ON,
was off) **with a visual split** — all 4 charts + Batch Composition strip split each batch's
segment into solid (real) + lighter-tint (sim); KPI strip gained a **SIM HOURS** tile, existing
HOURS/COMPLETION/CANCELLATION/AVG H/FLIGHT tiles now report real-only. (4) **Student roster
grouped by batch** — `RosterHeatmap` gained an optional `groupOf` prop rendering a batch-header
row above each batch's students (instructor roster call site unchanged, no grouping). (5) **New
Batch Summary section** — all-time lessons/hours done vs. curriculum plan, time/lessons/hours
remaining, required pace, sourced from `window.NGT_CACHE`'s separate progress feed (not
`FLIGHTS`, so unaffected by the Effective/Block toggle); AP-128 shows an explicit "NO PLAN DATA"
row (zero entries anywhere in the feed, confirmed not a bug); narrows correctly when the header's
BATCH filter changes. (6) Confirmed correct, no change: daily/weekly/monthly hours charts
showing 0 for the most recent dates in a period (those flights are still Pending). Task 19's
full end-to-end regression pass exercised all six together on one fresh load — zero console
errors, no integration issues found, no code fix needed. Only file touched: `js/view-summary.js`.
Design: `docs/superpowers/specs/2026-07-29-ops-analytics-followup-design.md`; plan:
`docs/superpowers/plans/2026-07-29-ops-analytics-followup.md`.) p118 (2026-07-29 — **Ops Analytics whole-branch review fixes**, same feature as the `p117` entry immediately below. A final whole-branch review (12 tasks had each individually passed review, but the whole ~955-line file together exposed 5 issues no single task's diff showed) found: (1) `<FocusControls/>`'s ONLY toggle was a no-op — `filteredFlights` never read `hideOthers`/`highlightAP127`; fixed to mirror `view-gantt.js`/`view-weekly.js`'s existing pattern. (2) STATUS=Standby matched zero flights (Standby is `f.isStandby`, not a `f.status` value) — fixed to OR against the flag, matching `shared.js`'s own convention. (3) Batch Composition strip rendered invisible slivers with no explanation whenever the filtered set had flights but zero completed hours; added an explicit empty state. (4) Chart data-label text was hardcoded near-black, illegible in light/warm themes; now resolves from `--bg` (note: this — like every `getComputedStyle(document.documentElement)` color read in the app, a pre-existing pattern — is still theme-*invariant* in practice, since `body[data-theme]` overrides never reach `document.documentElement`; a real per-theme fix needs a codebase-wide change, tracked as a known follow-up, not attempted here). (5) `RosterHeatmap` resolved a cell's color even when unused (zero-value cells) — tens of thousands of wasted `getComputedStyle` calls at a 90-day period; moved inside the `v > 0` branch. Also cleaned up: stale internal "(Task N)" comments, a dormant `BreakdownTable` leave-badge lookup bug (querying person-keyed `leavesOnDate()` with a batch name — the pre-rewrite file guarded this, the port dropped the guard, restored), and hoisted 3 inline-per-render subcomponents to stop needless remounts. Fix re-reviewed clean (0 critical/important). Still open, deliberately not fixed this round: the `document.documentElement` theme-invariance issue described above (codebase-wide, predates this feature); the all-time cumulative tables intentionally don't honor the AP-127 ONLY toggle (they're period/filter-invariant by design — batch-governed for students, instructor-governed for instructors); minor chart/roster duplication noted in the whole-branch review as a follow-up refactor candidate, not blocking. Only file touched: `js/view-summary.js`. Full findings: whole-branch review + fix verification transcripts in this session; spec/plan unchanged from the `p117` entry below.) p117 (2026-07-28 — **Ops Analytics tab full revamp — batch-centric KPIs, composition, 4 charts, rosters.** Replaced the old donut-chart + 3-table Analytics layout entirely with a period-filterable, multi-dimension analytics tab, built via a 12-task subagent-driven plan (Tasks 1-11 code, Task 12 wrap-up). New tab: header with 14D/30D/90D/CUSTOM period presets + Block/Effective metric toggle; collapsible filter panel over 6 dimensions (status/batch/instructor/student/aircraft-type/simulator); 13-tile KPI strip (counts per status, hours, completion %, cancellation %, avg h/flight, batch count, student count, AP-127 share); batch composition strip (segmented bar + legend); 4 stacked bar charts (`StackedBatchChart` — daily count, daily hours, weekly hours, monthly hours — each with per-segment data labels and a legend that toggles batch series); batch breakdown table; and student + instructor rosters, each a day-by-day activity heatmap (`RosterHeatmap`, click a cell → drawer) plus an all-time cumulative summary table (`CumulativeTable`, click a row → drawer) that is deliberately period-invariant — it reflects full history regardless of the header's date range (batch-grouped for students, flat for instructors). Mobile-verified at 390px: KPI strip → 3 columns, chart grid → 1 column, filter panel → 2-column stack with no overlapping text, both roster heatmaps scroll horizontally within their own container with zero page-level horizontal overflow — no code fix was needed. Only file touched: `js/view-summary.js` (full rewrite, ~955 lines). Full design: `docs/superpowers/specs/2026-07-28-ops-analytics-revamp-design.md`; task-by-task implementation history: `docs/superpowers/plans/2026-07-28-ops-analytics-revamp.md`.) p116 (2026-07-27 — **Full-view audit + 6 fixes, same day as the KPI-inflation fix below.** User: "go through all tab and functions, verify all system if it working correctly, suggest improvement." Exercised all 17 views live — zero console errors, every KPI reconciles against the raw feed. Found and fixed: (1) **`ap127-data-api` CORS was hardcoded to one origin** (`ALLOWED_ORIGIN` var = DB_Share only), so CMDV2's AND CMDV3's own live progress fetch always failed with a browser CORS error and silently fell back to the snapshot — the header's `⚠` next to PROG was therefore *permanent*, not an intermittent fault. New home for the worker source at `AP127_NGT_001/data-api/` (previously undocumented-in-repo, deployed ad hoc); switched to the same reflect-if-allowlisted `ALLOWED_ORIGINS` pattern the watchdog worker already uses (`ap127-ngt2.pages.dev` + `ap127-v3.pages.dev` + `ap127-dashboardr1.pages.dev`, default falls back to DB_Share — never a wildcard). Verified live: all three origins now get 200 + a matching CORS header; the `⚠` is gone. (2) **`OTHER` batch-type chip could never reveal blank-batch flights** (e.g. `KEY PERSONNEL MEETING`, `batch:""`) — `view-schedule.js`'s whitelist builder used `.filter(b => b && …)`, and an empty string is falsy, so it was dropped before ever reaching `filters.batches.includes(x.batch)`. Changed the guard to `b != null` (only `''` needs to survive, not `null`/`undefined`). Verified: selecting only OTHER now shows all 3 meeting rows alongside FAM FI. (3) **New "PUB" header chip** — how many days forward the Ops Portal has actually PUBLISHED (distinct from fetch freshness), because that number silently swings 0–8 days depending on what the academy has posted, and nothing in the UI ever said so; traced 30 days of history and found it decaying 3→2→1→**0** with Weekly/Roster/Slot Finder just quietly having less to show, indistinguishable from a slow day. New `scheduleCoverage` in the app context (`shared.js`), rendered via `CoverageChip` in both the desktop top bar and the mobile sidebar (`shell.js`). (4) **Board's TOTAL tile now flags when a filter is hiding flights** — e.g. `TOTAL 22 · of 30 total` when the default AP-only TYPE filter is active; computed against the unfiltered same-day count in `view-board.js`, shown via a new `hint` prop on `StatHero`. (5) **CF Usage's key gate had zero context** — it said only "Watchdog API key:" with no explanation of what the key was, where to get it, or that it's the SAME key as the Watchdog tab (`localStorage['wd-key']`, shared). Rewrote the panel to say so explicitly. (6) **Watchdog Notification Log rendered every row unvirtualized** — measured 8,579 rows / ~60,000 DOM nodes in one view for a busy month, by far the heaviest thing in the app. No virtualization lib is loaded (this project is deliberately no-build/CDN-only), so added plain pagination (`LOG_PAGE_SIZE=100`, Prev/Next, resets to page 1 on search) — verified via a mocked 8,579-row fetch that only 100 `<tbody>` rows ever mount (827 total DOM nodes, down from ~60,000). (7) **Accessibility landmarks** — the whole app had no `<main>`/`<nav aria-label>` beyond a bare `<div id="root">`; added both, plus `aria-current="page"` on the active sidebar item. Files touched: `js/shared.js`, `js/shell.js`, `js/view-board.js`, `js/view-schedule.js`, `js/view-cf-usage.js`, `js/view-watchdog.js`, `AP127_NGT_001/data-api/worker.js` (new), `index.html`. **Also shipped in this same `p116`:** **fixed duplicate flight rows that inflated every view and every hours KPI.** Found during a full-ecosystem verification sweep, not user-reported. Two independent sources, both live: (1) `attachCancelDetails()` pushed one synthetic `CANCEL_<bookingId>` row per `cancellations[]` *record*, but upstream emits one record per cancel **event** (its `id` embeds a submission timestamp), so re-cancelled bookings duplicated — 5 bookingIds → 6 phantom rows, 3 AP-127, one rendering 3×. Now collapses to the most recent record per `bookingId`; and a real `flights[]` row always wins over synthesizing a virtual, whatever status it currently reads (during a scraper flap it can still say `Pending` while the Cancel Record is submitted — the frontend counterpart of the watchdog's `stabilizeCancelledFlights()`). (2) New `dedupeIdenticalActuals()` removes 67 rows where the SAME flight was ingested twice as two `ACTUAL_ONLY` rows under different `_ACT_<n>` ids — the pre-existing dedup pass only removes *planned* rows, so these double-counted block hours. Guarded on a non-empty student **on purpose**: studentless `MEETING`/`KEY PERSONNEL MEETING` bookings legitimately repeat at the same time and must NOT collapse (all 26 preserved; the 13 remaining same-signature rows are exactly those, each with a distinct id). Verified by replaying both preludes over one live feed: rows 3806→3733, AP-127 inflation **0.67%→0%** (1337.9→1328.9 h), today's numbers byte-identical (30 rows / 52.0 h / AP-127 7 flights / 5.0 h) — the correction is entirely historical. Root cause is upstream and frozen: 425 of the 427 raw redundant rows are on dates ≤2026-07-09, i.e. inside `flight_schedule.pre_migration_archive.json`, which is re-applied as an override every run and so can never self-heal. **Still open, deliberately not fixed:** 60 ids map to genuinely *different* flights (worst `ACTUAL_ONLY_`, empty suffix, 21 rows) — upstream id-generation bug; all 206 such rows are 2026-05-05→2026-06-10, outside the watchdog's snapshot window, so notifications are unaffected.) p113 (2026-07-26 — **Schedule: fixed invisible cancelled flights, flight-card detail, Calendar leave enrichment.** Cancellations that only exist in the separate `cancellations[]` feed (no matching row in `flights[]`) were invisible in Board/Weekly/Calendar — confirmed via a real report (Napon S., CDXV 29, 2026-07-27) that self-healed mid-investigation once CMD_CTR's own new Timeline "Canceled mode" scrape started backfilling it with the real time; a second, stable example (VASAPHON S., CDGL 02, 2026-05-05) was used for the actual fix. New `attachCancelDetails()` in `shared.js` backfills `cancelReason`/`cancelRemarks` (fallback only, never overriding a pipeline-set value) and synthesizes a `_noTime` virtual flight for any still-unmatched cancellation, so every Schedule view shows it via the shared `FLIGHTS` array (Gantt correctly still skips it — no time to draw a bar with). Flight Drawer gains CANCEL REASON/REMARKS, NO TIME LOGGED, and BLOCK OFF/ON (previously-unused fields). New `leaveDetailOnDate()` (sibling to unchanged `leavesOnDate`) feeds the Calendar day panel's leave rows with duration/note/role, not just a bare reason. See `docs/superpowers/specs/2026-07-26-schedule-view-improvements-design.md`.) p112 (2026-07-17 — **ASF rank-data primary URL repointed** to `https://ap127-db001.pages.dev/cache.json`; the old primary `ap127cmd.github.io/DB001/cache.json` froze 2026-06-03 when DB001's Pages deploy job was removed — it still 200s with June data so the fallback never fired and ASF rankings ran on 6-week-old progress. Same fix in `ops/js` (`r41`) and CMD_CTR (`r44`). Also same day: leaves/resources/instructors feed restored upstream — see CMD_CTR/CLAUDE.md.) p111 (2026-07-04 — Watchdog Destinations batch picker now a live checkbox grid over every real batch in `window.FLIGHT_DATA` (fixes gaps like `TCAR`/`TCAR CONV`/`RECURRENT` casing/`TCAR / LPC` spacing that hardcoded presets missed) + Notification Log rows are now clickable → `LogDetailModal` with full flight detail + diff. p110 — Watchdog log search + sticky header + studentFilter per-destination; p109 — fixed Gantt NOW-line to use true Asia/Bangkok time via `Intl.DateTimeFormat` regardless of viewer's device timezone; `bkkNowMin()` moved from `view-gantt.js` into `shared.js`, same fix class as `p95`/I1's `bkkToday()`). p108 (2026-06-26 — Fleet Load Distribution now hides zero-hour tails when filtered, matching heatmap roster; `visEntries` filter). p107 (2026-06-26 — Effective metric mode for Utilization/FI Stat/SP Stat). p106 (shared.js strips "(Unplanned)" project-wide). p105 (FI Stat + SP Stat sub-tabs). p104 (Utilization: AP127 toggle + zero-row hiding). Next → `p110`. **Watchdog (2026-07-27) — fixed ADDED+Canceled misclassifying as "New flight" (122 tests):** Direct fallout from the stabilization fix immediately below, caught live by the user minutes after that deploy: a genuinely cancelled flight (Napon S., CDXV 29) notified as "✈️ New" with no hint it was a cancellation. Cause: once a cancelled booking's tracking is lost (the upstream flap outrunning the KV persist-only-on-change gate) and later rebuilt, it correctly fires as a fresh `ADDED` event — but with `flight.status` already forced to `Canceled` by `stabilizeCancelledFlights()`. This combination was previously impossible (a flight only ever became Canceled via a `STATUS` transition on an already-tracked id, never fresh via `ADDED`), so two places never anticipated it: `telegram.js`'s `classifyForGrouping()` special-cased `ADDED`+Completed but not `ADDED`+Canceled, falling through to the "new" bucket; `diff.js`'s `attachCancelReasons()` had the same gap, so the reason/remarks wouldn't even have joined. Both now key off `flight.status === 'Canceled'` for the ADDED case, mirroring the existing ADDED+Completed pattern. Verified against the exact real incident scenario through the full pipeline. Redeploy: `cd watchdog && npx wrangler deploy`. **Watchdog (2026-07-27) — stabilized against upstream feed flakiness, fixes real duplicate-notification storm (119 tests):** User reported "lots of back and forward duplicated notice" for cancelled flights. Confirmed via the watchdog's own `/log`: 3 live bookings each fired REMOVED-then-ADDED **9 times in one day**, each carrying a full cancel-reason notice. Root-caused via the upstream CMD_CTR feed's own git history (cloned the repo, walked 37 consecutive commits) — not guesswork: `flights[]` itself flaps a cancelled booking's presence in/out across scrapes (~5-10 min apart) while its `cancellations[]` record stays put the whole time. This is a known, only-partially-mitigated scraper race documented in CMD_CTR's own `scripts/fetch_schedule.py` (`recover_vanished_bookings()`, "kept as a safety net for if that Canceled-mode fetch itself fails for a run" — see CMD_CTR's p113 same-issue-class fix from the day before). Confirmed `cancellations[]` membership only ever gains, never loses (sampled all 37 commits) — so it's a stable source of truth. New `diff.js:stabilizeCancelledFlights(newSnap, prevSnap, cancellations)`: any cancelled bookingId present this pull gets status forced to `Canceled`; any cancelled bookingId absent this pull but known from a prior snapshot gets carried forward (status forced `Canceled`) instead of vanishing. Wired into `index.js` right before `diffSnapshots()` and before the KV persist, so the correction sticks across runs. **Verified by replaying the actual 37 real upstream commits from the incident window through old vs. new pipeline: 39 spam events → 4 (3 of which are trace-window-start artifacts; a continuously-running watchdog reduces to 1 clean notification per booking).** No frontend/pNN change. Redeploy: `cd watchdog && npx wrangler deploy`. **Watchdog (2026-07-26) — notification format redesign + cancel reason/remarks (111 tests):** Real-user report: the combined-message format's packed lines (up to 58 chars, e.g. time+tail crammed with " · ") wrapped mid-arrow on a phone screen — "line-cut". Redesigned iteratively via the visual-companion browser mockup (phone-width simulation): every SP line now leads with its group's type emoji (❌/⚠️/🔄/✈️/✅) so an entry self-labels even mid-chunk-split; context line (`lesson · 🗣️ FI · 📅 date`) drops any field that changed (promoted to its own line instead, never shown twice); **every fact/change is now its own `- {icon} ...` dash-bulleted line** instead of packed onto one line — eliminates the wrap; `🆕` moved to sit directly before the NEW value inside each arrow (`08:00–09:30 → 🆕 08:30–10:15`), never as a line prefix. Completed drops the words "planned"/"flew" (icon alone: `⏰` then `✍️`) and never shows `🆕` (factual record, not a change); actual-data split into `🛬` (T/O·LDG counts) and `🕘` (clock times + INST). **New: cancel reason + free-text remarks** — confirmed live these are NOT inline fields on the flight record, they live in the feed's separate `cancellations[]` array (mirrors `leaves[]`), joined by `bookingId`. New `diff.js:attachCancelReasons()` (pure, tested) does the join; wired into `index.js`'s pipeline (reads `data.cancellations`, already in the parsed feed, no extra fetch). Renders as `- 📝 <reason>` (categorical) + `- 💬 <remarks>` (free text, English or Thai — verified against real live records, e.g. "MFD does not sync + Ecu back-up unsafe light..."). No frontend/pNN change (backend worker only). Redeploy: `cd watchdog && npx wrangler deploy`. **Watchdog (2026-07-26) — detect same-id student/batch reassignment, then closed both residual gaps same day (97 tests):** Real incident: a flight for Anusorn T. (07-27) got "New flight" + "Flight updated" notices, then vanished with **zero** cancellation notice. Root-caused via CMD_CTR's own git history (not guesswork): the upstream source reused the SAME flight id for a totally different booking — different student (ANUSORN T.→PARAMUTT C.) AND batch (AP-127→AP-126) — instead of issuing a new id. `student`/`batch` were never in `TRACKED`, so this looked like one ordinary `CHANGED` event attributed only to the new owner; the old owner's flight silently disappeared, and even the old batch's Telegram group never saw it (routing keys off the event's — now new — batch). Fix in `diff.js`'s `diffSnapshots()`: a same-id student/batch change now synthesizes **REMOVED** (old owner, `diff.reassignedTo: {student,batch}`) + **ADDED** (new owner, `diff.reassignedFrom`) instead of one `CHANGED` — both sides get notified, each routes correctly. `telegram.js` renders a `↪ reassigned to/from <student> (<batch>)` line so the cancelled side knows who replaced them. Verified end-to-end against the real incident data (both AP127 group and a personal-DM destination now correctly receive the cancellation). **Same-day follow-up, both now fixed (user said "just fix it" rather than wait for live evidence):** (1) `TRACKED` gains `type`, `cond`, `isSim`, `isStandby` — these could also change unnoticed, same class of gap as the reassignment bug (though this specific pair wasn't caught live the way the reassignment was). `durMin`/`duration` deliberately excluded — derived from start/end, would just repeat that diff. Message rendering updated too (detection alone isn't the fix): `type`/`cond` show as `old→new` arrows, `isSim`/`isStandby` as plain words (`now SIM` / `no longer STANDBY`), not raw booleans. (2) `suppressActualPairs()` in `diff.js` now keys by `student|lesson|date` (was `student|lesson` only) — a student can legitimately attempt the same lesson code on more than one date, and without `date` a genuine cancellation could be wrongly swallowed by an unrelated same-tick Completed event sharing student+lesson on a different date. Regression-tested: the genuine same-date pair still suppresses correctly. **Watchdog (2026-07-25) — combined per-run notifications (spec: `docs/superpowers/specs/2026-07-25-watchdog-combined-notifications-design.md`):** Replaced the individual-message-or-summary split with a single mode: **every run sends one combined, fully-detailed message per destination**, `@mention`s every matched SP every time (fixes the 2026-07-21 outage-catch-up gap where a 26-event burst went out as one anonymous summary with zero mentions). Events group by urgency (❌ Cancelled → ⚠️ Changed → 🔄 Status update → ✈️ New → ✅ Completed, empty groups omitted), sorted by flight time within each group. Time is now **always** shown as a full `start–end` range (never a bare start), and a time change shows the full old range → full new range together. **Completed** flights now show full actual-flight data: touch-and-go count (`N T/O · N LDG`), actual clock times (`TO HH:MM · LDG HH:MM`, collision-distinct from the count label), and `INST N` (only when non-zero) — sourced from new display-only fields on `diff.js`'s `buildSnapshot()` (`to`/`ldg`/`tkoff`/`ldgTime`/`inst`, deliberately NOT added to `TRACKED` so they never themselves fire an event). Splits into multiple `(n/total)` messages only if content would exceed Telegram's 4,096-char hard limit (two-pass build: bodies first, headers once the total is known) — a typical mixed-event run stays well under one message, a 30-event all-Completed synthetic test confirmed correct multi-chunk splitting with the group header re-shown in each chunk. `formatMessage()`/`formatSummary()` and `MAX_SENDS_PER_DEST` are removed, replaced by `telegram.js`'s `buildCombinedMessages()`. 79 watchdog worker tests (up from 71 — see the spec for the full before/after; the separate `watchdog-monitor` package's 15 tests are unaffected by this change). No frontend/pNN change (backend worker only). Redeploy: `cd watchdog && npx wrangler deploy`. **Watchdog (2026-07-17) — completion label fix + dead-man's-switch monitor (81 tests):** (1) **In-place completion no longer mislabeled "Flight updated".** The newer feed completes many flights IN PLACE (plain id: `Pending→Completed` AND planned times replaced by actual flown times in one tick — 1058 such records live, alongside the older 2570 `ACTUAL_ONLY_*` add pattern). That 3-field diff `{start,end,status}` used to classify as `CHANGED` → "⚠️ Flight updated". Fix in `diff.js`: **any diff touching `status` is a `STATUS` event** (status is the headline), regardless of co-changed fields. `telegram.js` renders `STATUS`+`Completed` (from ADDED or in-place) as "✅ Flight completed" and, when actuals were recorded, adds `🕐 planned HH:MM–HH:MM → flew HH:MM–HH:MM`. A status change bundled with a reschedule/cancel now shows "🔄 Status update" with the co-changed detail appended (via new `changeDetailLines()`), never buried as "Flight updated". No frontend/pNN change (log types unchanged: ADDED/REMOVED/CHANGED/STATUS). (2) **New sibling worker `ap127-watchdog-monitor`** (`/Users/nugui/AP127_V2/watchdog-monitor`, own `*/10` cron, shares KV under `monitor:*`) — the long-recommended dead-man's-switch. Independent isolate, so it survives the watchdog's silent CPU-hard-kill. **Reads the watchdog's own `watchdog:status` directly from shared KV — NOT an HTTP call** (a same-account Worker→`*.workers.dev` fetch is blocked by CF error 1042; and a CPU-killed watchdog stops WRITING KV, so a frozen `lastRun` >30 min is the truest death signal). Two consecutive unhealthy checks (~20 min, tolerates one blip) → ONE Telegram alert; recovery → one all-clear. Alerts on transitions only (KV `monitor:state`). Reuses the watchdog's own config for the target chat (admin 'Nu' destination by default — no new chat-id needed). **Needs one manual step: `cd watchdog-monitor && npx wrangler secret put TELEGRAM_BOT_TOKEN`** (copy value from the main worker) — until then it observes but can't send. Redeploy: `cd watchdog-monitor && npx wrangler deploy`. **Watchdog (2026-06-23):** `telegram.test.js` — added missing SP `@username` assertion to `STATUS → Canceled` test; all 6 notification types now verified. Implementation was already correct; test coverage gap only (no deploy needed). **Watchdog (2026-07-14) — robustness hardening pass (66 tests):** (1) **Rolling actionable filter** `isActionable()` (flight date ≥ today Bangkok) replaced the fixed `NOTICE_CUTOFF_MS` (went stale, let 2-day-old flights notify); separate from the snapshot window. (2) **Bad-feed guard** `isAnomalousDrop()` holds a run (no snapshot write/notify) on a sudden >50% flight-count drop (truncated/empty feed), up to 3 runs then accepts. (3) **Day-sharded logs** (`watchdog:log:YYYY-MM-DD`) — the change that makes CHANGE runs safely under CPU budget (was R-M-W'ing a 1.5 MB month blob); `getLog` merges via `KV.list()` + legacy blob/shards. (4) **Skip-on-unchanged** `extractFeedSig()` (fetchedAt+length) skips the 1.4 MB parse when the feed is byte-identical. (5) **Bounded sends** `planNotifications()` caps each dest at `MAX_SENDS_PER_DEST`=8, else one summary (wall-clock guard for mass changes / AP127 re-enable). (6) `/status` adds `staleMinutes`+`healthy`+`feedSig`+`anomalyStreak`. Deploy needs a windowed baseline written to KV first. **Watchdog (2026-07-14) — window bounded both sides** (`SNAPSHOT_LOOKBACK_MS`=3d / `SNAPSHOT_LOOKAHEAD_MS`=14d); Free plan confirmed (can't raise `cpu_ms`), so no daily full-history check. **Watchdog (2026-07-13):** fixed recurring **"Exceeded CPU Limit"** silent death — the scheduled run was hard-killed every tick (cron fired, but the run exceeded CPU budget before notifying/erroring, so `/status.lastError` stayed null while notifications silently stopped). Cause: parsing the full ~1.4 MB feed (4222 flights, 3 mo history) + ~1.1 MB snapshot every run as data grew. Fix in `watchdog/src/index.js`: `withinSnapshotWindow()` restricts snapshot/diff to a rolling forward window (today−2 d) → snapshot ~95 % smaller (1.1 MB→50 KB), CPU capped. Diagnose with `npx wrangler tail` (shows `"*/5 * * * *" - Exceeded CPU Limit`); a plain redeploy gives a temporary fresh isolate. **NOTE:** `/status` legitimately looks stale up to **25 min** even when healthy (status-write skipped on quiet ticks) — only a >30 min gap = real death. 45 watchdog tests. Dead-man's-switch monitor still unbuilt (recommended).

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

## Master reference
Full architecture, deploy steps, secrets: https://ap127-docs.pages.dev  (§2.4)
