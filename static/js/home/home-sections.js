// THE Home section table: what the Home page shows, top to bottom. Each section has a
// heading, a detail beside it (a count, or today's date), its rows and the text shown when it
// has none. Tasks will join "today" as more rows there. Pure.
//
//   ctx: { tree, meetings, records, ... }; today: a Date
//   section.rows(ctx, today)  -> [{ id, cells: [[className, text]], group?, indent? }]
//                                (group: an area's row heading its projects, not counted)
//   homeSections(ctx, today)  -> [{ key, heading, detail, rows, empty }]
import { localDay, whenText } from "../meetings/meeting-days.js";
import { attendeesOf, attendeesText, shortTitle } from "../meetings/meetings-model.js";
import { daysSince, inboxNotes, openQuestions, projectFacts, projectsByArea, todayMeetings } from "./home-model.js";

export const HOME_SECTIONS = [
  {
    key: "today",
    heading: "Today",
    detail: (rows, today) => whenText({ day: localDay(today), time: "" }),
    rows: ({ tree, meetings }, today) => todayMeetings(tree, meetings, today).map(({ note, meeting, hub }) => ({
      id: note.id,
      cells: [
        ["home__when", meeting.time],
        ["home__title", shortTitle(note, meeting)],
        ["home__meta", `${hub.title} · ${attendeesText(attendeesOf(tree, meetings, note.id).length)}`],
      ],
    })),
    empty: "No meetings today",
  },
  {
    key: "questions",
    heading: "Open questions",
    detail: counted,
    rows: ({ tree, meetings, records }, today) => openQuestions(tree, records).map(({ note, record, hub, meeting }) => ({
      id: note.id,
      cells: [
        ["home__title", note.title],
        ["home__meta", [hub.title, askedText(record.day, today), meeting && `from ${shortTitle(meeting, meetings.get(meeting.id))}`]
          .filter(Boolean).join(" · ")],
      ],
    })),
    empty: "No open questions",
  },
  {
    key: "projects",
    heading: "Projects",
    detail: counted,
    rows: ({ tree, meetings, records }, today) => projectsByArea(tree).flatMap(({ area, projects }) => [
      area ? { id: area.id, group: true, cells: [["home__area", area.title]] }
        : { id: null, group: true, cells: [["home__area home__area--none", "No area"]] },
      ...projects.map((project) => ({
        id: project.id,
        indent: true,
        cells: [
          ["home__title", project.title],
          ["home__meta", factsText(projectFacts(tree, meetings, records, project.id, today))],
        ],
      })),
    ]),
    empty: "No active projects (:project files a note as one)",
  },
  {
    key: "inbox",
    heading: "Inbox",
    detail: counted,
    rows: ({ tree }) => inboxNotes(tree).map((note) => ({ id: note.id, cells: [["home__title", note.title]] })),
    empty: "Inbox is empty",
  },
];

export function homeSections(ctx, today) {
  return HOME_SECTIONS.map(({ key, heading, detail, rows, empty }) => {
    const list = rows(ctx, today);
    return { key, heading, detail: detail(list, today), rows: list, empty };
  });
}

function counted(rows) {
  return String(rows.filter((row) => !row.group).length);
}

function askedText(day, today) {
  const days = daysSince(day, today);
  if (days === null) return "";
  const ago = days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
  return `asked ${day} (${ago})`;
}

function factsText({ openQuestions: open, next }) {
  return [
    open && (open === 1 ? "1 open question" : `${open} open questions`),
    next && `next ${whenText(next)}`,
  ].filter(Boolean).join(" · ");
}
