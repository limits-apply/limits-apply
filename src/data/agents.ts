/**
 * Artificial Analysis coding-agents snapshot — agent + model pairs over APIs,
 * not subscriptions. Reads data/artificial-analysis-agents-2026-08-15.json.
 *
 * Cost is AA's pay-per-token API cost of one evaluated task; a variant AA
 * publishes no cost for carries null, never 0.
 */
import type { Point } from "../lib/benchmark";
import snapshot from "../../data/artificial-analysis-agents-2026-08-15.json";

export interface AgentVariant {
  agent: string;
  model: string;
  reasoning: string;
  index: number;
  costPerTask: number | null;
  wallMinutes: number;
}

export const AGENTS_SNAPSHOT = {
  verified: "2026-08-15",
  source: "https://artificialanalysis.ai/agents/coding-agents",
  suites: "DeepSWE (113) · Terminal-Bench v2 (84) · SWE-Atlas-QnA (124)",
};

const BY_LABEL = new Map(snapshot.variants.map(variant => [variant.label, variant]));

/** The snapshot is the source of truth; a label it no longer publishes is an error, not a silent drop. */
function fromLabel(agent: string, model: string, reasoning: string, label: string): AgentVariant {
  const variant = BY_LABEL.get(label);
  if (!variant) throw new Error(`agents.ts maps label "${label}", but the snapshot no longer publishes it`);
  return {
    agent,
    model,
    reasoning,
    index: Math.round(variant.index * 10000) / 100,
    costPerTask: variant.costUsd,
    wallMinutes: variant.wallSeconds / 60,
  };
}

export const AA_AGENTS = {
  claudeOpus: fromLabel("Claude Code", "Claude Opus 5", "xhigh", "Claude Code - Opus 5 (xhigh)"),
  codexSol: fromLabel("Codex", "GPT-5.6 Sol", "max", "Codex - GPT-5.6 Sol (max)"),
  claudeFable: fromLabel("Claude Code", "Fable 5", "max · fallback", "Claude Code - Fable 5 (max) (with fallback)"),
  grokBuild: fromLabel("Grok Build", "Grok 4.5", "high", "Grok Build - Grok 4.5 (high)"),
  kimiCli: fromLabel("Kimi Code CLI", "Kimi K3", "—", "Kimi Code CLI - Kimi K3"),
  museCode: fromLabel("Muse Code", "Muse Spark 1.2", "xhigh", "Muse Code - Muse Spark 1.2 (xhigh)"),
  opencodeGemini: fromLabel("Opencode", "Gemini 3.7 Flash", "high", "Opencode - Gemini 3.7 Flash (high)"),
  codexDeepseek: fromLabel("Codex", "DeepSeek V4 Flash", "max", "Codex - DeepSeek V4 Flash (max)"),
  claudeGlm: fromLabel("Claude Code", "GLM-5.2", "— · via Novita", "Claude Code - GLM-5.2"),
  cursorComposer: fromLabel("Cursor CLI", "Composer 2.5 Fast", "—", "Cursor CLI - Composer 2.5 Fast"),
} satisfies Record<string, AgentVariant>;

export type AgentKey = keyof typeof AA_AGENTS;

/**
 * Plans whose own shipped harness is a variant this snapshot scored. Mapping
 * only — not a claim about quota. Copilot is deliberately absent: AA scored
 * neither VS Code agent mode nor the Copilot CLI in this snapshot.
 */
export const PLAN_AGENT_KEYS: Record<string, AgentKey> = {
  "ChatGPT Plus": "codexSol", "ChatGPT Pro 5×": "codexSol", "ChatGPT Pro 20×": "codexSol",
  "Claude Max 5×": "claudeOpus", "Claude Max 20×": "claudeOpus",
  "Kimi Moderato": "kimiCli", "Kimi Allegretto": "kimiCli",
  "Kimi Allegro": "kimiCli", "Kimi Vivace": "kimiCli",
  "Cursor Pro": "cursorComposer", "Cursor Pro+": "cursorComposer", "Cursor Ultra": "cursorComposer",
};

export const AGENT_POINTS: Point[] = Object.values(AA_AGENTS)
  .filter(variant => variant.costPerTask != null)
  .map(variant => ({
    label: `${variant.agent} · ${variant.model}`,
    x: variant.costPerTask!,
    y: variant.index,
  }));
