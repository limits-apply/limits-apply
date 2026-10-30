/**
 * The site header, written once. Every page carries a `<!-- site-header -->`
 * placeholder and `vite.config.ts` swaps in this markup, so the nav cannot drift
 * page to page — it used to be copy-pasted into twelve files, which is how the
 * docs pages ended up with Free AI twice and how Home went missing on six of them.
 *
 * Four sections stay on the bar; the rest live behind More, grouped by what they
 * are rather than listed flat. Nothing here is fetched or computed at runtime, so
 * the built HTML carries the nav for readers without JavaScript.
 */

export type PageId =
  | "home" | "free" | "coding" | "compare"
  | "research" | "strategies" | "break-even" | "local" | "gate" | "observatory" | "docs";

type Link = { id: PageId; label: string; path: string };
type Group = { label: string; links: Link[]; barOnly?: true };

/** On the bar, left to right. Home leads everywhere. */
const PRIMARY: Link[] = [
  { id: "home", label: "Home", path: "index.html" },
  { id: "free", label: "Free AI", path: "free.html" },
  { id: "coding", label: "Coding setups", path: "coding.html" },
  { id: "compare", label: "Compare", path: "compare.html" },
];

/**
 * Behind More, grouped by the question each answers. Browse repeats the bar on
 * purpose: below 640px the bar keeps only More, and these become the whole nav.
 */
const MENU: Group[] = [
  { label: "Browse", links: PRIMARY, barOnly: true },
  {
    label: "Tools",
    links: [
      { id: "break-even", label: "Break-even", path: "research.html#break-even" },
      { id: "local", label: "Local", path: "local.html" },
      { id: "strategies", label: "Strategies", path: "strategies.html" },
    ],
  },
  {
    label: "Reference",
    links: [
      { id: "research", label: "Methodology", path: "research.html" },
      { id: "docs", label: "Docs", path: "docs/index.html" },
      { id: "gate", label: "Gate", path: "gate.html" },
      { id: "observatory", label: "Observatory", path: "observatory.html" },
    ],
  },
];

const GITHUB = "https://github.com/limits-apply/limits-apply";

const ids = new Set<PageId>([...PRIMARY, ...MENU.flatMap(g => g.links)].map(link => link.id));

/** `"docs/cli.html"` → `"docs"`; `"gate.html"` → `"gate"`; `"index.html"` → `"home"`. */
export function pageId(relPath: string): PageId | null {
  if (relPath.startsWith("docs/")) return "docs";
  const name = (relPath.split("/").pop() ?? "").replace(/\.html$/, "");
  const id = (name === "index" ? "home" : name) as PageId;
  return ids.has(id) ? id : null;
}

/** Paths are relative, so a nested page has to climb back out to the site root. */
export function pageBase(relPath: string): string {
  const depth = relPath.split("/").length - 1;
  return "../".repeat(depth) || "./";
}

/** Markup for `<head>`-free injection: brand, nav, theme switch. */
export function renderSiteHeader(relPath: string): string {
  const base = pageBase(relPath);
  const current = pageId(relPath);

  const link = (item: Link, href: string) =>
    `      <a href="${href}"${item.id === current ? ' aria-current="page"' : ""}>${item.label}</a>`;

  const bar = PRIMARY.map(item => link(item, base + item.path)).join("\n");

  const menu = MENU.map(group => {
    const dupe = group.barOnly ? " nav-dupe" : "";
    return [
      `          <p class="nav-kicker${dupe}">${group.label}</p>`,
      ...group.links.map(item => `          <a${dupe ? ' class="nav-dupe"' : ""} href="${base + item.path}"${item.id === current ? ' aria-current="page"' : ""}>${item.label}</a>`),
    ].join("\n");
  }).join("\n");

  // A page on the bar marks its link; a page inside More marks the summary too.
  // Bar pages only need the summary marker on narrow screens, where the bar's
  // own links are folded away — CSS decides that, the attribute just says which.
  const inBar = PRIMARY.some(item => item.id === current);
  const inMenu = MENU.some(group => !group.barOnly && group.links.some(item => item.id === current));
  const summaryState = inMenu
    ? ' data-current="menu" aria-current="true"'
    : inBar ? ' data-current="bar"' : "";

  return `<header>
  <div class="hbar">
    <a class="brand" href="${base}index.html"><span class="track" aria-hidden="true"></span><span class="base">limitsapply</span><span class="over" aria-hidden="true">limitsapply</span><i aria-hidden="true"></i></a>
    <nav class="nav" aria-label="Sections">
${bar}
      <details class="nav-more"${summaryState}>
        <summary aria-haspopup="true">More<svg class="chev" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M2 3.6 5 7l3-3.4"/></svg></summary>
        <div class="nav-menu">
${menu}
          <p class="nav-kicker">Source</p>
          <a class="nav-ext" href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
        </div>
      </details>
    </nav>
    <button class="theme" id="theme" type="button" aria-pressed="false"
            aria-label="Switch to the dark theme">
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path d="M16.4 12.7A7.1 7.1 0 0 1 7.3 3.6a7.1 7.1 0 1 0 9.1 9.1Z"/>
      </svg>
    </button>
  </div>
</header>`;
}
