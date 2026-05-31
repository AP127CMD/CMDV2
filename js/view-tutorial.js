/* ============================================================================
 * AP127 V2 — Tutorial / User Guide. Explains every view and the logic behind it
 * (scheduler, cross-check reconciliation, Ops-vs-Progress, batch colours, data
 * freshness). Pure JS (no JSX) → plain <script>, theme-aware via theme.css classes.
 * ==========================================================================*/
(function () {
  const h = React.createElement;
  const BATCHES = [
    ['AP124', 'var(--batch-ap124)'], ['AP126', 'var(--batch-ap126)'],
    ['AP127', 'var(--batch-ap127)'], ['AP128', 'var(--batch-ap128)'], ['AP129', 'var(--batch-ap129)'],
  ];

  // Each view: [icon, name, what it shows, how to read / logic]
  const VIEWS = [
    ['◎', 'Home', 'The command-center landing page.', 'At-a-glance KPIs (today on the line, cohort progress, pace spread), the focus-day flight line, smart Alerts (idle students, cancellations), pace leaders and who is most behind. Integrity issues are NOT listed here — watch the amber dot on Cross-Check instead.'],
    ['✈', 'Today', 'Operations snapshot for one day.', 'Batch / instructor / aircraft utilisation and an AP-127 spotlight. The batch colour legend below applies here and everywhere.'],
    ['▤', 'Board', 'The day’s flights as a sortable table.', 'Search + filter by status/batch. Click a row for the flight drawer. Empty days (weekends/holidays) show “no flights”.'],
    ['▭', 'Gantt', 'Flights on a time axis.', 'Each row is a resource/instructor; bars are flights across the day. On narrow screens the visible time range shrinks but the first and last flight of each row stay pinned.'],
    ['▦', 'Weekly', 'A week grid of operations.', 'Scan load and gaps across seven days.'],
    ['▥', 'Roster', 'Who is flying with whom.', 'Instructor ↔ student pairings and counts.'],
    ['▦', 'Calendar', 'Month calendar of operations.', 'Filter by status / batch / instructor. Click a day for its flights.'],
    ['⌕', 'Slot Finder', 'Find open slots manually.', 'Given a date, duration, buffer and instructor/aircraft constraints, lists the gaps you can book into.'],
    ['⚡', 'Auto Slot Finder', 'Slot finding, automated.', 'Ranks candidate slots using the NGT student-priority cache. Highest-risk planning surface — confirm against the live feed.'],
    ['▰', 'AP127 Detail', 'The AP127 squadron progress board.', 'Ranking table, pace bands, per-student drawer and progress charts. PROGRESS HERE IS RECONCILED AGAINST OPERATIONS: a student’s “done” count includes lessons completed in the Ops feed even if Progress hasn’t caught up. Upcoming-lesson dates are the real scheduled date, or TBC. Gaps between the two systems are tracked in Cross-Check.'],
    ['▤', 'Progress Detail', 'Per-student plan cards, all batches.', 'Recent flown + upcoming lessons + finish ETC. Upcoming dates come from the Operations schedule (TBC if not yet scheduled) — NOT from the simulation. Filter by batch.'],
    ['◴', 'All Batches', 'Multi-batch overview (NGT_001).', 'Daily flight load vs cap, all-students progress, batch timeline, per-batch mini-charts across AP124/126/127/129.'],
    ['◷', 'School Perf.', 'Historical actuals.', 'Daily flights and daily hours, each a stacked bar coloured by batch, plus monthly hours and a recent-days scan. Filter by date range and batch.'],
    ['◈', 'Simulation', 'A what-if scheduler.', 'Set the daily cap (flights or hours), weekend/holiday caps and planning horizon, add hypothetical extra batches, then Run — it projects finish dates and a capacity chart. See “The scheduler” below.'],
    ['⇄', 'Cross-Check', 'Operations ⇄ Progress reconciliation.', 'Every flown AP127 lesson is matched both ways. OK = identical; REVIEW = matched but time/date differs beyond tolerance; CONFLICT = present in one system only. The amber dot on this nav item lights when anything needs review.'],
    ['◉', 'Student Lens', 'One student across everything.', 'Pick a student from the top bar to see their Ops schedule, completed Progress lessons and upcoming plan side by side.'],
  ];

  const LOGIC = [
    ['The scheduler (Simulation & plans)', [
      'Schedules from tomorrow (Asia/Bangkok) forward; only future operating days are filled.',
      'Priority order AP124 → AP126 → AP127 → AP129 → extra batches. A shared daily cap is filled by higher-priority batches first.',
      'A student must wait 1 operating day after a lesson < 120 min, or 2 days after a lesson ≥ 120 min. Within a batch the student furthest behind plan flies next.',
      'Weekdays only by default; the 14 Thai public holidays of 2026 are excluded unless a weekend/holiday cap is set.',
      'These projected dates are estimates — the app shows the REAL Operations-scheduled date (or TBC) wherever a per-lesson date is displayed.',
    ]],
    ['Operations vs Progress (and TBC)', [
      'Two independent records exist: Operations (the flight schedule / what actually flew) and Progress (the training record).',
      'Operations is normally more current, so AP127 Detail derives each student’s progress from the merged set.',
      'Future lessons show the date they are actually scheduled in Operations; if a lesson isn’t on the schedule yet it shows TBC — never a guessed date.',
      'Where the two records disagree, the difference is listed in Cross-Check rather than hidden.',
    ]],
    ['Cross-Check reconciliation', [
      'Names are bridged ("Akaravit Khwanngam" ⇄ "AKARAVIT K.") and lesson codes normalised ("CDGL 04/1" → "CDGL 04").',
      'Only the date window both systems cover is compared.',
      'Tolerances are adjustable (time ±, date ±). Beyond tolerance a matched lesson becomes REVIEW; missing on one side becomes CONFLICT.',
    ]],
    ['Data & freshness', [
      'Operations data mirrors the Command Center feed; Progress mirrors the AP127 data worker; multi-batch data mirrors NGT_001’s cache. All refresh hourly.',
      'The PROG / OPS dots in the top bar show each feed’s last-updated time (green = live, amber = snapshot).',
      'Themes: cockpit (dark), light, warm — top-right. The sidebar collapses to an icon rail via the burger.',
    ]],
  ];

  function Section(title, sub, children) {
    return h('div', { className: 'panel', style: { marginBottom: 14 } },
      h('div', { className: 'ph' }, h('span', { className: 'pt' }, title), sub && h('span', { className: 'ps' }, sub)),
      h('div', { className: 'pb' }, children));
  }

  function TutorialView() {
    return h('div', { style: { padding: 16, overflow: 'auto', height: '100%' } },
      h('div', { style: { maxWidth: 1000, margin: '0 auto' } },
        h('div', { style: { borderBottom: '1px solid var(--line)', paddingBottom: 10, marginBottom: 14 } },
          h('h1', { className: 'head', style: { fontSize: 26, fontWeight: 700, letterSpacing: 0.5, margin: 0 } }, 'USER GUIDE ', h('b', { style: { color: 'var(--highlight)' } }, '& LOGIC')),
          h('div', { className: 'mono uc', style: { fontSize: 10, color: 'var(--ink-3)', marginTop: 3 } }, 'How every view works and the logic behind the numbers')),

        // Batch colour legend
        Section('Batch colours', 'consistent across every view',
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 16 } },
            BATCHES.map(([b, c]) => h('span', { key: b, style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 } },
              h('span', { style: { width: 14, height: 14, borderRadius: 4, background: c, boxShadow: `0 0 6px ${c}` } }),
              h('b', null, b), b === 'AP127' && h('span', { className: 'muted', style: { fontSize: 10 } }, '(primary)'))))),

        // Views
        Section('The views', `${VIEWS.length} destinations`,
          h('div', { style: { display: 'grid', gap: 10 } },
            VIEWS.map(([icon, name, what, how], i) => h('div', { key: i, style: { display: 'grid', gridTemplateColumns: '28px 150px 1fr', gap: 10, alignItems: 'start', padding: '8px 0', borderBottom: i < VIEWS.length - 1 ? '1px solid var(--line-soft)' : 'none' } },
              h('span', { style: { fontSize: 18, textAlign: 'center', color: 'var(--highlight)' } }, icon),
              h('div', null, h('b', { style: { fontSize: 13 } }, name), h('div', { className: 'muted', style: { fontSize: 11, marginTop: 2 } }, what)),
              h('div', { style: { fontSize: 12, lineHeight: 1.55, color: 'var(--ink-2)' } }, how))))),

        // Logic
        LOGIC.map(([title, points], i) => h('div', { key: i }, Section(title, null,
          h('ul', { style: { margin: 0, paddingLeft: 18, display: 'grid', gap: 6 } },
            points.map((p, j) => h('li', { key: j, style: { fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-2)' } }, p)))))),

        h('div', { className: 'muted', style: { fontSize: 11, textAlign: 'center', padding: '8px 0 20px' } }, 'AP127 Command Center · Operations × Progress · unified single-page app')));
  }
  window.TutorialView = TutorialView;
})();
