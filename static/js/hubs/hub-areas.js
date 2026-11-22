// Which area a project is in, and which projects an area holds, read from the notes tree
// (each note's area_id). An area that is trashed or no longer an area counts as none. Pure.
import { isHub } from "../notes/hub-groups.js";

/** The project's area note, or null. */
export function areaOf(tree, projectId) {
  const project = tree.get(projectId);
  if (!project || project.kind !== "project") return null;
  const area = tree.get(project.area_id);
  return area && area.kind === "area" && isHub(tree, area.id) ? area : null;
}

/** The top-level projects in an area, sorted by title. */
export function projectsIn(tree, areaId) {
  return tree.children(null).filter((note) => note.kind === "project" && note.area_id === areaId);
}
