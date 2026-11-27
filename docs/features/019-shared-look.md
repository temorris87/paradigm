# 019 Shared look

Status: built (2026-11-27)
Backlog item: Shared look from the redesign: status chips (state and kind tones), the key-hint bar at
  the foot of each view, one focus ring, menus and dialogs on the overlay surface.
Decided with Tyson: 2026-11-27
Lanes: frontend
Migration: none

## What it does
Nothing is rearranged on screen. The look of four things becomes one shared component each, taken
from the Figma "Paradigm UI" Foundations page (Chip, Key, Button, the focus ring). The views
themselves (People, Week, Today, Project, Task, Capture) are redrawn in the next batch on top of
these components.

### 1. Status chips
- `static/css/chip.css`: `.chip` plus one tone class each, `.chip--danger`, `--warning`,
  `--caution`, `--success`, `--info`, `--neutral`, `--task`, `--decision`, `--question`,
  `--meeting`.
  - Size and shape: 21 px tall, `--radius-sm`, padding `0 var(--sp-2)`, the small UI font size.
  - Colours: background `--{tone}-bg` and text `--{tone}-fg`, using `--state-*` for the states
    and `--kind-*` for the kinds. Neutral uses `--surface-sunken` and `--text-dim`.
  - Optional dot: `.chip__dot`, 7×7, round, in `--{tone}-solid`, 8 px from the left, with 6 px
    before the text.
- `static/js/ui/chip.js`: `chip(text, tone, { dot = false, title } = {})` returns a `<span>`.
- `static/js/ui/chip-tones.js` (pure, unit-tested) maps states and kinds to tones:

  | State or kind | Tone |
  |---|---|
  | overdue, late | danger |
  | blocked | danger |
  | due today, due soon | caution |
  | follow-up, waiting on | info |
  | at risk | warning |
  | on track | success |
  | on hold, a plain day | neutral |
  | each kind (task, decision, question, meeting) | its kind tone |

- A follow-up stays info even when its day has passed; its text says how late it is ("Follow up ·
  4 d late"). Only a missed due date is danger (default, approved by Tyson, 2026-11-27).
- These move to the shared chip, with their text unchanged:
  - the health badge (`.health--*`, `.dash-head__badge`);
  - Today's reasons (`.today-next__reason--overdue/followup/due/asked`: danger, info, caution,
    question);
  - the hub-line question and decision badges (`.hub-line__badge--*`);
  - Live's highlight badges (`.pd-highlight__badge--*`);
  - the Gantt's late badge (`.gantt__badge--late`);
  - the list-page pill (`.list-page__pill`).

  Their old classes and CSS go.
- These stay as they are, because they are not status: calendar blocks and chips (`.cal-chip`,
  which the Week item redraws) and the tree's count pills (`.tree__count--pill`).

### 2. Key-hint bar
- A bar sits at the foot of every main-window view: Today, Week (each tab: Plan, Timesheet,
  Settings, On call), People, Meetings, a dashboard (project, area, person), the task page,
  Plan/Gantt, Live and Trash. The note window has one at its foot too.
- `static/js/ui/key-hints.js` builds it from the entries of the view's key table that carry
  `hint:` and `label:`. This is the pattern Today uses today (`todayHints()` in
  `js/today/today-keys.js`). Today's own `.today-next__keys` line goes and Today uses the shared
  bar instead.
- Look (`static/css/key-hints.css`):
  - 35 px tall, pinned to the foot of the view, 20 px left padding, about 18 px between hints;
  - surface `--surface-raised` with a `--border-default` top border;
  - each hint is a key cap, a 6 px gap, then the label in `--text-dim`.
- One shared key cap, `.key`:
  - mono font, 20 px tall, 6 px side padding, about 4 px radius;
  - `--surface-raised` with a 1 px `--border-strong` border.

  The palette (`.palette__key`), triage (`.triage__key`), the topbar (`.topbar__key`) and Today
  (`.today__key`) all use it, and their own key classes go.
- The bar shows only keys that exist today: this feature adds no keys.
- In the main window the bar ends with `? all keys` (default, approved by Tyson, 2026-11-27).
  - `?` in any main-window view opens a read-only dialog, `static/js/ui/keys-dialog.js`, on the
    overlay surface.
  - The dialog lists every key in that view's table, grouped as the table groups them, each with
    its label.
  - Esc closes it, and the focus returns to where it was.
  - `?` is ignored inside inputs, the editor and dialogs, like the other main-window keys.
- The note window's bar has no `?`: there `?` is the editor's backward search. Its bar shows the
  note window's own hints (for example `:w` save, `Tab` sheet). It takes them from the note
  window's tables, or from a short fixed list where it has no table.
- Live has no keys of its own, so its bar shows only the main window's keys: `g t` Today, `g w`
  Week, `:` command, and `? all keys` (default, approved by Tyson, 2026-11-27).

### 3. One focus ring
- Every `:focus-visible` on a control (button, input, select, link, segmented button, the
  palette field) is `outline: 2px solid var(--border-focus); outline-offset: 1px`. This is the
  rule in `static/CLAUDE.md` "Look".
- List rows (listbox items, section rows, table rows) keep the inset `--focus-ring`.
- Controls inside a scrolling container that would clip a ring drawn outside draw the same 2 px
  `--border-focus` ring inside instead (`outline-offset: -2px`). The navigator's Today and Week
  pins do this, because the sidebar scrolls (Tyson, 2026-11-27).
- About 28 of the 41 `:focus-visible` rules in `static/css` differ today; they move to one of
  these two.
- A JS test fails on a `:focus-visible` rule whose outline or box-shadow is neither one.

### 4. Overlays on the overlay surface
- Menus, dialogs, the palette, the picker, triage, the editor's completion list, the status line
  and toasts all draw on `--surface-overlay`, with a 1 px `--border-default` border and
  `--shadow-strong`.
- Any that don't, are fixed. The dialog keeps its `--backdrop`.

## Data
None.

## API contract
None. No route is added or changed.

## Files
Frontend lane only (`integrate: false`).

New files:
- `static/css/chip.css`, `static/css/key-hints.css`;
- `static/js/ui/chip.js`, `static/js/ui/chip-tones.js`, `static/js/ui/key-hints.js`,
  `static/js/ui/keys-dialog.js`.

Changed files:
- the view modules and CSS that draw the chips and key lines listed above (`css/hub.css`,
  `css/today.css`, `css/live.css`, `css/gantt.css`, `css/list-page.css`, `css/dash-head.css`,
  `css/ui.css`, `css/base.css` and the matching JS);
- the key tables, which get `hint:`/`label:` on the keys each bar shows;
- `index.html` and `note.html` (the stylesheets and the bar's mount points);
- `main.js` or the view modules, which mount and update the bar when the view changes.

Tests, all under `tests/js/`:
- `chip-tones`;
- `key-hints`, which builds a bar from a table;
- a check that every `hint:` key is bound in its table;
- the focus-ring rule check;
- a check that the keys dialog lists a table.

## Acceptance checks
Run on generated sample data at 1400 px:
1. Today, a project dashboard, People, the task page and Week each show a hint bar at the foot,
   with their table's `hint:` keys and `? all keys`.
2. `?` on a dashboard opens the key list. Esc closes it, and the focus returns to the row it came
   from.
3. A blocked project's health shows a danger chip with a dot; an on-track one shows a success
   chip.
4. Today's overdue reasons are danger chips, its follow-ups info chips, and due-today caution
   chips.
5. Tab through buttons, inputs and the palette field: each shows the same 2 px `--border-focus`
   ring. List rows show the inset ring.
6. A row menu, the confirm dialog, the palette and the picker all draw on `--surface-overlay`,
   checked through computed styles.
7. The note window shows its bar with no `?` entry, and `?` in the editor still searches
   backwards.
8. No `hint:` key appears in a bar unless that view's key table binds it. A JS test checks this
   from the tables.
9. Switching views (Today → Week → a dashboard → Live) changes the bar each time, and only one
   bar is on screen.

## Not in this feature
- New keys.
- Rearranging any view.
- The Figma views themselves (People, Week, Today, Project, Task, Capture), which come in the
  next batch.
- Restyling calendar blocks and the tree's count pills.

## As built
Built as planned, frontend lane only, with no fix rounds. Where it differs from the plan or adds
to it:
- Key tables: `hint:` alone puts an entry in the bar (its words); `label:` is optional, the key
  cap only where the first key would mislead (`"j k"` for next/previous). Without it the cap is
  the first key written as on a keyboard (`Space`, `g t`, `Esc`, `↓`). `todayHints()` is gone.
- `static/js/layout/view-keys.js` (new, pure) says which table each view reads: `viewTable`,
  `viewHints`, `viewKeyGroups`, and `noteHints` for the note window. Views beyond the plan's
  list also get a bar: a plan template and a Resources folder.
- A dashboard whose note is not a project or an area leaves `L` (log status) out of its bar and
  its `?` list; the Week's Settings tab reads the Timesheet table without `copy`; the Trash
  reads the list-page table without New and calls Enter "restore".
- The note window has no key table of its own, so its bar is a short fixed list: `i` insert,
  `Esc` normal, `:w` save, `/` search, plus `Tab` sheet while the sections sheet shows.
- `?` is a new entry in `MAIN_KEYS` (action `keys`). The `?` list groups the view's table by
  its scopes, then "Anywhere in this window" (the main-window keys), and has a Close button.
- The bar is the `.app` grid's last row (`hints` area) under the note column, a
  `<footer class="key-hints">` in `index.html` and `note.html`; it hides when empty and is
  redrawn on every `redraw` event and on a Week tab change (`WeekPage` takes `onView`). The
  status line moved up to sit just above it.
- One focus ring is also a shared low-specificity rule in `base.css`
  (`:where(a, button, input, select, textarea, summary):focus-visible`), so a control that
  needs the inside ring can override it. The navigator's pins already drew theirs inside.
- `chip(text, tone, { dot, title, tag })`: `tag: "button"` makes a pressable chip, used for the
  list pages' filter pills (the one on is info, the others neutral). Chips are 600 weight.
  `toneOf` also knows `due`, `asked` (question), `none` and `day` (neutral), and reads
  `on_track`, `Follow-up` and so on as one name; unknown is neutral.
- The status line gained the overlay border and `--shadow-strong` (it had a box-shadow edge);
  menus moved from `--shadow` to `--shadow-strong`.
- Tests: `tests/js/test_chips.js` (tones and the chip), `tests/js/test_key_hints.js` (caps,
  every `hint:` bound in its table and scope, the bars per view, the `?` list and its dialog),
  `tests/js/test_focus_ring.js`. `tests/python/test_theme_contrast.py` changed too: the
  capture and card badges are tinted chips now, so the kind solids only colour a chip's dot and
  left `TEXT_SOLIDS`.
