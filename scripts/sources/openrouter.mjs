/**
 * OpenRouter — a drift check on RATE, never a replacement.
 *
 * `RATE` in src/data/task.ts is the ledger's one stated assumption and is printed on
 * the page so a reader can move it. Replacing it with a computed median would trade
 * that transparency for a number nobody can audit, so this only reports the gap.
 */
import { get } from "./http.mjs";

const norm = s => s.toLowerCase().replace(/[^a-z0-9.]+/g, "");

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** `names`/`models` come from the newest AA snapshot — the models `src/data/aa.ts` maps. */
export async function checkOpenRouter(names, models) {
  const catalog = (await get("https://openrouter.ai/api/v1/models", "application/json")).data ?? [];

  const byName = new Map();
  for (const m of catalog) {
    const name = (m.name ?? "").includes(": ") ? m.name.split(": ").slice(1).join(": ") : m.name ?? m.id;
    const inPerM = Number(m.pricing?.prompt) * 1e6;
    const outPerM = Number(m.pricing?.completion) * 1e6;
    if (Number.isFinite(inPerM) && Number.isFinite(outPerM)) byName.set(norm(name), { id: m.id, inPerM, outPerM });
  }

  const hits = [];
  const misses = [];
  for (const name of names) {
    const hit = byName.get(norm(name));
    if (hit) hits.push({ name, ...hit }); else misses.push(name);
  }

  const belowOutputCost = [];
  for (const m of models) {
    const hit = byName.get(norm(m.name));
    if (!hit) continue;
    const floor = m.output_tokens_per_task / 1e6 * hit.outPerM;
    if (floor && m.cost_per_task_usd < floor) {
      belowOutputCost.push({ slug: m.slug, costPerTask: m.cost_per_task_usd, outputFloor: floor });
    }
  }

  return {
    catalogSize: catalog.length,
    hits, misses,
    medianInPerM: hits.length ? median(hits.map(h => h.inPerM)) : null,
    medianOutPerM: hits.length ? median(hits.map(h => h.outPerM)) : null,
    belowOutputCost,
  };
}

export function summarizeOpenRouter(report) {
  const usd = n => "$" + n.toFixed(2);
  const lines = [`prices · ${report.catalogSize} OpenRouter models vs ${report.hits.length + report.misses.length} mapped`, ""];
  for (const h of report.hits) {
    lines.push(`  ${h.name.padEnd(20)} ${h.id.padEnd(30)} in ${usd(h.inPerM).padStart(7)} / out ${usd(h.outPerM).padStart(7)}`);
  }
  for (const m of report.misses) lines.push(`  ${m.padEnd(20)} —— no OpenRouter match, priced by hand`);
  if (report.medianInPerM != null) {
    lines.push("", `  live median across the mapped models: in ${usd(report.medianInPerM)} / out ${usd(report.medianOutPerM)}`,
      "  compare against RATE in src/data/task.ts, and bump it by hand if the gap is real.");
  }
  if (report.belowOutputCost.length) {
    lines.push("", "  below its own output-token cost, re-check:");
    for (const b of report.belowOutputCost) lines.push(`  ${b.slug.padEnd(26)} AA ${usd(b.costPerTask)} · output alone ${usd(b.outputFloor)}`);
  }
  return lines.join("\n");
}
