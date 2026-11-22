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

/** Puts the focus back where it was, if that element is still in the page. */
export function restoreFocus(node, fallback) {
  if (node?.isConnected && node !== document.body && typeof node.focus === "function") node.focus();
  else fallback?.();
}
