# 007 Clean Teams boilerplate out of imported agendas

Status: built (2026-11-26)
Backlog item: "Remove generic teams boilerplate text from agenda imports."
Decided with Tyson: 2026-11-26
Lanes: backend only (integrate: false)
Migration: none

## Context
An Outlook import turns each invite's DESCRIPTION into the meeting's agenda via
`agenda()` in `paradigm/calendar/import_rules.py`. Today it drops whatever sits between
*pairs* of underscore rules (`________`) and any `** CAUTION` line. Real Teams invites break that:

```
________________________________________________________________________________
Microsoft Teams Need help?<https://aka.ms/JoinTeamsMeeting>
Join the meeting now<https://teams.microsoft.com/l/meetup-join/…>
Meeting ID: 271 813 547 311
Passcode: ep6Yj7xn
________________________________            ← inner rule: toggles skipping OFF
Dial in by phone
+1 323-555-0100,,123456789# United States, Los Angeles
Find a local number<…>
Phone conference ID: 123 456 789#
Join on a video conferencing device
Tenant key: …   Video ID: …   More info<…>
For organizers: Meeting options<…> | Reset dial-in PIN<…>
________________________________________________________________________________   ← now OPENS a skip
```

So the dial-in half leaks into the agenda, and anything after the closing rule is swallowed.
Older invites ("Microsoft Teams meeting / Join on your computer… / Click here to join the
meeting / Learn More | Meeting options") and invites with no rules at all (forwarded, or
pasted by the organiser) leak too. The only test is a toy one.

## What it does
- A rule-delimited section is dropped only when it holds Teams joining text, and the drop runs
  from the rule before the first Teams line to the last rule after the last Teams line (inner
  rules included), or to the end of the text when no closing rule follows. A section between
  rules with no Teams text is now **kept** (today any pair is dropped, which could eat a real
  agenda the organiser divided with lines).
- Outside a block, single boilerplate lines are dropped wherever they are: "Microsoft Teams
  meeting", "Microsoft Teams Need help?", "Join the meeting now", "Join on your computer, mobile
  app or room device", "Click here to join the meeting", "Meeting ID: …", "Passcode: …",
  "Download Teams | Join on the web", "Join with a video conferencing device", "Dial in by
  phone", phone-number lines with `,,digits#`, "Find a local number", "Phone conference ID: …",
  "Tenant key", "Video ID", "More info", "Learn More | Meeting options", "For organizers: …",
  "Reset dial-in PIN". Matched case-insensitively at the start of a line, with or without the
  `<https://…>` link Outlook appends.
- External-mail banners keep being dropped (`** CAUTION`), plus Outlook's "You don't often get
  email from … Learn why this is important" line.
- Kept as today: `<url>` → `url`, `* ` bullets → `- `, blank runs closed up, 20 000 char cap.
  The Join link still comes from `join_url()` (location, else description, read before
  cleaning), so the meeting's Join button is unchanged.
- Which meetings it reaches: new imports, and events still waiting in To file (re-import
  rewrites their agenda). **Meetings already made keep their agenda** — Tyson may have edited it.
  No clean-up of existing meetings (default, approved by Tyson, 2026-11-26).
- Teams only, as the item says; Zoom, Webex and Google Meet blocks are left as they are
  (default, approved by Tyson, 2026-11-26).

## Data
No schema change. Agendas are cleaned before they are stored, as now.

## API contract
No route changes.

## Files (backend lane)
- `paradigm/calendar/teams_boilerplate.py` (new, pure): the marker and line patterns, and
  `strip_teams(lines) -> lines` (block drop + line drop). Keeps `import_rules.py` from growing
  a second job.
- `paradigm/calendar/import_rules.py`: `agenda()` calls `strip_teams`; the pair-toggle goes.
- `tests/python/test_agenda_clean.py` (new), samples made up (Acme / Northwind, 555 numbers,
  fake IDs) in `tests/python/calendar_samples.py`.
- No frontend lane: nothing in `static/` changes.

## Acceptance checks
1. Current-format Teams invite (block with the inner 32-underscore rule and dial-in half) →
   agenda holds only the organiser's text above it; nothing from "Microsoft Teams" through
   "Reset dial-in PIN".
2. Organiser text *after* the closing rule survives.
3. Older format ("Microsoft Teams meeting … Learn More | Meeting options") between rules → dropped.
4. Teams block with an opening rule but no closing rule (truncated) → dropped to the end, text
   above kept.
5. Boilerplate lines with no rules at all (forwarded invite) → each line dropped, the rest kept.
6. Two rules around plain agenda text with no Teams lines → that text is kept.
7. Invite that is only a Teams block → agenda is empty; the meeting still imports with its Join
   link.
8. CAUTION banner and "You don't often get email from…" line dropped; `* ` bullets become `- `.
9. An agenda line that merely mentions Teams ("Discuss the Teams rollout") is kept.
10. Re-importing an event still in To file replaces its agenda with the cleaned one; a meeting
    already made keeps its stored agenda.
11. Browser check: import a sample .ics on `--data` temp folder, open the meeting — Agenda shows
    the clean text and Join still works.

## Not in this feature
- Cleaning agendas of meetings imported before this (default above).
- Zoom, Webex, Meet boilerplate.
- Any change to how the agenda is shown or edited.

## As built
- Narrower than planned, after review: what opens a block is not "any Teams line" but a
  *marker*: a line that is wholly one of Teams' own phrases ("Microsoft Teams meeting",
  "Microsoft Teams Need help?", "Join the meeting now", "Join on your computer, mobile app or
  room device", "Click here to join the meeting", "Download Teams | Join on the web", "Learn
  More | Meeting options"; links stripped, case folded, trailing dot ignored), or a Teams *join*
  link (`teams.microsoft.com` / `teams.live.com` with `/l/meetup-join/` or `/meet/`). A line
  that only starts with "Microsoft Teams", and Teams channel or file links, do not open a block.
- How the block ends: each section records the length of the rule that opens it. After a
  block opens, a following section goes with it only if a *shorter* rule opens it (Outlook's
  32-underscore inner rule) and it holds boilerplate; that dial-in half runs to the end when no
  rule closes it. A rule as long as the opening one closes the block, and after it only the
  boilerplate lines themselves are dropped (a stray "More info" no longer takes its section).
- The single-line list also takes "Join on a video conferencing device" (today's wording)
  beside "Join with …". Underscore rules are always removed from the agenda.
- Banners live in `import_rules.py` (`_BANNER`: `** CAUTION`, "You don't often get email
  from", "Learn why this is important"); `teams_boilerplate.py` exposes `strip_teams` and
  `is_boilerplate`.
- Tests: `tests/python/test_agenda_clean.py`, including `test_mentions_of_teams_between_rules_stay`,
  `test_a_bare_join_link_marks_the_block` and
  `test_boilerplate_after_the_closing_rule_takes_only_its_line`.

## Verification
`python3 tools/pipeline_gate.py`, the new unit tests, then the `feature-build` browser phase
on generated sample data in a temp `--data` folder.
