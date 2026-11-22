// THE table of the panel's tabs on a hub page (and on a person's or a meeting's page): which
// tabs each kind has, in order, and the rows each one lists. Later sections (tasks...) are
// new rows here. Decisions and questions have no tabs of their own (no panel). Pure.
//
//   tabsFor(note)             the tabs for a hub, person or meeting note (new tabs go last,
//                             so the number keys of the others stay)
//   tab.rows(ctx, note)       [{ id, title, depth, detail, muted? }] in the order shown;
//                             ctx: { tree, people, meetings, records, links }
//                             (static/js/people/people-model.js, static/js/meetings/
//                             meetings-model.js, static/js/records/records-model.js,
//                             static/js/notes/links.js)
//                             actions: [{ key, label }] on rows that link records (not
//                             whole notes): "role" and "remove" (hub-actions.js runs them)
//   tab.empty(note)           what the tab says when it has no rows
//   tab.add                   { label } of its add button (hub-actions.js), or null
import { archivedProjectsIn, projectsIn } from "./hub-areas.js";
import { attendeesOf, attendeesText, meetingsOn, meetingsWith, shortTitle } from "../meetings/meetings-model.js";
import { whenText } from "../meetings/meeting-days.js";
import { groupForKind, hubOf, inRecordBelow } from "../notes/hub-groups.js";
import { Links, linksInto } from "../notes/links.js";
import { hubLinks, peopleOn, rolesText, workText } from "../people/people-model.js";
import { isOpen, peopleOf, recordsOn } from "../records/records-model.js";

const PARA = ["project", "area", "resource"];
const REMOVE = Object.freeze({ key: "remove", label: "Remove" });
const ROLE = Object.freeze({ key: "role", label: "Role…" });

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
      actions: [REMOVE],
    })),
    empty: () => "No attendees yet",
    add: { label: "Add attendee" },
  },
  {
    key: "notes",
    label: "Notes",
    kinds: [...PARA, "person", "meeting"],
    // Meetings, decisions and questions (and notes under them) have their own tabs.
    rows: ({ tree }, hub) => tree.inOrder(hub.id).filter((note) => !inRecordBelow(tree, note.id, hub.id)).map((note) => ({
      id: note.id,
      title: note.title,
      depth: tree.ancestors(note.id).length - 1,
      detail: dayOf(note.updated_at),
    })),
    empty: (hub) => ["person", "meeting"].includes(hub.kind)
      ? `No notes under ${hub.title} yet`
      : `No notes in this ${hub.kind} yet`,
    add: { label: "New note" },
  },
  {
    key: "people",
    label: "People",
    kinds: PARA,
    // An area lists the people on its projects too. Archived people come last, muted.
    // Only a link on this hub itself can be changed here: a project's is changed on the project.
    rows: ({ tree, people }, hub) => peopleOn(tree, people, hub).map(({ person, roles, archived }) => {
      const own = roles.find((each) => each.via === null);
      return {
        id: person.id,
        title: person.title,
        depth: 0,
        detail: [rolesText(roles), workText(people.get(person.id))].filter(Boolean).join(" · "),
        muted: archived,
        role: own?.role ?? "",
        actions: own ? [ROLE, REMOVE] : [],
      };
    }),
    empty: (hub) => `No people on this ${hub.kind} yet`,
    add: { label: "Add person" },
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
        return { id: project.id, title: project.title, depth: 0, detail: `${countNotes(inside.length)} · ${dayOf(latest)}`,
          actions: [{ key: "remove", label: "Take out" }] };
      }),
      ...archivedProjectsIn(tree, hub.id).map((project) => ({
        id: project.id, title: project.title, depth: 0, detail: `archived ${dayOf(project.archived_at)}`, muted: true,
      })),
    ],
    empty: () => "No projects in this area yet",
    add: { label: "Add project" },
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
      role,
      actions: [ROLE, REMOVE],
    })),
    empty: (person) => `${person.title} is on no hubs yet`,
    add: { label: "Add to a hub" },
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
      ? `${owner.title} attended no meetings yet`
      : `No meetings in this ${owner.kind} yet`,
    add: { label: "New meeting" },
  },
  {
    key: "decisions",
    label: "Decisions",
    kinds: [...PARA, "meeting", "person"],
    // Newest first; a hub's include those from its meetings (an area: its projects' too).
    rows: (ctx, owner) => recordsOn(ctx.tree, ctx.records, owner, "decision").map((entry) => ({
      id: entry.note.id,
      title: entry.note.title,
      depth: 0,
      detail: [entry.record.day, ...whereText(ctx, owner, entry)].filter(Boolean).join(" · "),
      muted: entry.archived,
    })),
    empty: (owner) => owner.kind === "person"
      ? `${owner.title} is on no decisions yet`
      : `No decisions in this ${owner.kind} yet`,
    add: { label: "New decision" },
  },
  {
    key: "questions",
    label: "Questions",
    kinds: [...PARA, "meeting", "person"],
    // Open first, oldest first; then answered ones, newest answer first, muted.
    rows: (ctx, owner) => recordsOn(ctx.tree, ctx.records, owner, "question").map((entry) => {
      const open = isOpen(entry.record);
      return {
        id: entry.note.id,
        title: entry.note.title,
        depth: 0,
        detail: [open ? `open · asked ${entry.record.day}` : `answered ${entry.record.answered}`,
          ...whereText(ctx, owner, entry)].filter(Boolean).join(" · "),
        muted: entry.archived || !open,
      };
    }),
    empty: (owner) => owner.kind === "person"
      ? `${owner.title} is on no questions yet`
      : `No questions in this ${owner.kind} yet`,
    add: { label: "New question" },
  },
  {
    key: "linked",
    label: "Linked from",
    // Any note can have this tab: add its kind here.
    kinds: ["resource"],
    // Notes outside the owner whose [[links]] reach it or a note under it ("to Colours");
    // links inside it are its own. Newest change first; archived ones last, muted.
    rows: ({ tree, links = new Links() }, owner) => linksInto(tree, links, owner).map(({ note, reached, archived }) => {
      const under = reached.filter((target) => target.id !== owner.id).map((target) => target.title);
      const hub = hubOf(tree, note.id);
      return {
        id: note.id,
        title: note.title,
        depth: 0,
        detail: [under.length ? `to ${under.join(", ")}` : "", hub && hub.id !== note.id ? hub.title : "", dayOf(note.updated_at),
          archived ? "archived" : ""].filter(Boolean).join(" · "),
        muted: archived,
      };
    }),
    empty: (owner) => `Nothing links to ${owner.title} yet. Write [[${owner.title}]] in any note.`,
    add: null,
  },
];

/** Where a decision or question is, as seen from the tab's owner, and who is on it. */
function whereText({ tree, meetings, records }, owner, { note, hub, meeting, archived }) {
  const fromMeeting = meeting && meeting.id !== owner.id ? `from ${shortTitle(meeting, meetings.get(meeting.id))}` : "";
  // A person's span hubs; an area's include its projects'.
  const onHub = owner.kind === "person" ? hub.title
    : owner.kind !== "meeting" && hub.id !== owner.id ? `on ${hub.title}` : "";
  const names = peopleOf(tree, records, note.id).map((person) => person.title).join(", ");
  return [onHub, fromMeeting, names, archived ? "archived" : ""];
}

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
