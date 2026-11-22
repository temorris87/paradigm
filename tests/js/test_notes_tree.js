// The note hierarchy (pure) and the sidebar tree in a real page, with its keys.
import { TREE_KEYS, treeAction } from "../../static/js/notes/tree-keys.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { TreeView } from "../../static/js/notes/tree-view.js";
import { showBreadcrumb } from "../../static/js/notes/breadcrumb.js";
import { ARCHIVE_GROUP, HUB_GROUPS, groupOf, hubsIn, isArchived } from "../../static/js/notes/hub-groups.js";
import { NOTE_COMMANDS, runNoteCommand } from "../../static/js/notes/commands.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const NOTES = [
  { id: 1, parent_id: null, title: "projects" },
  { id: 2, parent_id: 1, title: "Northwind" },
  { id: 3, parent_id: 1, title: "acme" },
  { id: 4, parent_id: 3, title: "Kickoff" },
  { id: 5, parent_id: null, title: "Inbox" },
];

test("tree model: children sorted by title, ignoring case", () => {
  const tree = new NoteTree(NOTES);
  assertEqual(tree.children(null).map((n) => n.id).join(), "5,1");
  assertEqual(tree.children(1).map((n) => n.title).join(), "acme,Northwind");
  assertEqual(tree.children(4).length, 0);
});

test("tree model: ancestors, path and pathText", () => {
  const tree = new NoteTree(NOTES);
  assertEqual(tree.ancestors(4).join(), "3,1");
  assertEqual(tree.path(4).map((n) => n.id).join(), "1,3,4");
  assertEqual(tree.pathText(4), "/projects/acme/Kickoff");
  assertEqual(tree.inOrder().map((n) => n.id).join(), "5,1,3,4,2");
});

test("tree model: a note whose parent is missing shows at the top", () => {
  const tree = new NoteTree([{ id: 1, parent_id: 99, title: "Lost" }]);
  assertEqual(tree.children(null).map((n) => n.id).join(), "1");
  assertEqual(tree.ancestors(1).length, 0);
});

test("tree keys: one table, modifiers left to the browser", () => {
  const all = TREE_KEYS.flatMap((entry) => entry.keys);
  assertEqual(new Set(all).size, all.length, "no key bound twice");
  assertTrue(!all.includes("Tab"), "Tab is never bound");
  assertEqual(treeAction({ key: "j" }), "next");
  assertEqual(treeAction({ key: "j", ctrlKey: true }), null);
  assertEqual(treeAction({ key: "x" }), null);
});

const STORE = ["paradigm.tree.expanded", "paradigm.tree.foldedGroups", "paradigm.tree.unfoldedGroups"];

function withTree(body) {
  STORE.forEach((key) => localStorage.removeItem(key));
  const ul = document.createElement("ul");
  document.body.append(ul);
  const opened = [];
  let left = 0;
  const view = new TreeView(ul, { onOpen: (id) => opened.push(id), onLeave: () => { left += 1; } });
  try {
    body({ ul, view, opened, left: () => left });
  } finally {
    ul.remove();
    STORE.forEach((key) => localStorage.removeItem(key));
  }
}

const press = (ul, key) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const titles = (ul) => [...ul.querySelectorAll(".tree__title")].map((node) => node.textContent).join(",");
const focusedId = () => Number(document.activeElement.dataset.id);
const focusedGroup = () => document.activeElement.dataset.group;
const headings = (ul) => [...ul.querySelectorAll(".tree__item--group > .tree__row")].map((row) => row.textContent).join(",");

test("tree view: the open note's ancestors are expanded and it is selected", () => withTree(({ ul, view }) => {
  view.show(new NoteTree(NOTES), 4);
  assertEqual(titles(ul), "Inbox,projects,acme,Kickoff,Northwind");
  assertEqual(ul.querySelector('[aria-selected="true"]').dataset.id, "4");
  assertEqual(ul.querySelectorAll('[tabindex="0"]').length, 1);
  assertEqual(ul.querySelector('[data-id="1"]').getAttribute("aria-expanded"), "true");
  assertEqual(ul.querySelector('[data-id="5"]').hasAttribute("aria-expanded"), false);
}));

test("tree view: the open note moved under a closed branch is shown", () => withTree(({ ul, view }) => {
  view.show(new NoteTree(NOTES), 5);
  assertEqual(titles(ul), "Inbox,projects");
  const moved = NOTES.map((note) => (note.id === 5 ? { ...note, parent_id: 3 } : note));
  view.show(new NoteTree(moved), 5);
  assertEqual(titles(ul), "projects,acme,Inbox,Kickoff,Northwind");
}));

test("tree view: j k move, h l close and open, Enter opens, Escape leaves", () => withTree(({ ul, view, opened, left }) => {
  view.show(new NoteTree(NOTES), 5);
  view.focus();
  assertEqual(titles(ul), "Inbox,projects");
  press(ul, "j");
  assertEqual(focusedId(), 1);
  press(ul, "l");
  assertEqual(titles(ul), "Inbox,projects,acme,Northwind", "l opens the branch");
  press(ul, "l");
  assertEqual(focusedId(), 3, "l again goes to the first child");
  press(ul, "h");
  assertEqual(focusedId(), 1, "h on a closed branch goes to the parent");
  press(ul, "h");
  assertEqual(titles(ul), "Inbox,projects", "h closes the branch");
  press(ul, "k");
  assertEqual(focusedId(), 5);
  press(ul, "k");
  assertEqual(focusedGroup(), "inbox", "k reaches the group heading");
  press(ul, "k");
  assertEqual(focusedGroup(), "inbox", "stops at the top");
  press(ul, "G");
  assertEqual(focusedGroup(), "archive", "G: the last group (the Archive)");
  press(ul, "g");
  press(ul, "j");
  press(ul, "j");
  assertEqual(focusedId(), 1);
  press(ul, "Enter");
  assertEqual(opened.join(), "1");
  press(ul, "Escape");
  assertEqual(left(), 1);
}));

test("tree view: clicking a title opens, clicking the arrow folds", () => withTree(({ ul, view, opened }) => {
  view.show(new NoteTree(NOTES), 5);
  ul.querySelector('[data-id="1"] .tree__twisty').click();
  assertEqual(titles(ul), "Inbox,projects,acme,Northwind");
  assertEqual(opened.length, 0);
  ul.querySelector('[data-id="2"] .tree__title').click();
  assertEqual(opened.join(), "2");
}));

test("breadcrumb: ancestors are buttons, the note itself is not", () => {
  const nav = document.createElement("nav");
  const opened = [];
  showBreadcrumb(nav, new NoteTree(NOTES), 4, (id) => opened.push(id));
  assertEqual(nav.textContent, "Inbox›projects›acme›Kickoff");
  assertEqual(nav.querySelector(".crumbs__group").tagName, "SPAN", "the group is plain text");
  const buttons = nav.querySelectorAll("button");
  assertEqual(buttons.length, 2);
  buttons[1].click();
  assertEqual(opened.join(), "3");
  assertEqual(nav.querySelector("[aria-current]").textContent, "Kickoff");
});

const FILED = [
  { id: 1, parent_id: null, title: "Acme", kind: "project" },
  { id: 2, parent_id: 1, title: "Kickoff", kind: null },
  { id: 3, parent_id: null, title: "Welcome", kind: null },
  { id: 4, parent_id: null, title: "Health", kind: "area" },
  { id: 5, parent_id: null, title: "Beta", kind: "project" },
];

test("hub groups: four in order, notes grouped by their top-level note", () => {
  assertEqual(HUB_GROUPS.map((group) => group.heading).join(), "Inbox,Projects,Areas,Resources");
  const tree = new NoteTree(FILED);
  assertEqual(groupOf(tree, 2).key, "project", "a nested note is in its hub's group");
  assertEqual(groupOf(tree, 3).key, "inbox");
  assertEqual(groupOf(tree, 99), null);
  assertEqual(hubsIn(tree, HUB_GROUPS[1]).map((note) => note.title).join(), "Acme,Beta");
  assertEqual(hubsIn(tree, HUB_GROUPS[3]).length, 0);
});

test("tree view: groups with counts, hubs under them, empty ones marked", () => withTree(({ ul, view }) => {
  view.show(new NoteTree(FILED), 3);
  assertEqual(headings(ul), "▾Inbox1,▾Projects2,▾Areas1,Resources0,Archive0");
  assertEqual(titles(ul), "Welcome,Acme,Beta,Health");
  assertTrue(ul.querySelector('[data-group="resource"]').classList.contains("tree__item--empty"));
  assertEqual(ul.querySelector('[data-id="1"]').getAttribute("aria-level"), "2");
}));

test("tree view: h l fold a group, Enter toggles it, folding is remembered", () => withTree(({ ul, view, opened }) => {
  const tree = new NoteTree(FILED);
  view.show(tree, 3);
  view.focus();
  press(ul, "j");
  assertEqual(focusedGroup(), "project");
  press(ul, "h");
  assertEqual(titles(ul), "Welcome,Health", "h folds the group");
  press(ul, "l");
  assertEqual(titles(ul), "Welcome,Acme,Beta,Health", "l unfolds it");
  press(ul, "l");
  assertEqual(focusedId(), 1, "l again goes to the first hub");
  press(ul, "h");
  assertEqual(focusedGroup(), "project", "h on a hub goes to its group");
  press(ul, "Enter");
  assertEqual(titles(ul), "Welcome,Health", "Enter on a group folds it");
  assertEqual(opened.length, 0, "and opens nothing");
  const again = new TreeView(document.createElement("ul"), { onOpen() {}, onLeave() {} });
  again.show(tree, 3);
  assertEqual(titles(again.root), "Welcome,Health", "remembered");
  view.show(tree, 2);
  assertEqual(titles(ul), "Welcome,Acme,Kickoff,Beta,Health", "opening a note in a folded group unfolds it");
}));

test("tree view: a click on a group heading folds it", () => withTree(({ ul, view, opened }) => {
  view.show(new NoteTree(FILED), 3);
  ul.querySelector('[data-group="area"] .tree__heading').click();
  assertEqual(titles(ul), "Welcome,Acme,Beta");
  assertEqual(opened.length, 0);
}));

test("tree view: a note filed elsewhere is shown in its new group", () => withTree(({ ul, view }) => {
  view.show(new NoteTree(FILED), 3);
  view.setOpen("group:area", false);
  const moved = FILED.map((note) => (note.id === 3 ? { ...note, kind: "area" } : note));
  view.show(new NoteTree(moved), 3);
  assertEqual(titles(ul), "Acme,Beta,Health,Welcome");
}));

test("breadcrumb: a project's note starts with Projects", () => {
  const nav = document.createElement("nav");
  showBreadcrumb(nav, new NoteTree(FILED), 2, () => {});
  assertEqual(nav.textContent, "Projects›Acme›Kickoff");
});

test("note commands: :project :area :resource :inbox, typed in full", () => {
  for (const group of HUB_GROUPS) {
    const command = NOTE_COMMANDS.find((each) => each.name === group.command);
    assertEqual(command.min, group.command.length, group.command);
    let filed = null;
    runNoteCommand({ kindCommand: (to) => { filed = to; } }, { name: group.command });
    assertEqual(filed, group);
  }
});

const ARCHIVED = [
  ...FILED,
  { id: 6, parent_id: null, title: "Gamma", kind: "project", archived_at: "2026-11-21T00:00:00Z" },
  { id: 7, parent_id: 6, title: "Wrap-up" },
  { id: 8, parent_id: null, title: "Scratch", kind: null, archived_at: "2026-11-21T00:00:00Z" },
];

test("hub groups: an archived hub and its notes are in the Archive, not their group", () => {
  const tree = new NoteTree(ARCHIVED);
  assertEqual(groupOf(tree, 6), ARCHIVE_GROUP);
  assertEqual(groupOf(tree, 7), ARCHIVE_GROUP, "a note inside it too");
  assertEqual(isArchived(tree, 7), true);
  assertEqual(isArchived(tree, 2), false);
  assertEqual(hubsIn(tree, HUB_GROUPS[1]).map((note) => note.title).join(), "Acme,Beta");
  assertEqual(hubsIn(tree, HUB_GROUPS[0]).map((note) => note.title).join(), "Welcome");
  assertEqual(hubsIn(tree, ARCHIVE_GROUP).map((note) => note.title).join(), "Gamma,Scratch");
});

test("tree view: the Archive is last, folded by default, its hubs labelled with their kind", () => withTree(({ ul, view }) => {
  const tree = new NoteTree(ARCHIVED);
  view.show(tree, 3);
  assertEqual(headings(ul), "▾Inbox1,▾Projects2,▾Areas1,Resources0,▸Archive2");
  assertEqual(titles(ul), "Welcome,Acme,Beta,Health", "folded");
  view.setOpen("group:archive", true);
  assertEqual(titles(ul), "Welcome,Acme,Beta,Health,Gamma,Scratch");
  assertEqual([...ul.querySelectorAll(".tree__kind")].map((n) => n.textContent).join(), "Project,Inbox");
  const again = new TreeView(document.createElement("ul"), { onOpen() {}, onLeave() {} });
  again.show(tree, 3);
  assertEqual(titles(again.root), "Welcome,Acme,Beta,Health,Gamma,Scratch", "unfolding is remembered");
  view.setOpen("group:archive", false);
  const third = new TreeView(document.createElement("ul"), { onOpen() {}, onLeave() {} });
  third.show(tree, 3);
  assertEqual(titles(third.root), "Welcome,Acme,Beta,Health", "and folding again");
}));

test("tree view: opening an archived note unfolds the Archive", () => withTree(({ ul, view }) => {
  view.show(new NoteTree(ARCHIVED), 7);
  assertEqual(titles(ul), "Welcome,Acme,Beta,Health,Gamma,Wrap-up,Scratch");
}));

test("breadcrumb: an archived note starts with Archive", () => {
  const nav = document.createElement("nav");
  showBreadcrumb(nav, new NoteTree(ARCHIVED), 7, () => {});
  assertEqual(nav.textContent, "Archive›Gamma›Wrap-up");
});

test("note commands: :arch[ive] and :resto[re]", () => {
  const calls = [];
  const app = { archiveCommand: () => calls.push("archive"), restoreCommand: () => calls.push("restore") };
  runNoteCommand(app, { name: "archive" });
  runNoteCommand(app, { name: "restore" });
  assertEqual(calls.join(), "archive,restore");
  assertEqual(NOTE_COMMANDS.find((c) => c.name === "archive").min, 4);
  assertEqual(NOTE_COMMANDS.find((c) => c.name === "restore").min, 5);
});
