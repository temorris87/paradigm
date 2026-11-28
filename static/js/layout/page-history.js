// The tab's history as the app sees it: window.history, with the app's own position in it, so
// H and L (layout/main-keys.js) know when there is no earlier or later page. The browser gives
// no way to ask that, so every entry the app makes carries a step number in its state
// ({ ...state, step }): a push counts one on and drops the steps ahead, a replace keeps the step,
// Back and Forward read it again. An entry with no step (the first page of the tab, a page from
// before Paradigm) counts as step 0: nothing earlier is the app's.
//
//   const history = new PageHistory(window.history, sessionStorage);
//   history.state / pushState / replaceState / back()   as window.history's
//   history.popped()       after a popstate (Back, Forward): reads the step of the entry reached
//   history.go(by)         history.go(by), or false past either end (nothing happens)
//   history.goBack()       go(-1): false with no earlier page
//   history.goForward()    go(1): false with no later page
//   history.step           the step of the entry shown
// Pure apart from the history and the storage it holds.

// The furthest step the tab can go Forward to, kept in the tab's sessionStorage: it lasts
// through a reload, as the browser's later entries do.
const LAST_KEY = "paradigm.lastPageStep";

/** The step an entry's state carries (0 when it has none). */
export function stepOf(state) {
  return Number.isInteger(state?.step) && state.step >= 0 ? state.step : 0;
}

export class PageHistory {
  constructor(history, storage = null) {
    this.history = history;
    this.storage = storage;
    this.step = stepOf(history.state);
    // Back and Forward asked of the browser whose popstate has not come yet: it moves the tab a
    // moment later, so a quick second H is checked from where the first one lands.
    this.moves = [];
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
    this.step = stepOf(this.history.state);
    this.moves.shift();
    this.last = Math.max(this.last, this.step);
    // A move the browser did not make (Back pressed by hand in between) would leave the count
    // off for good: start again from the step the entry carries.
    if (this.position < 0 || this.position > this.last) this.moves = [];
    this.saveLast();
  }

  go(by) {
    const target = this.position + by;
    if (!by || target < 0 || target > this.last) return false;
    this.moves.push(by);
    this.history.go(by);
    return true;
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
