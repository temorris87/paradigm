// Zoom and pan for the image viewer, with no DOM. A view is { scale, x, y }: the image's
// top-left corner sits at (x, y) in the window, drawn at `scale` times its own pixels.
// `box` is { image: { width, height }, window: { width, height } }.

export const MAX_SCALE = 8;
export const ZOOM_STEP = 1.25;
// Room left around a fitted image, so its edges show.
const FIT_MARGIN = 24;

/** The scale that shows the whole image; never above 100%, so small images stay sharp. */
export function fitScale(box) {
  const { image, window: win } = box;
  const room = (size) => Math.max(1, size - 2 * FIT_MARGIN);
  return Math.min(1, room(win.width) / image.width, room(win.height) / image.height);
}

/** The whole image, centred. */
export function fitView(box) {
  return centred(box, fitScale(box));
}

/** Actual pixels (100%), centred on the point (px, py) of the window. */
export function actualSizeView(box, view, px, py) {
  return zoomAt(box, view, 1 / view.scale, px, py);
}

/** Zoom by `factor`, keeping the image point under (px, py) where it is. Never below fit. */
export function zoomAt(box, view, factor, px, py) {
  const scale = clamp(view.scale * factor, fitScale(box), MAX_SCALE);
  const ratio = scale / view.scale;
  return keepInside(box, { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio });
}

export function pan(box, view, dx, dy) {
  return keepInside(box, { ...view, x: view.x + dx, y: view.y + dy });
}

/**
 * An image smaller than the window stays centred on that axis; a bigger one can't be moved
 * so far that a gap opens at its edge, so it can never be lost off screen.
 */
export function keepInside(box, view) {
  const axis = (position, imageSize, windowSize) => {
    const drawn = imageSize * view.scale;
    if (drawn <= windowSize) return (windowSize - drawn) / 2;
    return clamp(position, windowSize - drawn, 0);
  };
  return {
    scale: view.scale,
    x: axis(view.x, box.image.width, box.window.width),
    y: axis(view.y, box.image.height, box.window.height),
  };
}

export function isFitted(box, view) {
  return Math.abs(view.scale - fitScale(box)) < 1e-9;
}

export function zoomLabel(view) {
  return `${Math.round(view.scale * 100)}%`;
}

function centred(box, scale) {
  return keepInside(box, { scale, x: 0, y: 0 });
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
