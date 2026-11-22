// THE note menu: what the menu on the open note's crumb offers, for each kind of note. Pure:
// it says which items show and how they read; note-actions.js runs them.
//
//   noteMenuItems(tree, id) -> [{ key, label, ... } | { group } | "separator"]
//     keys: rename, move, newBeside, newUnder, file (with filing: a HUB_GROUPS entry, checked),
//           archive, restore (with top: the archived top-level note), export,
//           trash (with inside: how many notes go with it; disabled when it is the last)
import { HUB_GROUPS, groupForKind, isRecordKind, topNoteOf } from "./hub-groups.js";

export function noteMenuItems(tree, id) {
  const note = tree.get(id);
  if (!note) return [];
  const person = note.kind === "person";
  const nested = tree.parentId(id) !== null;
  const items = [{ key: "rename", label: "Rename…" }];
  if (!person) items.push({ key: "move", label: "Move…" });
  // A meeting, decision or question has no notes under it: its page holds its text.
  if (isRecordKind(note.kind)) items.push({ key: "newBeside", label: "New note in the hub…" });
  else items.push({ key: "newBeside", label: "New note beside…" }, { key: "newUnder", label: "New note under…" });
  if (!person && !isRecordKind(note.kind)) {
    items.push("separator", { group: "File as" });
    const current = nested ? null : groupForKind(note.kind);
    for (const group of HUB_GROUPS) {
      items.push({ key: "file", filing: group, label: group.label, checked: group === current,
        hint: nested ? "moves it to the top" : undefined });
    }
  }
  const top = topNoteOf(tree, id);
  items.push("separator");
  if (top.archived_at) items.push({ key: "restore", label: top.id === id ? "Restore" : `Restore "${top.title}"`, top });
  else if (!nested) items.push({ key: "archive", label: inside(tree, id) ? "Archive with the notes in it" : "Archive" });
  items.push({ key: "export", label: "Export as a web page" });
  const going = inside(tree, id);
  const last = tree.size <= going + 1;
  items.push("separator", { key: "trash", label: "Move to trash…", danger: true, inside: going, disabled: last,
    hint: last ? "the last note stays" : undefined });
  return items;
}

/** How many notes are under a note. */
export function inside(tree, id) {
  return tree.inOrder(id).length;
}
