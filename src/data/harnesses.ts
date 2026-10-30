import { mergeClaudeCodeConfig } from "../../packages/gate/src/claude-code";
import { codexConfigBlock } from "../../packages/gate/src/codex";
import { mergeOpencodeConfig } from "../../packages/gate/src/opencode";
import { mergePiConfig } from "../../packages/gate/src/pi";

type HarnessStatus = "verified" | "recipe" | "planned";

export interface Harness {
  id: string;
  name: string;
  site: string;
  status: HarnessStatus;
  icon?: string;
  summary: string;
  snippet: string | null;
  date?: string;
  configPath?: string;
  lang?: "json" | "toml";
}

export const VERIFIED_DEF = {
  label: "Verified",
  description: "Gate writes this configuration itself, and a test compares the published snippet to the code that writes it.",
};

const OPENCODE_SNIPPET = JSON.stringify(mergeOpencodeConfig({}).config, null, 2);
const PI_SNIPPET = JSON.stringify(mergePiConfig({}).config, null, 2);
const CLAUDE_CODE_SNIPPET = JSON.stringify(mergeClaudeCodeConfig({}).config, null, 2);
const CODEX_SNIPPET = codexConfigBlock();

export const HARNESSES: Harness[] = [
  {
    id: "opencode",
    name: "OpenCode",
    site: "https://opencode.ai/docs/config",
    status: "verified",
    icon: "opencode",
    summary: "Gate writes provider.LIMITSAPPLY, model, mode.build.model and mode.plan.model into your OpenCode config on every update — this snippet is generated from the same function that does it.",
    snippet: OPENCODE_SNIPPET,
    configPath: "$XDG_CONFIG_HOME/opencode/opencode.json (or OPENCODE_CONFIG)",
  },
  {
    id: "openai-compatible",
    name: "OpenAI-compatible client",
    site: "https://docs.litellm.ai/docs/proxy/configs",
    status: "planned",
    summary: "The surface every harness below would ultimately use: base URL http://127.0.0.1:4000/v1, an API key read from LITELLM_MASTER_KEY, and a model name of build or plan. Gate exposes this proxy today. OpenCode is the only client whose config file it writes unprompted; pi and Claude Code are written when a flag names the file.",
    snippet: null,
  },
  {
    id: "t3code",
    name: "T3 Code",
    site: "https://github.com/pingdotgg/t3code",
    status: "planned",
    summary: "An open-source control surface that wraps other harnesses — Claude Code, Codex, OpenCode, Cursor — rather than talking to a model endpoint directly.",
    snippet: null,
  },
  {
    id: "pi",
    name: "Pi",
    site: "https://github.com/earendil-works/pi",
    status: "verified",
    summary: "A terminal coding agent whose provider layer already speaks OpenAI-compatible, so pointing it at the proxy is a config merge and nothing more. Point --pi at your models.json and Gate merges providers.LIMITSAPPLY into it; without that flag pi is left alone. This snippet is generated from the same function that does the merge. Both aliases answered from a real models.json carrying this block on the date below.",
    snippet: PI_SNIPPET,
    date: "2026-08-18",
    configPath: "~/.pi/agent/models.json (or $PI_CONFIG)",
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    site: "https://github.com/NousResearch/hermes-agent",
    status: "planned",
    summary: "An open-source harness that orchestrates other coding agents, including Claude Code and Codex, through its own config.yaml.",
    snippet: null,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    site: "https://claude.com/claude-code",
    status: "verified",
    icon: "claude",
    summary: "Anthropic's own CLI, pointed at the proxy's Anthropic-shaped /v1/messages endpoint through the env block of its settings file. Point --claude-code at your settings.json and Gate merges those five variables in, preserving the rest; without that flag Claude Code is left alone. This snippet is generated from the same function that does the merge. On the date below build answered; plan did not, because that day's plan model is served only in the chat-completions shape.",
    snippet: CLAUDE_CODE_SNIPPET,
    date: "2026-08-18",
    configPath: "~/.claude/settings.json (or $CLAUDE_CONFIG_DIR/settings.json)",
  },
  {
    id: "codex",
    name: "Codex CLI",
    site: "https://developers.openai.com/codex/",
    status: "recipe",
    icon: "chatgpt",
    summary: "OpenAI's CLI. Codex 0.147 dropped wire_api = \"chat\", so this points it at the proxy's Responses endpoint instead. Merging into an existing config.toml would need a TOML parser Gate doesn't carry, so this block is generated from code but pasted by hand. On the date below build answered; plan did not, because that day's plan model is served only in the chat-completions shape.",
    snippet: CODEX_SNIPPET,
    date: "2026-08-18",
    configPath: "~/.codex/config.toml (or $CODEX_HOME/config.toml)",
    lang: "toml",
  },
  {
    id: "cursor",
    name: "Cursor",
    site: "https://cursor.com",
    status: "planned",
    icon: "cursor",
    summary: "Editor with its own custom-model settings for OpenAI-compatible endpoints; Gate doesn't write to Cursor's config yet.",
    snippet: null,
  },
  {
    id: "aider",
    name: "Aider",
    site: "https://aider.chat",
    status: "planned",
    summary: "Terminal pair-programming tool with built-in OpenAI-compatible provider support; unconfigured by Gate today.",
    snippet: null,
  },
  {
    id: "crush",
    name: "Crush",
    site: "https://github.com/charmbracelet/crush",
    status: "planned",
    summary: "Charm's terminal coding agent; its openai-compat provider type is the natural fit, but Gate doesn't write it yet.",
    snippet: null,
  },
  {
    id: "goose",
    name: "Goose",
    site: "https://github.com/block/goose",
    status: "planned",
    summary: "Block's open-source agent; custom OpenAI-compatible providers are configurable by hand today, not yet by Gate.",
    snippet: null,
  },
];
