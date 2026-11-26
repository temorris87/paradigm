// The note window's half of the Live page (live-page.js): what it shows, sent to the main
// window as it changes, at most once per THROTTLE_MS, on the windows' channel.
//
//   startLiveSender(app, { changes, window })   app: the note window's NotesApp
//
// Sends { type: "live", id, title, kind, crumbs, fields: [{ name, label, text, highlights }],
// active, line, col, mode, trashed } after an edit, a cursor move, a mode change or a redraw
// (a note opened, renamed, reloaded); answers "live-ask" at once, with reply: true so the main
// window doesn't take the answer for a newly opened note (and so the first one after a
// trash's hold ends); "live-closed" on pagehide.
import { fieldsFor } from "../hubs/fields.js";
import { groupOf, hubOf } from "../notes/hub-groups.js";

export const THROTTLE_MS = 50;

const START = { line: 0, col: 0, mode: "normal" };

export function startLiveSender(app, { changes = app.changes, window: win = window } = {}) {
  const sender = new LiveSender(app, changes);
  sender.listen(win);
  return sender;
}

export class LiveSender {
  constructor(app, changes, { clock = () => Date.now(), timers = globalThis } = {}) {
    this.app = app;
    this.changes = changes;
    this.clock = clock;
    this.timers = timers;
    this.active = "body";
    this.cursors = { body: { ...START }, agenda: { ...START } };
    this.shownId = null;
    this.lastSent = -Infinity;
    this.timer = null;
    // After a trash: { next }, the note the app opens next, is not news until something
    // happens in it.
    this.hold = null;
    // The hold ended by a key or a click: the next message is not news either, or the main
    // window, still on the trashed id, would switch to Live on typing alone.
    this.quiet = false;
  }

  listen(win) {
    const boxes = [["body", this.app.editor], ["agenda", this.app.agendaEditor]].filter(([, box]) => box);
    for (const [name, box] of boxes) {
      box.addEventListener("cursor", (event) => {
        this.active = name;
        this.cursors[name] = { line: event.detail.line, col: event.detail.col, mode: event.detail.mode };
        this.touched();
      });
      box.addEventListener("mode", (event) => {
        this.cursors[name] = { ...this.cursors[name], mode: event.detail.mode };
        this.touched();
      });
      box.addEventListener("change", () => {
        this.active = name;
        this.touched();
      });
      box.addEventListener("focusin", () => {
        if (this.active === name) return;
        this.active = name;
        this.touched();
      });
    }
    this.app.events?.addEventListener("redraw", () => this.redrawn());
    this.app.events?.addEventListener("trashed", (event) => this.trashed(event.detail.id, event.detail.next ?? null));
    this.changes.listen((message) => {
      if (message.type === "live-ask") this.answerAsk();
    });
    win.addEventListener("pagehide", () => this.changes.send({ type: "live-closed" }));
  }

  /** Something happened in the note (a key, a click): the hold after a trash is over. */
  touched() {
    if (this.hold) this.quiet = true;
    this.hold = null;
    this.schedule();
  }

  redrawn() {
    const id = this.app.currentId;
    if (id !== this.shownId) {
      // Another note (or the same one reloaded as new): its cursor starts at the top.
      this.shownId = id;
      this.cursors = { body: { ...START }, agenda: { ...START } };
      this.active = "body";
      this.quiet = false;
      // No note for a moment (the trashed one closed), then the next one: still held. Any
      // other note was opened on purpose: news.
      if (this.hold && id !== null && id !== this.hold.next) this.hold = null;
    }
    if (this.hold) return;
    this.schedule();
  }

  trashed(id, next) {
    this.flush();
    const message = this.message(id);
    if (!message) return;
    this.changes.send({ ...message, fields: [], trashed: true });
    // With no next note nothing opens by itself, so there is nothing to hold.
    this.hold = next === null ? null : { next };
  }

  /** A main window asked (it opened or reloaded): it gets what is shown, held or not. */
  answerAsk() {
    const message = this.message(this.app.currentId);
    if (message) this.changes.send({ ...message, reply: true });
  }

  /** Sends now if the last one went long enough ago, else once that time is up. */
  schedule() {
    if (this.timer !== null) return;
    const wait = this.lastSent + THROTTLE_MS - this.clock();
    if (wait <= 0) {
      this.sendNow();
      return;
    }
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.sendNow();
    }, wait);
  }

  flush() {
    if (this.timer === null) return;
    this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  sendNow() {
    this.flush();
    if (this.hold) return;
    const message = this.message(this.app.currentId);
    if (!message) return;
    this.lastSent = this.clock();
    this.changes.send(this.quiet ? { ...message, reply: true } : message);
    this.quiet = false;
  }

  /** The live message for a note, or null when none is open. */
  message(id) {
    const app = this.app;
    if (id === null || id === undefined || !app.tree.has(id)) return null;
    const note = app.tree.get(id);
    const labels = fieldsFor(note, Boolean(hubOf(app.tree, id)));
    const highlights = app.highlightsOf(id);
    const fields = [];
    if (labels.agenda && app.agendaEditor && app.agenda?.id === id) {
      fields.push({ name: "agenda", label: labels.agenda.label, text: app.agendaEditor.value, highlights });
    }
    fields.push({ name: "body", label: labels.main.label, text: app.editor.value, highlights });
    const active = fields.some((field) => field.name === this.active) ? this.active : "body";
    const cursor = this.cursors[active];
    const crumbs = [groupOf(app.tree, id).heading, ...app.tree.path(id).filter((each) => each.id !== id).map((each) => each.title)];
    return { type: "live", id, title: note.title, kind: note.kind ?? "", crumbs, fields, active,
      line: cursor.line, col: cursor.col, mode: cursor.mode, trashed: false };
  }
}
