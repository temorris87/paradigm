// The page's copy of the wiki-link and mention index, kept in step with the server
// (paradigm/api/links.py). No DOM; the API is passed in.
//
//   const index = new LinkIndex({ api: linksApi, onChange });
//   await index.refresh()        loads the index, then catches up stale notes in the background
//                                (onChange once some were stored)
//   index.links                  the Links (links.js) for the hub page
//   index.mentions               [{ id, field, line, name, context }] (mentions.js)
//   index.saver(save, textsOf)   a save that sends the note's links, mentions and tasks along and
//                                remembers them; textsOf(note) -> { body, agenda? }: every
//                                text field of the note (a meeting has an agenda too)
//
// A note is stale when its index was never read from its current text (notes from before the
// index, ones saved by an old tab). The server can't read them (the Markdown renderer is
// here), so the page does, in batches, once per load.
import { Links, wikiTargets } from "./links.js";
import { mentionsIn } from "./mentions.js";
import { tasksIn } from "./tasks.js";

export const CATCH_UP_BATCH = 50;

/** The index entries of a note's text fields: { links, mentions, tasks }. */
export function indexTexts(texts) {
  const fields = Object.entries(texts).filter(([, text]) => typeof text === "string");
  const links = [...new Set(fields.flatMap(([, text]) => wikiTargets(text)))];
  const mentions = fields.flatMap(([field, text]) => mentionsIn(text, field));
  const tasks = fields.flatMap(([field, text]) => tasksIn(text, field));
  return { links, mentions, tasks };
}

export class LinkIndex {
  constructor({ api, onChange = () => {} }) {
    this.api = api;
    this.onChange = onChange;
    this.links = new Links();
    this.mentions = [];
    this.catching = null;
    // What a running catch-up stored: a list fetched before that still lacks it.
    this.caught = new Map();
    // Notes saved with tasks: saving one without them changes the tasks too.
    this.hadTasks = new Set();
  }

  async refresh() {
    const { links, mentions = [], stale } = await this.api.list();
    this.links = new Links(links);
    this.mentions = mentions;
    for (const [id, entry] of this.caught) this.remember(id, entry);
    if (stale.length && !this.catching) {
      this.catching = this.catchUp(stale).catch(() => {}).finally(() => {
        this.catching = null;
        this.caught.clear();
      });
    }
  }

  remember(id, { links, mentions }) {
    this.links.set(id, links);
    this.mentions = [...this.mentions.filter((mention) => mention.id !== id),
      ...mentions.map((mention) => ({ id, ...mention }))];
  }

  async catchUp(stale) {
    let stored = 0;
    for (let start = 0; start < stale.length; start += CATCH_UP_BATCH) {
      const entries = stale.slice(start, start + CATCH_UP_BATCH)
        .map(({ id, version, body, agenda }) => ({ id, version, ...indexTexts({ body, agenda }) }));
      const done = new Set((await this.api.catchUp(entries)).stored);
      for (const entry of entries.filter(({ id }) => done.has(id))) {
        this.caught.set(entry.id, entry);
        this.remember(entry.id, entry);
      }
      stored += done.size;
    }
    if (stored) this.onChange();
  }

  saver(save, textsOf = (note) => ({ body: note.body })) {
    return (note, options) => {
      const entry = indexTexts(textsOf(note));
      const saving = save({ ...note, ...entry }, options);
      saving.then(() => {
        this.remember(note.id, entry);
        if (entry.mentions.length || entry.tasks.length || this.hadTasks.has(note.id)) this.onChange();
        if (entry.tasks.length) this.hadTasks.add(note.id);
        else this.hadTasks.delete(note.id);
      }, () => {});
      return saving;
    };
  }
}
