// What to bring to a meeting, from its attendees: the open questions they are on, the tasks
// delegated to them still open (late past their follow-up), and what happened last time (the
// meeting of the same name in the same hub just before it: its decisions and tasks). Pure.
//
//   prepFor(ctx, meetingId, today)   { questions: [record entry], waiting: [task entry + late],
//                                    last: { note, meeting, decisions: [note], tasks, done } | null }
//   prepText(prep)                   "prep: 1 question, 1 follow-up" ("" with nothing)
import { titleKey } from "../notes/titles.js";
import { isOpen, recordsOn } from "../records/records-model.js";
import { taskEntries } from "../tasks/tasks-model.js";
import { allMeetings, attendeesOf } from "./meetings-model.js";

function dayString(today) {
  if (typeof today === "string") return today;
  const pad = (n) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

export function prepFor(ctx, meetingId, today) {
  const { tree, meetings, records, tasks } = ctx;
  const note = tree.get(meetingId);
  const meeting = meetings?.get(meetingId);
  if (!note || !meeting) return { questions: [], waiting: [], last: null };
  const day = dayString(today);
  const people = new Set(attendeesOf(tree, meetings, meetingId).map((person) => person.id));
  const questions = records ? [...people].flatMap((id) => recordsOn(tree, records, tree.get(id), "question"))
    .filter((entry, index, all) => isOpen(entry.record) && !entry.archived && all.findIndex((each) => each.note.id === entry.note.id) === index)
    .sort((a, b) => a.record.day.localeCompare(b.record.day)) : [];
  const waiting = tasks ? taskEntries(tree, tasks)
    .filter((entry) => !entry.task.done && !entry.archived && people.has(entry.task.delegate_id))
    .map((entry) => ({ ...entry, late: Boolean(entry.task.follow_up && entry.task.follow_up < day) }))
    .sort((a, b) => (a.task.follow_up || "9999").localeCompare(b.task.follow_up || "9999")) : [];
  return { questions, waiting, last: lastTime(ctx, note, meeting) };
}

/** The same-named meeting in the same hub just before this one, with what came of it. */
function lastTime({ tree, meetings, records, tasks }, note, meeting) {
  const key = titleKey(note.title);
  const hub = tree.parentId(note.id);
  const earlier = allMeetings(tree, meetings)
    .filter((entry) => entry.note.id !== note.id && tree.parentId(entry.note.id) === hub && titleKey(entry.note.title) === key
      && !entry.meeting.cancelled && `${entry.meeting.day} ${entry.meeting.time}` < `${meeting.day} ${meeting.time}`)
    .sort((a, b) => `${b.meeting.day} ${b.meeting.time}`.localeCompare(`${a.meeting.day} ${a.meeting.time}`))[0];
  if (!earlier) return null;
  const decisions = records ? recordsOn(tree, records, earlier.note, "decision").map((entry) => entry.note) : [];
  const own = tasks ? taskEntries(tree, tasks).filter((entry) => entry.task.note_id === earlier.note.id && entry.depth === 0) : [];
  return { note: earlier.note, meeting: earlier.meeting, decisions, tasks: own.length, done: own.filter((entry) => entry.task.done).length };
}

export function prepText(prep) {
  const parts = [];
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (prep.questions.length) parts.push(plural(prep.questions.length, "question"));
  if (prep.waiting.length) parts.push(plural(prep.waiting.length, "follow-up"));
  return parts.length ? `prep: ${parts.join(", ")}` : "";
}
