/* ============================================================================
 * AP127 V5 — AP127 DETAIL V5. Redesigned tab, additive to (not replacing) V4.
 * Plain script (no Babel) — follows js/view-program.js / js/view-watchdog.js's
 * precedent. Every global here is V5-suffixed, every DOM id d127v5-prefixed,
 * whole thing IIFE-scoped. Never touches js/view-cohort-v4.js, js/shared.js or
 * css/progress.css — those three are live-proxied by DB_Share (see CLAUDE.md).
 * All numbers come from js/ap127-v5-model.js; this file is presentation only.
 * See docs/superpowers/specs/2026-08-12-ap127-detail-v5-design.md.
 * ==========================================================================*/
(function () {
  'use strict';
  const Model = window.AP127V5Model;
  const Layout = window.AP127V5Layout;
  const U = Model.util;
  const h = React.createElement;

  // ── tiny DOM/format helpers ────────────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v != null) n.setAttribute(k, v);
    });
    (kids || []).forEach(k => { if (k != null) n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return n;
  };
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fd(ds) { if (!ds || ds === 'COMPLETE') return ds || '—'; try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); } catch (e) { return ds; } }
  function fdShort(ds) { if (!ds) return '—'; try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch (e) { return ds; } }
  function fH(v) { if (v == null) return '—'; const a = Math.abs(v); return (a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)) + 'h'; }
  function fL(v) { if (v == null) return '—'; return Math.round(Math.abs(v)) + ' les'; }
  function fUnit(v, unit) { return unit === 'lessons' ? fL(v) : fH(v); }
  // `fmt` always receives the MAGNITUDE — some callers pass fH/fL (which
  // already take Math.abs internally, so this is idempotent for them), others
  // pass a bare `v => v + 'd'`; without the abs() here those raw formatters
  // rendered a plain "-3" after the "−" sign, producing "−-3" on screen.
  function signed(v, fmt) { return (v >= 0 ? '+' : '−') + fmt(Math.abs(v)); }
  function cssVar(name, fallback) { try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; } catch (e) { return fallback; } }
  function toast(msg, type) {
    let t = $('#d127v5-toast');
    if (!t) { t = el('div', { id: 'd127v5-toast', class: 'toast' }); document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast ' + (type || 'ok') + ' show';
    clearTimeout(t._tmr); t._tmr = setTimeout(() => t.classList.remove('show'), 3600);
  }

  // ── Ops augmentation — verbatim port of view-cohort-v4.js:2847 opsAugment().
  // Backfills Progress with Operations-completed flights not yet posted to
  // Progress, and syncs "planned" dates to real Ops-scheduled dates. General
  // capability, not V4-owned code — kept as its own copy so V5 never imports
  // from view-cohort-v4.js. ──
  function opsAugmentV5(students, curriculum) {
    const R = window.AP127Reconcile;
    const flights = (window.FLIGHT_DATA && window.FLIGHT_DATA.flights) || [];
    if (!R || !Array.isArray(students)) return { students, syncCount: 0, opsAt: null };
    const comp = {}, sched = {};
    flights.forEach(f => {
      if (!f.student || !f.lesson || !R.isAP127(f.batch)) return;
      const k = R.ccNameNorm(f.student), nl = R.normLesson(f.lesson);
      if (f.status === 'Completed' && f.date) { (comp[k] = comp[k] || {})[nl] = f; }
      else if (f.status !== 'Canceled' && f.date) { const m = (sched[k] = sched[k] || {}); if (!m[nl] || f.date < m[nl]) m[nl] = f.date; }
    });
    const curNorm = new Set((curriculum || []).map(c => R.normLesson(c.lesson)));
    let syncCount = 0;
    const out = students.map(s => {
      const key = R.ccKeyFromFull(s.name);
      const flownNorm = new Set((s.flown || []).map(f => R.normLesson(f.lesson)));
      const extra = [];
      Object.keys(comp[key] || {}).forEach(nl => {
        if (!flownNorm.has(nl) && curNorm.has(nl)) { const f = comp[key][nl]; extra.push({ lesson: f.lesson, actual_mins: f.durMin || f.actual_mins || 0, actual_ft: f.duration || '', date: f.date, _ops: true }); }
      });
      const flown = (extra.length ? [...(s.flown || []), ...extra] : (s.flown || [])).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (extra.length) syncCount++;
      const total = s.total || (curriculum || []).length;
      const m = sched[key] || {};
      const planned = (s.planned || []).map(p => ({ ...p, date: m[R.normLesson(p.lesson)] || 'TBC' }));
      return { ...s, flown, total, planned };
    });
    return { students: out, syncCount, opsAt: (window.FLIGHT_DATA && window.FLIGHT_DATA.fetchedAt) || null };
  }

  // ── Global state ────────────────────────────────────────────────────────
  const LS_STATE_KEY = 'ap127v5State';
  function loadPersisted() { try { return JSON.parse(localStorage.getItem(LS_STATE_KEY) || '{}'); } catch (e) { return {}; } }
  const persisted = loadPersisted();
  const layoutCfg = { current: Layout.effective() };

  const STATE = {
    unit: persisted.unit || layoutCfg.current.defaults.unit,
    scope: persisted.scope || layoutCfg.current.defaults.scope,   // 'batch' | 'per-sp' | 'sp'
    spotlightId: persisted.spotlightId || null,
    range: persisted.range != null ? persisted.range : layoutCfg.current.defaults.range,
    asOf: null,                                                    // null = live
    search: '',
    section: persisted.section || layoutCfg.current.defaults.section,
    sortKey: 'behind',
    lbPeriod: 'day', lbShowAll: true, lbBreakdown: false,
    gridMode: 'bars',
    calGroupBy: 'none',
    progressLevel: 'level',   // 'level' | 'gap'
    replay: null,             // {playing, idx, dates[], speed}
  };
  function persist() {
    try { localStorage.setItem(LS_STATE_KEY, JSON.stringify({ unit: STATE.unit, scope: STATE.scope, spotlightId: STATE.spotlightId, range: STATE.range, section: STATE.section })); } catch (e) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SIZING SYSTEM
  //
  // The rule: nothing shrinks itself into illegibility as data grows. Every
  // sized surface has a MIN and a MAX. When the natural "fit everything in the
  // container" size would fall below MIN, we stop shrinking and switch
  // technique instead — grids scroll horizontally at a readable cell size (with
  // an explicit zoom stepper), dense time-axis charts grow taller up to a cap
  // and then rely on zoom/pan rather than cramming more pixels per point.
  // ─────────────────────────────────────────────────────────────────────────
  const SIZE = {
    cell: { min: 11, max: 30, default: 22 },      // grid cell edge, px
    zoomSteps: [11, 14, 18, 22, 26, 30],
    chart: { min: 200, max: 620, perSeries: 9, base: 230 },
    rowH: { grid: 21, min: 16, max: 30 },
    nameCol: 136, vsCol: 46, etcCol: 56, totCol: 78,
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // Chart height grows with how many series it has to separate, then caps —
  // past the cap the chart offers zoom/pan instead of getting unreadably dense.
  function chartHeight(seriesCount, opts) {
    const o = opts || {};
    const base = o.base == null ? SIZE.chart.base : o.base;
    const per = o.perSeries == null ? SIZE.chart.perSeries : o.perSeries;
    const max = o.max == null ? SIZE.chart.max : o.max;
    return Math.round(clamp(base + Math.max(0, seriesCount - 1) * per, o.min == null ? SIZE.chart.min : o.min, max));
  }
  // Largest cell size that fits `cols` into `avail` px — but never below MIN.
  // Returning MIN (rather than something smaller) is what makes the container
  // scroll instead of the content becoming unreadable.
  function fitCell(cols, avail, o) {
    const min = (o && o.min) || SIZE.cell.min;
    const max = (o && o.max) || SIZE.cell.max;
    if (!cols || !avail) return SIZE.cell.default;
    return clamp(Math.floor(avail / cols), min, max);
  }
  function availGridWidth(host, reserved) {
    const w = host && host.getBoundingClientRect ? host.getBoundingClientRect().width : 0;
    return Math.max(240, (w || 900) - (reserved || 0) - 8);
  }
  // Per-grid zoom override (null = auto-fit). Kept out of STATE's persisted set
  // deliberately — it's a transient view aid, not a saved preference.
  const GRID_ZOOM = { 'curriculum-grid': null, 'activity-calendar': null };
  function gridZoomBar(panelId, autoW, onChange) {
    const wrap = el('div', { class: 'v5-zoombar' });
    wrap.appendChild(el('span', { class: 'v5-zoom-l' }, ['Zoom']));
    const cur = GRID_ZOOM[panelId];
    const mk = (label, val, title) => {
      const b = el('button', { class: 'v5-chip' + ((val === null ? cur === null : cur === val) ? ' on' : ''), title }, [label]);
      b.addEventListener('click', () => { GRID_ZOOM[panelId] = val; onChange(); });
      return b;
    };
    const set = el('div', { class: 'v5-chipset' }, [
      mk('Fit', null, 'Size cells to fit the panel width, never below the readable minimum (' + SIZE.cell.min + 'px)'),
      ...SIZE.zoomSteps.filter(s => s !== autoW).map(s => mk(s + 'px', s, 'Fixed ' + s + 'px cells — scroll horizontally')),
    ]);
    wrap.appendChild(set);
    wrap.appendChild(el('span', { class: 'v5-zoom-note' }, [cur === null ? `auto · ${autoW}px cells` : `${cur}px cells · scroll to pan`]));
    return wrap;
  }

  let RAW = { students: [], curriculum: [], updatedAt: null };
  let MODEL = null;
  let ROOT_EL = null;
  const PANELS = {};       // id -> panel definition
  const MOUNTS = {};       // id -> { el, handle, io, cfg, sectionId }
  const CHARTS = {};       // panel id -> Chart.js instance(s)
  let KPI_PREV = {};       // for count-up delta tracking

  function registerPanelV5(def) { PANELS[def.id] = def; }

  function rebuildModel(force) {
    const aug = opsAugmentV5(RAW.students, RAW.curriculum);
    MODEL = Model.buildModel(aug.students, RAW.curriculum, { asOf: STATE.asOf, updatedAt: RAW.updatedAt, force: true });
    MODEL._opsSyncCount = aug.syncCount;
    MODEL._opsAt = aug.opsAt;
  }

  // Scoped student list honoring global Scope + search — the single filter
  // every panel that lists/plots students goes through, so "who is shown" can
  // never silently disagree between panels (the class of bug V4 had with its
  // per-panel student toggles).
  function scopedStudents() {
    if (!MODEL) return [];
    let list = MODEL.students;
    if (STATE.scope === 'sp' && STATE.spotlightId) list = list.filter(s => String(s.catc_id) === String(STATE.spotlightId));
    if (STATE.search) {
      const q = STATE.search.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || String(s.nick || '').toLowerCase().includes(q) || String(s.fiFull || '').toLowerCase().includes(q));
    }
    return list;
  }
  function rangeStart() {
    if (!MODEL) return null;
    if (!STATE.range) return MODEL.batchStart;
    return U.addDays(MODEL.asOf, -STATE.range);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section / grid rendering + lazy mount
  // ─────────────────────────────────────────────────────────────────────────
  const SECTION_META = { pulse: 'Pulse', trend: 'Trend', people: 'People', syllabus: 'Syllabus', calendar: 'Calendar' };

  function renderSectionTabs() {
    const bar = $('#d127v5-sections');
    if (!bar) return;
    bar.innerHTML = '';
    layoutCfg.current.sections.filter(s => s.visible).forEach(s => {
      const btn = el('button', { class: 'v5-sectiontab' + (STATE.section === s.id ? ' on' : ''), onclick: () => goSection(s.id) }, [s.label || SECTION_META[s.id] || s.id]);
      bar.appendChild(btn);
    });
  }
  function goSection(id) {
    STATE.section = id; persist();
    renderSectionTabs();
    renderGrid();
    // Deep-link via a QUERY param, never location.hash — the outer app shell
    // (js/shell.js) owns the hash for its own top-level view routing
    // (`#/cohort-v5`) and only strips a single `#/` segment; writing a nested
    // path there (`#/cohort-v5/pulse`) would make the whole app fail to
    // restore its view on reload, since 'cohort-v5/pulse' matches no
    // registered view id. The query string is never read by that logic.
    try {
      const url = new URL(location.href);
      url.searchParams.set('v5section', id);
      history.replaceState(null, '', url.pathname + url.search + location.hash);
    } catch (e) {}
  }

  function destroyPanel(id) {
    const m = MOUNTS[id]; if (!m) return;
    try { if (m.io) m.io.disconnect(); } catch (e) {}
    const def = PANELS[id];
    try { if (def && def.destroy) def.destroy(m.handle); } catch (e) {}
    if (CHARTS[id]) { (Array.isArray(CHARTS[id]) ? CHARTS[id] : [CHARTS[id]]).forEach(c => { try { c.destroy(); } catch (e) {} }); delete CHARTS[id]; }
    delete MOUNTS[id];
  }

  function renderGrid() {
    const body = $('#d127v5-grid');
    if (!body) return;
    Object.keys(MOUNTS).forEach(destroyPanel);
    body.innerHTML = '';
    const sec = layoutCfg.current.sections.find(s => s.id === STATE.section);
    if (!sec) { body.innerHTML = '<div class="v5-empty">Section not found.</div>'; return; }
    const panels = sec.panels.filter(p => p.visible && PANELS[p.id]);
    if (!panels.length) { body.innerHTML = '<div class="v5-empty">Every panel in this section is hidden. Open Customise to bring one back.</div>'; return; }
    panels.forEach(cfg => body.appendChild(buildPanelShell(cfg, sec.id)));
  }

  function buildPanelShell(cfg, sectionId) {
    const def = PANELS[cfg.id];
    const wrap = el('div', { class: 'v5-panel v5-span-' + cfg.span, 'data-panel': cfg.id });
    const hd = el('div', { class: 'v5-panel-hd' }, [
      el('span', { class: 'v5-panel-t' }, [def.title]),
      def.subtitle ? el('span', { class: 'v5-panel-s' }, [def.subtitle(MODEL, cfg.opts)]) : null,
    ]);
    const toolbar = el('div', { class: 'v5-panel-toolbar' });
    hd.appendChild(toolbar);
    wrap.appendChild(hd);
    const body = el('div', { class: 'v5-panel-body' });
    const skel = el('div', { class: 'v5-skeleton' }, ['Loading ' + def.title.toLowerCase() + '…']);
    if (def.estHeight) skel.style.minHeight = def.estHeight + 'px';
    body.appendChild(skel);
    wrap.appendChild(body);

    const mountNow = () => {
      if (MOUNTS[cfg.id] && MOUNTS[cfg.id].mounted) return;
      body.innerHTML = '';
      if (def.toolbar) { toolbar.innerHTML = ''; def.toolbar(toolbar, STATE, cfg.opts); }
      let handle = null;
      try { handle = def.mount(body, MODEL, cfg.opts, STATE); }
      catch (e) { console.error('[v5] panel mount failed:', cfg.id, e); body.innerHTML = '<div class="v5-empty">Couldn\'t render this panel.</div>'; }
      MOUNTS[cfg.id] = { el: body, handle, cfg, sectionId, mounted: true };
      wrap.classList.add('v5-mounted');   // releases content-visibility (see CSS note)
    };
    // Lazy mount via IntersectionObserver — only the panels actually scrolled
    // into view build a chart/canvas. Falls back to immediate mount if IO is
    // unavailable, AND to a short timer regardless — `io.observe(wrap)` here
    // runs on a node that isn't attached to the document yet (it's still just
    // this function's return value, appended by the caller a tick later), and
    // while that's a normally-safe pattern, a panel getting permanently stuck
    // on its "Loading…" skeleton is a bad enough failure mode (confirmed live:
    // it happened) that a cheap timeout backstop is worth it regardless of the
    // exact cause — it guarantees a panel never fails to mount silently.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { mountNow(); io.disconnect(); } }, { root: $('#d127v5-body'), rootMargin: '200px' });
      io.observe(wrap);
      MOUNTS[cfg.id] = { el: body, handle: null, io, cfg, sectionId, mounted: false };
      setTimeout(() => { if (MOUNTS[cfg.id] && !MOUNTS[cfg.id].mounted) { try { io.disconnect(); } catch (e) {} mountNow(); } }, 900);
    } else mountNow();
    return wrap;
  }

  function updatePanel(id) {
    const m = MOUNTS[id]; const def = PANELS[id];
    if (!m || !m.mounted || !def) return;
    const wrap = m.el.closest('.v5-panel');
    const toolbar = wrap ? $('.v5-panel-toolbar', wrap) : null;
    if (def.toolbar && toolbar) { toolbar.innerHTML = ''; def.toolbar(toolbar, STATE, m.cfg.opts); }
    try { if (def.update) def.update(m.handle, MODEL, m.cfg.opts, STATE); else { m.el.innerHTML = ''; m.handle = def.mount(m.el, MODEL, m.cfg.opts, STATE); } }
    catch (e) { console.error('[v5] panel update failed:', id, e); }
  }

  // applyState — the ONLY place STATE mutates. `changed` = array of state keys
  // that changed; every mounted panel whose declared deps intersect `changed`
  // (or that declares 'always') gets updated, everything else is left alone.
  function applyState(changed) {
    const set = new Set(changed);
    Object.keys(MOUNTS).forEach(id => {
      const def = PANELS[id];
      if (!def) return;
      const deps = def.deps || ['always'];
      if (deps.includes('always') || deps.some(d => set.has(d))) updatePanel(id);
    });
    if (set.has('unit') || set.has('scope') || set.has('range') || set.has('asOf')) refreshCommandBarChrome();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Command bar
  // ─────────────────────────────────────────────────────────────────────────
  function refreshCommandBarChrome() {
    $$('.v5-chip[data-unit]').forEach(b => b.classList.toggle('on', b.dataset.unit === STATE.unit));
    $$('.v5-chip[data-scope]').forEach(b => b.classList.toggle('on', b.dataset.scope === STATE.scope));
    $$('.v5-chip[data-range]').forEach(b => b.classList.toggle('on', String(b.dataset.range) === String(STATE.range)));
    const live = $('#d127v5-live');
    if (live) {
      const isLive = !STATE.asOf;
      live.classList.toggle('v5-timetravel', !isLive);
      live.innerHTML = isLive ? '<i class="v5-mono">●</i> ' + escHtml(MODEL ? fdShort(MODEL.todayBKK) : '') + ' · live' : '⏪ ' + escHtml(fdShort(STATE.asOf));
    }
  }

  function setUnit(u) { if (STATE.unit === u) return; STATE.unit = u; persist(); applyState(['unit']); }
  function setScope(sc, spotlightId) {
    STATE.scope = sc; if (spotlightId !== undefined) STATE.spotlightId = spotlightId;
    persist(); applyState(['scope']);
  }
  function setRange(r) { if (STATE.range === r) return; STATE.range = r; persist(); applyState(['range']); }
  function setAsOf(ds) {
    STATE.asOf = ds || null;
    rebuildModel();
    renderSelfCheck();
    applyState(['asOf', 'unit', 'scope', 'range']);
    mountReel(true);
  }
  function setSearch(q) { STATE.search = q; applyState(['search']); }

  function buildScopePopover(anchor) {
    closePopovers();
    const pop = el('div', { class: 'v5-popover' });
    pop.appendChild(el('div', { class: 'v5-mono', style: 'font-size:9px;color:var(--v5-tx3);text-transform:uppercase;margin-bottom:6px' }, ['Spotlight one SP']));
    const input = el('input', { class: 'v5-search', style: 'width:100%;margin-bottom:6px', placeholder: 'Search name or call sign…' });
    pop.appendChild(input);
    const list = el('div', { style: 'max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px' });
    pop.appendChild(list);
    const renderList = () => {
      const q = input.value.toLowerCase();
      const matches = (MODEL ? MODEL.students : []).filter(s => !q || s.name.toLowerCase().includes(q) || String(s.nick || '').toLowerCase().includes(q));
      list.innerHTML = '';
      matches.slice(0, 40).forEach(s => {
        list.appendChild(el('button', {
          class: 'v5-btn', style: 'text-align:left;justify-content:flex-start;display:flex;gap:8px',
          onclick: () => { setScope('sp', s.catc_id); closePopovers(); },
        }, [el('b', { style: 'color:var(--v5-acc)' }, [s.nick || '—']), ' ' + s.shortName]));
      });
    };
    input.addEventListener('input', renderList);
    renderList();
    anchor.appendChild(pop);
    setTimeout(() => document.addEventListener('click', onDocClickClosePopover, { once: true }), 0);
  }
  function closePopovers() { $$('.v5-popover').forEach(p => p.remove()); }
  function onDocClickClosePopover(e) { if (!e.target.closest('.v5-popover-anchor')) closePopovers(); }

  function buildTimePopover(anchor) {
    closePopovers();
    const pop = el('div', { class: 'v5-popover', style: 'width:300px' });
    pop.appendChild(el('div', { class: 'v5-mono', style: 'font-size:9px;color:var(--v5-tx3);text-transform:uppercase' }, ['Time machine']));
    const track = el('div', { class: 'v5-scrubber' });
    const thumb = el('div', { class: 'v5-scrub-thumb' });
    track.appendChild(thumb);
    pop.appendChild(track);
    const dateInput = el('input', { type: 'date', class: 'v5-search', style: 'width:100%;margin-top:6px' });
    dateInput.min = MODEL ? MODEL.batchStart : '';
    dateInput.max = MODEL ? MODEL.todayBKK : '';
    dateInput.value = STATE.asOf || (MODEL ? MODEL.todayBKK : '');
    pop.appendChild(dateInput);
    const liveBtn = el('button', { class: 'v5-btn', style: 'margin-top:6px;width:100%' }, ['Return to live']);
    pop.appendChild(liveBtn);
    const span = () => {
      const s = new Date(MODEL.batchStart + 'T00:00:00').getTime(), e = new Date(MODEL.todayBKK + 'T00:00:00').getTime();
      return { s, e: Math.max(e, s + 1) };
    };
    const setThumb = () => {
      if (!MODEL) return;
      const { s, e } = span();
      const cur = new Date((STATE.asOf || MODEL.todayBKK) + 'T00:00:00').getTime();
      const frac = Math.max(0, Math.min(1, (cur - s) / (e - s)));
      thumb.style.left = (frac * 100) + '%';
    };
    setThumb();
    let dragging = false;
    const move = clientX => {
      const r = track.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      const { s, e } = span();
      const ds = U.ymd(new Date(s + frac * (e - s)));
      dateInput.value = ds;
      thumb.style.left = (frac * 100) + '%';
      return ds;
    };
    track.addEventListener('pointerdown', ev => { dragging = true; track.setPointerCapture(ev.pointerId); move(ev.clientX); });
    track.addEventListener('pointermove', ev => { if (dragging) move(ev.clientX); });
    track.addEventListener('pointerup', ev => { if (dragging) { dragging = false; const ds = move(ev.clientX); setAsOf(ds >= MODEL.todayBKK ? null : ds); } });
    dateInput.addEventListener('change', () => setAsOf(dateInput.value || null));
    liveBtn.addEventListener('click', () => { setAsOf(null); closePopovers(); });
    anchor.appendChild(pop);
    setTimeout(() => document.addEventListener('click', onDocClickClosePopover, { once: true }), 0);
  }

  // Each control group carries a visible label and a plain-language tooltip.
  // Without them the bar was just 12 unexplained chips — user feedback was
  // "don't know what these are using for or what to expect".
  function ctrlGroup(labelText, titleText, children) {
    return el('div', { class: 'v5-ctrl', title: titleText }, [
      el('span', { class: 'v5-ctrl-l' }, [labelText]),
      el('div', { class: 'v5-chipset' }, children),
    ]);
  }
  function buildCommandBar(root) {
    const bar = el('div', { class: 'v5-cmdbar' });
    bar.appendChild(el('div', { class: 'v5-brand' }, ['AP', el('b', {}, ['127']), ' V5', el('span', { class: 'v5-draft-tag', title: 'This tab is still under active development — expect layout and behaviour to keep changing.' }, ['DRAFT'])]));

    bar.appendChild(ctrlGroup('Measure in', 'Switches every figure and chart on this tab between HOURS and LESSONS. Hours use each lesson’s standard curriculum duration.',
      [['hours', 'Hours'], ['lessons', 'Lessons']].map(([v, l]) =>
        el('button', { class: 'v5-chip', 'data-unit': v, onclick: () => setUnit(v) }, [l]))));

    const scopeChips = [
      el('button', { class: 'v5-chip', 'data-scope': 'batch', onclick: () => setScope('batch') }, ['Whole batch']),
      el('button', { class: 'v5-chip', 'data-scope': 'per-sp', onclick: () => setScope('per-sp') }, ['All SP']),
      el('button', { class: 'v5-chip', 'data-scope': 'sp', onclick: () => buildScopePopover($('.v5-ctrl.v5-popover-anchor')) }, ['One SP…']),
    ];
    const scopeGroup = ctrlGroup('Show', 'Whole batch = one combined line/total for all 28 SP. All SP = one line per student. One SP = pick a single student and focus the whole tab on them.', scopeChips);
    scopeGroup.classList.add('v5-popover-anchor');
    bar.appendChild(scopeGroup);

    bar.appendChild(ctrlGroup('Period', 'How far back the day-by-day panels look (Output, Activity calendar). Does not affect all-time progress totals.',
      [[30, '30 days'], [60, '60 days'], [90, '90 days'], [0, 'All time']].map(([v, l]) =>
        el('button', { class: 'v5-chip', 'data-range': v, onclick: () => setRange(v) }, [l]))));

    const timeAnchor = el('div', { class: 'v5-ctrl v5-popover-anchor', title: 'Time machine — rewind the whole tab to see the batch as it stood on any past date. Green = showing live data.' }, [
      el('span', { class: 'v5-ctrl-l' }, ['Data as of']),
      el('button', { id: 'd127v5-live', class: 'v5-live' }, ['● live']),
    ]);
    $('#d127v5-live', timeAnchor).addEventListener('click', () => buildTimePopover(timeAnchor));
    bar.appendChild(timeAnchor);

    bar.appendChild(el('div', { class: 'v5-ctrl', title: 'Filters the student list by name, call sign or instructor.' }, [
      el('span', { class: 'v5-ctrl-l' }, ['Find SP']),
      el('input', { class: 'v5-search', placeholder: 'name / call sign / FI', oninput: e => setSearch(e.target.value) }),
    ]));

    bar.appendChild(el('span', { class: 'v5-spacer' }));

    bar.appendChild(el('div', { class: 'v5-ctrl' }, [
      el('span', { class: 'v5-ctrl-l' }, ['Actions']),
      el('div', { class: 'v5-chipset' }, [
        el('button', { id: 'd127v5-story-btn', class: 'v5-chip', onclick: toggleReplay, title: 'Play the batch’s whole history back as an animation, pausing at each target checkpoint and milestone.' }, ['▶ Story']),
        el('button', { class: 'v5-chip', onclick: openCustomise, title: 'Reorder, resize, hide or show any panel. Save as the default, share as a link, or export to commit.' }, ['⚙ Customise']),
        el('button', { class: 'v5-chip', onclick: openReportPreview, title: 'Preview a printable report that looks like this page, then print it or download it as a PDF.' }, ['⤓ Report']),
        el('button', { class: 'v5-chip', onclick: () => { setAsOf(null); toast('Back to live data'); }, title: 'Return to live data (clears any time-travel date).' }, ['⟳ Live']),
      ]),
    ]));
    root.appendChild(bar);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: KPI tiles ("kpis")
  // ─────────────────────────────────────────────────────────────────────────
  const KPI_DEFS = {
    progress: (m) => ({ label: 'Progress', value: m.batch.progressPct, fmt: v => v.toFixed(1) + '%', color: 'var(--v5-acc)', sub: () => m.batch.lessonsDone + ' les · ' + fH(m.batch.hoursDone), section: 'people' }),
    hoursDelta: (m) => ({ label: 'Hours vs plan', value: m.batch.hoursDelta, fmt: v => signed(v, fH), color: m.batch.hoursDelta >= 0 ? 'var(--v5-good)' : 'var(--v5-bad)', sub: () => (m.batch.hoursDelta >= 0 ? 'ahead' : 'behind') + ' plan', section: 'trend' }),
    lessonsDelta: (m) => ({ label: 'Lessons vs plan', value: m.batch.lessonsDelta, fmt: v => signed(v, fL), color: m.batch.lessonsDelta >= 0 ? 'var(--v5-good)' : 'var(--v5-bad)', sub: () => (m.batch.lessonsDelta >= 0 ? 'ahead' : 'behind') + ' plan', section: 'trend' }),
    vsTarget: (m) => { const v = m.batch.vsTargetToday; return { label: 'vs target today', value: v ? v.behindCount : null, fmt: x => (x == null ? '—' : x + ' SP'), color: 'var(--v5-rose)', sub: () => v ? 'behind L' + Math.round(m.batch.targetLessonToday) : 'no target set', section: 'syllabus' }; },
    atRisk: (m) => ({ label: 'At risk', value: m.etc.atRisk, fmt: v => v + ' / ' + m.batch.n, color: m.etc.atRisk > 0 ? 'var(--v5-warn)' : 'var(--v5-good)', sub: () => m.etc.atRisk ? 'avg +' + m.etc.avgDelay + 'd late' : 'none', section: 'people' }),
    daysLeft: (m) => ({ label: 'Plan end', value: m.pace ? m.pace.daysRem : null, fmt: () => fd(m.curriculum.planEndDate), color: 'var(--v5-tx)', sub: () => m.pace && m.pace.overdue ? 'overdue ' + m.pace.daysOverdue + 'd' : (m.pace && m.pace.daysRem != null ? m.pace.daysRem + 'd remaining' : '—'), section: 'pulse' }),
  };
  // `onDone` renders the true final text (the caller's formatted string, e.g.
  // "34.8%" — not the tween's own raw toFixed(dp) number) and is called from
  // the SAME rAF callback that decides the animation is complete. This used
  // to be split into two independent timers — this loop for the count-up, a
  // separate setTimeout(520) to swap in the formatted text afterwards — and
  // they raced: rAF's own last frame (tied to the display refresh, not a
  // fixed delay) could fire a few ms AFTER that setTimeout, overwriting the
  // just-applied formatted text with the tween's raw number and leaving it
  // stuck that way permanently (nothing re-corrected it). Caught live via a
  // MutationObserver trace: every KPI tile briefly showed correct text
  // ("34.8%", "27 Nov 26"...) then reverted to the bare number 14ms later.
  // One code path now owns the final state, so the race can't happen.
  function tweenNumber(elv, from, to, dp, onDone) {
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / 500); const ee = 1 - Math.pow(1 - p, 3);
      if (p < 1) { elv.textContent = (from + (to - from) * ee).toFixed(dp); requestAnimationFrame(step); }
      else if (onDone) onDone();
      else elv.textContent = to.toFixed(dp);
    }
    requestAnimationFrame(step);
  }
  // ── Situation report (panel id stays 'kpis' so saved layouts/share links
  // survive) ────────────────────────────────────────────────────────────────
  // Redesigned in p176 from a row of 6 generic tiles into the tab's actual
  // situation report, answering three questions in reading order: where we
  // stand → what is left → what it takes. Hours AND lessons are shown side by
  // side throughout, deliberately independent of the command bar's
  // Hours/Lessons toggle: this is the one panel that has to be readable
  // without first checking which unit is selected.
  const nf0 = v => (v == null ? '—' : Math.round(v).toLocaleString('en-GB'));
  function sitStat(label, big, bigColor, subs) {
    return el('div', { class: 'v5-sit-stat' }, [
      el('div', { class: 'v5-sit-l' }, [label]),
      el('div', { class: 'v5-sit-v', style: bigColor ? 'color:' + bigColor : '' }, [big]),
    ].concat((subs || []).filter(Boolean).map(s => el('div', { class: 'v5-sit-s', html: s }))));
  }
  registerPanelV5({
    id: 'kpis', title: 'Situation', estHeight: 250, deps: ['unit', 'scope', 'range', 'asOf'],
    subtitle: () => 'where the batch stands · what is left · what it takes — hours and lessons shown together',
    mount(container, model) {
      const b = model.batch, pace = model.pace, act = model.actualPace;
      const n = Math.max(1, b.n);
      const wrap = el('div', { class: 'v5-sit' });

      // ── Verdict line ─────────────────────────────────────────────────────
      // One plain sentence with the single most actionable number in it, so
      // the situation is legible before the eye reaches any figure below.
      const gapWk = (pace && pace.reqWeekHrsB != null && act) ? act.actWeekHrsB - pace.reqWeekHrsB : null;
      let vClass = 'ok', vTitle = 'ON TRACK', vMsg = '';
      if (!pace) { vClass = 'ok'; vTitle = 'NO DATA'; vMsg = 'Pace cannot be computed — no students in scope.'; }
      else if (pace.overdue) {
        vClass = 'bad'; vTitle = 'PLAN END PASSED';
        vMsg = `Plan end date <b>${fd(pace.planEndDate)}</b> passed <b>${pace.daysOverdue}d</b> ago with <b>${fH(pace.remHrsB)}</b> (${nf0(pace.remLesB)} lessons) still to fly.`;
      } else if (gapWk == null) {
        vClass = 'warn'; vTitle = 'NO PLAN END'; vMsg = 'Plan end date unavailable — required pace cannot be computed.';
      } else if (gapWk < 0) {
        vClass = 'bad'; vTitle = 'BEHIND REQUIRED PACE';
        vMsg = `<b>${fH(pace.remHrsB)}</b> left over <b>${pace.daysRem}d</b> → needs <b>${fH(pace.reqWeekHrsB)}/week</b> (${fH(pace.reqWeekHrsB / n)}/SP). Now flying ${fH(act.actWeekHrsB)}/week — short by <b>${fH(Math.abs(gapWk))}/week</b>.`;
      } else {
        vClass = 'ok'; vTitle = 'AT OR ABOVE REQUIRED PACE';
        vMsg = `<b>${fH(pace.remHrsB)}</b> left over <b>${pace.daysRem}d</b> → needs ${fH(pace.reqWeekHrsB)}/week; now flying <b>${fH(act.actWeekHrsB)}/week</b> (+${fH(gapWk)}).`;
      }
      wrap.appendChild(el('div', { class: 'v5-sit-verdict v5-sit-' + vClass }, [
        el('span', { class: 'v5-sit-vt' }, [vTitle]),
        el('span', { class: 'v5-sit-vm', html: vMsg }),
      ]));

      // ── Three bands ──────────────────────────────────────────────────────
      const bands = el('div', { class: 'v5-sit-bands' });

      // 1. DONE
      const doneBand = el('div', { class: 'v5-sit-band' }, [el('div', { class: 'v5-sit-h' }, ['① Where we stand'])]);
      const doneGrid = el('div', { class: 'v5-sit-grid' });
      // Rendered with its REAL value, not a '0' placeholder for the count-up to
      // fill in: if requestAnimationFrame never runs (background/hidden tab,
      // throttled renderer, reduced-motion), a placeholder would leave the
      // headline number reading "0" permanently — actively wrong on the one
      // panel that has to be trustworthy at a glance. The tween below is a
      // pure enhancement layered on top of an already-correct value.
      // Labelled "(lessons)" on purpose: progressPct is lessons-complete /
      // lesson-slots, which runs ahead of the hours-based figure (36.4% vs
      // 24.5% on live data, since early lessons are short). Both are shown in
      // the sub-lines; the headline says which one it is.
      doneGrid.appendChild(sitStat('Progress (lessons)', b.progressPct.toFixed(1) + '%', 'var(--v5-acc)', [
        `${nf0(b.lessonsDone)} / ${nf0(b.lessonSlots)} lessons`,
        // nf0, not fH — fH appends its own 'h', which read as "1236h / 5040h
        // hours" next to the lessons line above it.
        `${nf0(b.hoursDone)} / ${nf0(b.hourSlots)} hours`,
      ]));
      doneGrid.appendChild(sitStat('vs plan today', signed(b.hoursDelta, fH), b.hoursDelta >= 0 ? 'var(--v5-good)' : 'var(--v5-bad)', [
        // likewise fL would render "−673 les lessons".
        signed(b.lessonsDelta, nf0) + ' lessons',
        (b.hoursDelta >= 0 ? 'ahead of' : 'behind') + ' curriculum plan',
      ]));
      const vt = b.vsTargetToday;
      doneGrid.appendChild(sitStat('vs revised-target', vt ? vt.behindCount + ' SP' : '—', vt && vt.behindCount ? 'var(--v5-rose)' : 'var(--v5-good)', [
        vt ? 'behind target L' + Math.round(b.targetLessonToday) : 'no target set',
        `${nf0(b.n)} SP in batch`,
      ]));
      doneBand.appendChild(doneGrid);
      bands.appendChild(doneBand);

      // 2. REMAINING — the "total remaining hours + remaining day/week/month" ask
      const remBand = el('div', { class: 'v5-sit-band' }, [el('div', { class: 'v5-sit-h' }, ['② What is left'])]);
      const remGrid = el('div', { class: 'v5-sit-grid' });
      remGrid.appendChild(sitStat('Hours remaining', pace ? fH(pace.remHrsB) : '—', 'var(--v5-tx)', [
        pace ? `${fH(pace.remHrsB / n)} per SP` : null,
        pace ? `of ${fH(b.hourSlots)} total` : null,
      ]));
      remGrid.appendChild(sitStat('Lessons remaining', pace ? nf0(pace.remLesB) : '—', 'var(--v5-tx)', [
        pace ? `${(pace.remLesB / n).toFixed(1)} per SP` : null,
        pace ? `of ${nf0(b.lessonSlots)} total` : null,
      ]));
      // Time left expressed three ways — the explicit day/week/month ask.
      const dRem = pace ? pace.daysRem : null;
      remGrid.appendChild(sitStat('Time remaining', dRem == null ? '—' : dRem + 'd',
        pace && pace.overdue ? 'var(--v5-bad)' : 'var(--v5-tx)', [
          dRem == null ? null : `${(dRem / 7).toFixed(1)} weeks · ${(dRem / 30.44).toFixed(1)} months`,
          pace ? (pace.overdue ? `overdue ${pace.daysOverdue}d past ${fd(pace.planEndDate)}` : `to plan end ${fd(pace.planEndDate)}`) : null,
        ]));
      remBand.appendChild(remGrid);
      bands.appendChild(remBand);

      // 3. REQUIRED RATE — per day and per week, batch and per SP, vs actual.
      const reqBand = el('div', { class: 'v5-sit-band' }, [el('div', { class: 'v5-sit-h' }, ['③ What it takes'])]);
      const reqGrid = el('div', { class: 'v5-sit-grid' });
      const rateStat = (label, reqH, reqL, actH) => {
        if (reqH == null) return sitStat(label, '—', 'var(--v5-tx3)', ['plan end date passed']);
        const d = actH == null ? null : actH - reqH;
        return sitStat(label, fH(reqH), 'var(--v5-warn)', [
          `${fH(reqH / n)} per SP · ${(reqL == null ? '—' : reqL.toFixed(1))} lessons`,
          d == null ? null : `now ${fH(actH)} · <b style="color:${d >= 0 ? 'var(--v5-good)' : 'var(--v5-bad)'}">${signed(d, fH)}</b>`,
        ]);
      };
      reqGrid.appendChild(rateStat('Required / day', pace && pace.reqDayHrsB, pace && pace.reqDayLesB, act && act.actDayHrsB));
      reqGrid.appendChild(rateStat('Required / week', pace && pace.reqWeekHrsB, pace && pace.reqWeekLesB, act && act.actWeekHrsB));
      reqGrid.appendChild(rateStat('Required / month', pace && pace.reqMonthHrsB, pace && pace.reqMonthLesB, act && act.actMonthHrsB));
      reqBand.appendChild(reqGrid);
      bands.appendChild(reqBand);
      wrap.appendChild(bands);

      // ── Watch strip — the decision-relevant counts that used to be tiles,
      // each still deep-linking to the section that explains it.
      const wl = model.watchlist();
      const idleN = wl.filter(x => !x.neverFlown && x.idle >= 5).length;
      const chips = el('div', { class: 'v5-sit-chips' });
      const chip = (label, value, color, section) => chips.appendChild(
        el('button', { class: 'v5-sit-chip', onclick: () => goSection(section), title: 'Open the ' + section + ' section' }, [
          el('b', { style: 'color:' + color }, [String(value)]), ' ' + label,
        ]));
      chip('at risk of finishing late', model.etc.atRisk + '/' + b.n, model.etc.atRisk ? 'var(--v5-warn)' : 'var(--v5-good)', 'people');
      chip('idle ≥ 5 days', idleN, idleN ? 'var(--v5-warn)' : 'var(--v5-good)', 'pulse');
      chip('never flown', wl.filter(x => x.neverFlown).length, wl.filter(x => x.neverFlown).length ? 'var(--v5-bad)' : 'var(--v5-good)', 'people');
      chip('retakes across the batch', b.retakes, 'var(--v5-tx2)', 'people');
      wrap.appendChild(chips);

      container.appendChild(wrap);

      // Count-up on the headline number — enhancement only (the element already
      // shows the correct value). Skipped entirely under reduced-motion, and
      // skipped when there's no prior value to count up FROM, so a first paint
      // shows the real figure immediately instead of sweeping up from zero.
      const pEl = $('.v5-sit-v', wrap);
      const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (pEl && !reduceMotion && KPI_PREV.progress != null && KPI_PREV.progress !== b.progressPct) {
        tweenNumber(pEl, KPI_PREV.progress, b.progressPct, 1, () => {
          pEl.textContent = b.progressPct.toFixed(1) + '%';
          pEl.classList.add('v5-flash');
          setTimeout(() => pEl.classList.remove('v5-flash'), 500);
        });
      }
      KPI_PREV.progress = b.progressPct;
      return { wrap };
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Pace vs Target ("pace")
  // ─────────────────────────────────────────────────────────────────────────
  registerPanelV5({
    id: 'pace', title: 'Pace vs target', estHeight: 260, deps: ['unit', 'scope', 'asOf'],
    subtitle: () => STATE.scope === 'sp' ? 'single SP' : 'batch · situation vs required pace',
    mount(container, model) {
      const pace = model.pace, act = model.actualPace;
      const perSP = STATE.scope === 'sp' && STATE.spotlightId;
      const n = perSP ? 1 : model.batch.n;
      const wrap = el('div', {});
      const table = el('table', { class: 'v5-pacetbl' });
      table.appendChild(el('thead', {}, [el('tr', {}, [el('th', {}, ['Period']), el('th', {}, ['Required']), el('th', {}, ['Actual']), el('th', {}, ['Gap'])])]));
      const tbody = el('tbody', {});
      const rows = [
        ['Month', pace ? pace.reqMonthHrsB : null, pace ? pace.reqMonthLesB : null, act.actMonthHrsB, act.actMonthLesB],
        ['Week', pace ? pace.reqWeekHrsB : null, pace ? pace.reqWeekLesB : null, act.actWeekHrsB, act.actWeekLesB],
        ['Day', pace ? pace.reqDayHrsB : null, pace ? pace.reqDayLesB : null, act.actDayHrsB, act.actDayLesB],
      ];
      rows.forEach(([label, reqH, reqL, actH, actL]) => {
        const req = STATE.unit === 'hours' ? reqH : reqL;
        const actv = (STATE.unit === 'hours' ? actH : actL) / n;
        const reqv = req == null ? null : req / n;
        const gap = reqv == null ? null : actv - reqv;
        const gapColor = gap == null ? 'var(--v5-tx3)' : gap >= 0 ? 'var(--v5-good)' : 'var(--v5-bad)';
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [label]),
          el('td', {}, [reqv == null ? '—' : fUnit(reqv, STATE.unit)]),
          el('td', {}, [fUnit(actv, STATE.unit)]),
          el('td', { style: 'color:' + gapColor + ';font-weight:700' }, [gap == null ? '—' : signed(gap, v => fUnit(v, STATE.unit))]),
        ]));
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      const gapWkBatch = pace && pace.reqWeekHrsB != null ? model.actualPace.actWeekHrsB - pace.reqWeekHrsB : null;
      let msg;
      if (pace && pace.overdue) msg = `Plan end date (${fd(pace.planEndDate)}) has passed — batch is <b style="color:var(--v5-bad)">${pace.daysOverdue}d overdue</b>.`;
      else if (gapWkBatch == null) msg = 'Plan end date unavailable — required pace can’t be computed.';
      else if (gapWkBatch < 0) msg = `Batch needs <b style="color:var(--v5-bad)">${fH(Math.abs(gapWkBatch))} more hours per week</b> (${model.batch.n} SP combined) to finish by plan date.`;
      else msg = `Batch is <b style="color:var(--v5-good)">${fH(gapWkBatch)} per week ahead</b> of required pace — on track.`;
      wrap.appendChild(el('div', { class: 'v5-action-banner', html: '<div class="v5-mono" style="font-size:9px;color:var(--v5-tx3);text-transform:uppercase;margin-bottom:4px">Required action</div>' + msg + (pace ? `<div style="margin-top:4px;color:var(--v5-tx3);font-size:10px">Remaining ${pace.remHrsB.toFixed(1)}h / ${pace.remLesB} les batch-wide</div>` : '') }));
      container.appendChild(wrap);
      return {};
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Watchlist
  // ─────────────────────────────────────────────────────────────────────────
  registerPanelV5({
    id: 'watchlist', title: 'Watchlist', estHeight: 220, deps: ['asOf'],
    subtitle: (m) => (m.watchlist().length) + ' flagged · idle ≥ 5d or hours ≤ −3',
    mount(container, model) {
      const items = model.watchlist();
      if (!items.length) { container.appendChild(el('div', { class: 'v5-empty' }, ['No students idle ≥5d or significantly behind. 🎉'])); return {}; }
      items.forEach(x => {
        const badgeColor = x.neverFlown ? 'var(--v5-bad)' : x.idle >= 10 ? 'var(--v5-bad)' : x.idle >= 5 ? 'var(--v5-warn)' : 'var(--v5-tx3)';
        const row = el('div', { class: 'v5-list-item', onclick: () => openSPDrawer(x.sp.catc_id) }, [
          el('span', { style: 'flex:1' }, [x.sp.shortName]),
          el('span', { class: 'v5-badge', style: `background:${badgeColor}22;color:${badgeColor}` }, [x.neverFlown ? 'never flown' : x.idle + 'd idle']),
          el('span', { class: 'v5-mono', style: 'color:' + (x.hrsDelta < 0 ? 'var(--v5-bad)' : 'var(--v5-good)') }, [signed(x.hrsDelta, fH)]),
        ]);
        container.appendChild(row);
      });
      return {};
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Progress vs Plan (merged chart — replaces 4 V4 panels)
  // ─────────────────────────────────────────────────────────────────────────
  function mkChart(id, cfg) {
    const ctx = document.getElementById(id); if (!ctx) return null;
    const ex = window.Chart.getChart(ctx); if (ex) ex.destroy();
    cfg.options = cfg.options || {};
    if (cfg.options.animation === undefined) cfg.options.animation = false;
    cfg.options.devicePixelRatio = Math.min(2, window.devicePixelRatio || 1);
    // chartjs-plugin-datalabels auto-registers itself globally off the CDN UMD
    // build the moment its <script> tag runs (index.html loads it for V4's
    // charts) — every Chart instance gets it, including ours, unless a chart
    // opts out explicitly. V5 doesn't use datalabels anywhere, so it's forced
    // off centrally here rather than repeated in every chart config below.
    cfg.options.plugins = cfg.options.plugins || {};
    if (cfg.options.plugins.datalabels === undefined) cfg.options.plugins.datalabels = { display: false };
    // Zoom/pan is the "other technique" a dense chart switches to instead of
    // packing ever more points into the same pixels. Gated behind Ctrl/⌘ for the
    // wheel so ordinary page scrolling over a chart still scrolls the page
    // (V4 shipped unconditional wheel-zoom and the user reported it as "all over
    // the place, very sensitive" — see REVAMP.md p138).
    if (cfg.options.plugins.zoom === undefined && window.Chart && window.Chart.registry) {
      cfg.options.plugins.zoom = {
        zoom: { wheel: { enabled: true, modifierKey: 'ctrl', speed: 0.06 }, pinch: { enabled: true }, mode: 'x' },
        pan: { enabled: true, mode: 'x' },
      };
    }
    return new window.Chart(ctx, cfg);
  }
  registerPanelV5({
    id: 'progress-chart', title: 'Progress vs plan', estHeight: 340, deps: ['unit', 'scope', 'search', 'asOf'],
    subtitle: () => STATE.scope === 'batch'
      ? 'batch total · Plan and Target are 28-SP totals'
      : 'per SP · Plan and Target scaled to one SP for comparison',
    toolbar(bar) {
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.progressLevel === 'level' ? ' on' : ''), onclick: () => { STATE.progressLevel = 'level'; updatePanel('progress-chart'); refreshToolbarSel(bar); } }, ['Level']));
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.progressLevel === 'gap' ? ' on' : ''), onclick: () => { STATE.progressLevel = 'gap'; updatePanel('progress-chart'); refreshToolbarSel(bar); } }, ['Gap']));
      function refreshToolbarSel(b) { $$('.v5-chip', b).forEach(c => c.classList.toggle('on', c.textContent === (STATE.progressLevel === 'level' ? 'Level' : 'Gap'))); }
    },
    mount(container, model) {
      const nSeries = STATE.scope === 'batch' ? 3 : scopedStudents().length;
      const hgt = chartHeight(nSeries, { base: 300, perSeries: 5, max: 560 });
      container.appendChild(el('div', { class: 'v5-chartbox', style: 'height:' + hgt + 'px' }, [el('canvas', { id: 'd127v5-progress-chart' })]));
      container.appendChild(el('div', { class: 'v5-charthint' }, ['Ctrl/⌘ + scroll to zoom · drag to pan · ', el('button', { class: 'v5-chip', onclick: () => { const c = CHARTS['progress-chart']; if (c && c.resetZoom) { c.resetZoom(); } } }, ['⟳ Reset zoom'])]));
      this.update(null, model);
      return {};
    },
    update(_h, model) {
      // Re-height the box every update, not just at first mount — scope/search
      // change how many series are drawn, and a box sized for 3 lines stayed
      // that size after switching to 28, cramming them instead of growing.
      const canvas = $('#d127v5-progress-chart');
      if (canvas) {
        const nSeries = STATE.scope === 'batch' ? 3 : scopedStudents().length;
        canvas.parentElement.style.height = chartHeight(nSeries, { base: 300, perSeries: 5, max: 560 }) + 'px';
      }
      CHARTS['progress-chart'] = mkChart('d127v5-progress-chart', progressChartCfg(model));
    },
    destroy() { if (CHARTS['progress-chart']) { CHARTS['progress-chart'].destroy(); delete CHARTS['progress-chart']; } },
  });
  // Standalone chart-config builder — used by the live panel's update() above
  // AND by the report sheet (buildReportSheet), so the report can render this
  // chart even when the Trend section isn't the one currently mounted (its
  // canvas/Chart.js instance only exists while that section is on screen;
  // the report must be complete regardless of which section the user is on).
  function progressChartCfg(model, ov) {
    ov = ov || {};
    // Optional overrides let a caller (the report's dedicated Lead/Lag chart,
    // below) force per-SP/gap mode over ALL students regardless of whatever
    // the live command bar currently has selected — the live panel itself
    // still just calls this with no overrides, reading STATE as before.
    const level = ov.level || STATE.progressLevel;
    const scopeMode = ov.scope || STATE.scope;
    const isHrs = STATE.unit === 'hours';
    const s = isHrs ? model.series.hours : model.series.lessons;
    // Batch aggregate only when scope is 'batch'. 'sp' (one student) previously
    // fell into the batch branch and drew the 28-SP aggregate line — so picking
    // a single SP showed everything BUT that SP's own progress.
    const aggregate = scopeMode === 'batch';
    // Plan/Target come out of the model as BATCH totals (each lesson's planned
    // value × 28 SP). Against per-student actual lines those references sit ~28x
    // too high, which is what made the per-SP view unreadable. Divide by the
    // student count so a per-SP line is compared against a per-SP plan/target.
    const n = Math.max(1, model.batch.n);
    const refDiv = aggregate ? 1 : n;
    const scaleSeries = arr => refDiv === 1 ? arr : arr.map(p => ({ x: p.x, y: +(p.y / refDiv).toFixed(2) }));
    const refSuffix = aggregate ? '' : ' / SP';
    const datasets = [];
    if (level === 'level') {
      // Plan is drawn all the way to the curriculum's finish date (model.js's
      // planFull), not clipped to today/asOf — the reference schedule itself
      // doesn't depend on how far the batch has actually gotten.
      datasets.push({ label: 'Plan' + refSuffix, data: scaleSeries(s.planFull), borderColor: '#cbd5e1', borderDash: [6, 4], borderWidth: 1.4, pointRadius: 0, tension: 0, order: 3 });
      const targetSeries = isHrs ? model.series.target.hours : model.series.target.lessons;
      if (targetSeries.length) datasets.push({ label: 'Revised-target' + refSuffix, data: scaleSeries(targetSeries), borderColor: '#f43f5e', borderDash: [5, 2], borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#f43f5e', tension: 0, order: 1.5 });
      if (aggregate) {
        datasets.push({ label: 'Actual', data: s.actual, borderColor: '#e88aff', borderWidth: 2.4, pointRadius: 0, tension: 0, order: 1 });
      } else {
        const list = ov.students || scopedStudents();
        const solo = list.length === 1;
        list.forEach(sp => {
          const flown = sp.flown.slice().sort((a, b) => a.date.localeCompare(b.date));
          let acc = 0;
          const data = flown.map(f => ({ x: f.date, y: +(acc += (isHrs ? f.effMins / 60 : 1)).toFixed(2) }));
          datasets.push({ label: sp.shortName, data, borderColor: solo ? '#e88aff' : `hsla(${sp.hue},85%,62%,0.85)`, borderWidth: solo ? 2.4 : 1.2, pointRadius: 0, tension: 0, order: 2 });
        });
      }
    } else {
      datasets.push({ label: 'Zero', data: s.lag.map(p => ({ x: p.x, y: 0 })), borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, pointRadius: 0, order: 5 });
      if (aggregate) {
        datasets.push({ label: 'Batch lag', data: s.lag, borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, tension: .12, fill: { target: { value: 0 }, above: 'rgba(239,68,68,0.14)' }, order: 1 });
      } else {
        // Per-SP gap uses the PER-SP plan (planByDate is per-lesson minutes, not
        // ×n), so this branch was already per-student — kept as-is.
        const plannedByDate = model.curriculum.planByDate;
        const list = ov.students || scopedStudents();
        const solo = list.length === 1;
        list.forEach(sp => {
          let ra = 0, rp = 0; const dates = [...new Set([...sp.flown.map(f => f.date), ...Object.keys(plannedByDate)])].filter(d => d <= model.asOf).sort();
          const data = dates.map(d => {
            ra += (sp.flownByDate[d] || []).reduce((a, f) => a + (isHrs ? f.effMins / 60 : 1), 0);
            rp += isHrs ? (plannedByDate[d] || 0) / 60 : (model.curriculum.planLessonCountByDate[d] || 0);
            return { x: d, y: +(rp - ra).toFixed(2) };
          });
          datasets.push({ label: sp.shortName, data, borderColor: solo ? '#ef4444' : `hsla(${sp.hue},85%,62%,0.85)`, borderWidth: solo ? 2.4 : 1.2, pointRadius: 0, tension: 0, order: 2 });
        });
      }
    }
    return {
      type: 'line', data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false, parsing: { xAxisKey: 'x', yAxisKey: 'y' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: datasets.length <= 9, labels: { color: '#8b949e', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 14, filter: it => it.text !== 'Zero' } },
          tooltip: { callbacks: { title: c => { const r = c[0] && c[0].raw; return r ? fd(r.x) : ''; }, label: c => c.dataset.label === 'Zero' ? null : `${c.dataset.label}: ${fUnit(c.raw.y, STATE.unit)}` } },
        },
        scales: {
          x: { type: 'time', time: { unit: 'month', displayFormats: { day: 'd MMM', week: 'd MMM', month: 'MMM yy' } }, ticks: { font: { family: 'JetBrains Mono', size: 8 }, color: '#6e7681', maxTicksLimit: 12 }, grid: { color: '#21262d' } },
          y: { beginAtZero: level === 'gap', ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#8b949e' }, grid: { color: '#21262d' } },
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Output (Daily Output, day/week/month + type breakdown)
  // ─────────────────────────────────────────────────────────────────────────
  registerPanelV5({
    id: 'output', title: 'Output', estHeight: 300, deps: ['unit', 'range', 'asOf'],
    subtitle: () => 'lessons & hours per period, target overlay on the latest closed period',
    toolbar(bar) {
      ['day', 'week', 'month'].forEach(p => bar.appendChild(el('button', { class: 'v5-chip' + (STATE.lbPeriod === p ? ' on' : ''), onclick: () => { STATE.lbPeriod = p; updatePanel('output'); } }, [p[0].toUpperCase() + p.slice(1)])));
      bar.appendChild(el('span', { class: 'v5-sep' }));
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.lbBreakdown ? ' on' : ''), onclick: () => { STATE.lbBreakdown = !STATE.lbBreakdown; updatePanel('output'); } }, ['By type']));
    },
    mount(container, model) {
      container.appendChild(el('div', { class: 'v5-chartbox', style: 'height:' + chartHeight(3, { base: 280, perSeries: 0, max: 340 }) + 'px' }, [el('canvas', { id: 'd127v5-output' })]));
      container.appendChild(el('div', { id: 'd127v5-output-gap', class: 'v5-charthint' }));
      container.appendChild(el('div', { class: 'v5-charthint' }, ['Ctrl/⌘ + scroll to zoom · drag to pan · ', el('button', { class: 'v5-chip', onclick: () => { const c = CHARTS.output; if (c && c.resetZoom) c.resetZoom(); } }, ['⟳ Reset zoom'])]));
      this.update(null, model);
      return {};
    },
    update(_h, model) {
      CHARTS.output = mkChart('d127v5-output', outputChartCfg(model));
      const hint = $('#d127v5-output-gap');
      if (hint) {
        const g = outputRequiredInfo(model);
        hint.textContent = g ? `Required ${fUnit(g.req, STATE.unit)}/period · Actual ${fUnit(g.actual, STATE.unit)} · Gap ${signed(g.gap, v => fUnit(v, STATE.unit))} vs latest closed period` : '';
      }
    },
    destroy() { if (CHARTS.output) { CHARTS.output.destroy(); delete CHARTS.output; } },
  });
  // Required-pace figure for the latest CLOSED period — shared by the chart
  // (dashed reference line) and the panel's plain-text gap readout below it,
  // so the two can never disagree.
  // Picks the required figure matching the current period+unit out of any
  // buildPace-shaped object (model.pace, or a requiredAt(date) snapshot).
  function reqForPeriod(p) {
    if (!p) return null;
    const h = STATE.lbPeriod === 'day' ? p.reqDayHrsB : STATE.lbPeriod === 'week' ? p.reqWeekHrsB : p.reqMonthHrsB;
    const l = STATE.lbPeriod === 'day' ? p.reqDayLesB : STATE.lbPeriod === 'week' ? p.reqWeekLesB : p.reqMonthLesB;
    const v = STATE.unit === 'hours' ? h : l;
    return v == null ? null : v;
  }
  function outputRequiredInfo(model) {
    const out = model.output({ unit: STATE.unit, period: STATE.lbPeriod, showAll: STATE.lbShowAll, start: rangeStart(), end: model.asOf });
    if (out.gapIdx < 0) return null;
    // Required AT THAT PERIOD, not today's figure — the gap readout compares
    // the latest closed period's output against what was required back then.
    const req = reqForPeriod(model.requiredAt(out.keys[out.gapIdx]));
    if (req == null) return null;
    const actual = out.values[out.gapIdx];
    return { req, actual, gap: +(actual - req).toFixed(2), gapIdx: out.gapIdx, keys: out.keys, at: out.keys[out.gapIdx] };
  }
  // Standalone chart-config builder — same reasoning as progressChartCfg()
  // above: shared by the live panel and the report sheet so a chart embeds in
  // the exported/printed report regardless of which section is on screen.
  function outputChartCfg(model) {
    const out = model.output({ unit: STATE.unit, period: STATE.lbPeriod, showAll: STATE.lbShowAll, start: rangeStart(), end: model.asOf });
    const labels = out.keys.map(k => STATE.lbPeriod === 'day' ? fdShort(k) : STATE.lbPeriod === 'week' ? 'Wk ' + fdShort(k) : new Date(k + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
    let datasets;
    if (STATE.lbBreakdown) {
      const tc = model.typeColors;
      datasets = ['Dual', 'Solo', 'Simulator'].map(t => ({ label: t, data: out.stacks.map(s => +s[t].toFixed(2)), backgroundColor: tc[t], stack: 's', borderRadius: 2 }));
    } else {
      datasets = [{ label: STATE.unit === 'hours' ? 'Hours' : 'Lessons', data: out.values, backgroundColor: '#e88aff', borderRadius: 2, stack: 's' }];
    }
    // ── Line overlays MUST each carry their own `stack` group. ──────────────
    // This y-axis is `stacked:true` (the Dual/Solo/Simulator bars need it), and
    // Chart.js stacks a dataset with no explicit `stack` into a group keyed by
    // its TYPE — so both line overlays defaulted into one shared 'line' group
    // and the Moving avg was silently drawn at (ma + Required), floating well
    // above its real value. Measured live before the fix: raw ma 10.21h
    // rendered at y=56.04, exactly ma + Required(45.83); after giving each line
    // its own group, the same point renders at 10.21. The bars were never
    // affected — they're in their own 's' group.
    //
    // This is ALSO the true root cause of the "moving avg glitch" reported
    // against p174: back then Required was null everywhere except one index, so
    // it lifted the average at exactly that one point — the "spike". p175's
    // comment here blamed an optical overlap of a floating dot; that was wrong,
    // and turning Required into a full-width line made the same bug continuous
    // instead of fixing it. Corrected in p176.
    datasets.push({ type: 'line', label: 'Moving avg', data: out.ma, borderColor: '#38bdf8', borderWidth: 1.6, pointRadius: 0, tension: .2, order: -1, stack: 'ovl-ma' });
    // Required pace is drawn as the MOVING TARGET it actually is: each period
    // shows the rate that was required as of that period, computed from the
    // work outstanding then and the days that remained. A flat line stamped
    // with today's single figure implied the requirement had always been that
    // high, which is wrong — it climbs as the batch falls behind.
    const reqSeries = out.keys.map(k => {
      const v = reqForPeriod(model.requiredAt(k));
      return v == null ? null : +v.toFixed(2);
    });
    if (reqSeries.some(v => v != null)) {
      datasets.push({ type: 'line', label: 'Required (at that time)', data: reqSeries, borderColor: '#f43f5e', borderDash: [7, 4], borderWidth: 1.6, pointRadius: 0, tension: 0, order: -2, spanGaps: false, stack: 'ovl-req' });
    }
    return {
      type: 'bar', data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: '#8b949e', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: c => c.parsed.y == null ? null : `${c.dataset.label}: ${fUnit(c.parsed.y, STATE.unit)}` } } },
        scales: { x: { stacked: true, ticks: { font: { family: 'JetBrains Mono', size: 8 }, color: '#6e7681', maxTicksLimit: 14 }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#8b949e' }, grid: { color: '#21262d' } } },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Streaks
  // ─────────────────────────────────────────────────────────────────────────
  registerPanelV5({
    id: 'streaks', title: 'Streaks', estHeight: 260, deps: ['scope', 'search', 'asOf'],
    subtitle: () => '+days flying · −days idle',
    mount(container, model) {
      container.appendChild(el('div', { class: 'v5-panel-note', style: 'font-size:10px;color:var(--v5-tx3);margin-bottom:6px' }, ['Walked from the batch’s earliest flown date, not each SP’s own start — a late starter reads idle for every day before they began.']));
      container.appendChild(el('div', { class: 'v5-chartbox', style: 'height:' + chartHeight(scopedStudents().length, { base: 260, perSeries: 6, max: 520 }) + 'px' }, [el('canvas', { id: 'd127v5-streaks' })]));
      container.appendChild(el('div', { class: 'v5-charthint' }, ['Ctrl/⌘ + scroll to zoom · drag to pan · ', el('button', { class: 'v5-chip', onclick: () => { const c = CHARTS.streaks; if (c && c.resetZoom) c.resetZoom(); } }, ['⟳ Reset zoom'])]));
      this.update(null, model);
      return {};
    },
    update(_h, model) {
      const s = model.streaks();
      const datasets = [{ label: 'Zero', data: s.days.map(d => ({ x: d, y: 0 })), borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, pointRadius: 0, order: 0 }];
      const spotlight = STATE.scope === 'sp' ? String(STATE.spotlightId) : null;
      s.perSP.forEach(p => {
        const visible = !spotlight || String(p.sp.catc_id) === spotlight;
        datasets.push({ label: p.sp.shortName, data: p.series, borderColor: `hsla(${p.sp.hue},85%,62%,0.8)`, borderWidth: visible ? 1.2 : 0, pointRadius: 0, hidden: !visible, order: 1 });
      });
      datasets.push({ label: 'Batch avg', data: s.avg, borderColor: '#e88aff', borderWidth: 3, pointRadius: 0, tension: .1, order: 2 });
      CHARTS.streaks = mkChart('d127v5-streaks', {
        type: 'line', data: { datasets },
        options: { responsive: true, maintainAspectRatio: false, parsing: { xAxisKey: 'x', yAxisKey: 'y' }, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => { const r = c[0] && c[0].raw; return r ? fd(r.x) : ''; }, label: c => c.dataset.label === 'Zero' ? null : `${c.dataset.label}: ${c.raw.y > 0 ? '+' + c.raw.y + 'd flying' : c.raw.y + 'd idle'}` } } },
          scales: { x: { type: 'time', time: { unit: 'month' }, ticks: { font: { family: 'JetBrains Mono', size: 8 }, color: '#6e7681', maxTicksLimit: 10 }, grid: { color: '#21262d' } },
            y: { ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#8b949e' }, grid: { color: '#21262d' } } } },
      });
    },
    destroy() { if (CHARTS.streaks) { CHARTS.streaks.destroy(); delete CHARTS.streaks; } },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Roster table (People)
  // ─────────────────────────────────────────────────────────────────────────
  const COL_DEFS = {
    rank: { label: '#', render: (s, i) => String(i + 1) },
    name: { label: 'Name', render: s => s.shortName },
    nick: { label: 'Call sign', render: s => s.nick || '—', sortKey: 'nick' },
    se: { label: 'SE type', render: s => s.se || '—', sortKey: 'se' },
    fi: { label: 'FI', render: s => s.fiFull || '—', sortKey: 'fi' },
    progress: { label: 'Progress', render: s => `<span class="v5-bar"><i style="width:${s.pct}%"></i></span> <span class="v5-mono" style="font-size:9px">${s.pct.toFixed(0)}%</span>`, sortKey: 'ahead' },
    hours: { label: 'Hrs', render: s => s.hoursEffective.toFixed(1), sortKey: 'hours' },
    lessons: { label: 'Les', render: s => String(s.lessonsCompleted), sortKey: 'donelessons' },
    lastLesson: { label: 'Last lesson', render: s => (s.lastFlight ? s.lastFlight.lesson : s.nextLesson), sortKey: 'lastLesson' },
    lastFlt: { label: 'Last flt', render: s => fdShort(s.lastDate), sortKey: 'lastFlt' },
    idle: { label: 'Idle', render: s => s.idleDays == null ? '—' : s.idleDays + 'd', sortKey: 'idle' },
    dayDelta: { label: 'Day Δ', render: s => s.dayDelta == null ? '—' : signed(s.dayDelta, v => v + 'd'), sortKey: 'dayDelta' },
    hrsDelta: { label: 'Hrs Δ', render: s => signed(s.hrsDelta, fH), sortKey: 'hrsDelta' },
    vsTarget: { label: 'vs target', render: s => s.vsTarget == null ? '—' : signed(s.vsTarget, v => v + '') , sortKey: 'vsTarget' },
  };
  registerPanelV5({
    id: 'roster', title: 'Roster', estHeight: 420, deps: ['scope', 'search', 'asOf', 'sortKey'],
    subtitle: m => scopedStudents().length + ' SP shown',
    toolbar(bar) {
      const sel = el('select', { class: 'v5-search', style: 'width:150px', onchange: e => { STATE.sortKey = e.target.value; updatePanel('roster'); } });
      Object.entries(Model.SORT_LABELS).forEach(([k, l]) => sel.appendChild(el('option', { value: k, selected: k === STATE.sortKey ? 'selected' : undefined }, [l])));
      bar.appendChild(sel);
    },
    mount(container, model) {
      const wrap = el('div', { class: 'v5-table-wrap' });
      const table = el('table', { class: 'v5-table' });
      const thead = el('thead', {}, [el('tr', {}, layoutCfg.current.columns.map(c => {
        const def = COL_DEFS[c]; if (!def) return null;
        if (!def.sortKey) return el('th', {}, [def.label]);
        const sort = () => { STATE.sortKey = def.sortKey; updatePanel('roster'); };
        // Keyboard-operable + screen-reader-legible sort headers, matching
        // V4's own accessibility fix (p149) for the same pattern.
        return el('th', {
          onclick: sort, tabindex: '0', role: 'button',
          'aria-sort': STATE.sortKey === def.sortKey ? 'descending' : 'none',
          onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); } },
        }, [def.label]);
      }).filter(Boolean))]);
      table.appendChild(thead);
      const tbody = el('tbody', {});
      table.appendChild(tbody);
      wrap.appendChild(table);
      container.appendChild(wrap);
      this._renderRows(tbody, model);
      return { tbody };
    },
    _renderRows(tbody, model) {
      let rows = Model.sortStudents(scopedStudents(), STATE.sortKey);
      tbody.innerHTML = '';
      if (!rows.length) { tbody.appendChild(el('tr', {}, [el('td', { colSpan: layoutCfg.current.columns.length }, [el('div', { class: 'v5-empty' }, ['No matches'])])])); return; }
      const n = rows.length;
      const sumHrs = rows.reduce((a, s) => a + s.hoursEffective, 0);
      const sumLes = rows.reduce((a, s) => a + s.lessonsCompleted, 0);
      const totRow = el('tr', { class: 'v5-total-row' }, layoutCfg.current.columns.map(c => {
        if (c === 'name') return el('td', {}, [`AP127 · ${n} SP`]);
        if (c === 'hours') return el('td', {}, [sumHrs.toFixed(1)]);
        if (c === 'lessons') return el('td', {}, [String(sumLes)]);
        return el('td', {}, ['']);
      }));
      tbody.appendChild(totRow);
      rows.forEach((s, i) => {
        const tr = el('tr', { onclick: () => openSPDrawer(s.catc_id) });
        layoutCfg.current.columns.forEach(c => { const def = COL_DEFS[c]; if (!def) return; tr.appendChild(el('td', { html: def.render(s, i) })); });
        tbody.appendChild(tr);
      });
    },
    update(hnd, model) { this._renderRows(hnd.tbody, model); },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Pace Distribution
  // ─────────────────────────────────────────────────────────────────────────
  registerPanelV5({
    id: 'distribution', title: 'Distribution', estHeight: 260, deps: ['asOf'],
    subtitle: m => m.distribution ? `median ${m.distribution.median} · IQR ${m.distribution.q1}–${m.distribution.q3}` : '',
    mount(container, model) {
      container.appendChild(el('div', { class: 'v5-chartbox', style: 'height:' + chartHeight(1, { base: 240, max: 300 }) + 'px' }, [el('canvas', { id: 'd127v5-distribution' })]));
      this.update(null, model);
      return {};
    },
    update(_h, model) {
      const d = model.distribution; if (!d) return;
      const labels = d.bins.map(b => b.lo === b.hi ? String(b.lo) : `${b.lo}–${b.hi}`);
      const colors = d.bins.map(b => { const mid = (b.lo + b.hi) / 2, frac = (mid - d.min) / Math.max(1, d.max - d.min); return frac >= .66 ? '#7be9b8' : frac >= .33 ? '#ffd67a' : '#ffa0a0'; });
      const avgLinePlugin = {
        id: 'v5avg', afterDatasetsDraw(chart) {
          const { ctx, scales: { x, y } } = chart;
          const catW = d.bins.length > 1 ? (x.getPixelForValue(1) - x.getPixelForValue(0)) : (x.right - x.left);
          const px = x.getPixelForValue(d.avgBinIdx) - catW / 2 + d.avgFrac * catW;
          ctx.save(); ctx.strokeStyle = '#e88aff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(px, y.top); ctx.lineTo(px, y.bottom); ctx.stroke();
          ctx.setLineDash([]); ctx.fillStyle = '#e88aff'; ctx.font = '700 8px JetBrains Mono, monospace'; ctx.textAlign = 'center';
          ctx.fillText('AVG ' + d.avg.toFixed(1), px, Math.max(y.top - 4, 8)); ctx.restore();
        },
      };
      CHARTS.distribution = mkChart('d127v5-distribution', {
        type: 'bar', data: { labels, datasets: [
          { type: 'bar', label: 'Students', data: d.counts, backgroundColor: colors, borderRadius: 3, order: 2 },
          { type: 'line', label: 'Curve', data: d.curve, borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0, tension: .4, order: 1 },
        ] },
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 12 } },
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { font: { family: 'JetBrains Mono', size: 8 }, color: '#6e7681' }, grid: { display: false } }, y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'JetBrains Mono', size: 9 }, color: '#8b949e' }, grid: { color: '#21262d' } } } },
        plugins: [avgLinePlugin],
      });
    },
    destroy() { if (CHARTS.distribution) { CHARTS.distribution.destroy(); delete CHARTS.distribution; } },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Shared roster-grid helpers — the "modern roster style" borrowed from
  // Aircraft Status' SP Stat / FI Stat tab (js/view-aircraft.js:1163): a real
  // table with separated rounded cells, intensity fill, sticky identity +
  // total columns, Monday/month rules and a today outline. Both the Syllabus
  // and Calendar grids are built from these so they read as one component.
  // ─────────────────────────────────────────────────────────────────────────
  function mixColor(hex, pct) {
    // Plain rgba mix against transparent — deliberately NOT color-mix(in oklch),
    // which html2canvas can't parse (that's what broke V4's PDF export of its
    // heatmaps and forced a text-table fallback).
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${(pct / 100).toFixed(3)})`;
  }
  function rosterLegend(items) {
    const wrap = el('div', { class: 'v5-rt-legend' });
    items.forEach(it => {
      if (it.sep) { wrap.appendChild(el('span', { style: 'width:1px;height:11px;background:var(--v5-bd)' })); return; }
      wrap.appendChild(el('span', { title: it.title || '' }, [
        el('i', { class: 'v5-rt-swatch', style: 'background:' + it.color + (it.dash ? ';background:none;border-top:1px dashed ' + it.color + ';height:0;border-radius:0' : '') }),
        it.label,
      ]));
    });
    return wrap;
  }

  // ── Lesson / phase / milestone detail modals (restored from V4) ────────────
  function openDetailModal(title, sub, blocks) {
    $$('.v5-sp-draw-ov').forEach(n => n.remove());
    const ov = el('div', { class: 'v5-sp-draw-ov show', onclick: e => { if (e.target === ov) closeSPDrawer(); } });
    const draw = el('div', { class: 'v5-sp-draw', onclick: e => e.stopPropagation() });
    draw.appendChild(el('div', { class: 'v5-sp-draw-hd' }, [
      el('div', {}, [el('div', { class: 'v5-sp-name' }, [title]), el('div', { class: 'v5-sp-meta' }, [sub || ''])]),
      el('button', { class: 'v5-btn', onclick: closeSPDrawer }, ['Close']),
    ]));
    const body = el('div', { style: 'padding:4px 18px 20px' });
    blocks.forEach(b => {
      if (!b) return;
      if (b.heading) body.appendChild(el('div', { class: 'v5-mono', style: 'font-size:9px;color:var(--v5-acc);text-transform:uppercase;letter-spacing:1px;margin:14px 0 5px' }, [b.heading]));
      if (b.text) body.appendChild(el('div', { style: 'font-size:12.5px;line-height:1.65;color:var(--v5-tx2)' }, [b.text]));
      if (b.rows) b.rows.forEach(r => body.appendChild(el('div', { class: 'v5-sp-log-row' }, [
        el('span', { style: 'width:120px;color:var(--v5-tx3)' }, [r[0]]),
        el('span', { style: 'flex:1;color:var(--v5-tx)' }, [String(r[1])]),
      ])));
    });
    draw.appendChild(body);
    ov.appendChild(draw);
    document.body.appendChild(ov);
    document.addEventListener('keydown', escCloseSPDrawer);
  }
  function openPhaseModal(seg, model) {
    const ph = model.phasesDef[seg.phaseIdx] || {};
    const lessons = model.curriculum.lessons.filter(l => l.num >= seg.lo && l.num <= seg.hi);
    const hrs = lessons.reduce((a, l) => a + l.plannedMins, 0) / 60;
    const kps = model.keyPoints.filter(k => k.num >= seg.lo && k.num <= seg.hi);
    openDetailModal(seg.title, `Lessons ${seg.lo}–${seg.hi} · ${lessons.length} lessons · ${hrs.toFixed(0)}h`, [
      ph.blurb ? { text: ph.blurb } : null,
      ph.objective ? { heading: 'Objective', text: ph.objective } : null,
      ph.standard ? { heading: 'Completion standard', text: ph.standard } : null,
      kps.length ? { heading: 'Milestones in this phase', rows: kps.map(k => ['L' + k.num, k.label]) } : null,
      { heading: 'Lessons', rows: lessons.map(l => ['L' + l.num + ' · ' + l.lesson, (l.plannedMins ? l.plannedMins + ' min' : '—') + (l.plannedDate ? ' · planned ' + fdShort(l.plannedDate) : '')]) },
    ]);
  }
  function openMilestoneModal(kp, model) {
    const meta = Model.milestoneMeta(kp.label);
    const l = model.curriculum.byNum[kp.num];
    const doneBy = model.students.filter(s => s.flownByNum[kp.num]).length;
    openDetailModal(kp.label, 'Lesson ' + kp.num + (l ? ' · ' + l.lesson : ''), [
      meta.explain ? { text: meta.explain } : null,
      { heading: 'Status', rows: [
        ['Completed by', `${doneBy} of ${model.batch.n} SP`],
        ['Phase', l ? l.phase.title : '—'],
        ['Standard duration', l && l.plannedMins ? l.plannedMins + ' min' : '—'],
        ['Planned date', l && l.plannedDate ? fd(l.plannedDate) : 'TBC'],
      ] },
    ]);
  }
  // ─────────────────────────────────────────────────────────────────────────
  // OPS ⇄ PROG record linkage
  //
  // Progress (PROG) says a lesson was completed; Operations (OPS) holds the
  // actual booking — time, tail, instructor, block times, status, cancel
  // reason. Clicking a Syllabus or Calendar cell shows BOTH, plus an explicit
  // agreement check, rather than silently presenting one as the truth.
  //
  // Source is `window.FLIGHTS` — the shared, alias-normalised, DE-DUPLICATED
  // array every Ops view reads — deliberately NOT the raw
  // `FLIGHT_DATA.flights` that opsAugmentV5 walks: the raw feed still contains
  // the duplicate ACTUAL_ONLY rows p116 strips, which would show a flight
  // twice here. Matching reuses AP127Reconcile's own key helpers (the same
  // ones opsAugmentV5 uses) so this can't drift into a second, different
  // notion of "same student, same lesson".
  //
  // Measured against live data when built: of 972 PROG records across 28 SP,
  // 939 match an OPS row on student+lesson+date, 19 match on student+lesson
  // with a different date (known date drift), and 14 have no OPS row at all —
  // all 14 inside the OPS feed's own coverage window, so they are genuine
  // Progress-only records, not feed-window artefacts. The modal reports each
  // of those three cases distinctly instead of implying data is missing.
  let _opsIdx = null, _opsIdxSrc = null;
  function opsIndex() {
    const R = window.AP127Reconcile, F = window.FLIGHTS || [];
    if (_opsIdx && _opsIdxSrc === F) return _opsIdx;
    const byLesson = {}, byDate = {};
    let min = null, max = null, rows = 0;
    if (R) F.forEach(f => {
      if (!f.student || !R.isAP127(f.batch)) return;
      const k = R.ccNameNorm(f.student);
      rows++;
      if (f.date) {
        if (!min || f.date < min) min = f.date;
        if (!max || f.date > max) max = f.date;
        const m = byDate[k] || (byDate[k] = {});
        (m[f.date] || (m[f.date] = [])).push(f);
      }
      if (f.lesson) {
        const m = byLesson[k] || (byLesson[k] = {});
        const nl = R.normLesson(f.lesson);
        (m[nl] || (m[nl] = [])).push(f);
      }
    });
    _opsIdxSrc = F;
    return (_opsIdx = { byLesson, byDate, window: min ? { min, max } : null, rows, ok: !!R });
  }
  function spOpsKey(sp) { const R = window.AP127Reconcile; return R && sp ? R.ccKeyFromFull(sp.name) : null; }
  function opsForLesson(sp, lessonCode) {
    const R = window.AP127Reconcile, ix = opsIndex(), k = spOpsKey(sp);
    if (!R || !k || !lessonCode) return [];
    return ((ix.byLesson[k] || {})[R.normLesson(lessonCode)] || []).slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
  function opsForDate(sp, date) {
    const ix = opsIndex(), k = spOpsKey(sp);
    if (!k || !date) return [];
    return ((ix.byDate[k] || {})[date] || []).slice()
      .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  }
  // One OPS booking rendered as detail rows. Only fields the row actually
  // carries are shown — a cancelled booking has no block times, a planned one
  // has no actuals.
  function opsBookingRows(f) {
    const rows = [
      ['Status', f.status + (f.isStandby ? ' · STANDBY' : '')],
      ['Date', fd(f.date)],
      ['Scheduled', (f.start || '—') + (f.end ? '–' + f.end : '')],
      ['Duration', (f.durMin ? f.durMin + ' min' : '—') + (f.duration ? ' (' + f.duration + ')' : '')],
      ['Aircraft', (f.tail || '—') + (f.isSim ? ' · SIM' : '')],
      ['Instructor', f.instructor || '—'],
      ['Lesson code', f.lesson || '—'],
      // The Ops feed is inconsistent here — `type` carries an aircraft model on
      // some rows ("DA40TDI") and a Dual/Solo classification on others, with
      // `cond` sometimes holding the latter. Both are shown verbatim under a
      // label that doesn't claim which is which.
      ['Type / cond', [f.type, f.cond].filter(Boolean).join(' · ') || '—'],
    ];
    if (f.tkoff && f.tkoff !== '00:00') rows.push(['Block off/on', f.tkoff + '–' + (f.ldgTime || '—')]);
    if (f.to || f.ldg) rows.push(['T/O · LDG', (f.to || 0) + ' · ' + (f.ldg || 0) + (f.inst ? ' · INST ' + f.inst : '')]);
    if (f.airborne && f.airborne !== '00:00') rows.push(['Airborne', f.airborne]);
    if (f.cancelReason) rows.push(['Cancel reason', f.cancelReason]);
    if (f.cancelRemarks) rows.push(['Cancel remarks', f.cancelRemarks]);
    rows.push(['Ops record id', f.id || '—']);
    return rows;
  }
  // Blocks describing the OPS side of one PROG record (or of a whole day).
  // `progFlights` are the PROG entries being explained; `opsRows` the candidate
  // OPS bookings already narrowed by lesson or by date.
  function opsBlocksFor(progFlights, opsRows, opts) {
    const o = opts || {};
    const ix = opsIndex();
    const blocks = [];
    if (!ix.ok) return [{ heading: 'Operations record', text: 'Ops data is not loaded in this session, so no booking can be shown.' }];
    if (opsRows.length) {
      opsRows.forEach((f, i) => blocks.push({
        heading: 'Operations booking' + (opsRows.length > 1 ? ' ' + (i + 1) + ' of ' + opsRows.length : '') + ' · ' + f.status,
        rows: opsBookingRows(f),
      }));
    }
    // Agreement check between the two systems, stated explicitly.
    const prog = (progFlights || [])[0];
    const completed = opsRows.filter(f => f.status === 'Completed');
    if (prog) {
      if (!opsRows.length) {
        const inWindow = ix.window && prog.date >= ix.window.min && prog.date <= ix.window.max;
        blocks.push({
          heading: 'Operations record',
          text: inWindow
            ? `No Ops booking found for this lesson. ${fd(prog.date)} falls inside the Ops feed's coverage (${fd(ix.window.min)} – ${fd(ix.window.max)}), so this is a genuine Progress-only record, not a gap caused by the feed's rolling window — the same "true gap" category the Cross-Check ledger reports.`
            : `No Ops booking found. ${fd(prog.date)} lies outside the Ops feed's coverage (${ix.window ? fd(ix.window.min) + ' – ' + fd(ix.window.max) : 'unknown'}), which is a rolling window — older flights age out of it, so an absent booking here is expected rather than a discrepancy.`,
        });
      } else if (completed.length) {
        const m = completed.find(f => f.date === prog.date) || completed[0];
        const dateAgrees = m.date === prog.date;
        const progMin = Math.round(prog.effMins);
        const opsMin = m.durMin || 0;
        const dMin = opsMin ? progMin - opsMin : null;
        blocks.push({
          heading: 'PROG ⇄ OPS check',
          rows: [
            ['Date', dateAgrees ? 'agree · ' + fd(prog.date)
              : `differ · PROG ${fd(prog.date)} vs OPS ${fd(m.date)} (${Math.abs(Model.util.dateDiff(m.date, prog.date) || 0)}d apart)`],
            ['Credited hours', `${progMin} min (curriculum standard for this lesson)`],
            ['Ops logged', opsMin ? opsMin + ' min' : '—'],
            ['Difference', dMin == null ? '—' : (dMin === 0 ? 'none' : signed(dMin, v => v + ' min') + ' — PROG credits the standard lesson duration, OPS logs real block time; a difference here is expected, not an error')],
          ],
        });
      }
    } else if (opsRows.length && o.noProgNote) {
      blocks.push({ heading: 'Progress record', text: o.noProgNote });
    }
    return blocks;
  }

  // Calendar cell → everything that happened for this SP on this date, from
  // BOTH systems. OPS is listed whole (including Cancelled/Pending bookings,
  // which Progress never carries) so a blank-looking day can still explain
  // itself — "cancelled, weather" rather than just "no flight".
  function openDayCellModal(sp, date, model) {
    const prog = (sp.flownByDate[date] || []);
    const ops = opsForDate(sp, date);
    const ix = opsIndex();
    const hrs = prog.reduce((a, f) => a + f.effMins / 60, 0);
    const blocks = [];
    blocks.push({
      heading: 'Progress record',
      rows: prog.length
        ? prog.map(f => [f.lesson + (f.isRetake ? ' · retake' : ''), Math.round(f.effMins) + ' min' + (f.fromOps ? ' · backfilled from Ops' : '')])
        : [['—', 'No completed lesson recorded on this date']],
    });
    if (ops.length) {
      ops.forEach((f, i) => blocks.push({
        heading: 'Operations booking' + (ops.length > 1 ? ' ' + (i + 1) + ' of ' + ops.length : '') + ' · ' + f.status,
        rows: opsBookingRows(f),
      }));
    } else {
      const inWindow = ix.window && date >= ix.window.min && date <= ix.window.max;
      blocks.push({
        heading: 'Operations booking',
        text: !ix.ok ? 'Ops data is not loaded in this session.'
          : inWindow ? 'No Ops booking of any status for this SP on this date.'
          : `This date is outside the Ops feed's coverage (${ix.window ? fd(ix.window.min) + ' – ' + fd(ix.window.max) : 'unknown'}), which is a rolling window — no booking is expected here.`,
      });
    }
    // Cross-system agreement for the day as a whole.
    const opsCompleted = ops.filter(f => f.status === 'Completed');
    if (prog.length || opsCompleted.length) {
      const opsMin = opsCompleted.reduce((a, f) => a + (f.durMin || 0), 0);
      blocks.push({ heading: 'PROG ⇄ OPS check', rows: [
        ['PROG completed', prog.length + (prog.length === 1 ? ' lesson' : ' lessons') + ' · ' + Math.round(hrs * 60) + ' min credited'],
        ['OPS completed', opsCompleted.length + (opsCompleted.length === 1 ? ' booking' : ' bookings') + (opsMin ? ' · ' + opsMin + ' min logged' : '')],
        ['Counts', prog.length === opsCompleted.length ? 'agree'
          : `differ by ${Math.abs(prog.length - opsCompleted.length)} — ${prog.length > opsCompleted.length ? 'Progress has more' : 'Operations has more'}`],
      ] });
    }
    openDetailModal(`${sp.shortName} · ${fd(date)}`,
      prog.length ? `${prog.length} lesson${prog.length > 1 ? 's' : ''} · ${hrs.toFixed(2)}h credited` : (ops.length ? `${ops.length} Ops booking${ops.length > 1 ? 's' : ''} · no Progress record` : 'no activity'),
      blocks);
  }

  function openLessonCellModal(sp, num, model) {
    const l = model.curriculum.byNum[num];
    const flights = sp.flownByNum[num] || [];
    openDetailModal(`${sp.shortName} · Lesson ${num}`, (l ? l.lesson + ' · ' + l.phase.title : '') + (flights.length > 1 ? ' · retaken' : ''), [
      { heading: 'Lesson', rows: [
        ['Code', l ? l.lesson : '—'],
        ['Phase', l ? l.phase.title : '—'],
        ['Type', l ? l.type : '—'],
        ['Standard duration', l && l.plannedMins ? l.plannedMins + ' min' : '—'],
        ['Planned date', l && l.plannedDate ? fd(l.plannedDate) : 'TBC'],
      ] },
      flights.length
        ? { heading: flights.length > 1 ? `Flown ${flights.length}× (retake)` : 'Flown', rows: flights.map((f, i) => [fd(f.date), Math.round(f.effMins) + ' min' + (i > 0 ? ' · retake' : '') + (f.fromOps ? ' · from Ops' : '')]) }
        : { heading: 'Not yet flown', text: num === sp.nextNum ? 'This is this SP’s next lesson.' : 'Still ahead of this SP.' },
    ].concat(
      // The actual Ops booking(s) behind this lesson — every status, so a
      // cancelled or still-pending attempt at the same lesson shows up too.
      flights.length || l ? opsBlocksFor(flights, opsForLesson(sp, l ? l.lesson : null), {
        noProgNote: 'Operations has a booking for this lesson but Progress has not recorded it as completed.',
      }) : []
    ).concat([
      { heading: 'This SP', rows: [
        ['Lessons completed', `${sp.lessonsCompleted} / ${sp.total}`],
        ['Effective hours', sp.hoursEffective.toFixed(1) + 'h'],
        ['vs target', sp.vsTarget == null ? '—' : signed(sp.vsTarget, v => v + ' lessons')],
        ['ETC', sp.etcNever ? 'no measurable pace' : fd(sp.etcDate)],
      ] },
    ]));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Curriculum grid (Syllabus) — one roster-style view, no mode toggle
  // ─────────────────────────────────────────────────────────────────────────
  registerPanelV5({
    id: 'curriculum-grid', title: 'Curriculum grid', estHeight: 520, deps: ['asOf', 'scope', 'search'],
    subtitle: m => `${m.curriculum.count} lessons × ${scopedStudents().length} SP · click any cell, phase or milestone for detail`,
    mount(container, model) {
      const handle = { host: el('div', {}) };
      container.appendChild(handle.host);
      this._draw(handle, model);
      return handle;
    },
    _draw(handle, model) {
      const host = handle.host; host.innerHTML = '';
      const sps = Model.sortStudents(scopedStudents(), 'vsTarget');
      if (!sps.length) { host.appendChild(el('div', { class: 'v5-empty' }, ['No students in scope'])); return; }
      const count = model.curriculum.count || 96;
      // Identity column widths are declared ONCE here and reused for both the
      // width and the sticky `left` offset of every cell in those columns.
      // Hardcoding mismatched values is what made the phase header slide under
      // the identity block in the first attempt.
      const NW = SIZE.nameCol, VW = SIZE.vsCol, EW = SIZE.etcCol;
      const RESERVED = NW + VW + EW;
      const autoW = fitCell(count, availGridWidth(host, RESERVED));
      const CELL_W = GRID_ZOOM['curriculum-grid'] || autoW;
      host.appendChild(gridZoomBar('curriculum-grid', autoW, () => this._draw(handle, model)));
      const targets = model.targets.list;
      const targetByLesson = {}; targets.forEach(t => { targetByLesson[t.lesson] = t; });
      // "Current date" line on a LESSON axis = the interpolated target lesson
      // for today. This is the lesson number the batch is supposed to have
      // reached right now, so it's the meaningful "now" marker in this space.
      const nowLesson = model.batch.targetLessonToday == null ? null : Math.round(model.batch.targetLessonToday);
      const kpByNum = {}; model.keyPoints.forEach(k => { (kpByNum[k.num] = kpByNum[k.num] || []).push(k); });

      host.appendChild(rosterLegend([
        ...model.segmentsDef.map(s => ({ color: s.c, label: s.label, title: s.title })),
        { sep: true },
        { color: 'var(--v5-rose)', label: 'target checkpoint (date shown)' },
        { color: 'var(--v5-blue)', label: 'target for today (L' + (nowLesson == null ? '—' : nowLesson) + ')' },
        { color: 'var(--v5-bad)', dash: true, label: 'lag — behind today’s target' },
        { color: 'var(--v5-warn)', label: 'next lesson' },
      ]));

      const wrap = el('div', { class: 'v5-rt-wrap' });
      const table = el('table', { class: 'v5-rt' });

      // ── header: phase band, target dates, lesson numbers, milestones ──
      const thead = el('thead', {});
      const phaseRow = el('tr', {}, [
        el('th', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-hl' }, ['SP'])]),
        el('th', { class: 'v5-rt-tot v5-rt-c2' }, [el('span', { class: 'v5-rt-hl' }, ['vs tgt'])]),
        el('th', { class: 'v5-rt-tot v5-rt-c3' }, [el('span', { class: 'v5-rt-hl' }, ['ETC'])]),
      ]);
      model.segmentsDef.forEach(seg => {
        const lo = seg.lo, hi = Math.min(seg.hi, count);
        if (hi < lo) return;
        phaseRow.appendChild(el('th', { colspan: hi - lo + 1, title: seg.title + ' — click for full phase detail' }, [
          el('div', { class: 'v5-rt-phase', style: 'background:' + seg.c, onclick: () => openPhaseModal(seg, model) }, [seg.label]),
        ]));
      });
      thead.appendChild(phaseRow);

      // target checkpoint DATE row (vertical labels above their own column)
      const dateRow = el('tr', {}, [
        el('th', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-hl' }, ['target date →'])]),
        el('th', { class: 'v5-rt-tot v5-rt-c2' }), el('th', { class: 'v5-rt-tot v5-rt-c3' }),
      ]);
      for (let n = 1; n <= count; n++) {
        const t = targetByLesson[n];
        dateRow.appendChild(el('th', { style: `width:${CELL_W}px;height:46px` },
          t ? [el('div', { class: 'v5-rt-tgt-lbl', title: `AP127 target: every SP at lesson ${n} by ${fd(t.date)}` }, [fdShort(t.date)])] : []));
      }
      thead.appendChild(dateRow);

      // milestone icons + lesson numbers
      const kpRow = el('tr', {}, [
        el('th', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-hl' }, ['milestone →'])]),
        el('th', { class: 'v5-rt-tot v5-rt-c2' }), el('th', { class: 'v5-rt-tot v5-rt-c3' }),
      ]);
      const KP_ICON = { solo: '▲', instrument: '◉', xc: '◈', sim: '▣', me: '✦', check: '✓', other: '•' };
      for (let n = 1; n <= count; n++) {
        const kps = kpByNum[n];
        kpRow.appendChild(el('th', { style: `width:${CELL_W}px` },
          kps ? [el('div', { class: 'v5-rt-kp', title: kps.map(k => k.label).join(' · ') + ' — click for detail', onclick: () => openMilestoneModal(kps[0], model) }, [KP_ICON[Model.milestoneMeta(kps[0].label).key] || '•'])] : []));
      }
      thead.appendChild(kpRow);

      const numRow = el('tr', {}, [
        el('th', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-hl' }, ['lesson →'])]),
        el('th', { class: 'v5-rt-tot v5-rt-c2' }), el('th', { class: 'v5-rt-tot v5-rt-c3' }),
      ]);
      for (let n = 1; n <= count; n++) {
        // Every 10th only (+ first/last/today). At 13px per column a 2-digit
        // label every 5 lessons physically overlaps its neighbour; the target
        // columns are already identified by the date row above, so they don't
        // need to force a number here too.
        const show = n === 1 || n === count || n % 10 === 0 || n === nowLesson;
        const cls = (targetByLesson[n] ? ' v5-rt-tgt' : '') + (n === nowLesson ? ' v5-rt-nowcol' : '');
        numRow.appendChild(el('th', { class: cls.trim(), style: `width:${CELL_W}px`, title: 'Lesson ' + n },
          [el('div', { class: 'v5-rt-hl', style: n === nowLesson ? 'color:var(--v5-blue);font-weight:700' : '' }, [show ? String(n) : ''])]));
      }
      thead.appendChild(numRow);
      table.appendChild(thead);

      // ── body ──
      const tbody = el('tbody', {});
      sps.forEach(sp => {
        const vsCol = sp.vsTarget == null ? 'var(--v5-tx3)' : sp.vsTarget >= 0 ? 'var(--v5-good)' : 'var(--v5-rose)';
        const tr = el('tr', {}, [
          el('td', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-nm', title: sp.name + ' — click for full SP detail', onclick: () => openSPDrawer(sp.catc_id) }, [sp.shortName])]),
          el('td', { class: 'v5-rt-tot v5-rt-c2' }, [el('span', { style: 'font-size:9px;font-weight:700;color:' + vsCol }, [sp.vsTarget == null ? '—' : signed(sp.vsTarget, v => String(v))])]),
          el('td', { class: 'v5-rt-tot v5-rt-c3' }, [el('span', { style: 'font-size:8.5px;color:' + (sp.atRisk ? 'var(--v5-warn)' : 'var(--v5-good)') }, [sp.etcNever ? 'never' : fdShort(sp.etcDate)])]),
        ]);
        // Where this SP's own progress ends, and where today's target sits —
        // the cells between the two are this SP's visible lag.
        const done = sp.lessonsCompleted;
        for (let n = 1; n <= count; n++) {
          const flights = sp.flownByNum[n];
          const isNext = n === sp.nextNum;
          const inLag = nowLesson != null && n > done && n <= nowLesson;
          let bg = 'transparent', brd = '1px solid var(--v5-bd2)', label = '';
          if (flights) {
            const seg = Model.util.segmentOfNum(n);
            bg = mixColor(seg.c, flights.length > 1 ? 92 : 74);
            brd = '1px solid ' + mixColor(seg.c, 100);
            label = flights.length > 1 ? '↻' : '';
          } else if (isNext) {
            brd = '1px solid var(--v5-warn)';
            bg = mixColor('#f59e0b', 18);
          }
          const cls = ['v5-rt-cell'];
          if (targetByLesson[n]) cls.push('v5-rt-tgt');
          if (n === nowLesson) cls.push('v5-rt-nowcol');
          if (inLag && !flights) cls.push('v5-rt-idle');
          const title = flights
            ? `${sp.shortName} · L${n} · ${flights.map(f => fdShort(f.date)).join(', ')}${flights.length > 1 ? ' (retaken)' : ''} — click for detail`
            : isNext ? `${sp.shortName} · L${n} — next lesson`
            : inLag ? `${sp.shortName} · L${n} — behind today’s target (L${nowLesson})`
            : `${sp.shortName} · L${n} — not yet flown`;
          tr.appendChild(el('td', {
            class: cls.join(' '), title,
            style: `width:${CELL_W}px;height:20px;background:${bg};border:${brd};cursor:pointer`,
            onclick: () => openLessonCellModal(sp, n, model),
          }, [label ? el('span', { style: 'font-size:7px;color:#fff' }, [label]) : null]));
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      // ── footer: batch %-complete per lesson (the Phase Funnel, integrated) ──
      const tfoot = el('tfoot', {});
      const footRow = el('tr', { class: 'v5-rt-foot' }, [
        el('td', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-hl' }, ['BATCH %'])]),
        el('td', { class: 'v5-rt-tot v5-rt-c2' }), el('td', { class: 'v5-rt-tot v5-rt-c3' }),
      ]);
      for (let n = 1; n <= count; n++) {
        const doneCount = sps.filter(s => s.flownByNum[n]).length;
        const pct = sps.length ? doneCount / sps.length : 0;
        footRow.appendChild(el('td', {
          class: 'v5-rt-cell' + (targetByLesson[n] ? ' v5-rt-tgt' : ''),
          title: `Lesson ${n} · ${Math.round(pct * 100)}% of batch complete (${doneCount}/${sps.length})`,
          style: `width:${CELL_W}px;height:16px;background:${mixColor('#e88aff', 10 + pct * 80)}`,
        }));
      }
      tfoot.appendChild(footRow);
      table.appendChild(tfoot);

      // Explicit table width, computed from the same numbers used to size
      // every cell. Without this, `table-layout:auto` inside a `contain:layout`
      // panel (needed elsewhere for lazy-mount performance) compresses every
      // column far below its declared px width instead of letting the table
      // grow and the wrapper scroll — confirmed live: a 22px cell rendered at
      // 4.5px. An explicit table width is what actually forces the browser to
      // honour the per-cell widths and scroll horizontally instead of cramming.
      table.style.width = (NW + VW + EW + count * CELL_W + (count + 3) * 1) + 'px';
      wrap.appendChild(table);
      host.appendChild(wrap);

      // Phase completion summary strip (was V4's separate Phase Progress Funnel)
      const funnel = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;margin-top:10px' });
      model.phases.forEach(p => {
        funnel.appendChild(el('div', { style: 'background:var(--v5-s2);border-radius:6px;padding:7px 9px;cursor:pointer', title: p.phase.title, onclick: () => openPhaseModal(model.segmentsDef.find(s => s.phaseIdx === model.phasesDef.indexOf(p.phase)) || model.segmentsDef[0], model) }, [
          el('div', { class: 'v5-mono', style: 'font-size:9px;color:' + p.phase.c + ';text-transform:uppercase' }, [p.phase.label]),
          el('div', { class: 'v5-mono', style: 'font-size:14px;font-weight:700;margin-top:2px' }, [Math.round(p.pct * 100) + '%']),
          el('div', { class: 'v5-mono', style: 'font-size:8.5px;color:var(--v5-tx3)' }, [`${p.done} / ${p.slots} slots`]),
          el('div', { style: 'height:4px;border-radius:99px;background:var(--v5-bd);margin-top:4px;overflow:hidden' }, [
            el('i', { style: `display:block;height:100%;width:${(p.pct * 100).toFixed(1)}%;background:${p.phase.c}` }),
          ]),
        ]));
      });
      host.appendChild(funnel);
    },
    update(handle, model) { this._draw(handle, model); },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL: Activity calendar — roster style, daily totals, idle marking
  // ─────────────────────────────────────────────────────────────────────────
  registerPanelV5({
    id: 'activity-calendar', title: 'Activity calendar', estHeight: 520, deps: ['range', 'asOf', 'scope', 'search', 'unit'],
    subtitle: m => (STATE.range ? `Last ${STATE.range}d` : `All time · since ${fdShort(m.batchStart)}`) + ' · click a cell for detail',
    toolbar(bar) {
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.calGroupBy === 'none' ? ' on' : ''), onclick: () => { STATE.calGroupBy = 'none'; updatePanel('activity-calendar'); } }, ['No group']));
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.calGroupBy === 'instructor' ? ' on' : ''), onclick: () => { STATE.calGroupBy = 'instructor'; updatePanel('activity-calendar'); } }, ['By instructor']));
    },
    mount(container, model) {
      const handle = { host: el('div', {}) };
      container.appendChild(handle.host);
      this._draw(handle, model);
      return handle;
    },
    _draw(handle, model) {
      const host = handle.host; host.innerHTML = '';
      const sps = Model.sortStudents(scopedStudents(), 'name');
      const start = rangeStart(), end = model.asOf;
      const days = U.datesRange(start, end);
      if (!sps.length || !days.length) { host.appendChild(el('div', { class: 'v5-empty' }, ['No data in range'])); return; }
      const NW = SIZE.nameCol, TW = SIZE.totCol;
      const RESERVED = NW + TW;
      // Auto-fit, but clamped at the readable minimum — a 400-day range gives
      // 11px cells and horizontal scroll rather than 2px cells that fit but
      // can't be read. The zoom stepper below is the explicit escape hatch.
      const autoW = fitCell(days.length, availGridWidth(host, RESERVED));
      const CELL_W = GRID_ZOOM['activity-calendar'] || autoW;
      const IDLE_MIN = 7;
      host.appendChild(gridZoomBar('activity-calendar', autoW, () => this._draw(handle, model)));

      host.appendChild(rosterLegend([
        ...model.phasesDef.map(p => ({ color: p.c, label: p.label, title: p.title })),
        { sep: true },
        { color: 'var(--v5-bad)', dash: true, label: `idle gap ≥ ${IDLE_MIN}d (between flights)` },
        { color: 'var(--v5-warn)', dash: true, label: 'still idle — through to today' },
        { color: 'var(--v5-acc)', label: 'today' },
      ]));

      // Range totals, ABOVE the table. The per-day totals row used to be
      // pinned to the bottom of the scroll box so a summary was always in
      // view; that floated over the grid rows while scrolling, so the footer
      // is now plain and the always-visible summary lives here instead.
      const rangeTot = sps.reduce((acc, s) => {
        days.forEach(d => { const fl = s.flownByDate[d]; if (fl) { acc.les += fl.length; acc.hrs += fl.reduce((a, f) => a + f.effMins / 60, 0); } });
        return acc;
      }, { hrs: 0, les: 0 });
      const activeDays = days.filter(d => sps.some(s => s.flownByDate[d])).length;
      host.appendChild(el('div', { class: 'v5-rt-summary' }, [
        el('b', {}, [fH(rangeTot.hrs)]), ' flown · ',
        el('b', {}, [String(rangeTot.les)]), ' lessons · ',
        el('b', {}, [String(activeDays)]), ` of ${days.length} days had activity · avg `,
        el('b', {}, [fH(activeDays ? rangeTot.hrs / activeDays : 0)]), '/active day across ', String(sps.length), ' SP',
      ]));

      // rows, optionally grouped by instructor
      let rows = sps.map(s => ({ sp: s }));
      if (STATE.calGroupBy === 'instructor') {
        const byFI = {};
        sps.forEach(s => (byFI[s.fiFull || 'Unassigned'] = byFI[s.fiFull || 'Unassigned'] || []).push(s));
        rows = [];
        Object.keys(byFI).sort((a, b) => byFI[b].length - byFI[a].length || a.localeCompare(b)).forEach(fi => {
          rows.push({ group: fi, members: byFI[fi] });
          byFI[fi].forEach(s => rows.push({ sp: s }));
        });
      }

      // per-cell hours, and the max for intensity scaling
      const cellH = {};
      let maxH = 0;
      sps.forEach(s => days.forEach(d => {
        const fl = s.flownByDate[d];
        if (!fl) return;
        const hv = fl.reduce((a, f) => a + f.effMins / 60, 0);
        cellH[s.catc_id + '|' + d] = hv;
        if (hv > maxH) maxH = hv;
      }));
      maxH = maxH || 1;

      const wrap = el('div', { class: 'v5-rt-wrap' });
      const table = el('table', { class: 'v5-rt' });
      const thead = el('thead', {}, [el('tr', {}, [
        el('th', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-hl' }, ['SP'])]),
        el('th', { class: 'v5-rt-tot v5-rt-c2' }, [el('span', { class: 'v5-rt-hl' }, ['period'])]),
        ...days.map((d, i) => {
          const dObj = new Date(d + 'T12:00:00Z');
          const isMon = dObj.getUTCDay() === 1;
          const isTod = d === model.asOf;
          const showD = i === 0 || isMon || CELL_W >= 22;
          const showM = i === 0 || dObj.getUTCDate() <= 7 && isMon;
          return el('th', { class: isMon && i > 0 ? 'v5-rt-mon' : '', style: `width:${CELL_W}px` }, [
            showD ? el('div', { class: 'v5-rt-hl', style: isTod ? 'color:var(--v5-acc);font-weight:700' : '' }, [String(dObj.getUTCDate())]) : null,
            showM ? el('div', { class: 'v5-rt-hl' }, [dObj.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })]) : null,
          ]);
        }),
      ])]);
      table.appendChild(thead);

      const tbody = el('tbody', {});
      rows.forEach(r => {
        if (r.group) {
          const gh = r.members.reduce((a, s) => a + s.flown.filter(f => f.date >= start && f.date <= end).reduce((b, f) => b + f.effMins / 60, 0), 0);
          const gl = r.members.reduce((a, s) => a + s.flown.filter(f => f.date >= start && f.date <= end).length, 0);
          tbody.appendChild(el('tr', { class: 'v5-rt-grp' }, [
            el('td', { colspan: days.length + 2, style: 'background:' + mixColor('#e88aff', 9) }, [
              el('span', { style: 'color:var(--v5-acc)' }, [r.group]),
              el('span', { style: 'color:var(--v5-tx3);font-weight:400;margin-left:8px;font-size:9px' }, [`${r.members.length} SP · ${gl} les · ${gh.toFixed(1)}h`]),
            ]),
          ]));
          return;
        }
        const sp = r.sp;
        const inRange = sp.flown.filter(f => f.date >= start && f.date <= end);
        const totH = inRange.reduce((a, f) => a + f.effMins / 60, 0);
        // Idle runs: index spans of consecutive no-fly days. A run bounded by a
        // later flight is a closed gap; a run reaching the last column is "still
        // idle, through to today" and drawn differently.
        const flownIdx = days.map((d, i) => sp.flownByDate[d] ? i : -1).filter(i => i >= 0);
        const idleCell = new Array(days.length).fill(0); // 0 none, 1 closed gap, 2 open (to today)
        for (let k = 0; k < flownIdx.length - 1; k++) {
          const gap = flownIdx[k + 1] - flownIdx[k] - 1;
          if (gap >= IDLE_MIN) for (let i = flownIdx[k] + 1; i < flownIdx[k + 1]; i++) idleCell[i] = 1;
        }
        const lastFlown = flownIdx.length ? flownIdx[flownIdx.length - 1] : -1;
        const openGap = days.length - 1 - lastFlown;
        if (lastFlown >= 0 && openGap >= IDLE_MIN) for (let i = lastFlown + 1; i < days.length; i++) idleCell[i] = 2;
        if (lastFlown < 0) for (let i = 0; i < days.length; i++) idleCell[i] = 2; // never flew in range

        const tr = el('tr', {}, [
          el('td', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-nm', title: sp.name + ' — click for full SP detail', onclick: () => openSPDrawer(sp.catc_id) }, [sp.shortName])]),
          el('td', { class: 'v5-rt-tot v5-rt-c2' }, [el('span', { style: 'font-size:9px;font-weight:600;color:var(--v5-tx2)' }, [`${inRange.length}L·${totH.toFixed(1)}h`])]),
        ]);
        days.forEach((d, di) => {
          const hv = cellH[sp.catc_id + '|' + d] || 0;
          const fl = sp.flownByDate[d];
          const isMon = new Date(d + 'T12:00:00Z').getUTCDay() === 1;
          const isTod = d === model.asOf;
          const cls = ['v5-rt-cell'];
          if (isMon && di > 0) cls.push('v5-rt-mon');
          if (isTod) cls.push('v5-rt-today');
          if (!fl && idleCell[di] === 1) cls.push('v5-rt-idle');
          if (!fl && idleCell[di] === 2) { cls.push('v5-rt-idle'); cls.push('v5-rt-idle-open'); }
          let bg = 'transparent', brd = '1px solid var(--v5-bd2)';
          if (hv > 0) {
            const seg = Model.util.phaseOfNum(fl[0].num);
            const pct = Math.round(Math.max(24, Math.min(1, hv / maxH) * 88));
            bg = mixColor(seg.c, pct);
            brd = '1px solid ' + mixColor(seg.c, Math.min(100, pct + 15));
          }
          const title = fl
            ? `${sp.shortName} · ${fd(d)} · ${hv.toFixed(2)}h — ${fl.map(f => f.lesson).join(', ')}`
            : idleCell[di] === 2 ? `${sp.shortName} · ${fd(d)} — still idle (${openGap}d since last flight)`
            : idleCell[di] === 1 ? `${sp.shortName} · ${fd(d)} — inside an idle gap`
            : `${sp.shortName} · ${fd(d)} — no flight`;
          // Every cell is clickable, not just flown ones: an empty cell can
          // still have a cancelled or pending Ops booking behind it, which is
          // exactly what someone clicking an unexpected blank day wants to see.
          tr.appendChild(el('td', {
            class: cls.join(' '), title: title + ' — click for the Ops + Progress record',
            style: `width:${CELL_W}px;height:21px;background:${bg};border:${brd};cursor:pointer`,
            onclick: () => openDayCellModal(sp, d, model),
          }, [hv > 0 && CELL_W >= 20 ? el('span', { style: 'font-size:7px;font-weight:600;color:' + (hv / maxH > 0.55 ? 'rgba(255,255,255,.92)' : 'var(--v5-tx2)') }, [hv.toFixed(1)]) : null]));
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      // ── footer: batch total per DAY (hours + lesson count) ──
      const dayTot = days.map(d => {
        let hv = 0, les = 0;
        sps.forEach(s => { const fl = s.flownByDate[d]; if (fl) { les += fl.length; hv += fl.reduce((a, f) => a + f.effMins / 60, 0); } });
        return { hv, les };
      });
      const maxDay = Math.max(1, ...dayTot.map(t => t.hv));
      const grandH = dayTot.reduce((a, t) => a + t.hv, 0), grandL = dayTot.reduce((a, t) => a + t.les, 0);
      const mkFootRow = (label, pick, fmt) => {
        const tr = el('tr', { class: 'v5-rt-foot' }, [
          el('td', { class: 'v5-rt-name' }, [el('span', { class: 'v5-rt-hl', style: 'color:var(--v5-acc)' }, [label])]),
          el('td', { class: 'v5-rt-tot v5-rt-c2' }, [el('span', { style: 'font-size:9px;font-weight:700;color:var(--v5-acc)' }, [label === 'HOURS/DAY' ? grandH.toFixed(1) + 'h' : grandL + 'L'])]),
        ]);
        days.forEach((d, di) => {
          const v = pick(dayTot[di]);
          const isMon = new Date(d + 'T12:00:00Z').getUTCDay() === 1;
          tr.appendChild(el('td', {
            class: 'v5-rt-cell' + (isMon && di > 0 ? ' v5-rt-mon' : ''),
            title: `${fd(d)} — batch total ${dayTot[di].hv.toFixed(2)}h across ${dayTot[di].les} lesson${dayTot[di].les === 1 ? '' : 's'}`,
            style: `width:${CELL_W}px;height:17px;background:${v > 0 ? mixColor('#e88aff', 12 + (dayTot[di].hv / maxDay) * 70) : 'transparent'}`,
          }, [v > 0 && CELL_W >= 16 ? el('span', { style: 'font-size:6.5px;color:var(--v5-tx)' }, [fmt(v)]) : null]));
        });
        return tr;
      };
      const tfoot = el('tfoot', {}, [
        mkFootRow('HOURS/DAY', t => t.hv, v => v.toFixed(1)),
        mkFootRow('LESSONS/DAY', t => t.les, v => String(v)),
      ]);
      table.appendChild(tfoot);

      // See the matching comment on the Curriculum grid — an explicit table
      // width is required for the browser to honour per-cell px widths here.
      table.style.width = (NW + TW + days.length * CELL_W + (days.length + 2) * 1) + 'px';
      wrap.appendChild(table);
      host.appendChild(wrap);
    },
    update(handle, model) { this._draw(handle, model); },
  });


  // ─────────────────────────────────────────────────────────────────────────
  // SP drawer
  // ─────────────────────────────────────────────────────────────────────────
  function openSPDrawer(catcId) {
    const s = MODEL && MODEL.byId[String(catcId)]; if (!s) return;
    closeSPDrawer();
    const ov = el('div', { class: 'v5-sp-draw-ov show', onclick: e => { if (e.target === ov) closeSPDrawer(); } });
    const draw = el('div', { class: 'v5-sp-draw', onclick: e => e.stopPropagation() });
    draw.appendChild(el('div', { class: 'v5-sp-draw-hd' }, [
      el('div', {}, [el('div', { class: 'v5-sp-name' }, [s.name]), el('div', { class: 'v5-sp-meta' }, [`${s.catc_id} · ${s.nick || '—'} · FI: ${s.fiFull || '—'} · ${s.se || '—'}`])]),
      el('button', { class: 'v5-btn', onclick: closeSPDrawer }, ['Close']),
    ]));
    const kpi = (l, v, c) => el('div', { class: 'v5-sp-kpi' }, [el('div', { class: 'v5-kpi-l' }, [l]), el('div', { class: 'v5-kpi-v', style: 'font-size:16px;color:' + (c || 'var(--v5-tx)') }, [v])]);
    draw.appendChild(el('div', { class: 'v5-sp-kpis' }, [
      kpi('Lessons', `${s.lessonsCompleted} / ${s.total}`, 'var(--v5-acc)'),
      kpi('Hrs effective', s.hoursEffective.toFixed(1) + 'h'),
      kpi('Hrs logged', s.hoursLogged.toFixed(1) + 'h'),
      kpi('Retakes', String(s.retakes), s.retakes ? 'var(--v5-warn)' : 'var(--v5-tx3)'),
      kpi('Idle', s.idleDays == null ? '—' : s.idleDays + 'd', s.idleDays >= 5 ? 'var(--v5-bad)' : 'var(--v5-tx)'),
      kpi('Hrs Δ', signed(s.hrsDelta, fH), s.hrsDelta >= 0 ? 'var(--v5-good)' : 'var(--v5-bad)'),
      kpi('ETC', s.etcNever ? 'never' : fdShort(s.etcDate), s.atRisk ? 'var(--v5-warn)' : 'var(--v5-good)'),
    ]));
    if (s.retakes > 0) draw.appendChild(el('div', { style: 'margin:0 18px 10px;font-size:11px;color:var(--v5-tx3)' }, [`Effective hours credit each retaken lesson once (${s.hoursEffective.toFixed(1)}h); logged hours count every attempt (${s.hoursLogged.toFixed(1)}h).`]));
    const log = el('div', { class: 'v5-sp-log' });
    log.appendChild(el('div', { class: 'v5-mono', style: 'font-size:9px;color:var(--v5-tx3);text-transform:uppercase;margin:8px 0 4px' }, ['Lesson log']));
    s.flown.slice().reverse().forEach(f => log.appendChild(el('div', { class: 'v5-sp-log-row' }, [
      el('span', { style: 'width:70px;color:var(--v5-tx3)' }, [fdShort(f.date)]),
      el('span', { style: 'flex:1' }, [f.lesson + (f.isRetake ? ' (retake)' : '')]),
      el('span', {}, [Math.round(f.effMins) + 'm']),
    ])));
    draw.appendChild(log);
    ov.appendChild(draw);
    document.body.appendChild(ov);
    document.addEventListener('keydown', escCloseSPDrawer);
  }
  function escCloseSPDrawer(e) { if (e.key === 'Escape') closeSPDrawer(); }
  function closeSPDrawer() { $$('.v5-sp-draw-ov').forEach(n => n.remove()); document.removeEventListener('keydown', escCloseSPDrawer); }

  // ─────────────────────────────────────────────────────────────────────────
  // Insight Reel — 10 deterministic generators, top 5-6 shown, auto-advance
  // ─────────────────────────────────────────────────────────────────────────
  function sparkPath(vals, w, h) {
    if (!vals.length) return '';
    const min = Math.min(...vals), max = Math.max(...vals), span = Math.max(max - min, 0.001);
    return vals.map((v, i) => `${(i / Math.max(1, vals.length - 1) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`).join(' ');
  }
  const REEL_GENERATORS = [
    m => { // lag trend vs 7d ago
      const lag = m.series.hours.lag; if (lag.length < 8) return null;
      const now = lag[lag.length - 1].y, was = lag[Math.max(0, lag.length - 8)].y, d = now - was;
      if (Math.abs(d) < 1) return null;
      const rising = d > 0;
      return { score: 90, color: rising ? '#ef4444' : '#4ade80', headline: `Batch lag ${rising ? 'grew' : 'shrank'} ${Math.abs(d).toFixed(1)}h this week`,
        detail: `Now ${now.toFixed(1)}h behind curriculum plan (was ${was.toFixed(1)}h 7 days ago).`, section: 'trend',
        spark: sparkPath(lag.slice(-14).map(p => p.y), 120, 36) };
    },
    m => { // vs target
      const v = m.batch.vsTargetToday; if (!v || v.behindCount === 0) return null;
      return { score: 88, color: '#f43f5e', headline: `${v.behindCount} of ${m.batch.n} SP are behind target L${Math.round(m.batch.targetLessonToday)}`,
        detail: `Checkpoint requires every SP at lesson ${Math.round(m.batch.targetLessonToday)}. Batch is ${fH(Math.abs(v.hours))} ${v.hours < 0 ? 'behind' : 'ahead of'} that target.`, section: 'syllabus',
        spark: null };
    },
    m => { // idle alert
      const idle = m.students.filter(s => s.idleDays != null && s.idleDays >= 7);
      if (!idle.length) return null;
      return { score: 82, color: '#f59e0b', headline: `${idle.length} SP idle 7+ days`,
        detail: idle.slice(0, 3).map(s => s.shortName + ' (' + s.idleDays + 'd)').join(', ') + (idle.length > 3 ? `, +${idle.length - 3} more` : ''), section: 'people', spark: null };
    },
    m => { // bottleneck lesson
      const count = m.curriculum.count; if (!count) return null;
      let worst = null;
      for (let n = 1; n <= count; n++) {
        const done = m.students.filter(s => s.flownByNum[n]).length;
        const waiting = m.students.filter(s => s.nextNum === n).length;
        if (waiting >= 3) { const pct = m.batch.n ? done / m.batch.n : 0; if (!worst || pct < worst.pct) worst = { n, pct, waiting }; }
      }
      if (!worst) return null;
      return { score: 75, color: '#f59e0b', headline: `Bottleneck: lesson ${worst.n}`,
        detail: `Only ${(worst.pct * 100).toFixed(0)}% of the batch has cleared it, and ${worst.waiting} SP have it queued next.`, section: 'syllabus', spark: null };
    },
    m => { // best/worst period, last 8 weeks
      const out = m.output({ unit: 'hours', period: 'week', showAll: true, start: U.addDays(m.asOf, -56), end: m.asOf });
      if (out.values.length < 3) return null;
      const maxV = Math.max(...out.values), maxI = out.values.indexOf(maxV);
      const avg = out.values.reduce((a, v) => a + v, 0) / out.values.length;
      if (maxV < avg * 1.2 || maxV < 5) return null;
      return { score: 60, color: '#4ade80', headline: `Best week in ${out.values.length}: ${maxV.toFixed(1)}h flown`,
        detail: `${((maxV / Math.max(avg, 0.01) - 1) * 100).toFixed(0)}% above the period average.`, section: 'trend',
        spark: sparkPath(out.values, 120, 36) };
    },
    m => { // milestones passed in 14d
      const cutoff = U.addDays(m.asOf, -14);
      const hits = [];
      m.students.forEach(s => m.keyPoints.forEach(kp => { const f = s.flownByNum[kp.num]; if (f && f[0].date >= cutoff) hits.push({ s, kp }); }));
      if (!hits.length) return null;
      return { score: 55, color: '#e88aff', headline: `${hits.length} milestone${hits.length > 1 ? 's' : ''} passed in the last 14 days`,
        detail: hits.slice(0, 3).map(x => x.s.shortName + ' · ' + x.kp.label).join(' · '), section: 'syllabus', spark: null };
    },
    m => { // required pace change
      const pace = m.pace; if (!pace || pace.reqWeekHrsB == null) return null;
      const gap = m.actualPace.actWeekHrsB - pace.reqWeekHrsB;
      if (gap >= -1) return null;
      return { score: 70, color: '#ef4444', headline: `Batch needs ${fH(Math.abs(gap))} more per week`,
        detail: `Required ${fH(pace.reqWeekHrsB)}/wk to hit ${fd(pace.planEndDate)}; actual pace is ${fH(m.actualPace.actWeekHrsB)}/wk.`, section: 'pulse', spark: null };
    },
    m => { // at-risk count
      if (!m.etc.atRisk) return null;
      return { score: 50, color: '#f59e0b', headline: `${m.etc.atRisk} of ${m.batch.n} SP are projected late`,
        detail: `Average projected delay ${m.etc.avgDelay}d past the plan end date.` + (m.etc.neverStarted ? ` ${m.etc.neverStarted} not yet started.` : ''), section: 'people', spark: null };
    },
    m => { // dual/solo/sim mix
      const out = m.output({ unit: 'hours', period: 'week', showAll: false, start: U.addDays(m.asOf, -28), end: m.asOf });
      if (!out.totals.all) return null;
      const soloPct = out.totals.Solo / out.totals.all * 100;
      if (soloPct < 25) return null;
      return { score: 40, color: '#d4a017', headline: `Solo flying is ${soloPct.toFixed(0)}% of recent output`,
        detail: `Last 4 weeks: ${out.totals.Dual.toFixed(0)}h dual, ${out.totals.Solo.toFixed(0)}h solo, ${out.totals.Simulator.toFixed(0)}h sim.`, section: 'trend', spark: null };
    },
    m => { // retakes visible
      if (!m.batch.retakes) return null;
      return { score: 35, color: '#8b949e', headline: `${m.batch.retakes} lesson retake${m.batch.retakes > 1 ? 's' : ''} across ${m.batch.retakeStudents} SP`,
        detail: `Counted once each in the progress totals — see any SP’s drawer for the effective-vs-logged hours split.`, section: 'people', spark: null };
    },
  ];
  let reelTimer = null, reelPinned = false;
  function generateInsights(model) {
    const items = REEL_GENERATORS.map(fn => { try { return fn(model); } catch (e) { return null; } }).filter(Boolean);
    items.sort((a, b) => b.score - a.score);
    return items.slice(0, 6);
  }
  function mountReel(replaceOnly) {
    const container = MOUNTS.reel && MOUNTS.reel.el;
    if (!container) return;
    const items = generateInsights(MODEL);
    container.innerHTML = '';
    clearInterval(reelTimer);
    if (!items.length) { container.appendChild(el('div', { class: 'v5-empty' }, ['Nothing urgent right now.'])); return; }
    const dotsWrap = el('div', { class: 'v5-reel-dots' });
    items.forEach((it, i) => dotsWrap.appendChild(el('button', { class: 'v5-dot' + (i === 0 ? ' on' : ''), 'aria-label': 'Insight ' + (i + 1), onclick: () => showReelCard(i) })));
    const hdRow = el('div', { style: 'display:flex;align-items:center;margin-bottom:6px' }, [
      el('button', { class: 'v5-reel-nav', 'aria-label': 'Previous insight', onclick: () => showReelCard((reelIdx - 1 + items.length) % items.length) }, ['‹']),
      dotsWrap,
      el('button', { class: 'v5-reel-nav', 'aria-label': 'Next insight', onclick: () => showReelCard((reelIdx + 1) % items.length) }, ['›']),
    ]);
    container.appendChild(hdRow);
    const cardsWrap = el('div', {});
    items.forEach((it, i) => {
      const card = el('div', { class: 'v5-reel-card' + (i === 0 ? ' on' : ''), 'data-i': i }, [
        el('div', { style: 'flex:1' }, [
          el('div', { class: 'v5-reel-headline', style: 'color:' + it.color }, [it.headline]),
          el('div', { class: 'v5-reel-detail' }, [it.detail]),
          el('span', { class: 'v5-reel-link', onclick: () => goSection(it.section) }, ['View →']),
        ]),
        it.spark ? (() => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('width', 120); svg.setAttribute('height', 36); svg.setAttribute('viewBox', '0 0 120 36'); const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); poly.setAttribute('points', it.spark); poly.setAttribute('fill', 'none'); poly.setAttribute('stroke', it.color); poly.setAttribute('stroke-width', '2'); svg.appendChild(poly); return svg; })() : null,
      ]);
      cardsWrap.appendChild(card);
    });
    container.appendChild(cardsWrap);
    let reelIdx = 0;
    function showReelCard(i) {
      reelIdx = i;
      $$('.v5-reel-card', cardsWrap).forEach((c, ci) => c.classList.toggle('on', ci === i));
      $$('.v5-dot', dotsWrap).forEach((d, di) => d.classList.toggle('on', di === i));
    }
    if (!reelPinned && !MODEL._noAnimate) {
      reelTimer = setInterval(() => { if (!container.matches(':hover') && !container.matches(':focus-within')) showReelCard((reelIdx + 1) % items.length); }, 6000);
    }
    container.addEventListener('keydown', e => { if (e.key === 'ArrowRight') showReelCard((reelIdx + 1) % items.length); if (e.key === 'ArrowLeft') showReelCard((reelIdx - 1 + items.length) % items.length); });
  }
  registerPanelV5({
    id: 'reel', title: 'Insight reel', estHeight: 100, deps: ['always'],
    subtitle: () => 'auto-generated · updates as data changes',
    mount(container) { container.setAttribute('tabindex', '0'); container.closest('.v5-panel').classList.add('v5-reel'); MOUNTS.reel = { el: container, mounted: true }; mountReel(); return {}; },
    update() { mountReel(true); },
    destroy() { clearInterval(reelTimer); },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Replay ("Story")
  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // REPLAY ("Story") — precomputed-frame engine.
  //
  // The first version called setAsOf() once per frame, which meant a FULL model
  // rebuild (28 SP × every flight, every series, every index) + renderSelfCheck
  // (11 invariants over all flights) + applyState re-rendering EVERY mounted
  // panel + regenerating all 10 insight generators — around 90 times in a row.
  // On the Syllabus section that re-rendered a 2,688-cell table per frame, and
  // on Trend it destroyed and recreated Chart.js instances per frame. That's
  // what the stutter was.
  //
  // Now: one precompute pass builds every frame's aggregates as flat arrays
  // (prefix sums), and playback is a pure array lookup driven by a
  // time-based requestAnimationFrame clock. Per frame we only write KPI text
  // and swap the Actual dataset's already-built point array on the existing
  // chart (update('none') — no animation, no re-layout). No model rebuild, no
  // panel re-render, no chart re-creation. Frame cost is O(1) in the data size.
  // ─────────────────────────────────────────────────────────────────────────
  let REPLAY = null;

  function buildReplayTimeline(model) {
    const dates = U.datesRange(model.batchStart, model.todayBKK);
    const n = dates.length;
    const idxOf = {}; dates.forEach((d, i) => { idxOf[d] = i; });

    // ── per-day batch deltas, one pass over all flights ──
    const dLes = new Float64Array(n), dHrs = new Float64Array(n);
    // per-SP unique-lesson completion day index, for the "behind target" count
    const spSeen = model.students.map(() => new Set());
    const spCum = model.students.map(() => new Int16Array(n));
    model.students.forEach((sp, si) => {
      const seen = spSeen[si];
      sp.flown.forEach(f => {
        const i = idxOf[f.date];
        if (i == null) return;
        dLes[i] += 1;
        dHrs[i] += f.effMins / 60;
        if (f.num != null && !seen.has(f.num)) { seen.add(f.num); spCum[si][i] += 1; }
      });
      // prefix-sum this SP's unique count so any frame is an O(1) lookup
      const arr = spCum[si];
      for (let i = 1; i < n; i++) arr[i] += arr[i - 1];
    });

    // ── plan deltas by day (batch scale, same convention as the model) ──
    const pLes = new Float64Array(n), pHrs = new Float64Array(n);
    const nSP = Math.max(1, model.batch.n);
    Object.keys(model.curriculum.planByDate).forEach(d => {
      const i = idxOf[d]; if (i == null) return;
      pHrs[i] += model.curriculum.planByDate[d] * nSP / 60;
    });
    Object.keys(model.curriculum.planLessonCountByDate).forEach(d => {
      const i = idxOf[d]; if (i == null) return;
      pLes[i] += model.curriculum.planLessonCountByDate[d] * nSP;
    });

    // ── cumulative arrays ──
    const cLes = new Float64Array(n), cHrs = new Float64Array(n);
    const cpLes = new Float64Array(n), cpHrs = new Float64Array(n);
    let a = 0, b = 0, c = 0, e = 0;
    for (let i = 0; i < n; i++) {
      a += dLes[i]; b += dHrs[i]; c += pLes[i]; e += pHrs[i];
      cLes[i] = a; cHrs[i] = b; cpLes[i] = c; cpHrs[i] = e;
    }

    // unique lessons completed batch-wide (retake-free) per frame
    const cUniq = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let si = 0; si < spCum.length; si++) s += spCum[si][i]; cUniq[i] = s; }

    // target lesson + how many SP are behind it, per frame
    const tgtLesson = new Float64Array(n), behind = new Int16Array(n);
    const hasTargets = model.targets.list.length > 0;
    for (let i = 0; i < n; i++) {
      if (!hasTargets) { tgtLesson[i] = -1; continue; }
      const tl = model.targets.lessonForDate(dates[i]);
      tgtLesson[i] = tl == null ? -1 : tl;
      if (tl != null && tl > 0) {
        let cnt = 0;
        for (let si = 0; si < spCum.length; si++) if (spCum[si][i] < tl) cnt++;
        behind[i] = cnt;
      }
    }

    // ── key dates worth pausing on, each with a caption ──
    const captions = {};
    model.targets.list.forEach(t => {
      if (idxOf[t.date] == null) return;
      captions[t.date] = `Target checkpoint — every SP should be at lesson ${t.lesson}`;
    });
    model.keyPoints.forEach(kp => {
      let first = null;
      model.students.forEach(sp => { const f = sp.flownByNum[kp.num]; if (f && (!first || f[0].date < first)) first = f[0].date; });
      if (first && idxOf[first] != null && !captions[first]) captions[first] = `First ${kp.label} in the batch (lesson ${kp.num})`;
    });
    // worst single-day lag jump gets a caption too
    let worstI = 0, worstJump = 0;
    for (let i = 1; i < n; i++) {
      const j = (cpHrs[i] - cHrs[i]) - (cpHrs[i - 1] - cHrs[i - 1]);
      if (j > worstJump) { worstJump = j; worstI = i; }
    }
    if (worstJump > 0 && !captions[dates[worstI]]) captions[dates[worstI]] = `Biggest single-day slip — plan pulled ${worstJump.toFixed(1)}h further ahead`;

    // ── the full Actual series, prebuilt so a frame is just a .slice() ──
    const actHrs = dates.map((d, i) => ({ x: d, y: +cHrs[i].toFixed(2) }));
    const actLes = dates.map((d, i) => ({ x: d, y: +cLes[i].toFixed(2) }));
    const lagHrs = dates.map((d, i) => ({ x: d, y: Math.max(0, +(cpHrs[i] - cHrs[i]).toFixed(2)) }));
    const lagLes = dates.map((d, i) => ({ x: d, y: Math.max(0, +(cpLes[i] - cLes[i]).toFixed(2)) }));

    return { dates, n, captions, cLes, cHrs, cpLes, cpHrs, cUniq, tgtLesson, behind, actHrs, actLes, lagHrs, lagLes, curLessons: model.curriculum.count, nSP };
  }

  // Write one frame. Deliberately touches only text nodes and one chart dataset.
  function replayApplyFrame(i) {
    const R = REPLAY; if (!R) return;
    const T = R.timeline;
    i = clamp(i, 0, T.n - 1);
    R.idx = i;
    const date = T.dates[i];

    // as-of chip
    const live = $('#d127v5-live');
    if (live) { live.classList.add('v5-timetravel'); live.innerHTML = '⏪ ' + escHtml(fdShort(date)); }

    // KPI tiles — direct text, no tween (a tween would fight the playback clock)
    const isHrs = STATE.unit === 'hours';
    const done = isHrs ? T.cHrs[i] : T.cUniq[i];
    const plan = isHrs ? T.cpHrs[i] : T.cpLes[i];
    const delta = done - plan;
    const slots = isHrs ? T.nSP * MODEL.curriculum.totalHours : T.nSP * T.curLessons;
    const setKpi = (key, text, color) => {
      const elv = $('.v5-kpi-v[data-kpi="' + key + '"]');
      if (!elv) return;
      elv.textContent = text;
      if (color) elv.style.color = color;
    };
    setKpi('progress', slots ? (T.cUniq[i] / slots * 100).toFixed(1) + '%' : '—');
    setKpi('hoursDelta', signed(T.cHrs[i] - T.cpHrs[i], fH), T.cHrs[i] >= T.cpHrs[i] ? 'var(--v5-good)' : 'var(--v5-bad)');
    setKpi('lessonsDelta', signed(T.cUniq[i] - T.cpLes[i], fL), T.cUniq[i] >= T.cpLes[i] ? 'var(--v5-good)' : 'var(--v5-bad)');
    if (T.tgtLesson[i] >= 0) setKpi('vsTarget', T.behind[i] + ' SP');

    // progress chart — swap the prebuilt Actual/lag slice on the LIVE instance
    const ch = CHARTS['progress-chart'];
    if (ch) {
      const gap = STATE.progressLevel === 'gap';
      const src = gap ? (isHrs ? T.lagHrs : T.lagLes) : (isHrs ? T.actHrs : T.actLes);
      const target = ch.data.datasets.find(d => gap ? /lag/i.test(d.label) : d.label === 'Actual');
      if (target) { target.data = src.slice(0, i + 1); ch.update('none'); }
    }

    // scrub + caption
    if (R.ui) {
      R.ui.fill.style.width = (i / Math.max(1, T.n - 1) * 100).toFixed(2) + '%';
      R.ui.date.textContent = fd(date);
      const cap = T.captions[date];
      if (cap) { R.ui.caption.textContent = cap; R.ui.caption.classList.add('v5-replay-cap-on'); }
      else if (!R.holdUntil) R.ui.caption.classList.remove('v5-replay-cap-on');
    }
    return !!T.captions[date];
  }

  function buildReplayUI() {
    const host = $('#d127v5-body');
    if (!host) return null;
    const bar = el('div', { class: 'v5-replay', id: 'd127v5-replay' });
    const playBtn = el('button', { class: 'v5-btn v5-primary', title: 'Pause / resume' }, ['⏸']);
    const dateEl = el('span', { class: 'v5-replay-date' }, ['—']);
    const track = el('div', { class: 'v5-replay-track', title: 'Drag to scrub through the batch’s history' });
    const fill = el('i', { class: 'v5-replay-fill' });
    track.appendChild(fill);
    const caption = el('div', { class: 'v5-replay-cap' }, ['']);
    const speedSet = el('div', { class: 'v5-chipset' });
    [[0.5, '0.5×'], [1, '1×'], [2, '2×'], [4, '4×']].forEach(([v, l]) => {
      const b = el('button', { class: 'v5-chip' + (v === 1 ? ' on' : ''), title: 'Playback speed' }, [l]);
      b.addEventListener('click', () => {
        REPLAY.speed = v;
        $$('.v5-chip', speedSet).forEach(c => c.classList.toggle('on', c.textContent === l));
      });
      speedSet.appendChild(b);
    });
    const closeBtn = el('button', { class: 'v5-btn', title: 'Stop and return to live data' }, ['✕ Exit']);
    bar.appendChild(el('div', { class: 'v5-replay-row' }, [
      playBtn, dateEl, track,
      el('span', { class: 'v5-zoom-l' }, ['Speed']), speedSet, closeBtn,
    ]));
    bar.appendChild(caption);
    host.parentNode.insertBefore(bar, host);

    playBtn.addEventListener('click', () => {
      REPLAY.paused = !REPLAY.paused;
      playBtn.textContent = REPLAY.paused ? '▶' : '⏸';
      if (!REPLAY.paused) { REPLAY.last = performance.now(); REPLAY.holdUntil = 0; tickReplay(); }
    });
    closeBtn.addEventListener('click', stopReplay);
    let drag = false;
    const scrub = clientX => {
      const r = track.getBoundingClientRect();
      const frac = clamp((clientX - r.left) / r.width, 0, 1);
      replayApplyFrame(Math.round(frac * (REPLAY.timeline.n - 1)));
    };
    track.addEventListener('pointerdown', e => { drag = true; track.setPointerCapture(e.pointerId); REPLAY.paused = true; playBtn.textContent = '▶'; scrub(e.clientX); });
    track.addEventListener('pointermove', e => { if (drag) scrub(e.clientX); });
    track.addEventListener('pointerup', () => { drag = false; });
    return { bar, playBtn, dateEl, track, fill, caption, date: dateEl };
  }

  // Time-based clock: advance by elapsed real time, so a slow frame skips ahead
  // instead of stretching the timeline (that's what makes it feel smooth).
  const REPLAY_DAYS_PER_SEC = 26;
  function tickReplay() {
    const R = REPLAY;
    if (!R || R.paused) return;
    const now = performance.now();
    if (R.holdUntil && now < R.holdUntil) { R.raf = requestAnimationFrame(tickReplay); return; }
    R.holdUntil = 0;
    const dt = Math.min(0.25, (now - R.last) / 1000);
    R.last = now;
    R.pos += dt * REPLAY_DAYS_PER_SEC * R.speed;
    const next = Math.floor(R.pos);
    if (next >= R.timeline.n - 1) {
      replayApplyFrame(R.timeline.n - 1);
      R.finished = true;
      if (R.ui) { R.ui.playBtn.textContent = '↺'; R.ui.caption.textContent = 'Replay complete — exit to return to live data.'; R.ui.caption.classList.add('v5-replay-cap-on'); }
      R.paused = true;
      return;
    }
    const onKey = replayApplyFrame(next);
    // Pause on a key date so the caption is actually readable.
    if (onKey && R.lastKey !== next) { R.lastKey = next; R.holdUntil = now + 1400 / R.speed; }
    R.raf = requestAnimationFrame(tickReplay);
  }

  function toggleReplay() {
    if (REPLAY) stopReplay();
    else startReplay();
  }
  function startReplay() {
    if (!MODEL) return;
    // Replay is a Trend-section story: the growing Actual line is the whole
    // point, so make sure that section (and its chart) is mounted first.
    if (STATE.section !== 'trend') goSection('trend');
    const timeline = buildReplayTimeline(MODEL);
    if (timeline.n < 3) { toast('Not enough history to replay'); return; }
    REPLAY = { timeline, idx: 0, pos: 0, speed: 1, paused: false, last: performance.now(), holdUntil: 0, lastKey: -1, ui: null };
    REPLAY.ui = buildReplayUI();
    const btn = $('#d127v5-story-btn'); if (btn) { btn.textContent = '⏹ Stop'; btn.classList.add('on'); }
    // Let the Trend panels mount before the first frame writes into them.
    setTimeout(() => { if (!REPLAY) return; REPLAY.last = performance.now(); replayApplyFrame(0); tickReplay(); }, 260);
  }
  function stopReplay() {
    if (!REPLAY) return;
    if (REPLAY.raf) cancelAnimationFrame(REPLAY.raf);
    if (REPLAY.ui && REPLAY.ui.bar) REPLAY.ui.bar.remove();
    REPLAY = null;
    const btn = $('#d127v5-story-btn'); if (btn) { btn.textContent = '▶ Story'; btn.classList.remove('on'); }
    // One real state restore at the end — the expensive path runs once, not 400×.
    STATE.asOf = null;
    rebuildModel();
    renderSelfCheck();
    KPI_PREV = {};
    applyState(['asOf', 'unit', 'scope', 'range']);
    mountReel(true);
    refreshCommandBarChrome();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Self-check footer
  // ─────────────────────────────────────────────────────────────────────────
  function renderSelfCheck() {
    const foot = $('#d127v5-selfcheck'); if (!foot || !MODEL) return;
    const sc = Model.selfCheck(MODEL);
    const hd = $('.v5-selfcheck-hd', foot);
    hd.innerHTML = '';
    hd.appendChild(el('span', {}, [sc.pass ? '✓' : '⚠']));
    hd.appendChild(el('span', {}, [`Self-check: ${sc.checks.filter(c => c.pass).length}/${sc.checks.length} pass`]));
    hd.appendChild(el('span', { class: 'v5-spacer' }));
    hd.appendChild(el('span', {}, [(MODEL.isLive ? 'live' : 'time-travel · ' + fdShort(MODEL.asOf))]));
    const body = $('.v5-selfcheck-body', foot);
    body.innerHTML = '';
    sc.checks.forEach(c => body.appendChild(el('div', { class: 'v5-sc-row' }, [el('span', { class: c.pass ? 'v5-sc-pass' : 'v5-sc-fail' }, [c.pass ? 'PASS' : 'FAIL']), el('span', {}, [c.label]), el('span', { style: 'color:var(--v5-tx3);margin-left:auto' }, [c.detail])])));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Customise drawer
  // ─────────────────────────────────────────────────────────────────────────
  function openCustomise() {
    closeCustomise();
    const ov = el('div', { class: 'v5-drawer-ov show', id: 'd127v5-customise-ov', onclick: e => { if (e.target === ov) closeCustomise(); } });
    const draw = el('div', { class: 'v5-drawer' });
    draw.appendChild(el('div', { class: 'v5-drawer-hd' }, [el('b', {}, ['Customise']), el('button', { class: 'v5-btn', onclick: closeCustomise }, ['Done'])]));
    const body = el('div', { class: 'v5-drawer-body' });
    draw.appendChild(body);
    ov.appendChild(draw);
    document.body.appendChild(ov);

    const cfg = Layout.clone(layoutCfg.current);
    function renderBody() {
      body.innerHTML = '';
      if (Layout.isOverridden()) body.appendChild(el('div', { class: 'v5-diff-chip', style: 'margin-bottom:10px;display:inline-block' }, ['Layout differs from published default']));

      body.appendChild(el('div', { class: 'v5-drawer-sec' }, ['Preset']));
      const presetRow = el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px' });
      Object.keys(Layout.PRESETS).forEach(p => presetRow.appendChild(el('button', { class: 'v5-btn' + (cfg.preset === p ? ' v5-primary' : ''), onclick: () => { Object.assign(cfg, Layout.PRESETS[p]()); renderBody(); } }, [Layout.PRESET_LABELS[p]])));
      body.appendChild(presetRow);

      const curSection = cfg.sections.find(s => s.id === STATE.section) || cfg.sections[0];
      body.appendChild(el('div', { class: 'v5-drawer-sec' }, ['Panels — ' + (curSection.label || curSection.id)]));
      const list = el('div', {});
      curSection.panels.forEach((p, idx) => {
        const def = PANELS[p.id];
        const row = el('div', { class: 'v5-panel-row', draggable: 'true' });
        row.dataset.idx = idx;
        row.appendChild(el('span', { class: 'v5-grip' }, ['☰']));
        row.appendChild(el('span', { style: 'flex:1;font-size:12px' }, [def ? def.title : p.id]));
        const spanSel = el('select', {}, [4, 6, 8, 12].map(v => el('option', { value: v, selected: p.span === v ? 'selected' : undefined }, [v + '/12'])));
        spanSel.addEventListener('change', () => { p.span = parseInt(spanSel.value, 10); });
        row.appendChild(spanSel);
        const eye = el('button', { class: 'v5-eye' + (p.visible ? '' : ' v5-off'), 'aria-label': p.visible ? 'Hide panel' : 'Show panel' }, [p.visible ? '◉' : '○']);
        eye.addEventListener('click', () => { p.visible = !p.visible; eye.classList.toggle('v5-off', !p.visible); eye.textContent = p.visible ? '◉' : '○'; });
        row.appendChild(eye);
        row.addEventListener('dragstart', e => { row.classList.add('v5-dragging'); e.dataTransfer.setData('text/plain', String(idx)); });
        row.addEventListener('dragend', () => row.classList.remove('v5-dragging'));
        row.addEventListener('dragover', e => e.preventDefault());
        row.addEventListener('drop', e => {
          e.preventDefault();
          const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
          const to = parseInt(row.dataset.idx, 10);
          if (from === to) return;
          const [moved] = curSection.panels.splice(from, 1);
          curSection.panels.splice(to, 0, moved);
          renderBody();
        });
        list.appendChild(row);
      });
      body.appendChild(list);

      body.appendChild(el('div', { class: 'v5-drawer-sec' }, ['Density / scale']));
      const densRow = el('div', { style: 'display:flex;gap:5px;margin-bottom:6px' });
      ['comfortable', 'compact'].forEach(d => densRow.appendChild(el('button', { class: 'v5-btn' + (cfg.density === d ? ' v5-primary' : ''), onclick: () => { cfg.density = d; renderBody(); } }, [d])));
      body.appendChild(densRow);
      const scaleRow = el('input', { type: 'range', min: '0.85', max: '1.3', step: '0.05', value: cfg.chartScale });
      scaleRow.addEventListener('input', () => { cfg.chartScale = parseFloat(scaleRow.value); });
      body.appendChild(scaleRow);

      body.appendChild(el('div', { class: 'v5-drawer-sec' }, ['Sections']));
      cfg.sections.forEach(s => {
        const row = el('label', { style: 'display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px' });
        const cb = el('input', { type: 'checkbox' }); cb.checked = s.visible !== false;
        cb.addEventListener('change', () => { s.visible = cb.checked; });
        row.appendChild(cb); row.appendChild(document.createTextNode(s.label || s.id));
        body.appendChild(row);
      });

      body.appendChild(el('div', { class: 'v5-drawer-sec' }, ['Save']));
      const saveRow = el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap' });
      saveRow.appendChild(el('button', { class: 'v5-btn v5-primary', onclick: () => { applyLayout(cfg, true); } }, ['Apply']));
      saveRow.appendChild(el('button', { class: 'v5-btn', onclick: () => { Layout.clearLocal(); applyLayout(Layout.clone(Layout.DEFAULT), false); toast('Reset to published default'); } }, ['⟳ Reset']));
      body.appendChild(saveRow);
      const saveRow2 = el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap;margin-top:5px' });
      saveRow2.appendChild(el('button', { class: 'v5-btn', onclick: () => { const link = location.origin + location.pathname + '?v5layout=' + Layout.encodeShareLink(cfg) + location.hash; navigator.clipboard && navigator.clipboard.writeText(link).then(() => toast('Share link copied')).catch(() => toast('Copy this link:\n' + link)); } }, ['Share link']));
      saveRow2.appendChild(el('button', { class: 'v5-btn', onclick: () => { const txt = Layout.exportForCommit(Layout.validate(cfg) || cfg); navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Copied — paste into js/ap127-v5-layout.js')).catch(() => console.log(txt)); } }, ['Export for commit']));
      body.appendChild(saveRow2);
    }
    renderBody();
  }
  function closeCustomise() { $$('#d127v5-customise-ov').forEach(n => n.remove()); }
  function applyLayout(cfg, save) {
    const valid = Layout.validate(cfg) || Layout.clone(Layout.DEFAULT);
    layoutCfg.current = valid;
    if (save) Layout.saveLocal(valid, 'Layout customised');
    renderSectionTabs(); renderGrid();
    closeCustomise();
    toast(save ? 'Layout applied' : 'Layout reset');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Report sheet + print + PDF download
  // ─────────────────────────────────────────────────────────────────────────
  // resolveColorToRgb — paints ANY CSS color the browser understands (oklch(),
  // color-mix(), var(), named colors...) into a 1x1 canvas and reads the pixel
  // back as plain rgb(). This is how the report sheet avoids the exact failure
  // V4's Export PDF hits: html2canvas 1.4.1 can't parse oklch()/color-mix(),
  // and this app's theme is built from exactly that (css/theme.css). The
  // report sheet's own stylesheet uses only hex/rgb, so html2canvas never sees
  // a color function it can't read.
  let _rc_canvas = null;
  function resolveColorToRgb(cssColor) {
    if (!_rc_canvas) { _rc_canvas = document.createElement('canvas'); _rc_canvas.width = 1; _rc_canvas.height = 1; }
    const ctx = _rc_canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    try { ctx.fillStyle = cssColor; } catch (e) { return '#000000'; }
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  }

  // Renders a Chart.js config into a detached, offscreen canvas at a fixed
  // report size, returns a plain <img> with the PNG baked in, then destroys
  // the temporary chart instance — never touches the live/on-screen chart.
  function renderOffscreenChartImg(cfg, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    document.body.appendChild(canvas); // Chart.js needs layout to measure against
    canvas.style.position = 'fixed'; canvas.style.left = '-99999px'; canvas.style.top = '0';
    const localCfg = JSON.parse(JSON.stringify(cfg, (k, v) => typeof v === 'function' ? undefined : v));
    // options.plugins callbacks were stripped by the JSON round-trip above
    // (functions don't survive it) — fine here, tooltips/callbacks have no
    // effect on a static PNG export; only the drawn geometry/colors matter.
    localCfg.options = localCfg.options || {};
    localCfg.options.responsive = false; localCfg.options.animation = false;
    localCfg.options.plugins = localCfg.options.plugins || {};
    localCfg.options.plugins.datalabels = { display: false };
    const chart = new window.Chart(canvas, localCfg);
    const img = el('img', { src: chart.toBase64Image('image/png', 1), style: `width:${w}px;height:${h}px` });
    chart.destroy();
    canvas.remove();
    return img;
  }

  // Lesson Completion Matrix (ref V4) — a compact, print-safe HTML/CSS grid
  // (not the live section's canvas, which needs a real pointer for hit-
  // testing) fit to the report's fixed 703px content width via a <colgroup>
  // of equal-width columns, one per curriculum lesson, plus one wider name
  // column. A phase-colored band sits above the grid; each SP's row shades a
  // cell by phase color when that lesson was completed, else a neutral grey.
  function buildReportLessonMatrix(model) {
    const count = model.curriculum.count || 96;
    const contentW = 639; // report sheet is 703px wide, minus its 32px×2 padding
    const nameW = 76;
    const cellW = Math.max(3, (contentW - nameW) / count);
    const table = el('table', { style: `border-collapse:collapse;table-layout:fixed;width:${Math.round(nameW + cellW * count)}px;` });
    const colgroup = el('colgroup', {}, [el('col', { style: `width:${nameW}px` })].concat(
      Array.from({ length: count }, () => el('col', { style: `width:${cellW}px` }))));
    table.appendChild(colgroup);
    // Phase band — consecutive same-phase lessons merged into one colspan'd
    // cell rather than one <td> per lesson, so 96 columns don't need 96 tiny
    // borders to read as a band.
    const byNumAsc = model.curriculum.byNumAsc || model.curriculum.lessons.filter(l => l.num != null).sort((a, b) => a.num - b.num);
    const segs = [];
    byNumAsc.forEach(l => {
      const c = l.phase ? l.phase.c : '#6b7280', label = l.phase ? l.phase.label : 'Other';
      const last = segs[segs.length - 1];
      if (last && last.c === c) last.n++; else segs.push({ c, label, n: 1 });
    });
    const phaseRow = el('tr', {}, [el('td', { style: 'padding:0' }, [''])].concat(
      segs.map(sg => el('td', { colspan: sg.n, style: `background:${sg.c};height:9px;padding:0;`, title: sg.label }, []))));
    table.appendChild(el('thead', {}, [phaseRow]));
    const tbody = el('tbody', {});
    Model.sortStudents(model.students, STATE.sortKey).forEach(sp => {
      const cells = [el('td', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 3px;font-size:7px;' }, [sp.shortName])];
      for (let n = 1; n <= count; n++) {
        const hit = (sp.flownByNum && sp.flownByNum[n]) || null;
        const bg = hit ? (hit[0].phase ? hit[0].phase.c : '#e88aff') : 'var(--v5-bd)';
        const retake = hit && hit.length > 1;
        cells.push(el('td', { style: `background:${bg};padding:0;height:8px;${retake ? 'box-shadow:inset 0 0 0 1px #38bdf8' : ''}` }, []));
      }
      tbody.appendChild(el('tr', {}, cells));
    });
    table.appendChild(tbody);
    return el('div', {}, [
      el('div', { style: 'font-size:9px;color:var(--v5-tx3);margin-bottom:4px' }, [`${count} lessons × ${model.students.length} SP · phase-colored when completed, grey when not; blue outline = retaken.`]),
      table,
    ]);
  }

  function buildReportSheet(theme) {
    const model = MODEL;
    // Report defaults to DARK, matching the site's own cockpit theme (round-3
    // feedback: "Change them to be dark theme corresponding to the site
    // theme"). 'light' is kept reachable (not currently exposed by a UI
    // toggle) since the print stylesheet forces a light/ink-friendly page
    // regardless of this class — see the @media print override in
    // cohort-v5.css.
    const isLight = theme === 'light';
    const sheet = el('div', { class: 'v5-report-sheet' + (isLight ? ' v5-report-light' : '') });
    sheet.appendChild(el('h1', {}, ['AP127 Progress Report']));
    sheet.appendChild(el('div', { class: 'v5-report-meta' }, [`Batch AP-127 · CATC CPL/IR Integrated Course · Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Data as of ${fd(model.asOf)}${model.isLive ? ' (live)' : ' (time travel)'}`]));

    const scBlock = Model.selfCheck(model);
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [
      el('div', { style: 'font-size:10px;color:' + (scBlock.pass ? '#16a34a' : '#dc2626') }, [`Self-check: ${scBlock.checks.filter(c => c.pass).length}/${scBlock.checks.length} invariants pass. All hours below use the standard curriculum duration per lesson (HOURS = EFFECTIVE), credited once per lesson even on a retake.`]),
    ]));

    sheet.appendChild(el('h2', {}, ['Executive summary']));
    const kpiGrid = el('div', { class: 'v5-report-kpis' });
    layoutCfg.current.kpis.forEach(key => { const def = KPI_DEFS[key]; if (!def) return; const d = def(model); kpiGrid.appendChild(el('div', { class: 'v5-report-kpi' }, [el('div', { class: 'l' }, [d.label]), el('div', { class: 'v' }, [d.fmt(d.value)]), el('div', { style: 'font-size:8px;color:var(--v5-tx3)' }, [d.sub()])])); });
    sheet.appendChild(kpiGrid);
    // Batch hours-done / total-hours-required + hours remaining — the report's
    // KPI tiles are admin-configurable and can omit this, so it's spelled out
    // explicitly here regardless of which tiles are picked (round-3 feedback).
    const bhDone = model.batch.hoursDone, bhTotal = model.batch.hourSlots, bhRem = Math.max(0, bhTotal - bhDone);
    sheet.appendChild(el('div', { class: 'v5-report-block', style: 'font-size:10.5px;color:var(--v5-tx2)' }, [
      `Hours done: `, el('b', {}, [fH(bhDone) + ' / ' + fH(bhTotal)]), ` (${bhTotal ? (bhDone / bhTotal * 100).toFixed(1) : '0.0'}%) · Remaining: `, el('b', {}, [fH(bhRem)]),
    ]));
    const insights = generateInsights(model);
    if (insights.length) {
      const ul = el('div', { style: 'font-size:10px;line-height:1.7' });
      insights.slice(0, 3).forEach(it => ul.appendChild(el('div', {}, ['• ' + it.headline + ' — ' + it.detail])));
      sheet.appendChild(el('div', { class: 'v5-report-block' }, [ul]));
    }

    sheet.appendChild(el('h2', {}, ['Pace vs target']));
    const pace = model.pace, act = model.actualPace;
    const ptbl = el('table', {}, [el('thead', {}, [el('tr', {}, ['Period', 'Required (h)', 'Actual (h)', 'Gap (h)'].map(t => el('th', {}, [t])))]),
      el('tbody', {}, [['Month', pace && pace.reqMonthHrsB, act.actMonthHrsB], ['Week', pace && pace.reqWeekHrsB, act.actWeekHrsB], ['Day', pace && pace.reqDayHrsB, act.actDayHrsB]].map(([l, req, actv]) =>
        el('tr', {}, [el('td', {}, [l]), el('td', {}, [req == null ? '—' : fH(req)]), el('td', {}, [fH(actv)]), el('td', {}, [req == null ? '—' : signed(actv - req, fH)])])))]);
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [ptbl]));

    sheet.appendChild(el('h2', {}, ['Roster']));
    // Report roster drops Call sign / Last lesson / Day Δ / vs target — round-3
    // feedback ("Remove these columns...") — without touching the live People
    // panel's own admin-configurable column set, which keeps them.
    const REPORT_HIDE_COLS = ['nick', 'lastLesson', 'dayDelta', 'vsTarget'];
    const reportCols = layoutCfg.current.columns.filter(c => !REPORT_HIDE_COLS.includes(c));
    const rtbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, reportCols.map(c => el('th', {}, [COL_DEFS[c] ? COL_DEFS[c].label : c])))]),
      el('tbody', {}, Model.sortStudents(model.students, STATE.sortKey).map((s, i) => el('tr', {}, reportCols.map(c => el('td', { html: COL_DEFS[c] ? COL_DEFS[c].render(s, i) : '' }))))),
    ]);
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [rtbl]));

    // Charts — each rendered into its OWN fresh, offscreen canvas at report
    // width via the same config builder the live panel uses, then destroyed.
    // Deliberately NOT reading CHARTS[id]/the live on-screen instance: that
    // canvas only exists while its section happens to be the one currently
    // mounted (switching sections destroys it), so the report would silently
    // drop a chart whenever it was built from a different section — caught
    // live while verifying this against Calendar-section-active state.
    sheet.appendChild(el('h2', {}, ['Progress vs plan']));
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [renderOffscreenChartImg(progressChartCfg(model), 660, 300)]));
    sheet.appendChild(el('h2', {}, ['Output']));
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [renderOffscreenChartImg(outputChartCfg(model), 660, 260)]));

    // Individual Lead/Lag vs Plan (ref V4) — every SP's own gap-to-plan line,
    // forced to per-SP/gap regardless of whatever the live command bar is
    // currently set to, so the report always carries this view (round-3
    // feedback: "Add lead/lag chart (ref to V4)").
    sheet.appendChild(el('h2', {}, ['Individual lead/lag vs plan']));
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [
      el('div', { style: 'font-size:9px;color:var(--v5-tx3);margin-bottom:4px' }, ['Hours behind plan per SP over time (floored at 0 — a lead reads as flat zero).']),
      renderOffscreenChartImg(progressChartCfg(model, { level: 'gap', scope: 'sp', students: model.students }), 660, 300),
    ]));

    // Lesson Completion Matrix (ref V4) — SP × lesson-number, phase-colored,
    // fit to report width rather than cropped/rotated (round-3 feedback).
    sheet.appendChild(el('h2', {}, ['Lesson completion matrix']));
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [buildReportLessonMatrix(model)]));

    // No page number here — this single footer div is part of the flowing
    // sheet content, so it only physically appears once (at the very bottom),
    // not once per printed/exported page. Print gets real running page
    // numbers from the browser's own print dialog; the raster PDF download
    // path draws its own correct per-page footer directly (downloadReportPdf).
    sheet.appendChild(el('div', { class: 'v5-report-footer' }, [el('span', {}, ['AP127 Progress Report' + (model.isLive ? ' — LIVE' : ' — time-travel as of ' + fd(model.asOf))]), el('span', {}, ['End of report'])]));
    // Palette snapshot: force every color on the sheet through resolveColorToRgb
    // so nothing here is oklch()/color-mix() at export time.
    $$('*', sheet).concat([sheet]).forEach(node => {
      const cs = getComputedStyle(node);
      ['color', 'backgroundColor', 'borderColor'].forEach(prop => { const v = cs[prop]; if (v && /oklch|color-mix/.test(v)) node.style[prop] = resolveColorToRgb(v); });
    });
    return sheet;
  }

  function openReportPreview() {
    closeReportPreview();
    const ov = el('div', { class: 'v5-report-ov show', id: 'd127v5-report-ov' });
    const bar = el('div', { class: 'v5-report-toolbar' });
    bar.appendChild(el('button', { class: 'v5-btn', onclick: () => window.print() }, ['🖨 Print / Save as PDF']));
    bar.appendChild(el('button', { class: 'v5-btn v5-primary', onclick: downloadReportPdf }, ['⤓ Download PDF']));
    bar.appendChild(el('button', { class: 'v5-btn', onclick: closeReportPreview }, ['Close']));
    ov.appendChild(bar);
    ov.appendChild(buildReportSheet('dark'));
    document.body.appendChild(ov);
  }
  function closeReportPreview() { $$('#d127v5-report-ov').forEach(n => n.remove()); }

  // html2canvas clones the WHOLE document when asked to capture one element
  // (needed to resolve stacking contexts/iframes correctly) — so even though
  // the report sheet's own nodes are palette-snapshotted to plain rgb() by
  // buildReportSheet(), html2canvas still walks the REST of the live page
  // during that clone and trips over this app's oklch()-based theme.css the
  // moment it reaches an unrelated element. Confirmed live: capture failed
  // with html2canvas's own "unsupported color function oklch" error even
  // though the sheet itself never showed one. Fixed by capturing from an
  // ISOLATED iframe that only ever contains cohort-v5.css (hex/rgb only, no
  // app theme) — html2canvas's clone then never has an oklch() value to trip
  // on in the first place, in that document or any other.
  async function captureReportSheetCanvas(sheetEl) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + (sheetEl.offsetWidth + 40) + 'px;height:' + (sheetEl.scrollHeight + 40) + 'px;border:0;';
    document.body.appendChild(iframe);
    try {
      const idoc = iframe.contentDocument;
      idoc.open(); idoc.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff"></body></html>'); idoc.close();
      let cssText = '';
      try { cssText = await fetch('css/cohort-v5.css').then(r => r.ok ? r.text() : ''); } catch (e) {}
      const style = idoc.createElement('style'); style.textContent = cssText; idoc.head.appendChild(style);
      const clone = sheetEl.cloneNode(true);
      clone.style.margin = '0'; clone.style.boxShadow = 'none';
      idoc.body.appendChild(clone);
      await new Promise(r => setTimeout(r, 60)); // let the iframe lay out before measuring/capturing
      return await window.html2canvas(clone, { scale: 1.75, backgroundColor: '#ffffff', windowWidth: clone.scrollWidth, windowHeight: clone.scrollHeight });
    } finally {
      iframe.remove();
    }
  }
  async function downloadReportPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.html2canvas) { toast('PDF library not loaded', 'er'); return; }
    toast('Building PDF…');
    try {
      const sheet = $('.v5-report-sheet');
      const canvas = await captureReportSheetCanvas(sheet);
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
      const imgW = pageW, imgH = canvas.height * (imgW / canvas.width);
      const img = canvas.toDataURL('image/png');
      // Reserve a real footer band on every page (not baked into the sheet's
      // own captured image, which only carries ONE static "Page 1" footer
      // that lands wherever the raster slice happens to cut it — confirmed
      // live: it showed up on the LAST physical page still reading "Page 1").
      // Content is sliced to leave this band blank, then jsPDF draws a real,
      // per-page running footer with the correct page number over it.
      const FOOTER_H = 26;
      const contentH = pageH - FOOTER_H;
      const totalPages = Math.max(1, Math.ceil(imgH / contentH));
      const footerLabel = 'AP127 Progress Report' + (MODEL.isLive ? ' — LIVE' : ' — time-travel as of ' + fd(MODEL.asOf));
      for (let p = 1; p <= totalPages; p++) {
        if (p > 1) doc.addPage();
        doc.addImage(img, 'PNG', 0, -(p - 1) * contentH, imgW, imgH, undefined, 'MEDIUM');
        doc.setDrawColor(224, 224, 224); doc.line(24, pageH - FOOTER_H + 6, pageW - 24, pageH - FOOTER_H + 6);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 140, 140);
        doc.text(footerLabel, 24, pageH - 10);
        doc.text(`Page ${p} / ${totalPages}`, pageW - 24, pageH - 10, { align: 'right' });
      }
      doc.save(`AP127_V5_Report_${MODEL.asOf}.pdf`);
      toast('PDF downloaded');
    } catch (e) { console.error(e); toast('PDF export failed — try Print instead', 'er'); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dev-only V4 <-> V5 parity harness
  // ─────────────────────────────────────────────────────────────────────────
  function ap127V5ParityV5() {
    if (!MODEL) { console.warn('V5 not mounted'); return; }
    const rows = [];
    MODEL.students.forEach(s => {
      const flownAll = (s.ref.flown || []);
      const lessonsMap = {}; MODEL.curriculum.lessons.forEach(l => { lessonsMap[l.lesson] = l.plannedMins; });
      const v4Hours = flownAll.reduce((a, f) => a + (lessonsMap[f.lesson] || f.actual_mins || f.mins || 0), 0) / 60;
      const v4Done = flownAll.length;
      rows.push({ name: s.name, v4Hours: +v4Hours.toFixed(2), v5HoursLogged: +s.hoursLogged.toFixed(2), v5HoursEffective: +s.hoursEffective.toFixed(2), v4Done, v5Records: s.flightRecords, v5Lessons: s.lessonsCompleted });
    });
    console.table(rows);
    const badLogged = rows.filter(r => Math.abs(r.v4Hours - r.v5HoursLogged) > 0.01);
    const badRecords = rows.filter(r => r.v4Done !== r.v5Records);
    console.log(badLogged.length ? 'MISMATCH in hoursLogged (should be 0):' : 'hoursLogged matches V4 exactly for all SP.', badLogged);
    console.log(badRecords.length ? 'MISMATCH in flightRecords (should be 0):' : 'flightRecords matches V4 exactly for all SP.', badRecords);
    return rows;
  }
  window.ap127V5ParityV5 = ap127V5ParityV5;

  // ─────────────────────────────────────────────────────────────────────────
  // Mount / shell
  // ─────────────────────────────────────────────────────────────────────────
  function applyShareLinkIfPresent() {
    try {
      const p = new URLSearchParams(location.search).get('v5layout');
      if (!p) return;
      const cfg = Layout.decodeShareLink(p);
      if (cfg) { layoutCfg.current = cfg; toast('Loaded shared layout'); }
    } catch (e) {}
  }
  function applyDeepLinkSectionIfPresent() {
    try {
      const p = new URLSearchParams(location.search).get('v5section');
      if (p && layoutCfg.current.sections.some(s => s.id === p)) STATE.section = p;
    } catch (e) {}
  }

  function buildShell(root) {
    root.classList.add('ap127-v5');
    if (layoutCfg.current.density === 'compact') root.classList.add('v5-compact');
    root.style.setProperty('--v5-scale', String(layoutCfg.current.chartScale || 1));
    buildCommandBar(root);
    root.appendChild(el('nav', { id: 'd127v5-sections', class: 'v5-sections', 'aria-label': 'AP127 Detail V5 sections' }));
    const bodyWrap = el('div', { id: 'd127v5-body', class: 'v5-body' });
    bodyWrap.appendChild(el('div', { id: 'd127v5-grid', class: 'v5-grid' }));
    root.appendChild(bodyWrap);
    const sc = el('div', { id: 'd127v5-selfcheck', class: 'v5-selfcheck' });
    const scHd = el('div', { class: 'v5-selfcheck-hd', onclick: () => sc.classList.toggle('open') });
    const scBody = el('div', { class: 'v5-selfcheck-body' });
    sc.appendChild(scHd); sc.appendChild(scBody);
    root.appendChild(sc);
    renderSectionTabs();
    renderSelfCheck();
    renderGrid();
  }

  function CohortViewV5() {
    const d = window.useApp ? window.useApp() : (window.useData ? window.useData() : null);
    const data = React.useContext ? d : d; // useApp/useData both return context value already
    const ref = React.useRef(null);
    React.useEffect(() => {
      if (!ref.current) return;
      applyShareLinkIfPresent();
      applyDeepLinkSectionIfPresent();
      RAW = { students: data.students || [], curriculum: data.curriculum || [], updatedAt: data.progressMeta && data.progressMeta.updated };
      rebuildModel();
      ref.current.innerHTML = '';
      buildShell(ref.current);
      ROOT_EL = ref.current;
      return () => { Object.keys(MOUNTS).forEach(destroyPanel); closePopovers(); closeSPDrawer(); closeCustomise(); closeReportPreview(); };
    }, [data.students, data.curriculum]);
    return h('div', { className: 'ap127-progress-v5-outer', ref, style: { height: '100%', overflow: 'hidden' } });
  }
  window.CohortViewV5 = CohortViewV5;
})();
