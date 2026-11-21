// Footnotes: "[^label]: text" defines one, "[^label]" refers to it. Notes are numbered in the
// order they are first referred to; each reference gets its own id for the back-links.
import { normalizeLabel } from "./link-syntax.js";

export const FOOTNOTE_START = /^\[\^([^\]\s]+)\]:/;

export class FootnoteRegistry {
  constructor() {
    this.definitions = new Map(); // normalized label -> footnote block
    this.order = []; // footnote blocks, numbered from 1
  }

  define(block) {
    const key = normalizeLabel(`[${block.label}]`);
    if (!this.definitions.has(key)) this.definitions.set(key, block);
  }

  /** Record a reference; null if no such footnote is defined. */
  refer(label) {
    const block = this.definitions.get(normalizeLabel(`[${label}]`));
    if (!block) return null;
    if (!block.number) {
      this.order.push(block);
      block.number = this.order.length;
      block.refCount = 0;
    }
    block.refCount += 1;
    return { number: block.number, refIndex: block.refCount };
  }
}
