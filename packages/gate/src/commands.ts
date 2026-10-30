import { HARNESS_WRITERS } from "./writers";

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

/** How each writer is named in prose, and — where it has one — where it writes by default. */
const HARNESS_HELP: Record<string, { name: string; default?: string }> = {
  opencode: { name: "OpenCode", default: "OPENCODE_CONFIG, then $XDG_CONFIG_HOME/opencode/opencode.json" },
  pi: { name: "pi" },
  "claude-code": { name: "Claude Code" },
};

const HARNESS_FLAGS: FlagSpec[] = HARNESS_WRITERS.flatMap(writer => {
  const help = HARNESS_HELP[writer.id] ?? { name: writer.id };
  // `help.default`, not `writer.defaultPath`: a writer that gained a default without a line here
  // would otherwise render "(default: undefined)" into --help and onto the CLI reference.
  const path: FlagSpec = {
    name: writer.id,
    hasValue: true,
    description: help.default
      ? `${help.name} config path (default: ${help.default}).`
      : `Write a ${help.name} config at this path. Nothing is written without it — ${help.name} is never configured unless you name the file.`,
  };
  return help.default
    ? [path, { name: `no-${writer.id}`, hasValue: false, description: `Skip writing the ${help.name} config.` }]
    : [path];
});

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
      ...HARNESS_FLAGS,
      { name: "smoke", hasValue: false, description: "Ping the aliases through the proxy after writing, and restore the previous configuration if they don't answer." },
      { name: "proxy", hasValue: true, description: "LiteLLM proxy base URL for --smoke (default: http://127.0.0.1:4000)." },
    ],
  },
  {
    name: "status",
    summary: "Print the verdict currently active in this root.",
    flags: [
      ROOT_FLAG,
      { name: "smoke", hasValue: false, description: "Also ping every routed alias through the LiteLLM proxy." },
      { name: "proxy", hasValue: true, description: "LiteLLM proxy base URL for --smoke (default: http://127.0.0.1:4000)." },
    ],
  },
  {
    name: "quota",
    summary: "List access paths recorded as exhausted, record one (quota exhausted <domain> --resets <iso>), read them out of OpenCode's own message records (quota scan <path>), or pull them from the Claude subscription's own usage windows (quota pull --domain <domain>).",
    flags: [
      ROOT_FLAG,
      { name: "resets", hasValue: true, description: "ISO timestamp the window is said to reopen at." },
      { name: "domain", hasValue: true, description: "Failure domain to record a pulled window against." },
      { name: "credentials", hasValue: true, description: "Claude CLI credentials path for quota pull (default: ~/.claude/.credentials.json)." },
    ],
  },
  {
    name: "advise",
    summary: "Price the last N days from what is already on this machine — OpenCode's own per-message costs and the Claude subscription's usage windows. Reads only; activates and writes nothing.",
    flags: [
      { name: "opencode", hasValue: true, description: "OpenCode message storage directory (default: $XDG_DATA_HOME/opencode/storage/message, then ~/.local/share/opencode/storage/message)." },
      { name: "credentials", hasValue: true, description: "Claude CLI credentials path for the usage windows (default: ~/.claude/.credentials.json)." },
      { name: "days", hasValue: true, description: "Window to summarize, in days (default: 30)." },
      { name: "price", hasValue: true, description: "Your plan's monthly price in USD — adds the break-even line against the metered-equivalent spend." },
      { name: "export", hasValue: false, description: "Print a pre-filled measurement submission instead of the summary, ready for the GitHub issue form." },
    ],
  },
  {
    name: "measure",
    summary: "Wrap one graded run: record the Claude usage windows before and after, execute the command after --, and append one run record to a JSONL evidence log. The run's failure is data, not a CLI failure.",
    flags: [
      { name: "workload", hasValue: true, description: "Versioned workload id the run executes (e.g. wl-001@v1)." },
      { name: "access", hasValue: true, description: "Exact access path measured — the plan's name, or e.g. \"Anthropic API (metered)\"." },
      { name: "config", hasValue: true, description: "Model and harness the run used (e.g. \"claude-opus-5 · Claude Code 2.1.x\")." },
      { name: "outcome", hasValue: true, description: "Manual override: pass, partial or fail. Without it the graded command's exit code decides — 0 is pass, anything else fail; partial is manual-only." },
      { name: "credentials", hasValue: true, description: "Claude CLI credentials path for the usage windows (default: ~/.claude/.credentials.json). A missing file is a note and empty windows, not a failure." },
      { name: "sessions", hasValue: true, description: "Codex rollout directory for the run's observed tokens (default: $CODEX_HOME/sessions, then ~/.codex/sessions)." },
      { name: "projects", hasValue: true, description: "Claude Code transcript directory for the run's observed tokens (default: ~/.claude/projects)." },
      { name: "out", hasValue: true, description: "JSONL file the run record is appended to (default: measurements.jsonl in the working directory)." },
    ],
  },
  {
    name: "observe",
    summary: "Collect quota observations from the harness's own logs: `observe codex` reads Codex rollout files, `observe claude` reads Claude Code transcripts against two quota readings, `observe report` summarizes the store, and `observe export` prints a reviewable bundle. Writes nothing you did not ask it to.",
    flags: [
      { name: "sessions", hasValue: true, description: "Codex rollout directory (default: $CODEX_HOME/sessions, then ~/.codex/sessions)." },
      { name: "projects", hasValue: true, description: "Claude Code transcript directory (default: ~/.claude/projects)." },
      { name: "store", hasValue: true, description: "Observation store directory (default: data/observations in the working directory)." },
      { name: "root", hasValue: true, description: "Gate root holding the reporter token (default: LIMITSAPPLY_HOME, then $XDG_CONFIG_HOME/limitsapply, then ~/.config/limitsapply)." },
      { name: "reporter", hasValue: true, description: "Explicit opaque reporter id — keeps CI runs deterministic." },
      { name: "since", hasValue: true, description: "Only collect observations at or after this ISO timestamp." },
      { name: "isolated", hasValue: false, description: "Assert that no other session consumed quota inside the collected intervals." },
      { name: "region", hasValue: true, description: "ISO-3166 alpha-2 region the sessions ran in." },
      { name: "workload", hasValue: true, description: "Versioned workload id the sessions executed (e.g. wl-001@v1)." },
      { name: "window", hasValue: true, description: "Quota window to record against for claude: 5h or weekly (default: weekly)." },
      { name: "plan", hasValue: true, description: "Subscription id for claude collection (e.g. anthropic.claude-max-5x)." },
      { name: "before", hasValue: true, description: "Quota percentage read before the collected range." },
      { name: "after", hasValue: true, description: "Quota percentage read after the collected range; --pull fills it from the official usage endpoint." },
      { name: "until", hasValue: true, description: "ISO timestamp the collected range ends at (default: now)." },
      { name: "pull", hasValue: false, description: "Read the current usage windows from the Claude subscription's official endpoint instead of --after." },
      { name: "credentials", hasValue: true, description: "Claude CLI credentials path for --pull (default: ~/.claude/.credentials.json)." },
      { name: "runs", hasValue: true, description: "Workload runs the collected range executed — recorded beside the interval." },
      { name: "successful-runs", hasValue: true, description: "Of those, how many passed the grader. Cannot exceed --runs." },
      { name: "sanitized", hasValue: false, description: "Print the export bundle with region and evidenceRef stripped to the minimum a review needs." },
    ],
  },
  {
    name: "evidence",
    summary: "Build an evidence snapshot from a candidate catalog and an Artificial Analysis snapshot.",
    flags: [
      { name: "candidates", hasValue: true, description: "Path to the hand-verified candidate catalog." },
      { name: "aa", hasValue: true, description: "Path to the committed Artificial Analysis snapshot." },
      { name: "out", hasValue: true, description: "Path the evidence snapshot is written to." },
      { name: "agents", hasValue: true, description: "Path to the committed Artificial Analysis coding-agents snapshot. Needs --agent-pairs alongside it." },
      { name: "agent-pairs", hasValue: true, description: "Path to the hand-verified agent-pair catalog. Needs --agents alongside it." },
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
