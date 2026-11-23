// What can be done with folders in Resources: the dialogs, pickers and menus, each ending in
// a foldersApi call and a refresh. The tree (its + and `a`), a folder's page and the note
// menu all come here.
//
//   addInFolderMenu(app, folderId | null, anchor)   New note… / New folder… there
//   newFolderDialog(app, parentId) / newResourceDialog(app, folderId)
//   renameFolderDialog(app, id) / moveFolderDialog(app, id) / trashFolderDialog(app, id)
//   moveToFolderDialog(app, noteId)                 a resource note into another folder
//   folderTargets(folders, { except? })             what the pickers list (pure)
import { confirmDialog, formDialog } from "../ui/dialog.js";
import { openMenu } from "../ui/menu.js";
import { pickFrom } from "../ui/picker.js";
import { countIn } from "./folders-model.js";

const TOP = Object.freeze({ id: 0, title: "Resources", detail: "the top: in no folder" });

export function addInFolderMenu(app, folderId, anchor) {
  const where = folderId === null ? "Resources" : `"${app.folders.get(folderId)?.title ?? ""}"`;
  openMenu(anchor, [
    { label: "New note…", hint: `a note in ${where}`, run: () => app.guard(newResourceDialog(app, folderId)) },
    { label: "New folder…", hint: `a folder in ${where}`, run: () => app.guard(newFolderDialog(app, folderId)) },
  ], { label: `New in ${where}` });
}

export function newResourceDialog(app, folderId) {
  const folder = folderId === null ? null : app.folders.get(folderId);
  return formDialog({
    title: folder ? `New note in "${folder.title}"` : "New note in Resources",
    fields: [{ key: "title", label: "Title" }],
    submit: "Make it",
    run: ({ title }) => app.createFiled("resource", title, { folderId }),
  });
}

export function newFolderDialog(app, parentId) {
  const parent = parentId === null ? null : app.folders.get(parentId);
  return formDialog({
    title: parent ? `New folder in "${parent.title}"` : "New folder in Resources",
    fields: [{ key: "title", label: "Name" }],
    submit: "Make it",
    run: async ({ title }) => {
      const folder = await app.foldersApi.create(parentId, title);
      await app.folderChanged(`Folder "${folder.title}" made`);
      return folder;
    },
  });
}

export function renameFolderDialog(app, id) {
  const folder = app.folders.get(id);
  return formDialog({
    title: `Rename the folder "${folder.title}"`,
    fields: [{ key: "title", label: "Name", value: folder.title }],
    submit: "Rename",
    run: async ({ title }) => {
      const renamed = await app.foldersApi.rename(id, title);
      await app.folderChanged(`Renamed to "${renamed.title}"`);
    },
  });
}

export async function moveFolderDialog(app, id) {
  const folder = app.folders.get(id);
  const picked = await pickFrom({
    title: `Move the folder "${folder.title}" into…`,
    placeholder: "part of a folder's name",
    items: folderTargets(app.folders, { except: id }),
  });
  if (!picked?.item) return;
  const moved = await app.foldersApi.move(id, picked.item.id || null);
  await app.folderChanged(`"${moved.title}" is now in ${picked.item.title}`);
}

export function trashFolderDialog(app, id) {
  const folder = app.folders.get(id);
  const notes = countIn(app.tree, app.folders, id);
  const what = notes ? ` and the ${notes === 1 ? "note" : `${notes} notes`} in it` : "";
  return confirmDialog({
    title: "Move to trash",
    text: `Move the folder "${folder.title}"${what} to the Trash? Restoring a note from the Trash brings its folder back.`,
    confirm: "Move to trash",
    danger: true,
    run: async () => {
      await app.foldersApi.trash(id);
      await app.folderChanged(`"${folder.title}" moved to the Trash`, { gone: id });
    },
  });
}

export async function moveToFolderDialog(app, noteId) {
  const note = app.tree.get(noteId);
  const picked = await pickFrom({
    title: `Move "${note.title}" into…`,
    placeholder: "part of a folder's name",
    items: folderTargets(app.folders),
  });
  if (!picked?.item) return;
  await app.foldersApi.putNote(noteId, picked.item.id || null);
  await app.folderChanged(`"${note.title}" is now in ${picked.item.title}`);
}

/** The top of Resources, then every folder in tree order with where it is (pure). except:
 * a folder that can't go into itself or a folder inside it. */
export function folderTargets(folders, { except = null } = {}) {
  const skip = new Set(except === null ? [] : folders.inside(except));
  return [TOP, ...folders.inOrder().filter(({ folder }) => !skip.has(folder.id)).map(({ folder }) => ({
    id: folder.id,
    title: folder.title,
    detail: ["Resources", ...folders.path(folder.id).slice(0, -1).map((each) => each.title)].join(" › "),
  }))];
}
