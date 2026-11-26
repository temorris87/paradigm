// Rendered Markdown in the main window (a hub's dashboard text, the Live page): the steps
// after the renderer's HTML is in, and what a click on a link to a note does.
//
//   drawRendered(root)              maths and diagrams drawn, links out of the Tab order
//   followNoteLinks(root, open)     a click on a link to one of the app's notes calls
//                                   open(id) in place of the browser following it
import { drawDiagrams } from "../diagrams/mermaid.js";
import { ensureMathFonts, typesetMath } from "../math/typeset.js";

export function drawRendered(root) {
  for (const link of root.querySelectorAll("a")) link.tabIndex = -1;
  // The renderer leaves maths and diagrams as placeholders holding their source.
  ensureMathFonts();
  typesetMath(root);
  drawDiagrams(root);
}

export function followNoteLinks(root, open) {
  root.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !url.searchParams.has("note")) return;
    event.preventDefault();
    open(Number(url.searchParams.get("note")));
  });
}
