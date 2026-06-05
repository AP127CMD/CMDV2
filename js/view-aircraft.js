// view-aircraft.js — CATC Aircraft Status live feed
// Source: Google Sheets pubhtml CSV, fetched live + 5-minute auto-refresh
(function () {
  const { useState, useEffect, useMemo, useCallback } = React;
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTOc87NylhUtL_17hM8TWNKucAqhO84TPlK4l_H704A8AGc0Idhdt5FoggsPtwR1uCVyZixOyPppZ3B/pub?gid=1661381999&single=true&output=csv';

  function parseCSVRow(line) {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    fields.push(cur.trim());
    return fields;
  }

  function parseData(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 3) return { meta: {}, aircraft: [] };
    // Row 0: "CATC Aircraft Status,,Last Update:,<date>,,By:,<name>"
    const r0 = parseCSVRow(lines[0]);
    const lastUpdate = r0[3] || '';
    const updatedBy = r0[6] || '';
    const aircraft = [];
    for (let i = 2; i < lines.length; i++) {
      const f = parseCSVRow(lines[i]);
      if (!f[0] || !f[1]) continue;
      const toInt = s => { const x = parseInt(String(s).replace(/,/g, ''), 10); return isNaN(x) ? null : x; };
      aircraft.push({
        item: f[0], reg: f[1], model: f[2] || '',
        flyable: (f[3] || '').toLowerCase() === 'yes',
        lastFlight: f[4] || '', dueIn: f[5] || '',
        acCertDate: f[6] || '', acCertDays: toInt(f[7]),
        coaCertDate: f[8] || '', coaCertDays: toInt(f[9]),
        insurance: f[10] || '', remarks: (f[11] || '').replace(/^\(|\)$/g, '').trim(),
      });
    }
    return { meta: { lastUpdate, updatedBy }, aircraft };
  }

  function daysColor(days) {
    if (days === null) return 'var(--ink-4, #555)';
    if (days < 0) return 'var(--col-cancel)';
    if (days <= 60) return '#ff8c42';
    if (days <= 120) return 'var(--col-pending)';
    return 'var(--col-done)';
  }

  function shortModel(m) {
    return m.replace('Diamond ', '').replace('Robinson ', '');
  }

  function DaysCell({ date, days }) {
    const col = daysColor(days);
    const expired = days !== null && days < 0;
    const label = days === null ? '—' : expired ? `EXP (${days}d)` : `${days}d`;
    return (
      <td className="mono" style={{ padding: '5px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{date || '—'}</div>
        {days !== null && (
          <div style={{ fontSize: 10, color: col, fontWeight: 700, marginTop: 1 }}>{label}</div>
        )}
      </td>
    );
  }

  function AircraftStatusView() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastFetch, setLastFetch] = useState(null);
    const [filterModel, setFilterModel] = useState('All');
    const [filterFlyable, setFilterFlyable] = useState('All');
    const [sortCol, setSortCol] = useState('item');
    const [sortAsc, setSortAsc] = useState(true);

    const load = useCallback(async () => {
      setLoading(true);
      try {
        const res = await fetch(CSV_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        setData(parseData(text));
        setLastFetch(Date.now());
        setError(null);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
      const t = setInterval(load, 5 * 60 * 1000);
      return () => clearInterval(t);
    }, [load]);

    const { models, filtered, stats } = useMemo(() => {
      if (!data) return { models: [], filtered: [], stats: {} };
      const ac = data.aircraft;
      const models = [...new Set(ac.map(a => a.model))];
      let filtered = ac;
      if (filterModel !== 'All') filtered = filtered.filter(a => a.model === filterModel);
      if (filterFlyable === 'Flyable') filtered = filtered.filter(a => a.flyable);
      if (filterFlyable === 'Grounded') filtered = filtered.filter(a => !a.flyable);

      // sort
      filtered = [...filtered].sort((a, b) => {
        let va = a[sortCol], vb = b[sortCol];
        if (sortCol === 'acCertDays' || sortCol === 'coaCertDays') {
          va = va === null ? 9999 : va;
          vb = vb === null ? 9999 : vb;
        } else if (sortCol === 'flyable') {
          va = a.flyable ? 0 : 1; vb = b.flyable ? 0 : 1;
        } else {
          va = String(va || ''); vb = String(vb || '');
        }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ? 1 : -1;
        return 0;
      });

      const flyable = ac.filter(a => a.flyable).length;
      const expiring = ac.filter(a => (a.acCertDays !== null && a.acCertDays >= 0 && a.acCertDays <= 60) || (a.coaCertDays !== null && a.coaCertDays >= 0 && a.coaCertDays <= 60)).length;
      const stats = {
        total: ac.length, flyable, grounded: ac.length - flyable, expiring,
        byModel: models.map(m => ({
          model: m,
          total: ac.filter(a => a.model === m).length,
          flyable: ac.filter(a => a.model === m && a.flyable).length,
        })),
      };
      return { models, filtered, stats };
    }, [data, filterModel, filterFlyable, sortCol, sortAsc]);

    const onSort = col => {
      if (sortCol === col) setSortAsc(a => !a);
      else { setSortCol(col); setSortAsc(true); }
    };
    const SortH = ({ col, children, align }) => {
      const active = sortCol === col;
      return (
        <th className="mono uc" onClick={() => onSort(col)} style={{ padding: '6px 8px', textAlign: align || 'left', fontSize: 9, color: active ? 'var(--highlight)' : 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-2)', cursor: 'pointer', userSelect: 'none' }}>
          {children}{active ? (sortAsc ? ' ▲' : ' ▼') : ''}
        </th>
      );
    };

    if (loading && !data) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-3)' }}>
          <div className="mono" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✦</div>
            <div>Loading aircraft status…</div>
          </div>
        </div>
      );
    }

    if (error && !data) {
      return (
        <div style={{ padding: 24 }}>
          <div className="mono" style={{ color: 'var(--col-cancel)', marginBottom: 12 }}>Failed to load: {error}</div>
          <button className="chip" onClick={load}>Retry</button>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, padding: '10px 16px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="head uc" style={{ fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>
              ✦ CATC Aircraft Status
            </div>
            {data?.meta && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                Sheet updated: <b style={{ color: 'var(--ink-2)' }}>{data.meta.lastUpdate}</b>
                {data.meta.updatedBy && <span> · By: {data.meta.updatedBy}</span>}
                {lastFetch && (
                  <span style={{ marginLeft: 8 }}>
                    · Fetched:{' '}
                    <span style={{ color: 'var(--col-done)' }}>
                      {new Date(lastFetch).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {loading && <span className="mono" style={{ fontSize: 10, color: 'var(--col-pending)' }}>⟳ refreshing…</span>}
            {error && <span className="mono" style={{ fontSize: 10, color: 'var(--col-cancel)' }}>⚠ {error}</span>}
            <button className="chip" onClick={load} disabled={loading}>⟳ Refresh</button>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ flexShrink: 0, padding: '10px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', alignItems: 'stretch' }}>
          {[
            { val: stats.total, label: 'Total', col: 'var(--ink-1)', border: 'var(--line)' },
            { val: stats.flyable, label: 'Flyable', col: 'var(--col-done)', border: 'var(--col-done)' },
            { val: stats.grounded, label: 'Grounded', col: 'var(--col-cancel)', border: 'var(--col-cancel)' },
            { val: stats.expiring, label: '≤60d cert', col: '#ff8c42', border: '#ff8c42' },
          ].map(({ val, label, col, border }) => (
            <div key={label} style={{ background: 'var(--surface)', border: `1px solid ${border}`, borderRadius: 8, padding: '7px 14px', textAlign: 'center', minWidth: 64 }}>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: col, lineHeight: 1 }}>{val}</div>
              <div className="mono uc" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 3 }}>{label}</div>
            </div>
          ))}
          <div style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch', margin: '0 4px' }} />
          {stats.byModel?.map(m => (
            <div key={m.model} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', minWidth: 90 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{shortModel(m.model)}</div>
              <div className="mono" style={{ fontSize: 12, marginTop: 3 }}>
                <span style={{ color: 'var(--col-done)', fontWeight: 700 }}>{m.flyable}</span>
                <span style={{ color: 'var(--ink-3)' }}> / {m.total}</span>
                <span className="uc" style={{ color: 'var(--ink-4, #555)', fontSize: 9, marginLeft: 4 }}>fly</span>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ flexShrink: 0, padding: '6px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <span className="mono uc" style={{ fontSize: 10, color: 'var(--ink-3)' }}>Model:</span>
          {['All', ...models].map(m => (
            <button key={m} className={'chip' + (filterModel === m ? ' sel' : '')} onClick={() => setFilterModel(m)} style={{ fontSize: 10, padding: '3px 8px' }}>
              {m === 'All' ? 'All' : shortModel(m)}
            </button>
          ))}
          <div style={{ width: 1, background: 'var(--line)', height: 16, margin: '0 2px' }} />
          {['All', 'Flyable', 'Grounded'].map(f => (
            <button key={f} className={'chip' + (filterFlyable === f ? ' sel' : '')} onClick={() => setFilterFlyable(f)} style={{ fontSize: 10, padding: '3px 8px' }}>
              {f}
            </button>
          ))}
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-3)' }}>
            {filtered.length} aircraft
          </span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
            {[
              { col: 'var(--col-done)', label: '> 120 days' },
              { col: 'var(--col-pending)', label: '61–120 days' },
              { col: '#ff8c42', label: '1–60 days' },
              { col: 'var(--col-cancel)', label: 'Expired' },
            ].map(({ col, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: col, display: 'inline-block', flexShrink: 0 }} />
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{label}</span>
              </div>
            ))}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <SortH col="item" align="center">#</SortH>
                <SortH col="reg">Registration</SortH>
                <SortH col="model">Model</SortH>
                <SortH col="flyable" align="center">Status</SortH>
                <SortH col="lastFlight">Last Flight</SortH>
                <SortH col="dueIn">Due In</SortH>
                <SortH col="acCertDays" align="center">A/C Cert</SortH>
                <SortH col="coaCertDays" align="center">CoA Cert</SortH>
                <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Insurance</th>
                <th className="mono uc" style={{ padding: '6px 8px', fontSize: 9, color: 'var(--ink-3)', fontWeight: 600, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--bg-2)' }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ac, i) => {
                const rowBg = i % 2 === 0 ? 'transparent' : 'color-mix(in oklch, var(--surface) 50%, transparent)';
                const flyCol = ac.flyable ? 'var(--col-done)' : 'var(--col-cancel)';
                return (
                  <tr key={ac.reg} style={{ background: rowBg }}>
                    <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-3)', fontSize: 11, textAlign: 'center' }}>{ac.item}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <span className="mono" style={{ color: 'var(--highlight)', fontWeight: 600, fontSize: 13 }}>{ac.reg}</span>
                    </td>
                    <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{shortModel(ac.model)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <span className="mono uc" style={{ fontSize: 10, fontWeight: 700, color: flyCol, background: `color-mix(in oklch, ${flyCol} 15%, transparent)`, border: `1px solid ${flyCol}`, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                        {ac.flyable ? '✔ FLY' : '✘ GND'}
                      </span>
                    </td>
                    <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{ac.lastFlight || '—'}</td>
                    <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{ac.dueIn || '—'}</td>
                    <DaysCell date={ac.acCertDate} days={ac.acCertDays} />
                    <DaysCell date={ac.coaCertDate} days={ac.coaCertDays} />
                    <td className="mono" style={{ padding: '6px 8px', color: 'var(--ink-2)', fontSize: 11, whiteSpace: 'nowrap' }}>{ac.insurance || '—'}</td>
                    <td style={{ padding: '6px 8px', maxWidth: 240 }}>
                      {ac.remarks && (
                        <span className="mono" style={{ fontSize: 10, color: 'var(--col-pending)', lineHeight: 1.5, display: 'block' }}>
                          {ac.remarks}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  window.AircraftStatusView = AircraftStatusView;
})();
