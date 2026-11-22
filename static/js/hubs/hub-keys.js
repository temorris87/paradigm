// THE key table for the hub page's section panel. The panel's key handling and any help
// listing both read it; nothing else binds keys there. Keys with Ctrl, Alt or Cmd held are
// left to the browser, and Tab moves the focus on, as everywhere.
export const HUB_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["g", "Home"], action: "first", help: "first row" },
  { keys: ["G", "End"], action: "last", help: "last row" },
  { keys: ["Enter"], action: "open", help: "open the row's note" },
  { keys: ["a"], action: "add", help: "the tab's add button: new note, add person, new meeting..." },
  { keys: ["x", "Delete"], action: "remove", help: "take the row off (a person, an attendee, a project from an area)" },
  { keys: ["r"], action: "role", help: "change the row's role (a person on a hub)" },
  { keys: ["h", "ArrowLeft"], action: "previousTab", help: "previous tab" },
  { keys: ["l", "ArrowRight"], action: "nextTab", help: "next tab" },
  { keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], action: "tabNumber", help: "tab by its number" },
  { keys: ["-"], action: "smaller", help: "panel one size smaller (expanded, open, collapsed)" },
  { keys: ["+", "="], action: "larger", help: "panel one size larger" },
  { keys: ["Escape"], action: "editor", help: "back to the editor" },
];

const BY_KEY = new Map(HUB_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

/** The action a keydown means in the panel, or null. */
export function hubAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_KEY.get(event.key) ?? null;
}
