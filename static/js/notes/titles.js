// How note titles compare: spaces collapsed, case ignored. Pure.

export function normalTitle(title) {
  return String(title).split(/\s+/).filter(Boolean).join(" ");
}

export function titleKey(title) {
  return normalTitle(title).toLowerCase();
}
