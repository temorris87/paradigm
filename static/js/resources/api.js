// The folders in Resources (paradigm/api/folders.py), and putting a resource note in one.
import { call } from "../notes/api.js";

export const foldersApi = {
  list: async () => (await call("/api/folders")).folders,
  create: (parentId, title) => call("/api/folder/create", { payload: { parent_id: parentId, title } }),
  rename: (id, title) => call("/api/folder/rename", { payload: { id, title } }),
  move: (id, parentId) => call("/api/folder/move", { payload: { id, parent_id: parentId } }),
  // -> { folders: [ids], notes: [ids] }: it, the folders inside it and their notes, trashed
  trash: (id) => call("/api/folder/trash", { payload: { id } }),
  // a resource into a folder (null: the top of Resources)
  putNote: (noteId, folderId) => call("/api/note/folder", { payload: { id: noteId, folder_id: folderId } }),
};
