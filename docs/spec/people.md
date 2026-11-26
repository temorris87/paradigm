# People

How the app behaves. Kept up to date by each feature that changes it.

- People: a person is a top-level note (free text, notes under it) plus a `people` row with
  first and last name (the note's title is "First Last": changing either renames it, and the
  @mentions of the old name can follow after a confirm), email, phone, organisation and job
  title (`:org`, `:job`, `:email`, `:phone`), never written into the note. New person asks
  first and last name; `:newperson {name}` splits at the first space. On a hub,
  `:addperson[!] {name}[, {role}]` puts them on it (again: changes the role; `!` adds someone
  new) and `:dropperson {name}` takes them off. A person can't be filed or nested. Hubs have a
  People section (an area's includes its projects' people). A person's page: Active (live
  hubs with their role, meetings attended, decisions and questions they're on), Archived (the
  same, archived), Backlinks (notes that @mention them, with the lines, or [[link]] to them).
  `:people` or the People button opens the People page (filters: hub, role, organisation,
  name); its keys live in `static/js/pages/page-keys.js`. Archived people leave the People
  page and are muted; links survive trash and archive.
- @mentions: `@PriyaShah` (the full name without spaces) or `@Priya` (a first name only one
  live person has) in any note or agenda links to that person; case is ignored, `@` must start
  a word (an email is never one), code never holds one, and an unknown name stays text. The
  page reads them with the renderer and sends them with every save beside the wiki links
  (`note_mentions`: name, line, field, and context: the line and the lines indented under it).
  Typing `@` in insert mode offers people (`completion.js`); Enter puts in the full form; the
  last row adds someone new. A click on a rendered mention opens the person.
- People as 1:1 prep (2026-11-22): a person's dashboard: their head (name, job, organisation,
  email, how many projects; Next 1:1, the next meeting they attend; Start 1:1 notes: that
  meeting's agenda gets the topics still to raise, then it opens in the note window, or New
  meeting "1:1 First" with them), then three columns: Waiting on them, I owe them (my tasks
  for them: `tasks.for_person_id`, set by a T: line with a name later, `:t`, or Edit…'s For),
  To raise next 1:1 (topics: + Add, or an "@Name ?" line in any note; Raised (Space), x;
  then the open questions they are on); then Backlinks | Active, Archived. The People page:
  Open items (the default) / Everyone pills, columns Name, Role · organisation, On, Waiting on
  them (late in orange), I owe, To raise, Next together.
  Enter on a Waiting on or I owe row opens that task's own page (tasks.md), not its note
  (2026-11-26).
