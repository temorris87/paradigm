# 005 Calendar columns line up with their headings

Status: built (2026-11-26)
Backlog item: "On Chrome on windows, the heading and column on the calendar doesn't align with the content."
Decided with Tyson: 2026-11-26
Lanes: backend, frontend (integrate: the frame page's path and headers join them)
Migration: none

## Context: the cause
The Week page's calendar (`static/js/calendar/grid-view.js`, `static/css/calendar.css`) is three
stacked grids with the same columns: `.cal-head` (day names), `.cal-allday` (all-day row) and
`.cal-body`, which sits inside `.cal-scroll` (`overflow-y: auto`). Only the body scrolls, so on
Windows only the body loses ~15–17 px to the scroll bar. Its five `1fr` columns get narrower
than the heading's and all-day row's, and the gap grows from Monday to Friday: Friday's heading
ends up a scroll bar's width right of its column. On the Mac, scroll bars float over the content
and take no width, so it never shows there.

## What it does
- The heading, the all-day row and the hour grid keep the same columns, whatever scroll bar the
  system draws (classic on Windows, overlay on the Mac, a wide one under Windows high-contrast
  or display scaling).
- Above the scroll bar, the heading and all-day row leave an empty strip the scroll bar's width,
  in the row's own background. On the Mac it's zero width, so nothing changes there.
- The scroll bar's room stays even when the day fits without scrolling, so the columns don't
  shift when the window is resized past that point.
- No keys, data or behaviour change: clicking a slot, dragging blocks, the now line and the ghost
  all work as now (they measure the columns themselves, `slotAt`, `showGhost`).

How (CSS only, in `static/css/calendar.css`):
- `.cal-scroll { scrollbar-gutter: stable; }`: the scroll bar's room is always there.
- `.cal-head, .cal-allday { overflow: hidden; scrollbar-gutter: stable; flex-shrink: 0; }`:
  they reserve the same
  room without ever scrolling. `scrollbar-gutter` works on `overflow: hidden` boxes in Chrome
  94+ and Firefox 97+. Nothing in those rows is meant to overflow; the selected block's 2 px
  outline fits in the cell's 2 px padding. `flex-shrink: 0` because `overflow: hidden` drops the
  rows' automatic minimum height in the `.cal-week` flex column, and the tall scroller would
  otherwise squash and clip them (found in review).
- A why-comment above it: the Windows scroll bar is the reason.

Rejected: moving the heading and all-day row inside the scroller with `position: sticky`. It
works too, but the scroller's rectangle is used for hit testing (`slotAt`) and the scroll-to-now
code, so it changes more for the same result.

## Part 2: Mermaid's CSP messages (Tyson, 2026-11-26: "fix the blockers as part of this release")
The browser check found that each Mermaid render logs about 14 CSP violations ("Applying inline
style violates ... default-src 'self'"), on the first load as well (Welcome's diagram). Mermaid
draws each diagram into our off-screen work element (`static/js/diagrams/work-area.js`) in the
live page, and while it lays the diagram out it writes a `<style>` element and `style=""`
attributes there, which the CSP blocks. `vendor-audit.md` condition 6 said to live with them;
this part removes them. The finished SVG already goes in without violations (`insert-svg.js`).

### Draw in a frame page with its own CSP
Mermaid draws in a hidden, same-origin frame page, `/diagram-frame.html`. That page is served
with a CSP that allows inline **styles** (scripts are still `'self'` only, no outside loads). The
frame sends back the SVG text, and the window puts it in through `insert-svg.js` exactly as now.
The app's own pages keep their CSP unchanged.

Why this is safe: the frame holds nothing but the diagram's source. Styles can't call home,
because `default-src 'self'` still bars outside URLs, and DOMPurify and `securityLevel: "strict"`
stay as they are. The SVG is still cleaned and inserted under the strict CSP. As a bonus,
Mermaid's own `<style>` now applies while it measures, so labels are sized by Mermaid's real
rules.

Rejected: allowing `'unsafe-inline'` styles across the whole app (weakens every page for one
library), and patching Mermaid (vendored files must match the audited checksums).

### Backend lane (part 2)
- `paradigm/web/security.py`: `headers_for(path)`. Every path gets today's `SECURITY_HEADERS`,
  except `/diagram-frame.html`, which gets:
  - `Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`
  - `X-Frame-Options: SAMEORIGIN`. The other headers stay the same.
- `paradigm/web/handler.py`: send `headers_for(path)` in place of the fixed tuple.
- `tests/python/test_security.py` (or the existing security test file): the frame path gets the
  frame headers, and `/`, `/note.html`, `/api/...`, `/diagram-frame.html?x=1` and an unknown path
  keep the strict ones. The query string doesn't change which policy applies; the path decides.

### Frontend lane (part 2)
- `static/diagram-frame.html` plus `static/js/diagrams/frame-main.js`. The page loads Mermaid the
  first time it is asked. It answers `postMessage` only from `parent`, at our own origin, with
  `{type: "render", id, source, config}` → `{type: "rendered", id, svg}` or
  `{type: "failed", id, error}`. It draws in its own work element and empties it after each one.
- `static/js/diagrams/frame-client.js`: one frame per window (main and note), made on first
  use. It sits off-screen (not `display: none`, because Firefox can't measure there), with
  `aria-hidden` and `tabindex="-1"`. It gives `mermaid.js` the same `{initialize, render}` shape
  its `load()` returns now, so the queue, cache, `svgFor` (`:export`) and the tests' fakes stay
  as they are. The theme colours are still read in the window and sent with the config. If the
  frame doesn't answer within 20 s, render fails with "The diagram could not be drawn", so the
  queue never sticks.
- `work-area.js` moves into the frame. Its label rules can go if the measurements match without
  them; otherwise they stay.
- Tests in `tests/js/`: the client's message protocol and timeout (with a fake frame), and that
  the frame page ignores messages from another source or origin.
- Calendar focus test: after Esc in "Edit time…" and after Cancel in "Cancel the meeting", the
  focus is on the block (or on the calendar if it was redrawn).

Decisions:
- The frame's timeout: 20 s per diagram, the first one included, since loading Mermaid's 5 MB
  is part of it (default, approved by Tyson, 2026-11-26).
- The label-size rules in `work-area.js`: dropped only if a test measures the same sizes without
  them (default, approved by Tyson, 2026-11-26).

## Part 3: the focus after the calendar's dialogs
Found by the first browser check. After "Edit time…" or "Cancel the meeting" closes (Esc,
Cancel or Save), the focus goes back to the block, or to the calendar if the block was redrawn
(`calendar-page.js`, `focusBlock`, passed to the dialogs as `fallbackFocus`). Before, it was
left on the page body. Already built; it gets a JS test (frontend lane).

## Data / API
No data. No API route; part 2's contract is the frame page's path and headers above.

## Files (frontend lane, part 1)
- `static/css/calendar.css`: the rules above.
- `tests/js/test_calendar_align.js` (new, imported in `tests/js/index.html`): draws the grid in a
  fixed-size box, forces a classic, visible scroll bar on `.cal-scroll` (so the test means
  something on a Mac too), and checks that each `.cal-dayhead` and `.cal-allday__cell` has the
  same left and right as its `.cal-col`, within 1 px. CI runs it in Chrome and Firefox.

## Acceptance checks
1. In the Week page with sample meetings, each day heading's left and right edges match its
   column's within 1 px, for all five days (measured with `getBoundingClientRect`).
2. The same for each all-day cell, with an all-day meeting in it.
3. With a classic 17 px scroll bar forced on `.cal-scroll`, `.cal-head` and `.cal-allday`
   together (as Windows Chrome draws it on all three; reset `scrollbar-color` first, since Chrome
   ignores `::-webkit-scrollbar` while it is set), checks 1 and 2 still hold, and the scroller's
   `offsetWidth - clientWidth` is > 0 (so the check really had a scroll bar).
4. With the body shortened so the day doesn't scroll (no real window is tall enough, because
   `hourPxFor` grows the hours with the window), the gutter is kept and the edges still match.
5. Clicking an empty slot on Friday at 14:00 opens the new-meeting dialog for Friday at 14:00,
   and dragging a block to Thursday lands it on Thursday (hit testing unchanged; whether a dialog
   also opens after the drag is the separate backlog bug, not this check).
6. The selected all-day block's outline isn't clipped.
7. On the Mac (overlay scroll bars), the page looks as before: no visible strip.
8. After Esc in "Edit time…" and after Cancel in "Cancel the meeting", the focus is on the block
   (or the calendar, if it was redrawn).
9. Opening Welcome (dashboard, rendered note, Live page) and the note window's rendered view logs
   **0** CSP violations, and the diagram draws.
10. The label boxes aren't too tall (a node's height is close to its text's).
11. A broken diagram shows its source and the message, with 0 violations.
12. `:export` of a note with a diagram has the diagram.
13. `/diagram-frame.html` has the frame CSP. Every other response keeps `frame-ancestors 'none'`
    and `DENY`.
14. With the frame page missing (renamed in the temporary copy) or not answering, diagrams show
    the error after the timeout, and the rest of the page works.
15. The frame page ignores `postMessage` from any window but its parent, or from another origin.

Left for Tyson: a look on the Windows work PC in Chrome, the one place the real scroll bar shows.

## Not in this feature
- The calendar's other backlog items (all tasks on the calendar, dragging a meeting opening the
  new-meeting dialog): they're their own items.
- Restyling the scroll bar itself.
- Any change to the app's own CSP: only the frame page gets its own.
- Docs (the docs step): `vendor-audit.md` condition 6 and Mermaid's "As built", `paradigm/web/CLAUDE.md`
  (the one page with its own CSP), `static/CLAUDE.md` (the new files).

## As built (2026-11-26)
Built as planned; no fix rounds after the last review. Notes:
- Part 1: exactly the CSS above, in `calendar.css` (`.cal-head, .cal-allday` with
  `flex-shrink: 0; overflow: hidden; scrollbar-gutter: stable`, and `scrollbar-gutter: stable`
  on `.cal-scroll`). `test_calendar_align.js` draws the grid with the real `nord.css` and
  `calendar.css` in a shadow root, so the rules never touch the test page. It forces the 17 px
  scroll bar with `::-webkit-scrollbar` only where the browser supports it (Chrome); Firefox has
  no way to force a width, so there it checks whatever scroll bar Firefox draws.
- Part 2: the frame protocol and headers are as specified. The window's side is
  `frame-client.js` (`createFrameClient`, `diagramFrame()`), and `mermaid.js`'s default
  `load()` now returns it; the frame page's side is split in two, `frame-main.js` (loads
  Mermaid, re-applies `securityLevel: "strict"` and `startOnLoad: false` to whatever config
  arrives, empties the work element after each render) and `frame-listener.js` (the message
  checks, testable with fake windows). The frame is `iframe.pd-diagram-frame`.
  `handler.py` picks the headers from the request's path with the query string stripped; an
  error sent before a request line was read gets the strict headers.
- `work-area.js` moved into the frame (it now takes the frame's document). Its `p { margin: 0 }`
  rule was kept: no test showed the label sizes match without it (decision above).
  `test_diagrams.js`'s real-Mermaid test now checks that nothing is laid out in the window and
  that the frame's work element is emptied.
- Part 3: `CalendarPage.focusBlock(block)` (the block's node, else the calendar's root, with
  `preventScroll`), passed as `fallbackFocus` to both dialogs; tested in
  `test_calendar_focus.js`. The message tests are in `test_diagram_frame.js`.
- Browser check: 15 checks in headless Chrome on the Mac, 0 console or CSP errors. Still for
  Tyson: the real classic scroll bar in Chrome on Windows, and a wide one under high contrast
  or display scaling.

## Decisions
1. The strip above the scroll bar: left empty in the row's background, with the row's
   bottom border running across it as it does now (default, approved by Tyson, 2026-11-26).
2. The regression test in `tests/js/`: included, so CI on Chrome and Firefox catches it
   if it comes back (default, approved by Tyson, 2026-11-26).
