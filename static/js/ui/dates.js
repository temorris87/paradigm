// THE way days and times read on screen (pure). Days are "YYYY-MM-DD" strings in local time;
// `today` is a Date or a day string, passed in for tests (else the clock is read).
//
//   dayText(day, { today?, weekday?, month?, relative?, short? })   "Wed 25 Nov", "Wed 25 Nov 2027" (not
//                                     this year), "25 Nov" (weekday false), "Wed 25" (month false:
//                                     a row under its week's heading), "today" / "tomorrow" /
//                                     "yesterday" (relative true), "Wed" (short true: the weekday
//                                     alone, for days near enough not to need the date)
//   timeSpan(time, end?)              "14:00", "14:00–15:00"
//   whenText({ day, time?, end_time? }, today?)   "Wed 25 Nov 14:00–15:00"
//   weekRange(monday, today?, { year? })   "16–22 Nov 2026", "30 Nov – 6 Dec 2026"; year false:
//                                     "16–22 Nov", the year only when it isn't this year's
//   daysAgo(day, today?)              "today", "1 d ago", "12 d ago"
// Ex commands and the API still use "YYYY-MM-DD"; only what is read on screen goes through here.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RELATIVE = { "-1": "yesterday", 0: "today", 1: "tomorrow" };

function parts(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ""));
  return match ? match.slice(1).map(Number) : null;
}

function todayString(today) {
  if (typeof today === "string") return today;
  const date = today instanceof Date ? today : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function serial([year, month, date]) {
  return Date.UTC(year, month - 1, date) / 86400000;
}

export function dayText(day, { today = null, weekday = true, month = true, relative = false, short = false } = {}) {
  const p = parts(day);
  if (!p) return String(day ?? "");
  const now = parts(todayString(today));
  if (relative) {
    const word = RELATIVE[serial(p) - serial(now)];
    if (word) return word;
  }
  const [year, monthOf, date] = p;
  if (short) return WEEKDAYS[new Date(Date.UTC(year, monthOf - 1, date)).getUTCDay()];
  const name = weekday ? `${WEEKDAYS[new Date(Date.UTC(year, monthOf - 1, date)).getUTCDay()]} ` : "";
  if (!month) return `${name}${date}`;
  return `${name}${date} ${MONTHS[monthOf - 1]}${year === now[0] ? "" : ` ${year}`}`;
}

export function timeSpan(time, end = "") {
  return time && end ? `${time}–${end}` : time || "";
}

export function whenText({ day, time = "", end_time: end = "" }, today = null) {
  return [dayText(day, { today }), timeSpan(time, end)].filter(Boolean).join(" ");
}

export function weekRange(monday, today = null, { year = true } = {}) {
  const first = parts(monday);
  if (!first) return "";
  const last = new Date(Date.UTC(first[0], first[1] - 1, first[2] + 6));
  const [ly, lm, ld] = [last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate()];
  const start = first[1] === lm ? `${first[2]}` : `${first[2]} ${MONTHS[first[1] - 1]}${first[0] === ly ? "" : ` ${first[0]}`}`;
  const sep = first[1] === lm ? "–" : " – ";
  const shown = year || ly !== parts(todayString(today))[0];
  return `${start}${sep}${ld} ${MONTHS[lm - 1]}${shown ? ` ${ly}` : ""}`;
}

export function daysAgo(day, today = null) {
  const p = parts(day);
  if (!p) return "";
  const days = serial(parts(todayString(today))) - serial(p);
  return days <= 0 ? "today" : `${days} d ago`;
}
