// :export: which notes come along (scope.js), how they render into one file (render-notes.js,
// page.js) and how maths, diagrams and images are made self-contained (assets.js).
import { inlineAssets } from "../../static/js/export/assets.js";
import { exportFileName } from "../../static/js/export/download.js";
import { exportNote } from "../../static/js/export/export.js";
import { buildPage, EXPORT_CSP } from "../../static/js/export/page.js";
import { renderNotes } from "../../static/js/export/render-notes.js";
import { collectNotes, inScope } from "../../static/js/export/scope.js";
import { wikiTargets } from "../../static/js/notes/links.js";
import { renderMarkdown } from "../../static/js/markdown/index.js";
import { NoteTree } from "../../static/js/notes/tree-model.js";
import { assertEqual, assertTrue, test } from "./harness.js";

// Projects(1) > Acme(2) > Sprint 3(3) > Retro(4)
//                       > Sprint 4(5) > Tasks(6)
//             > Northwind(7) > Sprint 1(8)
// Inbox(9)
const TREE = new NoteTree([
  { id: 1, parent_id: null, title: "Projects" },
  { id: 2, parent_id: 1, title: "Acme" },
  { id: 3, parent_id: 2, title: "Sprint 3" },
  { id: 4, parent_id: 3, title: "Retro" },
  { id: 5, parent_id: 2, title: "Sprint 4" },
  { id: 6, parent_id: 5, title: "Tasks" },
  { id: 7, parent_id: 1, title: "Northwind" },
  { id: 8, parent_id: 7, title: "Sprint 1" },
  { id: 9, parent_id: null, title: "Inbox" },
]);

const bodiesOf = (bodies) => async (id) => bodies[id] ?? "";
const ids = (notes) => notes.map((note) => note.id).join(",");

test("export scope: beside, under, and under a note beside are in; the rest is out", () => {
  const inn = (id) => inScope(TREE, 5, id);
  assertTrue(inn(5) && inn(6) && inn(3) && inn(4), "itself, child, sibling, sibling's child");
  assertTrue(!inn(2) && !inn(1) && !inn(7) && !inn(8) && !inn(9), "parent, ancestors, other branches");
  assertTrue(!inn(99), "a note that does not exist");
});

test("export scope: a top-level note has every note beside or under it", () => {
  for (const id of [1, 2, 4, 8, 9]) assertTrue(inScope(TREE, 9, id), `note ${id}`);
});

test("export scope: wiki link targets are found everywhere, same-note headings skipped", () => {
  const body = "[[A]] and [[B#H|b]]\n\n- [[C]]\n\n| x |\n|---|\n| [[D]] |\n\n> [!note]\n> [[E]]\n\n[^1]\n\n[^1]: [[F]]\n\n[[#Here]]";
  assertEqual(wikiTargets(body).join(","), "A,B,C,D,E,F");
});

test("export scope: links are followed through bundled notes, measured from the export", async () => {
  const notes = await collectNotes(TREE, 5, bodiesOf({
    5: "[[Tasks]] [[Acme]] [[Northwind/Sprint 1]] [[Nowhere]]",
    6: "[[Sprint 3]] [[Sprint 4]]", // back to the root: not twice
    3: "[[Retro]] [[Inbox]]",
    4: "[[Tasks]]",
  }));
  assertEqual(ids(notes), "5,6,3,4");
  assertEqual(notes[0].title, "Sprint 4");
  assertEqual(notes[1].body, "[[Sprint 3]] [[Sprint 4]]");
});

test("export scope: a note with no links exports alone", async () => {
  assertEqual(ids(await collectNotes(TREE, 6, bodiesOf({ 6: "just text" }))), "6");
});

const NOTES = [
  { id: 5, title: "Sprint 4", body: "# Agenda\n\n[[Tasks]] [[Tasks#Open items]] [[#Agenda]] [[Acme]] [[Northwind/Sprint 1|NW]] [[Nowhere]]" },
  { id: 6, title: "Tasks", body: "# Agenda\n\n## Open items\n\nx[^1]\n\n[^1]: note" },
];

test("export render: links to bundled notes point inside the file", () => {
  const html = renderNotes(TREE, NOTES);
  assertTrue(html.includes('href="#note-6"'), "note link");
  assertTrue(html.includes('href="#n6-open-items"') && html.includes('id="n6-open-items"'), "heading link and target");
  assertTrue(html.includes('href="#n5-agenda"'), "same-note heading");
  assertTrue(html.includes('<section class="export-note" id="note-6">'), "section");
});

test("export render: links to notes not in the file are plain text", () => {
  const html = renderNotes(TREE, NOTES);
  assertTrue(html.includes(" Acme NW Nowhere</p>"), html);
});

test("export render: every note's ids are its own", () => {
  const html = renderNotes(TREE, NOTES);
  assertTrue(html.includes('id="n5-agenda"') && html.includes('id="n6-agenda"'), "headings");
  assertTrue(html.includes('id="n6-fn-1"') && html.includes('href="#n6-fn-1"'), "footnotes");
});

test("export render: titles are escaped, and the list of other notes only when there are some", () => {
  const html = renderNotes(TREE, [{ id: 9, title: "<b>Inbox</b>", body: "" }]);
  assertTrue(html.includes("&lt;b&gt;Inbox&lt;/b&gt;"), "escaped");
  assertTrue(!html.includes("export-contents"), "no list for one note");
  assertTrue(renderNotes(TREE, NOTES).includes('<li><a href="#note-6">Tasks</a></li>'), "list");
});

test("export render: plain wiki links in the renderer keep only their text, escaped", () => {
  const html = renderMarkdown("[[A<b>|x<y]]", { resolveWikiLink: () => ({ plain: true }) });
  assertEqual(html.trim(), "<p>x&lt;y</p>");
});

test("export page: a CSP that forbids scripts and outside loads, no script anywhere", () => {
  const page = buildPage({ title: "T & </title>", css: "a{} </style><script>x</script>", content: "<p>hi</p>\n" });
  assertTrue(EXPORT_CSP.includes("default-src 'none'") && !EXPORT_CSP.includes("script-src"), "csp");
  assertTrue(page.includes('http-equiv="Content-Security-Policy"'), "csp meta");
  assertTrue(page.includes("<title>T &amp; &lt;/title&gt;</title>"), "title");
  assertTrue(!/<script/i.test(page.replace("<\\/style><script>", "")), "no script element");
  assertEqual(new DOMParser().parseFromString(page, "text/html").querySelectorAll("script").length, 0);
});

test("export file name: Windows-safe and never empty", () => {
  assertEqual(exportFileName('Q3: plan/"draft"?'), "Q3 plandraft.html");
  assertEqual(exportFileName("Notes. "), "Notes.html");
  assertEqual(exportFileName("***"), "note.html");
});

const PNG = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
const fakeFetch = (counts) => async (src) => {
  counts.push(src);
  if (src.endsWith("=2")) return new Blob(["<svg/>"], { type: "image/svg+xml" });
  if (src.endsWith("=3")) throw new Error("404");
  return PNG;
};

test("export assets: maths becomes MathML with no style attributes", async () => {
  const html = await inlineAssets(renderMarkdown("$x^2$ and\n\n$$\\frac{a}{b}$$"), { svgFor: null, fetchImage: null });
  const doc = new DOMParser().parseFromString(html, "text/html");
  assertEqual(doc.querySelectorAll("math").length, 2);
  assertTrue(!html.includes("style="), "no styles");
  assertTrue(doc.querySelector("math[display=block]") !== null, "display maths");
});

test("export assets: a bad formula keeps its source, marked", async () => {
  const html = await inlineAssets(renderMarkdown("$\\frac{$"), { svgFor: null, fetchImage: null });
  assertTrue(html.includes("md-math-error") && html.includes("\\frac{"), html);
});

test("export assets: diagrams become cleaned SVG, errors show the source", async () => {
  const svgFor = async (source) => (source.includes("bad")
    ? { error: "Parse error" }
    : { svg: '<svg id="d1" xmlns="http://www.w3.org/2000/svg"><style>#d1{fill:red}</style><rect onclick="x()" style="stroke: blue"></rect><script>x()</script><a href="javascript:x()"><text>t</text></a></svg>' });
  const html = await inlineAssets(renderMarkdown("```mermaid\ngood\n```\n\n```mermaid\nbad\n```"), { svgFor, fetchImage: null });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const svg = doc.querySelector(".md-mermaid svg");
  assertTrue(svg !== null, "svg in");
  assertTrue(svg.querySelector("style") !== null && svg.querySelector("rect").getAttribute("style") === "stroke: blue", "styles kept");
  assertTrue(!html.includes("<script") && !html.includes("onclick") && !html.includes("javascript:"), "cleaned");
  const error = doc.querySelectorAll(".md-mermaid")[1];
  assertTrue(error.classList.contains("md-mermaid-error") && error.textContent.includes("bad") && error.textContent.includes("Parse error"), "error");
});

test("export assets: own images inline once each, outside ones become links, failures say so", async () => {
  const counts = [];
  const md = "![a](/api/image?id=1) ![a](/api/image?id=1) ![svg](/api/image?id=2) ![gone](/api/image?id=3) ![web](https://acme.example/x.png) ![rel](pic.png)";
  const html = await inlineAssets(renderMarkdown(md), { svgFor: null, fetchImage: fakeFetch(counts) });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgs = [...doc.querySelectorAll("img")];
  assertEqual(imgs.length, 2);
  assertTrue(imgs.every((img) => img.src.startsWith("data:image/png;base64,")), "data URLs");
  assertEqual(counts.filter((src) => src.endsWith("=1")).length, 1, "fetched once");
  assertTrue(html.includes("[missing image: svg]") && html.includes("[missing image: gone]"), "refused or missing");
  const link = doc.querySelector('a[href="https://acme.example/x.png"]');
  assertTrue(link !== null && link.textContent === "[image: web]" && link.target === "_blank", "outside image as a link");
  assertTrue(html.includes(">rel</span>"), "relative image as its alt text");
});

test("export: the whole file from the open note's text, with linked notes from the API", async () => {
  let saved = null;
  const result = await exportNote({
    tree: TREE,
    rootId: 5,
    rootBody: "unsaved [[Tasks]] $x$",
    notesApi: { get: async (id) => ({ id, body: `body of ${id}` }) },
    svgFor: async () => ({ error: "x" }),
    fetchImage: async () => PNG,
    fetchText: async (url) => `/* ${url.split("/").pop()} */`,
    save: (name, text) => { saved = { name, text }; },
  });
  assertEqual(result.count, 1);
  assertEqual(saved.name, "Sprint 4.html");
  assertTrue(saved.text.includes("unsaved") && saved.text.includes("body of 6"), "both notes");
  assertTrue(saved.text.includes("/* nord.css */") && saved.text.includes("/* export.css */"), "styles");
  assertTrue(saved.text.includes("<math"), "maths");
});
