# 018 Nord Light, the default theme

Status: built (2026-11-27)
Backlog item: "Nord Light, the default theme: `themes/nord-light.css` from the Figma "Paradigm UI" variables (Foundations page), text colors at 4.5:1 or better; dark stays as a file, out of the table."
Decided with Tyson: 2026-11-27 (planned in the Round 1 plan, approved with no comments: every
default stands)
Lanes: frontend, backend (the backend lane writes only the Python contrast test; integrate:
false, no route added or changed)
Migration: none

## Why
Tyson wants a light default (2026-11-26): Nord's Snow Storm backgrounds and Frost accents (Tyson,
2026-11-26). 017 put every color behind a role token, with Nord Dark as the only theme. This
feature adds Nord Light and makes it the default. Layout doesn't change, only colors. The
redesigned layouts come in Round 2.

## What it does

### The theme file
`static/css/themes/nord-light.css` holds one rule, `:root[data-theme="nord-light"] { ... }`,
with `color-scheme: light`. It sets every token in `static/css/themes/_template.css`, the 96
tokens 017 made (98 as built: see "As built"). `test_theme_tokens.py` already fails when a token is missing or extra.

Values are **plain hex** (or `rgb(... / a)` for shadows and backdrops), not `color-mix()`, so the
contrast test can read them. Nord primitives (`--nord0` … `--nord15`) may be declared and used
through `var()` inside the file, as in nord-dark.css.

The base roles take the Figma "Paradigm UI" Color collection's values exactly (Foundations
page; the same table is "Proposed Nord Light roles" in `docs/ui-audit.md`):

| Token | Value | Token | Value |
|---|---|---|---|
| `--surface-page` | `#eceff4` | `--text-strong` | `#242933` |
| `--surface-raised` | `#f8f9fb` | `--text` | `#2e3440` |
| `--surface-sunken` | `#e5e9f0` | `--text-dim` | `#4c566a` |
| `--surface-hover` | `#dde2ec` | `--text-faint` | `#606979` |
| `--surface-overlay` | `#ffffff` | `--text-on-accent` | `#ffffff` |
| `--surface-selected` | `#e2e8f0` | `--accent` | `#5179a9` |
| `--border-default` | `#d8dee9` | `--link` | `#486b96` |
| `--border-strong` | `#aeb5c3` | `--border-focus` | `#486b96` |

| Role | `-fg` | `-bg` | `-solid` |
|---|---|---|---|
| `--state-danger` | `#ac3f49` | `#eedee1` | `#bf616a` |
| `--state-warning` | `#a64c2f` | `#f1e4e2` | `#d08770` |
| `--state-caution` | `#896111` | `#f6f1e7` | `#ebcb8b` |
| `--state-success` | `#54703c` | `#e9eee7` | `#a3be8c` |
| `--state-info` | `#2f7184` | `#e4eff3` | `#88c0d0` |
| `--kind-task` | `#54703c` | `#e9eee7` | `#a3be8c` |
| `--kind-decision` | `#2f7184` | `#e4eff3` | `#88c0d0` |
| `--kind-question` | `#8a5880` | `#ece6ed` | `#b48ead` |
| `--kind-meeting` | `#436b94` | `#e3e9f1` | `#81a1c1` |

Charts: `--chart-capacity-meeting #81a1c1`, `--chart-capacity-focus #a3be8c`,
`--chart-capacity-free #d8dee9`, `--chart-gantt-bar #81a1c1`, `--chart-gantt-done #a0a8b6`,
`--chart-now-line #bf616a`.

**The other tokens** (those 017 added beyond the base set) follow the same role logic. The
frontend lane picks each one, lists them all in the spec's "As built" section, and keeps to these
rules (default, approved by Tyson, 2026-11-27):
- **Headings** use `--text-heading: #242933`, the same as `--text-strong`. Headings stand out by
  weight, not by color, so they are no longer yellow.
- **Code** uses `--text-code: #2f7184`, the same as `--kind-decision-fg`.
- **Text** tokens (`--text-muted`, `--text-control`, `--text-label`, `--text-math`,
  `--link-secondary`) must reach 4.5:1 on page, raised and sunken.
- **Inputs and elevated surfaces** are `#ffffff`. Row hover is a step between raised and
  hover.
- **Dividers** are lighter than `--border-default`. The control border reaches 3:1 against
  raised: `--border-default` stays `#d8dee9` for cards as in Figma, and controls that need a
  visible edge use `--border-strong`.
- **Focus.** `--focus-ring`, `--border-selected` and `--border-primary` take the `#486b96` /
  `#5179a9` family.
- **Marks and highlights** (`--mark-bg`, `--search-*`, `--selection`, `--highlight`,
  `--chart-selected`, `--live-caret`) must keep text on them readable.
  - `--mark-bg` and `--search-current` use the caution tint or solid.
  - `--selection` is a light Frost tint.
  - `--live-caret` is `#486b96`.
- **Shadows and backdrops** are soft: `--shadow: rgb(46 52 64 / 0.12)`,
  `--shadow-strong: rgb(46 52 64 / 0.2)`, `--backdrop: rgb(46 52 64 / 0.35)`.
- **Text on solids.** `--text-on-solid` must reach 4.5:1 on every `-solid` that has text drawn
  on it. The lane checks which ones by grepping its uses. Where the Nord solid is too dark for
  dark text, it uses `#ffffff` there, or a lighter solid, and records which in "As built".

### Default and table
- `static/js/theme/themes.js` lists only `nord-light`:
  `{ id: "nord-light", label: "Nord Light", file: "css/themes/nord-light.css", colorScheme:
  "light" }`, with `DEFAULT_THEME = "nord-light"`.
- `nord-dark.css` stays on disk, out of the table (Tyson, 2026-11-26). It is still checked by
  `test_theme_tokens.py`, so it stays complete for a switcher later.
- `static/index.html` and `static/note.html` link `css/themes/nord-light.css` in place of
  `nord-dark.css`, and carry `<html data-theme="nord-light">`.
- `tests/js/markdown-sample.html` and `tests/js/test_calendar_align.js` follow.
- Mermaid takes `darkMode: false` from the table (017 wired this).
- Export inlines the current theme's file (017 wired this), so exports are light.
- Opacity-dimmed things (on-hold projects, done gantt bars, past calendar blocks) keep their
  opacity. If one becomes unreadable on light, fix it in that file with a role token, never with
  a hex.

## The contrast test (backend lane)
`tests/python/test_theme_contrast.py`, run by the gate with the other Python tests:
- It parses `static/css/themes/nord-light.css`, resolving `var(--x)` within the file, and
  computes WCAG 2 contrast ratios.
- It fails, naming the pair and its ratio, when any of these falls short:
  1. Every text token (`--text-strong`, `--text`, `--text-dim`, `--text-faint`, `--text-muted`,
     `--text-heading`, `--text-code`, `--text-control`, `--text-label`, `--text-math`, `--link`,
     `--link-secondary`) on `--surface-page`, `--surface-raised` and `--surface-sunken` is
     under 4.5. Text on `--surface-selected`, `--surface-hover` and `--surface-input` is held
     to the same bar.
  2. Each `--state-*-fg` and `--kind-*-fg` on page, raised, sunken and its own `-bg` is under
     4.5.
  3. `--text-on-accent` on `--accent` is under 4.5.
  4. `--border-focus` and `--focus-ring` on page and raised are under 3.
  5. `--text-on-solid` on each `-solid` listed in the test is under 4.5. The list is the solids
     that carry text: the frontend lane names them in the spec's "As built", and the backend
     lane takes the list from there, by default `--state-caution-solid`,
     `--state-success-solid`, `--state-info-solid`, `--kind-task-solid` and
     `--kind-decision-solid`.
- It also fails if a token in the theme can't be resolved to a color.
- The test reads a theme's file by its id, so it can run on any theme later. Only nord-light is
  held to these bars now: nord-dark keeps its old look.

## Data
None.

## API contract
No route added or changed.

## Files
- **Frontend lane:**
  - `static/css/themes/nord-light.css` (new), `static/js/theme/themes.js`,
    `static/index.html`, `static/note.html`;
  - any component CSS whose light rendering needs a token swap (role tokens only);
  - `tests/js/test_themes.js`, `tests/js/markdown-sample.html`,
    `tests/js/test_calendar_align.js`, plus `test_diagrams.js` / `test_export.js` where they
    assume dark.
- **Backend lane:** `tests/python/test_theme_contrast.py`.

## Acceptance checks
1. Run `browser_drive.py start` then `tools/demo_data.py`. Every one of these is light (page
   `#eceff4`, text dark) with no unreadable text and a clean console:
   - Today
   - Week Plan and Timesheet
   - the Customer portal v2 dashboard with its plan strip and Gantt
   - the task page "Write the request-form spec"
   - People and Ada Park's page
   - Live
   - the note window with its sheet open
   - the palette
   - a confirm dialog
   - Trash
   - Meetings

   A screenshot of each goes into the report.
2. Computed colors: `body` background is `rgb(236, 239, 244)`, body text is `rgb(46, 52, 64)`,
   `<html data-theme>` is `nord-light` in both windows, and `color-scheme` is `light` (native
   scrollbars and checkboxes are light).
3. Chips and badges keep their tones (danger, warning, caution, success, info, and task,
   decision, question, meeting), each `-fg` on its `-bg`. Checked on a dashboard's lines and
   on the person page.
4. The calendar's blocks, the now line and the capacity bars are visible on the light grid, and
   a selected block is clearly marked.
5. A note with a Mermaid diagram renders light (light nodes, dark text).
6. `:export` of a note gives a light page.
7. Focus is visible on a tree row, a dashboard row, a button and a calendar block.
8. `python3 tools/pipeline_gate.py` passes.
   - `test_theme_contrast.py` passes.
   - Setting `--text-faint` to `#aeb5c3` in nord-light.css makes it fail and name the pair. Do
     this on a copy, as in 017's check.

Added after the first browser check (Tyson, 2026-11-27):
9. **One focus ring.** Every button-like control with no ring of its own shows
   `outline: 2px solid var(--border-focus); outline-offset: 1px` on `:focus-visible`. A
   background tint stays for hover only. This covers:
   - the top bar's "Go to or run…" (`.topbar__palette`)
   - the crumb menu (`.crumbs__menu`)
   - `.dash-head__button`
   - `.mini-button`
   - the navigator pins and Trash
   - the hub-line controls (Project ▾, Active ▾, due)
   - any other `outline: none` + tint-only `:focus-visible` rule on a button found in
     `static/css`

   List rows that already have the inset `--focus-ring` keep it. Dark gets the same ring. Tab
   through the top bar, the crumb, the dashboard head, the navigator and a hub line on
   `/?note=12`, and on each the focus shows a ring at 3:1 or better against what is behind it.
10. **A day off on Week.** The day-off shading (`.cal-dayhead--off`, `.cal-allday__cell--off`,
    `.cal-col--off`) is light enough that chips on it keep 4.5:1. The "Due" chip
    (`--state-warning-fg`) on the off day reaches 4.5:1. Change it with a role token in
    `calendar.css` or a nord-light value, not with a hex in the component.
11. **Meeting blocks.** `.cal-block__time` and `.cal-block__sub` (`--text-dim`) on a meeting
    block's fill reach 4.5:1 (it was 4.497:1).
12. **Gantt axis dates.** The axis ticks and dates use `--text-faint` with no opacity, and reach
    4.5:1 on the page. The same goes for any other text dimmed with `opacity` that the check
    finds under 4.5:1 on light. Icon-only mini buttons need 3:1.

## As built
`static/css/themes/nord-light.css` is the source of truth; this records what the lanes chose.

### Departures from the base table
These three changes make the text reach 4.5:1 on `--surface-hover`, which the contrast test also
checks:
- `--text-faint` is `#5c6575`. Figma has `#606979`.
- `--link` is `#436690`. Figma has `#486b96`, which `--border-focus` keeps.
- `--text-code` is `#2a6c7f`. The rule above says `#2f7184`, which `--kind-decision-fg` keeps.

### The other tokens
| Group | Token and value |
|---|---|
| Surfaces | `--surface-row-hover #e6eaf1` (between raised and hover), `--surface-input #ffffff`, `--surface-elevated #ffffff`, `--surface-muted` `--nord4` #d8dee9 (only mixed into the page; was #aeb5c3 before check 10) |
| Text | `--text-muted #586172`, `--text-heading #242933`, `--text-code #2a6c7f`, `--text-control #2e3440`, `--text-label #4c566a`, `--text-math #3f5f86`, `--text-on-solid #242933` |
| Borders and focus | `--border-faint #e5e9f0`, `--border-divider #e0e5ed`, `--border-primary #5179a9`, `--border-selected #486b96`, `--border-accent #5179a9`, `--focus-ring #486b96` |
| Links | `--link-secondary #3f5f86`, `--link-underline #aeb5c3`, `--list-marker #486b96` |
| States | `--state-neutral-solid #a0a8b6` |
| Charts | `--chart-gantt-project #88c0d0`, `--chart-milestone #896111` (it is also a label's text color), `--chart-today-line #d08770`, `--chart-track #d8dee9`, `--chart-progress #a3be8c`, `--chart-selected #896111`, `--chart-step #d8dee9`, `--chart-step-done #5e81ac` |
| Callouts | `--callout-note #436690`, `--callout-todo #2f7184`, `--callout-bug #ac3f49`, `--callout-example #8a5880`, `--callout-quote #5c6575` (each is its title's text color too) |
| Editor and marks | `--cursor #2e3440` (reverse video), `--selection #d0e0ee`, `--search-match #f5e7c6`, `--search-current #ebcb8b`, `--mark-bg #ebcb8b`, `--live-caret #486b96`, `--highlight #486b96`, `--scrollbar #aeb5c3` |
| Shadows and backdrops | `--shadow rgb(46 52 64 / 0.12)`, `--shadow-strong rgb(46 52 64 / 0.2)`, `--shadow-tint #aeb5c3`, `--backdrop rgb(46 52 64 / 0.35)`, `--backdrop-tint #4c566a` |

### Solids that carry text
Every one uses dark `--text-on-solid` (`#242933`). None needed white or a lighter solid.

| Solid | Drawn by | Ratio |
|---|---|---|
| `--state-caution-solid` | `tree.css` `.tree__count--pill` | 9.34 |
| `--kind-task-solid` | `live.css` `.pd-highlight__badge--task` | 7.15 |
| `--kind-decision-solid` | `hub.css` `.hub-line__badge--decision`, `live.css` `.pd-highlight__badge--decision` | 7.29 |
| `--kind-question-solid` | `hub.css` `.hub-line__badge--question`, `live.css` `.pd-highlight__badge--question` | 5.15 |
| `--mark-bg` | `markdown.css` `.md-doc mark` | 9.34 |
| `--search-current` | `editor.css` `.pd-match-current` | 9.34 |

`TEXT_SOLIDS` in `tests/python/test_theme_contrast.py` is exactly these six. Its
`StylesheetDriftTest` keeps the list equal to what the stylesheets draw. The spec's default
`--state-success-solid` and `--state-info-solid` carry no text, so the list leaves them out.

White on danger: the connection banner and the dialog's danger button drew `--text-on-accent`
(`#ffffff`) on `--state-danger-solid` (`#bf616a`), 4.09:1. They now draw it on a new
`--state-danger-fill` (`#b3535c`, 4.87:1; nord-dark `--nord11`), and `--state-danger-solid` is
left for dots, bars and borders. The contrast test doesn't hold this pair yet.

### Tokens added beyond the plan
Both are in `_template.css` and in both themes, so the theme files now set 98 tokens, not 96:
- `--state-danger-fill` (above).
- `--border-control #858e9e` (3.1:1 on raised, 3.3:1 on input; nord-dark `--nord3`): the
  visible edge of the dialog input, the list filter and the time input. `--border-strong`
  (`#aeb5c3`, 1.95:1) stays for the dashed outlines of what is not saved.

### Component changes
- Muted things keep full-colour text and wash their fill with the page instead of using
  `opacity`: `.cal-block--muted` (40 %) and the done Gantt bar (50 %). The Gantt axis dates
  and the on-hold hub line use `--text-faint` with no opacity.
- The editor's and Live's block cursor draw their character in `--surface-page` (reverse
  video), not `--text-on-solid`, since `--cursor` is dark on light.
- Faint Markdown text that used `opacity` uses `--text-faint`.
- Gantt bar labels draw `--text-strong`, not `--text-on-accent`, on the light bar.
- Health dots and the Log status choices use each state's `-fg`, not its `-solid`, so they
  show on light; the Week bar's focus hours use `--kind-task-fg`.
- Day off on Week: `--surface-muted` is `--nord4` in nord-light (only mixed into the page), so
  chips on an off day keep 4.5:1.
- Meeting blocks (check 11): `--kind-meeting-solid` is `#88a6c4` in nord-light, a touch lighter
  than the table's `#81a1c1`, so `--text-dim` on the block fill reaches 4.6:1.
- One focus ring (check 9): the `outline: none` + tint `:focus-visible` rules in
  breadcrumb, dash-head, folder-page, hub, list-page, navigator, sheet, today, topbar, trash
  and ui.css became the 2 px `--border-focus` outline; `.menu__item` and the navigator pins
  use `outline-offset: -2px` because their parent scrolls. Dark gets the same rules.
- `.time-week__main` scrolls sideways inside its column (`min-width: 0; overflow-x: auto`)
  rather than running under the side panel at two columns.

## Not in this feature
- A theme switcher, and remembering a theme.
- Layout and component redesigns (Round 2: shared look, People, Week, Today, Project, Task).
- Tuning nord-dark.
