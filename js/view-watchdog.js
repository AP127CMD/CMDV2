// view-watchdog.js — AP127 Watchdog settings + notification log
(function () {
  const { useState, useEffect } = React;
  const h = React.createElement;

  const WATCHDOG_URL = 'https://ap127-watchdog.anusorn-tanmetha.workers.dev';

  const EVENT_ICONS = { ADDED: '✈️', REMOVED: '❌', CHANGED: '⚠️', STATUS: '🔄' };
  const MONTHS = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  function fmtTs(ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return ts; }
  }

  // ── Status strip ────────────────────────────────────────────────────────────
  function StatusStrip({ status }) {
    const ok = status && !status.lastError;
    const dot = {
      width: 10, height: 10, borderRadius: 999, flexShrink: 0,
      background: status ? (ok ? 'var(--col-done)' : 'var(--col-cancel)') : 'var(--ink-3)',
      boxShadow: status && ok ? '0 0 8px var(--col-done)' : 'none',
    };
    return h('div', { className: 'panel', style: { marginBottom: 12 } },
      h('div', { className: 'pb', style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' } },
        h('span', { style: dot }),
        h('span', { className: 'mono uc', style: { fontSize: 11, fontWeight: 700,
          color: status ? (ok ? 'var(--col-done)' : 'var(--col-cancel)') : 'var(--ink-3)' } },
          status ? (ok ? 'Active' : 'Error') : 'Loading…'),
        status && h('span', { className: 'muted mono', style: { fontSize: 10 } },
          'Last run: ', h('b', null, fmtTs(status.lastRun))),
        status && h('span', { className: 'muted mono', style: { fontSize: 10 } },
          'Last change: ', h('b', null, fmtTs(status.lastChange))),
        status?.lastError && h('span', { style: { color: 'var(--col-cancel)', fontSize: 11 } },
          '⚠ ' + status.lastError)));
  }

  // ── Test panel — one row per destination ────────────────────────────────────
  function TestPanel({ config, apiKey, onNeedKey }) {
    const destinations = config?.destinations || [];
    const [msgs, setMsgs] = useState({});
    const [results, setResults] = useState({});
    const [sending, setSending] = useState({});

    // Pre-fill default message for each destination
    useEffect(() => {
      if (!destinations.length) return;
      const defaults = {};
      destinations.forEach(d => { defaults[d.label] = `✅ AP127 Watchdog test — ${d.label} is connected.`; });
      setMsgs(prev => { const m = { ...defaults }; Object.keys(prev).forEach(k => { if (prev[k] !== defaults[k]) m[k] = prev[k]; }); return m; });
    }, [config]);

    async function sendTest(dest) {
      if (!apiKey) { onNeedKey(); return; }
      setSending(s => ({ ...s, [dest.label]: true }));
      setResults(r => ({ ...r, [dest.label]: '' }));
      try {
        const res = await fetch(`${WATCHDOG_URL}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify({ destLabel: dest.label, message: msgs[dest.label] }),
        });
        const data = await res.json();
        if (res.status === 401) { setResults(r => ({ ...r, [dest.label]: '❌ Wrong API key' })); onNeedKey(); }
        else setResults(r => ({ ...r, [dest.label]: data.ok ? '✅ Sent' : '❌ ' + (data.error || 'failed') }));
      } catch (e) {
        setResults(r => ({ ...r, [dest.label]: '❌ ' + e.message }));
      } finally {
        setSending(s => ({ ...s, [dest.label]: false }));
        setTimeout(() => setResults(r => ({ ...r, [dest.label]: '' })), 4000);
      }
    }

    if (!destinations.length) return null;

    return h('div', { className: 'panel', style: { marginBottom: 12 } },
      h('div', { className: 'ph' },
        h('span', { className: 'pt' }, 'Test Notify'),
        h('span', { className: 'ps' }, 'Send a test message to each topic')),
      h('div', { className: 'pb' },
        destinations.map(dest =>
          h('div', { key: dest.label, style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('span', { className: 'mono', style: { fontSize: 11, width: 110, flexShrink: 0, color: 'var(--ink-2)' } },
              dest.label),
            h('input', {
              value: msgs[dest.label] || '',
              onChange: e => setMsgs(m => ({ ...m, [dest.label]: e.target.value })),
              style: {
                flex: 1, background: 'var(--bg-2)', color: 'var(--ink)',
                border: '1px solid var(--line)', borderRadius: 4,
                padding: '4px 8px', fontSize: 11, fontFamily: 'JetBrains Mono',
              },
            }),
            h('button', {
              className: 'chip', style: { flexShrink: 0 },
              onClick: () => sendTest(dest),
              disabled: sending[dest.label],
            }, sending[dest.label] ? '…' : 'Send'),
            results[dest.label] && h('span', { style: { fontSize: 11, flexShrink: 0 } }, results[dest.label])))));
  }

  // ── Roster table ─────────────────────────────────────────────────────────────
  function RosterTable({ config, apiKey, onConfigSaved, onNeedKey }) {
    const [editing, setEditing] = useState(null);
    const [editVal, setEditVal] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const roster = config?.roster || [];

    async function saveUsername(idx, username) {
      setSaving(true);
      const newRoster = roster.map((r, i) =>
        i === idx ? { ...r, telegramUsername: username.replace('@', '') || null } : r);
      const newConfig = { ...config, roster: newRoster };
      try {
        const res = await fetch(`${WATCHDOG_URL}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify(newConfig),
        });
        if (res.status === 401) { setSaveMsg('❌ Wrong API key'); onNeedKey(); return; }
        if (!res.ok) throw new Error('Save failed');
        onConfigSaved(newConfig);
        setSaveMsg('Saved ✓');
      } catch (e) {
        setSaveMsg('Error: ' + e.message);
      } finally {
        setSaving(false);
        setEditing(null);
        setTimeout(() => setSaveMsg(''), 3000);
      }
    }

    return h('div', { className: 'panel', style: { marginBottom: 12 } },
      h('div', { className: 'ph' },
        h('span', { className: 'pt' }, 'SP Roster — Telegram Mapping'),
        h('span', { className: 'ps' }, 'Map each SP\'s schedule name to their Telegram @username')),
      saveMsg && h('div', { style: { padding: '4px 12px', fontSize: 11,
        color: saveMsg.startsWith('Error') || saveMsg.startsWith('❌') ? 'var(--col-cancel)' : 'var(--col-done)' } }, saveMsg),
      h('div', { style: { overflowX: 'auto' } },
        h('table', { className: 'tb' },
          h('thead', null,
            h('tr', null,
              h('th', null, 'Schedule Name'),
              h('th', null, 'Telegram @username'),
              h('th', null, ''))),
          h('tbody', null,
            roster.map((r, i) =>
              h('tr', { key: i },
                h('td', { className: 'mono', style: { fontSize: 11 } }, r.scheduleName),
                h('td', null,
                  editing === i
                    ? h('input', { autoFocus: true, value: editVal,
                        onChange: e => setEditVal(e.target.value),
                        onKeyDown: e => { if (e.key === 'Enter') saveUsername(i, editVal);
                          if (e.key === 'Escape') setEditing(null); },
                        style: { background: 'var(--bg-2)', color: 'var(--ink)',
                          border: '1px solid var(--highlight)', borderRadius: 4,
                          padding: '3px 8px', fontSize: 11, width: 160 } })
                    : h('span', { className: r.telegramUsername ? 'mono' : 'muted',
                        style: { fontSize: 11 } },
                        r.telegramUsername ? '@' + r.telegramUsername : 'unmapped')),
                h('td', null,
                  editing === i
                    ? h('div', { style: { display: 'flex', gap: 4 } },
                        h('button', { className: 'chip', onClick: () => saveUsername(i, editVal),
                          disabled: saving }, saving ? '…' : 'Save'),
                        h('button', { className: 'chip', onClick: () => setEditing(null) }, 'Cancel'))
                    : h('button', { className: 'chip',
                        onClick: () => { if (!apiKey) { onNeedKey(); return; } setEditing(i); setEditVal(r.telegramUsername || ''); },
                      }, apiKey ? 'Edit' : 'Key needed'))))))));
  }

  // ── Log panel ────────────────────────────────────────────────────────────────
  function LogPanel() {
    const [month, setMonth] = useState(MONTHS[0]);
    const [log, setLog] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      setLoading(true);
      fetch(`${WATCHDOG_URL}/log?month=${month}`)
        .then(r => r.json())
        .then(data => { setLog(Array.isArray(data) ? data : []); setLoading(false); })
        .catch(() => { setLog([]); setLoading(false); });
    }, [month]);

    return h('div', { className: 'panel' },
      h('div', { className: 'ph' },
        h('span', { className: 'pt' }, 'Notification Log'),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('span', { className: 'ps' }, log.length + ' entries'),
          h('select', {
            value: month,
            onChange: e => setMonth(e.target.value),
            style: { background: 'var(--bg-2)', color: 'var(--ink)',
              border: '1px solid var(--line)', borderRadius: 4,
              padding: '2px 6px', fontSize: 11, fontFamily: 'JetBrains Mono' },
          }, MONTHS.map(m => h('option', { key: m, value: m }, m))))),
      h('div', { style: { overflowX: 'auto', maxHeight: 480, overflowY: 'auto' } },
        loading
          ? h('div', { className: 'empty' }, 'Loading…')
          : !log.length
            ? h('div', { className: 'empty' }, 'No notifications for ' + month)
            : h('table', { className: 'tb' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, 'Time'), h('th', null, ''), h('th', null, 'SP'),
                    h('th', null, 'Lesson'), h('th', null, 'Date'), h('th', null, 'Change'))),
                h('tbody', null,
                  log.map((e, i) => {
                    const diffKeys = Object.keys(e.diff || {});
                    const changeSummary = diffKeys.length
                      ? diffKeys.map(k => `${k}: ${e.diff[k].from}→${e.diff[k].to}`).join(', ')
                      : e.type === 'ADDED' ? `${e.start}–${e.end} · ${e.tail}` : '';
                    return h('tr', { key: i },
                      h('td', { className: 'mono muted', style: { fontSize: 9, whiteSpace: 'nowrap' } },
                        fmtTs(e.ts)),
                      h('td', null, EVENT_ICONS[e.type] || '•'),
                      h('td', { className: 'mono', style: { fontSize: 11 } }, e.student || '—'),
                      h('td', { className: 'mono', style: { fontSize: 11 } }, e.lesson || '—'),
                      h('td', { className: 'mono muted', style: { fontSize: 10 } }, e.date || '—'),
                      h('td', { className: 'muted', style: { fontSize: 10 } }, changeSummary));
                  })))));
  }

  // ── API Key modal ─────────────────────────────────────────────────────────────
  function ApiKeyModal({ onSave, onClose }) {
    const [val, setVal] = useState('');
    return h('div', { style: { position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.6)',
        zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
      h('div', { className: 'panel', style: { width: 340, padding: 24 } },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'API Key')),
        h('div', { className: 'pb' },
          h('p', { style: { fontSize: 12, marginBottom: 12, color: 'var(--ink-2)' } },
            'Enter the WATCHDOG_API_KEY to save changes. Stored in this browser only.'),
          h('input', { type: 'password', value: val, autoFocus: true,
            onChange: e => setVal(e.target.value),
            onKeyDown: e => { if (e.key === 'Enter' && val) onSave(val); if (e.key === 'Escape') onClose(); },
            placeholder: 'paste key here…',
            style: { width: '100%', background: 'var(--bg-2)', color: 'var(--ink)',
              border: '1px solid var(--line)', borderRadius: 6,
              padding: '8px 12px', fontSize: 13, outline: 'none', marginBottom: 12,
              boxSizing: 'border-box' } }),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { className: 'chip', onClick: () => val && onSave(val), disabled: !val }, 'Confirm'),
            h('button', { className: 'chip', onClick: onClose }, 'Cancel')))));
  }

  // ── Main view ─────────────────────────────────────────────────────────────────
  function WatchdogView() {
    const [status, setStatus] = useState(null);
    const [config, setConfig] = useState(null);
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('wd-key') || '');
    const [showKeyModal, setShowKeyModal] = useState(false);

    useEffect(() => {
      Promise.all([
        fetch(`${WATCHDOG_URL}/status`).then(r => r.json()).catch(() => null),
        fetch(`${WATCHDOG_URL}/config`).then(r => r.json()).catch(() => null),
      ]).then(([s, c]) => { setStatus(s); setConfig(c); });
    }, []);

    function handleKeySave(key) {
      localStorage.setItem('wd-key', key);
      setApiKey(key);
      setShowKeyModal(false);
    }

    function handleKeyClear() {
      localStorage.removeItem('wd-key');
      setApiKey('');
      setShowKeyModal(true);
    }

    return h('div', { style: { padding: 16, overflow: 'auto', height: '100%' } },
      showKeyModal && h(ApiKeyModal, { onSave: handleKeySave, onClose: () => setShowKeyModal(false) }),

      // Header + API key row
      h('div', { className: 'ph', style: { marginBottom: 16, flexWrap: 'wrap', gap: 8 } },
        h('span', { className: 'pt' }, '◉ Watchdog'),
        h('span', { className: 'ps' }, 'AP127 flight schedule monitor · Telegram notifications'),
        h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 } },
          apiKey
            ? h('span', { className: 'muted mono', style: { fontSize: 10 } }, '🔑 Key set')
            : h('span', { className: 'muted', style: { fontSize: 11, color: 'var(--col-cancel)' } }, '🔑 No key'),
          apiKey
            ? h('button', { className: 'chip', onClick: handleKeyClear }, 'Change Key')
            : h('button', { className: 'chip', onClick: () => setShowKeyModal(true) }, 'Set Key'))),

      h(StatusStrip, { status }),
      h(TestPanel, { config, apiKey, onNeedKey: () => setShowKeyModal(true) }),
      config
        ? h(RosterTable, { config, apiKey, onConfigSaved: setConfig, onNeedKey: () => setShowKeyModal(true) })
        : h('div', { className: 'empty' }, status === null ? 'Connecting to watchdog…' : 'Could not load config.'),
      h(LogPanel, null));
  }

  window.WatchdogView = WatchdogView;
})();
