import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { validateEvidenceSnapshot } from "../packages/intelligence/src/index";
import { validateConfig } from "../packages/gate/src/activation";
import { COMMANDS, EXIT } from "../packages/gate/src/commands";
import { main, type GateIO } from "../packages/gate/src/main";
import { defaultGateRoot, gatePaths } from "../packages/gate/src/storage";
import exampleEvidence from "../packages/gate/fixtures/example-evidence.json";

const failingFetch: GateIO["fetch"] = async () => {
  throw new Error("network access is not available in tests");
};

function io(overrides: Partial<GateIO> = {}): GateIO & { stdoutLines: string[]; stderrLines: string[] } {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  return {
    env: {},
    home: "/nonexistent-home",
    stdout: line => stdoutLines.push(line),
    stderr: line => stderrLines.push(line),
    fetch: failingFetch,
    stdoutLines,
    stderrLines,
    ...overrides,
  };
}

async function withRoot<T>(run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "limits-apply-gate-cli-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("defaultGateRoot prefers LIMITSAPPLY_HOME, then XDG_CONFIG_HOME, then the home directory", () => {
  expect(defaultGateRoot({ LIMITSAPPLY_HOME: "/a", XDG_CONFIG_HOME: "/b" }, "/c")).toBe("/a");
  expect(defaultGateRoot({ XDG_CONFIG_HOME: "/b" }, "/c")).toBe(join("/b", "limitsapply"));
  expect(defaultGateRoot({}, "/c")).toBe(join("/c", ".config", "limitsapply"));
});

test("init writes the default profile", async () => {
  await withRoot(async root => {
    const code = await main(["init", "--root", root], io());
    expect(code).toBe(EXIT.ok);
    const profile = JSON.parse(await readFile(gatePaths(root).profile, "utf8"));
    expect(profile).toEqual({ version: 1, region: "global", credentialNames: [] });
  });
});

test("update --example --no-opencode writes all four files, validates clean, and audits an activation", async () => {
  await withRoot(async root => {
    const code = await main(["update", "--root", root, "--example", "--no-opencode"], io());
    expect(code).toBe(EXIT.ok);

    const paths = gatePaths(root);
    const profile = JSON.parse(await readFile(paths.profile, "utf8"));
    expect(profile).toEqual({ version: 1, region: "global", credentialNames: [] });

    const verdictSnapshot = JSON.parse(await readFile(paths.verdict, "utf8"));
    expect(verdictSnapshot.kind).toBe("verdict");

    const runtime = JSON.parse(await readFile(paths.runtime, "utf8"));
    expect(validateConfig(runtime)).toEqual([]);

    const auditLines = (await readFile(paths.audit, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(auditLines.at(-1).event).toBe("activate");
  });
});

test("running update --example --no-opencode twice appends noop and leaves the runtime byte-identical", async () => {
  await withRoot(async root => {
    const paths = gatePaths(root);
    const first = await main(["update", "--root", root, "--example", "--no-opencode"], io());
    expect(first).toBe(EXIT.ok);
    const runtimeAfterFirst = await readFile(paths.runtime, "utf8");

    const second = await main(["update", "--root", root, "--example", "--no-opencode"], io());
    expect(second).toBe(EXIT.ok);
    const runtimeAfterSecond = await readFile(paths.runtime, "utf8");
    expect(runtimeAfterSecond).toBe(runtimeAfterFirst);

    const auditLines = (await readFile(paths.audit, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(auditLines.at(-1).event).toBe("noop");
  });
});

test("an OpenCode file with unrelated keys survives the merge", async () => {
  await withRoot(async root => {
    const opencodePath = join(root, "opencode.json");
    await writeFile(opencodePath, JSON.stringify({ mcp: { keep: "me" } }, null, 2), "utf8");

    const code = await main(["update", "--root", root, "--example", "--opencode", opencodePath], io());
    expect(code).toBe(EXIT.ok);

    const written = JSON.parse(await readFile(opencodePath, "utf8"));
    expect(written.mcp).toEqual({ keep: "me" });
    expect(written.provider.LIMITSAPPLY).toBeDefined();
  });
});

test("an OpenCode file with a comment aborts the update, exits 1, and is left untouched", async () => {
  await withRoot(async root => {
    const opencodePath = join(root, "opencode.json");
    const original = "{\n  // a comment\n  \"mcp\": { \"keep\": \"me\" }\n}\n";
    await writeFile(opencodePath, original, "utf8");

    const captured = io();
    const code = await main(["update", "--root", root, "--example", "--opencode", opencodePath], captured);
    expect(code).toBe(EXIT.failed);

    expect(await readFile(opencodePath, "utf8")).toBe(original);
    const paths = gatePaths(root);
    await expect(readFile(paths.verdict, "utf8")).rejects.toThrow();
  });
});

test("update with no verdict source exits 2", async () => {
  await withRoot(async root => {
    const captured = io();
    const code = await main(["update", "--root", root], captured);
    expect(code).toBe(EXIT.usage);
  });
});

test("an unknown command exits 2 with every command name on stderr", async () => {
  const captured = io();
  const code = await main(["doctor"], captured);
  expect(code).toBe(EXIT.usage);
  const stderr = captured.stderrLines.join("");
  for (const command of COMMANDS) expect(stderr).toContain(command.name);
});

test("the bundled example evidence fixture is valid", () => {
  expect(validateEvidenceSnapshot(exampleEvidence as Parameters<typeof validateEvidenceSnapshot>[0])).toEqual([]);
});

test("status on an empty root exits 0 without crashing", async () => {
  await withRoot(async root => {
    const captured = io();
    const code = await main(["status", "--root", root], captured);
    expect(code).toBe(EXIT.ok);
    expect(captured.stdoutLines.join("")).toContain("No verdict is active");
  });
});

test("status --smoke reports failure and exits smoke when the proxy is unreachable", async () => {
  await withRoot(async root => {
    const context = io();
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], context)).toBe(EXIT.ok);
    const code = await main(["status", "--root", root, "--smoke"], context);
    expect(code).toBe(EXIT.smoke);
    expect(context.stdoutLines.join("")).toContain("smoke build: fail");
  });
});

test("update --no-opencode reports nothing about opencode", async () => {
  await withRoot(async root => {
    const context = io();
    expect(await main(["update", "--root", root, "--example", "--no-opencode"], context)).toBe(EXIT.ok);
    expect(context.stdoutLines.join("")).not.toContain("opencode");
  });
});
