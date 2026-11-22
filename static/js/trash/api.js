// The Trash endpoints (paradigm/api/trash.py).
import { call } from "../notes/api.js";

export const trashApi = {
  // -> { entries: [{ id, title, kind, deleted_at, purge_at, inside, parent_id, parent_title,
  //                  parent_state: "live" | "trashed" | null }], days }
  list: () => call("/api/trash"),
  // -> { note, renamed }: the note and the notes trashed with it are back
  restore: (id) => call("/api/trash/restore", { payload: { id } }),
};
