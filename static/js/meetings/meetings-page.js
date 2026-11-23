// The Meetings page, drawn in place of the dashboard: Upcoming (soonest first), Past (latest
// first) or Needs notes (past ones with nothing written), grouped by day, with what to prep
// for each (meetings/prep-model.js); a hub filter and a title search. A ListPage
// (static/js/pages/list-page.js) told what to show. p shows only those with something to
// prep; } and { jump between days. today() is asked on each draw.
//
//   const page = meetingsPage(sectionElement, { onOpen(id), onLeave(), onAdd(), today? });
//   page.show(ctx); page.focus();
import { ListPage } from "../pages/list-page.js";
import { dayText, timeSpan } from "../ui/dates.js";
import { localDay } from "./meeting-days.js";
import { attendeesOf, filterMeetings, meetingFilterHubs, shortTitle } from "./meetings-model.js";
import { prepFor } from "./prep-model.js";

const VIEWS = [["upcoming", "Upcoming"], ["past", "Past"], ["needs", "Needs notes"]];

/** The meetings a view shows, in its order (pure). */
export function meetingsInView(ctx, { view = "upcoming", hubId = null, title = "", prepOnly = false }, now) {
  const today = localDay(now);
  const when = (entry) => `${entry.meeting.day} ${entry.meeting.time || "99:99"}`;
  let entries = filterMeetings(ctx.tree, ctx.meetings, { hubId, title }, now);
  if (view === "upcoming") entries = entries.filter((entry) => entry.meeting.day >= today).sort((a, b) => when(a).localeCompare(when(b)));
  else {
    entries = entries.filter((entry) => entry.meeting.day < today).sort((a, b) => when(b).localeCompare(when(a)));
    if (view === "needs") entries = entries.filter((entry) => !entry.meeting.cancelled && entry.note.empty);
  }
  const rows = entries.map((entry) => ({ id: entry.note.id, ...entry, prep: prepFor(ctx, entry.note.id, now) }));
  return prepOnly ? rows.filter((row) => row.prep.questions.length || row.prep.waiting.length) : rows;
}

/** "1 question · Priya 4 d late" */
export function prepCell(prep, tree, now) {
  const today = localDay(now);
  const parts = [];
  if (prep.questions.length) parts.push(`${prep.questions.length} question${prep.questions.length === 1 ? "" : "s"}`);
  const late = prep.waiting.filter((entry) => entry.late);
  for (const entry of late.slice(0, 2)) {
    const days = Math.round((Date.parse(today) - Date.parse(entry.task.follow_up)) / 86400000);
    parts.push(`${tree.get(entry.task.delegate_id)?.title.split(/\s+/)[0] ?? "someone"} ${days} d late`);
  }
  const waiting = prep.waiting.length - late.length;
  if (waiting > 0) parts.push(`${waiting} follow-up${waiting === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function meetingsPage(section, { onOpen, onLeave, onAdd = () => {}, today = () => new Date() }) {
  let prepOnly = false;
  const filters = (values) => ({ view: values.view || "upcoming", hubId: values.hubId === "" ? null : Number(values.hubId),
    title: values.title, prepOnly });
  return new ListPage(section, {
    name: "meetings",
    heading: "Meetings",
    pills: {
      key: "view",
      choices: (ctx) => {
        const needs = meetingsInView(ctx, { view: "needs" }, today()).length;
        return VIEWS.map(([key, label]) => [key, key === "needs" ? `${label} · ${needs}` : label]);
      },
    },
    filters: [{ key: "hubId", label: "Hub" }],
    search: { key: "title", label: "Title", placeholder: "any part of the title" },
    options: ({ tree, meetings }) => ({ hubId: meetingFilterHubs(tree, meetings).map((hub) => [String(hub.id), hub.title]) }),
    rows: (ctx, values) => meetingsInView(ctx, filters(values), today()),
    groupOf: (row) => {
      const now = localDay(today());
      const label = dayText(row.meeting.day, { today: now }).toUpperCase();
      return row.meeting.day === now ? { key: row.meeting.day, label: `TODAY · ${label}`, className: "list-page__group--today" }
        : { key: row.meeting.day, label };
    },
    columns: ["When", "Meeting", "Hub", "With", "Prep"],
    cells: ({ note, meeting, hub, prep }, { tree, meetings }) => {
      const people = attendeesOf(tree, meetings, note.id).map((person) => person.title.split(/\s+/)[0]);
      return [
        ["meetings__when", timeSpan(meeting.time, meeting.end_time) || "all day"],
        [`meetings__title${meeting.cancelled ? " meetings__title--cancelled" : ""}`, shortTitle(note, meeting)],
        ["meetings__hub", hub.title],
        ["meetings__attendees", people.length > 3 ? `${people.slice(0, 3).join(", ")} +${people.length - 3}` : people.join(", ")],
        [`meetings__prep${prep.waiting.some((entry) => entry.late) ? " meetings__prep--late" : ""}`, prepCell(prep, tree, today())],
      ];
    },
    empty: "No meetings here",
    add: { label: "New meeting", run: onAdd },
    onAction: (action) => {
      if (action !== "prepOnly") return false;
      prepOnly = !prepOnly;
      return true;
    },
    onOpen,
    onLeave,
  });
}
