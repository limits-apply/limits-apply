import { join } from "node:path";
import { mergeClaudeCodeConfig } from "./claude-code";
import type { HarnessMerge } from "./harness";
import { mergeOpencodeConfig } from "./opencode";
import { mergePiConfig } from "./pi";

export interface HarnessWriter {
  id: string;
  merge: HarnessMerge;
  /**
   * Where `update` writes when nothing on the command line says otherwise. Only OpenCode has one:
   * every other harness is written when `--<id>` names its file and never otherwise, so Gate can't
   * reconfigure a tool nobody pointed it at.
   */
  defaultPath?: (env: Record<string, string | undefined>, home: string) => string;
}

/**
 * Only harnesses whose config file Gate can parse and write back. Codex is deliberately absent:
 * its config.toml would need a TOML parser to merge into, so `codexConfigBlock` generates the
 * block and the reader pastes it.
 */
export const HARNESS_WRITERS: HarnessWriter[] = [
  {
    id: "opencode",
    merge: mergeOpencodeConfig,
    defaultPath: (env, home) =>
      env.OPENCODE_CONFIG ?? join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "opencode", "opencode.json"),
  },
  { id: "pi", merge: mergePiConfig },
  { id: "claude-code", merge: mergeClaudeCodeConfig },
];
