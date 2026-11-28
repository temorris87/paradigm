# 024 People and the person page as in Figma

Status: built (2026-11-27)
Backlog item: People and the person page as in Figma (People, Person · Ada Park): Waiting on / I owe
  aligned on the 3-column grid; "Next 1:1" counts only meetings still to come.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi), page Redesign: Person 11:2, People 19:316.
Where Figma and today's behaviour differ, Figma wins (Tyson, 2026-11-27).

## What it does
### The person page (a person hub in the main window)
1. **Head.**
   - Left: a round avatar with the initials, the name (`--fs-xl`), then "Role · Org" and the
     email as a link, in `--text-dim`.
   - Right:
     - **NEXT 1:1** (small caps label) over "Tue 1 Dec · 10:00–10:30".
     - Under it, "Before that: {meeting title}, {Fri 09:00}". Shown only when a meeting with them
       that is not a 1:1 comes sooner than the next 1:1.
     - The primary button **Start 1:1 notes** (the same action as today's).
   - With no 1:1 to come, the label reads "NEXT 1:1" over "None planned", and the button stays.
2. **Three cards in one row, equal widths and aligned tops:**

   | Card | Button |
   |---|---|
   | "They owe me n" | + Delegate |
   | "I owe {first name} n" | + Task |
   | "To raise next 1:1 n" | + Topic |

   - **They owe me** is today's Waiting on: my tasks delegated to them. A row is ☐ and the
     title, then a chip ("Follow up Mon", info; or "Follow up · 4 d late", info) and the hub's
     name.
   - **I owe** is tasks for them. Its chips: "Overdue 1 d" (danger), "Due Mon" (caution), then
     the hub and "not placed" or "45 min placed Mon".
   - **To raise** rows are ○ and the topic, then "added by hand" or "from {meeting}".
   - Each card's rows are separated by a hairline. The card heads share one baseline, so the
     first rows line up across the three cards.
   - An empty card shows one quiet line:
     - They owe me: "Delegate any task with d; it lands here."
     - I owe: "Nothing owed."
     - To raise: "Nothing to raise. a adds a topic."
   - Below 1400 px the three cards stack into one column.
3. **Below the cards, two cards side by side** (stacked below 1400 px):
   - **Notes** (wide): the person's own text rendered, with Edit ↗ (opens it in the note
     window, as the dashboard's Edit does now). With no text: "No notes. Edit ↗ to add some."
   - **Together** (narrow), with a "+ Add to a hub" link:
     - one row per active hub they are on: the hub's name, and "{kind} · {role}" on the right;
     - **Last together**: the last meeting with them that has ended, "{title} · Tue 24 Nov";
     - **Meetings this month**: a count of this calendar month's meetings with them, cancelled
       ones left out;
     - a quiet line "Backlinks n · Archived n". Enter or a click on it unfolds the two lists
       under it (today's Backlinks and Archived sections).
4. **Keys on the person page** (HUB_KEYS, person-only rows marked as such):

   | Key | What it does |
   |---|---|
   | `j` `k` | Move within a card |
   | Tab / Shift+Tab | Next / previous card, across the three cards, then Notes, then Together (Figma: "Tab next column"). Tab is taken only on the person page; everywhere else it stays the browser's. |
   | ← / → | Also move across columns, as now |
   | Space | Done, on a task row |
   | `d` | Delegate, on a task row |
   | `a` | Add a topic, whichever card the cursor is in |
   | `r` | Mark the topic under the cursor raised |
   | `n` | Start 1:1 notes |
   | `o` and Enter | Open the row's task page or note |
   | `?` | All keys |

   - Hint bar: `j k` move, `Tab` next column, `Space` done, `d` delegate, `a` add topic,
     `r` raised, `n` 1:1 notes, `o` open, `?` all keys.
   - `n` is page-specific in HUB_KEYS. 026 gives it "new task" on a project. Both meanings come
     from Figma. Each page's hint bar shows its own words.

### The People page (`&people`)
5. **Bar:** "People", then pills "Something open · n" / "Everyone · n".
   - On the right are three dropdowns:
     - **Hub: any ▾**: a live hub (projects and areas);
     - **Organisation: any ▾**: the orgs people have;
     - **Sort: most overdue ▾**: most overdue, name, or next together.
   - Then "Filter by name /" and the button **+ New person**.
6. **Columns:** Name (avatar, name, "Role · Org" under it), They owe me, I owe them, To raise,
   Next together, On.
   - **They owe me** and **I owe them** cells are one chip: "{count} · {earliest}".
     - The earliest is "1 d late" (danger) or a day "Mon" (info for They owe me, neutral for
       I owe).
     - A second chip, in caution, counts the ones due soon when both kinds exist.
     - Nothing: "—".
   - **To raise** is a count, or "—".
   - **Next together** is the next meeting with them still to come: "Tue 1 Dec 15:00" over the
     meeting's title ("1:1" for a 1:1).
   - **On** is their live hubs, comma-separated.
7. **Rows and the footnote.**
   - "Something open" (the default) lists people with anything in They owe me, I owe or To raise.
   - Sort "most overdue" puts the most days late first, then the earliest follow-up or due day,
     then name.
   - Under the list, a footnote: "Showing people with something open, most overdue first.
     {names} have nothing open (o shows everyone)". With more than 3 names it reads "and n
     others".
8. **Keys** (PAGE_KEYS, People-only rows marked as such):

   | Key | What it does |
   |---|---|
   | `j` `k` | Move |
   | Enter | Open |
   | `/` | Filter by name |
   | `o` | Toggle Something open / Everyone |
   | `n` | New person, the same as + New person |
   | `?` | All keys |

   - Hint bar: `j k` move, `Enter` open, `/` filter by name, `o` open items / everyone,
     `n` new person, `?` all keys.
   - `a` keeps working as new person on People and Meetings, but is not shown in the bar.

### What counts
9. **Still to come:** a meeting counts as still to come when it has not ended.
   - It has not ended when its day and `end_time` (or its `time` with no end, or the whole day
     with no time) are after now.
   - Cancelled and archived meetings never count.
   - This holds for Next 1:1, Before that, Next together and Start 1:1 notes' choice of meeting.
10. **A 1:1** is a meeting the person attends where:
    - they are the only attendee, or
    - its title has "1:1", case ignored.

    "Before that" is the next meeting still to come that they attend and that is not that 1:1,
    shown only when it starts first.

## Data
None. Everything comes from the lists the page loads now (`/api/people`, `/api/tasks`,
`/api/meetings`, topics).

## API contract
No new routes. Frontend only.

## Files
- **Frontend lane:**
  - `static/js/people/one-on-one.js`, pure: `nextTogether(meetings, personId, now)` by time;
    new `nextOneOnOne`, `beforeThat`, `lastTogether` and `meetingsThisMonth`; `isOneOnOne`.
  - `static/js/people/people-model.js`: the hub, org and sort filters, the "most overdue" order,
    and the footnote's names. Pure.
  - `static/js/people/people-page.js`, `static/css/people.css`.
  - `static/js/hubs/hub-sections.js` (the person layout: three cards, Notes, Together).
  - `static/js/hubs/dash-head.js` (the person head), `static/css/dash-head.css`.
  - `static/js/hubs/hub-keys.js` (person rows: Tab, Shift+Tab, `a` `r` `n` `o`).
  - `static/js/pages/page-keys.js` (`o` and `n` on People).
  - `static/js/layout/view-keys.js` (the person's and People's hint words).
  - Tests: `tests/js/test_people.js` (still to come; 1:1; Before that; sort; footnote),
    `tests/js/test_key_hints.js`, `tests/js/index.html` for any new test file.
- **Backend lane:** none.

## Acceptance checks
Sample data, with today's date fixed or with meetings around now:
1. Ada Park has a 1:1 that ended an hour ago today, and another next Tuesday. The person head's
   NEXT 1:1 shows next Tuesday's.
2. Give Ada a team stand-up on Friday, before the 1:1. "Before that: Team stand-up, Fri 09:00"
   shows.
3. The three cards They owe me, I owe Ada and To raise next 1:1 sit in one row at 1400 px, with
   their tops and first rows aligned. At 1280 px they are stacked.
4. A delegated task with a follow-up shows the chip "Follow up Mon" in They owe me. An overdue
   task for Ada shows "Overdue 1 d" in I owe.
5. A card with nothing in it shows its empty line.
6. Tab moves across the three cards, then Notes, then Together. Shift+Tab goes back.
7. Space ticks a task, `a` adds a topic, `r` marks a topic raised, `n` opens 1:1 notes, and `o`
   opens a task's page.
8. Together shows Last together, Meetings this month, and "Backlinks n · Archived n". Enter on
   that line unfolds both lists.
9. On People, the default pill is "Something open". Rows are ordered most overdue first, and the
   chips read "1 · 1 d late". The footnote names who has nothing open.
10. `o` toggles to Everyone. `n` opens New person. The Hub ▾ filter keeps only people on that hub.
    Organisation ▾ and Sort ▾ work.
11. Next together on People skips meetings already over today.
12. The hint bars match the lists above, and `?` lists every key.

## Not in this feature
- 1:1 notes' own template.
- Avatars from photos. Initials only.
- Any server-side person summary.

## Decisions after the first build (Tyson, 2026-11-27)
Figma wins on each of these:
- **Rows show their detail.** On the They owe me and I owe cards, every row shows its chip, then
  the hub name, then "not placed" or "45 min placed Mon" ("Team · not placed"), whether it is
  selected or not. A long title wraps to a second line rather than being cut. The detail never
  shrinks to nothing.
- **The People bar's dropdowns** read as one line, "Hub: any ▾", "Organisation: any ▾" and
  "Sort: most overdue ▾", with the label inside the control. They are not stacked labels.
- **The old card line under the person head goes** ("Person · email · Org · Role ✎"). The new
  head already shows the role, org and email. The details stay editable from the note menu, and
  Edit details… opens the same person details dialog.

## As built
Built as planned, frontend only, with these differences and additions:
- **New files:** `static/js/ui/avatar.js` (initials in a circle, shared by the person head and
  the People page's Name column) and `static/css/person-cards.css` (the three cards, Notes and
  Together; stacked under 1400 px). `static/css/hub.css`, `list-page.css` and `ui.css` changed
  too.
- **+ Delegate and + Task** make a new task on the person's own note: + Delegate delegates it
  to them (optional follow-up day), + Task sets it as for them (optional due day).
- **Start 1:1 notes** takes the next 1:1 still to come, and falls back to the next meeting
  with them when there is no 1:1.
- **Redraw on the clock:** the main window checks every minute and redraws the person page or
  People when a counted meeting has ended (`endedCount` in `one-on-one.js`), so Next 1:1 and
  Next together move on without a reload.
- **The head** keeps the next on-call week line under NEXT 1:1. The old card line is gone only
  in the main window; the note window's person card and sections (They owe me, I owe, To
  raise, Active, Archived, Backlinks) are as before.
- **Together's hub rows** keep Role… and Remove; `r` on a hub row there is Role…, on a topic
  Raised. Tab past the last column (or Shift+Tab before the first) leaves the panel, as Tab
  does elsewhere.
- **Page-specific keys:** `hub-keys.js` rows take `page: "person"` or `notOn: ["person"]`
  (`keysFor(page)`), `page-keys.js` rows take `page: "people"` (`pageKeysFor(page)`), and
  `key-sequence.js` reads `"S-Tab"` as Shift+Tab. `view-keys.js` gives the person page its own
  table and bar.
- **People page:** the old Role filter is gone (Hub, Organisation, Sort and the name box
  remain). `list-page.js` gained one-line dropdowns (`inline`), a fixed-width Sort (`fit`), an
  inline search box with its key cap, a footnote, and node cells.
- **Note menu:** a person's has Edit details… after Rename….
