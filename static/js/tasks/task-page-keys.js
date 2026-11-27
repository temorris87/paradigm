// THE key table of a task's page (task-page.js). Its key handling and any help listing read
// it; nothing else binds keys there. The head is the first row, its subtasks follow, then its
// emails (task-emails.js): j/k move through them as one list. Keys
// with Ctrl, Alt or Cmd held are left to the browser; text boxes and dialogs keep theirs.
import { keyReader } from "../ui/key-sequence.js";

export const TASK_PAGE_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["gg"], action: "first", help: "first row (the task itself)" },
  { keys: ["G"], action: "last", help: "last row" },
  { keys: ["Enter"], action: "open", help: "open the subtask's own page, or the email in Outlook" },
  { keys: ["o"], action: "openEmail", help: "open the email in Outlook (Reply ↗ and Open ↗ do the same)" },
  { keys: ["r"], action: "reply", help: "the email's reply: Reply needed → Replied (today) → No reply" },
  { keys: ["a"], action: "add", help: "add a subtask under the row (on the head: a direct subtask)" },
  { keys: [" "], action: "toggle", help: "mark it done (and everything under it), or reopen it" },
  { keys: ["e"], action: "edit", help: "Edit…: title, notes, due date, estimate, for whom" },
  { keys: ["d"], action: "delegate", help: "Delegate… to someone, or take it back" },
  { keys: ["x", "Delete"], action: "remove", help: "delete it, with every subtask under it (an email: take it off the task)" },
  { keys: ["J"], action: "moveDown", help: "move the subtask down among its siblings" },
  { keys: ["K"], action: "moveUp", help: "move the subtask up among its siblings" },
  { keys: ["Escape"], action: "leave", help: "back to the task's dashboard" },
];

const read = keyReader(TASK_PAGE_KEYS);

/** The action a keydown means on the page ("pending" partway through gg), or null. */
export function taskPageAction(event) {
  return read(event);
}
