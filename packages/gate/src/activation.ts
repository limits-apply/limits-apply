import type { LiteLlmConfig } from "./litellm";

export interface ActivationState {
  active: LiteLlmConfig | null;
  previous: LiteLlmConfig | null;
  error: string | null;
}

/** `aliases` is what the verdict promised to route — its own class list, never a fixed pair. */
export function validateConfig(config: LiteLlmConfig, aliases: string[] = []): string[] {
  const errors: string[] = [];
  const names = new Set(config.model_list.map(model => model.model_name));
  if (names.size === 0) errors.push("no alias is deployed");
  for (const alias of aliases) {
    if (!names.has(alias)) errors.push(`missing ${alias} alias`);
  }
  if (config.general_settings.master_key_env !== "LITELLM_MASTER_KEY") errors.push("unexpected master key setting");
  if (config.general_settings.host !== "127.0.0.1") errors.push("proxy must bind to loopback");
  return errors;
}

/**
 * Validation only. LiteLLM reads its config at startup, so what the probe reaches is whatever the
 * running proxy already loaded, never the file `updateGate` has just written. That is why the
 * probe and the `rollback` below sit either side of that write: the check the pair can make is
 * "is a proxy up and answering both aliases", and `--smoke` is documented as no more than that.
 * Proving the *new* verdict is served would take a restart Gate does not perform.
 */
export function activate(
  current: LiteLlmConfig | null,
  candidate: LiteLlmConfig,
  aliases: string[] = [],
): ActivationState {
  const errors = validateConfig(candidate, aliases);
  if (errors.length) return { active: current, previous: null, error: errors.join("; ") };
  return { active: candidate, previous: current, error: null };
}

export function rollback(state: ActivationState): ActivationState {
  return state.previous
    ? { active: state.previous, previous: null, error: "rolled back" }
    : state;
}
