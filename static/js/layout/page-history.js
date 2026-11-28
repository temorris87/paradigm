// The tab's history as the app sees it: window.history, with the app's own position in it, so
// H and L (layout/main-keys.js) know when there is no earlier or later page. The browser gives
// no way to ask that, so every entry the app makes carries a step number in its state
// ({ ...state, step }): a push counts one on and drops the steps ahead, a replace keeps the step,
// Back and Forward read it again. The entry the tab loaded with no step (its first page) is
// marked step 0: nothing earlier is the app's. One reached later with no step is a "#" link's
// (a footnote on Live): the browser made it one on from the entry before.
//
//   const history = new PageHistory(window.history, sessionStorage);
//   history.state / pushState / replaceState / back()   as window.history's
//   history.popped()       on popstate (Back, Forward, a "#" link): reads the step of the entry
//   history.landed()       once the app has drawn that entry: runs what waited for it
//   history.whenSettled(fn) fn now, or once every Back and Forward asked for has landed and
//                          been drawn: Escape, H and L act on the page shown, not one on its way
//   history.go(by)         history.go(by), or false past either end (nothing happens)
//   history.goBack()       go(-1): false with no earlier page
//   history.goForward()    go(1): false with no later page
//   history.step           the step of the entry shown
// Pure apart from the history and the storage it holds.

// The furthest step the tab can go Forward to, kept in the tab's sessionStorage: it lasts
// through a reload, as the browser's later entries do.
const LAST_KEY = "paradigm.lastPageStep";
// How long a Back or Forward has to land before it counts as skipped (a browser can drop one).
const LAND_MS = 1000;

/** The step an entry's state carries (0 when it has none). */
export function stepOf(state) {
  return Number.isInteger(state?.step) && state.step >= 0 ? state.step : 0;
}

export class PageHistory {
  constructor(history, storage = null, { timers = globalThis } = {}) {
    this.history = history;
    this.storage = storage;
    this.timers = timers;
    this.landTimer = null;
    this.step = stepOf(history.state);
    // Back and Forward asked of the browser whose popstate has not come yet: it moves the tab a
    // moment later, so a quick second H is checked from where the first one lands.
    this.moves = [];
    this.drawing = false; // a popstate's entry the app has not finished drawing
    this.waiting = [];
    // An entry the app made (it has a step) is a reload or a return to the tab's pages: the
    // browser still has the steps ahead that were reached. A fresh load (no step) has none.
    const known = Number.isInteger(history.state?.step) ? this.readLast() : 0;
    this.last = Math.max(this.step, known);
    this.saveLast();
    // Mark the entry loaded as the app's, so a reload on it later counts as one.
    if (!Number.isInteger(history.state?.step)) history.replaceState({ ...(history.state ?? {}), step: 0 }, "");
  }

  get state() {
    return this.history.state;
  }

  /** Where the tab will be once every Back and Forward asked for has landed. */
  get position() {
    return this.moves.reduce((sum, by) => sum + by, this.step);
  }

  pushState(state, title, url) {
    this.step += 1;
    this.last = this.step;
    this.saveLast();
    this.history.pushState({ ...(state ?? {}), step: this.step }, title, url);
  }

  replaceState(state, title, url) {
    this.history.replaceState({ ...(state ?? {}), step: this.step }, title, url);
  }

  back() {
    this.go(-1);
  }

  forward() {
    this.go(1);
  }

  popped() {
    this.drawing = true;
    if (!Number.isInteger(this.history.state?.step)) {
      // A "#" link: a new entry after this one, so the steps ahead are gone. Marked, so that
      // Back and Forward onto it later read its step.
      this.step += 1;
      this.last = this.step;
      this.moves = [];
      this.watchMoves();
      this.replaceState(this.history.state, "");
      this.saveLast();
      return;
    }
    this.step = stepOf(this.history.state);
    this.moves.shift();
    this.watchMoves();
    this.last = Math.max(this.last, this.step);
    // A move the browser did not make (Back pressed by hand in between) would leave the count
    // off for good: start again from the step the entry carries.
    if (this.position < 0 || this.position > this.last) {
      this.moves = [];
      this.watchMoves();
    }
    this.saveLast();
  }

  landed() {
    this.drawing = false;
    while (this.settled && this.waiting.length) this.waiting.shift()();
  }

  get settled() {
    return !this.moves.length && !this.drawing;
  }

  whenSettled(fn) {
    if (this.settled && !this.waiting.length) fn();
    else this.waiting.push(fn);
  }

  go(by) {
    const target = this.position + by;
    if (!by || target < 0 || target > this.last) return false;
    this.moves.push(by);
    this.watchMoves();
    this.history.go(by);
    return true;
  }

  /** A timer while a move is on its way: one that never lands must not hold the keys for good. */
  watchMoves() {
    if (this.landTimer !== null) this.timers.clearTimeout(this.landTimer);
    this.landTimer = this.moves.length ? this.timers.setTimeout(() => this.gaveUp(), LAND_MS) : null;
  }

  /** No popstate came: count from the entry shown. The keys that waited are dropped, not run: a
   * popstate merely late would move the tab after them, so where they would act is not known. */
  gaveUp() {
    this.landTimer = null;
    this.moves = [];
    this.waiting = [];
    this.step = stepOf(this.history.state);
    this.last = Math.max(this.last, this.step);
  }

  goBack() {
    return this.go(-1);
  }

  goForward() {
    return this.go(1);
  }

  readLast() {
    try {
      const last = Number(this.storage?.getItem(LAST_KEY));
      return Number.isInteger(last) && last >= 0 ? last : 0;
    } catch {
      return 0;
    }
  }

  saveLast() {
    try {
      this.storage?.setItem(LAST_KEY, String(this.last));
    } catch {
      // No storage (a window that refuses it): after a reload L knows only the page loaded.
    }
  }
}
