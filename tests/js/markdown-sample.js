// Dev-only: render a sample note with every construct, to eyeball markdown.css. The status
// line reports any CSP violation the output causes.
import { renderMarkdown } from "../../static/js/markdown/index.js";
import { diagramsIdle, drawDiagrams } from "../../static/js/diagrams/mermaid.js";
import { ensureMathFonts, typesetMath } from "../../static/js/math/typeset.js";

const SAMPLE = `# Project Northwind kickoff
Notes from the **kickoff**, with *emphasis*, ~~old plan~~ and ==the key point==.
Inline \`code\`, a [link](https://northwind.example "Northwind"), https://acme.example/docs and [[Weekly sync]].

## Agenda
1. Introductions
2. Scope
   - in: reports
   - out: billing
3. Next steps[^1]

### Tasks
- [x] Book the room
- [ ] Send the summary to Pat
- [ ] Review [[Plans#Q3|the Q3 plan]]

#### Decisions
| Item | Owner | Due |
|:-----|:-----:|----:|
| Draft spec | Sam | Mon |
| Budget \\| review | Lee | Fri |

##### Quote
> Keep it simple.
> > Nested reply.

###### Code
\`\`\`python
def greet(name):
    return f"hello {name}"
\`\`\`

> [!note] A note callout
> With **body** text.

> [!warning]- Folded warning (click)
> Hidden until opened.

> [!tip]+ Open tip
> Shown by default.

> [!success] Done

> [!question] Question

> [!danger] Danger

> [!example] Example

> [!quote] Quote

## Maths

The area is $A = \\pi r^2$, and prices like $5 and $10 stay text.
Inline display: $$e^{i\\pi} + 1 = 0$$ in a sentence.

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
\\qquad
\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}
$$

A broken formula: $\\frac{a$.

## Diagrams

\`\`\`mermaid
flowchart TD
  start([Kickoff]) --> scope{Scope agreed?}
  scope -- yes --> plan[Write the plan]
  scope -- no --> talk[Talk to Pat] --> scope
  plan --> ship((Ship))
\`\`\`

\`\`\`mermaid
sequenceDiagram
  participant Sam
  participant Lee
  link Lee: Profile @ https://northwind.example/lee
  Sam->>Lee: Draft ready?
  Lee-->>Sam: Friday
  Note over Sam,Lee: Review on Monday
\`\`\`

A broken diagram:

\`\`\`mermaid
flowchart LR
  a --> 
\`\`\`

---

<b>raw HTML stays text</b> &amp; :smile: stays too.

[^1]: Agreed on the call.
`;

const status = document.getElementById("status");
const violations = [];
let counting = false;
document.addEventListener("securitypolicyviolation", (event) => {
  if (!counting) return;
  violations.push(event.violatedDirective);
  status.textContent = `CSP violations: ${violations.join(", ")}`;
  document.title = `CSP FAIL ${violations.length}`;
});

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 50));

// Mermaid's own rendering trips the CSP (its temporary element; expected, see
// docs/security/vendor-audit.md), so diagrams are rendered once off-page first. The sample is
// then drawn from the cache, and only that drawing is counted.
const warmUp = document.createElement("div");
warmUp.innerHTML = renderMarkdown(SAMPLE);
drawDiagrams(warmUp);
await diagramsIdle();
await nextTask();
counting = true;

const doc = document.getElementById("doc");
ensureMathFonts();
doc.innerHTML = renderMarkdown(SAMPLE);
typesetMath(doc);
drawDiagrams(doc);
await nextTask();
if (!violations.length) {
  status.textContent = "rendered, no CSP violations";
  document.title = "Markdown sample OK";
}
