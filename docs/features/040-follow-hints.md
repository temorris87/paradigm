# 040 f: follow hints

Status: built (2026-11-28)
Backlog item: If the f key is free, I want to be able to use it (or another key if it's not free) to use
  as a find key similar to vim plugins that let you hit the f key and quickly follow links. A
  letter or letters should pop up that I can type to select that item.
Decided with Tyson: 2026-11-28
Lanes: frontend
Migration: none

## What it does
1. **`f` in the main window** (outside text boxes, the editor and dialogs: the same `busy()` rule
   as `static/js/layout/main-keys.js`) enters follow mode: a small label of one or two letters
   appears on every clickable thing that is visible in the viewport (default, approved by Tyson,
   2026-11-28):
   - list rows (`[role=option]`);
   - row buttons and spans (`[data-action]`);
   - top-bar, crumb and dashboard-head buttons; other visible `button`s and links (`a[href]`);
   - navigator pins and tree rows;
   - Week grid blocks and tray items.
   Hidden, inert (`inert` ancestors, a closed drawer) and disabled elements get no label. An
   element inside another target (a row button inside a row) gets its own label.
2. **Labels.** With 9 or fewer targets every label is one home-row letter (`asdfghjkl`); with
   more, every label is two letters drawn from `asdfghjkl` then `qwertyuiop` (19 letters, up to
   361 labels), so no label is the start of another (default, approved by Tyson, 2026-11-28). Labels are ordered top-to-bottom, left-to-right. They are drawn as key caps
   (`.key` look) on the overlay surface, at the top-left of each target, placed with CSSOM
   (`style.setProperty`, CSP forbids inline style attributes), on a fixed layer above the page.
3. **Typing.** Each letter typed hides the labels that no longer start with what has been typed.
   When one label is fully typed, follow mode ends and its target is activated as a click would:
   a list row is focused (its listbox's cursor moves to it) and opened as Enter would; anything
   else gets `.click()`. Shift is ignored (labels are lowercase).
4. **Cancelling.** Esc, a key that matches no label, Backspace with nothing typed, a mouse click,
   a scroll or a window resize ends follow mode and removes every label. While it is on, follow
   mode takes every key (capture phase) so no page key fires.
5. **Today's `f` (File all…) moves to `F`** (default, approved by Tyson, 2026-11-28); the `?`
   list shows it there. `f` is then window-wide in `MAIN_KEYS`, with `hint: "follow"`, and no
   view binds `f`.
6. The note window has no follow mode: it is the editor, where `f` is Vim's find-character
   (default, approved by Tyson, 2026-11-28).
7. `f` covers the whole main window, sidebar included (default, approved by Tyson, 2026-11-28).
   Targeting one panel waits for a later backlog item.
8. Code layout: new `static/js/ui/follow-hints.js` holds the pure part (label assignment for n
   targets, filtering by typed prefix, finding the match) with no DOM; new
   `static/js/ui/follow-overlay.js` (or similar) collects targets, draws and removes the labels
   and handles keys; `static/css/follow-hints.css` styles them with design tokens. Wiring is in
   `MAIN_KEYS` and `main.js`.

## Data
None.

## API contract
None: no route is added or changed.

## Files
- Frontend lane:
  - new `static/js/ui/follow-hints.js`, new overlay module, new `static/css/follow-hints.css`
    (linked from `static/index.html`);
  - `static/js/layout/main-keys.js` (`f`), `static/js/main.js` (wiring);
  - `static/js/today/today-keys.js` (`f`→`F`) and Today's handler if it names the key;
  - tests: new `tests/js/test_follow_hints.js` (pure labels and matching, plus a DOM test on a
    small fixture: labels drawn, typing activates, Esc clears), imported in
    `tests/js/index.html`; updates to `test_key_hints.js` and `test_today.js`.

## Acceptance checks
1. On Today, `f` shows labels on the rows and on the navigator pins; typing a row's label opens
   that row.
2. With more than 9 targets visible, labels are two letters; typing the first letter hides every
   label that doesn't start with it.
3. Esc removes every label, and the next key works as normal.
4. `f` typed in the palette's field or a text box types an `f`; no labels appear.
5. `F` on Today opens File all…
6. The bar shows `f follow`, and the `?` list shows it under "Anywhere in this window".

## Not in this feature
- Opening a target in the other window, or Vimium's `F`.
- Follow mode limited to one panel (sidebar / middle), and j/k scrolling (later backlog item).
- Follow mode in the note window.

## As built
- As planned, with these differences and additions (no fix rounds):
- **The overlay module is `static/js/ui/follow-overlay.js`** (`installFollowMode(window)`, `start()`,
  `stop()`, `active`). `main.js` installs it before `installMainKeys`, so its capture-phase
  keydown listener runs first. `start()` does nothing when nothing is in view to label.
- **What is in view** (`visibleBox`): the target's box cut to the window and to every box around
  it that clips (overflow not visible), so a row half scrolled out of its list is labelled on
  the part in the list. `shown()` leaves out what is `visibility: hidden` or inside a
  transparent box, but not a button that is itself transparent in a box that isn't: the rows'
  hover-only buttons (Timesheet's remove, On call's change) can be followed, and focusing them
  shows them.
- **More targets** than listed: `[role=button]`, `[role=tab]` and `summary` too. A target also
  needs a point a click would reach (`elementFromPoint` at its middle or its top-left), so
  things under a dialog or another layer get no label. At most 361 targets, in reading order.
- **Week blocks and tray items are pressed** (pointerdown and pointerup near their top, so not
  on a timed block's resize edge) before `.click()`, because `calendar/drag.js` acts on a press.
- **A listbox whose click only moves the cursor** marks itself `data-follow="enter"` and is sent
  Enter after the click: the task page's body (`tasks/task-page.js`).
- **Ending it**: a pointer press (not only a click) ends it; so does a Ctrl, Alt or Cmd shortcut,
  which is left to the browser. Modifier keys alone do nothing. Backspace with letters typed
  takes the last one back.
- **Labels over 9**: their first letters are spread evenly over up to 19 letters (a run each,
  in reading order) rather than filling `aa`..`al` first, so the first letter typed leaves at
  most ceil(n / 19) labels. Reading order groups lines by their first top (within 2 px).
- **The page drawn again while it is on** (the app's `redraw` event, passed as
  `installFollowMode(window, { redraws: app.events })`, or a labelled target leaving the page,
  seen by a MutationObserver or at the next key): the labels are drawn again for what is in view,
  keeping the letters typed while they still start a label, else follow mode ends. A redraw never
  completes a label for the user, and a label never acts on a target no longer on the page.
- **Follow mode's own keys are a table**: `UI_KEYS` scope `follow` in `ui/ui-keys.js` (Backspace
  `back`, Esc `close`, Tab `leave`: it ends follow mode without `preventDefault`, so the focus
  still moves on); the overlay reads it, a label's letters are `HINT_LETTERS`, and any other
  key ends it. A keydown with `repeat` set is taken and ignored, so a held `f` never types a
  label. `f`'s help in `MAIN_KEYS` is written from that table (`uiKeysText`), so the `?` list
  names Backspace, Esc and Tab; their help has no brackets, as `f`'s wraps them in its own.
- **The focus follows**: before the click, a target that isn't a list row (or the nearest
  focusable thing around it, a tree row's item) is focused (`preventScroll`), as a mouse click
  would, so following a row whose click does nothing (an empty tree group) still moves the focus.
- **Typed letters are marked** in each label still shown (`.follow-hints__typed`).
- **The bar**: every view's bar ends with `f follow` then `? all keys` (`EVERY_BAR` in
  `layout/view-keys.js`). Today's "File all… F" button shows `F` in its cap and title.
- Tests: `tests/js/test_follow_hints.js` (a half-scrolled row and a hover-only button
  included); `test_key_hints.js`, `test_today.js` and
  `test_follow_ups.js` updated for `f follow` and `F`; `test_ui.js` covers the `follow` scope.
