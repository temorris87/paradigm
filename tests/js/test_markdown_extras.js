import { parseMarkdown, renderBlocks } from "../../static/js/markdown/index.js";
import { assertEqual, assertTrue, test } from "./harness.js";
import { md } from "./markdown-helpers.js";

test("markdown extras: tables with alignment", () => {
  assertEqual(
    md("| L | C | R | N |\n|:--|:-:|--:|---|\n| a | **b** | `c\\|d` | e |"),
    "<table>\n<thead>\n" +
      '<tr><th class="md-align-left">L</th><th class="md-align-center">C</th><th class="md-align-right">R</th><th>N</th></tr>\n' +
      "</thead>\n<tbody>\n" +
      '<tr><td class="md-align-left">a</td><td class="md-align-center"><strong>b</strong></td><td class="md-align-right"><code>c|d</code></td><td>e</td></tr>\n' +
      "</tbody>\n</table>",
  );
});

test("markdown extras: table rows fit the header; a blank line ends the table", () => {
  assertEqual(
    md("a | b\n- | -\n1\n1 | 2 | 3\n\nafter"),
    "<table>\n<thead>\n<tr><th>a</th><th>b</th></tr>\n</thead>\n<tbody>\n" +
      "<tr><td>1</td><td></td></tr>\n<tr><td>1</td><td>2</td></tr>\n</tbody>\n</table>\n<p>after</p>",
  );
  assertEqual(md("| a |\n| - |"), "<table>\n<thead>\n<tr><th>a</th></tr>\n</thead>\n</table>");
  assertEqual(md("a | b\n- | - | -"), "<p>a | b</p>\n<ul>\n<li>| - | -</li>\n</ul>"); // widths differ
});

test("markdown extras: task lists", () => {
  assertEqual(
    md("- [ ] todo\n- [x] done\n- [X] Done\n- [ ]\n- [] not a task"),
    "<ul>\n" +
      '<li class="md-task"><input type="checkbox" disabled> todo</li>\n' +
      '<li class="md-task md-task-done"><input type="checkbox" disabled checked> done</li>\n' +
      '<li class="md-task md-task-done"><input type="checkbox" disabled checked> Done</li>\n' +
      '<li class="md-task"><input type="checkbox" disabled></li>\n' +
      "<li>[] not a task</li>\n</ul>",
  );
  assertEqual(md("- [ ] a\n\n  more"), '<ul>\n<li class="md-task">\n<p><input type="checkbox" disabled> a</p>\n<p>more</p>\n</li>\n</ul>');
});

test("markdown extras: footnotes are numbered by first use and listed at the end", () => {
  const html = md("b[^b] a[^a] b again[^b]\n\n[^a]: Note A.\n[^b]: Note B.\n[^unused]: Never shown.");
  assertEqual(
    html,
    '<p>b<sup class="md-footnote-ref"><a href="#md-fn-1" id="md-fnref-1">1</a></sup>' +
      ' a<sup class="md-footnote-ref"><a href="#md-fn-2" id="md-fnref-2">2</a></sup>' +
      ' b again<sup class="md-footnote-ref"><a href="#md-fn-1" id="md-fnref-1-2">1</a></sup></p>\n' +
      '<section class="md-footnotes">\n<hr>\n<ol>\n' +
      '<li id="md-fn-1">\n<p>Note B. <a href="#md-fnref-1" class="md-footnote-back" aria-label="Back to reference 1">↩</a>' +
      ' <a href="#md-fnref-1-2" class="md-footnote-back" aria-label="Back to reference 1">↩<sup>2</sup></a></p>\n</li>\n' +
      '<li id="md-fn-2">\n<p>Note A. <a href="#md-fnref-2" class="md-footnote-back" aria-label="Back to reference 2">↩</a></p>\n</li>\n' +
      "</ol>\n</section>",
  );
  assertEqual(md("no[^missing]"), "<p>no[^missing]</p>");
});

test("markdown extras: footnotes take indented continuation blocks", () => {
  const html = md("x[^1]\n\n[^1]: First.\n\n    Second.");
  assertTrue(html.includes("<p>First.</p>\n<p>Second. <a href"), html);
});

test("markdown extras: renderBlocks keeps footnotes separate", () => {
  const { blocks, footnotes } = renderBlocks(parseMarkdown("x[^1]\n\n[^1]: Note."), { idPrefix: "n-" });
  assertEqual(blocks[1].html, "");
  assertEqual(`${blocks[1].startLine}-${blocks[1].endLine}`, "2-2");
  assertTrue(footnotes.includes('<li id="n-fn-1">'), footnotes);
});

test("markdown extras: highlights", () => {
  assertEqual(md("==key point=="), "<p><mark>key point</mark></p>");
});

test("markdown extras: callouts, foldable and not", () => {
  assertEqual(
    md("> [!warning] Mind the *gap*\n> Body."),
    '<div class="md-callout md-callout-warning" data-callout="warning">\n' +
      '<div class="md-callout-title">Mind the <em>gap</em></div>\n' +
      '<div class="md-callout-content">\n<p>Body.</p>\n</div>\n</div>',
  );
  assertEqual(
    md("> [!faq]- Closed\n> Hidden."),
    '<details class="md-callout md-callout-question" data-callout="question">\n' +
      '<summary class="md-callout-title">Closed</summary>\n' +
      '<div class="md-callout-content">\n<p>Hidden.</p>\n</div>\n</details>',
  );
  assertTrue(md("> [!tip]+\n> Shown.").startsWith('<details class="md-callout md-callout-tip" data-callout="tip" open>\n<summary class="md-callout-title">Tip</summary>'));
  assertTrue(md("> [!whatever]").includes('class="md-callout md-callout-note"'));
  assertTrue(md("> [!whatever]").includes('<div class="md-callout-title">Whatever</div>'));
  assertEqual(md("> not [!note]"), "<blockquote>\n<p>not [!note]</p>\n</blockquote>");
});

test("markdown extras: callouts nest", () => {
  const html = md("> [!note] Outer\n> > [!bug] Inner\n> > text");
  assertTrue(html.includes('<div class="md-callout-content">\n<div class="md-callout md-callout-bug"'), html);
});

test("markdown extras: wiki links", () => {
  assertEqual(md("[[Weekly sync]]"), '<p><a class="md-wikilink" data-target="Weekly sync">Weekly sync</a></p>');
  assertEqual(md("[[Plans#Q3|the plan]]"), '<p><a class="md-wikilink" data-target="Plans#Q3">the plan</a></p>');
  assertEqual(md("[[Plans#Q3]]"), '<p><a class="md-wikilink" data-target="Plans#Q3">Plans &gt; Q3</a></p>');
  assertEqual(md("[[#Next steps]]"), '<p><a class="md-wikilink" href="#md-next-steps" data-target="#Next steps">Next steps</a></p>');
  assertEqual(md("[[]] [[ ]]"), "<p>[[]] [[ ]]</p>");
  assertEqual(md("`[[code]]`"), "<p><code>[[code]]</code></p>");
});

test("markdown extras: wiki links use the resolver when given", () => {
  const resolveWikiLink = (link) =>
    link.target === "Known" ? { href: "/notes/7", exists: true } : { href: "/notes/new", exists: false };
  assertEqual(
    md("[[Known]] [[Missing]]", { resolveWikiLink }),
    '<p><a class="md-wikilink" href="/notes/7" data-target="Known">Known</a> ' +
      '<a class="md-wikilink md-wikilink-missing" href="/notes/new" data-target="Missing">Missing</a></p>',
  );
  const evil = () => ({ href: "javascript:alert(1)", exists: true });
  assertEqual(md("[[X]]", { resolveWikiLink: evil }), '<p><a class="md-wikilink" data-target="X">X</a></p>');
  const noAddress = () => ({ href: null, exists: false });
  assertEqual(md("[[New]]", { resolveWikiLink: noAddress }), '<p><a class="md-wikilink md-wikilink-missing" data-target="New">New</a></p>');
  const archived = () => ({ href: "/notes/3", exists: true, archived: true });
  assertEqual(md("[[Old]]", { resolveWikiLink: archived }),
    '<p><a class="md-wikilink md-wikilink-archived" href="/notes/3" data-target="Old">Old</a></p>');
});
