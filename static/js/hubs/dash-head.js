// The head of a dashboard (the main window). A project (Figma's): its name; under it the
// health chip, the last status log's text and its age ("No status yet · L to log" with none);
// the buttons Log status L, Open in note window ↗, History g h and ··· (the note menu); then
// the facts row: Due, Next milestone, Area, People, Time code ("—" when empty; each opens what
// changes it). An area: its name, its health from the status log (a badge, "No update for
// 16 d" once stale), its Purpose on one line, Copy weekly digest / Log area status. A person:
// their initials in a circle, name, "Role · Org" and email (a link); on the right NEXT 1:1
// (still to come: people/one-on-one.js), "Before that: ..." when another meeting with them
// comes first, their next on-call week (oncall/) and Start 1:1 notes. The card under it
// (hub-line.js) holds the rest.
//
//   const head = new DashHead(headerElement, { onLog(note), onDigest(note), onEdit(note), onOneOnOne(person),
//     onHistory(project), onMenu(button), controls: () => hub-line-controls });
//   head.show(ctx, note, body)     note: a project, an area or a person, else the head hides
import { localDay } from "../meetings/meeting-days.js";
import { StatusLogs, healthOf } from "../status/status-model.js";
import { fieldsFor } from "./fields.js";
import { beforeThat, nextOneOnOne, soonDay } from "../people/one-on-one.js";
import { shortTitle } from "../meetings/meetings-model.js";
import { avatar } from "../ui/avatar.js";
import { nextOnCall, nextOnCallText } from "../oncall/oncall-model.js";
import { dayText, timeSpan } from "../ui/dates.js";
import { chip } from "../ui/chip.js";
import { toneOf } from "../ui/chip-tones.js";
import { NO_CONTROLS } from "./hub-line-controls.js";
import { areaOf } from "./hub-areas.js";
import { HEAD_HEALTH, dueFact, headStatus, initials, milestoneFact, outcomeLine } from "./project-facts.js";
import { peopleOn } from "../people/people-model.js";

export { outcomeLine };

// Avatars shown in the facts row before "+ Add"; the rest are counted.
const MAX_AVATARS = 5;

export class DashHead {
  constructor(root, { onLog, onDigest, onEdit, onOneOnOne = () => {}, onHistory = () => {}, onMenu = () => {}, controls = () => NO_CONTROLS }) {
    this.root = root;
    this.handlers = { onLog, onDigest, onEdit, onOneOnOne, onHistory, onMenu };
    this.controls = controls;
    this.note = null;
  }

  show(ctx, note, body) {
    if (note?.kind === "person") {
      this.showPerson(ctx, note);
      return;
    }
    const shown = Boolean(note) && (note.kind === "project" || note.kind === "area") && ctx.tree.parentId(note.id) === null;
    this.root.hidden = !shown;
    this.root.classList.toggle("dash-head--project", shown && note.kind === "project");
    this.note = shown ? note : null;
    if (!shown) return;
    if (note.kind === "project") {
      this.showProject(ctx, note);
      return;
    }
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
  this.root.classList.remove("dash-head--project");
  this.note = person;
  const now = ctx.today ?? new Date();
  const today = localDay(now);
  const details = ctx.people?.get(person.id) ?? {};
  const main = element("div", "dash-head__main dash-head__main--person");
  const who = element("div", "dash-head__who");
  who.append(element("h1", "dash-head__title dash-head__title--person", person.title));
  const meta = element("div", "dash-head__meta");
  const parts = [details.job, details.org].filter(Boolean);
  if (parts.length) meta.append(element("span", "", parts.join(" · ")));
  if (details.email) {
    const email = element("a", "dash-head__email", details.email);
    email.href = `mailto:${details.email}`;
    meta.append(email);
  }
  who.append(meta);
  main.append(avatar(person.title, "dash-head__avatar"), who);
  const actions = element("div", "dash-head__actions dash-head__actions--person");
  const meets = ctx.meetings ? personMeetings(ctx, person, now) : { next: null, before: null };
  const when = element("div", "dash-head__next");
  when.append(element("span", "dash-head__next-label", "Next 1:1"),
    element("span", "dash-head__next-when", meets.next ? meetingWhen(meets.next.meeting, today) : "None planned"));
  if (meets.before) {
    const { note, meeting } = meets.before;
    when.append(element("span", "dash-head__before",
      `Before that: ${shortTitle(note, meeting)}, ${soonDay(meeting.day, today)}${meeting.time ? ` ${meeting.time}` : ""}`));
  }
  actions.append(when);
  const onCall = ctx.onCall ? nextOnCall(ctx.onCall, ctx.tree, person.id, today) : null;
  if (onCall) {
    const line = element("div", `dash-head__oncall${onCall.thisWeek ? " dash-head__oncall--now" : ""}`, nextOnCallText(onCall, today));
    line.title = "From the on-call rota (Week › On call)";
    actions.append(line);
  }
  const start = button("Start 1:1 notes", "", "The next 1:1 with them, its agenda filled from To raise (n)", () => this.handlers.onOneOnOne(person));
  start.classList.add("dash-head__button--primary");
  actions.append(start);
  this.root.replaceChildren(main, actions);
};

DashHead.prototype.showProject = function showProject(ctx, project) {
  const today = localDay(ctx.today ?? new Date());
  const main = element("div", "dash-head__main");
  main.append(element("h1", "dash-head__title", project.title));
  const meta = element("div", "dash-head__meta dash-head__status");
  const status = headStatus(ctx.statusLogs ?? new StatusLogs(), project, today);
  const held = project.status === "on_hold" ? HEAD_HEALTH.on_hold : null;
  if (status) {
    meta.append(chip((held ?? status).label, (held ?? status).tone, { dot: true }),
      element("span", "dash-head__status-text", status.text), element("span", "dash-head__age", `· ${status.age}`));
  } else {
    if (held) meta.append(chip(held.label, held.tone, { dot: true }));
    meta.append(element("span", "dash-head__stale dash-head__stale--never", "No status yet · L to log"));
  }
  main.append(meta);
  const actions = element("div", "dash-head__actions");
  const log = button("Log status", "L", "Say where it stands: health and a few words", () => this.handlers.onLog(project));
  log.classList.add("dash-head__button--primary");
  if (project.archived_at) log.disabled = true;
  const menu = button("···", "", "What you can do with this project", (event) => this.handlers.onMenu(event.currentTarget));
  menu.setAttribute("aria-haspopup", "menu");
  menu.setAttribute("aria-label", "Project actions");
  actions.append(log, button("Open in note window ↗", "", "Write its text in the note window", () => this.handlers.onEdit(project)),
    button("History", "g h", "Done tasks, earlier meetings, every decision and answer, by week", () => this.handlers.onHistory(project)),
    menu);
  this.root.replaceChildren(main, actions, this.facts(ctx, project, today));
};

/** DUE, NEXT MILESTONE, AREA, PEOPLE, TIME CODE: small caps over each value ("—" when empty). */
DashHead.prototype.facts = function facts(ctx, project, today) {
  const controls = this.controls();
  const row = element("dl", "dash-facts");
  const fact = (label, value, title, run) => {
    const box = element("div", "dash-facts__fact");
    const body = element("dd", "dash-facts__value");
    if (value instanceof Node) body.append(value);
    else if (run) body.append(factButton(value || "—", title, run));
    else body.textContent = value || "—";
    box.append(element("dt", "dash-facts__label", label), body);
    row.append(box);
  };
  fact("Due", dueFact(project, today), "Change the due date", () => controls.due(project));
  fact("Next milestone", milestoneFact(ctx.tree, ctx.plan, project, today));
  const area = areaOf(ctx.tree, project.id);
  fact("Area", area?.title ?? "", "Put this project in an area", () => controls.area(project));
  fact("People", this.avatars(ctx, project, controls));
  const code = project.time_code || (area?.time_code ? `${area.time_code} (from area)` : "");
  fact("Time code", code, "The timesheet code its time is booked to", () => controls.timeCode(project));
  return row;
};

DashHead.prototype.avatars = function avatars(ctx, project, controls) {
  const box = element("span", "dash-facts__people");
  const people = ctx.people ? peopleOn(ctx.tree, ctx.people, project).filter((each) => !each.archived) : [];
  for (const { person } of people.slice(0, MAX_AVATARS)) {
    const avatar = element("span", "dash-facts__avatar", initials(person.title));
    avatar.title = person.title;
    box.append(avatar);
  }
  if (people.length > MAX_AVATARS) box.append(element("span", "dash-facts__more", `+${people.length - MAX_AVATARS}`));
  box.append(factButton("+ Add", "Add a person to this project", () => controls.addPerson(project)));
  return box;
};

function factButton(text, title, run) {
  const node = element("button", "dash-facts__button", text);
  node.type = "button";
  node.title = title;
  node.addEventListener("click", run);
  return node;
}

/** The next 1:1 still to come, and another meeting with them that comes first. */
function personMeetings(ctx, person, now) {
  return { next: nextOneOnOne(ctx.tree, ctx.meetings, person.id, now), before: beforeThat(ctx.tree, ctx.meetings, person.id, now) };
}

/** "Tue 1 Dec · 10:00–10:30" */
function meetingWhen(meeting, today) {
  const time = timeSpan(meeting.time, meeting.end_time);
  return [dayText(meeting.day, { today }), time].filter(Boolean).join(" · ");
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
