// What the Followed up… dialog (follow-up-dialog.js) and Today's follow-up rows work out. A
// follow-up is a delegated, open task with a follow-up day; logging one either closes the
// task or moves its day on (POST /api/task/followed_up). Days are "YYYY-MM-DD"; today is a
// Date or a day string, passed in. Pure.
//
//   ordinal(n)                       1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd"
//   followUpLine(task, hub, count)   "Send the numbers · Event bus · 3rd follow-up" (count: the
//                                    logs so far; this one is the next)
//   defaultNextDay(today, settings)  two working days after today (capacity.js's working days)
//   parseNextDay(word, today)        the day a date box means: "2026-12-01", "tomorrow", "mon"
//                                    (the next Monday after today), "+3" (three days on); throws
//                                    when it is empty, not a day, or not after today
//   QUICK_PICKS                      [{ word, label }]: +1 tomorrow · +3 · Mon
//   carriedReason(followUp, today)   { reason, reasonKind }: "Today" (followup: info) or "from
//                                    Wed" / "from 20 Nov" past a week (carried: warning)
//   loggedText(outcome, next, title, today)   the status line: "Logged: follow up again Tue
//                                    1 Dec" / "Logged and closed: {title}"
import { addDays, dateOf, localDay } from "../meetings/meeting-days.js";
import { parseDue } from "../notes/capture.js";
import { dayText } from "../ui/dates.js";
import { addWorkingDays } from "../week/capacity.js";

// Tyson, 2026-11-27: the next follow-up starts two working days on.
const DEFAULT_WORKING_DAYS = 2;
// Past this many days, a carried follow-up names its date, not its weekday.
const WEEKDAY_DAYS = 7;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const QUICK_PICKS = [
  { word: "+1", label: "+1 tomorrow" },
  { word: "+3", label: "+3" },
  { word: "mon", label: "Mon" },
];

function dayOf(today) {
  return typeof today === "string" ? today : localDay(today);
}

export function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

export function followUpLine(task, hub, count) {
  return [task.title, hub?.title, `${ordinal((count ?? 0) + 1)} follow-up`].filter(Boolean).join(" · ");
}

export function defaultNextDay(today, settings = {}) {
  return addWorkingDays(dayOf(today), DEFAULT_WORKING_DAYS, settings);
}

export function parseNextDay(word, today) {
  const day = dayOf(today);
  const text = String(word ?? "").trim().toLowerCase();
  if (!text) throw new Error("Pick the day to follow up again");
  const next = readDay(text, day);
  if (!next) throw new Error(`"${String(word).trim()}" is not a day: try 2026-12-01, tomorrow, mon or +3`);
  if (next <= day) throw new Error("Follow up again after today");
  return next;
}

function readDay(text, day) {
  const offset = /^\+(\d{1,3})$/.exec(text);
  if (offset) return localDay(addDays(dateOf(day), Number(offset[1])));
  // A weekday is the next one after today: on a Monday, "mon" is next week's.
  const weekday = WEEKDAYS.findIndex((name) => text.startsWith(name) && text.length >= 3);
  if (weekday >= 0 && /^[a-z]+$/.test(text)) {
    const from = dateOf(day);
    return localDay(addDays(from, ((weekday - from.getDay() + 6) % 7) + 1));
  }
  const parsed = parseDue(text, day);
  return parsed && dateOf(parsed) ? parsed : null;
}

export function carriedReason(followUp, today) {
  const day = dayOf(today);
  if (followUp >= day) return { reason: "Today", reasonKind: "followup" };
  const days = Math.round((dateOf(day) - dateOf(followUp)) / 86400000);
  const when = days < WEEKDAY_DAYS ? dayText(followUp, { today: day, short: true }) : dayText(followUp, { today: day, weekday: false });
  return { reason: `from ${when}`, reasonKind: "carried" };
}

export function loggedText(outcome, next, title, today) {
  if (outcome === "closed") return `Logged and closed: ${title}`;
  return `Logged: follow up again ${dayText(next, { today: dayOf(today) })}`;
}
