// THE key table of the calendar window. Its key handling and any help listing both read it;
// nothing else binds keys there. Keys typed in a text box, list or dialog are theirs; keys
// with Ctrl, Alt or Cmd held are left to the browser, and Tab moves the focus on, as everywhere.
export const CALENDAR_KEYS = [
  { keys: ["[", "h"], action: "previousWeek", help: "the week before" },
  { keys: ["]", "l"], action: "nextWeek", help: "the week after" },
  { keys: ["t"], action: "today", help: "this week" },
  { keys: ["w"], action: "weekend", help: "show or hide Saturday and Sunday" },
  { keys: ["i"], action: "import", help: "import the calendar files waiting in the folder" },
  { keys: ["Enter"], action: "open", help: "open the chosen block's note" },
  { keys: ["s"], action: "schedule", help: "put the tray's task under the focus in the first free slot before it is due" },
  { keys: ["Delete", "x"], action: "remove", help: "take the chosen task block off the calendar" },
  { keys: ["Escape"], action: "deselect", help: "choose no block" },
];

const BY_KEY = new Map(CALENDAR_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

/** The action a keydown means in the calendar, or null. */
export function calendarAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  const target = event.target;
  if (target?.closest?.("input, select, textarea, dialog, .menu, [contenteditable]")) return null;
  return BY_KEY.get(event.key) ?? null;
}
