export const CLI_NAME = "limitsapply";

export const EXIT = { ok: 0, failed: 1, usage: 2, smoke: 3 } as const;

export interface FlagSpec {
  name: string;
  hasValue: boolean;
  description: string;
}

export interface CommandSpec {
  name: string;
  summary: string;
  flags: FlagSpec[];
}

const ROOT_FLAG: FlagSpec = {
  name: "root",
  hasValue: true,
  description: "Gate root directory (default: LIMITSAPPLY_HOME, then $XDG_CONFIG_HOME/limitsapply, then ~/.config/limitsapply).",
};

export const COMMANDS: CommandSpec[] = [
  {
    name: "init",
    summary: "Write the default local profile if none exists yet.",
    flags: [ROOT_FLAG],
  },
  {
    name: "update",
    summary: "Activate a verdict: write the LiteLLM config and point OpenCode at it.",
    flags: [
      ROOT_FLAG,
      { name: "verdict", hasValue: true, description: "Path or URL to a verdict snapshot." },
      { name: "evidence", hasValue: true, description: "Path or URL to an evidence snapshot, ranked locally against the global workload." },
      { name: "example", hasValue: false, description: "Rank the bundled example evidence fixture instead of a real source." },
      { name: "opencode", hasValue: true, description: "OpenCode config path (default: OPENCODE_CONFIG, then $XDG_CONFIG_HOME/opencode/opencode.json)." },
      { name: "no-opencode", hasValue: false, description: "Skip writing an OpenCode config." },
    ],
  },
  {
    name: "status",
    summary: "Print the verdict currently active in this root.",
    flags: [
      ROOT_FLAG,
      { name: "smoke", hasValue: false, description: "Also ping the build and plan aliases through the LiteLLM proxy." },
      { name: "proxy", hasValue: true, description: "LiteLLM proxy base URL for --smoke (default: http://127.0.0.1:4000)." },
    ],
  },
];

export function formatHelp(): string {
  const lines = [`${CLI_NAME} — local activation for Limits Apply verdicts`, ""];
  for (const command of COMMANDS) {
    lines.push(`  ${CLI_NAME} ${command.name}`);
    lines.push(`    ${command.summary}`);
    for (const flag of command.flags) {
      lines.push(`    --${flag.name}${flag.hasValue ? " <value>" : ""}  ${flag.description}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
