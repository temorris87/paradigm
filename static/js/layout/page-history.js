// The tab's history as the app sees it: window.history, with the app's own position in it, so
// H and L (layout/main-keys.js) know when there is no earlier or later page. The browser gives
// no way to ask that, so every entry the app makes carries a step number in its state
// ({ ...state, step }): a push counts one on and drops the steps ahead, a replace keeps the step,
// Back and Forward read it again. An entry with no step (the first page of the tab, a page from
// before Paradigm) counts as step 0: nothing earlier is the app's.
//
//   const history = new PageHistory(window.history);
//   history.state / pushState / replaceState / back()   as window.history's
//   history.popped()       after a popstate (Back, Forward): reads the step of the entry reached
//   history.goBack()       history.back(), or false with no earlier page (nothing happens)
//   history.goForward()    history.forward(), or false with no later page
// Pure apart from the history it holds.

/** The step an entry's state carries (0 when it has none). */
export function stepOf(state) {
  return Number.isInteger(state?.step) && state.step >= 0 ? state.step : 0;
}

export class PageHistory {
  constructor(history) {
    this.history = history;
    this.step = stepOf(history.state);
    // The furthest step this tab can go Forward to. After a reload the steps ahead are unknown:
    // the page loaded counts as the last.
    this.last = this.step;
  }

  get state() {
    return this.history.state;
  }

  pushState(state, title, url) {
    this.step += 1;
    this.last = this.step;
    this.history.pushState({ ...(state ?? {}), step: this.step }, title, url);
  }

  replaceState(state, title, url) {
    this.history.replaceState({ ...(state ?? {}), step: this.step }, title, url);
  }

  back() {
    this.history.back();
  }

  forward() {
    this.history.forward();
  }

  popped() {
    this.step = stepOf(this.history.state);
    this.last = Math.max(this.last, this.step);
  }

  goBack() {
    if (this.step <= 0) return false;
    this.history.back();
    return true;
  }

  goForward() {
    if (this.step >= this.last) return false;
    this.history.forward();
    return true;
  }
}
