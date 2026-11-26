// Where the caret goes on the Live page (static/js/live/caret.js): pure.
import { CARET, placeCaret } from "../../static/js/live/caret.js";
import { renderMarkdown } from "../../static/js/markdown/index.js";
import { assertEqual, assertTrue, test } from "./harness.js";

// The line the caret is on, with "|" for the sentinel; "-" when only the band shows.
function at(text, line, col, mode = "insert") {
  const result = placeCaret(text, line, col, mode);
  if (!result.placed) {
    assertEqual(result.text, text, "no sentinel: the text is as it was");
    return "-";
  }
  return result.text.split("\n")[result.line].replace(CARET, "|");
}

test("live caret: insert mode is a bar at the column, normal mode a block", () => {
  assertEqual(at("abc", 0, 3), "abc|");
  assertEqual(at("abc", 0, 1), "a|bc");
  assertEqual(placeCaret("abc", 0, 3, "insert").shape, "bar");
  assertEqual(placeCaret("abc", 0, 3, "replace").shape, "bar");
  for (const mode of ["normal", "visual", "cmdline"]) assertEqual(placeCaret("abc", 0, 0, mode).shape, "block");
  assertEqual(placeCaret("a\nb\nc", 1, 0, "normal").line, 1);
});

test("live caret: on a heading, list or quote marker it goes to the text after it", () => {
  assertEqual(at("## Title", 0, 0, "normal"), "## |Title");
  assertEqual(at("## Title", 0, 4, "normal"), "## T|itle");
  assertEqual(at("  - item", 0, 1, "normal"), "  - |item");
  assertEqual(at("- [ ] task", 0, 2, "normal"), "- [ ] |task");
  assertEqual(at("12. step", 0, 0, "normal"), "12. |step");
  assertEqual(at("> > quoted", 0, 1, "normal"), "> > |quoted");
  assertEqual(at("- ", 0, 2), "- |", "an empty item still shows the caret");
  assertEqual(at("**bold** text", 0, 0, "normal"), "|**bold** text", "emphasis is no list marker");
});

test("live caret: fence lines, table rules, rules and drawn blocks show only the band", () => {
  const text = "```js\nlet a;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\n```mermaid\ngraph TD\n```\n\n$$\nx^2\n$$";
  assertEqual(at(text, 0, 2), "-", "the opening fence");
  assertEqual(at(text, 1, 3), "let| a;", "code inside the fence");
  assertEqual(at(text, 2, 0), "-", "the closing fence");
  assertEqual(at(text, 4, 3), "| a| | b |", "in a table cell");
  assertEqual(at(text, 5, 2), "-", "the |---| row");
  assertEqual(at(text, 8, 1), "-", "a rule");
  assertEqual(at(text, 11, 2), "-", "a diagram's source");
  assertEqual(at(text, 15, 1), "-", "maths");
  assertEqual(at("Title\n===", 1, 1), "-", "a setext underline");
});

test("live caret: a table row keeps its cells", () => {
  assertEqual(at("| a | b |", 0, 0, "normal"), "|| a | b |", "before the first | it moves inside");
  assertEqual(at("| a | b |", 0, 9), "| a | b ||", "after the last | it moves before it");
});

test("live caret: inside a URL, a wiki target, maths or a mention: only the band", () => {
  const line = "See [docs](https://x.test/a) and [[Acme|the project]] or [[Plain]], $x^2$, @Priya.";
  const col = (text) => line.indexOf(text);
  assertEqual(at(line, 0, col("docs") + 1), "See [d|ocs](https://x.test/a) and [[Acme|the project]] or [[Plain]], $x^2$, @Priya.", "link text is shown");
  assertEqual(at(line, 0, col("(https")), "-", "between ] and (");
  assertEqual(at(line, 0, col("x.test")), "-", "in the URL");
  assertEqual(at(line, 0, col("Acme") + 1), "-", "a wiki link's target");
  assertTrue(at(line, 0, col("project")).includes("the |project"), "a wiki link's label is shown");
  assertTrue(at(line, 0, col("Plain") + 2).includes("[[Plain|Pl|ain]]"), "a wiki link with no label: its target becomes its label");
  assertTrue(at(line, 0, col("[[Plain")).includes("or |[[Plain]]"), "before the [[: no rewrite");
  assertEqual(at("[[Acme#Goals]]", 0, 4), "-", "a wiki link to a heading");
  assertEqual(at(line, 0, col("x^2") + 1), "-", "inline maths");
  assertEqual(at(line, 0, col("Priya") + 2), "-", "inside a mention");
  assertTrue(at(line, 0, col("Priya") + 5).includes("@Priya|."), "right after a mention");
  assertEqual(at("go to https://example.test now", 0, 10), "-", "a bare URL");
});

test("live caret: a bare wiki link keeps its target, so the link still finds its note", () => {
  const result = placeCaret("See [[Northwind]].", 0, 11, "normal");
  assertTrue(result.placed);
  const html = renderMarkdown(result.text);
  assertTrue(html.includes(`North${CARET}wind`), "the caret is in the link's text");
  assertTrue(!/data-target="[^"]*\uE000/.test(html) && html.includes('data-target="Northwind"'), "the target has no sentinel");
});

test("live caret: never between a backslash and what it escapes, or inside a ** run", () => {
  assertEqual(at("a \\* b", 0, 3, "normal"), "a |\\* b");
  assertEqual(at("**bold**", 0, 1, "normal"), "|**bold**");
  assertEqual(at("**bold**", 0, 7, "normal"), "**bold|**");
});

test("live caret: a blank line gets only the band, so the blocks around it stay as they are", () => {
  for (const text of ["one\n\ntwo", "- a\n\n- b", "text\n\n---"]) {
    for (const mode of ["normal", "insert"]) {
      const result = placeCaret(text, 1, 0, mode);
      assertTrue(!result.placed, `${JSON.stringify(text)} ${mode}`);
      assertEqual(renderMarkdown(result.text), renderMarkdown(text));
    }
  }
  assertEqual(at("a\n   \nb", 1, 2), "-", "spaces only");
  assertEqual(at("```\na\n\nb\n```", 2, 0), "|", "a blank line in code is code");
  assertEqual(placeCaret("a", 5, 9, "normal").line, 0, "a line past the end is the last line");
});

test("live caret: an image stays an image, a footnote reference stays one", () => {
  for (let col = 0; col <= "![pic](/a.png)".length; col += 1) {
    const html = renderMarkdown(placeCaret("![pic](/a.png)", 0, col, "normal").text);
    assertTrue(html.includes("<img"), `col ${col}: ${html}`);
  }
  assertEqual(at("![pic](/a.png)", 0, 1, "normal"), "|![pic](/a.png)", "between ! and [");
  const note = "see [^1] ok\n\n[^1]: the note";
  assertEqual(at(note, 0, 6, "normal"), "-", "inside the label");
  assertEqual(at(note, 0, 5, "normal"), "-", "on the ^");
  assertEqual(at(note, 0, 4, "normal"), "see |[^1] ok", "before the [");
});

test("live caret: _italic_ and __bold__ keep their form with the caret beside the underscores", () => {
  for (const [text, tag] of [["say _hi_ now", "<em>"], ["say __hi__ now", "<strong>"]]) {
    for (let col = 0; col <= text.length; col += 1) {
      for (const mode of ["normal", "insert"]) {
        const html = renderMarkdown(placeCaret(text, 0, col, mode).text);
        assertTrue(html.includes(tag) && !html.includes("_"), `${text} col ${col} ${mode}: ${html}`);
      }
    }
  }
  assertEqual(at("say _hi_ now", 0, 4, "normal"), "say _|hi_ now", "after an opener");
  assertEqual(at("say _hi_ now", 0, 8), "say _hi|_ now", "before a closer");
  assertEqual(at("snake_case", 0, 5, "normal"), "snake|_case", "inside a word: as it was");
});

test("live caret: a reference link stays a link with the caret in its label", () => {
  const definition = "\n\n[Acme site]: https://example.invalid/";
  for (const body of ["See [Acme site] now", "See [Acme site][] now", "See [x][Acme site] now"]) {
    for (let col = 0; col <= body.length; col += 1) {
      const html = renderMarkdown(placeCaret(body + definition, 0, col, "normal").text);
      assertTrue(html.includes('href="https://example.invalid/"') && !html.includes("["), `${body} col ${col}: ${html}`);
    }
  }
  assertEqual(at("See [Acme site] now" + definition, 0, 7, "normal"), "See [Ac|me site][Acme site] now");
  assertEqual(at("See [x][Acme site] now" + definition, 0, 9, "normal"), "-", "inside [ref]: band only");
  assertEqual(at("See [nope] now", 0, 6, "normal"), "See [n|ope] now", "no definition: plain text");
});
