// The Today page (the start page, &home), in place of a dashboard: three columns.
//   1. Now: the task block on now (time left, a bar, Done / Open note / +15 min), or the next
//      one; then the day: meetings, blocks, free gaps, and a Log status reminder.
//   2. Up next: first "Follow up today · n" (the follow-ups due today or carried from a day
//      past), then "Then · ranked": one list ranked across every project (today-model.js
//      upNext); its keys are in the window's key-hint bar (layout/view-keys.js), which follows
//      the cursor (onCursor: a follow-up row has keys of its own).
//   3. Who is on call this week (the rota, oncall/), Projects with their latest status, the
//      Inbox, and whether today's calendar is in.
// It draws what today-model.js works out and reports what was asked (actions); the app runs
// it. The whole page is one focus stop: a listbox over Up next, the day, On call, Projects and
// the Inbox, in that order (} and { jump between them), starting on Up next.
//
//   const page = new TodayPage(section, { onOpen(id), onLeave(), today(), actions, onCursor() });
//     actions: { done(taskId, done), schedule(taskId), delegate(taskId), snooze(taskId),
//                answer(questionId), extend(sessionId), log(), fileAll(), onCall(),
//                followedUp(taskId), closeFollowUp(taskId), followUpAgain(taskId) }
//   page.show(ctx); page.focus(); page.activeItem() (the cursor's row's item, or null)
// The Now card's bar moves on once a minute while the page shows.
import { localDay } from "../meetings/meeting-days.js";
import { nextMeeting, inboxNotes } from "./today-facts.js";
import { todayAction } from "./today-keys.js";
import { dayTimeline, nowBlock, projectRows, upNext } from "./today-model.js";
import { hoursText } from "../week/capacity.js";
import { clock } from "../calendar/week-model.js";
import { dayText, whenText } from "../ui/dates.js";
import { allMeetings, shortTitle } from "../meetings/meetings-model.js";
import { cellPeople } from "../oncall/oncall-model.js";
import { chip } from "../ui/chip.js";
import { toneOf } from "../ui/chip-tones.js";

const MINUTE_MS = 60 * 1000;

export class TodayPage {
  constructor(section, { onOpen, onLeave, today = () => new Date(), actions = {}, onCursor = () => {} }) {
    this.section = section;
    this.onCursor = onCursor;
    this.onOpen = onOpen;
    this.onLeave = onLeave;
    this.today = today;
    this.actions = actions;
    this.ctx = null;
    this.options = []; // [{ key, part, item }]
    this.active = 0;
    section.classList.add("today");
    this.list = element("div", "today__grid");
    this.list.id = "today-list";
    this.list.tabIndex = 0;
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Today");
    this.list.addEventListener("keydown", (event) => this.onKey(event));
    this.list.addEventListener("click", (event) => this.onClick(event));
    section.replaceChildren(this.list);
    setInterval(() => {
      if (!section.hidden && this.ctx) this.show(this.ctx);
    }, MINUTE_MS);
  }

  show(ctx) {
    this.ctx = ctx;
    const now = this.today();
    const activeKey = this.options[this.active]?.key;
    const next = upNext(ctx, now);
    const timeline = dayTimeline(ctx, now);
    const projects = projectRows(ctx, now);
    const inbox = inboxNotes(ctx.tree);
    this.options = [];
    // Options are numbered in key order (Up next first), whatever the column they sit in.
    const order = ["next", "day", "oncall", "projects", "inbox"];
    const parts = Object.fromEntries(order.map((part) => [part, []]));
    const register = (part, key, item) => {
      parts[part].push({ key, part, item });
      return parts[part].length - 1;
    };
    const nowColumn = element("div", "today__col today__col--now");
    nowColumn.append(this.nowCard(ctx, now), this.dayPart(ctx, now, timeline, register));
    const nextColumn = element("div", "today__col today__col--next");
    nextColumn.append(this.upNextPart(next, register));
    const sideColumn = element("div", "today__col today__col--side");
    sideColumn.append(this.onCallPart(ctx, now, register), this.projectsPart(projects, register), this.inboxPart(inbox, register),
      this.importChip(ctx));
    this.list.replaceChildren(nowColumn, nextColumn, sideColumn);
    this.options = order.flatMap((part) => parts[part]);
    // Number the nodes now that the order is known.
    const offsets = {};
    order.reduce((at, part) => {
      offsets[part] = at;
      return at + parts[part].length;
    }, 0);
    for (const node of this.list.querySelectorAll("[data-part]")) {
      const index = offsets[node.dataset.part] + Number(node.dataset.at);
      node.id = `today-row-${index}`;
      node.dataset.index = String(index);
    }
    const again = this.options.findIndex((option) => option.key === activeKey);
    this.active = Math.max(0, again);
    this.markActive();
  }

  // ---- column 1 ----

  nowCard(ctx, now) {
    const block = nowBlock(ctx, now);
    if (!block) return this.emptyCard(ctx, now);
    const card = element("section", "today-now");
    card.setAttribute("aria-label", block.next ? "Next" : "Now");
    const head = element("div", "today-now__head");
    head.append(element("span", "today-now__label", block.next ? "NEXT" : "NOW"),
      element("span", "today-now__time", `${clock(block.start)}–${clock(block.end)}`),
      element("span", "today-now__left", block.next ? `in ${hoursText(block.start - minuteOf(now))}` : `${hoursText(block.left)} left`));
    const bar = element("div", "today-now__bar");
    const fill = element("div", "today-now__fill");
    // CSSOM, never style="" (the CSP).
    fill.style.setProperty("--done", String(block.next ? 0 : block.elapsed / Math.max(1, block.end - block.start)));
    bar.append(fill);
    const { task, hub, note } = block.entry;
    const meta = element("div", "today-now__meta");
    meta.append([hub?.title, note.id !== hub?.id ? note.title : ""].filter(Boolean).join(" · "));
    if (task.due && task.due < localDay(now)) {
      const days = Math.round((Date.parse(localDay(now)) - Date.parse(task.due)) / 86400000);
      meta.append(" · ", element("span", "today-now__late", `overdue ${days} d`));
    }
    const buttons = element("div", "today-now__buttons");
    buttons.append(
      cardButton("Done", "Space", "today-now__button--done", () => this.actions.done?.(task.id, !task.done)),
      cardButton("Open note", "o", "", () => this.onOpen(note.id)),
      cardButton("+15 min", "", "", () => this.actions.extend?.(block.session.id)),
    );
    card.append(head, bar, element("h2", `today-now__title${task.done ? " today-now__title--done" : ""}`, task.title), meta, buttons);
    return card;
  }

  emptyCard(ctx, now) {
    const card = element("section", "today-now today-now--empty");
    card.setAttribute("aria-label", "Now");
    card.append(element("span", "today-now__label today-now__label--empty", "NOTHING PLANNED"),
      element("h2", "today-now__title", `${weekdayName(now)} is clear.`));
    const next = ctx.meetings ? nextMeeting(ctx.tree, ctx.meetings, now) : null;
    const due = upNext(ctx, now).filter((item) => item.kind === "task").length;
    const line = element("p", "today-now__meta");
    if (next) line.append(`Next: ${shortTitle(next.note, next.meeting)}, ${whenText(next.meeting, now)}. `);
    if (due) {
      const plan = element("button", "today-now__link", `${due} item${due === 1 ? " is" : "s are"} up next — plan the day`);
      plan.type = "button";
      plan.addEventListener("click", () => this.moveTo(0));
      line.append(plan);
    }
    card.append(line);
    return card;
  }

  dayPart(ctx, now, { capacity, rows }, register) {
    const part = element("section", "today-day");
    part.setAttribute("role", "group");
    const heading = element("h2", "today__heading", dayText(localDay(now), { today: now }));
    heading.id = "today-heading-day";
    part.setAttribute("aria-labelledby", heading.id);
    heading.append(element("span", "today__detail",
      [`${hoursText(capacity.meetingMin)} meetings`, `${hoursText(capacity.focusMin)} focus`, `${hoursText(capacity.freeMin)} free`].join(" · ")));
    part.append(heading);
    if (!rows.length) part.append(element("p", "today__empty", "Nothing on the calendar today"));
    for (const row of rows) {
      const classes = ["today-day__row", `today-day__row--${row.kind}`, row.past && "today-day__row--past",
        row.current && "today-day__row--current", row.muted && "today-day__row--muted"].filter(Boolean).join(" ");
      const node = element("div", classes);
      const title = element("span", "today-day__title");
      if (row.kind === "task") title.append(element("span", "today-day__box", row.done ? "☑" : "☐"), " ");
      title.append(row.title);
      if (row.current && row.kind === "task") title.append(element("span", "today-day__detail", " · now"));
      else if (row.detail) title.append(element("span", "today-day__detail", ` · ${row.detail}`));
      node.append(element("span", "today-day__time", row.time || "—"), title);
      part.append(this.option(node, register("day", row.key, row), "day"));
    }
    return part;
  }

  // ---- column 2 ----

  upNextPart(items, register) {
    const part = element("section", "today-next");
    part.setAttribute("role", "group");
    const heading = element("h2", "today-next__heading", "Up next");
    heading.id = "today-heading-next";
    part.setAttribute("aria-labelledby", heading.id);
    const follow = items.filter((item) => item.group === "followup");
    const ranked = items.filter((item) => item.group !== "followup");
    heading.append(element("span", "today__detail", `ranked across every project · ${ranked.length}`));
    part.append(heading);
    const rows = element("div", "today-next__rows");
    if (!items.length) rows.append(element("p", "today__empty", "Nothing urgent: nothing overdue, due soon or waiting on you."));
    // With no follow-up due, neither label shows: Up next is the ranked list alone.
    if (follow.length) rows.append(element("h3", "today-next__group", `Follow up today · ${follow.length}`));
    for (const item of follow) rows.append(this.upNextRow(item, register));
    if (follow.length && ranked.length) rows.append(element("h3", "today-next__group", "Then · ranked"));
    for (const item of ranked) rows.append(this.upNextRow(item, register));
    part.append(rows);
    return part;
  }

  upNextRow(item, register) {
    const node = element("div", `today-next__row today-next__row--${item.reasonKind}`);
    const title = element("span", "today-next__title", item.title);
    if (item.detail) title.append(element("span", "today-next__detail", ` · ${item.detail}`));
    const glyph = element("span", "today-next__glyph", item.glyph);
    // A follow-up's → opens Followed up… (onClick reads data-action).
    if (item.kind === "followup") {
      glyph.classList.add("today-next__glyph--action");
      glyph.dataset.action = "done";
      glyph.title = "Followed up… (Space)";
    }
    node.append(chip(item.reason.toUpperCase(), toneOf(item.reasonKind)), glyph,
      title, element("span", "today-next__estimate", item.estimate || ""),
      element("span", `today-next__place${item.placed ? " today-next__place--placed" : ""}`, item.place));
    return this.option(node, register("next", item.key, item), "next");
  }

  // ---- column 3 ----

  /** This week's rota: a row per name ("Primary · Tom Reyes"); none: nothing shows. */
  onCallPart({ onCall, tree }, now, register) {
    const part = element("section", "today-oncall");
    const entries = onCall?.of(localDay(now)) ?? [];
    part.hidden = !entries.length;
    if (!entries.length) return part;
    part.setAttribute("role", "group");
    const heading = element("h2", "today__heading", "On call this week");
    heading.id = "today-heading-oncall";
    part.setAttribute("aria-labelledby", heading.id);
    part.append(heading);
    for (const { role, name } of entries) {
      for (const { text, person } of cellPeople(tree, name)) {
        const node = element("div", "today-oncall__row");
        node.append(element("span", "today-oncall__role", role), element("span", person ? "today-oncall__name" : "today-oncall__name today-oncall__name--text", person?.title ?? text));
        // A name not in People opens the rota instead.
        const item = person ? { id: person.id, kind: "person" } : { id: null, kind: "oncall" };
        part.append(this.option(node, register("oncall", `oncall:${role}:${text}`, item), "oncall"));
      }
    }
    return part;
  }

  projectsPart(projects, register) {
    const part = element("section", "today-projects");
    part.setAttribute("role", "group");
    const heading = element("h2", "today__heading", "Projects");
    heading.id = "today-heading-projects";
    part.setAttribute("aria-labelledby", heading.id);
    heading.append(element("span", "today__detail", "latest status"));
    part.append(heading);
    if (!projects.length) part.append(element("p", "today__empty", "No live projects"));
    for (const row of projects) {
      const node = element("div", `today-projects__row${row.health === "on_hold" ? " today-projects__row--hold" : ""}`);
      const top = element("div", "today-projects__top");
      top.append(element("span", "today-projects__title", row.title));
      if (row.label !== "—") top.append(chip(row.label.toUpperCase(), toneOf(row.health), { dot: true }));
      const line = element("div", "today-projects__line");
      if (row.stale && row.health !== "on_hold") {
        line.append(element("span", "today-projects__dot", "● "),
          row.never ? "No status yet · " : `No update for ${row.age} d · `, element("span", "today-projects__log", "log one"));
      } else if (row.line) {
        line.append(row.line, element("span", "today-projects__day", ` · ${dayText(row.day, { today: this.today() })}`));
      }
      node.append(top, line);
      part.append(this.option(node, register("projects", `project:${row.id}`, { id: row.id, kind: "project", stale: row.stale }), "projects"));
    }
    return part;
  }

  inboxPart(notes, register) {
    const part = element("section", "today-inbox");
    part.setAttribute("role", "group");
    const heading = element("h2", "today__heading", "Inbox");
    heading.id = "today-heading-inbox";
    part.setAttribute("aria-labelledby", heading.id);
    heading.append(element("span", "today__detail", String(notes.length)));
    if (notes.length && this.actions.fileAll) {
      const file = element("button", "today__file-all", "File all… ");
      file.type = "button";
      file.tabIndex = -1;
      file.title = "Go through the Inbox one note at a time (f)";
      file.append(element("kbd", "key", "f"));
      file.addEventListener("click", (event) => {
        event.stopPropagation();
        this.actions.fileAll();
      });
      heading.append(file);
    }
    part.append(heading);
    if (!notes.length) part.append(element("p", "today__empty", "Inbox is empty"));
    for (const note of notes) {
      part.append(this.option(element("div", "today-inbox__row", note.title), register("inbox", `note:${note.id}`, { id: note.id, kind: "note" }), "inbox"));
    }
    return part;
  }

  importChip({ importStatus, tree, meetings }) {
    const chip = element("p", "today-import");
    chip.hidden = !importStatus;
    if (!importStatus) return chip;
    const done = Boolean(importStatus.imported_today);
    const count = meetings ? meetingsThisWeek(tree, meetings, this.today()) : 0;
    chip.append(element("span", `today-import__dot${done ? " today-import__dot--done" : ""}`, "● "),
      done ? `Calendar imported today · ${count} meeting${count === 1 ? "" : "s"} this week`
        : "Today's calendar isn't imported · Week (g w) to import");
    return chip;
  }

  // ---- the listbox ----

  option(node, at, part) {
    node.setAttribute("role", "option");
    node.dataset.part = part;
    node.dataset.at = String(at);
    return node;
  }

  onClick(event) {
    const node = event.target.closest?.("[role=option]");
    if (!node) return;
    this.moveTo(Number(node.dataset.index));
    this.focus();
    this.run(event.target.closest?.("[data-action]")?.dataset.action ?? "open");
  }

  onKey(event) {
    const action = todayAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const last = this.options.length - 1;
    switch (action) {
      case "next": return this.moveTo(Math.min(this.active + 1, last));
      case "previous": return this.moveTo(Math.max(this.active - 1, 0));
      case "first": return this.moveTo(0);
      case "last": return this.moveTo(last);
      case "nextSection": return this.moveTo(this.partStart(1));
      case "previousSection": return this.moveTo(this.partStart(-1));
      case "leave": return this.onLeave();
      case "pending": return undefined;
      case "fileAll": return this.actions.fileAll?.();
      default: return this.run(action);
    }
  }

  /** What a key or a click asks of the active row. */
  run(action) {
    const option = this.options[this.active];
    const item = option?.item;
    if (!item) return undefined;
    const taskId = item.taskId;
    switch (action) {
      case "open":
        if (item.kind === "suggest") return this.actions.log?.();
        if (item.kind === "oncall") return this.actions.onCall?.();
        return item.id !== null && item.id !== undefined ? this.onOpen(item.id) : undefined;
      case "done":
        if (item.questionId) return this.actions.answer?.(item.questionId);
        // A follow-up isn't ticked: it is logged (closed, or followed up again).
        if (item.kind === "followup") return this.actions.followedUp?.(taskId);
        return taskId ? this.actions.done?.(taskId, !(item.done ?? false)) : undefined;
      case "closeFollowUp": return item.kind === "followup" ? this.actions.closeFollowUp?.(taskId) : undefined;
      case "followUpAgain": return item.kind === "followup" ? this.actions.followUpAgain?.(taskId) : undefined;
      // A follow-up is someone else's work: nothing of mine to place.
      case "schedule": return taskId && item.kind !== "followup" ? this.actions.schedule?.(taskId) : undefined;
      case "delegate": return taskId ? this.actions.delegate?.(taskId) : undefined;
      case "snooze": return taskId ? this.actions.snooze?.(taskId) : undefined;
      default: return undefined;
    }
  }

  partStart(direction) {
    const here = this.options[this.active]?.part;
    const starts = this.options.map((option, index) => index)
      .filter((index) => index === 0 || this.options[index - 1].part !== this.options[index].part);
    if (here === undefined) return this.active;
    if (direction > 0) return starts.find((index) => index > this.active) ?? this.active;
    return starts.filter((index) => index < this.active).pop() ?? this.active;
  }

  moveTo(index) {
    if (index < 0 || index >= this.options.length) return;
    this.active = index;
    this.markActive();
  }

  activeItem() {
    return this.options[this.active]?.item ?? null;
  }

  markActive() {
    const nodes = [...this.list.querySelectorAll("[role=option]")];
    for (const node of nodes) node.setAttribute("aria-selected", String(Number(node.dataset.index) === this.active));
    const node = nodes.find((each) => Number(each.dataset.index) === this.active);
    if (node) {
      this.list.setAttribute("aria-activedescendant", node.id);
      node.scrollIntoView?.({ block: "nearest" });
    } else {
      this.list.removeAttribute("aria-activedescendant");
    }
    this.onCursor();
  }

  focus() {
    this.list.focus();
  }
}

function meetingsThisWeek(tree, meetings, now) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const first = localDay(monday);
  const last = localDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
  return allMeetings(tree, meetings).filter(({ meeting, archived }) => !archived && !meeting.cancelled && meeting.day >= first && meeting.day <= last).length;
}

function minuteOf(now) {
  return now.getHours() * 60 + now.getMinutes();
}

function weekdayName(now) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
}

function cardButton(text, key, className, run) {
  const node = element("button", `today-now__button ${className}`.trim(), text);
  node.type = "button";
  node.tabIndex = -1;
  if (key) node.append(" ", element("kbd", "key", key));
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    run();
  });
  return node;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
