// What the task buttons, dialogs and :task do. A task is a record (paradigm/api/tasks.py):
// made in a page's Tasks section, ticked, edited, delegated, deleted. Each takes the NotesApp
// (static/js/notes/app.js); errors are thrown for the app (or the dialog) to show.
//
//   addTask(app, noteId, title, { parentId, due })    a task (or a subtask) on a note
//   setTaskDone(app, taskId, done)
//   newTaskDialog(app, owner, parent?)                + New task, + Add subtask
//   editTaskDialog(app, taskId)                       title, notes, due date
//   delegateDialog(app, taskId)                       to whom, and when to follow it up
//   takeBack(app, taskId)                             delegated back to me
//   removeTaskDialog(app, taskId)                     with a confirm
//   taskCommand(app, arg)                             :task {title} on the open note
import { localDay } from "../meetings/meeting-days.js";
import { allPeople, findPerson } from "../people/people-model.js";
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
    ],
    submit: "Save",
    run: async (values) => {
      await app.tasksApi.update(taskId, { title: values.title, notes: values.notes, due: values.due });
      await changed(app);
      app.say(`"${values.title.trim()}" saved`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

/** Delegate…: a person (someone in People, or new) and a day to follow it up. */
export function delegateDialog(app, taskId) {
  const task = taskOf(app, taskId);
  const current = app.tree.get(task.delegate_id);
  const names = allPeople(app.tree).map((person) => person.title);
  return formDialog({
    title: `Who is doing "${task.title}"?`,
    text: current ? `Delegated to ${current.title} now.` : "Delegated tasks leave your calendar list and wait in Waiting on.",
    fields: [
      { key: "name", label: "Person", value: current?.title ?? "", suggestions: names, placeholder: "a name in People, or a new one" },
      { key: "follow", label: "Follow up on (optional)", type: "date", value: task.follow_up || "", optional: true },
    ],
    submit: ({ name }) => (!name.trim() || findPerson(app.tree, name) ? "Delegate" : "Delegate to a new person"),
    run: async ({ name, follow }) => {
      const { people: [person] } = await peopleNamed(app, [name.trim()], true, "");
      await app.tasksApi.delegate(taskId, person.id, follow);
      await changed(app);
      app.say(`"${task.title}" delegated to ${person.title}${follow ? `, follow up ${follow}` : ""}`);
    },
    fallbackFocus: () => app.focusNote(),
  });
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
