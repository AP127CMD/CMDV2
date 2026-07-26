# Schedule view improvements — design spec

Date: 2026-07-26
Scope: CMDV2 (`AP127_V2`), schedule views only (Board/day, Weekly, Gantt, Calendar/month). No backend/data-pipeline changes.

## Problem

Three real-user reports about the Schedule view:

1. **Some flights (e.g. cancellations) don't show up on the schedule at all.**
2. **New data fields have appeared upstream but the flight detail card doesn't show them.**
3. **The calendar's leave indicators are too shallow — can't see who's on leave, why, for how long, or any remark.**

## Root causes (verified against live `flight-data.js`)

- `FLIGHT_DATA` carries a separate `cancellations[]` feed (179 records: `bookingId`, `date`, `reason`, `remarks`, `instructor`, `student`, `batch`, `lesson`, `acType`, `acReg`) meant to be joined onto flights by `bookingId === flight.id`.
- **92 of 179 (51%) have no matching flight record in `flights[]` at all** — they exist only in the cancellations log, so every current view (which only reads `FLIGHTS`) never shows them. Example: Siwakorn P.'s AP-127 lesson CDXV 31, cancelled 2026-07-10 for weather, is invisible everywhere.
- Flight records already carry `cancelReason`, `blockOff`, `blockOn` fields that the Drawer (flight detail card) never renders. The cancellations feed's free-text `remarks` (sometimes Thai) isn't joined in anywhere.
- `leavesOnDate()` (`shared.js`) collapses each `LEAVES` record down to a bare `{name: reason}` map, discarding `duration` ("Full Day"/"Half Day"), `note`, `role`, and the leave's date range — all present on the source record.

## Design

### 1. Data join pass — `js/shared.js`

Add `attachCancelDetails()`, run once at load time (next to the existing dedup IIFE near line 38):

- Index `FLIGHT_DATA.cancellations` by `bookingId`.
- For each **Canceled** flight matching a cancellation by `id === bookingId`: set `cancelReason` (fallback only, don't override an existing value) and `cancelRemarks` (new field, always from the cancellation record).
- For each cancellation with **no** matching flight: synthesize a virtual flight and push it into `FLIGHT_DATA.flights`:
  ```js
  {
    id: 'CANCEL_' + c.bookingId, date: c.date, status: 'Canceled',
    isSim: /sim/i.test(c.acType || ''), isStandby: false,
    start: null, end: null, durMin: 0, duration: '—',
    student: c.student, instructor: c.instructor, batch: c.batch, lesson: c.lesson,
    cond: null, type: c.acType, tail: c.acReg,
    cancelReason: c.reason, cancelRemarks: c.remarks,
    _noTime: true, _virtual: true,
  }
  ```

Because every view reads the shared `FLIGHTS` array, this single pass fixes Board, Weekly, and Calendar without touching those files' filtering logic. Gantt already skips any flight without a `start` (`if (!f.start) return null`), so orphan cancels correctly never draw a bar there — this is a rendering choice, not a limitation to patch: there is no time to draw a bar with.

Sort-order fix (bottom, not midnight, for no-time entries):
- `js/view-weekly.js`: `list.sort((a,b)=>(minutesOf(a.start)||0)-(minutesOf(b.start)||0))` → change `||0` to `?? Infinity` on both sides.
- `js/view-calendar.js` `panelData`: same fix, `(minutesOf(a.start)||0)` → `(minutesOf(a.start) ?? Infinity)`.

### 2. Flight detail card — `Drawer` in `js/shared.js`

Add, conditionally:
- `CANCEL REASON` row — shown when `f.status === 'Canceled' && f.cancelReason`.
- `REMARKS` row — shown when `f.cancelRemarks` (free text, render as-is, wrap long lines).
- `NO TIME LOGGED` badge next to the existing status pill when `f._noTime` — and suppress the `TIME`/`DURATION` rows in that case (they'd otherwise show `— — —`).
- `BLOCK OFF / ON` row — shown when `f.blockOff || f.blockOn`, placed next to the existing actual-times (T/O·LDG·INST) row.

### 3. List views — small additions only

- **Board** (`view-board.js`): add a `NO TIME` tag next to the status pill for `_noTime` rows, same visual treatment as the existing STBY/SIM tags.
- **Weekly** (`view-weekly.js`): same tag on the flight tile.
- **Calendar** (`view-calendar.js`): month-cell counts and the day-panel flight list already iterate all `FLIGHTS` for a date, so orphan cancels appear automatically once step 1 lands. Add a one-line cancel-reason chip to day-panel rows when `status === 'Canceled' && cancelReason` is present, matching what the Drawer now shows.

### 4. Calendar leave enrichment — `js/shared.js` + `js/view-calendar.js`

Add a new helper `leaveDetailOnDate(date)`, a sibling to the existing `leavesOnDate` (which stays exactly as-is — it's used for the lightweight leave badges in Board/Weekly and changing its shape would ripple into call sites that only need a truthy reason string). The new helper returns, per name:
```js
{ reason, duration, note, role, start, end }   // start/end = the leave record's full range
```
pulled directly from `LEAVES`. Wire it into `CalendarBoard`'s day-detail panel only: each FI/SP leave row gains reason + duration (Full/Half Day) + note (if present) + role, instead of just the bare reason string it shows today.

## Out of scope

- No backend/Watchdog worker changes — this is a pure CMDV2 frontend read of data already present in `flight-data.js`.
- No change to `leavesOnDate`'s existing signature/callers outside Calendar.
- No attempt to infer a start/end time for orphan cancellations — the source data doesn't have one.

## Verification plan

- Preview the app locally (`preview_start` against `AP127_V2`), navigate to Schedule.
- Board/day view: pick a date known to contain an orphan cancellation (e.g. 2026-07-10) and confirm it now appears with a NO TIME tag.
- Weekly: same date, confirm the flight tile appears in the correct day column, sorted after timed flights.
- Calendar: confirm the month cell's cancel count includes the orphan, and the day panel shows it with reason.
- Click into the Drawer for a Canceled flight with remarks (real or synthetic) and confirm CANCEL REASON / REMARKS / NO TIME LOGGED render correctly; click a Completed flight with `blockOff`/`blockOn` and confirm the new row.
- Calendar day panel: pick a day with a known leave record and confirm reason + duration + note + role render.
- Confirm no console errors, and that a normal (non-cancelled, non-leave) day still renders unchanged.

## Rollout

Per this project's update rule: bump `?v=p113` on all `<script>` tags in `index.html`, add a `REVAMP.md` change-log entry, update this project's `CLAUDE.md` Verify section, then update `/Users/nugui/AP127_Docs/README.md` §2.4 + §10 and push.
