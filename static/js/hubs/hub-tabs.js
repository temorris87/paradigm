// THE table of the hub page's tabs: which tabs each kind of hub has, in order, and the rows
// each one lists. Later sections (people, meetings...) are new rows here. Pure.
//
//   tabsFor(hub)              the tabs for a hub note (Notes is always first)
//   tab.rows(tree, hub)       [{ id, title, depth, detail }] in the order shown
//   tab.empty(hub)            what the tab says when it has no rows
import { projectsIn } from "./hub-areas.js";

export const HUB_TABS = [
  {
    key: "notes",
    label: "Notes",
    kinds: ["project", "area", "resource"],
    rows: (tree, hub) => tree.inOrder(hub.id).map((note) => ({
      id: note.id,
      title: note.title,
      depth: tree.ancestors(note.id).length - 1,
      detail: dayOf(note.updated_at),
    })),
    empty: (hub) => `No notes in this ${hub.kind} yet (:child {title} makes one)`,
  },
  {
    key: "projects",
    label: "Projects",
    kinds: ["area"],
    rows: (tree, hub) => projectsIn(tree, hub.id).map((project) => {
      const inside = tree.inOrder(project.id);
      const latest = [project, ...inside].map((note) => note.updated_at ?? "").sort().pop();
      return { id: project.id, title: project.title, depth: 0, detail: `${countNotes(inside.length)} · ${dayOf(latest)}` };
    }),
    empty: () => "No projects in this area yet (:inarea {area} on a project puts it here)",
  },
];

export function tabsFor(hub) {
  return hub?.kind ? HUB_TABS.filter((tab) => tab.kinds.includes(hub.kind)) : [];
}

/** "2026-11-21": the local day of an ISO time ("" when there is none). */
export function dayOf(iso) {
  const when = iso ? new Date(iso) : null;
  if (!when || Number.isNaN(when.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

function countNotes(n) {
  return n === 1 ? "1 note" : `${n} notes`;
}
