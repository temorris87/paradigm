// THE key table of the timesheet window. Its key handling and any help listing both read it;
// nothing else binds keys there. Keys typed in a text box or dialog are theirs; keys with Ctrl,
// Alt or Cmd held are left to the browser, and Tab moves the focus on, as everywhere.
export const TIME_KEYS = [
  { keys: ["[", "h"], action: "previousWeek", help: "the week before" },
  { keys: ["]", "l"], action: "nextWeek", help: "the week after" },
  { keys: ["t"], action: "thisWeek", help: "this week" },
  { keys: ["c"], action: "copy", help: "copy the grid" },
];

const BY_KEY = new Map(TIME_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

export function timeAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.target?.closest?.("input, select, textarea, dialog, .menu, summary, button")) return null;
  return BY_KEY.get(event.key) ?? null;
}
