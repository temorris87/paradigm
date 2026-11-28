// A task's own page, in the main window (?note=HUB&task=ID), over its note's dashboard: the
// breadcrumb (the hub › each parent task › this task), the head (task-head.js: box, title,
// chips, Done / Schedule / Delegate / Edit / ···, the facts row), then two columns: Notes, the
// main one, and the side column's cards (task-side.js): Subtasks, Emails (task-emails.js),
// Files (task-files.js), From and History (task-history.js). Side by side down to 1000 px.
// The page takes .msg files dropped on it.
// One focus stop: a listbox whose first row is the head, then the side column's rows, top to
// bottom. Its keys: task-page-keys.js. The notes are written in the note window (the Notes
// card's Edit, e): while they are open there, the card shows them as typed (task-notes-live.js).
// An archived note's task is read-only.
//
//   const page = new TaskPage(section, { app: () => notesApp, onLeave(), emailsApi?, changes? });
//     changes: the windows' channel (connection/changes.js), for the notes typed in the note window
//   page.attach()       :attach: the file picker for .msg files (throws when read-only)
//   page.show(ctx)      ctx.tree, ctx.tasks, ctx.trash, ctx.taskId, ctx.taskNoteId, ctx.today
//                       (now), ctx.sessions, ctx.meetings, ctx.timeSettings
//   page.focus()
//
//   goneReason(ctx, last)           "trashed" when its note went to the Trash, else "gone"; never
//                                   drawn (a reload), the URL's note (ctx.taskNoteId) tells (pure)
import { renderMarkdown } from "../markdown/index.js";
import { hubOf, isArchived } from "../notes/hub-groups.js";
import { chip } from "../ui/chip.js";
import { keyCap } from "../ui/key-hints.js";
import { openMenu } from "../ui/menu.js";
import { drawRendered, followNoteLinks } from "../ui/rendered-text.js";
import { delegateDialog, editTaskDialog, editTaskNotes, newTaskDialog, removeTaskDialog, scheduleTask, setTaskDone, takeBack } from "./task-commands.js";
import { TaskNotesLive } from "./task-notes-live.js";
import { drawFacts, drawHead } from "./task-head.js";
import { TaskFiles } from "./task-files.js";
import { TaskHistory, drawSource } from "./task-history.js";
import { NOTES_EMPTY, noSlotText, placedText, sourceOf } from "./task-page-model.js";
import { taskPageAction } from "./task-page-keys.js";
import { TaskEmails } from "./task-emails.js";
import { card, drawSide, element, subtasksCard } from "./task-side.js";
import { moveTarget, taskTree } from "./tasks-model.js";

// The notes closed in the note window: read again now, and once more after this long, for a
// save sent as that window closed (keepalive) that lands after the first read.
const RELOAD_AGAIN_MS = 1000;

// s on this page says where it went in the page's own words.
const SCHEDULE_WORDS = { placed: placedText, none: noSlotText };

// A row's key, kept across redraws.
function rowKey(row) {
  if (row.email) return `email-${row.email.id}`;
  if (row.file) return `file-${row.file.id}`;
  if (row.source) return "source";
  if (row.event) return row.event.key;
  return `task-${row.task.id}`;
}

export class TaskPage {
  constructor(section, { app, onLeave, emailsApi = null, changes = null }) {
    this.section = section;
    this.app = app;
    this.onLeave = onLeave;
    this.task = null;
    this.rows = [];
    this.indexes = new Map(); // rowKey -> its index
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
    this.body.setAttribute("aria-label", "The task, its subtasks, emails, files and history");
    this.body.tabIndex = 0;
    section.replaceChildren(this.crumbs, this.body);
    section.addEventListener("keydown", (event) => this.onKey(event));
    this.body.addEventListener("click", (event) => this.onClick(event));
    followNoteLinks(this.body, (id) => this.run(this.app().open(id)));
    const redraw = () => this.redraw();
    // No emails API (tests of other parts): the card stays empty and nothing is fetched.
    this.emails = new TaskEmails({ api: emailsApi, app, redraw });
    this.files = new TaskFiles({ app, redraw });
    this.history = new TaskHistory({ app, redraw });
    if (emailsApi) this.emails.listenForDrops(section, { accepts: () => Boolean(this.task), refusal: () => this.dropRefusal() });
    this.live = new TaskNotesLive({ changes, onClosed: () => this.notesClosed() });
  }

  /** The note window let go of the notes: the card shows the saved ones. */
  notesClosed() {
    const reload = () => this.run(this.app().refreshTree());
    reload();
    setTimeout(reload, RELOAD_AGAIN_MS);
  }

  redraw() {
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
    const fresh = ctx !== this.ctx; // the data read again (not a part's own redraw)
    this.ctx = ctx;
    const task = ctx.tasks?.get(ctx.taskId) ?? null;
    if (!task || !ctx.tree.has(task.note_id)) return this.showGone(ctx);
    // Another task's page starts on its head: the last page's row means nothing here.
    if (task.id !== this.last?.id) {
      this.active = 0;
      this.selectedKey = null;
      // Its notes may be open in the note window already: the chip shows straight away.
      this.live.ask();
    }
    this.emails.sync(task.id);
    this.files.sync(task.id, { force: fresh });
    this.history.sync(task.id, { force: fresh });
    this.task = task;
    this.last = { id: task.id, notes: [task.note_id, ...ctx.tree.ancestors(task.note_id)] };
    this.readOnly = isArchived(ctx.tree, task.note_id);
    const now = ctx.today ?? new Date();
    const subs = taskTree(ctx.tasks, task.id);
    const source = sourceOf(ctx, task);
    this.emails.first = 1 + subs.length;
    this.rows = [{ task, depth: 0, head: true }, ...subs, ...this.emails.rows(), ...this.files.rows(),
      ...(source ? [{ source }] : []), ...this.history.rows(now)];
    this.indexes = new Map(this.rows.map((row, index) => [rowKey(row), index]));
    const kept = this.indexes.get(this.selectedKey);
    this.active = kept ?? Math.min(this.active, this.rows.length - 1);
    this.selectedKey = rowKey(this.rows[this.active]);
    this.drawCrumbs(ctx, task);
    const hadFocus = this.section.contains(document.activeElement);
    const box = (each) => this.box(each);
    const head = this.option(drawHead({ ctx, task, now, readOnly: this.readOnly, box }), 0);
    if (this.readOnly) head.querySelector(".task-page__title-line").append(chip("Archived: read-only", "neutral"));
    const optionOf = (key) => (node) => this.option(node, this.indexes.get(key));
    const side = drawSide({
      subtasks: subtasksCard({ ctx, subs, box, readOnly: this.readOnly, today: now,
        option: (node, each) => optionOf(`task-${each.id}`)(node) }),
      emails: this.emails.draw((node, index) => this.option(node, index), { readOnly: this.readOnly, today: now }),
      files: this.files.draw((node, file) => optionOf(`file-${file.id}`)(node), { readOnly: this.readOnly, hubId: hubOf(ctx.tree, task.note_id)?.id ?? null }),
      source: source ? drawSource(source, optionOf("source")) : null,
      history: this.history.draw((node, event) => optionOf(event.key)(node), now),
    });
    const columns = element("div", "task-page__columns");
    columns.append(this.notesCard(task), side);
    this.body.replaceChildren(head, drawFacts(ctx, task, now), columns);
    for (const notes of this.body.querySelectorAll(".task-page__notes")) drawRendered(notes);
    this.markActive();
    if (hadFocus) this.focus();
  }

  notesCard(task) {
    let edit = null;
    if (!this.readOnly) {
      edit = element("button", "task-card__add", "Edit");
      edit.type = "button";
      edit.tabIndex = -1;
      edit.title = "Write its notes in the note window (e)";
      edit.dataset.action = "editNotes";
      edit.append(" ", keyCap("e"));
    }
    const node = card("notes", "Notes", "", edit);
    node.classList.add("task-page__main");
    const body = element("div", "task-page__notes-body");
    if ((task.notes ?? "").trim()) {
      const notes = element("div", "task-page__notes md-doc");
      notes.innerHTML = renderMarkdown(task.notes, this.app().markdownOptions(task.note_id));
      body.append(notes);
    } else {
      body.append(element("p", "task-page__no-notes", this.readOnly ? "No notes" : NOTES_EMPTY));
    }
    node.append(body);
    // Open in the note window: the text as typed there, and the chip.
    this.live.attach({ taskId: task.id, head: node.querySelector(".task-card__head"), edit, body,
      render: (markdown) => renderMarkdown(markdown, this.app().markdownOptions(task.note_id)) });
    return node;
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
    const links = element("p", "task-page__gone-links");
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
    const noteLink = event.target.closest?.("[data-note]");
    if (noteLink) return this.run(this.app().open(Number(noteLink.dataset.note)));
    const button = event.target.closest?.("[data-action]");
    if (!button) return undefined;
    if (!node) this.focus();
    return this.perform(button.dataset.action, button);
  }

  onKey(event) {
    if (event.target.closest("dialog, input, select, textarea")) return;
    const action = taskPageAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action !== "pending") this.perform(action);
  }

  perform(action, button = null) {
    if (action === "leave") return this.onLeave();
    if (!this.task) return undefined;
    switch (action) {
      case "next": return this.select(this.active + 1);
      case "previous": return this.select(this.active - 1);
      case "first": return this.select(0);
      case "last": return this.select(this.rows.length - 1);
      default: break;
    }
    const row = this.rows[this.active];
    const reading = this.performReading(action, row);
    if (reading !== null) return reading;
    if (this.readOnly) return this.app().say(`"${this.task.title}" is on an archived note: read-only`);
    return this.performChange(action, row, button);
  }

  /** What only reads (so works on an archived task too): opening a row. null: not one of them. */
  performReading(action, row) {
    const app = this.app();
    // x and r change an email or a file: performChange's, after the read-only check.
    if (row.email && ["open", "openEmail"].includes(action)) return this.run(this.emails.perform(action, row.email));
    if (row.file && ["open", "openEmail", "openFile"].includes(action)) return this.run(this.files.perform(action, row.file));
    if ((row.source || row.event) && ["open", "openNote"].includes(action)) {
      const id = row.source?.noteId ?? row.event.noteId;
      return id === null || id === undefined ? undefined : this.run(app.open(id));
    }
    if (action === "open") return row.task && !row.head ? this.run(app.showTask(row.task.id)) : undefined;
    if (["openEmail", "openFile", "openNote"].includes(action)) return undefined;
    if (action === "reply") return row.email ? null : undefined;
    return null;
  }

  performChange(action, row, button) {
    const app = this.app();
    const page = this.task;
    // Space, e, d and s act on a selected subtask (or the head); on any other row, the task.
    const task = row.task ?? page;
    switch (action) {
      case "reply": return this.run(this.emails.perform("reply", row.email));
      case "add": return this.run(newTaskDialog(app, this.ctx.tree.get(task.note_id), task));
      case "addDirect": return this.run(newTaskDialog(app, this.ctx.tree.get(page.note_id), page));
      case "attachEmail": return this.attach();
      case "addFile": return this.run(this.files.add(page));
      case "toggle": return this.run(setTaskDone(app, task.id, !task.done));
      case "edit": return this.run(editTaskDialog(app, task.id));
      case "editNotes": return this.run(editTaskNotes(app, page.id));
      case "delegate": return this.run(this.delegate(task));
      case "schedule": return this.run(scheduleTask(app, task.id, { words: SCHEDULE_WORDS }));
      case "toggleTask": return this.run(setTaskDone(app, page.id, !page.done));
      case "editTask": return this.run(editTaskDialog(app, page.id));
      case "delegateTask": return this.run(this.delegate(page));
      case "scheduleTask": return this.run(scheduleTask(app, page.id, { words: SCHEDULE_WORDS }));
      case "moreTask": return this.more(button);
      case "remove": return this.remove(row);
      case "moveDown":
      case "moveUp": return row.task && !row.head ? this.run(this.move(row.task, action === "moveDown" ? 1 : -1)) : undefined;
      default: return undefined;
    }
  }

  delegate(task) {
    return task.delegate_id === null || task.delegate_id === undefined ? delegateDialog(this.app(), task.id) : takeBack(this.app(), task.id);
  }

  remove(row) {
    if (row.email) return this.run(this.emails.perform("remove", row.email));
    if (row.file) return this.run(this.files.perform("remove", row.file));
    if (!row.task) return undefined;
    return this.removeTask(row.task, row.head);
  }

  // Deleting the page's task leaves nothing to show here: back to the dashboard, as Escape does.
  removeTask(task, head) {
    return this.run(removeTaskDialog(this.app(), task.id).then((removed) => {
      if (removed && head) this.onLeave();
    }));
  }

  /** ···: the task's other actions. */
  more(button) {
    const page = this.task;
    const app = this.app();
    const sub = page.parent_id !== null && page.parent_id !== undefined;
    openMenu(button ?? this.body, [
      ...(sub ? [
        { label: "Move up", hint: "among its sibling subtasks", disabled: !moveTarget(app.tasks, page.id, -1), run: () => this.run(this.move(page, -1)) },
        { label: "Move down", hint: "among its sibling subtasks", disabled: !moveTarget(app.tasks, page.id, 1), run: () => this.run(this.move(page, 1)) },
        "separator",
      ] : []),
      { label: "Delete…", danger: true, hint: "with every subtask under it", run: () => this.removeTask(page, true) },
    ], { label: "Task actions", fallbackFocus: () => this.focus() });
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

export function goneReason({ tree, trash, taskNoteId = null }, last) {
  const trashed = new Set((trash?.entries ?? []).map((entry) => entry.id));
  if (!last) return taskNoteId !== null && trashed.has(taskNoteId) ? "trashed" : "gone";
  return last.notes.some((id) => trashed.has(id)) || !tree.has(last.notes[0]) ? "trashed" : "gone";
}
