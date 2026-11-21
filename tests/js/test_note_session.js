// The open note's saving: autosave after a pause, one save at a time, conflicts.
import { NoteSession, SaveConflict } from "../../static/js/notes/note-session.js";
import { FakeTimers } from "./fakes.js";
import { assertEqual, assertTrue, test } from "./harness.js";

class FakeApi {
  constructor() {
    this.saves = [];
    this.serverVersion = 1;
    this.held = null;
  }

  save(request, options = {}) {
    this.saves.push({ ...request, ...options });
    const answer = () => {
      if (request.version !== this.serverVersion && !request.force) {
        return Promise.reject(Object.assign(new Error("changed"), { status: 409, payload: { version: this.serverVersion } }));
      }
      this.serverVersion += 1;
      return Promise.resolve({ version: this.serverVersion });
    };
    if (this.hold) return new Promise((resolve) => { this.held = () => resolve(); }).then(answer);
    return answer();
  }
}

const NOTE = { id: 7, title: "Acme", body: "one", version: 1, parent_id: null };

function makeSession() {
  const api = new FakeApi();
  const timers = new FakeTimers();
  const errors = [];
  const session = new NoteSession({ api, timers, delayMs: 1000, onError: (error) => errors.push(error) });
  session.open(NOTE);
  return { api, timers, session, errors };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("session: saves a second after the last edit", async () => {
  const { api, timers, session } = makeSession();
  session.edited("one two");
  timers.advance(600);
  session.edited("one two three");
  timers.advance(600);
  assertEqual(api.saves.length, 0, "still typing");
  assertTrue(session.dirty);
  timers.advance(400);
  await tick();
  assertEqual(api.saves.length, 1);
  assertEqual(api.saves[0].body, "one two three");
  assertTrue(!session.dirty);
  assertEqual(session.note.version, 2);
});

test("session: nothing to save, nothing sent", async () => {
  const { api, session } = makeSession();
  session.edited("one");
  await session.save();
  assertEqual(api.saves.length, 0);
});

test("session: typing during a save is saved next", async () => {
  const { api, timers, session } = makeSession();
  api.hold = true;
  session.edited("a");
  const first = session.save();
  await tick();
  session.edited("ab");
  api.held();
  await first;
  assertTrue(session.dirty, "ab is not saved yet");
  api.hold = false;
  timers.advance(1000);
  await tick();
  assertEqual(api.saves.map((save) => `${save.body}@${save.version}`).join(" "), "a@1 ab@2");
  assertTrue(!session.dirty);
});

test("session: a newer copy elsewhere is a conflict, and autosave stops", async () => {
  const { api, timers, session, errors } = makeSession();
  api.serverVersion = 5; // another tab saved
  session.edited("mine");
  timers.advance(1000);
  await tick();
  assertTrue(errors[0] instanceof SaveConflict);
  assertEqual(session.conflict.version, 5);
  session.edited("mine, more");
  timers.advance(5000);
  await tick();
  assertEqual(api.saves.length, 1, "no autosave while in conflict");
  let refused = null;
  await session.save().catch((error) => { refused = error; });
  assertTrue(refused instanceof SaveConflict, ":w is refused too");
  await session.save({ force: true });
  assertEqual(api.saves[1].force, true);
  assertTrue(!session.dirty && session.conflict === null);
});

test("session: leaving sends the unsaved text with keepalive", () => {
  const { api, session } = makeSession();
  session.edited("bye");
  session.saveBeforeLeaving();
  assertEqual(api.saves.length, 1);
  assertEqual(api.saves[0].keepalive, true);
});

test("session: a note opened while a save was on its way is not touched by it", async () => {
  const { api, session } = makeSession();
  api.hold = true;
  session.edited("old note text");
  const pending = session.save();
  await tick();
  session.open({ id: 8, title: "Other", body: "fresh", version: 3, parent_id: null });
  api.held();
  await pending;
  assertEqual(session.note.version, 3);
  assertEqual(session.saved, "fresh");
});
