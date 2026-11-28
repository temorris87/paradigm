// THE key table for the sections on a hub's page. The panel's key handling and any help
// listing both read it; nothing else binds keys there. Keys with Ctrl, Alt or Cmd held are
// left to the browser, and Tab moves the focus on, as everywhere.
// hint: the words in a dashboard's key-hint bar; projectHint: in a project's (its bar follows
// Figma's). only: "project" marks the rows that work on a project's page only (n is
// page-specific: another kind's page may give it a meaning of its own).
import { keyReader } from "../ui/key-sequence.js";

export const HUB_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row", hint: "move", projectHint: "move", label: "j k" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["gg", "Home"], action: "first", help: "first row" },
  { keys: ["G", "End"], action: "last", help: "last row" },
  { keys: ["}"], action: "nextSection", help: "the next section's heading" },
  { keys: ["{"], action: "previousSection", help: "this section's heading, then the previous one's" },
  { keys: ["ArrowRight"], action: "nextLane", help: "on a dashboard: across to the right-hand lane (to look up)" },
  { keys: ["ArrowLeft"], action: "previousLane", help: "on a dashboard: back to the left-hand lane (to act on)" },
  { keys: ["Enter"], action: "open", help: "open the row's note (a task: its own page; a file: open it); on a heading, fold or unfold it; Show all", hint: "open" },
  { keys: ["z"], action: "fold", help: "fold or unfold the section; on a task, open or close it in place (its notes and subtasks)", hint: "fold" },
  { keys: ["a"], action: "add", help: "the section's add button: new note, add person, new meeting...", hint: "add" },
  { keys: ["m"], action: "menu", help: "the section's \"···\" menu (Files: Search linked files…, Link a folder…, Unlink a folder…)" },
  { keys: ["x", "Delete"], action: "remove", help: "take the row off (a person, a project from an area, a file); delete a task" },
  { keys: ["r"], action: "second", help: "the row's other button: Role… on a person, Answer… on a question" },
  { keys: [" "], action: "toggle", help: "tick a task (or a milestone) done, or reopen it", hint: "done", projectHint: "done" },
  { keys: ["n"], action: "newTask", help: "on a project: a new task", only: "project", projectHint: "new task" },
  { keys: ["d"], action: "delegate", help: "Delegate… a task to someone, or take it back", projectHint: "delegate" },
  { keys: ["h"], action: "history", help: "the date history of a phase or milestone" },
  { keys: ["L"], action: "logStatus", help: "Log status… of the project or area: its health and where it is", command: "log", hint: "log status",
    projectHint: "log status" },
  { keys: ["e"], action: "edit", help: "Edit… a task: its text, notes and due date; on a project's Outcome, its text (in the note window)",
    hint: "edit", projectHint: "edit outcome" },
  { keys: ["gp"], action: "plan", help: "the project's full plan (its Gantt chart) in the main window", projectHint: "Gantt" },
  { keys: ["gh"], action: "projectHistory", help: "on a project: its History (done tasks, earlier meetings, all decisions, answered questions)",
    only: "project" },
  { keys: ["Escape"], action: "editor", help: "back to the text" },
];

const read = keyReader(HUB_KEYS);

/** The action a keydown means in the sections ("pending" partway through gg), or null. */
export function hubAction(event) {
  return read(event);
}
