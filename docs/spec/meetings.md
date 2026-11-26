# Meetings, decisions and questions

How the app behaves. Kept up to date by each feature that changes it.

- Meetings: a meeting is a note directly under its hub (its title is its name, never its date;
  its text is the minutes) plus a `meetings` row (day, optional time, agenda) and attendees.
  Meetings in one hub may share a name (`title_shared`); `[[Weekly sync]]` reaches a plain
  note of that name, else the meeting made last (`resolve.js`). A meeting has no notes under it, and it can only move to another hub.
  `:meeting [{date}] [{time}] {title}` on a hub or any note in it makes one (today if no date;
  dates also `today`, `tomorrow`, `yesterday`). `:date {date} [{time}]` changes the date;
  `:attendee[!] {name}, {name}...` and `:dropattendee`. Its page: the card (date ✎, hub,
  Attendees × and + Add attendee), Agenda, Notes, then Questions and Decisions made from it.
  Hubs (an area: its projects' too) have a Meetings section, upcoming first; a person's are
  in Active / Archived. `:meetings` or the Meetings button opens the Meetings page (filters:
  hub, period, title), with the same keys as the People page (`static/js/pages/page-keys.js`).
- Meeting capture (Tyson, 2026-11-22): in a meeting's Notes, a line "T: text", "D: text" or
  "Q: text" becomes a task, a decision or a question on the meeting's hub when it is saved, once
  (`task_sources` / `record_sources` hold the line; editing it later makes a new one, deleting
  it deletes nothing). In a T: line a name first delegates ("T: @Tom book the room"), a name
  later is someone I owe ("T: send @Tom the numbers"); `!fri`, `!tomorrow`, `!2026-12-01` set
  the due date (the coming day, today included). D:/Q: lines take their @names as people. Never
  inside code. On the Live page (since 2026-11-26; the note window shows the raw line and no
  badge), a captured line shows a TASK / DECISION / QUESTION badge in place of its prefix and
  what it made; while typing one a hint under the line says what it will make;
  the status line counts "N captured · N pending". A meeting's Prep box (under its card):
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
