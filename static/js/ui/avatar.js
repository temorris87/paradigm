// A round avatar with a person's initials (css/ui.css .avatar). No photos.
//
//   initials("Ada Park") -> "AP"; one word -> its first letter (pure)
//   avatar(name, className?) -> the element
export function initials(name) {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = [...words[0]][0];
  const last = words.length > 1 ? [...words.at(-1)][0] : "";
  return `${first}${last}`.toUpperCase();
}

export function avatar(name, className = "") {
  const node = document.createElement("span");
  node.className = `avatar ${className}`.trim();
  node.setAttribute("aria-hidden", "true");
  node.textContent = initials(name);
  return node;
}
