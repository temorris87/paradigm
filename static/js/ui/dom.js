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

/**
 * Opens a modal <dialog> and focuses `first` without moving the page under it: opening one
 * must not scroll the note or the dashboard (every scrolled box keeps its place).
 */
export function openModal(dialog, first) {
  const scrolled = [document.scrollingElement, ...document.querySelectorAll(".app__note, .home")]
    .filter(Boolean).map((node) => [node, node.scrollTop]);
  dialog.showModal();
  first?.focus({ preventScroll: true });
  for (const [node, top] of scrolled) node.scrollTop = top;
}
