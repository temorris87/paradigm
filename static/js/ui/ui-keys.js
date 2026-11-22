// THE key table for the shared menus, pickers and dialogs (static/js/ui/). Their key
// handling and any help listing both read it; nothing else binds keys there. "menu" keys work
// in a popup menu, "picker" keys in a picker's text box (every other key types), "dialog"
// keys in a form dialog. Keys with Ctrl, Alt or Cmd held are left to the browser, and Tab
// moves the focus on, as everywhere.
export const UI_KEYS = [
  { scope: "menu", keys: ["j", "ArrowDown"], action: "next", help: "next item" },
  { scope: "menu", keys: ["k", "ArrowUp"], action: "previous", help: "previous item" },
  { scope: "menu", keys: ["g", "Home"], action: "first", help: "first item" },
  { scope: "menu", keys: ["G", "End"], action: "last", help: "last item" },
  { scope: "menu", keys: ["Enter", " "], action: "choose", help: "do it" },
  { scope: "menu", keys: ["Escape"], action: "close", help: "close the menu" },
  { scope: "picker", keys: ["ArrowDown"], action: "next", help: "next match" },
  { scope: "picker", keys: ["ArrowUp"], action: "previous", help: "previous match" },
  { scope: "picker", keys: ["Enter"], action: "choose", help: "take the match" },
  { scope: "picker", keys: ["Escape"], action: "close", help: "close without choosing" },
  { scope: "dialog", keys: ["Escape"], action: "close", help: "close without changing anything" },
];

const BY_SCOPE = new Map();
for (const { scope, keys, action } of UI_KEYS) {
  if (!BY_SCOPE.has(scope)) BY_SCOPE.set(scope, new Map());
  for (const key of keys) BY_SCOPE.get(scope).set(key, action);
}

/** The action a keydown means in a scope ("menu", "picker" or "dialog"), or null. Enter in a
 * form dialog submits it as any web form does. */
export function uiAction(event, scope) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_SCOPE.get(scope)?.get(event.key) ?? null;
}
