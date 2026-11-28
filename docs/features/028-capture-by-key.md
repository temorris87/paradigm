# 028 Capture by key

Status: built (2026-11-27)
Backlog item: Capture by key (Figma: Note window · capture by key, Share · meeting capture): `\t` `\q`
  `\d` on a line open a capture sheet docked at the foot of the editor (who, I owe / they owe,
  follow-up day; Enter / Tab / Esc) and replace the `T:` `Q:` `D:` syntax; the meeting page shows
  "Agreed in this meeting". Old `T:` lines stay plain text.
Decided with Tyson: 2026-11-27
Lanes: backend, frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): Note window · capture by key 37:461, Share ·
meeting capture 40:595. Where Figma and today's behaviour differ, Figma wins (Tyson, 2026-11-27).
The sheet is docked at the foot of the editor, as the backlog item and 40:595 say. 37:461 draws it
under the line.

## What it does
### In the note window
1. **The leader.** In the editor's normal mode, `\` is a leader (it is unbound today).
   - `\t` opens the capture sheet for the cursor's line as a **task**, `\q` as a **question**,
     and `\d` as a **decision**.
   - In visual mode, `\t` `\q` `\d` do the same with the selection. Its text, joined to one line,
     is the title and the quote.
   - `\u` on a captured line removes what it made.
   - After `\`, any other key, or nothing within 1 s, cancels quietly.
   - Insert mode types `\` as always.
2. **Where it works.** In any note under a hub, a capture goes to the note's **nearest hub**:
   - a meeting's hub (its parent);
   - a note's project or area;
   - a person, when the note is under a person.

   A note with no hub says `E: no hub to capture to` (default, approved by Tyson, 2026-11-27).
   Today only meetings capture.
3. **The sheet** is docked at the foot of the note window's editor, above the status line. It
   pushes the text up; it doesn't cover it. It holds:
   - **Kind tabs:** `Task t` / `Question q` / `Decision d`.
   - **Title:** a text box prefilled with the line's text, with leading list marks, `- [ ]` and
     a trailing `!day` stripped. The focus starts here, with the caret at the end.
   - **Who** (all kinds; tasks also get the role). A person is found in the line: an `@mention`
     first, else a known person's full name, else a unique first name (default, approved by Tyson,
     2026-11-27). It shows as an avatar, the name and "found in the line". With no one found, it
     shows a picker ("type a name").
     - For a task there are three choices: **{First} does it** (delegate) / **I owe {First}**
       (for) / **Mine**. The first is chosen when the name starts the line, the second when it
       comes later. With no person it is Mine, and the other two are hidden.
     - For a question or decision, the person is added to its people.
   - **Follow up** (task, {First} does it): a day chip that defaults to the next working day after
     the meeting (or after today, outside a meeting), with "default: next working day after the
     meeting".
     - For **I owe** and **Mine** the row is **Due**. It defaults to the line's `!day`, if any,
       else none.
     - In the day field, `+`/`-` move a day and typing `fri` or `2026-12-04` sets it.
   - **Goes to:** the hub's name and "(this meeting's hub)" or "(this note's hub)", with ▾ to
     pick another live hub.
   - **Foot:** key caps `Enter` save, `Tab` next field, `t q d` kind, `Esc` cancel, and the
     primary button **Save task** / **Save question** / **Save decision**.
   - **Keys in the sheet:**
     - Enter saves from any field.
     - Tab and Shift+Tab move through Title, Who, the role, the day and Goes to.
     - Esc cancels and returns to normal mode on the same line.
     - `t` `q` `d` switch the kind when the focus is not in a text box. In the Title, Alt+T,
       Alt+Q and Alt+D do the same.
     - ←/→ move between the role choices.
4. **Saving** calls `POST /api/capture`. Then:
   - the sheet closes;
   - the line keeps its text exactly;
   - the line gets its mark;
   - the note window's status line reads "n captured → {hub}" (Figma: "4 captured → Team");
   - every window refreshes on the usual "changed" message.
5. **Marks on captured lines.** Each line whose text, trimmed, equals a capture's quote from this
   note shows:
   - in the gutter, `□` for a task, `?` for a question and `◆` for a decision;
   - on the right of the line, a chip:
     - "Task → Ben · follow up Mon" (info);
     - "Task · for Ada · due Fri" (success);
     - "Task · mine" (neutral);
     - "Question · in Team" (kind-question);
     - "Decision · in Team" (kind-decision).

   If the line is edited after it was captured, the mark goes. The item stays and is still listed
   under "Agreed in this meeting". The editor gets the marks as data (`setLineMarks`) and knows
   nothing about notes.
6. **`\u`** on a marked line removes what it made, the same as `x` on its row in a hub section: a
   task is deleted, and a decision or question goes to Trash (default, approved by Tyson,
   2026-11-27). The status line says "Removed task: {title}". On an unmarked line it says
   `E: nothing captured on this line`.
7. **"From this meeting" strip** under the editor (any note with captures): "From this
   {meeting|note}:", then chips **Tasks n** (kind-task), **Questions n** and **Decisions n**, and
   on the right "they live in {hub} · Tab opens". Tab opens the sheet of sections, as now.
8. **Hint bar** (note window, as in Figma): `\ t` line → task, `\ q` → question, `\ d` →
   decision, `v … \ t` from a selection, `\ u` uncapture, `@` person, `:w` save, `Tab` sheet.

### In the main window
9. **The meeting page** (a meeting in the main window, and the Live page showing one) gets the
   card **Agreed in this meeting n** beside Agenda and Notes (right column, about 2fr / 1fr;
   stacked below 1400 px).
   - Each capture is a row with a kind chip (Task, Question, Decision) and the title.
   - Under it is a detail line:
     - "Ben Ortiz · follow up Mon 30 Nov";
     - "I owe Chloe · due Fri 4 Dec";
     - "open · in Customer portal v2";
     - "in Customer portal v2".
   - The foot reads "Everyone sees what was agreed as you capture it."
   - Enter on a row opens it.
   - It replaces the meeting's Questions and Decisions sections, and its Tasks section when they
     came from it.
   - It updates live as captures are made.
10. **Rendered notes**, on the meeting page and on Live, show the capture chip after each
    captured line ("Task → Ben · Mon", "Question", "Decision"). These come from the captures (the
    same quote match), no longer from parsing `T:`. `live/highlights.js` keeps drawing them.

### What goes
11. **`T:` `Q:` `D:` lines are no longer read.**
    - A save never makes a task, question or decision any more.
    - Old `T:` lines stay plain text, and what they made before stays.
    - The editor's insert-mode capture hint and "n captured · n pending" go.
12. **What stays:**
    - `@Name ?` topic lines are still captured on save, unchanged.
    - `:t {text} [@Name] [!day]` keeps its own reading of a name and a day (`parseTaskText` and
      `parseDue` stay for it).

## Data
No migration. A capture is the existing `task_sources (task_id, source_id, quote)` or
`record_sources (note_id, source_id, quote)` row. A line is matched to its capture by
`(source_id, quote)`.

## API contract
`Capture` = `{"kind": "task"|"question"|"decision", "id": 41, "title": "Check the load-test
numbers", "quote": "Ben to check the load-test numbers before Monday", "hub_id": 5, "hub_title":
"Team", "person_id": 9, "person_name": "Ben Ortiz", "role": "delegate"|"for"|"mine"|null,
"follow_up": "2026-11-30"|null, "due": "2026-12-04"|null, "open": true}`

- `id` is the task id, or the record's note id.
- `role` is `null` for records.
- `open` is false for a done task or an answered question.

| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| POST | /api/capture | `{"source_id": 12, "kind": "task", "title": "…", "quote": "…", "hub_id": 5, "person_id": 9, "role": "delegate", "follow_up": "2026-11-30", "due": null}` (`person_id`, `role`, `follow_up` and `due` are optional; a record ignores `role`, `follow_up` and `due`) | `{"capture": Capture}` | 400 bad kind, empty title or quote, bad day, or a role without a person; 404 no source, hub or person; 409 "already captured" (same source, quote and kind still live) |
| GET | /api/captures?source=12 | — | `{"captures": [Capture, …]}` (in the order made) | 400 bad id |
| POST | /api/capture/remove | `{"kind": "task", "id": 41}` | `{}` | 404 not found |
| POST | /api/note/save | unchanged, but `captures` may hold only `{"kind": "topic", …}` | unchanged | 400 "T:/Q:/D: lines are no longer captured on save" for any other kind |

- The record's day is the meeting's day, else today.
- A task's `delegate_id` comes from `role: "delegate"`. Its `for_person_id` comes from
  `role: "for"`. A follow-up is stored only with `delegate`.

## Files
- **Backend lane:**
  - `paradigm/db/capture_repo.py`: a single capture made explicitly (`capture_one`), reusing
    `_clean` and `_store` and adding `follow_up`; the source's nearest hub; `captures_of(source)`;
    `remove_capture`, the same paths as task remove and record trash. `store_captures` keeps only
    topics.
  - A new `paradigm/api/capture.py`, wired in `paradigm/app.py`.
  - `paradigm/api/notes.py` / `paradigm/db/notes_repo.py`: the save rejects non-topic captures.
  - Tests: `tests/python/test_capture_api.py` rewritten (each kind, roles, follow-up,
    409 once-only, remove, nearest hub, no hub 404/400, the save refusing T: kinds),
    `tests/python/test_topics_api.py` unchanged and passing.
- **Frontend lane:**
  - `static/js/editor/keys.js`: the `\` leader in normal and visual mode (`\t \q \d \u`), with
    `capture` / `uncapture` events `{kind, line, text}`.
  - The editor's line marks: `setLineMarks([{line, glyph, label, tone}])` in the editor's view
    code, with CSS in `editor.css`. Update `static/js/editor/CLAUDE.md`.
  - New `static/js/notes/capture-sheet.js` (the sheet), `static/js/notes/capture-sheet-keys.js`
    (THE sheet key table), and `static/js/notes/capture-model.js` (pure: the title from a line,
    who is found, the default role and day, the marks from captures and lines, the chip texts).
  - `static/js/notes/capture.js`: the T:/Q:/D: reading goes; `parseTaskText`, `parseDue` and
    `topicLines` stay.
  - `static/js/notes/app.js`: no task/record captures on save; the sheet's wiring; the strip;
    the status line.
  - `static/js/notes/api.js` (captures).
  - `static/js/live/highlights.js` (chips from captures).
  - `static/js/hubs/hub-sections.js`: the meeting's "Agreed in this meeting" section, replacing
    its Questions and Decisions.
  - `static/note.html` (the sheet's and the strip's slots), `static/js/layout/view-keys.js`
    (`noteHints`).
  - CSS: a new `static/css/capture-sheet.css`.
  - Tests: `tests/js/test_capture.js` (T: lines no longer read), a new
    `tests/js/test_capture_model.js`, a new `tests/js/test_capture_sheet.js`,
    `tests/js/test_editor_keys.js` (the leader), `tests/js/test_live_page.js`,
    `tests/js/test_key_hints.js`, `tests/js/index.html`.

## Acceptance checks
Sample data: a meeting "1:1 Ada" under the area Team, attended by Ada Park. People Ben Ortiz and
Grace Liu exist.
1. In the note window, on the line "Grace will share the dashboards with Chloe", `\t` opens the
   sheet at the foot. Title is filled, Who is "Grace Liu · found in the line" with "Grace does it"
   chosen, Follow up is the next working day after the meeting, and Goes to is "Team (this
   meeting's hub)".
2. Enter saves.
   - The line keeps its text.
   - It gets `□` in the gutter and "Task → Grace · follow up {day}" on the right.
   - The status line reads "1 captured → Team".
   - The task is in Team's Tasks, delegated to Grace with the follow-up.
3. Tab moves Title → Who → role → day → Goes to. ←/→ on the role picks "I owe Grace". The day
   row becomes Due. Saving makes a task for Grace.
4. `\q` on a line makes a question in Team, marked `?`. `\d` makes a decision, marked `◆`.
5. `v` over part of a line, then `\t`: the selection is the title.
6. Esc in the sheet cancels and nothing is made. `\` then `x` does nothing.
7. `\u` on a captured line removes the task, and its mark goes. On a plain line it says
   `E: nothing captured on this line`.
8. Typing a new line "T: old style" and `:w` makes nothing. The line stays plain text.
9. The main window on the meeting shows "Agreed in this meeting n", with each capture and its
   detail line. Capturing another line in the note window adds a row without a reload.
10. The rendered notes on the meeting page show the chip after each captured line.
11. The strip under the editor reads "From this meeting: Tasks n Questions n Decisions n".
12. `\t` in a note with no hub says `E: no hub to capture to`.
13. An `@Ada ?` line in a note still adds a topic to raise on save.
14. The note window's hint bar shows the keys in "What it does" 8.

## Not in this feature
- Moving a captured item when its line is edited.
- Capturing from the main window.
- Converting old `T:` lines.
- The capture sheet in the agenda box.

## Decisions after the first build (Tyson, 2026-11-27)
- **A line that contains a capture's quote counts as captured.** A capture from a visual
  selection (`v…\t`) stores the selection as its quote. A line whose text equals a quote, or
  contains it, gets the capture's gutter mark and chip. `\u` on it removes that capture, and the
  rendered notes (meeting page, Live) show its chip after the line.
  - When one line holds several captures, it shows the first one's mark and chips for each, and
    `\u` removes the first.
  - Whole-line matches are still preferred over containment.

## As built (2026-11-27)
Built as planned, with these differences and additions:
- **The API contract is as planned.** `/api/capture` answers 400 (not 404) when the hub it is
  sent to is not a live hub it may go to: not a top-level project or area, archived, a person
  the note isn't under, or a person for a question or a decision.
- **A person as the hub.** Only the person the note sits under can be its hub, and only for a
  task. A person holds no tasks, so that task is stored on the note it came from. A question or
  a decision there needs ▾ and a project or an area.
- **An archived hub is no hub.** `\t` in a note under an archived hub says
  `E: no hub to capture to`, the same as the server's `nearest_hub`.
- **Goes to ▾** lists the live top-level projects and areas, and the note's own person when it
  has one. People in general are never listed, since the server would refuse them. Its
  placeholder reads "a project or an area", or "a project, an area or this note's person" when
  that person is listed (browser fix round 1: it said "or a person" before).
- **The sheet's error.** A failed save shows its error in the sheet (`E: not a day: "qt"`).
  The error clears as soon as the sheet changes: typing in the Title or the day field, or
  switching the kind, the role, the person or the hub (browser fix round 1: it stayed until the
  next save before).
- **The meeting's sections** are `agreed`, `tasks`, `files`. Agreed lists every capture, tasks
  included. Tasks lists only the tasks on the meeting itself. A captured task sits on the hub,
  so it is not in that list.
- **The Live page's card** is `static/js/live/agreed-card.js`. The captures come with each live
  message (`live-sender.js`), so a capture shows there without a reload. With none it reads
  "Nothing captured yet".
- **A second capture** of the same line and kind says `E: already captured` (the 409).
- **New file not in the plan:** `static/js/notes/capture-actions.js` holds the note window's
  `\t \q \d \u`, the marks, the strip and the open note's captures, which keeps them out of
  `app.js`.
- **The rendered notes' chips** match a capture only against a whole rendered line, the line
  `capturesByLine` picked, the same as the editor's marks. Captures on one line share its mark,
  with a chip each.
