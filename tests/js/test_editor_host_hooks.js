// What <pd-editor> offers a host page without knowing about notes: raw text only, the cursor
// event, host ex commands, the [+] flag and goToLine.
import "../../static/js/editor/pd-editor.js";
import { assertEqual, assertTrue, test } from "./harness.js";

async function withEditor(text, body) {
  const editor = document.createElement("pd-editor");
  document.body.append(editor);
  editor.value = text;
  try {
    for (let tries = 0; editor.vim.view.height < 8 && tries < 100; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await body(editor, editor.shadowRoot);
  } finally {
    editor.remove();
  }
}

function press(editor, key) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, composed: true });
  editor.shadowRoot.querySelector(".pd-input").dispatchEvent(event);
}

const typeKeys = (editor, keys) => { for (const key of keys) press(editor, key); };

const TEXT = "# Top\nSee [[Known]] and $x^2$.\n```mermaid\ngraph TD\n```\n| a |\n|---|";

test("host hooks: the text is raw Markdown, one line per row, in every mode", () => withEditor(TEXT, async (editor, root) => {
  const rows = () => [...root.querySelectorAll(".pd-line[data-line]")].map((line) => line.textContent.trimEnd()).join("\n");
  assertEqual(rows(), TEXT, "normal mode");
  assertEqual(root.querySelector(".md-doc, .katex, svg, table, img"), null, "nothing rendered");
  typeKeys(editor, ["j", "A"]);
  assertEqual(rows(), TEXT, "insert mode");
  typeKeys(editor, ["Escape", ":", ..."set preview", "Enter"]);
  assertTrue(editor.vim.message?.error && editor.vim.message.text.includes("Unknown option"), editor.vim.message?.text);
}));

test("host hooks: cursor reports the line, column and mode after a key or a click", () => withEditor("ab\ncd", (editor) => {
  const seen = [];
  editor.addEventListener("cursor", (event) => seen.push(`${event.detail.line}:${event.detail.col}:${event.detail.mode}`));
  typeKeys(editor, ["l", "l", "j", "i", "Escape"]);
  assertEqual(seen.join(" "), "0:1:normal 1:1:normal 1:1:insert 1:0:normal", "l at the end moved nothing");
  seen.length = 0;
  typeKeys(editor, ["u"]);
  assertEqual(seen.length, 0, "nothing moved, nothing sent");
  editor.goToLine(0);
  assertEqual(seen.join(" "), "0:0:normal");
}));

test("host hooks: addExCommand sends ex with name, arg and bang", () => withEditor("text", (editor) => {
  editor.addExCommand("edit", 1);
  editor.addExCommand("rename");
  const seen = [];
  editor.addEventListener("ex", (event) => seen.push(`${event.detail.name}${event.detail.bang ? "!" : ""}[${event.detail.arg}]`));
  typeKeys(editor, [":", ..."e /Projects/Acme", "Enter"]);
  typeKeys(editor, [":", ..."edit!", "Enter"]);
  typeKeys(editor, [":", ..."rename  New title ", "Enter"]);
  typeKeys(editor, [":", ..."ren x", "Enter"]);
  assertEqual(seen.join(" "), "edit[/Projects/Acme] edit![] rename[New title]");
  assertTrue(editor.vim.message?.error, ":ren is too short: not a command");
}));

test("host hooks: built-in commands win over host ones", () => withEditor("a\nb", (editor) => {
  editor.addExCommand("delete", 1);
  const seen = [];
  editor.addEventListener("ex", () => seen.push("ex"));
  typeKeys(editor, [":", "d", "Enter"]);
  assertEqual(seen.length, 0);
  assertEqual(editor.value, "b");
}));

test("host hooks: :w! saves with force", () => withEditor("a", (editor) => {
  const saves = [];
  editor.addEventListener("save", (event) => saves.push(Boolean(event.detail.force)));
  typeKeys(editor, [":", "w", "Enter", ":", "w", "!", "Enter"]);
  assertEqual(saves.join(), "false,true");
}));

test("host hooks: modified shows [+] and goToLine moves the cursor", () => withEditor("a\nb\nc", (editor, root) => {
  assertEqual(root.querySelector(".pd-status__modified"), null);
  editor.modified = true;
  assertEqual(root.querySelector(".pd-status__modified").textContent, "[+]");
  editor.modified = false;
  assertEqual(root.querySelector(".pd-status__modified"), null);
  editor.goToLine(2);
  assertEqual(editor.vim.cursor.line, 2);
  editor.goToLine(99);
  assertEqual(editor.vim.cursor.line, 2);
}));
