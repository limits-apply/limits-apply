# @limits-apply/cli

The local half of [Limits Apply](https://github.com/limits-apply/limits-apply): it turns a published
verdict into a working LiteLLM proxy config, points your harness at it, and keeps an append-only
audit log of every change it made.

```sh
npx @limits-apply/cli init
npx @limits-apply/cli update --example
export LITELLM_MASTER_KEY=sk-local-anything
litellm --config ~/.config/limitsapply/litellm.yaml
npx @limits-apply/cli status --smoke
```

Nothing is uploaded. `profile.json`, `verdict.json`, `litellm.yaml` and `audit.jsonl` all stay
under a directory on your own machine — `$LIMITSAPPLY_HOME`, else `$XDG_CONFIG_HOME/limitsapply`,
else `~/.config/limitsapply`. Every command also takes an explicit `--root`.

Every command, flag, exit code and environment variable is documented in the
[CLI reference](https://github.com/limits-apply/limits-apply/blob/main/docs/cli.html); the rules a
verdict obeys are in [the verdict page](https://github.com/limits-apply/limits-apply/blob/main/docs/verdict.html).

Installing it globally (`npm i -g @limits-apply/cli`) puts the same thing on your path as
`limitsapply`. Requires Node 20 or newer. Apache-2.0.
