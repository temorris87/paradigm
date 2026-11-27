// THE key table of a task's page (task-page.js). Its key handling and any help listing read
// it; nothing else binds keys there. The head is the first row, its subtasks follow. Keys
// with Ctrl, Alt or Cmd held are left to the browser; text boxes and dialogs keep theirs.
import { keyReader } from "../ui/key-sequence.js";

export const TASK_PAGE_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row", hint: "move", label: "j k" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["gg"], action: "first", help: "first row (the task itself)" },
  { keys: ["G"], action: "last", help: "last row" },
  { keys: ["Enter"], action: "open", help: "open the subtask's own page", hint: "open" },
  { keys: ["a"], action: "add", help: "add a subtask under the row (on the head: a direct subtask)", hint: "add subtask" },
  { keys: [" "], action: "toggle", help: "mark it done (and everything under it), or reopen it", hint: "done" },
  { keys: ["e"], action: "edit", help: "Edit…: title, notes, due date, estimate, for whom", hint: "edit" },
  { keys: ["d"], action: "delegate", help: "Delegate… to someone, or take it back", hint: "delegate" },
  { keys: ["x", "Delete"], action: "remove", help: "delete it, with every subtask under it" },
  { keys: ["J"], action: "moveDown", help: "move the subtask down among its siblings" },
  { keys: ["K"], action: "moveUp", help: "move the subtask up among its siblings" },
  { keys: ["Escape"], action: "leave", help: "back to the task's dashboard" },
];

const read = keyReader(TASK_PAGE_KEYS);

/** The action a keydown means on the page ("pending" partway through gg), or null. */
export function taskPageAction(event) {
  return read(event);
}
