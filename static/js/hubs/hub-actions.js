// What the hub page's buttons do: the hub line's controls (hub-line-controls.js) and the
// section panel's add and row buttons. Each one asks with a menu, picker or dialog
// (static/js/ui/) and ends in the same code the matching ex command runs.
//
//   const controls = hubLineControls(app)    for HubPage({ controls })
//   const tabActions = hubTabActions(app)    for HubPage({ tabActions }): the tabs' add buttons
//                                            (hub-tabs.js add) and row buttons (role, remove)
//   newMeetingDialog(app, owner?) / newRecordDialog(app, kind, owner)   also from the pages
//   personDialog(app, { title, fields?, run(person, values) })   who: someone in People, or new
import { localDay } from "../meetings/meeting-days.js";
import { addAttendees, dropAttendee, makeMeeting, setMeetingWhen } from "../meetings/meetings-commands.js";
import { newNoteDialog } from "../notes/note-actions.js";
import { HUB_GROUPS, groupForKind, isArchived, isHub } from "../notes/hub-groups.js";
import { linkPerson, peopleNamed, unlinkPerson } from "../people/people-commands.js";
import { allPeople, filterOptions, findPerson } from "../people/people-model.js";
import { addPeopleTo, answerQuestion, defaultDay, dropPersonFrom, makeRecord, reopenQuestion,
  setRecordDay } from "../records/records-commands.js";
import { isOpen } from "../records/records-model.js";
import { formDialog } from "../ui/dialog.js";
import { openMenu } from "../ui/menu.js";
import { pickFrom } from "../ui/picker.js";
import { areaOf, projectsIn } from "./hub-areas.js";

const FIELDS = [["org", "Organisation"], ["job", "Job title"], ["email", "Email"]];

export function hubLineControls(app) {
  const back = { fallbackFocus: () => app.focusNote() };
  return {
    file: (button, hub) => openMenu(button, HUB_GROUPS.map((group) => ({
      label: group.label,
      checked: groupForKind(hub.kind) === group,
      run: () => app.guard(app.kindCommand(group).then(() => app.focusNote())),
    })), { label: "File as" }),

    area: async (project) => {
      const areas = app.tree.children(null).filter((note) => note.kind === "area" && !isArchived(app.tree, note.id));
      const items = [
        { id: null, title: "No area", detail: "take it out of its area" },
        ...areas.map((area) => ({ id: area.id, title: area.title, detail: countProjects(app.tree, area.id) })),
      ];
      const picked = await pickFrom({ title: `Put "${project.title}" in an area`, placeholder: "part of the area's name", items,
        empty: "No area matches", ...back });
      if (picked?.item) app.guard(app.setAreaOf(project.id, picked.item.id));
    },

    details: (person) => {
      const record = app.people.get(person.id);
      return formDialog({
        title: `Details of ${person.title}`,
        fields: FIELDS.map(([key, label]) => ({ key, label, value: record[key], optional: true, type: key === "email" ? "email" : "text" })),
        submit: "Save",
        run: async (values) => {
          for (const [key] of FIELDS) {
            const value = values[key].trim();
            if (value !== record[key]) await app.peopleApi.update(person.id, key, value);
          }
          await app.refreshTree();
          app.editor.showMessage(`${person.title}'s details saved`);
        },
        ...back,
      });
    },

    when: (meeting) => {
      const record = app.meetings.get(meeting.id);
      return formDialog({
        title: `When was "${meeting.title}"?`,
        fields: [
          { key: "day", label: "Date", type: "date", value: record.day || localDay(app.today()) },
          { key: "time", label: "Time (leave it empty for none)", type: "time", value: record.time, optional: true },
        ],
        submit: "Save",
        run: ({ day, time }) => setMeetingWhen(app, meeting.id, day, time),
        ...back,
      });
    },

    day: (note) => dateDialog(app, {
      title: `Date of "${note.title}"`,
      value: app.records.get(note.id).day,
      run: (day) => setRecordDay(app, note.id, day),
    }),

    answer: (button, question) => {
      const record = app.records.get(question.id);
      const today = localDay(app.today());
      const answerOn = (title, value) => dateDialog(app, { title, value, run: (day) => answerQuestion(app, question.id, day) });
      const entries = isOpen(record)
        ? [{ label: "Answered today", run: () => app.guard(answerQuestion(app, question.id, today).then(() => app.focusNote())) },
          { label: "Answered on…", run: () => app.guard(answerOn(`When was "${question.title}" answered?`, today)) }]
        : [{ label: "Reopen", run: () => app.guard(reopenQuestion(app, question.id).then(() => app.focusNote())) },
          { label: "Change the answer date…", run: () => app.guard(answerOn(`When was "${question.title}" answered?`, record.answered)) }];
      openMenu(button, entries, { label: "Question" });
    },

    addWith: (note) => personDialog(app, {
      title: `Add a person to "${note.title}"`,
      run: (found) => addPeopleTo(app, note.id, found),
    }),

    dropWith: (note, person) => app.guard(dropPersonFrom(app, note.id, person)),
  };
}

/**
 * A dialog asking for one person by name (suggesting everyone in People), plus any fields.
 * A name that isn't anyone yet adds them to People: the button says so ("Add new person"),
 * so a typo is seen before it makes someone. run gets { people: [note], made } and the values.
 */
export function personDialog(app, { title, fields = [], submit = "Add", run }) {
  const names = allPeople(app.tree).map((person) => person.title);
  return formDialog({
    title,
    fields: [{ key: "name", label: "Person", suggestions: names, placeholder: "a name in People, or a new one" }, ...fields],
    submit: ({ name }) => (!name.trim() || findPerson(app.tree, name) ? submit : `${submit} new person`),
    run: async (values) => run(await peopleNamed(app, [values.name.trim()], true, ""), values),
    fallbackFocus: () => app.focusNote(),
  });
}

/** A dialog asking for one date. */
export function dateDialog(app, { title, value, run }) {
  return formDialog({
    title,
    fields: [{ key: "day", label: "Date", type: "date", value: value || localDay(app.today()) }],
    submit: "Save",
    run: ({ day }) => run(day),
    fallbackFocus: () => app.focusNote(),
  });
}

function countProjects(tree, areaId) {
  const n = projectsIn(tree, areaId).length;
  return n === 1 ? "1 project" : `${n} projects`;
}

export function hubTabActions(app) {
  const back = { fallbackFocus: () => app.focusNote() };
  const add = {
    notes: (owner) => newNoteDialog(app, owner.id, { heading: `New note in "${owner.title}"` }),
    people: (hub) => personDialog(app, {
      title: `Add a person to "${hub.title}"`,
      fields: [roleField(app, "")],
      run: ({ people: [person], made }, { role }) => linkPerson(app, hub, person, role.trim(), made),
    }),
    projects: (area) => addProject(app, area, back),
    hubs: (person) => formDialog({
      title: `Put ${person.title} on a hub`,
      fields: [hubField(app), roleField(app, "")],
      submit: "Add",
      run: ({ hub, role }) => linkPerson(app, app.tree.get(Number(hub)), person, role.trim()),
      ...back,
    }),
    attendees: (meeting) => personDialog(app, {
      title: `Add an attendee to "${meeting.title}"`,
      run: (found) => addAttendees(app, meeting.id, found),
    }),
    meetings: (owner) => newMeetingDialog(app, owner),
    decisions: (owner) => newRecordDialog(app, "decision", owner),
    questions: (owner) => newRecordDialog(app, "question", owner),
  };
  const remove = {
    people: (hub, row) => unlinkPerson(app, hub, app.tree.get(row.id)),
    hubs: (person, row) => unlinkPerson(app, app.tree.get(row.id), person),
    attendees: (meeting, row) => dropAttendee(app, meeting.id, app.tree.get(row.id)),
    projects: (area, row) => app.setAreaOf(row.id, null),
  };
  const roleOn = (hub, person, role) => formDialog({
    title: `${person.title}'s role on ${hub.title}`,
    fields: [{ ...roleField(app, role), optional: true }],
    submit: "Save",
    run: (values) => linkPerson(app, hub, person, values.role.trim()),
    ...back,
  });
  return {
    add: (tabKey, owner) => app.guard(add[tabKey]?.(owner)),
    row: (key, tabKey, owner, row) => {
      if (key === "remove") return app.guard(remove[tabKey]?.(owner, row));
      if (key !== "role") return undefined;
      const [hub, person] = tabKey === "hubs" ? [app.tree.get(row.id), owner] : [owner, app.tree.get(row.id)];
      return app.guard(roleOn(hub, person, row.role ?? ""));
    },
  };
}

/** New meeting: on a hub (or a note in one) it goes in that hub; elsewhere (a person, the
 * Meetings page) a Hub dropdown asks, and a person attends it. */
export function newMeetingDialog(app, owner = null) {
  const hub = owner && isHub(app.tree, owner.id) ? owner : null;
  const person = owner?.kind === "person" ? owner : null;
  return formDialog({
    title: hub ? `New meeting in "${hub.title}"` : person ? `New meeting with ${person.title}` : "New meeting",
    fields: [
      ...(hub ? [] : [hubField(app)]),
      { key: "title", label: "Title" },
      { key: "day", label: "Date", type: "date", value: localDay(app.today()) },
      { key: "time", label: "Time (leave it empty for none)", type: "time", optional: true },
    ],
    submit: "Make it",
    run: (values) => makeMeeting(app, hub ?? chosenHub(app, values), values.title.trim(), values.day, values.time,
      { attendeeIds: person ? [person.id] : [], strict: true }),
    fallbackFocus: () => app.focusNote(),
  });
}

/** New decision or question: under a meeting (dated its day), in a hub, or for a person (a Hub
 * dropdown asks; they are on it). */
export function newRecordDialog(app, kind, owner) {
  const meeting = owner.kind === "meeting" ? owner : null;
  const hub = meeting || isHub(app.tree, owner.id) ? owner : null;
  const person = owner.kind === "person" ? owner : null;
  return formDialog({
    title: `New ${kind} ${meeting ? "from" : person ? "with" : "in"} ${person ? person.title : `"${owner.title}"`}`,
    fields: [
      ...(hub ? [] : [hubField(app)]),
      { key: "title", label: kind === "decision" ? "What was decided" : "The question" },
      { key: "day", label: kind === "decision" ? "Decided on" : "Asked on", type: "date", value: defaultDay(app, meeting) },
    ],
    submit: "Make it",
    run: (values) => makeRecord(app, kind, hub ?? chosenHub(app, values), values.title.trim(), values.day,
      { peopleIds: person ? [person.id] : [], strict: true }),
    fallbackFocus: () => app.focusNote(),
  });
}

async function addProject(app, area, back) {
  const projects = app.tree.children(null).filter((note) => note.kind === "project" && !isArchived(app.tree, note.id)
    && areaOf(app.tree, note.id)?.id !== area.id);
  const picked = await pickFrom({
    title: `Add a project to "${area.title}"`,
    placeholder: "a project's name, or a new one",
    items: projects.map((project) => ({ id: project.id, title: project.title,
      detail: areaOf(app.tree, project.id) ? `now in ${areaOf(app.tree, project.id).title}` : "in no area" })),
    create: (text) => `New project "${text}" in ${area.title}`,
    ...back,
  });
  if (picked?.item) await app.setAreaOf(picked.item.id, area.id);
  if (picked?.create) await app.createFiled("project", picked.create, { areaId: area.id });
}

/** The live hubs, for a Hub dropdown: "Acme (Project)". */
function hubField(app) {
  const hubs = app.tree.children(null).filter((note) => isHub(app.tree, note.id) && !isArchived(app.tree, note.id));
  return { key: "hub", label: "Hub", type: "select",
    options: hubs.map((hub) => [String(hub.id), `${hub.title} (${groupForKind(hub.kind).label})`]) };
}

function chosenHub(app, values) {
  const hub = app.tree.get(Number(values.hub));
  if (!hub) throw new Error("Choose a hub first (make a project, an area or a resource)");
  return hub;
}

function roleField(app, value) {
  return { key: "role", label: "Role (optional)", value, optional: true, suggestions: filterOptions(app.tree, app.people).roles };
}
