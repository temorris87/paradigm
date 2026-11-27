# UI audit (2026-11-26)

A usability review of the main window and the note window. It comes before the light theme and
the redesign, which are worked out in the Figma file "Paradigm UI" (pages: Current (dark),
Audit, Foundations, Redesign (light)).

## How it was done
- **Data:** generated sample data only (`python tools/browser_drive.py start`, then
  `python tools/demo_data.py`). Headless Chrome, 1400 x 900, plus captures at 1600 and 1280
  wide (above and below the 1400 px breakpoint).
- **Jobs walked**, keyboard first:
  1. plan the week;
  2. start the day;
  3. prepare a 1:1 (what I owe them, what they owe me, what to raise);
  4. capture follow-ups in a meeting;
  5. check a project.
- **Contrast:** WCAG 2.1 ratios worked out from the Nord values in `static/css/nord.css`.
- **Severity:**
  - 4: shows wrong information or blocks the job;
  - 3: slows a daily job;
  - 2: friction or noise;
  - 1: polish.
- Findings marked *verify* were seen once and should be confirmed before a fix is specced.

## Summary
The app can do a great deal, and the keyboard model is strong where it exists (Today's list,
People, the editor). The main problems:
1. **The 1:1 prep job shows wrong or shifting information** (E1, E2).
2. **Status has no shared visual language** (X3). Overdue, late, at risk, not placed and
   follow-up each look different on each page.
3. **Pages have no clear hierarchy.** Every block on the project and person pages has the same
   weight (P1, E2).
4. **Keys are easy to discover on Today and hidden everywhere else** (X4).
5. **Colors are wired in by palette name** (X1). A light theme first needs color tokens named
   by their role, and Nord's accents fail contrast as text on its light backgrounds (X2).

## Across the app

| # | Sev | Finding | Suggested fix |
|---|-----|---------|---------------|
| X1 | 3 | Components use palette names (`var(--nord2)`; about 590 uses) for different jobs: `--nord1` is a surface in one place and a border in another. Two files hard-code `color-scheme: dark`. A theme can't be swapped. | Name color tokens by role (surface, text, border, accent, state, kind), put each theme in its own file, and add a gate test that no CSS outside the themes uses `--nordN` or hex. |
| X2 | 3 | Contrast. Empty navigator groups (RESOURCES, TEMPLATES, ARCHIVE): nord3 on nord1 is **1.36:1**. `--text-faint` on the navigator: **2.75:1**. Red text (nord11) on nord0: **3.05:1**. In a light theme **no Nord accent passes 4.5:1 as text on nord6**: nord10 3.50, nord11 3.55, nord12 2.47, nord14 1.77, nord13 1.35. | Light theme: darker "-fg" text variants of each accent, tinted "-bg" fills, and a 4.5:1 floor for text (3:1 for UI parts). Empty groups use `text-dim`, not nord3. |
| X3 | 3 | Status is drawn a different way on every page. Today has uppercase colored labels (OVERDUE 5 D, DUE FRI). The tree has health dots. The project page has a pill (ON TRACK) and a red dot before "due 24 Nov". The Week tray has orange "not placed" and faint "est?". The people list has "1 · 1 late". | One status vocabulary of a few labelled chips (overdue, due soon, waiting / follow-up, at risk, blocked, done), each with its own role colors, used on every page. |
| X4 | 2 | You only find keys on Today. It has a hint line, which sits below the fold at 900 px. Week, People, the project page and the task page show none. The Week's keys appear only in tooltips ("(w)", "(i)"). | A shared key-hint bar at the foot of the main window, filled from each page's key table (the tables already exist). `?` lists every key. |
| X5 | 2 | Changes are confirmed in a small toast in the bottom-right corner that soon disappears ("… placed tomorrow 08:00–08:45"). `s` (schedule) can't be undone from the keyboard. | Toasts next to the key-hint bar, with an Undo for actions that place, delegate or complete. |
| X6 | 1 | Box styles disagree: Today's Now card is dashed, Outcome and Notes are filled panels, sections are ruled lists, and the selected row has an outlined box. | Three surface levels (page, raised, sunken) and one selected-row style, from the theme tokens. |
| X7 | 1 | The top bar names the page twice on the Week ("Week" tab, then "Week" title). | The title appears only when the tab doesn't already name the page. |

## Today (daily view)

| # | Sev | Finding | Suggested fix |
|---|-----|---------|---------------|
| T1 | 2 | After the last meeting (16:38 here) the Now card says "NOTHING PLANNED · Thursday is clear." while the day's timeline beside it still lists three items. It means "the rest of today", but it reads as a contradiction. | "Rest of today is free", and earlier items shown as past (struck through or folded "3 earlier"). |
| T2 | 2 | Up next rows take two or three lines each, because the project name wraps under the title, so 11 items fill the screen. The key hint is pushed below the fold. | One line per row: title, then the project in dim text, then the due chip and the estimate. Project names cut short with an ellipsis. |
| T3 | 2 | The day timeline is a narrow column that cuts titles short ("Warehouse cut-over check-…"). The free gaps are hard to see. | Use the daily calendar design from the Week (time axis, blocks, gaps shaded) for the single day. |
| T4 | 1 | "Calendar not imported today" stays in the right column all day, styled as a warning. | Show it once in the morning as a quiet notice, with an Import button. |

## Week (weekly calendar)

| # | Sev | Finding | Suggested fix |
|---|-----|---------|---------------|
| W1 | 3 | Short meetings can't be read: 15-minute stand-ups show "Team sta… 09:00" with the time running into the title. | Blocks under 30 min: a single line with the title only and the time in a tooltip. A minimum block height. |
| W2 | 2 | The import notice shows the full data folder path in warning yellow, every day, across the toolbar. | One short line: "Calendar not imported today · Import (i) · How?". The path goes under How?. |
| W3 | 2 | Nearly every tray row ends in orange "not placed", so a normal state looks like an alarm and the real signal (overdue) is lost. | "not placed" in dim text. Color only for overdue and due-before-placed. |
| W4 | 2 | Keyboard: from the calendar, Tab passes through the toolbar (Show weekend, Import, Import a file…, the tabs, the filter, the search) before the first tray task, about 8 presses. There's no key to switch between the tray and the grid, or to move between blocks. | Keys for the tray and the grid (for example `gt` and `gg`), j/k inside each, Enter for the block's menu. Listed in the key-hint bar. |
| W5 | 2 | The due strip uses two chip styles (filled yellow with ◆, outlined orange), and their titles are cut short ("Due · Write the reque…"). The difference isn't explained. | One chip style with a kind icon (milestone ◆, task □), its color from the status vocabulary (X3), and a tooltip with the full title. |
| W6 | 1 | The second line of a block (time, project) is low contrast on the block fill. | Fixed by the theme tokens (text on a raised surface). |

## Project page

| # | Sev | Finding | Suggested fix |
|---|-----|---------|---------------|
| P1 | 3 | No hierarchy. Card line, people line, plan strip, Outcome panel, status log, Tasks, Questions, Meetings, Decisions and People all look alike. Health appears twice (the ON TRACK pill under the title and again in "Where I am"). The "Outcome" label is repeated as a heading inside its own panel. | A head with three parts (title, health with its last note, due and next milestone), then two columns: work (Tasks, Questions) and context (Meetings, Decisions, People). The plan strip goes with the head. |
| P2 | 2 | The card line packs about 8 controls with ▾ and ✎ glyphs. The kind switcher ("Project ▾") sits beside the status, so a rare and disruptive change looks as easy as a routine one. | Status and due stay inline. Kind, area and time code move to the note menu. |
| P3 | 2 | The selected task row grows Done / Edit… / Delegate… / Delete buttons inline, so the row's height changes and the list jumps. | Row actions as icons on hover or focus, at a fixed height. The keys shown in the hint bar. |
| P4 | 2 | Overdue tasks are marked only by a small red dot before "due 24 Nov". | The overdue chip (X3). |
| P5 | 1 | Empty sections fold into "Nothing yet: Answered questions · Notes + · Files +", which is easy to miss. | Keep it, styled as a quiet footer with clear + buttons. |

## Tasks

| # | Sev | Finding | Suggested fix |
|---|-----|---------|---------------|
| K1 | 3 | After capture in a meeting, the status line says "3 captured" but the meeting's sheet says "Tasks 0": the tasks went to the hub (Team). The captured lines get no mark in the text. You can't see where your follow-up went. | Mark captured lines in the editor (a badge, as the Live page's highlights do). Count captured tasks on the meeting's sheet ("Tasks 2 · in Team"). |
| K2 | 2 | Typing a full name with a space ("T: @Ben Ortiz check the numbers") delegates to Ben and leaves "Ortiz" at the start of the title. "@Ada Park" later in the line leaves "Ada Park" in the title. The right form (`@BenOrtiz`) is easy to forget mid-meeting. *verify* | Show the parsed task (who, title, due) in the hint over the command line before the save, or take the longest name that matches. |
| K3 | 2 | Task page: a "Subtask \| Notes" header over an empty Notes column. Most of the page is blank. Who it's for or delegated to, whether it's placed, and where it came from aren't shown. | A task head: title, project, due, estimate, placed blocks, for or delegate, source meeting with its quote. Subtasks below. Notes beside them only when there are any. |
| K4 | 1 | T: and Q: lines typed in a person's notes (not a meeting) do nothing, and nothing says so. *verify against the spec* | A hint the first time: "T: lines are captured in meetings". |

## People (follow-ups: what I owe, what I'm owed)

| # | Sev | Finding | Suggested fix |
|---|-----|---------|---------------|
| E1 | 4 | **"Next 1:1" is wrong.** It is the next meeting of any kind they attend (`nextTogether`), counting today's meetings that are already over. Ben shows "Next 1:1 Thu 26 Nov, 11:00", a cut-over check-in seen at 16:38. Ada shows the team stand-up. The people list's "Next together" column has the same past-meeting problem. | Label it "Next together" unless the meeting is a 1:1 ("1:1" in its title, or only you and them attending). Skip meetings that have ended. Show the next 1:1 separately when there is one. |
| E2 | 3 | The person page moves around with its content. Sections that have items take the columns. Empty ones fold into "Nothing yet:" lines. So Waiting on, I owe and To raise sit somewhere different for each person (on Ben's page "I owe" is a folded line; on Ada's, "Waiting on"). | Three fixed columns at the top, always in the same order: **They owe me** (Waiting on), **I owe them**, **To raise**. Each with a count and an empty state. Active, Archived and Backlinks below. |
| E3 | 2 | Role · org · email is shown under the name and again in the "Person" card line. | One identity line, editable in place. |
| E4 | 2 | Active lists every meeting they attended, past ones too, mixed with hubs and cut short. | Hubs only. Meetings as "Last together" and "Next together". |
| E5 | 2 | People list: Waiting on / I owe / To raise are bare numbers ("1 · 1 late" in orange), and it can't be sorted by most owed. | Chips from X3. Sort by most overdue follow-up. |
| E6 | 1 | The Notes placeholder is faint text on a raised panel and hard to read. | Theme tokens: placeholder text with at least 4.5:1 contrast. |

## Navigator and the two windows

| # | Sev | Finding | Suggested fix |
|---|-----|---------|---------------|
| N1 | 2 | Empty groups are almost invisible (X2). The People group lists everyone, which pushes Templates and Archive down. | `text-dim` for empty groups. People folded by default once there are more than about 10. |
| N2 | 1 | The note window shows the person's or meeting's card line again above the text. That's fine, but its sheet bar ("Waiting on Ada 0 · I owe Ada 1 (1 late) · …") is the most useful summary and sits at the very bottom. | Keep it. The redesign gives it the same chips as the person page. |

## What the redesign should cover, in order
1. **Theme tokens and Nord Light** (X1, X2, X6, W6, E6). Tokens named by role, themes as
   files, a contrast floor.
2. **Status vocabulary and key-hint bar** (X3, X4, X5). Shared parts used by every page below.
3. **People and the person page** (E1–E5). The follow-up job, including the "Next 1:1" fix.
4. **Week** (W1–W5).
5. **Today** (T1–T4).
6. **Project page** (P1–P5).
7. **Task page and capture feedback** (K1–K4).

## Proposed Nord Light roles (Step 4, awaiting approval)
In the Figma file: variables (collections Primitives, Color with a mode "Nord Light", Spacing,
Type) and the Foundations page. How the values were made:
- **Surfaces** are Snow Storm (nord6 page, nord5 sunken) plus a near-white raised surface.
- **Text** is Polar Night.
- **`-fg` roles** keep each Nord hue and saturation, with the lightness lowered until the
  text reaches 4.5:1 on page, raised, sunken and its own `-bg` tint.
- **`-solid` roles** are Nord's own colors, for dots, bars and borders.
- **`-bg` roles** are 18% tints of the `-solid` color over the raised surface.

The specimen uses Inter and JetBrains Mono, because Figma doesn't have Segoe UI or Consolas.
The app keeps `--font-ui` and `--font-mono`. `radius/sm|md|lg` (4 / 6 / 10) are new tokens.

| Role | CSS | Value |
|------|-----|-------|
| `surface/page` | `--surface-page` | `#eceff4` |
| `surface/raised` | `--surface-raised` | `#f8f9fb` |
| `surface/sunken` | `--surface-sunken` | `#e5e9f0` |
| `surface/hover` | `--surface-hover` | `#dde2ec` |
| `surface/overlay` | `--surface-overlay` | `#ffffff` |
| `text/strong` | `--text-strong` | `#242933` |
| `text/default` | `--text` | `#2e3440` |
| `text/dim` | `--text-dim` | `#4c566a` |
| `text/faint` | `--text-faint` | `#606979` |
| `text/on-accent` | `--text-on-accent` | `#ffffff` |
| `border/default` | `--border-default` | `#d8dee9` |
| `border/strong` | `--border-strong` | `#aeb5c3` |
| `accent/primary` | `--accent` | `#5179a9` |
| `accent/link` | `--link` | `#486b96` |
| `border/focus` | `--border-focus` | `#486b96` |
| `surface/selected` | `--surface-selected` | `#e2e8f0` |
| `state/danger-bg` | `--state-danger-bg` | `#eedee1` |
| `state/danger-fg` | `--state-danger-fg` | `#ac3f49` |
| `state/danger-solid` | `--state-danger-solid` | `#bf616a` |
| `state/warning-bg` | `--state-warning-bg` | `#f1e4e2` |
| `state/warning-fg` | `--state-warning-fg` | `#a64c2f` |
| `state/warning-solid` | `--state-warning-solid` | `#d08770` |
| `state/caution-bg` | `--state-caution-bg` | `#f6f1e7` |
| `state/caution-fg` | `--state-caution-fg` | `#896111` |
| `state/caution-solid` | `--state-caution-solid` | `#ebcb8b` |
| `state/success-bg` | `--state-success-bg` | `#e9eee7` |
| `state/success-fg` | `--state-success-fg` | `#54703c` |
| `state/success-solid` | `--state-success-solid` | `#a3be8c` |
| `state/info-bg` | `--state-info-bg` | `#e4eff3` |
| `state/info-fg` | `--state-info-fg` | `#2f7184` |
| `state/info-solid` | `--state-info-solid` | `#88c0d0` |
| `kind/task-bg` | `--kind-task-bg` | `#e9eee7` |
| `kind/task-fg` | `--kind-task-fg` | `#54703c` |
| `kind/task-solid` | `--kind-task-solid` | `#a3be8c` |
| `kind/decision-bg` | `--kind-decision-bg` | `#e4eff3` |
| `kind/decision-fg` | `--kind-decision-fg` | `#2f7184` |
| `kind/decision-solid` | `--kind-decision-solid` | `#88c0d0` |
| `kind/question-bg` | `--kind-question-bg` | `#ece6ed` |
| `kind/question-fg` | `--kind-question-fg` | `#8a5880` |
| `kind/question-solid` | `--kind-question-solid` | `#b48ead` |
| `kind/meeting-bg` | `--kind-meeting-bg` | `#e3e9f1` |
| `kind/meeting-fg` | `--kind-meeting-fg` | `#436b94` |
| `kind/meeting-solid` | `--kind-meeting-solid` | `#81a1c1` |
| `chart/capacity-meeting` | `--chart-capacity-meeting` | `#81a1c1` |
| `chart/capacity-focus` | `--chart-capacity-focus` | `#a3be8c` |
| `chart/capacity-free` | `--chart-capacity-free` | `#d8dee9` |
| `chart/gantt-bar` | `--chart-gantt-bar` | `#81a1c1` |
| `chart/gantt-done` | `--chart-gantt-done` | `#a0a8b6` |
| `chart/now-line` | `--chart-now-line` | `#bf616a` |
