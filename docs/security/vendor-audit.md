# Security audit: vendored KaTeX and Mermaid

Audited 2026-11-21. The question: can each library be copied into `static/` and run under
Paradigm's security model unchanged? That model is the CSP in `paradigm/web/security.py`
(`default-src 'self'`, so no inline `<style>`, no `style=""`, no inline scripts, no `eval`, no
outside URLs), no network calls, and safe handling of note text that may have been pasted from
anywhere.

## Verdicts

| Library | Version | Verdict |
|---|---|---|
| KaTeX | 0.19.1 | **Go**, with the conditions below |
| Mermaid | 12.3.0 | **Go with conditions**: it does not fit the CSP as shipped; a small insertion helper makes it fit (tested), and rendering cost needs limits |

Neither verdict requires loosening the CSP. Neither library makes network requests or uses
`eval` / `new Function` on any path a browser reaches.

## How the audit was done

1. Tarballs downloaded from the npm registry and checked against the registry's `sha512`
   integrity value (both matched). Release tags cross-checked on GitHub.
2. Static scan of exactly the files we would vendor for: `eval`, `new Function`, `Function(`,
   string timers, `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `sendBeacon`,
   `EventSource`, workers, dynamic `import()`, hard-coded URLs, `innerHTML`, `document.write`,
   `style` attributes and `<style>` injection. Every hit was read in context.
3. Browser test: a throwaway server sending Paradigm's exact `SECURITY_HEADERS`, test pages that
   count `securitypolicyviolation` events per step, and screenshots. Run in headless Firefox on
   Linux. The pages and server were not committed; the method is described here so it can be
   repeated.
4. GitHub Security Advisories (`gh api /advisories`) for each library and the dependencies
   Mermaid bundles.

Upstream tarballs (SHA-256):

- `katex-0.19.1.tgz` `24da5a599eb2fcede2e270b99a6ff48bca816beecc95feeb84e8cccbd1bb34fd`
- `mermaid-12.3.0.tgz` `be0684e8d20bfc874df12c0f04927a5c482f57f2200eec54cca52a4583fd4040`

---

## KaTeX 0.19.1

MIT licence. Released 2026-10-23. Published to npm by a maintainer (no npm provenance
attestation), but the package's `gitHead` (`8000fbd4`) is the commit of the GitHub `v0.19.1` tag.
Actively maintained (several releases a month in autumn 2026).

### Files to vendor

23 files, 889 KB in total: `LICENSE`, `dist/katex.mjs` (the ES module), `dist/katex.min.css`, and
the 20 `dist/fonts/*.woff2`. SHA-256 for each: [`katex-0.19.1.sha256`](katex-0.19.1.sha256)
(`sha256sum -c` format, paths relative to the package root). The CSS also lists `.woff` and
`.ttf` fallbacks; browsers stop at the first format they support (woff2), so those files are not
needed and never requested.

### Static scan

| Pattern | Hits | Finding |
|---|---|---|
| `eval`, `Function(`, workers, string timers | 0 | — |
| `fetch(` | 1 | The parser's own `fetch()` method (next token), not the network API |
| `import(` | 0 | — |
| URLs | 30 | All in comments, plus the MathML and SVG XML namespaces |
| `style="` / `setAttribute("style")` | 6 | `renderToString` builds `style="..."` markup; MathML nodes for `\boxed`, `\fbox` and error colour set a style attribute |
| CSS `url()` | 60 | All relative `fonts/...`; no `@import`, no outside URLs |

### CSP test (headless Firefox, our headers)

| Case | CSP violations | Result |
|---|---|---|
| `katex.render(tex, element)` (DOM path), HTML + MathML output | **0** | Renders correctly. Its 100 inline styles are set through the CSSOM (`Object.assign(node.style, ...)`), which `style-src` does not cover |
| `element.innerHTML = katex.renderToString(tex)` | 100 (`style-src-attr`) | Formula visibly broken: fractions, roots and matrices collapse |
| `output: "mathml"` | 0 | No styles at all; the browser draws it with a system maths font |
| Fonts | 0 | KaTeX_Main, Math, Size2, Size3 loaded from `'self'` |
| Parse error with `throwOnError: false` | 1 (`style-src-attr`) | Error text shows but loses its red colour |

### Hostile input (`trust: false`)

`\href{javascript:…}`, `\url{javascript:…}`, `\href{https://…}`, `\includegraphics{https://…}`,
`\htmlClass`, `\htmlStyle`, `\htmlData`, `\htmlId` and `\text{<img onerror=…>}`: no links, no
images, no classes, ids or data attributes reach the DOM; the commands show as plain red text.
`\color{red;background:url(…)}` is rejected as an invalid colour. With `trust: true` the
`javascript:` href **does** become a link, so `trust` is the only gate and must stay off.

Denial of service:

| Input | Result |
|---|---|
| Macro expansion bomb (10⁶ expansions) | Stopped by `maxExpand` (default 1000) as a parse error, 5 ms |
| `\rule{100000em}{100000em}` | `maxSize` defaults to **Infinity**; with `maxSize: 50` it was clamped (still ~1300 px), so use a smaller value |
| 3000 nested braces | Throws `InternalError: too much recursion` **even with `throwOnError: false`** (it is not a `ParseError`); no hang |
| 65,000 characters of `\frac` | 600 ms |

### Known vulnerabilities

| Advisory | Affected | Status in 0.19.1 |
|---|---|---|
| CVE-2026-103923 prototype pollution bypasses `trust` | < 0.18.2 | Fixed |
| CVE-2025-23207 `\htmlData` attribute names | ≤ 0.16.20 | Fixed |
| CVE-2024-28243/28244 `maxExpand` bypasses | < 0.16.10 | Fixed |
| CVE-2024-28245 `\includegraphics` escaping | < 0.16.10 | Fixed |
| CVE-2024-28246 URL protocol normalisation | < 0.16.10 | Fixed |

No open advisories against 0.19.1. Its one runtime dependency (`commander`) is for the CLI and
is not part of the vendored files.

### Conditions for use (KaTeX)

1. Always `katex.render(tex, element, options)`. Never put `renderToString` output into
   `innerHTML`; the CSP breaks it. (The Markdown renderer returns HTML strings, so maths gets a
   placeholder element there and is rendered into it afterwards.)
2. Options: `trust: false` (the default; never turn it on), `maxExpand: 1000`, `maxSize: 10`,
   `throwOnError: false`, `strict: "ignore"` or `"warn"`.
3. Wrap each call in `try/catch`: deep nesting throws past `throwOnError`. Show the raw source on
   failure. Whether deep nesting throws at all depends on the browser's stack (Firefox on CI
   drew 3000 levels), so `typeset.js` also refuses groups nested past `MAX_TEX_NESTING` (100)
   before KaTeX runs.
4. Colour errors with CSS (`.katex-error { color: var(--nord11); }`); `errorColor` is applied as
   an inline style attribute and gets blocked.
5. For `:export`, `output: "mathml"` gives style-free MathML. It needs a maths font on the
   reader's machine (Windows has Cambria Math; this Linux test box had none and showed boxes).

As built (2026-11-21, `static/js/math/typeset.js`): conditions 1–4 hold, with one tightening.
`throwOnError` is `true` and every error is caught by our code, which shows the source with
the `md-math-error` class. KaTeX's own error markup would set a style attribute, which the CSP
blocks with a console message each time.
`:export` (`static/js/export/assets.js`) follows condition 5: `katex.render` into an element of an
inert document with the same options and `output: "mathml"`, through the same try/catch.

---

## Mermaid 12.3.0

MIT licence. Released 2026-11-03. Published from GitHub Actions with an npm SLSA provenance
attestation. Actively maintained (monthly releases).

### Files to vendor

107 files, 5.4 MB: `LICENSE`, `dist/mermaid.esm.min.mjs` and the 105 lazily loaded
`dist/chunks/mermaid.esm.min/*.mjs` (one per diagram type and shared code; the folder layout
must be kept, since they import each other by relative path). SHA-256 for each:
[`mermaid-12.3.0.sha256`](mermaid-12.3.0.sha256). The other 118 MB of the package (UMD builds,
source maps, type files) is not needed.

Bundled inside, of note: DOMPurify **3.4.17**, a second copy of KaTeX (**0.18.11**, used for
maths inside diagrams), marked (^16.3), d3, dagre-d3-es, cytoscape, elkjs, chevrotain,
`@braintree/sanitize-url`.

### Static scan

| Pattern | Hits | Finding |
|---|---|---|
| `eval`, `new Function`, string timers | 0 | — |
| `Function("return this")()` | 3 | lodash's global-object fallback, after `typeof global` / `typeof self`. In a browser `self` exists, so it is never called; the browser test logged no `script-src` / `unsafe-eval` violation |
| `fetch`, XHR, WebSocket, beacon, EventSource | 1 | Inside the bundled KaTeX parser's `fetch()` method; not network |
| `import(` | 59 | All relative `./chunks/...` paths: same origin |
| `new Worker` | 1 | elkjs, only if given a `workerUrl`; Mermaid uses ELK's in-thread fallback |
| URLs | 116 | Licence headers, docs/issue links in error messages, XML namespaces. No CDN, font or icon API |
| `innerHTML` | 9 | d3's `.html()`, DOMPurify internals, an entity decoder, and the `<style>` element Mermaid injects into each SVG |
| `<style>` / style attributes | 273 | Mermaid puts one `<style>` element in each SVG and many `style` attributes on its nodes |

### CSP test (headless Firefox, our headers)

Flowchart, sequence, class, state, Gantt, pie, ER, mindmap, and a flowchart with `$$…$$` maths
were rendered with `securityLevel: "strict"`.

| Step | CSP violations | Result |
|---|---|---|
| `mermaid.render()` itself | 2–24 per diagram (`style-src-elem`, `style-src-attr`) | Mermaid builds the diagram in a temporary element in the page; its styles there are blocked. The SVG text is still produced complete, and text measurement came out right (labels fit their boxes) |
| `container.innerHTML = svg` | 6–31 per diagram | Styles blocked: text alignment and colours wrong |
| Insert helper (below) | **0** for all 9 types | Renders correctly (checked by screenshot) |
| `securityLevel: "sandbox"` | `frame-src` | Its `data:` iframe is refused by `default-src 'self'`; blank. **Not usable** |

The insert helper (about 30 lines, tested):

1. Parse the SVG string with `DOMParser` as `text/html` (an inert document: nothing runs, no CSP
   applies).
2. Take the text of every `<style>` element and remove the element. Put the CSS into a constructed
   stylesheet (`new CSSStyleSheet()`, `replaceSync`) added to `adoptedStyleSheets` of the document
   or of the shadow root that shows the diagram. Mermaid scopes its rules to the SVG's id.
3. Move every `style` attribute aside, `document.importNode` the SVG, append it, then set each
   saved value with `element.style.cssText` (CSSOM, allowed).

### Hostile input (`securityLevel: "strict"`)

Each case was rendered, inserted, every node and link clicked, and a flag checked.

| Input | Result |
|---|---|
| Label `<img src=x onerror=…>` | `onerror` stripped by DOMPurify; the `<img>` itself stays (an outside `src` would be blocked by `img-src`) |
| Label `<script>` | Removed |
| Label `<a href="javascript:…">` | Link kept without `href` |
| `click A href "javascript:…"` (flowchart, class) | No `href` emitted |
| `click A call fn()` | Not bound under strict |
| `%%{init: {"securityLevel": "loose"}}%%` + `click … call` | Ignored: `securityLevel` is a secure key; nothing ran |
| `%%{init: {"maxTextSize": …, "maxEdges": …}}%%` | Ignored (secure keys) |
| `%%{init: {"themeCSS": "…url(https://…)…</style><script>…"}}%%` | No outside URL or script in the output |
| `%%{init: {"fontFamily": "x;} * {background:url(https://…)}"}}%%` | No outside URL in the output |
| Sequence `link A: … @ javascript:…` | Link dropped. During render Mermaid tried an inline `onclick` for the actor menu; the CSP blocked it (`script-src-attr`) |
| Sequence `link A: … @ https://example.com/x` | **Kept** as an `<a xlink:href>`: clicking it would navigate the app tab away |

Denial of service:

| Input | Result |
|---|---|
| 600-edge chain | Refused: `maxEdges` (500) |
| 60,000-character source | Refused by `maxTextSize` (50,000): Mermaid draws its "maximum text size exceeded" diagram instead, fast |
| 200-node chain | 630 ms |
| 100 nodes, 300 crossing edges | **11.4 s** with the page frozen (layout runs on the main thread; it cannot be interrupted) |
| Parse error | Throws; leaves 2 temporary elements in `<body>` |

### Known vulnerabilities

| Advisory | Affected | Status in 12.3.0 |
|---|---|---|
| CVE-2026-71436..71439 (XY chart and radar DoS, config prototype pollution, architecture prototype pollution) | < 11.16.1 | Fixed |
| CVE-2026-50159 CSS injection into sibling elements | < 11.16.1 | Fixed |
| CVE-2026-41148/41149/41159 classDef / config CSS and HTML injection; CVE-2026-41150 Gantt DoS | ≤ 11.14.0 | Fixed |
| CVE-2025-54880/54881 XSS in architecture iconText and sequence labels | < 11.10.0 | Fixed |
| Older (2020–2024): XSS, CSS injection, bundled DOMPurify prototype pollution | ≤ 10.9.2 | Fixed |
| Bundled DOMPurify: 30 advisories, the newest (2026-10-22) affecting ≤ 3.4.16 | — | 3.4.17 bundled: fixed. Most concern `IN_PLACE` / `SAFE_FOR_TEMPLATES` options Mermaid does not use |
| Bundled KaTeX 0.18.11 | KaTeX advisories above, all < 0.18.2 | Fixed |
| lodash `_.template` code injection (CVE-2026-4800) | lodash ≤ 4.17.23 | Not reachable: `_.template` is not in the bundle |
| marked OOM (CVE-2026-41680) | 18.0.0–18.0.1 | Not affected: Mermaid uses ^16.3 |
| `@braintree/sanitize-url`, d3-color ReDoS | old versions | Fixed in the versions Mermaid requires |

Mermaid's advisory record is long (a large attack surface: many diagram parsers, HTML labels, CSS
generation). The CSP is our second line of defence: in this audit it blocked an inline handler
Mermaid itself tried to add.

### Conditions for use (Mermaid)

1. `mermaid.initialize({ startOnLoad: false, securityLevel: "strict" })`. Never `loose`,
   `antiscript` or `sandbox`. Keep the default `secure` keys list.
2. Insert SVGs only through the insert helper above (constructed stylesheet + CSSOM). Never
   `innerHTML`. Remove each diagram's adopted stylesheet when its diagram goes away.
3. Rewrite links in the output: keep an `href` only if it passes the Markdown renderer's scheme
   allowlist (`static/js/markdown/urls.js`) and make it open in a new tab, as other note links do;
   drop the rest.
4. Rendering is slow and blocks the page: render a diagram only when its block is shown rendered
   (never while it is being edited), cache the SVG by source text, and keep `maxEdges` at or below
   the default. Consider a lower `maxTextSize` for diagrams.
5. Catch render errors, remove Mermaid's leftover temporary elements (`#d<id>` and its wrapper),
   and show the raw source with the error message.
6. Expect CSP violation messages in the browser console during each render (from Mermaid's
   temporary element). They are harmless, but they are noise; don't mistake them for a
   regression. (Since 2026-11-26 there are none: Mermaid draws in a frame page with its own
   CSP, see "As built" below. A violation during a render is now a regression.)
7. Two KaTeX copies will be in the repo (ours, and Mermaid's bundled one for maths in
   diagrams). Upgrade Mermaid when its bundled KaTeX or DOMPurify gets an advisory.

As built (2026-11-21, `static/js/diagrams/`): all seven conditions hold.
- `maxTextSize` is 20,000 and `maxEdges` 500, with `suppressErrorRendering` so errors reach our
  code, which shows the source and the message.
- Mermaid renders into an off-screen element of ours (`work-area.js`), emptied after every
  render, so no temporary elements are left behind.
- `:export` takes diagrams through the same queue and cache (`svgFor`) and the same cleaning
  (`cleanSvg`: scripts, `on*` handlers and unsafe links removed). It keeps the `<style>` and
  `style=""` in the file, whose own CSP (`default-src 'none'; img-src data:; style-src
  'unsafe-inline'`) allows inline styles but no scripts and no outside loads.
- That element has a constructed stylesheet with the rules that change label sizes. Mermaid's
  own `<style>` is blocked there, and without these rules every label was measured 2 em too
  tall.
- The CSP also blocks the `max-width` that Mermaid sets on the `<svg>` during render. The insert
  helper restores it from the `viewBox`, so diagrams keep their natural width.
- On top of DOMPurify, the helper drops `<script>` and `on*` attributes.

As built (2026-11-26, feature 005, Tyson: "fix the blockers as part of this release"): Mermaid no
longer draws in the app's pages. Each render logged about 14 violations (its `<style>` and
`style=""` writes into the work element), so it now draws in a hidden, same-origin frame page,
`static/diagram-frame.html` (`frame-main.js`, `frame-listener.js`), one per window, made on first
use (`frame-client.js`). Only that page is served with `style-src 'self' 'unsafe-inline'`,
`frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` (`headers_for` in
`paradigm/web/security.py`, exact path match); scripts stay `'self'`, outside URLs stay barred,
and every other response keeps the strict CSP. The frame answers `postMessage` only from its
parent at our origin, re-applies `securityLevel: "strict"` whatever config arrives, and sends back
the SVG text, which is still cleaned and inserted through the insert helper under the strict CSP.
A diagram the frame doesn't answer within 20 s fails with "The diagram could not be drawn.", so
the queue never sticks. Condition 5 holds in the frame: its work element is emptied after each
render. Mermaid's own `<style>` now applies while it measures; the work element's `p { margin: 0 }`
rule was kept, since no test yet shows the label sizes match without it. Result: 0 violations on
Welcome, the rendered note, the Live page and `:export`.

---

## Vendoring and upgrades

- Copy the files listed in the two manifests into versioned folders under `static/`
  (for example `static/vendor/katex-0.19.1/`) with their `LICENSE`, unchanged.
- Add a test that checks every vendored file against its manifest, so a changed file fails the
  suite.
- To upgrade: download the new tarball, check the registry integrity value and the GitHub tag,
  rerun the static scan and the browser test on the new files, check the advisories again, then
  write new manifests and update this report.

## What was not tested

- **Chrome on Windows**, the real browser. All browser results here are headless Firefox on
  Linux. To check at work: render a formula with `katex.render` and a flowchart through the
  insert helper under the app's CSP, and confirm the DevTools console shows no CSP errors from
  inserting (render-time errors from Mermaid are expected) and that both look right.
- Every Mermaid diagram type: nine common types were rendered; the rest (C4, architecture,
  Sankey, XY, block, packet, kanban, …) share the same rendering and insertion paths.
- Fuzzing. The hostile inputs above are hand-picked known attack shapes, not exhaustive.
