// The calendar and the timesheet open in windows of their own, never in the notes page: a
// popup (no tabs, no address bar) on the left 2/3 of the screen, full height, beside the
// notes app on the right third. Opening one that is already open brings it forward as it is.
//
//   popOut("/calendar.html", "paradigm-calendar")
export const POPOUT_SHARE = 2 / 3;

/** Where the popup goes: { left, top, width, height } in screen pixels. Pure. */
export function popOutBox(screen, share = POPOUT_SHARE) {
  return {
    left: screen.availLeft ?? 0,
    top: screen.availTop ?? 0,
    width: Math.round(screen.availWidth * share),
    height: screen.availHeight,
  };
}

export function popOut(url, name, screen = window.screen) {
  const box = popOutBox(screen);
  const features = `popup=yes,left=${box.left},top=${box.top},width=${box.width},height=${box.height}`;
  // An empty URL finds the named window without reloading it, if it is open.
  const win = window.open("", name, features);
  if (!win) return null;
  let fresh = true;
  try {
    fresh = win.location.href === "about:blank";
  } catch {
    fresh = true;
  }
  if (fresh) {
    win.location.replace(url);
    // The features place it; this makes the outer size (frame included) fit too.
    try {
      win.moveTo(box.left, box.top);
      win.resizeTo(box.width, box.height);
    } catch {
      // Some browsers refuse: the features still placed it.
    }
  }
  win.focus();
  return win;
}
