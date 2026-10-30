/**
 * The header's More menu. `<details>` already gives open/close, keyboard and
 * no-JS operation; this adds only the two habits it lacks — closing on an
 * outside click or Escape, and on a same-page anchor that doesn't navigate.
 */
export function mountNavMenu(): void {
  const more = document.querySelector<HTMLDetailsElement>("details.nav-more");
  if (!more) return;

  const summary = more.querySelector("summary");
  const close = (restoreFocus: boolean) => {
    if (!more.open) return;
    more.open = false;
    if (restoreFocus) summary?.focus();
  };

  document.addEventListener("click", event => {
    if (more.open && event.target instanceof Node && !more.contains(event.target)) close(false);
  });
  more.addEventListener("keydown", event => {
    if (event.key === "Escape") close(true);
  });
  more.querySelectorAll("a").forEach(link => link.addEventListener("click", () => close(false)));
}
