// THE key table of the main window as a whole: keys that work wherever the focus is, outside
// a text box, a dialog or a menu. Each scope's own table (hub-keys.js, today-keys.js...) owns
// the rest; these are read first (the capture phase), so gt still works on a list whose g
// waits for gg. command: the note command it matches (the palette shows the key beside it).
// hint: shown in the key-hint bar (ui/key-hints.js): "?" at the end of every view's, the rest on
// Live's, which has no keys of its own (layout/view-keys.js).
import { keyReader, resetSequences } from "../ui/key-sequence.js";

export const MAIN_KEYS = [
  { keys: ["gt"], action: "today", help: "Today", command: "home", hint: "Today" },
  { keys: ["gw"], action: "week", help: "the Week", command: "calendar", hint: "Week" },
  { keys: [":"], action: "palette", help: "the palette: go to a note or a page, or run a command", hint: "command" },
  { keys: ["gp"], action: "plan", help: "the full plan (its Gantt chart) of the project or area on the dashboard", command: "plan" },
  { keys: ["gn"], action: "live", help: "the Live note: the note window's note as it is typed", command: "live" },
  { keys: ["?"], action: "keys", help: "every key of the page shown, in a list", hint: "all keys" },
];

const read = keyReader(MAIN_KEYS);

/** Whether a keydown is for a text box, a dialog or a menu (never the page's). */
function busy(event) {
  return Boolean(event.target?.closest?.("input, textarea, select, [contenteditable], dialog, .menu, pd-editor"));
}

/** The action a keydown means here ("pending" after a g), or null. */
export function mainAction(event) {
  if (busy(event)) return null;
  return read(event);
}

/** Puts the keys on the window: handlers { palette(), today(), week(), plan(), live(), keys() }. */
export function installMainKeys(target, handlers) {
  target.addEventListener("keydown", (event) => {
    const action = mainAction(event);
    if (!action || action === "pending") return;
    event.preventDefault();
    event.stopPropagation();
    // The scope under the focus may be waiting on this g for gg: it was ours.
    resetSequences();
    handlers[action]?.();
  }, { capture: true });
}
