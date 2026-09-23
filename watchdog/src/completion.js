// 2026-09-24: per-leg Completed notices. Real user ask: the "✅ Completed" notice should show the
// flight record — leg, block off, take-off, landing, block on, departure, destination — so you can
// see what each SP flew, when, and to where (it only ever showed the booking's planned slot).
//
// The data comes from CMD_CTR's scraper (fetch_schedule.py): a completed flight carries its own
// record fields (routeFrom/routeTo/leg/blockOff/tkoff/ldgTime/blockOn/…), and a multi-leg booking
// additionally carries `legs` — every leg, rebuilt from the portal's Flight Record submissions,
// because the booking's own fields only ever describe its LATEST leg.
//
// Pure functions only — shared by telegram.js (rendering) and index.js (the settle hold below).

// Route text is free-ish: "VTPH", "VTSE-VTPH", "VTPH-VTBP-VTSE", "VTPH - KHAOWANG", "HOTEL -VTPH".
const ROUTE_SEP = /[\s,/>→–—-]+/;

// One flat list of place codes for a leg (or a whole trip, when fed legs in order), with
// consecutive duplicates collapsed: ("VTPH", "VTSE-VTPH") → [VTPH, VTSE, VTPH].
export function routeCodes(...parts) {
  const codes = [];
  for (const part of parts) {
    for (const raw of String(part ?? '').split(ROUTE_SEP)) {
      const c = raw.trim().toUpperCase();
      if (c && c !== '-' && codes[codes.length - 1] !== c) codes.push(c);
    }
  }
  return codes;
}

// "VTPH→VTSB" for a leg; a local sortie (from === to) reads "VTPH→VTPH", never a bare "VTPH".
export function legRoute(leg) {
  const codes = routeCodes(leg.routeFrom, leg.routeTo);
  if (codes.length === 0) return '—';
  if (codes.length === 1) return `${codes[0]}→${codes[0]}`;
  return codes.join('→');
}

const OWN_LEG_KEYS = ['leg', 'routeFrom', 'routeTo', 'blockOff', 'tkoff', 'ldgTime', 'blockOn',
  'to', 'ldg', 'inst', 'tail', 'remark'];

// Every leg of a completed flight, in order. `legs` wins when present (multi-leg booking);
// otherwise the flight's own record fields ARE its single leg. [] when no record is entered yet.
export function flightLegs(f) {
  if (Array.isArray(f?.legs) && f.legs.length) return f.legs;
  if (!f) return [];
  const own = Object.fromEntries(OWN_LEG_KEYS.map(k => [k, f[k] ?? null]));
  const recorded = ['routeFrom', 'routeTo', 'blockOff', 'tkoff', 'ldgTime', 'blockOn'].some(k => own[k]);
  return recorded ? [own] : [];
}

// Minutes between two "HH:MM" clock times (across midnight if needed); null if either is missing.
export function spanMinutes(from, to) {
  const m = s => (/^(\d{1,2}):(\d{2})$/.exec(String(s ?? '')) || null);
  const a = m(from), b = m(to);
  if (!a || !b) return null;
  let d = (Number(b[1]) * 60 + Number(b[2])) - (Number(a[1]) * 60 + Number(a[2]));
  if (d < 0) d += 24 * 60;
  return d;
}

export function fmtMinutes(mins) {
  if (mins == null) return null;
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

// Is every leg of this trip on record yet? True when there's nothing to wait for: an unnumbered
// single record (an ordinary local sortie), or numbered legs 1..n with no gap that end where they
// started (VTPH→VTSB→VTSE→VTPH). A one-way or gapped set (leg 1 only, or legs 1+3) might still
// be waiting on Flight Records the students haven't submitted yet.
export function tripComplete(f) {
  const legs = flightLegs(f);
  const numbered = legs.filter(l => l.leg);
  if (numbered.length === 0) return true;
  const nums = numbered.map(l => Number(l.leg)).sort((a, b) => a - b);
  const contiguous = nums.every((n, i) => n === i + 1);
  const path = routeCodes(...legs.flatMap(l => [l.routeFrom, l.routeTo]));
  const closed = path.length >= 2 && path[0] === path[path.length - 1];
  return contiguous && closed;
}

export function legsSignature(f) {
  return JSON.stringify(flightLegs(f).map(l =>
    [l.leg, l.routeFrom, l.routeTo, l.blockOff, l.tkoff, l.ldgTime, l.blockOn]));
}

// ── Settle hold ─────────────────────────────────────────────────────────────────────────────
// Students submit a multi-leg XC's Flight Records in a burst (SETASIT P., 2026-09-23: legs 1-3 at
// 14:24:11, 14:25:20, 14:27:26), and the scraper can land between two of them. Sending the Completed
// notice straight away would then show leg 1 only — and a later "now with 3 legs" notice is exactly
// the duplicate noise this watchdog has been fixed for three times. So a completion whose trip isn't
// complete yet (see tripComplete) is held — and sent ONCE, with every leg — when the trip closes,
// when its legs have stopped changing for SETTLE_MS, or at MAX_HOLD_MS regardless. An ordinary
// local sortie is never held.
export const SETTLE_MS = 10 * 60 * 1000;
export const MAX_HOLD_MS = 30 * 60 * 1000;

export function isCompletionEvent(e) {
  return (e.type === 'ADDED' && e.flight?.status === 'Completed')
    || (e.type === 'STATUS' && e.diff?.status?.to === 'Completed');
}

// held: { [flightId]: { type, diff, flight, since, changedAt, sig } } (persisted in KV).
// snap: this run's snapshot, or null on a run where the feed didn't change (timeouts only).
// Returns { events, held, dirty } — `events` is what to notify now (non-completions untouched).
export function settleCompletions({ events = [], held = {}, snap = null, nowMs }) {
  const next = { ...held };
  const out = [];
  let dirty = false;

  for (const [id, h0] of Object.entries(held)) {
    let h = h0;
    if (snap) {
      const f = snap[id];
      // Gone, or no longer Completed: a real change the normal diff already reports — drop quietly.
      if (!f || f.status !== 'Completed') { delete next[id]; dirty = true; continue; }
      const sig = legsSignature(f);
      h = { ...h, flight: f, ...(sig !== h.sig ? { sig, changedAt: nowMs } : {}) };
      next[id] = h;
      if (sig !== h0.sig) dirty = true;
    }
    if (tripComplete(h.flight) || nowMs - h.changedAt >= SETTLE_MS || nowMs - h.since >= MAX_HOLD_MS) {
      out.push({ type: h.type, diff: h.diff || {}, flight: h.flight });
      delete next[id];
      dirty = true;
    }
  }

  for (const e of events) {
    if (!isCompletionEvent(e) || tripComplete(e.flight)) { out.push(e); continue; }
    const id = String(e.flight.id);
    if (next[id]) continue;
    next[id] = { type: e.type, diff: e.diff || {}, flight: e.flight,
      since: nowMs, changedAt: nowMs, sig: legsSignature(e.flight) };
    dirty = true;
  }

  return { events: out, held: next, dirty };
}

// Earliest time any held completion becomes due (ms), or null when nothing is held — stored in
// watchdog:status so a run whose feed didn't change only reads the hold list when something's due.
export function nextHeldDueAt(held) {
  const due = Object.values(held || {}).map(h => Math.min(h.changedAt + SETTLE_MS, h.since + MAX_HOLD_MS));
  return due.length ? Math.min(...due) : null;
}
