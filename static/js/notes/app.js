// The notes page: the tree, the breadcrumb and the editor on the open note, kept in step.
// It owns what the editor's events mean here: saving, following [[links]], note commands.
//
//   const app = new NotesApp({ editor, tree: ulElement, crumbs: navElement, api: notesApi,
//                              imagesApi });
//   await app.start();
import { showBreadcrumb } from "./breadcrumb.js";
import { registerNoteCommands, runNoteCommand } from "./commands.js";
import { headingLine } from "./headings.js";
import { NoteImages } from "./images.js";
import { NoteSession } from "./note-session.js";
import { resolveLink, splitTarget } from "./resolve.js";
import { NoteTree } from "./tree-model.js";
import { TreeView } from "./tree-view.js";

const UNSAVED = "E37: No write since last change (:w to save, or ! to drop the changes)";

export class NotesApp {
  constructor({ editor, tree, crumbs, api, imagesApi, location = window.location, history = window.history }) {
    this.editor = editor;
    this.crumbs = crumbs;
    this.api = api;
    this.location = location;
    this.history = history;
    this.tree = new NoteTree();
    this.session = new NoteSession({
      api,
      onChange: () => { this.editor.modified = this.session.dirty; },
      onError: (error) => this.fail(error),
    });
    this.treeView = new TreeView(tree, {
      onOpen: (id) => this.open(id).then((opened) => opened && this.editor.focus()),
      onLeave: () => this.editor.focus(),
    });
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
    const wanted = Number(new URLSearchParams(this.location.search).get("note"));
    const id = this.tree.has(wanted) ? wanted : this.tree.children(null)[0]?.id;
    if (id === undefined) return;
    const opened = await this.open(id, { history });
    // Back/Forward to another note while this one could not be saved: stay, and say so.
    if (!opened && history === "none") this.history.pushState({}, "", noteUrl(this.currentId));
  }

  async refreshTree() {
    this.tree = new NoteTree(await this.api.list());
    this.redraw();
  }

  /** Opens a note. Returns false (and says why) when the open note's changes can't be saved. */
  async open(id, { history = "push", discard = false, heading = "" } = {}) {
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
    showBreadcrumb(this.crumbs, this.tree, id, (target) => this.guard(this.open(target)));
    const title = this.tree.get(id)?.title ?? this.session.note?.title;
    document.title = title ? `${title} - Paradigm` : "Paradigm";
    // Links resolve against the tree and the open note, so both changing means new links.
    this.editor.markdownOptions = { resolveWikiLink: (link) => this.wikiHref(link) };
  }

  wikiHref(link) {
    if (!link.target) return null;
    const found = resolveLink(this.tree, this.currentId, link.target);
    return found.note ? { href: noteUrl(found.note.id), exists: true } : { href: null, exists: false };
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

  async createAndOpen(parentId, title) {
    if (!(await this.saveBeforeSwitching())) return;
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
    const note = await this.api.move(this.currentId, parentId);
    this.session.updateMeta(note);
    await this.refreshTree();
    this.editor.showMessage(`Now at ${this.tree.pathText(note.id)}`);
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

export function noteUrl(id) {
  return `/?note=${encodeURIComponent(id)}`;
}

function explainMissing(link, found) {
  if (found.reason === "ambiguous") return `E: more than one note is called "${link}": use a path, like /Parent/${link}`;
  if (found.reason === "bad") return `E: "${link}" is not a note name`;
  return `E: no note "${link}" (:new ${link.split("/").pop()} makes one)`;
}
