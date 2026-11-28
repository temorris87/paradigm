// Where the main window goes back to when the note window closes (live-page.js, NotesApp's
// leaveLive): the page it showed when the Live page took over. Pure.
//
//   viewUnderLive(search, state)      what to remember as Live comes up: { search, state }, or
//                                     null when that page was Live itself (a reload on &live)
//   returnTo(shown, under)            the page to show again once the note window has closed,
//                                     or null: Live is no longer on screen, or nothing is under it
//   RELOAD_GRACE_MS                   how long a closed note window has to send "live" again (a
//                                     reload, F5) before the main window leaves Live

export const RELOAD_GRACE_MS = 2000;

export function viewUnderLive(search, state) {
  if (new URLSearchParams(search).has("live")) return null;
  return { search: String(search ?? ""), state: state ?? {} };
}

export function returnTo(shown, under) {
  return shown === "live" && under ? under : null;
}
