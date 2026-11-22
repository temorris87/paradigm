// A random id per browser tab. Kept in sessionStorage, so a reload keeps the same id
// while a new tab gets a new one. A popup starts with a copy of its opener's sessionStorage,
// so the calendar and timesheet windows keep theirs under a key of their own (kind).

const KEY = "paradigm.tabId";

export function tabId(storage = sessionStorage, kind = "") {
  const key = kind ? `${KEY}.${kind}` : KEY;
  let id = storage.getItem(key);
  if (!id) {
    id = newId();
    storage.setItem(key, id);
  }
  return id;
}

function newId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
