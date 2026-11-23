// The note open in the editor: its text, whether that is saved, and saving it. No DOM; the
// API and the timer are passed in, so tests drive it with fakes.
//
//   session.open(note)          a note from the server ({ id, title, body, version, ... })
//   session.edited(text)        the editor's text changed: save it after a quiet moment
//   await session.save({ force })  save now (force: overwrite a copy saved elsewhere)
//   session.dirty / .conflict   unsaved changes / another tab saved this note meanwhile
//   session.saving / .failed    a save is on its way / the last one failed (the server is away?)
//
// Saves run one at a time. Each names the version it started from; if the server has a newer
// one, it answers 409, the session holds a conflict and stops saving by itself until a
// forced save or a reload.

export const AUTOSAVE_MS = 1000;

export class SaveConflict extends Error {
  constructor() {
    super("E: the note was changed in another tab: :w! keeps yours, :e! loads theirs");
  }
}

export class NoteSession {
  constructor({ api, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
                delayMs = AUTOSAVE_MS, onChange = () => {}, onError = () => {} }) {
    this.api = api;
    this.timers = timers;
    this.delayMs = delayMs;
    this.onChange = onChange;
    this.onError = onError;
    this.note = null;
    this.text = "";
    this.saved = "";
    this.conflict = null;
    this.inflight = null;
    this.timer = null;
    this.failed = false;
  }

  get saving() {
    return this.inflight !== null;
  }

  get dirty() {
    return this.note !== null && this.text !== this.saved;
  }

  open(note) {
    this.cancelTimer();
    this.note = { ...note };
    this.text = note.body;
    this.saved = note.body;
    this.conflict = null;
    this.onChange();
  }

  close() {
    this.cancelTimer();
    this.note = null;
    this.text = this.saved = "";
    this.conflict = null;
    this.onChange();
  }

  /** A rename or move came back from the server: keep the title and parent in step. */
  updateMeta(note) {
    if (this.note?.id !== note.id) return;
    this.note.title = note.title;
    this.note.parent_id = note.parent_id;
    this.onChange();
  }

  edited(text) {
    this.text = text;
    if (this.dirty && !this.conflict) this.schedule();
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

  async save({ force = false } = {}) {
    this.cancelTimer();
    while (this.inflight) await this.inflight.catch(() => {});
    if (!this.dirty) return;
    if (this.conflict && !force) throw new SaveConflict();
    const note = this.note;
    const body = this.text;
    this.inflight = this.api.save({ id: note.id, body, version: note.version, force });
    this.onChange();
    try {
      const result = await this.inflight;
      this.failed = false;
      if (this.note === note) {
        note.version = result.version;
        this.saved = body;
        this.conflict = null;
      }
    } catch (error) {
      this.failed = error.status !== 409;
      if (error.status === 409 && this.note === note) {
        this.conflict = { version: error.payload?.version };
        throw new SaveConflict();
      }
      throw error;
    } finally {
      this.inflight = null;
      this.onChange();
    }
    // Typed while that save was on its way: those changes wait for the next quiet moment.
    if (this.dirty && this.note === note) this.schedule();
  }

  /** The tab is going away: send what is unsaved without waiting for an answer. */
  saveBeforeLeaving() {
    if (!this.dirty || this.conflict) return;
    this.cancelTimer();
    const { id, version } = this.note;
    this.api.save({ id, body: this.text, version }, { keepalive: true }).catch(() => {});
  }
}
