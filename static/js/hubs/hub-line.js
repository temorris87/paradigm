// The hub line under the breadcrumb: what the open hub is. "Project · Area: Operations"
// (the area can be clicked), "Area · 3 projects", "Resource"; on a person's note "Person ·
// Northwind · Data engineer · jane@example.com"; on a meeting "Meeting · Tue 2026-11-24
// 14:00 · in Rollout · 3 attendees" (the hub can be clicked); on a decision "Decision ·
// 2026-11-24 · in Rollout · from Kickoff · with Jane Doe, Bob Lee" and on a question
// "Question · open · asked 2026-11-24 · ..." (hub, meeting and people can be clicked);
// "Archived · ..." first when archived.
// Empty when no hub is open.
import { attendeesOf, attendeesText, shortTitle } from "../meetings/meetings-model.js";
import { whenText } from "../meetings/meeting-days.js";
import { RECORD_LABELS, groupForKind, hubOf, isArchived, isRecordKind, meetingOf } from "../notes/hub-groups.js";
import { isOpen, peopleOf } from "../records/records-model.js";
import { areaOf, projectsIn } from "./hub-areas.js";

export function showHubLine(line, { tree, people, meetings, records }, hub, onOpen) {
  line.hidden = !hub;
  if (!hub) {
    line.replaceChildren();
    return;
  }
  const label = isRecordKind(hub.kind) ? RECORD_LABELS[hub.kind] : groupForKind(hub.kind).label;
  const parts = [span("hub-line__kind", label)];
  if (isArchived(tree, hub.id)) parts.unshift(span("hub-line__archived", "Archived"), separator());
  const more = hub.kind === "person" ? personDetails(people.get(hub.id))
    : hub.kind === "meeting" ? meetingDetails(tree, meetings, hub, onOpen)
      : isRecordKind(hub.kind) ? recordDetails({ tree, meetings, records }, hub, onOpen)
        : details(tree, hub, onOpen);
  if (more.length) parts.push(separator(), ...more);
  line.replaceChildren(...parts);
}

function details(tree, hub, onOpen) {
  if (hub.kind === "area") {
    const n = projectsIn(tree, hub.id).length;
    return [span("hub-line__text", n === 1 ? "1 project" : `${n} projects`)];
  }
  if (hub.kind !== "project") return [];
  const area = areaOf(tree, hub.id);
  if (!area) return [span("hub-line__text hub-line__text--none", "no area (:inarea {area})")];
  const archived = isArchived(tree, area.id);
  const parts = [span("hub-line__text", "Area: "), linkTo(area, archived, onOpen)];
  if (archived) parts.push(span("hub-line__text hub-line__text--none", "(archived)"));
  return parts;
}

function meetingDetails(tree, meetings, meeting, onOpen) {
  const record = meetings.get(meeting.id);
  const hub = hubOf(tree, meeting.id);
  return [
    record.day ? span("hub-line__text", whenText(record)) : span("hub-line__text hub-line__text--none", "no date (:date)"),
    separator(),
    ...(hub ? [span("hub-line__text", "in "), linkTo(hub, false, onOpen)] : [span("hub-line__text hub-line__text--none", "in no hub")]),
    separator(),
    span("hub-line__text", attendeesText(attendeesOf(tree, meetings, meeting.id).length)),
  ];
}

function recordDetails({ tree, meetings, records }, note, onOpen) {
  const record = records.get(note.id);
  const parts = note.kind === "question"
    ? [span("hub-line__text", isOpen(record) ? "open" : `answered ${record.answered}`), separator(),
      span("hub-line__text", `asked ${record.day}`)]
    : [span("hub-line__text", record.day)];
  const hub = hubOf(tree, note.id);
  if (hub) parts.push(separator(), span("hub-line__text", "in "), linkTo(hub, false, onOpen));
  const meeting = meetingOf(tree, note.id);
  if (meeting) {
    parts.push(separator(), span("hub-line__text", "from "),
      linkTo(meeting, false, onOpen, shortTitle(meeting, meetings.get(meeting.id))));
  }
  const names = peopleOf(tree, records, note.id);
  parts.push(separator());
  if (!names.length) parts.push(span("hub-line__text hub-line__text--none", "no one yet (:with {name})"));
  else {
    parts.push(span("hub-line__text", "with "));
    names.forEach((person, index) => {
      if (index) parts.push(span("hub-line__text", ", "));
      parts.push(linkTo(person, isArchived(tree, person.id), onOpen));
    });
  }
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

function personDetails({ org, job, email }) {
  const parts = [org ? span("hub-line__text", org) : span("hub-line__text hub-line__text--none", "no organisation (:org)")];
  for (const text of [job, email]) if (text) parts.push(separator(), span("hub-line__text", text));
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
