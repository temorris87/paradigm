// Shared by the Markdown tests: render with the trailing newline dropped, so expected HTML
// reads naturally in a test.
import { renderMarkdown } from "../../static/js/markdown/index.js";

export function md(source, options) {
  return renderMarkdown(source, options).replace(/\n$/, "");
}
