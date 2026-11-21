// Mermaid diagrams: the renderer's placeholder, the CSP-safe insert helper, the render queue
// (with a fake Mermaid), and one real render. (This runner has no CSP; the CSP check is
// markdown-sample.html and the app itself, see CLAUDE.md "Testing".)
import { adoptedDiagramIds, cleanSvg, insertSvg, syncDiagramSheets } from "../../static/js/diagrams/insert-svg.js";
import { createDiagramRenderer, mermaidConfig } from "../../static/js/diagrams/mermaid.js";
import { renderMarkdown } from "../../static/js/markdown/index.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const SVG = `<svg id="dg-1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="max-width: 120px;" viewBox="0 0 120 40">
<style>#dg-1 .box{fill:rgb(1, 2, 3);}</style>
<rect class="box" width="10" height="10" style="stroke: rgb(4, 5, 6);" onclick="window.pwned = 1"></rect>
<a xlink:href="https://acme.example/x"><text>ok</text></a>
<a href="javascript:window.pwned = 1"><text>bad</text></a>
<a xlink:href="java&#9;script:alert(1)"><text>bad2</text></a>
<script>window.pwned = 1</script>
</svg>`;

function shadowHost() {
  const host = document.createElement("div");
  document.body.append(host);
  return { host, root: host.attachShadow({ mode: "open" }) };
}

test("diagrams: a mermaid fence renders as a placeholder holding the source", () => {
  const html = renderMarkdown("```mermaid\nflowchart LR\n  a --> b<c\n```");
  assertEqual(html.trim(), '<div class="md-mermaid">flowchart LR\n  a --&gt; b&lt;c\n</div>');
});

test("diagrams: other fences stay code", () => {
  assertTrue(renderMarkdown("```js\nx\n```").includes('<code class="language-js">'));
  assertTrue(!renderMarkdown("    mermaid\n").includes("md-mermaid"), "indented code");
});

test("diagrams: insertSvg moves styles to an adopted sheet and the CSSOM", () => {
  const { host, root } = shadowHost();
  const box = document.createElement("div");
  root.append(box);
  const svg = insertSvg(box, SVG);
  assertTrue(svg && svg.namespaceURI === "http://www.w3.org/2000/svg", "an SVG element");
  assertTrue(box.querySelector("style") === null, "no <style> element");
  assertEqual(svg.style.maxWidth, "120px");
  assertEqual(box.querySelector("rect").style.stroke, "rgb(4, 5, 6)");
  assertTrue(box.querySelector("[data-pd-style]") === null, "markers removed");
  assertEqual(root.adoptedStyleSheets.length, 1);
  assertEqual(getComputedStyle(box.querySelector("rect")).fill, "rgb(1, 2, 3)");
  host.remove();
});

test("diagrams: a 100%-wide diagram whose max-width the CSP dropped keeps its natural width", () => {
  const box = document.createElement("div");
  const svg = insertSvg(box, '<svg width="100%" style="" viewBox="4 4 360 96" xmlns="http://www.w3.org/2000/svg"></svg>');
  assertEqual(svg.style.maxWidth, "360px");
});

test("diagrams: insertSvg drops scripts, handlers and unsafe links", () => {
  const box = document.createElement("div");
  insertSvg(box, SVG);
  assertTrue(box.querySelector("script") === null, "script");
  assertTrue(!box.querySelector("rect").hasAttribute("onclick"), "onclick");
  const [ok, bad, bad2] = box.querySelectorAll("a");
  assertEqual(ok.getAttribute("href"), "https://acme.example/x");
  assertEqual(ok.getAttribute("target"), "_blank");
  assertEqual(ok.getAttribute("rel"), "noopener noreferrer");
  assertEqual(ok.getAttribute("tabindex"), "-1");
  for (const link of [bad, bad2]) {
    assertTrue(!link.hasAttribute("href") && !link.hasAttributeNS("http://www.w3.org/1999/xlink", "href"), link.outerHTML);
  }
  assertEqual(window.pwned, undefined);
});

test("diagrams: a diagram inserted before its node joins the page gets its sheet on sync", () => {
  const { host, root } = shadowHost();
  const box = document.createElement("div");
  insertSvg(box, SVG);
  root.append(box);
  assertEqual(root.adoptedStyleSheets.length, 0);
  syncDiagramSheets(root);
  assertEqual(getComputedStyle(box.querySelector("rect")).fill, "rgb(1, 2, 3)");
  host.remove();
});

test("diagrams: a diagram's sheet is shared, and dropped once it is gone", () => {
  const { host, root } = shadowHost();
  const one = document.createElement("div");
  const two = document.createElement("div");
  root.append(one, two);
  insertSvg(one, SVG);
  insertSvg(two, SVG);
  assertEqual(root.adoptedStyleSheets.length, 1);
  one.remove();
  syncDiagramSheets(root);
  assertEqual(adoptedDiagramIds(root).join(), "dg-1", "still shown once");
  two.remove();
  syncDiagramSheets(root);
  assertEqual(root.adoptedStyleSheets.length, 0);
  host.remove();
});

function fakeMermaid() {
  const calls = { initialize: [], render: [] };
  const api = {
    initialize: (config) => calls.initialize.push(config),
    render: async (id, source) => {
      calls.render.push(source);
      if (source.startsWith("bad")) throw new Error("Parse error on line 1");
      return { svg: `<svg id="${id}" xmlns="http://www.w3.org/2000/svg"><text>${source.trim()}</text></svg>` };
    },
  };
  return { calls, load: async () => api };
}

function placeholders(...sources) {
  const root = document.createElement("div");
  document.body.append(root);
  root.innerHTML = renderMarkdown(sources.map((source) => "```mermaid\n" + source + "\n```\n").join("\n"));
  return root;
}

test("diagrams: renders once per source, fills waiting placeholders, then draws from cache", async () => {
  const { calls, load } = fakeMermaid();
  const renderer = createDiagramRenderer({ load });
  const drawn = [];
  renderer.onDrawn((source) => drawn.push(source));
  const root = placeholders("one", "one", "two");
  renderer.draw(root);
  const pending = root.querySelectorAll(".md-mermaid-pending");
  assertEqual(pending.length, 3, "all wait at first");
  await renderer.idle();
  assertEqual(calls.initialize.length, 1);
  assertEqual(calls.initialize[0].securityLevel, "strict");
  assertEqual(calls.render.join("|"), "one\n|two\n");
  assertEqual(drawn.length, 2);
  assertEqual([...root.querySelectorAll(".md-mermaid svg text")].map((t) => t.textContent).join(), "one,one,two");
  const again = placeholders("two");
  renderer.draw(again);
  assertTrue(again.querySelector(".md-mermaid svg") !== null, "drawn at once from the cache");
  assertEqual(calls.render.length, 2);
  root.remove();
  again.remove();
});

test("diagrams: a failed render shows the source and the message", async () => {
  const { load } = fakeMermaid();
  const renderer = createDiagramRenderer({ load });
  const root = placeholders("bad <graph>");
  renderer.draw(root);
  await renderer.idle();
  const element = root.querySelector(".md-mermaid");
  assertTrue(element.classList.contains("md-mermaid-error"));
  assertEqual(element.querySelector("pre").textContent, "bad <graph>\n");
  assertEqual(element.querySelector(".md-mermaid-message").textContent, "Parse error on line 1");
  root.remove();
});

test("diagrams: a placeholder that left the page is not filled", async () => {
  const { load } = fakeMermaid();
  const renderer = createDiagramRenderer({ load });
  const root = placeholders("gone");
  renderer.draw(root);
  root.remove();
  await renderer.idle();
  assertTrue(root.querySelector(".md-mermaid-pending") !== null);
});

test("diagrams: svgFor shares the queue and the cache with placeholders", async () => {
  const { calls, load } = fakeMermaid();
  const renderer = createDiagramRenderer({ load });
  const root = placeholders("one");
  renderer.draw(root);
  const [first, bad] = await Promise.all([renderer.svgFor("one\n"), renderer.svgFor("bad x")]);
  assertTrue(first.svg.includes("<text>one</text>"), "svg text");
  assertEqual(bad.error, "Parse error on line 1");
  assertTrue(root.querySelector(".md-mermaid svg") !== null, "placeholder filled too");
  await renderer.svgFor("one\n");
  assertEqual(calls.render.length, 2, "one render per source");
  root.remove();
});

test("diagrams: cleanSvg drops scripts, handlers and unsafe links but keeps styles", () => {
  const svg = cleanSvg(SVG);
  assertTrue(svg.querySelector("style") !== null && svg.querySelector("rect").getAttribute("style") !== null, "styles kept");
  assertTrue(svg.querySelector("script") === null && !svg.querySelector("rect").hasAttribute("onclick"), "script, handler");
  assertEqual([...svg.querySelectorAll("a")].filter((a) => a.hasAttribute("href")).length, 1, "one safe link");
  assertTrue(cleanSvg("<p>no svg</p>") === null, "no svg");
});

test("diagrams: config keeps the audited settings", () => {
  const config = mermaidConfig(() => "");
  assertEqual(config.securityLevel, "strict");
  assertEqual(config.startOnLoad, false);
  assertTrue(config.maxTextSize <= 50000 && config.maxEdges <= 500);
  assertEqual(Object.keys(config.themeVariables).sort().join(), "darkMode,fontFamily", "empty colours left out");
});

test("diagrams: real Mermaid draws a flowchart and a parse error", async () => {
  const renderer = createDiagramRenderer();
  const root = placeholders("flowchart LR\n  a[Start] --> b[End]", "flowchart LR\n  a -->");
  renderer.draw(root);
  await renderer.idle();
  const [good, bad] = root.querySelectorAll(".md-mermaid");
  const svg = good.querySelector("svg");
  assertTrue(svg !== null, good.textContent);
  assertTrue(svg.textContent.includes("Start") && svg.textContent.includes("End"), svg.textContent);
  assertTrue(svg.getBoundingClientRect().height > 10, "laid out");
  assertTrue(bad.classList.contains("md-mermaid-error"), bad.outerHTML.slice(0, 200));
  assertTrue(document.querySelector('[id^="dpd-mermaid-"]') === null, "no temporary elements left");
  assertEqual(document.querySelector(".pd-mermaid-work").childElementCount, 0);
  const label = svg.querySelector("foreignObject");
  const text = label.querySelector("p").getBoundingClientRect().height;
  assertTrue(label.getBoundingClientRect().height < text * 1.5, "label box fits its text");
  root.remove();
});
