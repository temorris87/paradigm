// The app's own facts (paradigm/api/about.py): the folder it keeps its notes in, its version.
import { call } from "../notes/api.js";

export const aboutApi = {
  // -> { data_folder, version? }
  get: () => call("/api/about"),
};
