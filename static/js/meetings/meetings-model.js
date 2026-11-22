// Meetings read together with the notes tree. A meeting's title, place and archived state
// are its note's (in the tree); its day, time and attendees come from /api/meetings. Its hub
// is its top-level note, and it counts only while that is a hub. Pure.
//
//   const meetings = new Meetings(await meetingsApi.list());
//   meetings.get(id)                          { id, day, time, attendees: [person ids] }
//   allMeetings(tree, meetings)               [entry], newest first; entry: { note, meeting,
//                                             hub, archived }
//   meetingsOn(tree, meetings, hub)           a hub's (an area: its projects' too)
//   meetingsWith(tree, meetings, personId)    the meetings a person attended
//   attendeesOf(tree, meetings, meetingId)    their notes, by name
//   shortTitle(note, meeting)                 the title without its leading date
//   filterMeetings(tree, meetings, filters, today)   the Meetings page's list
//   meetingFilterHubs(tree, meetings)         what its Hub dropdown offers
import { hubOf, isArchived, isMeeting, isPerson } from "../notes/hub-groups.js";
import { titleKey } from "../notes/titles.js";
import { hubScope } from "../people/people-model.js";
import { inRange, periodRange } from "./meeting-days.js";

const NO_MEETING = Object.freeze({ day: "", time: "", attendees: [] });

export class Meetings {
  constructor(list = []) {
    this.byId = new Map(list.map((meeting) => [meeting.id, meeting]));
  }

  /** The meeting's record; no day and no one when the list hasn't caught up. */
  get(id) {
    return this.byId.get(id) ?? { ...NO_MEETING, id };
  }
}

export function allMeetings(tree, meetings) {
  return tree.inOrder()
    .filter((note) => isMeeting(tree, note.id) && hubOf(tree, note.id))
    .map((note) => ({ note, meeting: meetings.get(note.id), hub: hubOf(tree, note.id), archived: isArchived(tree, note.id) }))
    .sort(newestFirst);
}

/** A hub's meetings, newest first, the archived ones last. */
export function meetingsOn(tree, meetings, hub) {
  const scope = hubScope(tree, hub.id);
  return archivedLast(allMeetings(tree, meetings).filter((entry) => scope.includes(entry.hub.id)));
}

export function meetingsWith(tree, meetings, personId) {
  return archivedLast(allMeetings(tree, meetings).filter((entry) => entry.meeting.attendees.includes(personId)));
}

export function attendeesOf(tree, meetings, meetingId) {
  return meetings.get(meetingId).attendees
    .filter((id) => isPerson(tree, id))
    .map((id) => tree.get(id))
    .sort((a, b) => titleKey(a.title).localeCompare(titleKey(b.title)));
}

/** "Kickoff" for "2026-11-24 Kickoff" on the 24th: for lists that show the date beside it. */
export function shortTitle(note, meeting) {
  const prefix = `${meeting.day} `;
  return meeting.day && note.title.startsWith(prefix) && note.title.length > prefix.length
    ? note.title.slice(prefix.length) : note.title;
}

/** "3 attendees" */
export function attendeesText(n) {
  if (n === 0) return "no attendees";
  return n === 1 ? "1 attendee" : `${n} attendees`;
}

/**
 * The Meetings page's list: meetings that match every filter that is set, newest first.
 * filters: { hubId: number | null, period: PERIODS key | "", title: string }; today: a Date.
 * A hub filter on an area includes its projects. Meetings in archived hubs are left out.
 */
export function filterMeetings(tree, meetings, { hubId = null, period = "", title = "" } = {}, today = new Date()) {
  const scope = hubId === null ? null : hubScope(tree, hubId);
  const range = periodRange(period, today);
  const wanted = titleKey(title.trim());
  return allMeetings(tree, meetings).filter((entry) => !entry.archived
    && (!scope || scope.includes(entry.hub.id))
    && inRange(entry.meeting.day, range)
    && (!wanted || titleKey(entry.note.title).includes(wanted)));
}

/** The live hubs with meetings (an area also when only its projects have some), by title. */
export function meetingFilterHubs(tree, meetings) {
  const used = new Set(allMeetings(tree, meetings).filter((entry) => !entry.archived).map((entry) => entry.hub.id));
  return tree.children(null).filter((note) => hubOf(tree, note.id) && !isArchived(tree, note.id)
    && hubScope(tree, note.id).some((id) => used.has(id)));
}

function newestFirst(a, b) {
  const when = (entry) => `${entry.meeting.day} ${entry.meeting.time}`;
  return when(b).localeCompare(when(a)) || titleKey(a.note.title).localeCompare(titleKey(b.note.title));
}

function archivedLast(entries) {
  return [...entries.filter((entry) => !entry.archived), ...entries.filter((entry) => entry.archived)];
}
