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

  // ── Destinations panel ───────────────────────────────────────────────────────
  const BATCH_CATEGORIES = [
    { key: 'AP-127',   label: 'AP-127',   filter: 'AP-127' },
    { key: 'other-ap', label: 'Other AP', filter: ['AP-124','AP-126','AP-128','AP-129'] },
    { key: 'hp',       label: 'HP',       filter: ['HP-55','HP-57'] },
    { key: 'ppl',      label: 'PPL',      filter: ['PPL-40','PPL-42','PPL-H 05'] },
    { key: 'other',    label: 'Other',    filter: ['FAM FI','MEP-35','Meeting','Recurrent','TCAR/LPC','Test Flight'] },
    { key: '*',        label: 'All',      filter: '*' },
  ];

  function filterLabel(f) {
    if (!f || f === '*') return 'All batches';
    if (f === 'AP-127') return 'AP-127';
    if (f === '!AP-127') return '≠ AP-127';
    if (typeof f === 'string') return f;
    if (!Array.isArray(f) || f.length === 0) return '(none)';
    const cat = BATCH_CATEGORIES.find(c =>
      Array.isArray(c.filter) && c.filter.length === f.length &&
      c.filter.every(b => f.includes(b)));
    if (cat) return cat.label;
    return f.slice(0, 3).join(', ') + (f.length > 3 ? ` +${f.length - 3}` : '');
  }

  function detectCategory(f) {
    if (!f || f === '*') return '*';
    if (f === 'AP-127') return 'AP-127';
    if (Array.isArray(f)) {
      const cat = BATCH_CATEGORIES.find(c =>
        Array.isArray(c.filter) && c.filter.length === f.length &&
        c.filter.every(b => f.includes(b)));
      return cat ? cat.key : 'custom';
    }
    return 'custom';
  }

  const DEFAULT_CHAT_ID = '-1004258992854';

  function Toggle({ on, onChange }) {
    const track = {
      display: 'inline-flex', alignItems: 'center', width: 36, height: 20,
      borderRadius: 10, background: on ? 'var(--col-done)' : 'var(--ink-3)',
      cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, position: 'relative',
    };
    const knob = {
      width: 16, height: 16, borderRadius: 8, background: '#fff',
      position: 'absolute', top: 2, left: on ? 18 : 2, transition: 'left 0.15s',
    };
    return h('div', { style: track, onClick: onChange }, h('div', { style: knob }));
  }

  function DestinationFormModal({ dest, onSave, onClose }) {
    const isNew = !dest;
    const [label, setLabel]     = useState(dest?.label || '');
    const [chatId, setChatId]   = useState(dest?.chatId || DEFAULT_CHAT_ID);
    const [threadId, setThread] = useState(dest?.threadId != null ? String(dest.threadId) : '');
    const [mention, setMention] = useState(dest?.mention !== false);
    const [enabled, setEnabled] = useState(dest?.enabled !== false);
    const [catKey, setCatKey]   = useState(() => detectCategory(dest?.batchFilter));

    const selFilter = (BATCH_CATEGORIES.find(c => c.key === catKey) || BATCH_CATEGORIES[5]).filter;

    function submit() {
      if (!label.trim()) return;
      onSave({
        label: label.trim(),
        chatId: chatId.trim(),
        threadId: threadId.trim() ? parseInt(threadId.trim(), 10) : null,
        batchFilter: selFilter,
        mention,
        enabled,
      });
    }

    const inp = {
      background: 'var(--bg-2)', color: 'var(--ink)',
      border: '1px solid var(--line)', borderRadius: 4,
      padding: '5px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box',
    };
    const fieldRow = (lbl, el) => h('div', { style: { marginBottom: 10 } },
      h('div', { style: { fontSize: 11, color: 'var(--ink-2)', marginBottom: 3 } }, lbl), el);

    return h('div', { style: { position: 'fixed', inset: 0, background: 'oklch(0 0 0 / 0.6)',
        zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } },
      h('div', { className: 'panel', style: { width: '100%', maxWidth: 400, padding: 20 } },
        h('div', { className: 'ph', style: { marginBottom: 16 } },
          h('span', { className: 'pt' }, isNew ? 'Add destination' : 'Edit destination')),

        fieldRow('Topic label', h('input', { value: label, onChange: e => setLabel(e.target.value),
          placeholder: 'e.g. HP Group', autoFocus: true, style: inp })),

        fieldRow('Chat ID', h('input', { value: chatId, onChange: e => setChatId(e.target.value), style: inp })),

        fieldRow('Thread ID (blank = main chat)',
          h('input', { value: threadId, onChange: e => setThread(e.target.value),
            placeholder: 'e.g. 12', type: 'number', style: inp })),

        fieldRow('Batch filter',
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } },
            BATCH_CATEGORIES.map(c =>
              h('button', {
                key: c.key,
                className: 'chip',
                onClick: () => setCatKey(c.key),
                style: {
                  background: catKey === c.key ? 'var(--highlight)' : 'var(--bg-2)',
                  color: catKey === c.key ? '#fff' : 'var(--ink-2)',
                  border: `1px solid ${catKey === c.key ? 'var(--highlight)' : 'var(--line)'}`,
                },
              }, c.label)))),

        h('div', { style: { display: 'flex', gap: 16, marginBottom: 14 } },
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: mention, onChange: e => setMention(e.target.checked) }),
            '@Mention SPs'),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' } },
            h('input', { type: 'checkbox', checked: enabled, onChange: e => setEnabled(e.target.checked) }),
            'Enabled')),

        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { className: 'chip', onClick: submit, disabled: !label.trim() }, isNew ? 'Add' : 'Save'),
          h('button', { className: 'chip', onClick: onClose }, 'Cancel'))));
  }

  function DestinationsPanel({ config, apiKey, onConfigSaved, onNeedKey }) {
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', idx }
    const destinations = config?.destinations || [];

    async function saveDestinations(newDests) {
      if (!apiKey) { onNeedKey(); return; }
      setSaving(true);
      const newConfig = { ...config, destinations: newDests };
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
        setTimeout(() => setSaveMsg(''), 3000);
      }
    }

    function toggleEnabled(idx) {
      const updated = destinations.map((d, i) =>
        i === idx ? { ...d, enabled: d.enabled === false ? true : false } : d);
      saveDestinations(updated);
    }

    function handleFormSave(dest) {
      let updated;
      if (modal.mode === 'add') {
        updated = [...destinations, dest];
      } else {
        updated = destinations.map((d, i) => i === modal.idx ? dest : d);
      }
      setModal(null);
      saveDestinations(updated);
    }

    function deleteDest(idx) {
      if (!window.confirm(`Delete "${destinations[idx].label}"?`)) return;
      saveDestinations(destinations.filter((_, i) => i !== idx));
    }

    return h('div', null,
      modal && h(DestinationFormModal, {
        dest: modal.mode === 'edit' ? destinations[modal.idx] : null,
        onSave: handleFormSave,
        onClose: () => setModal(null),
      }),

      h('div', { className: 'panel', style: { marginBottom: 12 } },
        h('div', { className: 'ph' },
          h('span', { className: 'pt' }, 'Destinations'),
          h('span', { className: 'ps' }, 'Telegram topics for each batch group'),
          h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 } },
            saveMsg && h('span', { style: { fontSize: 11,
              color: saveMsg.startsWith('Error') || saveMsg.startsWith('❌') ? 'var(--col-cancel)' : 'var(--col-done)' } }, saveMsg),
            h('button', { className: 'chip',
              onClick: () => { if (!apiKey) { onNeedKey(); return; } setModal({ mode: 'add' }); },
            }, '+ Add'))),
        destinations.length === 0
          ? h('div', { className: 'empty' }, 'No destinations configured.')
          : h('div', { style: { overflowX: 'auto' } },
              h('table', { className: 'tb' },
                h('thead', null,
                  h('tr', null,
                    h('th', null, ''),
                    h('th', null, 'Topic'),
                    h('th', null, 'Batches'),
                    h('th', null, '@'),
                    h('th', null, ''))),
                h('tbody', null,
                  destinations.map((dest, i) => {
                    const on = dest.enabled !== false;
                    return h('tr', { key: i, style: { opacity: on ? 1 : 0.45 } },
                      h('td', null, h(Toggle, { on, onChange: () => !saving && toggleEnabled(i) })),
                      h('td', { className: 'mono', style: { fontSize: 11 } }, dest.label),
                      h('td', { className: 'muted', style: { fontSize: 11 } }, filterLabel(dest.batchFilter)),
                      h('td', { className: 'muted', style: { fontSize: 11 } }, dest.mention !== false ? '✓' : '—'),
                      h('td', { style: { whiteSpace: 'nowrap' } },
                        h('button', { className: 'chip', style: { marginRight: 4 },
                          onClick: () => { if (!apiKey) { onNeedKey(); return; } setModal({ mode: 'edit', idx: i }); }
                        }, 'Edit'),
                        h('button', { className: 'chip',
                          style: { color: 'var(--col-cancel)', borderColor: 'var(--col-cancel)' },
                          onClick: () => { if (!apiKey) { onNeedKey(); return; } deleteDest(i); }
                        }, 'Del')));
                  }))))));
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
      config && h(DestinationsPanel, { config, apiKey, onConfigSaved: setConfig, onNeedKey: () => setShowKeyModal(true) }),
      h(TestPanel, { config, apiKey, onNeedKey: () => setShowKeyModal(true) }),
      config
        ? h(RosterTable, { config, apiKey, onConfigSaved: setConfig, onNeedKey: () => setShowKeyModal(true) })
        : h('div', { className: 'empty' }, status === null ? 'Connecting to watchdog…' : 'Could not load config.'),
      h(LogPanel, null));
  }

  window.WatchdogView = WatchdogView;
})();
