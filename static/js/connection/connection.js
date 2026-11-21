// The tab's link to the server: one open event stream that tells the server this tab
// is alive, plus a "closing" beacon when the tab is really closed.
//
// Events: "connected" when the stream opens (again), "lost" when it has been down for
// lostAfterMs. Retries never stop, so the tab reconnects when the server comes back.

const CLOSED = 2; // EventSource.CLOSED

export class Connection extends EventTarget {
  constructor({
    tabId,
    eventsUrl = "/api/events",
    closingUrl = "/api/closing",
    retryMs = 2000,
    lostAfterMs = 3000,
    EventSourceImpl = globalThis.EventSource,
    sendBeacon = (url) => navigator.sendBeacon(url),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
  }) {
    super();
    const tab = encodeURIComponent(tabId);
    this._eventsUrl = `${eventsUrl}?tab=${tab}`;
    this._closingUrl = `${closingUrl}?tab=${tab}`;
    this._retryMs = retryMs;
    this._lostAfterMs = lostAfterMs;
    this._EventSource = EventSourceImpl;
    this._sendBeacon = sendBeacon;
    this._setTimer = setTimer;
    this._clearTimer = clearTimer;
    this._source = null;
    this._lostTimer = null;
    this._reopenTimer = null;
    this.state = "connecting"; // "connecting" (first time only) | "connected" | "lost"
  }

  start() {
    this._open();
  }

  /** Tell the server this tab is being closed (call from "pagehide"). */
  sendClosing() {
    this._sendBeacon(this._closingUrl);
  }

  stop() {
    this._cancel("_lostTimer");
    this._cancel("_reopenTimer");
    if (this._source) {
      this._source.close();
      this._source = null;
    }
  }

  _open() {
    this._reopenTimer = null;
    const source = new this._EventSource(this._eventsUrl);
    source.onopen = () => this._onOpen();
    source.onerror = () => this._onError(source);
    this._source = source;
  }

  _onOpen() {
    this._cancel("_lostTimer");
    if (this.state !== "connected") {
      this.state = "connected";
      this.dispatchEvent(new Event("connected"));
    }
  }

  _onError(source) {
    // A short blip keeps the state as it is; only a drop longer than lostAfterMs counts.
    // The browser retries a dropped stream by itself; a CLOSED one we reopen ourselves.
    if (source.readyState === CLOSED && this._reopenTimer === null) {
      source.close();
      this._reopenTimer = this._setTimer(() => this._open(), this._retryMs);
    }
    if (this._lostTimer === null && this.state !== "lost") {
      this._lostTimer = this._setTimer(() => this._onLost(), this._lostAfterMs);
    }
  }

  _onLost() {
    this._lostTimer = null;
    this.state = "lost";
    this.dispatchEvent(new Event("lost"));
  }

  _cancel(name) {
    if (this[name] !== null) {
      this._clearTimer(this[name]);
      this[name] = null;
    }
  }
}
