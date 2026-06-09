/* AP127 V2 — Cloudflare Usage dashboard (view-cf-usage.js) */
(function () {
  const { useState, useEffect, useCallback } = React;
  const h = React.createElement;

  const WATCHDOG_URL = 'https://ap127-watchdog.ap127cmd.workers.dev';

  const LIMITS = {
    kvReads:        100000,
    kvWrites:       1000,
    kvDeletes:      1000,
    kvLists:        1000,
    workerRequests: 100000,
  };

  function pct(used, limit) {
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function barColor(p) {
    if (p >= 80) return 'var(--col-cancel)';
    if (p >= 50) return '#f59e0b';
    return 'var(--col-done)';
  }

  function UsageBar({ label, used, limit, sublabel }) {
    const p = pct(used, limit);
    const color = barColor(p);
    return h('div', { style: { marginBottom: 12 } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 } },
        h('span', { style: { fontSize: 12, fontWeight: 600 } }, label),
        h('span', { style: { fontSize: 11, color: 'var(--ink-2)' } },
          `${used.toLocaleString()} / ${limit.toLocaleString()}`,
          sublabel && h('span', { style: { marginLeft: 6, color: 'var(--ink-3)', fontSize: 10 } }, sublabel))),
      h('div', { style: { background: 'var(--bg-2)', borderRadius: 4, height: 10, overflow: 'hidden' } },
        h('div', { style: {
          width: `${p}%`, height: '100%', borderRadius: 4,
          background: color, transition: 'width 0.4s',
          minWidth: used > 0 ? 4 : 0,
        } })),
      h('div', { style: { fontSize: 10, color: p >= 50 ? color : 'var(--ink-3)', marginTop: 2 } },
        `${p}% used`));
  }

  function Section({ title, children }) {
    return h('div', { className: 'panel', style: { marginBottom: 12 } },
      h('div', { className: 'ph' }, h('span', { className: 'pt' }, title)),
      h('div', { style: { padding: '0 0 4px' } }, children));
  }

  function SetupGuide() {
    return h('div', { className: 'panel', style: { padding: 16 } },
      h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Setup required')),
      h('p', { style: { fontSize: 12, marginBottom: 8 } },
        'Two Worker secrets are needed. Run these in your terminal:'),
      h('pre', { style: {
        background: 'var(--bg-2)', padding: 10, borderRadius: 6,
        fontSize: 11, fontFamily: 'monospace', overflowX: 'auto', marginBottom: 8,
      } },
        `cd ~/ap127_work/AP127_V2/watchdog\n` +
        `npx wrangler secret put CF_API_TOKEN\n` +
        `npx wrangler secret put CF_ACCOUNT_ID`),
      h('p', { style: { fontSize: 11, color: 'var(--ink-2)' } },
        '• CF_API_TOKEN — create at dash.cloudflare.com → My Profile → API Tokens',
        h('br', null),
        '  Use template "Read all resources" or add Account Analytics: Read permission.',
        h('br', null),
        '• CF_ACCOUNT_ID — found in the right sidebar of any Cloudflare dashboard page.'));
  }

  function CfUsageView() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('wd-key') || '');
    const [showKeyInput, setShowKeyInput] = useState(false);
    const [keyDraft, setKeyDraft] = useState('');
    const [lastFetched, setLastFetched] = useState(null);
    const needsSetup = error?.includes('CF_API_TOKEN');

    const load = useCallback(async (key) => {
      const k = key ?? apiKey;
      if (!k) { setShowKeyInput(true); return; }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${WATCHDOG_URL}/cf-usage`, {
          headers: { 'X-API-Key': k },
        });
        if (res.status === 401) { setError('Wrong API key'); setShowKeyInput(true); return; }
        const json = await res.json();
        if (json.error) { setError(json.error); return; }
        setData(json);
        setLastFetched(new Date());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, [apiKey]);

    useEffect(() => { load(); }, []);

    function saveKey() {
      localStorage.setItem('wd-key', keyDraft);
      setApiKey(keyDraft);
      setShowKeyInput(false);
      load(keyDraft);
    }

    const kv = data?.kv || {};
    const worker = data?.worker || {};
    const limits = data?.limits || LIMITS;

    return h('div', { style: { padding: 16, overflow: 'auto', height: '100%' } },

      // Header
      h('div', { className: 'ph', style: { marginBottom: 16, flexWrap: 'wrap', gap: 8 } },
        h('span', { className: 'pt' }, '☁ CF Usage'),
        h('span', { className: 'ps' }, 'Free-tier limits · resets daily at 00:00 UTC'),
        h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 } },
          lastFetched && h('span', { className: 'muted', style: { fontSize: 10 } },
            `${data?._cached ? '⏱ cached · ' : ''}${lastFetched.toLocaleTimeString()}`),
          h('button', { className: 'chip', onClick: () => load(), disabled: loading },
            loading ? '…' : '↻ Refresh'),
          apiKey
            ? h('button', { className: 'chip', onClick: () => { setKeyDraft(''); setShowKeyInput(true); } }, 'Change Key')
            : h('button', { className: 'chip', onClick: () => { setKeyDraft(''); setShowKeyInput(true); } }, 'Set Key'))),

      // API key input
      showKeyInput && h('div', { className: 'panel', style: { marginBottom: 12, padding: 12, display: 'flex', gap: 8, alignItems: 'center' } },
        h('span', { style: { fontSize: 12 } }, 'Watchdog API key:'),
        h('input', {
          type: 'password', value: keyDraft, placeholder: 'Enter key…',
          onChange: e => setKeyDraft(e.target.value),
          onKeyDown: e => e.key === 'Enter' && saveKey(),
          style: { flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 4,
            border: '1px solid var(--ink-3)', background: 'var(--bg-1)', color: 'var(--ink-1)' },
        }),
        h('button', { className: 'chip', onClick: saveKey, disabled: !keyDraft }, 'Save'),
        h('button', { className: 'chip', onClick: () => setShowKeyInput(false) }, 'Cancel')),

      // Error state
      error && !needsSetup && h('div', { className: 'empty', style: { marginBottom: 12, color: 'var(--col-cancel)' } },
        `Error: ${error}`),

      // Setup guide
      needsSetup && h(SetupGuide, null),

      // Data panels
      data && h('div', null,
        h(Section, { title: 'Workers KV · AP127_WD namespace' },
          h(UsageBar, { label: 'Reads',   used: kv.reads,   limit: limits.kvReads,   sublabel: 'per day' }),
          h(UsageBar, { label: 'Writes',  used: kv.writes,  limit: limits.kvWrites,  sublabel: 'per day' }),
          h(UsageBar, { label: 'Deletes', used: kv.deletes, limit: limits.kvDeletes, sublabel: 'per day' }),
          h(UsageBar, { label: 'Lists',   used: kv.lists,   limit: limits.kvLists,   sublabel: 'per day' })),

        h(Section, { title: 'Workers · ap127-watchdog' },
          h(UsageBar, { label: 'Requests', used: worker.requests, limit: limits.workerRequests, sublabel: 'per day' })),

        h('div', { style: { fontSize: 10, color: 'var(--ink-3)', marginTop: 8 } },
          `Date: ${data.date} UTC · Data from Cloudflare Analytics API · 5-min cache`)),

      // Empty state (before first load)
      !data && !error && !loading && !showKeyInput &&
        h('div', { className: 'empty' }, 'No data — click Refresh or set API key.'),

      loading && !data && h('div', { className: 'empty' }, 'Loading…'));
  }

  window.CfUsageView = CfUsageView;
})();
