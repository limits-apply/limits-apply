import { relative } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { CLAIMS, type ClaimKey } from "./src/claims";
import { renderSiteHeader } from "./src/site-header";

const PLACEHOLDER = "<!-- site-header -->";
const CLAIM = /<!--\s*claim:([\w.-]+)\s*-->/g;

/**
 * Swap every page's `<!-- site-header -->` for the one header in src/site-header.ts.
 * It runs before the HTML is parsed, on the dev server and in the build alike, so
 * the static output still carries the nav — no runtime injection, no flash.
 */
function siteHeader(): Plugin {
  return {
    name: "site-header",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (!html.includes(PLACEHOLDER)) {
          throw new Error(`${ctx.filename} has no ${PLACEHOLDER} placeholder`);
        }
        return html.replace(PLACEHOLDER, renderSiteHeader(relative(process.cwd(), ctx.filename)));
      },
    },
  };
}

/** Inline the data-backed sentences. A missing key is a build failure, not a stale page. */
function siteClaims(): Plugin {
  return {
    name: "site-claims",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        return html.replace(CLAIM, (_, key: ClaimKey) => {
          const claim = CLAIMS[key];
          if (!claim) throw new Error(`${ctx.filename}: unknown claim "${key}"`);
          return claim();
        });
      },
    },
  };
}

// Relative asset URLs so the build works from a repo subpath (GitHub Pages
// project sites) without knowing the base at build time.
export default defineConfig({
  base: "./",
  plugins: [siteHeader(), siteClaims()],
  build: {
    // One HTML file per page, resolved against root — nested docs entries keep their real URLs.
    rollupOptions: { input: {
      main: "index.html", breakEven: "break-even.html", local: "local.html", gate: "gate.html",
      observatory: "observatory.html",
      research: "research.html", free: "free.html", coding: "coding.html", compare: "compare.html", strategies: "strategies.html",
      docs: "docs/index.html", docsCli: "docs/cli.html", docsVerdict: "docs/verdict.html",
      docsHarnesses: "docs/harnesses.html",
    } },
  },
});
