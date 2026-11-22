// PARA hub groups: THE table of what a top-level note can be filed as, in the navigator's
// order (label names one of them: "a Project"). A note with no kind waits in the Inbox. Pure.
// Keep the kinds in step with paradigm/notes/hubs.py (HUB_KINDS).
//
// Archived hubs (archived_at set on the top-level note) leave their group for the Archive,
// which the navigator shows last and folded until it is opened. A hub keeps its kind there,
// so restoring it puts it back in its group.
export const HUB_GROUPS = [
  { key: "inbox", label: "Inbox", kind: null, heading: "Inbox", command: "inbox", asWhat: "in the Inbox" },
  { key: "project", label: "Project", kind: "project", heading: "Projects", command: "project", asWhat: "a project" },
  { key: "area", label: "Area", kind: "area", heading: "Areas", command: "area", asWhat: "an area" },
  { key: "resource", label: "Resource", kind: "resource", heading: "Resources", command: "resource", asWhat: "a resource" },
];

export const ARCHIVE_GROUP = { key: "archive", heading: "Archive", foldedByDefault: true };

/** Every group the navigator shows, in order. */
export const NAV_GROUPS = [...HUB_GROUPS, ARCHIVE_GROUP];

export function groupForKind(kind) {
  return HUB_GROUPS.find((group) => group.kind === (kind ?? null)) ?? HUB_GROUPS[0];
}

/** The group a note is in: its top-level ancestor's (or its own, at the top). */
export function groupOf(tree, id) {
  if (!tree.has(id)) return null;
  const top = tree.path(id)[0];
  return top.archived_at ? ARCHIVE_GROUP : groupForKind(top.kind);
}

/** The top-level notes in a group, sorted by title (the archived ones only in the Archive). */
export function hubsIn(tree, group) {
  const archive = group === ARCHIVE_GROUP;
  return tree.children(null).filter((note) =>
    Boolean(note.archived_at) === archive && (archive || groupForKind(note.kind) === group));
}

/** The top-level note holding a note (the note itself at the top), or null. */
export function topNoteOf(tree, id) {
  return tree.has(id) ? tree.path(id)[0] : null;
}

/** Whether a note is archived: its top-level note is. */
export function isArchived(tree, id) {
  return Boolean(topNoteOf(tree, id)?.archived_at);
}

/** Whether a note is a hub: a top-level note filed as a project, an area or a resource. */
export function isHub(tree, id) {
  const note = tree.get(id);
  return Boolean(note?.kind) && tree.parentId(id) === null;
}
