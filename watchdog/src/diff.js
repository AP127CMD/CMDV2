// 2026-07-26: added type/cond/isSim/isStandby — a materially different session (aircraft type
// swap, condition/context change, or a flip to/from simulator or standby) was previously invisible
// to the diff, same class of gap as the student/batch reassignment fix below. durMin/duration are
// deliberately NOT tracked — they're derived from start/end, so tracking them would just repeat
// what a start/end diff already shows rather than surface new information.
const TRACKED = ['date', 'start', 'end', 'status', 'instructor', 'tail', 'lesson', 'type', 'cond', 'isSim', 'isStandby'];

export function buildSnapshot(flights) {
  const snap = {};
  for (const f of flights) {
    if (!f.id) continue;
    snap[String(f.id)] = {
      id: String(f.id), batch: f.batch || '',
      date: f.date, start: f.start, end: f.end,
      status: f.status, student: f.student, instructor: f.instructor,
      lesson: f.lesson, tail: f.tail, type: f.type,
      cond: f.cond, isSim: f.isSim, isStandby: f.isStandby,
      // Display-only actual-flight-record fields (2026-07-25) — deliberately NOT added to TRACKED
      // above, so they never themselves trigger a diff event. They ride along on whatever event a
      // flight's TRACKED-field transition already produces (most commonly Pending→Completed) and
      // are rendered on the Completed message block by telegram.js's buildCombinedMessages().
      to: f.to, ldg: f.ldg, tkoff: f.tkoff, ldgTime: f.ldgTime, inst: f.inst,
      // 2026-08-06: recover_vanished_bookings() (fetch_schedule.py) marks a synthesized
      // Canceled entry `recovered: true` when no Cancel Record was ever found for it (removed
      // via some portal path other than the Cancel Flight form). Not diffable — telegram.js
      // uses it to render a distinct "Removed" notice instead of a normal "Cancelled" one.
      recovered: f.recovered,
    };
  }
  return snap;
}

export function diffSnapshots(prev, next) {
  const events = [];
  const prevKeys = new Set(Object.keys(prev));
  const nextKeys = new Set(Object.keys(next));

  for (const id of nextKeys) {
    if (!prevKeys.has(id)) {
      events.push({ type: 'ADDED', flight: next[id], diff: {} });
      continue;
    }
    const p = prev[id], n = next[id];

    // Same-id reassignment: the upstream source sometimes reuses a flight id for a completely
    // different booking (different student and/or batch) instead of issuing a new id — confirmed
    // live 2026-07-26 (a flight silently reassigned from one student/batch to another). This is
    // NOT an edit to one person's flight — it's two different bookings sharing an id. `student`/
    // `batch` are deliberately excluded from TRACKED (below) so this never masquerades as an
    // ordinary CHANGED event attributed only to the new owner — that used to leave the old owner
    // with zero notice, and even misrouted away from the old batch's destination. Synthesize the
    // old owner's cancellation (tagged with who replaced them) and the new owner's new flight
    // (tagged with who it came from) so both sides are notified and each routes correctly.
    if (p.student !== n.student || p.batch !== n.batch) {
      events.push({ type: 'REMOVED', flight: p, diff: { reassignedTo: { student: n.student, batch: n.batch } } });
      events.push({ type: 'ADDED', flight: n, diff: { reassignedFrom: { student: p.student, batch: p.batch } } });
      continue;
    }

    const diff = {};
    for (const field of TRACKED) {
      if (p[field] !== n[field]) diff[field] = { from: p[field], to: n[field] };
    }
    if (Object.keys(diff).length === 0) continue;
    // A status transition is the headline event even when other fields change in the same tick.
    // The newer feed completes flights IN PLACE (same id: Pending→Completed AND planned times
    // replaced by actual flown times), which previously fell through to CHANGED and rendered as
    // the misleading "Flight updated". Any diff that touches `status` is therefore a STATUS event;
    // telegram.js gives it the right headline (completed/cancelled/status) and still shows the
    // co-changed details.
    const type = diff.status ? 'STATUS' : 'CHANGED';
    events.push({ type, flight: n, diff });
  }

  for (const id of prevKeys) {
    if (!nextKeys.has(id)) {
      events.push({ type: 'REMOVED', flight: prev[id], diff: {} });
    }
  }

  return events;
}

// 2026-07-26: cancelReason/remarks live in a separate `cancellations[]` array in the feed (mirrors
// how `leaves[]` already works) — never an inline field on the flight record. Joins by `bookingId`
// onto any event already classified as a cancellation (REMOVED, STATUS→Canceled, or the REMOVED
// half of a same-id reassignment above). Pure — never mutates the input events.
export function attachCancelReasons(events, cancellations) {
  if (!cancellations || !cancellations.length) return events;
  const byBookingId = {};
  for (const c of cancellations) {
    if (c.bookingId) byBookingId[c.bookingId] = c;
  }
  return events.map(e => {
    // 2026-07-27: stabilizeCancelledFlights (below) can rebuild a cancelled booking's tracking
    // post-flap as a fresh ADDED with flight.status already 'Canceled' — not via STATUS or REMOVED.
    // Without this case the join silently never attaches to that event.
    const isCancelled = e.type === 'REMOVED' || (e.type === 'STATUS' && e.diff?.status?.to === 'Canceled')
      || (e.type === 'ADDED' && e.flight.status === 'Canceled');
    if (!isCancelled) return e;
    const rec = byBookingId[e.flight.id];
    if (!rec) return e;
    const cancelReason = {};
    if (rec.reason) cancelReason.reason = rec.reason;
    if (rec.remarks && rec.remarks.trim()) cancelReason.remarks = rec.remarks.trim();
    if (!Object.keys(cancelReason).length) return e;
    return { ...e, diff: { ...e.diff, cancelReason } };
  });
}

// 2026-07-27: real incident — three live bookings each fired REMOVED-then-ADDED 9 times in one day.
// Root-caused via the upstream CMD_CTR feed's own git history: `flights[]` itself flaps a cancelled
// booking's presence in/out across scrapes (~5-10 min apart) while its `cancellations[]` record
// stays put the whole time — a known, only-partially-mitigated scraper race documented in that
// repo's own fetch script (`recover_vanished_bookings()`, "kept as a safety net for if that
// Canceled-mode fetch itself fails for a run"). Once a bookingId has a submitted Cancel Record, that
// record never reverts (confirmed against 37 consecutive live upstream commits — membership only
// ever gained, never lost), so it's a stable source of truth to override the flaky `flights[]`
// presence/status against, applied to `newSnap` right before diffing (and before it's persisted to
// KV, so the correction sticks for next run too — see index.js).
export function stabilizeCancelledFlights(newSnap, prevSnap, cancellations) {
  if (!cancellations || !cancellations.length) return newSnap;
  let out = newSnap;
  for (const c of cancellations) {
    const id = c.bookingId;
    if (!id) continue;
    if (out[id]) {
      // A bookingId can be REUSED for a completely different, later booking instead of the source
      // issuing a new id (confirmed live — see diffSnapshots' student/batch reassignment special
      // case). If the student at this id today doesn't match who this cancellation was actually
      // for, it no longer describes what's here — don't force it, let normal diffing (and the
      // reassignment special-case) handle the id on its own merits.
      if (c.student && out[id].student !== c.student) continue;
      if (out[id].status !== 'Canceled') {
        if (out === newSnap) out = { ...newSnap };
        out[id] = { ...out[id], status: 'Canceled' };
      }
    } else if (prevSnap[id]) {
      if (c.student && prevSnap[id].student !== c.student) continue;
      if (out === newSnap) out = { ...newSnap };
      out[id] = { ...prevSnap[id], status: 'Canceled' };
    }
    // else: cancelled but never seen in either snapshot — no full record to carry forward yet.
  }
  return out;
}

// When a flight is recorded as complete the system cancels the planned entry and
// adds a new ACTUAL_ONLY entry. Keep the ADDED(Completed) as "Flight completed",
// suppress the paired cancel (REMOVED or status → Canceled for same SP + lesson + date).
//
// Key includes `date` (2026-07-26, real gap flagged during the reassignment-bug review): a
// student can legitimately attempt the same lesson code on more than one date (retry after an
// earlier cancellation, or a rescheduled attempt). Without `date`, a genuine cancellation for one
// date could be wrongly swallowed just because an unrelated Completed event for the SAME
// student+lesson on a DIFFERENT date landed in the same tick. Scoping by date closes that without
// needing to parse the ACTUAL_ONLY_<id> naming convention, which is inconsistent across the live
// feed (some carry no parseable base id at all, e.g. "ACTUAL_ONLY_UNPLANNED_ACT_3467").
export function suppressActualPairs(events) {
  const completedKeys = new Set(
    events
      .filter(e => e.type === 'ADDED' && e.flight.status === 'Completed')
      .map(e => `${e.flight.student}|${e.flight.lesson}|${e.flight.date}`)
  );
  if (!completedKeys.size) return events;

  return events.filter(e => {
    const key = `${e.flight.student}|${e.flight.lesson}|${e.flight.date}`;
    if (!completedKeys.has(key)) return true;
    // Always keep the ADDED(Completed) — shown as "Flight completed"
    if (e.type === 'ADDED' && e.flight.status === 'Completed') return true;
    // Suppress the paired cancel
    if (e.type === 'REMOVED') return false;
    if (e.diff?.status?.to === 'Canceled') return false;
    return true;
  });
}
