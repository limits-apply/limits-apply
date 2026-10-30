/**
 * What must never reach a store or an export. A scan hits the export is
 * refused, not cleaned — a pattern match means a human decides what happened.
 */

const PRIVACY_PATTERNS: [string, RegExp][] = [
  ["an account home path", /(?:\/Users\/|\/home\/)[A-Za-z0-9._-]+/],
  ["an email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ["an API key", /(?:sk|rk)-[A-Za-z0-9_-]{12,}/],
  ["an authorization header", /Bearer\s+[A-Za-z0-9._-]{16,}/],
  ["a harness config path", /\.(?:claude|codex)\//],
  ["an environment secret", /(?:ANTHROPIC|OPENAI|LIMITSAPPLY)_[A-Z_]*KEY|ACCESS_TOKEN/],
  ["a private prompt", /<(?:system|user)_reminder>|<<<|>>>/],
];

/** Matched fragments, each naming what it matched. */
export function privacyScan(text: string): string[] {
  const hits: string[] = [];
  for (const [label, pattern] of PRIVACY_PATTERNS) {
    const match = pattern.exec(text);
    if (match) hits.push(`${label}: ${match[0].slice(0, 40)}`);
  }
  return hits;
}
