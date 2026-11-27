// THE theme table. A theme is one file in css/themes/ that sets every role token in
// css/themes/_template.css under :root[data-theme="<id>"]; the page's <html data-theme> picks
// it. The markup carries the default, so the first paint is right before any script runs.
// A switcher later is a row here plus a command; nothing is remembered yet.

export const THEMES = Object.freeze([
  Object.freeze({ id: "nord-light", label: "Nord Light", file: "css/themes/nord-light.css", colorScheme: "light" }),
]);

// css/themes/nord-dark.css stays complete on disk, out of the table, for a switcher later.
export const DEFAULT_THEME = "nord-light";

/** The theme with this id, or the default's when there is none. */
export function themeOf(id) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES.find((theme) => theme.id === DEFAULT_THEME);
}

/** The id the page is drawn with: its <html data-theme>, else the default. */
export function currentTheme(root = document.documentElement) {
  const id = root.dataset.theme;
  return THEMES.some((theme) => theme.id === id) ? id : DEFAULT_THEME;
}

/** Draws the page with a theme (an unknown id falls back to the default); returns its id. */
export function applyTheme(id, root = document.documentElement) {
  const theme = themeOf(id);
  root.dataset.theme = theme.id;
  return theme.id;
}
