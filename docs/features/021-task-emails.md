# 021 Emails on tasks

Status: built (2026-11-27)
Backlog item: Emails on tasks: drag a .msg from Outlook onto a task (or `:attach`); our own stdlib .msg
  reader (compound file) takes subject, sender and date; "Reply needed" / "Replied" on each;
  Open / Reply opens the saved .msg in Outlook.
Decided with Tyson: 2026-11-27
Lanes: backend, frontend
Migration: 030_task_emails.sql (the merger renumbers it if another feature in the batch takes 030)

## What it does
A task's page in the main window gets an **Emails** section under Subtasks. The Task page item
moves it to the side column next round.

1. **Adding an email**
   - Drag one or more .msg files onto the task page. They can come from classic Outlook, or from
     Explorer or Finder. Each is uploaded and attached.
   - `:attach` on the task page opens the browser's file input (`accept=.msg`, several allowed).
   - Only the task page in the main window takes a drop. A task row on a dashboard or on Today
     doesn't, and neither does the note window (default, approved by Tyson, 2026-11-27).
   - `:attach` anywhere else says `E: open the task's page to attach`. That includes the note
     window, even though its Figma hint bar shows `:attach`. Task notes in the note window belong
     to the Task page item (default, approved by Tyson, 2026-11-27).
   - A dropped file that is not a .msg says `E: not an Outlook message (.msg): <name>` and
     attaches nothing. Others in the same drop still go in.
   - The window-wide `preventDefault` on drops still stops the browser opening dropped files.
2. **Each row** shows:
   - ✉ and the subject;
   - a chip for the reply state:
     - "Reply needed" (caution tone);
     - "Replied <weekday>" (success tone), or "Replied <d Mon>" when it was over a week ago;
     - no chip for "No reply";
   - the sender's name and the sent date and time, in the app's date format, in `--text-dim`;
   - a link: "Reply ↗" while a reply is needed, otherwise "Open ↗".

   A new email starts as "Reply needed": the .msg can't tell us whether a reply is owed (default,
   approved by Tyson, 2026-11-27). Newest sent first. With no emails, the section shows a hint
   line: `Drag an email (.msg) from Outlook onto the task, or :attach`.
3. **Keys on an email row** (in `static/js/tasks/task-page-keys.js`, all free there today):

   | Key | Action |
   |---|---|
   | `r` | cycles Reply needed → Replied (today) → No reply → Reply needed |
   | Enter or `o` | opens the saved .msg in Outlook through the server's `open_file` (`os.startfile` on Windows). "Reply ↗" and "Open ↗" do the same: we can't start a reply ourselves. |
   | `x` / Delete | asks `Remove "<subject>" from this task? The saved copy is deleted.` before removing |

   `x` on a subtask still deletes the subtask, as now. `j`/`k` move through subtasks and emails
   as one list.
4. **The reader**, `paradigm/files/msg_reader.py`, is our own stdlib reader for the OLE compound
   file format. No third-party tool is allowed at work.
   - It reads the header, the FAT and DIFAT, the mini FAT and mini stream, and the directory.
   - From the root storage:

     | Field | Stream |
     |---|---|
     | subject | `__substg1.0_0037001F` (UTF-16LE), or `__substg1.0_0037001E` (8-bit, cp1252) |
     | sender name | `0C1A001F` / `0C1A001E` |
     | sender email | `5D01001F`, else `0C1F001F` (and their `001E` forms) |
     | sent time | `PR_CLIENT_SUBMIT_TIME` (0x0039, type 0x0040 FILETIME) from `__properties_version1.0`, else `PR_MESSAGE_DELIVERY_TIME` (0x0E06) |

     The sent time is stored as local ISO time.
   - It refuses, with `ValueError` and no crash, a file that:
     - isn't a compound file (wrong signature);
     - is truncated;
     - has broken sector chains (loops, out of range);
     - has no subject stream.

     The API turns these into `E: not an Outlook message (.msg)`.
   - Pure: it takes `bytes` and returns a small dataclass. It has caps on sector counts, so a
     crafted file can't loop or blow up memory.
5. **Storage.** The bytes are saved as `<data>/emails/<task_id>/<email_id>.msg`, because Outlook
   needs a real file. They are written with the row in the same request. If the write fails, the
   row is rolled back. The folder is in the data folder, never the repo.
6. **Duplicates.** The same subject, sender and sent time on the same task is refused with 409:
   `E: already on this task`.

## Data
Migration `030_task_emails.sql`:

```sql
CREATE TABLE task_emails (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL DEFAULT '',
  sender_email TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  reply TEXT NOT NULL DEFAULT 'needed' CHECK (reply IN ('needed', 'replied', 'none')),
  replied_on TEXT,
  file_name TEXT NOT NULL,
  added_at TEXT NOT NULL
);
CREATE INDEX task_emails_task ON task_emails(task_id);
```

The emails follow their task:
- A task that goes to the trash (if tasks are trashed with their note) keeps its emails, and they
  come back with it.
- When a task is deleted for good, by purge or by `x` on the task, its rows go by cascade. The
  repository also removes `<data>/emails/<task_id>/`.

The backend lane checks how tasks are deleted today (task delete, note purge, hub purge) and makes
sure every path removes the saved files. A file it fails to remove is logged and left; it is never
an error to the user.

## API contract
| Method | Path | Request | Response JSON | Errors |
|---|---|---|---|---|
| POST | /api/task/email/upload?task=N&name=F | raw .msg bytes (`application/octet-stream`); `name` is the file name, URL-encoded | `{"email": {"id", "task_id", "subject", "sender", "sender_email", "sent_at", "reply", "replied_on", "file_name", "added_at"}}` | 404 task; 400 `{"error": "not an Outlook message (.msg)"}`; 409 `{"error": "already on this task"}`; 413 over 30 MB |
| GET | /api/task/emails?task=N | (none) | `{"emails": [email, …]}`, newest `sent_at` first | 404 task |
| POST | /api/task/email/reply | `{"id": 3, "reply": "needed" \| "replied" \| "none"}` | `{"email": email}`; `replied` sets `replied_on` to today, the others clear it | 404; 400 bad value |
| POST | /api/task/email/open | `{"id": 3}` | `{"ok": true}` | 404; 410 `{"error": "the saved email is missing"}` |
| POST | /api/task/email/remove | `{"id": 3}` | `{"ok": true}` | 404 |

**Body cap.** Only `/api/task/email/upload` accepts bodies up to 30 MB. Every other route keeps
the 8 MB `MAX_BODY_BYTES` (`paradigm/web/handler.py`). This is a per-route limit, checked against
the rules in `paradigm/web/CLAUDE.md`, and it is checked before the body is read.

## Files
Backend lane:
- `paradigm/db/migrations/030_task_emails.sql`;
- `paradigm/files/msg_reader.py`;
- `paradigm/db/emails_repo.py`;
- `paradigm/api/emails.py`;
- the wiring in `paradigm/app.py`;
- the per-route cap in `paradigm/web/handler.py` (or the router);
- the delete and purge paths in the tasks and notes repositories;
- tests:
  - `tests/python/msg_fixture.py`, a small compound-file writer that builds sample .msg files
    with made-up Acme and Northwind senders and subjects. No real email is ever committed.
  - `tests/python/test_msg_reader.py`;
  - `tests/python/test_emails_api.py`.

Frontend lane:
- `static/js/tasks/task-emails.js`, for the section rows, the drop target and `:attach`;
- `static/js/tasks/emails-api.js`;
- `static/js/tasks/task-page.js`, `static/js/tasks/task-page-keys.js`;
- `static/js/notes/commands.js`, for `:attach`;
- `static/css/task-page.css`;
- tests under `tests/js/`: the row model (labels, the reply cycle) and the keys.

The reply chip uses the caution and success state tokens. Feature 019 (in the same batch) adds a
shared `.chip`. On this branch, use a local class with the same tones; the merger switches it to
`.chip`.

## Acceptance checks
1. Uploading a generated .msg shows its subject, sender and sent time in a row with
   "Reply needed".
2. Dropping two .msg files onto the task page attaches both. A .png dropped with them says
   it isn't an Outlook message and attaches nothing.
3. `r` goes Replied (with today's weekday), then No reply, then Reply needed. The state survives
   a reload.
4. `o` (and Enter, and the ↗ link) calls open. With the saved file deleted by hand, it says
   `E: the saved email is missing`.
5. `x` asks first. After a confirm, the row and `<data>/emails/<task>/<id>.msg` are gone. After a
   cancel, both stay.
6. The same .msg dropped twice is refused as already on this task.
7. A body over 30 MB to the upload gets 413. A body over 8 MB to any other route is still
   refused.
8. Reader unit tests cover:
   - Unicode and 8-bit subjects;
   - properties in the mini stream (under 4096 bytes) and a large stream on the main FAT;
   - the submit time, and the fallback to delivery time;
   - truncated and looping files, refused fast with no crash.
9. Deleting the task, and purging its hub from the trash, removes its emails' rows and the saved
   folder.
10. `:attach` on Today or in the note window says `E: open the task's page to attach`.
11. An upload for a task that does not exist gets 404 and saves no file.

To check at work: dragging straight from classic Outlook (Chrome and Edge get Outlook's virtual
file), and Outlook opening the saved .msg.

## Not in this feature
- Moving the section to the task page's side column: the Task page item.
- Drop targets outside the task page.
- `:attach` in the note window.
- Reading an email's body or its attachments.
- Starting a reply in Outlook.

## As built
- Built as planned, with these differences:
  - The front end checks the 30 MB cap itself before uploading (`E: over 30 MB: <name>`), as
    the server's 413 closes before reading the body and a browser can report that as a dropped
    connection.
  - The row model is its own pure module, `static/js/tasks/emails-model.js` (chip, sender
    line, link label, the reply cycle, the refusal lines); `tests/js/test_task_emails.js`
    tests it and the keys.
  - The per-route cap is `Router.add(..., max_body=N)` (`paradigm/web/router.py`), read by
    `paradigm/web/handler.py` before the body; only the upload sets one.
  - `x` on a task keeps the task's row (`removed_at`, as before), so no cascade runs there:
    `TaskRepository.remove` drops its emails' rows itself (`drop_emails`) and then their folder
    (`remove_saved`). Trash purge does the same before deleting the note's tasks. The saved
    folder is `Config.emails_dir` (`<data>/emails`).
  - An archived note's task still opens its emails (opening reads only); `r`, `x`, drops and
    `:attach` are refused as read-only, and the empty section says "No emails" there.
  - Opening uses `paradigm/files/folders.py`'s `open_file` (this computer's program for .msg).
  - The reply chip is feature 019's shared status chip (`ui/chip.js`, `.chip`) in the caution
    and success tones.
