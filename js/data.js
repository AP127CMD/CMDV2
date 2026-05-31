/* ============================================================================
 * AP127 V2 revamp — unified DataProvider (Phase 1 foundation, see REVAMP.md §4D)
 * Loads both feeds, computes reconciliation + freshness, holds global app state
 * (date / filters / AP-127 focus / theme / student lens) shared by every view.
 * Exposes window.{DataProvider, useData}.
 * ==========================================================================*/
(function () {
  const { useState, useEffect, useMemo, useCallback, createContext, useContext } = React;

  // ---- reference data (index-aligned to PROGRESS_DATA.ap127) ---------------
  const NICKS = ["A-VIT","A-SORN","A-RUT","B-SET","J-YU","K-PONG","K-YA","K-KORN","K-SEE","KRIT","M-PHAN","N-PON","N-KALP","N-PHAT","P-THAN","P-KORN","P-KUL","P-DET","S-SIT","S-KORN","S-WITCH","S-WAN","T-KORN","T-WAJ","V-PHON","W-PHOL","W-POL","W-PONG"];
  const FIS   = ["W-CHAI","P-YUTH","P-YA","S-TI","N-TORN","I-POL","SN-TI","S-TI","A-WAT","W-NU","K-POL","C-CHAI","P-YUTH","SN-TI","E-PHOB","K-POL","S-WAN","N-TORN","E-PHOB","I-POL","K-CHAI","K-CHAI","P-YA","S-WAN","C-CHAI","W-NU","W-CHAI","A-WAT"];
  const SES   = ["DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-TDI","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-CS","DA40-TDI","DA40-TDI","DA40-TDI"];
  const FI_FULL = {"W-CHAI":"WUTTHICHAI L.","P-YUTH":"PHAHOLYUTH P.","P-YA":"PARINYA B.","S-TI":"SANTI SUK.","N-TORN":"NAPATTORN S.","I-POL":"ITTIPOL P.","SN-TI":"SANTI PO.","A-WAT":"THAWATANAN P.","W-NU":"WISANU T.","K-POL":"KOONPHOL U.","C-CHAI":"CHAROENCHAI U.","E-PHOB":"EKKAPHOP R.","S-WAN":"SOWAN C.","K-CHAI":"KITTICHAI C."};
  const HOLIDAYS = new Set(["2026-05-01","2026-05-04","2026-05-13","2026-06-01","2026-06-03","2026-07-28","2026-07-29","2026-07-30","2026-08-12","2026-10-13","2026-10-23","2026-12-07","2026-12-10","2026-12-31"]);
  const WORKER_URL = 'https://ap127-data-api.anusorn-tanmetha.workers.dev';
  const HIGHLIGHT_BATCH = 'AP-127';

  // ---- helpers -------------------------------------------------------------
  const bkkToday = () => { const n = new Date(); return new Date(n.getTime() + (n.getTimezoneOffset() + 420) * 60000).toISOString().slice(0, 10); };
  const localToday = bkkToday;
  function injectNicks(students) { (students || []).forEach((s, i) => { s.nick = s.nick || NICKS[i] || ''; s.fi = s.fi || FIS[i] || ''; s.se = s.se || SES[i] || ''; }); return students; }

  // ---- static (synchronous) data from bundled snapshots --------------------
  const FD = window.FLIGHT_DATA || { flights: [], instructors: [], resources: [], leaves: [] };
  const FLIGHTS = FD.flights || [];
  const ALL_DATES = (() => {
    const src = [...new Set(FLIGHTS.map(f => f.date))].sort();
    if (src.length < 2) return src;
    const out = []; let cur = new Date(src[0] + 'T00:00:00Z'); const last = new Date(src[src.length - 1] + 'T00:00:00Z');
    while (cur <= last) { out.push(cur.toISOString().slice(0, 10)); cur = new Date(cur.getTime() + 86400000); }
    return out;
  })();
  const DEFAULT_DATE = (() => { const t = localToday(); if (ALL_DATES.includes(t)) return t; return ALL_DATES.find(d => d >= t) || ALL_DATES[ALL_DATES.length - 1]; })();

  const DataCtx = createContext(null);
  const useData = () => useContext(DataCtx);

  function DataProvider({ children }) {
    // global app state (shared by all views)
    const [date, setDate] = useState(DEFAULT_DATE);
    const [filters, setFilters] = useState({ batches: null, instructors: null, tails: null, statuses: null, search: '' });
    const [drawer, setDrawer] = useState(null);           // ops flight id
    const [highlightAP127, setHighlightAP127] = useState(true);
    const [hideOthers, setHideOthers] = useState(false);
    const [studentLens, setStudentLens] = useState(null); // selected student (progress obj) or null
    const [tweaks, setTweakState] = useState(() => ({
      theme: localStorage.getItem('ap127-theme') || 'cockpit', showSim: false, showStandby: true, groupBy: 'instructor',
    }));
    const setTweak = useCallback((k, v) => setTweakState(t => ({ ...t, [k]: typeof v === 'function' ? v(t[k]) : v })), []);
    useEffect(() => { document.body.dataset.theme = tweaks.theme || 'cockpit'; localStorage.setItem('ap127-theme', tweaks.theme); }, [tweaks.theme]);

    // progress feed: live fetch, fallback to bundled snapshot
    const [progress, setProgress] = useState(() => { const p = window.PROGRESS_DATA || { ap127: [], cur127: [] }; injectNicks(p.ap127); return p; });
    const [progressSource, setProgressSource] = useState('snapshot');
    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          const r = await fetch(WORKER_URL, { cache: 'no-store' });
          if (r.ok) { const d = await r.json(); if (alive && d.ap127 && d.ap127.length) { injectNicks(d.ap127); setProgress(d); setProgressSource('live'); } }
        } catch (e) { /* keep snapshot */ }
      })();
      return () => { alive = false; };
    }, []);

    // reconciliation (recomputed when progress changes)
    const reconciliation = useMemo(() => {
      try { return window.AP127Reconcile.reconcile(FD, progress); }
      catch (e) { return { rows: [], perStudent: [], totals: { conflict: 0, review: 0, ok: 0, consistency: 100, checked: 0, students: 0 } }; }
    }, [progress]);

    // freshness
    const freshness = useMemo(() => ({
      ops: { at: FD.fetchedAt || null, tz: FD.tz || 'Asia/Bangkok' },
      progress: { at: progress._updated || null, source: progressSource, students: (progress.ap127 || []).length },
    }), [progress, progressSource]);

    // day flights (ops) — same filter semantics as Command Center
    const dayFlights = useMemo(() => FLIGHTS.filter(x => {
      if (x.date !== date) return false;
      if (!tweaks.showSim && x.isSim) return false;
      if (!tweaks.showStandby && x.isStandby) return false;
      if (filters.batches && !filters.batches.includes(x.batch)) return false;
      if (filters.instructors && !filters.instructors.includes(x.instructor)) return false;
      if (filters.tails && !filters.tails.includes(x.tail)) return false;
      if (filters.statuses) { const ms = filters.statuses.includes(x.status); const mb = filters.statuses.includes('Standby') && x.isStandby; if (!ms && !mb) return false; }
      if (hideOthers && highlightAP127 && x.batch !== HIGHLIGHT_BATCH) return false;
      if (filters.search) { const q = filters.search.toLowerCase(); const hay = [x.student, x.instructor, x.batch, x.lesson, x.tail, x.type].filter(Boolean).join(' ').toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    }), [date, filters, tweaks.showSim, tweaks.showStandby, hideOthers, highlightAP127]);

    const value = {
      // ops static
      FLIGHTS, INSTRUCTORS: FD.instructors || [], RESOURCES: FD.resources || [], LEAVES: FD.leaves || [],
      ALL_DATES, DEFAULT_DATE, HIGHLIGHT_BATCH,
      flightById: id => FLIGHTS.find(f => f.id === id),
      // progress
      students: progress.ap127 || [], curriculum: progress.cur127 || [], progressMeta: { updated: progress._updated },
      // cross-check
      reconciliation,
      // freshness
      freshness,
      // global state
      date, setDate, filters, setFilters, drawer, setDrawer,
      highlightAP127, setHighlightAP127, hideOthers, setHideOthers,
      studentLens, setStudentLens, tweaks, setTweak,
      dayFlights,
      // navigation (shell listens for 'ap127-go')
      go: (viewId) => window.dispatchEvent(new CustomEvent('ap127-go', { detail: viewId })),
      // helpers
      localToday, bkkToday, NICKS, FIS, SES, FI_FULL, HOLIDAYS,
    };
    return React.createElement(DataCtx.Provider, { value }, children);
  }

  Object.assign(window, { DataProvider, useData, AP127_NICKS: NICKS, AP127_FIS: FIS, AP127_SES: SES, AP127_FI_FULL: FI_FULL, AP127_HOLIDAYS: HOLIDAYS, ap127BkkToday: bkkToday });
})();
