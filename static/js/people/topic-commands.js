// What the To raise section, Start 1:1 notes and the For field do. Each takes the NotesApp;
// errors are thrown for the app (or the dialog) to show.
//
//   addTopicDialog(app, person)        + Add: a few words to raise with them
//   raiseTopic(app, id, raised)        ticked off in a 1:1 (Space, Raised)
//   removeTopic(app, id)               x
//   startOneOnOne(app, person)         the next meeting with them, its agenda with the topics
//                                      to raise; none: New meeting "1:1 First" with them
import { newMeetingDialog } from "../hubs/hub-actions.js";
import { formDialog } from "../ui/dialog.js";
import { firstName, nextTogether } from "./one-on-one.js";

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

export async function startOneOnOne(app, person) {
  let next = nextTogether(app.tree, app.meetings, person.id, app.today());
  if (!next) {
    const made = await newMeetingDialog(app, person, { title: `1:1 ${firstName(person)}` });
    if (!made) return;
    await app.refreshTree();
    next = nextTogether(app.tree, app.meetings, person.id, app.today());
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
