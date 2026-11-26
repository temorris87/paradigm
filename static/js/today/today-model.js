// What the Today page shows (static/js/today/today-page.js), worked out from the app's ctx:
// { tree, meetings, records, tasks, sessions, statusLogs, timeSettings, importStatus }.
// now is a Date (passed in, so tests set the clock). Pure.
//
//   planningSettings(timeSettings)   the working hours and the holidays' days, for capacity.js
//   nowBlock(ctx, now)               the task block on now: { entry, session, start, end, elapsed,
//                                    left, next: false }; else today's next block (next: true);
//                                    else null
//   dayTimeline(ctx, now)            { capacity, rows: [{ key, time, kind: meeting | task | free |
//                                    suggest, title, detail, id, taskId?, sessionId?, past, done,
//                                    current, minutes? }] } by time; free: a gap of 30 min or
//                                    more in the working hours not yet over
//   upNext(ctx, now)                 [item], ranked: overdue (oldest due first), follow-ups past
//                                    due, due today, due within 5 working days, questions
//                                    waiting over 7 days (oldest first). Never done tasks,
//                                    tasks of on-hold or archived hubs, or snoozed ones.
//                                    item: { key, kind: task | followup | question, reason,
//                                    reasonKind (overdue | followup | due | asked), glyph,
//                                    title, detail, estimate, place, placed, id, taskId?,
//                                    questionId? }
//   projectRows(ctx, now)            live projects (on hold last) with their latest status:
//                                    { id, title, health, line, day, stale, age }
//   staleCount(ctx, now)             live projects whose status is stale or never logged
//   contextOf(ctx, now)              the note window's strip: { block, next } (block: the task
//                                    block on now, as nowBlock; next: { note, meeting, start }
//                                    the next meeting starting within 2 h), or null with neither
//   navCounts(ctx, now)              { overdue, freeMin }: overdue items in Up next, and the free
//                                    working time left this week from now (the navigator's pins)
import { areaOf } from "../hubs/hub-areas.js";
import { addDays, dateOf, localDay } from "../meetings/meeting-days.js";
import { allMeetings, shortTitle } from "../meetings/meetings-model.js";
import { prepFor, prepText } from "../meetings/prep-model.js";
import { isArchived } from "../notes/hub-groups.js";
import { DEFAULT_LENGTH, clock, minutes } from "../calendar/week-model.js";
import { StatusLogs, firstSentence, healthOf } from "../status/status-model.js";
import { estimateText, taskEntries } from "../tasks/tasks-model.js";
import { dayCapacity, freeGaps, isWorkingDay } from "../week/capacity.js";
import { dayText } from "../ui/dates.js";
import { openQuestions } from "./today-facts.js";

// A gap shorter than this isn't worth a line on the timeline.
const MIN_GAP = 30;
// Questions older than this many days join Up next.
const ASKED_DAYS = 7;
// "Due soon": within this many working days.
const SOON_WORKING_DAYS = 5;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function planningSettings(timeSettings) {
  return { ...(timeSettings?.settings ?? {}), holidays: (timeSettings?.upcoming ?? []).map((each) => each.day) };
}

function minuteOf(now) {
  return now.getHours() * 60 + now.getMinutes();
}

function daysBetween(a, b) {
  return Math.round((dateOf(b) - dateOf(a)) / 86400000);
}

function liveEntries(ctx) {
  return ctx.tasks ? taskEntries(ctx.tree, ctx.tasks).filter((entry) => !entry.archived) : [];
}

export function nowBlock(ctx, now) {
  const day = localDay(now);
  const at = minuteOf(now);
  const entries = new Map(liveEntries(ctx).map((entry) => [entry.task.id, entry]));
  const today = (ctx.sessions ?? []).filter((session) => session.day === day && entries.has(session.task_id))
    .map((session) => ({ session, entry: entries.get(session.task_id), start: minutes(session.start), end: minutes(session.end) }))
    .sort((a, b) => a.start - b.start);
  const current = today.find((block) => block.start <= at && at < block.end);
  if (current) return { ...current, elapsed: at - current.start, left: current.end - at, next: false };
  const next = today.find((block) => block.start > at && !block.entry.task.done);
  return next ? { ...next, elapsed: 0, left: next.end - next.start, next: true } : null;
}

export function dayTimeline(ctx, now) {
  const day = localDay(now);
  const at = minuteOf(now);
  const settings = planningSettings(ctx.timeSettings);
  const rows = [];
  if (ctx.meetings) {
    for (const { note, meeting, archived } of allMeetings(ctx.tree, ctx.meetings)) {
      if (archived || meeting.day !== day) continue;
      const start = minutes(meeting.time);
      const end = minutes(meeting.end_time) ?? (start === null ? null : start + DEFAULT_LENGTH);
      const prep = prepText(prepFor(ctx, note.id, now));
      rows.push({ key: `meeting:${note.id}`, time: meeting.time || "", sort: start ?? 24 * 60, kind: "meeting",
        title: `${meeting.cancelled ? "Cancelled: " : ""}${shortTitle(note, meeting)}`, detail: meeting.cancelled ? "" : prep,
        id: note.id, past: end !== null && end <= at, done: false, current: start !== null && start <= at && at < end,
        muted: Boolean(meeting.cancelled) });
    }
  }
  const entries = new Map(liveEntries(ctx).map((entry) => [entry.task.id, entry]));
  for (const session of ctx.sessions ?? []) {
    const entry = entries.get(session.task_id);
    if (session.day !== day || !entry) continue;
    const start = minutes(session.start);
    const end = minutes(session.end);
    rows.push({ key: `task:${session.id}`, time: session.start, sort: start, kind: "task", title: entry.task.title,
      detail: entry.hub && entry.hub.id !== entry.note.id ? entry.hub.title : "", id: entry.note.id, taskId: entry.task.id,
      sessionId: session.id, past: end <= at, done: entry.task.done, current: start <= at && at < end });
  }
  if (isWorkingDay(day, settings)) {
    for (const [start, end] of freeGaps(ctx, day, settings, at)) {
      if (end - start < MIN_GAP) continue;
      rows.push({ key: `free:${start}`, time: clock(start), sort: start, kind: "free", title: `${gapText(end - start)} free`,
        detail: "press s on an item to fill", id: null, past: false, done: false, current: false, minutes: end - start });
    }
  }
  const stale = staleCount(ctx, now);
  if (stale) {
    const end = minutes(settings.day_end || "17:00") ?? 17 * 60;
    rows.push({ key: "suggest:log", time: clock(end - 30), sort: end - 30, kind: "suggest", title: "Log status",
      detail: `${stale} project${stale === 1 ? "" : "s"} stale (suggested)`, id: null, past: false, done: false, current: false });
  }
  rows.sort((a, b) => a.sort - b.sort || kindOrder(a) - kindOrder(b));
  return { capacity: dayCapacity(ctx, day, settings), rows: rows.map(({ sort, ...row }) => row) };
}

function kindOrder(row) {
  return { meeting: 0, task: 1, free: 2, suggest: 3 }[row.kind];
}

function gapText(total) {
  if (total < 60) return `${total} min`;
  const hours = Math.round((total / 60) * 2) / 2;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

/** n working days after a day. */
function addWorkingDays(day, n, settings) {
  let date = dateOf(day);
  let left = n;
  while (left > 0) {
    date = addDays(date, 1);
    if (isWorkingDay(localDay(date), settings)) left -= 1;
  }
  return localDay(date);
}

/** Whether a task's hub is on hold or archived (it drops out of Up next). */
function resting(ctx, entry) {
  const hub = entry.hub;
  if (!hub) return false;
  if (hub.status === "on_hold" || isArchived(ctx.tree, hub.id)) return true;
  return false;
}

export function upNext(ctx, now) {
  const day = localDay(now);
  const settings = planningSettings(ctx.timeSettings);
  const soon = addWorkingDays(day, SOON_WORKING_DAYS, settings);
  const open = liveEntries(ctx).filter((entry) => !entry.task.done && !resting(ctx, entry)
    && !(entry.task.snoozed_until && entry.task.snoozed_until > day));
  const mine = open.filter((entry) => entry.task.delegate_id === null);
  const taken = new Set();
  const items = [];
  const add = (entry, reason, reasonKind, kind = "task") => {
    if (taken.has(entry.task.id)) return;
    taken.add(entry.task.id);
    items.push(taskItem(ctx, entry, reason, reasonKind, kind, now));
  };
  const byDue = (a, b) => a.task.due.localeCompare(b.task.due);
  for (const entry of mine.filter((each) => each.task.due && each.task.due < day).sort(byDue)) {
    add(entry, `Overdue ${daysBetween(entry.task.due, day)} d`, "overdue");
  }
  const follow = open.filter((entry) => entry.task.delegate_id !== null && entry.task.follow_up && entry.task.follow_up <= day)
    .sort((a, b) => a.task.follow_up.localeCompare(b.task.follow_up));
  for (const entry of follow) {
    const late = daysBetween(entry.task.follow_up, day);
    add(entry, late ? `Follow up ${late} d` : "Follow up", "followup", "followup");
  }
  for (const entry of mine.filter((each) => each.task.due === day)) add(entry, "Due today", "due");
  for (const entry of mine.filter((each) => each.task.due > day && each.task.due <= soon).sort(byDue)) {
    const ahead = daysBetween(day, entry.task.due);
    add(entry, ahead < 7 ? `Due ${WEEKDAYS[dateOf(entry.task.due).getDay()]}` : `Due ${dayText(entry.task.due, { today: day, weekday: false })}`, "due");
  }
  if (ctx.records) {
    for (const { note, record, hub, archived } of openQuestions(ctx.tree, ctx.records)) {
      const age = daysBetween(record.day, day);
      if (archived || age <= ASKED_DAYS || hub.status === "on_hold") continue;
      items.push({ key: `question:${note.id}`, kind: "question", reason: `Asked ${age} d`, reasonKind: "asked", glyph: "?",
        title: note.title, detail: hub.title, estimate: "", place: "answer", placed: false, id: note.id, questionId: note.id,
        hubId: hub.id });
    }
  }
  return items;
}

function taskItem(ctx, entry, reason, reasonKind, kind, now) {
  const { task, note, hub } = entry;
  const person = task.delegate_id === null ? null : ctx.tree.get(task.delegate_id);
  const where = [person?.title, hub?.title ?? note.title, entry.parent ? `in ${entry.parent.title}` : ""].filter(Boolean).join(" · ");
  const placement = kind === "followup" ? { place: "nudge", placed: false } : placementOf(ctx, task.id, now);
  return { key: `task:${task.id}`, kind, reason, reasonKind, glyph: kind === "followup" ? "→" : "☐", title: task.title,
    detail: where, estimate: estimateText(task.estimate_min), ...placement, id: note.id, taskId: task.id, hubId: hub?.id ?? null };
}

/** Where a task is on the calendar: "in calendar" (a block later), "15:00" (today), or the
 * hint to schedule it. */
export function placementOf(ctx, taskId, now) {
  const day = localDay(now);
  const at = clock(minuteOf(now));
  const next = (ctx.sessions ?? []).filter((session) => session.task_id === taskId && (session.day > day || (session.day === day && session.end > at)))
    .sort((a, b) => `${a.day} ${a.start}`.localeCompare(`${b.day} ${b.start}`))[0];
  if (!next) return { place: "s schedule", placed: false };
  return { place: next.day === day ? next.start : "in calendar", placed: true };
}


export function projectRows(ctx, now) {
  const logs = ctx.statusLogs ?? new StatusLogs();
  const live = ctx.tree.children(null).filter((note) => note.kind === "project" && !note.archived_at);
  const rows = live.map((project) => {
    const health = healthOf(logs, project, now);
    return { id: project.id, title: project.title, health: health.key, label: health.label,
      line: health.entry ? firstSentence(health.entry.text) : "", day: health.entry?.day ?? "", stale: health.stale || (health.never && health.key !== "on_hold"),
      never: health.never, age: health.age, area: areaOf(ctx.tree, project.id)?.title ?? "" };
  });
  const rank = (row) => (row.health === "on_hold" ? 1 : 0);
  return rows.sort((a, b) => rank(a) - rank(b) || a.area.localeCompare(b.area) || a.title.localeCompare(b.title));
}

export function staleCount(ctx, now) {
  return projectRows(ctx, now).filter((row) => row.stale).length;
}

export function navCounts(ctx, now) {
  const day = localDay(now);
  const settings = planningSettings(ctx.timeSettings);
  const overdue = upNext(ctx, now).filter((item) => item.reasonKind === "overdue").length;
  let freeMin = 0;
  // From today to Sunday: today from now on, the other working days whole.
  for (let date = new Date(now.getFullYear(), now.getMonth(), now.getDate()); ; date = addDays(date, 1)) {
    const each = localDay(date);
    if (isWorkingDay(each, settings)) {
      freeMin += freeGaps(ctx, each, settings, each === day ? minuteOf(now) : 0).reduce((sum, [s, e]) => sum + (e - s), 0);
    }
    if (date.getDay() === 0) break;
  }
  return { overdue, freeMin };
}

// The strip shows what is within this many minutes.
const CONTEXT_MINUTES = 120;

export function contextOf(ctx, now) {
  const at = minuteOf(now);
  const current = nowBlock(ctx, now);
  const block = current && !current.next ? current : null;
  const day = localDay(now);
  const next = ctx.meetings ? allMeetings(ctx.tree, ctx.meetings)
    .filter(({ meeting, archived }) => !archived && !meeting.cancelled && meeting.day === day && meeting.time
      && minutes(meeting.time) >= at && minutes(meeting.time) - at <= CONTEXT_MINUTES)
    .sort((a, b) => a.meeting.time.localeCompare(b.meeting.time))[0] ?? null : null;
  if (!block && !next) return null;
  return { block, next: next ? { note: next.note, meeting: next.meeting, start: minutes(next.meeting.time) } : null };
}
