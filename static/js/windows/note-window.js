// The two windows: the main window (dashboards, Home, People, Meetings, the calendar, the
// timesheet; Tyson keeps it on the left 2/3 of the screen) and the note window, where notes
// are written. There is one note window: opening a note reuses it.
//
// Where the note window goes depends on the screen the main window is on:
//   a wide screen (an ultrawide: at least 2400 CSS px wide and over 2.1 times as wide as
//   tall)                         the right third, full height, beside the main window
//   anything else (the laptop)    the whole screen
// The page can place the windows it opens, never the window the launcher opened: the main
// window is wherever it was put (browsers reopen windows where they were).
//
//   isWideScreen(screen)                    pure
//   noteWindowBox(screen, mode, { border, ratio })   { left, top, width, height }; pure
//     mode: "auto" (the rule above), "split" (always the right third), "full" (always all of it)
//     border: Windows' invisible resize border, which the right third would grow by (left,
//     right, bottom); placing passes 0, see placeNoteWindow; ratio: devicePixelRatio, the left edge
//     moves (by up to 2 px) to a whole CSS px that is also a whole device pixel. Every number
//     is a whole CSS px: moveTo/resizeTo drop fractions, which would open a gap at the right.
//   frameBorder(win)                        that border, estimated from outer - inner; pure
//                                           (measured only: placing doesn't grow by it)
//   isZoomed(win)                           the page zoomed (Ctrl+=): outer - inner is then
//                                           no border, and devicePixelRatio no screen grid; pure
//   placeOnFirstLoad(win)                   the note window, once note.html has loaded
//   forgetPlaced()                          the main window, at start: windows it opens
//                                           don't inherit the note window's "placed" mark
//   placeNoteWindow(win, mode)              places it again (Settings > Note window: Right third)
//   windowMode() / setWindowMode(mode)      the setting, kept per browser
//   openNoteWindow(id, { at, changes })     shows a note there; false when popups are blocked
//   openNoteWindow({ task }, { changes })   shows a task's notes there (note.html?task=ID)
//   showMainWindow(message, changes)        brings the main window forward with a message:
//                                           { type: "show", id } (a hub's dashboard) or
//                                           { type: "view", key } (Home, People...)
export const NOTE_SHARE = 1 / 3;
export const WIDE_MIN_WIDTH = 2400;
export const WIDE_MIN_RATIO = 2.1;
export const NOTE_WINDOW = "paradigm-note";
export const MAIN_WINDOW = "paradigm-main";
export const WINDOW_MODES = [
  { key: "auto", label: "By screen", help: "the right third on a wide screen, the whole screen on a laptop" },
  { key: "split", label: "Right third", help: "always beside the main window" },
  { key: "full", label: "Whole screen", help: "always over the main window" },
];
export const MAX_FRAME_BORDER = 10;
const MODE_KEY = "paradigm.noteWindow";
const PLACED_KEY = "paradigm.noteWindowPlaced";

export function isWideScreen(screen) {
  const width = screen.availWidth ?? screen.width ?? 0;
  const height = screen.availHeight ?? screen.height ?? 1;
  return width >= WIDE_MIN_WIDTH && width / Math.max(height, 1) >= WIDE_MIN_RATIO;
}

export function noteWindowBox(screen, mode = "auto", { border = 0, ratio = 1 } = {}) {
  const left = screen.availLeft ?? 0;
  const top = screen.availTop ?? 0;
  const width = screen.availWidth ?? screen.width;
  const height = screen.availHeight ?? screen.height;
  if (!isSplit(screen, mode)) return { left, top, width, height };
  const share = Math.round(width * NOTE_SHARE);
  // The right edge stays on the screen's (plus the border, off screen); the left edge moves
  // to a whole device pixel, so under 125% scaling it doesn't land between two.
  const right = left + width + border;
  const start = toDevicePixel(left + width - share - border, ratio);
  return { left: start, top, width: right - start, height: height + border };
}

/** Windows 10/11's invisible resize border, one side, in whole CSS px: 0 on the Mac. Page zoom
 * skews it (innerWidth is zoomed, outerWidth isn't): the cap keeps that to a few px. */
export function frameBorder(win) {
  const side = Math.round(frameSide(win));
  return Number.isFinite(side) ? Math.min(Math.max(side, 0), MAX_FRAME_BORDER) : 0;
}

/** Zoomed in, outer - inner is far over any border; zoomed out, it is below 0. */
export function isZoomed(win) {
  const side = frameSide(win);
  return Number.isFinite(side) && (side < 0 || side > MAX_FRAME_BORDER);
}

function frameSide(win) {
  return ((win.outerWidth ?? 0) - (win.innerWidth ?? 0)) / 2;
}

function isSplit(screen, mode) {
  return mode === "split" || (mode === "auto" && isWideScreen(screen));
}

// The nearest whole CSS px (within 2) that is also a whole device pixel: at 125% every 4th
// CSS px is, at 150% every 2nd. Else just the nearest whole CSS px.
const DEVICE_PIXEL_REACH = 2;

function toDevicePixel(value, ratio) {
  const base = Math.round(value);
  if (!(ratio > 0)) return base;
  for (let step = 0; step <= DEVICE_PIXEL_REACH; step += 1) {
    // Left first: a pixel under the main window beats a gap beside it.
    for (const candidate of [base - step, base + step]) {
      if (onDevicePixel(candidate, ratio)) return candidate;
    }
  }
  return base;
}

function onDevicePixel(value, ratio) {
  const device = value * ratio;
  return Math.abs(device - Math.round(device)) < 1e-6;
}

export function windowMode(storage = globalThis.localStorage) {
  const stored = storage?.getItem(MODE_KEY);
  return WINDOW_MODES.some((mode) => mode.key === stored) ? stored : "auto";
}

export function setWindowMode(mode, storage = globalThis.localStorage) {
  storage?.setItem(MODE_KEY, mode);
}

/** The URL the note window loads for a note (at: { field, line } puts the cursor there). */
export function noteWindowUrl(id, at = null) {
  const params = new URLSearchParams({ note: String(id) });
  if (at) {
    params.set("line", String(at.line));
    if (at.field && at.field !== "body") params.set("field", at.field);
  }
  return `/note.html?${params}`;
}

/** The URL the note window loads for a task's notes. */
export function taskNotesUrl(taskId) {
  return `/note.html?${new URLSearchParams({ task: String(taskId) })}`;
}

export function openNoteWindow(id, { at = null, changes, screen = window.screen, mode = windowMode() } = {}) {
  // { task }: a task's notes, else a note's id.
  const task = typeof id === "object" && id !== null ? id.task : undefined;
  const url = task === undefined ? noteWindowUrl(id, at) : taskNotesUrl(task);
  const message = task === undefined ? { type: "open", to: "note", id, at } : { type: "open", to: "note", task };
  const box = noteWindowBox(screen, mode);
  const features = `popup=yes,left=${box.left},top=${box.top},width=${box.width},height=${box.height}`;
  // An empty URL finds the named window without reloading it, if it is open.
  const win = window.open("", NOTE_WINDOW, features);
  if (!win) return false;
  if (isBlank(win)) {
    win.location.replace(url);
    place(win, box);
  } else {
    changes.send(message);
  }
  win.focus();
  return true;
}

export function showMainWindow(message, changes) {
  changes.send({ ...message, to: "main" });
  // The opener is the main window when it opened this one; else find it by name.
  let main = window.opener && !window.opener.closed ? window.opener : null;
  if (!main) {
    main = window.open("", MAIN_WINDOW);
    if (main && isBlank(main)) {
      const flag = message.folderId ? `${message.key}=${encodeURIComponent(message.folderId)}` : message.key;
      const url = message.type === "show" ? `/?note=${encodeURIComponent(message.id)}` : `/?${flag}`;
      main.location.replace(url);
    }
  }
  // Browsers may refuse to raise another window: then it is Alt-Tab.
  main?.focus();
  return Boolean(main);
}

/** Once note.html has loaded: the box again, now that the frame can be measured. Only in a
 * window the app opened, and only on its first load (a reload or the next note leaves it be). */
export function placeOnFirstLoad(win = window, { storage = win.sessionStorage, mode = windowMode() } = {}) {
  if (!win.opener || storage?.getItem(PLACED_KEY)) return false;
  storage?.setItem(PLACED_KEY, "1");
  placeNoteWindow(win, mode);
  return true;
}

/** A window opened with window.open starts with a copy of its opener's sessionStorage. A main
 * window the note window opened would hand the mark on to the next note window it opens, which
 * would then skip its first-load place: so the main window drops it at start. */
export function forgetPlaced(storage = globalThis.sessionStorage) {
  storage?.removeItem(PLACED_KEY);
}

/** Places the note window by mode. It doesn't grow by the invisible border: Chrome (Blink)
 * clamps every moveTo/resizeTo rect to screen.avail*, so a box past the screen's edge is pulled
 * back in, 8 px over the main window, and loses its extra height. */
export function placeNoteWindow(win = window, mode = windowMode()) {
  // Zoomed, devicePixelRatio is the zoom times the screen's scaling: no grid to round to.
  const ratio = isZoomed(win) ? 1 : win.devicePixelRatio ?? 1;
  place(win, noteWindowBox(win.screen, mode, { ratio }));
}

function isBlank(win) {
  try {
    return win.location.href === "about:blank";
  } catch {
    return true;
  }
}

function place(win, box) {
  // The features place it; this makes the outer size (frame included) fit too. Chrome clamps
  // each step to the screen: a window wider than its box is held at the left edge by the
  // first move, so it moves again once it has its size.
  try {
    win.moveTo(box.left, box.top);
    win.resizeTo(box.width, box.height);
    win.moveTo(box.left, box.top);
  } catch {
    // Some browsers refuse: the features still placed it.
  }
}
