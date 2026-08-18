export interface OpencodeChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

function limitsApplyProvider(baseUrl: string) {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: "LIMITSAPPLY",
    options: { baseURL: baseUrl, apiKey: "local" },
    models: {
      build: { name: "Limits Apply build" },
      plan: { name: "Limits Apply plan" },
    },
  };
}

// Deliberately blind to the verdict: this file only points the two aliases at the proxy, and the
// routing behind them lives in LiteLLM. Taking a verdict here would imply re-writing the user's
// opencode.json every time a selection changed, for a config that would come out identical.
//
// Every nested object this function writes into is a fresh `{...}` copy, never the caller's
// own `config.provider`/`config.mode` reference, since a shallow copy of `config` alone would
// leave those nested objects aliased and any field write on them would mutate the caller's data.
export function mergeOpencodeConfig(
  config: Record<string, unknown>,
  baseUrl = "http://127.0.0.1:4000/v1",
): { config: Record<string, unknown>; changes: OpencodeChange[] } {
  const changes: OpencodeChange[] = [];
  const record = (field: string, oldValue: unknown, newValue: unknown): void => {
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes.push({ field, oldValue, newValue });
  };

  const provider = { ...((config.provider as Record<string, unknown> | undefined) ?? {}) };
  const newLimitsApply = limitsApplyProvider(baseUrl);
  record("provider.LIMITSAPPLY", provider.LIMITSAPPLY, newLimitsApply);
  provider.LIMITSAPPLY = newLimitsApply;

  record("model", config.model, "LIMITSAPPLY/build");

  const mode = { ...((config.mode as Record<string, unknown> | undefined) ?? {}) };
  const oldBuild = mode.build as Record<string, unknown> | undefined;
  const oldPlan = mode.plan as Record<string, unknown> | undefined;
  record("mode.build.model", oldBuild?.model, "LIMITSAPPLY/build");
  record("mode.plan.model", oldPlan?.model, "LIMITSAPPLY/plan");
  mode.build = { ...oldBuild, model: "LIMITSAPPLY/build" };
  mode.plan = { ...oldPlan, model: "LIMITSAPPLY/plan" };

  return { config: { ...config, provider, model: "LIMITSAPPLY/build", mode }, changes };
}
