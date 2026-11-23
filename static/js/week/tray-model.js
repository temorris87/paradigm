// What the Week page's tray and "due" strip show, from the tasks, their blocks and the plan.
// Pure.
//
//   trayGroups(data, today, monday, filter)   [{ key, label, items: [item] }]: Overdue, Due this
//                                     week, Next actions, Follow-ups (empty groups left out).
//                                     Open tasks of mine (delegated: Follow-ups) in live hubs
//                                     that aren't on hold; filter { hubId, text } as openTasks.
//                                     item: { entry, meta: [[text, tone?]], estimate, est }
//                                     tone: "placed" | "unplaced"
//   placedMinutes(sessions, taskId, from)   minutes of its blocks from a day on
//   dueChips(data, days)              { day: [{ key, kind: "due" | "unplaced" | "milestone",
//                                     label, noteId, taskId? }] }: open tasks due that day
//                                     (placed or not) and milestones on it
//   weekSummary(data, days, settings) { focusMin, meetingMin, freeMin } over the week's
//                                     working days
import { hubScope } from "../people/people-model.js";
import { milestonesOf } from "../plan/plan-model.js";
import { estimateText, nextAction, taskEntries } from "../tasks/tasks-model.js";
import { dayText } from "../ui/dates.js";
import { minutes } from "../calendar/week-model.js";
import { dayCapacity, isWorkingDay } from "./capacity.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayOf(day) {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

export function placedMinutes(sessions, taskId, from) {
  return sessions.filter((session) => session.task_id === taskId && session.day >= from)
    .reduce((sum, session) => sum + (minutes(session.end) - minutes(session.start)), 0);
}

function firstPlaced(sessions, taskId, from) {
  return sessions.filter((session) => session.task_id === taskId && session.day >= from)
    .sort((a, b) => `${a.day} ${a.start}`.localeCompare(`${b.day} ${b.start}`))[0] ?? null;
}

export function trayGroups({ tree, tasks, sessions = [] }, today, monday, { hubId = null, text = "" } = {}) {
  const sunday = addDay(monday, 6);
  const scope = hubId === null ? null : hubScope(tree, hubId);
  const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
  const live = taskEntries(tree, tasks).filter((entry) => !entry.archived && !entry.task.done && entry.depth === 0
    && entry.hub?.status !== "on_hold" && (scope === null || (entry.hub && scope.includes(entry.hub.id)))
    && words.every((word) => `${entry.task.title} ${entry.note.title} ${entry.hub?.title ?? ""}`.toLowerCase().includes(word)));
  const mine = live.filter((entry) => entry.task.delegate_id === null);
  const taken = new Set();
  const group = (key, label, entries, metaOf) => {
    const items = entries.filter((entry) => !taken.has(entry.task.id)).map((entry) => {
      taken.add(entry.task.id);
      return { entry, meta: metaOf(entry), estimate: estimateText(entry.task.estimate_min), est: Boolean(entry.task.estimate_min) };
    });
    return { key, label, items };
  };
  const place = (entry) => {
    const placed = placedMinutes(sessions, entry.task.id, today);
    if (!placed) return ["not placed", "unplaced"];
    const first = firstPlaced(sessions, entry.task.id, today);
    return [entry.task.estimate_min ? `${estimateText(placed)} placed` : `placed ${weekdayOf(first.day)}`, "placed"];
  };
  const hubText = (entry) => entry.hub?.title ?? entry.note.title;
  const byDue = (a, b) => a.task.due.localeCompare(b.task.due);
  const groups = [
    group("overdue", "Overdue", mine.filter((entry) => entry.task.due && entry.task.due < today).sort(byDue),
      (entry) => [[hubText(entry)], [`was due ${dayText(entry.task.due, { today, weekday: true })}`], place(entry)]),
    group("week", "Due this week", mine.filter((entry) => entry.task.due >= today && entry.task.due <= sunday).sort(byDue),
      (entry) => [[hubText(entry)], [`due ${entry.task.due === today ? "today" : weekdayOf(entry.task.due)}`], place(entry)]),
  ];
  const projects = tree.children(null).filter((note) => note.kind === "project" && !note.archived_at && note.status !== "on_hold"
    && (scope === null || scope.includes(note.id)));
  const nexts = projects.map((project) => nextAction(tree, tasks, project)).filter((entry) => entry && entry.task.delegate_id === null
    && live.some((each) => each.task.id === entry.task.id));
  groups.push(group("next", "Next actions", nexts, (entry) => [[hubText(entry)], ...(placedMinutes(sessions, entry.task.id, today) ? [place(entry)] : [])]));
  const follow = live.filter((entry) => entry.task.delegate_id !== null && entry.task.follow_up && entry.task.follow_up <= sunday)
    .sort((a, b) => a.task.follow_up.localeCompare(b.task.follow_up));
  groups.push(group("follow", "Follow-ups", follow, (entry) => [[`→ ${tree.get(entry.task.delegate_id)?.title ?? "someone"}`],
    [`follow up ${dayText(entry.task.follow_up, { today, relative: true })}`, entry.task.follow_up < today ? "unplaced" : undefined]]));
  return groups.filter((each) => each.items.length);
}

export function dueChips({ tree, tasks, sessions = [], plan = null }, days) {
  const chips = Object.fromEntries(days.map((day) => [day, []]));
  for (const entry of taskEntries(tree, tasks)) {
    const { task } = entry;
    if (entry.archived || task.done || task.delegate_id !== null || !chips[task.due]) continue;
    const placed = sessions.some((session) => session.task_id === task.id && session.day <= task.due);
    chips[task.due].push({ key: `due:${task.id}`, kind: placed ? "due" : "unplaced", noteId: entry.note.id, taskId: task.id,
      label: placed ? `◆ Due · ${task.title}` : `Due · ${task.title} — not placed` });
  }
  if (plan) {
    for (const project of tree.children(null).filter((note) => note.kind === "project" && !note.archived_at)) {
      for (const { note, milestone } of milestonesOf(tree, plan, project.id)) {
        if (!milestone.done_day && chips[milestone.day]) {
          chips[milestone.day].push({ key: `milestone:${note.id}`, kind: "milestone", noteId: note.id, label: `◆ ${note.title}` });
        }
      }
    }
  }
  return chips;
}

export function weekSummary(data, days, settings) {
  const total = { focusMin: 0, meetingMin: 0, freeMin: 0 };
  for (const day of days.filter((each) => isWorkingDay(each, settings))) {
    const capacity = dayCapacity(data, day, settings);
    total.focusMin += capacity.focusMin;
    total.meetingMin += capacity.meetingMin;
    total.freeMin += capacity.freeMin;
  }
  return total;
}

function addDay(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
