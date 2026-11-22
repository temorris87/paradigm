// THE key table for the People page. The page's key handling and any help listing both read
// it; nothing else binds keys there. "list" keys work on the list of people, "name" keys in
// the Name filter box (where every other key types). Keys with Ctrl, Alt or Cmd held are left
// to the browser, and Tab moves the focus on, as everywhere.
export const PEOPLE_KEYS = [
  { scope: "list", keys: ["j", "ArrowDown"], action: "next", help: "next person" },
  { scope: "list", keys: ["k", "ArrowUp"], action: "previous", help: "previous person" },
  { scope: "list", keys: ["g", "Home"], action: "first", help: "first person" },
  { scope: "list", keys: ["G", "End"], action: "last", help: "last person" },
  { scope: "list", keys: ["Enter"], action: "open", help: "open the person's note" },
  { scope: "list", keys: ["/"], action: "name", help: "filter by name" },
  { scope: "list", keys: ["Escape"], action: "leave", help: "back to the note" },
  { scope: "name", keys: ["Enter", "Escape", "ArrowDown"], action: "list", help: "back to the list" },
];

const BY_SCOPE = new Map();
for (const { scope, keys, action } of PEOPLE_KEYS) {
  if (!BY_SCOPE.has(scope)) BY_SCOPE.set(scope, new Map());
  for (const key of keys) BY_SCOPE.get(scope).set(key, action);
}

/** The action a keydown means in a scope ("list" or "name"), or null. */
export function peopleAction(event, scope) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_SCOPE.get(scope)?.get(event.key) ?? null;
}
