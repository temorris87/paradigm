# 017 Theme tokens, no visual change

Status: built
Backlog item: "Theme tokens, no visual change: every color moves to role tokens (surface, text, border, accent, state, kind, chart; list in docs/ui-audit.md), the current look becomes `css/themes/nord-dark.css`, plus `css/themes/_template.css` and a theme table (`js/theme/themes.js`, `<html data-theme>`); a gate test fails on `--nordN` or raw hex outside `themes/` and on a theme missing a token. Screens match before and after."
Decided with Tyson: 2026-11-27 (plan approved with no comments: every default stands)
Lanes: frontend, backend (the backend lane writes only the Python gate test; integrate: false,
no route added or changed)
Migration: none
Batch: 2026-11-27 (built side by side with 016-view-note-commands, merged on `batch/2026-11-27`)

## Why
The next feature (018) makes Nord Light the default theme, and more themes and a switcher may
come later (Tyson, 2026-11-26). Today every component names a palette color
(`var(--nord8)`), so a light theme would mean editing ~590 lines by hand. This feature moves every
color onto tokens named by **role** (what the color is for), with the current dark look as the
first theme. **Nothing on screen changes.**

## What it does

### Files
- `static/css/tokens.css`: what `nord.css` holds besides colors (`--font-*`, `--fs-*`, `--sp-*`)
  plus `--radius-sm: 4px; --radius-md: 6px; --radius-lg: 10px` (from the Figma Spacing
  collection; defined, not yet used). No colors.
- `static/css/themes/nord-dark.css`: one rule, `:root[data-theme="nord-dark"] { ... }`, holding
  - the 16 Nord colors as theme-private primitives (`--nord0` … `--nord15`, used only inside this
    file),
  - every role token (below), set from those primitives or `color-mix()` of them, exactly
    reproducing today's colors,
  - `color-scheme: dark` (moved out of `base.css:15`; `ui.css:128`'s dialog input gets its scheme
    by inheriting or by `color-scheme: inherit`), and the scrollbar color token.
- `static/css/themes/_template.css`: every role token, value left empty, each with a one-line
  comment saying what it is for and where it shows. Never loaded; copied to make a new theme.
- `static/css/nord.css` is deleted.
- `static/index.html` and `static/note.html` link `css/tokens.css` and `css/themes/nord-dark.css`
  where `nord.css` was, and `<html>` carries `data-theme="nord-dark"` in the markup, so the first
  paint is right before any script runs. `tests/js/markdown-sample.html` and
  `tests/js/test_calendar_align.js` load the two files instead of `nord.css`.
- `static/js/theme/themes.js`: `THEMES = [{ id: "nord-dark", label: "Nord Dark", file:
  "css/themes/nord-dark.css", colorScheme: "dark" }]`, `DEFAULT_THEME = "nord-dark"`,
  `themeOf(id)`, `currentTheme()` (from `document.documentElement.dataset.theme`, else the
  default) and `applyTheme(id)` (sets the attribute). No switcher, no localStorage (default,
  approved by Tyson, 2026-11-27): a switcher later is a row here plus a command.

### Role tokens
Map each use by its **role**, not by its Nord number: `--nord8` on a link becomes `--link`, on a
focus border `--border-focus`, on a decision badge `--kind-decision-*`. Two uses of one Nord
color that do different jobs get different tokens even though nord-dark sets them to the same
value; this is the point of the feature, since 018 sets them differently.

Base set: the roles in `docs/ui-audit.md` ("Proposed Nord Light roles") and the Figma Color
collection, as CSS names:
- surface: `--surface-page`, `--surface-raised`, `--surface-sunken`, `--surface-hover`,
  `--surface-overlay`, `--surface-selected`
- text: `--text-strong`, `--text` (default), `--text-dim`, `--text-faint`, `--text-on-accent`
  (the existing `--text`, `--text-strong`, `--text-dim`, `--text-faint` keep their names)
- border: `--border-default`, `--border-strong`, `--border-focus`
- accent: `--accent`, `--link`
- state: `--state-{danger,warning,caution,success,info}-{fg,bg,solid}`
- kind: `--kind-{task,decision,question,meeting}-{fg,bg,solid}`
- chart: `--chart-capacity-meeting`, `--chart-capacity-focus`, `--chart-capacity-free`,
  `--chart-gantt-bar`, `--chart-gantt-done`, `--chart-now-line`

Additions, so today's look is kept exactly (each one also in the template):
- `--text-heading` (headings; nord13 today), `--text-code` (code and kind labels; nord7),
  `--text-control` (button and input text; nord5), `--text-on-solid` (dark text on solid fills;
  nord0)
- `--border-divider` (dividers and panel edges; nord2, beside `--border-default` nord3 for
  controls)
- `--focus-ring` (the inset row ring; nord9)
- `--link-secondary` (crumbs, "more" links, missing wiki-links; nord9)
- `--chart-track` (empty bar tracks), `--chart-today-line` (gantt and plan today line; nord12)
- `--shadow`, `--backdrop` (the four raw `rgb()` shadows and the dialog backdrop in `ui.css` and
  `editor.css`, and the `color-mix` shadows in navigator.css and sheet.css)
- `--callout-{note,todo,bug,example,quote}`, `--mark-bg`, `--scrollbar`, `--cursor` (the editor
  cursor) and `--selection` if used
- The frontend lane may add a role that a use needs and none of these covers. Name it by role,
  add it to the template with its comment, and list it in the spec's "Done" notes. Never add a
  token named after a palette color.

Local variables (`--health` hub.css, `--callout` markdown.css, `--save` navigator.css, `--choice`
ui.css) stay, set from role tokens. `color-mix()` formulas stay, mixing role tokens. Opacity
dimming stays as it is.

### Mermaid and export
- `static/js/diagrams/mermaid.js` reads role tokens (`--surface-page` for background, `--text` for
  text and lines, and so on: the same values as today) and takes `darkMode` from
  `themeOf(currentTheme()).colorScheme === "dark"`.
- `static/js/export/export.js` inlines `tokens.css` and the current theme's file (from the
  table) instead of `nord.css`, and the exported `<html>` carries the same `data-theme`.
  `tests/js/test_export.js`'s `/* nord.css */` check follows.
- `static/js/editor/table-copy.js`'s `#808080` in clipboard HTML stays (it is pasted into other
  programs, which never see our variables).

## Data
None.

## API contract
No route added or changed.

## Files
- Frontend lane: `static/css/*.css` (every file with a color), `static/css/tokens.css`,
  `static/css/themes/nord-dark.css`, `static/css/themes/_template.css`, `static/css/nord.css`
  (deleted), `static/index.html`, `static/note.html`, `static/js/theme/themes.js`,
  `static/js/diagrams/mermaid.js`, `static/js/export/export.js`, `tests/js/` (a `test_themes.js`
  for the table and `applyTheme`, imported in `tests/js/index.html`; `test_diagrams.js`,
  `test_export.js`, `test_calendar_align.js`, `markdown-sample.html` updated).
- Backend lane: `tests/python/test_theme_tokens.py` only, run by `pipeline_gate.py` with the
  other Python tests. It fails when:
  1. a file under `static/css` outside `static/css/themes/` contains `--nord<digit>`, a hex color
     (`#rgb`, `#rrggbb`, `#rrggbbaa`), `rgb(`, `rgba(`, `hsl(` or `hsla(`;
  2. a file under `static/js` (outside `static/vendor`) contains `--nord<digit>` or a hex color,
     except `static/js/editor/table-copy.js`;
  3. a theme file in `static/css/themes/` (other than `_template.css`) defines a role token the
     template lacks, or lacks one the template has (`--nordN` primitives are exempt);
  4. a `var(--name)` used anywhere in `static/css` or `static/js` is defined nowhere (not in
     `tokens.css`, the template, or a declaration in the CSS files themselves);
  5. a `file:` in `static/js/theme/themes.js` names a file that does not exist.
  Each failure names the file and line.

## Acceptance checks
1. **Nothing changed (the main check).** The browser check captures, on demo data
   (`tools/browser_drive.py start`, then `tools/demo_data.py`), the computed `color`,
   `background-color`, `border-{top,right,bottom,left}-color`, `outline-color`, `box-shadow`,
   `fill`, `stroke`, `caret-color` and `accent-color` of every element, keyed by a stable path,
   on: Today; Week Plan; Week Timesheet; the Customer portal v2 dashboard with its plan strip;
   the task page "Write the request-form spec"; People; Ada Park's page; the Live page; the note
   window with its sheet open; the palette open; a confirm dialog open.
   The baseline comes from the batch's base commit (a temporary `git worktree add --detach` of
   `main`, removed afterwards), the result from this worktree, on the same demo data and the
   same 1600×1000 window. Every value must be identical (default, approved by Tyson,
   2026-11-27): any difference is fixed, not accepted.
2. A note with a Mermaid diagram renders with the same colors as on the baseline.
3. `:export` of a note opens as a file with the same look as the baseline export.
4. `python3 tools/pipeline_gate.py` passes, and putting `color: #fff` in `static/css/hub.css`
   or `var(--nord8)` in `static/css/today.css` makes `test_theme_tokens.py` fail naming the line
   (then taken out).
5. The browser console shows no errors on any of the views in check 1.

## Not in this feature
- Nord Light and making it the default (018).
- A theme switcher, or remembering a theme per machine.
- Using `--radius-*` in components (Round 2's shared-look item).

## As built
Built as planned, except:
- Roles the frontend lane added beyond the list above, each in `css/themes/_template.css` with
  its comment (none is named after a palette color):
  - surface: `--surface-row-hover`, `--surface-input`, `--surface-elevated`, `--surface-muted`
  - text: `--text-muted`, `--text-label`, `--text-math`
  - border: `--border-faint`, `--border-primary`, `--border-selected`, `--border-accent`
  - accent: `--link-underline`, `--list-marker`
  - chart: `--chart-gantt-project`, `--chart-milestone`, `--chart-progress`,
    `--chart-selected`, `--chart-step`, `--chart-step-done`
  - editor and Live: `--search-match`, `--search-current`, `--live-caret`, `--highlight`
  - shadow: `--shadow-strong`, `--shadow-tint`, `--backdrop-tint`
- `css/export.css` now starts with `:root, :root[data-theme] { color-scheme: normal; }`
  (browser fix round 1). The theme's `color-scheme: dark` reaches the export with the theme's
  file, which turned the task checkboxes dark and the root's default text white; the baseline
  export always had the browser's default native controls and scrollbars. `export.css` comes
  last in the file and `:root[data-theme]` is as specific as the theme's selector, so the rule
  wins for any theme; the app never loads `export.css`. `tests/js/test_themes.js` fails if the
  rule goes missing.
- `buildPage` in `js/export/page.js` takes a `theme` (default `DEFAULT_THEME`) for the file's
  `<html data-theme>`; `currentTheme` and `applyTheme` take an optional root element (default
  `document.documentElement`) so tests can pass their own. `mermaidConfig(colour, dark)` takes
  `dark` as a second argument, defaulting to the current theme's `colorScheme === "dark"`.
- `tokens.css` also carries `--fs-2xl` (it was in `nord.css`).
- When the export fix went in, the browser check had not been re-run on it: check 3 then
  rested on the JS test and the CSS cascade only.
