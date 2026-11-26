# paradigm/ (the Python package)

## Layout
Paths from the repo root. Update this layout when the structure here changes.
```
paradigm.py              entry with a console: python paradigm.py [--port N] [--data DIR] [--no-browser]
paradigm.pyw             entry with no console window (Windows double-click): main(console=False)
paradigm/                Python package
  app.py                 startup / shutdown wiring (main, run, build_server)
  config.py              Config + argparse (port 8765, data ~/paradigm-notes)
  instance.py            probe the port: free / a running Paradigm / another program
  presence.py            open tabs and the shutdown rule (pure logic, injected clock)
  stopping.py            ctrl_c_ignored: once stopping, Ctrl-C only logs "Already stopping"
  logging_setup.py       console (if any) + <data>/paradigm.log
  notify.py              startup errors: console pause, or a message box with no console
  web/                   server.py (ThreadingHTTPServer), handler.py, router.py,
                         static.py (serves static/), responses.py, security.py
                         (headers_for: the diagram frame page's own CSP)
  api/                   JSON endpoints; session.py = /api/ping, /api/events, /api/closing;
                         notes.py (also /api/note/status|due: a project's); images.py
                         (raw-bytes upload, GET /api/image?id=N cached);
                         people.py (/api/people, /api/person/create|update|link|unlink);
                         meetings.py (/api/meetings, /api/meeting/create|update|agenda|attend|
                         unattend); records.py (/api/records, /api/record/create|date|
                         answer|reopen|with|unwith); links.py (/api/links: the wiki-link and
                         mention index and stale notes; /api/links/index: the page's catch-up);
                         trash.py (/api/trash, /api/trash/restore);
                         folders.py (/api/folders, /api/folder/create|rename|move|trash,
                         /api/note/folder: Resources' folders);
                         tasks.py (/api/tasks, /api/task/create|update|delegate|done|move|
                         remove: tasks as records, one level of subtasks; /api/sessions,
                         /api/session/add|move|remove: blocks of time);
                         plans.py (/api/plan: phases, milestones, their date changes;
                         /api/phase/create|make|unmake, /api/milestone/create|done,
                         /api/plan/dates; /api/plan_template/...: create, items, tasks,
                         apply, save); templates.py (/api/template/create: note templates);
                         files.py (/api/files, /api/folders/browse, /api/folder/link|unlink|
                         scan, /api/file/attach|detach|open: OneDrive files);
                         topics.py (/api/person_topics, /api/person_topic/create|raise|
                         remove); status.py (/api/status_logs, /api/status_log/create|update|
                         remove; stale_days from Config);
                         calendar.py (the Outlook import: /api/calendar/status|import|upload|
                         pending|file|ignore); timesheet.py (/api/time/week, /api/time/
                         settings, holiday/add|update|remove, off/add|remove);
                         oncall.py (/api/oncall, /api/oncall/paste|clear: the on-call rota);
                         answers.py (result or expected error -> response)
  db/                    (migrations: 001 notes, 002 images, 003 notes.kind for PARA hubs,
                         004 notes.area_id: a project's area, 005 notes.archived_at:
                         archived hubs, 006 people + hub_people: a person's fields and
                         their hub links with a role, 007 meetings + meeting_people: a
                         meeting's day, time and attendees, 008 decisions + questions +
                         record_people: their days, an answer day, the people on them,
                         009 note_links + link_index: each note's wiki-link texts as
                         written, and the note version they were read from, 010 images.note_id
                         may be NULL: an image outlives its note deleted for good, 011 pages:
                         notes.title_shared (meetings and records may share titles),
                         notes.status/due (a project's), meetings.agenda, people first/
                         last/phone, record_sources (where a record came from, the quote),
                         note_mentions; records and notes moved out from under meetings,
                         012 tasks + task_texts + task_sessions: a note's boxes, the text
                         they were read from, their blocks of time, 013 notes.time_code,
                         014 meetings end_time/cancelled/location/join_url, 015
                         meeting_sources (Outlook uid + day -> meeting), import_pending (To
                         file), import_log, 016 time_settings, holidays, time_off, 017 tasks
                         as records: tasks (note, parent, notes, due, delegate, follow-up,
                         position) + task_sessions, the text-read tasks dropped, 018 phases +
                         milestones (dates and baselines) + schedule_changes (every date
                         move, with why), 019 note_templates, plan_templates + plan_items +
                         plan_item_tasks (working days from 0), project_plans, 020
                         file_folders + files + file_links, 021 resource_folders +
                         notes.folder_id; resources holding hub things became areas,
                         022 tasks.is_next: one flagged next action per note, 023
                         status_logs: dated health + words on a project or area, 024
                         tasks.snoozed_until: off Today's Up next until that day, 025
                         tasks.estimate_min, 026 task_sources (a captured T: line) +
                         tasks.for_person_id (I owe them), 027 person_topics (to raise at
                         the next 1:1), 028 on_call (week's Monday, role, name as pasted))
                         connection.py (one locked connection, transactions, VACUUM at start
                         when worth it), migrate.py
                         (migrations/NNN_name.sql, PRAGMA user_version), notes_repo.py,
                         people_repo.py (people and hub links; a people row is what
                         makes a note a person, reported as kind "person"),
                         meetings_repo.py (a meetings row makes a note a meeting, kind
                         "meeting"; directly under its hub, its name as its title; its
                         agenda saves with its own version), records_repo.py (decisions and
                         questions: a row makes a note one, kind "decision"/"question";
                         directly under its hub; source and quote: where it was made from),
                         links_repo.py (the wiki-link and mention index; store_links runs
                         inside a note save; a note whose version moved past its index is
                         stale),
                         trash_repo.py (the Trash: one entry per note trashed with the notes
                         trashed with it (same deleted_at); restore; purge deletes for good
                         what was trashed over Config.trash_days (7) ago, at start and stop),
                         images_repo.py (image bytes in SQLite, deduped per note by sha256;
                         sweep_unused deletes images no note links to, at start and stop only),
                         tasks_repo.py (tasks and subtasks, delegation, sessions; a task
                         with logged time is only marked removed), plan_repo.py (phases,
                         milestones, every date change logged; a phases/milestones row
                         makes a note kind "phase"/"milestone"), plan_templates_repo.py
                         (templates on an area; apply: working days, weekends and the
                         timesheet's holidays skipped; save from a project), templates_repo.py
                         (a note_templates row makes a top-level note kind "template"),
                         files_repo.py (linked folders, their files, attachments; scan),
                         folders_repo.py (folders in Resources: nest, unique names per
                         parent, trash with their notes, back with a restored note),
                         status_repo.py (status logs on projects and areas),
                         topics_repo.py (what to raise with a person; "@Name ?" lines
                         add them through capture_repo),
                         capture_repo.py (a meeting's T:/D:/Q: lines into tasks and records,
                         once each, inside the note's save; injected into NoteRepository),
                         import_repo.py (applies an Outlook .ics: new, moved,
                         cancelled, removed; series go to their hub, the rest wait in To
                         file; attendees matched or made as people; <data>/import/ read at
                         start and when the calendar asks), time_repo.py (settings, holidays,
                         time off; gathers a week for the report; holiday_dates),
                         oncall_repo.py (the rota: a paste replaces the weeks it holds, keeps
                         the rest; clear)
  files/                 folders.py (a synced OneDrive folder: OneDrive roots from the
                         environment, listing files and folders, paths kept inside the
                         folder, opening a file with this computer's program)
  calendar/              ics.py (reads Outlook's .ics: unfolding, its own VTIMEZONE rules,
                         then this computer's local time; pure), import_rules.py (skipped,
                         cancelled, moved, title, agenda, join link, attendees; pure)
  timesheet/             report.py (the week: each weekday exactly the working day in
                         quarter hours, overlaps shared, largest remainder, the rest to the
                         Default code; pure), holidays.py (rules like "4th Thu of Nov + 1",
                         observed Sat->Fri / Sun->Mon, the US seed list; pure)
  images/                formats.py: PNG/JPEG/GIF/WebP from magic bytes + size (SVG refused)
  notes/                 titles.py (title rules), hubs.py (FILE_KINDS: project, area,
                         resource; HUB_KINDS: project, area; a project's statuses and due
                         date), people.py (person
                         fields, roles, first/last name), seed.py + welcome.md (first-run
                         note), meetings.py (day, time), records.py (decision/question
                         kinds), links.py (a save's list of link texts), mentions.py (a
                         save's list of @mentions), tasks.py (a task's fields), plans.py (a
                         phase's dates, a move's reason), days.py (working days),
                         sessions.py (a block's day, start, end)
```

## Migrations
- One migration per feature, `db/migrations/NNN_name.sql`, numbered one past the highest file
  there. The plan phase picks the number; the gate fails on a gap or a duplicate.

## How it launches and stops
- `paradigm.py` asks the port (`GET /api/ping`). If a Paradigm is there it opens a tab on it
  and exits. If another program is there it explains and exits. Otherwise it starts the server
  and opens the browser.
- Each tab holds one Server-Sent Events stream (`/api/events?tab=ID`) and sends a beacon
  (`POST /api/closing`) on `pagehide`. When the last stream drops, `Presence` arms a stop
  60 s out (`Config.idle_seconds`): Safari sends no beacon when a tab closes, nor does a
  browser that quits or crashes. A beacon from the last tab to leave (before or after its
  stream drops) brings it in to 10 s (`Config.grace_seconds`); any other tab's beacon is
  ignored. A reconnect cancels it. Wake guard: two `should_stop` checks over 5 s apart
  (`WAKE_GAP_SECONDS`; they run every 0.25 s) mean the machine slept, so the deadline restarts
  from that check with its full period. `stop_reason` ("beacon" or "idle") picks the log line,
  "Last tab closed" or "No tab for 60 s".
- Once the stop has begun (`app.stop_server`), Ctrl-C is ignored (`stopping.ctrl_c_ignored`
  swaps the SIGINT handler, main thread only) and each press logs "Already stopping - please
  wait", so the tidy-up and closing the database always run and the log ends "Paradigm stopped".
- `paradigm.pyw` runs under `pythonw.exe`, which opens no window. `sys.stdout`, `sys.stderr`
  and `sys.stdin` are `None` there, so never `print` or `input` without checking. Startup errors
  go to a message box (`notify.show_error_box`, using ctypes `MessageBoxW`) and to the log.
- If the stream is down for over 3 s, the page shows "Paradigm has stopped" and keeps retrying.
  When the server is back it reconnects by itself.
- Static files use an explicit content-type table, not `mimetypes`: on Windows the registry can
  turn `.js` into `text/plain`, and then browsers refuse to run the modules.
- `ParadigmServer` turns off `SO_REUSEADDR` on Windows, where it would let two servers share
  a port.
