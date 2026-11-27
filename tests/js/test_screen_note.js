// Which note a note command acts on (static/js/notes/screen-note.js): the one on screen, never
// the dashboard hidden under a main-window page; and every "this note" command refuses on a
// page that shows none.
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { NO_NOTE, TASK_PAGE, liveBodyOf, refusalOf, screenNoteId } from "../../static/js/notes/screen-note.js";
import { NotesApp } from "../../static/js/notes/app.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const NOTES = [{ id: 2, parent_id: null, title: "Acme", kind: "project" }, { id: 7, parent_id: 2, title: "Kickoff" }];

// Every command that acts on "this note" (spec 016), by name; the filing commands are :kind.
const ON_NOTE = ["trash", "rename", "parent", "project", "area", "resource", "inbox", "inarea", "archive", "restore",
  "export", "timecode", "date", "addperson", "dropperson", "org", "job", "email", "phone", "meeting", "attendee",
  "dropattendee", "decision", "question", "answered", "reopen", "with", "dropwith", "task", "t", "log", "dashboard"];

function mainApp(shown, { live = null, role = "main", currentId = 2 } = {}) {
  return { role, currentId, tree: new NoteTree(NOTES),
    views: { shown, pages: { live: { state: live === null ? null : { id: live } } } } };
}

test("screen note: a bare dashboard and Plan are the hub; Live is its note; other pages none", () => {
  const rows = [[null, 2, ""], ["plan", 2, ""], ["live", 7, ""], ["task", null, TASK_PAGE], ["home", null, NO_NOTE],
    ["week", null, NO_NOTE], ["people", null, NO_NOTE], ["meetings", null, NO_NOTE], ["trash", null, NO_NOTE],
    ["template", null, NO_NOTE], ["folder", null, NO_NOTE]];
  for (const [shown, id, refusal] of rows) {
    const app = mainApp(shown, { live: 7 });
    assertEqual(screenNoteId(app), id, `${shown}: id`);
    assertEqual(refusalOf(app), refusal, `${shown}: refusal`);
  }
});

test("screen note: Live with no note, a trashed one or one gone from the tree shows none", () => {
  assertEqual(screenNoteId(mainApp("live")), null);
  assertEqual(refusalOf(mainApp("live")), NO_NOTE);
  assertEqual(screenNoteId(mainApp("live", { live: 9 })), null, "not in the tree");
  const trashed = mainApp("live", { live: 7 });
  trashed.views.pages.live.state.trashed = true;
  assertEqual(screenNoteId(trashed), null, "the Live page says Moved to trash");
});

test("screen note: the note window's note is the open one, whatever views says", () => {
  assertEqual(screenNoteId(mainApp("home", { role: "note", currentId: 7 })), 7);
  assertEqual(refusalOf(mainApp("home", { role: "note" })), "");
  assertEqual(screenNoteId({ currentId: 4 }), 4, "an app with no views (the tests' fakes)");
});

test("screen note: every note command refuses on Today, and runs nothing", async () => {
  const names = NOTE_COMMANDS.filter((command) => command.onNote).map((command) => command.name);
  assertEqual([...names].sort().join(), [...ON_NOTE].sort().join(), "the commands marked onNote");
  for (const name of ON_NOTE) {
    // Only what the refusal reads: running the command would touch the missing api and fail otherwise.
    for (const [shown, message] of [["home", NO_NOTE], ["task", TASK_PAGE]]) {
      const app = mainApp(shown);
      let said = "";
      try {
        await runNoteCommand(app, { name, arg: "x", bang: false });
      } catch (error) {
        said = error.message;
      }
      assertEqual(said, message, `:${name} on ${shown}`);
    }
  }
});

test("screen note: commands about pages still run on Today", () => {
  let shown = "";
  runNoteCommand({ ...mainApp("home"), showView: (key) => { shown = key; } }, { name: "people" });
  assertEqual(shown, "people");
  assertTrue(!NOTE_COMMANDS.find((command) => command.name === "edit").onNote, ":e opens a note, it acts on none");
});

test("screen note: on Live, :rename renames the Live note and leaves the hub's session alone", async () => {
  const renamed = [];
  const sent = [];
  const app = { ...mainApp("live", { live: 7 }), say() {}, refreshTree: async () => {},
    changes: { send: (message) => sent.push(message.type) },
    api: { rename: async (id, title) => { renamed.push(id); return { id, title }; } },
    session: { updateMeta: () => renamed.push("session") } };
  for (const name of ["screenNoteId", "updateMetaIfOpen", "noteChanged", "renameCommand"]) app[name] = NotesApp.prototype[name];
  await runNoteCommand(app, { name: "rename", arg: "Kickoff notes" });
  assertEqual(renamed.join(), "7", "the Live note, and the hub's session not told it was renamed");
  assertEqual(sent.join(), "changed", "the note window is told, so Live shows the new title");
});

test("screen note: on Live, a person's :org tells the note window", async () => {
  const notes = [{ id: 5, parent_id: null, title: "Dana", kind: "person" }];
  const sent = [];
  const app = { role: "main", currentId: null, tree: new NoteTree(notes), say() {}, refreshTree: async () => {},
    views: { shown: "live", pages: { live: { state: { id: 5 } } } },
    changes: { send: (message) => sent.push(message.type) },
    peopleApi: { update: async (id) => sent.push(id) } };
  await runNoteCommand(app, { name: "org", arg: "Acme" });
  assertEqual(sent.join(), "5,changed");
});

test("screen note: the Live body is the note window's text as typed, for that note only", () => {
  const app = mainApp("live");
  app.views.pages.live.state = { id: 7, fields: [{ name: "agenda", text: "a" }, { name: "body", text: "typed" }] };
  assertEqual(liveBodyOf(app, 7), "typed");
  assertEqual(liveBodyOf(app, 2), null, "another note: none");
  app.views.pages.live.state.trashed = true;
  assertEqual(liveBodyOf(app, 7), null, "a trashed one: none");
  assertEqual(liveBodyOf(mainApp("live"), 7), null, "an empty Live page: none");
});
