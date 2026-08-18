# limitsapply

The local half of [Limits Apply](https://github.com/uslopia/limitsapply): it turns a published
verdict into a working LiteLLM proxy config, points your harness at it, and keeps an append-only
audit log of every change it made.

```sh
npx limitsapply init
npx limitsapply update --example
export LITELLM_MASTER_KEY=sk-local-anything
litellm --config ~/.config/limitsapply/litellm.yaml
npx limitsapply status --smoke
```

Nothing is uploaded. `profile.json`, `verdict.json`, `litellm.yaml` and `audit.jsonl` all stay
under a directory on your own machine — `$LIMITSAPPLY_HOME`, else `$XDG_CONFIG_HOME/limitsapply`,
else `~/.config/limitsapply`. Every command also takes an explicit `--root`.

Every command, flag, exit code and environment variable is documented in the
[CLI reference](https://github.com/uslopia/limitsapply/blob/main/docs/cli.html); the rules a
verdict obeys are in [the verdict page](https://github.com/uslopia/limitsapply/blob/main/docs/verdict.html).

Requires Node 20 or newer. Apache-2.0.
