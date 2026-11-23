// THE key table of the Week page's On call tab. Its key handling and any help listing both read
// it; nothing else binds keys there. Keys typed in a text box or dialog are theirs; keys with
// Ctrl, Alt or Cmd held are left to the browser (Ctrl-V pastes the sheet), and Tab moves the
// focus on, as everywhere.
export const ONCALL_KEYS = [
  { keys: ["[", "h"], action: "previousWeek", help: "the week before" },
  { keys: ["]", "l"], action: "nextWeek", help: "the week after" },
  { keys: ["t"], action: "thisWeek", help: "this week" },
  { keys: ["p"], action: "paste", help: "Paste sheet…: paste the Excel on-call sheet into a box" },
  { keys: ["e"], action: "earlier", help: "show or hide the weeks before this one" },
];

const BY_KEY = new Map(ONCALL_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

/** The action a keydown means on the On call tab, or null. */
export function onCallAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (event.target?.closest?.("input, select, textarea, dialog, .menu, [contenteditable]")) return null;
  return BY_KEY.get(event.key) ?? null;
}
