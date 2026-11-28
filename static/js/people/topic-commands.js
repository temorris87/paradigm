// What the To raise section, Start 1:1 notes and the For field do. Each takes the NotesApp;
// errors are thrown for the app (or the dialog) to show.
//
//   addTopicDialog(app, person)        + Add: a few words to raise with them
//   raiseTopic(app, id, raised)        ticked off in a 1:1 (Space, Raised)
//   removeTopic(app, id)               x
//   startOneOnOne(app, person)         the next 1:1 with them still to come (else the next
//                                      meeting with them), its agenda with the topics to
//                                      raise; none: New meeting "1:1 First" with them
//   delegateNewDialog(app, person)     + Delegate (They owe me): a new task, delegated to them
//   oweNewDialog(app, person)          + Task (I owe): a new task of mine, for them
//   taskHubOptions(tree, people, person)  where those new tasks can go: [[id, title]], the
//                                      person's live hubs first (the first is the default)
// A person's own note holds no tasks (the server refuses them), so the new task goes on a
// hub, picked in the dialog: one they are on, else any live project or area.
import { newMeetingDialog } from "../hubs/hub-actions.js";
import { hubChoices } from "../notes/capture-model.js";
import { formDialog } from "../ui/dialog.js";
import { firstName, nextOneOnOne, nextTogether } from "./one-on-one.js";
import { hubLinks } from "./people-model.js";

function changed(app) {
  app.changes.send({ type: "changed", what: ["topics"] });
  return app.refreshTree();
}

export function addTopicDialog(app, person) {
  return formDialog({
    title: `To raise with ${person.title}`,
    fields: [{ key: "text", label: "What to raise next 1:1", placeholder: "a few words" }],
    submit: "Add",
    run: async ({ text }) => {
      await app.peopleApi.addTopic(person.id, text);
      await changed(app);
      app.say(`To raise with ${firstName(person)}: ${text.trim()}`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

export async function raiseTopic(app, id, raised) {
  await app.peopleApi.raiseTopic(id, raised);
  await changed(app);
  app.say(raised ? "Raised: off the list" : "Back on the list");
}

export async function removeTopic(app, id) {
  await app.peopleApi.removeTopic(id);
  await changed(app);
  app.say("Topic removed");
}

const meetingFor = (app, person) => nextOneOnOne(app.tree, app.meetings, person.id, app.today())
  ?? nextTogether(app.tree, app.meetings, person.id, app.today());

export async function startOneOnOne(app, person) {
  let next = meetingFor(app, person);
  if (!next) {
    const made = await newMeetingDialog(app, person, { title: `1:1 ${firstName(person)}` });
    if (!made) return;
    await app.refreshTree();
    next = meetingFor(app, person);
    if (!next) return;
  }
  const topics = (app.topics ?? []).filter((topic) => topic.person_id === person.id && !topic.raised_at);
  if (topics.length) {
    const note = await app.api.get(next.note.id);
    const agenda = String(note.agenda ?? "").replace(/\s+$/, "");
    const lines = topics.map((topic) => `- ${topic.text}`).filter((line) => !agenda.includes(line));
    if (lines.length) await app.saveOtherAgenda(note, agenda ? `${agenda}\n${lines.join("\n")}` : lines.join("\n"));
  }
  await app.openInNoteWindow(next.note.id);
}

function tasksChanged(app) {
  app.changes.send({ type: "changed", what: ["tasks"] });
  return app.refreshTree();
}

export function taskHubOptions(tree, people, person) {
  const live = hubChoices(tree).filter((hub) => hub.id !== person.id);
  const theirs = new Set(hubLinks(tree, people, person.id).filter((link) => !link.archived).map((link) => link.hub.id));
  const ordered = [...live.filter((hub) => theirs.has(hub.id)), ...live.filter((hub) => !theirs.has(hub.id))];
  return ordered.map((hub) => [String(hub.id), hub.title]);
}

function hubField(app, person) {
  const options = taskHubOptions(app.tree, app.people, person);
  if (!options.length) throw new Error("E: no project or area to put the task on (:new adds one)");
  return { key: "hub", label: "Goes to", type: "select", options, value: options[0][0] };
}

export async function delegateNewDialog(app, person) {
  const hub = hubField(app, person);
  return formDialog({
    title: `Delegate to ${person.title}`,
    fields: [
      { key: "title", label: "Task", placeholder: "what they will do" },
      { key: "follow", label: "Follow up on (optional)", type: "date", optional: true },
      hub,
    ],
    submit: "Delegate",
    run: async ({ title, follow, hub }) => {
      if (!title.trim()) throw new Error("A task needs some text");
      const task = await app.tasksApi.create(Number(hub), title.trim());
      await app.tasksApi.delegate(task.id, person.id, follow || "");
      await tasksChanged(app);
      app.say(`"${task.title}" delegated to ${person.title}`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

export async function oweNewDialog(app, person) {
  const hub = hubField(app, person);
  return formDialog({
    title: `A task for ${person.title}`,
    fields: [
      { key: "title", label: "Task", placeholder: "what you owe them" },
      { key: "due", label: "Due (optional)", type: "date", optional: true },
      hub,
    ],
    submit: "Add task",
    run: async ({ title, due, hub }) => {
      if (!title.trim()) throw new Error("A task needs some text");
      const task = await app.tasksApi.create(Number(hub), title.trim(), { due: due || "" });
      await app.tasksApi.setFor(task.id, person.id);
      await tasksChanged(app);
      app.say(`"${task.title}" added: you owe it ${firstName(person)}`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}
