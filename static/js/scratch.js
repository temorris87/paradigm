// Until notes exist, the page shows one editor on a scratch text held only in memory.
import "./editor/pd-editor.js";

const SAMPLE = `# Scratch

This editor is Vim on raw Markdown. Nothing here is saved yet: notes come next.

## Try

- Move with h j k l, w b e, gg G, f{char}, % and /search
- Change with d c y and a motion: dw, ci(, yap, then p or .
- [ ] i or a to type, <Esc> to stop; u undoes, Ctrl-R redoes
- [x] Tab leaves the editor, like on any web page

### Links and code

See [the Nord palette](https://www.nordtheme.com) and \`inline code\`.
`;

export function mountScratchEditor(editor) {
  if (!editor) return;
  editor.value = SAMPLE;
  editor.addEventListener("save", () => editor.showMessage("Nothing is stored yet: notes come next"));
  editor.addEventListener("quit", () => editor.showMessage("Nothing to close: this is the only text"));
  editor.focus();
}
