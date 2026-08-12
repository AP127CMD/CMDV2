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
    };
    // Lazy mount via IntersectionObserver — only the panels actually scrolled
    // into view build a chart/canvas. Falls back to immediate mount if IO is
    // unavailable.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { mountNow(); io.disconnect(); } }, { root: $('#d127v5-body'), rootMargin: '200px' });
      io.observe(wrap);
      MOUNTS[cfg.id] = { el: body, handle: null, io, cfg, sectionId, mounted: false };
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

  function buildCommandBar(root) {
    const bar = el('div', { class: 'v5-cmdbar' });
    bar.appendChild(el('div', { class: 'v5-brand' }, [h ? null : null, 'AP', el('b', {}, ['127']), ' V5']));
    // Unit
    const unitSet = el('div', { class: 'v5-chipset' });
    [['hours', 'Hours'], ['lessons', 'Lessons']].forEach(([v, l]) => unitSet.appendChild(el('button', { class: 'v5-chip', 'data-unit': v, onclick: () => setUnit(v) }, [l])));
    bar.appendChild(unitSet);
    // Scope
    const scopeAnchor = el('div', { class: 'v5-chipset v5-popover-anchor' });
    scopeAnchor.appendChild(el('button', { class: 'v5-chip', 'data-scope': 'batch', onclick: () => setScope('batch') }, ['Batch']));
    scopeAnchor.appendChild(el('button', { class: 'v5-chip', 'data-scope': 'per-sp', onclick: () => setScope('per-sp') }, ['Per-SP']));
    scopeAnchor.appendChild(el('button', { class: 'v5-chip', 'data-scope': 'sp', onclick: (e) => buildScopePopover(scopeAnchor) }, ['SP…']));
    bar.appendChild(scopeAnchor);
    // Range
    const rangeSet = el('div', { class: 'v5-chipset' });
    [[30, '30D'], [60, '60D'], [90, '90D'], [0, 'All']].forEach(([v, l]) => rangeSet.appendChild(el('button', { class: 'v5-chip', 'data-range': v, onclick: () => setRange(v) }, [l])));
    bar.appendChild(rangeSet);
    // Time machine
    const timeAnchor = el('div', { class: 'v5-popover-anchor' });
    const liveChip = el('button', { id: 'd127v5-live', class: 'v5-live', onclick: () => buildTimePopover(timeAnchor) }, ['● live']);
    timeAnchor.appendChild(liveChip);
    bar.appendChild(timeAnchor);
    // Search
    bar.appendChild(el('input', { class: 'v5-search', placeholder: 'Search roster…', oninput: e => setSearch(e.target.value) }));
    bar.appendChild(el('span', { class: 'v5-spacer' }));
    // Actions
    const actions = el('div', { class: 'v5-chipset' });
    actions.appendChild(el('button', { id: 'd127v5-story-btn', class: 'v5-chip', onclick: toggleReplay, title: 'Animate through the batch’s history' }, ['▶ Story']));
    actions.appendChild(el('button', { class: 'v5-chip', onclick: openCustomise, title: 'Customise this page’s layout' }, ['⚙ Customise']));
    actions.appendChild(el('button', { class: 'v5-chip', onclick: openReportPreview, title: 'Preview and export a report that looks like this page' }, ['⤓ PDF']));
    actions.appendChild(el('button', { class: 'v5-chip', onclick: () => { setAsOf(null); toast('Refreshed'); }, title: 'Return to live data' }, ['⟳']));
    bar.appendChild(actions);
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
  registerPanelV5({
    id: 'kpis', title: 'Headline', estHeight: 90, deps: ['unit', 'scope', 'range', 'asOf'],
    mount(container, model) {
      const row = el('div', { class: 'v5-kpirow' });
      layoutCfg.current.kpis.forEach(key => {
        const def = KPI_DEFS[key]; if (!def) return;
        const d = def(model);
        const tile = el('div', { class: 'v5-kpi', onclick: () => goSection(d.section || 'pulse') }, [
          el('div', { class: 'v5-kpi-l' }, [d.label]),
          el('div', { class: 'v5-kpi-v', 'data-kpi': key, style: 'color:' + d.color }, [typeof d.value === 'number' ? '0' : d.fmt(d.value)]),
          el('div', { class: 'v5-kpi-s' }, [d.sub()]),
        ]);
        row.appendChild(tile);
      });
      container.appendChild(row);
      layoutCfg.current.kpis.forEach(key => {
        const def = KPI_DEFS[key]; if (!def) return;
        const d = def(model);
        const vEl = $('.v5-kpi-v[data-kpi="' + key + '"]', row);
        if (vEl && typeof d.value === 'number') {
          const prev = KPI_PREV[key] == null ? 0 : KPI_PREV[key];
          const dp = key === 'progress' ? 1 : 0;
          tweenNumber(vEl, prev, d.value, dp, () => {
            vEl.textContent = d.fmt(d.value);
            vEl.classList.add('v5-flash');
            setTimeout(() => vEl.classList.remove('v5-flash'), 500);
          });
          KPI_PREV[key] = d.value;
        } else if (vEl) vEl.textContent = d.fmt(d.value);
      });
      return { row };
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
      table.appendChild(el('thead', {}, [el('tr', {}, [el('th', {}, ['Period']), el('th', {}, ['Req']), el('th', {}, ['Act']), el('th', {}, ['Gap'])])]));
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
    return new window.Chart(ctx, cfg);
  }
  registerPanelV5({
    id: 'progress-chart', title: 'Progress vs plan', estHeight: 340, deps: ['unit', 'scope', 'search', 'asOf'],
    subtitle: () => 'replaces V4’s Combined Progress / Batch Lagging / Actual vs Planned / Individual Lead-Lag',
    toolbar(bar) {
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.progressLevel === 'level' ? ' on' : ''), onclick: () => { STATE.progressLevel = 'level'; updatePanel('progress-chart'); refreshToolbarSel(bar); } }, ['Level']));
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.progressLevel === 'gap' ? ' on' : ''), onclick: () => { STATE.progressLevel = 'gap'; updatePanel('progress-chart'); refreshToolbarSel(bar); } }, ['Gap']));
      function refreshToolbarSel(b) { $$('.v5-chip', b).forEach(c => c.classList.toggle('on', c.textContent === (STATE.progressLevel === 'level' ? 'Level' : 'Gap'))); }
    },
    mount(container, model) {
      container.appendChild(el('div', { style: 'position:relative;height:320px' }, [el('canvas', { id: 'd127v5-progress-chart' })]));
      this.update(null, model);
      return {};
    },
    update(_h, model) {
      CHARTS['progress-chart'] = mkChart('d127v5-progress-chart', progressChartCfg(model));
    },
    destroy() { if (CHARTS['progress-chart']) { CHARTS['progress-chart'].destroy(); delete CHARTS['progress-chart']; } },
  });
  // Standalone chart-config builder — used by the live panel's update() above
  // AND by the report sheet (buildReportSheet), so the report can render this
  // chart even when the Trend section isn't the one currently mounted (its
  // canvas/Chart.js instance only exists while that section is on screen;
  // the report must be complete regardless of which section the user is on).
  function progressChartCfg(model) {
    const isHrs = STATE.unit === 'hours';
    const s = isHrs ? model.series.hours : model.series.lessons;
    const isBatch = STATE.scope !== 'per-sp';
    const datasets = [];
    if (STATE.progressLevel === 'level') {
      datasets.push({ label: 'Plan', data: s.plan, borderColor: '#cbd5e1', borderDash: [6, 4], borderWidth: 1.4, pointRadius: 0, tension: 0, order: 3 });
      const targetSeries = isHrs ? model.series.target.hours : model.series.target.lessons;
      if (targetSeries.length) datasets.push({ label: 'Target', data: targetSeries, borderColor: '#f43f5e', borderDash: [5, 2], borderWidth: 2, pointRadius: 2, pointBackgroundColor: '#f43f5e', tension: 0, order: 1.5 });
      if (isBatch) {
        datasets.push({ label: 'Actual', data: s.actual, borderColor: '#e88aff', borderWidth: 2.4, pointRadius: 0, tension: 0, order: 1 });
      } else {
        scopedStudents().forEach(sp => {
          const flown = sp.flown.slice().sort((a, b) => a.date.localeCompare(b.date));
          let acc = 0;
          const data = flown.map(f => ({ x: f.date, y: +(acc += (isHrs ? f.effMins / 60 : 1)).toFixed(2) }));
          datasets.push({ label: sp.shortName, data, borderColor: `hsla(${sp.hue},85%,62%,0.85)`, borderWidth: 1.2, pointRadius: 0, tension: 0, order: 2 });
        });
      }
    } else {
      datasets.push({ label: 'Zero', data: s.lag.map(p => ({ x: p.x, y: 0 })), borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, pointRadius: 0, order: 5 });
      if (isBatch) {
        datasets.push({ label: 'Batch lag', data: s.lag, borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, tension: .12, fill: { target: { value: 0 }, above: 'rgba(239,68,68,0.14)' }, order: 1 });
      } else {
        const plannedByDate = model.curriculum.planByDate;
        scopedStudents().forEach(sp => {
          let ra = 0, rp = 0; const dates = [...new Set([...sp.flown.map(f => f.date), ...Object.keys(plannedByDate)])].filter(d => d <= model.asOf).sort();
          const data = dates.map(d => {
            ra += (sp.flownByDate[d] || []).reduce((a, f) => a + (isHrs ? f.effMins / 60 : 1), 0);
            rp += isHrs ? (plannedByDate[d] || 0) / 60 : (model.curriculum.planLessonCountByDate[d] || 0);
            return { x: d, y: +(rp - ra).toFixed(2) };
          });
          datasets.push({ label: sp.shortName, data, borderColor: `hsla(${sp.hue},85%,62%,0.85)`, borderWidth: 1.2, pointRadius: 0, tension: 0, order: 2 });
        });
      }
    }
    return {
      type: 'line', data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false, parsing: { xAxisKey: 'x', yAxisKey: 'y' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: isBatch || STATE.progressLevel === 'level' && datasets.length <= 8, labels: { color: '#8b949e', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 14 } },
          tooltip: { callbacks: { title: c => { const r = c[0] && c[0].raw; return r ? fd(r.x) : ''; }, label: c => c.dataset.label === 'Zero' ? null : `${c.dataset.label}: ${fUnit(c.raw.y, STATE.unit)}` } },
        },
        scales: {
          x: { type: 'time', time: { unit: 'month', displayFormats: { day: 'd MMM', week: 'd MMM', month: 'MMM yy' } }, ticks: { font: { family: 'JetBrains Mono', size: 8 }, color: '#6e7681', maxTicksLimit: 12 }, grid: { color: '#21262d' } },
          y: { beginAtZero: STATE.progressLevel === 'gap', ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#8b949e' }, grid: { color: '#21262d' } },
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
      container.appendChild(el('div', { style: 'position:relative;height:260px' }, [el('canvas', { id: 'd127v5-output' })]));
      this.update(null, model);
      return {};
    },
    update(_h, model) {
      CHARTS.output = mkChart('d127v5-output', outputChartCfg(model));
    },
    destroy() { if (CHARTS.output) { CHARTS.output.destroy(); delete CHARTS.output; } },
  });
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
    datasets.push({ type: 'line', label: 'Moving avg', data: out.ma, borderColor: '#38bdf8', borderWidth: 1.6, pointRadius: 0, tension: .2, order: -1 });
    // Required-pace overlay on the latest CLOSED period.
    const pace = model.pace;
    if (pace && out.gapIdx >= 0) {
      const reqPer = STATE.lbPeriod === 'day' ? pace.reqDayHrsB : STATE.lbPeriod === 'week' ? pace.reqWeekHrsB : pace.reqMonthHrsB;
      const reqPerL = STATE.lbPeriod === 'day' ? pace.reqDayLesB : STATE.lbPeriod === 'week' ? pace.reqWeekLesB : pace.reqMonthLesB;
      const req = STATE.unit === 'hours' ? reqPer : reqPerL;
      if (req != null) {
        datasets.push({ type: 'line', label: 'Required', data: out.values.map((_, i) => i === out.gapIdx ? req : null), borderColor: '#f43f5e', pointRadius: 4, pointBackgroundColor: '#f43f5e', showLine: false, order: -2 });
      }
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
      container.appendChild(el('div', { style: 'position:relative;height:220px' }, [el('canvas', { id: 'd127v5-streaks' })]));
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
      container.appendChild(el('div', { style: 'position:relative;height:200px' }, [el('canvas', { id: 'd127v5-distribution' })]));
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
  // Canvas grid engine — shared by Curriculum Grid + Activity Calendar. Rows =
  // SP, drawn on one canvas (no per-cell DOM nodes — this is what actually
  // fixes the scroll lag V4 had from its two ~5,000-node heatmap tables).
  // Hit-testing maps pointer coordinates back to (row, col) against the same
  // index the draw pass used.
  // ─────────────────────────────────────────────────────────────────────────
  function attachCanvasGrid(canvas, opts) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = opts.width * dpr; canvas.height = opts.height * dpr;
    canvas.style.width = opts.width + 'px'; canvas.style.height = opts.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    opts.draw(ctx);
    let tip = null;
    const showTip = (x, y, text) => {
      if (!tip) { tip = el('div', { class: 'v5-gridtip' }); document.body.appendChild(tip); }
      tip.textContent = text; tip.style.left = (x + 14) + 'px'; tip.style.top = (y + 14) + 'px'; tip.style.display = 'block';
    };
    const hideTip = () => { if (tip) tip.style.display = 'none'; };
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      const hit = opts.hitTest(e.clientX - r.left, e.clientY - r.top);
      if (hit && hit.title) { showTip(e.clientX, e.clientY, hit.title); canvas.style.cursor = hit.clickable ? 'pointer' : 'default'; }
      else { hideTip(); canvas.style.cursor = 'default'; }
    });
    canvas.addEventListener('mouseleave', hideTip);
    canvas.addEventListener('click', e => {
      const r = canvas.getBoundingClientRect();
      const hit = opts.hitTest(e.clientX - r.left, e.clientY - r.top);
      if (hit && hit.clickable && opts.onClick) opts.onClick(hit);
    });
    return { ctx, destroy() { if (tip) tip.remove(); } };
  }

  // ── PANEL: Curriculum Grid (Syllabus) ──────────────────────────────────────
  registerPanelV5({
    id: 'curriculum-grid', title: 'Curriculum grid', estHeight: 460, deps: ['asOf', 'scope', 'search'],
    subtitle: m => `${m.curriculum.count} lessons × ${scopedStudents().length} SP`,
    toolbar(bar) {
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.gridMode === 'bars' ? ' on' : ''), onclick: () => { STATE.gridMode = 'bars'; updatePanel('curriculum-grid'); } }, ['Bars']));
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.gridMode === 'cells' ? ' on' : ''), onclick: () => { STATE.gridMode = 'cells'; updatePanel('curriculum-grid'); } }, ['Cells']));
    },
    mount(container, model) {
      const legend = el('div', { class: 'v5-legend' });
      model.segmentsDef.forEach(seg => legend.appendChild(el('span', {}, [el('span', { class: 'v5-dot2', style: 'background:' + seg.c }), seg.label + ' '])));
      container.appendChild(legend);
      const gridwrap = el('div', { class: 'v5-gridwrap' });
      container.appendChild(gridwrap);
      const handle = { gridwrap };
      this._draw(handle, model);
      return handle;
    },
    _draw(handle, model) {
      const gridwrap = handle.gridwrap; gridwrap.innerHTML = '';
      const sps = Model.sortStudents(scopedStudents(), 'vsTarget');
      if (!sps.length) { gridwrap.appendChild(el('div', { class: 'v5-empty' }, ['No students in scope'])); return; }
      const count = model.curriculum.count || 96;
      const cellW = Math.max(7, Math.min(14, Math.floor(900 / count)));
      const rowH = 20, nameW = 130, vsW = 44, headerH = 34;
      const width = nameW + vsW + count * cellW;
      const height = headerH + sps.length * rowH + 18; // +18 footer band
      const canvasHolder = el('div', { style: `position:relative;width:${width}px` });
      // pinned columns (name / vs target) drawn as HTML overlay, so canvas text
      // never has to be measured/wrapped
      const pinned = el('div', { style: `position:absolute;left:0;top:0;width:${nameW + vsW}px;z-index:2;background:var(--v5-s1)` });
      pinned.appendChild(el('div', { style: `height:${headerH}px` }));
      sps.forEach(s => pinned.appendChild(el('div', {
        style: `height:${rowH}px;display:flex;align-items:center;font-size:10px;padding-left:4px;border-bottom:1px solid var(--v5-bd2);cursor:pointer`,
        onclick: () => openSPDrawer(s.catc_id),
      }, [el('b', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, [s.shortName]), el('span', { class: 'v5-mono', style: 'width:' + vsW + 'px;text-align:right;color:' + (s.vsTarget == null ? 'var(--v5-tx3)' : s.vsTarget >= 0 ? 'var(--v5-good)' : 'var(--v5-rose)') }, [s.vsTarget == null ? '—' : signed(s.vsTarget, v => v + '')])])));
      canvasHolder.appendChild(pinned);
      const canvasWrap = el('div', { style: `margin-left:${nameW + vsW}px` });
      const canvas = el('canvas');
      canvasWrap.appendChild(canvas);
      canvasHolder.appendChild(canvasWrap);
      gridwrap.appendChild(canvasHolder);
      gridwrap.style.height = (height + 4) + 'px';

      const gridMode = STATE.gridMode;
      attachCanvasGrid(canvas, {
        width: count * cellW, height,
        draw(ctx) {
          // header: phase band
          model.segmentsDef.forEach(seg => {
            const lo = seg.lo, hi = Math.min(seg.hi, count);
            ctx.fillStyle = seg.c;
            ctx.fillRect((lo - 1) * cellW, 0, (hi - lo + 1) * cellW, headerH - 14);
          });
          ctx.fillStyle = '#0d1117'; ctx.font = '700 8px JetBrains Mono, monospace'; ctx.textAlign = 'center';
          for (let n2 = 1; n2 <= count; n2 += 5) ctx.fillText(String(n2), (n2 - 0.5) * cellW, headerH - 4);
          // target checkpoint flags
          model.targets.list.forEach(t => {
            const x = (t.lesson - 1) * cellW;
            ctx.strokeStyle = '#f43f5e'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
            ctx.beginPath(); ctx.moveTo(x + cellW / 2, headerH); ctx.lineTo(x + cellW / 2, height - 18); ctx.stroke(); ctx.setLineDash([]);
          });
          // rows
          sps.forEach((s, ri) => {
            const y = headerH + ri * rowH;
            if (gridMode === 'cells') {
              for (let n2 = 1; n2 <= count; n2++) {
                const flights = s.flownByNum[n2];
                const x = (n2 - 1) * cellW;
                ctx.fillStyle = flights ? Model.util.segmentOfNum(n2).c : (n2 === s.nextNum ? 'rgba(232,138,255,0.25)' : '#21262d');
                ctx.fillRect(x + 1, y + 1, cellW - 2, rowH - 2);
                if (flights && flights.length > 1) { ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(x + cellW - 3, y + 3, 2, 0, 7); ctx.fill(); }
              }
            } else {
              const done = s.lessonsCompleted;
              for (let n2 = 1; n2 <= done && n2 <= count; n2++) {
                const x = (n2 - 1) * cellW;
                ctx.fillStyle = Model.util.segmentOfNum(n2).c;
                ctx.fillRect(x + 1, y + 3, cellW - 2, rowH - 6);
              }
            }
          });
          // footer batch-% band
          const fy = height - 16;
          for (let n2 = 1; n2 <= count; n2++) {
            const doneCount = sps.filter(s => s.flownByNum[n2]).length;
            const pct = sps.length ? doneCount / sps.length : 0;
            ctx.fillStyle = `rgba(232,138,255,${0.12 + pct * 0.7})`;
            ctx.fillRect((n2 - 1) * cellW, fy, cellW - 1, 14);
          }
        },
        hitTest(px, py) {
          if (py < headerH || py > headerH + sps.length * rowH) return null;
          const ri = Math.floor((py - headerH) / rowH);
          const n2 = Math.floor(px / cellW) + 1;
          const s = sps[ri]; if (!s || n2 < 1 || n2 > count) return null;
          const flights = s.flownByNum[n2];
          const title = `${s.shortName} · Lesson ${n2}` + (flights ? `\n${flights.map(f => fd(f.date) + ' (' + Math.round(f.effMins) + 'm)').join(', ')}` : n2 === s.nextNum ? ' — next up' : ' — not yet flown');
          return { title, clickable: !!flights, spCatc: s.catc_id };
        },
        onClick(hit) { openSPDrawer(hit.spCatc); },
      });
    },
    update(handle, model) { this._draw(handle, model); },
  });

  // ── PANEL: Activity Calendar ──────────────────────────────────────────────
  registerPanelV5({
    id: 'activity-calendar', title: 'Activity calendar', estHeight: 460, deps: ['range', 'asOf', 'scope', 'search'],
    subtitle: m => STATE.range ? `Last ${STATE.range}d` : `All time · since ${fdShort(m.batchStart)}`,
    toolbar(bar) {
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.calGroupBy === 'none' ? ' on' : ''), onclick: () => { STATE.calGroupBy = 'none'; updatePanel('activity-calendar'); } }, ['No group']));
      bar.appendChild(el('button', { class: 'v5-chip' + (STATE.calGroupBy === 'instructor' ? ' on' : ''), onclick: () => { STATE.calGroupBy = 'instructor'; updatePanel('activity-calendar'); } }, ['By instructor']));
    },
    mount(container, model) {
      const gridwrap = el('div', { class: 'v5-gridwrap' });
      container.appendChild(gridwrap);
      const handle = { gridwrap };
      this._draw(handle, model);
      return handle;
    },
    _draw(handle, model) {
      const gridwrap = handle.gridwrap; gridwrap.innerHTML = '';
      let sps = Model.sortStudents(scopedStudents(), 'name');
      const start = rangeStart(), end = model.asOf;
      const days = U.datesRange(start, end);
      if (!sps.length || !days.length) { gridwrap.appendChild(el('div', { class: 'v5-empty' }, ['No data in range'])); return; }
      const cellW = Math.max(6, Math.min(15, Math.floor(760 / days.length)));
      const rowH = 18, nameW = 150, totalW = 76, headerH = 26;
      let rowsMeta = sps.map(s => ({ s, header: null }));
      if (STATE.calGroupBy === 'instructor') {
        const byFI = {}; sps.forEach(s => (byFI[s.fiFull || 'Unassigned'] = byFI[s.fiFull || 'Unassigned'] || []).push(s));
        rowsMeta = [];
        Object.keys(byFI).sort((a, b) => byFI[b].length - byFI[a].length).forEach(fi => {
          rowsMeta.push({ s: null, header: fi + ' · ' + byFI[fi].length + ' SP' });
          byFI[fi].forEach(s => rowsMeta.push({ s, header: null }));
        });
      }
      const height = headerH + rowsMeta.length * rowH;
      const holder = el('div', { style: `position:relative;width:${nameW + totalW + days.length * cellW}px` });
      const pinned = el('div', { style: `position:absolute;left:0;top:0;width:${nameW + totalW}px;z-index:2;background:var(--v5-s1)` });
      pinned.appendChild(el('div', { style: `height:${headerH}px` }));
      rowsMeta.forEach(r => {
        if (r.header) { pinned.appendChild(el('div', { style: `height:${rowH}px;display:flex;align-items:center;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--v5-tx3);text-transform:uppercase;padding-left:4px` }, [r.header])); return; }
        const inRange = r.s.flown.filter(f => f.date >= start && f.date <= end);
        const hrs = inRange.reduce((a, f) => a + f.effMins / 60, 0);
        pinned.appendChild(el('div', {
          style: `height:${rowH}px;display:flex;align-items:center;font-size:10px;padding-left:4px;border-bottom:1px solid var(--v5-bd2);cursor:pointer`, onclick: () => openSPDrawer(r.s.catc_id),
        }, [el('b', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, [r.s.shortName]), el('span', { class: 'v5-mono', style: `width:${totalW}px;text-align:right;color:var(--v5-tx3)` }, [inRange.length + 'L · ' + hrs.toFixed(1) + 'h'])]));
      });
      holder.appendChild(pinned);
      const canvasWrap = el('div', { style: `margin-left:${nameW + totalW}px` });
      const canvas = el('canvas'); canvasWrap.appendChild(canvas); holder.appendChild(canvasWrap);
      gridwrap.appendChild(holder); gridwrap.style.height = (height + 4) + 'px';

      const targetDates = new Set(model.targets.list.map(t => t.date));
      attachCanvasGrid(canvas, {
        width: days.length * cellW, height,
        draw(ctx) {
          // header: day-of-month labels on Mondays + month change
          let lastMonth = null;
          days.forEach((d, i) => {
            const dObj = new Date(d + 'T12:00:00Z'); const isMon = dObj.getUTCDay() === 1;
            const month = dObj.getUTCMonth(); const newMonth = month !== lastMonth; if (isMon || newMonth || i === 0) lastMonth = month;
            if (isMon || newMonth || i === 0 || cellW >= 14) {
              ctx.fillStyle = '#6e7681'; ctx.font = '8px JetBrains Mono, monospace'; ctx.textAlign = 'left';
              ctx.fillText(dObj.toLocaleDateString('en-GB', newMonth ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : { day: 'numeric', timeZone: 'UTC' }), i * cellW + 1, headerH - 12);
            }
            if (newMonth && i > 0) { ctx.strokeStyle = '#30363d'; ctx.beginPath(); ctx.moveTo(i * cellW, 0); ctx.lineTo(i * cellW, height); ctx.stroke(); }
            if (d === model.asOf) { ctx.fillStyle = 'rgba(56,189,248,0.08)'; ctx.fillRect(i * cellW, 0, cellW, height); }
            if (targetDates.has(d)) { ctx.strokeStyle = '#f43f5e'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(i * cellW, headerH); ctx.lineTo(i * cellW, height); ctx.stroke(); ctx.setLineDash([]); }
          });
          // rows
          rowsMeta.forEach((r, ri) => {
            const y = headerH + ri * rowH;
            if (r.header) return;
            let lastFlownIdx = -1, gapStart = -1;
            days.forEach((d, ci) => {
              const flights = r.s.flownByDate[d];
              const x = ci * cellW;
              if (flights && flights.length) {
                ctx.fillStyle = Model.util.phaseOfNum(flights[0].num).c;
                ctx.fillRect(x + 1, y + 1, cellW - 2, rowH - 2);
                if (lastFlownIdx >= 0 && ci - lastFlownIdx > 7) {
                  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
                  ctx.beginPath(); ctx.moveTo(lastFlownIdx * cellW + cellW / 2, y + rowH - 2); ctx.lineTo(ci * cellW + cellW / 2, y + rowH - 2); ctx.stroke();
                }
                lastFlownIdx = ci;
              }
            });
          });
        },
        hitTest(px, py) {
          if (py < headerH) return null;
          const ri = Math.floor((py - headerH) / rowH);
          const ci = Math.floor(px / cellW);
          const r = rowsMeta[ri]; if (!r || r.header || !days[ci]) return null;
          const d = days[ci]; const flights = r.s.flownByDate[d];
          const title = `${r.s.shortName} · ${fd(d)}` + (flights ? ': ' + flights.map(f => f.lesson).join(', ') : ': no flight');
          return { title, clickable: !!flights, spCatc: r.s.catc_id };
        },
        onClick(hit) { openSPDrawer(hit.spCatc); },
      });
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
  function toggleReplay() {
    if (STATE.replay && STATE.replay.playing) stopReplay();
    else startReplay();
  }
  function startReplay() {
    if (!MODEL) return;
    const days = U.datesRange(MODEL.batchStart, MODEL.todayBKK);
    if (days.length < 2) { toast('Not enough history to replay'); return; }
    const keySet = new Set();
    MODEL.targets.list.forEach(t => keySet.add(t.date));
    MODEL.students.forEach(s => MODEL.keyPoints.forEach(kp => { const f = s.flownByNum[kp.num]; if (f) keySet.add(f[0].date); }));
    // sample down to at most 90 frames for a smooth ~5-8s replay, always
    // including every key date so pauses land where they should
    const stride = Math.max(1, Math.floor(days.length / 90));
    const frames = [];
    for (let i = 0; i < days.length; i += stride) frames.push(days[i]);
    if (frames[frames.length - 1] !== days[days.length - 1]) frames.push(days[days.length - 1]);
    days.forEach(d => { if (keySet.has(d) && !frames.includes(d)) frames.push(d); });
    frames.sort();
    STATE.replay = { playing: true, idx: 0, frames, speed: 1, keySet };
    const btn = $('#d127v5-story-btn'); if (btn) { btn.textContent = '⏸ Pause'; btn.classList.add('on'); }
    stepReplay();
  }
  function stepReplay() {
    const r = STATE.replay; if (!r || !r.playing) return;
    setAsOf(r.frames[r.idx]);
    r.idx++;
    if (r.idx >= r.frames.length) { stopReplay(); return; }
    const pause = r.keySet.has(r.frames[r.idx - 1]) ? 1100 : 90;
    r._t = setTimeout(stepReplay, pause / r.speed);
  }
  function stopReplay() {
    if (STATE.replay) { clearTimeout(STATE.replay._t); STATE.replay.playing = false; }
    const btn = $('#d127v5-story-btn'); if (btn) { btn.textContent = '▶ Story'; btn.classList.remove('on'); }
    setAsOf(null);
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

  function buildReportSheet(theme) {
    const model = MODEL;
    const sheet = el('div', { class: 'v5-report-sheet' + (theme === 'dark' ? ' v5-report-dark' : '') });
    sheet.appendChild(el('h1', {}, ['AP127 Progress Report']));
    sheet.appendChild(el('div', { class: 'v5-report-meta' }, [`Batch AP-127 · CATC CPL/IR Integrated Course · Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Data as of ${fd(model.asOf)}${model.isLive ? ' (live)' : ' (time travel)'}`]));

    const scBlock = Model.selfCheck(model);
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [
      el('div', { style: 'font-size:10px;color:' + (scBlock.pass ? '#16a34a' : '#dc2626') }, [`Self-check: ${scBlock.checks.filter(c => c.pass).length}/${scBlock.checks.length} invariants pass. All hours below use the standard curriculum duration per lesson (HOURS = EFFECTIVE), credited once per lesson even on a retake.`]),
    ]));

    sheet.appendChild(el('h2', {}, ['Executive summary']));
    const kpiGrid = el('div', { class: 'v5-report-kpis' });
    layoutCfg.current.kpis.forEach(key => { const def = KPI_DEFS[key]; if (!def) return; const d = def(model); kpiGrid.appendChild(el('div', { class: 'v5-report-kpi' }, [el('div', { class: 'l' }, [d.label]), el('div', { class: 'v' }, [d.fmt(d.value)]), el('div', { style: 'font-size:8px;color:#8b949e' }, [d.sub()])])); });
    sheet.appendChild(kpiGrid);
    const insights = generateInsights(model);
    if (insights.length) {
      const ul = el('div', { style: 'font-size:10px;line-height:1.7' });
      insights.slice(0, 3).forEach(it => ul.appendChild(el('div', {}, ['• ' + it.headline + ' — ' + it.detail])));
      sheet.appendChild(el('div', { class: 'v5-report-block' }, [ul]));
    }

    sheet.appendChild(el('h2', {}, ['Pace vs target']));
    const pace = model.pace, act = model.actualPace;
    const ptbl = el('table', {}, [el('thead', {}, [el('tr', {}, ['Period', 'Req (h)', 'Act (h)', 'Gap (h)'].map(t => el('th', {}, [t])))]),
      el('tbody', {}, [['Month', pace && pace.reqMonthHrsB, act.actMonthHrsB], ['Week', pace && pace.reqWeekHrsB, act.actWeekHrsB], ['Day', pace && pace.reqDayHrsB, act.actDayHrsB]].map(([l, req, actv]) =>
        el('tr', {}, [el('td', {}, [l]), el('td', {}, [req == null ? '—' : fH(req)]), el('td', {}, [fH(actv)]), el('td', {}, [req == null ? '—' : signed(actv - req, fH)])])))]);
    sheet.appendChild(el('div', { class: 'v5-report-block' }, [ptbl]));

    sheet.appendChild(el('h2', {}, ['Roster']));
    const rtbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, layoutCfg.current.columns.map(c => el('th', {}, [COL_DEFS[c] ? COL_DEFS[c].label : c])))]),
      el('tbody', {}, Model.sortStudents(model.students, STATE.sortKey).map((s, i) => el('tr', {}, layoutCfg.current.columns.map(c => el('td', { html: COL_DEFS[c] ? COL_DEFS[c].render(s, i) : '' }))))),
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
    ov.appendChild(buildReportSheet('light'));
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
