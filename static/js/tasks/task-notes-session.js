// A task's notes written in the note window (note.html?task=ID, or an "open" message with
// task): the editor holds task.notes (Markdown) in place of a note, saved by
// POST /api/task/update { id, notes } about a second after typing stops, on :w, and on
// leaving or closing. Tasks carry no version: the last write wins. The main window's task page
// follows them on the windows' channel (task-notes-live.js); live/live-sender.js sends them.
//
//   const session = new TaskNotesSession({ api: { save(id, notes, { keepalive }) }, timers,
//                                          delayMs, onChange, onError, onSaved(task) })
//   session.open(task) / .close()       task: { id, title, notes, note_id, ... }
//   session.edited(text)                save it after a quiet moment
//   await session.save()                now; a failure throws "E: notes not saved: ..."
//   session.saveBeforeLeaving()         the tab is going: sent without waiting
//   session.active / .dirty / .saving / .failed / .taskId
//
//   taskNotesCrumbs(tree, task)         ["Task", its project's (or hub's) title, its title]; pure
//   taskLiveMessage(task, text, cursor) { type: "live", task, title, text, caret: { line, col,
//                                       mode } }; pure
//   taskClosedMessage(taskId)           { type: "live-closed", task }; pure
//   notesSavedText(task)                the status line after :w; pure
//
//   const mode = new TaskNotesMode(app, { api: tasksApi })   the note window's controller:
//                                       the session wired to the app's editor, save state,
//                                       status line and channel
import { hubOf } from "../notes/hub-groups.js";
import { AUTOSAVE_MS } from "../notes/note-session.js";

const realTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };

export class TaskNotesSession {
  constructor({ api, timers = realTimers, delayMs = AUTOSAVE_MS, onChange = () => {}, onError = () => {},
                onSaved = () => {} }) {
    this.api = api;
    this.timers = timers;
    this.delayMs = delayMs;
    this.onChange = onChange;
    this.onError = onError;
    this.onSaved = onSaved;
    this.task = null;
    this.text = "";
    this.saved = "";
    this.inflight = null;
    this.timer = null;
    this.failed = false;
  }

  get active() {
    return this.task !== null;
  }

  get taskId() {
    return this.task?.id ?? null;
  }

  get dirty() {
    return this.task !== null && this.text !== this.saved;
  }

  get saving() {
    return this.inflight !== null;
  }

  open(task) {
    this.cancelTimer();
    this.task = { ...task };
    this.text = this.saved = task.notes ?? "";
    this.failed = false;
    this.onChange();
  }

  close() {
    this.cancelTimer();
    this.task = null;
    this.text = this.saved = "";
    this.failed = false;
    this.onChange();
  }

  edited(text) {
    this.text = text;
    if (this.dirty) this.schedule();
    this.onChange();
  }

  schedule() {
    this.cancelTimer();
    this.timer = this.timers.set(() => {
      this.timer = null;
      this.save().catch((error) => this.onError(error));
    }, this.delayMs);
  }

  cancelTimer() {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  /** Saves now; true when something was sent. One save at a time, so they land in order. */
  async save() {
    this.cancelTimer();
    while (this.inflight) await this.inflight.catch(() => {});
    if (!this.dirty) return false;
    const task = this.task;
    const notes = this.text;
    this.inflight = this.api.save(task.id, notes);
    this.onChange();
    try {
      const result = await this.inflight;
      this.failed = false;
      if (this.task === task) {
        this.saved = notes;
        if (result?.title) task.title = result.title;
      }
    } catch (error) {
      this.failed = true;
      throw new Error(`E: notes not saved: ${error?.message ?? error}`);
    } finally {
      this.inflight = null;
      this.onChange();
    }
    this.onSaved(task);
    // Typed while that save was on its way: those changes wait for the next quiet moment.
    if (this.dirty && this.task === task) this.schedule();
    return true;
  }

  saveBeforeLeaving() {
    if (!this.dirty) return;
    this.cancelTimer();
    this.api.save(this.task.id, this.text, { keepalive: true }).catch(() => {});
  }
}

export function taskNotesCrumbs(tree, task) {
  const owner = hubOf(tree, task.note_id) ?? tree.get(task.note_id) ?? null;
  return ["Task", ...(owner ? [owner.title] : []), task.title || "(no text)"];
}

export function taskLiveMessage(task, text, { line = 0, col = 0, mode = "normal" } = {}) {
  return { type: "live", task: task.id, title: task.title, text: String(text ?? ""), caret: { line, col, mode } };
}

export function taskClosedMessage(taskId) {
  return { type: "live-closed", task: taskId };
}

export function notesSavedText(task) {
  return `"${task?.title ?? ""}" notes saved`;
}

/** The note window's task mode: what NotesApp hands its editor's text to while a task is open. */
export class TaskNotesMode {
  constructor(app, { api, timers = realTimers }) {
    this.app = app;
    this.session = new TaskNotesSession({
      api: { save: (id, notes, options) => api.update(id, { notes }, options) },
      timers,
      onChange: () => {
        if (!this.session) return;
        app.editor.modified = this.session.dirty;
        app.showSaveState();
      },
      onError: (error) => app.fail(error),
      // The main window's task page reads the saved notes again (and its Notes card on leaving).
      onSaved: () => app.changes.send({ type: "changed", what: ["tasks"] }),
    });
  }

  get active() {
    return this.session.active;
  }

  get taskId() {
    return this.session.taskId;
  }

  get dirty() {
    return this.session.dirty;
  }

  /** The open task as last read (a rename in the main window shows here after a refresh). */
  current() {
    return this.active ? this.app.tasks?.get(this.taskId) ?? this.session.task : null;
  }

  get title() {
    return this.current()?.title ?? "";
  }

  open(task) {
    if (this.active && this.taskId !== task.id) this.app.changes.send(taskClosedMessage(this.taskId));
    this.session.open(task);
  }

  /** Leaves task mode (another note or task opens): the task page drops its chip. */
  close() {
    if (!this.active) return;
    this.app.changes.send(taskClosedMessage(this.taskId));
    this.session.close();
  }

  edited(text) {
    this.session.edited(text);
  }

  save() {
    return this.session.save();
  }

  saveBeforeLeaving() {
    this.session.saveBeforeLeaving();
  }

  /** :w: saved, and said so by the task's name. */
  async saveCommand() {
    try {
      await this.session.save();
      this.app.say(notesSavedText(this.current()));
    } catch (error) {
      this.app.fail(error);
    }
  }

  liveMessage(cursor) {
    return this.active ? taskLiveMessage(this.current(), this.app.editor.value, cursor) : null;
  }

  /** The crumb over the editor: Task › its project › its title; no note menu. Its project (or
   * hub) opens here as a note, as a note's crumbs do. */
  drawCrumbs(nav) {
    const app = this.app;
    const task = this.current();
    const owner = hubOf(app.tree, task.note_id) ?? app.tree.get(task.note_id) ?? null;
    const [group, ...rest] = taskNotesCrumbs(app.tree, task);
    const parts = [span("crumbs__group", group)];
    rest.forEach((text, index) => {
      const separator = span("crumbs__separator", "›");
      separator.setAttribute("aria-hidden", "true");
      parts.push(separator);
      if (index === rest.length - 1) {
        const here = span("crumbs__here", "");
        here.setAttribute("aria-current", "page");
        here.append(span("crumbs__title", text));
        parts.push(here);
      } else {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "crumbs__link";
        link.textContent = text;
        link.addEventListener("click", () => app.guard(app.open(owner.id)));
        parts.push(link);
      }
    });
    nav.replaceChildren(...parts);
  }
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}
