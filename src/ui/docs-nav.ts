/**
 * Which section of a docs page the reader is in, marked on the left rail. The rail's
 * page link carries `aria-current="page"`; the section resolves to
 * `aria-current="location"`, so one selector styles both.
 */

/** Index of the last section whose top has crossed `edge` — the one being read. */
export function activeSection(tops: number[], edge: number): number {
  let active = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i] <= edge) active = i;
  return active;
}

export function mountSectionSpy(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.docs-nav ul ul a[href^="#"]')];
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));
  if (!links.length || sections.some(section => !section)) return;

  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar"));
  let queued = false;
  const sync = () => {
    queued = false;
    const current = activeSection(sections.map(s => s!.getBoundingClientRect().top), bar + 24);
    links.forEach((link, i) => {
      if (i === current) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }, { passive: true });
  sync();
}
