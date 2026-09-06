import { defineConfig } from "vite";

// Relative asset URLs so the build works from a repo subpath (GitHub Pages
// project sites) without knowing the base at build time.
export default defineConfig({
  base: "./",
  build: {
    // One HTML file per page, resolved against root — nested docs entries keep their real URLs.
    rollupOptions: { input: {
      main: "index.html", breakEven: "break-even.html", local: "local.html", gate: "gate.html",
      docs: "docs/index.html", docsCli: "docs/cli.html", docsVerdict: "docs/verdict.html",
      docsHarnesses: "docs/harnesses.html",
    } },
  },
});
