/**
 * Resolves the exact snapshot file an `import snapshot from "..."` line in a
 * `src/data/*.ts` file points at — not just the newest dated file on disk. A
 * human bumps that import by hand when adopting a new snapshot, so it is the
 * only reliable answer to "what is the site actually showing right now": the
 * newest file on disk can be a `pnpm refresh` output nobody has adopted yet.
 */
import { readFileSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function importedSnapshotPath(tsFile) {
  const src = readFileSync(join(ROOT, tsFile), "utf8");
  // The specifier reaches up out of `src/` now that snapshots live in `data/`, so the
  // pattern has to admit `../` — anchored on `./` it matched nothing and every step
  // silently fell back to whatever was newest on disk.
  const m = src.match(/import snapshot from "(\.{1,2}\/[^"]+)"/);
  if (!m) throw new Error(`${tsFile}: no snapshot import found`);
  return { file: basename(m[1]), path: join(ROOT, dirname(tsFile), m[1]) };
}

export function importedSnapshot(tsFile) {
  const { file, path } = importedSnapshotPath(tsFile);
  return { file, snapshot: JSON.parse(readFileSync(path, "utf8")) };
}
