// Images: the downscale rule, putting text in from outside the keyboard, the editor's
// "files" event, and the notes side that uploads and adds the links.
import "../../static/js/editor/pd-editor.js";
import { canResize, targetSize } from "../../static/js/images/downscale.js";
import { altText, formatSize, NoteImages } from "../../static/js/notes/images.js";
import { assertEqual, assertTrue, test } from "./harness.js";
import { show, type, vimAt } from "./editor-helpers.js";

test("images: only wider than 1600 px is shrunk, keeping the proportions", () => {
  assertEqual(targetSize(1600, 900), null);
  assertEqual(targetSize(800, 5000), null);
  assertEqual(JSON.stringify(targetSize(3200, 1800)), JSON.stringify({ width: 1600, height: 900 }));
  assertEqual(JSON.stringify(targetSize(1601, 1)), JSON.stringify({ width: 1600, height: 1 }));
  assertEqual(JSON.stringify(targetSize(2000, 999)), JSON.stringify({ width: 1600, height: 799 }));
});

test("images: a GIF is never redrawn, and neither is an unknown type", () => {
  assertTrue(canResize("image/png") && canResize("image/jpeg") && canResize("image/webp"));
  assertTrue(!canResize("image/gif"));
  assertTrue(!canResize("image/svg+xml"));
  assertTrue(!canResize("toString"));
});

test("images: alt text from a file name", () => {
  assertEqual(altText("quarterly-chart.png"), "quarterly-chart");
  assertEqual(altText("a [b] c\\d.JPG"), "a b c d");
  assertEqual(altText("line\nbreak.gif"), "line break");
  assertEqual(altText(".png"), "image");
  assertEqual(altText(""), "image");
});

test("images: sizes for the status line", () => {
  assertEqual(formatSize(512), "512 B");
  assertEqual(formatSize(210_400), "210 KB");
  assertEqual(formatSize(2_345_678), "2.3 MB");
});

// ---- the engine ------------------------------------------------------------------------

test("putFromOutside: lines below a line, one undo step, cursor on the last", () => {
  const vim = vimAt("o|ne\ntwo");
  vim.putFromOutside("![a](x)\n![b](y)", { asLines: true, line: 0 });
  assertEqual(show(vim), "one\n![a](x)\n|![b](y)\ntwo");
  type(vim, "u");
  assertEqual(vim.text, "one\ntwo");
});

test("putFromOutside: leaves insert and visual mode first", () => {
  const vim = type(vimAt("|one\ntwo"), "jA!");
  vim.putFromOutside("L", { asLines: true });
  assertEqual(vim.mode, "normal");
  assertEqual(show(vim), "one\ntwo!\n|L");
  type(vim, "u");
  assertEqual(vim.text, "one\ntwo!", "the insert stays its own undo step");
  const visual = type(vimAt("|one"), "vl");
  visual.putFromOutside("L", { asLines: true });
  assertEqual(visual.mode, "normal");
  assertEqual(visual.text, "one\nL");
});

test("putFromOutside: before the cursor in normal mode", () => {
  const vim = vimAt("ab|c");
  vim.putFromOutside("XY");
  assertEqual(show(vim), "abX|Yc");
  type(vim, "u");
  assertEqual(vim.text, "abc");
});

test("putFromOutside: a line past the end is the last line; read-only refuses", () => {
  const vim = vimAt("|one");
  vim.putFromOutside("L", { asLines: true, line: 40 });
  assertEqual(vim.text, "one\nL");
  const locked = vimAt("|one");
  locked.readOnly = true;
  locked.putFromOutside("L", { asLines: true });
  assertEqual(locked.text, "one");
  assertTrue(locked.message?.error, "says why");
});

// ---- the element -------------------------------------------------------------------------

function withEditor(text, body) {
  const editor = document.createElement("pd-editor");
  document.body.append(editor);
  editor.value = text;
  return Promise.resolve(body(editor)).finally(() => editor.remove());
}

function press(editor, key) {
  editor.shadowRoot.querySelector(".pd-input")
    .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true }));
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });

function clipboard({ files = [], text = "" }) {
  return { files, types: files.length ? ["Files"] : [], getData: () => text };
}

test("element: an image pasted in insert mode is a files event, not its text", () => withEditor("foo", (editor) => {
  const seen = [];
  editor.addEventListener("files", (event) => seen.push(event.detail));
  press(editor, "A");
  editor.onPaste({ preventDefault() {}, clipboardData: clipboard({ files: [png()], text: "alt" }) });
  assertEqual(seen.length, 1);
  assertEqual(seen[0].how, "paste");
  assertEqual(seen[0].files[0].name, "shot.png");
  assertEqual(editor.value, "foo");
  // A copied file that is not an image leaves the text paste as it was.
  const doc = new File(["x"], "a.txt", { type: "text/plain" });
  editor.onPaste({ preventDefault() {}, clipboardData: clipboard({ files: [doc], text: " bar" }) });
  assertEqual(seen.length, 1);
  assertEqual(editor.value, "foo bar");
}));

test("element: insertText types at the cursor in insert mode", () => withEditor("foo", (editor) => {
  press(editor, "A");
  editor.insertText(" ![image](/api/image?id=1)");
  press(editor, "Escape");
  assertEqual(editor.value, "foo ![image](/api/image?id=1)");
}));

test("element: a drop sends every file and the line, and stops the browser opening it", () => withEditor("one\ntwo", (editor) => {
  const seen = [];
  editor.addEventListener("files", (event) => seen.push(event.detail));
  let prevented = 0;
  const transfer = { types: ["Files"], files: [png(), new File(["x"], "a.txt")] };
  const fake = { dataTransfer: transfer, clientX: -1, clientY: -1, preventDefault: () => { prevented += 1; } };
  editor.onDragOver(fake);
  editor.onDrop(fake);
  assertEqual(prevented, 2);
  assertEqual(seen.length, 1);
  assertEqual(seen[0].how, "drop");
  assertEqual(seen[0].files.length, 2);
  assertEqual(typeof seen[0].line, "number");
  editor.insertText("![shot](/api/image?id=2)", { asLines: true, line: 0 });
  assertEqual(editor.value, "one\n![shot](/api/image?id=2)\ntwo");
  // Dragged text is the browser's own business.
  let textPrevented = false;
  editor.onDragOver({ dataTransfer: { types: ["text/plain"] }, preventDefault: () => { textPrevented = true; } });
  assertTrue(!textPrevented);
}));

// ---- the notes side ----------------------------------------------------------------------

function fakeEditor() {
  return {
    inserted: [],
    messages: [],
    insertText(text, options) { this.inserted.push({ text, ...options }); },
    showMessage(text, { error = false } = {}) { this.messages.push({ text, error }); },
  };
}

function noteImages({ current = () => 7, upload } = {}) {
  const editor = fakeEditor();
  const calls = [];
  let next = 1;
  const api = {
    upload: upload ?? (async (noteId, blob) => {
      calls.push({ noteId, size: blob.size });
      const id = next++;
      return { id, url: `/api/image?id=${id}`, width: 10, height: 5, size: 2048 };
    }),
  };
  const images = new NoteImages({ editor, api, currentId: current, shrink: async (file) => ({ blob: file }) });
  return { images, editor, calls };
}

test("note images: a paste adds one link at the cursor", async () => {
  const { images, editor, calls } = noteImages();
  await images.add({ files: [png()], how: "paste" });
  assertEqual(calls[0].noteId, 7);
  assertEqual(JSON.stringify(editor.inserted), JSON.stringify([{ text: "![image](/api/image?id=1)" }]));
  assertEqual(editor.messages.at(-1).text, "Image added (10×5, 2 KB)");
});

test("note images: a drop adds a line per image and skips other files", async () => {
  const { images, editor } = noteImages();
  const chart = new File(["x"], "chart.webp", { type: "image/webp" });
  await images.add({ files: [png(), new File(["x"], "notes.txt", { type: "text/plain" }), chart], how: "drop", line: 3 });
  assertEqual(editor.inserted.length, 1);
  assertEqual(editor.inserted[0].text, "![shot](/api/image?id=1)\n![chart](/api/image?id=2)");
  assertEqual(editor.inserted[0].asLines, true);
  assertEqual(editor.inserted[0].line, 3);
  assertEqual(editor.messages.at(-1).text, "2 images added, 1 file skipped (not a PNG, JPEG, GIF or WebP image)");
});

test("note images: nothing usable, a failed upload, or another note leave the text alone", async () => {
  const svg = new File(["<svg/>"], "a.svg", { type: "image/svg+xml" });
  const none = noteImages();
  await none.images.add({ files: [svg], how: "drop", line: 0 });
  assertEqual(none.editor.inserted.length, 0);
  assertTrue(none.editor.messages.at(-1).error);

  const failing = noteImages({ upload: async () => { throw new Error("Paradigm is not answering"); } });
  await failing.images.add({ files: [png()], how: "paste" });
  assertEqual(failing.editor.inserted.length, 0);
  assertEqual(failing.editor.messages.at(-1).text, "E: Paradigm is not answering");

  let id = 7;
  const moved = noteImages({ current: () => id, upload: async () => { id = 8; return { id: 1, url: "/api/image?id=1" }; } });
  await moved.images.add({ files: [png()], how: "paste" });
  assertEqual(moved.editor.inserted.length, 0);
  assertTrue(moved.editor.messages.at(-1).error);
});

test("note images: too big after shrinking is refused before uploading", async () => {
  const { images, editor, calls } = noteImages();
  images.shrink = async () => ({ blob: { size: 9_000_000 } });
  await images.add({ files: [png()], how: "paste" });
  assertEqual(calls.length, 0);
  assertTrue(editor.messages.at(-1).text.includes("too large"));
});
