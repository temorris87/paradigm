// The notes page: the tree, the breadcrumb and the editor on the open note, kept in step.
// It owns what the editor's events mean here: saving, following [[links]], note commands.
//
//   const app = new NotesApp({ editor, tree: ulElement, crumbs: navElement, navigator,
//                              hub: { page, line, section }, home: { section, button },
//                              people: { section, button }, meetings: { section, button },
//                              api: notesApi, imagesApi, peopleApi, meetingsApi, recordsApi,
//                              linksApi });
//
// navigator (static/js/layout/navigator.js) holds the tree: a drawer on narrow windows.
// hub (static/js/hubs/hub-page.js) is the hub line and section panel shown on a hub.
// home, people and meetings are the Home, People and Meetings pages (static/js/home/,
// static/js/people/people-page.js, static/js/meetings/meetings-page.js), drawn in place of
// the note while the URL has &home, &people or &meetings (page-views.js; the note stays
// open under them). A URL with no note opens on Home.
//   await app.start();
import { exportNote } from "../export/export.js";
import { HomePage } from "../home/home-page.js";
import { HubPage } from "../hubs/hub-page.js";
import { showBreadcrumb } from "./breadcrumb.js";
import { registerNoteCommands, runNoteCommand } from "./commands.js";
import { headingLine } from "./headings.js";
import { groupOf, isArchived, topNoteOf } from "./hub-groups.js";
import { NoteImages } from "./images.js";
import { goToNote, openNoteMenu } from "./note-actions.js";
import { LinkIndex } from "./link-index.js";
import { NoteSession } from "./note-session.js";
import { resolveLink, splitTarget } from "./resolve.js";
import { NoteTree } from "./tree-model.js";
import { PageViews } from "./page-views.js";
import { Meetings } from "../meetings/meetings-model.js";
import { meetingsPage } from "../meetings/meetings-page.js";
import { People } from "../people/people-model.js";
import { peoplePage } from "../people/people-page.js";
import { Records } from "../records/records-model.js";
import { TreeView } from "./tree-view.js";

const UNSAVED = "E37: No write since last change (:w to save, or ! to drop the changes)";

export class NotesApp {
  constructor({ editor, tree, crumbs, navigator, hub, home, people, meetings, goTo, api, imagesApi, peopleApi,
                meetingsApi, recordsApi, linksApi, location = window.location, history = window.history,
                today = () => new Date() }) {
    this.editor = editor;
    this.peopleApi = peopleApi;
    this.meetingsApi = meetingsApi;
    this.recordsApi = recordsApi;
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
    this.session = new NoteSession({
      api: { ...api, save: this.linkIndex.saver(api.save) },
      onChange: () => { this.editor.modified = this.session.dirty; },
      onError: (error) => this.fail(error),
    });
    this.treeView = new TreeView(tree, {
      // The drawer closes even when the note can't be opened, so the editor's message shows.
      onOpen: (id) => this.open(id).finally(() => this.navigator.hide()),
      onLeave: () => this.navigator.hide(),
    });
    this.hubPage = new HubPage({
      ...hub,
      onOpen: (id) => this.guard(this.openFromHub(id)),
      onLeave: () => this.editor.focus(),
    });
    const onPage = { onOpen: (id) => this.guard(this.open(id)), onLeave: () => this.leaveView() };
    this.views = new PageViews({
      main: hub.page,
      pages: {
        home: new HomePage(home.section, { ...onPage, today }),
        people: peoplePage(people.section, onPage),
        meetings: meetingsPage(meetings.section, { ...onPage, today }),
      },
      history,
      noteUrl: () => noteUrl(this.currentId),
    });
    for (const [key, { button }] of Object.entries({ home, people, meetings })) {
      button?.addEventListener("click", () => (this.views.shown === key ? this.leaveView() : this.showView(key, "push")));
    }
    goTo?.addEventListener("click", () => this.guard(goToNote(this)));
    this.images = new NoteImages({ editor, api: imagesApi, currentId: () => this.currentId });
    registerNoteCommands(editor);
    this.listen();
  }

  get currentId() {
    return this.session.note?.id ?? null;
  }

  listen() {
    const editor = this.editor;
    editor.addEventListener("change", (event) => this.session.edited(event.detail.value));
    editor.addEventListener("save", (event) => this.saveCommand(Boolean(event.detail.force)));
    editor.addEventListener("quit", () => editor.showMessage("Nothing to close here: closing the tab stops Paradigm"));
    editor.addEventListener("ex", (event) => this.guard(runNoteCommand(this, event.detail)));
    editor.addEventListener("link", (event) => this.guard(this.followLink(event.detail.target)));
    editor.addEventListener("files", (event) => this.guard(this.images.add(event.detail)));
    // A file dropped beside the editor would make the browser open it in place of the app.
    for (const type of ["dragover", "drop"]) {
      window.addEventListener(type, (event) => {
        if ([...(event.dataTransfer?.types ?? [])].includes("Files")) event.preventDefault();
      });
    }
    window.addEventListener("popstate", () => this.guard(this.openFromUrl("none")));
    window.addEventListener("pagehide", () => this.session.saveBeforeLeaving());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.session.save().catch(() => {});
      else this.guard(this.refreshTree());
    });
    // Another tab may have made or moved notes.
    window.addEventListener("focus", () => this.guard(this.refreshTree()));
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
    const [notes, people, meetings, records] = await Promise.all([
      this.api.list(), this.peopleApi.list(), this.meetingsApi.list(), this.recordsApi.list(),
      this.linkIndex.refresh(),
    ]);
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
      if (history === "push") this.history.pushState({}, "", noteUrl(id));
      if (history === "replace") this.history.replaceState({}, "", noteUrl(id));
      this.redraw();
    }
    if (heading) this.goToHeading(heading);
    return true;
  }

  async saveBeforeSwitching() {
    if (!this.session.dirty) return true;
    try {
      await this.session.save();
    } catch (error) {
      this.fail(error);
      return false;
    }
    if (this.session.dirty) {
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
      links: this.linkIndex.links };
    this.hubPage.show(ctx, id);
    this.views.draw(ctx, this.crumbs);
    const title = this.tree.get(id)?.title ?? this.session.note?.title;
    document.title = title ? `${title} - Paradigm` : "Paradigm";
    // Links resolve against the tree and the open note, so both changing means new links.
    this.editor.markdownOptions = { resolveWikiLink: (link) => this.wikiHref(link) };
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

  async openFromHub(id) {
    await this.open(id);
    // The next note may be a hub with the panel over it: then the panel keeps the focus.
    if (this.hubPage.editorHidden) this.hubPage.focus();
    else this.editor.focus();
  }

  async hubCommand() {
    if (!this.hubPage.hasPanel) throw new Error("E: this note has no section panel (a hub, a person or a meeting has one)");
    this.hubPage.focus();
  }

  async inAreaCommand(arg) {
    const text = arg.trim();
    let areaId = null;
    if (text) {
      const found = resolveLink(this.tree, this.currentId, text);
      if (!found.note) throw new Error(explainMissing(text, found));
      areaId = found.note.id;
    }
    const note = await this.api.setArea(this.currentId, areaId);
    this.session.updateMeta(note);
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
    this.editor.showMessage(`"${title}" deleted`);
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
