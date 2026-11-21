// :export: the open note (and the notes it links to that come along, scope.js) as one
// self-contained .html file, downloaded by the browser.
//
//   const { file, count } = await exportNote({ tree, rootId, rootBody, notesApi });
import { diagramSvg } from "../diagrams/mermaid.js";
import { inlineAssets } from "./assets.js";
import { downloadFile, exportFileName } from "./download.js";
import { buildPage } from "./page.js";
import { renderNotes } from "./render-notes.js";
import { collectNotes } from "./scope.js";

// Read when exporting, so the file always looks like the app does now.
const STYLESHEETS = ["../../css/nord.css", "../../css/markdown.css", "../../css/export.css"]
  .map((path) => new URL(path, import.meta.url).href);

export async function exportNote({
  tree,
  rootId,
  rootBody, // the editor's text: the file is what is on screen, saved or not
  notesApi,
  svgFor = diagramSvg,
  fetchImage = fetchBlob,
  fetchText = fetchString,
  save = downloadFile,
}) {
  const notes = await collectNotes(tree, rootId, async (id) =>
    (id === rootId ? rootBody : (await notesApi.get(id)).body));
  const content = await inlineAssets(renderNotes(tree, notes), { svgFor, fetchImage });
  const css = (await Promise.all(STYLESHEETS.map(fetchText))).join("\n");
  const title = notes[0].title;
  const file = exportFileName(title);
  save(file, buildPage({ title, css, content }));
  return { file, count: notes.length - 1 };
}

async function fetchBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

async function fetchString(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not read ${url} (HTTP ${response.status})`);
  return response.text();
}
