// A project's plan read together with the notes tree: its phases (a note each, directly under
// the project, with a start and an end day) and its milestones (a note each, under the project
// or a phase, with a day), and every change of their dates since they were first set (the
// baseline). Pure.
//
//   const plan = new Plan(await planApi.list());
//   plan.phase(id) / plan.milestone(id)     the row, or null
//   plan.changesOf(id)                      its date changes, oldest first
//   plan.appliedTo(projectId)               { template_id, title, applied_at } or null
//   phasesOf(tree, plan, projectId)         [{ note, phase }] by start day
//   milestonesOf(tree, plan, ownerId)       [{ note, milestone, phase }] in the owner (a project:
//                                           its phases' too; phase: the phase note or null)
//   slipOf(plan, id)                        { days, moves, later, keepsSlipping }: how far its end
//                                           (a milestone's day) is past the baseline, how many
//                                           changes, how many moved it later
//   slipText(slip)                          "+9 d, moved 3×" ("" when it never moved)
//   changeText(change)                      "12 Nov: end 28 Nov → 5 Dec — vendor late"
//   projectSpan(tree, plan, projectId)      { start, end } over its phases and milestones, or null
//   nextMilestone(tree, plan, projectId, today)   the first milestone not done, or null
//   daysBetween(a, b) / addDays(day, n) / shortDay(day)   day strings 'YYYY-MM-DD'
export const KEEPS_SLIPPING = 3;

const NO_PLAN = { phases: [], milestones: [], changes: [], applied: [] };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export class Plan {
  constructor({ phases = [], milestones = [], changes = [], applied = [] } = NO_PLAN) {
    this.phases = new Map(phases.map((row) => [row.id, row]));
    this.milestones = new Map(milestones.map((row) => [row.id, row]));
    this.changes = new Map();
    for (const change of changes) {
      if (!this.changes.has(change.note_id)) this.changes.set(change.note_id, []);
      this.changes.get(change.note_id).push(change);
    }
    this.applied = new Map(applied.map((row) => [row.project_id, row]));
  }

  phase(id) {
    return this.phases.get(id) ?? null;
  }

  milestone(id) {
    return this.milestones.get(id) ?? null;
  }

  changesOf(id) {
    return this.changes.get(id) ?? [];
  }

  appliedTo(projectId) {
    return this.applied.get(projectId) ?? null;
  }
}

/** Day number (days since 1970-01-01) of a 'YYYY-MM-DD' day. */
export function dayNumber(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

export function dayString(number) {
  return new Date(number * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

export function addDays(day, n) {
  return dayString(dayNumber(day) + n);
}

/** "3 Nov" (and the year when it isn't this year's). */
export function shortDay(day, today = null) {
  const [y, m, d] = String(day).split("-").map(Number);
  if (!y) return "";
  const thisYear = today ? Number(String(today).slice(0, 4)) : y;
  return `${d} ${MONTHS[m - 1]}${y === thisYear ? "" : ` ${y}`}`;
}

export function phasesOf(tree, plan, projectId) {
  return tree.children(projectId).filter((note) => plan.phase(note.id))
    .map((note) => ({ note, phase: plan.phase(note.id) }))
    .sort((a, b) => a.phase.start.localeCompare(b.phase.start) || a.phase.end.localeCompare(b.phase.end) || a.note.id - b.note.id);
}

export function milestonesOf(tree, plan, ownerId) {
  const owner = tree.get(ownerId);
  if (!owner) return [];
  const places = [owner, ...(plan.phase(ownerId) ? [] : tree.children(ownerId).filter((note) => plan.phase(note.id)))];
  return places.flatMap((place) => tree.children(place.id).filter((note) => plan.milestone(note.id))
    .map((note) => ({ note, milestone: plan.milestone(note.id), phase: plan.phase(place.id) ? place : null })))
    .sort((a, b) => a.milestone.day.localeCompare(b.milestone.day) || a.note.id - b.note.id);
}

export function slipOf(plan, id) {
  const phase = plan.phase(id);
  const milestone = plan.milestone(id);
  const changes = plan.changesOf(id);
  const days = phase ? daysBetween(phase.baseline_end, phase.end) : milestone ? daysBetween(milestone.baseline_day, milestone.day) : 0;
  // Only the end (or the day) slipping counts as later; a start moving is a move.
  const later = changes.filter((change) => change.field !== "start" && change.new > change.old).length;
  return { days, moves: changes.length, later, keepsSlipping: later >= KEEPS_SLIPPING };
}

export function slipText(slip) {
  if (!slip.moves) return "";
  const days = slip.days > 0 ? `+${slip.days} d` : slip.days < 0 ? `${slip.days} d` : "on its first date";
  return `${days}, moved ${slip.moves}×`;
}

export function changeText(change, today = null) {
  const when = change.changed_at ? shortDay(change.changed_at.slice(0, 10), today) : "";
  const field = { start: "start", end: "end", day: "day" }[change.field] ?? change.field;
  const reason = change.reason ? ` — ${change.reason}` : "";
  return `${when}: ${field} ${shortDay(change.old, today)} → ${shortDay(change.new, today)}${reason}`;
}

export function projectSpan(tree, plan, projectId) {
  const days = [];
  for (const { phase } of phasesOf(tree, plan, projectId)) days.push(phase.start, phase.end);
  for (const { milestone } of milestonesOf(tree, plan, projectId)) days.push(milestone.day);
  if (!days.length) return null;
  days.sort();
  return { start: days[0], end: days[days.length - 1] };
}

export function nextMilestone(tree, plan, projectId) {
  return milestonesOf(tree, plan, projectId).find(({ milestone }) => !milestone.done_day) ?? null;
}

/** Whether any phase or milestone of the project keeps slipping (moved later 3+ times). */
export function projectSlipping(tree, plan, projectId) {
  const ids = [...phasesOf(tree, plan, projectId).map(({ note }) => note.id),
    ...milestonesOf(tree, plan, projectId).map(({ note }) => note.id)];
  return ids.some((id) => slipOf(plan, id).keepsSlipping);
}
