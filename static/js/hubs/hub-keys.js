// THE key table for the sections on a hub's page. The panel's key handling and any help
// listing both read it; nothing else binds keys there. Keys with Ctrl, Alt or Cmd held are
// left to the browser, and Tab moves the focus on, as everywhere but a person's page.
// hint: the words in a dashboard's key-hint bar; projectHint: in a project's (its bar follows
// Figma's). only: "project" marks the rows that work on a project's page only.
//
// A row with page: "person" works only on a person's page (the main window's dashboard of a
// person); a row with notOn: ["person"] works everywhere else. So the same key can mean one
// thing on a person and another elsewhere (a: add topic / the section's add button; n: Start
// 1:1 notes / a project's new task).
//
//   hubAction(event, page?)   the action a keydown means on that page ("pending" partway
//                             through gg), or null
//   keysFor(page)             the rows that work on a page
import { keyReader } from "../ui/key-sequence.js";

export const HUB_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row", hint: "move", projectHint: "move", label: "j k" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["gg", "Home"], action: "first", help: "first row" },
  { keys: ["G", "End"], action: "last", help: "last row" },
  { keys: ["}"], action: "nextSection", help: "the next section's heading" },
  { keys: ["{"], action: "previousSection", help: "this section's heading, then the previous one's" },
  { keys: ["Tab"], action: "nextColumn", page: "person", help: "person: the next card (They owe me, I owe, To raise), then Notes, then Together" },
  { keys: ["S-Tab"], action: "previousColumn", page: "person", help: "person: the card before" },
  { keys: ["ArrowRight"], action: "nextLane", help: "on a dashboard: across to the next column on the right" },
  { keys: ["ArrowLeft"], action: "previousLane", help: "on a dashboard: back to the column on the left" },
  { keys: ["Enter"], action: "open", help: "open the row's note (a task: its own page; a file: open it); on a heading, fold or unfold it; Show all", hint: "open" },
  { keys: ["o"], action: "openRow", page: "person", help: "person: open the row's task page or note (as Enter)" },
  { keys: ["z"], action: "fold", help: "fold or unfold the section; on a task, open or close it in place (its notes and subtasks)", hint: "fold" },
  { keys: ["a"], action: "add", notOn: ["person"], help: "the section's add button: new note, add person, new meeting...", hint: "add" },
  { keys: ["a"], action: "addTopic", page: "person", help: "person: add a topic to raise next 1:1, whichever card the cursor is in" },
  { keys: ["m"], action: "menu", help: "the section's \"···\" menu (Files: Search linked files…, Link a folder…, Unlink a folder…)" },
  { keys: ["x", "Delete"], action: "remove", help: "take the row off (a person, a project from an area, a file); delete a task" },
  { keys: ["r"], action: "second", notOn: ["person"], help: "the row's other button: Role… on a person, Answer… on a question" },
  { keys: ["r"], action: "raised", page: "person", help: "person: mark the topic under the cursor raised; on another row, its other button (a hub's Role…)" },
  { keys: [" "], action: "toggle", help: "tick a task (or a milestone) done, or reopen it", hint: "done", projectHint: "done" },
  { keys: ["n"], action: "newTask", notOn: ["person"], help: "on a project: a new task", only: "project", projectHint: "new task" },
  { keys: ["n"], action: "oneOnOne", page: "person", help: "person: Start 1:1 notes" },
  { keys: ["d"], action: "delegate", help: "Delegate… a task to someone, or take it back", projectHint: "delegate" },
  { keys: ["h"], action: "history", help: "the date history of a phase or milestone" },
  { keys: ["S"], action: "logStatus", help: "Log status… of the project or area: its health and where it is", command: "log", hint: "log status",
    projectHint: "log status" },
  { keys: ["e"], action: "edit", help: "Edit… a task: its text, notes and due date; on a project's Outcome, its text (in the note window)",
    hint: "edit", projectHint: "edit outcome" },
  { keys: ["gp"], action: "plan", help: "the project's full plan (its Gantt chart) in the main window", projectHint: "Gantt" },
  { keys: ["gh"], action: "projectHistory", help: "on a project: its History (done tasks, earlier meetings, all decisions, answered questions)",
    only: "project" },
  { keys: ["Escape"], action: "editor", help: "back to the text" },
];

export function keysFor(page = null) {
  return HUB_KEYS.filter((entry) => (entry.page === undefined || entry.page === page) && !(entry.notOn ?? []).includes(page));
}

const readers = new Map();

export function hubAction(event, page = null) {
  if (!readers.has(page)) readers.set(page, keyReader(keysFor(page)));
  return readers.get(page)(event);
}
