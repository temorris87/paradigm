// What the hub page's buttons do: the hub line's controls (hub-line-controls.js) and the
// section panel's add and row buttons. Each one asks with a menu, picker or dialog
// (static/js/ui/) and ends in the same code the matching ex command runs.
//
//   const controls = hubLineControls(app)    for HubPage({ controls })
//   personDialog(app, { title, fields?, run(person, values) })   who: someone in People, or new
import { localDay } from "../meetings/meeting-days.js";
import { setMeetingWhen } from "../meetings/meetings-commands.js";
import { HUB_GROUPS, groupForKind, isArchived } from "../notes/hub-groups.js";
import { peopleNamed } from "../people/people-commands.js";
import { allPeople, findPerson } from "../people/people-model.js";
import { addPeopleTo, answerQuestion, dropPersonFrom, reopenQuestion, setRecordDay } from "../records/records-commands.js";
import { isOpen } from "../records/records-model.js";
import { formDialog } from "../ui/dialog.js";
import { openMenu } from "../ui/menu.js";
import { pickFrom } from "../ui/picker.js";
import { projectsIn } from "./hub-areas.js";

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
