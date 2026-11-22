// The page's copy of the wiki-link index, kept in step with the server (paradigm/api/links.py).
// No DOM; the API is passed in.
//
//   const index = new LinkIndex({ api: linksApi, onChange });
//   await index.refresh()        loads the index, then catches up stale notes in the background
//                                (onChange once some were stored)
//   index.links                  the Links (links.js) for the hub page
//   index.saver(notesApi.save)   a save that sends the body's links along and remembers them
//
// A note is stale when its links were never read from its current text (notes from before the
// index, ones saved by an old tab). The server can't read them (the Markdown renderer is
// here), so the page does, in batches, once per load.
import { Links, wikiTargets } from "./links.js";

export const CATCH_UP_BATCH = 50;

export class LinkIndex {
  constructor({ api, onChange = () => {} }) {
    this.api = api;
    this.onChange = onChange;
    this.links = new Links();
    this.catching = null;
    // What a running catch-up stored: a list fetched before that still lacks it.
    this.caught = new Map();
  }

  async refresh() {
    const { links, stale } = await this.api.list();
    this.links = new Links(links);
    for (const [id, targets] of this.caught) this.links.set(id, targets);
    if (stale.length && !this.catching) {
      this.catching = this.catchUp(stale).catch(() => {}).finally(() => {
        this.catching = null;
        this.caught.clear();
      });
    }
  }

  async catchUp(stale) {
    let stored = 0;
    for (let start = 0; start < stale.length; start += CATCH_UP_BATCH) {
      const entries = stale.slice(start, start + CATCH_UP_BATCH)
        .map(({ id, version, body }) => ({ id, version, links: wikiTargets(body) }));
      const done = new Set((await this.api.catchUp(entries)).stored);
      for (const entry of entries.filter(({ id }) => done.has(id))) {
        this.caught.set(entry.id, entry.links);
        this.links.set(entry.id, entry.links);
      }
      stored += done.size;
    }
    if (stored) this.onChange();
  }

  saver(save) {
    return (note, options) => {
      const links = wikiTargets(note.body);
      const saving = save({ ...note, links }, options);
      saving.then(() => this.links.set(note.id, links), () => {});
      return saving;
    };
  }
}
