// The status log endpoints (paradigm/api/status.py): where a project or an area stands.
import { call } from "../notes/api.js";

export const statusApi = {
  // -> { logs: [{ id, note_id, day, health, text, created_at }], stale_days }
  list: () => call("/api/status_logs"),
  create: (noteId, day, health, text) => call("/api/status_log/create", { payload: { note_id: noteId, day, health, text } }),
  update: (id, day, health, text) => call("/api/status_log/update", { payload: { id, day, health, text } }),
  remove: (id) => call("/api/status_log/remove", { payload: { id } }),
};
