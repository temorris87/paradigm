// The note templates endpoint (paradigm/api/templates.py). A template's title and text are
// its note's: notesApi renames and saves them.
import { call } from "../notes/api.js";

export const templatesApi = {
  // -> { note }
  create: (title, body = "") => call("/api/template/create", { payload: { title, body } }),
};
