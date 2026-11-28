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
//   dashboardFor(note)         the main window's lanes { wide: [...], cards: [...], act: [...],
//                              know: [...], emptyLine }, or null; cards: a row of equal cards
//                              over the lanes, each a column of its own (a person's)
//   section.rows(ctx, note)    [{ id, title, depth, detail, date?, cells?, muted?, late?, actions?,
//                              snippet?, at?, task?, file?, template?, addSubtask?, next?,
//                              health?, statusEntry?, statusHistory?, box?, bar?, pre?,
//                              cellClasses?, folder?, tip?, chip?, chips?, bullet?, doc?,
//                              reveal?, inert? }]
//                              chips: [{ text, tone }] shared chips before the detail;
//                              bullet: a mark before the title ("○" a topic); doc: Markdown
//                              drawn as the whole row (a person's Notes); reveal: the row
//                              unfolds the sections marked reveal (Together's Backlinks ·
//                              Archived); inert: a fact, nothing opens
//                              folder: a linked folder's id (the Files section's folder rows);
//                              chip: { text, tone, lead: true } a kind chip before the title (Agreed)
//                              tip: the row's hover text
//                              box: drawn boxed (the newest status); bar: { left, width,
//                              today } in parts of one (Portfolio); pre: text kept as written
//                              (the digest); health: on_track | at_risk | blocked (its colour)
//                              date: its day, in a column of its own at the row's end;
//                              cells: a table row's columns (an area's Projects)
//                              ctx: { tree, people, meetings, records, links, mentions, tasks,
//                              sessions, plan, files, planTemplates, expanded: Set of task ids
//                              shown in place with their subtasks, today, captures: { source,
//                              list }: the open note's captures (notes/capture-actions.js),
//                              body: { id, text }: the open owner's own text (a person's
//                              Notes card, a project's Outcome) }
//                              task: a task's id (Tasks, Waiting on, I owe): Enter opens its
//                              page; expanded (Tasks' top rows): whether it is open in place
//                              (static/js/people/people-model.js, static/js/meetings/
//                              meetings-model.js, static/js/records/records-model.js,
//                              static/js/notes/links.js, static/js/notes/mentions.js)
//                              actions: [{ key, label }]: "role", "remove", "answer", "done",
//                              "edit", "delegate", "takeBack", "history" (hub-actions.js runs
//                              them); snippet: Markdown shown under the row (a mention's
//                              context, a task's notes); at: { field, line } to open it at
//   section.label              its name, or (owner) -> name ("Waiting on Priya")
//   section.detail(rows, ctx, owner)   beside the heading ("3 open")
//   section.empty(note)        what it says when it has no rows
//   section.add                { label } of its add button (hub-actions.js), or null
//   section.menu               { label } of its heading's "···" menu button (hub-actions.js
//                              menu: the Files section's), or none
//   section.limit              rows shown before "Show all"
//   section.pinned(row)        true for rows always shown, outside the limit and Show all's
//                              count (the Files section's folder rows)
//   section.folded             folded until opened (remembered per browser: hub-folds.js)
//   section.base               the section whose add button and row buttons it shares
//                              ("openQuestions" adds a question), or none
//   section.footer(ctx, owner)  { text, tab, count } of the line under its rows, with History ↗
//                              (a project's now-and-next sections: what the History page holds;
//                              tab: the History tab it opens on; count: History's on that tab).
//                              With no rows but a count, the section stays in its column for it
//   section.history            the History tab an item on the Nothing yet line opens (a
//                              project's Answered questions), for a section with no rows of its own
// A project's page shows now and next, this week on (DASHBOARD_LAYOUT.project): open tasks,
// open questions, the next and the last meeting, the latest 3 decisions; the rest is on its
// History page (static/js/history/). Its row fields besides the above: chip: { text, tone,
// lead? } a status chip after the title (lead: before it); lead: a small label first ("Next");
// avatar: initials before the title; outcome: the Outcome's row (e edits it)
//   section.reveal             shown only once its lane's reveal row is opened
import { archivedProjectsIn, projectsIn } from "./hub-areas.js";
import { attendeesOf, attendeesText, meetingsOn, meetingsWith, shortTitle } from "../meetings/meetings-model.js";
import { localDay, splitMeetings, whenText } from "../meetings/meeting-days.js";
import { groupForKind, hubOf, inRecordBelow, phaseOf } from "../notes/hub-groups.js";
import { Links, linksInto } from "../notes/links.js";
import { mentionsOf } from "../notes/mentions.js";
import { hubLinks, peopleOn, rolesText, workText } from "../people/people-model.js";
import { isOpen, peopleOf, recordsOn } from "../records/records-model.js";
import { estimateText, openCount, subtaskText, taskTree, tasksOn, waitingOn } from "../tasks/tasks-model.js";
import { Files, fileDir, filesOn, folderSummary, foldersOf } from "../files/files-model.js";
import { Plan, daysBetween, milestonesOf, nextMilestone, phasesOf, shortDay, slipOf, slipText } from "../plan/plan-model.js";
import { initials, outcomeLine, projectFactsText, statusText } from "./project-facts.js";
import { dayText, daysAgo } from "../ui/dates.js";
import { StatusLogs, digest, firstSentence, healthLabel, healthOf } from "../status/status-model.js";
import { portfolioBars } from "../plan/plan-rows.js";
import { firstName, lastTogether, meetingsThisMonth, owedTo, soonDay, toRaise } from "../people/one-on-one.js";
import { historyCounts } from "../history/history-model.js";
import { agreedRows } from "../notes/capture-model.js";

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
const RAISED = Object.freeze({ key: "done", label: "Raised" });
const LIMIT = 5;
// A project's Decisions: the latest few; the rest are on its History page.
const LATEST_DECISIONS = 3;

// Which sections each kind shows, top to bottom ("note": a plain note).
export const SECTION_ORDER = {
  project: ["plan", "tasks", "questions", "decisions", "meetings", "files", "notes", "people"],
  area: ["projects", "tasks", "questions", "decisions", "meetings", "files", "templates", "notes", "people"],
  // A resource is a plain note (in a folder): its tasks and files, as any note.
  resource: ["tasks", "files"],
  // Agreed: what was captured from it (028), in place of its Questions and Decisions; its
  // Tasks are those on the meeting itself, not the ones captured from it.
  meeting: ["agreed", "tasks", "files"],
  phase: ["tasks", "milestones", "files", "notes"],
  milestone: ["tasks", "files"],
  note: ["tasks", "files"],
  person: ["waiting", "owe", "raise", "active", "archived", "backlinks"],
};

// The main window's dashboard: two lanes under the card, the chart and the text. Act holds
// what needs doing, Know what is looked up; each section keeps its place, full or empty.
// wide: full width over the two lanes (an area's Projects table).
// emptyLine "foot": the empty sections of both lanes share one line under them (a project's).
export const DASHBOARD_LAYOUT = {
  // Now and next (Figma): its status is in the head, its history on its History page.
  project: {
    act: ["openTasks", "projectQuestions"],
    know: ["outcome", "nextMeetings", "latestDecisions", "projectPeople", "notes", "files", "projectAnswered"],
    emptyLine: "foot",
  },
  area: {
    wide: ["projects"],
    act: ["portfolio", "tasks", "openQuestions", "where"],
    know: ["digest", "meetings", "decisions", "answeredQuestions", "templates", "notes", "files", "people"],
  },
  // A person as 1:1 prep: three cards in a row, then their Notes (wide) and Together
  // (narrow) under them (person-cards.css). Backlinks and Archived unfold under Together.
  person: {
    cards: ["waiting", "owe", "raise"],
    act: ["personNotes"],
    know: ["together", "togetherBacklinks", "togetherArchived"],
  },
};

// A project's columns in an area's Projects table ("Open": tasks · questions, "4 · 1?").
export const PROJECT_CELLS = ["Health", "Latest status", "Updated", "Next milestone", "Open"];

export const HUB_SECTIONS = [
  {
    key: "where",
    label: "Where I am",
    // Its status log: the newest entry in full, two older ones on a line each, then History.
    rows: (ctx, hub) => statusRows(ctx, hub),
    detail: () => "status log",
    empty: () => "Nothing logged yet: Log status (L) says where it stands",
    add: { label: "Log status" },
  },
  {
    key: "portfolio",
    label: "Portfolio",
    // A bar per project across the span of their plans (gp: the full chart).
    rows: (ctx, area) => portfolioBars(ctx.tree, plan(ctx), area.id, localDay(ctx.today ?? new Date())).map((row) => ({
      id: row.id, title: row.label, depth: 0, detail: row.detail || row.badge, bar: { left: row.left, width: row.width, today: row.today },
      late: row.late, muted: row.muted,
    })),
    detail: () => "plans side by side",
    empty: () => "No projects in this area yet",
    add: null,
  },
  {
    key: "digest",
    label: "Weekly digest",
    // The week in a few lines from the projects' status logs, to paste in an update.
    rows: (ctx, area) => [{ id: area.id, title: "", depth: 0, pre: digest(ctx, area, ctx.today ?? new Date()), digest: true }],
    detail: () => "from status logs",
    empty: () => "",
    add: { label: "Copy", plain: true },
  },
  {
    key: "projects",
    label: "Projects",
    // Live ones first (on hold ones muted), then archived ones, muted.
    rows: (ctx, area) => [
      ...projectsIn(ctx.tree, area.id).map((project) => ({
        id: project.id, title: project.title, depth: 0,
        detail: [statusText(project), projectCounts(ctx, project), projectFactsText(ctx, project)].filter(Boolean).join(" · "),
        cells: projectCells(ctx, project),
        cellClasses: projectCellClasses(ctx, project),
        muted: project.status === "on_hold",
        late: projectLate(ctx, project),
        actions: [{ key: "remove", label: "Take out" }],
      })),
      ...archivedProjectsIn(ctx.tree, area.id).map((project) => ({
        id: project.id, title: project.title, depth: 0, detail: "archived",
        cells: ["archived", "", "", "", "", ""], date: shortDay(dayOf(project.archived_at), localDay(ctx.today ?? new Date())), muted: true,
      })),
    ],
    detail: (rows) => counted(rows.filter((row) => !row.muted).length, "live"),
    empty: () => "No projects in this area yet",
    add: { label: "Add project" },
    columns: PROJECT_CELLS,
  },
  {
    key: "questions",
    label: "Questions",
    // Open first, oldest first (they have waited longest); then answered ones, muted.
    rows: (ctx, owner) => questionRows(ctx, owner),
    detail: (rows) => counted(rows.filter((row) => !row.muted).length, "open"),
    empty: (owner) => owner.kind === "meeting"
      ? "No questions from this meeting yet. Select text in the notes and right-click to add one."
      : "No questions yet. Select text in a note and right-click to add one.",
    add: { label: "New question" },
    limit: LIMIT,
  },
  {
    key: "openQuestions",
    label: "Open questions",
    base: "questions",
    rows: (ctx, owner) => questionRows(ctx, owner).filter((row) => row.open),
    detail: (rows) => String(rows.length),
    empty: () => "No open questions. Select text in a note and right-click to add one.",
    add: { label: "New question" },
    limit: LIMIT,
  },
  {
    key: "answeredQuestions",
    label: "Answered questions",
    base: "questions",
    rows: (ctx, owner) => questionRows(ctx, owner).filter((row) => !row.open),
    detail: (rows) => String(rows.length),
    empty: () => "No answered questions yet",
    add: null,
    limit: LIMIT,
    folded: true,
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
    key: "agreed",
    label: "Agreed in this meeting",
    // The tasks, questions and decisions captured from it (\t \q \d), in the order made.
    rows: (ctx, owner) => agreedRows(ctx.captures?.source === owner.id ? ctx.captures.list : [], ctx.today ?? new Date()),
    detail: (rows) => String(rows.length),
    empty: () => "Nothing captured yet: \\t \\q \\d on a line of the notes",
    add: null,
  },
  {
    key: "tasks",
    label: "Tasks",
    // Its tasks and those of the notes inside it (never a project's on its area); subtasks
    // show as a count until the row is opened in place (z), then every level under it with
    // + Add subtask. Enter on a task opens its own page (the main window).
    rows: (ctx, owner) => tasksOn(ctx.tree, ctx.tasks, owner).filter((entry) => owner.kind !== "meeting" || entry.task.source_id !== owner.id)
      .flatMap((entry) => taskRows(ctx, owner, entry)),
    detail: (rows) => counted(rows.filter((row) => row.depth === 0 && row.task && !row.done).length, "open"),
    empty: (owner) => owner.kind === "meeting" ? "No action items from this meeting yet" : "No tasks yet",
    add: { label: "New task" },
    limit: 12,
  },
  {
    key: "owe",
    label: (person) => `I owe ${firstName(person)}`,
    // Open tasks of mine done for them, with where each is on the calendar.
    rows: (ctx, person) => owedTo(ctx.tree, ctx.tasks, person.id).map((entry) => {
      const today = localDay(ctx.today ?? new Date());
      return {
        id: entry.note.id, title: entry.task.title, depth: 0, task: entry.task.id, done: false,
        chips: dueChips(entry.task.due, today),
        detail: [entry.hub?.title ?? "", placedText(ctx, entry.task.id)].filter(Boolean).join(" · "),
        actions: [DONE, EDIT, DELEGATE],
      };
    }),
    detail: (rows) => String(rows.length),
    empty: () => "Nothing owed.",
    add: { label: "Task" },
  },
  {
    key: "raise",
    label: "To raise next 1:1",
    // Topics not raised yet ("@Name ?" lines, or + Add), then open questions they are on.
    rows: (ctx, person) => toRaise(ctx, person.id).map((item) => ({
      id: item.id, title: item.title, depth: 0, detail: item.detail, topic: item.topic, bullet: "○",
      actions: item.topic !== undefined ? [RAISED, REMOVE] : [],
    })),
    detail: (rows) => String(rows.length),
    empty: () => "Nothing to raise. a adds a topic.",
    add: { label: "Topic" },
  },
  {
    key: "waiting",
    label: (person) => (person?.kind === "person" ? "They owe me" : "Waiting on"),
    // What they are doing for me: open tasks delegated to them, soonest follow-up first.
    rows: (ctx, person) => waitingOn(ctx.tree, ctx.tasks, person.id).map((entry) => {
      const today = localDay(ctx.today ?? new Date());
      return { ...waitingRow(ctx, entry, false), chips: followChips(entry.task.follow_up, today),
        detail: [entry.hub?.title, placedText(ctx, entry.task.id)].filter(Boolean).join(" · "), late: false };
    }),
    detail: (rows) => String(rows.length),
    empty: () => "Delegate any task with d; it lands here.",
    add: { label: "Delegate" },
  },
  {
    key: "personNotes",
    label: "Notes",
    // The person's own text, rendered; Edit ↗ (or Enter) writes it in the note window.
    rows: (ctx, person) => (personNotes(ctx, person).trim() ? [{ id: person.id, title: "Notes", depth: 0, doc: personNotes(ctx, person) }] : []),
    detail: () => "",
    empty: () => "No notes. Edit ↗ to add some.",
    add: { label: "Edit ↗", plain: true },
  },
  {
    key: "together",
    base: "active",
    label: "Together",
    // The live hubs they are on, when we last met, how often this month, and the line that
    // unfolds their Backlinks and Archived under it.
    rows: (ctx, person) => togetherRows(ctx, person),
    detail: () => "",
    empty: () => "",
    add: { label: "Add to a hub" },
  },
  {
    key: "files",
    label: "Files",
    // The folders linked to this hub first (only on the hub itself), then the OneDrive files on
    // it (and on the notes inside it). Enter opens a file on this computer, or a folder's files
    // in the Add file picker.
    rows: (ctx, owner) => [...folderRows(ctx.files ?? new Files(), owner), ...fileRows(ctx, owner)],
    detail: (rows) => String(rows.filter((row) => row.folder === undefined).length),
    // Folder rows are always shown and sit outside the limit, so they never push files out of view.
    pinned: (row) => row.folder !== undefined,
    empty: () => "No files yet. Link a OneDrive folder, then add its files here.",
    add: { label: "Add file" },
    // Search linked files…, Link a folder…, Unlink a folder…
    menu: { label: "More file actions" },
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
      detail: whereText(ctx, owner, entry).filter(Boolean).join(" · "),
      date: shortDay(entry.record.day, localDay(ctx.today ?? new Date())),
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
      detail: "",
      date: changedDay(note.updated_at),
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
    rows: (ctx, owner) => meetingRows(ctx, owner, upcomingFirst(meetingsOn(ctx.tree, ctx.meetings, owner), ctx.today)),
    detail: (rows) => String(rows.length),
    empty: (owner) => `No meetings in this ${owner.kind} yet`,
    add: { label: "New meeting" },
    limit: LIMIT,
  },
  {
    key: "upcomingMeetings",
    label: "Upcoming meetings",
    base: "meetings",
    // Soonest first, from today on.
    rows: (ctx, owner) => meetingRows(ctx, owner, upcomingOnly(meetingsOn(ctx.tree, ctx.meetings, owner), ctx.today)),
    detail: (rows) => String(rows.length),
    empty: () => "No meetings coming up",
    add: { label: "New meeting" },
    limit: LIMIT,
  },
  {
    key: "pastMeetings",
    label: "Past meetings",
    base: "meetings",
    // Newest first; archived hubs' last, muted.
    rows: (ctx, owner) => meetingRows(ctx, owner, pastOnly(meetingsOn(ctx.tree, ctx.meetings, owner), ctx.today)),
    detail: (rows) => String(rows.length),
    empty: () => "No past meetings",
    add: null,
    limit: LIMIT,
    folded: true,
  },
  {
    key: "outcome",
    label: "Outcome",
    // A project's text: its first line, the rest under it (the note window edits it: e).
    rows: (ctx, hub) => outcomeRows(ctx, hub),
    detail: () => "",
    empty: () => "No outcome yet: what done looks like",
    add: { label: "Edit", plain: true },
  },
  {
    key: "openTasks",
    label: "Tasks",
    base: "tasks",
    // Open tasks only, each with what to chase (a chip) and what it takes; done ones are on History.
    rows: (ctx, owner) => tasksOn(ctx.tree, ctx.tasks, owner).filter((entry) => !entry.task.done)
      .flatMap((entry) => openTaskRows(ctx, owner, entry)),
    detail: (rows) => counted(rows.filter((row) => row.depth === 0 && row.task && !row.done).length, "open"),
    empty: () => "No open tasks",
    add: { label: "Task" },
    footer: (ctx, owner) => historyFooter(ctx, owner, "tasks", (n) => `Open and upcoming only · ${n} done`),
    limit: 12,
  },
  {
    key: "projectQuestions",
    label: "Open questions",
    base: "questions",
    rows: (ctx, owner) => openQuestionRows(ctx, owner),
    detail: (rows) => String(rows.length),
    empty: () => "No open questions",
    add: { label: "Question" },
    footer: (ctx, owner) => historyFooter(ctx, owner, "answered", (n) => `${n} answered`),
    limit: LIMIT,
  },
  {
    key: "nextMeetings",
    label: "Meetings",
    base: "meetings",
    // Two rows only: the next one still to come and the last one that has ended.
    rows: (ctx, owner) => nextAndLast(ctx, owner),
    // The heading counts them all; the rows are two.
    detail: (rows, ctx, owner) => String(ctx ? meetingsOn(ctx.tree, ctx.meetings, owner).filter((entry) => !entry.archived).length : rows.length),
    empty: () => "No meetings yet",
    add: { label: "Meeting" },
    // The Last row is History's newest meeting; the rest are earlier.
    footer: (ctx, owner) => historyFooter(ctx, owner, "meetings", (n) => `${Math.max(0, n - (endedMeetings(ctx, owner).length ? 1 : 0))} earlier`),
  },
  {
    key: "latestDecisions",
    label: "Decisions",
    base: "decisions",
    rows: (ctx, owner) => recordsOn(ctx.tree, ctx.records, owner, "decision").filter((entry) => !entry.archived)
      .slice(0, LATEST_DECISIONS).map((entry) => ({
        id: entry.note.id, title: entry.note.title, depth: 0, detail: "",
        chip: { text: dayChip(entry.record.day, ctx), tone: "neutral", lead: true },
      })),
    detail: (rows, ctx, owner) => String(ctx ? recordsOn(ctx.tree, ctx.records, owner, "decision").length : rows.length),
    empty: () => "No decisions yet",
    add: { label: "Decision" },
    footer: (ctx, owner) => historyFooter(ctx, owner, "decisions", (n) => `Latest ${LATEST_DECISIONS} shown · ${n} in all`),
  },
  {
    // Only a link on the Nothing yet line: its answered questions are on the History page.
    key: "projectAnswered",
    label: "Answered questions",
    rows: () => [],
    detail: () => "",
    empty: () => "Answered questions are on the History page",
    history: "answered",
  },
  {
    key: "projectPeople",
    label: "People",
    base: "people",
    // Each with their role and what is between us on this project: waiting on them, owed to them.
    rows: (ctx, hub) => projectPeopleRows(ctx, hub),
    detail: (rows) => String(rows.length),
    empty: () => "No people on this project yet",
    add: { label: "Person" },
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

// Under a person's Together: the same lists, shown once its "Backlinks n · Archived n" line opens.
HUB_SECTIONS.push(
  { ...HUB_SECTIONS.find((section) => section.key === "backlinks"), key: "togetherBacklinks", base: "backlinks", reveal: true },
  { ...HUB_SECTIONS.find((section) => section.key === "archived"), key: "togetherArchived", base: "archived", reveal: true, folded: false },
);

const BY_KEY = new Map(HUB_SECTIONS.map((section) => [section.key, section]));

export function sectionsFor(note) {
  if (!note) return [];
  return (SECTION_ORDER[note.kind ?? "note"] ?? []).map((key) => BY_KEY.get(key));
}

export function dashboardFor(note) {
  const layout = note ? DASHBOARD_LAYOUT[note.kind] : null;
  if (!layout) return null;
  const sections = (keys = []) => keys.map((key) => BY_KEY.get(key));
  return { wide: sections(layout.wide), cards: sections(layout.cards), act: sections(layout.act), know: sections(layout.know),
    emptyLine: layout.emptyLine ?? "lane" };
}

function questionRows(ctx, owner) {
  const today = localDay(ctx.today ?? new Date());
  return recordsOn(ctx.tree, ctx.records, owner, "question").map((entry) => {
    const open = isOpen(entry.record);
    return {
      id: entry.note.id,
      title: entry.note.title,
      depth: 0,
      detail: whereText(ctx, owner, entry).filter(Boolean).join(" · "),
      date: open ? `asked ${shortDay(entry.record.day, today)}` : `answered ${shortDay(entry.record.answered, today)}`,
      open,
      muted: entry.archived || !open,
      actions: open && !entry.archived ? [ANSWER] : [],
    };
  });
}

function meetingRows(ctx, owner, entries) {
  return entries.map(({ note, meeting, hub, archived }) => ({
    id: note.id,
    title: shortTitle(note, meeting),
    depth: 0,
    detail: [hub.id !== owner.id ? `on ${hub.title}` : "", attendeesText(attendeesOf(ctx.tree, ctx.meetings, note.id).length),
      archived ? "archived" : ""].filter(Boolean).join(" · "),
    date: whenText(meeting),
    muted: archived,
  }));
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
      shortDay(entry.record.day, localDay(ctx.today ?? new Date())), entry.hub.title].filter(Boolean).join(" · "),
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
    detail: [field === "agenda" ? "agenda" : "", hubOf(tree, note.id)?.title ?? "", changedDay(note.updated_at),
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
    detail: ["links here", hubOf(tree, note.id)?.title ?? "", changedDay(note.updated_at), archived ? "archived" : ""]
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

function upcomingOnly(entries, today = new Date()) {
  const day = localDay(today);
  const when = (entry) => `${entry.meeting.day} ${entry.meeting.time}`;
  return entries.filter((entry) => !entry.archived && entry.meeting.day >= day).sort((a, b) => when(a).localeCompare(when(b)));
}

function pastOnly(entries, today = new Date()) {
  const day = localDay(today);
  const when = (entry) => `${entry.meeting.day} ${entry.meeting.time}`;
  const past = entries.filter((entry) => !entry.archived && entry.meeting.day < day).sort((a, b) => when(b).localeCompare(when(a)));
  return [...past, ...entries.filter((entry) => entry.archived)];
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
      done ? `reached ${shortDay(milestone.done_day, today)}` : milestone.day < today ? "overdue" : ""].filter(Boolean).join(" · "),
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
  // Closed, a row shows who has it and its subtasks; opened (z), where it is and its next
  // block on the calendar too.
  const row = {
    id: note.id,
    title: task.title || "(no text)",
    depth: 0,
    detail: [subtaskText(entry), delegateText(ctx, task), open && note.id !== owner.id ? `in ${note.title}` : "",
      open ? nextBlockText(ctx, task.id) : "", archived ? "archived" : ""].filter(Boolean).join(" · "),
    date: task.done ? `done ${shortDay(task.done_day, localDay(ctx.today ?? new Date()))}`.trim() : dueText(ctx, task),
    muted: task.done || archived,
    late: isLate(ctx, task),
    task: task.id,
    done: task.done,
    expanded: open,
    snippet: open && task.notes ? task.notes : "",
    actions: archived ? [] : [task.done ? UNDONE : DONE, EDIT,
      task.delegate_id === null ? DELEGATE : TAKE_BACK, DELETE],
  };
  if (!open) return [row];
  // Opened, every level under it, each indented one step past the one above (hub.css).
  const subs = taskTree(ctx.tasks, task.id).map(({ task: sub, depth }) => ({
    id: note.id,
    title: sub.title || "(no text)",
    depth,
    detail: delegateText(ctx, sub),
    date: sub.done ? `done ${shortDay(sub.done_day, localDay(ctx.today ?? new Date()))}` : dueText(ctx, sub),
    muted: sub.done || archived,
    late: isLate(ctx, sub),
    task: sub.id,
    done: sub.done,
    actions: archived ? [] : [sub.done ? UNDONE : DONE, EDIT, sub.delegate_id === null ? DELEGATE : TAKE_BACK, DELETE],
  }));
  // Deeper subtasks are added on the task page (a on a row).
  const add = archived ? [] : [{ id: note.id, title: "+ Add subtask", depth: 1, detail: "", addSubtask: task.id, muted: true }];
  return [row, ...subs, ...add];
}

/** A person's own text, when it is the open note's (their Notes card). */
function personNotes(ctx, person) {
  return ctx.body?.id === person.id ? ctx.body.text : "";
}

/** A project's Outcome: its text's first line, the rest under it; one row, or none while empty. */
function outcomeRows(ctx, hub) {
  const body = ctx.body?.id === hub.id ? ctx.body.text : "";
  const first = outcomeLine(body);
  if (!first) return [];
  const lines = body.split("\n");
  const at = lines.findIndex((line) => line.trim() && !line.trim().startsWith("```"));
  const rest = lines.slice(at + 1).join("\n").trim();
  return [{ id: hub.id, title: first, depth: 0, detail: "", snippet: rest, outcome: true, actions: [{ key: "edit", label: "Edit" }] }];
}

/** An open task on a project's page: its chip (late, waiting on someone, due) and what it takes;
 * opened (z), where it is too; in an archived note, "archived" (why it is muted, with no actions). */
function openTaskRows(ctx, owner, entry) {
  const [row, ...rest] = taskRows(ctx, owner, entry);
  const where = row.expanded && entry.note.id !== owner.id ? `in ${entry.note.title}` : "";
  const detail = [subtaskText(entry), effortText(ctx, entry.task), where, entry.archived ? "archived" : ""];
  return [{ ...row, detail: detail.filter(Boolean).join(" · "), date: "", chip: taskChip(ctx, entry.task), late: false }, ...rest];
}

/** "2 d late" (danger), "Ben Ortiz · follow up Fri" (info), "due Fri" (caution today, else neutral), or null. */
export function taskChip(ctx, task) {
  const today = localDay(ctx.today ?? new Date());
  if (task.due && task.due < today) return { text: `${daysBetween(task.due, today)} d late`, tone: "danger" };
  if (task.delegate_id !== null && task.delegate_id !== undefined) {
    const person = ctx.tree.get(task.delegate_id);
    const follow = task.follow_up ? `follow up ${soonText(task.follow_up, today)}` : "";
    return { text: [person?.title ?? "", follow].filter(Boolean).join(" · "), tone: "info" };
  }
  if (task.due) return { text: task.due === today ? "due today" : `due ${soonText(task.due, today)}`, tone: task.due === today ? "caution" : "neutral" };
  return null;
}

/** "45 min · placed Fri" (its estimate, where its next block is), or "2 h placed" (its blocks from today on). */
function effortText(ctx, task) {
  const today = localDay(ctx.today ?? new Date());
  const blocks = (ctx.sessions ?? []).filter((session) => session.task_id === task.id && session.day >= today)
    .sort((a, b) => `${a.day} ${a.start}`.localeCompare(`${b.day} ${b.start}`));
  if (task.estimate_min) return [estimateText(task.estimate_min), blocks.length ? `placed ${soonText(blocks[0].day, today)}` : ""].filter(Boolean).join(" · ");
  const placed = blocks.reduce((sum, session) => sum + Math.max(0, clockMinutes(session.end) - clockMinutes(session.start)), 0);
  return placed ? `${estimateText(placed)} placed` : "";
}

function clockMinutes(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

/** "today", "Fri" within the week ahead, else "4 Dec". */
function soonText(day, today) {
  const away = daysBetween(today, day);
  if (away === 0) return "today";
  if (away > 0 && away < 7) return dayText(day, { today }).split(" ")[0];
  return shortDay(day, today);
}

/** A project's open questions: a "?" chip, the title, "asked 22 Nov · 4 d". */
function openQuestionRows(ctx, owner) {
  const today = localDay(ctx.today ?? new Date());
  return recordsOn(ctx.tree, ctx.records, owner, "question").filter((entry) => isOpen(entry.record) && !entry.archived)
    .map((entry) => ({
      id: entry.note.id, title: entry.note.title, depth: 0, detail: "", open: true,
      chip: { text: "?", tone: "question", lead: true },
      date: entry.record.day ? `asked ${shortDay(entry.record.day, today)} · ${Math.max(0, daysBetween(entry.record.day, today))} d` : "",
      actions: [ANSWER],
    }));
}

/** A now-and-next footer: History's count on its tab (so the two always agree), worded. */
function historyFooter(ctx, owner, tab, words) {
  const count = historyCounts(ctx, owner)[tab];
  return { text: words(count), tab, count };
}

function endedMeetings(ctx, owner) {
  return splitMeetings(meetingsOn(ctx.tree, ctx.meetings, owner), ctx.today ?? new Date()).ended;
}

/** Next: the next meeting still to come; Last: the last one that has ended. */
function nextAndLast(ctx, owner) {
  const { coming, ended } = splitMeetings(meetingsOn(ctx.tree, ctx.meetings, owner), ctx.today ?? new Date());
  const row = (lead, { note, meeting }) => ({
    id: note.id, title: shortTitle(note, meeting), depth: 0, lead,
    chip: { text: dayChip(meeting.day, ctx), tone: "neutral", lead: true },
    detail: `${attendeesOf(ctx.tree, ctx.meetings, note.id).length} attending`,
    date: meeting.time || "",
  });
  return [...(coming[0] ? [row("Next", coming[0])] : []), ...(ended[0] ? [row("Last", ended[0])] : [])];
}

/** "Mon 30 Nov": a row's day chip. */
function dayChip(day, ctx) {
  return dayText(day, { today: localDay(ctx.today ?? new Date()) });
}

/** A project's people: initials, name, "role · 2 waiting / 1 owed" (on this project). */
function projectPeopleRows(ctx, hub) {
  const { tree, people, tasks } = ctx;
  const scope = new Set([hub.id, ...tree.inOrder(hub.id).map((note) => note.id)]);
  return peopleOn(tree, people, hub).map(({ person, roles, archived }) => {
    const own = roles.find((each) => each.via === null);
    const waiting = tasks ? waitingOn(tree, tasks, person.id).filter((entry) => scope.has(entry.task.note_id)).length : 0;
    const owed = tasks ? owedTo(tree, tasks, person.id).filter((entry) => scope.has(entry.task.note_id)).length : 0;
    return {
      id: person.id, title: person.title, depth: 0, avatar: initials(person.title),
      detail: [rolesText(roles), waiting || owed ? `${waiting} waiting / ${owed} owed` : ""].filter(Boolean).join(" · "),
      muted: archived, role: own?.role ?? "", actions: own ? [ROLE, REMOVE] : [],
    };
  });
}

/** A follow-up's chip on They owe me: "Follow up Mon", "Follow up · 4 d late" (info either way). */
function followChips(day, today) {
  if (!day) return [];
  const late = daysBetweenDays(day, today);
  return [{ text: late > 0 ? `Follow up · ${late} d late` : `Follow up ${soonDay(day, today)}`, tone: "info" }];
}

/** A due day's chip on I owe: "Overdue 1 d" (danger), "Due Mon" (caution). */
function dueChips(day, today) {
  if (!day) return [];
  const late = daysBetweenDays(day, today);
  return [late > 0 ? { text: `Overdue ${late} d`, tone: "danger" } : { text: `Due ${soonDay(day, today)}`, tone: "caution" }];
}

function daysBetweenDays(from, to) {
  const serial = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
  };
  return serial(to) - serial(from);
}

/** "45 min placed Mon": a task's next block on the calendar, from today on; "not placed". */
function placedText(ctx, taskId) {
  const today = localDay(ctx.today ?? new Date());
  const next = (ctx.sessions ?? []).filter((session) => session.task_id === taskId && session.day >= today)
    .sort((a, b) => `${a.day} ${a.start}`.localeCompare(`${b.day} ${b.start}`))[0];
  if (!next) return "not placed";
  const minutes = (time) => {
    const [h, m] = String(time).split(":").map(Number);
    return h * 60 + m;
  };
  const length = minutes(next.end) - minutes(next.start);
  return `${length >= 0 ? `${length} min ` : ""}placed ${soonDay(next.day, today)}`;
}

/** A person's Together card: hubs, Last together, Meetings this month, Backlinks · Archived. */
function togetherRows(ctx, person) {
  const { tree, people, meetings } = ctx;
  const now = ctx.today ?? new Date();
  const hubs = hubLinks(tree, people, person.id).filter((link) => !link.archived).map(({ hub, role }) => ({
    id: hub.id, title: hub.title, depth: 0, role,
    detail: [groupForKind(hub.kind).label, role].filter(Boolean).join(" · "),
    actions: [ROLE, REMOVE],
  }));
  const last = meetings ? lastTogether(tree, meetings, person.id, now) : null;
  const lastRow = last ? [{ id: last.note.id, title: "Last together", depth: 0,
    detail: `${shortTitle(last.note, last.meeting)} · ${dayText(last.meeting.day, { today: localDay(now) })}` }] : [];
  const month = meetings ? meetingsThisMonth(tree, meetings, person.id, now) : 0;
  const archived = referencedIn(ctx, person).filter((row) => row.archived).length;
  return [...hubs, ...lastRow,
    { id: person.id, title: "Meetings this month", depth: 0, detail: String(month), inert: true },
    { id: person.id, title: `Backlinks ${backlinks(ctx, person).length} · Archived ${archived}`, depth: 0, muted: true, reveal: true }];
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

/** An area's Projects table: health, latest status, updated, next milestone, open. */
function projectCells(ctx, project) {
  const today = localDay(ctx.today ?? new Date());
  const next = nextMilestone(ctx.tree, plan(ctx), project.id);
  const tasks = ctx.tasks ? openCount(ctx.tree, ctx.tasks, project) : 0;
  const questions = ctx.records ? recordsOn(ctx.tree, ctx.records, project, "question").filter((entry) => isOpen(entry.record)).length : 0;
  const health = healthOf(ctx.statusLogs ?? new StatusLogs(), project, today);
  return [health.label, health.entry ? firstSentence(health.entry.text) : "log one", health.entry ? daysAgo(health.entry.day, today) : "",
    next ? `◆ ${next.note.title} ${shortDay(next.milestone.day, today)}` : "",
    [tasks ? String(tasks) : "", questions ? `${questions}?` : ""].filter(Boolean).join(" · ")];
}

/** Each cell's look: the health in its colour, "log one" as an action, a stale day in red. */
function projectCellClasses(ctx, project) {
  const health = healthOf(ctx.statusLogs ?? new StatusLogs(), project, localDay(ctx.today ?? new Date()));
  return [`health health--${health.key}`, health.entry ? "" : "hub__cell--action", health.stale ? "hub__cell--late" : "", "", ""];
}

/** Where I am: the newest entry boxed, two older ones a line each, then History (n). */
function statusRows(ctx, hub) {
  const today = localDay(ctx.today ?? new Date());
  const entries = (ctx.statusLogs ?? new StatusLogs()).of(hub.id);
  return [
    ...entries.slice(0, 3).map((entry, index) => ({
      id: hub.id, title: healthLabel(entry.health), depth: 0, health: entry.health, statusEntry: entry.id,
      date: index ? dayText(entry.day, { today }) : "",
      detail: index ? firstSentence(entry.text) : `${dayText(entry.day, { today })} · ${daysAgo(entry.day, today)}`,
      snippet: index ? "" : entry.text,
      box: index === 0,
    })),
    ...(entries.length > 3 ? [{ id: hub.id, title: `History (${entries.length})`, depth: 0, detail: "", statusHistory: true }] : []),
  ];
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

/** When a note last changed, on screen: "20 Oct" ("20 Oct 2025" in another year). */
function changedDay(iso) {
  return dayText(dayOf(iso), { weekday: false });
}

/** "2026-11-21": the local day of an ISO time ("" when there is none). */
export function dayOf(iso) {
  const when = iso ? new Date(iso) : null;
  if (!when || Number.isNaN(when.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

// A linked folder's row: "📁 Contracts", what it holds, its path on hover.
function folderRows(files, owner) {
  if (owner.kind !== "project" && owner.kind !== "area") return [];
  return foldersOf(files, owner.id).map((folder) => {
    const { files: count, attached } = folderSummary(files, folder.id);
    return {
      id: owner.id,
      title: `📁 ${folder.name}`,
      depth: 0,
      detail: ["OneDrive folder", `${count} file${count === 1 ? "" : "s"}`, attached ? `${attached} on notes` : ""].filter(Boolean).join(" · "),
      tip: folder.path,
      folder: folder.id,
      actions: [{ key: "remove", label: "Unlink" }],
    };
  });
}

function fileRows(ctx, owner) {
  return filesOn(ctx.tree, ctx.files ?? new Files(), owner).map(({ file, folder, own, via, others }) => ({
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
  }));
}
