# Meetings, decisions and questions

How the app behaves. Kept up to date by each feature that changes it.

- Meetings: a meeting is a note directly under its hub (its title is its name, never its date;
  its text is the minutes) plus a `meetings` row (day, optional time, agenda) and attendees.
  Meetings in one hub may share a name (`title_shared`); `[[Weekly sync]]` reaches a plain
  note of that name, else the meeting made last (`resolve.js`). A meeting has no notes under it, and it can only move to another hub.
  `:meeting [{date}] [{time}] {title}` on a hub or any note in it makes one (today if no date;
  dates also `today`, `tomorrow`, `yesterday`). `:date {date} [{time}]` changes the date;
  `:attendee[!] {name}, {name}...` and `:dropattendee`. Its page: the card (date ✎, hub,
  Attendees × and + Add attendee), Agenda, Notes, then Agreed in this meeting (below; it took
  the place of the Questions and Decisions made from it, 2026-11-27).
  Hubs (an area: its projects' too) have a Meetings section, upcoming first; a person's are
  in Active / Archived. `:meetings` or the Meetings button opens the Meetings page (filters:
  hub, period, title), with the same keys as the People page (`static/js/pages/page-keys.js`).
- Meeting capture (Tyson, 2026-11-22; replaced by capture by key, 2026-11-27): a line "T: text",
  "D: text" or "Q: text" in a meeting's Notes used to become a task, a decision or a question on
  save. Since 2026-11-27 a save no longer reads them (`/api/note/save` refuses any capture but an
  "@Name ?" topic): old `T:` lines stay plain text and what they made stays. The Live page's
  TASK / DECISION / QUESTION badge in place of the prefix, the hint under the line while typing
  and the status line's "N captured · N pending" went with them.
- Capture by key (Tyson, 2026-11-27; Figma "Note window · capture by key", "Share · meeting
  capture"): in the note window's normal mode `\` is a leader. `\t` `\q` `\d` open the capture
  sheet for the cursor's line as a task, a question or a decision; in visual mode they take the
  selection, joined to one line, as the title and the quote. After `\`, any other key or none
  within 1 s cancels quietly; insert mode types `\`. It works in any note under a hub and goes
  to the note's nearest hub: a meeting's parent, a note's project or area, or the person it is
  under; with none (or an archived one) `E: no hub to capture to`.
  - The sheet is docked at the foot of the editor, above the status line, and pushes the text
    up. Kind tabs `Task t` / `Question q` / `Decision d`; Title (the line less its list mark,
    `- [ ]` and a trailing `!day`; the focus starts there); Who: the person the line names (an
    `@mention`, else a known full name, else a unique first name; default, Tyson, 2026-11-27)
    with "found in the line", else a "type a name" picker. A task also has the role: **{First}
    does it** (the name starts the line) / **I owe {First}** (it comes later) / **Mine** (the
    only one with no person). Follow up (does it: the next working day after the meeting, or
    after today) or Due (I owe, Mine: the line's `!day`, else none); in the day field `+`/`-`
    move a day, `fri` or `2026-12-04` set it. Goes to: the hub, "(this meeting's hub)" or
    "(this note's hub)", ▾ picks another live project or area (or this note's person, for a
    task; a question or decision can't go to a person). The foot shows `Enter` save, `Tab`
    next field, `t q d` kind, `Esc` cancel and Save task / question / decision.
  - Keys (`static/js/notes/capture-sheet-keys.js`): Enter saves from any field; Tab / Shift+Tab
    go Title, Who, the role, the day, Goes to; ←/→ move between roles; `t` `q` `d` switch the
    kind outside a text box, Alt+T / Alt+Q / Alt+D inside one; Esc cancels back to the same line
    in normal mode. A failed save says why in the sheet (`E: not a day: "qt"`); the error goes
    as soon as anything in the sheet changes.
  - Saving (`POST /api/capture`) closes the sheet, keeps the line's text as it is, and says "n
    captured → {hub}". The same line and kind can't be captured twice while the item lives
    (`E: already captured`). A task for a person goes on the note it came from (a person holds
    no tasks); a record's day is the meeting's day, else today.
  - Marks (default, Tyson, 2026-11-27): a line equal to a capture's quote, or containing it
    (a selection's capture), shows `□` / `?` / `◆` in the gutter and a chip at its right ("Task
    → Ben · follow up Mon", "Task · for Ada · due Fri", "Task · mine", "Question · in Team",
    "Decision · in Team"). A line with several shows the first one's mark and a chip each. Edit
    the line and the mark goes; the item stays. `\u` on a marked line removes its first capture,
    as `x` in a hub section does (a task is deleted, a question or decision goes to Trash),
    "Removed task: {title}"; on a plain line `E: nothing captured on this line`.
  - Under the editor, in a note with captures: "From this {meeting|note}: Tasks n Questions n
    Decisions n · they live in {hub} · Tab opens". The note window's hint bar leads with `\ t`
    line → task, `\ q`, `\ d`, `v … \ t`, `\ u`, then `@` person, `:w` save (and `Tab` sheet).
  - The meeting page (and the Live page showing a meeting) has **Agreed in this meeting n**
    beside Agenda and Notes (about 2fr / 1fr; stacked below 1400 px): a row per capture, a kind
    chip and the title, and a detail line ("Ben Ortiz · follow up Mon 30 Nov", "I owe Chloe ·
    due Fri 4 Dec", "open · in Customer portal v2"); "Everyone sees what was agreed as you
    capture it."; Enter opens a row. It updates live. The meeting's sections are Agreed, its own
    Tasks (not those captured from it) and Files. Rendered notes there show the capture's chip
    after its line ("Task → Ben · Mon", "Question", "Decision"), from the captures, not from
    `T:`.
- A meeting's Prep box (under its card):
  open questions its attendees are on, what they owe (late first), last time (the same name in
  the same hub before it); Add all to agenda. The Meetings page: Upcoming / Past / Needs notes
  pills, grouped by day, columns When, Meeting, Hub, With, Prep; `}` `{` jump days, `p` only
  those with something to prep.
- Decisions and questions: each is a note directly under its hub (its title says it; its text
  is the Why, or the Answer) plus a row with its day, an answer day for a question, the people
  on it, and where it came from (`record_sources`: the source note or meeting and the quoted
  text). They are made from text: select it in any note inside a hub (drag with the mouse, or
  visual mode) and right-click (or Shift-F10, the Menu key): Add question… / Add decision…
  (`selection-menu.js`). The dialog has the text as the title, the meeting's day or today, and
  the people @mentioned in it. The note stays open; on the Live page the quoted text gets a
  muted underline and a badge (Question / Answered / Decision; a click opens it). Not in a hub, the items are
  greyed with the reason. Each section's + New question / New decision, and `:decision
  [{date}] {title}` / `:question ...`, make one too (from the open note). `:answered [{date}]`,
  `:reopen`, `:date {date}`, `:with[!] {name}, ...`, `:dropwith {name}`. Answer… (the card's ▾,
  or a question row) writes the answer into the question's note and marks it answered. Hubs
  (an area: its projects' too), the meeting it came from and its people show them: Questions
  (open first, oldest first; then answered, muted) near the top of a hub's page, Decisions
  newest first; its own page shows its card ("From: Site checklist “...”", and when that text
  has changed since) and no sections.
