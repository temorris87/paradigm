// Turns the keys typed so far into a command, following Vim's grammar:
//   ["x] [count] action
//   ["x] [count] motion
//   ["x] [count] operator [count] (motion | text object | the operator again, for lines)
// In visual mode an operator acts on the selection at once.
// parse() returns { status: "incomplete" } while more keys are needed, { status: "invalid" }
// for a sequence that means nothing, or { status: "done", cmd }.
import { isRegisterName } from "./registers.js";
import { NORMAL_TABLE, OPERATOR_TARGETS, VISUAL_TABLE } from "./keys.js";
import { parseKeys } from "./key-names.js";

const INCOMPLETE = { status: "incomplete" };
const INVALID = { status: "invalid" };

export function parse(keys, scope) {
  let index = 0;
  let register = null;
  if (keys[0] === '"') {
    if (keys.length < 2) return INCOMPLETE;
    register = keys[1];
    if (!isRegisterName(register)) return INVALID;
    index = 2;
  }
  const first = readCount(keys, index);
  index = first.next;
  const table = scope === "visual" ? VISUAL_TABLE : NORMAL_TABLE;
  const found = match(table, keys, index);
  if (found !== null && "status" in found) return found;
  if (found === null) return INVALID;
  const { entry } = found;
  index = found.next;

  if (entry.kind === "alias") {
    const prefix = keys.slice(0, first.next);
    return parse([...prefix, ...parseKeys(entry.alias), ...keys.slice(index)], scope);
  }

  let arg = null;
  if (entry.arg) {
    if (index >= keys.length) return INCOMPLETE;
    arg = keys[index];
    if (arg === "<Esc>") return INVALID;
    index += 1;
  }

  const cmd = { register, entry, arg, count: first.value, target: null, body: keys.slice(first.next) };
  if (entry.kind !== "operator" || scope === "visual") {
    return index === keys.length ? { status: "done", cmd } : INVALID;
  }

  // Operator pending: an optional second count, then what to operate on.
  const second = readCount(keys, index);
  index = second.next;
  if (index >= keys.length) return INCOMPLETE;
  const targetFound = match([...OPERATOR_TARGETS, ...doubled(entry)], keys, index);
  if (targetFound !== null && "status" in targetFound) return targetFound;
  if (targetFound === null) return INVALID;
  index = targetFound.next;
  let targetArg = null;
  if (targetFound.entry.arg) {
    if (index >= keys.length) return INCOMPLETE;
    targetArg = keys[index];
    if (targetArg === "<Esc>") return INVALID;
    index += 1;
  }
  if (index !== keys.length) return INVALID;
  cmd.target = { entry: targetFound.entry, arg: targetArg };
  cmd.count = multiplyCounts(first.value, second.value);
  // The body leaves out the counts, so "." can put a new count in front.
  cmd.body = [...keys.slice(first.next, second.start), ...keys.slice(second.next)];
  return { status: "done", cmd };
}

// "dd", "gUU", "gUgU", "g~~", ">>": the operator on whole lines.
function doubled(entry) {
  const last = entry.seq[entry.seq.length - 1];
  const doubles = [{ seq: entry.seq, kind: "line" }];
  if (entry.seq.length > 1) doubles.push({ seq: [last], kind: "line" });
  return doubles;
}

function readCount(keys, start) {
  let index = start;
  let digits = "";
  while (index < keys.length && /^[0-9]$/.test(keys[index]) && !(digits === "" && keys[index] === "0")) {
    digits += keys[index];
    index += 1;
  }
  return { value: digits ? Math.min(Number(digits), 99999) : null, start, next: index };
}

function multiplyCounts(a, b) {
  if (a === null && b === null) return null;
  return Math.min((a ?? 1) * (b ?? 1), 99999);
}

// The longest entry whose keys equal keys[index...]; INCOMPLETE if keys so far are only the
// start of some entry; null if nothing fits.
function match(entries, keys, index) {
  const rest = keys.slice(index);
  let best = null;
  let partial = false;
  for (const entry of entries) {
    const seq = entry.seq;
    if (seq.length <= rest.length) {
      if (seq.every((key, at) => key === rest[at]) && (!best || seq.length > best.seq.length)) best = entry;
    } else if (rest.every((key, at) => key === seq[at])) {
      partial = true;
    }
  }
  if (best) return { entry: best, next: index + best.seq.length };
  return partial ? INCOMPLETE : null;
}
