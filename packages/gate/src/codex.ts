import { DEFAULT_PROXY } from "./smoke";

/**
 * A block to paste, not a file to write: merging into an existing `config.toml` would need a TOML
 * parser, and Gate carries no dependency that can do it. Generating the text still keeps the
 * published snippet from drifting away from the proxy contract it describes.
 *
 * Codex 0.147 no longer accepts `wire_api = "chat"`, so the proxy's `/v1/responses` is the only
 * surface left to it. `env_key` names the variable; `LITELLM_MASTER_KEY` holds its value.
 */
export function codexConfigBlock(proxy = DEFAULT_PROXY): string {
  return `model = "build"
model_provider = "limitsapply"
model_context_window = 32768
model_max_output_tokens = 8192

[model_providers.limitsapply]
name = "Limits Apply"
base_url = "${proxy}/v1"
env_key = "LITELLM_MASTER_KEY"
wire_api = "responses"`;
}
