# Schedule View Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix cancelled flights that are invisible in CMDV2's Schedule view, surface unused data fields on the flight detail card, and enrich the Calendar's leave detail.

**Architecture:** All changes are in `/Users/nugui/AP127_V2` (CMDV2), a no-build React app loaded via plain `<script type="text/babel">` tags — there is no bundler and no JS test runner for this project. One data-layer join pass in `js/shared.js` backfills/synthesizes flight records from the separate `cancellations[]` feed so every downstream view (Board, Weekly, Calendar) picks them up automatically; UI tasks add small, targeted JSX to the existing Drawer/Board/Weekly/Calendar components.

**Tech Stack:** React 18 (via CDN, no build step), Babel Standalone (in-browser JSX transform for files marked `type="text/babel"`), plain JS for the rest, Cloudflare Pages (static hosting).

## Global Constraints

- No backend/data-pipeline changes — read-only against fields already present in `flight-data.js`. (Spec §"Out of scope".)
- Never override a `cancelReason`/`cancelRemarks` value the upstream pipeline already attached to a flight — only fill gaps. (Spec §1, confirmed live: the upstream pipeline sometimes pre-attaches these directly.)
- `leavesOnDate()`'s existing signature and callers (Board, Weekly) must not change — add a new sibling helper instead. (Spec §4.)
- This project has no test framework; every task's verification step is a live browser-preview check via the Claude Browser tools (`preview_start`, `navigate`, `javascript_tool`, `read_page`), which is this codebase's actual established verification method (see `AP127_V2/CLAUDE.md`: "Drive views in preview").
- Per this project's update rule (`AP127_V2/CLAUDE.md`): every code change bumps the `?v=pNN` cache-bust token on **all** `<script>` tags in `index.html` together — this happens once, in the final task, after all code changes land.

---

## Task 1: Data join pass — synthesize/backfill Canceled flights

**Files:**
- Modify: `js/shared.js:38-39` (insert new IIFE between the existing dedup IIFE's closing `})();` at line 38 and the "Strip (Unplanned)" comment at line 39)

**Interfaces:**
- Consumes: `window.FLIGHT_DATA.flights` (array, mutated in place via `.push()`), `window.FLIGHT_DATA.cancellations` (array of `{id, bookingId, date, reason, remarks, instructor, student, batch, lesson, acType, acReg}`)
- Produces: every Canceled flight now carries `cancelReason`/`cancelRemarks` when available; every cancellation with no live-matching flight now has a synthetic entry in `FLIGHT_DATA.flights` (and therefore in `FLIGHTS`, since `FLIGHTS` at line 45 is `const FLIGHTS = window.FLIGHT_DATA.flights` — an alias to the same array object, so anything pushed before that line is already present) shaped `{ id: 'CANCEL_'+bookingId, date, status:'Canceled', isSim, isStandby:false, start:null, end:null, durMin:0, duration:'—', student, instructor, batch, lesson, cond:null, type, tail, cancelReason, cancelRemarks, _noTime:true, _virtual:true }`. Later tasks (2, 3, 4, 5, 6) read `f._noTime`, `f.cancelReason`, `f.cancelRemarks`.

- [ ] **Step 1: Read the exact current lines to confirm the insertion point**

Run: `sed -n '35,45p' /Users/nugui/AP127_V2/js/shared.js`

Expected output:
```
  if (keyFallback) {
    console.warn('[AP127] dedup: ' + keyFallback + ' planned Completed row(s) removed via student|date|lesson fallback (ACTUAL_ONLY id did not derive to a planned id — check upstream ID format).');
  }
})();
// Strip " (Unplanned)" suffix from student/instructor names so all views treat
// "NAME (Unplanned)" and "NAME" as the same person.
window.FLIGHT_DATA.flights.forEach(f => {
  if (f.student)    f.student    = f.student.replace(/\s*\(Unplanned\)\s*$/i, '').trim();
  if (f.instructor) f.instructor = f.instructor.replace(/\s*\(Unplanned\)\s*$/i, '').trim();
});
const FLIGHTS     = window.FLIGHT_DATA.flights;
```

- [ ] **Step 2: Insert the join/synthesize pass**

Using the Edit tool, insert this new block immediately after line 38 (`})();`) and before line 39 (`// Strip " (Unplanned)"...`) — placing it before the Unplanned-strip `forEach` means synthetic flights get that same name-cleanup pass for free:

```js
// Join the separate cancellations[] feed onto Canceled flights. The upstream pipeline
// sometimes pre-attaches cancelReason/cancelRemarks directly on the flight itself (do
// NOT override those); otherwise backfill from here. A cancellation whose bookingId has
// no matching flight — or whose matching id belongs to a flight that ISN'T actually
// Canceled (the same booking-id-reuse pattern already documented for Watchdog in
// CLAUDE.md) — gets a synthetic flight so it's visible everywhere FLIGHTS is read. These
// have no start/end (the cancellations feed never carries a time) — `_noTime` flags that.
(function attachCancelDetails() {
  const cancellations = window.FLIGHT_DATA.cancellations || [];
  const byId = new Map(window.FLIGHT_DATA.flights.map(f => [f.id, f]));
  cancellations.forEach(c => {
    const match = byId.get(c.bookingId);
    if (match && match.status === 'Canceled') {
      if (!match.cancelReason)  match.cancelReason  = c.reason;
      if (!match.cancelRemarks) match.cancelRemarks = c.remarks;
      return;
    }
    window.FLIGHT_DATA.flights.push({
      id: 'CANCEL_' + c.bookingId, date: c.date, status: 'Canceled',
      isSim: /sim/i.test(c.acType || ''), isStandby: false,
      start: null, end: null, durMin: 0, duration: '—',
      student: c.student, instructor: c.instructor, batch: c.batch, lesson: c.lesson,
      cond: null, type: c.acType, tail: c.acReg,
      cancelReason: c.reason, cancelRemarks: c.remarks,
      _noTime: true, _virtual: true,
    });
  });
})();
```

- [ ] **Step 3: Verify in-browser**

Run: `preview_start({ url: 'file:///Users/nugui/AP127_V2/index.html' })` (or serve via a local static server if `file://` fetches are blocked by CORS — if so, run `cd /Users/nugui/AP127_V2 && python3 -m http.server 7733` in the background and use `preview_start({ url: 'http://localhost:7733' })`)

Then `javascript_tool`:
```js
({
  synthetic: window.FLIGHT_DATA.flights.find(f => f.id === 'CANCEL_BK-8IWR-3978'),
  noRealDupe: window.FLIGHT_DATA.flights.filter(f => f.id === 'BK-8IWR-3978').length,
})
```

Expected: `synthetic` is an object with `student: "VASAPHON S."`, `batch: "AP-127"`, `lesson: "CDGL 02"`, `cancelReason: "Other"`, `cancelRemarks: "Late Aircraft"`, `_noTime: true`; `noRealDupe` is `0` (confirms no id collision with a real flight).

Also run `read_console_messages({ onlyErrors: true })` — expect no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/shared.js
git commit -m "fix: backfill/synthesize Canceled flights missing from the cancellations join"
```

---

## Task 2: Sort-order fix for no-time entries (Weekly + Calendar)

**Files:**
- Modify: `js/view-weekly.js:117` (approx — the `list` sort inside `currentWeek.map`)
- Modify: `js/view-calendar.js:125` (approx — inside `panelData`'s `useM_cal`)

**Interfaces:**
- Consumes: `f._noTime` and `minutesOf()` from Task 1 / existing `shared.js`.
- Produces: no-time flights sort after all timed flights instead of colliding with midnight (`||0` treats a missing start as `00:00`).

- [ ] **Step 1: Confirm current lines**

Run: `grep -n "minutesOf(a.start)||0\|minutesOf(a.start) *|| *0" /Users/nugui/AP127_V2/js/view-weekly.js /Users/nugui/AP127_V2/js/view-calendar.js`

Expected output includes:
```
js/view-weekly.js:            const list = [...(byDate[d]||[])].sort((a,b)=>(minutesOf(a.start)||0)-(minutesOf(b.start)||0));
js/view-calendar.js:      .sort((a,b) => (minutesOf(a.start)||0) - (minutesOf(b.start)||0));
```

- [ ] **Step 2: Fix `view-weekly.js`**

Using Edit, change:
```js
            const list = [...(byDate[d]||[])].sort((a,b)=>(minutesOf(a.start)||0)-(minutesOf(b.start)||0));
```
to:
```js
            const list = [...(byDate[d]||[])].sort((a,b)=>(minutesOf(a.start) ?? Infinity)-(minutesOf(b.start) ?? Infinity));
```

- [ ] **Step 3: Fix `view-calendar.js`**

Using Edit, change:
```js
    const all = FLIGHTS.filter(f => f.date === selectedDate && passF(f))
      .sort((a,b) => (minutesOf(a.start)||0) - (minutesOf(b.start)||0));
```
to:
```js
    const all = FLIGHTS.filter(f => f.date === selectedDate && passF(f))
      .sort((a,b) => (minutesOf(a.start) ?? Infinity) - (minutesOf(b.start) ?? Infinity));
```

- [ ] **Step 4: Verify in-browser**

In the running preview, drive the app to the Weekly layout and navigate to the week containing 2026-05-05:
```js
window.dispatchEvent(new CustomEvent('ap127-go', { detail: 'schedule' }));
```
Then use `read_page` to find and click the "Week" layout chip, and the week/date navigation, until the 2026-05-05 column is visible (or set the date directly via the app: `javascript_tool` can't reach React state directly, so use `computer`/`read_page` to click the date picker to 2026-05-05, then click the "Week" chip).

Expected: the VASAPHON S. / CDGL 02 tile in the 05 MAY column appears **after** all timed flights in that day's list (i.e. at the bottom), not inserted somewhere in the middle by start time.

- [ ] **Step 5: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-weekly.js js/view-calendar.js
git commit -m "fix: sort no-time flights after timed ones in Weekly and Calendar"
```

---

## Task 3: Flight detail card (Drawer) — cancel reason/remarks, no-time badge, block times

**Files:**
- Modify: `js/shared.js:912-947` (the body of the `Drawer` component, between the header and the footer)

**Interfaces:**
- Consumes: `f._noTime`, `f.cancelReason`, `f.cancelRemarks` (Task 1), `f.blockOff`/`f.blockOn` (already present in `flight-data.js`, previously unused).
- Produces: no new exports — purely a rendering change inside `Drawer`.

- [ ] **Step 1: Confirm current lines**

Run: `sed -n '912,947p' /Users/nugui/AP127_V2/js/shared.js`

Expected: matches the block shown in Step 2's "old" content below.

- [ ] **Step 2: Replace the Drawer body**

Using Edit, replace this exact block:

```jsx
        <div style={{ padding:'8px 20px', flex:1, overflowY:'auto' }}>
          <div style={{ display:'flex', gap:8, padding:'12px 0', flexWrap:'wrap' }}>
            <StatusPill status={f.status} size="lg"/>
            {f.isStandby && <StandbyTag size="lg"/>}
            {f.isSim     && <Tag color="var(--col-sim)">SIM</Tag>}
            {isHL        && <Tag color="var(--highlight)" filled>AP-127</Tag>}
          </div>
          <Row k="TIME"       v={<span className="mono">{f.start} — {f.end} · {f.duration}</span>}/>
          <Row k="DURATION"   v={<span className="mono">{Math.floor(f.durMin/60)}h {f.durMin%60}m</span>}/>
          <Row k="STUDENT"    v={f.student}/>
          <Row k="INSTRUCTOR" v={f.instructor}/>
          <Row k="BATCH"      v={<span className="mono">{f.batch}</span>}/>
          <Row k="LESSON"     v={<span className="mono">{f.lesson}</span>}/>
          <Row k="CONDITION"  v={f.cond}/>
          {f.isStandby && <Row k="STANDBY" v={<span style={{color:'var(--col-stby)'}}>Waiting for slot to open</span>}/>}
          <Row k="A/C TYPE"   v={<span className="mono">{f.type}</span>}/>
          <Row k="TAIL"       v={<span className="mono" style={{ display:'inline-block',padding:'2px 8px',borderRadius:3,background:'var(--bg-2)',border:'1px solid var(--line)' }}>{f.tail||'TBD'}</span>}/>
          {f.status === 'Completed' && (f.tkoff || f.ldgTime || f.airborne) && (
            <Row k="ACTUAL TIMES" v={
              <span className="mono" style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {f.tkoff   && <span style={{color:'var(--ink-2)'}}>T/O <strong>{f.tkoff}</strong></span>}
                {f.ldgTime && <span style={{color:'var(--ink-2)'}}>LDG <strong>{f.ldgTime}</strong></span>}
                {f.airborne && <span style={{color:'var(--ink-3)'}}>AIR <strong>{f.airborne}</strong></span>}
              </span>
            }/>
          )}
          {f.status === 'Completed' && (f.to != null || f.ldg != null || f.inst != null) && (
            <Row k="T/O · LDG · INST" v={
              <span className="mono" style={{ display:'flex', gap:16 }}>
                <span><span style={{color:'var(--ink-3)',fontSize:10}}>T/O</span> <strong style={{fontSize:15}}>{f.to ?? '—'}</strong></span>
                <span><span style={{color:'var(--ink-3)',fontSize:10}}>LDG</span> <strong style={{fontSize:15}}>{f.ldg ?? '—'}</strong></span>
                <span><span style={{color:'var(--ink-3)',fontSize:10}}>INST</span> <strong style={{fontSize:15}}>{f.inst ?? '—'}</strong></span>
              </span>
            }/>
          )}
        </div>
```

with:

```jsx
        <div style={{ padding:'8px 20px', flex:1, overflowY:'auto' }}>
          <div style={{ display:'flex', gap:8, padding:'12px 0', flexWrap:'wrap' }}>
            <StatusPill status={f.status} size="lg"/>
            {f.isStandby && <StandbyTag size="lg"/>}
            {f.isSim     && <Tag color="var(--col-sim)">SIM</Tag>}
            {isHL        && <Tag color="var(--highlight)" filled>AP-127</Tag>}
            {f._noTime   && <Tag color="var(--ink-3)">NO TIME LOGGED</Tag>}
          </div>
          {f.status === 'Canceled' && (f.cancelReason || f.cancelRemarks) && (
            <>
              {f.cancelReason  && <Row k="CANCEL REASON" v={<span style={{color:'var(--col-cancel)'}}>{f.cancelReason}</span>}/>}
              {f.cancelRemarks && <Row k="REMARKS"       v={<span style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{f.cancelRemarks}</span>}/>}
            </>
          )}
          {!f._noTime && (
            <>
              <Row k="TIME"     v={<span className="mono">{f.start} — {f.end} · {f.duration}</span>}/>
              <Row k="DURATION" v={<span className="mono">{Math.floor(f.durMin/60)}h {f.durMin%60}m</span>}/>
            </>
          )}
          <Row k="STUDENT"    v={f.student}/>
          <Row k="INSTRUCTOR" v={f.instructor}/>
          <Row k="BATCH"      v={<span className="mono">{f.batch}</span>}/>
          <Row k="LESSON"     v={<span className="mono">{f.lesson}</span>}/>
          <Row k="CONDITION"  v={f.cond}/>
          {f.isStandby && <Row k="STANDBY" v={<span style={{color:'var(--col-stby)'}}>Waiting for slot to open</span>}/>}
          <Row k="A/C TYPE"   v={<span className="mono">{f.type}</span>}/>
          <Row k="TAIL"       v={<span className="mono" style={{ display:'inline-block',padding:'2px 8px',borderRadius:3,background:'var(--bg-2)',border:'1px solid var(--line)' }}>{f.tail||'TBD'}</span>}/>
          {f.status === 'Completed' && (f.tkoff || f.ldgTime || f.airborne) && (
            <Row k="ACTUAL TIMES" v={
              <span className="mono" style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {f.tkoff   && <span style={{color:'var(--ink-2)'}}>T/O <strong>{f.tkoff}</strong></span>}
                {f.ldgTime && <span style={{color:'var(--ink-2)'}}>LDG <strong>{f.ldgTime}</strong></span>}
                {f.airborne && <span style={{color:'var(--ink-3)'}}>AIR <strong>{f.airborne}</strong></span>}
              </span>
            }/>
          )}
          {f.status === 'Completed' && (f.to != null || f.ldg != null || f.inst != null) && (
            <Row k="T/O · LDG · INST" v={
              <span className="mono" style={{ display:'flex', gap:16 }}>
                <span><span style={{color:'var(--ink-3)',fontSize:10}}>T/O</span> <strong style={{fontSize:15}}>{f.to ?? '—'}</strong></span>
                <span><span style={{color:'var(--ink-3)',fontSize:10}}>LDG</span> <strong style={{fontSize:15}}>{f.ldg ?? '—'}</strong></span>
                <span><span style={{color:'var(--ink-3)',fontSize:10}}>INST</span> <strong style={{fontSize:15}}>{f.inst ?? '—'}</strong></span>
              </span>
            }/>
          )}
          {(f.blockOff || f.blockOn) && (
            <Row k="BLOCK OFF / ON" v={
              <span className="mono" style={{ display:'flex', gap:12 }}>
                {f.blockOff && <span style={{color:'var(--ink-2)'}}>OFF <strong>{f.blockOff}</strong></span>}
                {f.blockOn  && <span style={{color:'var(--ink-2)'}}>ON <strong>{f.blockOn}</strong></span>}
              </span>
            }/>
          )}
        </div>
```

- [ ] **Step 3: Verify in-browser**

In the running preview, open the Board (Day) layout, set the date to 2026-05-05, click the VASAPHON S. / CDGL 02 row to open the Drawer.

Use `read_page` on the Drawer panel. Expected:
- A "NO TIME LOGGED" tag next to the status pill.
- A "CANCEL REASON" row reading "Other" and a "REMARKS" row reading "Late Aircraft".
- No "TIME"/"DURATION" rows (suppressed).

Then open a Completed flight known to have `blockOff`/`blockOn` — from data already verified: search `window.FLIGHT_DATA.flights.find(f=>f.id==='ACTUAL_ONLY_BK-QW5Z-8829')` via `javascript_tool` to confirm it still exists in the loaded data, then find and click that student/lesson/date combination in the Board. Expected: a "BLOCK OFF / ON" row showing `OFF 06:00` and `ON 08:00`.

Confirm no console errors via `read_console_messages({ onlyErrors: true })`.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/shared.js
git commit -m "feat: show cancel reason/remarks, no-time badge, and block times on the flight card"
```

---

## Task 4: Board (day list) — NO TIME tag

**Files:**
- Modify: `js/view-board.js:161-165`

**Interfaces:**
- Consumes: `f._noTime` (Task 1).

- [ ] **Step 1: Confirm current lines**

Run: `sed -n '161,165p' /Users/nugui/AP127_V2/js/view-board.js`

Expected:
```jsx
                <span style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
                  <StatusPill status={f.status}/>
                  {f.isStandby&&<StandbyTag/>}
                  {f.isSim&&<Tag color="var(--col-sim)" mono>SIM</Tag>}
                </span>
```

- [ ] **Step 2: Add the tag**

Using Edit, change:
```jsx
                <span style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
                  <StatusPill status={f.status}/>
                  {f.isStandby&&<StandbyTag/>}
                  {f.isSim&&<Tag color="var(--col-sim)" mono>SIM</Tag>}
                </span>
```
to:
```jsx
                <span style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
                  <StatusPill status={f.status}/>
                  {f.isStandby&&<StandbyTag/>}
                  {f.isSim&&<Tag color="var(--col-sim)" mono>SIM</Tag>}
                  {f._noTime&&<Tag color="var(--ink-3)" mono>NO TIME</Tag>}
                </span>
```

- [ ] **Step 3: Verify in-browser**

Board layout, date 2026-05-05. Use `read_page` on the flight table. Expected: the VASAPHON S. row shows a "NO TIME" tag next to its status pill, and its START/DUR/END columns render blank (not "undefined" or "NaN").

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-board.js
git commit -m "feat: tag no-time flights in the Board list"
```

---

## Task 5: Weekly — NO TIME tag

**Files:**
- Modify: `js/view-weekly.js:176-179`

**Interfaces:**
- Consumes: `f._noTime` (Task 1).

- [ ] **Step 1: Confirm current lines**

Run: `grep -n "mono num.*fontSize:12,fontWeight:600" /Users/nugui/AP127_V2/js/view-weekly.js`

Expected: one match, the flight-tile time+batch row.

- [ ] **Step 2: Add the tag**

Using Edit, change:
```jsx
                        <div style={{ display:'flex',gap:6,alignItems:'baseline' }}>
                          <span className="mono num" style={{ fontSize:12,fontWeight:600,color:'var(--ink)' }}>{f.start}</span>
                          <span className="mono uc" style={{ fontSize:8,color:f.batch===HIGHLIGHT_BATCH?'var(--highlight)':'var(--ink-3)',fontWeight:f.batch===HIGHLIGHT_BATCH?600:400 }}>{f.batch}</span>
                        </div>
```
to:
```jsx
                        <div style={{ display:'flex',gap:6,alignItems:'baseline' }}>
                          <span className="mono num" style={{ fontSize:12,fontWeight:600,color:'var(--ink)' }}>{f.start}</span>
                          <span className="mono uc" style={{ fontSize:8,color:f.batch===HIGHLIGHT_BATCH?'var(--highlight)':'var(--ink-3)',fontWeight:f.batch===HIGHLIGHT_BATCH?600:400 }}>{f.batch}</span>
                          {f._noTime && <span className="mono uc" style={{ fontSize:7,color:'var(--ink-3)',padding:'1px 4px',border:'1px dashed var(--ink-3)',borderRadius:2 }}>NO TIME</span>}
                        </div>
```

- [ ] **Step 3: Verify in-browser**

Weekly layout, week containing 2026-05-05. Expected: the VASAPHON S. tile shows a dashed "NO TIME" tag next to its (blank) start/batch line, positioned after the timed tiles in that day's column (per Task 2's sort fix).

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-weekly.js
git commit -m "feat: tag no-time flights in the Weekly board"
```

---

## Task 6: Calendar day panel — NO TIME tag + cancel-reason chip

**Files:**
- Modify: `js/view-calendar.js:252-283` (the `pd.ap127` flight-list block inside `DayPanel`)

**Interfaces:**
- Consumes: `f._noTime`, `f.cancelReason` (Task 1).

- [ ] **Step 1: Confirm current lines**

Run: `sed -n '252,283p' /Users/nugui/AP127_V2/js/view-calendar.js`

Expected: matches the "old" block in Step 2.

- [ ] **Step 2: Replace the flight-row rendering**

Using Edit, replace:
```jsx
                      <button key={f.id+i}
                        onClick={() => { app.setDrawer(f.id); }}
                        style={{
                          textAlign:'left', padding:'7px 10px', borderRadius:5, cursor:'pointer',
                          background:`color-mix(in oklch,${col} 8%,var(--bg-2))`,
                          border:`1px solid color-mix(in oklch,${col} 25%,var(--line))`,
                          borderLeft:`3px solid ${col}`, color:'var(--ink)',
                        }}>
                        <div style={{ display:'flex', gap:6, alignItems:'baseline', marginBottom:2 }}>
                          <span className="mono num" style={{ fontSize:11, fontWeight:600 }}>{f.start}</span>
                          <span className="mono uc" style={{ fontSize:8, color:col }}>{f.status}</span>
                          <span style={{ flex:1 }}/>
                          <span className="mono" style={{ fontSize:9, color:'var(--ink-3)' }}>{f.duration||''}</span>
                        </div>
                        <div style={{ fontSize:11, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.student||'—'}</div>
                        <div className="mono uc" style={{ fontSize:8, color:'var(--ink-3)', marginTop:1, display:'flex', gap:5 }}>
                          <span>{f.lesson}</span>
                          {f.instructor && <><span>·</span><span>{f.instructor}</span></>}
                          {f.tail && <><span>·</span><span>{f.tail}</span></>}
                        </div>
                      </button>
```
with:
```jsx
                      <button key={f.id+i}
                        onClick={() => { app.setDrawer(f.id); }}
                        style={{
                          textAlign:'left', padding:'7px 10px', borderRadius:5, cursor:'pointer',
                          background:`color-mix(in oklch,${col} 8%,var(--bg-2))`,
                          border:`1px solid color-mix(in oklch,${col} 25%,var(--line))`,
                          borderLeft:`3px solid ${col}`, color:'var(--ink)',
                        }}>
                        <div style={{ display:'flex', gap:6, alignItems:'baseline', marginBottom:2 }}>
                          {f._noTime
                            ? <span className="mono uc" style={{ fontSize:8, color:'var(--ink-3)', padding:'1px 4px', border:'1px dashed var(--ink-3)', borderRadius:2 }}>NO TIME</span>
                            : <span className="mono num" style={{ fontSize:11, fontWeight:600 }}>{f.start}</span>}
                          <span className="mono uc" style={{ fontSize:8, color:col }}>{f.status}</span>
                          <span style={{ flex:1 }}/>
                          <span className="mono" style={{ fontSize:9, color:'var(--ink-3)' }}>{f.duration||''}</span>
                        </div>
                        <div style={{ fontSize:11, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.student||'—'}</div>
                        <div className="mono uc" style={{ fontSize:8, color:'var(--ink-3)', marginTop:1, display:'flex', gap:5 }}>
                          <span>{f.lesson}</span>
                          {f.instructor && <><span>·</span><span>{f.instructor}</span></>}
                          {f.tail && <><span>·</span><span>{f.tail}</span></>}
                        </div>
                        {f.status === 'Canceled' && f.cancelReason && (
                          <div className="mono" style={{ fontSize:9, color:'var(--col-cancel)', marginTop:2 }}>{f.cancelReason}</div>
                        )}
                      </button>
```

- [ ] **Step 3: Verify in-browser**

Calendar layout, navigate to May 2026, click day 5. Expected: the day panel's "◆ AP-127 FLIGHTS" section includes VASAPHON S. / CDGL 02 with a "NO TIME" tag and a "Other" cancel-reason line beneath the lesson/instructor/tail line.

- [ ] **Step 4: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/view-calendar.js
git commit -m "feat: show no-time tag and cancel reason in Calendar day panel"
```

---

## Task 7: Calendar leave enrichment

**Files:**
- Modify: `js/shared.js:167-176` (add `leaveDetailOnDate` right after `leavesOnDate`)
- Modify: `js/shared.js:1112-1119` (export the new helper alongside `leavesOnDate`)
- Modify: `js/view-calendar.js:121-142` (`panelData` — add `lvDetail`, apply Task 2's sort fix here too if not already done)
- Modify: `js/view-calendar.js:285-311` (FI/SP leave row rendering in `DayPanel`)

**Interfaces:**
- Consumes: `LEAVES` (existing, `{id, name, batch, start, end, duration, reason, note, role}[]`).
- Produces: `leaveDetailOnDate(date)` → `{ [name]: { reason, duration, note, role, start, end } }`, exported on `window` alongside the existing exports. `panelData.lvDetail` (new field) consumed only by `CalendarBoard`'s `DayPanel`.

- [ ] **Step 1: Confirm current lines**

Run: `sed -n '165,177p' /Users/nugui/AP127_V2/js/shared.js`

Expected:
```js
// Returns { name → reason } for all people on leave on the given YYYY-MM-DD date.
// Results are cached so calling this many times per render is free.
const leavesOnDate = (() => {
  const cache = {};
  return date => {
    if (!date) return {};
    if (cache[date]) return cache[date];
    const m = {};
    LEAVES.forEach(l => { if (date >= l.start && date <= l.end) m[l.name] = l.reason || 'On Leave'; });
    return (cache[date] = m);
  };
})();
```

- [ ] **Step 2: Add `leaveDetailOnDate` in `shared.js`**

Using Edit, insert immediately after the `leavesOnDate` IIFE's closing `})();` (end of the block shown in Step 1):

```js
// Like leavesOnDate but returns the full leave record per name (reason, duration,
// note, role, and the leave's own start/end range) — used only by the Calendar's
// day-detail panel, which needs more than a bare reason string. leavesOnDate itself
// is left unchanged since Board/Weekly's leave badges only need the reason string.
const leaveDetailOnDate = (() => {
  const cache = {};
  return date => {
    if (!date) return {};
    if (cache[date]) return cache[date];
    const m = {};
    LEAVES.forEach(l => {
      if (date >= l.start && date <= l.end) {
        m[l.name] = { reason: l.reason || 'On Leave', duration: l.duration || '', note: l.note || '', role: l.role || '', start: l.start, end: l.end };
      }
    });
    return (cache[date] = m);
  };
})();
```

- [ ] **Step 3: Export it**

Run: `grep -n "MAINT_TAILS, isTailMaint, leavesOnDate," /Users/nugui/AP127_V2/js/shared.js`

Expected: one match around line 1115.

Using Edit, change:
```js
  MAINT_TAILS, isTailMaint, leavesOnDate,
```
to:
```js
  MAINT_TAILS, isTailMaint, leavesOnDate, leaveDetailOnDate,
```

- [ ] **Step 4: Wire into `panelData` in `view-calendar.js`**

Using Edit, change (this also folds in Task 2's sort fix if Task 2 ran first — if Task 2 already changed this line, only add the `lvDetail` parts):
```js
  const panelData = useM_cal(() => {
    if (!selectedDate) return null;
    const all = FLIGHTS.filter(f => f.date === selectedDate && passF(f))
      .sort((a,b) => (minutesOf(a.start) ?? Infinity) - (minutesOf(b.start) ?? Infinity));
    const lv   = leavesOnDate(selectedDate);
    const lvKeys = Object.keys(lv);
```
to:
```js
  const panelData = useM_cal(() => {
    if (!selectedDate) return null;
    const all = FLIGHTS.filter(f => f.date === selectedDate && passF(f))
      .sort((a,b) => (minutesOf(a.start) ?? Infinity) - (minutesOf(b.start) ?? Infinity));
    const lv       = leavesOnDate(selectedDate);
    const lvDetail = leaveDetailOnDate(selectedDate);
    const lvKeys = Object.keys(lv);
```

And change the `return` at the end of the same `useMemo`:
```js
    return { all, ap127, fis, sps, lv, stats: s, compRate };
```
to:
```js
    return { all, ap127, fis, sps, lv, lvDetail, stats: s, compRate };
```

- [ ] **Step 5: Enrich the FI leave rows**

Run: `sed -n '285,297p' /Users/nugui/AP127_V2/js/view-calendar.js` to confirm current content matches the "old" block below.

Using Edit, replace:
```jsx
            {/* FI leave */}
            {pd.fis.length > 0 && (
              <Sect title={`FI ON LEAVE · ${pd.fis.length}`} color="var(--col-stby)">
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {pd.fis.map(n => (
                    <div key={n} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', borderRadius:5, background:'color-mix(in oklch,var(--col-stby) 8%,var(--bg-2))', border:'1px solid color-mix(in oklch,var(--col-stby) 20%,var(--line))' }}>
                      <span style={{ flex:1, fontSize:11 }}>{n}</span>
                      <span className="mono uc" style={{ fontSize:8, color:'var(--col-stby)' }}>{pd.lv[n]||'ON LEAVE'}</span>
                    </div>
                  ))}
                </div>
              </Sect>
            )}
```
with:
```jsx
            {/* FI leave */}
            {pd.fis.length > 0 && (
              <Sect title={`FI ON LEAVE · ${pd.fis.length}`} color="var(--col-stby)">
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {pd.fis.map(n => {
                    const d = pd.lvDetail[n] || {};
                    return (
                      <div key={n} style={{ display:'flex', flexDirection:'column', gap:2, padding:'5px 8px', borderRadius:5, background:'color-mix(in oklch,var(--col-stby) 8%,var(--bg-2))', border:'1px solid color-mix(in oklch,var(--col-stby) 20%,var(--line))' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ flex:1, fontSize:11 }}>{n}</span>
                          {d.role && <span className="mono uc" style={{ fontSize:7, color:'var(--ink-3)' }}>{d.role}</span>}
                          <span className="mono uc" style={{ fontSize:8, color:'var(--col-stby)' }}>{d.reason || 'ON LEAVE'}</span>
                        </div>
                        {(d.duration || d.note) && (
                          <div className="mono" style={{ fontSize:9, color:'var(--ink-3)', display:'flex', gap:6 }}>
                            {d.duration && <span>{d.duration}</span>}
                            {d.note && <span style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{d.note}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Sect>
            )}
```

- [ ] **Step 6: Enrich the SP leave rows**

Run: `sed -n '299,311p' /Users/nugui/AP127_V2/js/view-calendar.js` to confirm current content matches the "old" block below (post-Step-5 line numbers will have shifted down slightly — use the printed content, not the line numbers, to locate it).

Using Edit, replace:
```jsx
            {/* SP leave */}
            {pd.sps.length > 0 && (
              <Sect title={`SP ON LEAVE · ${pd.sps.length}`} color={CAL_SP_COLOR}>
                <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:200, overflowY:'auto' }}>
                  {pd.sps.map(n => (
                    <div key={n} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', borderRadius:5, background:`color-mix(in oklch,${CAL_SP_COLOR} 8%,var(--bg-2))`, border:`1px solid color-mix(in oklch,${CAL_SP_COLOR} 20%,var(--line))` }}>
                      <span style={{ flex:1, fontSize:11 }}>{n}</span>
                      <span className="mono uc" style={{ fontSize:8, color:CAL_SP_COLOR }}>{pd.lv[n]||'ON LEAVE'}</span>
                    </div>
                  ))}
                </div>
              </Sect>
            )}
```
with:
```jsx
            {/* SP leave */}
            {pd.sps.length > 0 && (
              <Sect title={`SP ON LEAVE · ${pd.sps.length}`} color={CAL_SP_COLOR}>
                <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:200, overflowY:'auto' }}>
                  {pd.sps.map(n => {
                    const d = pd.lvDetail[n] || {};
                    return (
                      <div key={n} style={{ display:'flex', flexDirection:'column', gap:2, padding:'5px 8px', borderRadius:5, background:`color-mix(in oklch,${CAL_SP_COLOR} 8%,var(--bg-2))`, border:`1px solid color-mix(in oklch,${CAL_SP_COLOR} 20%,var(--line))` }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ flex:1, fontSize:11 }}>{n}</span>
                          {d.role && <span className="mono uc" style={{ fontSize:7, color:'var(--ink-3)' }}>{d.role}</span>}
                          <span className="mono uc" style={{ fontSize:8, color:CAL_SP_COLOR }}>{d.reason || 'ON LEAVE'}</span>
                        </div>
                        {(d.duration || d.note) && (
                          <div className="mono" style={{ fontSize:9, color:'var(--ink-3)', display:'flex', gap:6 }}>
                            {d.duration && <span>{d.duration}</span>}
                            {d.note && <span style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{d.note}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Sect>
            )}
```

- [ ] **Step 7: Verify in-browser**

`javascript_tool` in the running preview:
```js
({ sample: window.FLIGHT_DATA.leaves.find(l => l.name === 'SARACH C.') })
```
Expected: a leave record with `start:"2026-04-24"`, `end:"2026-04-28"`, `duration:"Full Day"`, `reason:"Personal Leave"`, `role:"Student"`.

Then in Calendar, navigate to April 2026, click day 25 (inside that range). Expected: the day panel's "SP ON LEAVE" section shows SARACH C. with reason "Personal Leave", duration "Full Day", and role "Student" rendered — not just the bare reason string shown before this task.

Confirm no console errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/nugui/AP127_V2
git add js/shared.js js/view-calendar.js
git commit -m "feat: enrich Calendar day-panel leave rows with duration/note/role"
```

---

## Task 8: Cache-bust, CMDV2 changelog, verify section, and push

**Files:**
- Modify: `index.html` (every `?v=p112` → `?v=p113`)
- Modify: `REVAMP.md` (new row in the §12 Continuation Log table)
- Modify: `CLAUDE.md` (this project's own — the "Last known" line in the Verify section)

- [ ] **Step 1: Bump the cache-bust token**

Run: `grep -c '?v=p112' /Users/nugui/AP127_V2/index.html`

Expected: a count (currently 21 occurrences across `<link>`/`<script>` tags).

Run:
```bash
cd /Users/nugui/AP127_V2
sed -i '' 's/?v=p112/?v=p113/g' index.html
grep -c '?v=p113' index.html
```
Expected: same count as before, now on `p113`; `grep -c '?v=p112' index.html` should return `0`.

- [ ] **Step 2: Add the REVAMP.md changelog row**

Run: `sed -n '386,387p' /Users/nugui/AP127_V2/REVAMP.md` to confirm the insertion point (the row for the 2026-07-25 Watchdog entry, immediately followed by the p112 row).

Using Edit, insert a new row immediately after the 2026-07-25 Watchdog row and before the `p112` row:
```
| 2026-07-26 | **Schedule: fix invisible cancelled flights, show cancel reason/remarks + block times on the flight card, enrich Calendar leave detail** (`p113`) | Cancelled flights whose booking only exists in the separate `cancellations[]` feed (no matching row in `flights[]`) were invisible everywhere — confirmed via a real report (Napon S., CDXV 29, 2026-07-27) and, since the upstream CMD_CTR scraper is mid-rollout of its own fix today, a stable second example (VASAPHON S., CDGL 02, 2026-05-05). New `attachCancelDetails()` in `shared.js` backfills `cancelReason`/`cancelRemarks` onto Canceled flights (fallback only, never overriding a value the pipeline already set) and synthesizes a `_noTime` virtual flight for any cancellation with no matching — or wrongly-statused (booking-id-reuse) — flight, so Board/Weekly/Calendar all pick it up via the shared `FLIGHTS` array; Gantt correctly skips it (no time to draw a bar with). Flight Drawer now shows CANCEL REASON/REMARKS, a NO TIME LOGGED badge, and BLOCK OFF/ON (previously-unused `blockOff`/`blockOn` fields). Board/Weekly/Calendar day-panel rows get a NO TIME tag; Calendar day-panel also shows the cancel reason inline. New `leaveDetailOnDate()` (sibling to `leavesOnDate`, which is unchanged) feeds the Calendar day panel's FI/SP leave rows with duration/note/role, not just the bare reason. See `docs/superpowers/specs/2026-07-26-schedule-view-improvements-design.md`. | `js/shared.js`, `js/view-board.js`, `js/view-weekly.js`, `js/view-calendar.js`, `index.html` |
```

- [ ] **Step 3: Update this project's `CLAUDE.md` Verify section**

Open `/Users/nugui/AP127_V2/CLAUDE.md` and, in the "Verify actual state" section, change:
```
1. Bump `?v=pNN` token on ALL `<script>` tags in `index.html` — next must be `p113` (all currently at p112)
```
to:
```
1. Bump `?v=pNN` token on ALL `<script>` tags in `index.html` — next must be `p114` (all currently at p113)
```
and prepend to the start of the **Last known:** sentence (before "all files `p112`"):
```
**Last known:** all files `p113` (2026-07-26 — Schedule: fixed invisible cancelled flights (cancellations-only bookings backfilled/synthesized into `FLIGHTS` via new `attachCancelDetails()`), flight Drawer now shows cancel reason/remarks/block-times, Calendar leave detail enriched with duration/note/role. See `docs/superpowers/specs/2026-07-26-schedule-view-improvements-design.md`.)
```
(i.e. insert this new sentence before the existing `p112 (2026-07-17 — ...)` sentence, keeping the rest of the history that follows unchanged.)

- [ ] **Step 4: Verify the full app still boots clean with the new token**

In the running preview, hard-reload and confirm `read_console_messages({ onlyErrors: true })` is empty, and `read_network_requests({ urlPattern: '?v=p113' })` shows all script/css requests resolving 200 (not 404).

- [ ] **Step 5: Commit and push**

```bash
cd /Users/nugui/AP127_V2
git add index.html REVAMP.md CLAUDE.md
git commit -m "p113: fix invisible cancelled flights, flight-card detail, Calendar leave enrichment"
git pull --rebase
git push
```

If `git pull --rebase` conflicts on `flight-data.js`/`progress-data.js`/`ngt-data.js` (the CI data-refresh cron may have pushed in the meantime — this is a known, harmless race, see this project's `CLAUDE.md`): run `git rebase --abort`, then `git reset --hard <your-last-commit-before-the-rebase>`, then `git pull --rebase` again (data-only commits from CI never conflict with code-only commits once your commit is rebased directly onto the new tip), then `git push`.

---

## Task 9: Update AP127_Docs (master reference)

**Files:**
- Modify: `/Users/nugui/AP127_Docs/README.md` (top "Last updated" line, §2.4, §10)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update the top "Last updated" line**

Open `/Users/nugui/AP127_Docs/README.md` line 11. Prepend a new leading sentence to the `> **Last updated:**` line (keep everything currently there as a "Previously" continuation):
```
> **Last updated:** 2026-07-26 (CMDV2 p113: fixed cancelled flights invisible in the Schedule view — bookings that exist only in the separate cancellations feed are now backfilled/synthesized into `FLIGHTS`; flight detail card gains cancel reason/remarks + block times; Calendar day-panel leave rows now show duration/note/role, not just a bare reason). Previously (same day): Watchdog: notification format redesign — ...
```
(splice in front of the existing text starting at "Watchdog: notification format redesign", keeping the rest of the line's content exactly as-is.)

- [ ] **Step 2: Add a bullet to §2.4**

Run: `grep -n "Code-asset cache token" /Users/nugui/AP127_Docs/README.md` to find the insertion point (the line just above `- Code-asset cache token: ?v=p108...`).

Using Edit, insert a new bullet immediately before that line:
```
- **Schedule: fix invisible cancelled flights + flight-card detail + Calendar leave enrichment (p113, 2026-07-26):** Cancellations whose booking exists only in the separate `cancellations[]` feed (no row in `flights[]`) were invisible in Board/Weekly/Calendar — confirmed via a real report (Napon S., CDXV 29, 2026-07-27; later self-healed upstream mid-investigation as CMD_CTR's own new Timeline "Canceled mode" scrape — see §10 — began backfilling it directly, which is why a second stable example, VASAPHON S./CDGL 02/2026-05-05, was used for the actual fix and its verification). New `attachCancelDetails()` in `shared.js` backfills `cancelReason`/`cancelRemarks` (fallback only) and synthesizes a `_noTime` virtual flight for any still-unmatched cancellation. Flight Drawer gains CANCEL REASON/REMARKS, NO TIME LOGGED, and BLOCK OFF/ON rows. Calendar day panel gains a new `leaveDetailOnDate()`-powered leave view (duration/note/role per person, not just reason).
```

- [ ] **Step 3: Add the §10 Resolved block**

Run: `grep -n "^## 10. Open items" /Users/nugui/AP127_Docs/README.md` to confirm the section start (line 1121), and read the first ~15 lines after it to find where to insert (immediately after the heading, before the existing most-recent "Resolved 2026-07-26 (CMD_CTR — ..." block, so the newest entry is on top).

Using Edit, insert immediately after the `## 10. Open items` heading and its blank line:
```
**Resolved 2026-07-26 (CMDV2 p113 — invisible cancelled flights, flight-card detail, Calendar leave enrichment):** User: "I found some missing flight not show on schedule, e.g. canceled flight... lots of new data available... improve the calendar view [leave detail]." Root cause: CMDV2's `cancellations[]` feed (separate from `flights[]`, joined by `bookingId`) has a large, persistent fraction of records with no matching flight row at all — confirmed live: 210 of 337 (62%) at initial check. Verified against a user-reported example (Napon S., AP-127, CDXV 29, 2026-07-27, 11:00–12:30) via git history of `flight-data.js` — it was a real instance (no flight row as of that morning's snapshot) but self-healed by the time of a follow-up check a few hours later, once CMD_CTR's own new Timeline "Canceled mode" scrape (see the CMD_CTR entry directly below/above — same day) started backfilling it with the correct time. Since that upstream fix was still actively stabilizing (the same booking flickered in and out of `flights[]` across successive fetches within the hour), a second, stable, unrelated-to-today's-churn example (VASAPHON S., AP-127, CDGL 02, 2026-05-05, "Late Aircraft") was used for the actual CMDV2-side fix and its verification. Fix: `attachCancelDetails()` in `js/shared.js` backfills `cancelReason`/`cancelRemarks` onto Canceled flights (never overriding a value the pipeline already attached — confirmed the pipeline does this sometimes, inconsistently) and synthesizes a `_noTime` virtual flight for any cancellation still unmatched (or matched to a flight that isn't actually Canceled — the same booking-id-reuse class of bug already known from Watchdog). Because every Schedule view reads the shared `FLIGHTS` array, this one join fixes Board, Weekly, and Calendar at once; Gantt correctly continues to skip these (no time to draw a bar with). Also: flight Drawer now surfaces previously-unused `blockOff`/`blockOn` fields, and a new `leaveDetailOnDate()` gives the Calendar day panel's leave rows full detail (duration, note, role) instead of a bare reason string. Spec: `AP127_V2/docs/superpowers/specs/2026-07-26-schedule-view-improvements-design.md`.
```

- [ ] **Step 4: Commit and push**

```bash
cd /Users/nugui/AP127_Docs
git add README.md
git commit -m "docs: log CMDV2 p113 — invisible cancelled flights, flight-card detail, Calendar leave enrichment"
git pull --rebase
git push
```

---

## Self-Review Notes

- **Spec coverage:** §1 (data join + virtual flights) → Task 1. Sort fallback → Task 2. §2 (Drawer fields) → Task 3. §3 (list-view tags/chips) → Tasks 4, 5, 6. §4 (leave enrichment) → Task 7. Rollout (cache-bust, REVAMP.md, CLAUDE.md, AP127_Docs) → Tasks 8, 9.
- **Type consistency:** `f._noTime`, `f._virtual`, `f.cancelReason`, `f.cancelRemarks` are defined once in Task 1 and used with the same names in Tasks 2–6. `leaveDetailOnDate(date)` returns the same shape (`reason`/`duration`/`note`/`role`/`start`/`end`) as consumed in Task 7's Step 5–6 rendering.
- **No placeholders:** every step above shows the literal code being inserted or replaced, not a description of it.
