/**
 * Builds `public/current.json` from the snapshots `src/data/aa.ts` and
 * `src/data/agents.ts` actually import.
 *
 * Resolving the paths through the same import lines the app uses means a
 * stale `--aa` can never validate against a snapshot the app no longer reads.
 *
 *   node scripts/evidence.mjs [extra gate args...]
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, importedSnapshotPath } from "./resolve-import.mjs";

const GATE = join(ROOT, "packages/gate/dist/limitsapply.mjs");

const args = [
  "evidence",
  "--candidates", join(ROOT, "src/data/candidates.json"),
  "--aa", importedSnapshotPath("src/data/aa.ts").path,
  "--agents", importedSnapshotPath("src/data/agents.ts").path,
  "--agent-pairs", join(ROOT, "src/data/agent-pairs.json"),
  "--out", join(ROOT, "public/current.json"),
  ...process.argv.slice(2),
];

const run = spawnSync(process.execPath, [GATE, ...args], { stdio: "inherit" });
process.exit(run.status ?? 1);
