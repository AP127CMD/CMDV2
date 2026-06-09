const TRACKED = ['date', 'start', 'end', 'status', 'instructor', 'tail', 'lesson'];

export function buildSnapshot(flights) {
  const snap = {};
  for (const f of flights) {
    if (!f.id || f.batch !== 'AP-127') continue;
    snap[String(f.id)] = {
      id: String(f.id), date: f.date, start: f.start, end: f.end,
      status: f.status, student: f.student, instructor: f.instructor,
      lesson: f.lesson, tail: f.tail, type: f.type,
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
    const type = Object.keys(diff).length === 1 && diff.status ? 'STATUS' : 'CHANGED';
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
