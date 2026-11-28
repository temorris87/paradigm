// The notes app, in either of its two windows (static/js/windows/note-window.js):
//   role "main"   the main window: the tree, Home, People, Meetings, the calendar, the
//                 timesheet, and the dashboards of hubs and people (their card, text, plan
//                 chart and sections). It never edits text: any other note it opens goes to
//                 the note window.
//   role "note"   the note window: the tree (a drawer), the breadcrumb and the editor on the
//                 open note, its card and sections. Pages it asks for (Home, a dashboard...)
//                 show in the main window, and the main window's Live page shows the
//                 open note as it is typed (static/js/live/).
// It owns what the editor's events mean here: saving, note commands.
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
import { TodayPage } from "../today/today-page.js";
import { todayActions } from "../today/today-actions.js";
import { hubLineControls, hubTabActions, newMeetingDialog, personDetailsDialog } from "../hubs/hub-actions.js";
import { HubPage } from "../hubs/hub-page.js";
import { showBreadcrumb } from "./breadcrumb.js";
import { registerNoteCommands, runNoteCommand } from "./commands.js";
import { NO_NOTE, liveBodyOf, screenNoteId } from "./screen-note.js";
import { headingLine } from "./headings.js";
import { groupOf, hubOf, isArchived, isHub, isPerson, topNoteOf } from "./hub-groups.js";
import { captureText, parseTaskText, toPayload, topicLines } from "./capture.js";
import { NoteCaptures } from "./capture-actions.js";
import { PrepBox } from "../hubs/prep.js";
import { triageInbox } from "../triage/triage.js";
import { ContextStrip } from "../today/context-strip.js";
import { AgendaField } from "./agenda.js";
import { mentionCompletions, rewriteMentionsOf } from "./mention-actions.js";
import { personForMention } from "./mentions.js";
import { openSelectionMenu } from "./selection-menu.js";
import { renderMarkdown } from "../markdown/index.js";
import { recordsFrom } from "../records/records-model.js";
import { NoteImages } from "./images.js";
import { newNoteDialog, openNoteMenu, whereText } from "./note-actions.js";
import { openPalette } from "../palette/palette.js";
import { rememberOpened } from "../palette/recent.js";
import { LinkIndex, indexTexts } from "./link-index.js";
import { NoteSession } from "./note-session.js";
import { resolveLink } from "./resolve.js";
import { NoteTree } from "./tree-model.js";
import { PageViews, viewLabel } from "./page-views.js";
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
import { addDays, localDay } from "../meetings/meeting-days.js";
import { openNoteWindow, showMainWindow } from "../windows/note-window.js";
import { Plan } from "../plan/plan-model.js";
import { Files } from "../files/files-model.js";
import { scanFolders } from "../files/file-commands.js";
import { newTemplateDialog } from "../templates/template-commands.js";
import { Folders } from "../resources/folders-model.js";
import { addInFolderMenu } from "../resources/folder-commands.js";
import { StatusLogs, healthOf } from "../status/status-model.js";
import { navCounts } from "../today/today-model.js";
import { Rota } from "../oncall/oncall-model.js";
import { drawPins, drawSaveState, saveStateOf } from "../layout/navigator-parts.js";

// The blocks of time loaded for the pages (a task's next block, Home's Today).
const SESSIONS_BACK_DAYS = 7;
const SESSIONS_AHEAD_DAYS = 120;

const UNSAVED = "E37: No write since last change (:w to save, or ! to drop the changes)";

export class NotesApp {
  constructor({ role = "note", editor, tree, crumbs, navigator, hub, agenda = {}, home, people, meetings, trash, goTo, api, trashApi,
                imagesApi, peopleApi, meetingsApi, recordsApi, linksApi, tasksApi = null, calendarApi = null,
                planApi = null, planTemplatesApi = null, filesApi = null, templatesApi = null, foldersApi = null, statusApi = null,
                timeApi = null, onCallApi = null, capturesApi = null, capture = {}, extraPages = {}, pins = null, saveState = null, connection = null, prep = null, contextStrip = null,
                buttons = {}, status = null, dashboard = null, location = window.location, history = window.history,
                today = () => new Date(), changes = new Changes() }) {
    this.role = role;
    // "redraw" after every redraw, "trashed" (detail.id; detail.next, the note opened next or
    // null) as the open note goes to the Trash: for the Live page's sender (live/live-sender.js).
    this.events = new EventTarget();
    this.status = status;
    this.dashboard = dashboard;
    this.planApi = planApi;
    this.planTemplatesApi = planTemplatesApi;
    this.filesApi = filesApi;
    this.templatesApi = templatesApi;
    this.foldersApi = foldersApi;
    this.statusApi = statusApi;
    this.timeApi = timeApi;
    this.onCallApi = onCallApi;
    this.onCall = new Rota();
    this.pins = pins;
    this.contextStrip = contextStrip ? new ContextStrip(contextStrip, { onOpen: (id) => this.guard(this.open(id)) }) : null;
    // The strip's bar and "left" move on with the clock.
    if (this.contextStrip) setInterval(() => this.drawContext(), 60 * 1000);
    this.prep = prep ? new PrepBox(prep, { onOpen: (id) => this.guard(this.openFromHub(id)),
      onAddAll: (lines) => this.guard(this.addToAgenda(lines)) }) : null;
    this.saveStateNode = saveState;
    this.offline = false;
    this.timeSettings = null;
    this.statusLogs = new StatusLogs();
    this.folders = new Folders();
    this.folderId = null; // the folder page's (the main window)
    this.plan = new Plan();
    this.planTemplates = [];
    this.files = new Files();
    this.templateId = null;
    this.taskId = null; // the task page's (the main window)
    this.taskNoteId = null; // its note, as the URL had it: says "in the trash" after a reload
    this.weekView = "plan"; // the Week page's Plan, Timesheet, Settings or On call
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
    this.trashButton = trash?.button ?? null;
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
      api: { ...api, save: this.announcing(this.capturing(this.linkIndex.saver(api.save,
        (note) => ({ body: note.body, agenda: this.agenda.textFor(note.id) })))) },
      onChange: () => {
        this.editor.modified = this.session.dirty;
        this.markEmptyFields();
        this.showSaveState();
      },
      onError: (error) => this.fail(error),
    });
    this.agendaEditor = agenda.editor ?? null;
    this.agenda = new AgendaField({
      editor: this.agendaEditor,
      field: agenda.field ?? null,
      api: meetingsApi ?? {},
      saver: (save) => this.announcing(this.linkIndex.saver(save, (note) => ({ body: this.editor.value, agenda: note.body }))),
      onChange: () => {
        this.markEmptyFields();
        this.showSaveState();
      },
      onError: (error) => this.fail(error),
    });
    // The server went away and came back: what wasn't saved meanwhile is saved now.
    connection?.addEventListener("lost", () => {
      this.offline = true;
      this.showSaveState();
    });
    connection?.addEventListener("connected", () => {
      const was = this.offline;
      this.offline = false;
      this.showSaveState();
      if (was) this.guard(this.saveAfterReconnect());
    });
    this.labels = hub.labels ?? {};
    this.treeView = new TreeView(tree, {
      // The drawer closes even when the note can't be opened, so the editor's message shows.
      onOpen: (id) => this.open(id).finally(() => this.navigator.hide()),
      onLeave: () => this.navigator.hide(),
      onAdd: (group, anchor) => this.guard(this.newInGroup(group, anchor)),
      onAddUnder: (id) => this.guard(newNoteDialog(this, id, { heading: `New note under "${this.tree.get(id).title}"` })),
      onOpenFolder: (id) => {
        this.navigator.hide({ refocus: false });
        this.showFolder(id);
      },
      onAddInFolder: (id, anchor) => addInFolderMenu(this, id, anchor),
      onFileAll: () => {
        this.navigator.hide({ refocus: false });
        this.guard(triageInbox(this));
      },
    });
    // The main window draws a project's plan as a chart over its sections, not as a list.
    this.dashboard?.attach(this);
    this.hubPage = new HubPage({
      ...hub,
      onOpen: (id, at) => this.guard(this.openFromHub(id, at)),
      onLeave: () => this.editor.focus(),
      controls: hubLineControls(this),
      tabActions: hubTabActions(this),
      renderSnippet: (markdown) => renderMarkdown(markdown, this.markdownOptions()),
      dashboard: role === "main",
    });
    const onPage = { onOpen: (id) => this.guard(this.open(id)), onLeave: () => this.leaveView() };
    // The pages drawn in place of a dashboard live in the main window only.
    const pages = role === "main" ? {
      home: new TodayPage(home.section, { ...onPage, today, actions: todayActions(this) }),
      people: peoplePage(people.section, { ...onPage, today, onAdd: () => this.guard(newPersonDialog(this)) }),
      meetings: meetingsPage(meetings.section, { ...onPage, today, onAdd: () => this.guard(newMeetingDialog(this)) }),
      trash: trashPage(trash.section, { onRestore: (id) => this.restoreFromTrash(id), onLeave: onPage.onLeave }),
      ...extraPages,
    } : {};
    this.views = new PageViews({ main: hub.page, pages, history, noteUrl: () => noteUrl(this.currentId) });
    for (const [key, button] of Object.entries({ home: home?.button, people: people?.button, meetings: meetings?.button,
      trash: trash?.button })) {
      button?.addEventListener("click", () => {
        this.navigator.hide({ refocus: false });
        if (this.views.shown === key) this.leaveView();
        else this.showView(key, "push");
      });
    }
    goTo?.addEventListener("click", () => this.guard(openPalette(this)));
    buttons.today?.addEventListener("click", () => {
      this.navigator.hide({ refocus: false });
      this.showView("home", "push");
    });
    buttons.week?.addEventListener("click", () => {
      this.navigator.hide({ refocus: false });
      this.calendarCommand();
    });
    buttons.palette?.addEventListener("click", () => this.guard(openPalette(this)));
    buttons.dashboard?.addEventListener("click", () => this.dashboardCommand());
    this.images = new NoteImages({ editor, api: imagesApi, currentId: () => this.currentId });
    // \t \q \d \u in the note window's editor, the captured lines' marks, the strip under it.
    this.captures = role === "note" && capturesApi && capture.sheet
      ? new NoteCaptures(this, { api: capturesApi, sheet: capture.sheet, strip: capture.strip ?? null }) : null;
    registerNoteCommands(editor);
    if (this.agendaEditor) registerNoteCommands(this.agendaEditor);
    editor.completions = mentionCompletions(this);
    if (this.agendaEditor) this.agendaEditor.completions = editor.completions;
    this.listen();
  }

  get currentId() {
    return this.session.note?.id ?? null;
  }

  /** The note on screen, which the note commands act on (screen-note.js): in the main window
   * a page over the dashboard hides currentId; Live shows the note window's note. */
  screenNoteId() {
    return screenNoteId(this);
  }

  /** A note's saved fields changed: the open note's session takes them too. */
  updateMetaIfOpen(note) {
    if (note.id === this.currentId) this.session.updateMeta(note);
  }

  /** A note command changed a note: this window's tree, then the other window's. On Live the
   * note is the note window's, which shows its title and place only from its own tree. */
  async noteChanged(what = ["notes"]) {
    await this.refreshTree();
    this.changes.send({ type: "changed", what });
  }

  listen() {
    const editor = this.editor;
    editor.addEventListener("change", (event) => {
      // Only the editor's own change: a docked panel's input (the capture sheet) is a child of
      // <pd-editor>, so its native change bubbles here too, with no detail.
      if (event.target === editor && event.detail) this.session.edited(event.detail.value);
    });
    editor.addEventListener("save", (event) => this.saveCommand(Boolean(event.detail.force)));
    editor.addEventListener("files", (event) => this.guard(this.images.add(event.detail)));
    for (const box of [editor, this.agendaEditor].filter(Boolean)) {
      box.addEventListener("quit", () => box.showMessage("Nothing to close here: closing the tab stops Paradigm"));
      box.addEventListener("ex", (event) => this.guard(runNoteCommand(this, event.detail)));
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
    window.addEventListener("popstate", () => {
      // A message about the page left behind (an error on it) would read as about this one.
      this.clearStatus();
      this.guard(this.openFromUrl("none"));
    });
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

  /** A message from the app's other window (connection/changes.js): the main window asks the
   * note window to open a note; the note window asks the main window for a dashboard or a page. */
  async onMessage(message) {
    if (message.type === "open" && message.to === "note" && this.role === "note") {
      await this.refreshTree();
      if (!this.tree.has(message.id)) return;
      await this.openFromHub(message.id, message.at ?? null);
      window.focus();
    } else if (message.type === "show" && message.to === "main" && this.role === "main") {
      await this.refreshTree();
      if (this.tree.has(message.id)) await this.open(message.id);
    } else if (message.type === "view" && message.to === "main" && this.role === "main") {
      if (message.key === "folder") {
        await this.refreshTree();
        this.showFolder(message.folderId);
      } else if (message.key === "task") {
        // id is the task's here, not a hub's: showTask opens the dashboard under it.
        await this.refreshTree();
        await this.showTask(message.id);
      } else if (this.views.pages[message.key] || ["calendar", "time", "oncall"].includes(message.key)) {
        // A page about one hub (its plan) opens that hub's dashboard under it first.
        if (message.id !== undefined) {
          await this.refreshTree();
          if (this.tree.has(message.id)) await this.open(message.id);
        }
        this.showView(message.key, "push");
      }
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
    // Trashed in the other window: fetching it would only report "No such note".
    if (!this.tree.has(id)) {
      await this.leaveTrashed();
      return;
    }
    const note = await this.api.get(id);
    const agendaChanged = note.agenda_version !== undefined && this.agenda.id === id
      && note.agenda_version !== this.agenda.session.note?.version;
    if (note.version === this.session.note?.version && !agendaChanged) return;
    // switchTo, not open: open() leaves a page shown in the main window (the Live page, while
    // this hub is typed in the note window), and a reload must not move the window anywhere.
    await this.switchTo(id, { discard: true, history: "none", heading: "" });
  }

  /** The note shown here went to the Trash from the other window. A page over it (a task
   * page, Live) says so itself; a bare dashboard (or the note window's note) would be left
   * empty, so move to its parent's dashboard (or the first top-level one) and say so. */
  async leaveTrashed() {
    if (this.views?.shown) return;
    const gone = this.session.note;
    const next = this.dashboardAfter(gone?.parent_id ?? null, gone?.id ?? null);
    // The same quiet path as trashCommand: in the note window, the dashboard that opens next
    // is not news for the Live page, so the main window stays where it is.
    this.events.dispatchEvent(new CustomEvent("trashed", { detail: { id: gone?.id ?? this.currentId, next } }));
    this.session.close();
    if (next !== null) await this.switchTo(next, { discard: true, history: "replace", heading: "" });
    else this.showNoNote();
    this.say(`"${gone?.title ?? "The note"}" was moved to the Trash`);
  }

  /** A save sends the note's "@Name ?" topic lines (capture.js); T:/D:/Q: lines are plain
   * text now (a capture is made by key: capture-actions.js). */
  capturing(save) {
    return async (note, options) => {
      const found = topicLines(note.body, this.tree);
      const captures = found.length ? found.map(toPayload) : undefined;
      const result = await save({ ...note, captures }, options);
      if (result?.captured) {
        this.changes.send({ type: "changed", what: ["topics"] });
        await this.refreshTree();
        this.say(`${result.captured} captured`);
      }
      return result;
    };
  }

  /** A save that tells the other windows once it is stored. */
  announcing(save) {
    return (note, options) => {
      const saving = save(note, options);
      saving.then(() => this.changes.send({ type: "changed", what: ["notes"] }), () => {});
      return saving;
    };
  }

  /** Loads the tree and opens what the URL asks for; `started` holds the promise. */
  start() {
    this.started = this.startUp();
    return this.started;
  }

  async startUp() {
    await this.refreshTree();
    await this.openFromUrl("replace");
    this.focusNote();
  }

  async openFromUrl(history) {
    const params = new URLSearchParams(this.location.search);
    const wanted = Number(params.get("note"));
    if (this.role === "main") return this.mainFromUrl(params, wanted, history);
    const id = this.tree.has(wanted) ? wanted : this.tree.children(null)[0]?.id;
    if (id === undefined) return;
    const opened = await this.open(id, { history });
    if (!opened && history === "none") this.history.pushState({}, "", noteUrl(this.currentId));
    // Opened at a line (a mention, from the main window): the cursor goes there.
    const line = params.get("line");
    if (opened && line !== null && history === "replace") {
      const box = params.get("field") === "agenda" && this.agendaEditor && this.agenda.id === id ? this.agendaEditor : this.editor;
      box.goToLine(Number(line));
    }
  }

  /** The main window shows a dashboard (a hub's, a person's) or a page; any other note asked
   * for shows its hub, or Home when it has none. With nothing asked, Home. */
  async mainFromUrl(params, wanted, history) {
    const asked = this.tree.has(wanted) ? wanted : null;
    // A plain note (bookmarked, typed, or reached by Back): the window never shows it itself.
    const plain = asked !== null && !this.isDashboard(asked) ? asked : null;
    const hub = plain !== null ? hubOf(this.tree, plain)?.id ?? null : null;
    const id = asked !== null && plain === null ? asked
      : hub ?? this.tree.children(null).find((note) => this.isDashboard(note.id))?.id ?? this.tree.children(null)[0]?.id;
    if (id === undefined) return;
    if (params.has("template")) this.templateId = Number(params.get("template"));
    if (params.has("folder")) this.folderId = Number(params.get("folder"));
    if (params.has("task")) {
      this.taskId = Number(params.get("task"));
      this.taskNoteId = Number.isInteger(wanted) && wanted > 0 ? wanted : null;
    }
    this.weekView = params.has("time") ? "timesheet" : ["timesheet", "settings", "oncall"].includes(params.get("week")) ? params.get("week") : "plan";
    const flagged = this.views.fromUrl(params);
    // Only the asked note's own dashboard, or its hub's, may show it; anything else is Home,
    // never the first dashboard found, which a note command would then act on unseen.
    const view = flagged ?? (asked !== null && (plain === null || hub !== null) ? null : "home");
    // The address must name what is shown, even after Back or Forward ("none"): a note that
    // isn't on screen left in it would be the one a reload brings back.
    const rewrite = flagged === null && params.has("note") && asked !== id;
    const opened = await this.open(id, { history: view || rewrite ? "none" : history });
    if (view) this.showView(view, history === "replace" || rewrite ? "replace" : "none");
    else if (rewrite && opened) this.history.replaceState({}, "", noteUrl(this.currentId));
    if (plain === null || flagged !== null) return;
    if (!view) this.hubPage.selectNote?.(plain);
    this.say(`"${this.tree.get(plain).title}" is a note: Enter on it opens the note window`);
  }

  /** Whether the main window shows a note itself (a dashboard): a hub or a person. */
  isDashboard(id) {
    return isHub(this.tree, id) || isPerson(this.tree, id);
  }

  /** The main window: a note in the note window (placed by the screen, see note-window.js). */
  openInNoteWindow(id, at = null) {
    if (!openNoteWindow(id, { at, changes: this.changes })) {
      throw new Error("E: the browser blocked the note window: allow popups for Paradigm (127.0.0.1)");
    }
    this.say(`"${this.tree.get(id)?.title ?? ""}" is open in the note window`);
    // Any note opened in the note window shows on the Live page here (live/live-page.js).
    if (this.views.pages.live) this.showView("live", "push");
    return true;
  }

  async refreshTree() {
    const today = this.today();
    this.captures?.invalidate();
    const [notes, people, meetings, records, trash, , tasks, sessions, importStatus, plan, planTemplates, files, folders, status, timeSettings, topics, onCall] = await Promise.all([
      this.api.list(), this.peopleApi.list(), this.meetingsApi.list(), this.recordsApi.list(),
      this.trashApi.list(), this.linkIndex.refresh(), this.tasksApi?.list() ?? [],
      this.tasksApi?.sessions(localDay(addDays(today, -SESSIONS_BACK_DAYS)), localDay(addDays(today, SESSIONS_AHEAD_DAYS))) ?? [],
      this.calendarApi?.status().catch(() => null) ?? null,
      this.planApi?.list() ?? undefined, this.planTemplatesApi?.list() ?? [], this.filesApi?.list() ?? undefined,
      this.foldersApi?.list() ?? [], this.statusApi?.list() ?? null, this.timeApi?.settings().catch(() => null) ?? null,
      this.peopleApi.topics?.() ?? [], this.onCallApi?.list().catch(() => []) ?? [],
    ]);
    this.onCall = new Rota(onCall);
    this.topics = topics;
    this.timeSettings = timeSettings;
    this.statusLogs = new StatusLogs(status?.logs ?? [], status?.stale_days);
    this.folders = new Folders(folders);
    this.plan = new Plan(plan);
    this.planTemplates = planTemplates;
    this.files = new Files(files);
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

  /** Opens a note. Returns false (and says why) when the open note's changes can't be saved.
   * In the main window, a note that isn't a dashboard opens in the note window. */
  async open(id, { history = "push", discard = false, heading = "", at = null } = {}) {
    if (this.role === "main" && !this.isDashboard(id)) return this.openInNoteWindow(id, at);
    const fresh = id !== this.currentId;
    // Opening a note (from the People page, Back, a link...) puts the note back in view.
    const leftView = Boolean(this.views.shown);
    if (leftView) {
      this.views.hide();
      if (history === "push" && id === this.currentId) this.history.pushState({}, "", noteUrl(id));
      // switchTo skips the note already open, so the view's flag must leave the URL here
      // (:trash on Live goes back to the hub under the page).
      if (history === "replace" && id === this.currentId) this.history.replaceState({}, "", noteUrl(id));
    }
    const result = await this.switchTo(id, { history, discard, heading });
    // The open note's changes couldn't be saved: it stays, but the URL must leave the view.
    if (leftView && !result && history === "push") this.history.pushState({}, "", noteUrl(this.currentId));
    if (leftView) {
      this.redraw();
      this.focusNote();
    }
    if (result) rememberOpened(id);
    // A hub's linked folders are read again when its dashboard opens: new files show up.
    if (result && fresh && this.role === "main" && this.filesApi && isHub(this.tree, id)) this.guard(scanFolders(this, id));
    return result;
  }

  async switchTo(id, { history, discard, heading }) {
    if (id !== this.currentId || discard) {
      if (!discard && !(await this.saveBeforeSwitching())) return false;
      const note = await this.api.get(id);
      this.session.open(note);
      this.editor.readOnly = false;
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
    this.captures?.sync(id);
    // While a page (Home, Calendar...) is shown, no tree row is the current one.
    const now = this.today();
    const health = new Map(this.tree.children(null).filter((note) => note.kind === "project" && !note.archived_at)
      .map((note) => {
        const state = healthOf(this.statusLogs, note, now);
        return [note.id, { key: state.key, stale: state.stale || (state.never && state.key !== "on_hold"), age: state.age }];
      }));
    this.treeView.show(this.tree, id, { marked: !this.views.shown, folders: this.folders, health });
    this.drawPins(now);
    showBreadcrumb(this.crumbs, this.tree, id, (target) => this.guard(this.open(target)),
      (button) => openNoteMenu(this, button));
    const ctx = { tree: this.tree, people: this.people, meetings: this.meetings, records: this.records,
      links: this.linkIndex.links, mentions: this.linkIndex.mentions, trash: this.trash, tasks: this.tasks,
      sessions: this.sessions, importStatus: this.importStatus, plan: this.plan, planTemplates: this.planTemplates,
      files: this.files, templateId: this.templateId, folders: this.folders, folderId: this.folderId, taskId: this.taskId, taskNoteId: this.taskNoteId, statusLogs: this.statusLogs,
      timeSettings: this.timeSettings, topics: this.topics ?? [], onCall: this.onCall, today: this.today(),
      captures: { source: id, list: this.captures?.of(id) ?? [] } };
    const trashed = this.trash.entries.length;
    if (this.trashButton) this.trashButton.textContent = trashed ? `Trash · ${trashed}` : "Trash";
    this.hubPage.show(ctx, id);
    this.dashboard?.show(ctx, this.tree.get(id) ?? null, this.session.note?.body ?? "", Boolean(this.views.shown));
    this.views.draw(ctx, this.crumbs);
    // A page shown over the note names the tab, not the note under it.
    const title = this.views.shown ? viewLabel(this.views.shown) : this.tree.get(id)?.title ?? this.session.note?.title;
    document.title = title ? `${title} - Paradigm` : "Paradigm";
    this.editor.hints = { cmdline: (text) => this.cmdlineHint(text) };
    this.prep?.show(ctx, this.tree.get(id) ?? null);
    this.drawContext();
    this.markEmptyFields();
    this.events.dispatchEvent(new Event("redraw"));
  }

  /** The navigator's Today and Week rows, with what is overdue and what is free this week. */
  drawPins(now) {
    if (!this.pins) return;
    const counts = navCounts({ tree: this.tree, meetings: this.meetings, records: this.records, tasks: this.tasks,
      sessions: this.sessions, timeSettings: this.timeSettings }, now);
    const active = this.role === "main" && (this.views.shown === "home" || this.views.shown === "week") ? this.views.shown : null;
    drawPins(this.pins, { ...counts, active,
      onToday: () => {
        this.navigator.hide({ refocus: false });
        this.showView("home", "push");
      },
      onWeek: () => {
        this.navigator.hide({ refocus: false });
        this.calendarCommand();
      } });
  }

  /** The navigator's foot (the note window): whether the open note's changes are saved. */
  showSaveState() {
    if (!this.saveStateNode || !this.session) return;
    const sessions = [this.session, this.agenda?.session].filter(Boolean);
    drawSaveState(this.saveStateNode, saveStateOf({
      dirty: sessions.some((each) => each.dirty), saving: sessions.some((each) => each.saving),
      failed: sessions.some((each) => each.failed), offline: this.offline, conflict: sessions.some((each) => each.conflict),
    }));
  }

  async saveAfterReconnect() {
    if (this.session.dirty && !this.session.conflict) await this.session.save();
    if (this.agenda?.dirty) await this.agenda.save();
    if (!this.session.dirty) this.say("Back: your changes are saved");
  }

  /** The renderer's options: wiki links resolve from fromId (the nearest note wins). */
  markdownOptions(fromId = this.currentId) {
    return {
      resolveWikiLink: (link) => this.wikiHref(link, fromId),
      resolveMention: (name) => {
        const person = personForMention(this.tree, name);
        return person ? { href: noteUrl(person.id), archived: isArchived(this.tree, person.id) } : null;
      },
    };
  }

  /** The open note's captures, for the Live page: a chip after each captured line (from the
   * captures, capture-model.js); a decision or question made from its text otherwise (the
   * right-click menu's) gets its badge after the text it was made from. */
  highlightsOf(id) {
    if (id === null) return [];
    const labels = { decision: "Decision", question: "Question" };
    const captures = this.captures?.of(id) ?? [];
    const captured = new Set(captures.filter((capture) => capture.kind !== "task").map((capture) => capture.id));
    const records = recordsFrom(this.tree, this.records, id).filter((record) => record.quote && !captured.has(record.id)).map((record) => ({
      text: record.quote,
      label: record.kind === "question" && record.answered ? "Answered" : labels[record.kind],
      title: `${labels[record.kind]}: ${this.tree.get(record.id).title} (click to open)`,
      data: record.id,
      kind: record.kind,
    }));
    return [...(this.captures?.highlights(id) ?? []), ...records];
  }

  drawContext() {
    this.contextStrip?.show({ tree: this.tree, meetings: this.meetings, tasks: this.tasks, sessions: this.sessions }, this.today());
  }

  /** The Prep box's Add all to agenda: lines at the end of the open meeting's agenda. */
  async addToAgenda(lines) {
    const box = this.agendaEditor;
    if (!box || this.agenda.id !== this.currentId) throw new Error("E: open the meeting to add to its agenda");
    const text = box.value.replace(/\s+$/, "");
    const fresh = lines.filter((line) => !text.includes(line));
    if (!fresh.length) return this.say("Already on the agenda");
    box.value = text ? `${text}\n${fresh.join("\n")}` : fresh.join("\n");
    box.dispatchEvent(new CustomEvent("change", { detail: { value: box.value } }));
    this.say(`${fresh.length} added to the agenda`);
    return undefined;
  }

  /** While :t is typed: what task it will make, and where. */
  cmdlineHint(text) {
    const match = /^:t!?\s+(.+)$/.exec(text);
    if (!match || this.currentId === null) return "";
    const parsed = parseTaskText(match[1], this.tree, this.today());
    if (!parsed.title) return "";
    const owner = hubOf(this.tree, this.currentId) ?? this.tree.get(this.currentId);
    return `${captureText({ kind: "task", ...parsed }, this.today())} · on ${owner?.title ?? "this note"}: “${parsed.title}”`;
  }

  /** The labels over the text boxes show their hint while the box is empty. */
  markEmptyFields() {
    if (this.labels.main) this.labels.main.dataset.empty = String(!this.editor.value.trim());
    if (this.labels.agenda && this.agendaEditor) this.labels.agenda.dataset.empty = String(!this.agendaEditor.value.trim());
  }

  wikiHref(link, fromId = this.currentId) {
    if (!link.target) return null;
    const found = resolveLink(this.tree, fromId, link.target);
    if (!found.note) return { href: null, exists: false };
    return { href: noteUrl(found.note.id), exists: true, archived: isArchived(this.tree, found.note.id) };
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
      this.say(`"${this.session.note?.title ?? ""}" saved`);
    } catch (error) {
      this.fail(error);
    }
  }

  async editCommand(arg, bang) {
    if (!arg.trim()) {
      if (this.session.dirty && !bang) throw new Error(UNSAVED);
      await this.open(this.currentId, { discard: true, history: "none" });
      this.say(`"${this.session.note.title}" loaded from the database`);
      return;
    }
    const found = resolveLink(this.tree, this.currentId, arg);
    if (!found.note) throw new Error(explainMissing(arg, found));
    await this.open(found.note.id, { discard: bang });
  }

  async createCommand(title, where) {
    if (!title.trim()) throw new Error("E471: Argument required: the new note's title");
    // The note on screen, not the hub a main-window page hides; none open at all (an empty
    // database) is the same refusal as a page with no note.
    const id = this.screenNoteId();
    if (id === null) throw new Error(NO_NOTE);
    const parentId = where === "under" ? id : this.tree.parentId(id);
    await this.createAndOpen(parentId, title);
  }

  /** strict (from a dialog): an open note that can't be saved first is an error to show there. */
  async createAndOpen(parentId, title, { strict = false, make = null } = {}) {
    if (!(await this.saveBeforeSwitching())) {
      if (strict) throw new Error("This note's changes could not be saved first");
      return;
    }
    const note = make ? await make() : await this.api.create(parentId, title);
    await this.refreshTree();
    await this.open(note.id);
    this.say(`"${note.title}" made at ${this.tree.pathText(note.id)}`);
  }

  /** Makes a top-level note filed as kind (a project, area or resource) and opens it; areaId
   * puts a new project in an area; timeCode is its timesheet code; folderId a resource in a
   * folder. From a dialog: errors are thrown for it to show. */
  async createFiled(kind, title, { areaId = null, timeCode = "", folderId = null } = {}) {
    if (!(await this.saveBeforeSwitching())) throw new Error("This note's changes could not be saved first");
    const made = await this.api.create(null, title);
    await this.api.setKind(made.id, kind);
    if (folderId !== null) await this.foldersApi.putNote(made.id, folderId);
    if (areaId !== null) await this.api.setArea(made.id, areaId);
    if (timeCode) await this.api.setTimeCode(made.id, timeCode);
    await this.refreshTree();
    await this.open(made.id);
    const where = areaId === null ? groupLabel(this.tree, made.id) : `${groupLabel(this.tree, made.id)}, in ${this.tree.get(areaId).title}`;
    this.say(`"${made.title}" made in ${where}`);
  }

  /** The + on a tree group: a new note there (a person in People; in Resources, a note or a
   * folder). */
  newInGroup(group, anchor = null) {
    if (group.folders && anchor) return addInFolderMenu(this, null, anchor);
    if (group.kind === "person") return newPersonDialog(this);
    if (group.kind === "template") return newTemplateDialog(this);
    return newNoteDialog(this, null, { heading: addLabel(group), kind: group.kind,
      label: "Title" });
  }

  async renameCommand(title) {
    if (!title.trim()) throw new Error("E471: Argument required: the new title");
    const note = await this.api.rename(this.screenNoteId(), title);
    this.updateMetaIfOpen(note);
    await this.noteChanged();
    this.say(`Renamed to "${note.title}"`);
  }

  async parentCommand(arg) {
    const text = arg.trim();
    if (!text) throw new Error("E471: Argument required: the note to put this one under, or /");
    let parentId = null;
    if (text !== "/") {
      const found = resolveLink(this.tree, this.screenNoteId(), text);
      if (!found.note) throw new Error(explainMissing(text, found));
      parentId = found.note.id;
    }
    await this.moveUnder(parentId);
  }

  /** Puts the note on screen under another note (null: the top level). */
  async moveUnder(parentId) {
    const note = await this.api.move(this.screenNoteId(), parentId);
    this.updateMetaIfOpen(note);
    await this.noteChanged();
    this.say(`Now at ${this.tree.pathText(note.id)}`);
  }

  async kindCommand(group) {
    const id = this.screenNoteId();
    if (id === null) throw new Error("E: no note is open");
    const wasNested = this.tree.parentId(id) !== null;
    const note = await this.api.setKind(id, group.kind);
    this.updateMetaIfOpen(note);
    await this.noteChanged();
    const moved = wasNested ? " moved to the top level and" : "";
    this.say(`"${note.title}"${moved} is now ${group.asWhat}`);
  }

  /** Opens a note from a section row; at: { field, line } puts the cursor there (a mention). */
  async openFromHub(id, at = null) {
    if (this.role === "main" && !this.isDashboard(id)) return this.openInNoteWindow(id, at);
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
    this.say(`"${note.title}" is ${status === "on_hold" ? "on hold" : "active"}`);
  }

  async setProjectDue(id, due) {
    const note = await this.api.setDue(id, due);
    await this.refreshTree();
    this.say(due ? `"${note.title}" is due ${due}` : `"${note.title}" has no due date`);
  }

  /** A project's or an area's timesheet code ("" for none). */
  async setTimeCode(id, code) {
    const note = await this.api.setTimeCode(id, code);
    await this.refreshTree();
    this.changes.send({ type: "changed", what: ["notes"] });
    this.say(note.time_code ? `"${note.title}" books time to ${note.time_code}` : `"${note.title}" has no time code`);
  }

  /** :calendar, gw: the Week page's Plan in the main window. */
  calendarCommand() {
    this.showView("calendar", "push");
  }

  /** :oncall: the Week page's On call (the rota) in the main window. */
  onCallCommand() {
    this.showView("oncall", "push");
  }

  /** :time: the Week page's Timesheet in the main window. */
  timeCommand() {
    this.showView("time", "push");
  }

  /** :dashboard, the Dashboard button (the note window): the open note's hub (or person) on
   * the main window. */
  dashboardCommand() {
    const id = this.screenNoteId();
    const target = id === null ? null : this.isDashboard(id) ? id : hubOf(this.tree, id)?.id ?? null;
    if (this.role === "main") {
      if (target !== null) this.guard(this.open(target));
      return;
    }
    if (target === null) showMainWindow({ type: "view", key: "home" }, this.changes);
    else showMainWindow({ type: "show", id: target }, this.changes);
  }

  /** A folder's page (the main window): from the note window, it shows there. */
  showFolder(folderId) {
    if (this.role !== "main") {
      showMainWindow({ type: "view", key: "folder", folderId }, this.changes);
      return;
    }
    this.folderId = folderId;
    this.views.show("folder", "push", `folder=${folderId}`);
    this.redraw();
  }

  /** A folder was made, renamed, moved or trashed (or a note moved between them): every
   * window shows it. gone: a trashed folder, whose page then leaves for Home. */
  async folderChanged(message, { gone = null } = {}) {
    await this.refreshTree();
    this.changes.send({ type: "changed", what: ["notes"] });
    if (gone !== null && this.views.shown === "folder" && !this.folders.has(this.folderId)) this.showView("home", "push");
    this.say(message);
  }

  /** gp, Gantt ↗: the full plan of a project or an area (of the hub a note is in), in the
   * main window over its dashboard. */
  async showPlan(id = this.currentId) {
    const top = id === null || id === undefined ? null : topNoteOf(this.tree, id);
    if (!top || (top.kind !== "project" && top.kind !== "area")) throw new Error("E: a plan belongs to a project or an area");
    if (this.role !== "main") {
      showMainWindow({ type: "view", key: "plan", id: top.id }, this.changes);
      return;
    }
    if (this.currentId !== top.id) await this.open(top.id);
    this.showView("plan", "push");
  }

  /** gp in the main window: the plan of the dashboard shown (already there on the plan page;
   * any other page has no dashboard under it to take a plan from). */
  async planKey() {
    if (this.views.shown === "plan") return;
    if (this.views.shown) throw new Error("E: gp: open a project's or area's dashboard first");
    await this.showPlan();
  }

  /** A task's page (the main window), over its note's dashboard (the note itself when it is
   * one, else its hub): from the note window, it shows there. The dashboard is a step of its
   * own, so Back (Escape) returns to it, wherever the task was opened from; from a task's page
   * (a subtask, a crumb) the new page takes the URL's place. */
  async showTask(taskId) {
    if (this.role !== "main") {
      showMainWindow({ type: "view", key: "task", id: taskId }, this.changes);
      return;
    }
    const task = this.tasks.get(taskId);
    if (!task) throw new Error("E: that task is gone (deleted in another window?)");
    const under = this.isDashboard(task.note_id) ? task.note_id : hubOf(this.tree, task.note_id)?.id ?? null;
    const fromTaskPage = this.views.shown === "task";
    const needsOpen = under !== null && (under !== this.currentId || (!fromTaskPage && this.views.shown));
    if (needsOpen && !(await this.open(under, { history: fromTaskPage ? "none" : "push" }))) return;
    this.taskId = taskId;
    this.taskNoteId = task.note_id;
    this.views.show("task", "push", `task=${taskId}`);
    this.redraw();
  }

  /** A plan template's page (the main window). */
  showTemplate(templateId) {
    if (this.role !== "main") {
      showMainWindow({ type: "view", key: "template" }, this.changes);
      return;
    }
    this.templateId = templateId;
    this.views.show("template", "push", `template=${templateId}`);
    this.redraw();
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
      const found = resolveLink(this.tree, this.screenNoteId(), text);
      if (!found.note) throw new Error(explainMissing(text, found));
      areaId = found.note.id;
    }
    await this.setAreaOf(this.screenNoteId(), areaId);
  }

  /** Puts a project in an area (null: in none). */
  async setAreaOf(id, areaId) {
    const note = await this.api.setArea(id, areaId);
    this.updateMetaIfOpen(note);
    await this.noteChanged();
    const where = areaId === null ? "in no area now" : `now in ${this.tree.get(areaId).title}`;
    this.say(`"${note.title}" is ${where}`);
  }

  async archiveCommand() {
    const id = this.screenNoteId();
    if (id === null) throw new Error("E: no note is open");
    const top = topNoteOf(this.tree, id);
    if (top.id !== id) throw new Error(`E: only a whole hub is archived: this note is in "${top.title}" (open it, then :archive)`);
    if (top.archived_at) throw new Error(`E: "${top.title}" is already archived (:restore brings it back)`);
    const { note, inside } = await this.api.archive(id, true);
    this.updateMetaIfOpen(note);
    await this.noteChanged();
    const notes = inside === 0 ? "" : ` with ${inside} note${inside === 1 ? "" : "s"}`;
    this.say(`"${note.title}" archived${notes} (Restore is on its menu)`);
  }

  async restoreCommand() {
    const id = this.screenNoteId();
    if (id === null) throw new Error("E: no note is open");
    const top = topNoteOf(this.tree, id);
    if (!top.archived_at) throw new Error(`E: "${top.title}" is not archived`);
    const { note } = await this.api.archive(top.id, false);
    this.updateMetaIfOpen(note);
    await this.noteChanged();
    this.say(`"${note.title}" restored to ${groupLabel(this.tree, note.id)}`);
  }

  /** :home, :people, :meetings (history "push"), or a URL with the flag ("replace", "none"). */
  showView(key, history) {
    // The note window has no pages: they show in the main window.
    if (this.role === "note") {
      showMainWindow({ type: "view", key }, this.changes);
      return;
    }
    // The calendar, the timesheet and the rota are the Week page's Plan, Timesheet and On call.
    if (key === "calendar" || key === "time" || key === "oncall") {
      this.weekView = key === "time" ? "timesheet" : key === "oncall" ? "oncall" : "plan";
      key = "week";
    }
    // A page about one thing keeps which one in its URL flag.
    const flag = key === "folder" ? `folder=${this.folderId}` : key === "template" ? `template=${this.templateId}`
      : key === "task" ? `task=${this.taskId}` : key === "week" && this.weekView !== "plan" ? `week=${this.weekView}` : key;
    this.views.show(key, history, flag);
    this.redraw();
  }

  leaveView() {
    // A main window with no dashboard to go back to stays on Home.
    if (this.role === "main" && !this.isDashboard(this.currentId)) {
      if (this.views.shown !== "home") this.showView("home", "push");
      return;
    }
    if (this.views.leave()) return;
    this.redraw();
    this.focusNote();
  }

  /** The note, or the hub panel when it is expanded over the note. */
  focusNote() {
    if (this.role === "main") {
      if (this.views.shown) this.views.pages[this.views.shown].focus();
      else if (this.dashboard?.hasChart) this.dashboard.focus();
      else this.hubPage.focus();
    } else if (this.hubPage.editorHidden) this.hubPage.focus();
    else this.editor.focus();
  }

  navCommand() {
    this.navigator.show();
  }

  focusTree() {
    this.treeView.focus();
  }

  async exportCommand() {
    const id = this.screenNoteId();
    if (id === null) throw new Error("E: no note is open");
    this.say("Exporting…");
    // The editor holds the open note's text; the Live page holds the note window's as typed
    // there, which may be ahead of its last save.
    const rootBody = id === this.currentId ? this.editor.value
      : liveBodyOf(this, id) ?? (await this.api.get(id)).body;
    const { file, count } = await exportNote({ tree: this.tree, rootId: id, rootBody, notesApi: this.api });
    const others = count === 0 ? "" : ` with ${count} linked note${count === 1 ? "" : "s"}`;
    this.say(`"${this.tree.get(id)?.title ?? ""}" exported${others} as ${file}`);
  }

  async trashCommand(recursive) {
    // The note on screen: on Live, the note window's note, not the hub under the page.
    const id = this.screenNoteId();
    // With no hub left the main window shows no note: say so, rather than send id null.
    if (id === null) throw new Error("E: no note is open");
    // The main window goes to a dashboard: a plain note would open in the note window and
    // pull this window to the Live page.
    // The server refuses this too (409), but asking it shows up as a failed load in the
    // browser's console; the tree already knows. The server stays the authority on the rest.
    if (!recursive && this.tree.children(id).length > 0) {
      throw new Error("E: The note has notes under it: :trash! deletes them too");
    }
    const next = this.role === "main" ? this.dashboardAfter(this.tree.parentId(id), id) : this.nextAfterDeleting(id);
    await this.api.remove(id, recursive);
    this.events.dispatchEvent(new CustomEvent("trashed", { detail: { id, next } }));
    const title = this.tree.get(id)?.title ?? this.session.note?.title ?? "";
    if (id === this.currentId) this.session.close();
    await this.refreshTree();
    // The other window may show a page about this note (a task page): it redraws on this.
    this.changes.send({ type: "changed", what: ["notes", "tasks"] });
    // Only the trashed note's edits are thrown away: on Live, the hub under the page is
    // another note, whose unsaved edits are saved as usual.
    if (next !== null) await this.open(next, { history: "replace", discard: id === this.currentId });
    // No dashboard left: Home, rather than the gone note's page with nothing behind it.
    else if (this.role === "main") this.showView("home", "push");
    else this.showNoNote();
    this.say(`"${title}" moved to the Trash (kept for ${this.trash.days} days)`);
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
    this.changes.send({ type: "changed", what: ["notes", "tasks"] });
    await this.open(note.id);
    const where = this.tree.parentId(note.id) === null ? groupLabel(this.tree, note.id) : whereText(this.tree, note.id);
    this.say(`"${note.title}" restored to ${where}${renamed ? " (its title was taken there)" : ""}`);
  }

  /** Nothing left to open after a trash: the gone note's text would stay in the editor, and
   * what is typed there would save nowhere, so the editor empties and takes no typing until a
   * note opens (switchTo). */
  showNoNote() {
    if (this.role === "main") return;
    this.editor.value = "";
    this.editor.readOnly = true;
    this.agenda?.open({});
    this.redraw();
  }

  /** The dashboard to show once a note under parent (gone, if given) leaves: the parent's
   * (the parent itself, else its hub), else the first top-level one. Null when there is none. */
  dashboardAfter(parent, gone = null) {
    const near = parent !== null && parent !== gone && this.tree.has(parent)
      ? (this.isDashboard(parent) ? parent : hubOf(this.tree, parent)?.id ?? null) : null;
    if (near !== null && near !== gone) return near;
    return this.tree.children(null).find((note) => note.id !== gone && this.isDashboard(note.id))?.id ?? null;
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
    this.say(/^E\d*:/.test(text) ? text : `E: ${text}`, { error: true });
  }

  /** Empties the main window's status line; the note window's is the editor's own. */
  clearStatus() {
    if (this.role !== "main" || !this.status) return;
    clearTimeout(this.statusTimer);
    this.status.textContent = "";
    this.status.classList.remove("status-line--error");
  }

  /** A message for the user: the editor's status line, or the main window's. */
  say(text, { error = false } = {}) {
    if (this.role === "main" && this.status) {
      this.status.textContent = text;
      this.status.classList.toggle("status-line--error", error);
      clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => {
        this.status.textContent = "";
      }, error ? 12000 : 6000);
    } else {
      this.editor.showMessage(text, { error });
    }
  }
}

function groupLabel(tree, id) {
  const group = groupOf(tree, id);
  return group.kind ? group.heading : "the Inbox";
}

// The page a note's URL points at: the main window's (/) or the note window's (/note.html).
let notePath = "/";

export function setNotePath(path) {
  notePath = path;
}

export function noteUrl(id) {
  // No note open (none made yet, or the last one trashed): no ?note=null in the address.
  if (id === null || id === undefined) return notePath;
  return `${notePath}?note=${encodeURIComponent(id)}`;
}

function explainMissing(link, found) {
  if (found.reason === "ambiguous") return `E: more than one note is called "${link}": use a path, like /Parent/${link}`;
  if (found.reason === "bad") return `E: "${link}" is not a note name`;
  return `E: no note "${link}" (:new ${link.split("/").pop()} makes one)`;
}
