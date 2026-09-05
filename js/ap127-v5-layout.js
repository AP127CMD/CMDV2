/* ============================================================================
 * AP127 V5 — LAYOUT CONFIG
 *
 * The dynamic-layout / admin-customise mechanism: one config object drives what
 * renders, in what order, at what size, on every section. "Customise" (in
 * js/view-cohort-v5.js) edits this object; the panel registry reads it.
 *
 * Persistence is honest about the static host (same reasoning as the existing
 * AP127 Targets editor in js/ap127-targets-data.js — this app is a static
 * Cloudflare Pages deploy with no writable backend):
 *   1. localStorage — instant, browser-local, with a local revision log
 *   2. share link (?v5layout=<base64url json>) — hand a tailored view to
 *      someone else with no deploy
 *   3. "export for commit" — pretty-print as the pasteable code default; git
 *      history on THIS file is the durable, shared revision record
 * ==========================================================================*/
(function (root) {
  'use strict';

  const VERSION = 1;
  const LS_LAYOUT_KEY = 'ap127v5Layout';
  const LS_LOG_KEY = 'ap127v5LayoutLog';

  // 12-column grid. Panel ids below must match what view-cohort-v5.js registers
  // via registerPanelV5(); an id with no matching registration is skipped
  // (forward/backward compatible — see validate()).
  const AP127_V5_LAYOUT_DEFAULT = {
    version: VERSION,
    preset: 'default',
    density: 'comfortable',           // 'comfortable' | 'compact'
    chartScale: 1,                    // 0.85 .. 1.3
    defaults: { unit: 'hours', scope: 'batch', range: 90, section: 'pulse' },
    kpis: ['progress', 'hoursDelta', 'lessonsDelta', 'vsTarget', 'atRisk', 'daysLeft'],
    columns: ['rank', 'name', 'nick', 'se', 'fi', 'progress', 'hours', 'lessons', 'lastLesson', 'lastFlt', 'idle', 'dayDelta', 'hrsDelta', 'vsTarget'],
    sections: [
      // 'kpis' (the Situation report) leads Pulse as of p176 — it is the key
      // situation report, so it comes before the Insight Reel rather than
      // after it. Panel ids are unchanged so saved layouts / share links
      // encoded against the old order still validate.
      { id: 'pulse', label: 'Pulse', icon: 'pulse', visible: true, panels: [
        { id: 'kpis', span: 12, visible: true, opts: {} },
        { id: 'reel', span: 12, visible: true, opts: { autoplay: true } },
        { id: 'pace', span: 12, visible: true, opts: {} },
        { id: 'watchlist', span: 12, visible: true, opts: {} },
      ] },
      { id: 'trend', label: 'Trend', icon: 'trend', visible: true, panels: [
        { id: 'progress-chart', span: 12, visible: true, opts: { level: 'level', scope: 'batch' } },
        { id: 'output', span: 12, visible: true, opts: {} },
        { id: 'streaks', span: 12, visible: true, opts: {} },
      ] },
      { id: 'people', label: 'Each SP', icon: 'people', visible: true, panels: [
        { id: 'roster', span: 8, visible: true, opts: {} },
        { id: 'distribution', span: 4, visible: true, opts: {} },
      ] },
      { id: 'syllabus', label: 'Syllabus', icon: 'syllabus', visible: true, panels: [
        { id: 'curriculum-grid', span: 12, visible: true, opts: {} },
      ] },
      { id: 'calendar', label: 'Calendar', icon: 'calendar', visible: true, panels: [
        { id: 'activity-calendar', span: 12, visible: true, opts: { groupBy: 'none' } },
      ] },
    ],
  };

  // Named presets. Each is a full config (not a diff) so switching is instant
  // and never depends on the currently-loaded one.
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function preset(name) {
    const base = clone(AP127_V5_LAYOUT_DEFAULT);
    if (name === 'director') {
      base.preset = 'director';
      base.density = 'comfortable'; base.chartScale = 1.15;
      base.defaults.section = 'pulse';
      base.sections.forEach(s => {
        if (s.id === 'people' || s.id === 'syllabus') s.visible = false;
        if (s.id === 'trend') s.panels = s.panels.filter(p => p.id !== 'streaks');
      });
      return base;
    }
    if (name === 'instructor') {
      base.preset = 'instructor';
      base.defaults.section = 'people';
      base.sections.forEach(s => { if (s.id === 'trend') s.visible = false; });
      return base;
    }
    if (name === 'full') {
      base.preset = 'full';
      return base; // every panel visible — the default already is V4-equivalent coverage
    }
    if (name === 'report') {
      base.preset = 'report';
      base.density = 'compact';
      return base;
    }
    return base;
  }
  const PRESETS = { default: () => preset('default'), director: () => preset('director'), instructor: () => preset('instructor'), full: () => preset('full'), report: () => preset('report') };
  const PRESET_LABELS = { default: 'Default', director: 'Director brief', instructor: 'Instructor daily', full: 'Full detail', report: 'Report' };

  // ── Validation — a hostile or stale config must never blank the page ──────
  function validate(cfg) {
    try {
      if (!cfg || typeof cfg !== 'object') return null;
      if (cfg.version !== VERSION) return null;
      if (!Array.isArray(cfg.sections) || !cfg.sections.length) return null;
      const clean = clone(AP127_V5_LAYOUT_DEFAULT);
      clean.preset = typeof cfg.preset === 'string' ? cfg.preset : 'default';
      clean.density = cfg.density === 'compact' ? 'compact' : 'comfortable';
      clean.chartScale = (typeof cfg.chartScale === 'number' && cfg.chartScale >= 0.7 && cfg.chartScale <= 1.6) ? cfg.chartScale : 1;
      if (cfg.defaults && typeof cfg.defaults === 'object') {
        clean.defaults = Object.assign({}, clean.defaults, {
          unit: cfg.defaults.unit === 'lessons' ? 'lessons' : 'hours',
          scope: ['batch', 'per-sp', 'sp'].includes(cfg.defaults.scope) ? cfg.defaults.scope : 'batch',
          range: [30, 60, 90, 0].includes(cfg.defaults.range) ? cfg.defaults.range : 90,
          section: ['pulse', 'trend', 'people', 'syllabus', 'calendar'].includes(cfg.defaults.section) ? cfg.defaults.section : 'pulse',
        });
      }
      if (Array.isArray(cfg.kpis) && cfg.kpis.length) clean.kpis = cfg.kpis.filter(k => typeof k === 'string');
      if (Array.isArray(cfg.columns) && cfg.columns.length) clean.columns = cfg.columns.filter(k => typeof k === 'string');

      const knownSectionIds = new Set(clean.sections.map(s => s.id));
      const bySectionId = {};
      cfg.sections.forEach(s => {
        if (!s || typeof s !== 'object' || !knownSectionIds.has(s.id)) return; // unknown section id ignored
        bySectionId[s.id] = s;
      });
      clean.sections = clean.sections.map(defSec => {
        const src = bySectionId[defSec.id];
        if (!src) return defSec;
        const sec = clone(defSec);
        if (typeof src.label === 'string' && src.label.trim()) sec.label = src.label.trim().slice(0, 40);
        sec.visible = src.visible !== false;
        if (Array.isArray(src.panels)) {
          const knownPanelIds = new Set(defSec.panels.map(p => p.id));
          const byId = {};
          src.panels.forEach(p => { if (p && knownPanelIds.has(p.id) && !byId[p.id]) byId[p.id] = p; });
          // Preserve src ORDER for known panels; append any default panel the
          // saved config forgot (forward-compat: a panel added after the save).
          const ordered = src.panels.filter(p => p && knownPanelIds.has(p.id)).map(p => {
            const def = defSec.panels.find(d => d.id === p.id);
            return {
              id: def.id,
              span: (Number.isInteger(p.span) && p.span >= 1 && p.span <= 12) ? p.span : def.span,
              visible: p.visible !== false,
              opts: (p.opts && typeof p.opts === 'object') ? Object.assign({}, def.opts, p.opts) : def.opts,
            };
          });
          defSec.panels.forEach(def => { if (!byId[def.id]) ordered.push(clone(def)); });
          sec.panels = ordered;
        }
        return sec;
      });

      // Guardrail: a config that hides every section, or every panel in every
      // visible section, is rejected outright rather than silently blanking V5.
      const anyVisible = clean.sections.some(s => s.visible && s.panels.some(p => p.visible));
      if (!anyVisible) return null;
      return clean;
    } catch (e) { return null; }
  }

  // ── localStorage persistence + revision log ────────────────────────────────
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_LAYOUT_KEY);
      if (!raw) return null;
      return validate(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function saveLocal(cfg, note) {
    try {
      localStorage.setItem(LS_LAYOUT_KEY, JSON.stringify(cfg));
      const log = getLog();
      log.unshift({ at: Date.now(), note: note || 'Layout changed' });
      localStorage.setItem(LS_LOG_KEY, JSON.stringify(log.slice(0, 50)));
      return true;
    } catch (e) { return false; }
  }
  function clearLocal() {
    try { localStorage.removeItem(LS_LAYOUT_KEY); } catch (e) {}
  }
  function getLog() {
    try { const raw = localStorage.getItem(LS_LOG_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }

  function effective() {
    return loadLocal() || clone(AP127_V5_LAYOUT_DEFAULT);
  }
  function isOverridden() { return !!loadLocal(); }

  // ── Share link codec — base64url(JSON), no server round trip ──────────────
  function b64urlEncode(str) {
    const b64 = (typeof btoa === 'function') ? btoa(unescape(encodeURIComponent(str))) : Buffer.from(str, 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const str = (typeof atob === 'function') ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
    return str;
  }
  function encodeShareLink(cfg) {
    try { return b64urlEncode(JSON.stringify(cfg)); } catch (e) { return ''; }
  }
  function decodeShareLink(token) {
    try { return validate(JSON.parse(b64urlDecode(token))); } catch (e) { return null; }
  }

  // ── Export-for-commit — pretty text ready to paste as the new code default ─
  function exportForCommit(cfg) {
    const body = JSON.stringify(cfg, null, 2).replace(/^/gm, '  ').trim();
    return 'window.AP127_V5_LAYOUT_DEFAULT = ' + body + ';\n\n' +
      '// Paste the object above over AP127_V5_LAYOUT_DEFAULT in js/ap127-v5-layout.js,\n' +
      '// then commit — git history on that file is the durable, shared revision record.\n';
  }

  root.AP127V5Layout = {
    VERSION, DEFAULT: AP127_V5_LAYOUT_DEFAULT, PRESETS, PRESET_LABELS,
    validate, loadLocal, saveLocal, clearLocal, getLog, effective, isOverridden,
    encodeShareLink, decodeShareLink, exportForCommit, clone,
  };
}(typeof window !== 'undefined' ? window : globalThis));
