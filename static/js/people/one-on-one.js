// A person as 1:1 prep: what they owe me (Waiting on), what I owe them (tasks for them), what
// to raise with them next time (topics, and open questions they are on), and when we next
// meet. Pure.
//
//   owedTo(tree, tasks, personId)               [task entry] open tasks of mine for them
//   toRaise(ctx, personId)                      [{ kind: "topic" | "question", id, title,
//                                               detail, topic?, note? }] topics not raised yet
//                                               (oldest first), then open questions they are on
//   nextTogether(tree, meetings, personId, today)   the next meeting they attend (today
//                                               included), or null: { note, meeting }
//   firstName(person)                           "Priya"
import { allMeetings } from "../meetings/meetings-model.js";
import { isOpen, recordsOn } from "../records/records-model.js";
import { taskEntries } from "../tasks/tasks-model.js";

function dayString(today) {
  if (typeof today === "string") return today;
  const pad = (n) => String(n).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

export function firstName(person) {
  return person?.title.split(/\s+/)[0] ?? "";
}

export function owedTo(tree, tasks, personId) {
  return taskEntries(tree, tasks).filter((entry) => !entry.archived && !entry.task.done && entry.task.delegate_id === null
    && entry.task.for_person_id === personId);
}

export function toRaise({ tree, topics = [], records }, personId) {
  const person = tree.get(personId);
  const open = topics.filter((topic) => topic.person_id === personId && !topic.raised_at).map((topic) => ({
    kind: "topic", id: topic.source_note_id ?? personId, title: topic.text, topic: topic.id,
    detail: topic.source_note_id && tree.has(topic.source_note_id) ? `from ${tree.get(topic.source_note_id).title}` : "added by hand",
  }));
  const questions = person && records ? recordsOn(tree, records, person, "question")
    .filter((entry) => isOpen(entry.record) && !entry.archived).map((entry) => ({
      kind: "question", id: entry.note.id, title: entry.note.title, detail: `open question · ${entry.record.day}`, note: entry.note,
    })) : [];
  return [...open, ...questions];
}

export function nextTogether(tree, meetings, personId, today) {
  const day = dayString(today);
  return allMeetings(tree, meetings)
    .filter(({ meeting, archived }) => !archived && !meeting.cancelled && meeting.day >= day && meeting.attendees.includes(personId))
    .sort((a, b) => `${a.meeting.day} ${a.meeting.time || "99"}`.localeCompare(`${b.meeting.day} ${b.meeting.time || "99"}`))[0] ?? null;
}
