// The note window's captures (028): what \t \q \d \u in its editor do, the marks on captured
// lines, the "From this meeting" strip under the editor, and the open note's captures for its
// sections and the Live page. NotesApp makes one in the note window (never in the main one).
//
//   const captures = new NoteCaptures(app, { api: capturesApi, sheet: element, strip: element })
//   captures.sync(id)          after every redraw: the open note's captures (fetched again when
//                              another note opened or invalidate() was called), marks and strip
//   captures.invalidate()      something may have changed them (a refresh)
//   captures.of(id)            [Capture] made from note id ([] while not loaded)
//   captures.highlights(id)    highlights.js's chips for the rendered notes
import { groupForKind, isMeeting } from "./hub-groups.js";
import { chip } from "../ui/chip.js";
import { pickFrom } from "../ui/picker.js";
import { captureHighlights, captureMarks, captureToRemove, sheetState, stripParts } from "./capture-model.js";
import { CaptureSheet } from "./capture-sheet.js";

export class NoteCaptures {
  constructor(app, { api, sheet, strip = null }) {
    this.app = app;
    this.api = api;
    this.strip = strip;
    this.source = null;
    this.list = [];
    this.stale = true;
    this.token = 0;
    this.marksKey = "";
    this.sheet = sheet ? new CaptureSheet(sheet, {
      tree: () => app.tree,
      today: () => app.today(),
      onSave: (payload) => this.save(payload),
      onCancel: () => this.cancel(),
      pickHub: (choices) => this.pickHub(choices),
    }) : null;
    const editor = app.editor;
    editor.addEventListener("capture", (event) => app.guard(this.capture(event.detail)));
    editor.addEventListener("uncapture", (event) => app.guard(this.uncapture(event.detail)));
    // An edited line loses its mark; lines moved by an edit take theirs along.
    editor.addEventListener("change", () => this.drawMarks());
  }

  of(id) {
    return id !== null && id !== undefined && id === this.source ? this.list : [];
  }

  highlights(id) {
    return captureHighlights(this.of(id), this.lines(), this.app.today());
  }

  /** The open note's lines, which its captures are matched to. */
  lines() {
    return String(this.app.editor.value ?? "").split("\n");
  }

  invalidate() {
    this.stale = true;
  }

  sync(id) {
    if (id !== this.source) {
      this.source = id;
      this.list = [];
      this.stale = true;
      if (this.sheet?.isOpen) this.sheet.close();
    }
    if (this.stale && id !== null) this.fetch(id);
    this.draw();
  }

  async fetch(id) {
    this.stale = false;
    this.token += 1;
    const token = this.token;
    let list;
    try {
      list = await this.api.list(id);
    } catch (error) {
      if (token === this.token) this.app.fail(error);
      return;
    }
    if (token !== this.token || id !== this.source) return;
    this.list = list ?? [];
    this.app.redraw();
  }

  draw() {
    this.drawMarks();
    this.drawStrip();
  }

  drawMarks() {
    const editor = this.app.editor;
    const marks = captureMarks(this.of(this.app.currentId), this.lines(), this.app.today());
    const key = JSON.stringify(marks);
    if (key === this.marksKey) return;
    this.marksKey = key;
    editor.setLineMarks?.(marks);
  }

  /** "From this meeting: Tasks 2 Questions 1 Decisions 0 · they live in Team · Tab opens". */
  drawStrip() {
    const strip = this.strip;
    if (!strip) return;
    const id = this.app.currentId;
    const list = this.of(id);
    strip.hidden = list.length === 0;
    if (!list.length) return strip.replaceChildren();
    const where = element("span", "capture-strip__from", `From this ${isMeeting(this.app.tree, id) ? "meeting" : "note"}:`);
    const chips = stripParts(list).map((part) => chip(`${part.label} ${part.count}`, part.kind));
    const hubs = [...new Set(list.map((capture) => capture.hub_title))].join(", ");
    const end = element("span", "capture-strip__end", `they live in ${hubs} · Tab opens`);
    strip.replaceChildren(where, ...chips, end);
    return undefined;
  }

  async capture({ kind, line, text }) {
    const app = this.app;
    const id = app.currentId;
    if (id === null || !this.sheet) return;
    const state = sheetState({ kind, text, line, sourceId: id, tree: app.tree, today: app.today(),
      meetingDay: isMeeting(app.tree, id) ? app.meetings.get(id).day || null : null });
    if (state.error) throw new Error(state.error);
    this.sheet.open(state);
  }

  async save(payload) {
    const app = this.app;
    // Known here already: refused before the POST, so the browser logs no 409 (the server's
    // 409 still shows in the sheet when this list is behind).
    if (this.of(payload.source_id).some((made) => made.kind === payload.kind && made.quote === payload.quote)) {
      throw new Error("E: already captured");
    }
    const capture = await this.api.make(payload);
    if (payload.source_id === this.source) this.list = [...this.list, capture];
    this.sheet.close();
    app.editor.focus();
    this.draw();
    app.changes.send({ type: "changed", what: ["tasks", "records"] });
    await app.refreshTree();
    app.say(`${this.of(payload.source_id).length} captured → ${capture.hub_title}`);
  }

  cancel() {
    this.sheet.close();
    this.app.editor.focus();
  }

  /** \u: the line's first capture goes (one with several takes a \u each). */
  async uncapture({ line }) {
    const app = this.app;
    const found = captureToRemove(this.of(app.currentId), this.lines(), line);
    if (!found) throw new Error("E: nothing captured on this line");
    await this.api.remove(found.kind, found.id);
    this.list = this.list.filter((capture) => capture !== found);
    this.draw();
    app.changes.send({ type: "changed", what: ["tasks", "records"] });
    await app.refreshTree();
    app.say(`Removed ${found.kind}: ${found.title}`);
  }

  async pickHub(choices) {
    const tree = this.app.tree;
    const picked = await pickFrom({
      title: "Goes to",
      // Only the person this note sits under takes captures (POST /api/capture answers 400 for
      // any other), so the picker names a person only when it lists one.
      placeholder: choices.some((note) => note.kind === "person") ? "a project, an area or this note's person"
        : "a project or an area",
      items: choices.map((note) => ({ id: note.id, title: note.title, detail: note.kind === "person" ? "Person" : groupForKind(note.kind).label })),
    });
    return picked?.item ? tree.get(picked.item.id) : null;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
