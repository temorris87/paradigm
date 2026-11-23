// The decisions and questions endpoints (paradigm/api/records.py). A record's title and text
// are its note's, so notesApi renames and saves them.
import { call } from "../notes/api.js";

export const recordsApi = {
  // -> [{ id, kind: "decision" | "question", day, people: [person ids], answered?,
  //       source_id, quote, quote_found }]
  list: async () => (await call("/api/records")).records,
  // -> { note, record }: the note is made directly under the hub of parentId (a hub, or a
  // note or meeting in one); it came from sourceId (default: parentId unless that is the
  // hub), made from the text quote there
  create: (parentId, kind, title, day, { sourceId = null, quote = "" } = {}) =>
    call("/api/record/create", { payload: { parent_id: parentId, kind, title, day, source_id: sourceId, quote } }),
  // -> record
  date: (id, day) => call("/api/record/date", { payload: { id, day } }),
  // text: the answer, added to the question's note
  answer: (id, day, text = "") => call("/api/record/answer", { payload: { id, day, text } }),
  reopen: (id) => call("/api/record/reopen", { payload: { id } }),
  // -> { record, added: [person ids that were not on it] }
  involve: (id, personIds) => call("/api/record/with", { payload: { id, person_ids: personIds } }),
  uninvolve: (id, personId) => call("/api/record/unwith", { payload: { id, person_id: personId } }),
  convert: (id, day) => call("/api/record/convert", { payload: { id, day } }),
};
