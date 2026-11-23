// Reading a key table that holds two-key sequences as Vim does ("gg" first row, "gt" Today):
// the first key waits for the second. A key in a table is a sequence when it is two
// characters starting with a lowercase letter; named keys ("End", "ArrowDown") never are.
// Pure apart from the clock it is given.
//
//   const read = keyReader(TABLE);         TABLE: [{ keys: ["gg", "Home"], action }]
//   read(event) -> action | "pending" | null
//     "pending": the key starts a sequence; the caller swallows it and waits for the next.
//     A second key that makes no sequence means nothing (null), as in Vim.
//   isSequence(key)
//   resetSequences()          every reader forgets a first key it waits on (a page-wide key,
//                             gt, ran: the g was the page's, not the list's)
export const SEQUENCE_TIMEOUT_MS = 1500;

const readers = new Set();

export function resetSequences() {
  for (const reset of readers) reset();
}

export function isSequence(key) {
  return key.length === 2 && /^[a-z]$/.test(key[0]);
}

export function keyReader(table, { now = () => Date.now(), timeout = SEQUENCE_TIMEOUT_MS } = {}) {
  const byKey = new Map(table.flatMap(({ keys, action }) => keys.map((key) => [key, action])));
  const starts = new Set([...byKey.keys()].filter(isSequence).map((key) => key[0]));
  let pending = null;
  let pendingAt = 0;
  readers.add(() => {
    pending = null;
  });
  return (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      pending = null;
      return null;
    }
    // A Shift on its own (on the way to "G") doesn't end a wait.
    if (event.key === "Shift") return null;
    if (pending !== null && now() - pendingAt <= timeout) {
      const combo = pending + event.key;
      pending = null;
      return byKey.get(combo) ?? null;
    }
    pending = null;
    if (starts.has(event.key)) {
      pending = event.key;
      pendingAt = now();
      return "pending";
    }
    return byKey.get(event.key) ?? null;
  };
}
