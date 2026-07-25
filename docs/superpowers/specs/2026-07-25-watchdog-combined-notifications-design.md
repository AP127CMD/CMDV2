# Watchdog — Combined Per-Run Notifications

**Date:** 2026-07-25
**Status:** Approved

---

## 1. Overview

Today, the Watchdog sends one Telegram message per changed flight, unless a single run
matches more than `MAX_SENDS_PER_DEST` (8) events for a destination — in which case it
sends **one counts-only summary with zero student mentions and zero detail** instead.
This guard exists to protect Cloudflare Workers wall-clock budget (each send is followed
by a 3.5s pause to respect Telegram's rate limit), but it has a real cost: during any
burst above 8 events — a mass reschedule, or an extended outage catching up — **no SP is
notified about their own change**. This happened for real on 2026-07-21: a 19-hour
watchdog outage recovered and diffed 26 events in one run, all of which went out as a
single anonymous "26 flight updates" summary instead of reaching the affected students.

This spec replaces the two-mode (individual-or-summary) send strategy with a single
mode: **always build one combined, detailed message per destination per run**, chunked
only when Telegram's 4,096-character hard limit requires it. Every SP with a change in
their concern gets `@mentioned` in every run, regardless of batch size — while cutting
the number of Telegram API calls (and their 3.5s pauses) from up to dozens per run down
to typically one, which also reduces the wall-clock exposure that has historically
correlated with the Worker's CPU-hard-kill failures during mass-change runs.

**Explicitly not in scope:** this doesn't touch Cloudflare KV usage. KV writes are
driven by `watchdog:status`/`watchdog:snapshot`/`watchdog:log`, not by Telegram send
count — this change is about Workers wall-clock/CPU budget and Telegram rate-limit
safety, a different resource than the KV write ceiling addressed separately (see
AP127_Docs §10, 2026-07-17).

---

## 2. Message format

### General event (ADDED / REMOVED / CHANGED / STATUS-non-completion) — 2 lines

```
⚠️ AKARAVIT K. (@handle) — CDGL 05 · FI FI-X
   10 Jul  08:00–09:30 → 08:30–10:15 · HS-NGT→HS-TPT
```

Rules:
- Time is **always** the full `start–end` range, never a bare start time.
- On a time change, show the full **old range → full new range** side by side — never a
  bare `08:00→10:00` (ambiguous about whether start or end moved).
- FI is always shown (previously present on every per-event message; carried forward).
- Only the fields that actually changed are appended after the time (tail, instructor,
  lesson, date) — same diff-rendering logic as today's `CHANGED` case, just inlined.

### Completed — 3 lines, full actual data

```
✅ RATTANASUDA — LPC SEP · FI WUTTHICHAI L.
   17 Jul  planned 08:30–10:10 → flew 08:34–09:58 · HS-TPX
   T/O·LDG 1·1 · Actual T/O 08:34 · Actual LDG 09:56
```

Field source and conditional display (labels match `AP127_V3/src/components/FlightDrawer.tsx`
for consistency with the rest of the ecosystem):
| Field | Source | Shown when |
|---|---|---|
| Planned → flew time | `diff.start`/`diff.end` (existing) | Always if the flight had recorded actuals differing from planned |
| Aircraft (tail) | `flight.tail` (existing) | Always |
| `T/O·LDG` | `flight.to` / `flight.ldg` (**new** — not currently in `buildSnapshot()`) | When either is present and non-zero |
| `Actual T/O` / `Actual LDG` | `flight.tkoff` / `flight.ldgTime` (**new**) | When present and not `"00:00"` (~72% of records; older entries lack these fields) |
| `INST` (instrument time) | `flight.inst` (**new**) | Only when non-zero (~18% of completions — showing it always would be mostly noise) |

`airborne`/`airborneMin` is **not** shown — per the ecosystem-wide rule (`FlightDrawer.tsx`,
`AP127_V3/CLAUDE.md`), airborne time is display-only and never part of any hours
figure; omitting it from the notification avoids any appearance that it factors into
logged hours. If a future request wants it shown, it must carry the same
"display only" framing V3 already uses.

### Header

Each message (or each chunk, if more than one is needed) starts with:
```
📋 AP127 — 12 updates
```
or, when chunked:
```
📋 AP127 — 12 updates (1/2)
```
Always present, even for a single-event run (e.g. `📋 AP127 — 1 update`) — consistent,
predictable, no special-cased "single event" formatting branch.

---

## 3. Grouping and sort order

Events are grouped by urgency, not raw event type, then sorted by flight time within
each group:

1. **❌ Cancelled** (`REMOVED`, or `STATUS` → `Canceled`) — most disruptive, SP may need
   to replan immediately
2. **⚠️ Changed** — time/tail/instructor/lesson moved, SP needs to adjust
3. **🔄 Status update** (non-completion, non-cancellation — e.g. reinstated/on-hold)
4. **✈️ New** (`ADDED`, non-completion) — informational, not urgent
5. **✅ Completed** — already happened, least time-sensitive, listed last

A group with zero events is omitted entirely (no empty `⚠️ Changed` header with nothing
under it).

---

## 4. Chunking (Telegram's 4,096-char hard limit)

Verified against Telegram Bot API docs (`sendMessage` `text` parameter): **4,096
characters**, UTF-8. Exceeding it is rejected outright by Telegram — this is not a soft
guideline.

Revised capacity estimate now that Completed lines carry full actual data (~180–220
chars for 3 lines) vs. the earlier ~100-char estimate for a compact 2-line format:
- **Worst case** (every event a Completed with full actuals): **~18 events per message**
- **Typical mix**: 35-40+ events per message

Algorithm: build the message text incrementally, group by group, event by event. Before
appending the next event's block, check if doing so would push the current chunk past a
**4,000-char budget** (leaving headroom for the header/footer). If so, close the current
chunk, start a new one with the same header (updated page indicator), and continue. This
adapts to the actual mix of event types in a given run rather than assuming a fixed
event count — a run of all-Completed events chunks sooner than a run of all-Cancelled
events.

Even yesterday's 26-event outage-catch-up would very likely have fit in a single message
under typical mixes; multi-chunk sends remain a rare safety net, not the common case.

**Two-pass construction** (resolves the `(n/total)` header dependency): the total chunk
count isn't known until all events have been walked, so `buildCombinedMessages()` first
builds the chunk **bodies** (grouping + cut-on-budget, no headers), then — once the
final count is known — prepends each body with its finalized `📋 AP127 — 12 updates
(n/total)` header (or the no-suffix form when `total === 1`). This is a pure two-pass
function, no network calls involved, so the extra pass has no meaningful cost.

---

## 5. Architecture changes

**`watchdog/src/diff.js`:**
- `buildSnapshot()` gains new non-tracked fields on the stored snapshot entry: `to`,
  `ldg`, `tkoff`, `ldgTime`, `inst`. These are **display-only** — deliberately **not**
  added to `TRACKED` (diff.js:1), so they never themselves trigger a `CHANGED`/`STATUS`
  event. They ride along on whatever event a flight's `status`/`date`/etc. transition
  already produces (most commonly the `Pending→Completed` `STATUS` event this whole
  system was built around).

**`watchdog/src/telegram.js`:**
- **Remove** `formatMessage()` and `formatSummary()` — confirmed (via grep) nothing
  outside the send loop calls either; the `/test` endpoint builds its own inline string
  independently and is unaffected.
- **Add** `buildCombinedMessages(destLabel, events, roster)` → `string[]`. Groups by
  urgency (§3), sorts by time within group, renders each event's compact block (§2),
  and chunks at the character budget (§4). Returns one or more ready-to-send strings.
  Callers only ever pass a non-empty `events` array — `planNotifications()` already
  excludes destinations with zero matched items (index.js:156) before this is called,
  so `buildCombinedMessages()` doesn't need an empty-input branch.
- **Add** a small per-event line-renderer (internal helper, not exported) used by
  `buildCombinedMessages` — replaces the old per-type branching in `formatMessage()`.

**`watchdog/src/index.js`:**
- `planNotifications()` (index.js:146) drops the `summarize: boolean` field and the
  `MAX_SENDS_PER_DEST` threshold check entirely — it now only does what its name says:
  match events to destinations by batch/student filter. The constant `MAX_SENDS_PER_DEST`
  is removed (superseded by the char-budget chunking in `telegram.js`).
- The send loop (index.js:245-260) simplifies: for each destination's matched items,
  call `buildCombinedMessages()`, then send each returned chunk with the existing 3.5s
  inter-message delay (now only between chunks or between destinations, not per-event).

**Not changed:** `log.js`, the `/status`/`/config`/`/log`/`/test` HTTP endpoints, the
CMDV2/V3 Watchdog admin views (they consume `/log` and `/config`, unaffected by how
Telegram messages are composed), the anomaly/bad-feed guard, the CPU-budget snapshot
window, and `suppressActualPairs()`.

---

## 6. Testing

- **`telegram.test.js`**: new test suite for `buildCombinedMessages()` —
  - grouping order (Cancelled → Changed → Status → New → Completed), groups with zero
    events omitted
  - time always rendered as a full range; a time change shows full-old-range →
    full-new-range
  - Completed: `T/O·LDG`/`Actual T/O`/`Actual LDG`/`INST` each independently present
    only when their source field is non-empty/non-zero/not `"00:00"`
  - chunk-splitting: a synthetic run large enough to exceed the char budget produces
    multiple chunks, each under 4,096 chars, each with a correct `(n/total)` header
  - single-event run still gets the standard header (`— 1 update`)
- **`diff.test.js`**: update `planNotifications` tests to drop `summarize`/
  `MAX_SENDS_PER_DEST` assertions (removed contract); add coverage for the new
  `buildSnapshot()` fields being carried through without affecting `TRACKED`-based
  event classification (a flight whose `to`/`ldg`/`inst` differ but no `TRACKED` field
  changed still produces zero events).

---

## 7. Rollout

No KV schema migration needed — `to`/`ldg`/`tkoff`/`ldgTime`/`inst` are read from the
live feed on every run, not persisted snapshot-to-snapshot in a way that requires
backfill. Deploy is a plain `wrangler deploy`; the very next scheduled run uses the new
format. No config/destinations changes required — existing `roster`/`destinations` KV
config is reused unchanged for `@mention` resolution.
