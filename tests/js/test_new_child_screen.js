// :new and :child in the main window (spec 022): they place the new note beside or under the
// note on screen (screen-note.js), never the hub a page hides; the note window uses its open note.
import { runNoteCommand } from "../../static/js/notes/commands.js";
import { NO_NOTE, TASK_PAGE } from "../../static/js/notes/screen-note.js";
import { NotesApp } from "../../static/js/notes/app.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, test } from "./harness.js";

// Team (a hub) with Standup under it; Acme a top-level project with Kickoff under it.
const NOTES = [{ id: 1, parent_id: null, title: "Team", kind: "area" }, { id: 4, parent_id: 1, title: "Standup" },
  { id: 2, parent_id: null, title: "Acme", kind: "project" }, { id: 7, parent_id: 2, title: "Kickoff" }];

// Only what createCommand reads; made records each api.create as "parent:title".
function fakeApp(shown, { role = "main", currentId = 1, live = null, notes = NOTES } = {}) {
  const made = [];
  const app = { role, made, said: "", tree: new NoteTree(notes),
    session: { note: currentId === null ? null : { id: currentId } },
    views: { shown, pages: { live: { state: live === null ? null : { id: live } } } },
    api: { create: async (parentId, title) => { made.push(`${parentId}:${title}`); return { id: 99, title }; } },
    saveBeforeSwitching: async () => true, refreshTree: async () => {}, open: async () => {},
    say(text) { app.said = text; } };
  app.tree.pathText = () => "";
  for (const name of ["screenNoteId", "createCommand", "createAndOpen"]) app[name] = NotesApp.prototype[name];
  Object.defineProperty(app, "currentId", { get: () => app.session.note?.id ?? null });
  return app;
}

async function run(app, name, arg) {
  try {
    await runNoteCommand(app, { name, arg, bang: false });
    return "";
  } catch (error) {
    return error.message;
  }
}

test("new/child: on a dashboard or Plan, beside and under that note, as before", async () => {
  for (const shown of [null, "plan"]) {
    const app = fakeApp(shown, { currentId: 4 });
    assertEqual(await run(app, "new", "X"), "", `${shown}: :new`);
    assertEqual(await run(app, "child", "Y"), "", `${shown}: :child`);
    assertEqual(app.made.join(), "1:X,4:Y", `${shown}: beside Standup, under Standup`);
  }
});

test("new/child: a top-level note on screen makes a top-level note with :new", async () => {
  const app = fakeApp(null, { currentId: 2 });
  await run(app, "new", "X");
  assertEqual(app.made.join(), "null:X");
});

test("new/child: on Live, beside and under the Live note, not the hub under the page", async () => {
  const app = fakeApp("live", { currentId: 1, live: 7 });
  assertEqual(await run(app, "child", "Y"), "");
  assertEqual(await run(app, "new", "Z"), "");
  assertEqual(app.made.join(), "7:Y,2:Z");
});

test("new/child: Live with no note refuses and makes nothing", async () => {
  const app = fakeApp("live", { currentId: 1 });
  assertEqual(await run(app, "new", "X"), NO_NOTE);
  assertEqual(app.made.length, 0);
});

test("new/child: the task page gives the task-page refusal", async () => {
  const app = fakeApp("task", { currentId: 2 });
  assertEqual(await run(app, "new", "X"), TASK_PAGE);
  assertEqual(await run(app, "child", "X"), TASK_PAGE);
  assertEqual(app.made.length, 0);
});

test("new/child: pages that show no note refuse and make nothing", async () => {
  for (const shown of ["home", "week", "people", "meetings", "trash", "template", "folder"]) {
    const app = fakeApp(shown, { currentId: 2 });
    assertEqual(await run(app, "new", "X"), NO_NOTE, `${shown}: :new`);
    assertEqual(await run(app, "child", "X"), NO_NOTE, `${shown}: :child`);
    assertEqual(app.made.length, 0, `${shown}: nothing made`);
  }
});

test("new/child: with no note open at all (an empty database), the refusal and no exception", async () => {
  for (const shown of [null, "home"]) {
    const app = fakeApp(shown, { currentId: null, notes: [] });
    assertEqual(await run(app, "new", "A"), NO_NOTE, `${shown}: :new`);
    assertEqual(await run(app, "child", "A"), NO_NOTE, `${shown}: :child`);
    assertEqual(app.made.length, 0);
  }
});

test("new/child: the note window uses its open note, whatever views says", async () => {
  const app = fakeApp("home", { role: "note", currentId: 7 });
  await run(app, "new", "X");
  await run(app, "child", "Y");
  assertEqual(app.made.join(), "2:X,7:Y");
});

test("new/child: an empty title still asks for one", async () => {
  const app = fakeApp(null, { currentId: 2 });
  assertEqual(await run(app, "new", "  "), "E471: Argument required: the new note's title");
});
