import type { Candidate, Verdict } from "@limits-apply/intelligence";

export interface LiteLlmModel {
  model_name: string;
  litellm_params: { model: string; api_base?: string; cooldown_time: number };
}

export interface LiteLlmConfig {
  model_list: LiteLlmModel[];
  litellm_settings: { drop_params: boolean; fallbacks: Array<Record<string, string[]>> };
  general_settings: { master_key_env: string; host: "127.0.0.1"; port: number };
}

const ALIASES = ["build", "plan"] as const;

/** A flat-rate 429 means a window closed, not that a burst was refused, so it sits out far longer. */
const WINDOW_COOLDOWN_SECONDS = 300;
const BURST_COOLDOWN_SECONDS = 60;

function deploymentName(alias: string, rank: number): string {
  return rank === 0 ? alias : `${alias}-${rank + 1}`;
}

export function generateLiteLlmConfig(verdict: Verdict, candidates: Candidate[]): LiteLlmConfig {
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const routes = ALIASES.map(alias => ({
    alias,
    route: verdict.routes[alias]
      .map(id => byId.get(id))
      .filter((candidate): candidate is Candidate => candidate !== undefined),
  }));
  return {
    model_list: routes.flatMap(({ alias, route }) => route.map((candidate, rank) => ({
      model_name: deploymentName(alias, rank),
      litellm_params: {
        model: candidate.model,
        api_base: candidate.endpoint,
        cooldown_time: candidate.billing === "subscription" ? WINDOW_COOLDOWN_SECONDS : BURST_COOLDOWN_SECONDS,
      },
    }))),
    litellm_settings: {
      drop_params: true,
      fallbacks: routes
        .map(({ alias, route }) => ({
          alias,
          chain: [
            ...route.slice(1).map((_, rank) => deploymentName(alias, rank + 1)),
            ...(verdict.fallbacks[alias] ?? []),
          ],
        }))
        .filter(({ chain }) => chain.length > 0)
        .map(({ alias, chain }) => ({ [alias]: chain })),
    },
    general_settings: { master_key_env: "LITELLM_MASTER_KEY", host: "127.0.0.1", port: 4000 },
  };
}
