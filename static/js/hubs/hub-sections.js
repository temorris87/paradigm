// THE table of the sections on a hub's page (and a person's or a meeting's): which sections
// each kind has, in order, and the rows each one lists. New record types become new rows
// here, and their key goes in SECTION_ORDER. Decisions and questions have none. Pure.
//
//   sectionsFor(note)          the sections for a hub, person or meeting note, in page order
//   section.rows(ctx, note)    [{ id, title, depth, detail, muted?, actions?, snippet?, at? }]
//                              ctx: { tree, people, meetings, records, links, mentions, tasks,
//                              sessions, today }
//                              (static/js/people/people-model.js, static/js/meetings/
//                              meetings-model.js, static/js/records/records-model.js,
//                              static/js/notes/links.js, static/js/notes/mentions.js)
//                              actions: [{ key, label }]: "role", "remove", "answer", "done"
//                              (hub-actions.js runs them); snippet: Markdown shown under the
//                              row (a mention's context); at: { field, line } to open it at
//   section.detail(rows)       beside the heading ("3 open")
//   section.empty(note)        what it says when it has no rows
//   section.add                { label } of its add button (hub-actions.js), or null
//   section.limit              rows shown before "Show all"
//   section.folded             folded until opened (remembered per browser: hub-folds.js)
import { archivedProjectsIn, projectsIn } from "./hub-areas.js";
import { attendeesOf, attendeesText, meetingsOn, meetingsWith, shortTitle } from "../meetings/meetings-model.js";
import { localDay, whenText } from "../meetings/meeting-days.js";
import { groupForKind, hubOf, inRecordBelow } from "../notes/hub-groups.js";
import { Links, linksInto } from "../notes/links.js";
import { mentionsOf } from "../notes/mentions.js";
import { hubLinks, peopleOn, rolesText, workText } from "../people/people-model.js";
import { isOpen, peopleOf, recordsOn } from "../records/records-model.js";
import { tasksOn } from "../tasks/tasks-model.js";
import { projectFactsText, statusText } from "./project-facts.js";

const REMOVE = Object.freeze({ key: "remove", label: "Remove" });
const ROLE = Object.freeze({ key: "role", label: "Role…" });
const ANSWER = Object.freeze({ key: "answer", label: "Answer…" });
const DONE = Object.freeze({ key: "done", label: "Done" });
const UNDONE = Object.freeze({ key: "done", label: "Reopen" });
const LIMIT = 5;

// Which sections each kind shows, top to bottom.
export const SECTION_ORDER = {
  project: ["questions", "tasks", "decisions", "notes", "meetings", "people"],
  area: ["projects", "tasks", "questions", "decisions", "notes", "meetings", "people"],
  resource: ["notes", "tasks", "questions", "decisions", "meetings", "people", "linked"],
  meeting: ["tasks", "questions", "decisions"],
  person: ["active", "archived", "backlinks"],
};

export const HUB_SECTIONS = [
  {
    key: "projects",
    label: "Projects",
    // Live ones first (on hold ones muted), then archived ones, muted.
    rows: (ctx, area) => [
      ...projectsIn(ctx.tree, area.id).map((project) => ({
        id: project.id, title: project.title, depth: 0,
        detail: [statusText(project), projectFactsText(ctx, project)].filter(Boolean).join(" · "),
        muted: project.status === "on_hold",
        actions: [{ key: "remove", label: "Take out" }],
      })),
      ...archivedProjectsIn(ctx.tree, area.id).map((project) => ({
        id: project.id, title: project.title, depth: 0, detail: `archived ${dayOf(project.archived_at)}`, muted: true,
      })),
    ],
    detail: (rows) => counted(rows.filter((row) => !row.muted).length, "live"),
    empty: () => "No projects in this area yet",
    add: { label: "Add project" },
  },
  {
    key: "questions",
    label: "Questions",
    // Open first, oldest first (they have waited longest); then answered ones, muted.
    rows: (ctx, owner) => recordsOn(ctx.tree, ctx.records, owner, "question").map((entry) => {
      const open = isOpen(entry.record);
      return {
        id: entry.note.id,
        title: entry.note.title,
        depth: 0,
        detail: [open ? `asked ${entry.record.day}` : `answered ${entry.record.answered}`,
          ...whereText(ctx, owner, entry)].filter(Boolean).join(" · "),
        muted: entry.archived || !open,
        actions: open && !entry.archived ? [ANSWER] : [],
      };
    }),
    detail: (rows) => counted(rows.filter((row) => !row.muted).length, "open"),
    empty: (owner) => owner.kind === "meeting"
      ? "No questions from this meeting yet. Select text in the notes and right-click to add one."
      : "No questions yet. Select text in a note and right-click to add one.",
    add: { label: "New question" },
    limit: LIMIT,
  },
  {
    key: "tasks",
    label: "Tasks",
    // The "- [ ]" boxes in its notes (an area: its projects' too), each subtask under its task;
    // open ones first, as they are in the text, then done ones, muted. A row opens the note at
    // the box's line.
    rows: (ctx, owner) => tasksOn(ctx.tree, ctx.tasks, owner).map(({ task, note, hub, depth, archived }) => ({
      id: note.id,
      title: task.title || "(no text)",
      depth,
      detail: [note.id !== owner.id ? note.title : "", hub && hub.id !== owner.id && owner.kind !== "meeting" ? `on ${hub.title}` : "",
        nextBlockText(ctx, task.id), task.done ? `done ${task.done_day}`.trim() : "", archived ? "archived" : ""]
        .filter(Boolean).join(" · "),
      muted: task.done || archived,
      at: { field: task.field, line: task.line },
      task: task.id,
      done: task.done,
      actions: archived ? [] : [task.done ? UNDONE : DONE],
    })),
    detail: (rows) => counted(rows.filter((row) => !row.done).length, "open"),
    empty: (owner) => owner.kind === "meeting"
      ? "No tasks from this meeting yet. Write - [ ] in its notes, or add one here."
      : "No tasks yet. Write - [ ] in any of its notes, or add one here.",
    add: { label: "New task" },
    limit: 8,
  },
  {
    key: "decisions",
    label: "Decisions",
    // Newest first.
    rows: (ctx, owner) => recordsOn(ctx.tree, ctx.records, owner, "decision").map((entry) => ({
      id: entry.note.id,
      title: entry.note.title,
      depth: 0,
      detail: [entry.record.day, ...whereText(ctx, owner, entry)].filter(Boolean).join(" · "),
      muted: entry.archived,
    })),
    detail: (rows) => String(rows.length),
    empty: (owner) => owner.kind === "meeting"
      ? "No decisions from this meeting yet. Select text in the notes and right-click to add one."
      : "No decisions yet. Select text in a note and right-click to add one.",
    add: { label: "New decision" },
    limit: LIMIT,
  },
  {
    key: "notes",
    label: "Notes",
    // The whole subtree, nested; meetings and records have their own sections.
    rows: ({ tree }, hub) => tree.inOrder(hub.id).filter((note) => !inRecordBelow(tree, note.id, hub.id)).map((note) => ({
      id: note.id,
      title: note.title,
      depth: tree.ancestors(note.id).length - 1,
      detail: dayOf(note.updated_at),
    })),
    detail: (rows) => String(rows.length),
    empty: (hub) => `No notes in this ${hub.kind} yet`,
    add: { label: "New note" },
  },
  {
    key: "meetings",
    label: "Meetings",
    // Upcoming first (soonest first), then past ones (newest first); an area's include its
    // projects' ("on Pilot"). Meetings in archived hubs come last, muted.
    rows: (ctx, owner) => upcomingFirst(meetingsOn(ctx.tree, ctx.meetings, owner), ctx.today).map(({ note, meeting, hub, archived }) => ({
      id: note.id,
      title: shortTitle(note, meeting),
      depth: 0,
      detail: [whenText(meeting), hub.id !== owner.id ? `on ${hub.title}` : "",
        attendeesText(attendeesOf(ctx.tree, ctx.meetings, note.id).length), archived ? "archived" : ""].filter(Boolean).join(" · "),
      muted: archived,
    })),
    detail: (rows) => String(rows.length),
    empty: (owner) => `No meetings in this ${owner.kind} yet`,
    add: { label: "New meeting" },
    limit: LIMIT,
  },
  {
    key: "people",
    label: "People",
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
    detail: (rows) => String(rows.length),
    empty: (hub) => `No people on this ${hub.kind} yet`,
    add: { label: "Add person" },
  },
  {
    key: "linked",
    label: "Linked from",
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
    detail: (rows) => String(rows.length),
    empty: (owner) => `Nothing links to ${owner.title} yet. Write [[${owner.title}]] in any note.`,
    add: null,
  },
  {
    key: "active",
    label: "Active",
    // What they are on that is live: hubs (with their role), meetings they attended,
    // decisions and questions they are on.
    rows: (ctx, person) => referencedIn(ctx, person).filter((row) => !row.archived),
    detail: (rows) => String(rows.length),
    empty: (person) => `${person.title} is on nothing live yet`,
    add: { label: "Add to a hub" },
  },
  {
    key: "archived",
    label: "Archived",
    rows: (ctx, person) => referencedIn(ctx, person).filter((row) => row.archived).map((row) => ({ ...row, muted: true })),
    detail: (rows) => String(rows.length),
    empty: (person) => `${person.title} is on nothing archived`,
    add: null,
    folded: true,
  },
  {
    key: "backlinks",
    label: "Backlinks",
    // Notes that @mention them (with the lines around it) or [[link]] to their note.
    rows: (ctx, person) => backlinks(ctx, person),
    detail: (rows) => String(rows.length),
    empty: (person) => `No note mentions ${person.title} yet. Write @${person.title.replace(/\s+/g, "")} in any note.`,
    add: null,
    limit: 10,
  },
];

const BY_KEY = new Map(HUB_SECTIONS.map((section) => [section.key, section]));

export function sectionsFor(note) {
  return (SECTION_ORDER[note?.kind] ?? []).map((key) => BY_KEY.get(key));
}

/** Where a decision or question is, as seen from the section's owner, and who is on it. */
function whereText({ tree, records, meetings }, owner, { note, hub, meeting, source, archived }) {
  const from = meeting && meeting.id !== owner.id ? `from ${meetings ? shortTitle(meeting, meetings.get(meeting.id)) : meeting.title}`
    : source && !meeting && source.id !== owner.id ? `from ${source.title}` : "";
  // A person's span hubs; an area's include its projects'.
  const onHub = owner.kind === "person" ? hub.title
    : owner.kind !== "meeting" && hub.id !== owner.id ? `on ${hub.title}` : "";
  const names = peopleOf(tree, records, note.id).map((person) => person.title).join(", ");
  return [onHub, from, names, archived ? "archived" : ""];
}

/** The hubs, meetings, decisions and questions a person is on, each with archived set. */
function referencedIn(ctx, person) {
  const { tree, people, meetings, records } = ctx;
  const hubs = hubLinks(tree, people, person.id).map(({ hub, role, archived }) => ({
    id: hub.id, title: hub.title, depth: 0, archived, role,
    detail: [groupForKind(hub.kind).label, role].filter(Boolean).join(" · "),
    actions: [ROLE, REMOVE], removes: "hub",
  }));
  const met = meetingsWith(tree, meetings, person.id).map(({ note, meeting, hub, archived }) => ({
    id: note.id, title: shortTitle(note, meeting), depth: 0, archived,
    detail: ["Meeting", whenText(meeting), hub.title].filter(Boolean).join(" · "),
  }));
  const onRecords = ["question", "decision"].flatMap((kind) => recordsOn(tree, records, person, kind).map((entry) => ({
    id: entry.note.id, title: entry.note.title, depth: 0, archived: entry.archived,
    detail: [kind === "question" ? (isOpen(entry.record) ? "Question · open" : "Question · answered") : "Decision",
      entry.record.day, entry.hub.title].filter(Boolean).join(" · "),
    actions: kind === "question" && isOpen(entry.record) && !entry.archived ? [ANSWER] : [],
  })));
  return [...hubs, ...met, ...onRecords];
}

function backlinks(ctx, person) {
  const { tree, links = new Links(), mentions = [] } = ctx;
  const mentioned = mentionsOf(tree, mentions, person.id).map(({ note, field, line, context, archived }) => ({
    id: note.id,
    title: note.title,
    depth: 0,
    detail: [field === "agenda" ? "agenda" : "", hubOf(tree, note.id)?.title ?? "", dayOf(note.updated_at),
      archived ? "archived" : ""].filter(Boolean).join(" · "),
    muted: archived,
    snippet: dedent(context),
    at: { field, line },
  }));
  const seen = new Set(mentioned.map((row) => row.id));
  const linked = linksInto(tree, links, person).filter(({ note }) => !seen.has(note.id)).map(({ note, archived }) => ({
    id: note.id,
    title: note.title,
    depth: 0,
    detail: ["links here", hubOf(tree, note.id)?.title ?? "", dayOf(note.updated_at), archived ? "archived" : ""]
      .filter(Boolean).join(" · "),
    muted: archived,
  }));
  return [...mentioned, ...linked].sort((a, b) => Number(Boolean(a.muted)) - Number(Boolean(b.muted)));
}

/** The context's lines moved left by the first line's indent, so a nested item reads alone. */
function dedent(text) {
  const lines = String(text).split("\n");
  const indent = /^[ \t]*/.exec(lines[0])[0].length;
  return lines.map((line) => line.slice(Math.min(indent, /^[ \t]*/.exec(line)[0].length))).join("\n");
}

function upcomingFirst(entries, today = new Date()) {
  const day = localDay(today);
  const live = entries.filter((entry) => !entry.archived);
  const when = (entry) => `${entry.meeting.day} ${entry.meeting.time}`;
  const upcoming = live.filter((entry) => entry.meeting.day >= day).sort((a, b) => when(a).localeCompare(when(b)));
  const past = live.filter((entry) => entry.meeting.day < day);
  return [...upcoming, ...past, ...entries.filter((entry) => entry.archived)];
}

/** "next Tue 09:00": a task's next block on the calendar, from today on ("" if none). */
function nextBlockText(ctx, taskId) {
  const today = localDay(ctx.today ?? new Date());
  const next = (ctx.sessions ?? []).filter((session) => session.task_id === taskId && session.day >= today)
    .sort((a, b) => `${a.day} ${a.start}`.localeCompare(`${b.day} ${b.start}`))[0];
  return next ? `next ${whenText({ day: next.day, time: next.start })}` : "";
}

function counted(n, word) {
  return `${n} ${word}`;
}

/** "2026-11-21": the local day of an ISO time ("" when there is none). */
export function dayOf(iso) {
  const when = iso ? new Date(iso) : null;
  if (!when || Number.isNaN(when.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

