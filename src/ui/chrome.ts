/**
 * Header behaviour every page shares. The markup itself is injected at build time
 * from src/site-header.ts; this is the scripted half — the theme switch and the
 * More menu — so a page mounts one thing instead of remembering two.
 */
import { mountNavMenu } from "./nav";
import { mountThemeToggle } from "./theme";

export function mountChrome(): void {
  mountThemeToggle("theme");
  mountNavMenu();
}
