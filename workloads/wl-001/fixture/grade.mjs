import assert from "node:assert/strict";
import { slugify } from "./slugify.mjs";

assert.equal(slugify("Hello, World!"), "hello-world");
assert.equal(slugify("Été à Paris"), "ete-a-paris");
assert.equal(slugify("  --already-slugged--  "), "already-slugged");
assert.equal(slugify("Ævar's 2¢"), "aevar-s-2c");
console.log("wl-001: pass");
