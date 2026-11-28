// THE key table of the Week's Plan tab. Its key handling, its hint bar and its ? list all read
// it; nothing else binds keys there. Keys typed in a text box, list or dialog are theirs; keys
// with Ctrl, Alt or Cmd held are left to the browser, and Tab moves the focus on, as everywhere.
// Two-key entries (gt, gc) read as Vim does (ui/key-sequence.js). On this tab gt is the tray's,
// read before the main window's gt (Today): layout/view-keys.js shadowedMainActions.
import { keyReader } from "../ui/key-sequence.js";

export const CALENDAR_KEYS = [
  { keys: ["[", "h"], action: "previousWeek", help: "the week before", hint: "week", label: "[ ]" },
  { keys: ["]", "l"], action: "nextWeek", help: "the week after" },
  { keys: ["gt"], action: "tray", help: "the focus to the tray", hint: "tray" },
  { keys: ["gc"], action: "calendar", help: "the focus to the calendar", hint: "calendar" },
  { keys: ["j"], action: "next", help: "the next task in the tray, or the next block in the calendar", hint: "move", label: "j k" },
  { keys: ["k"], action: "previous", help: "the task or block before" },
  { keys: ["s"], action: "schedule", help: "put the tray's task under the focus in the first free slot before it is due", hint: "schedule" },
  { keys: ["Enter"], action: "menu", help: "the chosen block's menu", hint: "block menu" },
  { keys: ["i"], action: "import", help: "import a calendar file (.ics) saved from Outlook" },
  { keys: ["t"], action: "today", help: "this week" },
  { keys: ["w"], action: "weekend", help: "show or hide Saturday and Sunday" },
  { keys: ["Delete", "x"], action: "remove", help: "take the chosen task block off the calendar" },
  { keys: ["Escape"], action: "deselect", help: "choose no block" },
];

const read = keyReader(CALENDAR_KEYS);

/** The action a keydown means in the calendar, "pending" after a g, or null. */
export function calendarAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  const target = event.target;
  if (target?.closest?.("input, select, textarea, dialog, .menu, [contenteditable]")) return null;
  return read(event);
}
