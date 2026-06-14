/* AP127 V2 — Combined Home. Cohort-progress digest × Day Glance operational dashboard.
 * Operational panels (pulse / status / batch / instructor / fleet / AP-127 spotlight)
 * come from <DayGlancePanels/> (js/view-daily.js); they read the shared date (useApp().date),
 * which the DateCalendarTrigger in this header drives. Loaded as text/babel so it shares the
 * views' Babel scope (DateCalendarTrigger, DayGlancePanels, localToday). */
(function () {
  const { useMemo } = React;
  const SC = { Completed: 'var(--col-done)', Pending: 'var(--col-pending)', Canceled: 'var(--col-cancel)' };
  const dDiff = (a, b) => (!a || !b) ? null : Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
  const hoursOf = mins => Math.round((mins / 60) * 10) / 10;

  function OverviewView() {
    const d = window.useData();
    const { FLIGHTS, students, curriculum, reconciliation, setStudentLens, isMobile } = d;
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
    const leaders = model.studs.slice().sort((a, b) => (b.pct || 0) - (a.pct || 0)).slice(0, 6);
    const laggers = model.studs.slice().sort((a, b) => (b.behind - a.behind) || (b.idle - a.idle)).slice(0, 6);
    const idleStu = model.studs.filter(s => s.idle >= 7 && s.idle < 900).sort((a, b) => b.idle - a.idle);
    const lensTo = s => { setStudentLens(s); go('student'); };
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

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,2fr) minmax(0,1fr)', gap: 14 }}>
          <div className="panel">
            <div className="ph"><span className="pt">On The Line</span><span className="ps link" onClick={toSchedule}>{date}{date === today ? ' (today)' : ''} · {dayModel.apCount} flights →</span></div>
            <div className="pb">{dayModel.apLine.length ? dayModel.apLine.slice(0, 14).map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '54px 1fr 80px 60px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 11 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-2)' }}>{f.start || '--:--'}</span>
                <span><b style={{ color: 'var(--highlight)' }}>{f.lesson || '—'}</b> <span className="muted">{f.student || ''}</span></span>
                <span className="mono muted" style={{ fontSize: 10 }}>{f.instructor || ''}</span>
                <span className="pill" style={{ background: `color-mix(in oklch,${SC[f.status] || 'var(--ink-3)'} 16%,transparent)`, color: SC[f.status] || 'var(--ink-3)' }}>{(f.status || '').slice(0, 4)}</span>
              </div>
            )) : <div className="empty">No AP127 flights on this day</div>}</div>
          </div>
          <div className="panel">
            <div className="ph"><span className="pt">Alerts</span><span className="ps">needs attention</span></div>
            <div className="pb" style={{ display: 'grid', gap: 8 }}>{(() => {
              const a = [];
              if (idleStu.length) a.push(['rev', '⏸', `${idleStu.length} student${idleStu.length > 1 ? 's' : ''} idle ≥ 7 days`, idleStu.slice(0, 5).map(s => `${s.nick} (${s.idle}d)`).join(', ')]);
              if (dayModel.canc) a.push(['info', '✕', `${dayModel.canc} cancellation${dayModel.canc > 1 ? 's' : ''} on this day`, 'Review the schedule for rescheduling.']);
              if (!a.length) a.push(['ok', '✓', 'All clear', 'No idle students, no cancellations on the selected day.']);
              return a.map((x, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', borderLeft: `3px solid var(--col-${x[0] === 'bad' ? 'cancel' : x[0] === 'rev' ? 'pending' : x[0] === 'info' ? 'stby' : 'done'})`, fontSize: 12 }}>
                  <span style={{ fontSize: 15 }}>{x[1]}</span><div><b>{x[2]}</b><div className="muted" style={{ marginTop: 2 }}>{x[3]}</div></div>
                </div>
              ));
            })()}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
          <div className="panel">
            <div className="ph"><span className="pt">Pace Leaders</span><span className="ps link" onClick={() => go('cohort')}>cohort →</span></div>
            <div className="pb">{leaders.map((s, i) => (
              <div key={i} onClick={() => lensTo(s)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                <span className="mono" style={{ fontSize: 11, width: 62, color: 'var(--highlight)' }}>{s.nick}</span>
                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span className="bar" style={{ width: 84 }}><i style={{ width: Math.min(100, s.pct || 0) + '%' }}/></span>
                <span className="head" style={{ fontSize: 15, fontWeight: 700, width: 46, textAlign: 'right' }}>{(s.pct || 0).toFixed(0)}%</span>
              </div>
            ))}</div>
          </div>
          <div className="panel">
            <div className="ph"><span className="pt">Behind Schedule</span><span className="ps">most behind plan</span></div>
            <div className="pb">{laggers.map((s, i) => (
              <div key={i} onClick={() => lensTo(s)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                <span className="mono" style={{ fontSize: 11, width: 62, color: 'var(--highlight)' }}>{s.nick}</span>
                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span className={'pill ' + (s.behind > 0 ? 'rev' : 'ok')}>{s.behind > 0 ? s.behind + ' behind' : 'on pace'}</span>
                <span className="mono muted" style={{ fontSize: 10, width: 62, textAlign: 'right' }}>{s.idle > 900 ? 'never' : s.idle + 'd idle'}</span>
              </div>
            ))}</div>
          </div>
        </div>
      </div>
    );
  }
  window.OverviewView = OverviewView;
})();
