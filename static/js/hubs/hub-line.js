// The hub line under the breadcrumb: what the open hub is. "Project · Area: Operations"
// (the area can be clicked), "Area · 3 projects", "Resource"; on a person's note "Person ·
// Northwind · Data engineer · jane@example.com"; on a meeting "Meeting · Tue 2026-11-24
// 14:00 · in Rollout · 3 attendees" (the hub can be clicked); on a decision "Decision ·
// 2026-11-24 · in Rollout · from Kickoff · with Jane Doe, Bob Lee" and on a question
// "Question · open · asked 2026-11-24 · ..." (hub, meeting and people can be clicked);
// "Archived · ..." first when archived.
// Empty when no hub is open. What can be changed is a button (hub-line-controls.js): the kind
// of a hub (▾), a project's area (✎), a person's details (✎), a meeting's or record's date,
// a question's state (▾), the people on a record (× and + Add person).
import { attendeesOf, attendeesText, shortTitle } from "../meetings/meetings-model.js";
import { whenText } from "../meetings/meeting-days.js";
import { RECORD_LABELS, groupForKind, hubOf, isArchived, isRecordKind, meetingOf } from "../notes/hub-groups.js";
import { isOpen, peopleOf } from "../records/records-model.js";
import { areaOf, projectsIn } from "./hub-areas.js";
import { NO_CONTROLS, factButton, miniButton } from "./hub-line-controls.js";

export function showHubLine(line, { tree, people, meetings, records }, hub, onOpen, controls = NO_CONTROLS) {
  line.hidden = !hub;
  if (!hub) {
    line.replaceChildren();
    return;
  }
  const label = isRecordKind(hub.kind) ? RECORD_LABELS[hub.kind] : groupForKind(hub.kind).label;
  const filable = !isRecordKind(hub.kind) && hub.kind !== "person";
  const parts = [filable
    ? factButton("hub-line__kind", label, "File it as a project, an area, a resource or in the Inbox",
      (button) => controls.file(button, hub), { caret: true })
    : span("hub-line__kind", label)];
  if (isArchived(tree, hub.id)) parts.unshift(span("hub-line__archived", "Archived"), separator());
  const more = hub.kind === "person" ? personDetails(people.get(hub.id), hub, controls)
    : hub.kind === "meeting" ? meetingDetails(tree, meetings, hub, onOpen, controls)
      : isRecordKind(hub.kind) ? recordDetails({ tree, meetings, records }, hub, onOpen, controls)
        : details(tree, hub, onOpen, controls);
  if (more.length) parts.push(separator(), ...more);
  line.replaceChildren(...parts);
}

function details(tree, hub, onOpen, controls) {
  if (hub.kind === "area") {
    const n = projectsIn(tree, hub.id).length;
    return [span("hub-line__text", n === 1 ? "1 project" : `${n} projects`)];
  }
  if (hub.kind !== "project") return [];
  const area = areaOf(tree, hub.id);
  const choose = () => controls.area(hub);
  if (!area) return [span("hub-line__text hub-line__text--none", "no area"), factButton("hub-line__set", "Set area", "Put this project in an area", choose)];
  const archived = isArchived(tree, area.id);
  const parts = [span("hub-line__text", "Area: "), linkTo(area, archived, onOpen)];
  if (archived) parts.push(span("hub-line__text hub-line__text--none", "(archived)"));
  parts.push(miniButton("✎", "Change the area", choose));
  return parts;
}

function meetingDetails(tree, meetings, meeting, onOpen, controls) {
  const record = meetings.get(meeting.id);
  const hub = hubOf(tree, meeting.id);
  return [
    factButton("hub-line__when", record.day ? whenText(record) : "no date", "Change the date and time", () => controls.when(meeting)),
    separator(),
    ...(hub ? [span("hub-line__text", "in "), linkTo(hub, false, onOpen)] : [span("hub-line__text hub-line__text--none", "in no hub")]),
    separator(),
    span("hub-line__text", attendeesText(attendeesOf(tree, meetings, meeting.id).length)),
  ];
}

function recordDetails({ tree, meetings, records }, note, onOpen, controls) {
  const record = records.get(note.id);
  const day = (text) => factButton("hub-line__when", text, "Change the date", () => controls.day(note));
  const parts = note.kind === "question"
    ? [factButton("hub-line__state", isOpen(record) ? "open" : `answered ${record.answered}`,
      isOpen(record) ? "Mark it answered" : "Reopen it, or change the answer date", (button) => controls.answer(button, note), { caret: true }),
    separator(), span("hub-line__text", "asked "), day(record.day)]
    : [day(record.day)];
  const hub = hubOf(tree, note.id);
  if (hub) parts.push(separator(), span("hub-line__text", "in "), linkTo(hub, false, onOpen));
  const meeting = meetingOf(tree, note.id);
  if (meeting) {
    parts.push(separator(), span("hub-line__text", "from "),
      linkTo(meeting, false, onOpen, shortTitle(meeting, meetings.get(meeting.id))));
  }
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
  return parts;
}

function linkTo(note, archived, onOpen, text = note.title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = archived ? "hub-line__link hub-line__link--archived" : "hub-line__link";
  button.textContent = text;
  button.addEventListener("click", () => onOpen(note.id));
  return button;
}

function personDetails({ org, job, email }, person, controls) {
  const edit = () => controls.details(person);
  const texts = [org, job, email].filter(Boolean);
  if (!texts.length) return [factButton("hub-line__set", "Add details", "Organisation, job title and email", edit)];
  const parts = [];
  texts.forEach((text, index) => {
    if (index) parts.push(separator());
    parts.push(span("hub-line__text", text));
  });
  parts.push(miniButton("✎", "Change the organisation, job title or email", edit));
  return parts;
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
