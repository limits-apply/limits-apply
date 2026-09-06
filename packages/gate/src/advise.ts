/**
 * `advise` reads what is already on the machine and prices the decision — it activates
 * nothing and writes nothing. Two sources, each optional: OpenCode's own per-message
 * cost records (the tool's own figure, so `observed`), and the Claude subscription's
 * usage windows (utilization the provider reports about itself, so `observed`; the
 * pace projected from it is ours, so `derived`).
 */

export interface UsageMessage {
  role?: string;
  providerID?: string;
  modelID?: string;
  cost?: number;
  tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } };
  time?: { created?: number; completed?: number };
}

export interface ConfigUsage {
  provider: string;
  model: string;
  messages: number;
  usd: number;
  tokensIn: number;
  tokensOut: number;
}

export interface UsageSummary {
  messages: number;
  costed: number;
  zeroCost: number;
  totalUsd: number;
  byConfig: ConfigUsage[];
}

/** Sums OpenCode's own `cost` field per provider×model. Only assistant turns carry one. */
export function summarizeUsage(messages: UsageMessage[], sinceMs: number, untilMs: number): UsageSummary {
  const byConfig = new Map<string, ConfigUsage>();
  let count = 0, costed = 0, zeroCost = 0, totalUsd = 0;
  for (const message of messages) {
    if (message.role !== "assistant" || typeof message.cost !== "number") continue;
    const at = message.time?.created ?? message.time?.completed;
    if (at === undefined || at < sinceMs || at >= untilMs) continue;
    count += 1;
    if (message.cost > 0) { costed += 1; totalUsd += message.cost; } else zeroCost += 1;
    const key = `${message.providerID ?? "unknown"} ${message.modelID ?? "unknown"}`;
    const row = byConfig.get(key) ?? {
      provider: message.providerID ?? "unknown", model: message.modelID ?? "unknown",
      messages: 0, usd: 0, tokensIn: 0, tokensOut: 0,
    };
    row.messages += 1;
    row.usd += message.cost;
    row.tokensIn += message.tokens?.input ?? 0;
    row.tokensOut += (message.tokens?.output ?? 0) + (message.tokens?.reasoning ?? 0);
    byConfig.set(key, row);
  }
  return {
    messages: count, costed, zeroCost, totalUsd,
    byConfig: [...byConfig.values()].sort((a, b) => b.usd - a.usd),
  };
}

export interface WindowPace {
  label: string;
  utilization: number;
  resetsAt: string;
  elapsedFraction: number;
  /** utilization ÷ elapsed fraction — where the window lands if the pace holds. Null until enough of the window has elapsed to divide by. */
  projected: number | null;
}

/**
 * The endpoint reports where the window ends, not where it began — the stated window
 * length is what turns a reset time into an elapsed fraction, same convention as
 * `quota scan`'s WINDOW_HOURS.
 */
export function paceWindow(
  label: string,
  window: { utilization: number; resets_at: string } | undefined,
  windowHours: number,
  nowMs: number,
): WindowPace | null {
  if (!window || Number.isNaN(Date.parse(window.resets_at))) return null;
  const windowMs = windowHours * 3_600_000;
  const remaining = Date.parse(window.resets_at) - nowMs;
  const elapsedFraction = Math.min(1, Math.max(0, (windowMs - remaining) / windowMs));
  return {
    label,
    utilization: window.utilization,
    resetsAt: new Date(window.resets_at).toISOString(),
    elapsedFraction,
    projected: elapsedFraction >= 0.05 ? window.utilization / elapsedFraction : null,
  };
}

/** One month is 365.25 ÷ 12 days — the same month the site prints (`lib/provenance.ts`). */
export const DAYS_PER_MONTH = 365.25 / 12;

/** Observed spend over `days`, normalized to the average month. */
export const monthlyEquivalent = (totalUsd: number, days: number) => totalUsd * DAYS_PER_MONTH / days;

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * The measurement-submission issue form, pre-filled with everything the machine already
 * knows. The fields the tool cannot know — plan, grading, artifact — stay as prompts,
 * because inventing them is exactly what the ladder forbids.
 */
export function formatExport(summary: UsageSummary, windows: WindowPace[], sinceIso: string, untilIso: string): string {
  const lines = [
    "### Access path",
    "<your exact plan and billing tier — the one field only you know>",
    "",
    "### Configuration",
    ...summary.byConfig.map(row => `- ${row.provider} · ${row.model} — ${row.messages} message(s)`),
    "",
    "### Environment and quota window",
    `- Observed ${sinceIso} → ${untilIso}, local machine records`,
    ...windows.map(w => `- ${w.label}: ${w.utilization}% used, resets ${w.resetsAt} (provider-reported)`),
    "",
    "### Outcomes and consumption",
    `- ${summary.messages} assistant message(s): ${summary.costed} metered totalling ${usd(summary.totalUsd)} at OpenCode's own per-message cost, ${summary.zeroCost} at zero metered cost (local or subscription-covered)`,
    ...summary.byConfig.map(row =>
      `- ${row.provider} · ${row.model}: ${usd(row.usd)}, ${row.tokensIn.toLocaleString("en-US")} in / ${row.tokensOut.toLocaleString("en-US")} out tokens`),
    "",
    "### Grading method",
    "<how outcomes were graded — Pass / Partial / Fail and by whom>",
    "",
    "### Sanitized evidence artifact",
    "<durable URL to sanitized logs sufficient to audit the summary>",
    "",
    "Submit at: https://github.com/limits-apply/limits-apply/issues/new?template=measurement-submission.yml",
  ];
  return lines.join("\n");
}
