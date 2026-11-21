// Makes the export's HTML self-contained, in an inert document (DOMParser: nothing runs):
//   - maths placeholders become MathML (KaTeX, output "mathml": no styles, no fonts);
//   - diagram placeholders become their SVG, cleaned like the ones on screen;
//   - Paradigm's own images become data: URLs; an image from a web address becomes a link
//     to it (Paradigm never fetches outside addresses), any other one its alt text.
//
//   await inlineAssets(html, { svgFor, fetchImage }) -> html
// svgFor(source) -> Promise<{ svg } | { error }>; fetchImage(src) -> Promise<Blob>.
import { cleanSvg } from "../diagrams/insert-svg.js";
import { isExternal } from "../markdown/urls.js";
import { typesetMathML } from "../math/typeset.js";

const OWN_IMAGE = /^\/api\/image\?id=\d+$/;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function inlineAssets(html, { svgFor, fetchImage }) {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><body>${html}`, "text/html");
  for (const element of doc.querySelectorAll(".md-math")) typesetMathML(element);
  for (const element of doc.querySelectorAll(".md-mermaid")) await drawDiagram(element, svgFor);
  await inlineImages(doc, fetchImage);
  return doc.body.innerHTML;
}

async function drawDiagram(element, svgFor) {
  const source = element.textContent;
  const result = await svgFor(source).catch((error) => ({ error: String(error?.message ?? error) }));
  const svg = result.svg === undefined ? null : cleanSvg(result.svg);
  if (svg) {
    element.replaceChildren(element.ownerDocument.importNode(svg, true));
    return;
  }
  const doc = element.ownerDocument;
  const code = doc.createElement("pre");
  code.textContent = source;
  const message = doc.createElement("div");
  message.className = "md-mermaid-message";
  message.textContent = result.error ?? "The diagram could not be drawn.";
  element.classList.add("md-mermaid-error");
  element.replaceChildren(code, message);
}

async function inlineImages(doc, fetchImage) {
  const urls = new Map(); // src -> data: URL or null, so an image used twice is fetched once
  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    if (!OWN_IMAGE.test(src)) {
      img.replaceWith(outsideImage(doc, img, src));
      continue;
    }
    if (!urls.has(src)) urls.set(src, await dataUrl(fetchImage, src));
    const url = urls.get(src);
    if (url) img.setAttribute("src", url);
    else img.replaceWith(textOf(doc, `[missing image: ${img.alt || src}]`, "export-missing"));
  }
}

function outsideImage(doc, img, src) {
  const text = img.alt || src;
  if (!isExternal(src)) return textOf(doc, text);
  const link = doc.createElement("a");
  link.href = src; // already through the renderer's allowlist
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = `[image: ${text}]`;
  return link;
}

function textOf(doc, text, className = "") {
  const span = doc.createElement("span");
  if (className) span.className = className;
  span.textContent = text;
  return span;
}

async function dataUrl(fetchImage, src) {
  try {
    const blob = await fetchImage(src);
    if (!IMAGE_TYPES.has(blob.type)) return null; // never SVG or anything that could run
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
