// OneDrive files read together with the notes tree: folders linked to hubs, the files found
// in them, and the notes each file is attached to (/api/files). A file is one record however
// many notes it is on. Pure.
//
//   const files = new Files(await filesApi.list());
//   files.file(id) / files.folder(id) / files.notesOf(fileId)
//   filesOn(tree, files, owner)        a page's Files: [{ file, folder, own, via, others }]:
//                                      the files on the owner and the notes inside it (an area:
//                                      its own only, as tasks); own: on the owner itself; via:
//                                      the note inside it that has it; others: the other notes
//                                      it is on. By name.
//   foldersFor(tree, files, noteId)    the folders whose files can be added there: its hub's,
//                                      and a project's area's
//   folderFiles(files, folderIds)      the files in those folders, by path
//   foldersOf(files, hubId)            the folders linked to that hub itself, by name
//   folderSummary(files, folderId)     { files, attached, noteIds, trashed }: how many files
//                                      it holds, how many of them are on a note, those notes'
//                                      ids (each once, in link order), and its attachments on
//                                      notes in the trash (the server's folder.trashed)
//   unlinkText(name, hubTitle, summary, titleOf)   the unlink confirm's line, naming the notes
//                                      its files come off (titleOf: id -> title, or null)
//   fileDir(file)                      "Design/Drawings" ("" at the folder's top)
import { hubOf } from "../notes/hub-groups.js";

// The notes named in the unlink confirm before "…".
const NAMED_NOTES = 3;

export class Files {
  constructor({ folders = [], files = [], links = [] } = {}) {
    this.folders = new Map(folders.map((folder) => [folder.id, folder]));
    this.files = new Map(files.map((file) => [file.id, file]));
    this.byFile = new Map();
    this.byNote = new Map();
    for (const { file_id: fileId, note_id: noteId } of links) {
      if (!this.files.has(fileId)) continue;
      if (!this.byFile.has(fileId)) this.byFile.set(fileId, []);
      this.byFile.get(fileId).push(noteId);
      if (!this.byNote.has(noteId)) this.byNote.set(noteId, []);
      this.byNote.get(noteId).push(fileId);
    }
  }

  file(id) {
    return this.files.get(id) ?? null;
  }

  folder(id) {
    return this.folders.get(id) ?? null;
  }

  notesOf(fileId) {
    return this.byFile.get(fileId) ?? [];
  }

  onNote(noteId) {
    return this.byNote.get(noteId) ?? [];
  }

  allFolders() {
    return [...this.folders.values()];
  }
}

export function filesOn(tree, files, owner) {
  const inside = new Set([owner.id, ...tree.inOrder(owner.id).map((note) => note.id)]);
  const found = new Map();
  for (const noteId of inside) {
    for (const fileId of files.onNote(noteId)) {
      const own = noteId === owner.id;
      const seen = found.get(fileId);
      if (seen && (seen.own || !own)) continue;
      found.set(fileId, { file: files.file(fileId), folder: files.folder(files.file(fileId).folder_id), own,
        via: own ? null : tree.get(noteId) });
    }
  }
  return [...found.values()].map((entry) => ({
    ...entry,
    others: files.notesOf(entry.file.id).filter((id) => !inside.has(id) && tree.has(id)).map((id) => tree.get(id)),
  })).sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { sensitivity: "base" }));
}

export function foldersFor(tree, files, noteId) {
  const hub = hubOf(tree, noteId);
  if (!hub) return [];
  const owners = new Set([hub.id, ...(hub.kind === "project" && hub.area_id ? [hub.area_id] : [])]);
  return files.allFolders().filter((folder) => owners.has(folder.note_id));
}

export function folderFiles(files, folderIds) {
  const wanted = new Set(folderIds);
  return [...files.files.values()].filter((file) => wanted.has(file.folder_id))
    .sort((a, b) => a.rel_path.localeCompare(b.rel_path, undefined, { sensitivity: "base" }));
}

export function fileDir(file) {
  const at = file.rel_path.lastIndexOf("/");
  return at < 0 ? "" : file.rel_path.slice(0, at);
}

export function foldersOf(files, hubId) {
  return files.allFolders().filter((folder) => folder.note_id === hubId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function folderSummary(files, folderId) {
  const inside = [...files.files.values()].filter((file) => file.folder_id === folderId);
  const noteIds = new Set();
  let attached = 0;
  for (const file of inside) {
    const notes = files.notesOf(file.id);
    if (notes.length) attached += 1;
    for (const noteId of notes) noteIds.add(noteId);
  }
  // Attachments on notes in the trash are not in `links`, but unlink drops them too.
  const trashed = files.folder(folderId)?.trashed ?? 0;
  return { files: inside.length, attached, noteIds: [...noteIds], trashed };
}

/** The unlink confirm's line: what it drops, by note. */
export function unlinkText(folderName, hubTitle, summary, titleOf) {
  const ask = `Unlink "${folderName}" from "${hubTitle}"?`;
  const safe = "Nothing in OneDrive changes.";
  const trashed = summary.trashed ?? 0;
  const binned = trashed ? ` ${trashed} attachment${trashed === 1 ? "" : "s"} on notes in the trash ${trashed === 1 ? "goes" : "go"} too, for good.` : "";
  if (!summary.attached) return `${ask}${binned} ${safe}`;
  const titles = summary.noteIds.map(titleOf).filter(Boolean);
  const named = titles.length > NAMED_NOTES ? [...titles.slice(0, NAMED_NOTES), "…"] : titles;
  const one = summary.attached === 1;
  const which = named.length ? ` (${named.join(", ")})` : "";
  return `${ask} Its ${summary.attached} file${one ? "" : "s"} on notes come${one ? "s" : ""} off ${titles.length === 1 ? "it" : "them"}${which}.${binned} ${safe}`;
}
