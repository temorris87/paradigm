// THE key table for the sections on a hub's page. The panel's key handling and any help
// listing both read it; nothing else binds keys there. Keys with Ctrl, Alt or Cmd held are
// left to the browser, and Tab moves the focus on, as everywhere.
export const HUB_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["g", "Home"], action: "first", help: "first row" },
  { keys: ["G", "End"], action: "last", help: "last row" },
  { keys: ["}"], action: "nextSection", help: "the next section's heading" },
  { keys: ["{"], action: "previousSection", help: "this section's heading, then the previous one's" },
  { keys: ["Enter"], action: "open", help: "open the row's note; on a heading, fold or unfold it; Show all" },
  { keys: ["z"], action: "fold", help: "fold or unfold the section" },
  { keys: ["a"], action: "add", help: "the section's add button: new note, add person, new meeting..." },
  { keys: ["x", "Delete"], action: "remove", help: "take the row off (a person, a project from an area)" },
  { keys: ["r"], action: "second", help: "the row's other button: Role… on a person, Answer… on a question" },
  { keys: ["Escape"], action: "editor", help: "back to the text" },
];

const BY_KEY = new Map(HUB_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

/** The action a keydown means in the sections, or null. */
export function hubAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_KEY.get(event.key) ?? null;
}
