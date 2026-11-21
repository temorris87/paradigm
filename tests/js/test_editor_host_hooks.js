// What <pd-editor> offers a host page without knowing about notes: renderer options, the
// link event, host ex commands, the [+] flag and goToLine.
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

function mouse(target, type, extra = {}) {
  const box = target.getBoundingClientRect();
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: 0, clientX: box.left + 2, clientY: box.top + box.height / 2, ...extra });
  target.dispatchEvent(event);
  return event;
}

const TEXT = "# Top\n\nSee [[Known]] and [[Missing#Part|later]].\n\nend";

test("host hooks: markdownOptions resolve wiki links, and new options redraw", () => withEditor(TEXT, (editor, root) => {
  let links = root.querySelectorAll(".pd-unit a.md-wikilink");
  assertEqual(links.length, 2);
  assertEqual(links[0].hasAttribute("href"), false, "no resolver: no address");
  editor.markdownOptions = {
    resolveWikiLink: (link) => (link.target === "Known" ? { href: "/?note=3", exists: true } : { href: null, exists: false }),
  };
  links = root.querySelectorAll(".pd-unit a.md-wikilink");
  assertEqual(links[0].getAttribute("href"), "/?note=3");
  assertTrue(links[1].classList.contains("md-wikilink-missing"));
  assertEqual(links[1].hasAttribute("href"), false);
}));

test("host hooks: clicking a wiki link sends link and doesn't navigate", () => withEditor(TEXT, (editor, root) => {
  editor.markdownOptions = { resolveWikiLink: () => ({ href: "/?note=3", exists: true }) };
  const targets = [];
  editor.addEventListener("link", (event) => targets.push(event.detail.target));
  const [known, missing] = root.querySelectorAll(".pd-unit a.md-wikilink");
  mouse(known, "mousedown");
  assertTrue(mouse(known, "click").defaultPrevented, "the page stays");
  mouse(missing, "mousedown");
  assertEqual(targets.join("|"), "Known|Missing#Part");
  assertEqual(editor.vim.cursor.line, 0, "the cursor did not move");
}));

test("host hooks: Ctrl-click on a wiki link is left to the browser", () => withEditor(TEXT, (editor, root) => {
  editor.markdownOptions = { resolveWikiLink: () => ({ href: "/?note=3", exists: true }) };
  const targets = [];
  editor.addEventListener("link", (event) => targets.push(event.detail.target));
  const known = root.querySelector(".pd-unit a.md-wikilink");
  mouse(known, "mousedown", { ctrlKey: true });
  assertEqual(targets.length, 0);
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
