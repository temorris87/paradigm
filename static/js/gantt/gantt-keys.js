// THE key table of a Gantt chart (a project's or an area's, a plan template's). The chart's
// key handling and any help listing both read it; nothing else binds keys there. Keys with
// Ctrl, Alt or Cmd held are left to the browser, and Tab moves the focus on, as everywhere.
import { keyReader } from "../ui/key-sequence.js";

export const GANTT_KEYS = [
  { keys: ["j", "ArrowDown"], action: "next", help: "next row" },
  { keys: ["k", "ArrowUp"], action: "previous", help: "previous row" },
  { keys: ["gg", "Home"], action: "first", help: "first row" },
  { keys: ["G", "End"], action: "last", help: "last row" },
  { keys: ["Enter"], action: "open", help: "open the row: a phase or milestone's note, a project's dashboard" },
  { keys: ["e"], action: "edit", help: "Edit dates… (asks why when an end moves later)" },
  { keys: [" "], action: "done", help: "mark a milestone done, or not done" },
  { keys: ["h"], action: "history", help: "the row's date history" },
  { keys: ["p"], action: "newPhase", help: "+ Phase" },
  { keys: ["m"], action: "newMilestone", help: "+ Milestone (in the chosen phase, if one is)" },
];

const read = keyReader(GANTT_KEYS);

/** The action a keydown means on a chart ("pending" partway through gg), or null. */
export function ganttAction(event) {
  return read(event);
}
