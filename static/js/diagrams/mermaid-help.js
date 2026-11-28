// Mermaid help in an editor (the note window's): inside a ```mermaid block, the syntax for its
// type as you type (Ctrl-Space for all of it), Tab to the next ‹blank›, and the type in the
// status line. The editor stays generic: this only hands it the sources (mermaid-syntax.js).
//
//   mermaidEditorHelp(editor)            turns it on
//   mermaidStatusHint(text, cursor)      the status line's words: "mermaid · gantt · 3 tasks"
import { mermaidBlankScope, mermaidCompletion, mermaidStatus } from "./mermaid-syntax.js";

export function mermaidEditorHelp(editor) {
  editor.contextCompletion = mermaidCompletion;
  editor.blankScope = mermaidBlankScope;
}

export function mermaidStatusHint(text, cursor) {
  // Most notes have no diagram: no need to split them on every key.
  if (!cursor || !/mermaid/i.test(text)) return "";
  return mermaidStatus(text.split("\n"), cursor.line);
}
