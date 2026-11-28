# People

How the app behaves. Kept up to date by each feature that changes it.

- People: a person is a top-level note (free text, notes under it) plus a `people` row with
  first and last name (the note's title is "First Last": changing either renames it, and the
  @mentions of the old name can follow after a confirm), email, phone, organisation and job
  title (`:org`, `:job`, `:email`, `:phone`), never written into the note. New person asks
  first and last name; `:newperson {name}` splits at the first space. On a hub,
  `:addperson[!] {name}[, {role}]` puts them on it (again: changes the role; `!` adds someone
  new) and `:dropperson {name}` takes them off. A person can't be filed or nested. Hubs have a
  People section (an area's includes its projects' people). A person's sections in the note
  window: Active (live hubs with their role, meetings attended, decisions and questions
  they're on), Archived (the same, archived), Backlinks (notes that @mention them, with the
  lines, or [[link]] to them); the main window's person page is below (2026-11-27).
  `:people` or the People button opens the People page (filters: hub, organisation, sort,
  name); its keys live in `static/js/pages/page-keys.js`. Archived people leave the People
  page and are muted; links survive trash and archive.
- @mentions: `@PriyaShah` (the full name without spaces) or `@Priya` (a first name only one
  live person has) in any note or agenda links to that person; case is ignored, `@` must start
  a word (an email is never one), code never holds one, and an unknown name stays text. The
  page reads them with the renderer and sends them with every save beside the wiki links
  (`note_mentions`: name, line, field, and context: the line and the lines indented under it).
  Typing `@` in insert mode offers people (`completion.js`); Enter puts in the full form; the
  last row adds someone new. A click on a rendered mention opens the person.
- People as 1:1 prep (2026-11-22): a person's dashboard: their head and Start 1:1 notes (that
  meeting's agenda gets the topics still to raise, then it opens in the note window, or New
  meeting "1:1 First" with them), then what they owe me (Waiting on), what I owe them (my
  tasks for them: `tasks.for_person_id`, set by capture by key's "I owe {First}", `:t`, or
  Edit…'s For), To raise next 1:1 (topics: + Topic, or an "@Name ?" line in any note; Raised, x; then
  the open questions they are on). Enter on a They owe me or I owe row opens that task's own
  page (tasks.md), not its note (2026-11-26). The page and the People page as drawn now:
  the next bullet.
- The person page and the People page as in Figma (2026-11-27; Figma wins where it and the
  old behaviour differ, Tyson, 2026-11-27):
  - Still to come: a meeting counts until it has ended (its day and end time, else its time,
    else the whole day), by the clock, not the day; cancelled and archived ones never count.
    This holds for Next 1:1, Before that, Next together and Start 1:1 notes' choice of
    meeting. When a counted meeting ends while the page stays open, it redraws within a
    minute. A 1:1 is a meeting they attend alone with me, or with "1:1" in its title (case
    ignored). Start 1:1 notes takes the next 1:1, else the next meeting with them.
  - Person head: initials in a circle, the name, "Role · Org" and the email (a mailto link);
    on the right NEXT 1:1 over "Tue 1 Dec · 10:00–10:30" (or "None planned"), "Before that:
    {title}, {Fri 09:00}" when another meeting with them comes first, their next on-call
    week, and the primary Start 1:1 notes. The old card under the head ("Person · email · Org
    · Role ✎") is gone from the main window; the note menu's Edit details… opens the same
    person details dialog (Tyson, 2026-11-27).
  - Three equal cards in one row, tops and first rows aligned: They owe me n (+ Delegate: a
    new task on their note, delegated to them, with an optional follow-up), I owe {first
    name} n (+ Task: a new task of mine for them, optional due day), To raise next 1:1 n
    (+ Topic). Rows are separated by a hairline and show their detail whether selected or
    not, a long title wrapping (Tyson, 2026-11-27): They owe me ☐ title, a "Follow up Mon" /
    "Follow up · 4 d late" chip (info), the hub and "not placed" / "45 min placed Mon"; I owe
    ☐ title, "Overdue 1 d" (danger) or "Due Mon" (caution), the hub and placement; To raise
    ○ topic, "added by hand" or "from {meeting}". Empty lines: "Delegate any task with d; it
    lands here.", "Nothing owed.", "Nothing to raise. a adds a topic."
  - Under them, Notes (wide: the person's text rendered; Edit ↗ or Enter writes it in the
    note window; none: "No notes. Edit ↗ to add some.") and Together (narrow, + Add to a hub):
    a row per live hub they are on ("{kind} · {role}"; Role… r, Remove x), Last together
    ("{title} · Tue 24 Nov", the last meeting that has ended), Meetings this month (this
    calendar month's, cancelled left out), and a quiet "Backlinks n · Archived n" line that
    Enter or a click unfolds into those two lists under it. Under 1400 px everything stacks
    into one column.
  - Person keys (`static/js/hubs/hub-keys.js`, rows with page: "person"): j k move in a
    card; Tab / Shift+Tab the next / previous card, then Notes, then Together (past the last
    or first, Tab leaves the panel as usual; Tab is taken only on the person page); `h` `l`
    (and ← →) move across the columns as they sit on screen: the cards, then Notes and Together
    under them (2026-11-28; feature 039, navigation.md's Columns); Space done; d delegate; a add a topic from any card; r mark the topic
    raised (on a hub row in Together, Role…); n Start 1:1 notes; o and Enter open the row's
    task page or note; ? all keys. Bar: j k move, h l columns, Space done, d delegate,
    a add topic, r raised, n 1:1 notes, o open, ? all keys. Elsewhere a and r keep their
    old meanings (the section's add button, the row's other button), and n on a project is
    its new task (feature 026).
  - People page bar: "People", pills "Something open · n" (the default: anyone with
    something in They owe me, I owe or To raise) / "Everyone · n", then one-line dropdowns
    "Hub: any ▾" (live projects and areas), "Organisation: any ▾", "Sort: most overdue ▾"
    (most overdue, name, next together), the label inside the control (Tyson, 2026-11-27),
    then "Filter by name /" and + New person. Columns: Name (initials, name, "Role · Org"),
    They owe me and I owe them (one chip "{count} · {earliest}": "1 d late" danger, else a
    day, info for They owe me and neutral for I owe; a second "n soon" caution chip when some
    are late and others due soon; nothing: "—"), To raise (a count or "—"), Next together
    (the next meeting still to come, "Tue 1 Dec 15:00" over its title, "1:1" for a 1:1), On
    (live hubs, comma-separated). Most overdue: most days late first, then the earliest
    follow-up or due day, then name. A footnote under the list: "Showing people with
    something open, most overdue first. {names} have nothing open (o shows everyone)", past
    three names "and n others".
  - People keys: j k move, Enter open, / filter by name, o Something open / Everyone, n new
    person (as + New person; a still works but is not in the bar), ? all keys.
- Person fields (2026-11-26): every dialog field that names one person and makes them when
  they are new (Delegate's To, Add attendee, Add with, the hub's other person dialogs, Edit…'s
  For) and `:attendee` / `:with` take part of a name: an exact title wins, else every typed
  word must start a word of one live person's name ("Dana", "dan nor", "north": Dana
  Northwind; archived and trashed people don't count). One match: the button names them
  ("Delegate to Dana Northwind") and Enter picks them. Two or more: the button reads "2 people
  match: type more", dimmed, and Enter does nothing (a command says the same as an error).
  None: "Delegate to a new person" / "Add new person", as before. To make someone whose name
  starts like another's, type the full name ("Dana Smith" matches no Dana Northwind). Nothing
  is typed into the box for you (default, approved by Tyson, 2026-11-26).
