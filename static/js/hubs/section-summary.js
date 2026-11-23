// The note window's foot bar: each section of the open note by name, with how many it holds
// and how many need attention ("Tasks 3 (1 late) · Files 2"). Pure.
//
//   sectionSummary([{ key, label, rows }]) -> [{ key, label, count, flagged, flagWord }]
//   summaryText(parts) -> "Tasks 3 (1 late) · Files 2"

// What a flagged row means in each section (rows carry late: a task past due, a file gone).
const FLAG_WORDS = { files: "missing" };

/** The bar's parts: one per section, its top-level rows counted (a task section: open ones). */
export function sectionSummary(sections) {
  return sections.map(({ key, label, rows }) => {
    // Opened tasks add their subtasks and "+ Add subtask" under them: only the top rows count.
    const top = rows.filter((row) => (row.depth ?? 0) === 0 && row.addSubtask === undefined
      && !row.statusHistory && !row.digest);
    const counted = key === "tasks" ? top.filter((row) => row.task !== undefined && !row.done) : top;
    return {
      key,
      label,
      count: counted.length,
      flagged: counted.filter((row) => row.late && !row.done).length,
      flagWord: FLAG_WORDS[key] ?? "late",
    };
  });
}

/** The bar as one line of text (its title, and what tests read). */
export function summaryText(parts) {
  return parts.map((part) => `${part.label} ${part.count}${part.flagged ? ` (${part.flagged} ${part.flagWord})` : ""}`).join(" · ");
}
