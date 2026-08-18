import { mergeOpencodeConfig } from "../../packages/gate/src/opencode";

export type HarnessStatus = "verified" | "recipe" | "planned";

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
}

export const STATUS_DEFS: Record<HarnessStatus, { label: string; description: string }> = {
  verified: {
    label: "Verified",
    description: "Gate writes this configuration itself, and a test compares the published snippet to the code that writes it.",
  },
  recipe: {
    label: "Recipe",
    description: "A configuration a human ran once, on a dated day — not generated, not exercised in CI.",
  },
  planned: {
    label: "Planned",
    description: "No integration code, no verified recipe. The snippet column stays empty.",
  },
};

const OPENCODE_SNIPPET = JSON.stringify(mergeOpencodeConfig({}).config, null, 2);

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
    summary: "The surface every harness below would ultimately use: base URL http://127.0.0.1:4000/v1, an API key read from LITELLM_MASTER_KEY, and a model name of build or plan. Gate exposes this proxy today, but writes it into a client's own config file only for OpenCode.",
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
    status: "planned",
    summary: "A terminal coding agent with a pluggable provider layer that already supports OpenAI-compatible servers through its compat settings.",
    snippet: null,
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
    status: "planned",
    icon: "claude",
    summary: "Anthropic's own CLI. Can be pointed at an OpenAI-compatible endpoint through a proxy, but Gate doesn't write that configuration yet.",
    snippet: null,
  },
  {
    id: "codex",
    name: "Codex CLI",
    site: "https://developers.openai.com/codex/",
    status: "planned",
    icon: "chatgpt",
    summary: "OpenAI's CLI. Supports custom model providers with a base_url in config.toml, but Gate doesn't generate that entry yet.",
    snippet: null,
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
