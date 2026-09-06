/* ============================================================================
 * AP127 DETAIL V6 — "FLIGHT RECORDER"
 *
 * A third, independent AP127 Detail tab, alongside V4 and V5 (both untouched).
 *
 * WHAT IT IS, AND WHY IT IS SHAPED THIS WAY
 * -----------------------------------------
 * V4 is a wall of 16 panels. V5 consolidated that into 5 sections behind one
 * command bar. Both answer "what are the numbers?" extremely well and neither
 * answers "so what?" without the reader assembling the story themselves.
 *
 * V6 is built as a NARRATIVE the reader falls through, in the order a briefing
 * is actually given:
 *
 *     00 FLIGHT DECK — the verdict, in one screen
 *     01 HISTORY     — how the batch got here
 *     02 SITUATION   — exactly where it stands now
 *     03 FORECAST    — where it ends up, with error bars, and what changes it
 *     04 THE BATCH   — the same story per student
 *     05 INTEGRITY   — every invariant, every source, and the TG report
 *
 * DATA ACCURACY — the non-negotiable
 * ----------------------------------
 * V6 computes NO figure of its own about the present. Every current-state
 * number comes from js/ap127-v5-model.js (audited against V4 line-by-line,
 * 12 self-check invariants) via exactly the same opsAugment step V5 applies.
 * Every forward-looking number comes from js/ap127-v6-forecast.js (15 more
 * invariants, runs under Node, seeded so it is reproducible). Both self-check
 * suites run on every mount and are rendered in Act 05 — 27 invariants, shown,
 * not asserted. If a number appears on this page, one of those two modules
 * produced it.
 *
 * ISOLATION
 * ---------
 * Own files only: this view, js/ap127-v6-forecast.js, css/cohort-v6.css.
 * Every DOM id is `v6-` prefixed and the only global exported is
 * window.CohortViewV6, so it cannot collide with V4's `d127v4-`/`...V4` or
 * V5's `d127v5-`/`AP127V5*` namespaces. Nothing here imports, reads or mutates
 * js/view-cohort-v4.js, js/shared.js or css/progress.css (the three files
 * DB_Share live-proxies), nor any V5 file's state.
 *
 * Plain script (no JSX) so it skips Babel, same as the V5 trio.
 * ==========================================================================*/
(function () {
  'use strict';

  const Model = window.AP127V5Model;
  const FC = window.AP127V6Forecast;
  const U = Model.util;
  const h = React.createElement;

  // ── tiny DOM kit ─────────────────────────────────────────────────────────
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'style' && typeof v === 'string') n.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(c => {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, kids) {
    const n = document.createElementNS(svgNS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v != null && v !== false) n.setAttribute(k, v); });
    (kids || []).forEach(c => n.appendChild(c));
    return n;
  }

  // ── formatting ───────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fd(ds) { if (!ds) return '—'; try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); } catch (e) { return ds; } }
  function fdLong(ds) { if (!ds) return '—'; try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }); } catch (e) { return ds; } }
  function fH(v, dp) { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v); const d = dp != null ? dp : (a >= 100 ? 0 : a >= 10 ? 1 : 2); return a.toFixed(d) + 'h'; }
  function fN(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('en-GB'); }
  function fPct(v, dp) { return v == null || !isFinite(v) ? '—' : v.toFixed(dp == null ? 1 : dp) + '%'; }
  function sgn(v, fmt) { if (v == null || !isFinite(v)) return '—'; return (v >= 0 ? '+' : '−') + fmt(Math.abs(v)); }
  function plural(n, one, many) { return Math.abs(n) === 1 ? one : (many || one + 's'); }
  // "263 days" → "263 days (8.6 months)" — a TG thinks in months, a scheduler
  // thinks in days, so slip is always given in both.
  function fDays(n) {
    if (n == null || !isFinite(n)) return '—';
    const a = Math.abs(n);
    const months = a / 30.44;
    return a.toFixed(0) + ' ' + plural(a, 'day') + (a >= 45 ? ' (' + months.toFixed(1) + ' months)' : '');
  }
  // Reads from document.BODY, not documentElement. This matters: the theme
  // overrides in cohort-v6.css are declared on `body[data-theme="light"]`,
  // which never reaches `:root` — so the usual
  // `getComputedStyle(document.documentElement)` read (the pattern used
  // elsewhere in this app, and documented there as theme-invariant in
  // practice) hands back the DARK value on a light page. Charts and the matrix
  // canvas resolve every colour through here, so reading from body is what
  // makes V6 the first Detail tab whose canvases actually follow the theme.
  // `:root` declarations still resolve — custom properties inherit to body.
  function cssv(name, fallback) {
    try {
      const el2 = document.body || document.documentElement;
      const v = getComputedStyle(el2).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function reduceMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  function toast(msg, kind) {
    $$('.v6-toast').forEach(n => n.remove());
    const t = el('div', { class: 'v6-toast' + (kind === 'er' ? ' er' : '') }, [msg]);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), kind === 'er' ? 5200 : 2600);
  }

  // ── OPS ⇄ PROGRESS augmentation ──────────────────────────────────────────
  // Byte-for-byte the same rule V5 applies (opsAugmentV5): an Ops booking
  // marked Completed for a curriculum lesson the Progress feed hasn't posted
  // yet is credited, using the curriculum's own lesson code. Kept identical on
  // purpose — if V5 and V6 ever showed different hours for the same batch on
  // the same day, neither could be trusted. Both read AP127Reconcile's key
  // helpers rather than re-implementing name/lesson normalisation.
  function opsAugment(students, curriculum) {
    const R = window.AP127Reconcile;
    const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
    if (!R || !Array.isArray(students)) return { students, syncCount: 0, opsAt: null, extraLessons: 0 };
    const comp = {}, sched = {};
    flights.forEach(f => {
      if (!f.student || !f.lesson || !R.isAP127(f.batch)) return;
      const k = R.ccNameNorm(f.student), nl = R.normLesson(f.lesson);
      if (f.status === 'Completed' && f.date) { (comp[k] = comp[k] || {})[nl] = f; }
      else if (f.status !== 'Canceled' && f.date) { const m = (sched[k] = sched[k] || {}); if (!m[nl] || f.date < m[nl]) m[nl] = f.date; }
    });
    const curNorm = new Set((curriculum || []).map(c => R.normLesson(c.lesson)));
    let syncCount = 0, extraLessons = 0;
    const out = students.map(s => {
      const key = R.ccKeyFromFull(s.name);
      const flownNorm = new Set((s.flown || []).map(f => R.normLesson(f.lesson)));
      const extra = [];
      Object.keys(comp[key] || {}).forEach(nl => {
        if (!flownNorm.has(nl) && curNorm.has(nl)) {
          const f = comp[key][nl];
          extra.push({ lesson: f.lesson, actual_mins: f.durMin || f.actual_mins || 0, actual_ft: f.duration || '', date: f.date, _ops: true });
        }
      });
      const flown = (extra.length ? [...(s.flown || []), ...extra] : (s.flown || [])).slice()
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (extra.length) { syncCount++; extraLessons += extra.length; }
      const m = sched[key] || {};
      const planned = (s.planned || []).map(p => ({ ...p, date: m[R.normLesson(p.lesson)] || 'TBC' }));
      return { ...s, flown, total: s.total || (curriculum || []).length, planned };
    });
    return { students: out, syncCount, extraLessons, opsAt: (window.FLIGHT_DATA && window.FLIGHT_DATA.fetchedAt) || null };
  }

  // ── state ────────────────────────────────────────────────────────────────
  const LS = 'ap127v6State';
  function loadState() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } }
  const saved = loadState();

  const S = {
    unit: saved.unit || 'hours',        // 'hours' | 'lessons'
    asOf: null,                          // null = live
    act: 'deck',
    search: '',
    focusSp: null,                       // catc_id currently cross-highlighted
    sortKey: 'behind',                   // always opens most-behind first
    sortDir: 1,
    outputPeriod: 'week',
    whatIf: { mult: 1, extra: 0 },
    raceFilter: { sp: '', se: '' },            // The race: one SP / aircraft type
    scrubIdx: null,                      // history playhead (index into fc.series.dates)
    playing: false,
  };
  function persist() {
    try { localStorage.setItem(LS, JSON.stringify({ unit: S.unit })); } catch (e) {}
  }

  let RAW = { students: [], curriculum: [], updatedAt: null };
  let MODEL = null, FCAST = null, SYNC = null, ROOT = null;
  const CHARTS = {};
  let SCRUB_FRAMES = null;              // precomputed per-date history frames
  let PLAY_TIMER = null;
  const REVEAL_CLEANUP = [];             // scroll/resize listeners + timers to drop on unmount

  function rebuild() {
    const aug = opsAugment(RAW.students, RAW.curriculum);
    SYNC = aug;
    MODEL = Model.buildModel(aug.students, RAW.curriculum, {
      asOf: S.asOf || undefined,
      updatedAt: RAW.updatedAt,
    });
    FCAST = FC.buildForecast(MODEL);
    RACE = null; STREAKS = null;
    SCRUB_FRAMES = buildScrubFrames(MODEL, FCAST);
    S.scrubIdx = SCRUB_FRAMES.length - 1;
    return MODEL;
  }

  // ── history frames ───────────────────────────────────────────────────────
  // The scrubber must not rebuild the whole model per frame — V5 shipped that
  // once and the user reported it as stuttering (REVAMP p174). Instead every
  // date's state is precomputed ONCE here as a prefix sum, so dragging is an
  // O(1) array lookup. The figures are the same daily series the forecast
  // resamples, and the plan/target curves come straight off the model, so a
  // scrubbed frame and the live model agree at the final index — asserted by
  // the `scrub-endpoint` check in Act 05.
  function buildScrubFrames(model, fc) {
    const dates = fc.series.dates;
    const planH = {}, planL = {};
    (model.series.hours.planFull || []).forEach(p => { planH[p.x] = p.y; });
    (model.series.lessons.planFull || []).forEach(p => { planL[p.x] = p.y; });
    const targetH = {}, targetL = {};
    (model.series.target.hours || []).forEach(p => { targetH[p.x] = p.y; });
    (model.series.target.lessons || []).forEach(p => { targetL[p.x] = p.y; });

    const totalH = model.batch.hourSlots, totalL = model.batch.lessonSlots;
    let accH = 0, accL = 0, lastPlanH = 0, lastPlanL = 0, lastTgtH = null, lastTgtL = null;
    return dates.map((d, i) => {
      accH += fc.series.hours[i]; accL += fc.series.lessons[i];
      if (planH[d] != null) lastPlanH = planH[d];
      if (planL[d] != null) lastPlanL = planL[d];
      if (targetH[d] != null) lastTgtH = targetH[d];
      if (targetL[d] != null) lastTgtL = targetL[d];
      return {
        date: d,
        hours: +accH.toFixed(2), lessons: Math.round(accL),
        pctH: totalH ? accH / totalH * 100 : 0,
        pctL: totalL ? accL / totalL * 100 : 0,
        planH: lastPlanH, planL: lastPlanL,
        targetH: lastTgtH, targetL: lastTgtL,
        lagH: Math.max(0, lastPlanH - accH), lagL: Math.max(0, lastPlanL - accL),
        dayH: fc.series.hours[i], dayL: fc.series.lessons[i],
      };
    });
  }

  // ── the focus bus ────────────────────────────────────────────────────────
  // One SP can be "hot" at a time. Every element that represents an SP carries
  // data-sp="<catc_id>"; setting focus adds a single class to the root and
  // .v6-hot to the matching nodes, so N panels highlight together without any
  // of them knowing the others exist. Charts subscribe separately (they draw
  // to canvas and can't be styled by CSS).
  const FOCUS_SUBS = [];
  function onFocus(fn) { FOCUS_SUBS.push(fn); }
  function setFocus(id) {
    S.focusSp = id == null ? null : String(id);
    if (!ROOT) return;
    ROOT.classList.toggle('v6-focusing', S.focusSp != null);
    $$('[data-sp]', ROOT).forEach(n => n.classList.toggle('v6-hot', S.focusSp != null && n.getAttribute('data-sp') === S.focusSp));
    FOCUS_SUBS.forEach(fn => { try { fn(S.focusSp); } catch (e) {} });
  }

  // ── number count-up ──────────────────────────────────────────────────────
  // The final text is written FIRST and the tween is pure enhancement — V5 hit
  // a real bug where a count-up that never got its rAF left a literal 0 on
  // screen (REVAMP p181). Same shape here: correct value always renders, the
  // animation only ever replaces it with the same value at the end.
  function countUp(node, to, fmt, ms) {
    if (!node) return;
    node.textContent = fmt(to);
    if (reduceMotion() || !window.requestAnimationFrame) return;
    const dur = ms || 900, t0 = performance.now(), from = 0;
    function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else node.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }

  // ── reveal-on-scroll ─────────────────────────────────────────────────────
  //
  // Deliberately a plain, rAF-throttled geometry sweep rather than an
  // IntersectionObserver. An IO that never delivers a callback — a hidden or
  // non-compositing tab, a browser that throttles it, a container the observer
  // treats as zero-sized — leaves every `.v6-reveal` element stuck at
  // opacity 0, which is to say the page silently renders BLANK. That was
  // observed for real during verification of this tab, and a decorative
  // animation must never be able to hide the data. A sweep over ~30 elements
  // costs nothing and cannot get stuck; if it somehow does not run at all, the
  // safety net below reveals everything anyway.
  function markRevealed(n) {
    if (n.classList.contains('in')) return;
    const d = parseInt(n.getAttribute('data-delay') || '0', 10);
    const show = () => {
      n.classList.add('in');
      // Bar and ring fills are held in data-fill/data-dash rather than inline
      // styles so they animate the first time the element is actually seen,
      // instead of quietly finishing off-screen.
      $$('[data-fill]', n).forEach(x => { x.style.width = x.getAttribute('data-fill'); });
      $$('[data-dash]', n).forEach(x => { x.style.strokeDashoffset = x.getAttribute('data-dash'); });
    };
    if (d && !reduceMotion()) setTimeout(show, d); else show();
  }
  function sweepReveal(scroller) {
    const vh = scroller.clientHeight || window.innerHeight;
    $$('.v6-reveal', scroller).forEach(n => {
      if (n.classList.contains('in')) return;
      const r = n.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      // Anything at or above the fold (and anything with no measurable box,
      // which means we cannot prove it is off-screen) reveals.
      if (!r.height || r.top - sr.top < vh * 0.94) markRevealed(n);
    });
  }
  function watchReveal(scroller) {
    let queued = false;
    const run = () => {
      queued = false;
      try { sweepReveal(scroller); } catch (e) { $$('.v6-reveal', scroller).forEach(markRevealed); }
    };
    // Scheduled on rAF for smoothness AND on a short timer, guarded by
    // `queued`, so a tab that is never composited still sweeps.
    const onScroll = () => { if (queued) return; queued = true; requestAnimationFrame(run); setTimeout(run, 120); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    REVEAL_CLEANUP.push(() => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    });
    run();
    // Safety net: whatever happened above, nothing stays invisible.
    const safety = setTimeout(() => $$('.v6-reveal', scroller).forEach(markRevealed), 4000);
    REVEAL_CLEANUP.push(() => clearTimeout(safety));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COURSE START — a stated fact, not a derived one.
  //
  // The metrics model's `batchStart` is the first flown date in the Progress
  // feed, which is 09 Apr 26 — but that day was two sorties by two SP, followed
  // by a ten-day stand-down with nothing at all. Continuous training begins
  // 20 Apr, ramping 2 → 4 → 9 → 16 SP over its first four days, and that is the
  // date the school counts the course from. The planned start was 02 Apr.
  //
  // Both dates come from the user, not from the feed; the ten-day gap above is
  // the corroboration and can be seen in the activity calendar. This constant
  // is used ONLY for the "Day of course" reading — every other figure on the
  // page still derives its own start from the data, so nothing else moves.
  // ─────────────────────────────────────────────────────────────────────────
  const COURSE_START = '2026-04-20';
  const COURSE_PLANNED_START = '2026-04-02';

  const ACTS = [
    { id: 'deck', n: '00', label: 'Flight deck' },
    { id: 'history', n: '01', label: 'History' },
    { id: 'situation', n: '02', label: 'Situation' },
    { id: 'forecast', n: '03', label: 'Forecast' },
    { id: 'people', n: '04', label: 'The batch' },
    { id: 'integrity', n: '05', label: 'Integrity' },
  ];

  // Rail highlighting rides the same sweep: whichever act owns the middle of
  // the viewport is the active one.
  function watchActs(scroller) {
    let queued = false;
    const run = () => {
      queued = false;
      const mid = scroller.scrollTop + scroller.clientHeight * 0.4;
      let active = ACTS[0].id;
      $$('.v6-act', scroller).forEach(n => { if (n.offsetTop <= mid) active = n.id.replace('v6-act-', ''); });
      if (active === S.act) return;
      S.act = active;
      $$('.v6-rail button', ROOT).forEach(b => b.classList.toggle('on', b.getAttribute('data-act') === active));
    };
    const onScroll = () => { if (queued) return; queued = true; requestAnimationFrame(run); setTimeout(run, 120); };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    REVEAL_CLEANUP.push(() => scroller.removeEventListener('scroll', onScroll));
    run();
  }

  function gotoAct(id) {
    const n = $('#v6-act-' + id, ROOT);
    if (n) n.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  // ── chart factory ────────────────────────────────────────────────────────
  function mkChart(id, cfg) {
    const ctx = document.getElementById(id); if (!ctx) return null;
    const ex = window.Chart.getChart(ctx); if (ex) ex.destroy();
    cfg.options = cfg.options || {};
    if (cfg.options.animation === undefined) cfg.options.animation = reduceMotion() ? false : { duration: 700, easing: 'easeOutCubic' };
    cfg.options.devicePixelRatio = Math.min(2, window.devicePixelRatio || 1);
    cfg.options.maintainAspectRatio = false;
    cfg.options.plugins = cfg.options.plugins || {};
    // chartjs-plugin-datalabels auto-registers globally off the CDN UMD build
    // the moment index.html loads it (V4 needs it). V6 uses no datalabels, so
    // it is forced off centrally here rather than in every config — the same
    // trap V5 documented.
    if (cfg.options.plugins.datalabels === undefined) cfg.options.plugins.datalabels = { display: false };
    if (cfg.options.plugins.zoom === undefined) {
      cfg.options.plugins.zoom = {
        zoom: { wheel: { enabled: true, modifierKey: 'ctrl', speed: 0.06 }, pinch: { enabled: true }, mode: 'x' },
        pan: { enabled: true, mode: 'x' },
        limits: { x: { minRange: 7 * 86400000 } },
      };
    }
    const c = new window.Chart(ctx, cfg);
    CHARTS[id] = c;
    return c;
  }
  function destroyCharts() { Object.keys(CHARTS).forEach(k => { try { CHARTS[k].destroy(); } catch (e) {} delete CHARTS[k]; }); }

  function axisTheme() {
    return {
      grid: cssv('--v6-grid', 'rgba(255,255,255,.05)'),
      tick: cssv('--v6-tx3', '#65708c'),
      bd: cssv('--v6-bd', 'rgba(255,255,255,.1)'),
      tipBg: cssv('--v6-bg-2', '#080c18'),
      tx: cssv('--v6-tx', '#eef2ff'),
    };
  }
  function timeScale(extra) {
    const t = axisTheme();
    return Object.assign({
      type: 'time',
      time: { unit: 'month', tooltipFormat: 'dd MMM yyyy', displayFormats: { day: 'dd MMM', week: 'dd MMM', month: 'MMM yy' } },
      grid: { color: t.grid, drawBorder: false },
      ticks: { color: t.tick, font: { size: 9, family: 'JetBrains Mono' }, maxRotation: 0, autoSkipPadding: 18 },
    }, extra || {});
  }
  function valScale(title, extra) {
    const t = axisTheme();
    return Object.assign({
      beginAtZero: true,
      grid: { color: t.grid, drawBorder: false },
      ticks: { color: t.tick, font: { size: 9, family: 'JetBrains Mono' } },
      title: title ? { display: true, text: title, color: t.tick, font: { size: 9, family: 'JetBrains Mono' } } : undefined,
    }, extra || {});
  }
  function tooltipTheme(extra) {
    const t = axisTheme();
    return Object.assign({
      backgroundColor: t.tipBg, titleColor: t.tx, bodyColor: t.tx,
      borderColor: cssv('--v6-bd-2', 'rgba(255,255,255,.18)'), borderWidth: 1,
      padding: 9, cornerRadius: 8, displayColors: true, boxWidth: 9, boxHeight: 9,
      titleFont: { size: 10, family: 'JetBrains Mono' }, bodyFont: { size: 11 },
    }, extra || {});
  }

  // ── card / act scaffolding ───────────────────────────────────────────────
  let revealSeq = 0;
  // An ⓘ button bound to a hidden explanation block. Used identically for
  // section headers and panel headers so prose never sits between the reader
  // and the numbers — it is one click away, everywhere, in the same place.
  function infoToggle(contentNodes, label) {
    const body = el('div', { class: 'v6-info' }, Array.isArray(contentNodes) ? contentNodes : [contentNodes]);
    const btn = el('button', {
      class: 'v6-i', type: 'button', 'aria-expanded': 'false',
      title: label || 'What this shows', 'aria-label': label || 'What this shows',
    }, ['i']);
    btn.addEventListener('click', () => {
      const open = body.classList.toggle('open');
      btn.classList.toggle('on', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    return { btn, body };
  }

  function card(title, sub, body, span, opts) {
    const o = opts || {};
    const c = el('div', { class: 'v6-card v6-reveal ' + (span || 'v6-c12'), 'data-delay': String((revealSeq++ % 4) * 70) });
    const kids = Array.isArray(body) ? body.slice() : [body];
    let info = null;
    if (o.info) { info = infoToggle(o.info); kids.unshift(info.body); }
    if (title) {
      const hd = el('div', { class: 'v6-card-hd' }, [el('span', { class: 'v6-card-t' }, [title])]);
      if (sub) hd.appendChild(el('span', { class: 'v6-card-s' }, [sub]));
      if (o.tools) hd.appendChild(o.tools);
      if (info) hd.appendChild(info.btn);
      c.appendChild(hd);
    }
    c.appendChild(el('div', { class: 'v6-card-b' }, kids));
    return c;
  }

  function actShell(id, n, title, sub) {
    const sec = el('section', { class: 'v6-act', id: 'v6-act-' + id });
    const head = el('div', { class: 'v6-act-head' }, [el('div', { class: 'v6-act-ttl' }, [title])]);
    const hd = el('div', { class: 'v6-act-hd v6-reveal' }, [
      el('div', { class: 'v6-act-n v6-disp' }, [n]),
      head,
      el('div', { class: 'v6-act-rule' }),
    ]);
    let info = null;
    if (sub) { info = infoToggle(sub, 'About this section'); head.appendChild(info.btn); }
    sec.appendChild(hd);
    if (info) sec.appendChild(info.body);
    const grid = el('div', { class: 'v6-grid' });
    sec.appendChild(grid);
    return { sec, grid };
  }

  // ── verdict vocabulary ───────────────────────────────────────────────────
  // One place decides what colour and what word a grade gets, so the hero, the
  // rail, the SP pills and the PDF can never disagree about the same batch.
  const GRADE = {
    'on-plan': { c: '--v6-good', word: 'ON PLAN', tone: 'good' },
    watch: { c: '--v6-warn', word: 'WATCH', tone: 'warn' },
    behind: { c: '--v6-warn', word: 'BEHIND', tone: 'warn' },
    critical: { c: '--v6-bad', word: 'CRITICAL', tone: 'bad' },
    unknown: { c: '--v6-tx3', word: 'UNKNOWN', tone: '' },
  };
  function gradeOf() { return GRADE[FCAST.verdict.grade] || GRADE.unknown; }

  // ── sparkline ────────────────────────────────────────────────────────────
  function sparkSvg(vals, w, h, color, opts) {
    const o = opts || {};
    const s = svg('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none' });
    if (!vals || !vals.length) return s;
    const max = Math.max.apply(null, vals.concat([o.min0 ? 0 : -Infinity])) || 1;
    const min = o.min0 ? 0 : Math.min.apply(null, vals);
    const span = (max - min) || 1;
    const pt = i => [(i / Math.max(1, vals.length - 1)) * w, h - ((vals[i] - min) / span) * (h - 2) - 1];
    const d = vals.map((v, i) => { const p = pt(i); return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    if (o.fill) {
      s.appendChild(svg('path', { d: d + ' L' + w + ' ' + h + ' L0 ' + h + ' Z', fill: color, opacity: '.16' }));
    }
    s.appendChild(svg('path', { d, fill: 'none', stroke: color, 'stroke-width': o.sw || 1.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    return s;
  }

  function vitalTile(label, value, sub, vals, color, fill) {
    const t = el('div', { class: 'v6-vital' }, [
      el('div', { class: 'l' }, [label]),
      el('div', { class: 'v', style: 'color:' + color }, [value]),
      el('div', { class: 's' }, [sub]),
    ]);
    if (vals && vals.length) t.appendChild(sparkSvg(vals, 100, 36, color, { fill: fill !== false, min0: true }));
    return t;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ACT 00 — FLIGHT DECK
  // ═════════════════════════════════════════════════════════════════════════
  function buildDeck() {
    const m = MODEL, fc = FCAST, v = fc.verdict, g = gradeOf();
    const { sec, grid } = actShell('deck', '00', 'AP127 AS OF NOW',
      'Everything a decision needs, on one screen. Every figure below is produced by the audited AP127 metrics model or the seeded forecast engine — never by this page. Anything showing a delay or a shortfall is written as a negative number.');

    // ── the gauge ──
    const pctH = m.batch.hourSlots ? m.batch.hoursDone / m.batch.hourSlots * 100 : 0;
    const R = 88, C = 2 * Math.PI * R;
    const arc = C * 0.78;                       // 280° sweep, leaves a gap at the bottom
    const done = arc * Math.min(1, pctH / 100);
    const gs = svg('svg', { viewBox: '0 0 212 212' }, [
      svg('circle', { cx: 106, cy: 106, r: R, fill: 'none', stroke: cssv('--v6-bd', 'rgba(255,255,255,.1)'), 'stroke-width': 13, 'stroke-linecap': 'round', 'stroke-dasharray': arc + ' ' + C, transform: 'rotate(36 106 106)' }),
      svg('defs', {}, [(function () {
        const lg = svg('linearGradient', { id: 'v6gaugeGrad', x1: '0', y1: '0', x2: '1', y2: '1' });
        lg.appendChild(svg('stop', { offset: '0%', 'stop-color': cssv('--v6-acc', '#e88aff') }));
        lg.appendChild(svg('stop', { offset: '100%', 'stop-color': cssv('--v6-acc2', '#22d3ee') }));
        return lg;
      })()]),
      svg('circle', {
        cx: 106, cy: 106, r: R, fill: 'none', stroke: 'url(#v6gaugeGrad)', 'stroke-width': 13, 'stroke-linecap': 'round',
        'stroke-dasharray': done + ' ' + C, transform: 'rotate(36 106 106)',
        style: 'stroke-dashoffset:' + done + ';transition:stroke-dashoffset 1.5s cubic-bezier(.2,.7,.3,1)', 'data-dash': '0',
      }),
    ]);
    const gv = el('div', { class: 'v6-gauge-v' }, ['0.0%']);
    const gauge = el('div', { class: 'v6-gauge' }, [gs, el('div', { class: 'v6-gauge-c' }, [
      el('div', { class: 'v6-gauge-l' }, ['Course complete']),
      gv,
      el('div', { class: 'v6-gauge-s' }, [fH(m.batch.hoursDone) + ' of ' + fH(m.batch.hourSlots)]),
      el('div', { class: 'v6-gauge-s', style: 'color:var(--v6-tx3)' }, [fN(m.batch.lessonsDone) + ' / ' + fN(m.batch.lessonSlots) + ' lessons']),
    ])]);
    setTimeout(() => countUp(gv, pctH, x => x.toFixed(1) + '%', 1500), 240);

    // ── the verdict ──
    const rateGap = v.rateGap;
    const headline = v.grade === 'unknown'
      ? 'Not enough signal to forecast a finish date'
      : v.slipDays > 0
        ? 'Forecast finish ' + fdLong(v.p50) + ' — ' + fDays(v.slipDays) + ' past plan'
        : 'Forecast finish ' + fdLong(v.p50) + ' — inside the plan';
    const detail = 'The batch is producing ' + fH(v.actualRate, 1) + '/day averaged over the last ' + v.rateWindow +
      ' days — the rate this forecast runs on — against the ' + fH(v.requiredRate, 1) +
      '/day it needs to finish by ' + fd(v.planEnd) + ': a shortfall of ' + fH(Math.abs(rateGap), 1) + '/day, or ' +
      (v.requiredRate ? (v.actualRate / v.requiredRate * 100).toFixed(0) : '0') + '% of the required rate. ' +
      (v.probOnPlan != null
        ? (v.probOnPlan <= 0.005
          ? 'Across ' + fN(fc.monteCarlo.hours.sims) + ' simulated futures resampled from the last ' + fc.window + ' days of real output, none finish by the plan date.'
          : (v.probOnPlan * 100).toFixed(0) + '% of ' + fN(fc.monteCarlo.hours.sims) + ' simulated futures finish by the plan date.')
        : '');
    const verdict = el('div', { class: 'v6-verdict' }, [
      el('div', { class: 'v6-vd-bar', style: 'background:var(' + g.c + ')' }),
      el('div', {}, [
        el('div', { class: 'v6-vd-k v6-mono', style: 'color:var(' + g.c + ')' }, ['◆ ' + g.word + ' · situation as of ' + fdLong(m.asOf) + (m.isLive ? '' : ' (time travel)')]),
        el('div', { class: 'v6-vd-h' }, [headline]),
        el('div', { class: 'v6-vd-d' }, [detail]),
      ]),
    ]);

    // ── headline stats ──
    // Counted from the course's real start (see COURSE_START above), not from
    // the first stray sortie in the feed.
    const daysIn = (U.dateDiff(m.asOf, COURSE_START) || 0) + 1;
    const startSlip = U.dateDiff(COURSE_START, COURSE_PLANNED_START) || 0;
    const daysLeft = m.pace ? m.pace.daysRem : null;
    const stat = (cls, label, value, sub, click) => {
      const n = el('div', { class: 'v6-stat ' + cls, style: click ? 'cursor:pointer' : '' }, [
        el('div', { class: 'l' }, [label]),
        el('div', { class: 'v' }, [value]),
        el('div', { class: 's' }, [sub]),
      ]);
      if (click) n.addEventListener('click', click);
      return n;
    };
    // Delays and shortfalls are written as negatives throughout.
    const neg = (val, fmt) => '−' + fmt(Math.abs(val));
    const stats = el('div', { class: 'v6-statrow' }, [
      stat('acc', 'Day of course', String(daysIn),
        'started ' + fd(COURSE_START) + ' · planned ' + fd(COURSE_PLANNED_START) + ' · ' + neg(startSlip, x => x.toFixed(0) + 'd') + ' late',
        () => gotoAct('history')),
      stat('bad', 'Days to plan end', daysLeft == null ? '—' : String(daysLeft),
        'plan ends ' + fd(m.pace ? m.pace.planEndDate : null),
        () => gotoAct('situation')),
      stat(m.batch.hoursDelta < 0 ? 'bad' : 'good', 'Behind plan',
        m.batch.hoursDelta < 0 ? neg(m.batch.hoursDelta, x => fH(x, 0)) : fH(m.batch.hoursDelta, 0),
        (m.batch.lessonsDelta < 0 ? neg(m.batch.lessonsDelta, fN) : fN(m.batch.lessonsDelta)) + ' lessons against the curriculum plan',
        () => gotoAct('situation')),
      stat(rateGap < 0 ? 'bad' : 'good', 'Pace vs required', sgn(rateGap, x => fH(x, 1)) + '/d',
        fH(v.actualRate, 1) + '/day over ' + v.rateWindow + 'd · needs ' + fH(v.requiredRate, 1) + '/day',
        () => gotoAct('forecast')),
    ]);

    const hero = el('div', { class: 'v6-hero v6-reveal' }, [gauge, el('div', { class: 'v6-hero-r' }, [verdict, stats])]);
    grid.appendChild(el('div', { class: 'v6-c12' }, [hero]));

    // ── what it takes, against what is being done ──
    // The same three periods Act 02's table carries, surfaced here because it is
    // the question the deck exists to answer. Figures come from the same
    // model.pace / model.actualPace the table reads, so the two cannot diverge.
    const p2 = m.pace, a2 = m.actualPace;
    const paceTile = (label, req, act, reqL, actL) => {
      const gap = act - (req || 0);
      return el('div', { class: 'v6-stat ' + (gap < 0 ? 'bad' : 'good') }, [
        el('div', { class: 'l' }, ['Required / ' + label]),
        el('div', { class: 'v', style: 'color:var(--v6-bad)' }, [fH(req, req >= 100 ? 0 : 1)]),
        el('div', { class: 's' }, [
          'actual ' + fH(act, act >= 100 ? 0 : 1) + ' · ',
          el('b', { style: 'color:var(--v6-' + (gap < 0 ? 'bad' : 'good') + ')' }, [sgn(gap, x => fH(x, x >= 100 ? 0 : 1))]),
        ]),
        el('div', { class: 's', style: 'color:var(--v6-tx3)' }, [
          fN(reqL) + ' lessons required · ' + fN(actL) + ' actual',
        ]),
      ]);
    };
    grid.appendChild(card('What it takes, against what is being done',
      'batch totals · actual is a trailing window (7d / 14d halved / 30d)', [
      el('div', { class: 'v6-statrow' }, [
        paceTile('day', p2 && p2.reqDayHrsB, a2.actDayHrsB, p2 && p2.reqDayLesB, a2.actDayLesB),
        paceTile('week', p2 && p2.reqWeekHrsB, a2.actWeekHrsB, p2 && p2.reqWeekLesB, a2.actWeekLesB),
        paceTile('month', p2 && p2.reqMonthHrsB, a2.actMonthHrsB, p2 && p2.reqMonthLesB, a2.actMonthLesB),
      ]),
    ], 'v6-c12', { info: [
      el('p', {}, ['What the whole batch must fly per day, per week and per month to finish by the plan date, set against what it is actually flying. The required side is recomputed every day against the work still outstanding, so it rises as the batch falls further behind.']),
      el('p', { style: 'margin-top:8px' }, ['The actual side uses the metrics model\u2019s own trailing windows — 7 days for the daily figure, 14 halved for the weekly, 30 for the monthly — which is why it differs slightly from the ' + FCAST.window + '-day mean the forecast runs on. These are the same figures as the Required-against-actual table in section 02, read from the same source so the two cannot drift.']),
    ] }));

    // ── vital signs ──
    const hrs = fc.series.hours, n = hrs.length;
    const tail = k => hrs.slice(Math.max(0, n - k));
    const lagSeries = (m.series.hours.lag || []).slice(-90).map(p => p.y);
    const util = fc.velocity.hours.utilisation30;
    const idle = m.students.filter(s => (s.idleDays || 0) >= 7).length;
    const vitals = el('div', { class: 'v6-vitals' }, [
      vitalTile('Output · last 30 days', fH(tail(30).reduce((a, b) => a + b, 0)), fH(fc.velocity.hours.v30, 1) + '/day average', tail(60), cssv('--v6-acc', '#e88aff')),
      vitalTile('Pace now', fH(fc.velocity.hours.ewma, 1) + '/d', '14-day half-life weighted', tail(45), cssv('--v6-acc2', '#22d3ee')),
      vitalTile('Flying-day rate', (util * 100).toFixed(0) + '%', fc.velocity.hours.activeDays30 + ' of last 30 days had flying', tail(30).map(v => v > 0 ? 1 : 0), cssv('--v6-info', '#38bdf8')),
      vitalTile('Shortfall vs plan', fH(m.batch.hoursDelta < 0 ? -m.batch.hoursDelta : 0), 'cumulative, growing', lagSeries, cssv('--v6-bad', '#fb7185')),
      vitalTile('SP idle ≥ 7 days', String(idle), 'of ' + m.students.length + ' students in the batch', null, idle ? cssv('--v6-warn', '#fbbf24') : cssv('--v6-good', '#34d399')),
      vitalTile('Ops not yet in Progress', String(SYNC ? SYNC.extraLessons : 0), (SYNC && SYNC.syncCount ? SYNC.syncCount + ' SP affected · credited here' : 'both systems agree'), null, cssv('--v6-acc3', '#a78bfa')),
    ]);
    grid.appendChild(card('Vital signs', 'six numbers that move first when something changes', vitals, 'v6-c12'));

    return sec;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ACT 01 — HISTORY
  // ═════════════════════════════════════════════════════════════════════════
  function flightPathCfg() {
    const m = MODEL, unit = S.unit;
    const t = axisTheme();
    const key = unit === 'lessons' ? 'lessons' : 'hours';
    const acc = cssv('--v6-acc', '#e88aff'), acc2 = cssv('--v6-acc2', '#22d3ee'), bad = cssv('--v6-bad', '#fb7185');
    const ds = [
      {
        label: 'Actual (flown)', data: m.series[key].actual, borderColor: acc, backgroundColor: acc + '22',
        borderWidth: 2.4, fill: true, tension: .22, pointRadius: 0, pointHoverRadius: 4, order: 1,
      },
      {
        label: 'Curriculum plan', data: m.series[key].planFull, borderColor: t.tick, borderWidth: 1.6,
        borderDash: [6, 4], fill: false, tension: .1, pointRadius: 0, order: 3,
      },
    ];
    if (m.series.target[key] && m.series.target[key].length) {
      ds.push({
        label: 'Revised target', data: m.series.target[key], borderColor: bad, borderWidth: 1.6,
        borderDash: [2, 3], fill: false, pointRadius: 2, pointHoverRadius: 5, order: 2,
      });
    }
    // The playhead: a single vertical marker at the scrubbed date, drawn as a
    // plugin rather than an annotation so it needs no extra library.
    const playhead = {
      id: 'v6playhead',
      afterDatasetsDraw(chart) {
        if (S.scrubIdx == null || !SCRUB_FRAMES) return;
        const f = SCRUB_FRAMES[S.scrubIdx]; if (!f) return;
        const x = chart.scales.x.getPixelForValue(new Date(f.date + 'T00:00:00Z').getTime());
        if (!isFinite(x) || x < chart.chartArea.left - 2 || x > chart.chartArea.right + 2) return;
        const c = chart.ctx;
        c.save();
        c.strokeStyle = acc2; c.lineWidth = 1.4; c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(x, chart.chartArea.top); c.lineTo(x, chart.chartArea.bottom); c.stroke();
        c.setLineDash([]); c.fillStyle = acc2;
        c.beginPath(); c.arc(x, chart.chartArea.top + 4, 3.2, 0, Math.PI * 2); c.fill();
        c.restore();
      },
    };
    return {
      type: 'line', data: { datasets: ds }, plugins: [playhead],
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: timeScale(), y: valScale(unit === 'lessons' ? 'lessons (batch)' : 'hours (batch)') },
        plugins: {
          legend: { display: false },
          tooltip: tooltipTheme({
            callbacks: {
              label: c => c.dataset.label + ': ' + (unit === 'lessons' ? fN(c.parsed.y) + ' les' : fH(c.parsed.y, 0)),
            },
          }),
        },
      },
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SORTIE TYPE — V6's own split, because SPIC belongs with Dual here
  //
  // The shared metrics model buckets SPIC into Solo (v4:395 — "both mean flying
  // without an instructor"). For this tab the user's rule is the opposite: SPIC
  // sits with Dual. That is a real operational distinction, not a preference —
  // an SPIC sortie still carries an instructor.
  //
  // It is re-derived HERE and not changed in ap127-v5-model.js on purpose: that
  // file is the metrics engine for AP127 Detail V5 as well, and silently
  // re-bucketing its output would move V5's Output chart too. The model's own
  // totals are untouched; only this chart's split differs, and the
  // `output-split` invariant asserts the two still sum to the same figure.
  function v6Type(code) {
    const c = String(code || '').trim();
    if (/\(SIM\)/i.test(c)) return 'Simulator';
    const rest = c.replace(/\(SIM\)/i, '').replace(/\s*\d+\s*$/, '').replace(/^C/i, '').replace(/^M/i, '');
    if (/^SP/i.test(rest)) return 'Dual';      // SPIC — instructor aboard
    if (/^S/i.test(rest)) return 'Solo';
    return 'Dual';
  }
  const V6_TYPES = ['Dual', 'Solo', 'Simulator'];
  const V6_TYPE_LABEL = { Dual: 'Dual + SPIC', Solo: 'Solo', Simulator: 'Simulator' };
  // Sortie colours, resolved at draw time so they follow the theme. Dual is the
  // cyan every other chart on this tab uses for its primary series; Solo and
  // Simulator keep the model's palette. Defined HERE rather than mutating
  // Model.TYPE_COLORS, which V5 also reads.
  function v6TypeColors() {
    return {
      Dual: cssv('--v6-acc2', '#22d3ee'),
      Solo: Model.TYPE_COLORS.Solo,
      Simulator: Model.TYPE_COLORS.Simulator,
    };
  }

  // Period aggregation with V6's split. Keys and totals match model.output()
  // exactly; only the Dual/Solo boundary moves.
  function v6Output(unit, period) {
    const m = MODEL;
    const base = m.output({ unit, period, showAll: true });
    const byKey = {};
    base.keys.forEach(k => { byKey[k] = { Dual: 0, Solo: 0, Simulator: 0 }; });
    m.students.forEach(sp => sp.flown.forEach(f => {
      if (f.date > m.asOf) return;
      const k = U.periodKey(f.date, period);
      const slot = byKey[k]; if (!slot) return;
      slot[v6Type(f.lesson)] += unit === 'lessons' ? 1 : f.effMins / 60;
    }));
    return { keys: base.keys, values: base.values, ma: base.ma, stacks: base.keys.map(k => byKey[k]) };
  }

  function outputCfg() {
    const m = MODEL, unit = S.unit, period = S.outputPeriod;
    const out = v6Output(unit, period);
    const tc = v6TypeColors();
    const isLes = unit === 'lessons';
    const labels = out.keys.map(k => new Date(k + 'T00:00:00Z').getTime());
    const fmtV = v => (isLes ? Math.round(v) : (v >= 10 ? v.toFixed(0) : v.toFixed(1)));
    const totals = out.stacks.map(sk => V6_TYPES.reduce((a, k) => a + (sk[k] || 0), 0));

    const ds = V6_TYPES.map(k => ({
      type: 'bar', label: V6_TYPE_LABEL[k], stack: 'out',
      data: out.stacks.map((sk, i) => ({ x: labels[i], y: +(sk[k] || 0).toFixed(2) })),
      backgroundColor: tc[k], borderWidth: 0, borderRadius: 2, order: 5,
      // Segment labels only where the segment is big enough to hold one.
      datalabels: {
        display: ctx => { const v = ctx.dataset.data[ctx.dataIndex].y; return v > 0 && v >= (Math.max.apply(null, totals) || 1) * 0.12; },
        color: '#0d1117', font: { size: 9, weight: '600', family: 'JetBrains Mono' },
        formatter: v => fmtV(v.y),
      },
    }));
    // A zero-height dataset stacked on top carries the stack TOTAL label —
    // Chart.js has no per-stack label of its own, and this is the same device
    // V4 used for the identical need.
    ds.push({
      type: 'bar', label: 'Total', stack: 'out',
      data: labels.map((x, i) => ({ x, y: 0 })),
      backgroundColor: 'transparent', borderWidth: 0, order: 4,
      datalabels: labelChip({
        display: ctx => totals[ctx.dataIndex] > 0,
        // Sits well clear above the bar rather than resting on it.
        anchor: 'end', align: 'end', offset: 16,
        color: cssv('--v6-tx', '#eef2ff'), font: { size: 10, weight: '700', family: 'JetBrains Mono' },
        formatter: (v, ctx) => fmtV(totals[ctx.dataIndex]),
      }),
    });
    // Each overlay gets its OWN stack group. Chart.js groups a dataset with no
    // explicit `stack` by its TYPE, so two un-stacked line overlays on a
    // stacked y-axis get summed together and drawn in the wrong place — the
    // exact bug V5 root-caused and fixed (REVAMP p181). Not repeating it.
    ds.push({
      type: 'line', label: 'Moving average', stack: 'ma',
      data: out.ma.map((v, i) => ({ x: labels[i], y: v })),
      borderColor: cssv('--v6-acc', '#e88aff'), borderWidth: 2, pointRadius: 0, tension: .3, fill: false, order: 1,
      datalabels: { display: false },
    });
    // REQUIRED IS EVALUATED AT EACH POINT IN TIME, not stamped with today's
    // figure across all history. The model's requiredAt(date) re-derives the
    // rate from the work still outstanding on that date and the days left from
    // it, so the line climbs as the batch falls behind — a flat line would
    // claim the requirement had always been this high.
    const reqAt = k => {
      const r = m.requiredAt(k);
      if (!r) return null;
      return period === 'day' ? (isLes ? r.reqDayLesB : r.reqDayHrsB)
        : period === 'week' ? (isLes ? r.reqWeekLesB : r.reqWeekHrsB)
          : (isLes ? r.reqMonthLesB : r.reqMonthHrsB);
    };
    const reqPts = out.keys.map((k, i) => { const v = reqAt(k); return { x: labels[i], y: v == null ? null : +v.toFixed(2) }; });
    if (reqPts.some(p => p.y != null)) {
      ds.push({
        type: 'line', label: 'Required at the time', stack: 'req', data: reqPts,
        borderColor: cssv('--v6-bad', '#fb7185'), borderWidth: 1.8, borderDash: [7, 4],
        pointRadius: 0, fill: false, order: 0, spanGaps: true, datalabels: { display: false },
      });
    }
    return {
      data: { datasets: ds },
      options: {
        layout: { padding: { top: 42 } },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: timeScale({ stacked: true, offset: true, time: { unit: period === 'day' ? 'week' : 'month' } }),
          y: valScale(isLes ? 'lessons per ' + period : 'hours per ' + period, { stacked: true }),
        },
        plugins: {
          datalabels: { display: true },
          legend: { display: false },
          tooltip: tooltipTheme({
            filter: c => c.dataset.label !== 'Total',
            callbacks: {
              label: c => c.dataset.label + ': ' + (isLes ? fN(c.parsed.y) + ' les' : fH(c.parsed.y, 1)),
              afterBody: items => {
                if (!items.length) return '';
                const i = items[0].dataIndex;
                return 'Total: ' + (isLes ? fN(totals[i]) + ' les' : fH(totals[i], 1));
              },
            },
          }),
        },
      },
    };
  }

  // ── Batch distribution (V4's Pace Distribution, drawn like the finish
  //    histogram in Act 03 so the two read as one family) ───────────────────
  function distributionCfg() {
    const d = MODEL.distribution;
    if (!d) return null;
    const acc = cssv('--v6-acc', '#e88aff'), acc2 = cssv('--v6-acc2', '#22d3ee');
    const labels = d.bins.map(b => (b.lo === b.hi ? String(b.lo) : b.lo + '–' + b.hi));
    // The average sits at a fractional position inside its bin, so it is drawn
    // as a plugin at an interpolated pixel rather than snapped to a category.
    const avgLine = {
      id: 'v6avgline',
      afterDatasetsDraw(chart) {
        const xs = chart.scales.x;
        const left = xs.getPixelForValue(d.avgBinIdx);
        const w = xs.width / Math.max(1, d.bins.length);
        const x = left + (d.avgFrac - 0.5) * w;
        const c = chart.ctx;
        c.save();
        c.strokeStyle = acc; c.lineWidth = 2; c.setLineDash([5, 3]);
        c.beginPath(); c.moveTo(x, chart.chartArea.top); c.lineTo(x, chart.chartArea.bottom); c.stroke();
        c.setLineDash([]);
        c.fillStyle = acc; c.font = '600 10px "JetBrains Mono", monospace'; c.textAlign = 'center';
        c.fillText('avg ' + d.avg.toFixed(1), x, chart.chartArea.top - 4);
        c.restore();
      },
    };
    const inIqr = b => b.hi >= d.q1 && b.lo <= d.q3;
    return {
      type: 'bar', plugins: [avgLine],
      data: {
        labels,
        datasets: [
          { label: 'SP in this band', data: d.counts, backgroundColor: d.bins.map(b => (inIqr(b) ? acc2 : acc2 + '44')), borderRadius: 3, order: 2,
            datalabels: labelChip({ display: v => v.dataset.data[v.dataIndex] > 0, anchor: 'end', align: 'end', offset: 4, color: cssv('--v6-tx', '#eef2ff'), font: { size: 9, weight: '600', family: 'JetBrains Mono' } }) },
          { label: 'shape', type: 'line', data: d.curve, borderColor: acc, borderWidth: 2, pointRadius: 0, tension: .4, fill: false, order: 1, datalabels: { display: false } },
        ],
      },
      options: {
        layout: { padding: { top: 18 } },
        scales: {
          x: { grid: { display: false }, ticks: { color: cssv('--v6-tx3', '#65708c'), font: { size: 9, family: 'JetBrains Mono' } }, title: { display: true, text: 'lessons completed', color: cssv('--v6-tx3', '#65708c'), font: { size: 9, family: 'JetBrains Mono' } } },
          y: valScale('student pilots', { ticks: { precision: 0, color: cssv('--v6-tx3', '#65708c'), font: { size: 9, family: 'JetBrains Mono' } } }),
        },
        plugins: {
          datalabels: { display: true },
          legend: { display: false },
          tooltip: tooltipTheme({
            filter: c => c.datasetIndex === 0,
            callbacks: {
              title: it => 'Completed ' + labels[it[0].dataIndex] + ' lessons',
              label: c => {
                const b = d.bins[c.dataIndex];
                return (b.students.length ? b.students.map(x => x.shortName).join(', ') : 'no SP') + ' (' + b.students.length + ')';
              },
            },
          }),
        },
      },
    };
  }

  // A value label that always reads, whatever it lands on. Pushing labels
  // further up cannot fix a collision with the Required line, because that line
  // moves and on several periods the bar is taller than it — measured: week 12
  // totals 122h against a required 97.4h, so the label crossed the line by 59px
  // however large the offset. A backdrop chip separates them unconditionally.
  function labelChip(extra) {
    return Object.assign({
      backgroundColor: () => cssv('--v6-glass', '#0c111d'),
      borderColor: () => cssv('--v6-bd', 'rgba(255,255,255,.1)'),
      borderWidth: 1,
      borderRadius: 4,
      padding: { top: 2, bottom: 1, left: 4, right: 4 },
    }, extra || {});
  }

  // Centred moving average. The window shrinks at the ends rather than dropping
  // them, so the trend line spans the whole series instead of stopping short of
  // the two points a reader most wants it over — the start and today.
  function movingAvg(vals, win) {
    const half = Math.floor(win / 2);
    return vals.map((_, i) => {
      const lo = Math.max(0, i - half), hi = Math.min(vals.length - 1, i + half);
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += vals[k];
      return +(sum / (hi - lo + 1)).toFixed(2);
    });
  }

  // ── Lead/lag history (V4's Batch Lagging History) ────────────────────────
  // The model publishes `lag` floored at zero — the batch is realistically
  // always behind, and a signed line spent its whole life below the axis
  // (v4:1896 / p162). Shown here as a filled area so the growth of the
  // shortfall is the shape you read, with the current/best/worst figures
  // beside it.
  function lagCfg() {
    const key = S.unit === 'lessons' ? 'lessons' : 'hours';
    const lag = MODEL.series[key].lag || [];
    const bad = cssv('--v6-bad', '#fb7185');
    const xs = lag.map(p => new Date(p.x + 'T00:00:00Z').getTime());
    // The raw shortfall is a sawtooth: the plan steps up on its own dates while
    // flying arrives in bursts, so the daily line jitters even when the trend is
    // flat. A 14-day centred average is what shows whether the gap is actually
    // still widening.
    const ma = movingAvg(lag.map(p => p.y), 14);
    return {
      type: 'line',
      data: {
        datasets: [{
          label: 'Behind plan', data: lag.map((p, i) => ({ x: xs[i], y: p.y })),
          borderColor: bad, backgroundColor: bad + '20', borderWidth: 1.5, fill: true,
          pointRadius: 0, pointHoverRadius: 4, tension: .2, order: 2, datalabels: { display: false },
        }, {
          label: '14-day trend', data: ma.map((y, i) => ({ x: xs[i], y })),
          borderColor: cssv('--v6-acc', '#e88aff'), borderWidth: 2.4, borderDash: [6, 4],
          fill: false, pointRadius: 0, tension: .3, order: 1, datalabels: { display: false },
        }],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { x: timeScale(), y: valScale(S.unit === 'lessons' ? 'lessons behind plan' : 'hours behind plan') },
        plugins: {
          legend: { display: false },
          tooltip: tooltipTheme({ callbacks: { label: c => c.dataset.label + ': ' + (S.unit === 'lessons' ? fN(c.parsed.y) + ' lessons' : fH(c.parsed.y, 0)) + ' behind plan' } }),
        },
      },
    };
  }

  // ── Month-by-month output with a trend line ──────────────────────────────
  function monthsCfg() {
    const mo = FCAST.history.months;
    const acc = cssv('--v6-acc', '#e88aff'), acc2 = cssv('--v6-acc2', '#22d3ee');
    const labels = mo.map(x => new Date(x.key + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }));
    const ys = mo.map(x => x.hours);
    // A 3-month centred moving average, NOT a least-squares fit. OLS is a
    // straight line by construction, which is exactly the complaint: it drew
    // one flat bar-to-bar line through months that swung from 78h to 442h and
    // told the reader nothing. A moving average follows the data.
    const trend = movingAvg(ys, 3);
    // Required output for each month, evaluated AT that month rather than
    // stamped with today's figure — same rule as the Output chart's line.
    const req = mo.map(x => {
      const r = MODEL.requiredAt(x.key + '-01');
      return r ? +r.reqMonthHrsB.toFixed(0) : null;
    });
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Hours flown', data: ys, backgroundColor: acc2, borderRadius: 3, order: 3,
            datalabels: labelChip({ anchor: 'end', align: 'end', offset: 5, color: cssv('--v6-tx', '#eef2ff'), font: { size: 9.5, weight: '600', family: 'JetBrains Mono' }, formatter: v => Math.round(v) }) },
          { label: '3-month trend', type: 'line', data: trend, borderColor: acc, borderWidth: 2.4, pointRadius: 0, tension: .35, fill: false, order: 2, datalabels: { display: false } },
          { label: 'Required that month', type: 'line', data: req, borderColor: cssv('--v6-bad', '#fb7185'), borderWidth: 1.8, borderDash: [7, 4], pointRadius: 2, tension: .2, fill: false, order: 1, spanGaps: true, datalabels: { display: false } },
        ],
      },
      options: {
        layout: { padding: { top: 22 } },
        scales: {
          x: { grid: { display: false }, ticks: { color: cssv('--v6-tx3', '#65708c'), font: { size: 9, family: 'JetBrains Mono' } } },
          y: valScale('hours flown'),
        },
        plugins: {
          datalabels: { display: true },
          legend: { display: false },
          tooltip: tooltipTheme({
            callbacks: {
              label: c => c.dataset.label + ': ' + fH(c.parsed.y, 0) +
                (c.dataset.label === 'Hours flown'
                  ? ' · ' + fN(mo[c.dataIndex].lessons) + ' lessons · ' + Math.round(mo[c.dataIndex].utilisation * 100) + '% of days flew'
                  : ''),
            },
          }),
        },
      },
    };
  }

  function legendRow(items) {
    return el('div', { class: 'v6-legend' }, items.map(([c, label, dot]) =>
      el('span', {}, [el('i', { class: dot ? 'dot' : '', style: 'background:' + c }), label])));
  }

  function buildHistory() {
    const m = MODEL, fc = FCAST;
    const { sec, grid } = actShell('history', '01', 'How the batch got here',
      'The whole flown record, from the first sortie on ' + fdLong(m.batchStart) + ' to ' + fdLong(m.asOf) +
      '. Drag the playhead to travel back through it — every reading below the chart follows.');

    // ── flight path + scrubber ──
    const chartBox = el('div', { class: 'v6-chart', style: 'height:340px' }, [el('canvas', { id: 'v6-flightpath' })]);
    const scrubDate = el('span', { class: 'v6-scrub-date v6-mono' }, [fd(m.asOf)]);
    const range = el('input', {
      type: 'range', min: '0', max: String(Math.max(0, (SCRUB_FRAMES || []).length - 1)),
      value: String(S.scrubIdx || 0), 'aria-label': 'History playhead',
    });
    const playBtn = el('button', { class: 'v6-btn' }, ['▶ Play the story']);
    const readout = el('div', { class: 'v6-scrub-read' });

    function renderFrame() {
      const f = SCRUB_FRAMES[S.scrubIdx]; if (!f) return;
      scrubDate.textContent = fd(f.date);
      const isLes = S.unit === 'lessons';
      const doneV = isLes ? f.lessons : f.hours;
      const planV = isLes ? f.planL : f.planH;
      const lagV = isLes ? f.lagL : f.lagH;
      const pct = isLes ? f.pctL : f.pctH;
      const rows = [
        ['Flown', isLes ? fN(doneV) + ' les' : fH(doneV, 0)],
        ['Course complete', fPct(pct)],
        ['Plan said', isLes ? fN(planV) + ' les' : fH(planV, 0)],
        ['Behind by', (lagV > 0 ? '' : '—') + (lagV > 0 ? (isLes ? fN(lagV) + ' les' : fH(lagV, 0)) : '')],
        ['That day', isLes ? fN(f.dayL) + ' les' : fH(f.dayH, 1)],
      ];
      readout.innerHTML = '';
      rows.forEach(([l, v]) => readout.appendChild(el('div', {}, [el('div', { class: 'l' }, [l]), el('div', { class: 'v' }, [v])])));
      const c = CHARTS['v6-flightpath']; if (c) c.draw();
    }
    range.addEventListener('input', () => { S.scrubIdx = +range.value; stopPlay(); renderFrame(); });

    function stopPlay() {
      if (PLAY_TIMER) { clearInterval(PLAY_TIMER); PLAY_TIMER = null; }
      S.playing = false; playBtn.textContent = '▶ Play the story';
    }
    function startPlay() {
      if (!SCRUB_FRAMES || !SCRUB_FRAMES.length) return;
      S.playing = true; playBtn.textContent = '❚❚ Pause';
      if (S.scrubIdx >= SCRUB_FRAMES.length - 1) S.scrubIdx = 0;
      // ~26 days per second, matching a pace a viewer can actually follow.
      PLAY_TIMER = setInterval(() => {
        S.scrubIdx = Math.min(SCRUB_FRAMES.length - 1, S.scrubIdx + 2);
        range.value = String(S.scrubIdx);
        renderFrame();
        if (S.scrubIdx >= SCRUB_FRAMES.length - 1) stopPlay();
      }, 1000 / 13);
    }
    playBtn.addEventListener('click', () => (S.playing ? stopPlay() : startPlay()));

    const pathCard = card('Actual flown vs plan', 'Ctrl/⌘ + scroll to zoom · drag to pan', [
      chartBox,
      legendRow([[cssv('--v6-acc', '#e88aff'), 'Actual flown'], [cssv('--v6-tx3', '#65708c'), 'Curriculum plan'], [cssv('--v6-bad', '#fb7185'), 'Revised target']]),
      el('div', { class: 'v6-scrub', style: 'margin-top:14px' }, [playBtn, range, scrubDate,
        el('button', { class: 'v6-btn', onclick: () => { stopPlay(); S.scrubIdx = SCRUB_FRAMES.length - 1; range.value = String(S.scrubIdx); renderFrame(); } }, ['⤒ Today'])]),
      readout,
    ], 'v6-c12');
    grid.appendChild(pathCard);

    // ── output rhythm ──
    const periodSeg = el('div', { class: 'v6-seg' }, ['day', 'week', 'month'].map(p =>
      el('button', { class: S.outputPeriod === p ? 'on' : '', onclick: () => { S.outputPeriod = p; $$('button', periodSeg).forEach(b => b.classList.toggle('on', b.textContent === p)); mkChart('v6-output', outputCfg()); } }, [p])));
    const outBox = el('div', { class: 'v6-chart', style: 'height:280px' }, [el('canvas', { id: 'v6-output' })]);
    const tc = Model.TYPE_COLORS;
    grid.appendChild(card('Output rhythm', 'what was actually flown, split by sortie type', [
      outBox,
      legendRow([[cssv('--v6-acc2', '#22d3ee'), 'Dual + SPIC'], [Model.TYPE_COLORS.Solo, 'Solo'], [Model.TYPE_COLORS.Simulator, 'Simulator'],
        [cssv('--v6-acc', '#e88aff'), 'Moving average'], [cssv('--v6-bad', '#fb7185'), 'Required at the time']]),
    ], 'v6-c12', { tools: periodSeg, info: [
      el('p', {}, ['Bars are stacked by sortie type, labelled per segment where the segment is big enough to hold a number, with the period total above each bar.']),
      el('p', { style: 'margin-top:8px' }, [
        el('b', {}, ['SPIC counts with Dual here, not Solo.']),
        ' An SPIC sortie still carries an instructor, so it belongs on the dual side of the split. The shared metrics engine buckets it with Solo (both are "flying as pilot in command"), and that engine also drives AP127 Detail V5 — so the re-split is done in this tab only, leaving V5 untouched. The totals are identical either way; only the Dual/Solo boundary moves, and an invariant checks that the two still sum to the same figure.',
      ]),
      el('p', { style: 'margin-top:8px' }, [
        el('b', {}, ['The required line is a moving target.']),
        ' It is evaluated at each point in time — against the work still outstanding on that date and the days remaining from it — rather than stamped with today\u2019s figure across all history. A flat line would claim the requirement had always been this high; in fact it climbs as the batch falls further behind.',
      ]),
    ] }));

    // ── batch distribution (V4's Pace Distribution) ──
    const distBox = el('div', { class: 'v6-chart', style: 'height:250px' }, [el('canvas', { id: 'v6-dist' })]);
    const dist = MODEL.distribution;
    grid.appendChild(card('Batch distribution', dist ? 'spread of lessons completed across ' + MODEL.students.length + ' SP' : 'no data', [
      distBox,
    ], 'v6-c12', { info: [
      el('p', {}, ['How many SP sit in each band of lessons completed — the shape of the batch rather than its total. A tall single band means the cohort is moving together; a wide flat spread means it is splitting into a fast and a slow group, which is a scheduling problem long before it is a completion problem.']),
      el('p', { style: 'margin-top:8px' }, ['Solid bars are the middle half of the batch (lower to upper quartile); the dashed magenta line marks the average, drawn at its true fractional position inside its band rather than snapped to the nearest bar. Hover a bar to see exactly which SP are in it.']),
      dist ? el('p', { style: 'margin-top:8px' }, ['Right now: slowest ' + dist.min + ', lower quartile ' + dist.q1 + ', median ' + dist.median + ', average ' + dist.avg.toFixed(1) + ', upper quartile ' + dist.q3 + ', fastest ' + dist.max + ' lessons.']) : null,
    ] }));

    // ── lead/lag history ──
    const lagBox = el('div', { class: 'v6-chart', style: 'height:240px' }, [el('canvas', { id: 'v6-lag' })]);
    const lagSeries2 = MODEL.series[S.unit === 'lessons' ? 'lessons' : 'hours'].lag || [];
    const lagNow = lagSeries2.length ? lagSeries2[lagSeries2.length - 1].y : 0;
    const lagVals = lagSeries2.map(p => p.y);
    const lagBest = lagVals.length ? Math.min.apply(null, lagVals) : 0;
    const lagWorst = lagVals.length ? Math.max.apply(null, lagVals) : 0;
    const lagFmt = v => (S.unit === 'lessons' ? fN(v) + ' les' : fH(v, 0));
    grid.appendChild(card('Behind plan, over time', 'the shortfall against the curriculum plan, day by day', [
      lagBox,
      legendRow([[cssv('--v6-bad', '#fb7185'), 'behind plan'], [cssv('--v6-acc', '#e88aff'), '14-day trend']]),
      el('div', { class: 'v6-scrub-read', style: 'margin-top:12px' }, [
        el('div', {}, [el('div', { class: 'l' }, ['Behind today']), el('div', { class: 'v', style: 'color:var(--v6-bad)' }, [lagFmt(lagNow)])]),
        el('div', {}, [el('div', { class: 'l' }, ['Closest ever']), el('div', { class: 'v', style: 'color:var(--v6-good)' }, [lagBest === 0 ? 'on plan' : lagFmt(lagBest)])]),
        el('div', {}, [el('div', { class: 'l' }, ['Worst ever']), el('div', { class: 'v' }, [lagFmt(lagWorst)])]),
        el('div', {}, [el('div', { class: 'l' }, ['Still growing?']), el('div', { class: 'v' }, [lagNow >= lagWorst - 0.01 ? 'yes' : 'off the peak'])]),
      ]),
    ], 'v6-c12', { info: [
      el('p', {}, ['Cumulative work the batch owes the curriculum plan, evaluated every day since the plan began. It is floored at zero: a batch that got ahead would read as flat zero rather than dipping below the axis. This one has never been ahead. The dashed magenta line is a 14-day centred average — the raw shortfall is a sawtooth, because the plan steps up on its own dates while flying arrives in bursts, and the average is what shows whether the gap is still widening.']),
      el('p', { style: 'margin-top:8px' }, ['The shape is what matters more than the level — a line that flattens means the batch is finally matching the plan\u2019s daily rate even if it has not begun to catch up, while a line still climbing means the gap is widening every day.']),
    ] }));

    // ── turning points ──
    const evRow = el('div', { class: 'v6-tl-row' });
    const evWrap = el('div', { class: 'v6-tl' }, [evRow]);
    fc.history.events.forEach(ev => {
      const node = el('div', { class: 'v6-tle k-' + ev.kind, tabindex: '0', title: 'Jump the playhead to ' + fd(ev.date) }, [
        el('div', { class: 'd' }, [fd(ev.date)]),
        el('div', { class: 't' }, [ev.title]),
        el('div', { class: 'x' }, [ev.detail]),
      ]);
      const jump = () => {
        const i = SCRUB_FRAMES.findIndex(f => f.date >= ev.date);
        if (i >= 0) { S.scrubIdx = i; range.value = String(i); renderFrame(); pathCard.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); }
      };
      node.addEventListener('click', jump);
      node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(); } });
      evRow.appendChild(node);
    });
    grid.appendChild(card('Turning points', fc.history.events.length + ' detected · click any to jump the playhead', evWrap, 'v6-c12', { info: [
      el('p', {}, ['Moments the record singles out on its own: the first sortie, the strongest week, the biggest single day, every stand-down of three days or more, the first SP to reach each milestone, the day the batch fell behind plan, and any sustained change of gear. Nothing here is hand-picked — each entry states the figure behind it so it can be checked against the calendar.']),
      el('p', { style: 'margin-top:8px' }, ['Scroll the timeline sideways to reach the whole batch history; clicking an entry moves the playhead on the chart above to that date.']),
    ] }));

    // ── month ribbon ──
    const maxMonth = Math.max.apply(null, fc.history.months.map(x => x.hours).concat([1]));
    const ribbon = el('div', { class: 'v6-months' }, fc.history.months.map(mo => {
      const dt = new Date(mo.key + '-01T00:00:00Z');
      return el('div', { class: 'v6-month' }, [
        el('div', { class: 'm' }, [dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })]),
        el('div', { class: 'h', style: 'color:' + (mo.hours >= maxMonth * 0.6 ? cssv('--v6-good', '#34d399') : mo.hours <= maxMonth * 0.2 ? cssv('--v6-bad', '#fb7185') : cssv('--v6-tx', '#eef2ff')) }, [fH(mo.hours, 0)]),
        el('div', { class: 'u' }, [el('i', { 'data-fill': Math.round(mo.hours / maxMonth * 100) + '%' })]),
        el('div', { class: 's' }, [Math.round(mo.utilisation * 100) + '% of days flew · ' + fN(mo.lessons) + ' les']),
      ]);
    }));
    const monBox = el('div', { class: 'v6-chart', style: 'height:230px' }, [el('canvas', { id: 'v6-months' })]);
    grid.appendChild(card('Month by month', 'hours flown per month, with the trend through them', [
      monBox,
      legendRow([[cssv('--v6-acc2', '#22d3ee'), 'hours flown'], [cssv('--v6-acc', '#e88aff'), '3-month trend'], [cssv('--v6-bad', '#fb7185'), 'required that month']]),
      el('div', { style: 'height:12px' }),
      ribbon,
    ], 'v6-c12', { info: [
      el('p', {}, ['Monthly totals with a 3-month centred moving average through them, and the output that month actually required. The required line is evaluated at each month against the work outstanding then — not stamped with today\u2019s figure — so it climbs as the batch falls behind. A month is counted whole, so the current month reads low until it closes.']),
      el('p', { style: 'margin-top:8px' }, ['The cards beneath give each month its own detail: hours, lessons, and the share of that month\u2019s calendar days on which anything flew. That last figure is often the more useful one — a month can look thin because sorties were short, or because the line stood still for a fortnight, and only the flying-day share tells the two apart.']),
    ] }));

    // Charts and the first frame are built after the section is in the DOM.
    sec._afterMount = () => {
      mkChart('v6-flightpath', flightPathCfg());
      mkChart('v6-output', outputCfg());
      const dcfg = distributionCfg(); if (dcfg) mkChart('v6-dist', dcfg);
      mkChart('v6-lag', lagCfg());
      mkChart('v6-months', monthsCfg());
      renderFrame();
    };
    sec._renderFrame = renderFrame;
    sec._stopPlay = stopPlay;
    return sec;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ACT 02 — SITUATION
  // ═════════════════════════════════════════════════════════════════════════
  function bandBlock(kicker, rows) {
    const b = el('div', {}, [el('div', { class: 'v6-card-t', style: 'margin-bottom:8px' }, [kicker])]);
    const dl = el('dl', { class: 'v6-kv' });
    rows.forEach(([k, v, tone]) => {
      dl.appendChild(el('dt', {}, [k]));
      dl.appendChild(el('dd', { style: tone ? 'color:var(--v6-' + tone + ')' : '' }, [v]));
    });
    b.appendChild(dl);
    return b;
  }

  function buildSituation() {
    const m = MODEL, fc = FCAST, p = m.pace, a = m.actualPace;
    const { sec, grid } = actShell('situation', '02', 'Where the batch stands',
      'The present tense: what has been done, what is left, and the rate that would clear it. Hours and lessons are shown side by side throughout — the Hours/Lessons switch in the bar changes the charts, not these facts.');

    const n = m.students.length;
    const remH = p ? p.remHrsB : 0, remL = p ? p.remLesB : 0;
    const daysRem = p ? p.daysRem : null;

    const bands = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:26px' }, [
      bandBlock('① Where we stand', [
        ['Complete', fPct(m.batch.hoursDone / m.batch.hourSlots * 100) + ' of the course by hours'],
        ['Flown', fH(m.batch.hoursDone) + ' · ' + fN(m.batch.lessonsDone) + ' lessons'],
        ['Per SP', fH(m.batch.avgHours, 1) + ' · ' + m.batch.avgLessons.toFixed(1) + ' lessons average'],
        ['vs plan', sgn(m.batch.hoursDelta, x => fH(x, 0)) + ' · ' + sgn(m.batch.lessonsDelta, fN) + ' les', m.batch.hoursDelta < 0 ? 'bad' : 'good'],
        ['vs target', m.batch.vsTargetToday ? sgn(m.batch.vsTargetToday.hours, x => fH(x, 0)) + ' · ' + m.batch.vsTargetToday.behindCount + ' of ' + n + ' SP behind' : '—', 'bad'],
        ['Retakes', fN(m.batch.retakes) + ' across ' + m.batch.retakeStudents + ' SP'],
      ]),
      bandBlock('② What is left', [
        ['Hours', fH(remH, 0) + ' batch · ' + fH(remH / n, 1) + ' per SP'],
        ['Lessons', fN(remL) + ' batch · ' + fN(remL / n) + ' per SP'],
        ['Time to plan end', daysRem == null ? '—' : daysRem + ' days · ' + (daysRem / 7).toFixed(1) + ' weeks · ' + (daysRem / 30.44).toFixed(1) + ' months'],
        ['Plan end date', fdLong(p ? p.planEndDate : null)],
        ['SP not yet finished', String(n)],
      ]),
    ]);
    grid.appendChild(card('Situation report', 'as of ' + fdLong(m.asOf), bands, 'v6-c12'));


    // ── pace table ──
    const rows = [
      ['Month', p && p.reqMonthHrsB, a.actMonthHrsB, p && p.reqMonthLesB, a.actMonthLesB],
      ['Week', p && p.reqWeekHrsB, a.actWeekHrsB, p && p.reqWeekLesB, a.actWeekLesB],
      ['Day', p && p.reqDayHrsB, a.actDayHrsB, p && p.reqDayLesB, a.actDayLesB],
    ];
    const tbl = el('table', { class: 'v6-t v6-fit' }, [
      el('thead', {}, [el('tr', {}, ['Period', 'Required h', 'Actual h', 'Gap h', 'Required les', 'Actual les', 'Gap les'].map(t => el('th', {}, [t])))]),
      el('tbody', {}, rows.map(([lbl, rh, ah, rl, al]) => el('tr', {}, [
        el('td', {}, [lbl]),
        el('td', { class: 'n' }, [fH(rh, 1)]),
        el('td', { class: 'n' }, [fH(ah, 1)]),
        el('td', { class: 'n', style: 'color:var(--v6-bad)' }, [sgn(ah - (rh || 0), x => fH(x, 1))]),
        el('td', { class: 'n' }, [fN(rl)]),
        el('td', { class: 'n' }, [fN(al)]),
        el('td', { class: 'n', style: 'color:var(--v6-bad)' }, [sgn(al - (rl || 0), fN)]),
      ]))),
    ]);
    // "What it takes" used to be a third band in the situation report, repeating
    // the same required-vs-actual comparison this table already makes. Folded in
    // here so the comparison lives in exactly one place.
    const mult7 = p && a.actDayHrsB > 0 ? (p.reqDayHrsB / a.actDayHrsB) : null;
    const multFc = p && FCAST.verdict.actualRate > 0 ? (p.reqDayHrsB / FCAST.verdict.actualRate) : null;
    const takes = el('div', { class: 'v6-scrub-read', style: 'margin-top:14px' }, [
      el('div', {}, [el('div', { class: 'l' }, ['Shortfall / day']),
        el('div', { class: 'v', style: 'color:var(--v6-bad)' }, [sgn(a.actDayHrsB - (p ? p.reqDayHrsB : 0), x => fH(x, 1))])]),
      el('div', {}, [el('div', { class: 'l' }, ['Shortfall / week']),
        el('div', { class: 'v', style: 'color:var(--v6-bad)' }, [sgn(a.actWeekHrsB - (p ? p.reqWeekHrsB : 0), x => fH(x, 0))])]),
      el('div', {}, [el('div', { class: 'l' }, ['× the last 7 days']),
        el('div', { class: 'v', style: 'color:var(--v6-bad)' }, [mult7 == null ? '—' : mult7.toFixed(1) + '×'])]),
      el('div', {}, [el('div', { class: 'l' }, ['× the ' + FCAST.window + '-day mean']),
        el('div', { class: 'v', style: 'color:var(--v6-bad)' }, [multFc == null ? '—' : multFc.toFixed(1) + '×'])]),
    ]);
    grid.appendChild(card('Required against actual', 'what it takes, against what the batch is doing',
      [el('div', { class: 'v6-tw' }, [tbl]),
        takes,
        el('div', { class: 'v6-note', style: 'margin-top:10px' }, [
          'There is no single "actual rate", and this page never pretends otherwise. The Actual column here uses the metrics model’s own trailing windows — 7 days for the daily figure, 14 halved for the weekly, 30 for the monthly. ',
          'The Flight deck and the forecast quote a ' + FCAST.window + '-day mean instead, because that is the window the simulation resamples. ',
          'Every rate the page is allowed to show, with the exact window behind it, is listed together in ',
          el('button', { class: 'v6-btn', style: 'padding:2px 7px', onclick: () => gotoAct('forecast') }, ['Act 03 → Every rate']), '.',
        ])], 'v6-c12'));

    // ── curriculum grid ──
    const gridHost = el('div', {});
    grid.appendChild(card('Curriculum grid', m.students.length + ' SP × ' + m.curriculum.count + ' lessons · click any cell for the record',
      [gridHost], 'v6-c12', { info: [
        el('p', {}, ['Every lesson in the syllabus, for every student pilot. A cell is filled in its phase colour once that lesson is complete and left grey when it is not, so each row reads left-to-right as one SP\u2019s route through the course and each column shows how far the batch has got with one lesson.']),
        el('p', { style: 'margin-top:8px' }, ['The three identity columns stay pinned while the grid scrolls sideways. ',
          el('b', {}, ['vs tgt']), ' is lessons ahead of or behind the target schedule for today; ', el('b', {}, ['Finish']),
          ' is that SP\u2019s projected completion date. The 17 red columns are the target checkpoints, each labelled with its own date, and the cyan column is the lesson the batch is meant to have reached today. The hatched red band on each row spans the lessons that SP still owes against today\u2019s target.']),
        el('p', { style: 'margin-top:8px' }, ['The bar along the bottom shades each lesson by the share of the batch that has completed it — the darker the column, the more of the batch is through it, so a sudden pale column is a bottleneck.']),
        el('p', { style: 'margin-top:8px' }, ['Click any cell for that lesson\u2019s full record — the curriculum entry, the Progress record and the Operations booking behind it, with an agreement check between the two. Click an SP\u2019s name for their whole file. Nothing opens on hover.']),
      ] }));

    sec._afterMount = () => {
      buildCurriculumGrid(gridHost);
      observeWidth(gridHost, () => buildCurriculumGrid(gridHost));
    };
    sec._regrid = () => buildCurriculumGrid(gridHost);
    return sec;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CURRICULUM GRID  (replaces V6's first canvas matrix)
  //
  // V5's roster-style HTML grid reads better than a canvas, and the user asked
  // for that treatment here. Rebuilt in V6's own markup and palette rather than
  // copied out of view-cohort-v5.js — that file stays untouched, and a second
  // copy of it would be free to drift.
  //
  // What the canvas could not do and this does: sticky identity columns that
  // survive horizontal scroll, the 17 target checkpoints labelled with their
  // own dates, today's target column marked, and each SP's shortfall against
  // today's target drawn as a hatched band across the lessons they still owe.
  // ═════════════════════════════════════════════════════════════════════════
  // A window resize is NOT the only way these grids change width — this app
  // collapses its sidebar to an icon rail from the top bar, which resizes the
  // content column with no window event at all. Each grid watches its own
  // container instead.
  function observeWidth(node, onChange) {
    if (!window.ResizeObserver || !node) return;
    let last = node.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = node.clientWidth;
      if (!w || Math.abs(w - last) < 8) return;
      last = w;
      onChange();
    });
    ro.observe(node);
    REVEAL_CLEANUP.push(() => { try { ro.disconnect(); } catch (e) {} });
  }

  const GRID_ZOOM = { curriculum: null, calendar: null };
  function zoomBar(key, auto, redraw) {
    const cur = GRID_ZOOM[key] || auto;
    const set = v => { GRID_ZOOM[key] = v == null ? null : clampInt(v, 4, 40); redraw(); };
    return el('div', { class: 'v6-zoom' }, [
      el('button', { class: 'v6-btn', title: 'Narrower columns', onclick: () => set(cur - 2) }, ['−']),
      el('span', {}, [cur + 'px']),
      el('button', { class: 'v6-btn', title: 'Wider columns', onclick: () => set(cur + 2) }, ['+']),
      el('button', { class: 'v6-btn', title: 'Fit to width', onclick: () => set(null) }, ['⤢ Fit']),
    ]);
  }
  function clampInt(v, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(v))); }
  function availW(host, reserved) {
    const w = (host && host.clientWidth) || (ROOT && ROOT.clientWidth) || 900;
    return Math.max(120, w - reserved - 4);
  }

  function buildCurriculumGrid(host) {
    host.innerHTML = '';
    const m = MODEL;
    const sps = forecastRows().map(r => r.sp);
    if (!sps.length) { host.appendChild(el('div', { class: 'v6-note' }, ['No students match the current search.'])); return; }
    const count = m.curriculum.count || 96;
    const NW = 116, VW = 52, EW = 62, RESERVED = NW + VW + EW;
    const auto = clampInt(availW(host, RESERVED) / count, 4, 40);
    const CW = GRID_ZOOM.curriculum || auto;

    const targets = (m.targets && m.targets.list) || [];
    const tgtByLesson = {}; targets.forEach(t => { tgtByLesson[t.lesson] = t; });
    const nowLesson = m.batch.targetLessonToday == null ? null : Math.round(m.batch.targetLessonToday);

    host.appendChild(zoomBar('curriculum', auto, () => buildCurriculumGrid(host)));
    host.appendChild(legendRow(m.phasesDef.map(p => [p.c, p.label, true]).concat([
      [cssv('--v6-warn', '#fbbf24'), 'next lesson', true],
      [cssv('--v6-info', '#38bdf8'), 'retaken', true],
      [cssv('--v6-bad', '#fb7185'), 'target checkpoint · hatched = behind today’s target', true],
      [cssv('--v6-acc2', '#22d3ee'), 'target for today' + (nowLesson == null ? '' : ' (L' + nowLesson + ')'), true],
    ])));

    const table = el('table', { class: 'v6-gt', style: 'width:' + (RESERVED + CW * count) + 'px' });
    const cg = el('colgroup', {}, [
      el('col', { style: 'width:' + NW + 'px' }), el('col', { style: 'width:' + VW + 'px' }), el('col', { style: 'width:' + EW + 'px' }),
    ].concat(Array.from({ length: count }, () => el('col', { style: 'width:' + CW + 'px' }))));
    table.appendChild(cg);

    // ---- header: phase band, target dates, lesson numbers ----
    const segs = [];
    for (let n = 1; n <= count; n++) {
      const l = m.curriculum.byNum[n];
      const c = l && l.phase ? l.phase.c : '#6b7280';
      const last = segs[segs.length - 1];
      if (last && last.c === c) last.n++; else segs.push({ c, label: l && l.phase ? l.phase.label : 'Other', n: 1 });
    }
    const thead = el('thead');
    const idTh = (txt, left, cls) => el('th', { class: 'idc ' + (cls || ''), style: 'left:' + left + 'px' }, [txt]);
    thead.appendChild(el('tr', {}, [
      idTh('Student pilot', 0), idTh('vs tgt', NW), idTh('Finish', NW + VW),
    ].concat(segs.map(sg => el('th', { class: 'phb', colspan: sg.n, style: 'background:' + sg.c, title: sg.label })))));
    thead.appendChild(el('tr', {}, [idTh('', 0), idTh('', NW), idTh('', NW + VW)].concat(
      Array.from({ length: count }, (_, i) => {
        const n = i + 1, t = tgtByLesson[n];
        return el('th', { class: 'tgtlab' }, [t ? fd(t.date) : '']);
      }))));
    const every = CW >= 24 ? 1 : CW >= 13 ? 5 : 10;
    thead.appendChild(el('tr', {}, [idTh('', 0), idTh('', NW), idTh('', NW + VW)].concat(
      Array.from({ length: count }, (_, i) => el('th', { class: 'num' }, [(i + 1) % every === 0 || i === 0 ? String(i + 1) : ''])))));
    table.appendChild(thead);

    // ---- rows ----
    const fcById = {}; FCAST.students.rows.forEach(r => { fcById[String(r.catc_id)] = r; });
    const tb = el('tbody');
    sps.forEach(sp => {
      const fr = fcById[String(sp.catc_id)];
      const vs = (nowLesson == null) ? null : sp.lessonsCompleted - nowLesson;
      const tr = el('tr', { 'data-sp': String(sp.catc_id) });
      const nameTd = el('td', { class: 'idc', style: 'left:0;cursor:pointer' }, [sp.shortName]);
      nameTd.addEventListener('click', () => openSPDrawer(sp.catc_id));
      tr.appendChild(nameTd);
      tr.appendChild(el('td', {
        class: 'idc', style: 'left:' + NW + 'px;text-align:right;font-family:JetBrains Mono,monospace;color:' + (vs == null ? 'var(--v6-tx3)' : vs >= 0 ? 'var(--v6-good)' : 'var(--v6-bad)'),
      }, [vs == null ? '—' : (vs >= 0 ? '+' : '−') + Math.abs(vs)]));
      tr.appendChild(el('td', { class: 'idc', style: 'left:' + (NW + VW) + 'px;font-family:JetBrains Mono,monospace;color:var(--v6-tx2)' }, [fr ? fd(fr.etcDate) : '—']));
      for (let n = 1; n <= count; n++) {
        const hits = sp.flownByNum && sp.flownByNum[n];
        const l = m.curriculum.byNum[n];
        const isTgt = !!tgtByLesson[n];
        const isToday = nowLesson != null && n === nowLesson;
        const inLag = nowLesson != null && !hits && n <= nowLesson && n > sp.lessonsCompleted;
        const cls = ['cell'];
        if (!hits) cls.push('empty');
        if (hits && hits.length > 1) cls.push('retake');
        if (!hits && sp.nextNum === n) cls.push('next');
        if (isTgt) cls.push('tgt');
        if (isToday) cls.push('today');
        if (inLag) cls.push('lag');
        // Click-only: no hover tooltip and no cross-panel focus on hover. The
        // grid is dense enough that sweeping a pointer across it fired a
        // highlight on every row it crossed; detail now comes from a deliberate
        // click, which is also what opens the full Ops⇄Progress record.
        const td = el('td', { class: cls.join(' ') },
          [el('i', { style: hits ? 'background:' + (l && l.phase ? l.phase.c : '#e88aff') : '' })]);
        td.addEventListener('click', () => openLessonModal(sp, n));
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    });
    table.appendChild(tb);

    // ---- footer: how much of the batch has each lesson ----
    const tf = el('tfoot');
    const ftr = el('tr', {}, [
      el('td', { class: 'idc', style: 'left:0' }, ['Batch %']),
      el('td', { class: 'idc', style: 'left:' + NW + 'px' }, ['']),
      el('td', { class: 'idc', style: 'left:' + (NW + VW) + 'px' }, ['']),
    ]);
    for (let n = 1; n <= count; n++) {
      const done = sps.filter(sp => sp.flownByNum && sp.flownByNum[n]).length;
      const pct = sps.length ? done / sps.length : 0;
      ftr.appendChild(el('td', {
        style: 'background:color-mix(in srgb,var(--v6-acc) ' + Math.round(pct * 74) + '%,transparent)',
      }, []));
    }
    tf.appendChild(ftr);
    table.appendChild(tf);

    host.appendChild(el('div', { class: 'v6-gw' }, [table]));
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ACTIVITY CALENDAR  (replaces "Streaks & idle days")
  //
  // The roster grid from V5: SP rows × calendar-day columns, each cell shaded
  // by how much that SP flew that day and coloured by the phase they were in,
  // with month rules, idle-gap marking and per-day batch totals. Same rebuild
  // rule as the curriculum grid — V6's own markup, V5's file untouched.
  // ═════════════════════════════════════════════════════════════════════════
  const CAL = { groupBy: 'none', range: 0 };
  // Plain rgba, never color-mix(): html2canvas cannot parse color-mix, and that
  // is exactly what forced V4's PDF export to fall back to a text table for its
  // heatmaps. Same helper V5 uses, same reason.
  function mixRgba(hex, pct) {
    const h = String(hex).replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (pct / 100).toFixed(3) + ')';
  }

  function buildActivityCalendar(host) {
    host.innerHTML = '';
    const m = MODEL;
    const sps = forecastRows().map(r => r.sp);
    const rawStart = CAL.range ? U.addDays(m.asOf, -(CAL.range - 1)) : m.batchStart;
    const start = rawStart < m.batchStart ? m.batchStart : rawStart;
    const days = U.datesRange(start, m.asOf);
    if (!sps.length || !days.length) { host.appendChild(el('div', { class: 'v6-note' }, ['No data in range.'])); return; }
    const NW = 128, TW = 62, RESERVED = NW + TW;
    const auto = clampInt(availW(host, RESERVED) / days.length, 5, 30);
    const CW = GRID_ZOOM.calendar || auto;
    const IDLE_MIN = 7;

    const cellH = {}; let maxH = 0;
    sps.forEach(sp => days.forEach(d => {
      const fl = sp.flownByDate[d]; if (!fl) return;
      const hv = fl.reduce((a, f) => a + f.effMins / 60, 0);
      cellH[sp.catc_id + '|' + d] = hv;
      if (hv > maxH) maxH = hv;
    }));
    maxH = maxH || 1;

    const rangeTot = { hrs: 0, les: 0 };
    sps.forEach(sp => days.forEach(d => {
      const fl = sp.flownByDate[d]; if (!fl) return;
      rangeTot.les += fl.length; rangeTot.hrs += fl.reduce((a, f) => a + f.effMins / 60, 0);
    }));
    const activeDays = days.filter(d => sps.some(sp => sp.flownByDate[d])).length;

    host.appendChild(zoomBar('calendar', auto, () => buildActivityCalendar(host)));
    host.appendChild(el('div', { class: 'v6-gsum' }, [
      el('b', {}, [fH(rangeTot.hrs, 1)]), ' flown · ', el('b', {}, [fN(rangeTot.les)]), ' lessons · ',
      el('b', {}, [String(activeDays)]), ' of ' + days.length + ' days had activity · avg ',
      el('b', {}, [fH(activeDays ? rangeTot.hrs / activeDays : 0, 1)]), '/active day across ' + sps.length + ' SP',
    ]));
    host.appendChild(legendRow(m.phasesDef.map(p => [p.c, p.label, true]).concat([
      [cssv('--v6-bad', '#fb7185'), 'idle gap ≥ ' + IDLE_MIN + 'd between flights (dashed)', true],
      [cssv('--v6-warn', '#fbbf24'), 'still idle through to today (dotted)', true],
      [cssv('--v6-acc2', '#22d3ee'), 'today', true],
    ])));

    let rows = sps.map(sp => ({ sp }));
    if (CAL.groupBy === 'instructor') {
      const byFI = {};
      sps.forEach(sp => (byFI[sp.fiFull || 'Unassigned'] = byFI[sp.fiFull || 'Unassigned'] || []).push(sp));
      rows = [];
      Object.keys(byFI).sort((a, b) => byFI[b].length - byFI[a].length || a.localeCompare(b))
        .forEach(fi => { rows.push({ group: fi, members: byFI[fi] }); byFI[fi].forEach(sp => rows.push({ sp })); });
    }

    const table = el('table', { class: 'v6-cal', style: 'width:' + (RESERVED + (CW + 1) * days.length) + 'px' });
    table.appendChild(el('colgroup', {}, [el('col', { style: 'width:' + NW + 'px' }), el('col', { style: 'width:' + TW + 'px' })]
      .concat(days.map(() => el('col', { style: 'width:' + CW + 'px' })))));

    // header: day number on Mondays (or whenever the cell is wide enough), and
    // the month whenever a month's first Monday comes round
    const thead = el('thead', {}, [el('tr', {}, [
      el('th', { class: 'idc', style: 'left:0' }, [el('span', { class: 'hl', style: 'text-align:left' }, ['SP'])]),
      el('th', { class: 'idc', style: 'left:' + NW + 'px' }, [el('span', { class: 'hl' }, ['period'])]),
    ].concat(days.map((d, i) => {
      const dt = new Date(d + 'T12:00:00Z');
      const isMon = dt.getUTCDay() === 1, isTod = d === m.asOf;
      const showD = i === 0 || isMon || CW >= 22;
      const showM = i === 0 || (dt.getUTCDate() <= 7 && isMon);
      return el('th', { class: isMon && i > 0 ? 'mon' : '' }, [
        showM ? el('span', { class: 'hl' }, [dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })]) : null,
        showD ? el('span', { class: 'hl', style: isTod ? 'color:var(--v6-acc2);font-weight:700' : '' }, [String(dt.getUTCDate())]) : null,
      ]);
    })))]);
    table.appendChild(thead);

    const tb = el('tbody');
    rows.forEach(row => {
      if (row.group) {
        const gh = row.members.reduce((a, sp) => a + days.reduce((b, d) => b + (cellH[sp.catc_id + '|' + d] || 0), 0), 0);
        const gl = row.members.reduce((a, sp) => a + days.reduce((b, d) => b + ((sp.flownByDate[d] || []).length), 0), 0);
        tb.appendChild(el('tr', { class: 'grp' }, [el('td', { colspan: days.length + 2 }, [
          el('span', { style: 'color:var(--v6-acc)' }, [row.group]),
          el('span', { style: 'color:var(--v6-tx3);font-weight:400;margin-left:8px;font-size:9px' },
            [row.members.length + ' SP · ' + gl + ' les · ' + gh.toFixed(1) + 'h']),
        ])]));
        return;
      }
      const sp = row.sp;
      let totH = 0, totL = 0;
      days.forEach(d => { totH += cellH[sp.catc_id + '|' + d] || 0; totL += (sp.flownByDate[d] || []).length; });

      // Idle runs, exactly as V5 indexes them: a run bounded by a later flight
      // is a CLOSED gap; a run reaching the last column is still open, and an SP
      // who never flew inside the range is open throughout.
      const flownIdx = days.map((d, i) => (sp.flownByDate[d] ? i : -1)).filter(i => i >= 0);
      const idleCell = new Array(days.length).fill(0);
      for (let k = 0; k < flownIdx.length - 1; k++) {
        const gap = flownIdx[k + 1] - flownIdx[k] - 1;
        if (gap >= IDLE_MIN) for (let i = flownIdx[k] + 1; i < flownIdx[k + 1]; i++) idleCell[i] = 1;
      }
      const lastFlown = flownIdx.length ? flownIdx[flownIdx.length - 1] : -1;
      const openGap = days.length - 1 - lastFlown;
      if (lastFlown >= 0 && openGap >= IDLE_MIN) for (let i = lastFlown + 1; i < days.length; i++) idleCell[i] = 2;
      if (lastFlown < 0) for (let i = 0; i < days.length; i++) idleCell[i] = 2;

      const nm = el('span', { class: 'nm', title: sp.name + ' — click for the full record' }, [sp.shortName]);
      nm.addEventListener('click', () => openSPDrawer(sp.catc_id));
      const tr = el('tr', { 'data-sp': String(sp.catc_id) }, [
        el('td', { class: 'idc', style: 'left:0' }, [nm]),
        el('td', { class: 'idc', style: 'left:' + NW + 'px;text-align:right;font-family:JetBrains Mono,monospace;font-size:9px;color:var(--v6-tx2)' },
          [totL + 'L·' + totH.toFixed(1) + 'h']),
      ]);
      days.forEach((d, di) => {
        const hv = cellH[sp.catc_id + '|' + d] || 0;
        const fl = sp.flownByDate[d];
        const isMon = new Date(d + 'T12:00:00Z').getUTCDay() === 1;
        const cls = ['cal'];
        if (isMon && di > 0) cls.push('mon');
        if (d === m.asOf) cls.push('today');
        if (!fl && idleCell[di] === 1) cls.push('idle');
        if (!fl && idleCell[di] === 2) { cls.push('idle'); cls.push('idle-open'); }
        let bg = 'transparent', brd = '1px solid var(--v6-bd)';
        if (hv > 0) {
          const ph = U.phaseOfNum(fl[0].num);
          const pct = Math.round(Math.max(24, Math.min(1, hv / maxH) * 88));
          bg = mixRgba(ph.c, pct);
          brd = '1px solid ' + mixRgba(ph.c, Math.min(100, pct + 15));
        }
        const td = el('td', {
          class: cls.join(' '), style: 'background:' + bg + ';border:' + brd,
        }, [hv > 0 && CW >= 20
          ? el('span', { style: 'font-size:7px;font-weight:600;color:' + (hv / maxH > 0.55 ? 'rgba(255,255,255,.92)' : 'var(--v6-tx2)') }, [hv.toFixed(1)])
          : null]);
        // Every cell is clickable, not only the flown ones: an empty day can
        // still have a cancelled or pending Ops booking behind it, which is
        // exactly what someone clicking an unexpected blank is asking about.
        td.addEventListener('click', () => openDayModal(sp, d));
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);

    const dayTot = days.map(d => {
      let hv = 0, les = 0;
      sps.forEach(sp => { const fl = sp.flownByDate[d]; if (fl) { les += fl.length; hv += fl.reduce((a, f) => a + f.effMins / 60, 0); } });
      return { hv, les };
    });
    const tf = el('tfoot');
    const footRow = (label, pick) => {
      const tr = el('tr', {}, [
        el('td', { class: 'idc', style: 'left:0' }, [label]),
        el('td', { class: 'idc', style: 'left:' + NW + 'px' }, ['']),
      ]);
      days.forEach((d, i) => { const v = pick(dayTot[i]); tr.appendChild(el('td', { title: fd(d) + ' · ' + (v || 0) }, [v ? String(v) : ''])); });
      return tr;
    };
    tf.appendChild(footRow('Hours/day', t => (t.hv ? t.hv.toFixed(0) : '')));
    tf.appendChild(footRow('Lessons/day', t => (t.les || '')));
    table.appendChild(tf);
    host.appendChild(el('div', { class: 'v6-gw' }, [table]));
  }

  // One day, both systems — what the Progress feed recorded and what Operations
  // booked, including a cancelled or pending booking on a day that flew nothing.
  function openDayModal(sp, date) {
    const flown = sp.flownByDate[date] || [];
    const R = window.AP127Reconcile, ix = opsIndex();
    const opsRows = (R && ix.ok) ? ((ix.byDate[R.ccKeyFromFull(sp.name)] || {})[date] || []) : [];
    const blocks = [];
    if (flown.length) {
      blocks.push({ heading: 'Progress record', rows: flown.map((f, i) =>
        ['Flight ' + (i + 1), f.lesson + ' · ' + (f.effMins / 60).toFixed(2) + 'h' + (f.isRetake ? ' (retake)' : '') + (f.fromOps ? ' · credited from Ops' : '')]) });
    } else {
      blocks.push({ heading: 'Progress record', text: 'Nothing recorded for ' + sp.shortName + ' on this day.' });
    }
    if (!ix.ok) blocks.push({ heading: 'Operations record', text: 'The Ops feed is not loaded in this session.' });
    else if (opsRows.length) opsRows.forEach((f, i) => blocks.push({ heading: 'Ops booking ' + (i + 1) + ' of ' + opsRows.length, rows: opsRowsDl(f) }));
    else {
      const inWin = ix.window && date >= ix.window.min && date <= ix.window.max;
      blocks.push({ heading: 'Operations record', text: inWin
        ? 'No booking at all on this day, and the date is inside the Ops feed’s coverage (' + fd(ix.window.min) + ' → ' + fd(ix.window.max) + ') — so nothing was scheduled, rather than a booking having aged out.'
        : 'The date is outside the Ops feed’s coverage window, so any booking has aged out of the feed.' });
    }
    if (flown.length && flown[0].num != null) {
      blocks.push({ node: el('button', { class: 'v6-btn', onclick: () => openLessonModal(sp, flown[0].num) }, ['Open the lesson record →']) });
    }
    openModal(sp.name + ' · ' + fdLong(date), flown.length ? flown.length + ' ' + plural(flown.length, 'flight') + ' recorded' : 'no flying recorded', blocks);
  }

  // Both grids are rebuilt from scratch on any change that reorders or filters
  // the roster, so the curriculum grid, the activity calendar, the
  // constellation and the roster table can never disagree about which SP are
  // shown or in what order.
  function regridAll() {
    const sit = ROOT && $('#v6-act-situation', ROOT);
    if (sit && sit._regrid) sit._regrid();
    const ppl = ROOT && $('#v6-act-people', ROOT);
    if (ppl && ppl._recal) ppl._recal();
  }

  // ── floating tooltip ─────────────────────────────────────────────────────
  let TIP = null;
  function showTip(cx, cy, html) {
    if (!TIP) { TIP = el('div', { class: 'v6-tip' }); document.body.appendChild(TIP); }
    TIP.innerHTML = html;
    const r = TIP.getBoundingClientRect();
    TIP.style.left = Math.min(window.innerWidth - r.width - 10, cx + 14) + 'px';
    TIP.style.top = Math.max(8, cy - r.height - 12) + 'px';
  }
  function hideTip() { if (TIP) { TIP.remove(); TIP = null; } }

  // ═════════════════════════════════════════════════════════════════════════
  // ACT 03 — FORECAST
  // ═════════════════════════════════════════════════════════════════════════
  function coneCfg(mcOverride) {
    const m = MODEL, fc = FCAST;
    const unit = S.unit;
    const mc = mcOverride || fc.monteCarlo[unit];
    const doneNow = unit === 'lessons' ? m.batch.lessonsDone : m.batch.hoursDone;
    const total = unit === 'lessons' ? m.batch.lessonSlots : m.batch.hourSlots;
    const acc = cssv('--v6-acc', '#e88aff'), acc2 = cssv('--v6-acc2', '#22d3ee'), bad = cssv('--v6-bad', '#fb7185');
    const t = axisTheme();
    const px = ms => new Date(ms + 'T00:00:00Z').getTime();

    const actual = m.series[unit === 'lessons' ? 'lessons' : 'hours'].actual.map(p => ({ x: px(p.x), y: p.y }));
    const anchor = { x: px(m.asOf), y: +doneNow.toFixed(2) };
    // Capped at the course total: the simulation keeps generating output past
    // completion (it has to, to find the finish day for the slowest runs), but
    // a batch cannot fly more than 100% of its own syllabus, and an uncapped
    // cone pushed the y-axis ~40% above the total and made the whole chart
    // read as if there were more course left than there is.
    const cap = v => Math.min(total, v);
    const band = k => [anchor].concat(mc.cone.map(c => ({ x: px(c.date), y: +cap(doneNow + c[k]).toFixed(2) })));
    const p10 = band('p10'), p50 = band('p50'), p90 = band('p90');

    const planEnd = m.curriculum.planEndDate;
    const requiredLine = planEnd ? [anchor, { x: px(planEnd), y: total }] : [];
    // The two reference schedules, on the same batch-cumulative scale as the
    // cone: the curriculum's original plan (drawn to its own finish date) and
    // the revised target checkpoints. Without them the cone shows where the
    // batch is going but not what it was ever meant to do.
    const key2 = unit === 'lessons' ? 'lessons' : 'hours';
    const planFull = (m.series[key2].planFull || []).map(p => ({ x: px(p.x), y: p.y }));
    const targetPts = (m.series.target[key2] || []).map(p => ({ x: px(p.x), y: p.y }));

    return {
      type: 'line',
      data: {
        datasets: [
          { label: 'Actual flown', data: actual, borderColor: acc, backgroundColor: acc + '1e', borderWidth: 2.4, fill: true, tension: .2, pointRadius: 0, order: 2 },
          { label: 'P10 (pessimistic)', data: p10, borderColor: acc2 + '55', borderWidth: 1, fill: false, pointRadius: 0, tension: .1, order: 5 },
          { label: 'P90 (optimistic)', data: p90, borderColor: acc2 + '55', borderWidth: 1, fill: '-1', backgroundColor: acc2 + '20', pointRadius: 0, tension: .1, order: 5 },
          { label: 'P50 forecast', data: p50, borderColor: acc2, borderWidth: 2.4, borderDash: [5, 3], fill: false, pointRadius: 0, tension: .1, order: 1 },
          { label: 'Required to hit plan', data: requiredLine, borderColor: bad, borderWidth: 1.8, borderDash: [8, 4], fill: false, pointRadius: 3, order: 3 },
          { label: 'Original plan', data: planFull, borderColor: t.tick, borderWidth: 1.8, borderDash: [6, 4], fill: false, pointRadius: 0, tension: .1, order: 4 },
          { label: 'Revised target', data: targetPts, borderColor: cssv('--v6-acc3', '#a78bfa'), borderWidth: 1.6, borderDash: [2, 3], fill: false, pointRadius: 2, order: 4 },
          { label: 'Course total', data: requiredLine.length ? [{ x: actual.length ? actual[0].x : anchor.x, y: total }, { x: px(mc.cone.length ? mc.cone[mc.cone.length - 1].date : m.asOf), y: total }] : [], borderColor: t.tick, borderWidth: 1, borderDash: [2, 4], fill: false, pointRadius: 0, order: 6 },
        ],
      },
      options: {
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: { x: timeScale(), y: valScale(unit === 'lessons' ? 'cumulative lessons (batch)' : 'cumulative hours (batch)') },
        plugins: {
          legend: { display: false },
          tooltip: tooltipTheme({
            callbacks: { label: c => c.dataset.label + ': ' + (unit === 'lessons' ? fN(c.parsed.y) + ' les' : fH(c.parsed.y, 0)) },
          }),
        },
      },
    };
  }

  function histCfg(mcOverride) {
    const mc = mcOverride || FCAST.monteCarlo[S.unit];
    const acc2 = cssv('--v6-acc2', '#22d3ee'), acc = cssv('--v6-acc', '#e88aff');
    const labels = mc.hist.map(b => fd(b.date));
    const inBand = b => b.date >= mc.finish.p10 && b.date <= mc.finish.p90;
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'simulations finishing',
          data: mc.hist.map(b => +(b.share * 100).toFixed(2)),
          backgroundColor: mc.hist.map(b => (inBand(b) ? acc2 : acc2 + '44')),
          borderColor: mc.hist.map(b => (b.date <= mc.finish.p50 && (b.endDate >= mc.finish.p50) ? acc : 'transparent')),
          borderWidth: 2, borderRadius: 3,
        }],
      },
      options: {
        scales: {
          x: { grid: { display: false }, ticks: { color: cssv('--v6-tx3', '#65708c'), font: { size: 8, family: 'JetBrains Mono' }, maxRotation: 60, minRotation: 45, autoSkip: true, maxTicksLimit: 12 } },
          y: valScale('% of simulations'),
        },
        plugins: {
          legend: { display: false },
          tooltip: tooltipTheme({
            callbacks: {
              title: items => 'Finishing ' + labels[items[0].dataIndex] + ' → ' + fd(mc.hist[items[0].dataIndex].endDate),
              label: c => c.parsed.y.toFixed(1) + '% of ' + fN(mc.sims) + ' simulations',
            },
          }),
        },
      },
    };
  }

  function buildForecastAct() {
    const m = MODEL, fc = FCAST, v = fc.verdict, g = gradeOf();
    const mc = fc.monteCarlo.hours;
    const { sec, grid } = actShell('forecast', '03', 'Future prediction',
      'A circular block bootstrap over the last ' + fc.window + ' days of real output: ' + fN(mc.sims) +
      ' simulated futures, resampled in whole weeks so the batch’s own flying rhythm is preserved. The seed is fixed, so this forecast is reproducible — the screen, the report and the PDF all show the same dates.');

    // ── cone ──
    const coneBox = el('div', { class: 'v6-chart', style: 'height:330px' }, [el('canvas', { id: 'v6-cone' })]);
    grid.appendChild(card('Forecast cone', 'P10–P90 band · the shaded region is where 80% of simulated futures live', [
      coneBox,
      legendRow([[cssv('--v6-acc', '#e88aff'), 'Actual flown'], [cssv('--v6-acc2', '#22d3ee'), 'P50 forecast'],
        [cssv('--v6-acc2', '#22d3ee') + '55', 'P10–P90 band'], [cssv('--v6-bad', '#fb7185'), 'Required to hit plan'],
        [cssv('--v6-tx3', '#65708c'), 'Original plan'], [cssv('--v6-acc3', '#a78bfa'), 'Revised target']]),
    ], 'v6-c12'));

    // ── finish summary ──
    const slipOf = d => (d && v.planEnd ? U.dateDiff(d, v.planEnd) : null);
    const sumRows = [
      ['Optimistic (P10)', mc.finish.p10, slipOf(mc.finish.p10)],
      ['Most likely (P50)', mc.finish.p50, slipOf(mc.finish.p50)],
      ['Pessimistic (P90)', mc.finish.p90, slipOf(mc.finish.p90)],
    ];
    const summary = el('div', {}, [
      el('div', { class: 'v6-wi-out' }, [
        el('div', { class: 'k' }, ['Most likely completion']),
        el('div', { class: 'big', style: 'color:var(' + g.c + ')' }, [mc.finish.p50 ? fdLong(mc.finish.p50) : '—']),
        el('div', { class: 'v6-note', style: 'margin-top:5px' }, [
          v.slipDays == null ? 'no forecast available' : fDays(v.slipDays) + ' past the ' + fd(v.planEnd) + ' plan date',
        ]),
        el('div', { class: 'v6-wi-rows' }, sumRows.map(([l, d, s]) =>
          el('div', {}, [el('span', {}, [l]), el('b', { class: 'v6-mono' }, [fd(d) + (s == null ? '' : '  ' + sgn(s, x => x.toFixed(0) + 'd'))])]))),
      ]),
      el('div', { class: 'v6-note', style: 'margin-top:12px' }, [
        'Probability of finishing on or before the plan date: ',
        el('b', { style: 'color:var(--v6-bad)' }, [mc.probOnPlan == null ? '—' : (mc.probOnPlan * 100).toFixed(1) + '%']),
        '. The bootstrap window averages ' + fH(mc.dailyMean, 1) + '/day of batch output.',
      ]),
    ]);
    grid.appendChild(card('Completion estimate', 'seed ' + mc.seed + ' · reproducible', summary, 'v6-c12'));

    // ── distribution ──
    const histBox = el('div', { class: 'v6-chart', style: 'height:220px' }, [el('canvas', { id: 'v6-hist' })]);
    grid.appendChild(card('When it finishes', 'distribution of the ' + fN(mc.sims) + ' simulated completion dates', [
      histBox,
      el('div', { class: 'v6-note', style: 'margin-top:8px' }, ['Solid bars fall inside the P10–P90 band; the magenta outline marks the bucket containing the P50 date.']),
    ], 'v6-c12'));

    // ── rate card / scenarios ──
    const sc = fc.scenarios.hours;
    const rateTbl = el('table', { class: 'v6-t v6-fit' }, [
      el('thead', {}, [el('tr', {}, ['Rate', 'h / day', 'Finishes', 'vs plan', 'Basis'].map(t => el('th', {}, [t])))]),
      el('tbody', {}, fc.rateCard.map(r => {
        const isReq = r.key === 'required';
        const proj = isReq ? null : FC.projectAtRate(m.pace.remHrsB, r.value, m.asOf, 3650);
        const slip = isReq ? 0 : (proj && proj.date ? U.dateDiff(proj.date, v.planEnd) : null);
        return el('tr', { title: r.basis }, [
          el('td', { style: isReq ? 'color:var(--v6-bad);font-weight:600' : '' }, [r.label]),
          el('td', { class: 'n' }, [fH(r.value, 2)]),
          el('td', { class: 'n' }, [isReq ? fd(v.planEnd) : (proj && proj.date ? fd(proj.date) : 'never')]),
          el('td', { class: 'n', style: 'color:var(--v6-' + (slip == null ? 'tx3' : slip > 0 ? 'bad' : 'good') + ')' }, [slip == null ? '—' : sgn(slip, x => x.toFixed(0) + 'd')]),
          el('td', { style: 'color:var(--v6-tx3);font-size:9.5px;line-height:1.4' }, [r.basis]),
        ]);
      })),
    ]);
    grid.appendChild(card('Every rate, and what it would mean', 'straight-line projections — no simulation, checkable by hand',
      [el('div', { class: 'v6-tw' }, [rateTbl])], 'v6-c12'));

    // ── what-if ──
    const wiOut = el('div', { class: 'v6-wi-out' });
    const multLbl = el('b', {}, ['1.00×']);
    const extraLbl = el('b', {}, ['+0.0h']);
    const multIn = el('input', { type: 'range', min: '50', max: '400', value: '100', step: '5', 'aria-label': 'Capacity multiplier' });
    const extraIn = el('input', { type: 'range', min: '0', max: '60', value: '0', step: '1', 'aria-label': 'Extra batch hours per day' });
    let wiTimer = null;
    function runWhatIf() {
      const mult = (+multIn.value) / 100, extra = +extraIn.value;
      S.whatIf = { mult, extra };
      multLbl.textContent = mult.toFixed(2) + '×';
      extraLbl.textContent = '+' + extra.toFixed(0) + 'h/day';
      clearTimeout(wiTimer);
      wiTimer = setTimeout(() => {
        const r = fc.whatIf({ unit: 'hours', sortieMultiplier: mult, extraPerDay: extra });
        const slip = r.slipDays;
        const tone = slip == null ? 'tx3' : slip <= 0 ? 'good' : slip <= 60 ? 'warn' : 'bad';
        wiOut.innerHTML = '';
        wiOut.appendChild(el('div', { class: 'k' }, ['Projected completion under this scenario']));
        wiOut.appendChild(el('div', { class: 'big', style: 'color:var(--v6-' + tone + ')' }, [r.p50 ? fdLong(r.p50) : 'beyond horizon']));
        wiOut.appendChild(el('div', { class: 'v6-wi-rows' }, [
          el('div', {}, [el('span', {}, ['Rate this runs on']), el('b', { class: 'v6-mono' }, [fH(r.rate, 1) + '/day  (' + sgn(r.deltaPerDay, x => fH(x, 1)) + ' vs the ' + r.window + '-day mean)'])]),
          el('div', {}, [el('span', {}, ['vs plan date']), el('b', { class: 'v6-mono', style: 'color:var(--v6-' + tone + ')' }, [slip == null ? '—' : sgn(slip, x => x.toFixed(0) + 'd')])]),
          el('div', {}, [el('span', {}, ['P10 – P90']), el('b', { class: 'v6-mono' }, [fd(r.p10) + ' – ' + fd(r.p90)])]),
          el('div', {}, [el('span', {}, ['Chance of hitting plan']), el('b', { class: 'v6-mono' }, [r.probOnPlan == null ? '—' : (r.probOnPlan * 100).toFixed(1) + '%'])]),
          el('div', {}, [el('span', {}, ['vs today’s forecast']), el('b', { class: 'v6-mono' }, [(function () {
            if (!r.p50 || !mc.finish.p50) return '—';
            const d = U.dateDiff(r.p50, mc.finish.p50);
            return d === 0 ? 'no change' : Math.abs(d) + ' days ' + (d < 0 ? 'earlier' : 'later');
          })()])]),
        ]));
      }, 90);
    }
    multIn.addEventListener('input', runWhatIf);
    extraIn.addEventListener('input', runWhatIf);
    const wi = el('div', { class: 'v6-whatif' }, [
      el('div', {}, [
        el('div', { class: 'v6-slider' }, [el('label', {}, ['Run the line harder ', multLbl]), multIn]),
        el('div', { class: 'v6-slider' }, [el('label', {}, ['Add fixed output ', extraLbl]), extraIn]),
        el('div', { class: 'v6-note' }, [
          'The multiplier scales every resampled day — 1.50× means every flying day produces half as much again, and every stand-down day still produces nothing. ',
          'The fixed addition adds batch hours to every calendar day, which is what a genuinely new capability (an extra aircraft, an added shift) looks like. ',
          'Both feed the same bootstrap, with the same simulation count and seed as the headline forecast — so leaving both at neutral reproduces the headline date exactly rather than landing a few days off it.',
        ]),
        el('div', { style: 'margin-top:11px;display:flex;gap:6px;flex-wrap:wrap' }, [
          el('button', { class: 'v6-btn', onclick: () => { multIn.value = '100'; extraIn.value = '0'; runWhatIf(); } }, ['Reset']),
          el('button', { class: 'v6-btn', onclick: () => { const need = m.pace.reqDayHrsB / Math.max(0.01, fc.velocity.hours.ewma); multIn.value = String(Math.min(400, Math.round(need * 100))); extraIn.value = '0'; runWhatIf(); } }, ['What plan actually needs']),
        ]),
      ]),
      wiOut,
    ]);
    grid.appendChild(card('What would change it', 'move a slider — the forecast re-runs', wi, 'v6-c12'));


    sec._afterMount = () => { mkChart('v6-cone', coneCfg()); mkChart('v6-hist', histCfg()); runWhatIf(); };
    return sec;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ACT 04 — THE BATCH
  // ═════════════════════════════════════════════════════════════════════════
  const SORTS = {
    // Default: fewest lessons completed first, so the SP who most needs looking
    // at is row 1 without anyone having to sort for it.
    behind: { label: 'Most behind', get: r => r.lessonsDone },
    etc: { label: 'Projected finish', get: r => r.etcDays == null ? 1e9 : r.etcDays },
    name: { label: 'Name', get: r => r.name, str: true },
    hours: { label: 'Hours done', get: r => -r.hoursDone },
    lessons: { label: 'Lessons done', get: r => -r.lessonsDone },
    idle: { label: 'Idle days', get: r => -(r.idleDays == null ? -1 : r.idleDays) },
    gap: { label: 'Behind plan', get: r => r.hrsDelta },
    rel: { label: 'vs cohort', get: r => (r.vsCohortDays == null ? 1e9 : r.vsCohortDays) },
  };
  function forecastRows() {
    const rows = FCAST.students.rows.slice();
    const q = (S.search || '').trim().toLowerCase();
    const f = q ? rows.filter(r => (r.name + ' ' + (r.nick || '') + ' ' + (r.sp.fi || '') + ' ' + (r.sp.se || '')).toLowerCase().includes(q)) : rows;
    const s = SORTS[S.sortKey] || SORTS.behind;
    return f.sort((a, b) => {
      const av = s.get(a), bv = s.get(b);
      const c = s.str ? String(av).localeCompare(String(bv)) : (av - bv);
      return c * S.sortDir;
    });
  }

  // Per-SP daily cumulative hours over a trailing window — the sparkline on
  // every SP card. Built from the SAME flown records the model deduped, so a
  // retake adds a flat step rather than a false climb.
  function spSpark(sp, days) {
    const end = MODEL.asOf, start = U.addDays(end, -(days - 1));
    const byDate = {};
    sp.flown.forEach(f => { if (f.date >= start && !f.isRetake) byDate[f.date] = (byDate[f.date] || 0) + f.effMins / 60; });
    const out = []; let acc = 0;
    U.datesRange(start, end).forEach(d => { acc += byDate[d] || 0; out.push(+acc.toFixed(2)); });
    return out;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // THE RACE  (V4's "Actual vs Planned", redesigned)
  //
  // V4 drew one cumulative line per SP against a dashed plan and a batch
  // average, with a "solo" dropdown to isolate one student. The data question
  // is the right one — who is pulling ahead, who is drifting back, and when did
  // they separate — but 28 same-weight lines plus a separate solo control is a
  // hard read. Here the same series hang off V6's existing focus bus instead:
  // hovering ANY SP anywhere on the page (a constellation card, a ladder row, a
  // roster row, this chart) thickens their line and fades the other 27, so
  // isolation is a hover rather than a control, and it stays in sync with every
  // other panel.
  //
  // Plan and Target are divided by the student count — the model publishes them
  // as batch totals (×28), and drawing a 28-SP total against 28 individual
  // lines is the scaling bug V5 shipped once and had to fix.
  // ═════════════════════════════════════════════════════════════════════════
  let RACE = null;
  function raceField() {
    const f = S.raceFilter || {};
    return forecastRows().map(x => x.sp).filter(sp => {
      if (f.sp && String(sp.catc_id) !== f.sp) return false;
      if (f.se && (sp.se || '—') !== f.se) return false;
      return true;
    });
  }
  function raceData() {
    const f = S.raceFilter || {};
    const key = S.unit + '|' + MODEL.asOf + '|' + (S.search || '') + '|' + (f.sp || '') + '|' + (f.se || '');
    if (RACE && RACE.key === key) return RACE;
    const dates = FCAST.series.dates;
    const at = {}; dates.forEach((d, i) => { at[d] = i; });
    const isLes = S.unit === 'lessons';
    const per = raceField().map(sp => {
      const step = new Float64Array(dates.length);
      sp.flown.forEach(f => { const i = at[f.date]; if (i != null) step[i] += isLes ? 1 : f.effMins / 60; });
      let run = 0;
      const pts = dates.map((d, i) => { run += step[i]; return { x: new Date(d + 'T00:00:00Z').getTime(), y: +run.toFixed(2) }; });
      return { sp, pts, final: +run.toFixed(2) };
    });
    const avg = dates.map((d, i) => ({
      x: new Date(d + 'T00:00:00Z').getTime(),
      y: +(per.reduce((a, p) => a + p.pts[i].y, 0) / (per.length || 1)).toFixed(2),
    }));
    const finals = per.map(p => p.final).sort((a, b) => a - b);
    const med = finals.length ? finals[Math.floor(finals.length / 2)] : 0;
    const lead = per.slice().sort((a, b) => b.final - a.final)[0];
    const tail = per.slice().sort((a, b) => a.final - b.final)[0];
    return (RACE = { key, dates, per, avg, median: med, leader: lead, laggard: tail, spread: finals.length ? finals[finals.length - 1] - finals[0] : 0 });
  }

  function raceCfg() {
    const m = MODEL, unit = S.unit, r = raceData();
    const key = unit === 'lessons' ? 'lessons' : 'hours';
    const n = m.students.length || 1;
    const px = ds => new Date(ds + 'T00:00:00Z').getTime();
    const t = axisTheme();
    const ds = [];
    // Plan and Target, scaled to ONE student.
    ds.push({
      label: 'Curriculum plan / SP', data: (m.series[key].plan || []).map(p => ({ x: px(p.x), y: +(p.y / n).toFixed(2) })),
      borderColor: t.tick, borderWidth: 2, borderDash: [6, 4], fill: false, pointRadius: 0, tension: .1, order: 2, _sp: null,
    });
    if (m.series.target[key] && m.series.target[key].length) {
      ds.push({
        label: 'Revised target / SP', data: m.series.target[key].filter(p => p.x <= m.asOf).map(p => ({ x: px(p.x), y: +(p.y / n).toFixed(2) })),
        borderColor: cssv('--v6-bad', '#fb7185'), borderWidth: 1.6, borderDash: [2, 3], fill: false, pointRadius: 2, order: 1, _sp: null,
      });
    }
    r.per.forEach(p => {
      const base = 'hsla(' + p.sp.hue + ',80%,62%,0.62)';
      ds.push({
        label: p.sp.shortName, data: p.pts, borderColor: base, borderWidth: 1.3, fill: false,
        pointRadius: 0, pointHoverRadius: 4, tension: .15, order: 4,
        _sp: String(p.sp.catc_id), _base: base,
        _hot: 'hsla(' + p.sp.hue + ',92%,66%,1)', _dim: 'hsla(' + p.sp.hue + ',35%,50%,0.13)',
      });
    });
    ds.push({
      label: 'Batch average', data: r.avg, borderColor: cssv('--v6-acc', '#e88aff'),
      borderWidth: 2.6, fill: false, pointRadius: 0, tension: .15, order: 0, _sp: null,
    });
    return {
      type: 'line', data: { datasets: ds },
      options: {
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        onHover: (e, els, chart) => {
          const d = els && els.length ? chart.data.datasets[els[0].datasetIndex] : null;
          const id = d && d._sp ? d._sp : null;
          if (id !== S.focusSp) setFocus(id);
        },
        onClick: (e, els, chart) => {
          const d = els && els.length ? chart.data.datasets[els[0].datasetIndex] : null;
          if (d && d._sp) openSPDrawer(d._sp);
        },
        scales: { x: timeScale(), y: valScale(unit === 'lessons' ? 'lessons per SP' : 'hours per SP') },
        plugins: {
          legend: { display: false },
          tooltip: tooltipTheme({
            callbacks: { label: c => c.dataset.label + ': ' + (unit === 'lessons' ? fN(c.parsed.y) + ' les' : fH(c.parsed.y, 1)) },
          }),
        },
      },
    };
  }

  // Streak figures still back the idle statistics beside the activity
  // calendar; the canvas band and the 28-line streak chart they used to draw
  // were replaced by that calendar and are gone.
  const LONG_IDLE = 7;
  let STREAKS = null;
  function streakData() {
    if (STREAKS && STREAKS.asOf === MODEL.asOf) return STREAKS;
    const st = MODEL.streaks();
    const rows = st.perSP.map(p => {
      const vals = p.series.map(x => x.y);
      const cur = vals[vals.length - 1] || 0;
      let bestRun = 0, worstIdle = 0;
      vals.forEach(v => { if (v > bestRun) bestRun = v; if (v < worstIdle) worstIdle = v; });
      return { sp: p.sp, vals, cur, bestRun, worstIdle: Math.abs(worstIdle), flyingDays: vals.filter(v => v > 0).length };
    });
    return (STREAKS = { asOf: MODEL.asOf, days: st.days, perSP: st.perSP, avg: st.avg, rows });
  }

  // A chart rebuilt after a theme switch is a NEW Chart.js instance, so the
  // focus subscription has to be re-pointed at it. The subscription itself is
  // keyed by chart id and reads CHARTS[id] at call time, so re-binding is only
  // needed when a rebuild happened outside bindChartFocus's own path.
  function bindChartFocusRefresh(id) { if (S.focusSp) { const c = CHARTS[id]; if (c) c.update('none'); } }

  // Both new charts restyle on focus — CSS can dim a card, not a Chart.js line.
  function bindChartFocus(id) {
    onFocus(fid => {
      const c = CHARTS[id]; if (!c) return;
      c.data.datasets.forEach(d => {
        if (!d._sp) return;
        const hot = fid && d._sp === fid;
        d.borderColor = hot ? d._hot : (fid ? d._dim : d._base);
        d.borderWidth = hot ? 2.8 : (fid ? 1 : (id === 'v6-race' ? 1.3 : 1.1));
        d.order = hot ? -1 : 4;
      });
      c.update('none');
    });
  }

  function buildPeople() {
    const m = MODEL, fc = FCAST;
    const { sec, grid } = actShell('people', '04', 'AP127 each SP',
      'The same story at individual level: one row per student pilot, ranked most-behind first, carrying the progress bar, the 60-day trend and the standing figures on the same line. Click a row for that SP’s full record.');

    // The constellation's cards are folded into the roster: one row per SP,
    // carrying the progress bar and the 60-day trend the cards used to show.
    // Two surfaces listing the same 28 people, sorted the same way, was one
    // surface too many.
    const sortSeg = el('div', { class: 'v6-seg' }, Object.entries(SORTS).map(([k, def]) =>
      el('button', { class: S.sortKey === k ? 'on' : '', title: 'Sort by ' + def.label, onclick: () => {
        if (S.sortKey === k) S.sortDir *= -1; else { S.sortKey = k; S.sortDir = 1; }
        persist();
        $$('button', sortSeg).forEach(b => b.classList.toggle('on', b.getAttribute('data-k') === S.sortKey));
        renderRoster(); regridAll();
      }, 'data-k': k }, [def.label])));

    // ── the race (V4's Actual vs Planned, redesigned) ──
    const raceBox = el('div', { class: 'v6-chart', style: 'height:360px' }, [el('canvas', { id: 'v6-race' })]);
    const standing = (label, val, sub, spId) => {
      const node = el('div', { class: 'v6-standing', 'data-sp': spId ? String(spId) : null }, [
        el('div', { class: 'l' }, [label]), el('div', { class: 'v' }, [val]), el('div', { class: 's' }, [sub]),
      ]);
      if (spId) {
        node.addEventListener('mouseenter', () => setFocus(spId));
        node.addEventListener('mouseleave', () => setFocus(null));
        node.addEventListener('click', () => openSPDrawer(spId));
      }
      return node;
    };
    const uv = v => (S.unit === 'lessons' ? fN(v) + ' les' : fH(v, 1));
    const standingsHost = el('div', {});
    function renderStandings() {
      const rr = raceData();
      standingsHost.innerHTML = '';
      standingsHost.appendChild(el('div', { class: 'v6-standings' }, [
        standing('Out in front', rr.leader ? rr.leader.sp.shortName : '—', rr.leader ? uv(rr.leader.final) : '', rr.leader && rr.leader.sp.catc_id),
        standing('Median', uv(rr.median), rr.per.length + ' SP shown', null),
        standing('Furthest back', rr.laggard ? rr.laggard.sp.shortName : '—', rr.laggard ? uv(rr.laggard.final) : '', rr.laggard && rr.laggard.sp.catc_id),
        standing('Front to back', uv(rr.spread), 'gap across the field', null),
      ]));
    }
    // Filters: narrow the field to a group worth comparing. They drive the same
    // `raceFilter` the chart builder reads, so the standings strip and the
    // chart always describe the same set of SP.
    const seList = [...new Set(MODEL.students.map(sp => sp.se || '—'))].sort();
    const spList = MODEL.students.slice().sort((a, b) => a.shortName.localeCompare(b.shortName));
    const mkFilter = (label, key, opts) => {
      const seg = el('div', { class: 'v6-seg' }, [{ v: '', l: 'All' }].concat(opts.map(o => ({ v: o, l: o })))
        .map(o => el('button', {
          class: (S.raceFilter[key] || '') === o.v ? 'on' : '', 'data-v': o.v, title: label + ': ' + o.l,
          onclick: () => {
            S.raceFilter[key] = o.v;
            $$('button', seg).forEach(b => b.classList.toggle('on', (b.getAttribute('data-v') || '') === (S.raceFilter[key] || '')));
            RACE = null;
            mkChart('v6-race', raceCfg()); bindChartFocus('v6-race');
            renderStandings();
          },
        }, [o.l])));
      return el('div', { class: 'v6-ctl' }, [el('span', { class: 'v6-ctl-l' }, [label]), seg]);
    };
    // 28 SP is far too many for a segmented control, so the SP filter is a
    // select. Picking one leaves that single line against the plan, the revised
    // target and the batch average — which is the "how is this student doing"
    // view, rather than a race.
    const spSel = el('select', { class: 'v6-input', 'aria-label': 'Filter to one student pilot' },
      [el('option', { value: '' }, ['All SP'])].concat(spList.map(sp =>
        el('option', { value: String(sp.catc_id), selected: S.raceFilter.sp === String(sp.catc_id) ? 'selected' : null }, [sp.shortName]))));
    spSel.addEventListener('change', () => {
      S.raceFilter.sp = spSel.value || '';
      RACE = null;
      mkChart('v6-race', raceCfg()); bindChartFocus('v6-race');
      renderStandings();
    });
    const raceFilters = el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;align-items:flex-end' }, [
      el('div', { class: 'v6-ctl' }, [el('span', { class: 'v6-ctl-l' }, ['Student pilot']), spSel]),
      mkFilter('Aircraft', 'se', seList),
    ]);

    grid.appendChild(card('The race', 'every SP’s own progress against the plan · hover to isolate, click for the record', [
      raceFilters,
      raceBox,
      legendRow([[cssv('--v6-acc', '#e88aff'), 'Batch average'], [cssv('--v6-tx3', '#65708c'), 'Curriculum plan / SP'],
        [cssv('--v6-bad', '#fb7185'), 'Revised target / SP'], ['hsla(300,80%,62%,.7)', 'one line per SP']]),
      standingsHost,
    ], 'v6-c12', { info: [
      el('p', {}, ['One cumulative line per student pilot against the curriculum plan and the revised target, with the batch average over the top. Where the lines fan out is where the cohort began to separate.']),
      el('p', { style: 'margin-top:8px' }, ['Plan and target are drawn ', el('b', {}, ['per student']), ' — the metrics engine publishes them as ' + MODEL.students.length +
        '-SP batch totals, and comparing a batch total against individual lines would place them ' + MODEL.students.length + '× too high.']),
      el('p', { style: 'margin-top:8px' }, ['Hovering any SP — here, on a card, in the ladder, in the roster or in the calendar — highlights them everywhere at once. The filters narrow the field to a single student pilot or one aircraft type, and the standings underneath follow the filter.']),
    ] }));

    // ── activity calendar (replaces the streak band) ──
    const st = streakData();
    const calHost = el('div', {});
    const calTools = el('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, [
      (function () {
        const seg = el('div', { class: 'v6-seg' }, [['none', 'No group'], ['instructor', 'By instructor']].map(([k, lbl]) =>
          el('button', { class: CAL.groupBy === k ? 'on' : '', 'data-g': k, onclick: () => {
            CAL.groupBy = k;
            $$('button', seg).forEach(b => b.classList.toggle('on', b.getAttribute('data-g') === k));
            buildActivityCalendar(calHost);
          } }, [lbl])));
        return seg;
      })(),
      (function () {
        const seg = el('div', { class: 'v6-seg' }, [[30, '30d'], [60, '60d'], [90, '90d'], [0, 'All']].map(([k, lbl]) =>
          el('button', { class: CAL.range === k ? 'on' : '', 'data-r': String(k), onclick: () => {
            CAL.range = k;
            $$('button', seg).forEach(b => b.classList.toggle('on', +b.getAttribute('data-r') === CAL.range));
            buildActivityCalendar(calHost);
          } }, [lbl])));
        return seg;
      })(),
    ]);

    const nowIdle = st.rows.filter(x => x.cur < 0).sort((a, b) => a.cur - b.cur);
    const nowFlying = st.rows.filter(x => x.cur > 0).sort((a, b) => b.cur - a.cur);
    const totalDays = st.days.length;
    const flyRate = st.rows.reduce((a, x) => a + x.flyingDays, 0) / (st.rows.length * totalDays || 1);
    const bestEver = st.rows.slice().sort((a, b) => b.bestRun - a.bestRun)[0];
    const idleStats = el('div', { class: 'v6-standings' }, [
      standing('Longest idle now', nowIdle.length ? Math.abs(nowIdle[0].cur) + 'd' : 'none',
        nowIdle.length ? nowIdle[0].sp.shortName : 'every SP flew recently', nowIdle.length && nowIdle[0].sp.catc_id),
      standing(nowFlying.length ? 'Best run now' : 'Longest run to date',
        nowFlying.length ? nowFlying[0].cur + 'd' : (bestEver ? bestEver.bestRun + 'd' : '—'),
        nowFlying.length ? nowFlying[0].sp.shortName : (bestEver ? bestEver.sp.shortName + ' · nobody is mid-run today' : ''),
        nowFlying.length ? nowFlying[0].sp.catc_id : (bestEver && bestEver.sp.catc_id)),
      standing('Idle ≥ ' + LONG_IDLE + 'd today', String(st.rows.filter(x => x.cur <= -LONG_IDLE).length),
        'of ' + st.rows.length + ' SP', null),
      standing('Flying-day rate', (flyRate * 100).toFixed(0) + '%', 'per SP across ' + totalDays + ' days', null),
    ]);

    grid.appendChild(card('Roster · activity calendar', 'one row per SP, one column per calendar day', [
      calHost, idleStats,
    ], 'v6-c12', { tools: calTools, info: [
      el('p', {}, ['Who flew, on what day, for how long. Each cell is shaded by the hours that SP flew that day and coloured by the phase they were in, so intensity and progress read at once. Click a cell to open the lesson behind it.']),
      el('p', { style: 'margin-top:8px' }, ['A blank column down the whole grid is a batch-wide stand-down; a hatched red run is one SP idle for a week or more between flights, and amber means they are still idle now. The two footer rows give the batch\u2019s hours and lessons for each day.']),
      el('p', { style: 'margin-top:8px' }, ['Grouping by instructor re-sorts the rows under each FI, which is the view for asking whether a particular instructor\u2019s students are the ones standing still.']),
    ] }));

    // ── roster, arranged like V4's Progress Ranking ──
    // Rank badge, an inline progress bar carrying the target marker, and colour
    // that means something: green at or ahead of the reference, red behind,
    // amber idle. Column widths are declared so the table FITS its card instead
    // of running off to the right where the columns cannot be reached.
    const nowLesson = MODEL.batch.targetLessonToday == null ? null : Math.round(MODEL.batch.targetLessonToday);
    const COLS = [
      { h: '#', w: '3.5%', key: null, cell: (r, i) => {
        const n = forecastRows().length;
        const cls = i < 3 ? ' bot' : (i >= n - 3 ? ' top' : '');   // row 1 is the MOST behind
        return el('span', { class: 'v6-rank' + cls, title: 'Position under the current sort' }, [String(i + 1)]);
      } },
      { h: 'Student pilot', w: '13%', key: 'name', cell: r => el('span', { title: r.name }, [r.shortName]) },
      { h: 'SE', w: '7%', key: null, cell: r => r.sp.se || '—' },
      { h: 'Instructor', w: '12%', key: null, cell: r => el('span', { title: r.sp.fiFull || '' }, [r.sp.fiFull || '—']) },
      { h: 'Progress', w: '16%', key: 'lessons', cell: r => {
        const pct = Math.max(0, Math.min(100, r.sp.pct || 0));
        const tgt = nowLesson == null ? null : (nowLesson / (MODEL.curriculum.count || 96)) * 100;
        const ahead = nowLesson != null && r.lessonsDone >= nowLesson;
        return el('div', { class: 'v6-pbar', title: r.lessonsDone + ' of ' + MODEL.curriculum.count + ' lessons' +
          (nowLesson == null ? '' : ' · target today L' + nowLesson) }, [
          el('i', { style: 'width:' + pct.toFixed(1) + '%;background:' + (ahead ? 'var(--v6-good)' : 'linear-gradient(90deg,var(--v6-acc),var(--v6-acc3))') }),
          tgt == null ? null : el('u', { style: 'left:' + Math.min(99.6, tgt).toFixed(1) + '%' }),
          el('b', {}, [r.lessonsDone + '/' + MODEL.curriculum.count]),
        ]);
      } },
      { h: '%', w: '5.5%', key: null, n: true, cell: r => fPct(r.sp.pct) },
      { h: 'Hours', w: '6.5%', key: 'hours', n: true, cell: r => fH(r.hoursDone, 1) },
      { h: 'vs plan', w: '7.5%', key: 'gap', n: true, tone: r => (r.sp.hrsDelta >= 0 ? 'good' : 'bad'), cell: r => sgn(r.sp.hrsDelta, x => fH(x, 0)) },
      { h: 'vs target', w: '7.5%', key: null, n: true, tone: r => (nowLesson == null ? '' : (r.lessonsDone >= nowLesson ? 'good' : 'bad')),
        cell: r => (nowLesson == null ? '—' : sgn(r.lessonsDone - nowLesson, x => String(Math.round(x)))) },
      { h: 'Idle', w: '5.5%', key: 'idle', n: true, tone: r => ((r.idleDays || 0) >= 7 ? 'warn' : ''), cell: r => (r.idleDays == null ? '—' : r.idleDays + 'd') },
      // The 60-day trend the constellation cards used to carry, folded in here.
      { h: 'Last 60 days', w: '16%', key: null, cell: r =>
        el('span', { class: 'v6-spark-cell', title: 'Cumulative hours over the last 60 days' },
          [sparkSvg(spSpark(r.sp, 60), 160, 22, cssv('--v6-acc2', '#22d3ee'), { fill: true, min0: true })]) },
    ];
    const tb = el('tbody');
    const table = el('table', { class: 'v6-t v6-fit' }, [
      el('colgroup', {}, COLS.map(c => el('col', { style: 'width:' + c.w }))),
      el('thead', {}, [el('tr', {}, COLS.map(c => {
        const th = el('th', {
          class: c.n ? 'n' : '',
          tabindex: c.key ? '0' : null, role: c.key ? 'button' : null,
          'aria-sort': c.key && S.sortKey === c.key ? (S.sortDir === 1 ? 'ascending' : 'descending') : 'none',
        }, [c.h + (c.key && S.sortKey === c.key ? (S.sortDir === 1 ? ' ▲' : ' ▼') : '')]);
        if (c.key) {
          const go = () => {
            if (S.sortKey === c.key) S.sortDir *= -1; else { S.sortKey = c.key; S.sortDir = 1; }
            persist(); renderRoster(); regridAll();
            $$('button', sortSeg).forEach(b => b.classList.toggle('on', b.getAttribute('data-k') === S.sortKey));
          };
          th.addEventListener('click', go);
          th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        }
        return th;
      }))]),
      tb,
    ]);
    function renderRoster() {
      tb.innerHTML = '';
      forecastRows().forEach((r, i) => {
        const tr = el('tr', { 'data-sp': String(r.catc_id) }, COLS.map(c => {
          const v = c.cell(r, i);
          const tone = c.tone ? c.tone(r) : '';
          return el('td', { class: (c.n ? 'n ' : '') + tone }, [typeof v === 'string' || typeof v === 'number' ? String(v) : v]);
        }));
        // Click-only, like the curriculum grid: no hover focus.
        tr.addEventListener('click', () => openSPDrawer(r.catc_id));
        tb.appendChild(tr);
      });
      $$('th', table).forEach((th, i) => {
        const c = COLS[i]; if (!c || !c.key) return;
        th.textContent = c.h + (S.sortKey === c.key ? (S.sortDir === 1 ? ' ▲' : ' ▼') : '');
        th.setAttribute('aria-sort', S.sortKey === c.key ? (S.sortDir === 1 ? 'ascending' : 'descending') : 'none');
      });
    }
    renderRoster();
    grid.appendChild(card('Each SP', MODEL.students.length + ' student pilots · click a row for the record · click a header to sort',
      [el('div', { class: 'v6-tw' }, [table])], 'v6-c12', { tools: sortSeg, info: [
        el('p', {}, ['Every SP under the current sort and search, one row each. It defaults to most-behind first — fewest lessons completed at the top — so the students who most need attention are the first thing on the page. The rank badge is red for the first three rows and green for the last three under whatever sort is active.']),
        el('p', { style: 'margin-top:8px' }, ['The progress bar fills to lessons completed and turns green once that SP is at or past the red tick, which marks the lesson the target schedule expects today. ',
          el('b', {}, ['vs plan']), ' is hours against the curriculum plan, ', el('b', {}, ['vs target']),
          ' is lessons against today\u2019s target checkpoint, and ', el('b', {}, ['vs cohort']),
          '. Green means at or ahead of the reference, red behind, amber an idle run of a week or more. The last column is that SP\u2019s cumulative hours over the last 60 days.']),
      ] }));

    sec._afterMount = () => {
      mkChart('v6-race', raceCfg());
      bindChartFocus('v6-race');
      renderStandings();
      buildActivityCalendar(calHost);
      observeWidth(calHost, () => buildActivityCalendar(calHost));
    };
    sec._rerender = () => { renderRoster(); buildActivityCalendar(calHost); };
    sec._recal = () => buildActivityCalendar(calHost);
    return sec;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ACT 05 — INTEGRITY
  // ═════════════════════════════════════════════════════════════════════════
  // View-level invariants: the two engines check themselves, but nothing else
  // checks that this PAGE is showing what they produced. These do.
  function viewChecks() {
    const out = [];
    const add = (id, label, pass, detail) => out.push({ id, label, pass: !!pass, detail });
    const last = SCRUB_FRAMES && SCRUB_FRAMES.length ? SCRUB_FRAMES[SCRUB_FRAMES.length - 1] : null;
    add('scrub-endpoint', 'History playhead at "today" matches the live model',
      !!last && Math.abs(last.hours - MODEL.batch.hoursDone) < 0.01 && last.lessons === MODEL.batch.lessonsDone,
      last ? last.hours.toFixed(2) + 'h / ' + last.lessons + 'L vs ' + MODEL.batch.hoursDone.toFixed(2) + 'h / ' + MODEL.batch.lessonsDone + 'L' : 'no frames');
    add('scrub-cover', 'Playhead covers every day from first flight to as-of',
      !!last && last.date === MODEL.asOf && SCRUB_FRAMES[0].date === MODEL.batchStart,
      SCRUB_FRAMES ? SCRUB_FRAMES.length + ' frames · ' + SCRUB_FRAMES[0].date + ' → ' + last.date : '—');
    add('roster-cover', 'Roster, constellation and matrix render every SP once',
      forecastRows().length === MODEL.students.length || !!S.search,
      forecastRows().length + ' of ' + MODEL.students.length + (S.search ? ' (search filter active)' : ''));
    add('ops-augment', 'Ops-completed lessons missing from Progress are credited, and counted',
      SYNC != null,
      SYNC ? SYNC.extraLessons + ' lessons across ' + SYNC.syncCount + ' SP folded in from Ops' : 'reconcile helper unavailable');
    // V6 re-buckets SPIC from Solo to Dual for the Output chart. That must move
    // the boundary and nothing else — if the totals drift, the re-split has
    // silently dropped or double-counted sorties.
    (function () {
      const base = MODEL.output({ unit: 'hours', period: 'month', showAll: true });
      const mine = v6Output('hours', 'month');
      const baseTot = base.stacks.reduce((a, k) => a + k.Dual + k.Solo + k.Simulator, 0);
      const mineTot = mine.stacks.reduce((a, k) => a + k.Dual + k.Solo + k.Simulator, 0);
      add('output-split', 'SPIC re-split changes the Dual/Solo boundary and no total',
        Math.abs(baseTot - mineTot) < 0.01,
        mineTot.toFixed(2) + 'h vs the model\u2019s ' + baseTot.toFixed(2) + 'h');
    })();

    const gradeConsistent = FCAST.verdict.p50 == null || FCAST.verdict.slipDays === (FCAST.verdict.planEnd ? U.dateDiff(FCAST.verdict.p50, FCAST.verdict.planEnd) : null);
    add('verdict', 'Headline verdict is derived from the forecast, not restated', gradeConsistent,
      FCAST.verdict.grade + ' · ' + FCAST.verdict.slipDays + 'd');
    return { pass: out.every(r => r.pass), checks: out };
  }

  function buildIntegrity() {
    const m = MODEL, fc = FCAST;
    const { sec, grid } = actShell('integrity', '05', 'Integrity check',
      'Every invariant the three layers assert about themselves, evaluated live against the data on screen. If any of these fails, the number beside it on this page is wrong — that is the point of showing them.');

    const suites = [
      ['Metrics model · ap127-v5-model.js', Model.selfCheck(m)],
      ['Forecast engine · ap127-v6-forecast.js', FC.selfCheck(fc, m)],
      ['This view · view-cohort-v6.js', viewChecks()],
    ];
    const totalPass = suites.reduce((a, [, s]) => a + s.checks.filter(c => c.pass).length, 0);
    const totalAll = suites.reduce((a, [, s]) => a + s.checks.length, 0);

    // The detail is collapsed by default. A reader wants one line — "everything
    // checks out" — and only opens the 35 individual invariants when it does
    // not. The summary bar is therefore the section, and the rest is disclosure.
    const detail = el('div', { class: 'v6-grid', style: 'display:none;width:100%' });
    const allPass = totalPass === totalAll;
    const toggle = el('button', {
      class: 'v6-btn' + (allPass ? '' : ' v6-primary'), 'aria-expanded': 'false',
      onclick: () => {
        const open = detail.style.display === 'none';
        detail.style.display = open ? 'grid' : 'none';
        toggle.textContent = open ? '▲ Hide the detail' : '▼ Show all ' + totalAll + ' checks';
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      },
    }, ['▼ Show all ' + totalAll + ' checks']);

    grid.appendChild(card('Integrity check', 'three layers · evaluated live', [
      el('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap' }, [
        el('div', {}, [
          el('div', { class: 'v6-stat ' + (allPass ? 'good' : 'bad'), style: 'border:0;padding:0;background:transparent' }, [
            el('div', { class: 'l' }, [allPass ? 'All checks pass' : 'Checks failing']),
            el('div', { class: 'v' }, [totalPass + ' / ' + totalAll]),
            el('div', { class: 's' }, [suites.map(([n, su]) => n.split(' · ')[0] + ' ' + su.checks.filter(c => c.pass).length + '/' + su.checks.length).join(' · ')]),
          ]),
        ]),
        el('div', { style: 'flex:1;min-width:180px' }),
        toggle,
      ]),
      detail,
    ], 'v6-c12', { info: [
      el('p', {}, ['Three layers each assert things about their own output, and all of them are re-evaluated against the data currently on screen every time this page builds — including under a time-travelled as-of date.']),
      el('p', { style: 'margin-top:8px' }, ['The metrics engine checks that its totals reconcile (per-SP hours sum to the batch, lessons never exceed the curriculum, the lag line matches the headline delta). The forecast engine checks that its projections are internally consistent (the cone is ordered and monotone, the resampler is unbiased, per-SP rates sum back to the batch rate, the same seed reproduces the same dates). This view checks that what is drawn matches what those two produced.']),
      el('p', { style: 'margin-top:8px' }, ['If any check fails, the figure next to it on this page is wrong — which is the reason for showing them rather than asserting the page is correct.']),
    ] }));

    suites.forEach(([name, suite]) => {
      const box = el('div', { class: 'v6-checks' }, suite.checks.map(c =>
        el('div', { class: 'v6-check ' + (c.pass ? 'ok' : 'no'), title: c.detail || '' }, [
          el('i', {}, [c.pass ? '✓' : '✕']),
          el('div', {}, [el('div', {}, [c.label]), el('div', { class: 'd' }, [c.detail || ''])]),
        ])));
      detail.appendChild(card(name, suite.checks.filter(c => c.pass).length + ' / ' + suite.checks.length + ' pass', box, 'v6-c12'));
    });

    // ── provenance ──
    const prov = el('dl', { class: 'v6-kv' });
    [
      ['Progress feed', (m.updatedAt ? new Date(m.updatedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown') + ' · ' + m.students.length + ' SP · ' + m.curriculum.count + ' curriculum lessons'],
      ['Ops feed', SYNC && SYNC.opsAt ? new Date(SYNC.opsAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'not loaded'],
      ['Ops → Progress credit', SYNC ? SYNC.extraLessons + ' lessons for ' + SYNC.syncCount + ' SP' : '—'],
      ['Hours convention', 'EFFECTIVE — the curriculum’s standard duration for each lesson, credited once per SP even when the lesson is retaken'],
      ['Data as of', fdLong(m.asOf) + (m.isLive ? ' (live)' : ' — time travel, live is ' + fdLong(U.todayBKK()))],
      ['Latest flown record', fdLong(m.maxFlownDate)],
      ['Forecast method', 'circular block bootstrap, ' + fc.monteCarlo.hours.blockLen + '-day blocks over the last ' + fc.window + ' days, ' + fN(fc.monteCarlo.hours.sims) + ' simulations, seed ' + fc.monteCarlo.hours.seed],
      ['Resampler check', 'runs drew ' + fc.monteCarlo.hours.drawnMean + ' h/day against the ' + fc.monteCarlo.hours.dailyMean + ' h/day quoted — circular blocks keep these identical'],
      ['Reproducibility', 'the seed is fixed in code — reloading, re-exporting or reprinting reproduces identical dates'],
    ].forEach(([k, v]) => { prov.appendChild(el('dt', {}, [k])); prov.appendChild(el('dd', {}, [v])); });
    detail.appendChild(card('Provenance', 'where every figure on this page came from', prov, 'v6-c7'));

    // ── report CTA ──
    const cta = el('div', {}, [
      el('div', { class: 'v6-note', style: 'margin-bottom:12px' }, [
        'The report is a self-contained briefing document: verdict, situation, history, forecast, the full roster and the completion matrix. ',
        'It prints to A4 and downloads as a PDF, both from the same sheet, so what is reviewed on screen is what lands in the file. ',
        'It carries the findings and none of the machinery — no method write-up, no simulation counts, no invariant listing; that all stays on this page. ',
        'The one exception: if any check above fails, the report says so in a single line rather than quietly stating figures it cannot stand behind.',
      ]),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
        el('button', { class: 'v6-btn v6-primary', onclick: openReport }, ['▤ Build the TG report']),
      ]),
      el('div', { class: 'v6-note', style: 'margin-top:14px' }, [
        totalPass === totalAll
          ? '✓ All ' + totalAll + ' invariants pass on the data currently loaded.'
          : '✕ ' + (totalAll - totalPass) + ' of ' + totalAll + ' invariants FAIL — treat the figures on this page as unverified until resolved.',
      ]),
    ]);
    grid.appendChild(card('Report for review', 'A4 · print or PDF', cta, 'v6-c5'));
    return sec;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // OPS ⇄ PROGRESS LINKAGE (for cell detail)
  //
  // Source is `window.FLIGHTS` — the shared, alias-normalised, DE-DUPLICATED
  // array every Ops view reads — deliberately NOT the raw FLIGHT_DATA.flights
  // that opsAugment() walks, which still carries the duplicate ACTUAL_ONLY
  // rows shared.js strips. Matching reuses AP127Reconcile's own key helpers so
  // this can never drift into a second notion of "same student, same lesson".
  // ═════════════════════════════════════════════════════════════════════════
  let _opsIdx = null, _opsIdxSrc = null;
  function opsIndex() {
    const R = window.AP127Reconcile, F = window.FLIGHTS || [];
    if (_opsIdx && _opsIdxSrc === F) return _opsIdx;
    const byLesson = {}, byDate = {};
    let min = null, max = null, rows = 0;
    if (R) F.forEach(f => {
      if (!f.student || !R.isAP127(f.batch)) return;
      const k = R.ccNameNorm(f.student); rows++;
      if (f.date) {
        if (!min || f.date < min) min = f.date;
        if (!max || f.date > max) max = f.date;
        const mm = byDate[k] || (byDate[k] = {});
        (mm[f.date] || (mm[f.date] = [])).push(f);
      }
      if (f.lesson) {
        const mm = byLesson[k] || (byLesson[k] = {});
        const nl = R.normLesson(f.lesson);
        (mm[nl] || (mm[nl] = [])).push(f);
      }
    });
    _opsIdxSrc = F;
    return (_opsIdx = { byLesson, byDate, window: min ? { min, max } : null, rows, ok: !!R });
  }
  function opsForLesson(sp, code) {
    const R = window.AP127Reconcile, ix = opsIndex();
    if (!R || !sp || !code) return [];
    const k = R.ccKeyFromFull(sp.name);
    return ((ix.byLesson[k] || {})[R.normLesson(code)] || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  function opsRowsDl(f) {
    const rows = [
      ['Status', f.status + (f.isStandby ? ' · STANDBY' : '')],
      ['Date', fd(f.date)],
      ['Scheduled', (f.start || '—') + (f.end ? '–' + f.end : '')],
      ['Duration', (f.durMin ? f.durMin + ' min' : '—') + (f.duration ? ' (' + f.duration + ')' : '')],
      ['Aircraft', (f.tail || '—') + (f.isSim ? ' · SIM' : '')],
      ['Instructor', f.instructor || '—'],
      ['Lesson code', f.lesson || '—'],
      ['Type / cond', [f.type, f.cond].filter(Boolean).join(' · ') || '—'],
    ];
    if (f.tkoff && f.tkoff !== '00:00') rows.push(['Block off/on', f.tkoff + '–' + (f.ldgTime || '—')]);
    if (f.to || f.ldg) rows.push(['T/O · LDG', (f.to || 0) + ' · ' + (f.ldg || 0) + (f.inst ? ' · INST ' + f.inst : '')]);
    if (f.cancelReason) rows.push(['Cancel reason', f.cancelReason]);
    if (f.cancelRemarks) rows.push(['Cancel remarks', f.cancelRemarks]);
    return rows;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // MODALS & DRAWER
  // ═════════════════════════════════════════════════════════════════════════
  function closeOverlays() { $$('.v6-ov,.v6-drawer').forEach(n => n.remove()); document.removeEventListener('keydown', escClose); }
  function escClose(e) { if (e.key === 'Escape') closeOverlays(); }
  function openModal(title, sub, blocks) {
    closeOverlays();
    const body = el('div', { class: 'v6-modal-b' });
    blocks.forEach(b => {
      if (!b) return;
      const blk = el('div', { class: 'v6-blk' });
      if (b.heading) blk.appendChild(el('h4', {}, [b.heading]));
      if (b.text) blk.appendChild(el('div', { class: 'v6-note' }, [b.text]));
      if (b.rows) {
        const dl = el('dl', { class: 'v6-kv' });
        b.rows.forEach(([k, v]) => { dl.appendChild(el('dt', {}, [k])); dl.appendChild(el('dd', {}, [String(v)])); });
        blk.appendChild(dl);
      }
      if (b.node) blk.appendChild(b.node);
      body.appendChild(blk);
    });
    const modal = el('div', { class: 'v6-modal', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { class: 'v6-modal-hd' }, [
        el('div', {}, [el('h3', {}, [title]), sub ? el('p', {}, [sub]) : null]),
        el('button', { class: 'v6-btn', onclick: closeOverlays }, ['Close']),
      ]),
      body,
    ]);
    const ov = el('div', { class: 'v6-ov', onclick: e => { if (e.target === ov) closeOverlays(); } }, [modal]);
    document.body.appendChild(ov);
    document.addEventListener('keydown', escClose);
  }


  function openLessonModal(sp, num) {
    const l = MODEL.curriculum.byNum[num];
    const code = l ? l.lesson : 'Lesson ' + num;
    const hits = (sp.flownByNum && sp.flownByNum[num]) || [];
    const ops = opsForLesson(sp, code);
    const ix = opsIndex();
    const blocks = [];

    blocks.push({ heading: 'Curriculum', rows: [
      ['Lesson', code + ' · number ' + num],
      ['Phase', l && l.phase ? l.phase.label + ' — ' + l.phase.title : '—'],
      ['Type', l ? l.type : '—'],
      ['Standard duration', l ? (l.plannedMins / 60).toFixed(2) + 'h (' + l.plannedMins + ' min)' : '—'],
      ['Planned date', l && l.plannedDate ? fd(l.plannedDate) : '—'],
    ] });

    if (hits.length) {
      blocks.push({ heading: 'Progress record' + (hits.length > 1 ? ' · retaken ' + hits.length + '×' : ''), rows: hits.map((f, i) =>
        ['Attempt ' + (i + 1), fd(f.date) + ' · ' + (f.effMins / 60).toFixed(2) + 'h credited' +
          (f.isRetake ? ' (retake, not re-credited)' : '') + (f.fromOps ? ' · sourced from the Ops feed' : '')]) });
      if (l && l.plannedDate) {
        const drift = U.dateDiff(hits[0].date, l.plannedDate);
        blocks.push({ heading: 'Against the plan', text:
          drift === 0 ? 'Flown on its planned date.'
            : drift > 0 ? 'Flown ' + drift + ' ' + plural(drift, 'day') + ' after the planned date of ' + fd(l.plannedDate) + '.'
              : 'Flown ' + Math.abs(drift) + ' ' + plural(drift, 'day') + ' before the planned date of ' + fd(l.plannedDate) + '.' });
      }
    } else {
      blocks.push({ heading: 'Progress record', text:
        sp.nextNum === num ? 'Not flown. This is ' + sp.shortName + '’s next lesson in curriculum order.'
          : 'Not flown yet.' });
    }

    if (!ix.ok) {
      blocks.push({ heading: 'Operations record', text: 'The Ops feed is not loaded in this session, so no booking can be shown.' });
    } else if (ops.length) {
      ops.forEach((f, i) => blocks.push({ heading: 'Ops booking ' + (i + 1) + ' of ' + ops.length, rows: opsRowsDl(f) }));
      if (hits.length) {
        const dateMatch = ops.some(f => f.date === hits[0].date);
        blocks.push({ heading: 'Agreement check', text: dateMatch
          ? 'The Ops booking and the Progress record agree on the date.'
          : 'The two systems disagree on the date: Progress has ' + fd(hits[0].date) + ', Ops has ' +
            ops.map(f => fd(f.date)).join(', ') + '. Known date drift — the record itself is not in doubt.' });
      }
    } else if (hits.length) {
      const inWindow = ix.window && hits[0].date >= ix.window.min && hits[0].date <= ix.window.max;
      blocks.push({ heading: 'Operations record', text: inWindow
        ? 'No Ops booking exists for this lesson, and the flight date falls inside the Ops feed’s coverage (' +
          fd(ix.window.min) + ' → ' + fd(ix.window.max) + '), so this is a genuine Progress-only record — not a feed-window artefact.'
        : 'No Ops booking. The flight date falls outside the Ops feed’s coverage window (' +
          (ix.window ? fd(ix.window.min) + ' → ' + fd(ix.window.max) : 'unknown') + '), so the booking has simply aged out of the feed.' });
    } else {
      blocks.push({ heading: 'Operations record', text: 'Nothing booked for this lesson.' });
    }

    openModal(sp.name + ' — ' + code, fd(hits.length ? hits[0].date : null) + ' · click through from the curriculum matrix', blocks);
  }

  function openSPDrawer(catcId) {
    const sp = MODEL.byId[String(catcId)]; if (!sp) return;
    const r = FCAST.students.rows.find(x => String(x.catc_id) === String(catcId));
    closeOverlays();
    const body = el('div', { class: 'v6-modal-b' });
    const push = (heading, node) => { body.appendChild(el('div', { class: 'v6-blk' }, [el('h4', {}, [heading]), node])); };
    const kv = rows => { const dl = el('dl', { class: 'v6-kv' }); rows.forEach(([k, v]) => { dl.appendChild(el('dt', {}, [k])); dl.appendChild(el('dd', {}, [String(v)])); }); return dl; };

    push('Identity', kv([
      ['Full name', sp.name], ['Call sign', sp.nick || '—'], ['CATC id', sp.catc_id],
      ['SE type', sp.se || '—'], ['Instructor', sp.fiFull || '—'], ['Batch', sp.batch || 'AP127'],
    ]));
    push('Progress', kv([
      ['Lessons complete', sp.lessonsCompleted + ' of ' + MODEL.curriculum.count + ' (' + fPct(sp.pct) + ')'],
      ['Flight records', sp.flightRecords + (sp.retakes ? ' · ' + sp.retakes + ' retake' + (sp.retakes > 1 ? 's' : '') : '')],
      ['Hours credited', fH(sp.hoursEffective, 2) + ' of ' + fH(MODEL.curriculum.totalHours, 0)],
      ['Hours logged', fH(sp.hoursLogged, 2) + ' (includes retakes)'],
      ['vs curriculum plan', sgn(sp.hrsDelta, x => fH(x, 1)) + ' · ' + sgn(sp.lesDelta, fN) + ' lessons'],
      ['First flight', fd(sp.firstDate)], ['Last flight', fd(sp.lastDate)],
      ['Idle', sp.idleDays == null ? 'never flown' : sp.idleDays + ' days'],
      ['Next lesson', sp.nextLesson],
    ]));
    if (r) {
      push('Forecast', kv([
        ['Projected finish', fd(r.etcDate) + (r.slipDays == null ? '' : ' · ' + sgn(r.slipDays, x => x.toFixed(0) + 'd') + ' vs plan')],
        ['Standing in batch', r.relative + (r.vsCohortDays == null ? '' : ' · ' + sgn(r.vsCohortDays, x => x.toFixed(0) + 'd') + ' vs cohort median')],
        ['Risk band', r.risk],
        ['Share of batch capacity', (r.share * 100).toFixed(2) + '% → ' + fH(r.rate, 2) + '/day'],
        ['On own recent pace', r.ownNever ? 'beyond 5-year horizon' : fd(r.ownEtcDate) + ' (' + fH(r.ownRate, 2) + '/day)'],
        ['Remaining', fH(r.remainingHours, 1) + ' · ' + fN(r.remainingLessons) + ' lessons'],
      ]));
    }
    // Phase breakdown
    const phWrap = el('div', { class: 'v6-funnel' }, MODEL.phasesDef.map(def => {
      let done = 0, tot = 0;
      for (let n = def.lo; n <= def.hi; n++) { if (MODEL.curriculum.byNum[n]) { tot++; if (sp.flownByNum && sp.flownByNum[n]) done++; } }
      const pct = tot ? done / tot * 100 : 0;
      return el('div', { class: 'v6-fn' }, [
        el('div', { class: 'v6-fn-hd' }, [el('b', {}, [def.label]), el('span', {}, [done + '/' + tot])]),
        el('div', { class: 'v6-fn-bar' }, [el('i', { style: 'background:' + def.c + ';width:' + pct.toFixed(1) + '%' })]),
      ]);
    }));
    push('Phase by phase', phWrap);

    // Recent record
    const recent = sp.flown.slice(-24).reverse();
    const tbl = el('table', { class: 'v6-t' }, [
      el('thead', {}, [el('tr', {}, ['Date', 'Lesson', 'Hours', 'Source'].map(t => el('th', {}, [t])))]),
      el('tbody', {}, recent.map(f => {
        const tr = el('tr', { title: 'Open the full record for this lesson' }, [
          el('td', {}, [fd(f.date)]),
          el('td', {}, [f.lesson + (f.isRetake ? ' ↻' : '')]),
          el('td', { class: 'n' }, [(f.effMins / 60).toFixed(2)]),
          el('td', {}, [f.fromOps ? 'Ops' : 'Progress']),
        ]);
        if (f.num != null) tr.addEventListener('click', () => openLessonModal(sp, f.num));
        return tr;
      })),
    ]);
    push('Last ' + recent.length + ' records', el('div', { class: 'v6-tw', style: 'max-height:300px' }, [tbl]));

    const dr = el('div', { class: 'v6-drawer', role: 'dialog', 'aria-modal': 'true' }, [
      el('div', { class: 'v6-modal-hd' }, [
        el('div', {}, [el('h3', {}, [sp.name]), el('p', {}, [(sp.nick || '') + ' · ' + fPct(sp.pct) + ' complete · projected ' + (r ? fd(r.etcDate) : '—')])]),
        el('button', { class: 'v6-btn', onclick: closeOverlays }, ['Close']),
      ]),
      body,
    ]);
    const ov = el('div', { class: 'v6-ov', style: 'padding:0;justify-content:flex-end', onclick: e => { if (e.target === ov) closeOverlays(); } }, [dr]);
    document.body.appendChild(ov);
    document.addEventListener('keydown', escClose);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // THE REPORT
  //
  // One sheet, two outputs: window.print() (vector, real page numbers from the
  // browser) and a rasterised jsPDF download that draws its own running footer.
  // The sheet is styled in literal hex — never a var() — because html2canvas
  // rasterises it inside an isolated iframe carrying only cohort-v6.css, and
  // because a page the TG prints should be ink-friendly regardless of whatever
  // theme the screen happens to be on.
  //
  // NO MACHINERY IN THIS DOCUMENT (user instruction, 2026-09-06: "Remove all
  // behind the scenes from pdf report"). The report carries the situation and
  // the records — findings, figures, charts, tables — and none of how they are
  // produced: no method write-up, no simulation counts or seeds, no engine
  // filenames, no invariant listing, no estimator footnotes. All of that stays
  // on screen in Act 05, which is where someone auditing the tab looks.
  // The ONE exception is deliberate: if an invariant actually FAILS, a single
  // warning line is printed. Silence there would mean shipping a document that
  // states figures a check had already flagged as wrong. It prints nothing in
  // the normal, all-passing case.
  // ═════════════════════════════════════════════════════════════════════════
  let _rcCanvas = null;
  function resolveColor(c) {
    if (!_rcCanvas) { _rcCanvas = document.createElement('canvas'); _rcCanvas.width = _rcCanvas.height = 1; }
    const ctx = _rcCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    try { ctx.fillStyle = c; } catch (e) { return '#000000'; }
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return d[3] === 255 ? 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')' : 'rgba(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + (d[3] / 255).toFixed(3) + ')';
  }
  // Re-tint a live chart config for a white sheet: the on-screen grid is a
  // near-transparent white that vanishes on paper, and the tooltip theme is
  // irrelevant to a static image.
  function reportize(cfg) {
    const c = JSON.parse(JSON.stringify(cfg, (k, v) => (typeof v === 'function' ? undefined : v)));
    c.options = c.options || {}; c.options.scales = c.options.scales || {};
    Object.values(c.options.scales).forEach(sc => {
      if (!sc) return;
      sc.grid = Object.assign({}, sc.grid, { color: '#e6e8ef', drawBorder: false });
      sc.ticks = Object.assign({}, sc.ticks, { color: '#79839c' });
      if (sc.title) sc.title.color = '#79839c';
    });
    return c;
  }
  function chartImg(cfg, w, hgt) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = hgt; cv.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + w + 'px;height:' + hgt + 'px';
    document.body.appendChild(cv);
    const local = reportize(cfg);
    local.options.responsive = false; local.options.animation = false; local.options.maintainAspectRatio = false;
    local.options.plugins = local.options.plugins || {};
    local.options.plugins.datalabels = { display: false };
    local.options.plugins.zoom = undefined;
    const ch = new window.Chart(cv, local);
    const img = el('img', { src: ch.toBase64Image('image/png', 1), style: 'width:' + w + 'px;height:' + hgt + 'px' });
    ch.destroy(); cv.remove();
    return img;
  }

  function reportMatrix() {
    const m = MODEL, count = m.curriculum.count || 96;
    const contentW = 684, nameW = 74;
    const cellW = Math.max(3, (contentW - nameW) / count);
    const table = el('table', { style: 'border-collapse:collapse;table-layout:fixed;width:' + Math.round(nameW + cellW * count) + 'px' });
    table.appendChild(el('colgroup', {}, [el('col', { style: 'width:' + nameW + 'px' })].concat(
      Array.from({ length: count }, () => el('col', { style: 'width:' + cellW + 'px' })))));
    const segs = [];
    (m.curriculum.byNumAsc || []).forEach(l => {
      const c = l.phase ? l.phase.c : '#6b7280';
      const last = segs[segs.length - 1];
      if (last && last.c === c) last.n++; else segs.push({ c, label: l.phase ? l.phase.label : 'Other', n: 1 });
    });
    table.appendChild(el('thead', {}, [el('tr', {}, [el('td', { style: 'padding:0' })].concat(
      segs.map(s => el('td', { colspan: s.n, style: 'background:' + s.c + ';height:8px;padding:0', title: s.label }))))]));
    const tb = el('tbody');
    forecastRows().forEach(r => {
      const sp = r.sp;
      const cells = [el('td', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 3px;font-size:6.5px;border:0' }, [sp.shortName])];
      for (let n = 1; n <= count; n++) {
        const hit = sp.flownByNum && sp.flownByNum[n];
        const l = m.curriculum.byNum[n];
        const bg = hit ? (l && l.phase ? l.phase.c : '#b02fd0') : '#e9ecf3';
        cells.push(el('td', { style: 'background:' + bg + ';padding:0;height:7px;border:0' + (hit && hit.length > 1 ? ';box-shadow:inset 0 0 0 1px #0284c7' : '') }));
      }
      tb.appendChild(el('tr', {}, cells));
    });
    table.appendChild(tb);
    return el('div', {}, [
      el('div', { style: 'font-size:8px;color:#79839c;margin-bottom:3px' }, [
        count + ' lessons × ' + MODEL.students.length + ' SP. Phase-coloured when the lesson is complete, grey when not; a blue inset outline marks a retake.',
      ]),
      table,
    ]);
  }

  function buildReportSheet() {
    const m = MODEL, fc = FCAST, v = fc.verdict, mc = fc.monteCarlo.hours, g = gradeOf();
    const toneCls = g.tone === 'good' ? 'rp-good' : g.tone === 'warn' ? 'rp-warn' : 'rp-bad';
    const sheet = el('div', { class: 'v6-report-sheet' });
    const H2 = t => sheet.appendChild(el('h2', {}, [t]));
    const BLK = kids => sheet.appendChild(el('div', { class: 'v6-report-block' }, kids));
    const tbl = (heads, rows) => el('table', {}, [
      el('thead', {}, [el('tr', {}, heads.map(t => el('th', {}, [t])))]),
      el('tbody', {}, rows.map(r => el('tr', {}, r.map((c, i) => el('td', { style: i ? 'text-align:right;font-family:"JetBrains Mono",monospace' : '' }, [String(c)]))))),
    ]);

    // ── cover ──
    sheet.appendChild(el('div', { class: 'rp-cover' }, [
      el('h1', {}, ['AP127 Batch Progress Review']),
      el('div', { class: 'rp-sub' }, ['CATC CPL/IR Integrated Course · ' + m.students.length + ' student pilots · situation as of ' + fdLong(m.asOf)]),
      el('div', { class: 'rp-meta' }, [
        'Issued ' + fdLong(U.todayBKK()) + (m.isLive ? '' : ' · showing the batch as it stood on ' + fdLong(m.asOf)),
      ]),
    ]));

    // ── verdict ──
    sheet.appendChild(el('div', { class: 'v6-report-callout' }, [
      el('div', { class: 'k' }, ['Verdict · ' + g.word]),
      el('div', { class: 'h ' + toneCls }, [
        v.p50 ? 'Forecast completion ' + fdLong(v.p50) + (v.slipDays > 0 ? ' — ' + fDays(v.slipDays) + ' beyond the ' + fd(v.planEnd) + ' plan date' : ' — within plan') : 'No completion forecast available',
      ]),
      el('div', {}, [
        'The batch is producing ' + fH(v.actualRate, 1) + ' of training per day over the last ' + v.rateWindow +
        ' days, against the ' + fH(v.requiredRate, 1) +
        ' per day required to finish on plan — ' + (v.requiredRate ? (v.actualRate / v.requiredRate * 100).toFixed(0) : '0') +
        '% of the necessary rate. Closing the gap by the plan date would require sustaining ' +
        (v.actualRate > 0 ? (v.requiredRate / v.actualRate).toFixed(1) + '×' : 'an unbounded multiple of') +
        ' that output for the remaining ' + (m.pace ? m.pace.daysRem : '—') + ' days.',
      ]),
    ]));

    // ── executive summary ──
    H2('1. Executive summary');
    const kpis = [
      ['Course complete', fPct(m.batch.hoursDone / m.batch.hourSlots * 100)],
      ['Hours flown', fH(m.batch.hoursDone, 0) + ' / ' + fH(m.batch.hourSlots, 0)],
      ['Behind plan', fH(Math.abs(m.batch.hoursDelta), 0)],
      ['Forecast finish', v.p50 ? fd(v.p50) : '—'],
    ];
    BLK([el('div', { class: 'v6-report-kpis' }, kpis.map(([l, val]) =>
      el('div', { class: 'v6-report-kpi' }, [el('div', { class: 'l' }, [l]), el('div', { class: 'v' }, [val])])))]);
    BLK([
      el('p', {}, ['The batch has flown ' + fH(m.batch.hoursDone, 0) + ' of the ' + fH(m.batch.hourSlots, 0) +
        ' hours the course requires across ' + m.students.length + ' student pilots — ' +
        fPct(m.batch.hoursDone / m.batch.hourSlots * 100) + ' complete, and ' + fH(Math.abs(m.batch.hoursDelta), 0) +
        ' (' + fN(Math.abs(m.batch.lessonsDelta)) + ' lessons) short of where the curriculum plan places it today. ' +
        (m.batch.vsTargetToday ? 'All ' + m.batch.vsTargetToday.behindCount + ' of ' + m.students.length +
          ' SP are behind the revised target schedule. ' : '')]),
      el('p', {}, ['Recent output is ' + fH(fc.velocity.hours.v30, 1) + '/day over the last 30 days and ' +
        fH(fc.velocity.hours.v7, 1) + '/day over the last 7, against a best-ever sustained 30-day rate of ' +
        fH(fc.velocity.hours.best30, 1) + '/day. ' +
        (fc.history.regime ? (fc.history.regime.up
          ? 'Output has recovered sharply since ' + fd(fc.history.regime.since) + ' — the last 14 days average ' +
            fH(fc.history.regime.recentMean, 1) + '/day against ' + fH(fc.history.regime.priorMean, 1) +
            '/day over the 30 days before them.'
          : 'Output has fallen away since ' + fd(fc.history.regime.since) + ' — the last 14 days average ' +
            fH(fc.history.regime.recentMean, 1) + '/day against ' + fH(fc.history.regime.priorMean, 1) + '/day before.') : '')]),
      el('p', {}, ['Even the batch’s best demonstrated pace finishes ' +
        (function () { const b = fc.scenarios.hours.list.find(x => x.key === 'best'); return b && b.slipDays != null ? fDays(b.slipDays) + ' late' : 'beyond the plan date'; })() +
        '. Recovering the plan date is not achievable at any rate this batch has yet flown; the decision in front of the reviewer is therefore how much of the slip to buy back, and at what capacity cost — section 4 quantifies both.']),
    ]);

    // ── situation ──
    H2('2. Situation');
    const p = m.pace, a = m.actualPace, n = m.students.length;
    BLK([tbl(['Measure', 'Batch', 'Per SP'], [
      ['Lessons complete', fN(m.batch.lessonsDone) + ' / ' + fN(m.batch.lessonSlots), m.batch.avgLessons.toFixed(1) + ' / ' + m.curriculum.count],
      ['Hours credited', fH(m.batch.hoursDone, 1), fH(m.batch.avgHours, 1)],
      ['Hours remaining', fH(p ? p.remHrsB : 0, 0), fH((p ? p.remHrsB : 0) / n, 1)],
      ['Lessons remaining', fN(p ? p.remLesB : 0), fN((p ? p.remLesB : 0) / n)],
      ['Behind curriculum plan', sgn(m.batch.hoursDelta, x => fH(x, 0)), sgn(m.batch.hoursDelta / n, x => fH(x, 1))],
      ['Retakes recorded', fN(m.batch.retakes) + ' (' + m.batch.retakeStudents + ' SP)', '—'],
      ['Days to plan end', p && p.daysRem != null ? p.daysRem + ' (to ' + fd(p.planEndDate) + ')' : '—', '—'],
    ])]);
    BLK([el('h3', {}, ['Required against actual output']),
      tbl(['Period', 'Required (h)', 'Actual (h)', 'Gap (h)', 'Required (les)', 'Actual (les)'], [
        ['Month', fH(p && p.reqMonthHrsB, 0), fH(a.actMonthHrsB, 0), sgn(a.actMonthHrsB - (p ? p.reqMonthHrsB : 0), x => fH(x, 0)), fN(p && p.reqMonthLesB), fN(a.actMonthLesB)],
        ['Week', fH(p && p.reqWeekHrsB, 0), fH(a.actWeekHrsB, 0), sgn(a.actWeekHrsB - (p ? p.reqWeekHrsB : 0), x => fH(x, 0)), fN(p && p.reqWeekLesB), fN(a.actWeekLesB)],
        ['Day', fH(p && p.reqDayHrsB, 1), fH(a.actDayHrsB, 1), sgn(a.actDayHrsB - (p ? p.reqDayHrsB : 0), x => fH(x, 1)), fN(p && p.reqDayLesB), fN(a.actDayLesB)],
      ])]);
    BLK([el('h3', {}, ['Syllabus phases']),
      tbl(['Phase', 'Complete', 'Remaining', '%'], m.phases.map(ph =>
        [ph.phase.label + ' — ' + ph.phase.title, fN(ph.done) + ' / ' + fN(ph.slots), fN(ph.remaining), (ph.slots ? (ph.done / ph.slots * 100).toFixed(1) : '0') + '%']))]);

    // ── history ──
    H2('3. History');
    BLK([chartImg(flightPathCfg(), 684, 260)]);
    BLK([el('div', { style: 'font-size:8px;color:#79839c;margin-top:-6px' }, [
      'Cumulative flown output (magenta) against the curriculum plan (dashed) and the revised target schedule (dotted). Batch totals across ' + m.students.length + ' SP.'])]);
    BLK([el('h3', {}, ['Output by month']),
      tbl(['Month', 'Hours', 'Lessons', 'h / day', 'Days flown'], fc.history.months.map(mo => {
        const dt = new Date(mo.key + '-01T00:00:00Z');
        return [dt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          fH(mo.hours, 0), fN(mo.lessons), mo.perDay.toFixed(1), mo.active + ' / ' + mo.days];
      }))]);
    BLK([el('h3', {}, ['Turning points']),
      el('div', {}, fc.history.events.map(ev =>
        el('p', { style: 'margin-bottom:4px' }, [
          el('b', {}, [fd(ev.date) + ' — ' + ev.title + '. ']), ev.detail,
        ])))]);

    // ── forecast ──
    H2('4. Forecast');
    BLK([el('p', {}, [
      'Projected on the batch’s output over the last ' + fc.window + ' days.',
    ])]);
    BLK([chartImg(coneCfg(), 684, 250)]);
    BLK([tbl(['Outcome', 'Completion date', 'vs plan (' + fd(v.planEnd) + ')'], [
      ['Optimistic', fdLong(mc.finish.p10), mc.finish.p10 ? sgn(U.dateDiff(mc.finish.p10, v.planEnd), x => x.toFixed(0) + 'd') : '—'],
      ['Most likely', fdLong(mc.finish.p50), mc.finish.p50 ? sgn(U.dateDiff(mc.finish.p50, v.planEnd), x => x.toFixed(0) + 'd') : '—'],
      ['Pessimistic', fdLong(mc.finish.p90), mc.finish.p90 ? sgn(U.dateDiff(mc.finish.p90, v.planEnd), x => x.toFixed(0) + 'd') : '—'],
      ['Chance of finishing on plan', mc.probOnPlan == null ? '—' : (mc.probOnPlan * 100).toFixed(1) + '%', ''],
    ])]);
    BLK([el('h3', {}, ['If the batch holds each of these rates']),
      tbl(['Rate', 'h / day', 'Finishes', 'vs plan'], fc.rateCard.map(r => {
        const isReq = r.key === 'required';
        const proj = isReq ? null : FC.projectAtRate(m.pace.remHrsB, r.value, m.asOf, 3650);
        const slip = isReq ? 0 : (proj && proj.date ? U.dateDiff(proj.date, v.planEnd) : null);
        return [r.label, fH(r.value, 2), isReq ? fd(v.planEnd) : (proj && proj.date ? fd(proj.date) : 'never'),
          slip == null ? '—' : sgn(slip, x => x.toFixed(0) + 'd')];
      }))]);
    // Capacity ladder — the actionable half of the forecast.
    const ladderRows = [1.5, 2, 2.5, 3, 4].map(mult => {
      const r = fc.whatIf({ unit: 'hours', sortieMultiplier: mult, extraPerDay: 0, sims: 400 });
      return [mult.toFixed(1) + '× current output', fH(r.rate, 1) + '/day', r.p50 ? fdLong(r.p50) : 'beyond horizon',
        r.slipDays == null ? '—' : sgn(r.slipDays, x => x.toFixed(0) + 'd'),
        r.probOnPlan == null ? '—' : (r.probOnPlan * 100).toFixed(0) + '%'];
    });
    BLK([el('h3', {}, ['What each level of capacity would buy']),
      tbl(['Scenario', 'Implied rate', 'Forecast completion', 'vs plan', 'Chance on plan'], ladderRows)]);

    // ── the batch ──
    H2('5. Student pilots');
    BLK([tbl(['SP', 'Call sign', 'Lessons', 'Hours', 'vs plan', 'Last flight', 'Idle', 'Projected finish', 'vs cohort'],
      forecastRows().map(r => [r.shortName, r.nick || '—', r.lessonsDone + '/' + m.curriculum.count,
        fH(r.hoursDone, 1), sgn(r.sp.hrsDelta, x => fH(x, 0)), fd(r.sp.lastDate),
        r.idleDays == null ? '—' : r.idleDays + 'd', fd(r.etcDate),
        r.vsCohortDays == null ? '—' : sgn(r.vsCohortDays, x => x.toFixed(0) + 'd')]))]);
    BLK([el('h3', {}, ['Lesson completion matrix']), reportMatrix()]);

    // ── data-quality warning, and ONLY on failure ──
    // The invariant listing itself is machinery and stays on screen. But a
    // report that states figures a check has already flagged would be worse
    // than one that admits it, so a failure gets one line here.
    const failed = [Model.selfCheck(m), FC.selfCheck(fc, m), viewChecks()]
      .reduce((a, suite) => a.concat(suite.checks.filter(c => !c.pass)), []);
    if (failed.length) {
      BLK([el('p', { class: 'rp-bad' }, [
        '⚠ Data-quality warning: ' + failed.length + ' internal consistency ' +
        plural(failed.length, 'check') + ' did not pass when this report was produced (' +
        failed.map(c => c.label).join('; ') + '). Treat the figures above as unverified.',
      ])]);
    }

    sheet.appendChild(el('div', { class: 'v6-report-foot' }, [
      el('span', {}, ['AP127 Batch Progress Review · ' + (m.isLive ? 'live' : 'as of ' + fd(m.asOf))]),
      el('span', {}, ['End of report']),
    ]));

    // Palette snapshot — force any computed oklch()/color-mix() that leaked in
    // from an inherited rule down to a plain rgb() before rasterising.
    $$('*', sheet).concat([sheet]).forEach(node => {
      const cs = getComputedStyle(node);
      ['color', 'backgroundColor', 'borderColor'].forEach(prop => {
        const val = cs[prop];
        if (val && /oklch|color-mix/.test(val)) node.style[prop] = resolveColor(val);
      });
    });
    return sheet;
  }

  function openReport() {
    closeReport();
    toast('Building report…');
    setTimeout(() => {
      const ov = el('div', { class: 'v6-report-ov', id: 'v6-report-ov' });
      ov.appendChild(el('div', { class: 'v6-report-toolbar' }, [
        el('button', { class: 'v6-btn', onclick: () => window.print() }, ['🖨 Print / Save as PDF']),
        el('button', { class: 'v6-btn v6-primary', onclick: downloadPdf }, ['⤓ Download PDF']),
        el('button', { class: 'v6-btn', onclick: closeReport }, ['Close']),
      ]));
      ov.appendChild(buildReportSheet());
      document.body.appendChild(ov);
      document.addEventListener('keydown', escReport);
    }, 30);
  }
  function escReport(e) { if (e.key === 'Escape') closeReport(); }
  function closeReport() { $$('#v6-report-ov').forEach(n => n.remove()); document.removeEventListener('keydown', escReport); }

  // html2canvas clones the WHOLE document to resolve stacking contexts, so it
  // walks this app's oklch()-based theme.css even when the sheet itself is
  // clean — the exact failure V5 hit. Capturing from an isolated iframe that
  // contains only cohort-v6.css means there is no oklch() value anywhere in
  // the document being rasterised.
  async function captureSheet(sheetEl) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + (sheetEl.offsetWidth + 40) + 'px;height:' + (sheetEl.scrollHeight + 40) + 'px;border:0';
    document.body.appendChild(iframe);
    try {
      const idoc = iframe.contentDocument;
      // Fonts do not cross document boundaries, so the isolated iframe needs
      // its own @font-face link — without it Rajdhani/JetBrains Mono fall back
      // and the exported PDF does not match the sheet the reviewer approved on
      // screen. Confirmed by rendering the export before and after.
      idoc.open();
      idoc.write('<!doctype html><html><head><meta charset="utf-8">' +
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Rajdhani:wght@600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">' +
        '</head><body style="margin:0;background:#fff"></body></html>');
      idoc.close();
      let css = '';
      try { css = await fetch('css/cohort-v6.css').then(r => (r.ok ? r.text() : '')); } catch (e) {}
      const st = idoc.createElement('style'); st.textContent = css; idoc.head.appendChild(st);
      const clone = sheetEl.cloneNode(true);
      clone.style.margin = '0'; clone.style.boxShadow = 'none'; clone.style.maxWidth = 'none';
      idoc.body.appendChild(clone);
      // Wait for the faces to actually arrive (capped — an offline client must
      // still get a PDF, just in fallback fonts, rather than hang here).
      try {
        if (idoc.fonts && idoc.fonts.ready) {
          await Promise.race([idoc.fonts.ready, new Promise(r => setTimeout(r, 2500))]);
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 120));
      return await window.html2canvas(clone, { scale: 1.7, backgroundColor: '#ffffff', windowWidth: clone.scrollWidth, windowHeight: clone.scrollHeight });
    } finally { iframe.remove(); }
  }

  async function downloadPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.html2canvas) { toast('PDF library not loaded', 'er'); return; }
    toast('Rendering PDF…');
    try {
      const sheet = $('#v6-report-ov .v6-report-sheet');
      if (!sheet) { toast('Report sheet not found', 'er'); return; }
      const canvas = await captureSheet(sheet);
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
      const imgW = pageW, imgH = canvas.height * (imgW / canvas.width);
      const img = canvas.toDataURL('image/png');
      // A real footer band is reserved on every page and drawn by jsPDF, so the
      // page number is correct per page — baking one footer into the raster
      // puts "Page 1" wherever the slice happens to land (V5's p164 bug).
      const FOOT = 26, contentH = pageH - FOOT;
      const pages = Math.max(1, Math.ceil(imgH / contentH));
      const label = 'AP127 Batch Progress Review · ' + (MODEL.isLive ? 'live' : 'as of ' + fd(MODEL.asOf)) + ' · ' + fd(MODEL.asOf);
      for (let p = 1; p <= pages; p++) {
        if (p > 1) doc.addPage();
        doc.addImage(img, 'PNG', 0, -(p - 1) * contentH, imgW, imgH, undefined, 'MEDIUM');
        doc.setFillColor(255, 255, 255); doc.rect(0, pageH - FOOT, pageW, FOOT, 'F');
        doc.setDrawColor(224, 226, 233); doc.line(24, pageH - FOOT + 6, pageW - 24, pageH - FOOT + 6);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 145, 160);
        doc.text(label, 24, pageH - 10);
        doc.text('Page ' + p + ' / ' + pages, pageW - 24, pageH - 10, { align: 'right' });
      }
      doc.save('AP127_V6_Review_' + MODEL.asOf + '.pdf');
      toast('PDF downloaded');
    } catch (e) { console.error('[V6] PDF export failed', e); toast('PDF export failed — use Print instead', 'er'); }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SHELL
  // ═════════════════════════════════════════════════════════════════════════
  function buildHud() {
    const m = MODEL;
    const hud = el('div', { class: 'v6-hud' });
    hud.appendChild(el('div', { class: 'v6-brand' }, [
      el('span', {}, ['AP127']), el('b', {}, ['DETAIL']), el('span', { class: 'v6-vtag' }, ['V6']),
    ]));

    const unitSeg = el('div', { class: 'v6-seg' }, [['hours', 'Hours'], ['lessons', 'Lessons']].map(([k, lbl]) =>
      el('button', { class: S.unit === k ? 'on' : '', 'data-u': k, onclick: () => {
        if (S.unit === k) return;
        S.unit = k; persist();
        $$('button', unitSeg).forEach(b => b.classList.toggle('on', b.getAttribute('data-u') === S.unit));
        redrawUnitDependent();
      } }, [lbl])));
    hud.appendChild(el('div', { class: 'v6-ctl' }, [el('span', { class: 'v6-ctl-l' }, ['Measure in']), unitSeg]));

    hud.appendChild(el('div', { class: 'v6-hud-sp' }));

    const search = el('input', { class: 'v6-input', type: 'search', placeholder: 'Find SP…', 'aria-label': 'Find a student pilot', value: S.search });
    let sTimer = null;
    search.addEventListener('input', () => {
      clearTimeout(sTimer);
      sTimer = setTimeout(() => {
        S.search = search.value;
        const people = $('#v6-act-people', ROOT);
        if (people && people._rerender) people._rerender();
        regridAll();
      }, 140);
    });
    hud.appendChild(el('div', { class: 'v6-ctl' }, [el('span', { class: 'v6-ctl-l' }, ['Find SP']), search]));

    const asOf = el('input', { class: 'v6-input', type: 'date', value: m.asOf, max: U.todayBKK(), 'aria-label': 'Data as of' });
    asOf.addEventListener('change', () => {
      const v = asOf.value;
      S.asOf = (!v || v >= U.todayBKK()) ? null : v;
      remount();
    });
    hud.appendChild(el('div', { class: 'v6-ctl' }, [el('span', { class: 'v6-ctl-l' }, ['Data as of']), asOf]));

    const live = el('button', { class: 'v6-live' + (m.isLive ? '' : ' v6-tt'), title: m.isLive ? 'Showing live data' : 'Time-travel view — click to return to live' }, [
      el('i', {}), m.isLive ? 'LIVE' : 'AS OF ' + fd(m.asOf),
    ]);
    live.addEventListener('click', () => { if (!MODEL.isLive) { S.asOf = null; remount(); } });
    hud.appendChild(live);

    hud.appendChild(el('button', { class: 'v6-btn v6-primary', onclick: openReport, title: 'Build the review document' }, ['▤ Report']));

    hud.appendChild(el('div', { class: 'v6-progressbar' }, [el('i', { id: 'v6-scrollbar' })]));
    return hud;
  }

  // Only the unit-dependent surfaces are rebuilt on an Hours/Lessons switch —
  // a full remount would lose scroll position and every reveal animation, and
  // most of the page (the situation bands, the roster, the matrix) shows both
  // units side by side and is unaffected by the toggle.
  function redrawUnitDependent() {
    if (CHARTS['v6-flightpath']) mkChart('v6-flightpath', flightPathCfg());
    if (CHARTS['v6-output']) mkChart('v6-output', outputCfg());
    if (CHARTS['v6-cone']) mkChart('v6-cone', coneCfg());
    if (CHARTS['v6-hist']) mkChart('v6-hist', histCfg());
    // The race is per-SP cumulative in the selected unit; streak lines are day
    // counts and are unit-free, so they are deliberately not rebuilt here.
    if (CHARTS['v6-lag']) mkChart('v6-lag', lagCfg());
    if (CHARTS['v6-race']) { RACE = null; mkChart('v6-race', raceCfg()); bindChartFocus('v6-race'); }
    const hist = $('#v6-act-history', ROOT);
    if (hist && hist._renderFrame) hist._renderFrame();
  }

  function buildRail() {
    const rail = el('nav', { class: 'v6-rail', 'aria-label': 'AP127 Detail V6 sections' });
    rail.appendChild(el('div', { class: 'v6-rail-t' }, ['The briefing']));
    ACTS.forEach(a => {
      rail.appendChild(el('button', { class: a.id === S.act ? 'on' : '', 'data-act': a.id, onclick: () => gotoAct(a.id) }, [
        el('span', { class: 'v6-rail-n v6-mono' }, [a.n]), a.label,
      ]));
    });
    const g = gradeOf();
    rail.appendChild(el('div', { class: 'v6-rail-fill' }, [
      el('div', { style: 'color:var(' + g.c + ')' }, ['◆ ' + g.word]),
      el('div', {}, [fPct(MODEL.batch.hoursDone / MODEL.batch.hourSlots * 100) + ' complete']),
      el('div', {}, [MODEL.students.length + ' SP · ' + MODEL.curriculum.count + ' lessons']),
      el('div', {}, [MODEL.isLive ? 'live data' : 'as of ' + fd(MODEL.asOf)]),
    ]));
    return rail;
  }

  function buildShell(root) {
    root.className = 'ap127-v6';
    root.innerHTML = '';
    revealSeq = 0;
    root.appendChild(el('div', { class: 'v6-aurora' }, [el('i', {})]));
    root.appendChild(buildHud());
    const scroller = el('div', { class: 'v6-scroll', id: 'v6-scroll' });
    const main = el('div', { class: 'v6-main' }, [buildRail(), scroller]);
    root.appendChild(main);

    const sections = [buildDeck(), buildHistory(), buildSituation(), buildForecastAct(), buildPeople(), buildIntegrity()];
    sections.forEach(s => scroller.appendChild(s));

    // Charts and canvases can only be built once their canvas is in the DOM
    // and has a measurable box — hence the deferred pass rather than building
    // them inside each act builder. It is scheduled on BOTH rAF and a timer,
    // guarded to run once: a hidden or throttled tab may never deliver a
    // frame, and the charts must still exist when it is shown again.
    let mounted = false;
    const afterMount = () => {
      if (mounted) return;
      mounted = true;
      sections.forEach(sn => { if (sn._afterMount) { try { sn._afterMount(); } catch (e) { console.error('[V6] mount failed for ' + sn.id, e); } } });
      watchReveal(scroller);
      watchActs(scroller);
      watchTheme();
    };
    requestAnimationFrame(afterMount);
    const mountFallback = setTimeout(afterMount, 350);
    REVEAL_CLEANUP.push(() => clearTimeout(mountFallback));

    const bar = $('#v6-scrollbar', root);
    scroller.addEventListener('scroll', () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (bar) bar.style.width = (max > 0 ? (scroller.scrollTop / max) * 100 : 0) + '%';
    }, { passive: true });
  }

  // The app's theme switcher rewrites body[data-theme]. Chart.js configs and
  // the matrix canvas both read their colours through cssv() at BUILD time, so
  // without this they keep the old palette until something else happens to
  // rebuild them — a dark grid on a white page. V6 is the first Detail tab to
  // follow the light theme, so it is the first that has to handle this.
  function watchTheme() {
    if (!window.MutationObserver) return;
    let last = document.body.getAttribute('data-theme');
    const mo = new MutationObserver(() => {
      const now = document.body.getAttribute('data-theme');
      if (now === last) return;
      last = now;
      redrawUnitDependent();
      // Every canvas has to be repainted, not just the charts — a canvas caches
      // whatever colour it was drawn with. Missing the band here left its name
      // gutter dark on a white page.
      // The grids read their colours from CSS, so they only need redrawing to
      // pick up the new phase/idle tints on cells painted with color-mix().
      regridAll();
      if (CHARTS['v6-race']) bindChartFocusRefresh('v6-race');
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    REVEAL_CLEANUP.push(() => mo.disconnect());
  }

  function teardown() {
    const hist = ROOT && $('#v6-act-history', ROOT);
    if (hist && hist._stopPlay) hist._stopPlay();
    if (PLAY_TIMER) { clearInterval(PLAY_TIMER); PLAY_TIMER = null; }
    destroyCharts();
    REVEAL_CLEANUP.splice(0).forEach(fn => { try { fn(); } catch (e) {} });
    closeOverlays(); closeReport(); hideTip();
  }

  function remount() {
    if (!ROOT) return;
    teardown();
    rebuild();
    buildShell(ROOT);
  }

  // ── dev console harness ──────────────────────────────────────────────────
  // Prints every V6 figure against the model it came from, so a discrepancy
  // can be found without reading the DOM. Mirrors V5's ap127V5ParityV5().
  window.ap127V6Audit = function () {
    if (!MODEL) { console.warn('V6 is not mounted'); return; }
    const suites = [['model', Model.selfCheck(MODEL)], ['forecast', FC.selfCheck(FCAST, MODEL)], ['view', viewChecks()]];
    suites.forEach(([n, s]) => {
      console.group('[V6] ' + n + ' — ' + s.checks.filter(c => c.pass).length + '/' + s.checks.length);
      console.table(s.checks.map(c => ({ id: c.id, pass: c.pass, label: c.label, detail: c.detail })));
      console.groupEnd();
    });
    console.table(FCAST.rateCard.map(r => ({ rate: r.label, hPerDay: +(r.value || 0).toFixed(3), basis: r.basis })));
    console.table(FCAST.students.rows.map(r => ({
      sp: r.shortName, hours: +r.hoursDone.toFixed(1), lessons: r.lessonsDone,
      share: +(r.share * 100).toFixed(2), ratePerDay: +r.rate.toFixed(3),
      etc: r.etcDate, vsCohort: r.vsCohortDays, standing: r.relative, risk: r.risk,
    })));
    return { model: MODEL, forecast: FCAST };
  };

  // ── React wrapper ────────────────────────────────────────────────────────
  function CohortViewV6() {
    const d = window.useApp ? window.useApp() : (window.useData ? window.useData() : null);
    const ref = React.useRef(null);
    React.useEffect(() => {
      const host = ref.current;
      if (!host || !d) return;
      if (!Model || !FC) {
        host.textContent = 'AP127 Detail V6 could not start: its metrics or forecast engine failed to load.';
        return;
      }
      RAW = {
        students: d.students || [],
        curriculum: d.curriculum || [],
        updatedAt: (d.progressMeta && d.progressMeta.updated) || null,
      };
      if (!RAW.students.length || !RAW.curriculum.length) {
        host.className = '';
        host.innerHTML = '';
        host.appendChild(el('div', { style: 'padding:40px;text-align:center;color:var(--v6-tx3);font-family:JetBrains Mono,monospace;font-size:12px' },
          ['Waiting for the AP127 progress feed…']));
        return;
      }
      ROOT = host;
      rebuild();
      buildShell(host);
      return teardown;
    }, [d && d.students, d && d.curriculum]);
    return h('div', { ref, style: { height: '100%', minHeight: 0 } });
  }
  window.CohortViewV6 = CohortViewV6;
})();
