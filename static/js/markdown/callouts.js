// Obsidian callouts: a block quote whose first line is "[!type] Title". A "-" or "+" after the
// type makes it foldable, closed or open. Aliases map to one canonical type, which the CSS
// colours; an unknown type looks like a note.

const ALIASES = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};

const CALLOUT_LINE = /^\[!([A-Za-z][\w-]*)\]([+-]?)[ \t]*(.*)$/;

/** Turn a finished block quote into a callout if its first line says so. */
export function markCallout(quote) {
  const first = quote.children[0];
  if (!first || first.type !== "paragraph") return;
  const [firstLine, ...rest] = first.text.split("\n");
  const match = CALLOUT_LINE.exec(firstLine.trim());
  if (!match) return;
  const [, name, fold, title] = match;
  quote.type = "callout";
  quote.calloutType = ALIASES[name.toLowerCase()] ?? "note";
  quote.fold = fold || null;
  quote.title = title.trim() || name[0].toUpperCase() + name.slice(1).toLowerCase();
  if (rest.length) first.text = rest.join("\n");
  else quote.children.shift();
}
