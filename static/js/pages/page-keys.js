// THE key table for the list pages drawn in place of the note (People, Meetings). Their key
// handling (static/js/pages/list-page.js) and any help listing both read it; nothing else
// binds keys there. "list" keys work on the list, "search" keys in the search box (where
// every other key types). Keys with Ctrl, Alt or Cmd held are left to the browser, and Tab
// moves the focus on, as everywhere.
export const PAGE_KEYS = [
  { scope: "list", keys: ["j", "ArrowDown"], action: "next", help: "next row" },
  { scope: "list", keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { scope: "list", keys: ["g", "Home"], action: "first", help: "first row" },
  { scope: "list", keys: ["G", "End"], action: "last", help: "last row" },
  { scope: "list", keys: ["Enter"], action: "open", help: "open the row's note" },
  { scope: "list", keys: ["/"], action: "search", help: "go to the search box" },
  { scope: "list", keys: ["a"], action: "add", help: "the page's New button (New person, New meeting)" },
  { scope: "list", keys: ["Escape"], action: "leave", help: "back to the note" },
  { scope: "search", keys: ["Enter", "Escape", "ArrowDown"], action: "list", help: "back to the list" },
];

const BY_SCOPE = new Map();
for (const { scope, keys, action } of PAGE_KEYS) {
  if (!BY_SCOPE.has(scope)) BY_SCOPE.set(scope, new Map());
  for (const key of keys) BY_SCOPE.get(scope).set(key, action);
}

/** The action a keydown means in a scope ("list" or "search"), or null. */
export function pageAction(event, scope) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_SCOPE.get(scope)?.get(event.key) ?? null;
}
