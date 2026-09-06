import { type ConfigChange, recorder } from "./harness";
import { DEFAULT_PROXY } from "./smoke";

/**
 * Claude Code speaks the Anthropic shape, so it points at the proxy root rather than the `/v1`
 * OpenAI surface the other harnesses use. `ANTHROPIC_AUTH_TOKEN` holds the value of
 * `LITELLM_MASTER_KEY`, the way pi's `apiKey` does, and the context ceiling is the same floor:
 * this file doesn't know which model the verdict put behind an alias.
 */
function limitsApplyEnv(proxy: string): Record<string, string> {
  return {
    ANTHROPIC_BASE_URL: proxy,
    ANTHROPIC_AUTH_TOKEN: "local",
    ANTHROPIC_MODEL: "build",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "plan",
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: "32768",
  };
}

export function mergeClaudeCodeConfig(
  config: Record<string, unknown>,
  proxy = DEFAULT_PROXY,
): { config: Record<string, unknown>; changes: ConfigChange[] } {
  const changes: ConfigChange[] = [];
  const record = recorder(changes);

  const env = { ...((config.env as Record<string, unknown> | undefined) ?? {}) };
  for (const [key, value] of Object.entries(limitsApplyEnv(proxy))) {
    record(`env.${key}`, env[key], value);
    env[key] = value;
  }

  return { config: { ...config, env }, changes };
}
