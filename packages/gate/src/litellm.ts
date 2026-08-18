import type { Candidate, Verdict } from "@limits-apply/intelligence";

export interface LiteLlmModel {
  model_name: string;
  litellm_params: { model: string; api_base?: string };
}

export interface LiteLlmConfig {
  model_list: LiteLlmModel[];
  litellm_settings: { drop_params: boolean; fallbacks: Record<string, string[]> };
  general_settings: { master_key_env: string; host: "127.0.0.1"; port: number };
}

export function generateLiteLlmConfig(verdict: Verdict, candidates: Candidate[]): LiteLlmConfig {
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const aliases = (["build", "plan"] as const)
    .map(alias => ({ alias, candidate: verdict.selected[alias] ? byId.get(verdict.selected[alias]!) : undefined }))
    .filter((entry): entry is { alias: "build" | "plan"; candidate: Candidate } => entry.candidate !== undefined);
  return {
    model_list: aliases.map(({ alias, candidate }) => ({
      model_name: alias,
      litellm_params: { model: candidate.model, api_base: candidate.endpoint },
    })),
    litellm_settings: { drop_params: true, fallbacks: verdict.fallbacks },
    general_settings: { master_key_env: "LITELLM_MASTER_KEY", host: "127.0.0.1", port: 4000 },
  };
}
