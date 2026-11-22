// What the Home page lists, read from the notes tree, the meetings and the records. Only live
// notes count: anything in an archived hub is left out. today is a Date (passed in). Pure.
//
//   todayMeetings(tree, meetings, today)   [meeting entry]: timed ones by time, then untimed
//   openQuestions(tree, records)           [record entry], oldest first
//   projectsByArea(tree)                   [{ area | null, projects: [note] }]: areas by title
//                                          (only those with live projects), "no area" last
//   projectFacts(tree, meetings, records, projectId, today)
//                                          { openQuestions: n, next: meeting | null }
//   inboxNotes(tree)                       the unfiled top-level notes, newest change first
//   daysSince(day, today)                  whole days from a "YYYY-MM-DD" day to today
import { areaOf, projectsIn } from "../hubs/hub-areas.js";
import { HUB_GROUPS, hubsIn } from "../notes/hub-groups.js";
import { titleKey } from "../notes/titles.js";
import { dateOf, localDay } from "../meetings/meeting-days.js";
import { allMeetings } from "../meetings/meetings-model.js";
import { allOfKind, isOpen, questionOrder } from "../records/records-model.js";

const INBOX = HUB_GROUPS.find((group) => group.kind === null);
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayMeetings(tree, meetings, today) {
  const day = localDay(today);
  return allMeetings(tree, meetings)
    .filter((entry) => !entry.archived && entry.meeting.day === day)
    .sort((a, b) => byWhen(a.meeting, b.meeting) || titleKey(a.note.title).localeCompare(titleKey(b.note.title)));
}

export function openQuestions(tree, records) {
  return allOfKind(tree, records, "question")
    .filter((entry) => !entry.archived && isOpen(entry.record))
    .sort(questionOrder);
}

export function projectsByArea(tree) {
  const live = tree.children(null).filter((note) => note.kind === "project" && !note.archived_at);
  const areas = tree.children(null).filter((note) => note.kind === "area" && !note.archived_at);
  const groups = areas
    .map((area) => ({ area, projects: projectsIn(tree, area.id) }))
    .filter((group) => group.projects.length);
  // A project whose area was archived after it went in has no live area to sit under.
  const loose = live.filter((project) => !areaOf(tree, project.id) || areaOf(tree, project.id).archived_at);
  if (loose.length) groups.push({ area: null, projects: loose });
  return groups;
}

export function projectFacts(tree, meetings, records, projectId, today) {
  const day = localDay(today);
  const openCount = openQuestions(tree, records).filter((entry) => entry.hub.id === projectId).length;
  const upcoming = allMeetings(tree, meetings)
    .filter((entry) => entry.hub.id === projectId && entry.meeting.day >= day)
    .map((entry) => entry.meeting)
    .sort(byWhen);
  return { openQuestions: openCount, next: upcoming[0] ?? null };
}

export function inboxNotes(tree) {
  return hubsIn(tree, INBOX)
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")) || a.id - b.id);
}

export function daysSince(day, today) {
  const then = dateOf(day);
  if (!then) return null;
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Rounded: a day with a daylight-saving change is 23 or 25 hours long.
  return Math.round((now - then) / DAY_MS);
}

/** Earlier day first; on a day, timed meetings by time, then the untimed ones. */
function byWhen(a, b) {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  if (!a.time !== !b.time) return a.time ? -1 : 1;
  return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
}
