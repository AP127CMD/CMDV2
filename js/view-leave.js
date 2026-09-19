/* AP127 V2 — Leave calendar (Schedule tab → "Leave" layout).
 *
 * A calendar view built on the leave records (window.LEAVES = FLIGHT_DATA.leaves),
 * NOT on flight dates, so any date that has a leave record can be shown, even with
 * no flights published for it yet. Four sub-views (Day / Week / Month / Roster)
 * share one date cursor, one WHO filter (AP127 SP by default · other SP · FI), one
 * reason filter and one KPI strip. Clicking any leave opens a drawer showing every
 * field of the record, including source ids, any flights booked during the leave,
 * and that person's other leaves.
 *
 * Data hygiene (done once, here, without touching shared.js):
 *  - The feed carries each leave twice (a sheet-row copy "|rowN" and a form-key copy
 *    "|key|<timestamp>"), so 1,041 rows are ~640 records. Rows are de-duplicated on
 *    content, and every source id is kept on the record.
 *  - Names are normalised to the flight feed's "FIRST L." form ("Watcharaphol
 *    Vongnoi" → "WATCHARAPHOL V.", "APIRATKUNPAK K" → "APIRATKUNPAK K.").
 *  - A record whose end is before its start is swapped and flagged "reversed".
 *  - Leave DAYS are counted per person per calendar day (max 1, or 0.5 for a half
 *    day), so two overlapping records for the same person never double-count.
 *
 * Plain script (React.createElement, no JSX): loaded before view-schedule.js.
 */
(function () {
  const { useState, useMemo, useEffect } = React;
  const h = React.createElement;

  // ── Date helpers (UTC-based date arithmetic on YYYY-MM-DD strings) ─────────
  const D     = s => new Date(s + 'T00:00:00Z');
  const iso   = d => d.toISOString().slice(0, 10);
  const addD  = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const diffD = (a, b) => Math.round((D(b) - D(a)) / 864e5);
  const dow   = s => D(s).getUTCDay();                       // 0 = Sun
  const weekStart  = s => addD(s, -((dow(s) + 6) % 7));      // Monday
  const monthStart = s => s.slice(0, 8) + '01';
  const monthEnd   = s => { const d = D(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); };
  const addMonths  = (s, n) => { const d = D(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); };
  const range = (a, b) => { const out = []; for (let s = a; s <= b; s = addD(s, 1)) out.push(s); return out; };
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const fmtD   = s => `${+s.slice(8)} ${MON[+s.slice(5, 7) - 1]}`;
  const fmtDW  = s => `${DOW[dow(s)]} ${fmtD(s)}`;
  const fmtDY  = s => `${fmtDW(s)} ${s.slice(0, 4)}`;
  const fmtMY  = s => `${MON[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
  const isWkd  = s => { const w = dow(s); return w === 0 || w === 6; };
  const today  = () => (window.bkkToday ? window.bkkToday() : iso(new Date()));
  const holidays = () => window.AP127_HOLIDAYS || new Set();
  const fmtDays = n => (Math.round(n * 2) / 2).toString().replace(/\.0$/, '');

  // ── Classification ─────────────────────────────────────────────────────────
  const normName = n => {
    const s = String(n || '').trim();
    if (!s) return '';
    if (s.includes('.')) return s.toUpperCase();
    const p = s.split(/\s+/);
    if (p.length < 2) return s.toUpperCase();
    return (p[0] + ' ' + p[1][0]).toUpperCase() + '.';
  };

  // Reason → category. Colours are mid-lightness so they read on all three themes;
  // text always goes through color-mix with --ink for contrast.
  const CATS = [
    { k: 'sick',     label: 'Sick',          re: /sick|ill|ป่วย|ไข้/i,               c: 'oklch(0.66 0.17 25)' },
    { k: 'medical',  label: 'Medical',       re: /medic|doctor|hospital|แพทย์|หมอ/i, c: 'oklch(0.70 0.15 350)' },
    { k: 'personal', label: 'Personal',      re: /personal|family|กิจ/i,              c: 'oklch(0.68 0.13 255)' },
    { k: 'annual',   label: 'Annual',        re: /annual|vacation|พักร้อน/i,          c: 'oklch(0.72 0.14 150)' },
    { k: 'duty',     label: 'Official duty', re: /official|duty|ราชการ/i,             c: 'oklch(0.76 0.14 80)' },
    { k: 'training', label: 'Training',      re: /training|course|อบรม/i,             c: 'oklch(0.70 0.12 200)' },
    { k: 'exam',     label: 'Exam',          re: /exam|test|สอบ|caat/i,               c: 'oklch(0.66 0.15 295)' },
    { k: 'other',    label: 'Other',         re: /.*/,                               c: 'oklch(0.62 0.03 245)' },
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c.k, c]));
  const catOf = reason => (CATS.find(c => c.k !== 'other' && c.re.test(reason || '')) || CAT.other).k;

  const GROUPS = [
    { k: 'ap127', label: 'AP127 SP', c: 'var(--batch-ap127)' },
    { k: 'sp',    label: 'Other SP', c: 'oklch(0.72 0.15 280)' },
    { k: 'fi',    label: 'FI',       c: 'var(--col-stby)' },
  ];
  const GROUP = Object.fromEntries(GROUPS.map(g => [g.k, g]));
  const isAP127 = b => (window.isAP127Batch ? window.isAP127Batch(b) : /AP-?127/i.test(b || ''));
  const batchColor = b => {
    const m = /^AP-?(\d+)/i.exec(b || '');
    return m && ['124','126','127','128','129'].includes(m[1]) ? `var(--batch-ap${m[1]})` : 'var(--ink-3)';
  };

  const halfOf = dur => {
    if (!/half/i.test(dur || '')) return null;
    if (/\bPM\b|afternoon/i.test(dur)) return 'PM';
    if (/\bAM\b|morning/i.test(dur)) return 'AM';
    return 'HALF';
  };
  const durLabel = r => r.half === 'AM' ? 'Half day · AM' : r.half === 'PM' ? 'Half day · PM' : r.half ? 'Half day' : 'Full day';

  // ── Build the de-duplicated record set once ────────────────────────────────
  let _recs = null;
  const records = () => {
    if (_recs) return _recs;
    const map = new Map();
    (window.LEAVES || []).forEach(l => {
      const name = normName(l.name);
      if (!name || !l.start || !l.end) return;
      const reversed = l.end < l.start;
      const start = reversed ? l.end : l.start, end = reversed ? l.start : l.end;
      const sig = [name, l.batch, start, end, l.duration, l.reason, l.note, l.role].join('|');
      if (map.has(sig)) { map.get(sig).ids.push(l.id); return; }
      const role = l.role || '';
      const batch = (l.batch && !/^(-|N\/A)$/i.test(l.batch)) ? l.batch : '';
      const group = /instructor/i.test(role) ? 'fi' : isAP127(batch) ? 'ap127' : 'sp';
      const half = halfOf(l.duration);
      const roster = window.AP127_ROSTER_BY_KEY ? window.AP127_ROSTER_BY_KEY[name] : null;
      map.set(sig, {
        key: sig, ids: [l.id], name, rawName: l.name, role, batch, group, start, end, reversed,
        span: diffD(start, end) + 1, half, unit: half ? 0.5 : 1, duration: l.duration || '',
        reason: l.reason || 'On leave', cat: catOf(l.reason), note: l.note || '',
        callsign: group === 'ap127' && roster ? roster.nick : '',
        fullName: group === 'ap127' && roster ? roster.name : '',
        spFi: group === 'ap127' && roster && window.AP127_FI_FULL ? (window.AP127_FI_FULL[roster.fi] || roster.fi) : '',
      });
    });
    _recs = [...map.values()].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
    return _recs;
  };

  // Flights by person (student or instructor), non-cancelled only.
  let _fByName = null;
  const flightsOf = name => {
    if (!_fByName) {
      _fByName = new Map();
      (window.FLIGHTS || []).forEach(f => {
        if (f.status === 'Canceled') return;
        [f.student, f.instructor].forEach(n => {
          if (!n) return;
          const k = normName(n);
          if (!_fByName.has(k)) _fByName.set(k, []);
          _fByName.get(k).push(f);
        });
      });
    }
    return _fByName.get(name) || [];
  };
  const hm = t => { const m = /^(\d+):(\d+)/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 0; };
  // A flight clashes with a leave if it is on a leave day and, for a half day, falls in that half.
  const clashes = (r, f) => f.date >= r.start && f.date <= r.end
    && (r.half === 'AM' ? hm(f.start) < 720 : r.half === 'PM' ? hm(f.end || f.start) > 720 : true);
  const _conf = new Map();
  const conflictsOf = r => {
    if (!_conf.has(r.key)) _conf.set(r.key, flightsOf(r.name).filter(f => clashes(r, f)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)));
    return _conf.get(r.key);
  };

  // Person-day map for a set of records over [a, b]: date → name → { unit, recs }.
  const occupancy = (recs, a, b) => {
    const occ = {};
    recs.forEach(r => {
      if (r.end < a || r.start > b) return;
      const s = r.start < a ? a : r.start, e = r.end > b ? b : r.end;
      for (let d = s; d <= e; d = addD(d, 1)) {
        const day = occ[d] || (occ[d] = {});
        const cur = day[r.name] || (day[r.name] = { unit: 0, recs: [] });
        cur.unit = Math.max(cur.unit, r.unit);
        cur.recs.push(r);
      }
    });
    return occ;
  };

  // ── Persisted UI state ─────────────────────────────────────────────────────
  const LS = 'ap127v2-leave-ui';
  const loadUI = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const saveUI = s => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {} };

  // ── Small atoms ────────────────────────────────────────────────────────────
  const txt = c => `color-mix(in oklch, ${c} 72%, var(--ink))`;
  const tint = (c, p) => `color-mix(in oklch, ${c} ${p}%, transparent)`;

  const Chip = ({ on, onClick, color, children, title, small }) => h('button', {
    onClick, title, className: 'mono uc',
    style: {
      fontSize: small ? 9 : 10, padding: small ? '3px 8px' : '5px 10px', borderRadius: 6, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      border: '1px solid ' + (on ? (color || 'var(--highlight)') : 'var(--line)'),
      background: on ? tint(color || 'var(--highlight)', 14) : 'transparent',
      color: on ? (color ? txt(color) : 'var(--highlight)') : 'var(--ink-3)',
      fontWeight: on ? 600 : 400, transition: 'all .12s',
    },
  }, children);

  const Dot = ({ c, size = 8 }) => h('span', { style: { width: size, height: size, borderRadius: 2, background: c, display: 'inline-block', flexShrink: 0 } });

  const Label = ({ children, style }) => h('span', { className: 'mono uc', style: Object.assign({ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em' }, style) }, children);

  const Pill = ({ c, children, solid }) => h('span', {
    className: 'mono uc',
    style: { fontSize: 9, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600,
      background: solid ? c : tint(c, 18), color: solid ? 'var(--bg)' : txt(c), border: '1px solid ' + tint(c, 45) },
  }, children);

  // Half-day aware fill for a roster/week cell.
  const cellBg = (c, half) => half === 'AM' ? `linear-gradient(90deg, ${c} 50%, ${tint(c, 12)} 50%)`
    : half === 'PM' ? `linear-gradient(90deg, ${tint(c, 12)} 50%, ${c} 50%)`
    : half ? `linear-gradient(0deg, ${c} 50%, ${tint(c, 12)} 50%)` : c;


  // ── KPI strip ──────────────────────────────────────────────────────────────
  function Kpi({ label, value, sub, color, onClick, title }) {
    return h('div', {
      onClick, title,
      style: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px',
        borderTop: '3px solid ' + (color || 'var(--line)'), cursor: onClick ? 'pointer' : 'default', minWidth: 0 },
    },
      h(Label, null, label),
      h('div', { className: 'head num', style: { fontSize: 26, fontWeight: 700, lineHeight: 1.1, marginTop: 4, color: color ? txt(color) : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, value),
      sub && h('div', { style: { fontSize: 11, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, sub));
  }

  // ── Leave card (Day view) ──────────────────────────────────────────────────
  function LeaveCard({ r, date, onOpen, hideWho }) {
    const c = CAT[r.cat].c;
    const conf = conflictsOf(r).filter(f => !date || f.date === date);
    return h('div', {
      onClick: () => onOpen(r),
      style: { background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: '4px solid ' + c, borderRadius: 8,
        padding: '10px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 },
    },
      !hideWho && h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h(PersonLink, { name: r.name, style: { fontSize: 14, fontWeight: 700 } }),
        r.callsign && h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--batch-ap127)' } }, r.callsign),
        h('span', { style: { flex: 1 } }),
        r.batch && h(Pill, { c: batchColor(r.batch) }, r.batch),
        h(Pill, { c: GROUP[r.group].c }, r.group === 'fi' ? 'FI' : 'SP')),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
        h(Pill, { c, solid: true }, r.reason),
        h(Pill, { c: r.half ? 'var(--col-pending)' : 'var(--ink-3)' }, durLabel(r))),
      h('div', { className: 'mono', style: { fontSize: 11, color: 'var(--ink-2)' } },
        r.start === r.end ? fmtDY(r.start) : `${fmtDW(r.start)} → ${fmtDY(r.end)}`,
        ' · ', fmtDays(r.span * r.unit), r.span * r.unit === 1 ? ' day' : ' days',
        date && r.span > 1 ? ` · day ${diffD(r.start, date) + 1} of ${r.span}` : ''),
      r.note && h('div', { style: { fontSize: 12, color: 'var(--ink-2)', background: 'var(--bg-2)', borderRadius: 6, padding: '5px 8px', fontStyle: 'italic' } }, '“' + r.note + '”'),
      !hideWho && r.spFi && h('div', { style: { fontSize: 11, color: 'var(--ink-3)' } }, 'FI: ' + r.spFi),
      conf.length > 0 && h('div', { style: { fontSize: 11, color: txt('var(--col-cancel)'), background: tint('var(--col-cancel)', 12), borderRadius: 6, padding: '5px 8px' } },
        `⚠ ${conf.length} flight${conf.length > 1 ? 's' : ''} still booked: `,
        conf.slice(0, 3).map(f => `${f.start}–${f.end} ${f.lesson || ''}`.trim()).join(' · '),
        conf.length > 3 ? ' …' : ''),
      r.reversed && h('div', { style: { fontSize: 11, color: txt('var(--col-pending)') } }, '⚠ Start/end were reversed in the source record'));
  }

  // ── Person link: any SP/FI name opens their full leave history ───────────
  let _openPerson = () => {};
  const PersonLink = ({ name, style }) => h('span', {
    role: 'button', tabIndex: 0, title: `All leave for ${name}`,
    onClick: e => { e.stopPropagation(); _openPerson(name); },
    onKeyDown: e => { if (e.key === 'Enter') { e.stopPropagation(); _openPerson(name); } },
    style: Object.assign({ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--line)', textUnderlineOffset: 3 }, style),
  }, name);

  // ── Person drawer: every leave record for one person, in full ─────────────
  function PersonDetail({ name, allRecs, onClose, onOpen }) {
    useEffect(() => {
      const k = e => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, []);
    const mine = allRecs.filter(x => x.name === name).sort((a, b) => b.start.localeCompare(a.start));
    const roster = window.AP127_ROSTER_BY_KEY ? window.AP127_ROSTER_BY_KEY[name] : null;
    const f = mine[0] || { group: roster ? 'ap127' : 'sp', batch: roster ? 'AP-127' : '', role: roster ? 'Student' : '', callsign: roster ? roster.nick : '', fullName: roster ? roster.name : '', spFi: roster && window.AP127_FI_FULL ? (window.AP127_FI_FULL[roster.fi] || roster.fi) : '' };
    const occ = occupancy(mine, '0000-01-01', '9999-12-31');
    const t = today();
    let total = 0, past = 0, future = 0; const byCat = {};
    Object.entries(occ).forEach(([d, day]) => { const o = day[name]; total += o.unit; (d <= t ? (past += o.unit) : (future += o.unit)); byCat[o.recs[0].cat] = (byCat[o.recs[0].cat] || 0) + o.unit; });
    const current = mine.find(r => r.start <= t && r.end >= t);
    const clashes = mine.reduce((n, r) => n + conflictsOf(r).length, 0);
    const stat = (l, v, c) => h('div', { style: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' } },
      h(Label, null, l), h('div', { className: 'head num', style: { fontSize: 20, fontWeight: 700, color: c ? txt(c) : 'var(--ink)' } }, v));
    return h('div', { onClick: onClose, style: { position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' } },
      h('div', { onClick: e => e.stopPropagation(), style: { width: 'min(520px, 100vw)', height: '100%', overflowY: 'auto', background: 'var(--bg)', borderLeft: '1px solid var(--line)', boxShadow: 'var(--shadow)', padding: 18 } },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 } },
          h('div', { style: { flex: 1 } },
            h(Label, null, 'Leave history'),
            h('div', { className: 'head', style: { fontSize: 24, fontWeight: 700, lineHeight: 1.15 } }, name),
            h('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, [f.fullName, f.callsign, f.role, f.batch, f.spFi && 'FI: ' + f.spFi].filter(Boolean).join(' · '))),
          h('button', { onClick: onClose, 'aria-label': 'Close', style: { background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink-2)', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', fontSize: 16 } }, '×')),
        current && h('div', { style: { marginBottom: 10, fontSize: 12, padding: '6px 10px', borderRadius: 6, background: tint('var(--highlight)', 14), color: txt('var(--highlight)') } },
          `On leave today — ${current.reason}, until ${fmtDW(current.end)}`),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 } },
          stat('Records', mine.length), stat('Leave days', fmtDays(total), 'var(--col-stby)'),
          stat('Taken', fmtDays(past)), stat('Upcoming', fmtDays(future), 'var(--col-pending)')),
        total > 0 && h('div', { style: { marginBottom: 12 } },
          h('div', { style: { display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 6 } },
            CATS.filter(c => byCat[c.k]).map(c => h('div', { key: c.k, title: `${c.label} ${fmtDays(byCat[c.k])}d`, style: { flex: byCat[c.k], background: c.c } }))),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--ink-2)' } },
            CATS.filter(c => byCat[c.k]).map(c => h('span', { key: c.k, style: { display: 'inline-flex', alignItems: 'center', gap: 4 } }, h(Dot, { c: c.c }), `${c.label} ${fmtDays(byCat[c.k])}d (${Math.round(byCat[c.k] / total * 100)}%)`)))),
        clashes > 0 && h('div', { style: { fontSize: 11, marginBottom: 10, color: txt('var(--col-cancel)') } }, `⚠ ${clashes} flight${clashes > 1 ? 's' : ''} booked on leave days (details on each record)`),
        h(Label, null, `All records · newest first`),
        mine.length === 0
          ? h('div', { style: { padding: 24, textAlign: 'center', color: 'var(--ink-3)', border: '1px dashed var(--line)', borderRadius: 8, marginTop: 6 } }, 'No leave records for this person.')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 } },
              mine.map(r => h('div', { key: r.key, style: { position: 'relative' } },
                r.start > t && h('span', { className: 'mono uc', style: { position: 'absolute', right: 10, bottom: 8, fontSize: 9, color: txt('var(--col-pending)') } }, 'upcoming'),
                h(LeaveCard, { r, onOpen, hideWho: true })))) ));
  }

  // ── Detail drawer ──────────────────────────────────────────────────────────
  function Detail({ r, onClose, onJump, allRecs }) {
    useEffect(() => {
      const k = e => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    }, []);
    const c = CAT[r.cat].c;
    const conf = conflictsOf(r);
    const mine = allRecs.filter(x => x.name === r.name);
    const occ = occupancy(mine, '0000-01-01', '9999-12-31');
    const totalDays = Object.values(occ).reduce((s, p) => s + p[r.name].unit, 0);
    const row = (k, v) => v ? h('div', { style: { display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 } },
      h(Label, { style: { paddingTop: 2 } }, k), h('div', { style: { color: 'var(--ink)', wordBreak: 'break-word' } }, v)) : null;
    return h('div', { onClick: onClose, style: { position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' } },
      h('div', { onClick: e => e.stopPropagation(), style: { width: 'min(460px, 100vw)', height: '100%', overflowY: 'auto', background: 'var(--bg)', borderLeft: '1px solid var(--line)', boxShadow: 'var(--shadow)', padding: 18 } },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 } },
          h('div', { style: { flex: 1 } },
            h(Label, null, 'Leave record'),
            h('div', { className: 'head', style: { fontSize: 24, fontWeight: 700, lineHeight: 1.15 } }, h(PersonLink, { name: r.name })),
            (r.fullName || r.callsign) && h('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, [r.fullName, r.callsign].filter(Boolean).join(' · '))),
          h('button', { onClick: onClose, 'aria-label': 'Close', style: { background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink-2)', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', fontSize: 16 } }, '×')),
        h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 } },
          h(Pill, { c, solid: true }, r.reason), h(Pill, { c: r.half ? 'var(--col-pending)' : 'var(--ink-3)' }, durLabel(r)),
          h(Pill, { c: GROUP[r.group].c }, GROUP[r.group].label)),
        row('Name', r.rawName !== r.name ? `${r.name} (source: “${r.rawName}”)` : r.name),
        row('Role', r.role || '—'),
        row('Batch', r.batch || '—'),
        r.spFi && row('Student FI', r.spFi),
        row('Reason', r.reason),
        row('Category', CAT[r.cat].label),
        row('Duration', r.duration || 'Full Day'),
        row('Start', fmtDY(r.start)),
        row('End', fmtDY(r.end)),
        row('Length', `${r.span} calendar day${r.span > 1 ? 's' : ''}${r.half ? ` × ½ = ${fmtDays(r.span * r.unit)} leave days` : ''}`),
        row('Note', r.note || '—'),
        r.reversed && row('Data check', '⚠ End date was before start date in the source; dates were swapped for display.'),
        row('Source ids', h('div', { className: 'mono', style: { fontSize: 11, color: 'var(--ink-2)' } }, r.ids.map(id => h('div', { key: id }, id)))),
        h('div', { style: { marginTop: 16 } },
          h(Label, null, `Flights booked during this leave · ${conf.length}`),
          conf.length === 0
            ? h('div', { style: { fontSize: 12, color: txt('var(--col-done)'), marginTop: 6 } }, '✓ No active bookings clash with this leave')
            : conf.map(f => h('div', { key: f.id, style: { fontSize: 12, marginTop: 6, padding: '6px 8px', borderRadius: 6, background: tint('var(--col-cancel)', 10), border: '1px solid ' + tint('var(--col-cancel)', 35) } },
                h('span', { className: 'mono' }, `${fmtDW(f.date)} ${f.start}–${f.end}`), ' · ', f.lesson || '—', ' · ', f.tail || f.type || '', ' · ', f.status,
                h('div', { style: { color: 'var(--ink-3)', fontSize: 11 } }, `SP ${f.student || '—'} · FI ${f.instructor || '—'}`)))),
        h('div', { style: { marginTop: 16 } },
          h(Label, null, `All leave for ${r.name} · ${mine.length} record${mine.length > 1 ? 's' : ''} · ${fmtDays(totalDays)} days`),
          mine.map(x => h('div', { key: x.key, onClick: () => onJump(x),
            style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 5, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
              background: x.key === r.key ? tint(CAT[x.cat].c, 16) : 'var(--bg-2)' } },
            h(Dot, { c: CAT[x.cat].c }),
            h('span', { className: 'mono', style: { minWidth: 150 } }, x.start === x.end ? fmtD(x.start) : `${fmtD(x.start)} → ${fmtD(x.end)}`),
            h('span', { style: { flex: 1 } }, x.reason),
            h('span', { className: 'mono', style: { color: 'var(--ink-3)' } }, fmtDays(x.span * x.unit) + 'd'))))));
  }

  // ── Views ──────────────────────────────────────────────────────────────────
  const groupSort = (a, b) => GROUPS.findIndex(g => g.k === a.group) - GROUPS.findIndex(g => g.k === b.group) || a.name.localeCompare(b.name);

  function DayView({ date, occ, onOpen, nextDate, prevDate, go }) {
    const day = occ[date] || {};
    const recs = [];
    Object.values(day).forEach(p => p.recs.forEach(r => { if (!recs.includes(r)) recs.push(r); }));
    recs.sort(groupSort);
    const hol = holidays().has(date);
    return h('div', null,
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 } },
        h('div', { className: 'head', style: { fontSize: 22, fontWeight: 700 } }, fmtDY(date)),
        date === today() && h(Pill, { c: 'var(--highlight)' }, 'Today'),
        hol && h(Pill, { c: 'var(--col-pending)' }, 'Holiday'),
        isWkd(date) && h(Pill, { c: 'var(--ink-3)' }, 'Weekend'),
        h('span', { style: { color: 'var(--ink-2)', fontSize: 13 } }, `${Object.keys(day).length} ${Object.keys(day).length === 1 ? 'person' : 'people'} on leave`)),
      recs.length === 0
        ? h('div', { style: { padding: '40px 16px', textAlign: 'center', border: '1px dashed var(--line)', borderRadius: 10, color: 'var(--ink-3)' } },
            h('div', { style: { fontSize: 15, marginBottom: 10 } }, 'No one in this filter is on leave on this day.'),
            h('div', { style: { display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' } },
              prevDate && h(Chip, { onClick: () => go(prevDate) }, '← Previous leave · ' + fmtD(prevDate)),
              nextDate && h(Chip, { onClick: () => go(nextDate) }, 'Next leave · ' + fmtD(nextDate) + ' →')))
        : GROUPS.map(g => {
            const rs = recs.filter(r => r.group === g.k);
            if (!rs.length) return null;
            return h('div', { key: g.k, style: { marginBottom: 16 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 } }, h(Dot, { c: g.c }), h(Label, null, `${g.label} · ${new Set(rs.map(r => r.name)).size}`)),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 } },
                rs.map(r => h(LeaveCard, { key: r.key, r, date, onOpen }))));
          }));
  }

  // Week: one row per person, bars across Mon–Sun.
  function WeekView({ start, recs, occ, onOpen, onDay, mobile }) {
    const days = range(start, addD(start, 6));
    const end = days[6];
    const inWeek = recs.filter(r => r.end >= start && r.start <= end);
    const people = [...new Set(inWeek.map(r => r.name))].map(n => inWeek.find(r => r.name === n)).sort(groupSort);
    const nameW = mobile ? 110 : 170;
    const cols = `${nameW}px repeat(7, minmax(${mobile ? 44 : 60}px, 1fr))`;
    const t = today(), hol = holidays();
    const headBg = d => d === t ? tint('var(--highlight)', 16) : hol.has(d) ? tint('var(--col-pending)', 12) : isWkd(d) ? 'var(--bg-2)' : 'transparent';
    return h('div', { style: { overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' } },
      h('div', { style: { minWidth: nameW + 7 * (mobile ? 44 : 60) } },
        h('div', { style: { display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 } },
          h('div', { style: { padding: 8, position: 'sticky', left: 0, background: 'var(--surface)' } }, h(Label, null, `${people.length} people`)),
          days.map(d => {
            const n = Object.keys(occ[d] || {}).length;
            return h('div', { key: d, onClick: () => onDay(d), title: 'Open day view', style: { padding: '6px 4px', textAlign: 'center', cursor: 'pointer', background: headBg(d), borderLeft: '1px solid var(--line-soft)' } },
              h('div', { className: 'mono uc', style: { fontSize: 9, color: 'var(--ink-2)', fontWeight: 600 } }, MON[+d.slice(5, 7) - 1]),
              h('div', { className: 'mono uc', style: { fontSize: 9, color: 'var(--ink-3)' } }, DOW[dow(d)] + (hol.has(d) ? ' · HOL' : '')),
              h('div', { className: 'head', style: { fontSize: 16, fontWeight: 700, color: d === t ? 'var(--highlight)' : 'var(--ink)' } }, +d.slice(8)),
              h('div', { className: 'mono', style: { fontSize: 10, color: n ? 'var(--ink-2)' : 'var(--ink-3)' } }, n ? `${n} off` : '—'));
          })),
        people.length === 0 && h('div', { style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)' } }, 'No leave this week for the current filter.'),
        people.map(p => {
          const rs = inWeek.filter(r => r.name === p.name);
          return h('div', { key: p.name, style: { display: 'grid', gridTemplateColumns: cols, gridAutoRows: 'minmax(34px, auto)', borderBottom: '1px solid var(--line-soft)', alignItems: 'center' } },
            h('div', { style: { gridRow: `1 / span ${rs.length}`, gridColumn: 1, padding: '6px 8px', position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid var(--line-soft)' } },
              h('div', { style: { fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 } }, h(Dot, { c: GROUP[p.group].c, size: 6 }), h(PersonLink, { name: p.name })),
              h('div', { className: 'mono', style: { fontSize: 10, color: 'var(--ink-3)' } }, [p.callsign, p.batch || (p.group === 'fi' ? 'FI' : '')].filter(Boolean).join(' · '))),
            days.map((d, i) => h('div', { key: d, style: { gridRow: `1 / span ${rs.length}`, gridColumn: i + 2, alignSelf: 'stretch', background: headBg(d), borderLeft: '1px solid var(--line-soft)' } })),
            rs.map((r, j) => {
              const s = r.start < start ? start : r.start, e = r.end > end ? end : r.end;
              const c = CAT[r.cat].c, a = diffD(start, s) + 2, b = diffD(start, e) + 3;
              return h('div', { key: r.key, onClick: () => onOpen(r), title: `${r.name} · ${r.reason} · ${durLabel(r)} · ${fmtD(r.start)}–${fmtD(r.end)}${r.note ? ' · ' + r.note : ''}`,
                style: { gridRow: j + 1, gridColumn: `${a} / ${b}`, margin: '4px 3px', padding: '4px 7px', borderRadius: 6, cursor: 'pointer', zIndex: 1, minWidth: 0,
                  background: cellBg(tint(c, 38), r.half), border: '1px solid ' + c, color: txt(c), fontSize: 11, fontWeight: 600,
                  borderTopLeftRadius: r.start < start ? 0 : 6, borderBottomLeftRadius: r.start < start ? 0 : 6,
                  borderTopRightRadius: r.end > end ? 0 : 6, borderBottomRightRadius: r.end > end ? 0 : 6,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                (r.start < start ? '‹ ' : '') + r.reason + (r.half ? ` (${r.half === 'HALF' ? '½' : r.half})` : '') + (conflictsOf(r).some(f => f.date >= s && f.date <= e) ? ' ⚠' : '') + (r.end > end ? ' ›' : ''));
            }));
        })));
  }

  // Month: calendar grid; each day lists who is off.
  function MonthView({ anchor, occ, onDay, onOpen, mobile }) {
    const ms = monthStart(anchor), me = monthEnd(anchor);
    const days = range(weekStart(ms), addD(weekStart(me), 6));
    const t = today(), hol = holidays();
    const max = mobile ? 0 : 4;
    return h('div', { style: { border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' } },
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' } },
        ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => h('div', { key: d, className: 'mono uc', style: { fontSize: 9, padding: '6px 8px', color: 'var(--ink-3)' } }, d))),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' } },
        days.map(d => {
          const inM = d >= ms && d <= me, day = occ[d] || {}, names = Object.keys(day);
          const recs = names.map(n => ({ n, r: day[n].recs[0], unit: day[n].unit })).sort((a, b) => groupSort(a.r, b.r));
          return h('div', { key: d, onClick: () => onDay(d),
            style: { minHeight: mobile ? 58 : 118, padding: 5, cursor: 'pointer', borderRight: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)',
              background: d === t ? tint('var(--highlight)', 10) : hol.has(d) ? tint('var(--col-pending)', 9) : isWkd(d) ? 'var(--bg-2)' : 'transparent',
              opacity: inM ? 1 : 0.4, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
              h('span', { className: 'head', style: { fontWeight: 700, fontSize: 14, color: d === t ? 'var(--highlight)' : 'var(--ink)' } }, +d.slice(8) + (d.slice(8) === '01' || d === days[0] ? ' ' + MON[+d.slice(5, 7) - 1] : '')),
              hol.has(d) && !mobile && h('span', { className: 'mono uc', style: { fontSize: 8, color: txt('var(--col-pending)') } }, 'HOL'),
              h('span', { style: { flex: 1 } }),
              names.length > 0 && h('span', { className: 'mono', style: { fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: tint('var(--highlight)', 18), color: txt('var(--highlight)') } }, names.length)),
            mobile
              ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 2 } }, recs.slice(0, 8).map(x => h(Dot, { key: x.n, c: CAT[x.r.cat].c, size: 6 })))
              : [
                  ...recs.slice(0, max).map(x => h('div', { key: x.n, onClick: e => { e.stopPropagation(); onOpen(x.r); },
                    title: `${x.n} · ${x.r.reason} · ${durLabel(x.r)}${x.r.note ? ' · ' + x.r.note : ''}`,
                    style: { fontSize: 10.5, padding: '2px 5px', borderRadius: 4, background: cellBg(tint(CAT[x.r.cat].c, 26), x.r.half), color: txt(CAT[x.r.cat].c),
                      borderLeft: '3px solid ' + GROUP[x.r.group].c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } },
                    (x.r.callsign || x.n) + (x.unit < 1 ? ' ½' : ''))),
                  recs.length > max && h('div', { key: 'more', className: 'mono', style: { fontSize: 10, color: 'var(--ink-3)' } }, `+${recs.length - max} more`),
                ]);
        })));
  }

  // Roster: people × days of the month.
  function RosterView({ anchor, recs, occ, onOpen, onDay, groups, mobile, sortBy, setSortBy }) {
    const ms = monthStart(anchor), me = monthEnd(anchor);
    const days = range(ms, me);
    const t = today(), hol = holidays();
    // AP127 SPs always all listed (zero-leave students too) so the roster is complete.
    const rows = new Map();
    if (groups.ap127 && window.AP127_ROSTER_BY_KEY)
      Object.entries(window.AP127_ROSTER_BY_KEY).forEach(([k, v]) => rows.set(k, { name: k, group: 'ap127', callsign: v.nick, batch: 'AP-127' }));
    recs.forEach(r => { if (r.end >= ms && r.start <= me && !rows.has(r.name)) rows.set(r.name, { name: r.name, group: r.group, callsign: r.callsign, batch: r.batch }); });
    const total = n => days.reduce((s, d) => s + ((occ[d] || {})[n] ? occ[d][n].unit : 0), 0);
    const list = [...rows.values()].map(p => Object.assign(p, { days: total(p.name) }))
      .sort(sortBy === 'days' ? ((a, b) => b.days - a.days || groupSort(a, b)) : groupSort);
    const cw = mobile ? 22 : 28, nameW = mobile ? 120 : 190;
    const stickyL = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)' };
    return h('div', { style: { overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)', maxHeight: '70vh' } },
      h('table', { style: { borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 } },
        h('thead', null, h('tr', null,
          h('th', { style: Object.assign({}, stickyL, { top: 0, zIndex: 3, minWidth: nameW, textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)' }) },
            h('button', { onClick: () => setSortBy(sortBy === 'days' ? 'name' : 'days'), className: 'mono uc', style: { fontSize: 9, background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 0 } },
              `${list.length} people · sort: ${sortBy === 'days' ? 'most leave' : 'name'} ⇅`)),
          days.map(d => h('th', { key: d, onClick: () => onDay(d), title: fmtDY(d),
            style: { position: 'sticky', top: 0, zIndex: 2, width: cw, minWidth: cw, padding: '4px 0', cursor: 'pointer', borderBottom: '1px solid var(--line)',
              background: d === t ? 'color-mix(in oklch, var(--highlight) 20%, var(--surface))' : hol.has(d) ? 'color-mix(in oklch, var(--col-pending) 14%, var(--surface))' : isWkd(d) ? 'var(--bg-2)' : 'var(--surface)' } },
            h('div', { className: 'mono uc', style: { fontSize: 7.5, color: 'var(--ink-2)', fontWeight: 600 } }, MON[+d.slice(5, 7) - 1]),
            h('div', { className: 'mono', style: { fontSize: 8, color: 'var(--ink-3)', fontWeight: 400 } }, DOW[dow(d)][0]),
            h('div', { className: 'mono', style: { fontSize: 10, color: d === t ? 'var(--highlight)' : 'var(--ink-2)' } }, +d.slice(8)))),
          h('th', { style: { position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)', padding: '4px 8px', borderBottom: '1px solid var(--line)' } }, h(Label, null, 'Days')))),
        h('tbody', null,
          list.map(p => h('tr', { key: p.name },
            h('td', { style: Object.assign({}, stickyL, { padding: '4px 8px', borderBottom: '1px solid var(--line-soft)', borderRight: '1px solid var(--line-soft)', whiteSpace: 'nowrap' }) },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 } }, h(Dot, { c: GROUP[p.group].c, size: 6 }), h(PersonLink, { name: p.name })),
              h('div', { className: 'mono', style: { fontSize: 9.5, color: 'var(--ink-3)' } }, [p.callsign, p.batch || (p.group === 'fi' ? 'FI' : '')].filter(Boolean).join(' · '))),
            days.map(d => {
              const o = (occ[d] || {})[p.name], r = o && o.recs[0];
              return h('td', { key: d, onClick: r ? () => onOpen(r) : undefined,
                title: r ? `${p.name} · ${fmtDW(d)} · ${r.reason} · ${durLabel(r)}${r.note ? ' · ' + r.note : ''}` : undefined,
                style: { padding: 2, borderBottom: '1px solid var(--line-soft)', background: isWkd(d) || hol.has(d) ? 'var(--bg-2)' : 'transparent', cursor: r ? 'pointer' : 'default' } },
                r ? h('div', { style: { height: 20, borderRadius: 4, background: cellBg(CAT[r.cat].c, o.unit < 1 ? (r.half || 'HALF') : null), boxShadow: conflictsOf(r).some(f => f.date === d) ? '0 0 0 2px var(--col-cancel)' : 'none' } }) : null);
            }),
            h('td', { className: 'mono', style: { padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-soft)', fontWeight: 700, color: p.days ? 'var(--ink)' : 'var(--ink-3)' } }, p.days ? fmtDays(p.days) : '0'))),
          h('tr', null,
            h('td', { style: Object.assign({}, stickyL, { padding: '6px 8px', background: 'var(--bg-2)' }) }, h(Label, null, 'On leave / day')),
            days.map(d => { const n = Object.keys(occ[d] || {}).length; return h('td', { key: d, className: 'mono', style: { textAlign: 'center', background: 'var(--bg-2)', fontSize: 10, fontWeight: 700, color: n ? 'var(--ink)' : 'var(--ink-3)' } }, n || '·'); }),
            h('td', { className: 'mono', style: { background: 'var(--bg-2)', textAlign: 'right', padding: '6px 8px', fontWeight: 700 } }, fmtDays(list.reduce((s, p) => s + p.days, 0)))))));
  }

  // All records overlapping the period, every field, sortable by date.
  function RecordTable({ recs, onOpen, a, b }) {
    const [open, setOpen] = useState(true);
    const rs = recs.filter(r => r.end >= a && r.start <= b);
    const th = t => h('th', { className: 'mono uc', style: { fontSize: 9, color: 'var(--ink-3)', textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--surface)' } }, t);
    const td = (c, s) => h('td', { style: Object.assign({ padding: '6px 8px', borderBottom: '1px solid var(--line-soft)', verticalAlign: 'top' }, s) }, c);
    return h('div', { style: { marginTop: 16 } },
      h('button', { onClick: () => setOpen(!open), className: 'mono uc', style: { fontSize: 10, background: 'transparent', border: 'none', color: 'var(--ink-2)', cursor: 'pointer', padding: '4px 0', marginBottom: 6 } },
        `${open ? '▾' : '▸'} Leave records in this period · ${rs.length}`),
      open && rs.length > 0 && h('div', { style: { overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface)' } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
          h('thead', null, h('tr', null, ['Name', 'Role', 'Batch', 'Reason', 'Duration', 'Start', 'End', 'Days', 'Note', 'Clash'].map(th))),
          h('tbody', null, rs.map(r => {
            const n = conflictsOf(r).length;
            return h('tr', { key: r.key, onClick: () => onOpen(r), style: { cursor: 'pointer' } },
              td(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, whiteSpace: 'nowrap' } }, h(Dot, { c: GROUP[r.group].c, size: 6 }), h(PersonLink, { name: r.name }), r.callsign ? ' · ' + r.callsign : '')),
              td(r.role || '—', { color: 'var(--ink-2)' }),
              td(r.batch || '—', { whiteSpace: 'nowrap', color: txt(batchColor(r.batch)) }),
              td(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' } }, h(Dot, { c: CAT[r.cat].c }), r.reason)),
              td(r.duration || 'Full Day', { whiteSpace: 'nowrap', color: 'var(--ink-2)' }),
              td(fmtDW(r.start), { whiteSpace: 'nowrap' }),
              td(fmtDW(r.end) + (r.reversed ? ' ⚠' : ''), { whiteSpace: 'nowrap' }),
              td(fmtDays(r.span * r.unit), { textAlign: 'right' }),
              td(r.note || '', { color: 'var(--ink-2)', minWidth: 160 }),
              td(n ? `⚠ ${n}` : '', { color: txt('var(--col-cancel)'), whiteSpace: 'nowrap' }));
          })))));
  }

  // ── Board ──────────────────────────────────────────────────────────────────
  const VIEWS = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' }, { id: 'roster', label: 'Roster' },
  ];

  function LeaveBoard() {
    const app = window.useData ? window.useData() : {};
    const mobile = !!(app && app.isMobile);
    const init = useMemo(loadUI, []);
    const [view, setView]     = useState(init.view || 'month');
    const [date, setDate]     = useState(today());
    const [groups, setGroups] = useState(init.groups || { ap127: true, sp: false, fi: false });
    const [batches, setBatches] = useState(init.batches || null);   // null = all other batches
    const [fiScope, setFiScope] = useState(init.fiScope || 'all');  // all | ap127
    const [cats, setCats]     = useState(init.cats || []);          // [] = all reasons
    const [q, setQ]           = useState('');
    const [sortBy, setSortBy] = useState(init.sortBy || 'name');
    const [sel, setSel]       = useState(null);
    const [person, setPerson] = useState(null);
    _openPerson = n => { setSel(null); setPerson(n); };

    useEffect(() => { saveUI({ view, groups, batches, fiScope, cats, sortBy }); }, [view, groups, batches, fiScope, cats, sortBy]);

    const all = useMemo(records, []);
    const otherBatches = useMemo(() => [...new Set(all.filter(r => r.group === 'sp').map(r => r.batch || '—'))].sort(), [all]);
    const ap127Fis = useMemo(() => new Set(Object.values(window.AP127_FI_FULL || {}).map(normName)), []);

    // WHO + reason + search filters
    const recs = useMemo(() => {
      const qq = q.trim().toUpperCase();
      return all.filter(r => groups[r.group]
        && (r.group !== 'sp' || !batches || batches.includes(r.batch || '—'))
        && (r.group !== 'fi' || fiScope === 'all' || ap127Fis.has(r.name))
        && (!cats.length || cats.includes(r.cat))
        && (!qq || (r.name + ' ' + r.callsign + ' ' + r.fullName + ' ' + r.reason + ' ' + r.note + ' ' + r.batch).toUpperCase().includes(qq)));
    }, [all, groups, batches, fiScope, cats, q]);

    // Period for the current view
    const [a, b] = view === 'day' ? [date, date]
      : view === 'week' ? [weekStart(date), addD(weekStart(date), 6)]
      : [monthStart(date), monthEnd(date)];
    const span = view === 'month' ? [weekStart(a), addD(weekStart(b), 6)] : [a, b];  // month grid shows spill-over days
    const occ = useMemo(() => occupancy(recs, span[0], span[1]), [recs, span[0], span[1]]);

    // Nearest leave dates around the cursor (for the Day view's empty state)
    const leaveDates = useMemo(() => {
      const s = new Set();
      recs.forEach(r => { for (let d = r.start; d <= r.end; d = addD(d, 1)) s.add(d); });
      return [...s].sort();
    }, [recs]);
    const nextDate = leaveDates.find(d => d > date) || null;
    const prevDate = [...leaveDates].reverse().find(d => d < date) || null;

    // ── KPIs ────────────────────────────────────────────────────────────────
    const kpi = useMemo(() => {
      const t = today();
      const tOcc = occupancy(recs, t, t)[t] || {};
      const tNames = Object.keys(tOcc);
      const pd = range(a, b);
      const occP = occupancy(recs, a, b);
      const perPerson = {}, perCat = {};
      let days = 0, clashDays = 0, clashFlights = 0, peak = { d: null, n: 0 };
      pd.forEach(d => {
        const day = occP[d] || {};
        const n = Object.keys(day).length;
        if (n > peak.n) peak = { d, n };
        Object.entries(day).forEach(([name, o]) => {
          days += o.unit;
          perPerson[name] = (perPerson[name] || 0) + o.unit;
          perCat[o.recs[0].cat] = (perCat[o.recs[0].cat] || 0) + o.unit;
          const fl = o.recs.flatMap(r => conflictsOf(r).filter(f => f.date === d));
          const uniq = new Set(fl.map(f => f.id));
          if (uniq.size) { clashDays++; clashFlights += uniq.size; }
        });
      });
      const inP = recs.filter(r => r.end >= a && r.start <= b);
      const people = Object.keys(perPerson);
      const top = Object.entries(perPerson).sort((x, y) => y[1] - x[1])[0];
      const topCat = Object.entries(perCat).sort((x, y) => y[1] - x[1])[0];
      const upcoming = recs.filter(r => r.start > t && r.start <= addD(t, 14));
      const onlyAP = groups.ap127 && !groups.sp && !groups.fi;
      const rosterN = onlyAP && window.AP127_ROSTER_BY_KEY ? Object.keys(window.AP127_ROSTER_BY_KEY).length : 0;
      const byGroup = {};
      people.forEach(n => { const r = recs.find(x => x.name === n); byGroup[r.group] = (byGroup[r.group] || 0) + 1; });
      return { byGroup, tNames, tOcc, days, people, rosterN, top, topCat, peak, inP, upcoming, clashDays, clashFlights, pdLen: pd.length };
    }, [recs, a, b, groups]);

    const periodLabel = view === 'day' ? fmtDY(date)
      : view === 'week' ? `${fmtD(a)} – ${fmtD(b)} ${b.slice(0, 4)}`
      : fmtMY(date);
    const periodWord = view === 'day' ? 'this day' : view === 'week' ? 'this week' : 'this month';

    const step = n => setDate(view === 'day' ? addD(date, n) : view === 'week' ? addD(date, 7 * n) : addMonths(date, n));
    const goDay = d => { setDate(d); setView('day'); };
    const openRec = r => setSel(r);
    const toggleCat = k => setCats(cs => cs.includes(k) ? cs.filter(x => x !== k) : cs.concat(k));
    const toggleGroup = k => setGroups(g => Object.assign({}, g, { [k]: !g[k] }));

    // Keyboard: ← → move period, T today, D/W/M/R switch view (ignored while typing).
    useEffect(() => {
      const k = e => {
        if (sel || person || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '') || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'ArrowRight') step(1);
        else if (e.key === 't' || e.key === 'T') setDate(today());
        else { const v = { d: 'day', w: 'week', m: 'month', r: 'roster' }[e.key.toLowerCase()]; if (v) setView(v); }
      };
      window.addEventListener('keydown', k);
      return () => window.removeEventListener('keydown', k);
    });

    const navBtn = (label, onClick, title) => h('button', { onClick, title, className: 'mono',
      style: { fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' } }, label);

    const row = (children, extra) => h('div', { style: Object.assign({ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }, extra) }, children);
    const k = kpi;

    return h('div', { style: { height: '100%', overflow: 'auto', padding: mobile ? 10 : 14, display: 'flex', flexDirection: 'column', gap: 12 } },
      // Row 1 — view + navigation
      row([
        h(Label, { key: 'vl' }, 'Leave view'),
        h('div', { key: 'v', style: { display: 'flex', gap: 4, padding: 3, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg-2)' } },
          VIEWS.map(v => h('button', { key: v.id, onClick: () => setView(v.id), title: `${v.label} view (${v.label[0]})`, className: 'mono uc',
            style: { fontSize: 10, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: view === v.id ? 'var(--highlight)' : 'transparent', color: view === v.id ? 'var(--bg)' : 'var(--ink-2)', fontWeight: view === v.id ? 700 : 500 } }, v.label))),
        h('div', { key: 'n', style: { display: 'flex', gap: 4, alignItems: 'center' } },
          navBtn('‹', () => step(-1), 'Previous (←)'), navBtn('Today', () => setDate(today()), 'Jump to today (T)'), navBtn('›', () => step(1), 'Next (→)')),
        h('div', { key: 'l', className: 'head', style: { fontSize: 20, fontWeight: 700, marginLeft: 4 } }, periodLabel),
        h('span', { key: 's', style: { flex: 1 } }),
        h('input', { key: 'd', type: 'date', value: date, onChange: e => e.target.value && setDate(e.target.value), title: 'Go to any date',
          style: { fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', colorScheme: 'light dark' } }),
      ]),
      // Row 2 — WHO filter + search
      row([
        h(Label, { key: 'l', style: { marginRight: 2 } }, 'Show'),
        ...GROUPS.map(g => h(Chip, { key: g.k, on: groups[g.k], color: g.c, onClick: () => toggleGroup(g.k) }, h(Dot, { c: g.c, size: 6 }), g.label)),
        groups.sp && h('span', { key: 'sb', style: { display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', paddingLeft: 6, borderLeft: '1px solid var(--line)', maxWidth: '100%' } },
          h(Label, null, 'Batch'),
          otherBatches.map(bt => h(Chip, { key: bt, small: true, on: !batches || batches.includes(bt), color: batchColor(bt),
            onClick: () => setBatches(cur => { const s = cur || otherBatches; const n = s.includes(bt) ? s.filter(x => x !== bt) : s.concat(bt); return n.length === otherBatches.length ? null : n; }) }, bt))),
        groups.fi && h('span', { key: 'fs', style: { display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', paddingLeft: 6, borderLeft: '1px solid var(--line)', maxWidth: '100%' } },
          h(Label, null, 'FI'),
          h(Chip, { small: true, on: fiScope === 'all', onClick: () => setFiScope('all') }, 'All FIs'),
          h(Chip, { small: true, on: fiScope === 'ap127', onClick: () => setFiScope('ap127'), title: 'Only FIs assigned to AP127 students' }, 'AP127 FIs')),
        !groups.ap127 && !groups.sp && !groups.fi && h('span', { key: 'none', style: { fontSize: 11, color: txt('var(--col-pending)') } }, 'Pick at least one group'),
        h('span', { key: 'sp', style: { flex: 1 } }),
        h('input', { key: 'q', value: q, onChange: e => setQ(e.target.value), placeholder: 'Search name, reason, note…',
          style: { fontSize: 12, padding: '5px 9px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', minWidth: mobile ? 0 : 220, flex: mobile ? 1 : 'none' } }),
      ]),
      // Row 3 — reason legend / filter
      row([
        h(Label, { key: 'l', style: { marginRight: 2 } }, 'Reason'),
        ...CATS.map(c => h(Chip, { key: c.k, small: true, on: !cats.length || cats.includes(c.k), color: c.c, onClick: () => toggleCat(c.k),
          title: cats.length ? 'Toggle' : 'Click to show only this reason (click more to add)' }, h(Dot, { c: c.c }), c.label)),
        cats.length > 0 && h('button', { key: 'clr', onClick: () => setCats([]), className: 'mono uc', style: { fontSize: 9, background: 'transparent', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', textDecoration: 'underline' } }, 'All reasons'),
        h('span', { key: 'hint', className: 'mono', style: { fontSize: 10, color: 'var(--ink-3)', marginLeft: 6 } }, '▌half-fill = half day (AM left / PM right) · ⚠ = flight still booked'),
      ]),
      // KPI strip
      h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${mobile ? 140 : 165}px, 1fr))`, gap: 8 } },
        h(Kpi, { label: 'On leave today', value: k.tNames.length, color: 'var(--highlight)', onClick: () => goDay(today()), title: 'Open today in Day view',
          sub: k.tNames.length ? k.tNames.slice(0, 3).join(', ') + (k.tNames.length > 3 ? ` +${k.tNames.length - 3}` : '') : 'Nobody off today' }),
        h(Kpi, { label: `Leave days · ${periodWord}`, value: fmtDays(k.days), color: 'var(--col-stby)',
          sub: k.people.length ? `avg ${(k.days / k.people.length).toFixed(1)} days per person off` : 'No leave in period' }),
        h(Kpi, { label: `People on leave · ${periodWord}`, value: k.rosterN ? `${k.people.length}/${k.rosterN}` : k.people.length,
          sub: k.rosterN ? `${Math.round(k.people.length / k.rosterN * 100)}% of AP127 SPs`
            : GROUPS.filter(g => groups[g.k]).map(g => `${k.byGroup[g.k] || 0} ${g.k === 'ap127' ? 'AP127' : g.k === 'sp' ? 'other SP' : 'FI'}`).join(' · ') }),
        h(Kpi, { label: 'Top reason', value: k.topCat ? CAT[k.topCat[0]].label : '—', color: k.topCat ? CAT[k.topCat[0]].c : null,
          sub: k.topCat ? `${Math.round(k.topCat[1] / k.days * 100)}% of leave days` : '—' }),
        view !== 'day' && h(Kpi, { label: 'Peak day', value: k.peak.d ? fmtD(k.peak.d) : '—', onClick: k.peak.d ? () => goDay(k.peak.d) : null,
          sub: k.peak.d ? `${k.peak.n} people off · ${DOW[dow(k.peak.d)]}` : 'No leave in period' }),
        h(Kpi, { label: 'Starting next 14 days', value: k.upcoming.length, color: 'var(--col-pending)',
          sub: k.upcoming.length ? k.upcoming.slice(0, 2).map(r => `${r.name.split(' ')[0]} ${fmtD(r.start)}`).join(', ') + (k.upcoming.length > 2 ? ' …' : '') : 'None announced' })),
      // Body
      h('div', null,
        view === 'day' && h(DayView, { date, occ, onOpen: openRec, nextDate, prevDate, go: setDate }),
        view === 'week' && h(WeekView, { start: a, recs, occ, onOpen: openRec, onDay: goDay, mobile }),
        view === 'month' && h(MonthView, { anchor: date, occ, onDay: goDay, onOpen: openRec, mobile }),
        view === 'roster' && h(RosterView, { anchor: date, recs, occ, onOpen: openRec, onDay: goDay, groups, mobile, sortBy, setSortBy }),
        view !== 'day' && h(RecordTable, { key: a, recs, onOpen: openRec, a, b })),
      h('div', { className: 'mono', style: { fontSize: 10, color: 'var(--ink-3)', paddingBottom: 8 } },
        `${all.length} leave records (${(window.LEAVES || []).length} feed rows, duplicates merged) · ${all[0] ? fmtD(all[0].start) + ' ' + all[0].start.slice(0, 4) : ''} – ${all.length ? (() => { const e = all.reduce((m, r) => r.end > m ? r.end : m, ''); return fmtD(e) + ' ' + e.slice(0, 4); })() : ''} · keys: ← → T D W M R`),
      person && !sel && h(PersonDetail, { name: person, allRecs: all, onClose: () => setPerson(null), onOpen: setSel }),
      sel && h(Detail, { r: sel, onClose: () => setSel(null), onJump: setSel, allRecs: all }));
  }

  window.LeaveBoard = LeaveBoard;
  // Exposed for Node/console checks.
  window.AP127Leave = { records, occupancy, normName, catOf, conflictsOf };
})();
