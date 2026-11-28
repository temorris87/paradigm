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

// A part that draws itself again from the server's answer replaces its buttons, so it marks
// the ones the focus may come back to with data-focus-key and finds them again by key.

/** The data-focus-key of the element inside root that has the focus, or "". */
export function focusedKey(root) {
  const active = document.activeElement;
  return active && root.contains(active) ? active.closest("[data-focus-key]")?.dataset.focusKey ?? "" : "";
}

/** Focuses the first of keys with an element inside root; true when one took the focus. */
export function focusFirstKey(root, keys) {
  for (const key of keys) {
    const node = key && [...root.querySelectorAll("[data-focus-key]")].find((each) => each.dataset.focusKey === key);
    if (node) {
      node.focus();
      return true;
    }
  }
  return false;
}

/** The keys to land on once the row at index is gone: the next row's, the previous row's, then rest. */
export function keysAfterRemoving(rowKeys, index, rest = []) {
  return [rowKeys[index + 1], rowKeys[index - 1], ...rest].filter(Boolean);
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
