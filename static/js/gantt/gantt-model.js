// What a Gantt chart shows, worked out without the DOM. Pure.
//
// A chart is rows over an axis of day numbers. In "dates" mode a day number is a calendar day
// (plan-model.js dayNumber) and the axis runs Monday to Sunday weeks around the rows and
// today; in "offsets" mode (a plan template) it is a working day counted from 0.
//
//   row: { key, label, start, end, kind: "phase" | "project" | "milestone", id, muted?, late?,
//          baseline?: { start, end }, badge?, marks: [{ key, id, label, at, done, late? }] }
//   const axis = chartAxis(rows, { mode, today, minDays })
//                                  { first, last, days, ticks: [{ at, label, major }], today }
//   barBox(axis, row, dayPx)       { left, width } in pixels (a whole day each end)
//   markLeft(axis, at, dayPx)      the centre of a milestone's diamond
//   dayAt(axis, x, dayPx)          the day under an x offset in the track
//   dragged(row, part, delta)      { start, end } after dragging by delta days: part "body"
//                                  moves both, "start" / "end" moves one (never past the other)
//   fitDayPx(axis, width)          pixels per day so the axis fills width (between 4 and 48)
import { dayNumber, dayString } from "../plan/plan-model.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MIN_DAY_PX = 4;
export const MAX_DAY_PX = 48;
const OFFSET_TICK = 5;

export function chartAxis(rows, { mode = "dates", today = null, minDays = 28 } = {}) {
  const points = rows.flatMap((row) => [row.start, row.end, ...(row.baseline ? [row.baseline.start, row.baseline.end] : []),
    ...row.marks.map((mark) => mark.at)]).filter((value) => Number.isFinite(value));
  if (mode === "offsets") {
    const last = Math.max(minDays - 1, ...points.map((point) => point + 2));
    const ticks = [];
    for (let at = 0; at <= last; at += 1) {
      if (at % OFFSET_TICK === 0) ticks.push({ at, label: `Day ${at}`, major: at % (OFFSET_TICK * 4) === 0 });
    }
    return { mode, first: 0, last, days: last + 1, ticks, today: null };
  }
  const todayNumber = today === null ? null : dayNumber(today);
  const all = todayNumber === null ? points : [...points, todayNumber];
  const low = all.length ? Math.min(...all) : todayNumber ?? 0;
  const high = all.length ? Math.max(...all) : low;
  // Whole weeks, Monday to Sunday, with a week of room after the last day.
  const first = low - weekday(low);
  let last = high + (6 - weekday(high)) + 7;
  if (last - first + 1 < minDays) last = first + minDays - 1;
  const ticks = [];
  for (let at = first; at <= last; at += 7) {
    const date = new Date(at * 86400000);
    const monthStart = date.getUTCDate() <= 7;
    ticks.push({ at, label: `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`, major: monthStart });
  }
  return { mode, first, last, days: last - first + 1, ticks, today: todayNumber };
}

/** 0 for Monday ... 6 for Sunday. */
function weekday(number) {
  return (new Date(number * 86400000).getUTCDay() + 6) % 7;
}

export function barBox(axis, row, dayPx) {
  const start = Math.min(row.start, row.end);
  const end = Math.max(row.start, row.end);
  return { left: (start - axis.first) * dayPx, width: Math.max((end - start + 1) * dayPx, 2) };
}

export function markLeft(axis, at, dayPx) {
  return (at - axis.first + 0.5) * dayPx;
}

export function dayAt(axis, x, dayPx) {
  return axis.first + Math.floor(x / dayPx);
}

export function dragged(row, part, delta) {
  if (part === "start") return { start: Math.min(row.start + delta, row.end), end: row.end };
  if (part === "end") return { start: row.start, end: Math.max(row.end + delta, row.start) };
  return { start: row.start + delta, end: row.end + delta };
}

export function fitDayPx(axis, width) {
  return Math.max(MIN_DAY_PX, Math.min(MAX_DAY_PX, Math.floor(width / Math.max(axis.days, 1))));
}

/** A day number as 'YYYY-MM-DD' (dates mode) or as itself (offsets mode). */
export function valueOf(axis, number) {
  return axis.mode === "offsets" ? number : dayString(number);
}
