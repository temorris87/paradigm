// The hub line under the breadcrumb: what the open hub is. "Project · Area: Operations"
// (the area can be clicked), "Area · 3 projects", "Resource"; "Archived · ..." first on an
// archived hub. Empty when no hub is open.
import { groupForKind, isArchived } from "../notes/hub-groups.js";
import { areaOf, projectsIn } from "./hub-areas.js";

export function showHubLine(line, tree, hub, onOpen) {
  line.hidden = !hub;
  if (!hub) {
    line.replaceChildren();
    return;
  }
  const parts = [span("hub-line__kind", groupForKind(hub.kind).label)];
  if (isArchived(tree, hub.id)) parts.unshift(span("hub-line__archived", "Archived"), separator());
  const more = details(tree, hub, onOpen);
  if (more.length) parts.push(separator(), ...more);
  line.replaceChildren(...parts);
}

function details(tree, hub, onOpen) {
  if (hub.kind === "area") {
    const n = projectsIn(tree, hub.id).length;
    return [span("hub-line__text", n === 1 ? "1 project" : `${n} projects`)];
  }
  if (hub.kind !== "project") return [];
  const area = areaOf(tree, hub.id);
  if (!area) return [span("hub-line__text hub-line__text--none", "no area (:inarea {area})")];
  const archived = isArchived(tree, area.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = archived ? "hub-line__link hub-line__link--archived" : "hub-line__link";
  button.textContent = area.title;
  button.addEventListener("click", () => onOpen(area.id));
  const parts = [span("hub-line__text", "Area: "), button];
  if (archived) parts.push(span("hub-line__text hub-line__text--none", "(archived)"));
  return parts;
}

function separator() {
  const node = span("hub-line__separator", "·");
  node.setAttribute("aria-hidden", "true");
  return node;
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}
