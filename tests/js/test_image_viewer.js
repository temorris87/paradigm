// The image viewer: its zoom and pan maths, its key table, and the element in a real page.
import { viewerAction, VIEWER_KEYS } from "../../static/js/images/viewer-keys.js";
import { actualSizeView, fitScale, fitView, isFitted, keepInside, MAX_SCALE, pan, zoomAt, zoomLabel } from "../../static/js/images/viewer-math.js";
import "../../static/js/images/viewer.js";
import { assertEqual, assertTrue, test } from "./harness.js";

const box = (iw, ih, ww = 1000, wh = 800) => ({ image: { width: iw, height: ih }, window: { width: ww, height: wh } });
const near = (a, b, message) => assertTrue(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);

test("viewer math: fit shrinks big images to the window and never enlarges small ones", () => {
  near(fitScale(box(1600, 900)), (1000 - 48) / 1600, "wide");
  near(fitScale(box(400, 4000)), (800 - 48) / 4000, "tall");
  assertEqual(fitScale(box(300, 200)), 1);
  const view = fitView(box(300, 200));
  assertEqual(JSON.stringify(view), JSON.stringify({ scale: 1, x: 350, y: 300 }));
  assertTrue(isFitted(box(300, 200), view));
});

test("viewer math: zooming keeps the point under the pointer still", () => {
  const b = box(1600, 900);
  const start = fitView(b);
  const zoomed = zoomAt(b, start, 2, 600, 400);
  // The image pixel under (600, 400) before and after.
  near((600 - start.x) / start.scale, (600 - zoomed.x) / zoomed.scale, "x");
  near((400 - start.y) / start.scale, (400 - zoomed.y) / zoomed.scale, "y");
});

test("viewer math: zoom stops at fit and at the maximum", () => {
  const b = box(1600, 900);
  const fitted = fitView(b);
  near(zoomAt(b, fitted, 0.1, 500, 400).scale, fitted.scale, "not below fit");
  assertEqual(zoomAt(b, fitted, 1000, 500, 400).scale, MAX_SCALE);
  assertEqual(actualSizeView(b, fitted, 500, 400).scale, 1);
  assertEqual(zoomLabel({ scale: 0.595 }), "60%");
});

test("viewer math: panning never opens a gap at the image's edge", () => {
  const b = box(1600, 900);
  const big = actualSizeView(b, fitView(b), 500, 400);
  const farLeft = pan(b, big, 5000, 0);
  assertEqual(farLeft.x, 0);
  const farRight = pan(b, big, -5000, 0);
  assertEqual(farRight.x, 1000 - 1600);
  assertEqual(pan(b, big, 0, 5000).y, 0);
  // An image narrower than the window stays centred on that axis.
  assertEqual(keepInside(box(300, 2000), { scale: 1, x: -40, y: 0 }).x, 350);
});

test("viewer keys: one table, every key once, modifiers left to the browser", () => {
  const all = VIEWER_KEYS.flatMap((entry) => entry.keys);
  assertEqual(new Set(all).size, all.length);
  assertTrue(VIEWER_KEYS.every((entry) => entry.help && entry.action));
  assertEqual(viewerAction({ key: "+" }), "zoomIn");
  assertEqual(viewerAction({ key: "Escape" }), "close");
  assertEqual(viewerAction({ key: "+", ctrlKey: true }), null);
  assertEqual(viewerAction({ key: "x" }), null);
});

// A 400×300 PNG drawn here, so the element has a real image to show.
async function sampleImage() {
  const canvas = new OffscreenCanvas(400, 300);
  canvas.getContext("2d").fillRect(0, 0, 400, 300);
  return URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
}

function key(target, name) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

test("viewer element: opens fitted, zooms by keys, closes and gives the focus back", async () => {
  const viewer = document.createElement("pd-image-viewer");
  const before = Object.assign(document.createElement("button"), { textContent: "before" });
  document.body.append(before, viewer);
  const src = await sampleImage();
  try {
    before.focus();
    viewer.open({ src, alt: "Chart" });
    await new Promise((resolve) => viewer.image.complete ? resolve() : viewer.image.addEventListener("load", resolve, { once: true }));
    viewer.fit();
    assertTrue(viewer.isOpen);
    assertEqual(viewer.caption.textContent, "Chart");
    const fitted = viewer.view.scale;
    key(viewer.dialog, "+");
    assertTrue(viewer.view.scale > fitted, "zoomed in");
    key(viewer.dialog, "0");
    assertEqual(viewer.view.scale, fitted);
    key(viewer.dialog, "1");
    assertEqual(viewer.view.scale, 1);
    assertTrue(viewer.info.textContent.includes("400×300"));
    assertTrue(viewer.image.style.transform.includes("scale(1)"));
    key(viewer.dialog, "q");
    assertTrue(!viewer.isOpen);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assertEqual(document.activeElement, before);
  } finally {
    URL.revokeObjectURL(src);
    viewer.remove();
    before.remove();
  }
});
