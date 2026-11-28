# 026 Project page as in Figma, and its History page

Status: built (2026-11-27)
Backlog item: Project page as in Figma (Project, Project history): it shows now and next (this week
  on); each section's older entries go to the project's own History page (`g h`).
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): Project 17:167, Project history 36:444.
Where Figma and today's behaviour differ, Figma wins (Tyson, 2026-11-27).

## What it does
### The project page (a project hub in the main window)
1. **Head.**
   - Left: the project's name (`--fs-xl`). Under it are:
     - the health chip ("On track", success; "At risk", caution; "Off track", danger);
     - the last status log's text;
     - its age, "· 7 d ago".

     With no status log, it shows "No status yet · L to log".
   - Right: the buttons **Log status `L`**, **Open in note window ↗**, **History `g h`**, and
     **···** (today's note menu).
2. **Facts row** (small caps labels over values):
   - **DUE** "Fri 11 Dec · in 15 days";
   - **NEXT MILESTONE** "Pilot go-live · Mon 7 Dec";
   - **AREA**;
   - **PEOPLE**: initials avatars and "+ Add";
   - **TIME CODE**.

   An empty value shows "—". The old card line ("Project ▾ · Active ▾ · due … · Area") is no
   longer drawn on a project's dashboard. Its kind and area stay reachable in the ··· menu.
3. **Plan strip** in its own card: "Plan", the phases' one-line summary, then **Gantt `g p`** on
   the right and the strip below. Today's plan-strip is restyled, not rewritten.
4. **Two columns**, about 3fr / 2fr, stacked below 1400 px:
   - **Left:**
     - **Tasks** "n open", + Task `n`. Open tasks only, each with ☐, title, a chip
       ("2 d late" danger; "Ben Ortiz · follow up Fri" info) and a right-hand detail
       ("1/2 subtasks · 2 h placed", "45 min · placed Fri").
       - Footer: "Open and upcoming only · n done" and **History ↗**.
     - **Open questions** "n", + Question. Open questions only: a "?" kind chip, the title, and
       "asked 22 Nov · 4 d".
       - Footer: "n answered" and **History ↗**.
   - **Right:**
     - **Outcome**, Edit `e`.
     - **Meetings** "n", + Meeting. Two rows only:
       - **Next**: the next meeting still to come;
       - **Last**: the last one that has ended.

       Each row is a day chip, the title and "n attending". Footer: "n earlier" and **History ↗**.
     - **Decisions** "n", + Decision. The latest 3, each a day chip and the title. Footer:
       "Latest 3 shown · n in all" and **History ↗**.
     - **People** "n", + Person. Avatar, name, and on the right "role · n waiting / n owed".
   - Sections with nothing in them leave the columns. They share one quiet line at the foot:
     "Nothing yet: + Notes + Files Answered questions". Each is a link that adds one or opens it.
   - Notes and Files, when they have items, sit in the right column after People.
   - "Where I am" (status) folds into the head's status line. Its history is on the History page
     as Status rows.
5. **Now and next, this week on.** A project page shows:
   - open tasks;
   - open questions;
   - the next and the last meeting;
   - the latest 3 decisions.

   Done tasks, answered questions, earlier meetings and older decisions are on the History page.
   Nothing is lost: each footer links there.
6. **Keys** (HUB_KEYS; project-only rows marked as such):

   | Key | What it does |
   |---|---|
   | `j` `k` | Move |
   | Space | Done |
   | `n` | New task |
   | `d` | Delegate |
   | `L` | Log status |
   | `e` | Edit the outcome when the cursor is on Outcome, else the row as now |
   | `g p` | Gantt |
   | `g h` | History |
   | `?` | All keys |

   - Hint bar, as in Figma: `j k` move, `Space` done, `n` new task, `d` delegate, `L` log
     status, `e` edit outcome, `g p` Gantt, `?` all keys. `g h` is on the head's button and in
     `?`.
   - `n` is page-specific in HUB_KEYS: 024 makes it "1:1 notes" on a person. `a` still adds in
     the section under the cursor.

### The History page (`&history=ID`)
7. **Opening it.**
   - `g h` on a project page, the head's History button, or any section's History ↗ opens it.
   - A section's link opens on that section's tab.
   - It is one page per project (default, approved by Tyson, 2026-11-27).
   - `g h` anywhere else says `E: History is a project's`.
   - The crumb reads "Projects › {Project} › History".
8. **Bar.**
   - "{Project} · History" (`--fs-xl`), then the tabs with counts: **Everything**,
     **Meetings n**, **Done tasks n**, **Decisions n**, **Answered n**.
   - On the right, "Search history /".
9. **Rows**, grouped by week, newest week first.
   - A group head reads "THIS WEEK · 23–29 NOV", then "16–22 NOV" and so on.
   - Each row has the day ("Thu 26"), a kind chip, the title, and a right-hand detail.

     | Kind | Chip tone | Detail |
     |---|---|---|
     | Task done | success | "subtask of {parent}", or who it was delegated to |
     | Meeting | info | "n attending · n tasks, n question captured" |
     | Decision | kind-decision | "from {meeting}" when it has a source |
     | Answered | kind-question | the answer's first line |
     | Status | the health's tone | "status log" |
     | Milestone | info | its phase |

   - Every dated thing the project has, this week's included.
   - Meetings still to come are left out.
   - Under the list: "Older weeks load as you scroll. Every row opens its note; Back returns to
     the project."
10. **Older weeks load as you scroll** (Figma).
    - The page first draws the latest 4 weeks that have rows.
    - When the list nears its foot, by scrolling or by `j` past the last row, the next 4 weeks are
      drawn.
    - The data is already loaded in the browser. Only the drawing is paged.
11. **Keys** (a new HISTORY_KEYS table):

    | Key | What it does |
    |---|---|
    | `j` `k` | Move |
    | Enter | Open the row's meeting, decision, question or task page |
    | `1`–`5` | Pick a tab |
    | `/` | Search, filtering titles and details as you type; Esc or Enter goes back to the list |
    | Esc | Back to the project |
    | `?` | All keys |

    - Hint bar: `j k` move, `Enter` open, `1-5` tab, `/` search, `Esc` back to project, `?` all
      keys.

## Data
None. Everything comes from what the main window already loads: tasks, meetings, records, status
logs, the plan's milestones and schedule changes.

## API contract
No new routes. Frontend only.

## Files
- **Frontend lane:**
  - `static/js/hubs/hub-sections.js`: the project layout, the now-and-next cuts and the
    footers' counts.
  - `static/js/hubs/dash-head.js`: the head, the buttons and the facts row.
  - `static/js/hubs/project-facts.js`: due "in n days", next milestone.
  - `static/js/hubs/plan-strip.js`: the card's restyle.
  - `static/js/hubs/hub-keys.js`: the project's `n`, and `gh`.
  - New `static/js/history/history-model.js` (pure: rows from the lists, weeks, tabs and
    counts, search, pages of 4 weeks), `static/js/history/history-page.js`, and
    `static/js/history/history-keys.js` (THE History key table).
  - `static/js/notes/page-views.js` (`&history=ID`), `static/js/layout/view-keys.js`,
    `static/js/main.js`, `static/index.html`.
  - CSS: `static/css/dashboard.css`, `static/css/dash-head.css`, a new
    `static/css/history.css`.
  - Tests: a new `tests/js/test_history.js`, `tests/js/test_hubs.js`,
    `tests/js/test_key_hints.js`, `tests/js/index.html`.
- **Backend lane:** none.

## Acceptance checks
Sample data with a project that has done tasks, past and future meetings, more than 3 decisions,
answered questions and status logs:
1. The project page head shows the name, health chip, last status and its age, and the buttons
   Log status L, Open in note window ↗, History g h, ···.
2. The facts row shows Due "in n days", Next milestone, Area, People avatars and Time code.
3. Tasks lists open tasks only, with "Open and upcoming only · n done". Meetings shows Next and
   Last only, with "n earlier". Decisions shows 3, with "Latest 3 shown · n in all".
4. Open questions lists open ones, with "n answered".
5. Empty sections are on the "Nothing yet:" line.
6. `n` adds a task. `L` logs status. `e` on Outcome edits it. `g p` opens the Gantt.
7. `g h` opens "{Project} · History": week groups newest first, the kind chips, and the tab
   counts.
8. `3` shows Done tasks only. `/` with a word filters. Enter on a meeting row opens it, and Back
   returns to History. Esc on History returns to the project.
9. Scrolling to the foot draws older weeks.
10. Decisions' History ↗ opens History on the Decisions tab.
11. `g h` on a person or Today says "E: History is a project's".

## Not in this feature
- Areas' History.
- A global History.
- Server-side paging.
- The `+ Add` on people opens today's person picker (no new dialog).

## As built
- Footers return `{ text, tab, count }`; every count comes from `historyCounts(ctx, project)` in
  `history-model.js`, so a footer and its History tab always agree. Done tasks therefore count
  subtasks too, and "n earlier" is History's meeting count minus the Last row.
- A section with no rows but a footer count stays in its column (Tasks with every task done:
  "No open tasks" and "Open and upcoming only · 5 done · History ↗"); only a section with
  neither goes to the "Nothing yet" line. "Answered questions" is its own section
  (`projectAnswered`, no rows, `history: "answered"`), last in the right column, so it is always
  on that line and opens History on Answered.
- Outcome is a section of its own in the right column (Edit, `e`); a project's text box is not
  drawn on its dashboard.
- An archived note's task keeps "archived" in its detail, and "in {note}" while opened with `z`.
- The ··· menu of a project in the main window gains Area… and Put on hold / Make it active,
  which only the card used to offer.
- Dates go through `ui/dates.js`: new `dayText(day, { month: false })` ("Thu 26") and
  `weekRange(monday, today, { year: false })` ("23–29 Nov", the year only when not this year's).
- `meetingEnded` and `splitMeetings` live in `meetings/meeting-days.js`, shared by the History
  model and the project page.
- Older weeks: besides the foot sentinel, after each draw `fillView()` keeps loading while the
  foot is within `innerHeight + 240px`, so short lists, tab changes and searches fill the view.
  Redraws don't scroll; only `j` `k` and a click bring the active row into view.
- Back: `page-views.js` has `STEPS_KEPT_UNDER = {history}`, so a page opened from History (the
  Live note, a task) pushes its own step and Back returns to History.
- The Meetings and People cards keep their right-hand detail at full width and cut the title
  with "…" instead; the Meetings date column has no minimum width (`dashboard.css`).
- Contract changed beyond the spec: the health `blocked` is labelled "Off track" everywhere
  (`status-model.js`), the Log status dialog and area pages included; the stored value is
  still `blocked`.
- Within one day and kind, History lists the later row first (status logs and done tasks by id,
  meetings by time, records and milestones by their note's id), then by title.
- Fix rounds (2026-11-27):
  - NEXT MILESTONE adds " · n days late" when the milestone's planned day has passed and it is
    not done (`milestoneFact()`, `project-facts.js`). `nextMilestone()` in `plan-model.js` is
    unchanged, so the Gantt and the hub line are as before.
  - History dates a milestone row by the day it was ticked done, not its planned day; one with
    no phase has no detail. Left for Tyson: "planned 6 Nov" as the detail would be a small change.
  - Decisions share one order, `decisionOrder()` in `records-model.js` (day, then note id, both
    descending), used by the project page's Decisions and History's Decision rows.
  - `?` on a project dashboard lists `g h` once: `viewKeyGroups()` leaves out of "Anywhere in this
    window" any key the view's table lists.
  - The head's and the facts row's buttons hand the focus to the page first (`focusFirst()` in
    `dashboard.js`; the ··· menu gets `openNoteMenu(app, button, { back })`), so Esc or Cancel in
    the dialog returns to the list. The list's focus no longer scrolls the head away.
  - On History, `/` selects the old query, so typing starts afresh.
  - Left as is: in the Nord Light theme `--kind-decision` equals the info tones, so the Decision
    chip looks like Meeting and Milestone (the theme is the shared look's: Tyson's call); a change
    made straight through the API does not refresh an open History page until reload (changes
    made in the app do).
- No API, route or migration changed.

## Decisions after the merge (Tyson, 2026-11-27)
- **One order for decisions.** The project page's Decisions and History's Decisions list
  same-day decisions in the same order: day descending, then note id descending (the later note
  first).
- **`?` lists `g h` once** on a project dashboard: the HUB_KEYS entry. The duplicate from the
  view's keys goes.
