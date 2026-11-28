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
  assertEqual(keys(1), "[Acme] logStatus | rename move newBeside newUnder insertTemplate insertTable dashboard | [File as] file file file file | archive export | trash",
    "a project's Log status… comes first");
  const checked = noteMenuItems(tree(), 1).filter((item) => item.checked).map((item) => item.label);
  assertEqual(checked.join(), "Project");
  assertEqual(noteMenuItems(tree(), 1).find((item) => item.key === "trash").inside, 3);
});

test("note menu: a person is never moved or filed; a meeting is never filed; nested notes are not archived", () => {
  assertEqual(keys(5), "rename editDetails newBeside newUnder insertTemplate insertTable dashboard | archive export | trash");
  assertEqual(noteMenuItems(tree(), 5).find((item) => item.key === "editDetails").label, "Edit details…",
    "a person's role, org and email are edited from the note menu");
  assertEqual(keys(2), "rename move newBeside insertTemplate insertTable dashboard | export | trash", "a meeting has no notes under it");
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
  assertEqual(moveTargets(tree(), 3).map((item) => item.id).join(), ",5,6,7", "top level first; not 1 (its parent), 2 (a meeting) or 4");
  assertEqual(moveTargets(tree(), 2).map((item) => item.id).join(), "6", "a meeting: only another hub");
  assertEqual(moveTargets(tree(), 1).map((item) => item.id).join(), "5,6,7", "a top-level note: no Top level row, nothing under it");
});

test("go to: every note with where it is; a meeting with its date", () => {
  const items = goToItems(tree(), { get: () => ({ day: "2026-11-24", time: "10:00" }) }, new Date(2026, 10, 22));
  assertEqual(items.length, 7);
  assertEqual(items.find((item) => item.id === 4).detail, "Projects › Acme › Budget");
  assertEqual(items.find((item) => item.id === 2).detail, "Meeting · next Tue 24 Nov 10:00 · Projects › Acme");
  assertEqual(items[items.length - 1].id, 2, "meetings, decisions and questions after the notes");
});

test("go to: a meeting series is one item, opening the next one", () => {
  const t = new NoteTree([...NOTES, { id: 30, parent_id: 1, title: "Kickoff", kind: "meeting" },
    { id: 31, parent_id: 1, title: "kickoff", kind: "meeting" }]);
  const days = { 2: "2026-11-10", 30: "2026-11-24", 31: "2026-12-01" };
  const items = goToItems(t, { get: (id) => ({ day: days[id], time: "09:00" }) }, new Date(2026, 10, 22));
  const kickoffs = items.filter((item) => item.title.toLowerCase() === "kickoff");
  assertEqual(kickoffs.length, 1);
  assertEqual(kickoffs[0].id, 30);
  assertEqual(kickoffs[0].detail, "Meeting · 3 · next Tue 24 Nov 09:00 · Projects › Acme");
  assertEqual(whereText(tree(), 1), "Projects");
});

test("trash: where a note goes back to, and what must come back first", async () => {
  const { trashRows, whereBack, blockedText } = await import("../../static/js/trash/trash-model.js");
  const entry = (more) => ({ id: 20, title: "Q3", kind: null, deleted_at: "2026-11-20T10:00:00.000Z",
    purge_at: "2026-11-27T10:00:00.000Z", inside: 0, parent_id: 3, parent_title: "Budget", parent_state: "live", ...more });
  assertEqual(whereBack(entry(), tree()), "back in Projects › Acme › Budget");
  assertEqual(whereBack(entry({ parent_state: "trashed" }), tree()), "was in Budget (in the Trash): back at the top");
  assertEqual(whereBack(entry({ parent_id: null, parent_state: null, kind: "project" }), tree()), "back in Projects");
  assertEqual(blockedText(entry({ kind: "meeting", parent_state: "trashed", parent_title: "Acme" })), "restore Acme first");
  assertEqual(blockedText(entry({ kind: "meeting" })), null);
  const rows = trashRows({ entries: [entry({ inside: 2 }), entry({ id: 21, title: "Other" })], days: 7 }, tree(), { title: "q" });
  assertEqual(rows.map((row) => `${row.title}|${row.inside}|${row.when}`).join(),
    "Q3|2 notes under it|trashed 20 Nov · gone for good 27 Nov");
});
