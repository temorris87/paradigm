// PARA hub groups: THE table of what a top-level note can be filed as, in the navigator's
// order. A note with no kind waits in the Inbox. Pure.
// Keep the kinds in step with paradigm/notes/hubs.py (HUB_KINDS).
export const HUB_GROUPS = [
  { key: "inbox", kind: null, heading: "Inbox", command: "inbox", asWhat: "in the Inbox" },
  { key: "project", kind: "project", heading: "Projects", command: "project", asWhat: "a project" },
  { key: "area", kind: "area", heading: "Areas", command: "area", asWhat: "an area" },
  { key: "resource", kind: "resource", heading: "Resources", command: "resource", asWhat: "a resource" },
];

export function groupForKind(kind) {
  return HUB_GROUPS.find((group) => group.kind === (kind ?? null)) ?? HUB_GROUPS[0];
}

/** The group a note is in: its top-level ancestor's (or its own, at the top). */
export function groupOf(tree, id) {
  if (!tree.has(id)) return null;
  return groupForKind(tree.path(id)[0].kind);
}

/** The top-level notes filed in a group, sorted by title. */
export function hubsIn(tree, group) {
  return tree.children(null).filter((note) => groupForKind(note.kind) === group);
}
