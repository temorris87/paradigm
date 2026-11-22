// THE table of the panel's tabs on a hub page (and on a person's or a meeting's page): which
// tabs each kind has, in order, and the rows each one lists. Later sections (decisions...)
// are new rows here. Pure.
//
//   tabsFor(note)             the tabs for a hub, person or meeting note (new tabs go last,
//                             so the number keys of the others stay)
//   tab.rows(ctx, note)       [{ id, title, depth, detail, muted? }] in the order shown;
//                             ctx: { tree, people, meetings } (static/js/people/people-model.js,
//                             static/js/meetings/meetings-model.js)
//   tab.empty(note)           what the tab says when it has no rows
import { archivedProjectsIn, projectsIn } from "./hub-areas.js";
import { attendeesOf, attendeesText, meetingsOn, meetingsWith, shortTitle } from "../meetings/meetings-model.js";
import { whenText } from "../meetings/meeting-days.js";
import { groupForKind, inMeetingBelow } from "../notes/hub-groups.js";
import { hubLinks, peopleOn, rolesText, workText } from "../people/people-model.js";

const PARA = ["project", "area", "resource"];

export const HUB_TABS = [
  {
    key: "attendees",
    label: "Attendees",
    kinds: ["meeting"],
    rows: ({ tree, people, meetings }, meeting) => attendeesOf(tree, meetings, meeting.id).map((person) => ({
      id: person.id,
      title: person.title,
      depth: 0,
      detail: workText(people.get(person.id)),
    })),
    empty: () => "No attendees yet (:attendee {name}, {name}...)",
  },
  {
    key: "notes",
    label: "Notes",
    kinds: [...PARA, "person", "meeting"],
    // Meetings (and notes under them) have their own tab.
    rows: ({ tree }, hub) => tree.inOrder(hub.id).filter((note) => !inMeetingBelow(tree, note.id, hub.id)).map((note) => ({
      id: note.id,
      title: note.title,
      depth: tree.ancestors(note.id).length - 1,
      detail: dayOf(note.updated_at),
    })),
    empty: (hub) => ["person", "meeting"].includes(hub.kind)
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
  {
    key: "meetings",
    label: "Meetings",
    kinds: [...PARA, "person"],
    // Newest first; an area's include its projects' ("on Pilot"); a person's name the hub.
    // Meetings in archived hubs come last, muted.
    rows: ({ tree, meetings }, owner) => {
      const entries = owner.kind === "person" ? meetingsWith(tree, meetings, owner.id) : meetingsOn(tree, meetings, owner);
      return entries.map(({ note, meeting, hub, archived }) => ({
        id: note.id,
        title: shortTitle(note, meeting),
        depth: 0,
        detail: [
          whenText(meeting),
          owner.kind === "person" ? hub.title : hub.id !== owner.id ? `on ${hub.title}` : "",
          attendeesText(attendeesOf(tree, meetings, note.id).length),
          archived ? "archived" : "",
        ].filter(Boolean).join(" · "),
        muted: archived,
      }));
    },
    empty: (owner) => owner.kind === "person"
      ? `${owner.title} attended no meetings yet (:attendee ${owner.title} on a meeting)`
      : `No meetings in this ${owner.kind} yet (:meeting [{date}] [{time}] {title})`,
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
