// How much of the page the hub's section panel takes, and what this browser remembers about
// it: one size for every hub, and the open tab per hub. The ladder is pure; load/save use
// localStorage and quietly forget when it is off.
export const HUB_SIZES = ["collapsed", "open", "expanded"];
export const DEFAULT_SIZE = "open";

const SIZE_KEY = "paradigm.hub.size";
const TABS_KEY = "paradigm.hub.tabs";

/** One step along the ladder (step -1 smaller, +1 larger), stopping at the ends. */
export function stepSize(size, step) {
  const at = Math.max(0, HUB_SIZES.indexOf(size));
  return HUB_SIZES[Math.min(HUB_SIZES.length - 1, Math.max(0, at + step))];
}

export function loadSize() {
  const size = read(SIZE_KEY);
  return HUB_SIZES.includes(size) ? size : DEFAULT_SIZE;
}

export function saveSize(size) {
  write(SIZE_KEY, size);
}

/** { hubId: tabKey } */
export function loadTabs() {
  const tabs = read(TABS_KEY);
  return tabs && typeof tabs === "object" && !Array.isArray(tabs) ? tabs : {};
}

export function saveTabs(tabs) {
  write(TABS_KEY, tabs);
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or off: the panel just forgets.
  }
}
