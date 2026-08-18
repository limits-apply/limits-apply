import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    ssr: "src/bin.ts",
    outDir: "dist",
    rollupOptions: { output: { entryFileNames: "limitsapply.mjs" } },
  },
  ssr: { noExternal: true },
  resolve: {
    alias: { "@limits-apply/intelligence": fileURLToPath(new URL("../intelligence/index.ts", import.meta.url)) },
  },
});
