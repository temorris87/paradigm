// Small DOM helpers shared by the ui components.

export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

let counter = 0;

/** An id no other element in the page has, for aria and label links. */
export function uniqueId(prefix) {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** Puts the focus back where it was, if that element is still in the page and shown. */
export function restoreFocus(node, fallback) {
  const shown = node?.isConnected && node !== document.body && node.getClientRects().length > 0;
  if (shown && typeof node.focus === "function") node.focus();
  else fallback?.();
}
