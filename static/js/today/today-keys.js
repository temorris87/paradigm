// THE key table for the Today page (static/js/today/today-page.js). Its key handling, the
// key-hint bar and the ? list all read it; nothing else binds keys there.
// Keys with Ctrl, Alt or Cmd held are left to the browser, and Tab moves the focus on, as
// everywhere. hint: shown in the key-hint bar (in this order), label: its key cap (ui/key-hints.js).
import { keyReader } from "../ui/key-sequence.js";

export const TODAY_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row", hint: "move", label: "j k" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["gg", "Home"], action: "first", help: "first row" },
  { keys: ["G", "End"], action: "last", help: "last row" },
  { keys: ["}"], action: "nextSection", help: "first row of the next part (Up next, the day, Projects, Inbox)" },
  { keys: ["{"], action: "previousSection", help: "first row of the part before" },
  { keys: [" "], action: "done", help: "tick the task done (a question: Answer…)", hint: "done" },
  { keys: ["s"], action: "schedule", help: "put the task in the next free slot before it is due", hint: "schedule into next free slot" },
  { keys: ["d"], action: "delegate", help: "Delegate… the task, or change who has it", hint: "delegate" },
  { keys: ["z"], action: "snooze", help: "snooze the task to tomorrow: off Up next until then", hint: "snooze to tomorrow" },
  { keys: ["f"], action: "fileAll", help: "File all…: go through the Inbox one note at a time" },
  { keys: ["o", "Enter"], action: "open", help: "open its note (a task's, a meeting, a project)", hint: "open" },
  { keys: ["Escape"], action: "leave", help: "back to the dashboard" },
];

const read = keyReader(TODAY_KEYS);

/** The action a keydown means on Today ("pending" partway through gg), or null. */
export function todayAction(event) {
  return read(event);
}
