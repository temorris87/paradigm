// THE table of the panel's tabs on a hub page (and on a person's page): which tabs each kind
// has, in order, and the rows each one lists. Later sections (meetings...) are new rows
// here. Pure.
//
//   tabsFor(note)             the tabs for a hub or person note (Notes is always first)
//   tab.rows(ctx, note)       [{ id, title, depth, detail, muted? }] in the order shown;
//                             ctx: { tree, people } (people: static/js/people/people-model.js)
//   tab.empty(note)           what the tab says when it has no rows
import { archivedProjectsIn, projectsIn } from "./hub-areas.js";
import { groupForKind } from "../notes/hub-groups.js";
import { hubLinks, peopleOn, rolesText, workText } from "../people/people-model.js";

const PARA = ["project", "area", "resource"];

export const HUB_TABS = [
  {
    key: "notes",
    label: "Notes",
    kinds: [...PARA, "person"],
    rows: ({ tree }, hub) => tree.inOrder(hub.id).map((note) => ({
      id: note.id,
      title: note.title,
      depth: tree.ancestors(note.id).length - 1,
      detail: dayOf(note.updated_at),
    })),
    empty: (hub) => hub.kind === "person"
      ? `No notes under ${hub.title} yet (:child {title} makes one)`
      : `No notes in this ${hub.kind} yet (:child {title} makes one)`,
  },
  {
    key: "people",
    label: "People",
    kinds: PARA,
    // An area lists the people on its projects too. Archived people come last, muted.
    rows: ({ tree, people }, hub) => peopleOn(tree, people, hub).map(({ person, roles, archived }) => ({
      id: person.id,
      title: person.title,
      depth: 0,
      detail: [rolesText(roles), workText(people.get(person.id))].filter(Boolean).join(" · "),
      muted: archived,
    })),
    empty: (hub) => `No people on this ${hub.kind} yet (:addperson {name}, {role})`,
  },
  {
    key: "projects",
    label: "Projects",
    kinds: ["area"],
    // Archived projects come last, muted.
    rows: ({ tree }, hub) => [
      ...projectsIn(tree, hub.id).map((project) => {
        const inside = tree.inOrder(project.id);
        const latest = [project, ...inside].map((note) => note.updated_at ?? "").sort().pop();
        return { id: project.id, title: project.title, depth: 0, detail: `${countNotes(inside.length)} · ${dayOf(latest)}` };
      }),
      ...archivedProjectsIn(tree, hub.id).map((project) => ({
        id: project.id, title: project.title, depth: 0, detail: `archived ${dayOf(project.archived_at)}`, muted: true,
      })),
    ],
    empty: () => "No projects in this area yet (:inarea {area} on a project puts it here)",
  },
  {
    key: "hubs",
    label: "Hubs",
    kinds: ["person"],
    // Archived hubs come last, muted.
    rows: ({ tree, people }, person) => hubLinks(tree, people, person.id).map(({ hub, role, archived }) => ({
      id: hub.id,
      title: hub.title,
      depth: 0,
      detail: [role, groupForKind(hub.kind).label, archived ? "archived" : ""].filter(Boolean).join(" · "),
      muted: archived,
    })),
    empty: (person) => `${person.title} is on no hubs yet (:addperson ${person.title} on a hub)`,
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
