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
//   noteWindowBox(screen, mode)             { left, top, width, height }; pure
//     mode: "auto" (the rule above), "split" (always the right third), "full" (always all of it)
//   windowMode() / setWindowMode(mode)      the setting, kept per browser
//   openNoteWindow(id, { at, changes })     shows a note there; false when popups are blocked
//   showMainWindow(message, changes)        brings the main window forward with a message:
//                                           { type: "show", id } (a hub's dashboard) or
//                                           { type: "view", key } (Home, People...)
export const NOTE_SHARE = 1 / 3;
export const WIDE_MIN_WIDTH = 2400;
export const WIDE_MIN_RATIO = 2.1;
export const NOTE_WINDOW = "paradigm-note";
export const MAIN_WINDOW = "paradigm-main";
export const WINDOW_MODES = [
  { key: "auto", label: "Note window: by screen", help: "the right third on a wide screen, the whole screen on a laptop" },
  { key: "split", label: "Note window: right third", help: "always beside the main window" },
  { key: "full", label: "Note window: whole screen", help: "always over the main window" },
];
const MODE_KEY = "paradigm.noteWindow";

export function isWideScreen(screen) {
  const width = screen.availWidth ?? screen.width ?? 0;
  const height = screen.availHeight ?? screen.height ?? 1;
  return width >= WIDE_MIN_WIDTH && width / Math.max(height, 1) >= WIDE_MIN_RATIO;
}

export function noteWindowBox(screen, mode = "auto") {
  const left = screen.availLeft ?? 0;
  const top = screen.availTop ?? 0;
  const width = screen.availWidth ?? screen.width;
  const height = screen.availHeight ?? screen.height;
  const split = mode === "split" || (mode === "auto" && isWideScreen(screen));
  if (!split) return { left, top, width, height };
  const share = Math.round(width * NOTE_SHARE);
  return { left: left + width - share, top, width: share, height };
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

export function openNoteWindow(id, { at = null, changes, screen = window.screen, mode = windowMode() } = {}) {
  const box = noteWindowBox(screen, mode);
  const features = `popup=yes,left=${box.left},top=${box.top},width=${box.width},height=${box.height}`;
  // An empty URL finds the named window without reloading it, if it is open.
  const win = window.open("", NOTE_WINDOW, features);
  if (!win) return false;
  if (isBlank(win)) {
    win.location.replace(noteWindowUrl(id, at));
    place(win, box);
  } else {
    changes.send({ type: "open", to: "note", id, at });
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

function isBlank(win) {
  try {
    return win.location.href === "about:blank";
  } catch {
    return true;
  }
}

function place(win, box) {
  // The features place it; this makes the outer size (frame included) fit too.
  try {
    win.moveTo(box.left, box.top);
    win.resizeTo(box.width, box.height);
  } catch {
    // Some browsers refuse: the features still placed it.
  }
}
