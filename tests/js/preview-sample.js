// Dev-only: the editor with live preview on a sample note, to eyeball it and to screenshot
// states headlessly. ?keys=... feeds Vim keys once the styles are in (e.g. ?keys=12j or
// ?keys=:set%20nopreview<CR>), ?wheel=N scrolls N rows. The status line shows the view.
import "../../static/js/editor/pd-editor.js";
import { parseKeys } from "../../static/js/editor/key-names.js";

const LIST = Array.from({ length: 14 }, (_, index) => `- Item ${index + 1}: follow up with the Northwind team`).join("\n");
const CODE = Array.from({ length: 40 }, (_, index) => `    step_${index + 1}()`).join("\n");

const SAMPLE = `# Project Northwind kickoff

Notes from the **kickoff**, with *emphasis*, ~~old plan~~ and ==the key point==.
Inline \`code\`, a [link](https://northwind.example "Northwind") and [[Weekly sync]].
A footnote[^1] and a jump to [the tasks](#md-tasks).

## Agenda

1. Introductions
2. Scope
   - in: reports
   - out: billing
3. Next steps

### Tasks

- [x] Book the room
- [ ] Send the summary to Pat

| Item | Owner | Due |
|:-----|:-----:|----:|
| Draft spec | Sam | Mon |
| Budget review | Lee | Fri |

> [!note]- A folded callout
> With **body** text.

> Keep it simple.

---

${LIST}

\`\`\`python
def run():
${CODE}
\`\`\`

The end.

[^1]: Agreed on the call.
`;

const status = document.getElementById("status");
const editor = document.querySelector("pd-editor");
const violations = [];
document.addEventListener("securitypolicyviolation", (event) => violations.push(event.violatedDirective));

function report() {
  const { view, cursor, mode } = editor.vim;
  const csp = violations.length ? `CSP violations: ${violations.join(", ")}` : "no CSP violations";
  status.textContent = `top ${view.top} skip ${view.skip.toFixed(2)} | cursor ${cursor.line + 1}:${cursor.col + 1} ${mode} | ${csp}`;
  document.title = violations.length ? `CSP FAIL ${violations.length}` : "Preview sample OK";
}

editor.value = SAMPLE;
editor.focus();
const params = new URLSearchParams(location.search);
// Top-level await holds back the page's load event, so a headless screenshot waits for it.
await new Promise((resolve) => setTimeout(resolve, 400));
for (const key of parseKeys(params.get("keys") ?? "")) editor.enqueue(key);
const wheel = Number(params.get("wheel") ?? 0);
if (wheel) {
  editor.vim.scrollView(wheel);
  editor.render();
}
await new Promise((resolve) => setTimeout(resolve, 100));
report();
editor.addEventListener("mode", report);
editor.addEventListener("change", report);
