// Images wider than MAX_WIDTH are shrunk in the browser before they are stored: Python's
// standard library cannot decode images, and a canvas can. targetSize is the pure rule; the
// canvas step around it is kept thin.
//
//   const { blob, width, height, resized } = await downscale(file);

export const MAX_WIDTH = 1600;
export const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// Each type keeps its format: PNG stays lossless so text in screenshots stays sharp.
const ENCODINGS = {
  "image/png": {},
  "image/jpeg": { quality: 0.9 },
  "image/webp": { quality: 0.9 },
};

/** The size to shrink to, or null when the image is narrow enough already. */
export function targetSize(width, height, maxWidth = MAX_WIDTH) {
  if (width <= maxWidth) return null;
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

/** Whether a canvas may redraw this type. A GIF never: its animation would be lost. */
export function canResize(type) {
  return Object.hasOwn(ENCODINGS, type);
}

export async function downscale(file) {
  if (!canResize(file.type)) return { blob: file, resized: false };
  const bitmap = await createImageBitmap(file);
  try {
    const size = targetSize(bitmap.width, bitmap.height);
    if (!size) return { blob: file, resized: false, width: bitmap.width, height: bitmap.height };
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await canvas.convertToBlob({ type: file.type, ...ENCODINGS[file.type] });
    return { blob, resized: true, ...size };
  } finally {
    bitmap.close();
  }
}
