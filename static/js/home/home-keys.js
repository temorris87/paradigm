// THE key table for the Home page. Its key handling (static/js/home/home-page.js) and any
// help listing both read it; nothing else binds keys there. Keys with Ctrl, Alt or Cmd held
// are left to the browser, and Tab moves the focus on, as everywhere.
export const HOME_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["g", "Home"], action: "first", help: "first row" },
  { keys: ["G", "End"], action: "last", help: "last row" },
  { keys: ["}"], action: "nextSection", help: "first row of the next section" },
  { keys: ["{"], action: "previousSection", help: "first row of the previous section" },
  { keys: ["Enter"], action: "open", help: "open the row's note" },
  { keys: ["Escape"], action: "leave", help: "back to the note" },
];

const BY_KEY = new Map(HOME_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

/** The action a keydown means on the Home page, or null. */
export function homeAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_KEY.get(event.key) ?? null;
}
