# 037 Change a name on the on-call rota

Status: built
Backlog item: On call entries should be editable in case someone ends up with a replacement.
Decided with Tyson: 2026-11-27
Lanes: backend, frontend
Migration: 033_on_call_changes.sql (032 on its branch; renumbered at the merge, after follow-up-log's 032)

Figma "Paradigm UI" (fileKey WiWq1ftWbEclRLbUyhcwKi): "Week · On call · change a name · 1600"
51:841.

## What it does
1. **Changing a name.** On the Week's On call tab, each cell (a role in a week) can be changed:
   - Every cell holds the name (a link to the person when it is one, as now) and a small
     **Change…** button (✎, `aria-label` "Change {role}, week of {day}"), shown on hover and on
     focus, always reachable with Tab.
   - **Enter** on a focused cell, or Change…, opens the dialog anchored under the cell, as 51:841:
     **{Role} · week of {30 Nov}**, "On the sheet: {name}", a name box with people matching as
     typed (the people list; any text allowed, as the sheet allows), "Only this week and role
     change. Empty puts the sheet's name back.", **Save Enter** and **Cancel Esc**.
2. **A changed cell** shows the new name and a **changed** chip (info tone); its tooltip says
   "was {sheet name}". The rota's line on the Week bar, Today's on-call rows and a person's head
   line all use the new name (they read the rota as now).
3. **Putting it back.** Saving an empty name, or the sheet's own name, clears the change: the
   cell shows the sheet's name without the chip.
4. **A paste over a change asks first** (default, approved by Tyson, 2026-11-27). When a pasted
   sheet holds a week and role that has a change, the paste's confirm adds a line: "Replaces n
   changed names: Secondary 14 Dec (Hugo Martin → Farid Haddad), …". Confirming replaces them with
   the sheet's names (no chip); Cancel pastes nothing.
5. **Clear rota…** removes changes with everything else, as now.
6. **Keys** (On call table): Enter "change the name in this cell" (hint "change name"); the rest
   as now (`[` `]` week, `t` this week, `p` paste sheet, `e` earlier weeks). 034 adds letters.

## Data
Migration `033_on_call_changes.sql`:
```sql
ALTER TABLE on_call ADD COLUMN sheet_name TEXT NOT NULL DEFAULT '';
```
`name` stays the name shown (and used everywhere). `sheet_name` is '' when the cell is as the
sheet says; when changed it holds the sheet's name. A paste writes `name` from the sheet and
`sheet_name = ''` for every cell it holds.

## API contract
| Method | Path | Request JSON | Response JSON | Errors |
|---|---|---|---|---|
| GET | /api/oncall | — | as now; each cell gains `"sheet_name": ""` (or the sheet's name when changed) | — |
| POST | /api/oncall/set | `{"week": "2026-11-30", "role": "Primary", "name": "Farid Haddad"}` | the whole rota, as `GET /api/oncall` | 400 week not a Monday in YYYY-MM-DD; 400 name over 200 characters; 404 no such week and role on the rota |

Set: when `name` (trimmed) is '' or equals the sheet's name, `name` becomes the sheet's name and
`sheet_name` ''. Otherwise, if the cell isn't changed yet, `sheet_name` takes the current `name`,
then `name` takes the new one; an already-changed cell keeps its `sheet_name`.
`POST /api/oncall/paste` is unchanged in shape; it clears `sheet_name` for the cells it writes.

## Files
- Backend lane: `paradigm/db/migrations/033_on_call_changes.sql`, `paradigm/db/oncall_repo.py`
  (`set_name`, `sheet_name` in the list, paste clears it), `paradigm/api/oncall.py` (the route),
  tests in `tests/python/`.
- Frontend lane: `static/js/oncall/oncall-page.js` (cells, Change…, the dialog),
  `static/js/oncall/oncall-model.js` (changed cells; the paste's "replaces n changed names" line;
  pure), `static/js/oncall/oncall-keys.js` (Enter), `static/js/oncall/api.js` (`set`),
  `static/css/oncall.css`; tests in `tests/js/` imported in `tests/js/index.html`.

## Acceptance checks
1. On a pasted sample rota, Change… on Primary · 30 Nov opens the dialog with "On the sheet: …";
   typing a person's name and Enter shows it in the cell with the "changed" chip.
2. Hovering the changed cell shows "was {sheet name}".
3. The Week bar's on-call line for that week shows the new name; so does Today in that week (unit
   test on the rota model with the changed cell).
4. Saving an empty name puts the sheet's name back without the chip.
5. Changing the same cell twice keeps "was" as the sheet's original name.
6. Pasting a sheet that holds that week asks with "Replaces 1 changed name: Primary 30 Nov (…)";
   confirming shows the sheet's name without the chip; Cancel changes nothing.
7. Pasting a sheet that doesn't hold that week keeps the change.
8. `/api/oncall/set` with a week that isn't a Monday is refused (400); one not on the rota 404.
9. Enter on a focused cell opens the dialog; Esc closes it without saving.

## Not in this feature
- Adding a role or a week by hand (only pasted cells can change).
- A history of changes beyond the sheet's name.

## As built
- **Data: a `changed` flag as well** (review, round 1). Migration 033 also adds
  `changed INTEGER NOT NULL DEFAULT 0`, because `sheet_name = ''` could mean both "unchanged"
  and "the sheet had no one". `changed`, not `sheet_name`, says whether a cell is changed;
  when it is, `sheet_name` holds the sheet's name, '' for a cell the sheet left empty. A paste
  inserts new rows, so both go back to their defaults.
- **API: each row gains `changed`** (a JSON boolean) beside `sheet_name` in `GET /api/oncall`
  and every answer that returns the rota. `sheet_name` is '' unless `changed`. `POST
  /api/oncall/set` takes the sheet's name from `sheet_name` when `changed`, else from `name`;
  '' or that name writes it back with `changed` 0, any other name sets `changed` 1. A blank
  sheet cell can be changed, changed again, put back and cleared by a paste.
- `set_name` finds the role whatever its case (`COLLATE NOCASE`), as the page does, and keeps
  the stored spelling (review, round 1).
- The page follows the same rule (review, round 2): `Rota.changed()`, `sheetName(row)` and
  `changedTitle(row)` read `row.changed`. A cell the sheet left empty, filled by hand, shows the
  chip and "was no one", the dialog says "On the sheet: no one", and the toast after putting it
  back says "is the sheet's no one again".
- The paste's "Replaces n changed names" is a second line of the paste dialog's preview, not a
  separate confirm; Save rota confirms. Each entry reads (name shown → the sheet's new name),
  at most three, then "…". A cell the pasted sheet now holds with the stand-in's name (case and
  spaces ignored) is not named: only its chip goes (review, round 1).
- `formDialog` (`static/js/ui/dialog.js`) gained `anchor` (opens under an element, kept in the
  window, above it when no room below), and `submitKey` / `cancelKey` (key caps on the
  buttons); `ui.css` has `.dialog--anchored`, and the live line keeps line breaks.
- Enter in the On call key table counts only on a cell itself; on the name's link or ✎ inside
  it, Enter is that button's.
- **A redraw keeps the focus** (browser check, round 3). `OnCallPage.draw()` notes the focused
  cell (`data-week`, `data-role`) and focuses the new one after `replaceChildren`, or the tab
  when it is gone (`focusedCell()`, `refocus()`); a focus outside the tab, in a dialog, is left
  alone. Before this, Save in the dialog and `]` `[` `t` on a cell dropped the focus to the body.
- Tests: `tests/python/test_oncall_api.py` (set, put back, twice, blank sheet cell, role case,
  400/404, paste clears) and `tests/js/test_oncall.js` (model and page; the page's fake server
  follows the real rule).
