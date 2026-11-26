// Telling the app's other windows (the notes page, the calendar, the timesheet) that
// something changed, or asking the notes page to open a note. Same-origin only: a
// BroadcastChannel never leaves this browser.
//
//   const changes = new Changes();
//   changes.send({ type: "changed", what: ["tasks"] })   others refresh what they show
//   changes.send({ type: "open", id, at })               the notes page opens the note
//   changes.send({ type: "place", to: "note", mode })    the note window places itself again
//                                                         (Window > right third)
//   changes.listen((message) => ...)
//   await changes.ask({ type: "open", ... }, "opened")   true once a window answered in time
const CHANNEL = "paradigm";
const ANSWER_MS = 400;

export class Changes {
  constructor(name = CHANNEL) {
    this.channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : null;
  }

  send(message) {
    this.channel?.postMessage(message);
  }

  listen(handler) {
    this.channel?.addEventListener("message", (event) => handler(event.data ?? {}));
  }

  /** Sends a message and waits a moment for a window to answer with { type: answerType }. */
  ask(message, answerType) {
    if (!this.channel) return Promise.resolve(false);
    return new Promise((resolve) => {
      const done = (answered) => {
        clearTimeout(timer);
        this.channel.removeEventListener("message", onMessage);
        resolve(answered);
      };
      const onMessage = (event) => {
        if (event.data?.type === answerType) done(true);
      };
      const timer = setTimeout(() => done(false), ANSWER_MS);
      this.channel.addEventListener("message", onMessage);
      this.channel.postMessage(message);
    });
  }
}
