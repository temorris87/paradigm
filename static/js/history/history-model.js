// A project's History page (&history=ID): every dated thing the project has, as rows grouped
// by week, newest first, with tabs, counts and a search. Everything comes from the lists the
// main window already holds; only the drawing is paged, 4 weeks at a time. Pure.
//
//   HISTORY_TABS                    [{ key, label }]: everything, meetings, tasks, decisions, answered
//   PAGE_WEEKS                      weeks drawn at first, and added each time the list nears its foot
//   historyRows(ctx, project, { answers })   [row], newest first; row: { key, kind, day, seq, title,
//                                   detail, chip: { text, tone }, tab, open: { task } | { note } | { status } }
//                                   answers: Map of a question's id -> its answer's first line
//                                   (read from its note on the page; "" until then)
//   tabCounts(rows)                 { everything, meetings, tasks, decisions, answered }
//   filterRows(rows, tab, query)    the tab's rows whose title or detail holds the query's words
//   weekGroups(rows, today)         [{ monday, label, rows }]: "This week · 23–29 Nov", "16–22 Nov"
//   pageOf(groups, weeks)           { groups: the first weeks, more: whether any are left }
//   historyCounts(ctx, project)     tabCounts of its rows: the project page's footers say these
//   answerLine(body)                a question's answer, first line: the server adds the answer
//                                   as the note's last paragraph ("" when it has no text)
import { HEAD_HEALTH } from "../hubs/project-facts.js";
import { localDay, meetingEnded } from "../meetings/meeting-days.js";
import { attendeesOf, meetingsOn, shortTitle } from "../meetings/meetings-model.js";
import { addDays, milestonesOf } from "../plan/plan-model.js";
import { decisionOrder, isOpen, recordsOn } from "../records/records-model.js";
import { StatusLogs, firstSentence } from "../status/status-model.js";
import { taskEntries } from "../tasks/tasks-model.js";
import { weekRange } from "../ui/dates.js";

export const HISTORY_TABS = Object.freeze([
  { key: "everything", label: "Everything" },
  { key: "meetings", label: "Meetings" },
  { key: "tasks", label: "Done tasks" },
  { key: "decisions", label: "Decisions" },
  { key: "answered", label: "Answered" },
]);

export const PAGE_WEEKS = 4;

// Within a day, the rows read in this order; within a kind, the later one first (seq: a status
// log's or task's id, a meeting's time, a note's id: only compared within one kind).
const KIND_ORDER = { status: 0, milestone: 1, meeting: 2, decision: 3, answered: 4, task: 5 };

export function historyRows(ctx, project, { answers = new Map() } = {}) {
  const now = ctx.today ?? new Date();
  const rows = [
    ...doneTaskRows(ctx, project),
    ...meetingRows(ctx, project, now),
    ...decisionRows(ctx, project),
    ...answeredRows(ctx, project, answers),
    ...statusRows(ctx, project),
    ...milestoneRows(ctx, project, now),
  ];
  return rows.filter((row) => row.day).sort((a, b) => b.day.localeCompare(a.day)
    || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || withinKind(a, b) || a.title.localeCompare(b.title));
}

/** Decisions in the order the project page lists them (records-model.js); the rest by seq. */
function withinKind(a, b) {
  if (a.kind === "decision") return decisionOrder({ day: a.day, id: a.seq }, { day: b.day, id: b.seq });
  return b.seq - a.seq;
}

/** The notes whose things are the project's: itself and everything inside it. */
function scopeOf(tree, project) {
  return new Set([project.id, ...tree.inOrder(project.id).map((note) => note.id)]);
}

function doneTaskRows({ tree, tasks }, project) {
  if (!tasks) return [];
  const scope = scopeOf(tree, project);
  return taskEntries(tree, tasks).filter((entry) => entry.task.done && scope.has(entry.task.note_id)).map((entry) => {
    const delegate = entry.task.delegate_id === null ? null : tree.get(entry.task.delegate_id);
    return {
      key: `task:${entry.task.id}`, kind: "task", tab: "tasks", day: entry.task.done_day || "", seq: entry.task.id,
      title: entry.task.title || "(no text)",
      detail: entry.parent ? `subtask of ${entry.parent.title || "(no text)"}` : delegate ? `delegated to ${delegate.title}` : "",
      chip: { text: "Done", tone: "success" },
      open: { task: entry.task.id },
    };
  });
}

function meetingRows(ctx, project, now) {
  const { tree, meetings } = ctx;
  if (!meetings) return [];
  return meetingsOn(tree, meetings, project).filter((entry) => entry.hub.id === project.id && meetingEnded(entry.meeting, now))
    .map(({ note, meeting }) => ({
      key: `meeting:${note.id}`, kind: "meeting", tab: "meetings", day: meeting.day, seq: timeSeq(meeting.time),
      title: shortTitle(note, meeting),
      detail: [meeting.cancelled ? "cancelled" : "", `${attendeesOf(tree, meetings, note.id).length} attending`, capturedText(ctx, note)]
        .filter(Boolean).join(" · "),
      chip: { text: "Meeting", tone: "info" },
      open: { note: note.id },
    }));
}

/** "14:30" as 1430, to put a day's later meeting first (one without a time goes last). */
function timeSeq(time) {
  const value = Number(String(time ?? "").replace(":", ""));
  return time && Number.isFinite(value) ? value : -1;
}

/** "2 tasks, 1 question captured": what came out of a meeting ("" when nothing did). */
function capturedText({ tree, tasks, records }, meeting) {
  const counts = [
    [tasks ? tasks.all().filter((task) => task.note_id === meeting.id).length : 0, "task"],
    [records ? recordsOn(tree, records, meeting, "decision").length : 0, "decision"],
    [records ? recordsOn(tree, records, meeting, "question").length : 0, "question"],
  ].filter(([n]) => n);
  return counts.length ? `${counts.map(([n, word]) => `${n} ${word}${n === 1 ? "" : "s"}`).join(", ")} captured` : "";
}

function decisionRows({ tree, records, meetings }, project) {
  if (!records) return [];
  return recordsOn(tree, records, project, "decision").map(({ note, record, meeting, source }) => {
    const from = meeting ? (meetings ? shortTitle(meeting, meetings.get(meeting.id)) : meeting.title) : source?.title ?? "";
    return {
      key: `decision:${note.id}`, kind: "decision", tab: "decisions", day: record.day, seq: note.id,
      title: note.title, detail: from ? `from ${from}` : "",
      chip: { text: "Decision", tone: "decision" },
      open: { note: note.id },
    };
  });
}

function answeredRows({ tree, records }, project, answers) {
  if (!records) return [];
  return recordsOn(tree, records, project, "question").filter((entry) => !isOpen(entry.record)).map(({ note, record }) => ({
    key: `answered:${note.id}`, kind: "answered", tab: "answered", day: record.answered, seq: note.id,
    title: note.title, detail: answers.get(note.id) ?? "",
    chip: { text: "Answered", tone: "question" },
    open: { note: note.id },
    question: note.id,
  }));
}

function statusRows({ statusLogs }, project) {
  return (statusLogs ?? new StatusLogs()).of(project.id).map((entry) => {
    const health = HEAD_HEALTH[entry.health] ?? HEAD_HEALTH.on_track;
    return {
      key: `status:${entry.id}`, kind: "status", tab: "status", day: entry.day, seq: entry.id,
      title: firstSentence(entry.text) || health.label, detail: "status log",
      chip: { text: health.label, tone: health.tone },
      open: { status: entry.id },
    };
  });
}

/** Milestones reached, or whose day has come: the plan's dated points so far. */
function milestoneRows({ tree, plan }, project, now) {
  if (!plan) return [];
  const today = dayString(now);
  return milestonesOf(tree, plan, project.id).filter(({ milestone }) => milestone.done_day || milestone.day <= today)
    .map(({ note, milestone, phase }) => ({
      key: `milestone:${note.id}`, kind: "milestone", tab: "milestones", day: milestone.done_day || milestone.day, seq: note.id,
      title: note.title, detail: phase ? phase.title : "",
      chip: { text: "Milestone", tone: "info" },
      open: { note: note.id },
    }));
}

export function historyCounts(ctx, project) {
  return tabCounts(historyRows(ctx, project));
}

export function tabCounts(rows) {
  const counts = { everything: rows.length };
  for (const { key } of HISTORY_TABS.slice(1)) counts[key] = rows.filter((row) => row.tab === key).length;
  return counts;
}

export function filterRows(rows, tab = "everything", query = "") {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => (tab === "everything" || row.tab === tab)
    && words.every((word) => `${row.title} ${row.detail}`.toLowerCase().includes(word)));
}

export function weekGroups(rows, today = new Date()) {
  const thisWeek = mondayOf(dayString(today));
  const groups = [];
  for (const row of rows) {
    const monday = mondayOf(row.day);
    let group = groups.at(-1);
    if (group?.monday !== monday) {
      const span = weekRange(monday, dayString(today), { year: false });
      group = { monday, label: monday === thisWeek ? `This week · ${span}` : span, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

export function pageOf(groups, weeks = PAGE_WEEKS) {
  return { groups: groups.slice(0, weeks), more: groups.length > weeks };
}

function dayString(today) {
  return typeof today === "string" ? today : localDay(today);
}

/** The Monday of a day's week. */
function mondayOf(day) {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

export function answerLine(body) {
  const paragraphs = String(body ?? "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const first = paragraphs.at(-1)?.split("\n")[0] ?? "";
  return first.replace(/^(#+|[-*>]|\d+\.)\s+/, "").trim();
}
