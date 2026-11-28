// The note window's half of the Live page (live-page.js): what it shows, sent to the main
// window as it changes, at most once per THROTTLE_MS, on the windows' channel.
//
//   startLiveSender(app, { changes, window })   app: the note window's NotesApp
//
// Sends { type: "live", id, title, kind, crumbs, fields: [{ name, label, text, highlights }],
// active, line, col, mode, trashed, captures } (captures: what was captured from the note,
// for the meeting's "Agreed in this meeting") after an edit, a cursor move, a mode change or a redraw
// (a note opened, renamed, reloaded); answers "live-ask" at once, with reply: true so the main
// window doesn't take the answer for a newly opened note (and so the first one after a
// trash's hold ends); "live-closed" on pagehide. From a trash until the next note has gone out
// once, every message is a reply: the note that opens by itself after a trash never pulls the
// main window to Live, whatever keys, clicks and redraws come in between.
// While the note window holds a task's notes (app.taskNotes, tasks/task-notes-session.js) it
// sends { type: "live", task, title, text, caret: { line, col, mode } } in their place, for the
// task page's Notes card (tasks/task-notes-live.js), and "live-closed" carries task.
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
    // After a trash with a next note: { id, next } until a note other than the trashed one
    // has been sent; till then every message goes out as a reply.
    this.afterTrash = null;
    // The reply flag the send waiting on the timer was queued with.
    this.queuedReply = false;
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
    win.addEventListener("pagehide", () => {
      const taskId = this.app.taskNotes?.active ? this.app.taskNotes.taskId : undefined;
      this.changes.send(taskId === undefined ? { type: "live-closed" } : { type: "live-closed", task: taskId });
    });
  }

  /** Something happened in the note (a key, a click): the hold after a trash is over. */
  touched() {
    if (this.hold) this.quiet = true;
    this.hold = null;
    this.schedule();
  }

  redrawn() {
    const id = this.shownKey();
    if (id !== this.shownId) {
      // Another note (or the same one reloaded as new): its cursor starts at the top.
      this.shownId = id;
      this.cursors = { body: { ...START }, agenda: { ...START } };
      this.active = "body";
      this.quiet = false;
      // No note for a moment (the trashed one closed), then the next one: still held. Any
      // other note was opened on purpose: news. That includes the trashed one, restored and
      // opened again: a new note, so its quiet is over too.
      if (this.hold && id !== null && id !== this.hold.next) this.hold = null;
      if (this.afterTrash && id !== null && id !== this.afterTrash.next) this.afterTrash = null;
    }
    if (this.hold) return;
    this.schedule();
  }

  trashed(id, next) {
    this.flush();
    // Gone from the tree already (trashed in the other window): nothing to say about it, but
    // the next note still opens by itself.
    const message = this.message(id);
    if (message) this.changes.send({ ...message, fields: [], trashed: true });
    // With no next note nothing opens by itself, so there is nothing to hold.
    this.hold = next === null ? null : { next };
    this.afterTrash = next === null ? null : { id, next };
  }

  /** A main window asked (it opened or reloaded): it gets what is shown, held or not. */
  answerAsk() {
    const message = this.current();
    if (!message) return;
    this.changes.send({ ...message, reply: true });
    this.sentAfterTrash(message.id);
  }

  /** Sends now if the last one went long enough ago, else once that time is up. */
  schedule() {
    if (this.timer !== null) {
      this.queuedReply ||= this.replying();
      return;
    }
    const wait = this.lastSent + THROTTLE_MS - this.clock();
    if (wait <= 0) {
      this.sendNow();
      return;
    }
    this.queuedReply = this.replying();
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.sendNow();
    }, wait);
  }

  /** Whether a message sent now is no news: the first after a hold, or any after a trash. */
  replying() {
    return this.quiet || this.afterTrash !== null;
  }

  /** A note other than the trashed one went out: the trash's quiet is over. */
  sentAfterTrash(id) {
    if (this.afterTrash && id !== this.afterTrash.id) this.afterTrash = null;
  }

  flush() {
    this.queuedReply = false;
    if (this.timer === null) return;
    this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  sendNow() {
    const queued = this.queuedReply;
    this.flush();
    if (this.hold) return;
    const message = this.current();
    // The trashed note, still open for a moment: sending it again would undo "Moved to trash".
    if (!message || (this.afterTrash && message.id === this.afterTrash.id)) return;
    this.lastSent = this.clock();
    this.changes.send(queued || this.replying() ? { ...message, reply: true } : message);
    this.quiet = false;
    this.sentAfterTrash(message.id);
  }

  /** What is shown, as the redraws tell them apart: the note's id, or "task:ID". */
  shownKey() {
    const taskNotes = this.app.taskNotes;
    return taskNotes?.active ? `task:${taskNotes.taskId}` : this.app.currentId;
  }

  /** The live message for what is open: a task's notes, else the note (null: neither). */
  current() {
    const taskNotes = this.app.taskNotes;
    if (taskNotes?.active) return taskNotes.liveMessage(this.cursors.body);
    return this.message(this.app.currentId);
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
      line: cursor.line, col: cursor.col, mode: cursor.mode, trashed: false, captures: app.captures?.of(id) ?? [] };
  }
}
