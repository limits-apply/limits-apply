import type { QuotaEvent } from "./quota";

export interface ClaudeCredentials { accessToken: string; expiresAt: number }

export function parseClaudeCredentials(raw: string): ClaudeCredentials {
  const parsed = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; expiresAt?: number } };
  const oauth = parsed.claudeAiOauth;
  if (!oauth?.accessToken || typeof oauth.expiresAt !== "number") {
    throw new Error("credentials file has no claudeAiOauth block — run `claude` once to sign in");
  }
  return { accessToken: oauth.accessToken, expiresAt: oauth.expiresAt };
}

export interface ClaudeUsageWindow { utilization: number; resets_at: string }
export interface ClaudeUsageResponse {
  five_hour?: ClaudeUsageWindow;
  seven_day?: ClaudeUsageWindow;
  seven_day_opus?: ClaudeUsageWindow;
  seven_day_sonnet?: ClaudeUsageWindow;
}

/**
 * One event per pull, at the LATEST reopen among closed windows: the domain is one access
 * path, and it is not usable again until every window that closed has reopened.
 */
export function usageToQuotaEvent(usage: ClaudeUsageResponse, domain: string, now: string): QuotaEvent | null {
  const closed = [usage.five_hour, usage.seven_day, usage.seven_day_opus, usage.seven_day_sonnet]
    .filter((window): window is ClaudeUsageWindow => window !== undefined && window.utilization >= 100
      && !Number.isNaN(Date.parse(window.resets_at)));
  if (closed.length === 0) return null;
  const resetsAt = closed.map(window => new Date(window.resets_at).toISOString()).sort().at(-1) as string;
  return { domain, observedAt: now, resetsAt, rung: "observed", source: "oauth-usage" };
}
