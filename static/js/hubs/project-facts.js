// A project's state, due date and what is coming up, as short texts for its card, an area's
// Projects section and Home. Keep the statuses in step with paradigm/notes/hubs.py. Pure.
//
//   PROJECT_STATUSES               [{ key, label }] in the menu's order
//   statusText(project)            "on hold", or "" while active
//   dueText(project, today)        "due Tue 2026-12-15", "overdue since ...", or ""
//   isOverdue(project, today)
//   projectFactsText(ctx, project) "due ... · 2 open questions · next Mon 2026-11-30 10:00"
import { projectFacts } from "../today/today-facts.js";
import { localDay, whenText } from "../meetings/meeting-days.js";

export const PROJECT_STATUSES = [
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On hold" },
];

export function statusLabel(project) {
  return (PROJECT_STATUSES.find((each) => each.key === project.status) ?? PROJECT_STATUSES[0]).label;
}

export function statusText(project) {
  return project.status === "on_hold" ? "on hold" : "";
}

export function isOverdue(project, today = new Date()) {
  return Boolean(project.due) && project.due < localDay(today);
}

export function dueText(project, today = new Date()) {
  if (!project.due) return "";
  const when = whenText({ day: project.due, time: "" });
  return isOverdue(project, today) ? `overdue since ${when}` : `due ${when}`;
}

export function projectFactsText(ctx, project) {
  const today = ctx.today ?? new Date();
  const { openQuestions: open, next } = projectFacts(ctx.tree, ctx.meetings, ctx.records, project.id, today);
  return [
    dueText(project, today),
    open && (open === 1 ? "1 open question" : `${open} open questions`),
    next && `next ${whenText(next)}`,
  ].filter(Boolean).join(" · ");
}
