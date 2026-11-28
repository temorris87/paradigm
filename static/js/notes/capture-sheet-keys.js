// THE key table of the capture sheet (capture-sheet.js), docked at the foot of the note
// window's editor. Its key handling and its foot read it; nothing else binds keys there.
// Scopes: "sheet" anywhere in it, "keys" where the focus is not in a text box, "text" in a
// text box, "role" on the role choices, "day" in the day field. notTyping: the entry is off while
// a day is being typed (place.typing), so the hyphens of 2026-12-04 type. The "sheet" and "keys" entries
// with hint: show in the foot, in the shared key caps (ui/key-hints.js).
import { hintsOf } from "../ui/key-hints.js";

export const CAPTURE_SHEET_KEYS = [
  { scope: "sheet", keys: ["Enter"], action: "save", help: "save, from any field", hint: "save" },
  { scope: "sheet", keys: ["Tab"], action: "next", help: "next field: Title, Who, the role, the day, Goes to", hint: "next field" },
  { scope: "sheet", keys: ["S-Tab"], action: "previous", help: "previous field" },
  { scope: "keys", keys: ["t"], label: "t q d", action: "task", help: "make it a task", hint: "kind" },
  { scope: "keys", keys: ["q"], action: "question", help: "make it a question" },
  { scope: "keys", keys: ["d"], action: "decision", help: "make it a decision" },
  { scope: "sheet", keys: ["Escape"], action: "cancel", help: "cancel: nothing is made, back to the line", hint: "cancel" },
  { scope: "text", keys: ["A-t"], label: "Alt-T", action: "task", help: "make it a task (in a text box)" },
  { scope: "text", keys: ["A-q"], label: "Alt-Q", action: "question", help: "make it a question (in a text box)" },
  { scope: "text", keys: ["A-d"], label: "Alt-D", action: "decision", help: "make it a decision (in a text box)" },
  { scope: "role", keys: ["ArrowLeft"], action: "rolePrevious", help: "the role before" },
  { scope: "role", keys: ["ArrowRight"], action: "roleNext", help: "the role after" },
  { scope: "day", keys: ["+"], action: "dayLater", help: "a day later" },
  { scope: "day", keys: ["-"], action: "dayEarlier", help: "a day earlier (while typing a date, - types a hyphen)", notTyping: true },
];

/** A keydown as the table writes it: "Enter", "S-Tab", "A-t" (Alt by the physical key, as
 * Alt+T types "†" on a Mac), or null for Ctrl and Cmd shortcuts. */
function keyOf(event) {
  if (event.ctrlKey || event.metaKey) return null;
  if (event.altKey) {
    const letter = /^Key([A-Z])$/.exec(event.code ?? "");
    return letter ? `A-${letter[1].toLowerCase()}` : null;
  }
  if (event.key === "Tab" && event.shiftKey) return "S-Tab";
  return event.key;
}

function inScope({ scope, notTyping }, { field, text, typing = false }) {
  if (notTyping && typing) return false;
  if (scope === "sheet") return true;
  if (scope === "keys") return !text;
  if (scope === "text") return text;
  return scope === field;
}

/** The action a keydown means where the focus is ({ field, text: in a text box, typing: a day
 * is being typed in the day field }), or null. */
export function sheetAction(event, place) {
  const key = keyOf(event);
  if (key === null) return null;
  return CAPTURE_SHEET_KEYS.find((entry) => entry.keys.includes(key) && inScope(entry, place))?.action ?? null;
}

/** The foot's key caps: [{ cap, words }]. */
export function sheetHints() {
  return [...hintsOf(CAPTURE_SHEET_KEYS, { scope: "sheet" }), ...hintsOf(CAPTURE_SHEET_KEYS, { scope: "keys" })]
    .sort((a, b) => FOOT_ORDER.indexOf(a.cap) - FOOT_ORDER.indexOf(b.cap));
}

// As Figma has it: Enter save, Tab next field, t q d kind, Esc cancel.
const FOOT_ORDER = ["Enter", "Tab", "t q d", "Esc"];
