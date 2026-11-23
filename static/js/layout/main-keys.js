// THE key table of the main window as a whole: keys that work wherever the focus is, outside
// a text box, a dialog or a menu. Each scope's own table (hub-keys.js, today-keys.js...) owns
// the rest; these are read first (the capture phase), so gt still works on a list whose g
// waits for gg. command: the note command it matches (the palette shows the key beside it).
import { keyReader, resetSequences } from "../ui/key-sequence.js";

export const MAIN_KEYS = [
  { keys: [":"], action: "palette", help: "the palette: go to a note or a page, or run a command" },
  { keys: ["gt"], action: "today", help: "Today", command: "home" },
  { keys: ["gw"], action: "week", help: "the Week", command: "calendar" },
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

/** Puts the keys on the window: handlers { palette(), today(), week() }. */
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
