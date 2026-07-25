const TRACKED = ['date', 'start', 'end', 'status', 'instructor', 'tail', 'lesson'];

export function buildSnapshot(flights) {
  const snap = {};
  for (const f of flights) {
    if (!f.id) continue;
    snap[String(f.id)] = {
      id: String(f.id), batch: f.batch || '',
      date: f.date, start: f.start, end: f.end,
      status: f.status, student: f.student, instructor: f.instructor,
      lesson: f.lesson, tail: f.tail, type: f.type,
      // Display-only actual-flight-record fields (2026-07-25) — deliberately NOT added to TRACKED
      // above, so they never themselves trigger a diff event. They ride along on whatever event a
      // flight's TRACKED-field transition already produces (most commonly Pending→Completed) and
      // are rendered on the Completed message block by telegram.js's buildCombinedMessages().
      to: f.to, ldg: f.ldg, tkoff: f.tkoff, ldgTime: f.ldgTime, inst: f.inst,
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

// When a flight is recorded as complete the system cancels the planned entry and
// adds a new ACTUAL_ONLY entry. Keep the ADDED(Completed) as "Flight completed",
// suppress the paired cancel (REMOVED or status → Canceled for same SP + lesson).
export function suppressActualPairs(events) {
  const completedKeys = new Set(
    events
      .filter(e => e.type === 'ADDED' && e.flight.status === 'Completed')
      .map(e => `${e.flight.student}|${e.flight.lesson}`)
  );
  if (!completedKeys.size) return events;

  return events.filter(e => {
    const key = `${e.flight.student}|${e.flight.lesson}`;
    if (!completedKeys.has(key)) return true;
    // Always keep the ADDED(Completed) — shown as "Flight completed"
    if (e.type === 'ADDED' && e.flight.status === 'Completed') return true;
    // Suppress the paired cancel
    if (e.type === 'REMOVED') return false;
    if (e.diff?.status?.to === 'Canceled') return false;
    return true;
  });
}
