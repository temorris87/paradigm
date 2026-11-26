// @mentions (static/js/notes/mentions.js, the renderer's mentions.js), the editor's completion,
// highlights, mouse selection and menu event, and the page's index of mentions.
import "../../static/js/editor/pd-editor.js";
import { Completion } from "../../static/js/editor/completion.js";
import { markHighlights, plainWords } from "../../static/js/live/highlights.js";
import { renderMarkdown } from "../../static/js/markdown/index.js";
import { HUB_SECTIONS } from "../../static/js/hubs/hub-sections.js";
import { LinkIndex, indexTexts } from "../../static/js/notes/link-index.js";
import { Links } from "../../static/js/notes/links.js";
import { splitTyped } from "../../static/js/notes/mention-actions.js";
import { contextAt, mentionName, mentionsIn, mentionsOf, personForMention, rewriteMentions } from "../../static/js/notes/mentions.js";
import { TreeView } from "../../static/js/notes/tree-view.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { vimAt, type } from "./editor-helpers.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const T = "2026-11-21T12:00:00.000Z";
const NOTES = [
  { id: 1, parent_id: null, title: "Rollout", kind: "project", updated_at: T },
  { id: 2, parent_id: 1, title: "Plan", updated_at: "2026-11-20T12:00:00.000Z" },
  { id: 3, parent_id: 1, title: "Weekly sync", kind: "meeting", updated_at: T },
  { id: 10, parent_id: null, title: "Priya Shah", kind: "person", updated_at: T },
  { id: 11, parent_id: null, title: "Priya Lee", kind: "person", archived_at: T, updated_at: T },
  { id: 12, parent_id: null, title: "Sam Lee", kind: "person", updated_at: T },
];
const tree = () => new NoteTree(NOTES);

test("mentions: the renderer links known names; emails and code stay text", () => {
  const resolveMention = (name) => (name.toLowerCase() === "priyashah" ? { href: "/?note=10" } : null);
  const html = renderMarkdown("Ask @PriyaShah, not a@b.com or `@PriyaShah` or @Nobody.", { resolveMention });
  assertEqual(html, '<p>Ask <a class="md-mention" href="/?note=10" data-mention="PriyaShah">@PriyaShah</a>, '
    + "not a@b.com or <code>@PriyaShah</code> or @Nobody.</p>\n");
  assertTrue(renderMarkdown("[@PriyaShah](https://x.example)", { resolveMention }).includes(">@PriyaShah</a>"), "inside a link: the link's");
  assertEqual(renderMarkdown("@Priya's call", { resolveMention: () => ({ href: "/" }) }).includes('data-mention="Priya"'), true);
});

test("mentions: each one found with its line and the lines indented under it", () => {
  const text = "- Rollout\n  - @PriyaShah to check dates\n    - slipped twice\n\n    - and again\n  - next\n```\n@SamLee in code\n```\nemail a@b.com @Sam";
  const found = mentionsIn(text, "body");
  assertEqual(found.map((m) => `${m.name}@${m.line}`).join(), "PriyaShah@1,Sam@9");
  assertEqual(found[0].context, "  - @PriyaShah to check dates\n    - slipped twice\n\n    - and again");
  assertEqual(found[1].field, "body");
  assertEqual(contextAt(["a", "b"], 0), "a", "a line with nothing under it stands alone");
  assertEqual(mentionsIn("@A and @a", "agenda").length, 1, "one per name per line");
  assertEqual(mentionsIn("no one here").length, 0);
});

test("mentions: a name reaches a person by full name, or a first name only one live person has", () => {
  const t = tree();
  assertEqual(personForMention(t, "PriyaShah")?.id, 10);
  assertEqual(personForMention(t, "priyashah")?.id, 10, "case is ignored");
  assertEqual(personForMention(t, "Priya")?.id, 10, "the other Priya is archived");
  assertEqual(personForMention(t, "Sam")?.id, 12);
  assertEqual(personForMention(t, "PriyaLee")?.id, 11, "an archived person by full name");
  assertEqual(personForMention(t, "Rollout"), null, "only people");
  const both = new NoteTree(NOTES.map((n) => (n.id === 11 ? { ...n, archived_at: null } : n)));
  assertEqual(personForMention(both, "Priya"), null, "two live Priyas: ambiguous");
  assertEqual(mentionName(t.get(10)), "PriyaShah");
});

test("mentions: apostrophes and hyphens in a name are optional", () => {
  const t = new NoteTree([...NOTES, { id: 13, parent_id: null, title: "Liam O'Connor", kind: "person", updated_at: T },
    { id: 14, parent_id: null, title: "Ann-Marie Diaz", kind: "person", updated_at: T }]);
  assertEqual(personForMention(t, "LiamOConnor")?.id, 13);
  assertEqual(personForMention(t, "LiamO'Connor")?.id, 13);
  assertEqual(personForMention(t, "AnnMarieDiaz")?.id, 14);
  assertEqual(personForMention(t, "AnnMarie")?.id, 14, "a hyphenated first name, unique");
});

test("mentions: who mentions a person, newest first; a Backlinks section with the context", () => {
  const t = tree();
  const mentions = [
    { id: 2, field: "body", line: 4, name: "PriyaShah", context: "  - @PriyaShah to check\n    - why" },
    { id: 3, field: "agenda", line: 0, name: "Priya", context: "1. @Priya: dates" },
    { id: 12, field: "body", line: 0, name: "Sam", context: "@Sam" },
    { id: 99, field: "body", line: 0, name: "Priya", context: "trashed" },
  ];
  assertEqual(mentionsOf(t, mentions, 10).map((m) => `${m.note.title}:${m.line}`).join(), "Weekly sync:0,Plan:4");
  const rows = HUB_SECTIONS.find((s) => s.key === "backlinks").rows({ tree: t, mentions, links: new Links([{ id: 12, targets: ["Priya Shah"] }]) }, t.get(10));
  assertEqual(rows.map((r) => `${r.title}|${r.detail}`).join(","), "Weekly sync|agenda · Rollout · 21 Nov,Plan|Rollout · 20 Nov,Sam Lee|links here · 21 Nov");
  assertEqual(rows[1].snippet, "- @PriyaShah to check\n  - why", "moved left by the first line's indent");
  assertEqual(JSON.stringify(rows[1].at), '{"field":"body","line":4}');
});

test("mentions: a rename rewrites @Old as @New outside code", () => {
  const { text, changed } = rewriteMentions("@PriyaShah and @priyashah's and `@PriyaShah`\n```\n@PriyaShah\n```", ["PriyaShah"], "PriyaLee");
  assertEqual(text, "@PriyaLee and @PriyaLee's and `@PriyaShah`\n```\n@PriyaShah\n```".replace("`@PriyaShah`", "`@PriyaLee`"));
  assertEqual(changed, 3);
  assertEqual(JSON.stringify(splitTyped("PriyaShah")), '{"first":"Priya","last":"Shah"}');
  assertEqual(JSON.stringify(splitTyped("priya")), '{"first":"priya","last":""}');
});

test("link index: a save sends links and mentions of every field; a catch-up reads agendas", async () => {
  const sent = [];
  const index = new LinkIndex({ api: {
    list: async () => ({ links: [], mentions: [], stale: [{ id: 3, version: 1, body: "[[Plan]]", agenda: "1. @Sam" }] }),
    catchUp: async (entries) => { sent.push(entries); return { stored: entries.map((e) => e.id) }; },
  } });
  const save = index.saver(async (note) => { sent.push(note); return { version: 2 }; }, (note) => ({ body: note.body, agenda: "- @Priya" }));
  await save({ id: 2, body: "[[A]] @Sam", version: 1 });
  assertEqual(sent[0].links.join(), "A");
  assertEqual(sent[0].mentions.map((m) => `${m.field}:${m.name}`).join(), "body:Sam,agenda:Priya");
  assertEqual(index.mentions.map((m) => `${m.id}:${m.name}`).join(), "2:Sam,2:Priya");
  await index.refresh();
  await index.catching;
  assertEqual(sent[1][0].mentions[0].field, "agenda");
  assertEqual(index.mentions.map((m) => `${m.id}:${m.name}`).join(), "3:Sam");
  assertEqual(JSON.stringify(indexTexts({ body: "x", agenda: undefined })), '{"links":[],"mentions":[]}');
});

test("tree: meetings, decisions and questions are not in it; the hub stands in for them", () => {
  const root = document.createElement("ul");
  document.body.append(root);
  try {
    const view = new TreeView(root, { onOpen() {}, onLeave() {} });
    view.show(tree(), 3);
    const titles = [...root.querySelectorAll(".tree__title")].map((n) => n.textContent);
    assertTrue(titles.includes("Plan") && !titles.includes("Weekly sync"), titles.join());
    assertEqual(root.querySelector("[tabindex='0'] .tree__title")?.textContent, "Rollout");
  } finally {
    root.remove();
    localStorage.removeItem("paradigm.tree.expanded");
  }
});

// ---- the editor --------------------------------------------------------------------------

test("vim: a drag selects characters; the selection's text", () => {
  const vim = vimAt("one |two three\nfour");
  vim.drag({ line: 0, col: 4 }, { line: 0, col: 6 });
  assertEqual(vim.mode, "visual");
  assertEqual(vim.selectedText(), "two");
  vim.drag({ line: 0, col: 4 }, { line: 1, col: 1 });
  assertEqual(vim.selectedText(), "two three\nfo");
  type(vim, "<Esc>");
  assertEqual(vim.selectedText(), null);
  type(vim, "V");
  assertEqual(vim.selectedText(), "four");
  const inserting = vimAt("ab|cd");
  type(inserting, "i");
  inserting.drag({ line: 0, col: 0 }, { line: 0, col: 1 });
  assertEqual(inserting.selectedText(), "ab", "insert mode is left first");
});

test("completion: @ at a word start lists people; Enter takes one; Escape closes it", () => {
  const frame = document.createElement("div");
  document.body.append(frame);
  const taken = [];
  try {
    const completion = new Completion(frame, { accept: (length, text) => taken.push(`${length}:${text}`) });
    completion.sources = { "@": (query) => [{ label: `${query}!`, insert: `@${query}X ` }, { label: "two", insert: "@two " }] };
    const at = (text) => {
      const vim = vimAt(`${text}|`);
      type(vim, "a");
      completion.update(vim, () => null, { left: 0, top: 0 });
      return vim;
    };
    at("email a@b");
    assertTrue(!completion.open, "not after a letter");
    at("hi @pri");
    assertTrue(completion.open);
    assertEqual(frame.querySelector(".pd-complete__item").textContent, "pri!");
    assertTrue(completion.onKey("<Down>"));
    assertTrue(completion.onKey("<CR>"));
    assertEqual(taken.join(), "4:@two ");
    assertTrue(!completion.open);
    at("@x");
    completion.onKey("<Esc>");
    at("@x");
    assertTrue(!completion.open, "dismissed until the word changes");
    at("@xy");
    assertTrue(completion.open);
    assertTrue(!completion.onKey("a"), "typing goes on to the editor");
  } finally {
    frame.remove();
  }
});

test("highlights: quoted Markdown is found in the rendered text and marked", () => {
  assertEqual(plainWords("- **Who** owns [[Comms|comms]]?\n  more"), "Who owns comms?");
  const node = document.createElement("div");
  node.innerHTML = renderMarkdown("Then: **Who** owns comms? Nobody.");
  markHighlights(node, [{ text: "- **Who** owns comms?", label: "Question", title: "t", data: 7 }]);
  assertEqual([...node.querySelectorAll(".pd-highlight")].map((m) => m.textContent).join("|"), "Who| owns comms?");
  assertEqual(node.querySelector(".pd-highlight__badge").textContent, "Question");
  markHighlights(node, [{ text: "not there", label: "x" }]);
  assertEqual(node.querySelectorAll(".pd-highlight__badge").length, 1);
});

test("element: a right-click sends menu with the selection; a cancelled one keeps the browser's away", () => {
  const editor = document.createElement("pd-editor");
  document.body.append(editor);
  try {
    editor.value = "pick these words";
    const seen = [];
    editor.addEventListener("menu", (event) => {
      seen.push(event.detail.text);
      event.preventDefault();
    });
    const frame = editor.shadowRoot.querySelector(".pd-editor");
    const first = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 });
    frame.dispatchEvent(first);
    assertTrue(first.defaultPrevented);
    editor.vim.drag({ line: 0, col: 5 }, { line: 0, col: 9 });
    frame.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    assertEqual(seen.join("|"), "|these", "null, then the selection");
    assertEqual(editor.selectedText, "these");
  } finally {
    editor.remove();
  }
});

test("links: among meetings sharing a name, a plain note wins, then the one made last", async () => {
  const { resolveLink } = await import("../../static/js/notes/resolve.js");
  const notes = [
    { id: 1, parent_id: null, title: "Rollout", kind: "project" },
    { id: 2, parent_id: 1, title: "Weekly sync", kind: "meeting" },
    { id: 5, parent_id: 1, title: "Weekly sync", kind: "meeting" },
    { id: 3, parent_id: 1, title: "Plan" },
  ];
  assertEqual(resolveLink(new NoteTree(notes), 3, "Weekly sync").note.id, 5);
  const withNote = new NoteTree([...notes, { id: 4, parent_id: 1, title: "weekly sync" }]);
  assertEqual(resolveLink(withNote, 3, "Weekly sync").note.id, 4);
});
