// A random id per browser tab. Kept in sessionStorage, so a reload keeps the same id
// while a new tab gets a new one.

const KEY = "paradigm.tabId";

export function tabId(storage = sessionStorage) {
  let id = storage.getItem(KEY);
  if (!id) {
    id = newId();
    storage.setItem(KEY, id);
  }
  return id;
}

function newId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
