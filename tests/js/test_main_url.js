// A note's URL loaded straight into the main window (spec 023): a plain note shows its hub's
// dashboard, or Home when it has none; the address, the session's note and the note on screen
// agree, so a note command never acts on a dashboard shown before.
import { NotesApp, noteUrl } from "../../static/js/notes/app.js";
import { NO_NOTE, screenNote } from "../../static/js/notes/screen-note.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const NOTES = [
  { id: 2, parent_id: null, title: "Ada Park", kind: "person" },
  { id: 10, parent_id: null, title: "Team", kind: "area" },
  { id: 16, parent_id: null, title: "Ideas to sort" },
  { id: 37, parent_id: 10, title: "Loose ideas" },
  { id: 38, parent_id: 37, title: "Deeper idea" },
  { id: 14, parent_id: null, title: "Northwind rollout", kind: "project" },
];

// The main window with the dashboard `from` open, as after opening it; history "none" is
// Back/Forward, "replace" a fresh load. Records what the address became.
function mainApp(from) {
  const urls = [];
  const said = [];
  const selected = [];
  const app = {
    role: "main", currentId: from, tree: new NoteTree(NOTES),
    location: { search: "" },
    history: { replaceState: (_s, _t, url) => urls.push(url), pushState: (_s, _t, url) => urls.push(`push ${url}`) },
    views: {
      shown: null, pages: { home: {} },
      fromUrl: (params) => (params.has("home") ? "home" : null),
    },
    hubPage: { selectNote: (id) => selected.push(id) },
    // As NotesApp.open in the main window: a dashboard replaces the page; history as asked.
    open: async (id, { history = "push" } = {}) => {
      assertTrue(app.isDashboard(id), `the main window never opens a plain note (${id}) by itself`);
      app.views.shown = null;
      if (id !== app.currentId && history === "replace") urls.push(noteUrl(id));
      app.currentId = id;
      return true;
    },
    showView: (key, history) => {
      app.views.shown = key;
      if (history === "replace") urls.push(`${noteUrl(app.currentId)}&${key}`);
    },
    say: (text) => said.push(text),
  };
  for (const name of ["openFromUrl", "mainFromUrl", "isDashboard"]) app[name] = NotesApp.prototype[name];
  return { app, urls, said, selected };
}

async function load(from, search, history) {
  const made = mainApp(from);
  made.app.location.search = search;
  await made.app.openFromUrl(history);
  return { ...made, screen: screenNote(made.app), address: made.urls.at(-1) ?? null };
}

for (const history of ["replace", "none"]) {
  test(`main URL (${history}): a plain note under a hub shows the hub, named in the address`, async () => {
    for (const [from, wanted] of [[2, 37], [14, 38], [10, 37]]) {
      const { app, screen, address, said, selected } = await load(from, `?note=${wanted}`, history);
      assertEqual(app.views.shown, null, `${wanted}: the dashboard, no page over it`);
      assertEqual(app.currentId, 10, `${wanted} from ${from}: Team is the session's note`);
      assertEqual(screen.id, 10, "and the note on screen");
      assertEqual(address, noteUrl(10), "the address names Team, not the plain note");
      assertEqual(said.join(), `"${app.tree.get(wanted).title}" is a note: Enter on it opens the note window`);
      assertEqual(selected.join(), String(wanted), "the cursor goes to its row");
    }
  });

  test(`main URL (${history}): a top-level plain note shows Home, never the first dashboard`, async () => {
    for (const from of [2, 14]) {
      const { app, screen, address, said } = await load(from, "?note=16", history);
      assertEqual(app.views.shown, "home", `from ${from}`);
      assertEqual(screen.id, null, "no note on screen");
      assertEqual(screen.refusal, NO_NOTE, ":trash refuses");
      assertTrue(address.endsWith("&home"), `the address is Home's: ${address}`);
      assertTrue(!address.includes("note=16"), "and never names the plain note");
      assertEqual(said.join(), `"Ideas to sort" is a note: Enter on it opens the note window`);
    }
  });

  test(`main URL (${history}): an unknown or trashed id shows Home, nothing from before`, async () => {
    for (const from of [2, 10]) {
      const { app, screen, address, said } = await load(from, "?note=999", history);
      assertEqual(app.views.shown, "home", `from ${from}`);
      assertEqual(screen.id, null, "no note on screen");
      assertTrue(address.endsWith("&home") && !address.includes("999"), `the address is Home's: ${address}`);
      assertEqual(said.length, 0, "nothing to say about a note that isn't there");
    }
  });

  test(`main URL (${history}): a hub's or a person's own URL opens it, quietly`, async () => {
    for (const [from, wanted] of [[2, 10], [10, 2]]) {
      const { app, screen, urls, said } = await load(from, `?note=${wanted}`, history);
      assertEqual(app.views.shown, null);
      assertEqual(screen.id, wanted);
      assertEqual(urls.join(), history === "replace" ? noteUrl(wanted) : "", "the address already names it");
      assertEqual(said.length, 0, "no status message");
    }
  });
}

test("main URL: a page flag over a plain note keeps its page (a task's URL names the task's note)", async () => {
  const { app, said } = await load(2, "?note=37&home", "none");
  assertEqual(app.views.shown, "home");
  assertEqual(app.currentId, 10, "the hub under the page");
  assertEqual(said.length, 0);
});

// :trash on a hub with notes under it: refused here, without a request the server would
// refuse with a 409 (which the browser's console lists as a failed load).
function trashApp(onScreen) {
  const removed = [];
  const app = {
    role: "main", currentId: onScreen, tree: new NoteTree(NOTES),
    screenNoteId: () => onScreen,
    api: { remove: async (id, recursive) => removed.push([id, recursive]) },
  };
  app.trashCommand = NotesApp.prototype.trashCommand;
  return { app, removed };
}

test("main :trash: a hub with notes under it is refused without asking the server", async () => {
  const { app, removed } = trashApp(10);
  let message = "";
  try {
    await app.trashCommand(false);
  } catch (error) {
    message = error.message;
  }
  assertEqual(message, "E: The note has notes under it: :trash! deletes them too");
  assertEqual(removed.length, 0, "no request sent");
});

test("main status line: clearStatus empties it, an error's colour too", () => {
  const classes = new Set(["status-line--error"]);
  const status = { textContent: "E: refused", classList: { remove: (name) => classes.delete(name) } };
  const app = { role: "main", status, statusTimer: null };
  NotesApp.prototype.clearStatus.call(app);
  assertEqual(status.textContent, "");
  assertEqual(classes.size, 0);
});
