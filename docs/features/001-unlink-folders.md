# 001 Unlink folders

Status: built 2026-11-25
Backlog item: "Add ability to remove folders from Project/areas and other locations where folders are added"
Decided with Tyson: 2026-11-25
Lanes: backend (tests only), frontend
Migration: none

## Context
A OneDrive folder can be linked to a project or area ("Link a OneDrive folder…" in the Files
section's Add file picker), but nothing in the app takes it off again. The backend has always had
`POST /api/folder/unlink` (`files_repo.unlink_folder`) and `static/js/files/api.js` wraps it, but
no page calls it. Linked folders are never shown as rows either: they only show up as the
first part of each file row's detail. That leaves a dead end. A wrong path, or a folder that moved
in OneDrive, stays linked for good, and a hub with a linked folder can never be turned into a
resource (`HoldsHubThings`).

The only other "folder" in the app is the Resources folder, and the folder page's ⋯ menu can
already trash those. Folders linked to hubs are the only kind of linked folder (projects and areas
only), so "other locations" points at the same thing (Tyson, 2026-11-25: plan approved as read).

## What it does
- **Folder rows in Files.** On a project or area's own page, its Files section lists each linked
  folder first (in Files, not a section of their own: Tyson, 2026-11-25), above the files: title `📁 <folder name>`, detail
  `OneDrive folder · 12 files · 3 on notes`, with its path as the hover title. These rows show only
  on the hub the folder is linked to. A phase, meeting or note inside it still lists only its
  files.
- **Unlink.** Each folder row has the action **Unlink** (in its ⋯ / row options), and `x` /
  `Delete` on it does the same (`hub-keys.js` already sends these to `remove`). A confirm
  dialog (danger) reads: *Unlink "Contracts" from "Northwind rollout"? Its 3 files on notes come
  off them (Kickoff, Phase 1, …). Nothing in OneDrive changes.* If no file is attached, the line
  is just "Nothing in OneDrive changes." After it runs: `changed(app)` refreshes, and the status
  bar reads `Folder "Contracts" unlinked from "Northwind rollout"`.
- **Enter on a folder row** opens the Add file picker filtered to that folder's files. This needs
  no new backend (Tyson, 2026-11-25).
- **The Add file picker** gets a second fixed item, "Unlink a folder…", under "Link a OneDrive
  folder…" when the hub has any folders. It opens a picker over the hub's folders, then the same
  confirm. This makes unlink reachable from a phase or note page too.
- Once unlinked, the hub can be turned into a resource again, if nothing else stops it.

## Data
No change. Unlink is a hard delete, as built: the `file_folders` row, its `files` rows and their
`file_links` rows. Nothing on disk changes. Unlinking can't be undone (relinking the same path
finds the files again, but their attachments are gone), which is why the dialog spells out the
attachments it drops. Trash, restore and purge of the hub are unchanged.

## API contract (the unlink route as it was; `/api/files` gained `trashed`)
| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| POST | /api/folder/unlink | `{"id": 3}` | `{}` | 404 no such folder, 400 bad id |
| GET | /api/files | — | `{folders:[{id,note_id,path,name,scanned_at,trashed}], files:[…], links:[…]}`: `trashed`, the folder's attachments on notes in the trash (hidden from `links`, but unlink drops them) | — |

## Files
- Frontend lane: `static/js/files/file-commands.js` (`unlinkFolderDialog(app, folderId)`,
  `pickFolderToUnlink(app, hub)`, the picker item), `static/js/files/files-model.js` (a pure
  `folderSummary(files, folderId)`: file count, attached count, the notes they're on),
  `static/js/hubs/hub-sections.js` (folder rows in `files`, `folder: id`,
  `actions: [{key:"remove", label:"Unlink"}]`), `static/js/hubs/hub-actions.js` (`remove.files`
  goes to unlink when `row.folder`, otherwise detach; Enter on a folder row opens the picker),
  `static/js/hubs/hub-panel.js` (the row id includes `row.folder`), tests in
  `tests/js/` (files-model summary, the section's rows).
- Backend lane: no code change. Tests in `tests/python/` for `unlink_folder`: drops attachments
  on every note, leaves other folders' files alone, 404 on a gone id, and the hub can become a
  resource after it.

## Acceptance checks
1. Link a sample folder to an area: its Files section shows `📁 name` with its file count.
2. Attach two of its files to notes in the area: the folder row says "2 on notes".
3. `x` on the folder row: the confirm names the 2 notes. Cancel leaves everything as it was.
4. Confirm: the folder row and its files leave the section, the two notes' Files sections are
   empty, and the files are still on disk.
5. The ⋯ / row option "Unlink" does the same. So does "Unlink a folder…" from Add file on a note
   inside the hub.
6. A phase page inside a project with a linked folder shows no folder row.
7. After unlinking its only folder, a former resource-turned-area can be filed as a resource again.

## As built (differences from the plan)
- `files-model.js` also has `foldersOf(files, hubId)` (a hub's own folders, by name) and
  `unlinkText(...)` (the confirm's line, pure and tested); the confirm names at most three notes,
  then "…", and says "comes off it" for one.
- `addFileDialog(app, owner, { folderId })` is the folder-filtered picker; `hub-page.js` sends
  Enter on a folder row as the new row key `openFolder`.
- Rows can carry `tip` (hover text, set in `hub-panel.js`); folder rows use it for the path.
- Folder rows are not counted: the Files section's count and the sheet bar
  (`section-summary.js`) count files only.
- Backend tests are in `tests/python/test_files_unlink.py`.
- `GET /api/files` gives each folder `trashed` (review, round 2), and the confirm adds
  "N attachment(s) on notes in the trash go too, for good".
- Folder rows sit outside the Files section's 8-row limit (review, round 3).
- `unlinkFolderDialog` is async and, like `addFileDialog({folderId})`, calls
  `app.refreshTree()` before trusting the page's copy, so a row left stale by the other window
  says "that folder is no longer linked" on the status line (browser check).

## Not in this feature
Opening the folder itself in File Explorer / Finder. Changing a link's path (unlink, then link).
Resources folders: trashing one from the tree, or removing one while keeping its notes (Tyson, 2026-11-25).
