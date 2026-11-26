// Tasks read together with the notes tree. A task is a record of its own (/api/tasks): it
// belongs to one note (a project, an area, a phase, a meeting, any note in a hub), and a
// subtask belongs to a task on the same note, and may have subtasks of its own (a task and
// at most 4 levels under it: MAX_TASK_DEPTH, the server's rule). A task may be delegated to a
// person (delegate_id), with a day to follow it up. Its blocks of time come from
// /api/sessions. Pure.
//
//   const tasks = new Tasks(await tasksApi.list());
//   tasks.get(id) / tasks.all() / tasks.subtasksOf(id)   (direct subtasks, in their order)
//   tasks.descendantsOf(id)               every task under it, every level, in tree order
//   tasks.ancestorsOf(id)                 the tasks above it, the top-level task first
//   taskEntries(tree, tasks)              [entry] of every task, subtasks too, each after its
//                                         parent: entry { task, note, hub, depth, archived,
//                                         parent (the task right above, or null), ancestors }
//   taskTree(tasks, id)                   the task page's subtask rows: [{ task, depth, parent }]
//                                         of everything under it, in tree order; depth 1 for
//                                         its direct subtasks
//   moveTarget(tasks, id, direction)      J/K: { beforeId } that moves a task one place down
//                                         (1) or up (-1) among its siblings (beforeId null:
//                                         last); null when it is at that end already
//   tasksOn(tree, tasks, owner)           a page's Tasks: the tasks (no subtasks) on the owner
//                                         and the notes inside it; an area's are its own only
//                                         (a project's tasks roll up to the project, never
//                                         further). [entry + { subtasks, openSubtasks }]:
//                                         subtasks every task under it, at every level; open
//                                         ones first, in their order, then done ones
//   openCount(tree, tasks, owner)         how many tasksOn are open
//   waitingOn(tree, tasks, personId?)     open delegated tasks (to one person, or anyone),
//                                         soonest follow-up first
//   openTasks(tree, tasks, { hubId, text })   the calendar's list: open tasks of mine in live
//                                         hubs (hubId: only that hub, an area with its projects),
//                                         each followed by its open subtasks; text: words in the
//                                         title, note or hub
//   todayTasks(tree, tasks, sessions, day)    [{ entry, session }] of the blocks that day
//   hubChoices(tree, tasks, { until })    the hubs with an open top-level task in the tray:
//                                         mine, or delegated with a follow-up on or before
//                                         until (any follow-up without until); an area once
//                                         one of its projects is; never on-hold or archived
//                                         hubs. The calendar's filter, by title
//   subtaskText(entry)                    "2/5 subtasks" (done of all, every level), "" for none
//   parseEstimate(text)                   minutes from "1.5 h", "90 min", "45m", "2h30", "1:30";
//                                         null for ""; throws on anything else
//   estimateText(minutes)                 "1.5 h", "45 min", "" for none
import { hubOf, isArchived } from "../notes/hub-groups.js";
import { hubScope } from "../people/people-model.js";

/** A task and at most 4 levels of subtasks under it (the server refuses deeper). */
export const MAX_TASK_DEPTH = 5;

export class Tasks {
  constructor(list = []) {
    this.byId = new Map(list.map((task) => [task.id, task]));
    this.children = new Map();
    for (const task of this.byId.values()) {
      if (task.parent_id === null || !this.byId.has(task.parent_id)) continue;
      if (!this.children.has(task.parent_id)) this.children.set(task.parent_id, []);
      this.children.get(task.parent_id).push(task);
    }
    for (const list of this.children.values()) list.sort(byPosition);
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  all() {
    return [...this.byId.values()];
  }

  subtasksOf(id) {
    return this.children.get(id) ?? [];
  }

  isTop(task) {
    return task.parent_id === null || !this.byId.has(task.parent_id);
  }

  descendantsOf(id) {
    return taskTree(this, id).map((row) => row.task);
  }

  ancestorsOf(id) {
    const found = [];
    // The seen set guards against a loop in bad data; the server never makes one.
    for (let at = this.get(this.get(id)?.parent_id); at && !found.includes(at); at = this.get(at.parent_id)) found.push(at);
    return found.reverse();
  }
}

export function taskTree(tasks, id, depth = 1, seen = new Set([id])) {
  return tasks.subtasksOf(id).filter((sub) => !seen.has(sub.id)).flatMap((sub) => {
    seen.add(sub.id);
    return [{ task: sub, depth, parent: tasks.get(id) }, ...taskTree(tasks, sub.id, depth + 1, seen)];
  });
}

export function moveTarget(tasks, id, direction) {
  const task = tasks.get(id);
  if (!task || tasks.isTop(task)) return null;
  const siblings = tasks.subtasksOf(task.parent_id);
  const index = siblings.findIndex((each) => each.id === id);
  if (direction > 0) return index < siblings.length - 1 ? { beforeId: siblings[index + 2]?.id ?? null } : null;
  return index > 0 ? { beforeId: siblings[index - 1].id } : null;
}

function byPosition(a, b) {
  return a.position - b.position || a.id - b.id;
}

function entryOf(tree, task, depth, parent = null, ancestors = []) {
  return { task, note: tree.get(task.note_id), hub: hubOf(tree, task.note_id), depth, parent, ancestors,
    archived: isArchived(tree, task.note_id) };
}

export function taskEntries(tree, tasks) {
  const order = new Map(tree.inOrder().map((note, index) => [note.id, index]));
  const tops = tasks.all().filter((task) => tree.has(task.note_id) && tasks.isTop(task))
    .sort((a, b) => (order.get(a.note_id) ?? 0) - (order.get(b.note_id) ?? 0) || byPosition(a, b));
  return tops.flatMap((task) => [entryOf(tree, task, 0), ...taskTree(tasks, task.id)
    .map((row) => entryOf(tree, row.task, row.depth, row.parent, tasks.ancestorsOf(row.task.id)))]);
}

/** The notes whose tasks a page lists: the owner and everything inside it. */
function ownedNotes(tree, owner) {
  return new Set([owner.id, ...tree.inOrder(owner.id).map((note) => note.id)]);
}

export function tasksOn(tree, tasks, owner) {
  const notes = ownedNotes(tree, owner);
  const entries = taskEntries(tree, tasks).filter((entry) => entry.depth === 0 && notes.has(entry.task.note_id))
    .map((entry) => withSubtasks(tasks, entry));
  return [...entries.filter((entry) => !entry.task.done), ...entries.filter((entry) => entry.task.done)];
}

function withSubtasks(tasks, entry) {
  const subtasks = tasks.descendantsOf(entry.task.id);
  return { ...entry, subtasks, openSubtasks: subtasks.filter((task) => !task.done).length };
}

export function openCount(tree, tasks, owner) {
  return tasksOn(tree, tasks, owner).filter((entry) => !entry.task.done).length;
}

export function subtaskText(entry) {
  const all = entry.subtasks?.length ?? 0;
  if (!all) return "";
  return `${all - entry.openSubtasks}/${all} subtask${all === 1 ? "" : "s"}`;
}

export function waitingOn(tree, tasks, personId = null) {
  const follow = (entry) => entry.task.follow_up || "9999-12-31";
  return taskEntries(tree, tasks)
    .filter((entry) => entry.task.delegate_id !== null && !entry.task.done && !entry.archived
      && (personId === null || entry.task.delegate_id === personId))
    .map((entry) => withSubtasks(tasks, entry))
    .sort((a, b) => follow(a).localeCompare(follow(b)));
}

export function openTasks(tree, tasks, { hubId = null, text = "" } = {}) {
  const scope = hubId === null ? null : hubScope(tree, hubId);
  const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
  const mine = (task) => !task.done && task.delegate_id === null;
  const entries = taskEntries(tree, tasks).filter((entry) => !entry.archived
    && (scope === null || (entry.hub && scope.includes(entry.hub.id))));
  return entries.filter((entry) => {
    // A task stays while it is open and mine, or while a subtask of mine somewhere under it
    // is (it heads them).
    if (!mine(entry.task) && !tasks.descendantsOf(entry.task.id).some(mine)) return false;
    const haystack = `${entry.task.title} ${entry.parent?.title ?? ""} ${entry.note.title} ${entry.hub?.title ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function todayTasks(tree, tasks, sessions, day) {
  const entries = new Map(taskEntries(tree, tasks).map((entry) => [entry.task.id, entry]));
  return sessions.filter((session) => session.day === day && entries.has(session.task_id))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((session) => ({ entry: entries.get(session.task_id), session }));
}

export function hubChoices(tree, tasks, { until = "" } = {}) {
  const hubs = new Map();
  const offered = (hub) => hub && !hub.archived_at && hub.status !== "on_hold";
  const followed = (task) => Boolean(task.follow_up) && (!until || task.follow_up <= until);
  for (const entry of taskEntries(tree, tasks)) {
    if (entry.depth > 0 || entry.archived || entry.task.done || !offered(entry.hub)) continue;
    if (entry.task.delegate_id !== null && !followed(entry.task)) continue;
    hubs.set(entry.hub.id, entry.hub);
    // An area offers its projects' tasks too, so it is a choice once one of them has some.
    const area = entry.hub.area_id ? tree.get(entry.hub.area_id) : null;
    if (offered(area)) hubs.set(area.id, area);
  }
  return [...hubs.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function parseEstimate(text) {
  const raw = String(text ?? "").trim().toLowerCase();
  if (!raw) return null;
  let total = null;
  const clock = /^(\d+):(\d{2})$/.exec(raw);
  const both = /^(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?\s*(\d+)\s*(?:m|min|mins|minutes?)?$/.exec(raw);
  const hours = /^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)$/.exec(raw);
  const mins = /^(\d+)\s*(?:m|min|mins|minutes?)?$/.exec(raw);
  if (clock) total = Number(clock[1]) * 60 + Number(clock[2]);
  else if (both) total = Math.round(Number(both[1].replace(",", ".")) * 60) + Number(both[2]);
  else if (hours) total = Math.round(Number(hours[1].replace(",", ".")) * 60);
  else if (mins) total = Number(mins[1]);
  if (!total || total <= 0 || total > 40 * 60) throw new Error(`"${text}" is not an estimate: write it like 30 min, 1.5 h or 2h30`);
  return total;
}

export function estimateText(total) {
  if (!total) return "";
  if (total < 60) return `${total} min`;
  const hours = total / 60;
  return Number.isInteger(hours) ? `${hours} h` : Number.isInteger(hours * 2) ? `${hours.toFixed(1)} h` : `${Math.floor(hours)} h ${total % 60}`;
}
