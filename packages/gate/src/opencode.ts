import { type ConfigChange, recorder } from "./harness";
import { DEFAULT_PROXY } from "./smoke";

function limitsApplyProvider(proxy: string) {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: "LIMITSAPPLY",
    options: { baseURL: `${proxy}/v1`, apiKey: "local" },
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
  proxy = DEFAULT_PROXY,
): { config: Record<string, unknown>; changes: ConfigChange[] } {
  const changes: ConfigChange[] = [];
  const record = recorder(changes);

  const provider = { ...((config.provider as Record<string, unknown> | undefined) ?? {}) };
  const newLimitsApply = limitsApplyProvider(proxy);
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
