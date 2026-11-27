// The head of a dashboard (the main window). A project or an area: its name, large; its
// health from the status log (a badge, "No update for 16 d" once stale); its Outcome or
// Purpose on one line; and the buttons for the page: Log status / Open in note window ↗ (a
// project), Copy weekly digest / Log area status (an area). A person: their name, job,
// organisation, email and how many projects they are on; the next 1:1 (the next meeting they
// attend), their next on-call week (oncall/) and Start 1:1 notes. The card under it
// (hub-line.js) holds the rest.
//
//   const head = new DashHead(headerElement, { onLog(note), onDigest(note), onEdit(note), onOneOnOne(person) });
//   head.show(ctx, note, body)     note: a project, an area or a person, else the head hides
import { localDay } from "../meetings/meeting-days.js";
import { StatusLogs, firstSentence, healthOf } from "../status/status-model.js";
import { fieldsFor } from "./fields.js";
import { nextTogether } from "../people/one-on-one.js";
import { nextOnCall, nextOnCallText } from "../oncall/oncall-model.js";
import { dayText } from "../ui/dates.js";
import { chip } from "../ui/chip.js";
import { toneOf } from "../ui/chip-tones.js";

export class DashHead {
  constructor(root, { onLog, onDigest, onEdit, onOneOnOne = () => {} }) {
    this.root = root;
    this.handlers = { onLog, onDigest, onEdit, onOneOnOne };
    this.note = null;
  }

  show(ctx, note, body) {
    if (note?.kind === "person") {
      this.showPerson(ctx, note);
      return;
    }
    const shown = Boolean(note) && (note.kind === "project" || note.kind === "area") && ctx.tree.parentId(note.id) === null;
    this.root.hidden = !shown;
    this.note = shown ? note : null;
    if (!shown) return;
    const today = localDay(ctx.today ?? new Date());
    const health = healthOf(ctx.statusLogs ?? new StatusLogs(), note, today);
    const main = element("div", "dash-head__main");
    main.append(element("h1", "dash-head__title", note.title));
    const meta = element("div", "dash-head__meta");
    if (health.key !== "none") meta.append(chip(health.label, toneOf(health.key), { dot: true }));
    if (health.stale) meta.append(element("span", "dash-head__stale", `No update for ${health.age} d`));
    else if (health.never && note.status !== "on_hold") meta.append(element("span", "dash-head__stale dash-head__stale--never", "No status logged yet"));
    const line = outcomeLine(body);
    if (line) meta.append(element("span", "dash-head__outcome", `${fieldsFor(note).main.label}: ${line}`));
    main.append(meta);
    const actions = element("div", "dash-head__actions");
    const project = note.kind === "project";
    const log = button(project ? "Log status" : "Log area status", "L", "Say where it stands: health and a few words (L in the sections)",
      () => this.handlers.onLog(note));
    if (project) {
      log.classList.add("dash-head__button--primary");
      actions.append(log, button("Open in note window ↗", "", "Write its text in the note window", () => this.handlers.onEdit(note)));
    } else {
      const copy = button("Copy weekly digest", "", "The projects' status this week, ready to paste", () => this.handlers.onDigest(note));
      copy.classList.add("dash-head__button--primary");
      actions.append(copy, log);
    }
    if (note.archived_at) log.disabled = true;
    this.root.replaceChildren(main, actions);
  }
}

DashHead.prototype.showPerson = function showPerson(ctx, person) {
  this.root.hidden = false;
  this.note = person;
  const today = localDay(ctx.today ?? new Date());
  const details = ctx.people?.get(person.id) ?? {};
  const projects = (details.hubs ?? []).filter((link) => ctx.tree.get(link.hub_id)?.kind === "project" && !ctx.tree.get(link.hub_id)?.archived_at);
  const main = element("div", "dash-head__main");
  main.append(element("h1", "dash-head__title", person.title));
  const meta = element("div", "dash-head__meta");
  const parts = [details.job, details.org].filter(Boolean);
  if (parts.length) meta.append(element("span", "", parts.join(" · ")));
  if (details.email) meta.append(element("span", "dash-head__email", details.email));
  if (projects.length) meta.append(element("span", "", `on ${projects.length} project${projects.length === 1 ? "" : "s"}`));
  main.append(meta);
  const actions = element("div", "dash-head__actions");
  const next = ctx.meetings ? nextTogether(ctx.tree, ctx.meetings, person.id, today) : null;
  if (next) {
    const when = element("div", "dash-head__next");
    when.append(element("span", "dash-head__next-label", "Next 1:1"),
      element("span", "dash-head__next-when", `${dayText(next.meeting.day, { today })}${next.meeting.time ? `, ${next.meeting.time}` : ""}`));
    actions.append(when);
  }
  const onCall = ctx.onCall ? nextOnCall(ctx.onCall, ctx.tree, person.id, today) : null;
  if (onCall) {
    const when = element("div", `dash-head__oncall${onCall.thisWeek ? " dash-head__oncall--now" : ""}`, nextOnCallText(onCall, today));
    when.title = "From the on-call rota (Week › On call)";
    actions.append(when);
  }
  const start = button("Start 1:1 notes", "", "The next meeting with them, its agenda filled from To raise", () => this.handlers.onOneOnOne(person));
  start.classList.add("dash-head__button--primary");
  actions.append(start);
  this.root.replaceChildren(main, actions);
};

/** The text's first line, plain, for the head ("" when there is none). */
export function outcomeLine(body) {
  const first = String(body ?? "").split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("```"));
  return first ? firstSentence(first.replace(/^#+\s*|^[-*]\s+/, "")) : "";
}

function button(text, key, title, run) {
  const node = element("button", "dash-head__button", text);
  node.type = "button";
  node.title = title;
  if (key) node.append(" ", element("kbd", "dash-head__key", key));
  node.addEventListener("click", run);
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
