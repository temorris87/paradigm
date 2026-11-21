// The note hierarchy (pure) and the sidebar tree in a real page, with its keys.
import { TREE_KEYS, treeAction } from "../../static/js/notes/tree-keys.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { TreeView } from "../../static/js/notes/tree-view.js";
import { showBreadcrumb } from "../../static/js/notes/breadcrumb.js";
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

function withTree(body) {
  localStorage.removeItem("paradigm.tree.expanded");
  const ul = document.createElement("ul");
  document.body.append(ul);
  const opened = [];
  let left = 0;
  const view = new TreeView(ul, { onOpen: (id) => opened.push(id), onLeave: () => { left += 1; } });
  try {
    body({ ul, view, opened, left: () => left });
  } finally {
    ul.remove();
    localStorage.removeItem("paradigm.tree.expanded");
  }
}

const press = (ul, key) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const titles = (ul) => [...ul.querySelectorAll(".tree__title")].map((node) => node.textContent).join(",");
const focusedId = () => Number(document.activeElement.dataset.id);

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
  assertEqual(focusedId(), 5, "stops at the top");
  press(ul, "G");
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
  assertEqual(nav.textContent, "projects›acme›Kickoff");
  const buttons = nav.querySelectorAll("button");
  assertEqual(buttons.length, 2);
  buttons[1].click();
  assertEqual(opened.join(), "3");
  assertEqual(nav.querySelector("[aria-current]").textContent, "Kickoff");
});
