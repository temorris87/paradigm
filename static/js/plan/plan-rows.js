// The rows a Gantt chart (static/js/gantt/) draws for a project, an area and a plan template.
// Pure.
//
//   projectRows(tree, plan, projectId, today)   a bar per phase (its milestones on it), then a
//                                               "Milestones" row for the project's own
//   areaRows(tree, plan, areaId, today)         a bar per live project: the span of its plan
//   templateRows(template)                      a template's phases and milestones, in working
//                                               days from 0 (the chart's "offsets" mode)
// Row keys: "phase:ID", "milestones:ID", "project:ID", "item:ID", "items:ID".
import { projectsIn } from "../hubs/hub-areas.js";
import { dayNumber, milestonesOf, phasesOf, projectSpan, projectSlipping, shortDay, slipOf, slipText } from "./plan-model.js";

function mark(plan, { note, milestone }, today, draggable) {
  const slip = slipOf(plan, note.id);
  const done = Boolean(milestone.done_day);
  return {
    key: `milestone:${note.id}`, id: note.id, label: note.title, at: dayNumber(milestone.day), done, draggable,
    late: !done && (milestone.day < today || slip.keepsSlipping),
    detail: [shortDay(milestone.day, today), done ? `reached ${milestone.done_day}` : "", slipText(slip)].filter(Boolean).join(" · "),
  };
}

export function projectRows(tree, plan, projectId, today, { draggable = true } = {}) {
  const milestones = milestonesOf(tree, plan, projectId);
  const rows = phasesOf(tree, plan, projectId).map(({ note, phase }) => {
    const slip = slipOf(plan, note.id);
    return {
      key: `phase:${note.id}`, id: note.id, kind: "phase", label: note.title, draggable,
      start: dayNumber(phase.start), end: dayNumber(phase.end),
      baseline: { start: dayNumber(phase.baseline_start), end: dayNumber(phase.baseline_end) },
      badge: slip.moves ? `${slipText(slip)}${slip.keepsSlipping ? " · keeps slipping" : ""}` : "",
      late: slip.keepsSlipping,
      detail: `${shortDay(phase.start, today)} → ${shortDay(phase.end, today)}`,
      marks: milestones.filter((entry) => entry.phase?.id === note.id).map((entry) => mark(plan, entry, today, draggable)),
    };
  });
  const own = milestones.filter((entry) => entry.phase === null);
  if (own.length) {
    rows.push({ key: `milestones:${projectId}`, id: projectId, kind: "milestone", label: "Milestones", start: NaN, end: NaN,
      marks: own.map((entry) => mark(plan, entry, today, draggable)) });
  }
  return rows;
}

export function areaRows(tree, plan, areaId, today) {
  return projectsIn(tree, areaId).map((project) => {
    const span = projectSpan(tree, plan, project.id);
    const slipping = projectSlipping(tree, plan, project.id);
    return {
      key: `project:${project.id}`, id: project.id, kind: "project", label: project.title, draggable: false,
      start: span ? dayNumber(span.start) : NaN, end: span ? dayNumber(span.end) : NaN,
      muted: project.status === "on_hold",
      late: slipping,
      badge: [project.status === "on_hold" ? "on hold" : "", slipping ? "keeps slipping" : "", span ? "" : "no plan yet"].filter(Boolean).join(" · "),
      detail: span ? `${shortDay(span.start, today)} → ${shortDay(span.end, today)}` : "",
      marks: milestonesOf(tree, plan, project.id).map((entry) => mark(plan, entry, today, false)),
    };
  });
}

export function templateRows(template) {
  const phases = template.items.filter((item) => item.kind === "phase");
  const milestones = template.items.filter((item) => item.kind === "milestone");
  const markOf = (item) => ({ key: `item:${item.id}`, id: item.id, label: item.title, at: item.start, done: false, draggable: true,
    detail: `day ${item.start}` });
  const rows = phases.map((item) => ({
    key: `item:${item.id}`, id: item.id, kind: "phase", label: item.title, draggable: true, start: item.start, end: item.end,
    detail: `days ${item.start}–${item.end}${item.tasks.length ? ` · ${item.tasks.length} tasks` : ""}`,
    marks: milestones.filter((each) => each.phase_id === item.id).map(markOf),
  }));
  const loose = milestones.filter((each) => !phases.some((phase) => phase.id === each.phase_id));
  if (loose.length) rows.push({ key: `items:${template.id}`, id: template.id, kind: "milestone", label: "Milestones", start: NaN, end: NaN, marks: loose.map(markOf) });
  return rows;
}
