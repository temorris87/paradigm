// THE key table for the image viewer. Its key handling and any help listing both read it.
// Keys with Ctrl, Alt or Cmd held are left to the browser (Ctrl-+ still zooms the page).
export const VIEWER_KEYS = [
  { keys: ["+", "="], action: "zoomIn", help: "zoom in" },
  { keys: ["-"], action: "zoomOut", help: "zoom out" },
  { keys: ["0"], action: "fit", help: "fit the whole image in the window" },
  { keys: ["1"], action: "actualSize", help: "actual pixels (100%)" },
  { keys: ["h", "ArrowLeft"], action: "panLeft", help: "move left" },
  { keys: ["l", "ArrowRight"], action: "panRight", help: "move right" },
  { keys: ["k", "ArrowUp"], action: "panUp", help: "move up" },
  { keys: ["j", "ArrowDown"], action: "panDown", help: "move down" },
  { keys: ["o"], action: "openTab", help: "open the image alone in a new tab" },
  { keys: ["Escape", "q"], action: "close", help: "close the viewer" },
];

const BY_KEY = new Map(VIEWER_KEYS.flatMap(({ keys, action }) => keys.map((key) => [key, action])));

/** The action a keydown means in the viewer, or null. */
export function viewerAction(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  return BY_KEY.get(event.key) ?? null;
}
