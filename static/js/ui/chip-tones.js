// Which tone a status chip (ui/chip.js) takes for a state or a kind: one table, so the same
// state reads the same on every page. Pure.
//
//   toneOf(name)   "overdue", "on_track", "Follow-up", "question"... -> "danger" | "warning" |
//                  "caution" | "success" | "info" | "neutral" | "task" | "decision" |
//                  "question" | "meeting"; anything unknown is "neutral"
//   CHIP_TONES     every tone, in the order chip.css lists them
//
// A follow-up stays info even once its day has passed (its text says how late it is): only a
// missed due date is danger.
export const CHIP_TONES = ["danger", "warning", "caution", "success", "info", "neutral", "task", "decision", "question", "meeting"];

const TONE_OF = new Map([
  ["overdue", "danger"],
  ["late", "danger"],
  ["blocked", "danger"],
  ["due today", "caution"],
  ["due soon", "caution"],
  ["due", "caution"],
  ["follow up", "info"],
  ["followup", "info"],
  ["waiting on", "info"],
  ["at risk", "warning"],
  ["on track", "success"],
  ["on hold", "neutral"],
  ["day", "neutral"],
  ["none", "neutral"],
  ["task", "task"],
  ["decision", "decision"],
  ["question", "question"],
  // Today's "Asked 3 d": a question waiting on me.
  ["asked", "question"],
  ["meeting", "meeting"],
]);

/** "On_track", "follow-up", "Due  today" all read as one name. */
function normalise(name) {
  return String(name ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

export function toneOf(name) {
  return TONE_OF.get(normalise(name)) ?? "neutral";
}
