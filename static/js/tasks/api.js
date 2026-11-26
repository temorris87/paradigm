// The tasks endpoints (paradigm/api/tasks.py): tasks, their subtasks, and the blocks of time
// they are scheduled in.
import { call } from "../notes/api.js";

export const tasksApi = {
  // -> [{ id, note_id, parent_id, title, notes, due, delegate_id, follow_up, done, done_day, position }]
  list: async () => (await call("/api/tasks")).tasks,
  create: (noteId, title, { parentId = null, due = "", notes = "" } = {}) =>
    call("/api/task/create", { payload: { note_id: noteId, title, parent_id: parentId, due, notes } }),
  // values: any of { title, notes, due, follow_up }
  update: (id, values) => call("/api/task/update", { payload: { id, ...values } }),
  delegate: (id, personId, followUp = "") => call("/api/task/delegate", { payload: { id, person_id: personId, follow_up: followUp } }),
  setDone: (id, done) => call("/api/task/done", { payload: { id, done } }),
  setFor: (id, personId) => call("/api/task/for", { payload: { id, person_id: personId } }),
  move: (id, beforeId) => call("/api/task/move", { payload: { id, before_id: beforeId } }),
  remove: (id) => call("/api/task/remove", { payload: { id } }),
  // -> [{ id, task_id, day, start, end }]
  sessions: async (from, to) => (await call(`/api/sessions?from=${from}&to=${to}`)).sessions,
  addSession: (taskId, day, start, end) => call("/api/session/add", { payload: { task_id: taskId, day, start, end } }),
  moveSession: (id, day, start, end) => call("/api/session/move", { payload: { id, day, start, end } }),
  removeSession: (id) => call("/api/session/remove", { payload: { id } }),
};
