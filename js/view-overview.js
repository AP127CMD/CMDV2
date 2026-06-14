/* AP127 V2 — Combined Home. Cohort-progress digest × Day Glance operational dashboard.
 * Operational panels (pulse / status / batch / instructor / fleet / AP-127 spotlight)
 * come from <DayGlancePanels/> (js/view-daily.js); they read the shared date (useApp().date),
 * which the DateCalendarTrigger in this header drives. Loaded as text/babel so it shares the
 * views' Babel scope (DateCalendarTrigger, DayGlancePanels, localToday). */
(function () {
  const { useMemo } = React;
  const dDiff = (a, b) => (!a || !b) ? null : Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
  const hoursOf = mins => Math.round((mins / 60) * 10) / 10;

  function OverviewView() {
    const d = window.useData();
    const { FLIGHTS, students, curriculum, reconciliation, isMobile } = d;
    const date = d.date;
    const go = d.go || (() => {});
    const today = localToday();
    const isAP = b => window.AP127Reconcile.isAP127(b);

    const model = useMemo(() => {
      const studs = students.map(s => {
        const last = (s.flown || []).map(f => f.date).filter(Boolean).sort().at(-1) || '';
        const idle = last ? Math.max(0, dDiff(today, last) || 0) : 9999;
        const due = curriculum.filter(c => c.planned_date && c.planned_date <= today).length;
        return { ...s, idle, behind: due - (s.done || 0) };
      });
      const cohortPct = studs.length ? Math.round(studs.reduce((a, s) => a + (s.pct || 0), 0) / studs.length * 10) / 10 : 0;
      const doneVals = studs.map(s => s.done || 0).sort((a, b) => a - b);
      const spread = (doneVals.at(-1) || 0) - (doneVals[0] || 0);
      return { studs, cohortPct, spread, lead: doneVals.at(-1) || 0, lag: doneVals[0] || 0 };
    }, [students, curriculum, today]);

    const dayModel = useMemo(() => {
      const onDate = FLIGHTS.filter(f => f.date === date);
      const apLine = onDate
        .filter(f => isAP(f.batch) && f.student && f.student !== 'All Students')
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      const completed = onDate.filter(f => f.status === 'Completed').length;
      const pending = onDate.filter(f => f.status === 'Pending').length;
      const canc = onDate.filter(f => f.status === 'Canceled').length;
      const apDone = apLine.filter(f => f.status === 'Completed').length;
      const apPending = apLine.filter(f => f.status === 'Pending').length;
      const schedMin = onDate.reduce((a, f) => a + (f.durMin || 0), 0);
      return { apLine, completed, pending, canc, apDone, apPending, hours: hoursOf(schedMin), apCount: apLine.length };
    }, [FLIGHTS, date]);

    const t = reconciliation.totals;
    const idleStu = model.studs.filter(s => s.idle >= 7 && s.idle < 900).sort((a, b) => b.idle - a.idle);
    const toSchedule = () => go('schedule');

    const kpi = (cls, l, v, s, onClick) => (
      <div className={'kpi ' + cls} style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick || undefined}>
        <div className="kl">{l}</div><div className="kv">{v}</div><div className="ks">{s}</div>
      </div>
    );

    return (
      <div style={{ padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
          <h1 className="head" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 0.5, margin: 0 }}>AP<b style={{ color: 'var(--highlight)' }}>127</b> COMMAND CENTER</h1>
          <DateCalendarTrigger/>
          {date === today && <span className="mono uc" style={{ fontSize: 9, color: 'var(--col-pending)', padding: '2px 7px', border: '1px solid var(--col-pending)', borderRadius: 3 }}>TODAY</span>}
          <span style={{ flex: 1 }}/>
          <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{model.studs.length} students · {dayModel.apCount} AP-127 today</span>
        </div>

        <div className="kpis">
          {kpi('acc', 'On The Line', dayModel.apCount, `${dayModel.apDone} done · ${dayModel.apPending} pending`, toSchedule)}
          {kpi('ok', 'Completed', dayModel.completed, `${dayModel.hours}h all batches`, toSchedule)}
          {kpi('rev', 'Pending', dayModel.pending, `${dayModel.canc} canceled`, toSchedule)}
          {kpi('', 'Cohort Progress', model.cohortPct + '%', `${model.studs.length} students avg`, () => go('cohort'))}
          {kpi('rev', 'Pace Spread', model.spread, `lead ${model.lead} · lag ${model.lag}`, () => go('cohort'))}
          {kpi(idleStu.length ? 'rev' : 'ok', 'Idle ≥7d', idleStu.length, idleStu.length ? `${idleStu[0].nick} ${idleStu[0].idle}d` : 'none', null)}
          {kpi(t.conflict ? 'bad' : 'ok', 'Conflicts', t.conflict, `${t.review} review · ${t.consistency}% match`, () => go('crosscheck'))}
        </div>

        <DayGlancePanels/>
      </div>
    );
  }
  window.OverviewView = OverviewView;
})();
