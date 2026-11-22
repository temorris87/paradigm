// THE note menu: what the menu on the open note's crumb offers, for each kind of note. Pure:
// it says which items show and how they read; note-actions.js runs them.
//
//   noteMenuItems(tree, id, { window }) -> [{ key, label, ... } | { group } | "separator"]
//     keys: rename, move, newBeside, newUnder, file (with filing: a HUB_GROUPS entry, checked),
//           insertTemplate (the note window: a template's text at the cursor), makePhase (a plain
//           note directly in a project), unmakePhase (a phase back to a plain note), dashboard
//           (the note window: its hub's dashboard in the main window),
//           archive, restore (with top: the archived top-level note), export,
//           trash (with inside: how many notes go with it; disabled when it is the last)
import { HUB_GROUPS, groupForKind, isRecordKind, topNoteOf } from "./hub-groups.js";

export function noteMenuItems(tree, id, { window = "note" } = {}) {
  const note = tree.get(id);
  if (!note) return [];
  const person = note.kind === "person";
  const template = note.kind === "template";
  const nested = tree.parentId(id) !== null;
  const items = [{ key: "rename", label: "Rename…" }];
  if (!person && !template) items.push({ key: "move", label: "Move…" });
  // A meeting, decision or question has no notes under it: its page holds its text.
  if (isRecordKind(note.kind)) items.push({ key: "newBeside", label: "New note in the hub…" });
  else if (!template) items.push({ key: "newBeside", label: "New note beside…" }, { key: "newUnder", label: "New note under…" });
  if (window === "note" && !template) items.push({ key: "insertTemplate", label: "Insert template…" });
  const parent = tree.get(tree.parentId(id));
  if (!note.kind && parent?.kind === "project" && tree.parentId(parent.id) === null) {
    items.push({ key: "makePhase", label: "Make it a phase…" });
  }
  if (note.kind === "phase") items.push({ key: "unmakePhase", label: "Make it a plain note" });
  if (window === "note" && !template) items.push({ key: "dashboard", label: "Show on the dashboard" });
  if (!person && !template && !isRecordKind(note.kind) && note.kind !== "phase") {
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
  else if (!nested && !template) items.push({ key: "archive", label: inside(tree, id) ? "Archive with the notes in it" : "Archive" });
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
