// The notes page: the tree, the breadcrumb and the editor on the open note, kept in step.
// It owns what the editor's events mean here: saving, following [[links]], note commands.
//
//   const app = new NotesApp({ editor, tree: ulElement, crumbs: navElement, navigator,
//                              hub: { page, line, section, labels },
//                              agenda: { editor, field }, home: { section, button },
//                              people: { section, button }, meetings: { section, button },
//                              api: notesApi, imagesApi, peopleApi, meetingsApi, recordsApi,
//                              linksApi });
//
// navigator (static/js/layout/navigator.js) holds the tree: a drawer on narrow windows.
// hub (static/js/hubs/hub-page.js) is the card, the text boxes' labels and the sections.
// agenda is a meeting's second text box (agenda.js), over the minutes.
// home, people and meetings are the Home, People and Meetings pages (static/js/home/,
// static/js/people/people-page.js, static/js/meetings/meetings-page.js), drawn in place of
// the note while the URL has &home, &people or &meetings (page-views.js; the note stays
// open under them). A URL with no note opens on Home.
//   await app.start();
import { exportNote } from "../export/export.js";
import { HomePage } from "../home/home-page.js";
import { hubLineControls, hubTabActions, newMeetingDialog, personDetailsDialog } from "../hubs/hub-actions.js";
import { HubPage } from "../hubs/hub-page.js";
import { showBreadcrumb } from "./breadcrumb.js";
import { registerNoteCommands, runNoteCommand } from "./commands.js";
import { headingLine } from "./headings.js";
import { groupOf, isArchived, topNoteOf } from "./hub-groups.js";
import { AgendaField } from "./agenda.js";
import { mentionCompletions, openMention, rewriteMentionsOf } from "./mention-actions.js";
import { personForMention } from "./mentions.js";
import { openSelectionMenu } from "./selection-menu.js";
import { renderMarkdown } from "../markdown/index.js";
import { recordsFrom } from "../records/records-model.js";
import { NoteImages } from "./images.js";
import { goToNote, newNoteDialog, openNoteMenu, whereText } from "./note-actions.js";
import { LinkIndex, indexTexts } from "./link-index.js";
import { NoteSession } from "./note-session.js";
import { resolveLink, splitTarget } from "./resolve.js";
import { NoteTree } from "./tree-model.js";
import { PageViews } from "./page-views.js";
import { Meetings } from "../meetings/meetings-model.js";
import { meetingsPage } from "../meetings/meetings-page.js";
import { People } from "../people/people-model.js";
import { peoplePage } from "../people/people-page.js";
import { Records } from "../records/records-model.js";
import { TreeView, addLabel } from "./tree-view.js";
import { NO_TRASH } from "../trash/trash-model.js";
import { trashPage } from "../trash/trash-page.js";
import { newPersonDialog } from "../people/people-page.js";
import { Changes } from "../connection/changes.js";
import { Tasks } from "../tasks/tasks-model.js";
import { boxState, setBox, withTaskAdded } from "./tasks.js";
import { addDays, localDay } from "../meetings/meeting-days.js";
import { popOut } from "../windows/popout.js";

// The blocks of time loaded for the pages (a task's next block, Home's Today).
const SESSIONS_BACK_DAYS = 7;
const SESSIONS_AHEAD_DAYS = 120;

const UNSAVED = "E37: No write since last change (:w to save, or ! to drop the changes)";

export class NotesApp {
  constructor({ editor, tree, crumbs, navigator, hub, agenda = {}, home, people, meetings, trash, goTo, api, trashApi, imagesApi, peopleApi,
                meetingsApi, recordsApi, linksApi, tasksApi = null, calendarApi = null, popOuts = {},
                location = window.location, history = window.history, today = () => new Date(),
                changes = new Changes() }) {
    this.editor = editor;
    this.tasksApi = tasksApi;
    this.calendarApi = calendarApi;
    this.tasks = new Tasks();
    this.sessions = [];
    this.importStatus = null;
    this.changes = changes;
    this.peopleApi = peopleApi;
    this.meetingsApi = meetingsApi;
    this.recordsApi = recordsApi;
    this.trashApi = trashApi;
    this.trash = NO_TRASH;
    this.trashButton = trash.button;
    this.records = new Records();
    this.people = new People();
    this.meetings = new Meetings();
    this.today = today;
    this.crumbs = crumbs;
    this.navigator = navigator;
    this.api = api;
    this.location = location;
    this.history = history;
    this.tree = new NoteTree();
    // Each save sends the note's [[wiki links]] along, for the Linked from tabs.
    this.linkIndex = new LinkIndex({ api: linksApi, onChange: () => this.redraw() });
    // A meeting's index holds its agenda's links and mentions too: each save sends both.
    this.session = new NoteSession({
      api: { ...api, save: this.announcing(this.linkIndex.saver(api.save, (note) => ({ body: note.body, agenda: this.agenda.textFor(note.id) }))) },
      onChange: () => {
        this.editor.modified = this.session.dirty;
        this.markEmptyFields();
      },
      onError: (error) => this.fail(error),
    });
    this.agendaEditor = agenda.editor ?? null;
    this.agenda = new AgendaField({
      editor: this.agendaEditor,
      field: agenda.field ?? null,
      api: meetingsApi ?? {},
      saver: (save) => this.announcing(this.linkIndex.saver(save, (note) => ({ body: this.editor.value, agenda: note.body }))),
      onChange: () => this.markEmptyFields(),
      onError: (error) => this.fail(error),
    });
    this.labels = hub.labels ?? {};
    this.treeView = new TreeView(tree, {
      // The drawer closes even when the note can't be opened, so the editor's message shows.
      onOpen: (id) => this.open(id).finally(() => this.navigator.hide()),
      onLeave: () => this.navigator.hide(),
      onAdd: (group) => this.guard(this.newInGroup(group)),
      onAddUnder: (id) => this.guard(newNoteDialog(this, id, { heading: `New note under "${this.tree.get(id).title}"` })),
    });
    this.hubPage = new HubPage({
      ...hub,
      onOpen: (id, at) => this.guard(this.openFromHub(id, at)),
      onLeave: () => this.editor.focus(),
      controls: hubLineControls(this),
      tabActions: hubTabActions(this),
      renderSnippet: (markdown) => renderMarkdown(markdown, this.markdownOptions()),
    });
    const onPage = { onOpen: (id) => this.guard(this.open(id)), onLeave: () => this.leaveView() };
    this.views = new PageViews({
      main: hub.page,
      pages: {
        home: new HomePage(home.section, { ...onPage, today }),
        people: peoplePage(people.section, { ...onPage, onAdd: () => this.guard(newPersonDialog(this)) }),
        meetings: meetingsPage(meetings.section, { ...onPage, today, onAdd: () => this.guard(newMeetingDialog(this)) }),
        trash: trashPage(trash.section, { onRestore: (id) => this.restoreFromTrash(id), onLeave: onPage.onLeave }),
      },
      history,
      noteUrl: () => noteUrl(this.currentId),
    });
    for (const [key, { button }] of Object.entries({ home, people, meetings, trash })) {
      button?.addEventListener("click", () => {
        this.navigator.hide({ refocus: false });
        if (this.views.shown === key) this.leaveView();
        else this.showView(key, "push");
      });
    }
    goTo?.addEventListener("click", () => this.guard(goToNote(this)));
    popOuts.calendar?.addEventListener("click", () => this.calendarCommand());
    popOuts.time?.addEventListener("click", () => this.timeCommand());
    this.images = new NoteImages({ editor, api: imagesApi, currentId: () => this.currentId });
    registerNoteCommands(editor);
    if (this.agendaEditor) registerNoteCommands(this.agendaEditor);
    editor.completions = mentionCompletions(this);
    if (this.agendaEditor) this.agendaEditor.completions = editor.completions;
    this.listen();
  }

  get currentId() {
    return this.session.note?.id ?? null;
  }

  listen() {
    const editor = this.editor;
    editor.addEventListener("change", (event) => this.session.edited(event.detail.value));
    editor.addEventListener("save", (event) => this.saveCommand(Boolean(event.detail.force)));
    editor.addEventListener("files", (event) => this.guard(this.images.add(event.detail)));
    for (const box of [editor, this.agendaEditor].filter(Boolean)) {
      box.addEventListener("quit", () => box.showMessage("Nothing to close here: closing the tab stops Paradigm"));
      box.addEventListener("ex", (event) => this.guard(runNoteCommand(this, event.detail)));
      box.addEventListener("link", (event) => this.guard(this.followLink(event.detail.target)));
      box.addEventListener("mention", (event) => this.guard(openMention(this, event.detail.name)));
      box.addEventListener("highlight", (event) => this.guard(this.openRecord(event.detail.data)));
      box.addEventListener("task", (event) => this.guard(this.tickLine(box, event.detail.line)));
      box.addEventListener("menu", (event) => {
        event.preventDefault();
        openSelectionMenu(this, event.detail, box);
      });
    }
    this.agendaEditor?.addEventListener("save", (event) => this.guard(this.saveAgendaCommand(Boolean(event.detail.force))));
    // A file dropped beside the editor would make the browser open it in place of the app.
    for (const type of ["dragover", "drop"]) {
      window.addEventListener(type, (event) => {
        if ([...(event.dataTransfer?.types ?? [])].includes("Files")) event.preventDefault();
      });
    }
    window.addEventListener("popstate", () => this.guard(this.openFromUrl("none")));
    window.addEventListener("pagehide", () => {
      this.session.saveBeforeLeaving();
      this.agenda.saveBeforeLeaving();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.session.save().catch(() => {});
        this.agenda.save().catch(() => {});
      }
      else this.guard(this.refreshTree());
    });
    // Another tab may have made or moved notes.
    window.addEventListener("focus", () => this.guard(this.refreshTree()));
    this.changes.listen((message) => this.guard(this.onMessage(message)));
  }

  /** A message from the calendar or timesheet window (connection/changes.js). */
  async onMessage(message) {
    if (message.type === "open" && this.tree) {
      this.changes.send({ type: "opened" });
      await this.refreshTree();
      if (!this.tree.has(message.id)) return;
      await this.openFromHub(message.id, message.at ?? null);
      window.focus();
    } else if (message.type === "changed") {
      await this.refreshTree();
      await this.reloadIfChanged();
    }
  }

  /** The open note was changed in another window (a box ticked there): show the new text
   * unless there are unsaved changes here (then the save finds the conflict, as usual). */
  async reloadIfChanged() {
    const id = this.currentId;
    if (id === null || this.session.dirty || this.agenda.dirty) return;
    const note = await this.api.get(id);
    const agendaChanged = note.agenda_version !== undefined && this.agenda.id === id
      && note.agenda_version !== this.agenda.session.note?.version;
    if (note.version === this.session.note?.version && !agendaChanged) return;
    await this.open(id, { discard: true, history: "none" });
  }

  /** A save that tells the other windows once it is stored. */
  announcing(save) {
    return (note, options) => {
      const saving = save(note, options);
      saving.then(() => this.changes.send({ type: "changed", what: ["notes"] }), () => {});
      return saving;
    };
  }

  async start() {
    await this.refreshTree();
    await this.openFromUrl("replace");
    this.editor.focus();
  }

  async openFromUrl(history) {
    const params = new URLSearchParams(this.location.search);
    const wanted = Number(params.get("note"));
    const id = this.tree.has(wanted) ? wanted : this.tree.children(null)[0]?.id;
    if (id === undefined) return;
    const view = this.views.fromUrl(params) ?? (params.has("note") ? null : "home");
    const opened = await this.open(id, { history: view ? "none" : history });
    // Back/Forward to another note while this one could not be saved: stay, and say so.
    if (!opened && history === "none") this.history.pushState({}, "", noteUrl(this.currentId));
    else if (view) this.showView(view, history === "replace" ? "replace" : "none");
  }

  async refreshTree() {
    const today = this.today();
    const [notes, people, meetings, records, trash, , tasks, sessions, importStatus] = await Promise.all([
      this.api.list(), this.peopleApi.list(), this.meetingsApi.list(), this.recordsApi.list(),
      this.trashApi.list(), this.linkIndex.refresh(), this.tasksApi?.list() ?? [],
      this.tasksApi?.sessions(localDay(addDays(today, -SESSIONS_BACK_DAYS)), localDay(addDays(today, SESSIONS_AHEAD_DAYS))) ?? [],
      this.calendarApi?.status().catch(() => null) ?? null,
    ]);
    this.tasks = new Tasks(tasks);
    this.sessions = sessions;
    this.importStatus = importStatus;
    this.trash = trash;
    this.tree = new NoteTree(notes);
    this.people = new People(people);
    this.meetings = new Meetings(meetings);
    this.records = new Records(records);
    this.redraw();
  }

  /** Opens a note. Returns false (and says why) when the open note's changes can't be saved. */
  async open(id, { history = "push", discard = false, heading = "" } = {}) {
    // Opening a note (from the People page, Back, a link...) puts the note back in view.
    const leftView = Boolean(this.views.shown);
    if (leftView) {
      this.views.hide();
      if (history === "push" && id === this.currentId) this.history.pushState({}, "", noteUrl(id));
    }
    const result = await this.switchTo(id, { history, discard, heading });
    // The open note's changes couldn't be saved: it stays, but the URL must leave the view.
    if (leftView && !result && history === "push") this.history.pushState({}, "", noteUrl(this.currentId));
    if (leftView) {
      this.redraw();
      this.focusNote();
    }
    return result;
  }

  async switchTo(id, { history, discard, heading }) {
    if (id !== this.currentId || discard) {
      if (!discard && !(await this.saveBeforeSwitching())) return false;
      const note = await this.api.get(id);
      this.session.open(note);
      this.editor.value = note.body;
      this.agenda.open(note);
      if (history === "push") this.history.pushState({}, "", noteUrl(id));
      if (history === "replace") this.history.replaceState({}, "", noteUrl(id));
      this.redraw();
    }
    if (heading) this.goToHeading(heading);
    return true;
  }

  async saveBeforeSwitching() {
    if (!this.session.dirty && !this.agenda.dirty) return true;
    try {
      await this.session.save();
      await this.agenda.save();
    } catch (error) {
      this.fail(error);
      return false;
    }
    if (this.session.dirty || this.agenda.dirty) {
      this.fail(new Error(UNSAVED));
      return false;
    }
    return true;
  }

  goToHeading(heading) {
    const line = headingLine(this.editor.value, heading);
    if (line === null) this.fail(new Error(`E: no heading "${heading}" in this note`));
    else this.editor.goToLine(line);
  }

  redraw() {
    const id = this.currentId;
    this.treeView.show(this.tree, id);
    showBreadcrumb(this.crumbs, this.tree, id, (target) => this.guard(this.open(target)),
      (button) => openNoteMenu(this, button));
    const ctx = { tree: this.tree, people: this.people, meetings: this.meetings, records: this.records,
      links: this.linkIndex.links, mentions: this.linkIndex.mentions, trash: this.trash, tasks: this.tasks,
      sessions: this.sessions, importStatus: this.importStatus, today: this.today() };
    const trashed = this.trash.entries.length;
    if (this.trashButton) this.trashButton.textContent = trashed ? `Trash · ${trashed}` : "Trash";
    this.hubPage.show(ctx, id);
    this.views.draw(ctx, this.crumbs);
    const title = this.tree.get(id)?.title ?? this.session.note?.title;
    document.title = title ? `${title} - Paradigm` : "Paradigm";
    // Links resolve against the tree and the open note, so both changing means new links.
    const options = this.markdownOptions();
    const highlights = this.highlightsOf(id);
    for (const box of [this.editor, this.agendaEditor].filter(Boolean)) {
      box.markdownOptions = options;
      box.highlights = highlights;
    }
    this.markEmptyFields();
  }

  markdownOptions() {
    return {
      resolveWikiLink: (link) => this.wikiHref(link),
      resolveMention: (name) => {
        const person = personForMention(this.tree, name);
        return person ? { href: noteUrl(person.id), archived: isArchived(this.tree, person.id) } : null;
      },
    };
  }

  /** The text the open note's decisions and questions were made from, for its badges. */
  highlightsOf(id) {
    if (id === null) return [];
    const labels = { decision: "Decision", question: "Question" };
    return recordsFrom(this.tree, this.records, id).filter((record) => record.quote).map((record) => ({
      text: record.quote,
      label: record.kind === "question" && record.answered ? "Answered" : labels[record.kind],
      title: `${labels[record.kind]}: ${this.tree.get(record.id).title} (click to open)`,
      data: record.id,
    }));
  }

  /** The labels over the text boxes show their hint while the box is empty. */
  markEmptyFields() {
    if (this.labels.main) this.labels.main.dataset.empty = String(!this.editor.value.trim());
    if (this.labels.agenda && this.agendaEditor) this.labels.agenda.dataset.empty = String(!this.agendaEditor.value.trim());
  }

  async openRecord(id) {
    if (id === null || !this.tree.has(id)) return;
    await this.open(id);
    this.editor.focus();
  }

  wikiHref(link) {
    if (!link.target) return null;
    const found = resolveLink(this.tree, this.currentId, link.target);
    if (!found.note) return { href: null, exists: false };
    return { href: noteUrl(found.note.id), exists: true, archived: isArchived(this.tree, found.note.id) };
  }

  async followLink(target) {
    const { link, heading } = splitTarget(target);
    if (!link) return;
    const found = resolveLink(this.tree, this.currentId, link);
    if (found.note) {
      await this.open(found.note.id, { heading });
    } else if (found.create) {
      await this.createAndOpen(found.create.parentId, found.create.title);
    } else {
      throw new Error(explainMissing(link, found));
    }
  }

  // ---- the ex commands (commands.js) ---------------------------------------------------

  async saveAgendaCommand(force) {
    try {
      await this.agenda.save({ force });
      this.agendaEditor.showMessage("Agenda saved");
    } catch (error) {
      this.agendaEditor.showMessage(error?.message ?? String(error), { error: true });
    }
  }

  async saveCommand(force) {
    try {
      await this.session.save({ force });
      this.editor.showMessage(`"${this.session.note?.title ?? ""}" saved`);
    } catch (error) {
      this.fail(error);
    }
  }

  async editCommand(arg, bang) {
    if (!arg.trim()) {
      if (this.session.dirty && !bang) throw new Error(UNSAVED);
      await this.open(this.currentId, { discard: true, history: "none" });
      this.editor.showMessage(`"${this.session.note.title}" loaded from the database`);
      return;
    }
    const found = resolveLink(this.tree, this.currentId, arg);
    if (!found.note) throw new Error(explainMissing(arg, found));
    await this.open(found.note.id, { discard: bang });
  }

  async createCommand(title, where) {
    if (!title.trim()) throw new Error("E471: Argument required: the new note's title");
    const note = this.session.note;
    const parentId = where === "under" ? note.id : this.tree.parentId(note.id);
    await this.createAndOpen(parentId, title);
  }

  /** strict (from a dialog): an open note that can't be saved first is an error to show there. */
  async createAndOpen(parentId, title, { strict = false } = {}) {
    if (!(await this.saveBeforeSwitching())) {
      if (strict) throw new Error("This note's changes could not be saved first");
      return;
    }
    const note = await this.api.create(parentId, title);
    await this.refreshTree();
    await this.open(note.id);
    this.editor.showMessage(`"${note.title}" made at ${this.tree.pathText(note.id)}`);
  }

  /** Makes a top-level note filed as kind (a project, area or resource) and opens it; areaId
   * puts a new project in an area; timeCode is its timesheet code. From a dialog: errors are
   * thrown for it to show. */
  async createFiled(kind, title, { areaId = null, timeCode = "" } = {}) {
    if (!(await this.saveBeforeSwitching())) throw new Error("This note's changes could not be saved first");
    const made = await this.api.create(null, title);
    await this.api.setKind(made.id, kind);
    if (areaId !== null) await this.api.setArea(made.id, areaId);
    if (timeCode) await this.api.setTimeCode(made.id, timeCode);
    await this.refreshTree();
    await this.open(made.id);
    const where = areaId === null ? groupLabel(this.tree, made.id) : `${groupLabel(this.tree, made.id)}, in ${this.tree.get(areaId).title}`;
    this.editor.showMessage(`"${made.title}" made in ${where}`);
  }

  /** The + on a tree group: a new note there (a person in People). */
  newInGroup(group) {
    if (group.kind === "person") return newPersonDialog(this);
    return newNoteDialog(this, null, { heading: addLabel(group), kind: group.kind,
      label: "Title" });
  }

  async renameCommand(title) {
    if (!title.trim()) throw new Error("E471: Argument required: the new title");
    const note = await this.api.rename(this.currentId, title);
    this.session.updateMeta(note);
    await this.refreshTree();
    this.editor.showMessage(`Renamed to "${note.title}"`);
  }

  async parentCommand(arg) {
    const text = arg.trim();
    if (!text) throw new Error("E471: Argument required: the note to put this one under, or /");
    let parentId = null;
    if (text !== "/") {
      const found = resolveLink(this.tree, this.currentId, text);
      if (!found.note) throw new Error(explainMissing(text, found));
      parentId = found.note.id;
    }
    await this.moveUnder(parentId);
  }

  /** Puts the open note under another note (null: the top level). */
  async moveUnder(parentId) {
    const note = await this.api.move(this.currentId, parentId);
    this.session.updateMeta(note);
    await this.refreshTree();
    this.editor.showMessage(`Now at ${this.tree.pathText(note.id)}`);
  }

  async kindCommand(group) {
    const before = this.session.note;
    if (!before) throw new Error("E: no note is open");
    const wasNested = this.tree.parentId(before.id) !== null;
    const note = await this.api.setKind(before.id, group.kind);
    this.session.updateMeta(note);
    await this.refreshTree();
    const moved = wasNested ? " moved to the top level and" : "";
    this.editor.showMessage(`"${note.title}"${moved} is now ${group.asWhat}`);
  }

  /** Opens a note from a section row; at: { field, line } puts the cursor there (a mention). */
  async openFromHub(id, at = null) {
    const opened = await this.open(id);
    if (!opened) return;
    const box = at?.field === "agenda" && this.agendaEditor && this.agenda.id === id ? this.agendaEditor : this.editor;
    if (at) box.goToLine(at.line);
    box.focus();
  }

  async hubCommand() {
    if (!this.hubPage.hasPanel) throw new Error("E: this note has no sections (a hub, a person or a meeting has them)");
    this.hubPage.focus();
  }

  async setProjectStatus(id, status) {
    const note = await this.api.setStatus(id, status);
    await this.refreshTree();
    this.editor.showMessage(`"${note.title}" is ${status === "on_hold" ? "on hold" : "active"}`);
  }

  async setProjectDue(id, due) {
    const note = await this.api.setDue(id, due);
    await this.refreshTree();
    this.editor.showMessage(due ? `"${note.title}" is due ${due}` : `"${note.title}" has no due date`);
  }

  /** A project's or an area's timesheet code ("" for none). */
  async setTimeCode(id, code) {
    const note = await this.api.setTimeCode(id, code);
    await this.refreshTree();
    this.changes.send({ type: "changed", what: ["notes"] });
    this.editor.showMessage(note.time_code ? `"${note.title}" books time to ${note.time_code}` : `"${note.title}" has no time code`);
  }

  /** Ticks a task's box (or clears it). In the open note it is an edit there (one undo step,
   * saved at once); in any other note the server changes the line. */
  async setTaskDone(taskId, done) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error("E: that task is gone (its note changed): reload the page");
    const open = this.openBoxFor(task);
    if (open) {
      // Saved first, so the task's line is the line in the editor.
      await open.session.save();
      const line = open.box.value.split("\n")[task.line];
      if (boxState(line) === null) throw new Error(`E: "${task.title}" is no longer on its line: tick it in the text`);
      if (!(await open.box.replaceLine(task.line, setBox(line, done)))) {
        throw new Error("E: leave insert mode first (Escape), then tick it");
      }
      await open.session.save();
    } else {
      await this.tasksApi.setDone(taskId, done);
      this.changes.send({ type: "changed", what: ["tasks", "notes"] });
    }
    await this.refreshTree();
    this.editor.showMessage(`"${task.title}" ${done ? "done" : "open again"}`);
  }

  /** A rendered box was clicked: tick (or clear) it in the text, as an edit. */
  async tickLine(box, line) {
    const text = box.value.split("\n")[line];
    const state = boxState(text);
    if (state === null) return;
    if (!(await box.replaceLine(line, setBox(text, !state)))) throw new Error("E: leave insert mode first (Escape), then tick it");
  }

  /** The editor and session holding a task's line, when its note is open. */
  openBoxFor(task) {
    if (task.note_id !== this.currentId) return null;
    if (task.field === "agenda") {
      return this.agendaEditor && this.agenda.id === task.note_id ? { box: this.agendaEditor, session: this.agenda.session } : null;
    }
    return { box: this.editor, session: this.session };
  }

  /** New task: a "- [ ] title" line at the end of a note's text. */
  async addTask(noteId, title) {
    if (!title) throw new Error("A task needs some text");
    if (noteId === this.currentId) {
      const body = withTaskAdded(this.editor.value, title);
      this.rewriteOpenText((text) => (text === this.editor.value ? { text: body, changed: 1 } : { text, changed: 0 }));
      await this.session.save();
    } else {
      const note = await this.api.get(noteId);
      await this.saveOther(note, withTaskAdded(note.body, title));
      this.changes.send({ type: "changed", what: ["tasks", "notes"] });
    }
    await this.refreshTree();
    this.editor.showMessage(`Task "${title}" added to "${this.tree.get(noteId)?.title ?? ""}"`);
  }

  /** :calendar, the Calendar button: the calendar in its own window. */
  calendarCommand() {
    if (!popOut("/calendar.html", "paradigm-calendar")) this.fail(new Error("E: the browser blocked the calendar window: allow popups for Paradigm"));
  }

  /** :time, the Time button: the weekly timesheet in its own window. */
  timeCommand() {
    if (!popOut("/time.html", "paradigm-time")) this.fail(new Error("E: the browser blocked the timesheet window: allow popups for Paradigm"));
  }

  /** A person's name changed: offer to make their @mentions follow. */
  offerMentionRewrite(personId, before, after) {
    return rewriteMentionsOf(this, personId, before, after);
  }

  /** Rewrites the open note's text (and agenda) in place, as edits: they save as usual.
   * change(text) -> { text, changed }; returns how many changes were made. */
  rewriteOpenText(change) {
    let changed = 0;
    for (const box of [this.editor, this.agenda.id === this.currentId ? this.agendaEditor : null].filter(Boolean)) {
      const result = change(box.value);
      if (!result.changed) continue;
      box.value = result.text;
      box.dispatchEvent(new CustomEvent("change", { detail: { value: result.text } }));
      changed += result.changed;
    }
    return changed;
  }

  /** Saves another note's new text (not the open one), with its index. */
  async saveOther(note, body, agenda) {
    await this.api.save({ id: note.id, body, version: note.version, ...indexTexts({ body, agenda: agenda ?? note.agenda }) });
  }

  async saveOtherAgenda(note, agenda, body) {
    await this.meetingsApi.saveAgenda({ id: note.id, body: agenda, version: note.agenda_version,
      ...indexTexts({ body: body ?? note.body, agenda }) });
  }

  personDetails(id) {
    return personDetailsDialog(this, this.tree.get(id));
  }

  async inAreaCommand(arg) {
    const text = arg.trim();
    let areaId = null;
    if (text) {
      const found = resolveLink(this.tree, this.currentId, text);
      if (!found.note) throw new Error(explainMissing(text, found));
      areaId = found.note.id;
    }
    await this.setAreaOf(this.currentId, areaId);
  }

  /** Puts a project in an area (null: in none). */
  async setAreaOf(id, areaId) {
    const note = await this.api.setArea(id, areaId);
    if (note.id === this.currentId) this.session.updateMeta(note);
    await this.refreshTree();
    const where = areaId === null ? "in no area now" : `now in ${this.tree.get(areaId).title}`;
    this.editor.showMessage(`"${note.title}" is ${where}`);
  }

  async archiveCommand() {
    const id = this.currentId;
    if (id === null) throw new Error("E: no note is open");
    const top = topNoteOf(this.tree, id);
    if (top.id !== id) throw new Error(`E: only a whole hub is archived: this note is in "${top.title}" (open it, then :archive)`);
    if (top.archived_at) throw new Error(`E: "${top.title}" is already archived (:restore brings it back)`);
    const { note, inside } = await this.api.archive(id, true);
    this.session.updateMeta(note);
    await this.refreshTree();
    const notes = inside === 0 ? "" : ` with ${inside} note${inside === 1 ? "" : "s"}`;
    this.editor.showMessage(`"${note.title}" archived${notes} (Restore is on its menu)`);
  }

  async restoreCommand() {
    const id = this.currentId;
    if (id === null) throw new Error("E: no note is open");
    const top = topNoteOf(this.tree, id);
    if (!top.archived_at) throw new Error(`E: "${top.title}" is not archived`);
    const { note } = await this.api.archive(top.id, false);
    if (note.id === id) this.session.updateMeta(note);
    await this.refreshTree();
    this.editor.showMessage(`"${note.title}" restored to ${groupLabel(this.tree, note.id)}`);
  }

  /** :home, :people, :meetings (history "push"), or a URL with the flag ("replace", "none"). */
  showView(key, history) {
    this.views.show(key, history);
    this.redraw();
  }

  leaveView() {
    if (this.views.leave()) return;
    this.redraw();
    this.focusNote();
  }

  /** The note, or the hub panel when it is expanded over the note. */
  focusNote() {
    if (this.hubPage.editorHidden) this.hubPage.focus();
    else this.editor.focus();
  }

  navCommand() {
    this.navigator.show();
  }

  focusTree() {
    this.treeView.focus();
  }

  async exportCommand() {
    const id = this.currentId;
    if (id === null) throw new Error("E: no note is open");
    this.editor.showMessage("Exporting…");
    const { file, count } = await exportNote({ tree: this.tree, rootId: id, rootBody: this.editor.value, notesApi: this.api });
    const others = count === 0 ? "" : ` with ${count} linked note${count === 1 ? "" : "s"}`;
    this.editor.showMessage(`"${this.session.note.title}" exported${others} as ${file}`);
  }

  async trashCommand(recursive) {
    const id = this.currentId;
    const next = this.nextAfterDeleting(id);
    await this.api.remove(id, recursive);
    const title = this.session.note.title;
    this.session.close();
    await this.refreshTree();
    if (next !== null) await this.open(next, { history: "replace", discard: true });
    this.editor.showMessage(`"${title}" moved to the Trash (kept for ${this.trash.days} days)`);
  }

  /** From the Trash page: brings a note back (with the notes trashed with it) and opens it. */
  async restoreFromTrash(id) {
    let answer;
    try {
      answer = await this.trashApi.restore(id);
    } catch (error) {
      this.views.pages.trash.say(error.message);
      return;
    }
    const { note, renamed } = answer;
    await this.refreshTree();
    await this.open(note.id);
    const where = this.tree.parentId(note.id) === null ? groupLabel(this.tree, note.id) : whereText(this.tree, note.id);
    this.editor.showMessage(`"${note.title}" restored to ${where}${renamed ? " (its title was taken there)" : ""}`);
  }

  /** Where to go once a note is gone: its parent, else a sibling, else any other top note. */
  nextAfterDeleting(id) {
    const parent = this.tree.parentId(id);
    if (parent !== null) return parent;
    const other = this.tree.children(null).find((note) => note.id !== id);
    return other?.id ?? null;
  }

  // ---- errors ---------------------------------------------------------------------------

  guard(promise) {
    Promise.resolve(promise).catch((error) => this.fail(error));
  }

  fail(error) {
    const text = error?.message ?? String(error);
    this.editor.showMessage(/^E\d*:/.test(text) ? text : `E: ${text}`, { error: true });
  }
}

function groupLabel(tree, id) {
  const group = groupOf(tree, id);
  return group.kind ? group.heading : "the Inbox";
}

export function noteUrl(id) {
  return `/?note=${encodeURIComponent(id)}`;
}

function explainMissing(link, found) {
  if (found.reason === "ambiguous") return `E: more than one note is called "${link}": use a path, like /Parent/${link}`;
  if (found.reason === "bad") return `E: "${link}" is not a note name`;
  return `E: no note "${link}" (:new ${link.split("/").pop()} makes one)`;
}
