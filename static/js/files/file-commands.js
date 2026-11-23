// What the Files section's buttons do: link a OneDrive folder to a hub, add a file from it to
// a note, open a file (with this computer's program for it), take a file off a note, read a
// folder again. Each takes the NotesApp (static/js/notes/app.js); errors are thrown for the
// app (or the dialog) to show.
//
//   addFileDialog(app, owner)        a picker over the files of the folders linked there,
//                                    with "Link a OneDrive folder…" first
//   linkFolderDialog(app, hub)       a picker over the folders OneDrive syncs here, or a path
//   openFile(app, fileId) / detachFile(app, fileId, noteId) / scanFolders(app, hubId)
import { hubOf } from "../notes/hub-groups.js";
import { pickFrom } from "../ui/picker.js";
import { fileDir, folderFiles, foldersFor } from "./files-model.js";

const LINK = "link-folder";

async function changed(app) {
  app.changes.send({ type: "changed", what: ["files"] });
  await app.refreshTree();
}

export async function addFileDialog(app, owner) {
  const hub = hubOf(app.tree, owner.id);
  if (!hub) throw new Error(`E: "${owner.title}" is in no hub: file it in a project or an area first`);
  const folders = foldersFor(app.tree, app.files, owner.id);
  const attached = new Set(app.files.onNote(owner.id));
  const items = [
    { id: LINK, title: "Link a OneDrive folder…", detail: `its files can then be added anywhere in ${hub.title}` },
    ...folderFiles(app.files, folders.map((folder) => folder.id)).filter((file) => !attached.has(file.id)).map((file) => ({
      id: file.id, title: file.name,
      detail: [app.files.folder(file.folder_id).name, fileDir(file), file.missing ? "not in the folder any more" : ""].filter(Boolean).join(" › "),
      muted: file.missing,
    })),
  ];
  const picked = await pickFrom({
    title: `Add a file to "${owner.title}"`,
    placeholder: folders.length ? "part of the file's name or folder" : "no folder linked yet: link one first",
    items,
    empty: "No file matches",
    fallbackFocus: () => app.focusNote(),
  });
  if (!picked?.item) return;
  if (picked.item.id === LINK) {
    await linkFolderDialog(app, hub);
    return;
  }
  await app.filesApi.attach(picked.item.id, owner.id);
  await changed(app);
  app.say(`"${picked.item.title}" added to "${owner.title}"`);
}

export async function linkFolderDialog(app, hub) {
  let browse = { roots: [], folders: [] };
  try {
    browse = await app.filesApi.browse();
  } catch {
    // Typing the path still works.
  }
  const roots = browse.roots ?? [];
  const short = (path) => {
    const root = roots.find((each) => path === each || path.startsWith(`${each}/`) || path.startsWith(`${each}\\`));
    return root ? path.slice(root.length).replace(/^[\\/]/, "") || path : path;
  };
  const picked = await pickFrom({
    title: `Link a OneDrive folder to "${hub.title}"`,
    placeholder: "part of the folder's name, or paste its full path",
    items: (browse.folders ?? []).map((path) => ({ id: path, title: short(path), detail: path })),
    create: (text) => `Link the folder ${text}`,
    empty: "No folder matches: paste the folder's full path from File Explorer",
    fallbackFocus: () => app.focusNote(),
  });
  const path = picked?.item?.id ?? picked?.create ?? null;
  if (!path) return;
  const { folder, added } = await app.filesApi.linkFolder(hub.id, path);
  await changed(app);
  app.say(`Folder "${folder.name}" linked to "${hub.title}": ${added} file${added === 1 ? "" : "s"} found`);
}

export async function openFile(app, fileId) {
  const file = app.files.file(fileId);
  if (!file) throw new Error("E: that file is gone");
  if (file.missing) throw new Error(`E: "${file.name}" is not in its folder any more (moved or deleted in OneDrive)`);
  await app.filesApi.open(fileId);
  app.say(`Opening "${file.name}"…`);
}

export async function detachFile(app, fileId, noteId) {
  const file = app.files.file(fileId);
  await app.filesApi.detach(fileId, noteId);
  await changed(app);
  app.say(`"${file?.name ?? "The file"}" taken off "${app.tree.get(noteId)?.title ?? ""}" (it stays in OneDrive)`);
}

/** Reads a hub's folders again (when its page opens): new files show up, gone ones are flagged. */
export async function scanFolders(app, hubId) {
  const folders = app.files.allFolders().filter((folder) => folder.note_id === hubId);
  if (!folders.length) return;
  let news = 0;
  for (const folder of folders) {
    const { added, missing } = await app.filesApi.scan(folder.id);
    news += added + missing;
  }
  if (news) await app.refreshTree();
}
