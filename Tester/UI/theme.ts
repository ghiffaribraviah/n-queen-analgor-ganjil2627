// The theme of the page: dark unless the user chose light with the button in the header. The choice is kept in the
// browser; a browser that refuses storage (a private window, blocked site data) just starts dark each time.
export type Theme = "dark" | "light";

export const THEME_KEY = "nq-theme";

/** Anything that is not "light" is dark, so a missing or damaged value falls back to the default. */
export function parseTheme(value: unknown): Theme {
  return value === "light" ? "light" : "dark";
}

export const otherTheme = (t: Theme): Theme => (t === "dark" ? "light" : "dark");

export function loadTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "dark";
  }
}

/** Sets the theme on the page. Storing it is allowed to fail. */
export function applyTheme(t: Theme, remember = true): void {
  document.documentElement.dataset.theme = t;
  if (!remember) return;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* kept for this visit only */
  }
}
