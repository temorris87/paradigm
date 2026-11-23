// The notes opened last, newest first, kept per browser (both windows share it): the
// palette's Recent group.
//
//   rememberOpened(id, storage?)    put it first
//   recentIds(storage?)             [ids], newest first (at most MAX_RECENT)
const KEY = "paradigm.recent";
export const MAX_RECENT = 8;

export function recentIds(storage = localStorage) {
  try {
    const ids = JSON.parse(storage.getItem(KEY) ?? "[]");
    return Array.isArray(ids) ? ids.filter(Number.isInteger).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function rememberOpened(id, storage = localStorage) {
  if (!Number.isInteger(id)) return;
  const ids = [id, ...recentIds(storage).filter((each) => each !== id)].slice(0, MAX_RECENT);
  try {
    storage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // A full or refused storage only loses the list.
  }
}
