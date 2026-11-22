// A meeting's agenda: the second text box on a meeting's page, over the minutes (the note's
// own text). It saves like the note does (autosave, its own version, conflicts), through
// /api/meeting/agenda. No DOM of its own: the editor and its wrapper are passed in.
//
//   const agenda = new AgendaField({ editor, field, api: meetingsApi, saver, onChange, onError });
//     saver(save): wraps the save so it sends the meeting's links and mentions (link-index.js)
//   agenda.open(note)       a note from /api/note: a meeting's carries agenda + agenda_version;
//                           any other note hides the field
//   agenda.textFor(id)      the agenda's text while that meeting is open, else undefined
//   agenda.dirty / await agenda.save({ force }) / agenda.saveBeforeLeaving()
import { NoteSession } from "./note-session.js";

export class AgendaField {
  constructor({ editor, field, api, saver = (save) => save, onChange = () => {}, onError = () => {} }) {
    this.editor = editor;
    this.field = field;
    this.session = new NoteSession({
      api: { save: saver((note, options) => api.saveAgenda(note, options)) },
      onChange: () => {
        if (this.editor) this.editor.modified = this.session.dirty;
        onChange();
      },
      onError,
    });
    editor?.addEventListener("change", (event) => this.session.edited(event.detail.value));
  }

  get id() {
    return this.session.note?.id ?? null;
  }

  get dirty() {
    return this.session.dirty;
  }

  open(note) {
    if (note.agenda === undefined) {
      this.session.close();
      if (this.editor) this.editor.value = "";
      if (this.field) this.field.hidden = true;
      return;
    }
    if (this.id !== note.id || !this.dirty) {
      this.session.open({ id: note.id, title: note.title, body: note.agenda, version: note.agenda_version });
      if (this.editor) this.editor.value = note.agenda;
    }
    if (this.field) this.field.hidden = false;
  }

  textFor(id) {
    return this.id === id ? this.session.text : undefined;
  }

  save(options) {
    return this.session.save(options);
  }

  saveBeforeLeaving() {
    this.session.saveBeforeLeaving();
  }
}
