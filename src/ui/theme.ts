/**
 * The theme switch. The palette itself lives in `styles/parts/tokens.css` behind
 * `light-dark()`, so all this has to move is `color-scheme` — via a `data-theme`
 * attribute whose absence means "whatever the OS asked for". The stored choice is
 * re-applied by an inline script in each page's <head>, before first paint.
 */
import { el } from "./dom";

const root = document.documentElement;

const isDark = () => root.dataset.theme
  ? root.dataset.theme === "dark"
  : matchMedia("(prefers-color-scheme: dark)").matches;

export function mountThemeToggle(id: string): void {
  const btn = el(id);
  const sync = () => {
    const dark = isDark();
    btn.setAttribute("aria-pressed", String(dark));
    btn.setAttribute("aria-label", dark ? "Switch to the light theme" : "Switch to the dark theme");
  };
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
    sync();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sync);
  sync();
}
