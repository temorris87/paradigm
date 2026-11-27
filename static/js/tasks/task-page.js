// A task's own page, in the main window (?note=HUB&task=ID), over its note's dashboard: the
// breadcrumb (the hub › each parent task › this task), the head (box, title, one line of
// facts, its notes rendered), then its subtasks as a table, Subtask | Notes: the left column a
// tree (each box under the start of its parent's title), the right that subtask's own notes.
// Under them its Emails (task-emails.js), and the page takes .msg files dropped on it.
// One focus stop: a listbox whose first row is the head, its emails last. Its keys:
// task-page-keys.js. Notes are edited through Edit… only; an archived note's task is read-only.
//
//   const page = new TaskPage(section, { app: () => notesApp, onLeave(), emailsApi? });
//   page.attach()       :attach: the file picker for .msg files (throws when read-only)
//   page.show(ctx)      ctx.tree, ctx.tasks, ctx.trash, ctx.taskId, ctx.taskNoteId, ctx.today
//   page.focus()
//
//   headFacts(ctx, task)            [{ text, noteId? }]: the head's line (pure)
//   rowFacts(ctx, task)             a subtask's "due ... · → Name" (pure)
//   goneReason(ctx, last)           "trashed" when its note went to the Trash, else "gone"; never
//                                   drawn (a reload), the URL's note (ctx.taskNoteId) tells (pure)
import { renderMarkdown } from "../markdown/index.js";
import { hubOf, isArchived } from "../notes/hub-groups.js";
import { dayText } from "../ui/dates.js";
import { drawRendered, followNoteLinks } from "../ui/rendered-text.js";
import { delegateDialog, editTaskDialog, newTaskDialog, removeTaskDialog, setTaskDone, takeBack } from "./task-commands.js";
import { estimateText, moveTarget, taskTree } from "./tasks-model.js";
import { taskPageAction } from "./task-page-keys.js";
import { TaskEmails } from "./task-emails.js";

// The deepest indent drawn: a task has at most 4 levels under it (MAX_TASK_DEPTH).
const MAX_INDENT = 4;

// A row's key, kept across redraws: a task's id, or an email's.
const rowKey = (row) => (row.email ? `email-${row.email.id}` : `task-${row.task.id}`);

export class TaskPage {
  constructor(section, { app, onLeave, emailsApi = null }) {
    this.section = section;
    this.app = app;
    this.onLeave = onLeave;
    this.task = null;
    this.rows = [];
    this.active = 0;
    this.selectedKey = null; // the selected row's rowKey (kept across redraws)
    this.last = null; // { id, notes }: the task last drawn and its note's line up the tree
    this.readOnly = false;
    section.classList.add("task-page");
    section.tabIndex = -1;
    this.crumbs = element("nav", "task-page__crumbs");
    this.crumbs.setAttribute("aria-label", "Where this task is");
    this.body = element("div", "task-page__body");
    this.body.setAttribute("role", "listbox");
    this.body.setAttribute("aria-label", "The task and its subtasks");
    this.body.tabIndex = 0;
    section.replaceChildren(this.crumbs, this.body);
    section.addEventListener("keydown", (event) => this.onKey(event));
    this.body.addEventListener("click", (event) => this.onClick(event));
    followNoteLinks(this.body, (id) => this.run(this.app().open(id)));
    // No emails API (tests of other parts): the section stays empty and nothing is fetched.
    this.emails = new TaskEmails({ api: emailsApi, app, redraw: () => this.redrawEmails() });
    if (emailsApi) this.emails.listenForDrops(section, { accepts: () => Boolean(this.task), refusal: () => this.dropRefusal() });
  }

  redrawEmails() {
    if (this.task && this.ctx) this.show(this.ctx);
  }

  /** Why a drop (or :attach) can't attach here: an archived task is read-only, as its keys are. */
  dropRefusal() {
    return this.readOnly ? `E: "${this.task.title}" is on an archived note: read-only` : "";
  }

  attach() {
    if (!this.task) throw new Error("E: open the task's page to attach");
    const refusal = this.dropRefusal();
    if (refusal) throw new Error(refusal);
    this.emails.pick();
  }

  run(promise) {
    return this.app().guard(promise);
  }

  show(ctx) {
    this.ctx = ctx;
    const task = ctx.tasks?.get(ctx.taskId) ?? null;
    if (!task || !ctx.tree.has(task.note_id)) return this.showGone(ctx);
    // Another task's page starts on its head: the last page's row means nothing here.
    if (task.id !== this.last?.id) {
      this.active = 0;
      this.selectedKey = null;
    }
    this.emails.sync(task.id);
    this.task = task;
    this.last = { id: task.id, notes: [task.note_id, ...ctx.tree.ancestors(task.note_id)] };
    this.readOnly = isArchived(ctx.tree, task.note_id);
    const tasks = [{ task, depth: 0, head: true }, ...taskTree(ctx.tasks, task.id)];
    this.emails.first = tasks.length;
    this.rows = [...tasks, ...this.emails.rows()];
    const kept = this.rows.findIndex((row) => rowKey(row) === this.selectedKey);
    this.active = kept >= 0 ? kept : Math.min(this.active, this.rows.length - 1);
    this.selectedKey = rowKey(this.rows[this.active]);
    this.drawCrumbs(ctx, task);
    const hadFocus = this.section.contains(document.activeElement);
    this.body.replaceChildren(this.head(ctx, task), ...this.table(ctx));
    if (!this.readOnly) {
      const add = element("button", "task-page__add", "+ Add subtask");
      add.type = "button";
      add.title = "A subtask of this task (a adds one under the selected row)";
      add.tabIndex = -1;
      add.dataset.action = "addDirect";
      this.body.append(add);
    }
    this.body.append(this.emails.draw((node, index) => this.option(node, index), { readOnly: this.readOnly, today: ctx.today ?? new Date() }));
    for (const notes of this.body.querySelectorAll(".task-page__notes")) drawRendered(notes);
    this.markActive();
    if (hadFocus) this.focus();
  }

  drawCrumbs(ctx, task) {
    const hub = hubOf(ctx.tree, task.note_id) ?? ctx.tree.get(task.note_id);
    const link = (text, title, onClick) => {
      const node = element("button", "task-page__crumb-link", text);
      node.type = "button";
      node.title = title;
      node.addEventListener("click", onClick);
      return node;
    };
    const parts = [link(hub.title, "Its dashboard", () => this.run(this.app().open(hub.id))),
      ...ctx.tasks.ancestorsOf(task.id).map((above) => link(above.title || "(no text)", "That task's page",
        () => this.run(this.app().showTask(above.id))))];
    const here = element("span", "task-page__crumb-here", task.title || "(no text)");
    here.setAttribute("aria-current", "page");
    this.crumbs.replaceChildren(...[...parts, here].flatMap((part, index) => (index
      ? [element("span", "task-page__separator", "›"), part] : [part])));
  }

  head(ctx, task) {
    const node = this.option(element("header", `task-page__head${task.done ? " task-page__head--done" : ""}`), 0);
    const line = element("div", "task-page__title-line");
    line.append(this.box(task), element("h2", "task-page__title", task.title || "(no text)"));
    if (!this.readOnly) line.append(this.actions(task));
    const facts = element("p", "task-page__facts");
    headFacts(ctx, task).forEach((fact, index) => {
      if (index) facts.append(element("span", "task-page__dot", "·"));
      if (fact.noteId === undefined) return facts.append(element("span", "", fact.text));
      const open = element("button", "task-page__note-link", fact.text);
      open.type = "button";
      open.tabIndex = -1;
      open.title = "Open the note";
      open.addEventListener("click", () => this.run(this.app().open(fact.noteId)));
      return facts.append(open);
    });
    node.append(line);
    if (facts.childNodes.length) node.append(facts);
    if ((task.notes ?? "").trim()) node.append(this.notes(task, "task-page__notes task-page__notes--head"));
    else node.append(element("p", "task-page__no-notes", this.readOnly ? "No notes" : "No notes — e to add"));
    return node;
  }

  table(ctx) {
    const subs = this.rows.slice(1).filter((row) => row.task);
    if (!subs.length) return [];
    const table = element("div", "task-page__table");
    const columns = element("div", "task-page__columns");
    columns.setAttribute("aria-hidden", "true");
    columns.append(element("span", "", "Subtask"), element("span", "", "Notes"));
    table.append(columns, ...subs.map((row, index) => this.subRow(ctx, row, index + 1)));
    return [table];
  }

  subRow(ctx, { task, depth }, index) {
    const classes = ["task-page__row", `task-page__row--depth-${Math.min(depth, MAX_INDENT)}`, task.done && "task-page__row--done"];
    const node = this.option(element("div", classes.filter(Boolean).join(" ")), index);
    const name = element("div", "task-page__name");
    const title = element("button", "task-page__row-title", task.title || "(no text)");
    title.type = "button";
    title.tabIndex = -1;
    title.title = "Its own page (Enter)";
    title.dataset.action = "open";
    name.append(this.box(task), title, element("span", "task-page__row-facts", rowFacts(ctx, task)));
    if (!this.readOnly) name.append(this.actions(task));
    const notes = (task.notes ?? "").trim() ? this.notes(task, "task-page__notes task-page__cell-notes")
      : element("div", "task-page__cell-notes");
    node.append(name, notes);
    return node;
  }

  box(task) {
    const box = element(this.readOnly ? "span" : "button", "task-page__box", task.done ? "☑" : "☐");
    if (!this.readOnly) {
      box.type = "button";
      box.tabIndex = -1;
      box.title = task.done ? "Reopen it (Space)" : "Mark it done, with everything under it (Space)";
      box.dataset.action = "toggle";
    }
    return box;
  }

  actions(task) {
    const box = element("span", "task-page__actions");
    for (const [action, label, key] of [["edit", "Edit…", "e"], ["delegate", task.delegate_id === null ? "Delegate…" : "Take back", "d"],
      ["remove", "Delete", "x"]]) {
      const node = element("button", "task-page__action", label);
      node.type = "button";
      node.tabIndex = -1;
      node.title = `${label} (${key})`;
      node.dataset.action = action;
      box.append(node);
    }
    return box;
  }

  notes(task, className) {
    const node = element("div", `${className} md-doc`);
    node.innerHTML = renderMarkdown(task.notes, this.app().markdownOptions(task.note_id));
    return node;
  }

  option(node, index) {
    node.id = `task-page-option-${index}`;
    node.dataset.index = String(index);
    node.setAttribute("role", "option");
    return node;
  }

  showGone(ctx) {
    this.task = null;
    this.rows = [];
    const reason = goneReason(ctx, this.last?.id === ctx.taskId ? this.last : null);
    this.crumbs.replaceChildren();
    const back = element("button", "task-page__crumb-link", "‹ Back");
    back.type = "button";
    back.addEventListener("click", () => this.onLeave());
    const box = element("div", "task-page__gone");
    box.append(element("h2", "task-page__title", reason === "trashed" ? "Its note is in the trash" : "This task is gone"));
    const links = element("p", "task-page__facts");
    if (reason === "trashed") {
      const trash = element("button", "task-page__crumb-link", "Open Trash");
      trash.type = "button";
      trash.addEventListener("click", () => this.app().showView("trash", "push"));
      links.append(trash, element("span", "task-page__dot", "·"));
    }
    links.append(back);
    box.append(links);
    this.body.replaceChildren(box);
    this.body.removeAttribute("aria-activedescendant");
  }

  markActive() {
    for (const node of this.body.querySelectorAll("[role=option]")) {
      node.setAttribute("aria-selected", String(Number(node.dataset.index) === this.active));
    }
    const node = this.body.querySelector(`#task-page-option-${this.active}`);
    if (!node) return;
    this.body.setAttribute("aria-activedescendant", node.id);
    node.scrollIntoView?.({ block: "nearest" });
  }

  select(index) {
    if (!this.rows.length) return;
    this.active = Math.max(0, Math.min(index, this.rows.length - 1));
    this.selectedKey = rowKey(this.rows[this.active]);
    this.markActive();
  }

  onClick(event) {
    const node = event.target.closest?.("[role=option]");
    if (node) {
      this.select(Number(node.dataset.index));
      this.focus();
    }
    const action = event.target.closest?.("[data-action]")?.dataset.action;
    if (action === "addDirect") this.focus();
    if (action) this.perform(action);
  }

  onKey(event) {
    if (event.target.closest("dialog, input, select, textarea")) return;
    const action = taskPageAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action !== "pending") this.perform(action);
  }

  perform(action) {
    if (action === "leave") return this.onLeave();
    if (!this.task) return undefined;
    const row = this.rows[this.active];
    const app = this.app();
    switch (action) {
      case "next": return this.select(this.active + 1);
      case "previous": return this.select(this.active - 1);
      case "first": return this.select(0);
      case "last": return this.select(this.rows.length - 1);
      default: break;
    }
    // + Add subtask is the page's, whichever row is selected.
    if (row.email && action !== "addDirect") return this.performOnEmail(action, row.email);
    switch (action) {
      case "open": return row.head ? undefined : this.run(app.showTask(row.task.id));
      case "openEmail":
      case "reply": return undefined; // an email's keys: nothing on a task's row
      default: break;
    }
    if (this.readOnly) return app.say(`"${this.task.title}" is on an archived note: read-only`);
    const task = row.task ?? this.task;
    switch (action) {
      case "add": return this.run(newTaskDialog(app, this.ctx.tree.get(task.note_id), task));
      case "addDirect": return this.run(newTaskDialog(app, this.ctx.tree.get(this.task.note_id), this.task));
      case "toggle": return this.run(setTaskDone(app, task.id, !task.done));
      case "edit": return this.run(editTaskDialog(app, task.id));
      case "delegate": return this.run(task.delegate_id === null ? delegateDialog(app, task.id) : takeBack(app, task.id));
      // Deleting the head leaves nothing to show here: back to the dashboard, as Escape does.
      case "remove": return this.run(removeTaskDialog(app, task.id).then((removed) => {
        if (removed && row.head) this.onLeave();
      }));
      case "moveDown":
      case "moveUp": return row.head ? undefined : this.run(this.move(task, action === "moveDown" ? 1 : -1));
      default: return undefined;
    }
  }

  // Opening reads only, so an archived task's emails still open; r and x change them.
  performOnEmail(action, email) {
    const changes = action === "reply" || action === "remove";
    if (changes && this.readOnly) return this.app().say(`"${this.task.title}" is on an archived note: read-only`);
    if (["open", "openEmail", "reply", "remove"].includes(action)) return this.run(this.emails.perform(action, email));
    return undefined;
  }

  async move(task, direction) {
    const app = this.app();
    const target = moveTarget(app.tasks, task.id, direction);
    if (!target) return;
    await app.tasksApi.move(task.id, target.beforeId);
    app.changes.send({ type: "changed", what: ["tasks"] });
    await app.refreshTree();
  }

  focus() {
    this.body.focus();
  }
}

export function headFacts(ctx, task) {
  const { tree } = ctx;
  const today = ctx.today ?? null;
  const delegate = tree.get(task.delegate_id);
  const forPerson = tree.get(task.for_person_id);
  const hub = hubOf(tree, task.note_id);
  const note = tree.get(task.note_id);
  return [
    task.due ? { text: `due ${dayText(task.due, { today })}` } : null,
    delegate ? { text: `→ ${delegate.title}${task.follow_up ? `, follow up ${dayText(task.follow_up, { today })}` : ""}` } : null,
    forPerson ? { text: `for ${forPerson.title}` } : null,
    task.estimate_min ? { text: estimateText(task.estimate_min) } : null,
    note && hub && note.id !== hub.id ? { text: `on ${note.title}`, noteId: note.id } : null,
    task.done && task.done_day ? { text: `done ${dayText(task.done_day, { today })}` } : null,
    isArchived(tree, task.note_id) ? { text: "archived: read-only" } : null,
  ].filter(Boolean);
}

export function rowFacts(ctx, task) {
  const today = ctx.today ?? null;
  const delegate = ctx.tree.get(task.delegate_id);
  return [
    task.done && task.done_day ? `done ${dayText(task.done_day, { today })}` : task.due ? `due ${dayText(task.due, { today })}` : "",
    delegate ? `→ ${delegate.title}${task.follow_up ? `, follow up ${dayText(task.follow_up, { today })}` : ""}` : "",
  ].filter(Boolean).join(" · ");
}

export function goneReason({ tree, trash, taskNoteId = null }, last) {
  const trashed = new Set((trash?.entries ?? []).map((entry) => entry.id));
  if (!last) return taskNoteId !== null && trashed.has(taskNoteId) ? "trashed" : "gone";
  return last.notes.some((id) => trashed.has(id)) || !tree.has(last.notes[0]) ? "trashed" : "gone";
}

function element(tag, className, text = null) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}
