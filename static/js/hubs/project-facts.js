// A project's state, due date and what is coming up, as short texts for its card, an area's
// Projects section and Home. Keep the statuses in step with paradigm/notes/hubs.py. Pure.
//
//   PROJECT_STATUSES               [{ key, label }] in the menu's order
//   statusText(project)            "on hold", or "" while active
//   dueText(project, today)        "due Tue 2026-12-15", "overdue since ...", or ""
//   isOverdue(project, today)
//   projectFactsText(ctx, project) "due ... · 2 open questions · next Mon 2026-11-30 10:00"
// A project's page (its head and facts row):
//   dueFact(project, today)        "Fri 11 Dec · in 15 days", "Fri 11 Dec · today", "… · 3 days late", or ""
//   milestoneFact(tree, plan, project, today)   "Pilot go-live · Mon 7 Dec", or ""
//   HEAD_HEALTH                    health key -> { label, tone } of the head's chip (Figma's words)
//   headStatus(logs, project, today)   { label, tone, text, age } of the newest status log, or null
//   initials(name)                 "BO" for "Ben Ortiz"
//   outcomeLine(body)              the text's first line, plain ("" when there is none)
import { projectFacts } from "../today/today-facts.js";
import { localDay, whenText } from "../meetings/meeting-days.js";
import { daysBetween, nextMilestone } from "../plan/plan-model.js";
import { firstSentence } from "../status/status-model.js";
import { daysAgo, dayText } from "../ui/dates.js";

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

/** A day string from a Date or a day string. */
function dayString(today) {
  return typeof today === "string" ? today : localDay(today);
}

export function dueFact(project, today = new Date()) {
  if (!project.due) return "";
  const day = dayString(today);
  const days = daysBetween(day, project.due);
  const away = days === 0 ? "today" : days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : `${-days} day${days === -1 ? "" : "s"} late`;
  return `${dayText(project.due, { today: day })} · ${away}`;
}

export function milestoneFact(tree, plan, project, today = new Date()) {
  const next = plan ? nextMilestone(tree, plan, project.id) : null;
  return next ? `${next.note.title} · ${dayText(next.milestone.day, { today: dayString(today) })}` : "";
}

// The head's chip says it as Figma does: "Off track" where the log says blocked.
export const HEAD_HEALTH = Object.freeze({
  on_track: { label: "On track", tone: "success" },
  at_risk: { label: "At risk", tone: "caution" },
  blocked: { label: "Off track", tone: "danger" },
  on_hold: { label: "On hold", tone: "neutral" },
});

export function headStatus(logs, project, today = new Date()) {
  const entry = logs?.latest(project.id) ?? null;
  if (!entry) return null;
  const health = HEAD_HEALTH[entry.health] ?? HEAD_HEALTH.on_track;
  return { ...health, text: firstSentence(entry.text), age: daysAgo(entry.day, dayString(today)) };
}

export function initials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words[words.length - 1][0]];
  return letters.join("").toUpperCase();
}

export function outcomeLine(body) {
  const first = String(body ?? "").split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("```"));
  return first ? firstSentence(first.replace(/^#+\s*|^[-*]\s+/, "")) : "";
}
