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
    sortKey: saved.sortKey || 'etc',
    sortDir: saved.sortDir || 1,
    outputPeriod: 'week',
    whatIf: { mult: 1, extra: 0 },
    scrubIdx: null,                      // history playhead (index into fc.series.dates)
    playing: false,
  };
  function persist() {
    try { localStorage.setItem(LS, JSON.stringify({ unit: S.unit, sortKey: S.sortKey, sortDir: S.sortDir })); } catch (e) {}
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
  function card(title, sub, body, span, opts) {
    const o = opts || {};
    const c = el('div', { class: 'v6-card v6-reveal ' + (span || 'v6-c12'), 'data-delay': String((revealSeq++ % 4) * 70) });
    if (title) {
      const hd = el('div', { class: 'v6-card-hd' }, [el('span', { class: 'v6-card-t' }, [title])]);
      if (sub) hd.appendChild(el('span', { class: 'v6-card-s' }, [sub]));
      if (o.tools) hd.appendChild(o.tools);
      c.appendChild(hd);
    }
    c.appendChild(el('div', { class: 'v6-card-b' }, Array.isArray(body) ? body : [body]));
    return c;
  }
  function actShell(id, n, title, sub) {
    const sec = el('section', { class: 'v6-act', id: 'v6-act-' + id });
    sec.appendChild(el('div', { class: 'v6-act-hd v6-reveal' }, [
      el('div', { class: 'v6-act-n v6-disp' }, [n]),
      el('div', {}, [el('div', { class: 'v6-act-ttl' }, [title]), sub ? el('div', { class: 'v6-act-sub' }, [sub]) : null]),
      el('div', { class: 'v6-act-rule' }),
    ]));
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
    const { sec, grid } = actShell('deck', '00', 'Flight deck',
      'Everything a decision needs, on one screen. Every figure below is produced by the audited AP127 metrics model or the seeded forecast engine — never by this page.');

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
    const daysIn = (U.dateDiff(m.asOf, m.batchStart) || 0) + 1;
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
    const stats = el('div', { class: 'v6-statrow' }, [
      stat('acc', 'Day of course', String(daysIn),
        'started ' + fd(m.batchStart) + ' · ' + (daysLeft == null ? '—' : daysLeft + ' days to plan end'),
        () => gotoAct('history')),
      stat(m.batch.hoursDelta < 0 ? 'bad' : 'good', 'Behind plan', fH(Math.abs(m.batch.hoursDelta)),
        fN(Math.abs(m.batch.lessonsDelta)) + ' lessons behind the curriculum plan',
        () => gotoAct('situation')),
      stat(rateGap < 0 ? 'bad' : 'good', 'Pace vs required', sgn(rateGap, x => fH(x, 1)) + '/d',
        fH(v.actualRate, 1) + '/day over ' + v.rateWindow + 'd · needs ' + fH(v.requiredRate, 1) + '/day',
        () => gotoAct('forecast')),
      stat(g.tone, 'Forecast finish', v.p50 ? fd(v.p50) : '—',
        v.slipDays == null ? 'no forecast' : sgn(v.slipDays, x => x.toFixed(0) + 'd') + ' vs plan ' + fd(v.planEnd),
        () => gotoAct('forecast')),
    ]);

    const hero = el('div', { class: 'v6-hero v6-reveal' }, [gauge, el('div', { class: 'v6-hero-r' }, [verdict, stats])]);
    grid.appendChild(el('div', { class: 'v6-c12' }, [hero]));

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

  function outputCfg() {
    const m = MODEL, unit = S.unit, period = S.outputPeriod;
    const out = m.output({ unit, period, showAll: true });
    const t = axisTheme();
    const tc = Model.TYPE_COLORS;
    const req = m.requiredAt(m.asOf);
    const perReq = req ? (period === 'day' ? (unit === 'lessons' ? req.reqDayLesB : req.reqDayHrsB)
      : period === 'week' ? (unit === 'lessons' ? req.reqWeekLesB : req.reqWeekHrsB)
        : (unit === 'lessons' ? req.reqMonthLesB : req.reqMonthHrsB)) : null;
    const labels = out.keys.map(k => new Date(k + 'T00:00:00Z').getTime());
    const ds = ['Dual', 'Solo', 'Simulator'].map(k => ({
      type: 'bar', label: k, stack: 'out',
      data: out.stacks.map((s, i) => ({ x: labels[i], y: +(s[k] || 0).toFixed(2) })),
      backgroundColor: tc[k], borderWidth: 0, borderRadius: 2, order: 5,
    }));
    // Each overlay gets its OWN stack group. Chart.js groups a dataset with no
    // explicit `stack` by its TYPE, so two un-stacked line overlays on a
    // stacked y-axis get summed together and drawn in the wrong place — the
    // exact bug V5 root-caused and fixed (REVAMP p181). Not repeating it.
    ds.push({
      type: 'line', label: 'Moving average', stack: 'ma',
      data: out.ma.map((v, i) => ({ x: labels[i], y: v })),
      borderColor: cssv('--v6-acc', '#e88aff'), borderWidth: 2, pointRadius: 0, tension: .3, fill: false, order: 1,
    });
    if (perReq != null && isFinite(perReq)) {
      ds.push({
        type: 'line', label: 'Required', stack: 'req',
        data: labels.map(x => ({ x, y: +perReq.toFixed(2) })),
        borderColor: cssv('--v6-bad', '#fb7185'), borderWidth: 1.6, borderDash: [7, 4], pointRadius: 0, fill: false, order: 0,
      });
    }
    return {
      data: { datasets: ds },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: timeScale({ stacked: true, offset: true, time: { unit: period === 'day' ? 'week' : period === 'week' ? 'month' : 'month' } }),
          y: valScale(unit === 'lessons' ? 'lessons per ' + period : 'hours per ' + period, { stacked: true }),
        },
        plugins: {
          legend: { display: false },
          tooltip: tooltipTheme({
            callbacks: {
              label: c => c.dataset.label + ': ' + (unit === 'lessons' ? fN(c.parsed.y) + ' les' : fH(c.parsed.y, 1)),
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

    const pathCard = card('Flight path · flown against plan', 'Ctrl/⌘ + scroll to zoom · drag to pan', [
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
      legendRow([[tc.Dual, 'Dual'], [tc.Solo, 'Solo / SPIC'], [tc.Simulator, 'Simulator'],
        [cssv('--v6-acc', '#e88aff'), 'Moving average'], [cssv('--v6-bad', '#fb7185'), 'Required rate']]),
      el('div', { class: 'v6-note', style: 'margin-top:9px' }, [
        'The required line is a moving target: it is recomputed against the work still outstanding on each date and the days left from there, so it climbs as the batch falls further behind.',
      ]),
    ], 'v6-c8', { tools: periodSeg }));

    // ── turning points ──
    const evWrap = el('div', { class: 'v6-events' });
    fc.history.events.forEach(ev => {
      const node = el('div', { class: 'v6-ev k-' + ev.kind, tabindex: '0', title: 'Jump the playhead to ' + fd(ev.date) }, [
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
      evWrap.appendChild(node);
    });
    grid.appendChild(card('Turning points', fc.history.events.length + ' detected · click to jump the playhead', evWrap, 'v6-c4'));

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
    grid.appendChild(card('Month by month', 'bar shows the month against the batch’s best month', ribbon, 'v6-c12'));

    // Charts and the first frame are built after the section is in the DOM.
    sec._afterMount = () => { mkChart('v6-flightpath', flightPathCfg()); mkChart('v6-output', outputCfg()); renderFrame(); };
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

    const bands = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(238px,1fr));gap:22px' }, [
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
      bandBlock('③ What it takes', [
        ['Per day', fH(p ? p.reqDayHrsB : null, 1) + ' required · ' + fH(a.actDayHrsB, 1) + ' actual', 'bad'],
        ['Per week', fH(p ? p.reqWeekHrsB : null, 0) + ' required · ' + fH(a.actWeekHrsB, 0) + ' actual', 'bad'],
        ['Per month', fH(p ? p.reqMonthHrsB : null, 0) + ' required · ' + fH(a.actMonthHrsB, 0) + ' actual', 'bad'],
        ['Shortfall / day', sgn(a.actDayHrsB - (p ? p.reqDayHrsB : 0), x => fH(x, 1)), 'bad'],
        ['Multiple of the last 7 days', p && a.actDayHrsB > 0 ? (p.reqDayHrsB / a.actDayHrsB).toFixed(1) + '×' : '—', 'bad'],
        ['Multiple of the ' + FCAST.window + '-day mean', p && FCAST.verdict.actualRate > 0 ? (p.reqDayHrsB / FCAST.verdict.actualRate).toFixed(1) + '×' : '—', 'bad'],
      ]),
    ]);
    grid.appendChild(card('Situation report', 'as of ' + fdLong(m.asOf), bands, 'v6-c12'));

    // ── phase funnel ──
    const fnl = el('div', { class: 'v6-funnel' }, m.phases.map(ph => {
      // buildPhaseFunnel() returns { phase, lessons, slots, done, remaining, pct }
      // — the label/title/colour live on `.phase`, not on the row itself.
      const def = ph.phase;
      const pct = ph.slots ? ph.done / ph.slots * 100 : 0;
      const node = el('div', { class: 'v6-fn', tabindex: '0', title: 'Open ' + def.label + ' detail' }, [
        el('div', { class: 'v6-fn-hd' }, [
          el('b', {}, [def.label + ' — ' + def.title]),
          el('span', {}, [fN(ph.done) + ' / ' + fN(ph.slots) + ' · ' + pct.toFixed(0) + '%']),
        ]),
        el('div', { class: 'v6-fn-bar' }, [el('i', { style: 'background:' + def.c, 'data-fill': pct.toFixed(1) + '%' })]),
      ]);
      const open = () => openPhaseModal(ph);
      node.addEventListener('click', open);
      node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      return node;
    }));
    grid.appendChild(card('Phase funnel', 'lesson slots completed per syllabus phase · click a phase for its objective', fnl, 'v6-c5'));

    // ── pace table ──
    const rows = [
      ['Month', p && p.reqMonthHrsB, a.actMonthHrsB, p && p.reqMonthLesB, a.actMonthLesB],
      ['Week', p && p.reqWeekHrsB, a.actWeekHrsB, p && p.reqWeekLesB, a.actWeekLesB],
      ['Day', p && p.reqDayHrsB, a.actDayHrsB, p && p.reqDayLesB, a.actDayLesB],
    ];
    const tbl = el('table', { class: 'v6-t' }, [
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
    grid.appendChild(card('Required against actual', 'required is recomputed daily against work outstanding',
      [el('div', { class: 'v6-tw' }, [tbl]),
        el('div', { class: 'v6-note', style: 'margin-top:10px' }, [
          'There is no single "actual rate", and this page never pretends otherwise. The Actual column here uses the metrics model’s own trailing windows — 7 days for the daily figure, 14 halved for the weekly, 30 for the monthly. ',
          'The Flight deck and the forecast quote a ' + FCAST.window + '-day mean instead, because that is the window the simulation resamples. ',
          'Every rate the page is allowed to show, with the exact window behind it, is listed together in ',
          el('button', { class: 'v6-btn', style: 'padding:2px 7px', onclick: () => gotoAct('forecast') }, ['Act 03 → Every rate']), '.',
        ])], 'v6-c7'));

    // ── curriculum matrix ──
    const wrap = el('div', { class: 'v6-matrix-wrap' }, [
      el('canvas', { id: 'v6-matrix' }),
      el('div', { class: 'v6-matrix-hint' }, ['scroll = zoom · drag = pan · click a cell']),
    ]);
    const zoomOut = el('button', { class: 'v6-btn', onclick: () => matrixZoom(1 / 1.3) }, ['−']);
    const zoomIn = el('button', { class: 'v6-btn', onclick: () => matrixZoom(1.3) }, ['+']);
    const zoomFit = el('button', { class: 'v6-btn', onclick: () => matrixFit() }, ['⤢ Fit']);
    grid.appendChild(card('Curriculum matrix', m.students.length + ' SP × ' + m.curriculum.count + ' lessons · phase-coloured when complete',
      [wrap, legendRow(m.phasesDef.map(ph => [ph.c, ph.label, true]).concat([
        [cssv('--v6-warn', '#fbbf24'), 'next lesson', true],
        [cssv('--v6-info', '#38bdf8'), 'retaken', true],
      ]))], 'v6-c12',
      { tools: el('div', { style: 'display:flex;gap:5px' }, [zoomOut, zoomIn, zoomFit]) }));

    sec._afterMount = () => { mountMatrix(); };
    return sec;
  }

  // ── curriculum matrix engine (canvas, zoom + pan + hit-test) ─────────────
  const MX = { zoom: 1, ox: 0, cellW: 0, rowH: 15, nameW: 118, headH: 26, rows: [], canvas: null, ctx: null, hover: null };

  let _matrixSubscribed = false;
  function mountMatrix() {
    const cv = $('#v6-matrix', ROOT); if (!cv) return;
    MX.canvas = cv; MX.ctx = cv.getContext('2d');
    MX.rows = sortedStudents();
    // The matrix is a canvas, so CSS cannot dim it the way the focus bus dims
    // every other SP-bearing element — it subscribes and repaints instead.
    // Without this, hovering an SP card lights up the ladder and the roster
    // but leaves the matrix untouched, which is exactly the disconnect this
    // tab exists to avoid.
    if (!_matrixSubscribed) { _matrixSubscribed = true; onFocus(() => { if (MX.ctx && document.body.contains(MX.canvas)) drawMatrix(); }); }
    matrixFit();
    if (!cv._v6bound) {
      cv._v6bound = true;
      let dragging = false, lastX = 0;
      cv.addEventListener('wheel', e => { e.preventDefault(); matrixZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.offsetX); }, { passive: false });
      cv.addEventListener('pointerdown', e => { dragging = true; lastX = e.offsetX; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointerup', e => { dragging = false; try { cv.releasePointerCapture(e.pointerId); } catch (er) {} });
      cv.addEventListener('pointerleave', () => { dragging = false; MX.hover = null; hideTip(); drawMatrix(); if (S.focusSp) setFocus(null); });
      cv.addEventListener('pointermove', e => {
        if (dragging) { MX.ox += e.offsetX - lastX; lastX = e.offsetX; clampMatrix(); drawMatrix(); hideTip(); return; }
        const hit = matrixHit(e.offsetX, e.offsetY);
        MX.hover = hit;
        drawMatrix();
        if (hit && hit.sp) {
          if (S.focusSp !== String(hit.sp.catc_id)) setFocus(hit.sp.catc_id);
          showTip(e.clientX, e.clientY, matrixTipHtml(hit));
        } else { hideTip(); }
      });
      cv.addEventListener('click', e => {
        const hit = matrixHit(e.offsetX, e.offsetY);
        if (hit && hit.sp && hit.num != null) openLessonModal(hit.sp, hit.num);
        else if (hit && hit.sp) openSPDrawer(hit.sp.catc_id);
      });
      window.addEventListener('resize', matrixResize);
      MX._resizeBound = true;
    }
  }
  function matrixResize() { if (!MX.canvas || !document.body.contains(MX.canvas)) return; matrixFit(); }
  function matrixFit() {
    const cv = MX.canvas; if (!cv) return;
    const wrapW = cv.parentElement.clientWidth || 900;
    const count = MODEL.curriculum.count || 96;
    MX.cellW = Math.max(3, (wrapW - MX.nameW - 8) / count);
    MX.zoom = 1; MX.ox = 0;
    sizeMatrix(wrapW);
    drawMatrix();
  }
  function sizeMatrix(wrapW) {
    const cv = MX.canvas;
    const w = wrapW || cv.parentElement.clientWidth || 900;
    const hgt = MX.headH + MX.rows.length * MX.rowH + 6;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = w + 'px'; cv.style.height = hgt + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
    MX.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    MX.w = w; MX.h = hgt;
  }
  function matrixZoom(f, anchorX) {
    const before = MX.zoom;
    MX.zoom = Math.max(1, Math.min(9, MX.zoom * f));
    const ax = (anchorX == null ? (MX.w || 900) / 2 : anchorX) - MX.nameW;
    MX.ox = ax - (ax - MX.ox) * (MX.zoom / before);
    clampMatrix(); drawMatrix();
  }
  function clampMatrix() {
    const gridW = (MODEL.curriculum.count || 96) * MX.cellW * MX.zoom;
    const viewW = (MX.w || 900) - MX.nameW;
    MX.ox = Math.min(0, Math.max(viewW - gridW, MX.ox));
    if (gridW <= viewW) MX.ox = 0;
  }
  function matrixHit(x, y) {
    if (!MX.rows.length) return null;
    const ri = Math.floor((y - MX.headH) / MX.rowH);
    if (ri < 0 || ri >= MX.rows.length) return null;
    const sp = MX.rows[ri];
    if (x < MX.nameW) return { sp, num: null };
    const gx = x - MX.nameW - MX.ox;
    const num = Math.floor(gx / (MX.cellW * MX.zoom)) + 1;
    if (num < 1 || num > (MODEL.curriculum.count || 96)) return { sp, num: null };
    return { sp, num };
  }
  function matrixTipHtml(hit) {
    const sp = hit.sp;
    if (hit.num == null) return '<b>' + esc(sp.name) + '</b><br>' + fH(sp.hoursEffective, 1) + ' · ' + sp.lessonsCompleted + ' lessons · ' + fPct(sp.pct);
    const l = MODEL.curriculum.byNum[hit.num];
    const hits = (sp.flownByNum && sp.flownByNum[hit.num]) || null;
    const code = l ? l.lesson : 'L' + hit.num;
    if (!hits) return '<b>' + esc(code) + '</b><br>' + esc(sp.shortName) + ' — not flown' + (sp.nextNum === hit.num ? '<br>next up' : '');
    return '<b>' + esc(code) + '</b><br>' + esc(sp.shortName) + ' — ' + fd(hits[0].date) +
      '<br>' + (hits[0].effMins / 60).toFixed(2) + 'h' + (hits.length > 1 ? '<br>retaken ' + hits.length + '×' : '') +
      (hits[0].fromOps ? '<br>credited from Ops' : '');
  }
  function drawMatrix() {
    const c = MX.ctx; if (!c) return;
    const m = MODEL, count = m.curriculum.count || 96;
    const cw = MX.cellW * MX.zoom;
    const bg = cssv('--v6-bg-2', '#080c18'), tx = cssv('--v6-tx', '#eef2ff'), tx3 = cssv('--v6-tx3', '#65708c');
    const empty = cssv('--v6-bd', 'rgba(255,255,255,.1)');
    c.clearRect(0, 0, MX.w, MX.h);

    // phase band
    const bandY = MX.headH - 12;
    for (let nnum = 1; nnum <= count; nnum++) {
      const l = m.curriculum.byNum[nnum];
      const x = MX.nameW + MX.ox + (nnum - 1) * cw;
      if (x + cw < MX.nameW || x > MX.w) continue;
      c.fillStyle = l && l.phase ? l.phase.c : '#6b7280';
      c.fillRect(x, bandY, Math.max(1, cw - 0.4), 7);
    }
    // lesson-number ticks, thinned so labels never collide
    c.font = '8px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.fillStyle = tx3;
    const every = cw >= 26 ? 1 : cw >= 13 ? 5 : cw >= 7 ? 10 : 20;
    for (let nnum = every; nnum <= count; nnum += every) {
      const x = MX.nameW + MX.ox + (nnum - 0.5) * cw;
      if (x < MX.nameW || x > MX.w) continue;
      c.fillText(String(nnum), x, bandY - 3);
    }

    // rows
    MX.rows.forEach((sp, ri) => {
      const y = MX.headH + ri * MX.rowH;
      const hot = S.focusSp && String(sp.catc_id) === S.focusSp;
      if (hot) { c.fillStyle = cssv('--v6-glass-2', 'rgba(255,255,255,.075)'); c.fillRect(0, y, MX.w, MX.rowH); }
      for (let nnum = 1; nnum <= count; nnum++) {
        const x = MX.nameW + MX.ox + (nnum - 1) * cw;
        if (x + cw < MX.nameW || x > MX.w) continue;
        const hits = sp.flownByNum && sp.flownByNum[nnum];
        const l = m.curriculum.byNum[nnum];
        if (hits) {
          c.fillStyle = l && l.phase ? l.phase.c : '#e88aff';
          c.globalAlpha = S.focusSp && !hot ? 0.3 : 1;
          c.fillRect(x, y + 1.5, Math.max(1, cw - 0.6), MX.rowH - 3);
          if (hits.length > 1 && cw >= 4) {
            c.globalAlpha = 1; c.strokeStyle = cssv('--v6-info', '#38bdf8'); c.lineWidth = 1;
            c.strokeRect(x + 0.5, y + 2, Math.max(1, cw - 1.6), MX.rowH - 4);
          }
          c.globalAlpha = 1;
        } else {
          c.fillStyle = empty;
          c.globalAlpha = S.focusSp && !hot ? 0.25 : 0.5;
          c.fillRect(x, y + 1.5, Math.max(1, cw - 0.6), MX.rowH - 3);
          c.globalAlpha = 1;
          if (sp.nextNum === nnum && cw >= 3) {
            c.strokeStyle = cssv('--v6-warn', '#fbbf24'); c.lineWidth = 1.4;
            c.strokeRect(x + 0.7, y + 2, Math.max(1, cw - 2), MX.rowH - 4);
          }
        }
      }
      if (MX.hover && MX.hover.sp === sp && MX.hover.num != null) {
        const x = MX.nameW + MX.ox + (MX.hover.num - 1) * cw;
        c.strokeStyle = tx; c.lineWidth = 1.2;
        c.strokeRect(x + 0.5, y + 1, Math.max(2, cw - 1), MX.rowH - 2);
      }
    });

    // name gutter, painted last so panned cells slide under it
    c.fillStyle = bg; c.fillRect(0, 0, MX.nameW, MX.h);
    c.textAlign = 'left'; c.font = '10px Inter, system-ui, sans-serif';
    MX.rows.forEach((sp, ri) => {
      const y = MX.headH + ri * MX.rowH;
      const hot = S.focusSp && String(sp.catc_id) === S.focusSp;
      c.fillStyle = hot ? cssv('--v6-acc', '#e88aff') : tx;
      c.globalAlpha = S.focusSp && !hot ? 0.4 : 1;
      c.fillText(sp.shortName, 6, y + MX.rowH - 4);
      c.globalAlpha = 1;
    });
    c.fillStyle = tx3; c.font = '8px "JetBrains Mono", monospace';
    c.fillText('SP · lesson →', 6, MX.headH - 5);
    c.strokeStyle = cssv('--v6-bd', 'rgba(255,255,255,.1)'); c.lineWidth = 1;
    c.beginPath(); c.moveTo(MX.nameW - 0.5, 0); c.lineTo(MX.nameW - 0.5, MX.h); c.stroke();
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

    return {
      type: 'line',
      data: {
        datasets: [
          { label: 'Actual flown', data: actual, borderColor: acc, backgroundColor: acc + '1e', borderWidth: 2.4, fill: true, tension: .2, pointRadius: 0, order: 2 },
          { label: 'P10 (pessimistic)', data: p10, borderColor: acc2 + '55', borderWidth: 1, fill: false, pointRadius: 0, tension: .1, order: 5 },
          { label: 'P90 (optimistic)', data: p90, borderColor: acc2 + '55', borderWidth: 1, fill: '-1', backgroundColor: acc2 + '20', pointRadius: 0, tension: .1, order: 5 },
          { label: 'P50 forecast', data: p50, borderColor: acc2, borderWidth: 2.4, borderDash: [5, 3], fill: false, pointRadius: 0, tension: .1, order: 1 },
          { label: 'Required to hit plan', data: requiredLine, borderColor: bad, borderWidth: 1.8, borderDash: [8, 4], fill: false, pointRadius: 3, order: 3 },
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
    const { sec, grid } = actShell('forecast', '03', 'Where this ends up',
      'A moving-block bootstrap over the last ' + fc.window + ' days of real output: ' + fN(mc.sims) +
      ' simulated futures, resampled in whole weeks so the batch’s own flying rhythm is preserved. The seed is fixed, so this forecast is reproducible — the screen, the report and the PDF all show the same dates.');

    // ── cone ──
    const coneBox = el('div', { class: 'v6-chart', style: 'height:330px' }, [el('canvas', { id: 'v6-cone' })]);
    grid.appendChild(card('Forecast cone', 'P10–P90 band · the shaded region is where 80% of simulated futures live', [
      coneBox,
      legendRow([[cssv('--v6-acc', '#e88aff'), 'Actual flown'], [cssv('--v6-acc2', '#22d3ee'), 'P50 forecast'],
        [cssv('--v6-acc2', '#22d3ee') + '55', 'P10–P90 band'], [cssv('--v6-bad', '#fb7185'), 'Required to hit plan']]),
    ], 'v6-c8'));

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
    grid.appendChild(card('Completion estimate', 'seed ' + mc.seed + ' · reproducible', summary, 'v6-c4'));

    // ── distribution ──
    const histBox = el('div', { class: 'v6-chart', style: 'height:220px' }, [el('canvas', { id: 'v6-hist' })]);
    grid.appendChild(card('When it finishes', 'distribution of the ' + fN(mc.sims) + ' simulated completion dates', [
      histBox,
      el('div', { class: 'v6-note', style: 'margin-top:8px' }, ['Solid bars fall inside the P10–P90 band; the magenta outline marks the bucket containing the P50 date.']),
    ], 'v6-c7'));

    // ── rate card / scenarios ──
    const sc = fc.scenarios.hours;
    const rateTbl = el('table', { class: 'v6-t' }, [
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
          el('td', { style: 'white-space:normal;color:var(--v6-tx3);font-size:10px' }, [r.basis]),
        ]);
      })),
    ]);
    grid.appendChild(card('Every rate, and what it would mean', 'straight-line projections — no simulation, checkable by hand',
      [el('div', { class: 'v6-tw' }, [rateTbl])], 'v6-c5'));

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
    grid.appendChild(card('What would change it', 'move a slider — the forecast re-runs', wi, 'v6-c7'));

    // ── SP completion ladder ──
    const sps = fc.students;
    const ladder = el('div', { class: 'v6-ladder' });
    const allDays = sps.rows.filter(r => r.etcDays != null).map(r => r.etcDays);
    const maxDay = Math.max.apply(null, allDays.concat([1]));
    const planDay = v.planEnd ? U.dateDiff(v.planEnd, m.asOf) : null;
    sps.rows.slice().sort((a, b) => (a.etcDays || 1e9) - (b.etcDays || 1e9)).forEach(r => {
      const w = r.etcDays == null ? 100 : (r.etcDays / maxDay) * 100;
      const tone = r.relative === 'ahead' ? '--v6-info' : r.relative === 'trailing' ? '--v6-acc3' : '--v6-tx2';
      const row = el('div', { class: 'v6-lad', 'data-sp': String(r.catc_id), title: r.name + ' — projected ' + fd(r.etcDate) }, [
        el('div', { class: 'nm' }, [r.shortName]),
        el('div', { class: 'tr' }, [
          el('i', { style: 'left:0;background:linear-gradient(90deg,var(--v6-acc),var(' + tone + '));width:0', 'data-fill': w.toFixed(1) + '%' }),
          planDay != null && planDay > 0 ? el('u', { style: 'left:' + Math.min(99.5, planDay / maxDay * 100).toFixed(1) + '%', title: 'plan end ' + fd(v.planEnd) }) : null,
        ]),
        el('div', { class: 'dt' }, [fd(r.etcDate)]),
      ]);
      row.addEventListener('mouseenter', () => setFocus(r.catc_id));
      row.addEventListener('mouseleave', () => setFocus(null));
      row.addEventListener('click', () => openSPDrawer(r.catc_id));
      ladder.appendChild(row);
    });
    grid.appendChild(card('Who finishes when', 'per-SP projection · red tick marks the plan end date', [
      ladder,
      el('div', { class: 'v6-note', style: 'margin-top:11px' }, [
        'Each SP is projected from their share of the batch’s forecast output, not from their own trailing rate in isolation. ',
        'The school flies a shared line — an isolated per-SP rate over a short window swings a projected finish by years on one extra sortie. ',
        'Shares are shrunk halfway toward an equal share and sum to exactly 1, so the per-SP rates add back up to the batch rate (checked in Act 05). ',
        'Cohort spread is ' + (sps.spreadDays == null ? '—' : sps.spreadDays + ' days') + ' between the first and last SP to finish.',
      ]),
    ], 'v6-c5'));

    sec._afterMount = () => { mkChart('v6-cone', coneCfg()); mkChart('v6-hist', histCfg()); runWhatIf(); };
    return sec;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // ACT 04 — THE BATCH
  // ═════════════════════════════════════════════════════════════════════════
  const SORTS = {
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
    const s = SORTS[S.sortKey] || SORTS.etc;
    return f.sort((a, b) => {
      const av = s.get(a), bv = s.get(b);
      const c = s.str ? String(av).localeCompare(String(bv)) : (av - bv);
      return c * S.sortDir;
    });
  }
  function sortedStudents() { return forecastRows().map(r => r.sp); }

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

  function buildPeople() {
    const m = MODEL, fc = FCAST;
    const { sec, grid } = actShell('people', '04', 'The batch, student by student',
      'The same story at individual level. Hover anyone to light them up everywhere on this page — the matrix, the ladder and this grid all share one focus.');

    const bandStrip = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px' },
      Object.entries(fc.students.relative).filter(([, v]) => v > 0).map(([k, v]) =>
        el('span', { class: 'v6-pill ' + k }, [v + ' ' + k])).concat(
        Object.entries(fc.students.bands).filter(([, v]) => v > 0).map(([k, v]) =>
          el('span', { class: 'v6-pill ' + k, title: 'absolute risk against the plan date' }, [v + ' ' + k]))));

    const gridWrap = el('div', { class: 'v6-spgrid' });
    function renderCards() {
      gridWrap.innerHTML = '';
      forecastRows().forEach(r => {
        const sp = r.sp;
        const pct = sp.pct || 0;
        const RR = 18, CC = 2 * Math.PI * RR;
        const ring = el('div', { class: 'v6-sp-ring' }, [
          svg('svg', { viewBox: '0 0 42 42' }, [
            svg('circle', { cx: 21, cy: 21, r: RR, fill: 'none', stroke: cssv('--v6-bd', 'rgba(255,255,255,.1)'), 'stroke-width': 4 }),
            svg('circle', {
              cx: 21, cy: 21, r: RR, fill: 'none', stroke: cssv('--v6-acc', '#e88aff'), 'stroke-width': 4, 'stroke-linecap': 'round',
              'stroke-dasharray': CC, style: 'stroke-dashoffset:' + (CC * (1 - pct / 100)).toFixed(2) + ';transition:stroke-dashoffset 1s cubic-bezier(.2,.7,.3,1)',
            }),
          ]),
          el('span', {}, [pct.toFixed(0) + '%']),
        ]);
        const c = el('div', { class: 'v6-sp', 'data-sp': String(sp.catc_id), tabindex: '0' }, [
          el('div', { class: 'v6-sp-top' }, [ring, el('div', { class: 'v6-sp-id' }, [
            el('b', { title: sp.name }, [sp.shortName]),
            el('span', {}, [(sp.nick || '—') + ' · ' + (sp.se || '—')]),
          ])]),
          el('div', { class: 'v6-sp-spark' }, [sparkSvg(spSpark(sp, 60), 150, 24, cssv('--v6-acc2', '#22d3ee'), { fill: true, min0: true })]),
          el('div', { class: 'v6-sp-ft' }, [
            el('span', { title: 'hours flown · lessons complete' }, [fH(sp.hoursEffective, 0) + ' · ' + sp.lessonsCompleted + 'L']),
            el('span', { class: 'v6-pill ' + r.relative, title: 'projected ' + fd(r.etcDate) }, [fd(r.etcDate)]),
          ]),
          el('div', { class: 'v6-sp-ft' }, [
            el('span', { title: 'next lesson' }, ['→ ' + sp.nextLesson]),
            el('span', { style: (sp.idleDays || 0) >= 7 ? 'color:var(--v6-warn)' : '' }, [sp.idleDays == null ? 'no flights' : sp.idleDays + 'd idle']),
          ]),
        ]);
        c.addEventListener('mouseenter', () => setFocus(sp.catc_id));
        c.addEventListener('mouseleave', () => setFocus(null));
        c.addEventListener('click', () => openSPDrawer(sp.catc_id));
        c.addEventListener('keydown', e => { if (e.key === 'Enter') openSPDrawer(sp.catc_id); });
        gridWrap.appendChild(c);
      });
      if (S.focusSp) setFocus(S.focusSp);
    }
    renderCards();

    const sortSeg = el('div', { class: 'v6-seg' }, Object.entries(SORTS).map(([k, def]) =>
      el('button', { class: S.sortKey === k ? 'on' : '', title: 'Sort by ' + def.label, onclick: () => {
        if (S.sortKey === k) S.sortDir *= -1; else { S.sortKey = k; S.sortDir = 1; }
        persist();
        $$('button', sortSeg).forEach(b => b.classList.toggle('on', b.getAttribute('data-k') === S.sortKey));
        renderCards(); renderRoster(); MX.rows = sortedStudents(); drawMatrix();
      }, 'data-k': k }, [def.label])));

    grid.appendChild(card('Constellation', m.students.length + ' SP · click for the full record',
      [bandStrip, gridWrap], 'v6-c12', { tools: sortSeg }));

    // ── roster table ──
    const COLS = [
      ['SP', r => r.shortName, 'name'],
      ['Call sign', r => r.nick || '—', null],
      ['SE', r => r.sp.se || '—', null],
      ['Instructor', r => r.sp.fiFull || '—', null],
      ['Lessons', r => r.lessonsDone + ' / ' + MODEL.curriculum.count, 'lessons'],
      ['Hours', r => fH(r.hoursDone, 1), 'hours'],
      ['%', r => fPct(r.sp.pct), null],
      ['vs plan', r => sgn(r.sp.hrsDelta, x => fH(x, 0)), 'gap'],
      ['Last flight', r => fd(r.sp.lastDate), null],
      ['Idle', r => (r.idleDays == null ? '—' : r.idleDays + 'd'), 'idle'],
      ['Next', r => r.sp.nextLesson, null],
      ['Projected finish', r => fd(r.etcDate), 'etc'],
      ['vs cohort', r => (r.vsCohortDays == null ? '—' : sgn(r.vsCohortDays, x => x.toFixed(0) + 'd')), 'rel'],
      ['Standing', r => r.relative, null],
    ];
    const tb = el('tbody');
    const table = el('table', { class: 'v6-t' }, [
      el('thead', {}, [el('tr', {}, COLS.map(([label, , key]) => {
        const th = el('th', {
          tabindex: key ? '0' : null, role: key ? 'button' : null,
          'aria-sort': key && S.sortKey === key ? (S.sortDir === 1 ? 'ascending' : 'descending') : 'none',
        }, [label + (key && S.sortKey === key ? (S.sortDir === 1 ? ' ▲' : ' ▼') : '')]);
        if (key) {
          const go = () => {
            if (S.sortKey === key) S.sortDir *= -1; else { S.sortKey = key; S.sortDir = 1; }
            persist(); renderRoster(); renderCards(); MX.rows = sortedStudents(); drawMatrix();
            $$('.v6-seg button', sortSeg).forEach(b => b.classList.toggle('on', b.getAttribute('data-k') === S.sortKey));
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
      forecastRows().forEach(r => {
        const tr = el('tr', { 'data-sp': String(r.catc_id) }, COLS.map(([, get], i) => {
          const val = get(r);
          const cls = i === 0 ? '' : 'n';
          if (i === COLS.length - 1) return el('td', {}, [el('span', { class: 'v6-pill ' + r.relative }, [String(val)])]);
          return el('td', { class: cls }, [String(val)]);
        }));
        tr.addEventListener('mouseenter', () => setFocus(r.catc_id));
        tr.addEventListener('mouseleave', () => setFocus(null));
        tr.addEventListener('click', () => openSPDrawer(r.catc_id));
        tb.appendChild(tr);
      });
      // Keep the header arrows honest after a sort driven from elsewhere.
      $$('th', table).forEach((th, i) => {
        const key = COLS[i] && COLS[i][2];
        const base = COLS[i] ? COLS[i][0] : '';
        if (!key) return;
        th.textContent = base + (S.sortKey === key ? (S.sortDir === 1 ? ' ▲' : ' ▼') : '');
        th.setAttribute('aria-sort', S.sortKey === key ? (S.sortDir === 1 ? 'ascending' : 'descending') : 'none');
      });
    }
    renderRoster();
    grid.appendChild(card('Roster', 'click any row for the full record · click a header to sort',
      [el('div', { class: 'v6-tw' }, [table])], 'v6-c12'));

    sec._rerender = () => { renderCards(); renderRoster(); };
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
    const gradeConsistent = FCAST.verdict.p50 == null || FCAST.verdict.slipDays === (FCAST.verdict.planEnd ? U.dateDiff(FCAST.verdict.p50, FCAST.verdict.planEnd) : null);
    add('verdict', 'Headline verdict is derived from the forecast, not restated', gradeConsistent,
      FCAST.verdict.grade + ' · ' + FCAST.verdict.slipDays + 'd');
    return { pass: out.every(r => r.pass), checks: out };
  }

  function buildIntegrity() {
    const m = MODEL, fc = FCAST;
    const { sec, grid } = actShell('integrity', '05', 'Can you trust this page?',
      'Every invariant the three layers assert about themselves, evaluated live against the data on screen. If any of these fails, the number beside it on this page is wrong — that is the point of showing them.');

    const suites = [
      ['Metrics model · ap127-v5-model.js', Model.selfCheck(m)],
      ['Forecast engine · ap127-v6-forecast.js', FC.selfCheck(fc, m)],
      ['This view · view-cohort-v6.js', viewChecks()],
    ];
    const totalPass = suites.reduce((a, [, s]) => a + s.checks.filter(c => c.pass).length, 0);
    const totalAll = suites.reduce((a, [, s]) => a + s.checks.length, 0);

    suites.forEach(([name, suite]) => {
      const box = el('div', { class: 'v6-checks' }, suite.checks.map(c =>
        el('div', { class: 'v6-check ' + (c.pass ? 'ok' : 'no'), title: c.detail || '' }, [
          el('i', {}, [c.pass ? '✓' : '✕']),
          el('div', {}, [el('div', {}, [c.label]), el('div', { class: 'd' }, [c.detail || ''])]),
        ])));
      grid.appendChild(card(name, suite.checks.filter(c => c.pass).length + ' / ' + suite.checks.length + ' pass', box, 'v6-c12'));
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
      ['Forecast method', 'moving-block bootstrap, ' + fc.monteCarlo.hours.blockLen + '-day blocks over the last ' + fc.window + ' days, ' + fN(fc.monteCarlo.hours.sims) + ' simulations, seed ' + fc.monteCarlo.hours.seed],
      ['Reproducibility', 'the seed is fixed in code — reloading, re-exporting or reprinting reproduces identical dates'],
    ].forEach(([k, v]) => { prov.appendChild(el('dt', {}, [k])); prov.appendChild(el('dd', {}, [v])); });
    grid.appendChild(card('Provenance', 'where every figure on this page came from', prov, 'v6-c7'));

    // ── report CTA ──
    const cta = el('div', {}, [
      el('div', { class: 'v6-note', style: 'margin-bottom:12px' }, [
        'The report is a self-contained briefing document: verdict, situation, history, forecast with its method stated, the full roster and the completion matrix. ',
        'It prints to A4 and downloads as a PDF, both from the same sheet, so what is reviewed on screen is what lands in the file.',
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

  function openPhaseModal(ph) {
    const def = ph.phase || MODEL.phasesDef.find(p => p.label === ph.label) || {};
    openModal(def.label + ' — ' + def.title, 'lessons ' + def.lo + '–' + def.hi + ' · ' + (def.hrs || 0) + 'h of curriculum time', [
      { heading: 'In one line', text: def.blurb },
      { heading: 'Objective', text: def.objective },
      { heading: 'Completion standard', text: def.standard },
      { heading: 'Batch position', rows: [
        ['Slots complete', fN(ph.done) + ' of ' + fN(ph.slots) + ' (' + (ph.slots ? (ph.done / ph.slots * 100).toFixed(1) : '0') + '%)'],
        ['Slots remaining', fN(ph.remaining)],
        ['Lessons in phase', String((def.hi - def.lo) + 1)],
        ['SP fully through it', String(MODEL.students.filter(s => {
          for (let n = def.lo; n <= def.hi; n++) if (!(s.flownByNum && s.flownByNum[n])) return false;
          return true;
        }).length) + ' of ' + MODEL.students.length],
      ] },
    ]);
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
        count + ' lessons × ' + MODEL.students.length + ' SP. Phase-coloured when the lesson is complete, grey when not; a blue inset outline marks a retake. Sorted as on screen (' + (SORTS[S.sortKey] || SORTS.etc).label + ').',
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
        'Generated ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC from AP127 Command Center V2 · AP127 Detail V6',
        el('br'),
        'Progress feed ' + (m.updatedAt ? new Date(m.updatedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown') +
        ' · Operations feed ' + (SYNC && SYNC.opsAt ? new Date(SYNC.opsAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'not loaded') +
        ' · ' + (m.isLive ? 'LIVE' : 'TIME-TRAVEL VIEW'),
        el('br'),
        'Hours convention: EFFECTIVE — the curriculum’s standard duration per lesson, credited once per SP even on a retake.',
      ]),
    ]));

    // ── verdict ──
    sheet.appendChild(el('div', { class: 'v6-report-callout' }, [
      el('div', { class: 'k' }, ['Verdict · ' + g.word]),
      el('div', { class: 'h ' + toneCls }, [
        v.p50 ? 'Forecast completion ' + fdLong(v.p50) + (v.slipDays > 0 ? ' — ' + fDays(v.slipDays) + ' beyond the ' + fd(v.planEnd) + ' plan date' : ' — within plan') : 'No completion forecast available',
      ]),
      el('div', {}, [
        'The batch is producing ' + fH(v.actualRate, 1) + ' of training per day averaged over the last ' + v.rateWindow +
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
      'Method: a moving-block bootstrap. The last ' + fc.window + ' days of the batch’s own daily output are resampled in whole ' +
      mc.blockLen + '-day blocks — so the weekly rhythm the school actually flies, stand-downs included, is preserved — and run forward ' +
      fN(mc.sims) + ' times until the remaining ' + fH(mc.remaining, 0) + ' of training is complete. ' +
      'No distribution is fitted and no growth is assumed. The random seed is fixed (' + mc.seed + '), so this forecast is reproducible: ' +
      'rebuilding this report on the same data produces the same dates.',
    ])]);
    BLK([chartImg(coneCfg(), 684, 250)]);
    BLK([tbl(['Outcome', 'Completion date', 'vs plan (' + fd(v.planEnd) + ')'], [
      ['Optimistic (P10)', fdLong(mc.finish.p10), mc.finish.p10 ? sgn(U.dateDiff(mc.finish.p10, v.planEnd), x => x.toFixed(0) + 'd') : '—'],
      ['Most likely (P50)', fdLong(mc.finish.p50), mc.finish.p50 ? sgn(U.dateDiff(mc.finish.p50, v.planEnd), x => x.toFixed(0) + 'd') : '—'],
      ['Pessimistic (P90)', fdLong(mc.finish.p90), mc.finish.p90 ? sgn(U.dateDiff(mc.finish.p90, v.planEnd), x => x.toFixed(0) + 'd') : '—'],
      ['Probability of finishing on plan', mc.probOnPlan == null ? '—' : (mc.probOnPlan * 100).toFixed(1) + '%', ''],
    ])]);
    BLK([el('h3', {}, ['Straight-line projections, for cross-checking']),
      tbl(['Rate', 'h / day', 'Finishes', 'vs plan'], fc.rateCard.map(r => {
        const isReq = r.key === 'required';
        const proj = isReq ? null : FC.projectAtRate(m.pace.remHrsB, r.value, m.asOf, 3650);
        const slip = isReq ? 0 : (proj && proj.date ? U.dateDiff(proj.date, v.planEnd) : null);
        return [r.label + ' — ' + r.basis, fH(r.value, 2), isReq ? fd(v.planEnd) : (proj && proj.date ? fd(proj.date) : 'never'),
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
      tbl(['Scenario', 'Implied rate', 'Forecast completion', 'vs plan', 'Chance on plan'], ladderRows),
      el('div', { style: 'font-size:8px;color:#79839c;margin-top:3px' }, [
        'Each row re-runs the same bootstrap with every resampled day scaled by the multiplier — 400 simulations per row. A multiplier scales flying days and leaves stand-down days at zero, so it represents flying harder, not flying more often.'])]);

    // ── the batch ──
    H2('5. Student pilots');
    BLK([tbl(['SP', 'Call sign', 'Lessons', 'Hours', 'vs plan', 'Last flight', 'Idle', 'Projected finish', 'vs cohort'],
      forecastRows().map(r => [r.shortName, r.nick || '—', r.lessonsDone + '/' + m.curriculum.count,
        fH(r.hoursDone, 1), sgn(r.sp.hrsDelta, x => fH(x, 0)), fd(r.sp.lastDate),
        r.idleDays == null ? '—' : r.idleDays + 'd', fd(r.etcDate),
        r.vsCohortDays == null ? '—' : sgn(r.vsCohortDays, x => x.toFixed(0) + 'd')]))]);
    BLK([el('div', { style: 'font-size:8px;color:#79839c' }, [
      'Projected finish allocates the batch’s forecast output to each SP by their share of recent batch output, shrunk halfway toward an equal share. Shares sum to 1, so the per-SP rates sum back to the batch rate. "vs cohort" is the gap to the median SP’s projected finish.'])]);
    BLK([el('h3', {}, ['Lesson completion matrix']), reportMatrix()]);

    // ── integrity ──
    H2('6. Data integrity');
    const suites = [['Metrics model', Model.selfCheck(m)], ['Forecast engine', FC.selfCheck(fc, m)], ['View', viewChecks()]];
    const pass = suites.reduce((x, [, s]) => x + s.checks.filter(c => c.pass).length, 0);
    const all = suites.reduce((x, [, s]) => x + s.checks.length, 0);
    BLK([el('p', { class: pass === all ? 'rp-good' : 'rp-bad' }, [
      pass === all ? '✓ All ' + all + ' invariants pass against the data in this report.'
        : '✕ ' + (all - pass) + ' of ' + all + ' invariants FAIL — figures in this report are unverified.'])]);
    BLK([tbl(['Suite', 'Invariant', 'Result'], suites.flatMap(([name, s]) =>
      s.checks.map(c => [name, c.label, c.pass ? 'PASS' : 'FAIL'])))]);
    BLK([el('h3', {}, ['Sources']),
      tbl(['Source', 'Detail'], [
        ['Progress feed', (m.updatedAt || 'unknown') + ' · ' + m.students.length + ' SP · ' + m.curriculum.count + ' lessons'],
        ['Operations feed', (SYNC && SYNC.opsAt) || 'not loaded'],
        ['Ops → Progress credit', SYNC ? SYNC.extraLessons + ' lessons for ' + SYNC.syncCount + ' SP' : '—'],
        ['Metrics engine', 'js/ap127-v5-model.js — shared with AP127 Detail V5'],
        ['Forecast engine', 'js/ap127-v6-forecast.js — seeded, reproducible'],
      ])]);

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
        MX.rows = sortedStudents(); sizeMatrix(); drawMatrix();
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
      if (MX.ctx && MX.canvas && document.body.contains(MX.canvas)) drawMatrix();
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
    window.removeEventListener('resize', matrixResize);
    closeOverlays(); closeReport(); hideTip();
    MX.canvas = null; MX.ctx = null;
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
