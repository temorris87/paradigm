// Tasks read together with the notes tree. A task is a box in a note's text: its note (and so
// its hub) is in the tree; its title, state and place in the text come from /api/tasks, its
// blocks of time from /api/sessions. A box nested under another is its subtask. Pure.
//
//   const tasks = new Tasks(await tasksApi.list());
//   tasks.get(id) / tasks.all()
//   taskEntries(tree, tasks)              [entry]: entry { task, note, hub, depth, archived }
//                                         in note and line order, each subtask after its parent
//   tasksOn(tree, tasks, owner)           a hub's (an area: its projects' too) or a meeting's:
//                                         open ones first (as in the text), then done ones
//   openTasks(tree, tasks, { hubId, text })   the calendar's list: open tasks in live hubs
//                                         (hubId: only that hub, an area with its projects),
//                                         a done parent's open subtasks too; text: words in
//                                         the title, note or hub
//   todayTasks(tree, tasks, sessions, day)    [{ entry, session }] of the blocks that day
//   hubChoices(tree, tasks)               the hubs with open tasks: the calendar's filter
import { hubOf, isArchived } from "../notes/hub-groups.js";
import { hubScope } from "../people/people-model.js";

export class Tasks {
  constructor(list = []) {
    this.byId = new Map(list.map((task) => [task.id, task]));
  }

  get(id) {
    return this.byId.get(id) ?? null;
  }

  all() {
    return [...this.byId.values()];
  }
}

export function taskEntries(tree, tasks) {
  const all = tasks.all().filter((task) => tree.has(task.note_id));
  const children = new Map();
  for (const task of all) {
    const key = tasks.get(task.parent_id) ? task.parent_id : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(task);
  }
  const order = (a, b) => a.note_id - b.note_id || a.field.localeCompare(b.field) || a.line - b.line;
  const found = [];
  const walk = (parentId, depth) => {
    for (const task of (children.get(parentId) ?? []).sort(order)) {
      found.push({ task, note: tree.get(task.note_id), hub: hubOf(tree, task.note_id), depth,
        archived: isArchived(tree, task.note_id) });
      walk(task.id, depth + 1);
    }
  };
  walk(null, 0);
  return found;
}

export function tasksOn(tree, tasks, owner) {
  const belongs = owner.kind === "meeting"
    ? (entry) => entry.note.id === owner.id
    : ((scope) => (entry) => entry.hub !== null && scope.includes(entry.hub.id))(hubScope(tree, owner.id));
  const entries = taskEntries(tree, tasks).filter(belongs);
  // Open work first, as in the text: a done task stays there while a subtask under it is open,
  // and a done subtask stays under its open task. Done ones with nothing open go last.
  const kept = new Set();
  for (const entry of entries) {
    if (!entry.task.done || hasOpenBelow(entries, entry) || kept.has(entry.task.parent_id)) kept.add(entry.task.id);
  }
  const open = entries.filter((entry) => kept.has(entry.task.id));
  return [...open, ...entries.filter((entry) => !kept.has(entry.task.id)).map((entry) => ({ ...entry, depth: 0 }))];
}

function hasOpenBelow(entries, entry) {
  const below = entries.filter((each) => each.task.parent_id === entry.task.id);
  return below.some((each) => !each.task.done || hasOpenBelow(entries, each));
}

export function openTasks(tree, tasks, { hubId = null, text = "" } = {}) {
  const scope = hubId === null ? null : hubScope(tree, hubId);
  const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
  const entries = taskEntries(tree, tasks).filter((entry) => !entry.archived && (scope === null || (entry.hub && scope.includes(entry.hub.id))));
  return entries.filter((entry) => {
    if (entry.task.done && !hasOpenBelow(entries, entry)) return false;
    const haystack = `${entry.task.title} ${entry.note.title} ${entry.hub?.title ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function todayTasks(tree, tasks, sessions, day) {
  const entries = new Map(taskEntries(tree, tasks).map((entry) => [entry.task.id, entry]));
  return sessions.filter((session) => session.day === day && entries.has(session.task_id))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((session) => ({ entry: entries.get(session.task_id), session }));
}

export function hubChoices(tree, tasks) {
  const hubs = new Map();
  for (const entry of taskEntries(tree, tasks)) {
    if (entry.hub && !entry.archived && !entry.task.done) hubs.set(entry.hub.id, entry.hub);
    // An area offers its projects' tasks too, so it is a choice once one of them has some.
    const area = entry.hub?.area_id ? tree.get(entry.hub.area_id) : null;
    if (area && !entry.archived && !entry.task.done) hubs.set(area.id, area);
  }
  return [...hubs.values()].sort((a, b) => a.title.localeCompare(b.title));
}
