// The card under the breadcrumb: what the open page is, laid out for a quick look, and the
// buttons that change it (hub-line-controls.js). One or two rows:
//   Project ▾ · Active ▾ · due Tue 2026-12-15 ✎ · Area: Operations ✎
//     People: Jane Doe (Sponsor), Bob Lee + Add person · Next: Tue 2026-11-24 Kickoff
//   Area ▾ · 3 live projects · 6 people
//   Resource ▾
//   Meeting · Tue 2026-11-24 14:00 ✎ · in Rollout
//     Attendees: Jane Doe ×, Bob Lee × + Add attendee
//   Person · Jane Doe · jane@example.com · +1 555 0100 · Northwind · Data engineer ✎
//   Question ▾ open · asked 2026-11-24 · in Rollout · with Jane Doe × + Add person
//     From: Kickoff "Who owns the feed?"
// "Archived ·" comes first when archived. Empty when no such note is open.
import { attendeesOf } from "../meetings/meetings-model.js";
import { whenText } from "../meetings/meeting-days.js";
import { RECORD_LABELS, groupForKind, hubOf, isArchived, isRecordKind } from "../notes/hub-groups.js";
import { peopleOn } from "../people/people-model.js";
import { isOpen, peopleOf } from "../records/records-model.js";
import { projectFacts } from "../home/home-model.js";
import { areaOf, projectsIn } from "./hub-areas.js";
import { NO_CONTROLS, factButton, miniButton } from "./hub-line-controls.js";
import { dueText, isOverdue, statusLabel } from "./project-facts.js";

export function showHubLine(line, ctx, hub, onOpen, controls = NO_CONTROLS) {
  line.hidden = !hub;
  if (!hub) {
    line.replaceChildren();
    return;
  }
  const { tree } = ctx;
  const label = isRecordKind(hub.kind) ? RECORD_LABELS[hub.kind] : groupForKind(hub.kind).label;
  const filable = !isRecordKind(hub.kind) && hub.kind !== "person";
  const first = [filable
    ? factButton("hub-line__kind", label, "File it as a project, an area, a resource or in the Inbox",
      (button) => controls.file(button, hub), { caret: true })
    : span("hub-line__kind", label)];
  if (isArchived(tree, hub.id)) first.unshift(span("hub-line__archived", "Archived"), separator());
  const [more, second] = detailsOf(ctx, hub, onOpen, controls);
  if (more.length) first.push(separator(), ...more);
  line.replaceChildren(row(first), ...(second?.length ? [row(second)] : []));
}

function detailsOf(ctx, hub, onOpen, controls) {
  if (hub.kind === "person") return [personDetails(ctx.people.get(hub.id), hub, controls), []];
  if (hub.kind === "meeting") return meetingDetails(ctx, hub, onOpen, controls);
  if (isRecordKind(hub.kind)) return recordDetails(ctx, hub, onOpen, controls);
  if (hub.kind === "project") return projectDetails(ctx, hub, onOpen, controls);
  if (hub.kind === "area") return areaDetails(ctx, hub);
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
  const second = [...peopleRow(ctx, project, onOpen, controls)];
  const { next } = projectFacts(tree, ctx.meetings, ctx.records, project.id, today);
  if (next) {
    second.push(separator(), span("hub-line__label", "Next:"), linkTo(tree.get(next.id), false, onOpen,
      `${tree.get(next.id).title}, ${whenText(next)}`));
  }
  return [first, second];
}

function areaDetails(ctx, area) {
  const projects = projectsIn(ctx.tree, area.id);
  const live = projects.filter((project) => project.status !== "on_hold").length;
  const held = projects.length - live;
  const people = peopleOn(ctx.tree, ctx.people, area).filter((each) => !each.archived).length;
  return [[
    span("hub-line__text", live === 1 ? "1 live project" : `${live} live projects`),
    ...(held ? [separator(), span("hub-line__text", `${held} on hold`)] : []),
    separator(),
    span("hub-line__text", people === 1 ? "1 person" : `${people} people`),
  ], []];
}

function peopleRow(ctx, hub, onOpen, controls) {
  const on = peopleOn(ctx.tree, ctx.people, hub).filter((each) => each.roles.some((role) => role.via === null));
  // One inline run, so the row's gaps don't come between a name and its comma.
  const names = list(on.map(({ person, roles, archived }) => {
    const role = roles.find((each) => each.via === null)?.role;
    return [linkTo(person, archived, onOpen), ...(role ? [span("hub-line__role", ` (${role})`)] : [])];
  }));
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
    factButton("hub-line__when", record.day ? whenText(record) : "no date", "Change the date and time", () => controls.when(meeting)),
    separator(),
    ...(hub ? [span("hub-line__text", "in "), linkTo(hub, false, onOpen)] : [span("hub-line__text hub-line__text--none", "in no hub")]),
  ];
  const attendees = attendeesOf(tree, meetings, meeting.id);
  const names = list(attendees.map((person) => [linkTo(person, isArchived(tree, person.id), onOpen),
    miniButton("×", `Take ${person.title} off`, () => controls.dropAttendee(meeting, person))]));
  const second = [span("hub-line__label", "Attendees:"),
    attendees.length ? names : span("hub-line__text hub-line__text--none", "no one yet"),
    factButton("hub-line__set", "+ Add attendee", "Someone who was there", () => controls.addAttendee(meeting))];
  return [first, second];
}

function recordDetails({ tree, records }, note, onOpen, controls) {
  const record = records.get(note.id);
  const day = (text) => factButton("hub-line__when", text, "Change the date", () => controls.day(note));
  const parts = note.kind === "question"
    ? [factButton("hub-line__state", isOpen(record) ? "open" : `answered ${record.answered}`,
      isOpen(record) ? "Answer it, or mark it answered" : "Reopen it, or change the answer date", (button) => controls.answer(button, note), { caret: true }),
    separator(), span("hub-line__text", "asked "), day(record.day)]
    : [day(record.day)];
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
  return [parts, second];
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
