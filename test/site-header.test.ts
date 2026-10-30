/**
 * The site header is one template now (src/site-header.ts), injected into every
 * page by the Vite plugin. These checks pin the two things that used to rot when
 * it was twelve hand-copied navs: Home on every page, and a page's own mark.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

import { pageBase, pageId, renderSiteHeader } from "../src/site-header";

const ROOT = join(__dirname, "..");

/** Every page the build turns into HTML, root-relative. */
const PAGES = [
  "index.html", "free.html", "coding.html", "compare.html", "strategies.html",
  "break-even.html", "local.html", "gate.html", "observatory.html",
  "docs/index.html", "docs/cli.html", "docs/verdict.html", "docs/harnesses.html",
];

test("every page carries exactly one site-header placeholder", () => {
  for (const page of PAGES) {
    const html = readFileSync(join(ROOT, page), "utf8");
    expect(html.match(/<!-- site-header -->/g)?.length ?? 0, page).toBe(1);
    expect(html, `${page} still hand-copies a nav`).not.toContain('<nav class="nav"');
  }
});

test("the header is injected before the page is parsed, so the built HTML keeps it", () => {
  const config = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
  expect(config).toContain("transformIndexHtml");
  expect(config).toContain("renderSiteHeader");
});

test("Home leads the bar on every page, from that page's own base", () => {
  for (const page of PAGES) {
    const html = renderSiteHeader(page);
    expect(html, page).toContain(`href="${pageBase(page)}index.html"`);
    expect(html, page).toContain(">Home</a>");
  }
});

test("the bar keeps four sections and the theme switch; the rest are in the menu", () => {
  const html = renderSiteHeader("index.html");
  const bar = html.match(/<nav class="nav"[\s\S]*?<details/)?.[0] ?? "";
  for (const label of ["Home", "Free AI", "Coding setups", "Compare"]) {
    expect(bar).toContain(`>${label}</a>`);
  }
  for (const label of ["Strategies", "Break-even", "Local", "Gate", "Observatory", "Docs"]) {
    expect(bar, `${label} belongs behind More`).not.toContain(`>${label}</a>`);
    expect(html).toContain(`>${label}</a>`);
  }
  expect(html).toContain('class="theme" id="theme"');
  expect(html).toContain(">GitHub</a>");
});

test("the page being read is marked on the bar, in the menu, or on the summary", () => {
  const observatory = renderSiteHeader("observatory.html");
  expect(observatory).toContain('<a href="./observatory.html" aria-current="page">Observatory</a>');
  expect(observatory, "a menu page marks its closed summary").toContain('data-current="menu"');
  expect(observatory.indexOf(">Gate</a>")).toBeLessThan(observatory.indexOf(">Observatory</a>"));

  const gate = renderSiteHeader("gate.html");
  expect(gate).toContain('<a href="./gate.html" aria-current="page">Gate</a>');

  const home = renderSiteHeader("index.html");
  expect(home).toContain('<a href="./index.html" aria-current="page">Home</a>');
  expect(home, "a bar page does not mark the summary on wide screens").toContain('data-current="bar"');

  const docs = renderSiteHeader("docs/cli.html");
  expect(docs).toContain('<a href="../docs/index.html" aria-current="page">Docs</a>');
  expect(docs).toContain('<a href="../index.html">Home</a>');
});

test("the menu repeats the bar for narrow screens, where the bar's links fold away", () => {
  for (const page of PAGES) {
    const html = renderSiteHeader(page);
    const menu = html.match(/<div class="nav-menu">[\s\S]*?<\/div>/)?.[0] ?? "";
    const browse = menu.match(/<p class="nav-kicker nav-dupe">Browse<\/p>([\s\S]*?)<p class="nav-kicker">/)?.[1] ?? "";
    for (const label of ["Home", "Free AI", "Coding setups", "Compare"]) {
      expect(browse, `${page} menu is missing ${label}`).toContain(`>${label}</a>`);
    }
  }
});

test("pageId names the section a path sits in, and nothing else", () => {
  expect(pageId("index.html")).toBe("home");
  expect(pageId("gate.html")).toBe("gate");
  expect(pageId("docs/index.html")).toBe("docs");
  expect(pageId("docs/harnesses.html")).toBe("docs");
  expect(pageId("test/fixtures/opencode-go.html")).toBe(null);
});

test("pageBase climbs out of nested folders", () => {
  expect(pageBase("gate.html")).toBe("./");
  expect(pageBase("docs/cli.html")).toBe("../");
});
