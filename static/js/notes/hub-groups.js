// PARA hub groups: THE table of what a top-level note can be filed as, in the navigator's
// order (label names one of them: "a Project"). A note with no kind waits in the Inbox. Pure.
// Keep the kinds in step with paradigm/notes/hubs.py (HUB_KINDS).
export const HUB_GROUPS = [
  { key: "inbox", label: "Inbox", kind: null, heading: "Inbox", command: "inbox", asWhat: "in the Inbox" },
  { key: "project", label: "Project", kind: "project", heading: "Projects", command: "project", asWhat: "a project" },
  { key: "area", label: "Area", kind: "area", heading: "Areas", command: "area", asWhat: "an area" },
  { key: "resource", label: "Resource", kind: "resource", heading: "Resources", command: "resource", asWhat: "a resource" },
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

/** Whether a note is a hub: a top-level note filed as a project, an area or a resource. */
export function isHub(tree, id) {
  const note = tree.get(id);
  return Boolean(note?.kind) && tree.parentId(id) === null;
}
