// <pd-image-viewer>: shows one image over the page with its own zoom, so a screenshot can be
// read closely without zooming the whole app. It knows nothing about notes.
//
//   viewer.open({ src, alt });   // opens; Esc, q or a click beside the image closes it
//
// Wheel zooms about the pointer, dragging pans, double-click switches between fit and 100%.
// Keys come from viewer-keys.js. A native modal <dialog> keeps the focus and the keys inside
// it; on closing, the focus goes back to where it was.
import { viewerAction } from "./viewer-keys.js";
import { actualSizeView, fitView, isFitted, keepInside, pan, zoomAt, ZOOM_STEP, zoomLabel } from "./viewer-math.js";

const PAN_STEP = 80;
// A press that moves less than this is a click, not a drag.
const DRAG_SLOP = 4;

export class PdImageViewer extends HTMLElement {
  constructor() {
    super();
    this.dialog = element("dialog", "pd-viewer");
    this.dialog.setAttribute("aria-label", "Image");
    this.stage = element("div", "pd-viewer__stage");
    this.image = element("img", "pd-viewer__image");
    this.image.draggable = false;
    this.caption = element("span", "pd-viewer__caption");
    this.info = element("span", "pd-viewer__info");
    const bar = element("div", "pd-viewer__bar");
    bar.append(this.caption, this.info);
    this.stage.append(this.image);
    this.dialog.append(this.stage, bar);
    this.view = { scale: 1, x: 0, y: 0 };
    this.drag = null;
    this.returnFocus = null;
    this.listen();
  }

  connectedCallback() {
    if (!this.dialog.isConnected) this.append(this.dialog);
  }

  get isOpen() {
    return this.dialog.open;
  }

  open({ src, alt = "" }) {
    this.returnFocus = document.activeElement;
    this.caption.textContent = alt;
    this.info.textContent = "";
    this.image.alt = alt;
    this.image.src = src;
    if (!this.dialog.open) this.dialog.showModal();
    this.dialog.focus();
    if (this.image.complete && this.image.naturalWidth) this.fit();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }

  listen() {
    this.image.addEventListener("load", () => this.fit());
    this.dialog.addEventListener("keydown", (event) => this.onKey(event));
    // Esc on a dialog also fires "cancel"; closing goes through one place either way.
    this.dialog.addEventListener("close", () => this.onClosed());
    this.stage.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    this.stage.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.stage.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.stage.addEventListener("pointerup", (event) => this.onPointerUp(event));
    this.stage.addEventListener("pointercancel", () => { this.drag = null; });
    this.stage.addEventListener("dblclick", (event) => this.onDoubleClick(event));
    window.addEventListener("resize", () => this.isOpen && this.onResize());
  }

  onKey(event) {
    const action = viewerAction(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.act(action);
  }

  act(action) {
    const middle = this.middle();
    switch (action) {
      case "zoomIn": return this.show(zoomAt(this.box(), this.view, ZOOM_STEP, middle.x, middle.y));
      case "zoomOut": return this.show(zoomAt(this.box(), this.view, 1 / ZOOM_STEP, middle.x, middle.y));
      case "fit": return this.fit();
      case "actualSize": return this.show(actualSizeView(this.box(), this.view, middle.x, middle.y));
      case "panLeft": return this.show(pan(this.box(), this.view, PAN_STEP, 0));
      case "panRight": return this.show(pan(this.box(), this.view, -PAN_STEP, 0));
      case "panUp": return this.show(pan(this.box(), this.view, 0, PAN_STEP));
      case "panDown": return this.show(pan(this.box(), this.view, 0, -PAN_STEP));
      case "openTab": return window.open(this.image.src, "_blank", "noopener");
      case "close": return this.close();
      default: return undefined;
    }
  }

  onWheel(event) {
    event.preventDefault();
    if (!this.image.naturalWidth || event.deltaY === 0) return;
    const at = this.pointer(event);
    // Proportional to the wheel distance, so a trackpad zooms smoothly and a mouse in steps.
    const factor = Math.exp(-event.deltaY * 0.002);
    this.show(zoomAt(this.box(), this.view, factor, at.x, at.y));
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    this.drag = { startX: event.clientX, startY: event.clientY, view: this.view, moved: false, onImage: event.target === this.image };
    this.stage.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    const drag = this.drag;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    drag.moved = true;
    this.stage.classList.add("pd-viewer__stage--dragging");
    this.show(pan(this.box(), drag.view, dx, dy));
  }

  onPointerUp() {
    const drag = this.drag;
    this.drag = null;
    this.stage.classList.remove("pd-viewer__stage--dragging");
    // A plain click beside the image closes, like clicking outside any dialog.
    if (drag && !drag.moved && !drag.onImage) this.close();
  }

  onDoubleClick(event) {
    if (event.target !== this.image) return;
    const at = this.pointer(event);
    if (isFitted(this.box(), this.view)) this.show(actualSizeView(this.box(), this.view, at.x, at.y));
    else this.fit();
  }

  onResize() {
    if (isFitted(this.box(), this.view)) this.fit();
    else this.show(keepInside(this.box(), this.view));
  }

  onClosed() {
    this.drag = null;
    this.image.removeAttribute("src");
    const back = this.returnFocus;
    this.returnFocus = null;
    if (back?.isConnected) back.focus();
  }

  fit() {
    if (this.image.naturalWidth) this.show(fitView(this.box()));
  }

  show(view) {
    this.view = view;
    // CSSOM, not a style="" attribute: the CSP allows this.
    this.image.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    this.info.textContent = `${this.image.naturalWidth}×${this.image.naturalHeight}  ${zoomLabel(view)}`;
  }

  box() {
    const rect = this.stage.getBoundingClientRect();
    return {
      image: { width: this.image.naturalWidth || 1, height: this.image.naturalHeight || 1 },
      window: { width: rect.width || 1, height: rect.height || 1 },
    };
  }

  middle() {
    const rect = this.stage.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  pointer(event) {
    const rect = this.stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

if (!customElements.get("pd-image-viewer")) customElements.define("pd-image-viewer", PdImageViewer);
