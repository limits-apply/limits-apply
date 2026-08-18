import type { LiteLlmConfig } from "./litellm";

export interface ActivationState {
  active: LiteLlmConfig | null;
  previous: LiteLlmConfig | null;
  error: string | null;
}

export function validateConfig(config: LiteLlmConfig): string[] {
  const errors: string[] = [];
  const names = config.model_list.map(model => model.model_name);
  for (const alias of ["build", "plan"]) {
    if (!names.includes(alias)) errors.push(`missing ${alias} alias`);
  }
  if (config.general_settings.master_key_env !== "LITELLM_MASTER_KEY") errors.push("unexpected master key setting");
  if (config.general_settings.host !== "127.0.0.1") errors.push("proxy must bind to loopback");
  return errors;
}

export function activate(
  current: LiteLlmConfig | null,
  candidate: LiteLlmConfig,
  smokeTest: (config: LiteLlmConfig) => boolean,
): ActivationState {
  const errors = validateConfig(candidate);
  if (errors.length) return { active: current, previous: null, error: errors.join("; ") };
  if (!smokeTest(candidate)) return { active: current, previous: null, error: "alias smoke test failed" };
  return { active: candidate, previous: current, error: null };
}

export function rollback(state: ActivationState): ActivationState {
  return state.previous
    ? { active: state.previous, previous: null, error: "rolled back" }
    : state;
}
