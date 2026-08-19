/**
 * Publishes nothing. Packs `packages/gate` exactly as npm would, installs the tarball into a
 * throwaway prefix and drives the CLI through it — so a missing `files` entry, a `workspace:*`
 * that survived into `dependencies`, or a lost shebang fails here instead of on the registry.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = fileURLToPath(new URL("../packages/gate", import.meta.url));
const work = mkdtempSync(join(tmpdir(), "limitsapply-pack-"));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: "pipe" });

try {
  const packed = run("pnpm", ["pack", "--pack-destination", work], GATE).trim().split("\n").pop();

  const app = join(work, "app");
  run("npm", ["install", "--prefix", app, "--no-audit", "--no-fund", "--install-strategy=shallow", packed], work);

  const listed = dir => readdirSync(dir).filter(name => !name.startsWith("."));
  const scopes = listed(join(app, "node_modules"));
  const installed = scopes.flatMap(scope =>
    scope.startsWith("@") ? listed(join(app, "node_modules", scope)).map(name => `${scope}/${name}`) : [scope],
  );
  if (installed.join() !== "@limits-apply/cli") {
    throw new Error(`tarball pulled in more than itself: ${installed.join(", ")}`);
  }

  const cli = join(app, "node_modules", ".bin", "limitsapply");
  const root = join(work, "root");
  run(cli, ["init", "--root", root], work);
  run(cli, ["update", "--example", "--root", root, "--no-opencode"], work);
  const status = run(cli, ["status", "--root", root], work);
  if (!status.includes("build:") || !status.includes("plan:")) {
    throw new Error(`status did not report a verdict:\n${status}`);
  }

  console.log(`pack test ok — ${packed.split("/").pop()}, no transitive dependencies`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
