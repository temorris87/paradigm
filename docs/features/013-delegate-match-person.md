# 013 "Dana" + Enter picks Dana Northwind

Status: built (2026-11-26)
Backlog item: "In the Delegate dialog, typing part of a person's name ("Dana") then Enter makes a new person instead of picking the existing one (Dana Northwind): too easy to make duplicates."
Decided with Tyson: 2026-11-26 (plan approved with no comments: every default stands)
Lanes: frontend (integrate: false; no route added or changed)
Migration: none
Batch: 2026-11-26 (built side by side with specs 009–015, merged on `batch/2026-11-26`)

## Context: the cause
The "To" field is a text box with a `<datalist>`, and Enter submits it.
`findPerson` (`people/people-model.js:36`) matches only the exact title, and `peopleNamed`
creates anyone it doesn't find.

## What it does
- A new `matchPerson(tree, text)` in `people-model.js`, pure and unit-tested. An exact title
  wins. Otherwise every typed word must start a word of the live person's name, as the picker's
  `filterItems` matches. "Dana", "dan nor" and "Northwind" all find Dana Northwind. Trashed
  and archived people don't count.
- One match: the button reads "Delegate to Dana Northwind" and Enter picks her.
- Two or more: the button reads "2 people match: type more", and Enter doesn't submit. The
  datalist shows them.
- None: "Delegate to a new person", as now.
- To make a new person whose name starts like someone else's ("Dana" when Dana Northwind
  exists), type the full name. A name that only partly matches, such as "Dana Smith", matches
  no one, so it makes a new person.
- The same rule goes into every person field that creates on submit: Add attendee, Add with,
  the hub's other person dialogs (`hubs/hub-actions.js` `personDialog`), and Edit…'s "for
  whom" (`task-commands.js:94`), through one shared helper.

This whole approach is the plan's default (default, approved by Tyson, 2026-11-26).

### Open questions
should a single prefix match also be autocompleted into the box as you type?
Decided: no, only the button label shows who it will be. (default, approved by Tyson, 2026-11-26)

## Data
None: no table or column changes; trash, restore, archive and purge are unchanged.

## API contract
No route is added or changed; the front end uses the routes it already calls.

## Files
- Backend lane: none.
- Frontend lane (paths under `static/js/` unless shown in full): `people/people-model.js`, `people/people-commands.js` (`peopleNamed` uses
`matchPerson`), `tasks/task-commands.js`, `hubs/hub-actions.js`, and tests.

## Acceptance checks
1. With Dana Northwind, Delegate → "Dana" → Enter: the task is delegated to Dana
Northwind and no new person appears.
2. "north" → Enter: the same.
3. With Dana Northwind and
Dana Okafor, "Dana" → Enter: nothing happens, and the label says 2 match.
4. "Priya Example"
(new) → Enter: a new person is made, as now.
5. Add attendee with "dana nor": she is added, and
no duplicate is made.
6. A trashed person named Dana Trashed doesn't match.

## Not in this feature
Autocompleting a single match into the box as it is typed; a server-side search or dedupe by name.

## As built
- As planned: `matchPerson(tree, text)` in `people/people-model.js` returns
  `{ person, matches }` (person only when exactly one is meant), and `peopleNamed` uses it, so
  `:attendee` and `:with` take part of a name too; several matches there are an error
  ("E: 2 people match "dana": type more").
- The shared helper is `personLabel(tree, text, { empty, one, none })` in `people-model.js`,
  which gives a person dialog's submit button `{ text, blocked }`.
- `ui/dialog.js`: `formDialog`'s `submit` function may now return `{ text, blocked }` as well
  as a string. Blocked disables the button and Enter does nothing until the fields change;
  `ui.css` dims a disabled `.dialog__button`.
- Edit…'s For keeps its "Save" label and blocks Save while several people match; it never
  makes a new person (an unknown name is still an error).
- No route, table or file was added.
