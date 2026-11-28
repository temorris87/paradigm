// The tasks endpoints (paradigm/api/tasks.py): tasks, their subtasks, and the blocks of time
// they are scheduled in, their files and their history.
import { call } from "../notes/api.js";

export const tasksApi = {
  // -> [{ id, note_id, parent_id, title, notes, due, delegate_id, follow_up, done, done_day, position,
  //    follow_up_count }]
  list: async () => (await call("/api/tasks")).tasks,
  create: (noteId, title, { parentId = null, due = "", notes = "" } = {}) =>
    call("/api/task/create", { payload: { note_id: noteId, title, parent_id: parentId, due, notes } }),
  // values: any of { title, notes, due, follow_up }
  update: (id, values) => call("/api/task/update", { payload: { id, ...values } }),
  delegate: (id, personId, followUp = "") => call("/api/task/delegate", { payload: { id, person_id: personId, follow_up: followUp } }),
  setDone: (id, done) => call("/api/task/done", { payload: { id, done } }),
  // A follow-up logged: outcome "again" (next: the new follow-up day, after today) or "closed"
  // (the task done today). today: the browser's day. -> the task, plus follow_up_count
  followedUp: (id, { note = "", outcome, next = "", today }) => call("/api/task/followed_up",
    { payload: { id, note, outcome, today, ...(outcome === "again" ? { next } : {}) } }),
  setFor: (id, personId) => call("/api/task/for", { payload: { id, person_id: personId } }),
  move: (id, beforeId) => call("/api/task/move", { payload: { id, before_id: beforeId } }),
  remove: (id) => call("/api/task/remove", { payload: { id } }),
  // -> [{ id, task_id, day, start, end }]
  sessions: async (from, to) => (await call(`/api/sessions?from=${from}&to=${to}`)).sessions,
  addSession: (taskId, day, start, end) => call("/api/session/add", { payload: { task_id: taskId, day, start, end } }),
  moveSession: (id, day, start, end) => call("/api/session/move", { payload: { id, day, start, end } }),
  removeSession: (id) => call("/api/session/remove", { payload: { id } }),
  // A task's files (files of the hubs' linked folders): file: { id, name, rel_path, folder_id,
  // folder_name, hub_id, hub_title, missing, added_at } -> [file], oldest added first
  files: async (taskId) => (await call(`/api/task/files?task=${encodeURIComponent(taskId)}`)).files,
  attachFile: (taskId, fileId) => call("/api/task/file/attach", { payload: { task_id: taskId, file_id: fileId } }),
  // -> { file }; { file: null, folder } (the file's own folder) when no linked folder holds it
  attachFilePath: (taskId, path) => call("/api/task/file/attach_path", { payload: { task_id: taskId, path } }),
  // Unlinks it from the task; the file itself is left alone.
  detachFile: (taskId, fileId) => call("/api/task/file/detach", { payload: { task_id: taskId, file_id: fileId } }),
  // The task's life, derived: [{ day, time, kind, text, note_id }], newest first; kind: created,
  // captured, placed, delegated, done, followed_up (with next: a day or null, and closed)
  history: async (taskId) => (await call(`/api/task/history?task=${encodeURIComponent(taskId)}`)).events,
};
