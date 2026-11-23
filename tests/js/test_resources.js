// Resources as notes in folders: the folders model, the tree's folder rows, the pickers.
import { Folders, countIn, folderOf, notesIn } from "../../static/js/resources/folders-model.js";
import { folderTargets } from "../../static/js/resources/folder-commands.js";
import { noteMenuItems } from "../../static/js/notes/note-menu.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { TreeView, addLabel } from "../../static/js/notes/tree-view.js";
import { HUB_GROUPS } from "../../static/js/notes/hub-groups.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const FOLDERS = [
  { id: 1, parent_id: null, title: "Standards" },
  { id: 2, parent_id: 1, title: "Electrical" },
  { id: 3, parent_id: null, title: "Archive docs" },
];
const NOTES = [
  { id: 10, parent_id: null, title: "Welcome" },
  { id: 11, parent_id: null, title: "Cable sizing", kind: "resource", folder_id: 2 },
  { id: 12, parent_id: 11, title: "Copper" },
  { id: 13, parent_id: null, title: "Useful commands", kind: "resource", folder_id: null },
  { id: 14, parent_id: null, title: "Old manual", kind: "resource", folder_id: 3, archived_at: "2026-11-01T00:00:00Z" },
  { id: 15, parent_id: null, title: "Lost", kind: "resource", folder_id: 99 },
];
const folders = () => new Folders(FOLDERS);
const tree = () => new NoteTree(NOTES);

test("folders: children by title, paths, what is inside", () => {
  const f = folders();
  assertEqual(f.children(null).map((each) => each.title).join(), "Archive docs,Standards");
  assertEqual(f.path(2).map((each) => each.title).join(), "Standards,Electrical");
  assertEqual(f.inside(1).join(), "1,2");
  assertEqual(f.inOrder().map(({ folder, depth }) => `${folder.title}:${depth}`).join(), "Archive docs:0,Standards:0,Electrical:1");
});

test("folders: the notes in a folder; a note's folder is its top note's", () => {
  const t = tree();
  const f = folders();
  assertEqual(notesIn(t, f, 2).map((n) => n.title).join(), "Cable sizing");
  assertEqual(notesIn(t, f, null).map((n) => n.title).join(), "Lost,Useful commands", "a folder that is gone: the top");
  assertEqual(notesIn(t, f, 3).length, 0, "archived ones are in the Archive");
  assertEqual(folderOf(t, f, 12), 2, "a note under a resource is in its folder");
  assertEqual(folderOf(t, f, 10), null);
  assertEqual(countIn(t, f, 1), 1, "its folders' notes count");
});

test("folders: the picker lists the top, then folders, never into itself", () => {
  const items = folderTargets(folders(), { except: 1 });
  assertEqual(items.map((item) => item.title).join(), "Resources,Archive docs");
  assertEqual(folderTargets(folders()).find((item) => item.id === 2).detail, "Resources › Standards");
});

test("folders: a resource's menu can move it to a folder; Resources' + makes a note or folder", () => {
  const keys = (id) => noteMenuItems(tree(), id).map((item) => item.key).filter(Boolean);
  assertTrue(keys(13).includes("moveToFolder"));
  assertTrue(!keys(12).includes("moveToFolder"), "a note under a resource moves with it");
  assertTrue(!keys(10).includes("moveToFolder"));
  assertEqual(addLabel(HUB_GROUPS.find((group) => group.key === "resource")), "New note or folder");
});

const STORE = ["paradigm.tree.expanded", "paradigm.tree.foldedGroups", "paradigm.tree.unfoldedGroups", "paradigm.tree.openFolders"];

function withTree(body) {
  STORE.forEach((key) => localStorage.removeItem(key));
  const ul = document.createElement("ul");
  document.body.append(ul);
  const calls = [];
  const view = new TreeView(ul, { onOpen: (id) => calls.push(`open ${id}`), onLeave() {},
    onOpenFolder: (id) => calls.push(`folder ${id}`), onAddInFolder: (id) => calls.push(`add in ${id}`) });
  try {
    body({ ul, view, calls });
  } finally {
    ul.remove();
    STORE.forEach((key) => localStorage.removeItem(key));
  }
}

const shown = (ul) => [...ul.querySelector('[data-group="resource"]').querySelectorAll(".tree__title")].map((n) => n.textContent).join(",");
const press = (key) => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

test("tree: Resources shows its folders, then the notes in none; opening a note opens its folders", () => withTree(({ ul, view }) => {
  view.show(tree(), 10, { folders: folders() });
  assertEqual(shown(ul), "Archive docs,Standards,Lost,Useful commands", "folders closed");
  view.show(tree(), 12, { folders: folders() });
  assertEqual(shown(ul), "Archive docs,Standards,Electrical,Cable sizing,Copper,Lost,Useful commands");
  assertEqual(ul.querySelector('[data-group="resource"] .tree__count').textContent, "3", "the count is its notes");
}));

test("tree: a folder's keys: l/h fold, Enter opens its page, a adds in it, h from a note goes to its folder", () => withTree(({ ul, view, calls }) => {
  view.show(tree(), 11, { folders: folders() });
  view.moveTo(11);
  press("h");
  assertEqual(document.activeElement.dataset.folder, "2", "from a note in a folder, h goes to the folder");
  press("h");
  assertEqual(shown(ul), "Archive docs,Standards,Electrical,Lost,Useful commands", "h folds it");
  press("l");
  assertEqual(shown(ul), "Archive docs,Standards,Electrical,Cable sizing,Lost,Useful commands");
  press("Enter");
  press("a");
  assertEqual(calls.join("|"), "folder 2|add in 2");
  press("k");
  press("k");
  assertEqual(document.activeElement.dataset.folder, "3");
  press("h");
  assertEqual(document.activeElement.dataset.group, "resource", "a top folder's parent is Resources");
  ul.querySelector('[data-folder="1"] .tree__title').click();
  assertEqual(calls.at(-1), "folder 1", "a click on the name opens its page");
}));
