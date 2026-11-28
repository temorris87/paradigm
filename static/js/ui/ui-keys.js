// THE key table for the shared menus, pickers and dialogs (static/js/ui/). Their key
// handling and any help listing both read it; nothing else binds keys there. "menu" keys work
// in a popup menu, "picker" keys in a picker's text box (every other key types), "dialog"
// keys in a form dialog, "choices" keys on a dialog's stacked choices (Followed up…'s). Keys with Ctrl, Alt or Cmd held are left to the browser, and Tab
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
  { scope: "palette", keys: ["ArrowDown", "C-n"], action: "next", help: "next row", hint: "move", label: "↑↓" },
  { scope: "palette", keys: ["ArrowUp", "C-p"], action: "previous", help: "previous row" },
  { scope: "palette", keys: ["Enter"], action: "choose", help: "open the note or page, run the command", hint: "open / run" },
  { scope: "palette", keys: ["S-Enter"], action: "chooseInNote", help: "open the note in the note window", hint: "open in note window", label: "Shift-Enter" },
  { scope: "palette", keys: ["Tab"], action: "complete", help: "complete the command's name, to type its arguments", hint: "complete" },
  { scope: "palette", keys: ["Escape"], action: "close", help: "close the palette", hint: "close" },
  { scope: "dialog", keys: ["C-Enter"], action: "submit", help: "do it, from a text box with several lines too" },
  { scope: "choices", keys: ["j", "ArrowDown"], action: "next", help: "the next choice" },
  { scope: "choices", keys: ["k", "ArrowUp"], action: "previous", help: "the choice before" },
  { scope: "choices", keys: ["Enter"], action: "submit", help: "do it with the choice made" },
];

const BY_SCOPE = new Map();
for (const { scope, keys, action } of UI_KEYS) {
  if (!BY_SCOPE.has(scope)) BY_SCOPE.set(scope, new Map());
  for (const key of keys) BY_SCOPE.get(scope).set(key, action);
}

/** The action a keydown means in a scope ("menu", "picker", "dialog", "choices" or "palette"), or null.
 * Enter in a form dialog submits it as any web form does. Ctrl is "C-" in the table, Shift on
 * a named key "S-"; other chords are the browser's. */
export function uiAction(event, scope) {
  if (event.altKey || event.metaKey) return null;
  const key = event.ctrlKey ? `C-${event.key}` : event.shiftKey && event.key.length > 1 ? `S-${event.key}` : event.key;
  return BY_SCOPE.get(scope)?.get(key) ?? null;
}

/** [[key, words]] of a scope's hint line, from the table. */
export function uiHints(scope) {
  return UI_KEYS.filter((entry) => entry.scope === scope && entry.hint).map((entry) => [entry.label ?? entry.keys[0], entry.hint]);
}
