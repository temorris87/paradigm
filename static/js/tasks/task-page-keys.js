// THE key table of a task's page (task-page.js). Its key handling, its hint bar and its ? list
// read it; nothing else binds keys there. The head is the first row, then the side column's
// rows top to bottom (subtasks, emails, files, From, History): j/k move through them as one
// list. Space, E, d and s act on the selected subtask, else on the page's task; e writes the
// page's task's notes in the note window. The hint bar
// shows the entries with hint:, in this order. Keys with Ctrl, Alt or Cmd held are left to the
// browser; text boxes and dialogs keep theirs.
import { keyReader } from "../ui/key-sequence.js";

export const TASK_PAGE_KEYS = [
  { keys: [" "], action: "toggle", help: "mark it done (and everything under it), or reopen it", hint: "done" },
  { keys: ["e"], action: "editNotes", help: "edit its notes in the note window", hint: "edit notes" },
  { keys: ["E"], action: "edit", help: "Edit…: title, due date, estimate, for whom" },
  { keys: ["d"], action: "delegate", help: "Delegate… to someone, or take it back", hint: "delegate" },
  { keys: ["s"], action: "schedule", help: "put its estimate (or 30 min) in the first free slot before it is due", hint: "schedule" },
  { keys: ["a"], action: "add", help: "add a subtask under the row (elsewhere: a direct subtask)", hint: "add subtask" },
  { keys: ["j", "ArrowDown"], action: "next", help: "next row", hint: "move", label: "j k" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["gg"], action: "first", help: "first row (the task itself)" },
  { keys: ["G"], action: "last", help: "last row" },
  { keys: ["Enter"], action: "open", help: "open the row: a subtask's page, the email in Outlook, the file, the meeting or note" },
  { keys: ["o"], action: "openEmail", help: "open the email or the file (Reply ↗, Open ↗ and the file's name do the same)" },
  { keys: ["r"], action: "reply", help: "the email's reply: Reply needed → Replied (today) → No reply" },
  { keys: ["x", "Delete"], action: "remove", help: "delete it, with every subtask under it (an email: take it off the task; a file: unlink it from the task)" },
  { keys: ["J"], action: "moveDown", help: "move the subtask down among its siblings" },
  { keys: ["K"], action: "moveUp", help: "move the subtask up among its siblings" },
  { keys: ["Escape"], action: "leave", help: "back to the task's dashboard", hint: "back" },
];

const read = keyReader(TASK_PAGE_KEYS);

/** The action a keydown means on the page ("pending" partway through gg), or null. */
export function taskPageAction(event) {
  return read(event);
}
