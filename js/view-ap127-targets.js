/* AP127 V2 — AP127 Targets admin (view-ap127-targets.js)
 * Editor for the batch-wide milestone target schedule (date -> lesson number) that AP127 Detail
 * V4's charts overlay — data lives in js/ap127-targets-data.js. This app has no writable backend
 * (a static Cloudflare Pages deploy off committed data files), so edits made here persist to this
 * browser's localStorage plus a local revision log; the durable, shared revision record is git
 * history on js/ap127-targets-data.js — the "Export for commit" panel below gets you there.
 * Plain React.createElement (no JSX) — matches the other System-tab views (view-watchdog.js,
 * view-cf-usage.js), loaded as a plain <script> so it skips Babel.
 */
(function () {
  const { useState, useEffect, useCallback } = React;
  const h = React.createElement;

  function loadLog() {
    try { return JSON.parse(localStorage.getItem(window.AP127_TARGETS_LOG_KEY) || '[]'); } catch (e) { return []; }
  }
  function pushLog(action) {
    const log = loadLog();
    log.unshift({ ts: new Date().toISOString(), action });
    const trimmed = log.slice(0, 200);
    localStorage.setItem(window.AP127_TARGETS_LOG_KEY, JSON.stringify(trimmed));
    return trimmed;
  }
  function persist(list) {
    localStorage.setItem(window.AP127_TARGETS_LS_KEY, JSON.stringify(list));
  }
  function sortList(list) {
    return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  function fmtDate(ds) {
    try { return new Date(ds + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch (e) { return ds; }
  }
  function fmtTs(iso) {
    try { return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return iso; }
  }
  function inputStyle() {
    return { background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: 5, padding: '4px 7px', fontSize: 12, fontFamily: "'JetBrains Mono',monospace" };
  }
  function cellStyle() {
    return { padding: '7px 10px', fontSize: 12.5, borderBottom: '1px solid var(--line-soft)' };
  }
  function thStyle() {
    return { textAlign: 'left', padding: '8px 10px', fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.5px', borderBottom: '1px solid var(--line-soft)' };
  }

  function Row({ item, index, editing, onEdit, onSave, onCancel, onDelete, prevLesson }) {
    const [d, setD] = useState(item.date);
    const [l, setL] = useState(item.lesson);
    useEffect(() => { setD(item.date); setL(item.lesson); }, [item, editing]);
    const delta = prevLesson != null ? item.lesson - prevLesson : null;
    if (editing) {
      return h('tr', null,
        h('td', { style: cellStyle() }, h('input', { type: 'date', value: d, onChange: e => setD(e.target.value), style: inputStyle() })),
        h('td', { style: cellStyle() }, h('input', { type: 'number', value: l, onChange: e => setL(e.target.value), style: { ...inputStyle(), width: 70 } })),
        h('td', { style: cellStyle() }, '—'),
        h('td', { style: cellStyle() },
          h('button', { className: 'chip', style: { marginRight: 6 }, onClick: () => onSave(index, { date: d, lesson: parseInt(l, 10) || 0 }) }, 'Save'),
          h('button', { className: 'chip', onClick: onCancel }, 'Cancel')));
    }
    return h('tr', null,
      h('td', { style: cellStyle() }, fmtDate(item.date)),
      h('td', { style: { ...cellStyle(), fontWeight: 700 } }, 'L' + item.lesson),
      h('td', { style: { ...cellStyle(), color: delta == null ? 'var(--ink-3)' : 'var(--ink-2)' } }, delta == null ? '—' : `+${delta}`),
      h('td', { style: cellStyle() },
        h('button', { className: 'chip', style: { marginRight: 6 }, onClick: () => onEdit(index) }, 'Edit'),
        h('button', { className: 'chip', onClick: () => onDelete(index) }, 'Delete')));
  }

  function AP127TargetsView() {
    const [targets, setTargets] = useState(() => sortList(window.ap127GetMilestoneTargets()));
    const [isOverride, setIsOverride] = useState(() => !!localStorage.getItem(window.AP127_TARGETS_LS_KEY));
    const [log, setLog] = useState(loadLog);
    const [editingIndex, setEditingIndex] = useState(null);
    const [newDate, setNewDate] = useState('');
    const [newLesson, setNewLesson] = useState('');
    const [copied, setCopied] = useState(false);

    const commit = useCallback((list, action) => {
      const sorted = sortList(list);
      setTargets(sorted);
      persist(sorted);
      setIsOverride(true);
      setLog(pushLog(action));
    }, []);

    const onAdd = () => {
      if (!newDate || !newLesson) return;
      if (targets.some(t => t.date === newDate)) { alert('A target for that date already exists — edit it instead.'); return; }
      const lesson = parseInt(newLesson, 10) || 0;
      commit([...targets, { date: newDate, lesson }], `Added ${fmtDate(newDate)} → Lesson ${lesson}`);
      setNewDate(''); setNewLesson('');
    };
    const onSaveRow = (i, next) => {
      const before = targets[i];
      const list = targets.map((t, idx) => (idx === i ? next : t));
      commit(list, `Changed ${fmtDate(before.date)} · L${before.lesson} → ${fmtDate(next.date)} · L${next.lesson}`);
      setEditingIndex(null);
    };
    const onDelete = (i) => {
      const t = targets[i];
      if (!confirm(`Delete the ${fmtDate(t.date)} → Lesson ${t.lesson} target?`)) return;
      commit(targets.filter((_, idx) => idx !== i), `Deleted ${fmtDate(t.date)} → Lesson ${t.lesson}`);
    };
    const onReset = () => {
      if (!confirm('Reset to the code defaults? Your local edits will be cleared (the log below keeps a record).')) return;
      localStorage.removeItem(window.AP127_TARGETS_LS_KEY);
      setTargets(sortList(window.AP127_MILESTONE_TARGETS_DEFAULT));
      setIsOverride(false);
      setLog(pushLog('Reset to code defaults'));
    };

    const exportText = 'window.AP127_MILESTONE_TARGETS_DEFAULT = [\n' +
      targets.map(t => `  { date: "${t.date}", lesson: ${t.lesson} },`).join('\n') +
      '\n];';
    const onCopy = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(exportText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
      }
    };

    return h('div', { style: { padding: 16, maxWidth: 900 } },
      h('div', { style: { marginBottom: 14 } },
        h('div', { style: { fontFamily: "'Rajdhani',sans-serif", fontSize: 22, fontWeight: 700 } }, 'AP127 Targets'),
        h('div', { style: { fontSize: 12, color: 'var(--ink-2)', marginTop: 2 } },
          'Batch-wide milestone schedule — the date the whole AP127 batch is expected to have reached a given lesson by. Read by every chart/timeline on AP127 Detail V4.')),

      h('div', { className: 'panel', style: { marginBottom: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        h('span', { className: 'pill ' + (isOverride ? 'rev' : 'ok') }, isOverride ? 'LOCAL OVERRIDE — this browser only' : 'CODE DEFAULT'),
        h('span', { style: { fontSize: 11.5, color: 'var(--ink-3)' } },
          isOverride
            ? 'You have unsaved local edits. They apply only in this browser (including the AP127 Detail V4 overlays) until exported and committed — see below.'
            : 'Showing the committed schedule from js/ap127-targets-data.js.'),
        isOverride && h('button', { className: 'chip', style: { marginLeft: 'auto' }, onClick: onReset }, '↺ Reset to code defaults')),

      h('div', { className: 'panel', style: { marginBottom: 12 } },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Schedule'), h('span', { className: 'ps' }, `${targets.length} checkpoints`)),
        h('div', { style: { overflowX: 'auto' } },
          h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null, h('tr', null,
              h('th', { style: thStyle() }, 'Date'),
              h('th', { style: thStyle() }, 'Target Lesson'),
              h('th', { style: thStyle() }, 'Δ from prev'),
              h('th', { style: thStyle() }, 'Actions'))),
            h('tbody', null, targets.map((t, i) => h(Row, {
              key: t.date + '|' + i, item: t, index: i, editing: editingIndex === i,
              prevLesson: i > 0 ? targets[i - 1].lesson : null,
              onEdit: setEditingIndex, onSave: onSaveRow, onCancel: () => setEditingIndex(null), onDelete
            }))))),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', borderTop: '1px solid var(--line-soft)', flexWrap: 'wrap' } },
          h('input', { type: 'date', value: newDate, onChange: e => setNewDate(e.target.value), style: inputStyle() }),
          h('input', { type: 'number', placeholder: 'Lesson #', value: newLesson, onChange: e => setNewLesson(e.target.value), style: { ...inputStyle(), width: 90 } }),
          h('button', { className: 'chip', onClick: onAdd }, '+ Add checkpoint'))),

      h('div', { className: 'panel', style: { marginBottom: 12 } },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Export for commit')),
        h('div', { style: { padding: '10px 14px' } },
          h('p', { style: { fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 8, lineHeight: 1.5 } },
            'This app has no writable backend — edits above are saved to your browser only. To make a change permanent and visible to everyone, copy this and paste it over ',
            h('code', null, 'AP127_MILESTONE_TARGETS_DEFAULT'), ' in ', h('code', null, 'js/ap127-targets-data.js'),
            ', then commit and deploy. Git history becomes the shared, permanent revision record — same as everything else in this codebase.'),
          h('pre', { style: { background: 'var(--bg-2)', padding: 10, borderRadius: 6, fontSize: 11, fontFamily: 'monospace', overflowX: 'auto', maxHeight: 240, overflowY: 'auto', margin: 0 } }, exportText),
          h('button', { className: 'chip', style: { marginTop: 8 }, onClick: onCopy }, copied ? '✓ Copied' : 'Copy to clipboard'))),

      h('div', { className: 'panel' },
        h('div', { className: 'ph' }, h('span', { className: 'pt' }, 'Revision history'), h('span', { className: 'ps' }, 'this browser only')),
        h('div', { style: { padding: '4px 14px 10px', maxHeight: 220, overflowY: 'auto' } },
          log.length === 0
            ? h('p', { style: { fontSize: 11.5, color: 'var(--ink-3)', padding: '8px 0' } }, 'No local edits yet.')
            : log.map((e, i) => h('div', {
                key: i,
                style: { display: 'flex', gap: 10, padding: '6px 0', borderBottom: i < log.length - 1 ? '1px solid var(--line-soft)' : 'none', fontSize: 11.5 }
              },
                h('span', { style: { color: 'var(--ink-3)', fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 } }, fmtTs(e.ts)),
                h('span', { style: { color: 'var(--ink-2)' } }, e.action))))));
  }

  window.AP127TargetsView = AP127TargetsView;
})();
