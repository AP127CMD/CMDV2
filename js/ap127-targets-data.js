/* AP127 V2 — Batch-wide milestone target schedule (date -> lesson number the WHOLE AP127 batch is
 * expected to have reached by that date). Single source of truth for:
 *   - js/view-ap127-targets.js   the System-tab editor
 *   - js/view-cohort-v4.js       AP127 Detail V4's chart/timeline overlays
 *
 * AP127_MILESTONE_TARGETS_DEFAULT below is the CODE DEFAULT and the permanent, durable revision
 * record — this app has no writable backend (everything is a static Cloudflare Pages deploy off
 * committed data files), so "history" for this list lives in git log on this file, the same way
 * every other change in this codebase is tracked (see REVAMP.md/CLAUDE.md's update rule). The
 * System-tab editor lets you try edits live in your own browser (persisted to localStorage, with
 * its own local revision log) and then EXPORT the result to paste back in here — that commit is
 * what makes a change permanent and visible to everyone.
 */
window.AP127_MILESTONE_TARGETS_DEFAULT = [
  { date: "2026-08-09", lesson: 30 },
  { date: "2026-08-16", lesson: 34 },
  { date: "2026-08-23", lesson: 38 },
  { date: "2026-08-30", lesson: 42 },
  { date: "2026-09-06", lesson: 46 },
  { date: "2026-09-13", lesson: 50 },
  { date: "2026-09-20", lesson: 54 },
  { date: "2026-09-27", lesson: 60 },
  { date: "2026-10-04", lesson: 65 },
  { date: "2026-10-11", lesson: 70 },
  { date: "2026-10-18", lesson: 74 },
  { date: "2026-10-25", lesson: 78 },
  { date: "2026-11-01", lesson: 82 },
  { date: "2026-11-08", lesson: 86 },
  { date: "2026-11-15", lesson: 90 },
  { date: "2026-11-22", lesson: 94 },
  { date: "2026-11-29", lesson: 96 },
];

window.AP127_TARGETS_LS_KEY = "ap127MilestoneTargetsOverride";
window.AP127_TARGETS_LOG_KEY = "ap127MilestoneTargetsLog";

// Effective target list: a browser-local override (set via the System-tab editor) if present and
// valid, else the code default above. Every reader (charts + the editor itself) goes through this
// so they never disagree about which list is "current" for this browser.
function ap127GetMilestoneTargets() {
  try {
    const raw = localStorage.getItem(window.AP127_TARGETS_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) {}
  return window.AP127_MILESTONE_TARGETS_DEFAULT;
}
window.ap127GetMilestoneTargets = ap127GetMilestoneTargets;

// Target lesson number for an arbitrary calendar date, linearly interpolated between the two
// schedule entries bracketing it (matches what a steady day-by-day pace toward each checkpoint
// would look like). Before the first date: 0 (nothing due yet). After the last: that last target
// (schedule complete, nothing further expected). Dates must be "YYYY-MM-DD" strings.
function ap127TargetLessonForDate(dateStr, targets) {
  const list = (targets || ap127GetMilestoneTargets()).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!list.length) return null;
  if (dateStr <= list[0].date) return dateStr === list[0].date ? list[0].lesson : 0;
  if (dateStr >= list[list.length - 1].date) return list[list.length - 1].lesson;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (dateStr >= a.date && dateStr <= b.date) {
      const d = new Date(a.date + "T00:00:00"), e = new Date(b.date + "T00:00:00"), f = new Date(dateStr + "T00:00:00");
      const span = (e - d) / 86400000, pos = (f - d) / 86400000;
      if (span <= 0) return a.lesson;
      return a.lesson + (b.lesson - a.lesson) * (pos / span);
    }
  }
  return list[list.length - 1].lesson;
}
window.ap127TargetLessonForDate = ap127TargetLessonForDate;
