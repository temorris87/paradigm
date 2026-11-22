// The decisions and questions endpoints (paradigm/api/records.py). A record's title and text
// are its note's, so notesApi renames and saves them.
import { call } from "../notes/api.js";

export const recordsApi = {
  // -> [{ id, kind: "decision" | "question", day, people: [person ids], answered? }]
  list: async () => (await call("/api/records")).records,
  // -> { note, record }: the note is made under parentId (a hub, or a meeting in one)
  create: (parentId, kind, title, day) => call("/api/record/create", { payload: { parent_id: parentId, kind, title, day } }),
  // -> record
  date: (id, day) => call("/api/record/date", { payload: { id, day } }),
  answer: (id, day) => call("/api/record/answer", { payload: { id, day } }),
  reopen: (id) => call("/api/record/reopen", { payload: { id } }),
  // -> { record, added: [person ids that were not on it] }
  involve: (id, personIds) => call("/api/record/with", { payload: { id, person_ids: personIds } }),
  uninvolve: (id, personId) => call("/api/record/unwith", { payload: { id, person_id: personId } }),
};
