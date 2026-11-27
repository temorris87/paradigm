// The task emails endpoints (paradigm/api/emails.py): Outlook .msg files saved with a task,
// their subject, sender and sent time read by the server, and whether a reply is owed.
//   email: { id, task_id, subject, sender, sender_email, sent_at, reply, replied_on, file_name, added_at }
import { call } from "../notes/api.js";

export const emailsApi = {
  // -> [email], newest sent first
  list: async (taskId) => (await call(`/api/task/emails?task=${encodeURIComponent(taskId)}`)).emails,
  // file: a File (or Blob) holding the .msg's bytes, sent raw -> email
  upload: async (taskId, name, file) => (await call(
    `/api/task/email/upload?task=${encodeURIComponent(taskId)}&name=${encodeURIComponent(name)}`,
    { blob: file.slice(0, file.size, "application/octet-stream") })).email,
  // reply: "needed" | "replied" | "none" -> email
  setReply: async (id, reply) => (await call("/api/task/email/reply", { payload: { id, reply } })).email,
  // Opens the saved .msg with this computer's program for it (Outlook).
  open: (id) => call("/api/task/email/open", { payload: { id } }),
  // Takes it off the task and deletes the saved copy.
  remove: (id) => call("/api/task/email/remove", { payload: { id } }),
};
