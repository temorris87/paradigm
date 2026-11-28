// What the Files section's buttons do: add a file to a note through the computer's own file
// dialog (or Paradigm's folder browser), search the linked folders' files, link a OneDrive
// folder to a hub, open a file (with this computer's program for it), take a file off a note,
// unlink a folder from its hub, read a folder again. Each takes the NotesApp
// (static/js/notes/app.js); errors are thrown for the app (or the dialog) to show.
//
//   addFileDialog(app, owner)        the server opens the file dialog (in the hub's oldest
//                                    linked folder, else OneDrive); when it can't, the folder
//                                    browser (folder-browser.js) opens at the same folder.
//                                    The file picked is attached (attachPicked)
//   attachPicked(app, owner, hub, path)  attaches a picked file; from a folder not linked yet,
//                                    a confirm offers to link the file's own folder to the hub
//   addTaskFileDialog(app, task)     the same dialog in the task's hub's folders; the file is
//                                    linked to the task (tasks/api.js attachFilePath)
//   searchFilesDialog(app, owner, { folderId? })   a picker over the files of the folders
//                                    linked there; folderId: only that folder's files (Enter
//                                    on a folder row)
//   linkFolderDialog(app, hub)       a picker over the folders OneDrive syncs here, or a path
//   pickFolderToUnlink(app, hub)     a picker over the hub's own folders, then the confirm
//   unlinkFolderDialog(app, folderId)  the confirm, naming the notes its files come off; then
//                                    the folder, its files and their attachments are gone
//                                    (nothing in OneDrive changes)
//   openFile(app, fileId) / detachFile(app, fileId, noteId) / scanFolders(app, hubId)
import { hubOf } from "../notes/hub-groups.js";
import { pickFrom } from "../ui/picker.js";
import { confirmDialog } from "../ui/dialog.js";
import { fileDir, folderFiles, folderSummary, foldersFor, foldersOf, unlinkText } from "./files-model.js";
import { browseForFile } from "./folder-browser.js";

async function changed(app) {
  app.changes.send({ type: "changed", what: ["files"] });
  await app.refreshTree();
}

function hubFor(app, owner) {
  const hub = hubOf(app.tree, owner.id);
  if (!hub) throw new Error(`E: "${owner.title}" is in no hub: file it in a project or an area first`);
  return hub;
}

export async function addFileDialog(app, owner) {
  const hub = hubFor(app, owner);
  const path = await pickPath(app, hub, `Add a file to ${hub.title}`);
  // A cancelled dialog changes nothing and says nothing.
  if (!path) return null;
  return attachPicked(app, owner, hub, path);
}

/** The server's file dialog, starting in the hub's own folders (so the hub, not a note inside
 * it, is asked for); the folder browser when it can't open. The path picked, or null. */
async function pickPath(app, hub, title) {
  const picked = await app.filesApi.pick(hub.id);
  const path = picked?.path ?? null;
  if (path || picked?.fallback !== "browser") return path;
  return browseForFile({ api: app.filesApi, start: picked.start ?? null, title, fallbackFocus: () => app.focusNote() });
}

export function attachPicked(app, owner, hub, path) {
  return attachOffering(app, hub, () => app.filesApi.attachPath(owner.id, path));
}

/** Add file… on a task's page: picked in its hub's folders, then linked to the task (the
 * server's /api/task/file/attach_path). The { file } attached, or null. */
export async function addTaskFileDialog(app, task) {
  const hub = hubFor(app, app.tree.get(task.note_id) ?? { id: task.note_id, title: task.title });
  const path = await pickPath(app, hub, `Add a file to "${task.title}"`);
  if (!path) return null;
  return attachOffering(app, hub, () => app.tasksApi.attachFilePath(task.id, path), ` to "${task.title}"`);
}

/** attach() -> { file } or { file: null, folder }: from a folder not linked yet, a confirm
 * offers to link the file's own folder to the hub, then attaches again. */
async function attachOffering(app, hub, attach, where = "") {
  let result = await attach();
  if (!result.file) {
    const folder = result.folder;
    let linked = false;
    result = await confirmDialog({
      title: "Link folder",
      text: `Link "${folder}" to ${hub.title}? Its files show under Files.`,
      confirm: "Link",
      run: async () => {
        if (!linked) await app.filesApi.linkFolder(hub.id, folder);
        linked = true;
        const attached = await attach();
        if (!attached.file) throw new Error(`E: "${folder}" is linked, but the file is still not in it`);
        return attached;
      },
      fallbackFocus: () => app.focusNote(),
    });
    if (!result) {
      // Linked, then the attach failed and the dialog was closed: the folder still shows.
      if (linked) await changed(app);
      return null;
    }
  }
  await changed(app);
  app.say(`"${result.file.name}" added${where}`);
  return result;
}

export async function searchFilesDialog(app, owner, { folderId = null } = {}) {
  hubFor(app, owner);
  // The page's copy may be stale (unlinked in the other window): reload before trusting it.
  if (folderId !== null) await app.refreshTree();
  const one = folderId === null ? null : app.files.folder(folderId);
  if (folderId !== null && !one) throw new Error("E: that folder is no longer linked");
  const folders = one ? [one] : foldersFor(app.tree, app.files, owner.id);
  const attached = new Set(app.files.onNote(owner.id));
  const items = folderFiles(app.files, folders.map((folder) => folder.id)).filter((file) => !attached.has(file.id)).map((file) => ({
    id: file.id, title: file.name,
    detail: [app.files.folder(file.folder_id).name, fileDir(file), file.missing ? "not in the folder any more" : ""].filter(Boolean).join(" › "),
    muted: file.missing,
  }));
  const picked = await pickFrom({
    title: one ? `Add a file from "${one.name}" to "${owner.title}"` : `Add a file to "${owner.title}"`,
    placeholder: folders.length ? "part of the file's name or folder" : "no folder linked yet: link one first",
    items,
    empty: "No file matches",
    fallbackFocus: () => app.focusNote(),
  });
  if (!picked?.item) return;
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

export async function pickFolderToUnlink(app, hub) {
  const folders = foldersOf(app.files, hub.id);
  if (!folders.length) throw new Error(`E: "${hub.title}" has no folder linked`);
  const picked = await pickFrom({
    title: `Unlink a folder from "${hub.title}"`,
    placeholder: "part of the folder's name or path",
    items: folders.map((folder) => ({ id: folder.id, title: folder.name, detail: folder.path })),
    empty: "No folder matches",
    fallbackFocus: () => app.focusNote(),
  });
  if (!picked?.item) return;
  await unlinkFolderDialog(app, picked.item.id);
}

export async function unlinkFolderDialog(app, folderId) {
  await app.refreshTree(); // the page's copy may be stale (unlinked in the other window)
  const folder = app.files.folder(folderId);
  if (!folder) throw new Error("E: that folder is no longer linked");
  const hubTitle = app.tree.get(folder.note_id)?.title ?? "its hub";
  return confirmDialog({
    title: "Unlink folder",
    text: unlinkText(folder.name, hubTitle, folderSummary(app.files, folderId),
      (id) => app.tree.get(id)?.title ?? null),
    confirm: "Unlink",
    danger: true,
    run: async () => {
      await app.filesApi.unlinkFolder(folderId);
      await changed(app);
      app.say(`Folder "${folder.name}" unlinked from "${hubTitle}"`);
    },
    fallbackFocus: () => app.focusNote(),
  });
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
