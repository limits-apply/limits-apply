/**
 * models.dev — leads for VERIFIED_PLAN_ACCESS, never evidence.
 *
 * models.dev says a model is *servable* by a provider. A `VERIFIED_PLAN_ACCESS` entry
 * asserts a *subscription grants* it, which only a provider's own docs answer. So
 * this returns a to-verify list and stops; nothing here may reach src/data/.
 */
import { get } from "./http.mjs";

const norm = s => s.toLowerCase().replace(/[^a-z0-9.]+/g, "");

export async function checkModelsDev(names) {
  const api = await get("https://models.dev/api.json", "application/json");

  const providersByModel = new Map();
  for (const [providerId, provider] of Object.entries(api)) {
    for (const model of Object.values(provider?.models ?? {})) {
      const key = norm(model?.name ?? "");
      if (!key) continue;
      if (!providersByModel.has(key)) providersByModel.set(key, new Set());
      providersByModel.get(key).add(provider?.name ?? providerId);
    }
  }

  const leads = names.map(name => ({
    name,
    providers: [...(providersByModel.get(norm(name)) ?? [])].sort(),
  }));

  return { providerCount: Object.keys(api).length, leads };
}

export function summarizeModelsDev(report) {
  const lines = [`access · ${report.providerCount} models.dev providers`, ""];
  for (const lead of report.leads) {
    lines.push(`  ${lead.name.padEnd(20)} ${lead.providers.length ? lead.providers.join(", ") : "—— not in models.dev yet"}`);
  }
  lines.push("", "  Serving a model is not granting it. Read the provider's own docs before writing",
    "  a VERIFIED_PLAN_ACCESS entry — the source and billing URLs are the evidence, this list is not.");
  return lines.join("\n");
}
