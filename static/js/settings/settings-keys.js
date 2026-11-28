// THE key table of the Settings page (settings-page.js). Its key handling and any help listing
// read it; nothing else binds keys there. The window's own keys (main-keys.js) work there too;
// text boxes, choices and dialogs keep their keys.
import { keyReader } from "../ui/key-sequence.js";

export const SETTINGS_KEYS = [
  { keys: ["Escape"], action: "leave", help: "back to the page before", hint: "back" },
];

const read = keyReader(SETTINGS_KEYS);

// Radios and checkboxes (the Note window choice, Observed) are not text fields: Escape on them
// is the page's.
const FIELDS = 'input:not([type="radio"]):not([type="checkbox"]), select, textarea, dialog, .menu';

/** The action a keydown means on the page, or null (a key typed in a field is the field's). */
export function settingsAction(event) {
  if (event.target?.closest?.(FIELDS)) return null;
  return read(event);
}
