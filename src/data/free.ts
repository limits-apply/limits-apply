/**
 * The $0 catalogue. Every row is a free tier of a live service, not a paid plan
 * with a trial: `price` is 0 by construction, and no figure here is divided by it.
 *
 * A provider-published limit is `official`; an access route inferred from a model
 * list is `derived`; a page that could not be read stays `unknown` and its limits
 * keep `amount: null`. The rows live in `free-offers.json` so the same dated file
 * can be read by a script; this module is the loader, the types and the validator.
 */
import rows from "./free-offers.json";

export type FreeOfferType = "chat" | "coding-agent" | "cli" | "api" | "ide" | "image";
export type FreeUsage = "general" | "research" | "coding" | "long-context" | "image";
export type FreeWindowKind = "rolling" | "fixed" | "anchored" | "unknown";
export type FreeCommercialUse = "allowed" | "restricted" | "unknown";
export type FreeConfidence = "official" | "community_observed" | "derived" | "estimated" | "unknown";
export type ModelAccess = "default" | "selector" | "fallback" | "temporary";

export interface FreeLimit {
  metric: string;
  amount: number | null;
  window: string;
  windowKind: FreeWindowKind;
  note?: string;
}

interface FreeModels {
  default: string;
  best: string;
  access: ModelAccess;
  confidence: FreeConfidence;
}

interface FreeSource {
  title: string;
  url: string;
  checkedAt: string;
  publishedAt?: string;
}

export interface FreeOffer {
  id: string;
  provider: string;
  name: string;
  type: FreeOfferType;
  price: 0;
  regions: string[];
  models: FreeModels;
  usage: FreeUsage[];
  features: string[];
  limits: FreeLimit[];
  fallbacks: string[];
  commercialUse: FreeCommercialUse;
  source: FreeSource;
  confidence: FreeConfidence;
}

interface RawFreeLimit {
  metric: string;
  amount: number | null;
  window: string;
  windowKind: string;
  note?: string;
}

export interface RawFreeOffer {
  id: string;
  provider: string;
  name: string;
  type: string;
  price: number;
  regions: string[];
  models: { default: string; best: string; access: string; confidence: string };
  usage: string[];
  features: string[];
  limits: RawFreeLimit[];
  fallbacks: string[];
  commercialUse: string;
  source: { title: string; url: string; checkedAt: string; publishedAt?: string };
  confidence: string;
}

const TYPES = ["chat", "coding-agent", "cli", "api", "ide", "image"] as const;
const USAGES = ["general", "research", "coding", "long-context", "image"] as const;
const WINDOW_KINDS = ["rolling", "fixed", "anchored", "unknown"] as const;
const COMMERCIAL_USE = ["allowed", "restricted", "unknown"] as const;
const CONFIDENCE = ["official", "community_observed", "derived", "estimated", "unknown"] as const;
const MODEL_ACCESS = ["default", "selector", "fallback", "temporary"] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(allowed: readonly T[], value: string, field: string, row: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${row}: ${field} "${value}" is not one of ${allowed.join(" · ")}`);
  }
  return value as T;
}

function text(value: unknown, field: string, row: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${row}: ${field} must be a non-empty string`);
  }
  return value;
}

function stringList(value: unknown, field: string, row: string, nonEmpty = false): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${row}: ${field} must be an array of non-empty strings`);
  }
  if (nonEmpty && value.length === 0) {
    throw new Error(`${row}: ${field} must not be empty`);
  }
  return value as string[];
}

function isoDate(value: unknown, field: string, row: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${row}: ${field} "${String(value)}" is not an ISO date (YYYY-MM-DD)`);
  }
  return value;
}

function narrowLimit(raw: RawFreeLimit, row: string): FreeLimit {
  if (raw == null || typeof raw !== "object") throw new Error(`${row}: each limit must be an object`);
  const metric = text(raw.metric, "limits.metric", row);
  if (raw.amount !== null && (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount < 0)) {
    throw new Error(`${row}: limits.amount for "${metric}" must be a non-negative number or null`);
  }
  return {
    metric,
    amount: raw.amount,
    window: text(raw.window, "limits.window", row),
    windowKind: oneOf(WINDOW_KINDS, raw.windowKind, "limits.windowKind", row),
    ...(raw.note == null ? {} : { note: text(raw.note, "limits.note", row) }),
  };
}

function narrowSource(raw: RawFreeOffer["source"] | undefined, row: string): FreeSource {
  if (raw == null) throw new Error(`${row}: source is required`);
  const url = text(raw.url, "source.url", row);
  if (!url.startsWith("https://")) throw new Error(`${row}: source.url must be an https URL`);
  return {
    title: text(raw.title, "source.title", row),
    url,
    checkedAt: isoDate(raw.checkedAt, "source.checkedAt", row),
    ...(raw.publishedAt == null ? {} : { publishedAt: isoDate(raw.publishedAt, "source.publishedAt", row) }),
  };
}

/** Exported so the validation it does can be tested directly against synthetic rows. */
export function narrowFreeOffer(raw: RawFreeOffer): FreeOffer {
  if (raw == null || typeof raw !== "object") throw new Error("free offer must be an object");
  const row = typeof raw.id === "string" && raw.id.trim() ? raw.id : "free offer";
  if (raw.price !== 0) {
    throw new Error(`${row}: price ${raw.price} is not 0 — every free offer must cost $0`);
  }
  if (raw.models == null) throw new Error(`${row}: models is required`);
  if (!Array.isArray(raw.limits)) throw new Error(`${row}: limits must be an array`);

  return {
    id: text(raw.id, "id", row),
    provider: text(raw.provider, "provider", row),
    name: text(raw.name, "name", row),
    type: oneOf(TYPES, raw.type, "type", row),
    price: 0,
    regions: stringList(raw.regions, "regions", row, true),
    models: {
      default: text(raw.models.default, "models.default", row),
      best: text(raw.models.best, "models.best", row),
      access: oneOf(MODEL_ACCESS, raw.models.access, "models.access", row),
      confidence: oneOf(CONFIDENCE, raw.models.confidence, "models.confidence", row),
    },
    usage: stringList(raw.usage, "usage", row, true).map(usage => oneOf(USAGES, usage, "usage", row)),
    features: stringList(raw.features, "features", row),
    limits: raw.limits.map(limit => narrowLimit(limit, row)),
    fallbacks: stringList(raw.fallbacks, "fallbacks", row),
    commercialUse: oneOf(COMMERCIAL_USE, raw.commercialUse, "commercialUse", row),
    source: narrowSource(raw.source, row),
    confidence: oneOf(CONFIDENCE, raw.confidence, "confidence", row),
  };
}

function narrowFreeOffers(offers: RawFreeOffer[]): FreeOffer[] {
  const narrowed = offers.map(narrowFreeOffer);
  const seen = new Set<string>();
  for (const offer of narrowed) {
    if (seen.has(offer.id)) throw new Error(`duplicate free offer id "${offer.id}"`);
    seen.add(offer.id);
  }
  return narrowed;
}

export const FREE_OFFERS: FreeOffer[] = narrowFreeOffers(rows as RawFreeOffer[]);

/** The oldest verification date in the $0 catalogue, never the newest. */
export const FREE_CHECKED_ON = FREE_OFFERS.reduce(
  (oldest, offer) => (offer.source.checkedAt < oldest ? offer.source.checkedAt : oldest),
  FREE_OFFERS[0].source.checkedAt,
);

export const USAGE_FILTERS: readonly { id: FreeUsage; label: string }[] = [
  { id: "general", label: "General chat" },
  { id: "research", label: "Research" },
  { id: "coding", label: "Coding" },
  { id: "long-context", label: "Long context" },
  { id: "image", label: "Images" },
];

export function freeByUsage(usage: string): FreeOffer[] {
  return FREE_OFFERS.filter(offer => (offer.usage as readonly string[]).includes(usage));
}
