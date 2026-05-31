/* AP127 V2 revamp — Overview (Home). Role-aware at-a-glance. See REVAMP.md §3C/§5. */
(function () {
  const { useMemo } = React;
  const h = React.createElement;
  const esc = s => String(s == null ? '' : s);
  const dDiff = (a, b) => (!a || !b) ? null : Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
  const SC = { Completed: 'var(--col-done)', Pending: 'var(--col-pending)', Canceled: 'var(--col-cancel)' };

  function OverviewView() {
    const d = window.useData();
    const { FLIGHTS, students, curriculum, reconciliation, bkkToday, setStudentLens, setDate, isMobile } = d;
    const go = d.go || (() => {});

    const model = useMemo(() => {
      const today = bkkToday();
      const isAP = b => window.AP127Reconcile.isAP127(b);
      const ap = FLIGHTS.filter(f => isAP(f.batch) && f.student && f.student !== 'All Students');
      const datesWithAct = [...new Set(ap.map(f => f.date))].sort();
      const focus = datesWithAct.includes(today) ? today : (datesWithAct.filter(x => x <= today).at(-1) || datesWithAct.at(-1) || today);
      const dayFlights = ap.filter(f => f.date === focus).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      const done = dayFlights.filter(f => f.status === 'Completed').length;
      const pend = dayFlights.filter(f => f.status === 'Pending').length;
      const canc = dayFlights.filter(f => f.status === 'Canceled').length;
      const studs = students.map(s => {
        const last = (s.flown || []).map(f => f.date).filter(Boolean).sort().at(-1) || '';
        const idle = last ? Math.max(0, dDiff(today, last) || 0) : 9999;
        const due = curriculum.filter(c => c.planned_date && c.planned_date <= today).length;
        return { ...s, idle, behind: due - (s.done || 0) };
      });
      const cohortPct = studs.length ? Math.round(studs.reduce((a, s) => a + (s.pct || 0), 0) / studs.length * 10) / 10 : 0;
      const doneVals = studs.map(s => s.done || 0).sort((a, b) => a - b);
      const spread = (doneVals.at(-1) || 0) - (doneVals[0] || 0);
      return { today, focus, dayFlights, done, pend, canc, studs, cohortPct, spread, lead: doneVals.at(-1) || 0, lag: doneVals[0] || 0 };
    }, [FLIGHTS, students, curriculum]);

    const t = reconciliation.totals;
    const fdate = ds => { try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }); } catch { return ds; } };
    const leaders = model.studs.slice().sort((a, b) => (b.pct || 0) - (a.pct || 0)).slice(0, 6);
    const laggers = model.studs.slice().sort((a, b) => (b.behind - a.behind) || (b.idle - a.idle)).slice(0, 6);
    const idleStu = model.studs.filter(s => s.idle >= 7 && s.idle < 900).sort((a, b) => b.idle - a.idle);

    const kpi = (cls, l, v, s, onClick) => h('div', { className: 'kpi ' + cls, style: { cursor: onClick ? 'pointer' : 'default' }, onClick },
      h('div', { className: 'kl' }, l), h('div', { className: 'kv' }, v), h('div', { className: 'ks' }, s));

    const lensTo = s => { setStudentLens(s); go('student'); };

    return h('div', { style: { padding: 16, display: 'grid', gap: 14, overflow: 'auto', height: '100%' } },
      h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 10 } },
        h('h1', { className: 'head', style: { fontSize: 26, fontWeight: 700, letterSpacing: 0.5, margin: 0 } }, 'AP', h('b', { style: { color: 'var(--highlight)' } }, '127'), ' COMMAND CENTER'),
        h('span', { className: 'mono uc', style: { fontSize: 10, color: 'var(--ink-3)' } }, 'Operations × Progress · ' + (model.studs.length) + ' students · focus ' + model.focus)),
      h('div', { className: 'kpis' },
        kpi('acc', 'On The Line', model.dayFlights.length, `${model.done} done · ${model.pend} pending · ${model.canc} cxl`, () => { setDate(model.focus); go('today'); }),
        kpi('', 'Cohort Progress', model.cohortPct + '%', `${model.studs.length} students avg`, () => go('cohort')),
        kpi('rev', 'Pace Spread', model.spread, `lessons · leader ${model.lead} · lagger ${model.lag}`, () => go('cohort')),
        kpi(t.conflict ? 'bad' : 'ok', 'Data Conflicts', t.conflict, `${t.review} to review · ${t.consistency}% match`, () => go('crosscheck')),
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,2fr) minmax(0,1fr)', gap: 14 } },
        // On the line
        h('div', { className: 'panel' },
          h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'On The Line'),
            h('span', { className: 'ps link', onClick: () => { setDate(model.focus); go('today'); } }, `${model.focus}${model.focus === model.today ? ' (today)' : ''} · ${model.dayFlights.length} flights →`)),
          h('div', { className: 'pb' }, model.dayFlights.length ? model.dayFlights.slice(0, 14).map((f, i) =>
            h('div', { key: i, style: { display: 'grid', gridTemplateColumns: '54px 1fr 80px 60px', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 11 } },
              h('span', { className: 'mono', style: { fontSize: 10, color: 'var(--ink-2)' } }, f.start || '--:--'),
              h('span', null, h('b', { style: { color: 'var(--highlight)' } }, f.lesson || '—'), ' ', h('span', { className: 'muted' }, f.student || '')),
              h('span', { className: 'mono muted', style: { fontSize: 10 } }, f.instructor || ''),
              h('span', { className: 'pill', style: { background: `color-mix(in oklch,${SC[f.status] || 'var(--ink-3)'} 16%,transparent)`, color: SC[f.status] || 'var(--ink-3)' } }, (f.status || '').slice(0, 4)),
            )) : h('div', { className: 'empty' }, 'No AP127 flights on this day')),
        ),
        // Alerts
        h('div', { className: 'panel' },
          h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Alerts'), h('span', { className: 'ps' }, 'needs attention')),
          h('div', { className: 'pb', style: { display: 'grid', gap: 8 } }, (() => {
            const a = [];
            // Integrity items (conflicts / reviews) intentionally NOT shown here — they
            // surface as the amber dot on the Cross-Check nav item. See REVAMP.md.
            if (idleStu.length) a.push(['rev', '⏸', `${idleStu.length} student${idleStu.length > 1 ? 's' : ''} idle ≥ 7 days`, idleStu.slice(0, 5).map(s => `${s.nick} (${s.idle}d)`).join(', ')]);
            if (model.canc) a.push(['info', '✕', `${model.canc} cancellation${model.canc > 1 ? 's' : ''} on focus day`, 'Review the board for rescheduling.']);
            if (!a.length) a.push(['ok', '✓', 'All clear', 'No idle students, no cancellations on the focus day.']);
            return a.map((x, i) => h('div', { key: i, onClick: x[4], style: { display: 'flex', gap: 9, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--line)', borderLeft: `3px solid var(--col-${x[0] === 'bad' ? 'cancel' : x[0] === 'rev' ? 'pending' : x[0] === 'info' ? 'stby' : 'done'})`, fontSize: 12, cursor: x[4] ? 'pointer' : 'default' } },
              h('span', { style: { fontSize: 15 } }, x[1]), h('div', null, h('b', null, x[2]), h('div', { className: 'muted', style: { marginTop: 2 } }, x[3]))));
          })()),
        ),
      ),
      h('div', { style: { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 } },
        h('div', { className: 'panel' },
          h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Pace Leaders'), h('span', { className: 'ps link', onClick: () => go('cohort') }, 'cohort →')),
          h('div', { className: 'pb' }, leaders.map((s, i) => h('div', { key: i, onClick: () => lensTo(s), style: { display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' } },
            h('span', { className: 'mono', style: { fontSize: 11, width: 62, color: 'var(--highlight)' } }, s.nick),
            h('span', { style: { fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
            h('span', { className: 'bar', style: { width: 84 } }, h('i', { style: { width: Math.min(100, s.pct || 0) + '%' } })),
            h('span', { className: 'head', style: { fontSize: 15, fontWeight: 700, width: 46, textAlign: 'right' } }, (s.pct || 0).toFixed(0) + '%')))),
        ),
        h('div', { className: 'panel' },
          h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Behind Schedule'), h('span', { className: 'ps' }, 'most behind plan')),
          h('div', { className: 'pb' }, laggers.map((s, i) => h('div', { key: i, onClick: () => lensTo(s), style: { display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer' } },
            h('span', { className: 'mono', style: { fontSize: 11, width: 62, color: 'var(--highlight)' } }, s.nick),
            h('span', { style: { fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
            h('span', { className: 'pill ' + (s.behind > 0 ? 'rev' : 'ok') }, s.behind > 0 ? s.behind + ' behind' : 'on pace'),
            h('span', { className: 'mono muted', style: { fontSize: 10, width: 62, textAlign: 'right' } }, s.idle > 900 ? 'never' : s.idle + 'd idle')))),
        ),
      ),
    );
  }
  window.OverviewView = OverviewView;
})();
