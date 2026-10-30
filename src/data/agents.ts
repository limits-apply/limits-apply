/**
 * Artificial Analysis coding-agents snapshot — agent + model pairs over APIs,
 * not subscriptions. Reads data/artificial-analysis-agents.json.
 *
 * Cost is AA's pay-per-token API cost of one evaluated task; a variant AA
 * publishes no cost for carries null, never 0.
 */
import type { Point } from "../lib/benchmark";
import snapshot from "../../data/artificial-analysis-agents.json";

export interface AgentVariant {
  agent: string;
  model: string;
  reasoning: string;
  index: number;
  costPerTask: number | null;
  wallMinutes: number;
}

export const AGENTS_SNAPSHOT = {
  verified: "2026-10-16",
  source: "https://artificialanalysis.ai/agents/coding-agents",
  suites: "DeepSWE v1.1 (113) · Terminal-Bench 4.0 (66) · SWE-Atlas-QnA (124)",
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
  claudeOpus: fromLabel("Claude Code", "Claude Opus 5.5", "max · fallback", "Claude Code - Claude Opus 5.5 (Max, Default Fallback)"),
  codexSol: fromLabel("Codex", "GPT-6.1 Sol", "max", "Codex - GPT-6.1 Sol (Max)"),
  claudeFable: fromLabel("Claude Code", "Fable 5.1", "max · fallback", "Claude Code - Claude Fable 5.1 (Max, Default Fallback)"),
  grokBuild: fromLabel("Grok Build", "Grok 4.7", "xhigh", "Grok Build - Grok 4.7 (Xhigh)"),
  kimiCli: fromLabel("Kimi Code CLI", "Kimi K3", "max", "Kimi Code CLI - Kimi K3 (Max)"),
  museCode: fromLabel("Muse Code", "Muse Spark 1.3", "max", "Muse Code - Muse Spark 1.3 (Max)"),
  opencodeGlm: fromLabel("Opencode", "GLM-5.3", "max", "Opencode - GLM-5.3 (Max)"),
  codexDeepseek: fromLabel("Codex", "DeepSeek V4.1 Flash", "max", "Codex - DeepSeek V4.1 Flash (Max)"),
} satisfies Record<string, AgentVariant>;

export type AgentKey = keyof typeof AA_AGENTS;

/**
 * Plans whose own shipped harness is a *sibling* of the scored pair — the harness is not
 * the one AA ran, so the index belongs to a neighbouring variant and the row says so.
 */
const SIBLING_AGENT_KEYS: Record<string, AgentKey> = {
  "OpenCode Zen Muse Spark 1.3 Contributor Free": "museCode",
};

/**
 * Plans whose own shipped harness is a variant this snapshot scored. Mapping
 * only — not a claim about quota. Copilot and Cursor are deliberately absent: AA
 * scored neither VS Code agent mode, the Copilot CLI, nor Cursor CLI in this snapshot.
 */
const DIRECT_AGENT_KEYS: Record<string, AgentKey> = {
  "ChatGPT Plus": "codexSol", "ChatGPT Pro 5×": "codexSol", "ChatGPT Pro 20×": "codexSol",
  "Claude Max 5×": "claudeOpus", "Claude Max 20×": "claudeOpus",
  "Kimi Moderato": "kimiCli", "Kimi Allegretto": "kimiCli",
  "Kimi Allegro": "kimiCli", "Kimi Vivace": "kimiCli",
  "Cursor Pro": "codexSol", "Cursor Pro+": "codexSol", "Cursor Ultra": "codexSol",
};

export const PLAN_AGENT_KEYS: Record<string, AgentKey> = { ...DIRECT_AGENT_KEYS, ...SIBLING_AGENT_KEYS };

/** Is this row's AA pair the harness's own, or a sibling's? */
export function agentRung(name: string): "measured" | "modelled" {
  return SIBLING_AGENT_KEYS[name] ? "modelled" : "measured";
}

export const AGENT_POINTS: Point[] = Object.values(AA_AGENTS)
  .filter(variant => variant.costPerTask != null)
  .map(variant => ({
    label: `${variant.agent} · ${variant.model}`,
    x: variant.costPerTask!,
    y: variant.index,
  }));
