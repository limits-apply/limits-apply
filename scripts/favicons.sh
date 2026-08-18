#!/usr/bin/env bash
# One provider per line: "<slug> <domain>". The slug must equal the first word of
# the provider's plan names in src/data/plans.ts, lowercased — that is how the UI
# finds the file. test/benchmark.test.ts fails if a plan has no icon.
#
# The second list is the open-weights makers on the local page, keyed by `maker` in
# src/data/local-models.ts. Their logo comes from the Hugging Face organisation that
# publishes the weights, which for a lab with no product site is the only page there is.
set -euo pipefail

out="$(dirname "$0")/../public/icons"
mkdir -p "$out"

while read -r slug domain; do
  [ -z "$slug" ] && continue
  curl -sSLf -o "$out/$slug.png" "https://www.google.com/s2/favicons?sz=128&domain=$domain" \
    && echo "ok   $slug  $domain" \
    || echo "FAIL $slug  $domain"
done <<'PROVIDERS'
claude claude.com
chatgpt openai.com
google gemini.google.com
mistral mistral.ai
github github.com
cursor cursor.com
perplexity perplexity.ai
supergrok x.ai
kimi kimi.com
glm z.ai
qwen qwen.ai
minimax minimax.io
opencode opencode.ai
warp warp.dev
zed zed.dev
replit replit.com
factory factory.ai
devin devin.ai
poe poe.com
meta ai.meta.com
nvidia nvidia.com
PROVIDERS

while read -r slug org; do
  [ -z "$slug" ] && continue
  avatar="$(curl -sSLf "https://huggingface.co/api/organizations/$org/overview" \
    | sed -n 's/.*"avatarUrl":"\([^"]*\)".*/\1/p')"
  if [ -z "$avatar" ]; then echo "FAIL $slug  $org  (no avatar)"; continue; fi
  curl -sSLf -o "$out/$slug.src" "$avatar" \
    && sips -s format png -Z 128 "$out/$slug.src" --out "$out/$slug.png" >/dev/null \
    && rm -f "$out/$slug.src" \
    && echo "ok   $slug  $org" \
    || echo "FAIL $slug  $org"
done <<'MAKERS'
inclusionai inclusionAI
ai9stars ai9stars
MAKERS
