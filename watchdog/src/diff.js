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
