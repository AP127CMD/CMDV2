# AP127 CMDV2 — Time Travel Design Spec

**Date:** 2026-06-25  
**Feature:** AP127 Detail time travel — view all progress data as of any past date  
**File affected:** `js/view-cohort.js`  
**Next version token:** `p101`

---

## 1. Goal

Let users scrub backwards through time on the AP127 Detail view. Every chart, KPI, table row, and panel updates to show the state of the batch as of the selected date. Default is live (today).

---

## 2. Core Mechanism

### State variable
```js
let COHORT_AS_OF = null;  // null = live (real Bangkok today)
```

### Helper function (replaces all inline `ap127TodayBKK()` calls in render scope)
```js
function ap127AsOf(){ return COHORT_AS_OF || ap127TodayBKK(); }
```

### Functions updated (9 targeted swaps — `ap127TodayBKK()` → `ap127AsOf()`)
| Function | What changes |
|---|---|
| `renderAP127Detail` | `today0` and `today` locals |
| `renderAP127Pace` | `today` local at top |
| `buildAP127Timeline` | `today` local |
| `buildAP127RaceChart` | `today` local |
| `buildAP127CombinedChart` | `today` local |
| `buildAP127HistBatch` | `today` local |
| `buildAP127HistSolo` | `today` local |
| `setAP127RaceMode` | `maxD` computation |
| `buildAP127OverallChart` | `ap127PaceSort` call (sort order as-of date) |
| `openAP127Drawer` | `today` local (idle days, "flew today" dot) |

### Not changed
`ap127TodayBKK()` itself is not modified. Calls outside render scope (e.g. initial data load) stay as-is.

---

## 3. UI — Sticky Scrubber Bar

A slim sticky bar inserted at the top of the `.d127-wrap` content area (below the main app nav, above the AP127 PROGRESS title). Stays visible while scrolling.

### Structure
```
[◀] ─── Apr '26 ──────── May '26 ──────── Jun '26 ─── [LIVE ▶]
                                    ↑
                             25 Jun 2026
```

- **Track**: Full-width horizontal bar. Click anywhere to jump playhead.
- **Playhead**: Draggable vertical line with a date chip label above it.
- **Month ticks**: Auto-generated from `batchStart` to `today` at month boundaries.
- **LIVE badge**: Right end. Highlighted (green) when at today; muted when in time-travel.
- **Left arrow (◀)**: Jumps to batch start date.

### Interaction
- Drag playhead → date chip updates instantly (no re-render).
- **150 ms debounce** after drag/click stops → sets `COHORT_AS_OF` → calls `renderAP127Detail()`.
- Playhead at rightmost position → `COHORT_AS_OF = null` (live mode).
- Date input in `.d127-controls` row stays **in sync** (changing one updates the other).

### Implementation
Custom HTML/CSS — a `<div>` track with a draggable `<div>` thumb (no `<input type="range">` because range inputs can't render month labels or custom tick marks). Uses `pointermove`/`pointerdown`/`pointerup` events.

---

## 4. UI — Amber Banner (time-travel active indicator)

A persistent amber banner rendered immediately **above the scrubber bar**, hidden in live mode:

```
⏪  TIME TRAVEL MODE  —  data as of  25 Jun 2026  —  [Return to Live]
```

- Background: `rgba(245,158,11,0.12)` (amber tint), border-bottom: `1px solid rgba(245,158,11,0.35)`
- Text: amber `#f59e0b`, monospace, 10px
- **[Return to Live]** button on right: resets slider to rightmost and sets `COHORT_AS_OF = null`
- Hidden (`display:none`) when `COHORT_AS_OF === null`

---

## 5. UI — Date Picker in Controls Row

The existing `.d127-controls` row (search + sort) gains a `<input type="date">` on the right:

```
[Search name...]  [Sort: ...]  [date input]  [Live]
```

- `min` = batch start date (computed from first flight)
- `max` = real today (always real today, not as-of)
- Changing the date input → updates slider → triggers debounced re-render
- **Live** chip resets both

---

## 6. Subtitle Line

`#d127-subtitle` text changes:
- **Live mode:** "Progress retrieved from CATC FTC records and master plan"
- **Time-travel mode:** "Viewing data as of 25 Jun 2026 — live data paused"

---

## 7. History Charts Cap

`buildAP127HistBatch` and `buildAP127HistSolo` use `ap127AsOf()` as their `today` cutoff (implemented in §2). The x-axis naturally caps at the selected date — no extra logic needed.

---

## 8. Expose on Window
```js
Object.assign(window, { ..., setCohortAsOf, ap127AsOf });
```

---

## 9. Files Changed

| File | Change |
|---|---|
| `js/view-cohort.js` | MARKUP (banner + scrubber + date input), `COHORT_AS_OF` state, `ap127AsOf()`, 9 function swaps, `setCohortAsOf`, scrubber init logic |
| `index.html` | Bump `?v=p100` → `?v=p101` |
| `CLAUDE.md` | Update last known + next token |
| `REVAMP.md` | Add change log entry |
| `AP127_Docs/README.md` | §2.4 update + §10 log |
