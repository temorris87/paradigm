// THE Home section table: what the Home page shows, top to bottom. Each section has a
// heading, a detail beside it (a count, or today's date), its rows and the text shown when it
// has none. Today holds the meetings and the task blocks of the day. Pure.
//
//   ctx: { tree, meetings, records, ... }; today: a Date
//   section.rows(ctx, today)  -> [{ id, cells: [[className, text]], group?, indent?, muted? }]
//                                (group: an area's row heading its projects, not counted;
//                                muted: a project on hold)
//   homeSections(ctx, today)  -> [{ key, heading, detail, rows, empty }]
import { localDay, whenText } from "../meetings/meeting-days.js";
import { attendeesOf, attendeesText, shortTitle } from "../meetings/meetings-model.js";
import { daysSince, inboxNotes, nextMeeting, openQuestions, projectsByArea, todayMeetings } from "./home-model.js";
import { projectFactsText, statusText } from "../hubs/project-facts.js";
import { todayTasks, waitingOn } from "../tasks/tasks-model.js";
import { dayText } from "../ui/dates.js";

export const HOME_SECTIONS = [
  {
    key: "today",
    heading: "Today",
    detail: (rows, today) => whenText({ day: localDay(today), time: "" }),
    // The day's meetings and task blocks by time (untimed meetings last); a reminder first
    // while today's calendar hasn't been imported.
    rows: (ctx, today) => [...importReminder(ctx, today), ...todayRows(ctx, today)],
    // An empty day points at the next meeting, so a weekend Home still says what is coming.
    empty: ({ tree, meetings }, today) => {
      const next = meetings ? nextMeeting(tree, meetings, today) : null;
      return next ? `Nothing today · next: ${whenText(next.meeting, today)} ${shortTitle(next.note, next.meeting)}`
        : "Nothing on the calendar today";
    },
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
    key: "waiting",
    heading: "Waiting on",
    detail: counted,
    // Tasks delegated to someone, soonest follow-up first; past their follow-up day first of all.
    rows: ({ tree, tasks }, today) => (tasks ? waitingOn(tree, tasks) : []).map(({ task, note, hub }) => {
      const late = Boolean(task.follow_up && task.follow_up < localDay(today));
      return {
        id: note.id,
        cells: [
          ["home__title", task.title],
          ["home__meta", [`→ ${tree.get(task.delegate_id)?.title ?? "someone"}`, hub?.title,
            task.follow_up ? `${late ? "follow up was due" : "follow up"} ${dayText(task.follow_up, { today, relative: true })}` : ""].filter(Boolean).join(" · ")],
        ],
        late,
      };
    }),
    empty: "Nothing delegated",
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
        muted: project.status === "on_hold",
        cells: [
          ["home__title", project.title],
          ["home__meta", [statusText(project), projectFactsText({ tree, meetings, records, today }, project)].filter(Boolean).join(" · ")],
        ],
      })),
    ]),
    empty: "No active projects",
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
    return { key, heading, detail: detail(list, today), rows: list, empty: typeof empty === "function" ? empty(ctx, today) : empty };
  });
}

function todayRows({ tree, meetings, tasks, sessions = [] }, today) {
  const meetingRows = todayMeetings(tree, meetings, today).map(({ note, meeting, hub }) => ({
    id: note.id,
    sort: meeting.time || "99:99",
    muted: Boolean(meeting.cancelled),
    cells: [
      ["home__when", meeting.time ? [meeting.time, meeting.end_time].filter(Boolean).join("–") : ""],
      ["home__title", `${meeting.cancelled ? "Cancelled: " : ""}${shortTitle(note, meeting)}`],
      ["home__meta", `${hub.title} · ${attendeesText(attendeesOf(tree, meetings, note.id).length)}`],
    ],
  }));
  const taskRows = tasks ? todayTasks(tree, tasks, sessions, localDay(today)).map(({ entry, session }) => ({
    id: entry.note.id,
    sort: session.start,
    muted: entry.task.done,
    cells: [
      ["home__when", `${session.start}–${session.end}`],
      ["home__title", `${entry.task.done ? "☑" : "☐"} ${entry.task.title}`],
      ["home__meta", [entry.hub?.title, entry.note.id !== entry.hub?.id ? entry.note.title : ""].filter(Boolean).join(" · ")],
    ],
  })) : [];
  return [...meetingRows, ...taskRows].sort((a, b) => a.sort.localeCompare(b.sort)).map(({ sort, ...row }) => row);
}

function importReminder({ importStatus }, today) {
  if (!importStatus || importStatus.imported_today) return [];
  const waiting = importStatus.waiting ? ` (${importStatus.waiting} file${importStatus.waiting === 1 ? "" : "s"} waiting: open the calendar to import)` : "";
  return [{ id: null, group: true, cells: [["home__notice", `Calendar not imported today${waiting}`]] }];
}

function counted(rows) {
  return String(rows.filter((row) => !row.group).length);
}

function askedText(day, today) {
  const days = daysSince(day, today);
  if (days === null) return "";
  const ago = days === 0 ? "today" : `${days} d ago`;
  return `asked ${dayText(day, { today, weekday: false })}, ${ago}`;
}

