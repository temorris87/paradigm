// The Week Plan's calendar import, as state and text (pure): whether the Import panel greys the
// grid, the "Last imported" line, the bar's quiet note, and what an upload says.
//
//   showsPanel({ days, today, status, planWithout })   days: the week shown ("YYYY-MM-DD");
//     today: "YYYY-MM-DD"; status: /api/calendar/status (null before it loads); planWithout:
//     the day Plan without it was chosen (localStorage PLAN_WITHOUT_STORE) or null
//   quietNote({ status, today, planWithout })  "Not imported today · i" once planned without, or ""
//   lastImportedText(status, today)   "Last imported: Wed 25 Nov 08:12 · the tray still works"
//   meetingCount(counts)              the meetings an upload brought in or changed
//   uploadText(results)               the status line after an upload: results [{ name, counts } |
//                                     { name, error }]
//   hasError(text)                    whether a status line holds an E: part (alone or after an
//                                     import that went in), so it shows as an error
import { dayText } from "../ui/dates.js";

export const PLAN_WITHOUT_STORE = "paradigm.planWithout";

const TRAY_STILL_WORKS = "the tray still works";

// Only meetings: people and files are counted apart, and skipped events never became one.
const MEETING_COUNTS = ["new", "to_file", "updated", "moved", "cancelled", "back_on"];

export function showsPanel({ days, today, status, planWithout = null }) {
  if (!status || status.imported_today) return false;
  if (planWithout === today) return false;
  // Only the week holding today greys: past and future weeks are planned as they are.
  return days.includes(today);
}

export function quietNote({ status, today, planWithout = null }) {
  return status && !status.imported_today && planWithout === today ? "Not imported today · i" : "";
}

export function lastImportedText(status, today) {
  if (!status?.last_day) return `Never imported yet · ${TRAY_STILL_WORKS}`;
  const time = /T(\d{2}:\d{2})/.exec(status.last_at ?? "")?.[1] ?? "";
  const day = (status.last_at ?? "").slice(0, 10) || status.last_day;
  return `Last imported: ${[dayText(day, { today }), time].filter(Boolean).join(" ")} · ${TRAY_STILL_WORKS}`;
}

export function meetingCount(counts) {
  return MEETING_COUNTS.reduce((sum, key) => sum + (Number(counts?.[key]) || 0), 0);
}

/** "Imported 4 meetings from week.ics", then any file that failed, as an E: line. */
export function uploadText(results) {
  const done = results.filter((each) => !each.error);
  const failed = results.filter((each) => each.error);
  const parts = [];
  if (done.length) {
    const count = done.reduce((sum, each) => sum + meetingCount(each.counts), 0);
    const from = done.length === 1 ? done[0].name : `${done.length} files`;
    parts.push(`Imported ${count} meeting${count === 1 ? "" : "s"} from ${from}`);
  }
  if (failed.length) parts.push(`E: ${failed.map(errorText).join("; ")}`);
  return parts.join(". ");
}

function errorText({ name, error }) {
  const message = String(error?.message ?? error ?? "");
  return /not a calendar/i.test(message) ? `not a calendar file: ${name}` : `${name}: ${message}`;
}

export function hasError(text) {
  return /(^|\. )E: /.test(text ?? "");
}
