// The calendar's week, worked out from the meetings, task blocks and waiting imports. Pure.
//
//   weekOf(day)                          the Monday ("YYYY-MM-DD") of a day's week
//   weekDays(monday)                     the seven days, Monday to Sunday
//   shownDays(days, blocks, weekend, today?)  the days drawn: Monday to Friday, today, and Saturday and
//                                        Sunday only when something is on them (or weekend)
//   calendarBlocks({ tree, meetings, tasks, sessions, pending }, days)
//                                        [block]: { key, kind: "meeting" | "task" | "pending",
//                                        id, day, start, end (minutes), timed, title, sub,
//                                        muted, cancelled, done, noteId, at? }
//   layoutDay(blocks)                    the day's timed blocks with col and cols: blocks
//                                        that overlap share the width side by side
//   minutes("09:30") / clock(570)        "HH:MM" <-> minutes after midnight
//   snap(minutes, step)                  to the nearest step (15 minutes)
import { addDays, dateOf, localDay } from "../meetings/meeting-days.js";
import { hubOf, isArchived, isMeeting } from "../notes/hub-groups.js";
import { taskEntries } from "../tasks/tasks-model.js";

export const STEP = 15;
export const DAY_MINUTES = 24 * 60;
// A meeting with no end time (and a new task block) lasts this long.
export const DEFAULT_LENGTH = 30;

export function minutes(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function clock(total) {
  const value = Math.max(0, Math.min(DAY_MINUTES, Math.round(total)));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function snap(value, step = STEP) {
  return Math.round(value / step) * step;
}

export function weekOf(day) {
  const date = dateOf(day);
  return localDay(addDays(date, -((date.getDay() + 6) % 7)));
}

export function weekDays(monday) {
  const start = dateOf(monday);
  return Array.from({ length: 7 }, (_, index) => localDay(addDays(start, index)));
}

export function shownDays(days, blocks, weekend = false, today = null) {
  const busy = new Set(blocks.map((block) => block.day));
  // Today always shows: a weekend day opens on itself, not on a week with no "today".
  return days.filter((day, index) => index < 5 || weekend || busy.has(day) || day === today);
}

export function calendarBlocks({ tree, meetings, tasks, sessions = [], pending = [] }, days) {
  const inWeek = new Set(days);
  const blocks = [];
  for (const note of tree.inOrder()) {
    if (!isMeeting(tree, note.id) || isArchived(tree, note.id)) continue;
    const meeting = meetings.get(note.id);
    if (!inWeek.has(meeting.day)) continue;
    const start = minutes(meeting.time);
    const end = minutes(meeting.end_time);
    const hub = hubOf(tree, note.id);
    blocks.push({
      key: `meeting:${note.id}`, kind: "meeting", id: note.id, noteId: note.id, day: meeting.day,
      timed: start !== null, start: start ?? 0, end: start === null ? 0 : end ?? Math.min(start + DEFAULT_LENGTH, DAY_MINUTES),
      title: note.title, sub: [hub?.title, meeting.location].filter(Boolean).join(" · "),
      cancelled: Boolean(meeting.cancelled), muted: Boolean(meeting.cancelled), done: false,
    });
  }
  const entries = new Map(taskEntries(tree, tasks).map((entry) => [entry.task.id, entry]));
  for (const session of sessions) {
    const entry = entries.get(session.task_id);
    if (!entry || !inWeek.has(session.day)) continue;
    blocks.push({
      key: `task:${session.id}`, kind: "task", id: session.id, taskId: entry.task.id, noteId: entry.note.id,
      day: session.day, timed: true,
      start: minutes(session.start), end: minutes(session.end) ?? DAY_MINUTES, title: entry.task.title,
      sub: [entry.hub?.title, entry.note.id !== entry.hub?.id ? entry.note.title : "", entry.parent ? `in ${entry.parent.title}` : ""]
        .filter(Boolean).join(" · "),
      cancelled: false, muted: entry.task.done || entry.archived, done: entry.task.done,
    });
  }
  for (const event of pending) {
    if (!inWeek.has(event.day)) continue;
    const start = minutes(event.time);
    const end = minutes(event.end_time);
    blocks.push({
      key: `pending:${event.id}`, kind: "pending", id: event.id, noteId: null, day: event.day,
      timed: start !== null, start: start ?? 0, end: start === null ? 0 : end ?? Math.min(start + DEFAULT_LENGTH, DAY_MINUTES),
      title: event.title, sub: "to file", cancelled: false, muted: true, done: false,
    });
  }
  return blocks;
}

export function layoutDay(blocks) {
  const timed = blocks.filter((block) => block.timed)
    .sort((a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key));
  const placed = [];
  let cluster = [];
  let clusterEnd = -1;
  const close = () => {
    const cols = Math.max(1, ...cluster.map((block) => block.col + 1));
    for (const block of cluster) placed.push({ ...block, cols });
    cluster = [];
  };
  for (const block of timed) {
    const end = Math.max(block.end, block.start + STEP);
    if (cluster.length && block.start >= clusterEnd) close();
    const taken = new Set(cluster.filter((other) => Math.max(other.end, other.start + STEP) > block.start).map((other) => other.col));
    let col = 0;
    while (taken.has(col)) col += 1;
    cluster.push({ ...block, col });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) close();
  return placed;
}
