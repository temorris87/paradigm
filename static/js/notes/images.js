// Images pasted or dropped into the open note: shrink, upload, then add their Markdown links.
// The editor only reports the files ("files" event); this decides what they become here.
//
//   const images = new NoteImages({ editor, api: imagesApi, currentId: () => app.currentId });
//   images.add({ files, how, line });   // from the editor's "files" event
import { ACCEPTED_TYPES, downscale } from "../images/downscale.js";

// The server refuses request bodies above this (paradigm/web/handler.py, MAX_BODY_BYTES).
export const MAX_UPLOAD_BYTES = 8_000_000;

export class NoteImages {
  constructor({ editor, api, currentId, shrink = downscale }) {
    this.editor = editor;
    this.api = api;
    this.currentId = currentId;
    this.shrink = shrink;
  }

  async add({ files, how, line = null }) {
    const noteId = this.currentId();
    if (noteId === null) return;
    const images = files.filter((file) => ACCEPTED_TYPES.has(file.type));
    const skipped = files.length - images.length;
    if (images.length === 0) {
      this.fail(skippedText(skipped) || "nothing to add");
      return;
    }
    this.editor.showMessage(images.length === 1 ? "Uploading image…" : `Uploading ${images.length} images…`);
    const added = [];
    try {
      for (const file of images) added.push(await this.upload(noteId, file, how));
    } catch (error) {
      this.fail(error?.message ?? String(error));
      return;
    }
    // The upload took a moment; the link must never land in a different note.
    if (this.currentId() !== noteId) {
      this.fail("another note was opened while the image uploaded, so its link was not added");
      return;
    }
    const links = added.map((image) => image.link).join("\n");
    if (how === "drop") this.editor.insertText(links, { asLines: true, line });
    else this.editor.insertText(links);
    this.editor.showMessage(addedText(added) + (skipped ? `, ${skippedText(skipped)}` : ""));
  }

  async upload(noteId, file, how) {
    const { blob } = await this.shrink(file);
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`image too large (max ${MAX_UPLOAD_BYTES / 1e6} MB): ${file.name}`);
    const stored = await this.api.upload(noteId, blob);
    const alt = how === "drop" ? altText(file.name) : "image";
    return { ...stored, link: `![${alt}](${stored.url})` };
  }

  fail(text) {
    this.editor.showMessage(`E: ${text}`, { error: true });
  }
}

/** A file name as alt text: no extension, nothing that would end the brackets early. */
export function altText(fileName) {
  const base = String(fileName ?? "").replace(/\.[A-Za-z0-9]+$/, "");
  const clean = base.replace(/[[\]\\\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return clean || "image";
}

function addedText(added) {
  if (added.length > 1) return `${added.length} images added`;
  const [image] = added;
  return `Image added (${image.width}×${image.height}, ${formatSize(image.size)})`;
}

function skippedText(count) {
  if (count === 0) return "";
  return `${count} ${count === 1 ? "file" : "files"} skipped (not a PNG, JPEG, GIF or WebP image)`;
}

export function formatSize(bytes) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1e6) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}
