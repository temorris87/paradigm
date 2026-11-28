// THE key table of the Week page's On call tab. Its key handling and any help listing both read
// it; nothing else binds keys there. Enter counts only on a cell itself: on the name's link or
// the Change… button inside it, Enter is that button's. Keys typed in a text box or dialog are theirs; keys with
// Ctrl, Alt or Cmd held are left to the browser (Ctrl-V pastes the sheet), and Tab moves the
// focus on, as everywhere.
export const ONCALL_KEYS = [
  { keys: ["[", "h"], action: "previousWeek", help: "the week before", hint: "week", label: "[ ]" },
  { keys: ["]", "l"], action: "nextWeek", help: "the week after" },
  { keys: ["t"], action: "thisWeek", help: "this week", hint: "this week" },
  { keys: ["p"], action: "paste", help: "Paste sheet…: paste the Excel on-call sheet into a box", hint: "paste sheet" },
  { keys: ["e"], action: "earlier", help: "show or hide the weeks before this one", hint: "earlier weeks" },
  { keys: ["Enter"], action: "change", help: "change the name in this cell", hint: "change name" },
];

const BY_KEY = new Map(ONCALL_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

/** The action a keydown means on the On call tab, or null. */
export function onCallAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.target?.closest?.("input, select, textarea, dialog, .menu, [contenteditable]")) return null;
  const action = BY_KEY.get(event.key) ?? null;
  if (action === "change" && !event.target?.matches?.(".oncall__cell")) return null;
  return action;
}
