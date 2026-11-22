// The note menu table (static/js/notes/note-menu.js) and the pickers' lists (note-actions.js).
import { goToItems, moveTargets, whereText } from "../../static/js/notes/note-actions.js";
import { noteMenuItems } from "../../static/js/notes/note-menu.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, test } from "./harness.js";

const NOTES = [
  { id: 1, parent_id: null, title: "Acme", kind: "project" },
  { id: 2, parent_id: 1, title: "Kickoff", kind: "meeting" },
  { id: 3, parent_id: 1, title: "Budget" },
  { id: 4, parent_id: 3, title: "Q1" },
  { id: 5, parent_id: null, title: "Jane Doe", kind: "person" },
  { id: 6, parent_id: null, title: "Old", kind: "area", archived_at: "2026-11-01T00:00:00Z" },
  { id: 7, parent_id: 6, title: "Inside" },
];
const tree = () => new NoteTree(NOTES);
const keys = (id) => noteMenuItems(tree(), id).map((item) => (item === "separator" ? "|" : item.key ?? `[${item.group}]`)).join(" ");

test("note menu: a hub can be renamed, moved, filed, archived, exported and trashed", () => {
  assertEqual(keys(1), "rename move newBeside newUnder | [File as] file file file file | archive export | trash");
  const checked = noteMenuItems(tree(), 1).filter((item) => item.checked).map((item) => item.label);
  assertEqual(checked.join(), "Project");
  assertEqual(noteMenuItems(tree(), 1).find((item) => item.key === "trash").inside, 3);
});

test("note menu: a person is never moved or filed; a meeting is never filed; nested notes are not archived", () => {
  assertEqual(keys(5), "rename newBeside newUnder | archive export | trash");
  assertEqual(keys(2), "rename move newBeside newUnder | export | trash");
  assertEqual(keys(3).includes("archive"), false);
  const file = noteMenuItems(tree(), 3).filter((item) => item.key === "file");
  assertEqual(file.some((item) => item.checked), false, "a nested note is in no group itself");
  assertEqual(file[0].hint, "moves it to the top");
});

test("note menu: inside an archived hub, Restore names the hub", () => {
  const restore = noteMenuItems(tree(), 7).find((item) => item.key === "restore");
  assertEqual(restore.label, 'Restore "Old"');
  assertEqual(noteMenuItems(tree(), 6).find((item) => item.key === "restore").label, "Restore");
});

test("note menu: the last note can't be trashed", () => {
  const one = new NoteTree([{ id: 1, parent_id: null, title: "Only" }]);
  const trash = noteMenuItems(one, 1).find((item) => item.key === "trash");
  assertEqual(trash.disabled, true);
});

test("move picker: never itself, under itself or its own parent; records stay in hubs", () => {
  assertEqual(moveTargets(tree(), 3).map((item) => item.id).join(), ",2,5,6,7", "top level first; not 1 (its parent) or 4");
  assertEqual(moveTargets(tree(), 2).map((item) => item.id).join(), "3,4,6,7", "a meeting: only notes inside hubs");
  assertEqual(moveTargets(tree(), 1).map((item) => item.id).join(), "5,6,7", "a top-level note: no Top level row, nothing under it");
});

test("go to: every note with where it is", () => {
  const items = goToItems(tree());
  assertEqual(items.length, 7);
  assertEqual(items.find((item) => item.id === 4).detail, "Projects › Acme › Budget");
  assertEqual(whereText(tree(), 1), "Projects");
});
