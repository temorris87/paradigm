// The files endpoints (paradigm/api/files.py): OneDrive folders linked to hubs, their files,
// and the notes each file is attached to. The synced folder is the source of truth.
import { call } from "../notes/api.js";

export const filesApi = {
  // -> { folders, files, links }
  list: () => call("/api/files"),
  // -> { roots, folders }: folders under the OneDrive roots, to link one
  browse: () => call("/api/folders/browse"),
  linkFolder: (noteId, path) => call("/api/folder/link", { payload: { note_id: noteId, path } }),
  unlinkFolder: (id) => call("/api/folder/unlink", { payload: { id } }),
  scan: (id) => call("/api/folder/scan", { payload: { id } }),
  attach: (fileId, noteId) => call("/api/file/attach", { payload: { file_id: fileId, note_id: noteId } }),
  detach: (fileId, noteId) => call("/api/file/detach", { payload: { file_id: fileId, note_id: noteId } }),
  open: (id) => call("/api/file/open", { payload: { id } }),
};
