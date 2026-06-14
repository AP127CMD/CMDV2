/* AP127 V2 — Combined Home. Cohort-progress AP127 PROGRESS tile + full Day Glance operational
 * dashboard. Panels and all day KPIs come from <DayGlancePanels/> (js/view-daily.js); they
 * read the shared date (useApp().date), which the DateCalendarTrigger in this header drives.
 * Loaded as text/babel so it shares the views' Babel scope. */
(function () {
  const { useMemo } = React;
  const dDiff = (a, b) => (!a || !b) ? null : Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);

  function OverviewView() {
    const d = window.useData();
    const { students, curriculum } = d;
    const date = d.date;
    const go = d.go || (() => {});
    const today = localToday();

    const model = useMemo(() => {
      const studs = students.map(s => {
        const last = (s.flown || []).map(f => f.date).filter(Boolean).sort().at(-1) || '';
        const idle = last ? Math.max(0, dDiff(today, last) || 0) : 9999;
        const due = curriculum.filter(c => c.planned_date && c.planned_date <= today).length;
        return { ...s, idle, behind: due - (s.done || 0) };
      });
      const cohortPct = studs.length ? Math.round(studs.reduce((a, s) => a + (s.pct || 0), 0) / studs.length * 10) / 10 : 0;
      return { studs, cohortPct };
    }, [students, curriculum, today]);

    const kpi = (cls, l, v, s, onClick) => (
      <div className={'kpi ' + cls} style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick || undefined}>
        <div className="kl">{l}</div><div className="kv">{v}</div><div className="ks">{s}</div>
      </div>
    );

    return (
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
          <h1 className="head" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 0.5, margin: 0 }}>AP<b style={{ color: 'var(--highlight)' }}>127</b> COMMAND CENTER</h1>
          <DateCalendarTrigger/>
          {date === today && <span className="mono uc" style={{ fontSize: 9, color: 'var(--col-pending)', padding: '2px 7px', border: '1px solid var(--col-pending)', borderRadius: 3 }}>TODAY</span>}
          <span style={{ flex: 1 }}/>
          <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{model.studs.length} students</span>
        </div>

        <div className="kpis">
          {kpi('', 'AP127 PROGRESS', model.cohortPct + '%', `${model.studs.length} students avg`, () => go('cohort'))}
        </div>

        <DayGlancePanels/>
      </div>
    );
  }
  window.OverviewView = OverviewView;
})();
