// Dev-only: render a sample note with every construct, to eyeball markdown.css. The status
// line reports any CSP violation the output causes.
import { renderMarkdown } from "../../static/js/markdown/index.js";
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

---

<b>raw HTML stays text</b> &amp; :smile: stays too.

[^1]: Agreed on the call.
`;

const status = document.getElementById("status");
const violations = [];
document.addEventListener("securitypolicyviolation", (event) => {
  violations.push(event.violatedDirective);
  status.textContent = `CSP violations: ${violations.join(", ")}`;
  document.title = `CSP FAIL ${violations.length}`;
});

const doc = document.getElementById("doc");
ensureMathFonts();
doc.innerHTML = renderMarkdown(SAMPLE);
typesetMath(doc);
status.textContent = "rendered, no CSP violations";
document.title = "Markdown sample OK";
