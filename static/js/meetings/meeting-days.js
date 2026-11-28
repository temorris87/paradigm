// Days for meetings, as "YYYY-MM-DD" strings in the browser's local time. "today" is always
// passed in (a Date), so this stays pure and testable.
//
//   localDay(date)               "2026-11-21"
//   parseDay(word, today)        "2026-11-24", "today", "tomorrow", "yesterday" -> a day;
//                                anything else -> null; a date that isn't real -> throws
//   parseTime(word)              "9:30" / "09:30" -> "09:30"; anything else -> null
//   whenText(meeting, today?)    "Tue 24 Nov 14:00" ("14:00–15:00" with an end_time), from ui/dates.js
//   PERIODS, periodRange(key, today)   the Meetings page's Period filter
//   meetingEnded(meeting, now)   whether a meeting is over (its end, else its start + 30 min,
//                                else its whole day); now: a Date, or a day string
//   splitMeetings(entries, now)  { coming: soonest first, ended: latest first } of meeting
//                                entries (meetings-model.js), none archived or cancelled
import { whenText } from "../ui/dates.js";

const RELATIVE = { yesterday: -1, today: 0, tomorrow: 1 };
// A meeting without an end time lasts this long (as on the Week's grid).
const MEETING_MINUTES = 30;

export function localDay(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local Date at midnight of a "YYYY-MM-DD" day, or null when it isn't a real day. */
export function dateOf(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ""));
  if (!match) return null;
  const [year, month, date] = match.slice(1).map(Number);
  const when = new Date(year, month - 1, date);
  return when.getFullYear() === year && when.getMonth() === month - 1 && when.getDate() === date ? when : null;
}

export function parseDay(word, today) {
  const text = String(word ?? "").toLowerCase();
  if (text in RELATIVE) return localDay(addDays(today, RELATIVE[text]));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  if (!dateOf(text)) throw new Error(`E: "${word}" is not a date like 2026-11-24`);
  return text;
}

export function parseTime(word) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(word ?? ""));
  if (!match) return null;
  const [hours, minutes] = match.slice(1).map(Number);
  if (hours > 23 || minutes > 59) throw new Error(`E: "${word}" is not a time of day`);
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

// On screen, a meeting's when is ui/dates.js's: "Tue 24 Nov 14:00–15:00".
export { whenText };

// THE Period filter's choices, in the dropdown's order (any time is the "" entry before them).
export const PERIODS = [
  { key: "upcoming", label: "upcoming" },
  { key: "today", label: "today" },
  { key: "thisWeek", label: "this week" },
  { key: "lastWeek", label: "last week" },
  { key: "thisMonth", label: "this month" },
  { key: "lastMonth", label: "last month" },
  { key: "thisYear", label: "this year" },
];

/** { from, to } days (inclusive; null is open) for a period key; null for any time. Weeks
 * start on Monday. */
export function periodRange(key, today) {
  const day = (date) => localDay(date);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (key) {
    case "upcoming": return { from: day(today), to: null };
    case "today": return { from: day(today), to: day(today) };
    case "thisWeek": return { from: day(monday), to: day(addDays(monday, 6)) };
    case "lastWeek": return { from: day(addDays(monday, -7)), to: day(addDays(monday, -1)) };
    case "thisMonth": return { from: day(new Date(year, month, 1)), to: day(new Date(year, month + 1, 0)) };
    case "lastMonth": return { from: day(new Date(year, month - 1, 1)), to: day(new Date(year, month, 0)) };
    case "thisYear": return { from: `${year}-01-01`, to: `${year}-12-31` };
    default: return null;
  }
}

export function inRange(day, range) {
  return !range || ((range.from === null || day >= range.from) && (range.to === null || day <= range.to));
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function meetingEnded(meeting, now = new Date()) {
  if (!meeting.day) return false;
  const today = typeof now === "string" ? now : localDay(now);
  if (meeting.day !== today) return meeting.day < today;
  if (typeof now === "string") return false;
  const start = minutesOf(meeting.time);
  if (start === null) return false;
  const end = minutesOf(meeting.end_time) ?? start + MEETING_MINUTES;
  return now.getHours() * 60 + now.getMinutes() >= end;
}

export function splitMeetings(entries, now = new Date()) {
  const when = (entry) => `${entry.meeting.day} ${entry.meeting.time}`;
  const live = entries.filter((entry) => !entry.archived && !entry.meeting.cancelled && entry.meeting.day);
  return {
    coming: live.filter((entry) => !meetingEnded(entry.meeting, now)).sort((a, b) => when(a).localeCompare(when(b))),
    ended: live.filter((entry) => meetingEnded(entry.meeting, now)).sort((a, b) => when(b).localeCompare(when(a))),
  };
}

function minutesOf(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
