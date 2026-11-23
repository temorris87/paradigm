// The Meetings page: every meeting with filters (hub, period, title), drawn in place of the
// note. A ListPage (static/js/pages/list-page.js) told what to show. today() is asked on each
// draw, so "this week" moves on with the clock.
//
//   const page = meetingsPage(sectionElement, { onOpen(id), onLeave(), onAdd(), today? });
//   page.show({ tree, people, meetings }); page.focus();
import { ListPage } from "../pages/list-page.js";
import { PERIODS, whenText } from "./meeting-days.js";
import { attendeesOf, filterMeetings, meetingFilterHubs, shortTitle } from "./meetings-model.js";

export function meetingsPage(section, { onOpen, onLeave, onAdd = () => {}, today = () => new Date() }) {
  return new ListPage(section, {
    name: "meetings",
    heading: "Meetings",
    filters: [
      { key: "hubId", label: "Hub" },
      { key: "period", label: "Period", any: "any time" },
    ],
    search: { key: "title", label: "Title", placeholder: "any part of the title" },
    options: ({ tree, meetings }) => ({
      hubId: meetingFilterHubs(tree, meetings).map((hub) => [String(hub.id), hub.title]),
      period: PERIODS.map(({ key, label }) => [key, label]),
    }),
    rows: ({ tree, meetings }, { hubId, period, title }) =>
      filterMeetings(tree, meetings, { hubId: hubId === "" ? null : Number(hubId), period, title }, today())
        .map((entry) => ({ id: entry.note.id, ...entry })),
    columns: ["When", "Meeting", "Hub", "Attendees"],
    cells: ({ note, meeting, hub }, { tree, meetings }) => [
      ["meetings__when", whenText(meeting)],
      ["meetings__title", shortTitle(note, meeting)],
      ["meetings__hub", hub.title],
      ["meetings__attendees", attendeesOf(tree, meetings, note.id).map((person) => person.title).join(", ")],
    ],
    empty: "No meetings match",
    add: { label: "New meeting", run: onAdd },
    onOpen,
    onLeave,
  });
}
