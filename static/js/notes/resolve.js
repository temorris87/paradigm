// Which note a [[wiki link]] (or :e, :parent) names, seen from the note it is written in. Pure.
//
// "Name" finds the nearest note called that: the current note's children, then its
// siblings, then the siblings of each ancestor up to the top level; failing all of those, a
// note with that title anywhere, if there is only one (live notes counted before archived ones). "A/B" finds A that way, then B under
// it. "/A/B" starts at the top level.
//
// resolveLink(tree, fromId, text) ->
//   { note }                                       found
//   { note: null, reason, create: { parentId, title } | null }
// create says where a note made from this link goes: beside the current note for "Name",
// under A for "A/B" (when A exists), at the top for "/Name". It is null when the link is
// ambiguous or more than its last part is missing.
import { isArchived } from "./hub-groups.js";
import { NoteTree } from "./tree-model.js";
import { normalTitle, titleKey } from "./titles.js";

export function resolveLink(tree, fromId, text) {
  const raw = String(text ?? "").trim();
  const absolute = raw.startsWith("/");
  const parts = raw.split("/").map(normalTitle);
  if (absolute) parts.shift();
  if (parts.length === 0 || parts.some((part) => part === "")) return missing("bad", null);

  const [first, ...rest] = parts;
  let note;
  if (absolute) {
    note = NoteTree.pick(tree.children(null), first);
    if (!note) return missing("none", rest.length ? null : { parentId: null, title: first });
  } else {
    const found = nearest(tree, fromId, first);
    if (found.ambiguous) return missing("ambiguous", null);
    note = found.note;
    const besideHere = tree.has(fromId) ? tree.parentId(fromId) : null;
    if (!note) return missing("none", rest.length ? null : { parentId: besideHere, title: first });
  }
  for (const [index, title] of rest.entries()) {
    const child = NoteTree.pick(tree.children(note.id), title);
    if (!child) return missing("none", index === rest.length - 1 ? { parentId: note.id, title } : null);
    note = child;
  }
  return { note };
}

function nearest(tree, fromId, title) {
  if (tree.has(fromId)) {
    const scopes = [tree.children(fromId), tree.siblings(fromId), ...tree.ancestors(fromId).map((id) => tree.siblings(id))];
    for (const scope of scopes) {
      const note = NoteTree.pick(scope, title);
      if (note) return { note };
    }
  } else {
    const note = NoteTree.pick(tree.children(null), title);
    if (note) return { note };
  }
  const key = titleKey(title);
  const all = [...tree.notes.values()].filter((note) => titleKey(note.title) === key);
  // An archived note with the same title as a live one doesn't make the link ambiguous.
  const live = all.filter((note) => !isArchived(tree, note.id));
  const anywhere = live.length ? live : all;
  if (anywhere.length > 1) return { note: null, ambiguous: true };
  return { note: anywhere[0] ?? null };
}

function missing(reason, create) {
  return { note: null, reason, create };
}

/** "Name#Heading" -> { link: "Name", heading: "Heading" } (the editor's link detail.target). */
export function splitTarget(target) {
  const at = String(target).indexOf("#");
  if (at < 0) return { link: String(target).trim(), heading: "" };
  return { link: target.slice(0, at).trim(), heading: target.slice(at + 1).trim() };
}
