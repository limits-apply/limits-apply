import { type ConfigChange, recorder } from "./harness";
import { DEFAULT_PROXY } from "./smoke";

/**
 * `contextWindow` and `maxTokens` are a deliberate floor. This file is blind to which model the
 * verdict put behind an alias, the same way `mergeOpencodeConfig` is, so it claims only what any
 * of them holds. `apiKey` holds the value of `LITELLM_MASTER_KEY`, not a second secret.
 */
const model = (id: string, name: string) => ({
  id, name, reasoning: true, input: ["text"],
  contextWindow: 32768, maxTokens: 8192,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});

function limitsApplyProvider(proxy: string) {
  return {
    baseUrl: `${proxy}/v1`,
    api: "openai-completions",
    apiKey: "local",
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    models: [model("build", "Limits Apply build"), model("plan", "Limits Apply plan")],
  };
}

export function mergePiConfig(
  config: Record<string, unknown>,
  proxy = DEFAULT_PROXY,
): { config: Record<string, unknown>; changes: ConfigChange[] } {
  const changes: ConfigChange[] = [];
  const record = recorder(changes);

  const providers = { ...((config.providers as Record<string, unknown> | undefined) ?? {}) };
  const next = limitsApplyProvider(proxy);
  record("providers.LIMITSAPPLY", providers.LIMITSAPPLY, next);
  providers.LIMITSAPPLY = next;

  return { config: { ...config, providers }, changes };
}
