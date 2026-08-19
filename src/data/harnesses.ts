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
  lang?: "json" | "toml";
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

/**
 * Hand-written, not generated: `recipe` means a human ran it, so there is no function to derive it from
 * and no test that can keep it honest. Verified on the date the pi row carries, against a LiteLLM proxy
 * exposing the contract `generateLiteLlmConfig` emits — `build` and `plan` on 127.0.0.1:4000 — rather
 * than against a Gate-generated one, which is the pi side of the wiring and all this row claims.
 * `apiKey` holds the value of `LITELLM_MASTER_KEY`, not a second secret.
 *
 * `contextWindow` and `maxTokens` are a deliberate floor. The recipe is blind to which model the verdict
 * put behind an alias, the same way `mergeOpencodeConfig` is, so it claims only what any of them holds.
 */
const PI_MODEL = (id: string, name: string) => ({
  id, name, reasoning: true, input: ["text"],
  contextWindow: 32768, maxTokens: 8192,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});

const PI_SNIPPET = JSON.stringify({
  providers: {
    LIMITSAPPLY: {
      baseUrl: "http://127.0.0.1:4000/v1",
      api: "openai-completions",
      apiKey: "local",
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      models: [PI_MODEL("build", "Limits Apply build"), PI_MODEL("plan", "Limits Apply plan")],
    },
  },
}, null, 2);

/**
 * The same afternoon as the pi row, against the same proxy, and with the same blindness to which
 * model sits behind an alias. Both were run with `build` and `plan` live: `build` answered in each
 * harness, `plan` answered in neither — the model the verdict had put behind it that day is served
 * only in the chat-completions shape, so LiteLLM refuses it the Responses and Anthropic endpoints
 * these two harnesses speak. That is a proxy-side limit on the day, not a defect in either config.
 *
 * `env_key` names the variable; `ANTHROPIC_AUTH_TOKEN` holds its value, the way pi's `apiKey` does.
 * Codex 0.147 no longer accepts `wire_api = "chat"`, so the proxy's `/v1/responses` is the only
 * surface left to it.
 */
const CODEX_SNIPPET = `model = "build"
model_provider = "limitsapply"
model_context_window = 32768
model_max_output_tokens = 8192

[model_providers.limitsapply]
name = "Limits Apply"
base_url = "http://127.0.0.1:4000/v1"
env_key = "LITELLM_MASTER_KEY"
wire_api = "responses"`;

const CLAUDE_CODE_SNIPPET = JSON.stringify({
  env: {
    ANTHROPIC_BASE_URL: "http://127.0.0.1:4000",
    ANTHROPIC_AUTH_TOKEN: "local",
    ANTHROPIC_MODEL: "build",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "plan",
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: "32768",
  },
}, null, 2);


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
    status: "recipe",
    summary: "A terminal coding agent whose provider layer already speaks OpenAI-compatible, so pointing it at the proxy is a config merge and nothing more. This block was pasted into a real models.json and both aliases answered against a proxy serving the same contract Gate emits. Gate does not write it, nothing regenerates it, and it will drift the day pi's provider schema moves.",
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
    status: "recipe",
    icon: "claude",
    summary: "Anthropic's own CLI, pointed at the proxy's Anthropic-shaped /v1/messages endpoint through the env block of its settings file. This block was pasted into a real settings.json and build answered; plan did not, because that day's plan model is served only in the chat-completions shape. Gate does not write it and nothing catches it drifting.",
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
    summary: "OpenAI's CLI. Codex 0.147 dropped wire_api = \"chat\", so this points it at the proxy's Responses endpoint instead. This block was pasted into a real config.toml and build answered; plan did not, because that day's plan model is served only in the chat-completions shape. Gate does not write it and nothing catches it drifting.",
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
