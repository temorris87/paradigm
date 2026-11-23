// The card under the breadcrumb: what the open page is, laid out for a quick look, and the
// buttons that change it (hub-line-controls.js). One or two rows:
//   Project ▾ · Active ▾ · due Tue 2026-12-15 ✎ · Area: Operations ✎
//     People: Jane Doe (Sponsor), Bob Lee + Add person · Next: Tue 2026-11-24 Kickoff
//     Time code: ACME-114 ✎ (or "ACME-100 (from area)", or Set time code)
//   Area ▾ · 3 live projects · 6 people · Time code: OPS ✎
//   Resource ▾
//   Meeting · Tue 2026-11-24 14:00–15:00 ✎ · in Rollout · Room 4 · Join ↗ (Cancelled first)
//     Attendees: Jane Doe ×, Bob Lee × + Add attendee
//   Person · Jane Doe · jane@example.com · +1 555 0100 · Northwind · Data engineer ✎
//   Phase · in Pilot · 3 Nov → 12 Dec ✎ · +9 d, moved 3× (its history) · 4 open tasks
//   Milestone · to come ▾ · 17 Jan ✎ · in Design · +5 d, moved 1×
//   Question ▾ open · asked 2026-11-24 · in Rollout · with Jane Doe × + Add person
//     From: Kickoff "Who owns the feed?"
// "Archived ·" comes first when archived. Empty when no such note is open.
import { allMeetings, attendeesOf } from "../meetings/meetings-model.js";
import { whenText } from "../meetings/meeting-days.js";
import { RECORD_LABELS, groupForKind, hubOf, isArchived, isRecordKind } from "../notes/hub-groups.js";
import { peopleOn } from "../people/people-model.js";
import { isOpen, peopleOf } from "../records/records-model.js";
import { projectFacts } from "../today/today-facts.js";
import { areaOf, projectsIn } from "./hub-areas.js";
import { Plan, dayNumber, nextMilestone, shortDay, slipOf, slipText, slipWords } from "../plan/plan-model.js";
import { openCount } from "../tasks/tasks-model.js";
import { localDay } from "../meetings/meeting-days.js";
import { NO_CONTROLS, factButton, miniButton } from "./hub-line-controls.js";
import { dueText, isOverdue, statusLabel } from "./project-facts.js";
import { dayText } from "../ui/dates.js";

export function showHubLine(line, ctx, hub, onOpen, controls = NO_CONTROLS) {
  line.hidden = !hub;
  if (!hub) {
    line.replaceChildren();
    return;
  }
  const { tree } = ctx;
  const label = isRecordKind(hub.kind) ? RECORD_LABELS[hub.kind] : hub.kind === "phase" ? "Phase" : groupForKind(hub.kind).label;
  const filable = !isRecordKind(hub.kind) && hub.kind !== "person" && hub.kind !== "phase";
  const first = [filable
    ? factButton("hub-line__kind", label, "File it as a project, an area, a resource or in the Inbox",
      (button) => controls.file(button, hub), { caret: true })
    : span(hub.kind === "decision" || hub.kind === "question" ? `hub-line__kind hub-line__badge hub-line__badge--${hub.kind}` : "hub-line__kind", label)];
  if (isArchived(tree, hub.id)) first.unshift(span("hub-line__archived", "Archived"), separator());
  const [more, ...rest] = detailsOf(ctx, hub, onOpen, controls);
  if (more.length) first.push(separator(), ...more);
  line.replaceChildren(row(first), ...rest.filter((each) => each?.length).map(row));
}

function detailsOf(ctx, hub, onOpen, controls) {
  if (hub.kind === "person") return [personDetails(ctx.people.get(hub.id), hub, controls), []];
  if (hub.kind === "meeting") return meetingDetails(ctx, hub, onOpen, controls);
  if (hub.kind === "phase" || hub.kind === "milestone") return planDetails(ctx, hub, onOpen, controls);
  if (isRecordKind(hub.kind)) return recordDetails(ctx, hub, onOpen, controls);
  if (hub.kind === "project") return projectDetails(ctx, hub, onOpen, controls);
  if (hub.kind === "area") return areaDetails(ctx, hub, controls);
  return [[], []];
}

function projectDetails(ctx, project, onOpen, controls) {
  const { tree } = ctx;
  const today = ctx.today ?? new Date();
  const first = [
    factButton("hub-line__state", statusLabel(project), "Active or on hold", (button) => controls.status(button, project), { caret: true }),
    separator(),
    project.due
      ? factButton(`hub-line__when${isOverdue(project, today) ? " hub-line__when--late" : ""}`, dueText(project, today),
        "Change the due date", () => controls.due(project))
      : factButton("hub-line__set", "Set due date", "When it is due", () => controls.due(project)),
    separator(),
  ];
  const area = areaOf(tree, project.id);
  const choose = () => controls.area(project);
  if (!area) first.push(span("hub-line__text hub-line__text--none", "no area"), factButton("hub-line__set", "Set area", "Put this project in an area", choose));
  else {
    const archived = isArchived(tree, area.id);
    first.push(span("hub-line__text", "Area: "), linkTo(area, archived, onOpen));
    if (archived) first.push(span("hub-line__text hub-line__text--none", "(archived)"));
    first.push(miniButton("✎", "Change the area", choose));
  }
  first.push(separator(), ...timeCodeParts(tree, project, controls));
  const second = [...peopleRow(ctx, project, onOpen, controls)];
  const { next } = projectFacts(tree, ctx.meetings, ctx.records, project.id, today);
  if (next) {
    second.push(separator(), span("hub-line__label", "Next:"), linkTo(tree.get(next.id), false, onOpen,
      `${tree.get(next.id).title}, ${whenText(next)}`));
  }
  const plan = ctx.plan ?? new Plan();
  const milestone = nextMilestone(tree, plan, project.id);
  if (milestone) {
    second.push(separator(), span("hub-line__label", "Milestone:"), linkTo(milestone.note, false, onOpen,
      `${milestone.note.title}, ${shortDay(milestone.milestone.day, localDay(today))}`));
  }
  const applied = plan.appliedTo(project.id);
  if (applied) second.push(separator(), span("hub-line__text hub-line__text--none", `plan from “${applied.title}”`));
  return [first, second];
}

/** "Time code: X ✎", "Time code: X (from area) ✎" or "Set time code". */
function timeCodeParts(tree, hub, controls) {
  const edit = () => controls.timeCode(hub);
  if (hub.time_code) {
    return [span("hub-line__text", "Time code: "), span("hub-line__code", hub.time_code),
      miniButton("✎", "Change the time code its time is booked to", edit)];
  }
  const area = hub.kind === "project" ? areaOf(tree, hub.id) : null;
  if (area?.time_code) {
    return [span("hub-line__text", "Time code: "), span("hub-line__code", area.time_code),
      span("hub-line__text hub-line__text--none", " (from area)"), miniButton("✎", "Give it a time code of its own", edit)];
  }
  return [factButton("hub-line__set", "Set time code", "The timesheet code its time is booked to", edit)];
}

function planDetails(ctx, note, onOpen, controls) {
  const { tree } = ctx;
  const plan = ctx.plan ?? new Plan();
  const today = localDay(ctx.today ?? new Date());
  const parent = tree.get(tree.parentId(note.id));
  const parts = [];
  if (note.kind === "milestone") {
    const milestone = plan.milestone(note.id);
    if (!milestone) return [[], []];
    const done = Boolean(milestone.done_day);
    parts.push(factButton("hub-line__state", done ? `reached ${shortDay(milestone.done_day, today)}` : "to come",
      done ? "Not reached after all" : "Mark it reached", (button) => controls.milestoneState(button, note), { caret: true }), separator(),
    factButton(`hub-line__when${!done && milestone.day < today ? " hub-line__when--late" : ""}`, shortDay(milestone.day, today),
      "Move its day (the move is kept in its history)", () => controls.dates(note)));
  } else {
    const phase = plan.phase(note.id);
    if (!phase) return [[], []];
    parts.push(factButton("hub-line__when", `${shortDay(phase.start, today)} → ${shortDay(phase.end, today)}`,
      "Move its dates (each move is kept in its history)", () => controls.dates(note)));
  }
  if (parent) parts.push(separator(), span("hub-line__text", "in "), linkTo(parent, isArchived(tree, parent.id), onOpen));
  const slip = slipOf(plan, note.id);
  if (slip.moves) {
    // A phase says it in words (the design's "9 days later than planned, moved 3 times").
    const words = plan.phase(note.id) ? slipWords(slip) : `${slipText(slip)}${slip.keepsSlipping ? " · keeps slipping" : ""}`;
    parts.push(separator(), factButton(`hub-line__slip${slip.keepsSlipping || slip.days > 0 ? " hub-line__slip--late" : ""}`,
      words, "Its date history (h)", () => controls.history(note)));
  } else {
    parts.push(separator(), span("hub-line__text hub-line__text--none", "on its first dates"));
  }
  if (ctx.tasks) {
    const open = openCount(tree, ctx.tasks, note);
    if (open) parts.push(separator(), span("hub-line__text", `${open} open task${open === 1 ? "" : "s"}`));
  }
  const phase = plan.phase(note.id);
  return [parts, phase ? phaseBar(plan, note, phase, today) : []];
}

/** A phase's mini bar (its dates over its baseline, and today) and where it moved from. */
function phaseBar(plan, note, phase, today) {
  const first = [phase.start, phase.baseline_start, today].sort()[0];
  const last = [phase.end, phase.baseline_end, today].sort()[2];
  const span0 = dayNumber(first);
  const length = Math.max(1, dayNumber(last) - span0 + 1);
  const at = (day) => (dayNumber(day) - span0) / length;
  const bar = document.createElement("span");
  bar.className = "hub-line__bar";
  const piece = (className, from, to) => {
    const node = document.createElement("span");
    node.className = className;
    // CSSOM, never style="" (the CSP).
    node.style.setProperty("--left", String(at(from)));
    node.style.setProperty("--width", String((dayNumber(to) - dayNumber(from) + 1) / length));
    return node;
  };
  bar.append(piece("hub-line__bar-baseline", phase.baseline_start, phase.baseline_end), piece("hub-line__bar-fill", phase.start, phase.end),
    piece("hub-line__bar-today", today, today));
  const changes = plan.changesOf(note.id);
  const lastMove = changes[changes.length - 1];
  const words = [`Baseline ended ${dayText(phase.baseline_end, { today })}`,
    lastMove ? `Last move: ${dayText(lastMove.changed_at?.slice(0, 10) ?? "", { today })}${lastMove.reason ? ` — “${lastMove.reason}”` : ""}` : ""]
    .filter(Boolean).join(" · ");
  return [bar, span("hub-line__text hub-line__text--dim", words)];
}

function areaDetails(ctx, area, controls) {
  const projects = projectsIn(ctx.tree, area.id);
  const live = projects.filter((project) => project.status !== "on_hold").length;
  const held = projects.length - live;
  const people = peopleOn(ctx.tree, ctx.people, area).filter((each) => !each.archived).length;
  return [[
    span("hub-line__text", live === 1 ? "1 live project" : `${live} live projects`),
    ...(held ? [separator(), span("hub-line__text", `${held} on hold`)] : []),
    separator(),
    span("hub-line__text", people === 1 ? "1 person" : `${people} people`),
    separator(),
    ...timeCodeParts(ctx.tree, area, controls),
  ], []];
}

// How many people the card names before "+N more"; leads and sponsors come first.
const CARD_PEOPLE = 4;
const ROLE_RANK = ["lead", "sponsor", "owner"];

function rank(role) {
  const at = ROLE_RANK.indexOf(role.toLowerCase());
  return at === -1 ? ROLE_RANK.length : at;
}

function peopleRow(ctx, hub, onOpen, controls) {
  const on = peopleOn(ctx.tree, ctx.people, hub).filter((each) => each.roles.some((role) => role.via === null));
  const roleOf = (entry) => entry.roles.find((each) => each.via === null)?.role ?? "";
  // The card stays short: leads and sponsors first, a few names, then "+N more" (the People
  // section lists everyone).
  const ranked = [...on].sort((a, b) => rank(roleOf(a)) - rank(roleOf(b)));
  const shown = ranked.length > CARD_PEOPLE + 1 ? ranked.slice(0, CARD_PEOPLE) : ranked;
  const rest = ranked.slice(shown.length);
  // One inline run, so the row's gaps don't come between a name and its comma.
  const names = list(shown.map((entry) => {
    const role = roleOf(entry);
    return [linkTo(entry.person, entry.archived, onOpen), ...(role ? [span("hub-line__role", ` (${role})`)] : [])];
  }));
  if (rest.length) {
    const more = span("hub-line__role", ` +${rest.length} more`);
    more.title = rest.map((entry) => entry.person.title).join(", ");
    names.append(more);
  }
  return [span("hub-line__label", "People:"), on.length ? names : span("hub-line__text hub-line__text--none", "no one yet"),
    factButton("hub-line__set", "+ Add person", "Put someone on it, with a role", () => controls.addPerson(hub))];
}

/** Items (each a list of nodes) in one span, comma-separated. */
function list(items) {
  const node = document.createElement("span");
  node.className = "hub-line__list";
  items.forEach((parts, index) => {
    if (index) node.append(", ");
    node.append(...parts);
  });
  return node;
}

function meetingDetails({ tree, meetings }, meeting, onOpen, controls) {
  const record = meetings.get(meeting.id);
  const hub = hubOf(tree, meeting.id);
  const first = [
    ...(record.cancelled ? [span("hub-line__archived", "Cancelled"), separator()] : []),
    factButton("hub-line__when", record.day ? whenText(record) : "no date", "Change the date and time", () => controls.when(meeting)),
    separator(),
    ...(hub ? [span("hub-line__text", "in "), linkTo(hub, false, onOpen)] : [span("hub-line__text hub-line__text--none", "in no hub")]),
  ];
  if (record.location) first.push(separator(), span("hub-line__text", record.location));
  if (record.join_url) first.push(separator(), externalLink("Join ↗", record.join_url, "Join the online meeting"));
  const attendees = attendeesOf(tree, meetings, meeting.id);
  const names = list(attendees.map((person) => [linkTo(person, isArchived(tree, person.id), onOpen),
    miniButton("×", `Take ${person.title} off`, () => controls.dropAttendee(meeting, person))]));
  const second = [span("hub-line__label", "Attendees:"),
    attendees.length ? names : span("hub-line__text hub-line__text--none", "no one yet"),
    factButton("hub-line__set", "+ Add attendee", "Someone who was there", () => controls.addAttendee(meeting))];
  return [first, second];
}

function recordDetails({ tree, records, meetings, today: now }, note, onOpen, controls) {
  const record = records.get(note.id);
  const today = localDay(now ?? new Date());
  const day = (text) => factButton("hub-line__when", text, "Change the date", () => controls.day(note));
  const age = Math.max(0, Math.round((Date.parse(today) - Date.parse(record.day)) / 86400000));
  const parts = note.kind === "question"
    ? [factButton("hub-line__state", isOpen(record) ? `open · ${age} day${age === 1 ? "" : "s"}` : `answered ${shortDay(record.answered, localDay(new Date()))}`,
      isOpen(record) ? "Answer it, or mark it answered" : "Reopen it, or change the answer date", (button) => controls.answer(button, note), { caret: true }),
    separator(), span("hub-line__text", "asked "), day(dayText(record.day))]
    : [day(dayText(record.day))];
  const hub = hubOf(tree, note.id);
  if (hub) parts.push(separator(), span("hub-line__text", "in "), linkTo(hub, false, onOpen));
  const names = peopleOf(tree, records, note.id);
  parts.push(separator());
  if (!names.length) parts.push(span("hub-line__text hub-line__text--none", "no one yet"));
  else {
    parts.push(span("hub-line__text", "with "));
    names.forEach((person, index) => {
      if (index) parts.push(span("hub-line__text", ", "));
      parts.push(linkTo(person, isArchived(tree, person.id), onOpen),
        miniButton("×", `Take ${person.title} off`, () => controls.dropWith(note, person)));
    });
  }
  parts.push(factButton("hub-line__set", "+ Add person", "Add a person to it", () => controls.addWith(note)));
  const source = tree.get(record.source_id);
  const second = [];
  if (source) {
    second.push(span("hub-line__label", "From:"), linkTo(source, isArchived(tree, source.id), onOpen));
    if (record.quote) second.push(span("hub-line__quote", ` “${oneLine(record.quote)}”`));
    if (record.quote && !record.quote_found) second.push(span("hub-line__text hub-line__text--none", " (that text has changed since)"));
  }
  const rows = [parts, second];
  if (note.kind === "question" && isOpen(record)) {
    // Where to raise it: the next meeting with any of its people (else in its hub).
    const raise = meetings ? raiseAt(tree, meetings, record, hub, today) : null;
    const third = [];
    if (raise) {
      third.push(span("hub-line__label", "Raise at:"), linkTo(raise.note, false, onOpen),
        span("hub-line__text", ` ${dayText(raise.meeting.day, { today })}${raise.meeting.time ? ` ${raise.meeting.time}` : ""}`));
      if (String(raise.meeting.agenda ?? "").toLowerCase().includes(note.title.toLowerCase())) {
        third.push(span("hub-line__ok", " on agenda ✓"));
      }
    }
    third.push(factButton("hub-line__action hub-line__action--answer", "Answer…", "Write the answer and mark it answered", () => controls.answerNow(note)),
      factButton("hub-line__action", "Turn into decision", "It was decided: a decision now, same note", () => controls.toDecision(note)),
      factButton("hub-line__action", "Make a task to find out", "A task in its hub: find out the answer", () => controls.findOut(note)));
    rows.push(third);
  }
  return rows;
}

/** The next meeting (today or later) with any of a record's people, else in its hub. */
function raiseAt(tree, meetings, record, hub, today) {
  const upcoming = allMeetings(tree, meetings).filter(({ meeting, archived }) => !archived && !meeting.cancelled && meeting.day >= today)
    .sort((a, b) => `${a.meeting.day} ${a.meeting.time}`.localeCompare(`${b.meeting.day} ${b.meeting.time}`));
  return upcoming.find(({ meeting }) => meeting.attendees.some((id) => record.people.includes(id)))
    ?? upcoming.find((entry) => hub && entry.hub.id === hub.id) ?? null;
}

function personDetails(person, note, controls) {
  const edit = () => controls.details(note);
  const texts = [person.email, person.phone, person.org, person.job].filter(Boolean);
  if (!texts.length) return [factButton("hub-line__set", "Add details", "Email, phone, organisation and job title", edit)];
  const parts = [];
  texts.forEach((text, index) => {
    if (index) parts.push(separator());
    parts.push(span("hub-line__text", text));
  });
  parts.push(miniButton("✎", "Change the name, email, phone, organisation or job title", edit));
  return parts;
}

function externalLink(text, href, title) {
  const link = document.createElement("a");
  link.className = "hub-line__link";
  link.textContent = text;
  link.title = title;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function oneLine(text) {
  const line = String(text).replace(/\s+/g, " ").trim();
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

function linkTo(note, archived, onOpen, text = note.title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = archived ? "hub-line__link hub-line__link--archived" : "hub-line__link";
  button.textContent = text;
  button.addEventListener("click", () => onOpen(note.id));
  return button;
}

function row(parts) {
  const node = document.createElement("div");
  node.className = "hub-line__row";
  node.append(...parts);
  return node;
}

function separator() {
  const node = span("hub-line__separator", "·");
  node.setAttribute("aria-hidden", "true");
  return node;
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}
