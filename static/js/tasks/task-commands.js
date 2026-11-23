// What the task buttons, dialogs and :task do. A task is a record (paradigm/api/tasks.py):
// made in a page's Tasks section, ticked, edited, delegated, deleted. Each takes the NotesApp
// (static/js/notes/app.js); errors are thrown for the app (or the dialog) to show.
//
//   addTask(app, noteId, title, { parentId, due })    a task (or a subtask) on a note
//   setTaskDone(app, taskId, done)
//   newTaskDialog(app, owner, parent?)                + New task, + Add subtask
//   editTaskDialog(app, taskId)                       title, notes, due date, estimate, for whom
//   delegateDialog(app, taskId)                       to whom, and when to follow it up
//   takeBack(app, taskId)                             delegated back to me
//   setNextAction(app, owner, taskId)                 its next action (n), or not any more
//   scheduleTask(app, taskId)                         s: a block in the first free slot from now
//                                                     on, before its due day (its estimate, or
//                                                     30 min long)
//   snoozeTask(app, taskId)                           z: off Today's Up next until tomorrow
//   extendBlock(app, sessionId, minutes)              a block made longer (+15 min)
//   removeTaskDialog(app, taskId)                     with a confirm
//   taskCommand(app, arg)                             :task {title} on the open note
//   quickTaskCommand(app, arg)                        :t {text} [@Name] [!day]: a task on the
//                                                     open note's hub, without leaving the note
import { addDays, localDay } from "../meetings/meeting-days.js";
import { DEFAULT_LENGTH, clock, minutes } from "../calendar/week-model.js";
import { planningSettings } from "../today/today-model.js";
import { firstFreeSlot } from "../week/capacity.js";
import { dayText } from "../ui/dates.js";
import { allPeople, findPerson } from "../people/people-model.js";
import { estimateText, parseEstimate } from "./tasks-model.js";
import { parseTaskText } from "../notes/capture.js";
import { nextTogether } from "../people/one-on-one.js";
import { hubOf } from "../notes/hub-groups.js";
import { peopleNamed } from "../people/people-commands.js";
import { confirmDialog, formDialog } from "../ui/dialog.js";

function changed(app) {
  app.changes.send({ type: "changed", what: ["tasks"] });
  return app.refreshTree();
}

function taskOf(app, taskId) {
  const task = app.tasks.get(taskId);
  if (!task) throw new Error("E: that task is gone (deleted in another window?)");
  return task;
}

export async function addTask(app, noteId, title, { parentId = null, due = "" } = {}) {
  if (!title.trim()) throw new Error("A task needs some text");
  const task = await app.tasksApi.create(noteId, title.trim(), { parentId, due });
  await changed(app);
  const parent = parentId === null ? null : app.tasks.get(parentId);
  app.say(parent ? `Subtask "${task.title}" added to "${parent.title}"` : `Task "${task.title}" added to "${app.tree.get(noteId)?.title ?? ""}"`);
  return task;
}

export async function setTaskDone(app, taskId, done) {
  const task = taskOf(app, taskId);
  await app.tasksApi.setDone(taskId, done);
  await changed(app);
  app.say(`"${task.title}" ${done ? "done" : "open again"}`);
}

export function newTaskDialog(app, owner, parent = null) {
  return formDialog({
    title: parent ? `New subtask of "${parent.title}"` : `New task in "${owner.title}"`,
    fields: [
      { key: "title", label: parent ? "Subtask" : "Task", placeholder: "what to do" },
      { key: "due", label: "Due (optional)", type: "date", optional: true },
    ],
    submit: parent ? "Add subtask" : "Add task",
    run: ({ title, due }) => addTask(app, parent ? parent.note_id : owner.id, title, { parentId: parent?.id ?? null, due }),
    fallbackFocus: () => app.focusNote(),
  });
}

export function editTaskDialog(app, taskId) {
  const task = taskOf(app, taskId);
  return formDialog({
    title: `Task "${task.title}"`,
    fields: [
      { key: "title", label: "Task", value: task.title },
      { key: "notes", label: "Notes (optional)", type: "textarea", value: task.notes, optional: true,
        placeholder: "a few lines: where it stands, links, what is waited on" },
      { key: "due", label: "Due (optional)", type: "date", value: task.due, optional: true },
      { key: "estimate", label: "Estimate (optional)", value: estimateText(task.estimate_min), optional: true,
        placeholder: "30 min, 1.5 h: what s places on the week" },
      ...(task.delegate_id === null ? [{ key: "forName", label: "For (optional): someone you owe it to",
        value: app.tree.get(task.for_person_id)?.title ?? "", optional: true, suggestions: allPeople(app.tree).map((person) => person.title) }] : []),
    ],
    submit: "Save",
    run: async (values) => {
      const name = (values.forName ?? "").trim();
      const person = name ? findPerson(app.tree, name) : null;
      if (name && !person) throw new Error(`No one called "${name}" in People`);
      await app.tasksApi.update(taskId, { title: values.title, notes: values.notes, due: values.due,
        estimate_min: parseEstimate(values.estimate) });
      if (values.forName !== undefined && (person?.id ?? null) !== task.for_person_id) await app.tasksApi.setFor(taskId, person?.id ?? null);
      await changed(app);
      app.say(`"${values.title.trim()}" saved`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

/** Delegate…: a person (someone in People, or new) and when to follow it up: tomorrow, at our
 * next meeting (which also puts it on their To raise), or a day picked. */
export function delegateDialog(app, taskId) {
  const task = taskOf(app, taskId);
  const current = app.tree.get(task.delegate_id);
  const names = allPeople(app.tree).map((person) => person.title);
  const tomorrow = localDay(addDays(app.today(), 1));
  return formDialog({
    title: "Delegate task",
    text: current ? `"${task.title}", with ${current.title} now.` : `"${task.title}"`,
    fields: [
      { key: "name", label: "To", value: current?.title ?? "", suggestions: names, placeholder: "a name in People, or a new one" },
      { key: "when", label: "Follow up", type: "choice", value: task.follow_up ? "pick" : "tomorrow",
        options: [["tomorrow", "Tomorrow"], ["meeting", "At our next meeting"], ["pick", "Pick…"], ["none", "No follow-up"]] },
      { key: "follow", label: "Follow up on (with Pick…)", type: "date", value: task.follow_up || "", optional: true },
    ],
    live: ({ name, when }) => {
      if (when !== "meeting") return "";
      const person = findPerson(app.tree, name);
      const next = person ? nextTogether(app.tree, app.meetings, person.id, app.today()) : null;
      return next ? `${next.note.title}, ${dayText(next.meeting.day, { today: localDay(app.today()) })}: it goes on their To raise too.`
        : "No meeting with them coming: pick a day instead.";
    },
    submit: ({ name }) => (!name.trim() || findPerson(app.tree, name) ? "Delegate" : "Delegate to a new person"),
    run: async ({ name, when, follow }) => {
      const { people: [person] } = await peopleNamed(app, [name.trim()], true, "");
      const next = when === "meeting" ? nextTogether(app.tree, app.meetings, person.id, app.today()) : null;
      if (when === "meeting" && !next) throw new Error(`No meeting with ${person.title} coming: pick a day instead`);
      if (when === "pick" && !follow) throw new Error("Pick the day to follow it up");
      const day = { tomorrow, meeting: next?.meeting.day, pick: follow, none: "" }[when] ?? "";
      await app.tasksApi.delegate(taskId, person.id, day);
      if (next) await app.peopleApi.addTopic(person.id, `Follow up: ${task.title}`);
      await changed(app);
      app.say(`"${task.title}" delegated to ${person.title}${day ? `, follow up ${dayText(day, { today: localDay(app.today()) })}` : ""}`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

export async function setNextAction(app, owner, taskId) {
  const task = taskOf(app, taskId);
  const flag = !task.is_next;
  await app.tasksApi.setNext(taskId, flag);
  // The owner's own flag beats one inside it (nextAction), so a task flagged from the owner's
  // page on a note inside it takes over from the owner's.
  const own = owner ? app.tasks.all().find((each) => each.is_next && each.note_id === owner.id && each.id !== taskId) : null;
  if (flag && own) await app.tasksApi.setNext(own.id, false);
  await changed(app);
  app.say(flag ? `Next action: "${task.title}"` : `"${task.title}" is no longer the next action`);
}

export async function scheduleTask(app, taskId) {
  const task = taskOf(app, taskId);
  if (task.done) throw new Error(`E: "${task.title}" is done already`);
  const now = app.today();
  const day = localDay(now);
  const length = task.estimate_min || DEFAULT_LENGTH;
  const ctx = { tree: app.tree, meetings: app.meetings, tasks: app.tasks, sessions: app.sessions };
  const until = task.due && task.due >= day ? task.due : "";
  const slot = firstFreeSlot(ctx, { length, from: { day, minute: now.getHours() * 60 + now.getMinutes() }, until,
    settings: planningSettings(app.timeSettings) });
  if (!slot) {
    throw new Error(`E: no free ${length} min${until ? ` before ${dayText(until, { today: day })}` : " in the next two weeks"} for "${task.title}"`);
  }
  await app.tasksApi.addSession(taskId, slot.day, clock(slot.start), clock(slot.end));
  await changed(app);
  app.say(`"${task.title}" placed ${dayText(slot.day, { today: day, relative: true })} ${clock(slot.start)}–${clock(slot.end)}`);
  return slot;
}

export async function snoozeTask(app, taskId) {
  const task = taskOf(app, taskId);
  const tomorrow = localDay(addDays(app.today(), 1));
  await app.tasksApi.update(taskId, { snoozed_until: tomorrow });
  await changed(app);
  app.say(`"${task.title}" snoozed until tomorrow`);
}

export async function extendBlock(app, sessionId, extra = 15) {
  const session = app.sessions.find((each) => each.id === sessionId);
  if (!session) throw new Error("E: that block is gone");
  const end = Math.min(24 * 60, minutes(session.end) + extra);
  await app.tasksApi.moveSession(sessionId, session.day, session.start, clock(end));
  await changed(app);
  app.say(`Block runs to ${clock(end)}`);
}

export async function takeBack(app, taskId) {
  const task = taskOf(app, taskId);
  await app.tasksApi.delegate(taskId, null);
  await changed(app);
  app.say(`"${task.title}" is yours again`);
}

export function removeTaskDialog(app, taskId) {
  const task = taskOf(app, taskId);
  const subtasks = app.tasks.subtasksOf(taskId).length;
  return confirmDialog({
    title: "Delete task",
    text: `Delete "${task.title}"${subtasks ? ` and its ${subtasks === 1 ? "subtask" : `${subtasks} subtasks`}` : ""}? Time already logged on it stays on the timesheet.`,
    confirm: "Delete",
    danger: true,
    run: async () => {
      await app.tasksApi.remove(taskId);
      await changed(app);
      app.say(`"${task.title}" deleted`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

/** :task {title}: a task on the open note (due today with a "!" in front: ":task !Call Jo"). */
export async function taskCommand(app, arg) {
  const id = app.currentId;
  if (id === null) throw new Error("E: no note is open");
  let title = arg.trim();
  if (!title) throw new Error("E471: Argument required: :task {what to do}");
  let due = "";
  if (title.startsWith("!")) {
    title = title.slice(1).trim();
    due = localDay(app.today());
  }
  await addTask(app, id, title, { due });
}

export async function quickTaskCommand(app, arg) {
  if (app.currentId === null) throw new Error("E: no note is open");
  const parsed = parseTaskText(arg.trim(), app.tree, app.today());
  if (!parsed.title) throw new Error("E: :t needs some text: :t send the numbers @Tom !fri");
  const owner = hubOf(app.tree, app.currentId) ?? app.tree.get(app.currentId);
  const task = await app.tasksApi.create(owner.id, parsed.title, { due: parsed.due });
  if (parsed.delegate) await app.tasksApi.delegate(task.id, parsed.delegate.id, "");
  else if (parsed.forPerson) await app.tasksApi.setFor(task.id, parsed.forPerson.id);
  await changed(app);
  app.say(`Task "${parsed.title}" on ${owner.title}${parsed.delegate ? `, for ${parsed.delegate.title} to do` : ""}`);
  return task;
}
