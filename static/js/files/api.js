// The files endpoints (paradigm/api/files.py): OneDrive folders linked to hubs, their files,
// and the notes each file is attached to. The synced folder is the source of truth.
import { call } from "../notes/api.js";

export const filesApi = {
  // -> { folders, files, links }
  list: () => call("/api/files"),
  // No path -> { roots, folders }: folders under the OneDrive roots, to link one. A path ->
  // { roots, folders, path, parent, files: [{ name, size, modified }] }: one folder's
  // contents, for the folder browser (parent null at a root).
  browse: (path = null) => call(path === null ? "/api/folders/browse" : `/api/folders/browse?path=${encodeURIComponent(path)}`),
  // The computer's own file dialog, on the server -> { path } (null: cancelled), or
  // { path: null, fallback: "browser", start } when Paradigm's folder browser must do it.
  pick: (noteId) => call("/api/file/pick", { payload: { note_id: noteId } }),
  // -> { file, link }; { file: null, link: null, folder } (the file's own folder) when no linked
  // folder holds it: a 200, so the usual pick from a new folder logs no console error.
  attachPath: (noteId, path) => call("/api/file/attach_path", { payload: { note_id: noteId, path } }),
  linkFolder: (noteId, path) => call("/api/folder/link", { payload: { note_id: noteId, path } }),
  unlinkFolder: (id) => call("/api/folder/unlink", { payload: { id } }),
  scan: (id) => call("/api/folder/scan", { payload: { id } }),
  attach: (fileId, noteId) => call("/api/file/attach", { payload: { file_id: fileId, note_id: noteId } }),
  detach: (fileId, noteId) => call("/api/file/detach", { payload: { file_id: fileId, note_id: noteId } }),
  open: (id) => call("/api/file/open", { payload: { id } }),
};
