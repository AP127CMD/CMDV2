// Notification log storage.
//
// CPU note (Free plan, ~10 ms/invocation): the previous design read-modified-wrote a single
// per-MONTH blob on every change run. As a month accumulated events that blob grew to >1.5 MB, so a
// change run paid ~1.5 MB parse + ~1.5 MB stringify ON TOP of the ~1.4 MB feed parse — enough to
// risk the CPU limit again. We now append to a per-DAY key (`watchdog:log:YYYY-MM-DD`), so each
// append only touches that day's small blob (tens of KB). getLog() aggregates a month by listing
// all keys under the month prefix, and still reads the legacy per-month blob + lettered shards so
// pre-2026-07-14 history is preserved.

function dayKey(ts) {
  return `watchdog:log:${ts.slice(0, 10)}`; // YYYY-MM-DD
}

export async function appendLog(kv, entries, ts) {
  if (!entries.length) return;
  const key = dayKey(ts);
  const raw = await kv.get(key, 'text');
  const existing = raw ? JSON.parse(raw) : [];
  const withTs = entries.map(e => ({ ...e, ts }));
  await kv.put(key, JSON.stringify([...existing, ...withTs]));
}

export async function getLog(kv, month) {
  const base = `watchdog:log:${month}`;
  const all = [];

  // Legacy per-month blob (data written before day-sharding).
  const baseRaw = await kv.get(base, 'text');
  if (baseRaw) all.push(...JSON.parse(baseRaw));

  // Everything under `${base}-*` — this covers BOTH the new per-day keys (`-DD`) and the legacy
  // lettered overflow shards (`-A`, `-B`, …). Prefer KV list(); fall back to explicit probing for
  // KV implementations (e.g. test mocks) that don't provide it.
  const seen = new Set();
  if (typeof kv.list === 'function') {
    let cursor;
    do {
      const res = await kv.list({ prefix: `${base}-`, cursor });
      for (const k of res.keys || []) {
        if (seen.has(k.name)) continue;
        seen.add(k.name);
        const raw = await kv.get(k.name, 'text');
        if (raw) all.push(...JSON.parse(raw));
      }
      cursor = res.list_complete ? null : res.cursor;
    } while (cursor);
  } else {
    // Legacy lettered shards are written sequentially (A, B, C…) → stop at the first gap.
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const raw = await kv.get(`${base}-${letter}`, 'text');
      if (raw === null) break;
      all.push(...JSON.parse(raw));
    }
    // Per-day keys: probe every day of the month.
    for (let d = 1; d <= 31; d++) {
      const raw = await kv.get(`${base}-${String(d).padStart(2, '0')}`, 'text');
      if (raw) all.push(...JSON.parse(raw));
    }
  }

  return all.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
}
