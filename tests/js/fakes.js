// Stand-ins for EventSource and timers, so connection logic runs without a server.

export class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.closed = false;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  // Test controls
  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  drop({ closed = false } = {}) {
    this.readyState = closed ? 2 : 0;
    this.onerror?.();
  }

  static latest() {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }

  static reset() {
    FakeEventSource.instances = [];
  }
}

export class FakeTimers {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.pending = new Map();
  }

  set = (fn, ms) => {
    const id = this.nextId++;
    this.pending.set(id, { fn, at: this.now + ms });
    return id;
  };

  clear = (id) => {
    this.pending.delete(id);
  };

  advance(ms) {
    this.now += ms;
    for (const [id, timer] of [...this.pending]) {
      if (timer.at <= this.now) {
        this.pending.delete(id);
        timer.fn();
      }
    }
  }
}
