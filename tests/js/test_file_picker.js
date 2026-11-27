// "Add file…": the folder browser's model and keys, and the pick-then-attach flow (the
// computer's own dialog, a folder not linked yet, a cancel, the folder browser) on a fake API.
import { ApiError } from "../../static/js/notes/api.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { Files } from "../../static/js/files/files-model.js";
import { addFileDialog } from "../../static/js/files/file-commands.js";
import { HubPage } from "../../static/js/hubs/hub-page.js";
import { FOLDER_BROWSER_KEYS, filterAction, listKeyReader } from "../../static/js/files/folder-browser-keys.js";
import { baseName, entriesOf, filterEntries, joinPath, moveActive, rootEntries, sizeText } from "../../static/js/files/folder-browser-model.js";
import { assertEqual as same, assertTrue, test } from "./harness.js";

const assertEqual = (actual, expected, message) => same(JSON.stringify(actual), JSON.stringify(expected), message);

const T = "2026-11-21T12:00:00.000Z";
const NOTES = [
  { id: 2, parent_id: null, title: "Pilot", kind: "project", status: "active", updated_at: T },
  { id: 8, parent_id: 2, title: "Spec", updated_at: T },
  { id: 9, parent_id: null, title: "Loose", updated_at: T },
];

const key = (name, extra = {}) => new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...extra });
const ticks = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

// ---- the model ---------------------------------------------------------------------------

test("folder browser model: folders first, then files, each by name; only the folder's own subfolders", () => {
  const rows = entriesOf({
    path: "C:\\od\\Pilot",
    folders: ["C:\\od\\Pilot\\zeta", "C:\\od\\Pilot\\Alpha", "C:\\od\\Pilot\\Alpha\\deep", "C:\\od\\Pilot"],
    files: [{ name: "b.xlsx", size: 2048 }, { name: "A.docx", size: 10 }],
  });
  assertEqual(rows.map((row) => `${row.kind}:${row.name}`), ["folder:Alpha", "folder:zeta", "file:A.docx", "file:b.xlsx"]);
  assertEqual(rows[2].path, "C:\\od\\Pilot\\A.docx", "a file's path joins with the folder's own separator");
  assertEqual(entriesOf({ path: "/od/P/", folders: ["/od/P/x"], files: [{ name: "f" }] }).map((row) => row.path), ["/od/P/x", "/od/P/f"]);
});

test("folder browser model: paths, roots, filter, moves, sizes", () => {
  assertEqual(joinPath("C:\\", "a.txt"), "C:\\a.txt");
  assertEqual(joinPath("/", "a.txt"), "/a.txt");
  assertEqual(joinPath("/od/P", "a.txt"), "/od/P/a.txt");
  assertEqual(baseName("C:\\od\\Pilot\\"), "Pilot");
  assertEqual(baseName("/od/Pilot"), "Pilot");
  assertEqual(rootEntries(["/od"]), [{ kind: "folder", name: "/od", path: "/od" }]);
  const rows = [{ name: "Budget 2026.xlsx" }, { name: "Notes.txt" }, { name: "budget draft" }];
  assertEqual(filterEntries(rows, "BUDGET").map((row) => row.name), ["Budget 2026.xlsx", "budget draft"]);
  assertEqual(filterEntries(rows, "budget xlsx").map((row) => row.name), ["Budget 2026.xlsx"]);
  assertEqual(filterEntries(rows, "  ").length, 3);
  assertEqual([moveActive(0, "next", 3), moveActive(2, "next", 3), moveActive(0, "previous", 3), moveActive(1, "first", 3),
    moveActive(0, "last", 3), moveActive(5, null, 3), moveActive(2, "next", 0)], [1, 2, 0, 0, 2, 2, 0]);
  assertEqual([sizeText(812), sizeText(14 * 1024), sizeText(3.2 * 1024 * 1024), sizeText(undefined)], ["812 B", "14 KB", "3.2 MB", ""]);
});

test("folder browser keys: the table's keys, gg as a sequence, the filter's two keys", () => {
  let now = 0;
  const read = listKeyReader({ now: () => now });
  const actions = ["j", "ArrowDown", "k", "ArrowUp", "G", "Enter", "l", "h", "Backspace", "/", "Escape"].map((name) => read(key(name)));
  assertEqual(actions, ["next", "next", "previous", "previous", "last", "open", "open", "up", "up", "filter", "cancel"]);
  assertEqual(read(key("g")), "pending");
  now = 100;
  assertEqual(read(key("g")), "first");
  assertEqual(read(key("x")), null);
  assertEqual([filterAction(key("Enter")), filterAction(key("Escape")), filterAction(key("a")), filterAction(key("Enter", { ctrlKey: true }))],
    ["list", "list", null, null]);
  assertTrue(FOLDER_BROWSER_KEYS.every((entry) => entry.help), "every key has its help");
});

// ---- the flow, on a fake API --------------------------------------------------------------

function fakeApp({ pick, attach = null, listings = {} }) {
  const calls = [];
  const said = [];
  const app = {
    tree: new NoteTree(NOTES),
    files: new Files(),
    changes: { send: (message) => calls.push(["send", message.what.join()]) },
    refreshTree: async () => calls.push(["refresh"]),
    say: (text) => said.push(text),
    focusNote: () => calls.push(["focusNote"]),
    filesApi: {
      pick: async (noteId) => {
        calls.push(["pick", noteId]);
        return pick;
      },
      attachPath: async (noteId, path) => {
        calls.push(["attachPath", noteId, path]);
        if (attach) return attach(noteId, path, calls);
        return { file: { id: 5, name: baseName(path) }, link: { file_id: 5, note_id: noteId } };
      },
      linkFolder: async (noteId, path) => {
        calls.push(["linkFolder", noteId, path]);
        return { folder: { id: 1, name: baseName(path) }, added: 1 };
      },
      browse: async (path = null) => {
        calls.push(["browse", path]);
        if (path === null) return { roots: ["/od"], folders: [] };
        if (!listings[path]) throw new ApiError(400, `"${path}" is not a folder on this computer`);
        return listings[path];
      },
    },
  };
  return { app, calls, said };
}

test("add file: a file picked in a linked folder is attached to the note, and the line says so", async () => {
  const { app, calls, said } = fakeApp({ pick: { path: "/od/Pilot/a.xlsx" } });
  await addFileDialog(app, app.tree.get(8));
  assertEqual(calls, [["pick", 2], ["attachPath", 8, "/od/Pilot/a.xlsx"], ["send", "files"], ["refresh"]],
    "the hub's dialog, the note's attachment");
  assertEqual(said, ['"a.xlsx" added']);
});

test("add file: a cancelled dialog changes nothing and says nothing", async () => {
  const { app, calls, said } = fakeApp({ pick: { path: null } });
  assertEqual(await addFileDialog(app, app.tree.get(2)), null);
  assertEqual(calls, [["pick", 2]]);
  assertEqual(said, []);
});

test("add file: a note in no hub is refused before any dialog", async () => {
  const { app, calls } = fakeApp({ pick: { path: null } });
  let message = "";
  try {
    await addFileDialog(app, app.tree.get(9));
  } catch (error) {
    message = error.message;
  }
  assertTrue(message.includes("is in no hub"), message);
  assertEqual(calls, []);
});

const notLinked = (folder) => (noteId, path, calls) => {
  if (!calls.some(([what]) => what === "linkFolder")) {
    return { file: null, link: null, folder };
  }
  return { file: { id: 6, name: baseName(path) }, link: { file_id: 6, note_id: noteId } };
};

test("add file: from a folder not linked yet, Link links the file's own folder to the hub, then attaches", async () => {
  const { app, calls, said } = fakeApp({ pick: { path: "/od/Other/Sub/c.pdf" }, attach: notLinked("/od/Other/Sub") });
  const done = addFileDialog(app, app.tree.get(8));
  await ticks();
  const dialog = document.querySelector("dialog.dialog");
  assertEqual(dialog.querySelector(".dialog__text").textContent, 'Link "/od/Other/Sub" to Pilot? Its files show under Files.');
  const link = [...dialog.querySelectorAll("button")].find((button) => button.textContent === "Link");
  link.click();
  await done;
  assertEqual(calls.filter(([what]) => !["send", "refresh", "focusNote"].includes(what)),
    [["pick", 2], ["attachPath", 8, "/od/Other/Sub/c.pdf"], ["linkFolder", 2, "/od/Other/Sub"], ["attachPath", 8, "/od/Other/Sub/c.pdf"]]);
  assertEqual(said, ['"c.pdf" added']);
});

test("add file: from a folder not linked yet, Cancel attaches nothing", async () => {
  const { app, calls, said } = fakeApp({ pick: { path: "/od/Other/c.pdf" }, attach: notLinked("/od/Other") });
  const done = addFileDialog(app, app.tree.get(2));
  await ticks();
  const dialog = document.querySelector("dialog.dialog");
  [...dialog.querySelectorAll("button")].find((button) => button.textContent === "Cancel").click();
  assertEqual(await done, null);
  assertEqual(calls.filter(([what]) => what !== "focusNote"), [["pick", 2], ["attachPath", 2, "/od/Other/c.pdf"]]);
  assertEqual(said, []);
});

const LISTINGS = {
  "/od/Pilot": { roots: ["/od"], path: "/od/Pilot", parent: "/od", folders: ["/od/Pilot/Design"],
    files: [{ name: "budget.xlsx", size: 2048, modified: "2026-11-20T09:00:00+00:00" }, { name: "agenda.docx", size: 10, modified: T }] },
  "/od/Pilot/Design": { roots: ["/od"], path: "/od/Pilot/Design", parent: "/od/Pilot", folders: [],
    files: [{ name: "sketch.png", size: 99, modified: T }] },
  "/od": { roots: ["/od"], path: "/od", parent: null, folders: ["/od/Pilot"], files: [] },
};

function withSectionFocus(body) {
  const before = document.createElement("button");
  before.textContent = "Files section";
  document.body.append(before);
  before.focus();
  return body(before).finally(() => before.remove());
}

const rowTitles = (dialog) => [...dialog.querySelectorAll("[role=option] .picker__title")].map((node) => node.textContent);
const selected = (dialog) => dialog.querySelector("[role=option][aria-selected=true] .picker__title")?.textContent;

test("folder browser: j/k and Enter go into a folder, h comes back, / filters, Enter on a file attaches it", () => withSectionFocus(async () => {
  const { app, calls, said } = fakeApp({ pick: { path: null, fallback: "browser", start: "/od/Pilot" }, listings: LISTINGS });
  const done = addFileDialog(app, app.tree.get(2));
  await ticks();
  const dialog = document.querySelector("dialog.folder-browser");
  assertTrue(dialog, "the browser opened");
  assertEqual(dialog.querySelector(".dialog__title").textContent, "Add a file to Pilot");
  assertEqual(dialog.querySelector(".folder-browser__path").textContent, "/od/Pilot");
  assertEqual(rowTitles(dialog), ["📁 Design", "agenda.docx", "budget.xlsx"]);
  assertEqual([...dialog.querySelectorAll(".folder-browser__keys .key")].map((cap) => cap.textContent), ["Enter", "h", "/", "Esc"],
    "its keys at the foot, in the shared caps");
  const list = dialog.querySelector("[role=listbox]");
  assertEqual(document.activeElement, list, "the list has the focus");
  list.dispatchEvent(key("j"));
  list.dispatchEvent(key("k"));
  assertEqual(selected(dialog), "📁 Design");
  list.dispatchEvent(key("Enter"));
  await ticks();
  assertEqual(dialog.querySelector(".folder-browser__path").textContent, "/od/Pilot/Design");
  assertEqual(rowTitles(dialog), ["sketch.png"]);
  list.dispatchEvent(key("h"));
  await ticks();
  assertEqual(dialog.querySelector(".folder-browser__path").textContent, "/od/Pilot");
  assertEqual(selected(dialog), "📁 Design", "back up on the folder it came from");
  list.dispatchEvent(key("G"));
  assertEqual(selected(dialog), "budget.xlsx");
  list.dispatchEvent(key("g"));
  list.dispatchEvent(key("g"));
  assertEqual(selected(dialog), "📁 Design");
  list.dispatchEvent(key("/"));
  const filter = dialog.querySelector(".folder-browser__filter");
  assertEqual(document.activeElement, filter, "/ goes to the filter");
  filter.value = "budg";
  filter.dispatchEvent(new Event("input"));
  assertEqual(rowTitles(dialog), ["budget.xlsx"]);
  filter.dispatchEvent(key("Enter"));
  assertEqual(document.activeElement, list, "Enter in the filter goes back to the list");
  list.dispatchEvent(key("/"));
  assertEqual([filter.selectionStart, filter.selectionEnd], [0, 4], "/ again selects the old filter: typing replaces it");
  filter.dispatchEvent(key("Enter"));
  list.dispatchEvent(key("Enter"));
  await done;
  assertTrue(!dialog.isConnected, "closed");
  assertEqual(calls.filter(([what]) => what === "attachPath"), [["attachPath", 2, "/od/Pilot/budget.xlsx"]]);
  assertEqual(said, ['"budget.xlsx" added']);
}));

test("folder browser: h at a root lists the roots; Esc cancels and the focus goes back", () => withSectionFocus(async (before) => {
  const { app, calls, said } = fakeApp({ pick: { path: null, fallback: "browser", start: "/od" }, listings: LISTINGS });
  const done = addFileDialog(app, app.tree.get(2));
  await ticks();
  const dialog = document.querySelector("dialog.folder-browser");
  const list = dialog.querySelector("[role=listbox]");
  assertEqual(rowTitles(dialog), ["📁 Pilot"]);
  list.dispatchEvent(key("Backspace"));
  await ticks();
  assertEqual(dialog.querySelector(".folder-browser__path").textContent, "OneDrive folders");
  assertEqual(rowTitles(dialog), ["📁 /od"]);
  list.dispatchEvent(key("Escape"));
  assertEqual(await done, null);
  assertTrue(!dialog.isConnected, "closed");
  assertEqual(document.activeElement, before, "the focus is back where it was");
  assertEqual(calls.filter(([what]) => what === "attachPath"), []);
  assertEqual(said, []);
}));

// A slow folder (OneDrive on the work PC): its answer is held until release() is called.
function slowBrowse(app, slowPath) {
  const fast = app.filesApi.browse;
  let release = null;
  app.filesApi.browse = (path = null) => path === slowPath
    ? new Promise((resolve) => { release = () => resolve(fast(path)); })
    : fast(path);
  return () => release();
}

test("folder browser: a filter typed while a folder loads keeps the focus and applies to it", () => withSectionFocus(async () => {
  const { app } = fakeApp({ pick: { path: null, fallback: "browser", start: "/od/Pilot" }, listings: LISTINGS });
  const release = slowBrowse(app, "/od/Pilot/Design");
  const done = addFileDialog(app, app.tree.get(2));
  await ticks();
  const dialog = document.querySelector("dialog.folder-browser");
  const list = dialog.querySelector("[role=listbox]");
  list.dispatchEvent(key("Enter"));
  list.dispatchEvent(key("/"));
  const filter = dialog.querySelector(".folder-browser__filter");
  filter.value = "sket";
  filter.dispatchEvent(new Event("input"));
  release();
  await ticks();
  assertEqual(dialog.querySelector(".folder-browser__path").textContent, "/od/Pilot/Design");
  assertEqual(document.activeElement, filter, "the filter keeps the focus");
  assertTrue(!filter.hidden, "and stays shown");
  assertEqual(rowTitles(dialog), ["sketch.png"], "its text filters the folder that arrived");
  filter.dispatchEvent(key("Escape"));
  list.dispatchEvent(key("Escape"));
  assertEqual(await done, null);
}));

test("folder browser: a slower listing for a folder left since is dropped", () => withSectionFocus(async () => {
  const { app } = fakeApp({ pick: { path: null, fallback: "browser", start: "/od/Pilot" }, listings: LISTINGS });
  const release = slowBrowse(app, "/od/Pilot/Design");
  const done = addFileDialog(app, app.tree.get(2));
  await ticks();
  const dialog = document.querySelector("dialog.folder-browser");
  const list = dialog.querySelector("[role=listbox]");
  list.dispatchEvent(key("Enter"));
  list.dispatchEvent(key("h"));
  await ticks();
  assertEqual(dialog.querySelector(".folder-browser__path").textContent, "/od");
  release();
  await ticks();
  assertEqual(dialog.querySelector(".folder-browser__path").textContent, "/od", "Design's late answer is not drawn");
  assertEqual(rowTitles(dialog), ["📁 Pilot"]);
  list.dispatchEvent(key("Escape"));
  assertEqual(await done, null);
}));

test("folder browser: a start folder it can't read opens on the roots", () => withSectionFocus(async () => {
  const { app } = fakeApp({ pick: { path: null, fallback: "browser", start: "/gone" }, listings: LISTINGS });
  const done = addFileDialog(app, app.tree.get(2));
  await ticks();
  const dialog = document.querySelector("dialog.folder-browser");
  assertEqual(rowTitles(dialog), ["📁 /od"]);
  assertTrue(dialog.querySelector(".dialog__error").textContent.includes("not a folder"), "the server's message shows");
  dialog.querySelector("[role=listbox]").dispatchEvent(key("Escape"));
  assertEqual(await done, null);
}));

test("files section: its heading's ··· button opens the section's menu (filled or empty)", () => {
  const page = document.createElement("main");
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  const asked = [];
  try {
    const hub = new HubPage({ page, line, section, onOpen() {}, onLeave() {},
      tabActions: { add() {}, row() {}, menu: (key, owner, anchor) => asked.push([key, owner.id, anchor.textContent]) } });
    const tree = new NoteTree(NOTES);
    hub.show({ tree, files: new Files() }, 2);
    section.querySelector(".hub__section--files [data-action=menu], .hub__empties [data-action=menu]").click();
    const files = new Files({ folders: [{ id: 1, note_id: 2, path: "/od/P", name: "P" }],
      files: [{ id: 1, folder_id: 1, rel_path: "a.txt", name: "a.txt", missing: false }], links: [{ file_id: 1, note_id: 2 }] });
    hub.show({ tree, files }, 2);
    const button = section.querySelector(".hub__section--files .hub__heading [data-action=menu]");
    assertEqual(button.getAttribute("aria-label"), "More file actions");
    button.click();
    assertEqual(asked, [["files", 2, "···"], ["files", 2, "···"]]);
  } finally {
    page.remove();
  }
});

test("files section: m on its heading or a row opens the ··· menu from the keyboard; elsewhere it does nothing", () => {
  const page = document.createElement("main");
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  const asked = [];
  try {
    const hub = new HubPage({ page, line, section, onOpen() {}, onLeave() {},
      tabActions: { add() {}, row() {}, menu: (key, owner, anchor) => asked.push([key, owner.id, anchor.dataset.action]) } });
    const files = new Files({ folders: [{ id: 1, note_id: 2, path: "/od/P", name: "P" }],
      files: [{ id: 1, folder_id: 1, rel_path: "a.txt", name: "a.txt", missing: false }], links: [{ file_id: 1, note_id: 2 }] });
    hub.show({ tree: new NoteTree(NOTES), files }, 2);
    const list = section.querySelector("[role=listbox]");
    const press = (key) => list.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    const goTo = (node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    goTo(section.querySelector(".hub__section--files .hub__label"));
    press("m");
    assertEqual(asked, [["files", 2, "menu"]]);
    // } to the next heading: another section's, which has no menu.
    press("}");
    assertTrue(!list.querySelector("[aria-selected=true]").closest(".hub__section--files"));
    press("m");
    assertEqual(asked.length, 1, "a section with no menu ignores m");
  } finally {
    page.remove();
  }
});

test("files section: m hands the menu a back() to the list; the active row stays on Files when it fills", () => {
  const page = document.createElement("main");
  const line = document.createElement("div");
  const section = document.createElement("section");
  page.append(line, section);
  document.body.append(page);
  let back = null;
  try {
    const hub = new HubPage({ page, line, section, onOpen() {}, onLeave() {},
      tabActions: { add() {}, row() {}, menu: (key, owner, anchor, toList) => { back = toList; } } });
    const tree = new NoteTree(NOTES);
    hub.show({ tree, files: new Files() }, 2);
    const list = section.querySelector("[role=listbox]");
    list.querySelector(".hub__empties [data-action=menu]").closest("[role=option]")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));
    document.body.focus();
    back();
    assertEqual(document.activeElement, list, "back() focuses the list");
    // Linking a folder fills the section: its empty item becomes a heading, still the active one.
    const files = new Files({ folders: [{ id: 1, note_id: 2, path: "/od/P", name: "P" }],
      files: [{ id: 1, folder_id: 1, rel_path: "a.txt", name: "a.txt", missing: false }], links: [] });
    hub.show({ tree, files }, 2);
    assertTrue(list.querySelector("[aria-selected=true]")?.closest(".hub__section--files"), "the Files section stays active");
  } finally {
    page.remove();
  }
});
