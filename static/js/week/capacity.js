// A day's capacity: the working hours (the timesheet's settings, lunch left out), what
// meetings and task blocks fill of them, and what is free. Minutes after midnight
// throughout. Pure.
//
//   workingSpans(settings)                 [[start, end]]: the working day, lunch cut out
//                                          (08:00–17:00, lunch 12:00–13:00 by default)
//   busyOn(ctx, day)                       { meetings: [[s, e]], focus: [[s, e]] }: the day's
//                                          timed meetings (not cancelled; no end: 30 min) and
//                                          task blocks
//   dayCapacity(ctx, day, settings)        { workMin, meetingMin, focusMin, freeMin }: inside
//                                          the working hours; overlaps counted once (a
//                                          meeting wins over a block under it)
//   freeGaps(ctx, day, settings, from?)    [[s, e]]: free stretches of the working hours, from
//                                          a minute on (today: now)
//   firstFreeSlot(ctx, { length, from: { day, minute }, until?, settings, days? })
//                                          { day, start, end } of the first free stretch that
//                                          long on a working day (not a weekend, not one of
//                                          the timesheet's holidays), on or before until; null
//   isWorkingDay(day, settings)
//   hoursText(minutes)                     "3.5 h", "45 min"
import { addDays, dateOf, localDay } from "../meetings/meeting-days.js";
import { allMeetings } from "../meetings/meetings-model.js";
import { DEFAULT_LENGTH, STEP, minutes } from "../calendar/week-model.js";

const DEFAULTS = { day_start: "08:00", day_end: "17:00", lunch_start: "12:00", lunch_end: "13:00" };
// How far ahead a slot is looked for when the task has no due day.
const LOOK_AHEAD_DAYS = 14;

export function workingSpans(settings = {}) {
  const value = (key) => minutes(settings[key] || DEFAULTS[key]);
  const start = value("day_start");
  const end = value("day_end");
  const lunchStart = settings.lunch_start === "" ? null : value("lunch_start");
  const lunchEnd = settings.lunch_end === "" ? null : value("lunch_end");
  if (start === null || end === null || end <= start) return [[minutes(DEFAULTS.day_start), minutes(DEFAULTS.day_end)]];
  if (lunchStart === null || lunchEnd === null || !(start <= lunchStart && lunchStart < lunchEnd && lunchEnd <= end)) return [[start, end]];
  return [[start, lunchStart], [lunchEnd, end]].filter(([s, e]) => s < e);
}

export function busyOn({ tree, meetings, tasks, sessions = [] }, day) {
  const meetingSpans = meetings ? allMeetings(tree, meetings)
    .filter(({ meeting, archived }) => !archived && !meeting.cancelled && meeting.day === day && meeting.time)
    .map(({ meeting }) => {
      const start = minutes(meeting.time);
      return [start, minutes(meeting.end_time) ?? start + DEFAULT_LENGTH];
    }) : [];
  const live = tasks ? new Set(tasks.all().map((task) => task.id)) : null;
  const focus = sessions.filter((session) => session.day === day && (!live || live.has(session.task_id)))
    .map((session) => [minutes(session.start), minutes(session.end)]);
  return { meetings: meetingSpans, focus };
}

/** Merged, sorted spans. */
function merge(spans) {
  const sorted = spans.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function clip(spans, inside) {
  return merge(spans).flatMap(([s, e]) => inside.map(([a, b]) => [Math.max(s, a), Math.min(e, b)]).filter(([x, y]) => x < y));
}

function total(spans) {
  return spans.reduce((sum, [s, e]) => sum + (e - s), 0);
}

/** spans minus cuts. */
function subtract(spans, cuts) {
  let out = spans.map((span) => [...span]);
  for (const [cs, ce] of merge(cuts)) {
    out = out.flatMap(([s, e]) => (ce <= s || cs >= e ? [[s, e]] : [[s, cs], [ce, e]].filter(([x, y]) => x < y)));
  }
  return out;
}

export function dayCapacity(ctx, day, settings) {
  const work = workingSpans(settings);
  const busy = busyOn(ctx, day);
  const meetingSpans = clip(busy.meetings, work);
  const focusSpans = subtract(clip(busy.focus, work), meetingSpans);
  const workMin = total(work);
  const meetingMin = total(meetingSpans);
  const focusMin = total(focusSpans);
  return { workMin, meetingMin, focusMin, freeMin: Math.max(0, workMin - meetingMin - focusMin) };
}

export function freeGaps(ctx, day, settings, from = 0) {
  const busy = busyOn(ctx, day);
  const open = subtract(workingSpans(settings), [...busy.meetings, ...busy.focus]);
  return open.map(([s, e]) => [Math.max(s, from), e]).filter(([s, e]) => s < e);
}

export function isWorkingDay(day, settings = {}) {
  const weekday = dateOf(day).getDay();
  if (weekday === 0 || weekday === 6) return false;
  return !(settings.holidays ?? []).includes(day);
}

export function firstFreeSlot(ctx, { length = DEFAULT_LENGTH, from, until = "", settings = {} }) {
  const last = until || localDay(addDays(dateOf(from.day), LOOK_AHEAD_DAYS));
  for (let date = dateOf(from.day), day = from.day; day <= last; date = addDays(date, 1), day = localDay(date)) {
    if (!isWorkingDay(day, settings)) continue;
    // Today starts at the next quarter hour, not in the past.
    const start = day === from.day ? Math.ceil(from.minute / STEP) * STEP : 0;
    const gap = freeGaps(ctx, day, settings, start).find(([s, e]) => e - s >= length);
    if (gap) return { day, start: gap[0], end: gap[0] + length };
  }
  return null;
}

export function hoursText(total) {
  if (total < 60) return `${Math.round(total)} min`;
  const hours = Math.round((total / 60) * 2) / 2;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}
