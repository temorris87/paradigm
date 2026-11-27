# 020 Files: native file picker

Status: built (2026-11-27)
Backlog item: Files: "Add file…" opens the Windows file picker (tkinter's dialog in its own process,
  starting in the hub's linked OneDrive folder) in place of the text-search picker; a file from
  a folder not linked yet offers to link it. If tkinter is missing, a folder browser inside
  Paradigm.
Decided with Tyson: 2026-11-27
Lanes: backend, frontend
Migration: none

## What it does
"Add file…" in a hub's Files section opens the operating system's own file dialog. On the work
PC that is the Windows one; tkinter is installed there (Tyson, 2026-11-27). The server runs the
dialog through tkinter in a child process (`sys.executable -c <script>`), so tk never runs in a
server thread.

1. **Where it starts.**
   - With folders linked to the hub, in the oldest one (by `file_folders.created_at`). tkinter
     can take only one start folder (default, approved by Tyson, 2026-11-27).
   - With nothing linked, at the OneDrive root (`onedrive_roots()[0]`).
   - The dialog comes to the front (`-topmost`, then `focus_force`), and its title is
     `Add a file to <hub title>`.
2. **A file inside a linked folder.** The folder is scanned, the file is found by its `rel_path`,
   and it is attached to the hub. The status line says `"<name>" added`, and the Files section
   shows it.
3. **A file outside every linked folder.**
   - A confirm dialog asks: `Link "<folder>" to <hub>? Its files show under Files.`, with the
     buttons Link and Cancel.
   - The folder offered is the picked file's own folder, not its top folder under OneDrive
     (default, approved by Tyson, 2026-11-27).
   - Link runs `folder/link` and then attaches the file. Cancel attaches nothing.
4. **Cancelling the dialog** does nothing and says nothing.
5. **The dialog blocks one server thread until it closes.** After 10 minutes it counts as a
   cancel. The server is a threading server, so the rest keeps working meanwhile (default,
   approved by Tyson, 2026-11-27).
6. **The folder browser.**
   - Paradigm opens its own folder browser when tkinter is missing (the child exits with code
     3), when the child fails to start, or when `PARADIGM_FILE_PICKER=browser` is set in the
     server's environment. The variable is for tests, and a way out if the native dialog
     misbehaves.
   - It is a dialog on the overlay surface. It starts in the same folder the native one would,
     shows the current path at the top, and lists folders first, then files, each sorted by
     name.

   Keys (its own key table, `static/js/files/folder-browser-keys.js`):

   | Key | What it does |
   |---|---|
   | `j` / `k` (↓ / ↑) | move |
   | `gg` / `G` | first / last |
   | Enter (or `l`) | on a folder, opens it; on a file, picks it |
   | `h` / Backspace | goes up to the parent; at a root, shows the roots |
   | `/` | filters by name; Enter and Esc in the filter go back to the list |
   | Esc | cancels |

   A file picked here goes through the same steps 2 and 3.
7. **What stays.** The Files section head gets a "···" menu (`m` on the section's heading or rows opens it) with:
   - "Search linked files…": the old text-search picker, `pickFrom` over the linked folders'
     files;
   - "Link a folder…": the old link dialog;
   - "Unlink a folder…".

   Before this feature these were rows inside the old picker. The note window's sheet gets the
   same.

## Data
None. It uses `file_folders`, `files` and `file_links` (migration 020).

## API contract
| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| POST | /api/file/pick | `{"note_id": 4}` | Picked: `{"path": "C:\\Users\\…\\a.xlsx"}`. Cancelled or timed out: `{"path": null}`. No tk, or forced: `{"path": null, "fallback": "browser", "start": "<folder>"}` | 404 note not found or trashed; 400 note is not a hub |
| POST | /api/file/attach_path | `{"note_id": 4, "path": "<absolute path>"}` | `{"file": {"id", "folder_id", "rel_path", "name", "size", "modified", "missing"}, "link": {"file_id", "note_id", "added_at"}}` | Not in a linked folder: 200 `{"file": null, "link": null, "folder": "<the file's parent folder>"}` (a 200, not the planned 409: a 4xx logs a console error on every pick from a new folder). 404 note; 400 not a file, or a bad path |
| GET | /api/folders/browse | (none) | Unchanged: `{"roots", "folders"}` | (none) |
| GET | /api/folders/browse?path=P | (none) | `{"roots", "folders", "path": "<P, cleaned>", "parent": "<parent, or null at a root>", "files": [{"name", "size", "modified"}]}` | 400 bad or missing path |

Rules for these routes:
- `attach_path` resolves the path and refuses `..` tricks. It finds the linked folder that holds
  the path through `inside()`, scans that folder, then links the file by `rel_path`. If the hub
  already has the file, it answers with the existing link and the same 200.
- A folder linked to another hub still counts as linked: the file is attached to this hub.
- `file/pick` never takes a path from the request. Only the child process supplies one.

## Files
Backend lane:
- `paradigm/files/native_pick.py`: the child script (as a string), the runner (`subprocess.run`
  with a timeout, `CREATE_NO_WINDOW` on Windows) and the parsing of its JSON output. The runner
  can be injected, so tests never open a dialog.
- `paradigm/files/folders.py`: browse lists files.
- `paradigm/db/files_repo.py`: `attach_path` and the start folder.
- `paradigm/api/files.py`, and the wiring in `paradigm/app.py`.
- `tests/python/test_file_pick.py`.

Frontend lane:
- `static/js/files/file-commands.js`, where "Add file…" now goes through pick;
- `static/js/files/api.js`;
- new `static/js/files/folder-browser.js` and `static/js/files/folder-browser-keys.js`;
- the Files section's "···" menu in `static/js/hubs/hub-sections.js` and
  `static/js/hubs/hub-actions.js`;
- CSS in the files or ui stylesheet;
- `tests/js/` tests: the folder-browser model and keys, the pick-then-attach flow with a fake
  API.

## Acceptance checks
1. With a fake runner that returns a file in a linked folder, `file/pick` and then `attach_path`
   attach the file, and it shows under Files.
2. A path outside every linked folder answers `file: null` with its parent folder. In the browser, the
   confirm names that folder; Link links it and attaches the file; Cancel attaches nothing.
3. A cancel (`path: null` without `fallback`) changes nothing and shows no message.
4. With `PARADIGM_FILE_PICKER=browser`, "Add file…" opens the folder browser in the hub's linked
   folder:
   - `j`/`k`/Enter go into a subfolder;
   - `h` comes back;
   - `/` filters;
   - Enter on a file attaches it;
   - Esc cancels and the focus returns to the Files section.
5. `attach_path` with `..` segments, or a path outside the linked folder, is refused. A Python
   test covers it.
6. `file/pick` for a trashed hub answers 404; for a plain note, 400.
7. "Search linked files…", "Link a folder…" and "Unlink a folder…" still work from the "···"
   menu, in the main window and the note window's sheet.
8. Attaching a file the hub already has answers 200 and shows it once.
9. A hub with nothing linked starts the browser at the OneDrive root. The test sets `OneDrive`
   to a temporary folder, as `test_plans_api.py` does.

To check at work: the real Windows dialog (that it starts in the folder and comes to the front),
and that it works under `pythonw` (`paradigm.pyw`). The browser check can only use a fake runner
or `browser` mode.

## As built
- `attach_path` answers 200 `{"file": null, "link": null, "folder": …}` for a file outside every
  linked folder, not the planned 409: Chrome logs any 4xx fetch as a console error, so every
  pick from a new folder left one. `attachPicked` checks `file === null`; if the attach after
  Link still has no file, the confirm shows an error.
- The "···" menu had no keyboard path at first (the old picker's rows had been reached with
  `a`). `m` (`HUB_KEYS` action `menu`) now opens a section's menu under its "···" button
  (`data-section`); sections without one ignore it. The button's tooltip says "(m)", and the
  palette lists `m`. No `:link` command was added.
- `static/js/ui/menu.js` takes an optional `back()`: Esc calls it in place of focusing the
  button, and a choice calls it before its action. The Files menu passes the list's focus, so
  its dialogs return to `#hub-list` and the note window's sheet stays open under them.
- When Files gains its first row or loses its last (Link, Unlink), `HubPanel.draw` falls back to
  the section's first row (`againIndex`), so Files stays the active section.
- Folder browser: a second `/` shows the old filter text selected, so typing replaces it.
- The browser's pure part is its own module, `static/js/files/folder-browser-model.js`.
- Enter on a folder row opens Search linked files over that folder (it opened the old Add file
  picker).

## Not in this feature
- Files on tasks: the Task page item.
- Choosing a different folder from the dialog's start.
- Picking several files at once.
