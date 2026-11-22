// THE table of the sections on a page: which sections each kind of note has, in order, and
// the rows each one lists. New record types become new rows here, and their key goes in
// SECTION_ORDER. Decisions, questions and templates have none; a plain note has Tasks and
// Files. Pure.
//
// Roll-up: a task, question or decision shows on the project (or note) it belongs to, and on
// nothing above it: an area lists its own, and one line per project with that project's
// counts (the Projects section).
//
//   sectionsFor(note)          the sections for a hub, person or meeting note, in page order
//   section.rows(ctx, note)    [{ id, title, depth, detail, muted?, late?, actions?, snippet?, at?,
//                              task?, file?, template?, addSubtask? }]
//                              ctx: { tree, people, meetings, records, links, mentions, tasks,
//                              sessions, plan, files, planTemplates, expanded: Set of task ids
//                              shown with their subtasks, today }
//                              (static/js/people/people-model.js, static/js/meetings/
//                              meetings-model.js, static/js/records/records-model.js,
//                              static/js/notes/links.js, static/js/notes/mentions.js)
//                              actions: [{ key, label }]: "role", "remove", "answer", "done",
//                              "edit", "delegate", "takeBack", "history" (hub-actions.js runs
//                              them); snippet: Markdown shown under the row (a mention's
//                              context, a task's notes); at: { field, line } to open it at
//   section.detail(rows)       beside the heading ("3 open")
//   section.empty(note)        what it says when it has no rows
//   section.add                { label } of its add button (hub-actions.js), or null
//   section.limit              rows shown before "Show all"
//   section.folded             folded until opened (remembered per browser: hub-folds.js)
import { archivedProjectsIn, projectsIn } from "./hub-areas.js";
import { attendeesOf, attendeesText, meetingsOn, meetingsWith, shortTitle } from "../meetings/meetings-model.js";
import { localDay, whenText } from "../meetings/meeting-days.js";
import { groupForKind, hubOf, inRecordBelow, phaseOf } from "../notes/hub-groups.js";
import { Links, linksInto } from "../notes/links.js";
import { mentionsOf } from "../notes/mentions.js";
import { hubLinks, peopleOn, rolesText, workText } from "../people/people-model.js";
import { isOpen, peopleOf, recordsOn } from "../records/records-model.js";
import { openCount, subtaskText, tasksOn, waitingOn } from "../tasks/tasks-model.js";
import { Files, fileDir, filesOn } from "../files/files-model.js";
import { Plan, milestonesOf, nextMilestone, phasesOf, shortDay, slipOf, slipText } from "../plan/plan-model.js";
import { projectFactsText, statusText } from "./project-facts.js";

const REMOVE = Object.freeze({ key: "remove", label: "Remove" });
const ROLE = Object.freeze({ key: "role", label: "Role…" });
const ANSWER = Object.freeze({ key: "answer", label: "Answer…" });
const DONE = Object.freeze({ key: "done", label: "Done" });
const UNDONE = Object.freeze({ key: "done", label: "Reopen" });
const EDIT = Object.freeze({ key: "edit", label: "Edit…" });
const DELEGATE = Object.freeze({ key: "delegate", label: "Delegate…" });
const TAKE_BACK = Object.freeze({ key: "takeBack", label: "Take back" });
const DELETE = Object.freeze({ key: "remove", label: "Delete" });
const HISTORY = Object.freeze({ key: "history", label: "History" });
const LIMIT = 5;

// Which sections each kind shows, top to bottom ("note": a plain note).
export const SECTION_ORDER = {
  project: ["plan", "tasks", "questions", "decisions", "meetings", "files", "notes", "people"],
  area: ["projects", "tasks", "questions", "decisions", "meetings", "files", "templates", "notes", "people"],
  resource: ["notes", "files", "tasks", "questions", "decisions", "meetings", "people", "linked"],
  meeting: ["tasks", "questions", "decisions", "files"],
  phase: ["tasks", "milestones", "files", "notes"],
  milestone: ["tasks", "files"],
  note: ["tasks", "files"],
  person: ["waiting", "active", "archived", "backlinks"],
};

export const HUB_SECTIONS = [
  {
    key: "projects",
    label: "Projects",
    // Live ones first (on hold ones muted), then archived ones, muted.
    rows: (ctx, area) => [
      ...projectsIn(ctx.tree, area.id).map((project) => ({
        id: project.id, title: project.title, depth: 0,
        detail: [statusText(project), projectCounts(ctx, project), projectFactsText(ctx, project)].filter(Boolean).join(" · "),
        muted: project.status === "on_hold",
        late: projectLate(ctx, project),
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
    key: "plan",
    label: "Plan",
    // The project's phases by start day, then its milestones by day; the dashboard's Gantt
    // chart shows the same.
    rows: (ctx, project) => planRows(ctx, project),
    detail: (rows) => counted(rows.filter((row) => row.kind === "phase").length, "phases"),
    empty: () => "No phases yet. Add one, or apply a plan template on the dashboard.",
    add: { label: "New phase" },
  },
  {
    key: "milestones",
    label: "Milestones",
    rows: (ctx, phase) => milestonesOf(ctx.tree, plan(ctx), phase.id).map((entry) => milestoneRow(ctx, entry)),
    detail: (rows) => counted(rows.filter((row) => !row.done).length, "to come"),
    empty: () => "No milestones in this phase yet",
    add: { label: "New milestone" },
  },
  {
    key: "tasks",
    label: "Tasks",
    // Its tasks and those of the notes inside it (never a project's on its area); subtasks
    // show as a count until the row is opened (Enter), then under it with + Add subtask.
    rows: (ctx, owner) => tasksOn(ctx.tree, ctx.tasks, owner).flatMap((entry) => taskRows(ctx, owner, entry)),
    detail: (rows) => counted(rows.filter((row) => row.depth === 0 && row.task && !row.done).length, "open"),
    empty: (owner) => owner.kind === "meeting" ? "No action items from this meeting yet" : "No tasks yet",
    add: { label: "New task" },
    limit: 12,
  },
  {
    key: "waiting",
    label: "Waiting on",
    // What they are doing for me: open tasks delegated to them, soonest follow-up first.
    rows: (ctx, person) => waitingOn(ctx.tree, ctx.tasks, person.id).map((entry) => waitingRow(ctx, entry, false)),
    detail: (rows) => String(rows.length),
    empty: (person) => `Nothing delegated to ${person.title}`,
    add: null,
  },
  {
    key: "files",
    label: "Files",
    // OneDrive files on it (and on the notes inside it). Enter opens one on this computer.
    rows: (ctx, owner) => filesOn(ctx.tree, ctx.files ?? new Files(), owner).map(({ file, folder, own, via, others }) => ({
      id: owner.id,
      title: file.name,
      depth: 0,
      detail: [folder?.name, fileDir(file), via ? `on ${via.title}` : "", others.length ? `also on ${others.map((note) => note.title).join(", ")}` : "",
        file.missing ? "⚠ not in the folder any more" : ""].filter(Boolean).join(" · "),
      muted: file.missing,
      late: file.missing,
      file: file.id,
      owner: own ? owner.id : via.id,
      actions: [{ key: "remove", label: "Remove" }],
    })),
    detail: (rows) => String(rows.length),
    empty: () => "No files yet. Link a OneDrive folder, then add its files here.",
    add: { label: "Add file" },
    limit: 8,
  },
  {
    key: "templates",
    label: "Plan templates",
    // Plans to start a project from: phases, milestones and tasks in working days.
    rows: (ctx, area) => (ctx.planTemplates ?? []).filter((template) => template.area_id === area.id).map((template) => ({
      id: area.id,
      title: template.title,
      depth: 0,
      detail: templateSummary(template),
      template: template.id,
      actions: [DELETE],
    })),
    detail: (rows) => String(rows.length),
    empty: () => "No plan templates yet. Make one here, or save a project's plan as one.",
    add: { label: "New plan template" },
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
    // The whole subtree, nested; meetings and records have their own sections, and so do a
    // project's phases (the Plan) with the notes in them.
    rows: ({ tree }, hub) => tree.inOrder(hub.id).filter((note) => !inRecordBelow(tree, note.id, hub.id)
      && !(hub.kind === "project" && phaseOf(tree, note.id))).map((note) => ({
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
  if (!note) return [];
  return (SECTION_ORDER[note.kind ?? "note"] ?? []).map((key) => BY_KEY.get(key));
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

function plan(ctx) {
  return ctx.plan ?? new Plan();
}

function planRows(ctx, project) {
  const today = localDay(ctx.today ?? new Date());
  const phases = phasesOf(ctx.tree, plan(ctx), project.id).map(({ note, phase }) => {
    const slip = slipOf(plan(ctx), note.id);
    return {
      id: note.id, title: note.title, depth: 0, kind: "phase",
      detail: [`${shortDay(phase.start, today)} → ${shortDay(phase.end, today)}`, slipText(slip),
        phase.end < today ? "ended" : phase.start <= today ? "now" : "", ctx.tasks && openCount(ctx.tree, ctx.tasks, note) ? `${openCount(ctx.tree, ctx.tasks, note)} open tasks` : ""]
        .filter(Boolean).join(" · "),
      late: slip.keepsSlipping,
      actions: slip.moves ? [HISTORY] : [],
    };
  });
  const milestones = milestonesOf(ctx.tree, plan(ctx), project.id).map((entry) => milestoneRow(ctx, entry));
  return [...phases, ...milestones];
}

function milestoneRow(ctx, { note, milestone, phase }) {
  const today = localDay(ctx.today ?? new Date());
  const slip = slipOf(plan(ctx), note.id);
  const done = Boolean(milestone.done_day);
  return {
    id: note.id, title: `◆ ${note.title}`, depth: 0, kind: "milestone",
    detail: [shortDay(milestone.day, today), phase ? `in ${phase.title}` : "", slipText(slip),
      done ? `reached ${milestone.done_day}` : milestone.day < today ? "overdue" : ""].filter(Boolean).join(" · "),
    muted: done,
    late: !done && (milestone.day < today || slip.keepsSlipping),
    done,
    milestone: note.id,
    actions: [done ? UNDONE : DONE, ...(slip.moves ? [HISTORY] : [])],
  };
}

function taskRows(ctx, owner, entry) {
  const { task, note, archived } = entry;
  const open = ctx.expanded?.has(task.id) ?? false;
  const subtasks = entry.subtasks ?? [];
  const row = {
    id: note.id,
    title: task.title || "(no text)",
    depth: 0,
    detail: [subtaskText(entry), delegateText(ctx, task), dueText(ctx, task), note.id !== owner.id ? `in ${note.title}` : "",
      nextBlockText(ctx, task.id), task.done ? `done ${task.done_day}`.trim() : "", archived ? "archived" : ""]
      .filter(Boolean).join(" · "),
    muted: task.done || archived,
    late: isLate(ctx, task),
    task: task.id,
    done: task.done,
    expanded: open,
    snippet: open && task.notes ? task.notes : "",
    actions: archived ? [] : [task.done ? UNDONE : DONE, EDIT, task.delegate_id === null ? DELEGATE : TAKE_BACK, DELETE],
  };
  if (!open) return [row];
  const subs = subtasks.map((sub) => ({
    id: note.id,
    title: sub.title,
    depth: 1,
    detail: [delegateText(ctx, sub), dueText(ctx, sub), sub.done ? `done ${sub.done_day}` : ""].filter(Boolean).join(" · "),
    muted: sub.done || archived,
    late: isLate(ctx, sub),
    task: sub.id,
    done: sub.done,
    actions: archived ? [] : [sub.done ? UNDONE : DONE, EDIT, sub.delegate_id === null ? DELEGATE : TAKE_BACK, DELETE],
  }));
  const add = archived ? [] : [{ id: note.id, title: "+ Add subtask", depth: 1, detail: "", addSubtask: task.id, muted: true }];
  return [row, ...subs, ...add];
}

/** A row of Waiting on (a person's page, Home): the task, where it is, when to chase it. */
export function waitingRow(ctx, entry, withPerson = true) {
  const { task, note, hub } = entry;
  const today = localDay(ctx.today ?? new Date());
  const person = ctx.tree.get(task.delegate_id);
  return {
    id: note.id,
    title: task.title,
    depth: 0,
    detail: [withPerson && person ? `→ ${person.title}` : "", hub && hub.id !== note.id ? hub.title : "", note.title,
      task.follow_up ? `follow up ${shortDay(task.follow_up, today)}` : "", subtaskText(entry)].filter(Boolean).join(" · "),
    late: Boolean(task.follow_up && task.follow_up < today),
    task: task.id,
    done: task.done,
    actions: [DONE, TAKE_BACK],
  };
}

function delegateText(ctx, task) {
  if (task.delegate_id === null) return "";
  const person = ctx.tree.get(task.delegate_id);
  const follow = task.follow_up ? `, follow up ${shortDay(task.follow_up, localDay(ctx.today ?? new Date()))}` : "";
  return person ? `→ ${person.title}${follow}` : "";
}

function dueText(ctx, task) {
  return task.due ? `due ${shortDay(task.due, localDay(ctx.today ?? new Date()))}` : "";
}

function isLate(ctx, task) {
  if (task.done) return false;
  const today = localDay(ctx.today ?? new Date());
  return Boolean((task.due && task.due < today) || (task.delegate_id !== null && task.follow_up && task.follow_up < today));
}

/** "4 open tasks · 1 decision · ◆ Go-live 17 Jan": a project's own, for its area (its open
 * questions and next meeting follow, from projectFactsText). */
function projectCounts(ctx, project) {
  const tasks = ctx.tasks ? openCount(ctx.tree, ctx.tasks, project) : 0;
  const decisions = ctx.records ? recordsOn(ctx.tree, ctx.records, project, "decision").length : 0;
  const parts = [];
  if (tasks) parts.push(`${tasks} open task${tasks === 1 ? "" : "s"}`);
  if (decisions) parts.push(`${decisions} decision${decisions === 1 ? "" : "s"}`);
  const next = nextMilestone(ctx.tree, plan(ctx), project.id);
  if (next) parts.push(`◆ ${next.note.title} ${shortDay(next.milestone.day, localDay(ctx.today ?? new Date()))}`);
  return parts.join(" · ");
}

function projectLate(ctx, project) {
  return phasesOf(ctx.tree, plan(ctx), project.id).some(({ note }) => slipOf(plan(ctx), note.id).keepsSlipping);
}

function templateSummary(template) {
  const phases = template.items.filter((item) => item.kind === "phase").length;
  const milestones = template.items.length - phases;
  const days = template.items.length ? Math.max(...template.items.map((item) => item.end)) + 1 : 0;
  const tasks = template.items.reduce((sum, item) => sum + item.tasks.length, 0);
  return [`${phases} phase${phases === 1 ? "" : "s"}`, `${milestones} milestone${milestones === 1 ? "" : "s"}`,
    tasks ? `${tasks} tasks` : "", days ? `${days} working days` : ""].filter(Boolean).join(" · ");
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

