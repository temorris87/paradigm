// What the plan's buttons, dialogs and the Gantt chart do: new phases and milestones, moving
// their dates (each change recorded, with why when an end slips later), the date history,
// a plain note made a phase and back, and plan templates applied to a project or saved from
// one. Each takes the NotesApp (static/js/notes/app.js); errors are thrown for the app (or the
// dialog) to show.
//
//   newPhaseDialog(app, project) / newMilestoneDialog(app, owner)
//   editDatesDialog(app, noteId)            a phase's start and end, a milestone's day, and why
//   dropDates(app, noteId, values)          a drag on the chart: { start, end } or { day }
//   historyDialog(app, noteId)
//   setMilestoneDone(app, noteId, done)
//   makePhaseDialog(app, note) / unmakePhase(app, note)
//   applyTemplateDialog(app, project) / saveTemplateDialog(app, project)
//   newPlanTemplateDialog(app, area)
import { localDay } from "../meetings/meeting-days.js";
import { confirmDialog, formDialog } from "../ui/dialog.js";
import { addDays, changeText, phasesOf, slipOf, slipText } from "./plan-model.js";

const PHASE_DAYS = 14;

async function changed(app) {
  app.changes.send({ type: "changed", what: ["plan", "tasks"] });
  await app.refreshTree();
}

function today(app) {
  return localDay(app.today());
}

export function newPhaseDialog(app, project) {
  const last = phasesOf(app.tree, app.plan, project.id).at(-1)?.phase;
  const start = last ? addDays(last.end, 1) : today(app);
  return formDialog({
    title: `New phase in "${project.title}"`,
    text: "A stretch of the work, with its own tasks and notes. Its first dates are its baseline: later moves are recorded.",
    fields: [
      { key: "title", label: "Phase", placeholder: "Design, Procurement, Install…" },
      { key: "start", label: "Starts", type: "date", value: start },
      { key: "end", label: "Ends", type: "date", value: addDays(start, PHASE_DAYS - 1) },
    ],
    submit: "Add phase",
    run: async ({ title, start: from, end }) => {
      const { note } = await app.planApi.createPhase(project.id, title.trim(), from, end);
      await changed(app);
      app.say(`Phase "${note.title}" added to "${project.title}"`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

/** owner: a project (then an "In" choice offers its phases) or a phase. */
export function newMilestoneDialog(app, owner) {
  const phases = owner.kind === "project" ? phasesOf(app.tree, app.plan, owner.id) : [];
  return formDialog({
    title: `New milestone in "${owner.title}"`,
    text: "A dated point that has to be reached. Its first day is its baseline.",
    fields: [
      { key: "title", label: "Milestone", placeholder: "PO signed, Go-live…" },
      { key: "day", label: "On", type: "date", value: today(app) },
      ...(phases.length ? [{ key: "in", label: "In", type: "select", value: String(owner.id),
        options: [[String(owner.id), `${owner.title} (the project)`], ...phases.map(({ note }) => [String(note.id), `${note.title} (phase)`])] }] : []),
    ],
    submit: "Add milestone",
    run: async ({ title, day, in: place }) => {
      const { note } = await app.planApi.createMilestone(place ? Number(place) : owner.id, title.trim(), day);
      await changed(app);
      app.say(`Milestone "${note.title}" on ${day}`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

function planned(app, noteId) {
  const note = app.tree.get(noteId);
  const phase = app.plan.phase(noteId);
  const milestone = app.plan.milestone(noteId);
  if (!note || (!phase && !milestone)) throw new Error("E: that note is not a phase or a milestone");
  return { note, phase, milestone };
}

/** Whether moving to values pushes the end (or a milestone's day) later. */
function slipsLater(app, noteId, values) {
  const { phase, milestone } = planned(app, noteId);
  return phase ? Boolean(values.end && values.end > phase.end) : Boolean(values.day && values.day > milestone.day);
}

export function editDatesDialog(app, noteId) {
  const { note, phase, milestone } = planned(app, noteId);
  const fields = phase
    ? [{ key: "start", label: "Starts", type: "date", value: phase.start }, { key: "end", label: "Ends", type: "date", value: phase.end }]
    : [{ key: "day", label: "On", type: "date", value: milestone.day }];
  const slip = slipText(slipOf(app.plan, noteId));
  return formDialog({
    title: `Dates of "${note.title}"`,
    text: [phase ? `First planned ${phase.baseline_start} → ${phase.baseline_end}.` : `First planned for ${milestone.baseline_day}.`,
      slip ? `Now ${slip}.` : ""].filter(Boolean).join(" "),
    fields: [...fields, { key: "reason", label: "Why it moved (kept in its history)", optional: true,
      placeholder: "vendor late, scope added…" }],
    submit: "Save dates",
    run: async (values) => {
      const { reason, ...dates } = values;
      await saveDates(app, noteId, dates, reason.trim());
    },
    fallbackFocus: () => app.focusNote(),
  });
}

async function saveDates(app, noteId, values, reason) {
  const { changes } = await app.planApi.setDates(noteId, values, reason);
  await changed(app);
  const note = app.tree.get(noteId);
  app.say(changes.length ? `"${note.title}": ${changes.map((change) => changeText(change)).join("; ")}` : `"${note.title}" kept its dates`);
}

/** A drop on the chart. A later end asks why first (optional); anything else just saves. */
export async function dropDates(app, noteId, values) {
  if (!slipsLater(app, noteId, values)) return saveDates(app, noteId, values, "");
  const note = app.tree.get(noteId);
  const moved = values.end ?? values.day;
  return formDialog({
    title: `"${note.title}" moves later, to ${moved}`,
    text: "Why? It is kept in its history, so a plan that keeps slipping shows.",
    fields: [{ key: "reason", label: "Why it moved (optional)", optional: true, placeholder: "vendor late, scope added…" }],
    submit: "Move it",
    run: ({ reason }) => saveDates(app, noteId, values, reason.trim()),
    fallbackFocus: () => app.focusNote(),
  }).then((result) => {
    // Cancelled: the chart is drawn again where it was.
    if (result === null) app.redraw();
  });
}

export function historyDialog(app, noteId) {
  const { note, phase, milestone } = planned(app, noteId);
  const changes = app.plan.changesOf(noteId);
  const slip = slipOf(app.plan, noteId);
  const first = phase ? `First planned ${phase.baseline_start} → ${phase.baseline_end}` : `First planned for ${milestone.baseline_day}`;
  return confirmDialog({
    title: `Date history of "${note.title}"`,
    text: [first, slipText(slip) ? `now ${slipText(slip)}${slip.keepsSlipping ? " (keeps slipping)" : ""}` : "never moved"].join(", "),
    lines: changes.map((change) => changeText(change, today(app))).reverse(),
    confirm: "Close",
    fallbackFocus: () => app.focusNote(),
  });
}

export async function setMilestoneDone(app, noteId, done) {
  const { note } = planned(app, noteId);
  await app.planApi.setMilestoneDone(noteId, done);
  await changed(app);
  app.say(`"${note.title}" ${done ? "reached" : "not reached yet"}`);
}

export function makePhaseDialog(app, note) {
  return formDialog({
    title: `Make "${note.title}" a phase`,
    text: "It goes on the project's Gantt chart, with its own Tasks. Its first dates are its baseline.",
    fields: [
      { key: "start", label: "Starts", type: "date", value: today(app) },
      { key: "end", label: "Ends", type: "date", value: addDays(today(app), PHASE_DAYS - 1) },
    ],
    submit: "Make it a phase",
    run: async ({ start, end }) => {
      await app.planApi.makePhase(note.id, start, end);
      await changed(app);
      app.say(`"${note.title}" is a phase now`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

export function unmakePhase(app, note) {
  return confirmDialog({
    title: `Make "${note.title}" a plain note`,
    text: "It leaves the Gantt chart, and its date history goes. Its text, notes and tasks stay.",
    confirm: "Make it a plain note",
    run: async () => {
      await app.planApi.unmakePhase(note.id);
      await changed(app);
      app.say(`"${note.title}" is a plain note again`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

/** The templates a project may use: its area's first, then the rest (named with their area). */
function templateChoices(app, project) {
  const areaId = project.area_id ?? null;
  const own = app.planTemplates.filter((template) => template.area_id === areaId);
  const others = app.planTemplates.filter((template) => template.area_id !== areaId);
  const label = (template) => `${template.title} (${app.tree.get(template.area_id)?.title ?? "area"}, ${template.items.length} items)`;
  return [...own, ...others].map((template) => [String(template.id), label(template)]);
}

/** Next Monday, or today when it is one. */
function nextMonday(app) {
  const now = app.today();
  const day = now.getDay();
  return addDays(localDay(now), day === 1 ? 0 : (8 - day) % 7);
}

export function applyTemplateDialog(app, project) {
  const options = templateChoices(app, project);
  if (!options.length) {
    throw new Error(project.area_id
      ? `E: "${app.tree.get(project.area_id)?.title}" has no plan templates yet: add one on the area, or save this project's plan as one`
      : "E: no plan templates yet: they are kept on an area (its Plan templates section)");
  }
  return formDialog({
    title: `Apply a plan template to "${project.title}"`,
    text: "Its phases, milestones and tasks are made here, counting working days (weekends and holidays skipped) from the start. Nothing here is replaced.",
    fields: [
      { key: "template", label: "Template", type: "select", options },
      { key: "start", label: "Starts on", type: "date", value: nextMonday(app) },
    ],
    submit: "Apply",
    run: async ({ template, start }) => {
      const made = await app.planTemplatesApi.apply(Number(template), project.id, start);
      await changed(app);
      app.say(`Made ${made.phases} phases, ${made.milestones} milestones and ${made.tasks} tasks in "${project.title}"`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

export function saveTemplateDialog(app, project) {
  const area = app.tree.get(project.area_id);
  if (!area) throw new Error(`E: "${project.title}" is in no area: plan templates are kept on an area (set its area first)`);
  return formDialog({
    title: `Save "${project.title}"'s plan as a template`,
    text: `Kept on ${area.title}. Its phases and milestones become working days from the first one, with their tasks.`,
    fields: [{ key: "title", label: "Template name", value: project.title }],
    submit: "Save template",
    run: async ({ title }) => {
      await app.planTemplatesApi.saveFrom(project.id, title.trim());
      await changed(app);
      app.say(`Plan template "${title.trim()}" saved on ${area.title}`);
    },
    fallbackFocus: () => app.focusNote(),
  });
}

export function newPlanTemplateDialog(app, area) {
  return formDialog({
    title: `New plan template in "${area.title}"`,
    fields: [{ key: "title", label: "Template name", placeholder: "Substation upgrade" }],
    submit: "Make it",
    run: async ({ title }) => {
      const template = await app.planTemplatesApi.create(area.id, title.trim());
      await changed(app);
      app.showTemplate(template.id);
    },
    fallbackFocus: () => app.focusNote(),
  });
}
