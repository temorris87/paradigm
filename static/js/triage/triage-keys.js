// THE key table of the Inbox triage dialog (triage.js). Its key handling and its key line
// read it; nothing else binds keys there. hint: shown on the option (option) or in the foot.
export const TRIAGE_KEYS = [
  { keys: ["1"], action: "underSuggested", help: "file it under the suggested hub", option: true },
  { keys: ["r"], action: "resource", help: "a resource, into a folder", option: true },
  { keys: ["m"], action: "underNote", help: "under another note", option: true },
  { keys: ["p"], action: "project", help: "make it a project", option: true },
  { keys: ["a"], action: "area", help: "make it an area", option: true },
  { keys: ["t"], action: "task", help: "a task on a hub, and the note to the Trash", option: true },
  { keys: ["x"], action: "trash", help: "to the Trash", option: true },
  { keys: ["j", "ArrowDown"], action: "next", help: "next option" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous option" },
  { keys: ["Enter"], action: "choose", help: "do the chosen option" },
  { keys: [" "], action: "skip", help: "leave it in the Inbox for now", hint: "skip" },
  { keys: ["o"], action: "open", help: "open it to read (in the note window)", hint: "open to read" },
  { keys: ["u"], action: "undo", help: "undo the last one", hint: "undo last" },
  { keys: ["Escape"], action: "stop", help: "stop", hint: "stop" },
];

const BY_KEY = new Map(TRIAGE_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

export function triageAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_KEY.get(event.key) ?? null;
}

/** The key that does an option: "1", "r"... */
export function keyOf(action) {
  return TRIAGE_KEYS.find((entry) => entry.action === action)?.keys[0] ?? "";
}

/** [[key, words]] of the foot line. */
export function triageHints() {
  return TRIAGE_KEYS.filter((entry) => entry.hint).map((entry) => [entry.keys[0] === " " ? "Space" : entry.keys[0], entry.hint]);
}
