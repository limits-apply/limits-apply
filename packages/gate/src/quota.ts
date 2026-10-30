import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

type QuotaRung = "observed" | "derived";

/**
 * A closed window and the time it was said to reopen — never a count of what is left, which would
 * need a published ceiling this file is not allowed to know.
 */
export interface QuotaEvent {
  domain: string;
  observedAt: string;
  resetsAt: string;
  rung: QuotaRung;
  source: string;
}

function parseQuota(raw: string): QuotaEvent[] {
  return raw.split("\n").filter(line => line.trim()).map(line => JSON.parse(line) as QuotaEvent);
}

/** The last event for a domain is the whole truth about it: a later reading supersedes an earlier one. */
function latestByDomain(events: QuotaEvent[]): QuotaEvent[] {
  const byDomain = new Map<string, QuotaEvent>();
  for (const event of events) byDomain.set(event.domain, event);
  return [...byDomain.values()];
}

export function liveQuota(events: QuotaEvent[], now: string): QuotaEvent[] {
  return latestByDomain(events).filter(event => event.resetsAt > now);
}

export async function readQuota(path: string, now: string): Promise<QuotaEvent[]> {
  try {
    return liveQuota(parseQuota(await readFile(path, "utf8")), now);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export interface OpencodeMessage {
  role?: string;
  providerID?: string;
  time?: { created?: number; completed?: number };
  error?: { name?: string; data?: Record<string, unknown> };
}

const REFUSAL = /429|rate.?limit|usage limit|quota/i;

function refusedForQuota(message: OpencodeMessage): boolean {
  const error = message.error;
  if (!error) return false;
  return REFUSAL.test(`${error.name ?? ""} ${JSON.stringify(error.data ?? {})}`);
}

/**
 * OpenCode's own records carry the provider and the time, but no reset field has been seen in
 * practice — so a stated window length is the honest default and `observed` is reserved for a
 * record that names its own reopen time.
 */
export function scanOpencodeMessages(
  messages: OpencodeMessage[],
  domainOf: (providerID: string) => string | null,
  windowHours: number,
): { events: QuotaEvent[]; unmapped: string[] } {
  const events: QuotaEvent[] = [];
  const unmapped = new Set<string>();
  for (const message of messages) {
    if (!refusedForQuota(message) || !message.providerID) continue;
    const domain = domainOf(message.providerID);
    if (!domain) {
      unmapped.add(message.providerID);
      continue;
    }
    const at = message.time?.completed ?? message.time?.created;
    if (at === undefined) continue;
    const stated = message.error?.data?.resetsAt ?? message.error?.data?.retryAfter;
    const observedAt = new Date(at).toISOString();
    events.push(typeof stated === "string" && !Number.isNaN(Date.parse(stated))
      ? { domain, observedAt, resetsAt: new Date(stated).toISOString(), rung: "observed", source: "provider-reset" }
      : { domain, observedAt, resetsAt: new Date(at + windowHours * 3_600_000).toISOString(), rung: "derived", source: "window-length" });
  }
  return { events, unmapped: [...unmapped] };
}

export async function appendQuota(path: string, event: QuotaEvent): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}
