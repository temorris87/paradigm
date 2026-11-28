// The tab's history as the app sees it: window.history, with the app's own position in it, so
// H and L (layout/main-keys.js) know when there is no earlier or later page. The browser gives
// no way to ask that, so every entry the app makes carries a step number in its state
// ({ ...state, step }): a push counts one on and drops the steps ahead, a replace keeps the step,
// Back and Forward read it again. The entry the tab loaded with no step (its first page) is
// marked step 0: nothing earlier is known to be the app's. One reached later with no step is a
// "#" link's (a footnote on Live: the browser made it one on from the entry before) when only
// the URL's hash changed; else it is an entry the build before steps made (a tab open across
// the upgrade): it is as far behind or ahead as the browser moved, when the browser says where
// the tab is (the Navigation API's entry index), else as an H or L on its way moved, else one
// behind (the browser's own Back, the usual way onto one).
//
//   const history = new PageHistory(window.history, sessionStorage,
//     { where: () => location.href, index: () => navigation?.currentEntry?.index });
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
// The earliest step known to be the app's, kept the same way (below 0 only for entries from
// before the upgrade).
const FIRST_KEY = "paradigm.firstPageStep";
// How long a Back or Forward has to land before it counts as skipped (a browser can drop one).
const LAND_MS = 1000;

/** The step an entry's state carries (0 when it has none). */
export function stepOf(state) {
  return Number.isInteger(state?.step) ? state.step : 0;
}

/** A URL without its "#" part (null when the page's URL isn't known). */
function withoutHash(href) {
  return typeof href === "string" ? href.split("#")[0] : null;
}

export class PageHistory {
  constructor(history, storage = null,
    { timers = globalThis, where = () => globalThis.location?.href, index = () => null } = {}) {
    this.history = history;
    this.storage = storage;
    this.timers = timers;
    this.where = where;
    this.index = index;
    this.landTimer = null;
    this.step = stepOf(history.state);
    // Back and Forward asked of the browser whose popstate has not come yet: it moves the tab a
    // moment later, so a quick second H is checked from where the first one lands.
    this.moves = [];
    this.drawing = false; // a popstate's entry the app has not finished drawing
    this.waiting = [];
    // An entry the app made (it has a step) is a reload or a return to the tab's pages: the
    // browser still has the steps ahead that were reached. A fresh load (no step) has none.
    const counted = Number.isInteger(history.state?.step);
    this.last = Math.max(this.step, counted ? this.readStep(LAST_KEY, 0) : 0);
    this.first = Math.min(this.step, counted ? this.readStep(FIRST_KEY, 0) : 0);
    this.saveLast();
    this.seen();
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
    this.seen();
  }

  replaceState(state, title, url) {
    this.history.replaceState({ ...(state ?? {}), step: this.step }, title, url);
    this.seen();
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
      const here = withoutHash(this.where());
      if (here !== null && this.base !== null && here !== this.base) return this.poppedOntoOld();
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
    this.seen();
    this.moves.shift();
    this.watchMoves();
    this.last = Math.max(this.last, this.step);
    // A move the browser did not make (Back pressed by hand in between) would leave the count
    // off for good: start again from the step the entry carries.
    this.first = Math.min(this.first, this.step);
    if (this.position < this.first || this.position > this.last) {
      this.moves = [];
      this.watchMoves();
    }
    this.saveLast();
  }

  /** Back or Forward reached an entry from before steps: as far as the tab moved, when that is
   * known, else one behind. Past first or last, it is the earliest or latest known. */
  poppedOntoOld() {
    this.step += this.movedBy();
    this.first = Math.min(this.first, this.step);
    this.last = Math.max(this.last, this.step);
    this.moves = [];
    this.watchMoves();
    this.replaceState(this.history.state, "");
    this.saveLast();
  }

  /** How far the popstate moved the tab: the browser's entry index if it gives one, else the
   * H or L on its way (the browser's own buttons ask nothing of us), else one Back. */
  movedBy() {
    const before = this.at;
    const now = this.readIndex();
    if (Number.isInteger(before) && Number.isInteger(now) && now !== before) return now - before;
    return Math.sign(this.moves[0] ?? -1) || -1;
  }

  /** Note where the tab is now: its URL (to tell a "#" link from another entry) and its index. */
  seen() {
    this.base = withoutHash(this.where());
    this.at = this.readIndex();
  }

  readIndex() {
    try {
      const index = this.index();
      return Number.isInteger(index) ? index : null;
    } catch {
      return null;
    }
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
    if (!by || target < this.first || target > this.last) return false;
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
    this.seen();
    this.last = Math.max(this.last, this.step);
    this.first = Math.min(this.first, this.step);
  }

  goBack() {
    return this.go(-1);
  }

  goForward() {
    return this.go(1);
  }

  readStep(key, otherwise) {
    try {
      const saved = this.storage?.getItem(key);
      const step = Number(saved);
      return saved !== null && saved !== undefined && Number.isInteger(step) ? step : otherwise;
    } catch {
      return otherwise;
    }
  }

  saveLast() {
    try {
      this.storage?.setItem(LAST_KEY, String(this.last));
      this.storage?.setItem(FIRST_KEY, String(this.first ?? 0));
    } catch {
      // No storage (a window that refuses it): after a reload L knows only the page loaded.
    }
  }
}
