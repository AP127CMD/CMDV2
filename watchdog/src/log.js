const SHARD_LIMIT = 20 * 1024 * 1024; // 20 MB

function monthKey(ts) {
  return `watchdog:log:${ts.slice(0, 7)}`;
}

export async function appendLog(kv, entries, ts) {
  if (!entries.length) return;
  const base = monthKey(ts);

  // Find the currently active shard (last one that exists)
  let activeKey = base;
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const candidate = `${base}-${letter}`;
    const exists = await kv.get(candidate, 'text');
    if (exists === null) break;
    activeKey = candidate;
  }

  const raw = await kv.get(activeKey, 'text');
  const existing = raw ? JSON.parse(raw) : [];
  const newEntries = entries.map(e => ({ ...e, ts }));
  const combined = JSON.stringify([...existing, ...newEntries]);

  if (combined.length > SHARD_LIMIT) {
    // Start a new shard
    const nextLetter = activeKey === base
      ? 'A'
      : String.fromCharCode(activeKey.charCodeAt(activeKey.length - 1) + 1);
    await kv.put(`${base}-${nextLetter}`, JSON.stringify(newEntries));
  } else {
    await kv.put(activeKey, combined);
  }
}

export async function getLog(kv, month) {
  const base = `watchdog:log:${month}`;
  const all = [];

  const baseRaw = await kv.get(base, 'text');
  if (baseRaw) all.push(...JSON.parse(baseRaw));

  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const raw = await kv.get(`${base}-${letter}`, 'text');
    if (raw === null) break;
    all.push(...JSON.parse(raw));
  }

  return all.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
}
