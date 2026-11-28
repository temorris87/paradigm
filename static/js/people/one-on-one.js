// A person as 1:1 prep: what they owe me (Waiting on), what I owe them (tasks for them), what
// to raise with them next time (topics, and open questions they are on), and when we next
// meet. Pure.
//
// "Still to come" is by the clock, not the day: a meeting counts until it has ended (its day
// and end_time, else its time, else the whole day). Cancelled and archived meetings never
// count as still to come. now is a Date (a "YYYY-MM-DD" string reads as that day's midnight).
//
//   owedTo(tree, tasks, personId)               [task entry] open tasks of mine for them
//   toRaise(ctx, personId)                      [{ kind: "topic" | "question", id, title,
//                                               detail, topic?, note? }] topics not raised yet
//                                               (oldest first), then open questions they are on
//   stillToCome(meeting, now)                   whether it has not ended yet
//   endedCount(tree, meetings, now)             how many meetings (cancelled left out) have ended:
//                                               when it moves, a still-to-come one has ended
//   upcomingWith(tree, meetings, personId, now) [{ note, meeting }] still to come, soonest first
//   nextTogether(tree, meetings, personId, now) the first of those, or null
//   isOneOnOne(entry, personId)                 they attend, and alone or "1:1" in the title
//   nextOneOnOne(tree, meetings, personId, now) the next 1:1 still to come, or null
//   beforeThat(tree, meetings, personId, now)   the next other meeting with them that starts
//                                               before that 1:1, or null (none with no 1:1)
//   lastTogether(tree, meetings, personId, now) the last meeting with them that has ended
//   meetingsThisMonth(tree, meetings, personId, now)   this calendar month's, cancelled left out
//   dueSummary(days, today)                     { count, late, lateDays, earliest, soon } of
//                                               the follow-up or due days of a list of tasks
//   soonDay(day, today)                         "today", "tomorrow", "Mon" (this week), "Tue 8 Dec"
//   firstName(person)                           "Priya"
import { allMeetings } from "../meetings/meetings-model.js";
import { isOpen, recordsOn } from "../records/records-model.js";
import { taskEntries } from "../tasks/tasks-model.js";
import { dayText } from "../ui/dates.js";

// Due or followed up within this many days (today included) counts as "soon".
export const SOON_DAYS = 7;

const pad = (n) => String(n).padStart(2, "0");

function dayString(today) {
  if (typeof today === "string") return today.slice(0, 10);
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/** "2026-11-27 14:05": a moment as text, so moments compare as strings. */
function momentOf(now) {
  if (typeof now === "string") return `${now.slice(0, 10)} 00:00`;
  return `${dayString(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const startOf = (meeting) => `${meeting.day} ${meeting.time || "00:00"}`;
// With no time it lasts the whole day; "24:00" sorts after every time of that day.
const endOf = (meeting) => `${meeting.day} ${meeting.end_time || meeting.time || "24:00"}`;

function serial(day) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Whole days from a to b ("YYYY-MM-DD" each). */
function daysFrom(a, b) {
  return serial(b) - serial(a);
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

export function stillToCome(meeting, now) {
  return Boolean(meeting.day) && endOf(meeting) > momentOf(now);
}

export function endedCount(tree, meetings, now) {
  const at = momentOf(now);
  return allMeetings(tree, meetings).filter(({ meeting }) => meeting && !meeting.cancelled && meeting.day && endOf(meeting) <= at).length;
}

function withThem(tree, meetings, personId) {
  return allMeetings(tree, meetings).filter(({ meeting }) => !meeting.cancelled && meeting.attendees.includes(personId));
}

export function upcomingWith(tree, meetings, personId, now) {
  return withThem(tree, meetings, personId)
    .filter(({ meeting, archived }) => !archived && stillToCome(meeting, now))
    .sort((a, b) => startOf(a.meeting).localeCompare(startOf(b.meeting)));
}

export function nextTogether(tree, meetings, personId, now) {
  return upcomingWith(tree, meetings, personId, now)[0] ?? null;
}

export function isOneOnOne({ note, meeting }, personId) {
  if (!meeting.attendees.includes(personId)) return false;
  return meeting.attendees.length === 1 || /1:1/i.test(note.title);
}

export function nextOneOnOne(tree, meetings, personId, now) {
  return upcomingWith(tree, meetings, personId, now).find((entry) => isOneOnOne(entry, personId)) ?? null;
}

export function beforeThat(tree, meetings, personId, now) {
  const upcoming = upcomingWith(tree, meetings, personId, now);
  const oneOnOne = upcoming.find((entry) => isOneOnOne(entry, personId));
  if (!oneOnOne) return null;
  const other = upcoming.find((entry) => !isOneOnOne(entry, personId));
  return other && startOf(other.meeting) < startOf(oneOnOne.meeting) ? other : null;
}

export function lastTogether(tree, meetings, personId, now) {
  const at = momentOf(now);
  return withThem(tree, meetings, personId).filter(({ meeting }) => meeting.day && endOf(meeting) <= at)
    .sort((a, b) => startOf(b.meeting).localeCompare(startOf(a.meeting)))[0] ?? null;
}

export function meetingsThisMonth(tree, meetings, personId, now) {
  const month = dayString(now).slice(0, 7);
  return withThem(tree, meetings, personId).filter(({ meeting }) => String(meeting.day).startsWith(month)).length;
}

export function dueSummary(days, today) {
  const day = dayString(today);
  const dated = days.filter(Boolean).sort();
  const late = dated.filter((each) => each < day);
  return {
    count: days.length,
    late: late.length,
    lateDays: late.length ? daysFrom(late[0], day) : 0,
    earliest: dated[0] ?? "",
    soon: dated.filter((each) => each >= day && daysFrom(day, each) < SOON_DAYS).length,
  };
}

export function soonDay(day, today) {
  const from = dayString(today);
  const ahead = daysFrom(from, day);
  if (ahead === 0) return "today";
  if (ahead === 1) return "tomorrow";
  if (ahead > 1 && ahead < SOON_DAYS) return dayText(day, { today: from }).split(" ")[0];
  return dayText(day, { today: from });
}
