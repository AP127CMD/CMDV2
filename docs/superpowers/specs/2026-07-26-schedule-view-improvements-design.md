# Schedule view improvements — design spec

Date: 2026-07-26
Scope: CMDV2 (`AP127_V2`), schedule views only (Board/day, Weekly, Gantt, Calendar/month). No backend/data-pipeline changes.

## Problem

Three real-user reports about the Schedule view:

1. **Some flights (e.g. cancellations) don't show up on the schedule at all.**
2. **New data fields have appeared upstream but the flight detail card doesn't show them.**
3. **The calendar's leave indicators are too shallow — can't see who's on leave, why, for how long, or any remark.**

## Root causes (verified against live production data, re-checked 2026-07-26T15:15Z)

- `FLIGHT_DATA` carries a separate `cancellations[]` feed (337 records as of this check: `bookingId`, `date`, `reason`, `remarks`, `instructor`, `student`, `batch`, `lesson`, `acType`, `acReg`) meant to be joined onto flights by `bookingId === flight.id`.
- **210 of 337 (62%) have no matching flight record in `flights[]` at all** (72 of those are AP-127) — they exist only in the cancellations log, so every current view (which only reads `FLIGHTS`) never shows them. This count is a live, moving target — the upstream pipeline does eventually backfill some individual bookings into `flights[]` (see below), but a large, persistent fraction never gets one.
  - Concretely verified example: `BK-8IWR-3978` — VASAPHON S., AP-127, lesson CDGL 02, 2026-05-05, reason "Other" / remarks "Late Aircraft" — still has no flight row as of this check. Used as the test case below.
  - The example originally reported (Napon S., AP-127, CDXV 29, 2026-07-27, 11:00–12:30) was **confirmed as a real instance of this same bug** via git history — it existed only as a Cancels record with no flight row as recently as this morning's snapshot (06:07Z) — but self-healed by the time of this check (15:15Z): the upstream pipeline had, by then, written it into `flights[]` directly with `status:"Canceled"`, the correct `start`/`end` (11:00–12:30, matching exactly what was reported), plus `cancelReason` **and** a `cancelRemarks` field already joined in. This is good evidence for the join design below (fill gaps, never override) but means it's no longer usable as a "currently still broken" test case.
- **New confirmation: flight records can now arrive with `cancelReason` and `cancelRemarks` already attached directly by the upstream pipeline** (not just the older `cancelReason`/`blockOff`/`blockOn` fields, which were already present but unused by the Drawer). This is inconsistent/partial — only 3 of 204 currently-Canceled flights have `cancelRemarks` pre-joined — so the frontend join pass must still independently backfill from `cancellations[]` for anything the pipeline hasn't caught up on yet, and must never overwrite a value that's already there.
- `leavesOnDate()` (`shared.js`) collapses each `LEAVES` record down to a bare `{name: reason}` map, discarding `duration` ("Full Day"/"Half Day"), `note`, `role`, and the leave's date range — all present on the source record.

## Design

### 1. Data join pass — `js/shared.js`

Add `attachCancelDetails()`, run once at load time (next to the existing dedup IIFE near line 38):

- Index `FLIGHT_DATA.cancellations` by `bookingId`.
- For each **Canceled** flight matching a cancellation by `id === bookingId`: set `cancelReason` and `cancelRemarks` as fallback only — never override a value the upstream pipeline already attached.
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
- Board/day view: 2026-05-05, confirm `BK-8IWR-3978` (VASAPHON S., AP-127, CDGL 02, "Late Aircraft") now appears with a NO TIME tag, reason, and remark.
- Weekly: same date, confirm the flight tile appears in the correct day column, sorted after timed flights.
- Calendar: confirm the month cell's cancel count includes the orphan, and the day panel shows it with reason.
- Click into the Drawer for a Canceled flight with remarks (real or synthetic) and confirm CANCEL REASON / REMARKS / NO TIME LOGGED render correctly; click a Completed flight with `blockOff`/`blockOn` and confirm the new row.
- Calendar day panel: pick a day with a known leave record and confirm reason + duration + note + role render.
- Confirm no console errors, and that a normal (non-cancelled, non-leave) day still renders unchanged.

## Rollout

Per this project's update rule: bump `?v=p113` on all `<script>` tags in `index.html`, add a `REVAMP.md` change-log entry, update this project's `CLAUDE.md` Verify section, then update `/Users/nugui/AP127_Docs/README.md` §2.4 + §10 and push.
