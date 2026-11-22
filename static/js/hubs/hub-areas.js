// Which area a project is in, and which projects an area holds, read from the notes tree
// (each note's area_id). An area that is trashed or no longer an area counts as none; an
// archived area still counts (the caller shows it muted). Pure.
import { isHub } from "../notes/hub-groups.js";

/** The project's area note, or null. */
export function areaOf(tree, projectId) {
  const project = tree.get(projectId);
  if (!project || project.kind !== "project") return null;
  const area = tree.get(project.area_id);
  return area && area.kind === "area" && isHub(tree, area.id) ? area : null;
}

/** The active (not archived) top-level projects in an area, sorted by title. */
export function projectsIn(tree, areaId) {
  return allProjectsIn(tree, areaId).filter((note) => !note.archived_at);
}

/** The archived projects in an area, sorted by title. */
export function archivedProjectsIn(tree, areaId) {
  return allProjectsIn(tree, areaId).filter((note) => note.archived_at);
}

function allProjectsIn(tree, areaId) {
  return tree.children(null).filter((note) => note.kind === "project" && note.area_id === areaId);
}
