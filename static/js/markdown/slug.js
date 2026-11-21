// Heading ids. Readable like Obsidian's (the heading text, lower-cased, spaces to dashes), and
// made unique within one note by adding -1, -2...

export function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
  return slug || "section";
}

export function makeSlugger() {
  const seen = new Map();
  return (text) => {
    const base = slugify(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}
