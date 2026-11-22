// The tasks endpoints (paradigm/api/tasks.py): the boxes in notes' text and the blocks of
// time they are scheduled in.
import { call } from "../notes/api.js";

export const tasksApi = {
  // -> [{ id, note_id, field, line, parent_id, title, done, done_day }]
  list: async () => (await call("/api/tasks")).tasks,
  // -> { task, note_id, field, version }: the box in the note's text is ticked or cleared
  setDone: (id, done) => call("/api/task/done", { payload: { id, done } }),
  // -> [{ id, task_id, day, start, end }]
  sessions: async (from, to) => (await call(`/api/sessions?from=${from}&to=${to}`)).sessions,
  addSession: (taskId, day, start, end) => call("/api/session/add", { payload: { task_id: taskId, day, start, end } }),
  moveSession: (id, day, start, end) => call("/api/session/move", { payload: { id, day, start, end } }),
  removeSession: (id) => call("/api/session/remove", { payload: { id } }),
};
