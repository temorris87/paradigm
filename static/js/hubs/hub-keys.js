// THE key table for the sections on a hub's page. The panel's key handling and any help
// listing both read it; nothing else binds keys there. Keys with Ctrl, Alt or Cmd held are
// left to the browser, and Tab moves the focus on, as everywhere.
import { keyReader } from "../ui/key-sequence.js";

export const HUB_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["gg", "Home"], action: "first", help: "first row" },
  { keys: ["G", "End"], action: "last", help: "last row" },
  { keys: ["}"], action: "nextSection", help: "the next section's heading" },
  { keys: ["{"], action: "previousSection", help: "this section's heading, then the previous one's" },
  { keys: ["ArrowRight"], action: "nextLane", help: "on a dashboard: across to the right-hand lane (to look up)" },
  { keys: ["ArrowLeft"], action: "previousLane", help: "on a dashboard: back to the left-hand lane (to act on)" },
  { keys: ["Enter"], action: "open", help: "open the row's note (a task: show its subtasks; a file: open it); on a heading, fold or unfold it; Show all" },
  { keys: ["z"], action: "fold", help: "fold or unfold the section" },
  { keys: ["a"], action: "add", help: "the section's add button: new note, add person, new meeting..." },
  { keys: ["x", "Delete"], action: "remove", help: "take the row off (a person, a project from an area, a file); delete a task" },
  { keys: ["r"], action: "second", help: "the row's other button: Role… on a person, Answer… on a question" },
  { keys: [" "], action: "toggle", help: "tick a task (or a milestone) done, or reopen it" },
  { keys: ["e"], action: "edit", help: "Edit… a task: its text, notes and due date" },
  { keys: ["n"], action: "makeNext", help: "make the task its page's next action (NEXT), or not any more" },
  { keys: ["d"], action: "delegate", help: "Delegate… a task to someone, or take it back" },
  { keys: ["h"], action: "history", help: "the date history of a phase or milestone" },
  { keys: ["L"], action: "logStatus", help: "Log status… of the project or area: its health and where it is", command: "log" },
  { keys: ["gp"], action: "plan", help: "the project's full plan (its Gantt chart) in the main window" },
  { keys: ["Escape"], action: "editor", help: "back to the text" },
];

const read = keyReader(HUB_KEYS);

/** The action a keydown means in the sections ("pending" partway through gg), or null. */
export function hubAction(event) {
  return read(event);
}
