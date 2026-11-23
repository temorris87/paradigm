// Status logs read together with the notes tree: dated entries on a project or an area
// saying where it stands (/api/status_logs). The newest entry is the hub's health; one older
// than staleDays is stale. Pure.
//
//   const logs = new StatusLogs(list, staleDays);
//   logs.of(noteId)                    its entries, newest first
//   logs.latest(noteId)                the newest, or null
//   HEALTHS                            [{ key, label, word }]: on track, at risk, blocked
//   healthOf(logs, note, today)        { key, label, entry, stale, age }: key on_track |
//                                      at_risk | blocked | on_hold (a project on hold, whatever
//                                      its log says) | none (nothing logged yet); age: days
//                                      since the newest entry (null with none)
//   firstSentence(text)                the first sentence (or line) of an entry, plain
//   sinceLastLog(ctx, hub, today)      [{ text }]: what happened since its last entry: date
//                                      moves, decisions made, tasks done (Log status offers them)
//   digest(ctx, area, today)           the area's weekly digest as Markdown
//   digestHtml(markdown)               the same as simple HTML, for the clipboard
import { escapeHtml } from "../markdown/escape.js";
import { projectsIn } from "../hubs/hub-areas.js";
import { daysBetween, phasesOf, milestonesOf, shortDay } from "../plan/plan-model.js";
import { isOpen, recordsOn } from "../records/records-model.js";
import { taskEntries } from "../tasks/tasks-model.js";
import { dayText } from "../ui/dates.js";

export const HEALTHS = [
  { key: "on_track", label: "On track", word: "on track" },
  { key: "at_risk", label: "At risk", word: "at risk" },
  { key: "blocked", label: "Blocked", word: "blocked" },
];
const LABELS = { on_track: "On track", at_risk: "At risk", blocked: "Blocked", on_hold: "On hold", none: "—" };
export const DEFAULT_STALE_DAYS = 14;

export class StatusLogs {
  constructor(list = [], staleDays = DEFAULT_STALE_DAYS) {
    this.staleDays = staleDays;
    this.byNote = new Map();
    const newest = [...list].sort((a, b) => b.day.localeCompare(a.day) || b.id - a.id);
    for (const entry of newest) {
      if (!this.byNote.has(entry.note_id)) this.byNote.set(entry.note_id, []);
      this.byNote.get(entry.note_id).push(entry);
    }
  }

  of(noteId) {
    return this.byNote.get(noteId) ?? [];
  }

  latest(noteId) {
    return this.of(noteId)[0] ?? null;
  }

  get size() {
    return [...this.byNote.values()].reduce((sum, list) => sum + list.length, 0);
  }
}

/** "today" as a day string. */
function dayOfToday(today) {
  if (typeof today === "string") return today;
  const date = today ?? new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function healthLabel(key) {
  return LABELS[key] ?? LABELS.none;
}

export function healthOf(logs, note, today) {
  const entry = logs.latest(note.id);
  const age = entry ? daysBetween(entry.day, dayOfToday(today)) : null;
  // An archived hub isn't kept up to date any more: never stale.
  const stale = !note.archived_at && note.status !== "on_hold" && (entry === null || age >= logs.staleDays);
  const key = note.status === "on_hold" ? "on_hold" : entry?.health ?? "none";
  return { key, label: healthLabel(key), entry, stale: stale && entry !== null, age, never: entry === null };
}

export function firstSentence(text) {
  const plain = String(text ?? "").replace(/[*_`#>[\]]/g, "").replace(/\s+/g, " ").trim();
  const match = /^(.+?[.!?])(\s|$)/.exec(plain);
  return match ? match[1] : plain;
}

export function sinceLastLog(ctx, hub, today) {
  const last = ctx.statusLogs?.latest(hub.id)?.day ?? "";
  const after = (day) => Boolean(day) && day > last;
  const lines = [];
  // Date moves of its phases and milestones (an area: its projects').
  const projects = hub.kind === "area" ? projectsIn(ctx.tree, hub.id) : [hub];
  for (const project of projects) {
    const planned = [...phasesOf(ctx.tree, ctx.plan, project.id).map(({ note }) => note),
      ...milestonesOf(ctx.tree, ctx.plan, project.id).map(({ note }) => note)];
    for (const note of planned) {
      for (const change of ctx.plan.changesOf(note.id)) {
        if (!after(change.changed_at?.slice(0, 10)) || change.field === "start") continue;
        const days = daysBetween(change.old, change.new);
        const shift = days > 0 ? `+${days} d` : `${days} d`;
        lines.push({ text: `${note.title} moved ${shift}${change.reason ? `: ${change.reason}` : ""}` });
      }
    }
  }
  for (const { note, record } of recordsOn(ctx.tree, ctx.records, hub, "decision")) {
    if (after(record.day)) lines.push({ text: `Decided: ${note.title}` });
  }
  for (const { note, record } of recordsOn(ctx.tree, ctx.records, hub, "question")) {
    if (after(record.answered)) lines.push({ text: `Answered: ${note.title}` });
  }
  const scope = new Set([hub.id, ...ctx.tree.inOrder(hub.id).map((note) => note.id)]);
  const done = taskEntries(ctx.tree, ctx.tasks).filter((entry) => entry.depth === 0 && entry.task.done
    && after(entry.task.done_day) && scope.has(entry.task.note_id));
  if (done.length === 1) lines.push({ text: `Done: ${done[0].task.title}` });
  else if (done.length > 1) lines.push({ text: `${done.length} tasks done` });
  return lines;
}

/** The Friday ending today's week ("w/e"). */
function weekEnd(today) {
  const day = dayOfToday(today);
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const ahead = (5 - weekday + 7) % 7;
  const friday = new Date(Date.UTC(y, m - 1, d + ahead));
  return friday.toISOString().slice(0, 10);
}

export function digest(ctx, area, today) {
  const end = weekEnd(today);
  const monday = new Date(`${end}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - 4);
  const start = monday.toISOString().slice(0, 10);
  const lines = [`## ${area.title} — w/e ${dayText(end, { today: dayOfToday(today) })}`];
  for (const project of projectsIn(ctx.tree, area.id)) {
    const health = healthOf(ctx.statusLogs, project, today);
    const words = health.key === "none" ? "no status yet" : health.label.toLowerCase();
    const said = health.entry ? ` ${firstSentence(health.entry.text)}` : "";
    lines.push(`- **${project.title}** — ${words}.${said}`);
  }
  const hubs = [area, ...projectsIn(ctx.tree, area.id)];
  const decided = hubs.flatMap((hub) => recordsOn(ctx.tree, ctx.records, hub, "decision"))
    .filter(({ record }) => record.day >= start && record.day <= end).map(({ note }) => note.title);
  const open = hubs.flatMap((hub) => recordsOn(ctx.tree, ctx.records, hub, "question"))
    .filter(({ record, archived }) => isOpen(record) && !archived).map(({ note }) => note.title);
  if (decided.length) lines.push(`Decisions: ${decided.join("; ")}`);
  if (open.length) lines.push(`Open: ${open.join("; ")}`);
  return lines.join("\n");
}

export function digestHtml(markdown) {
  const inline = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const out = [];
  let list = false;
  for (const line of markdown.split("\n")) {
    const item = /^- (.*)$/.exec(line);
    if (item && !list) out.push("<ul>");
    if (!item && list) out.push("</ul>");
    list = Boolean(item);
    if (item) out.push(`<li>${inline(item[1])}</li>`);
    else if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("");
}

export { shortDay };
