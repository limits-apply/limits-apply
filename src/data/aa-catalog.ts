/**
 * Artificial Analysis discovery registry — every scored model in the snapshot,
 * not only the curated slugs `src/data/aa.ts` maps.
 *
 * This is discovery, never evaluation: a row here says AA scored the model, not
 * that any subscription grants it. `UNMAPPED_CATALOG` is the gap a human still has
 * to close by checking a provider page.
 *
 * Reads data/aa-catalog.json.
 */
import { MAPPED_AA_SLUGS } from "./aa";
import catalog from "../../data/aa-catalog.json";

export interface CatalogModel {
  slug: string;
  name: string;
  /** AA Intelligence Index. */
  intelligence: number;
}

export const CATALOG_VERIFIED: string = catalog.retrieved_on;

export const CATALOG_MODELS: CatalogModel[] = catalog.models.map(model => ({
  slug: model.slug,
  name: typeof model.name === "string" && model.name.trim() ? model.name : model.slug,
  intelligence: model.intelligence,
}));

export const CATALOG_TOTAL = CATALOG_MODELS.length;

const mapped = new Set(MAPPED_AA_SLUGS);

export const UNMAPPED_CATALOG: CatalogModel[] = CATALOG_MODELS
  .filter(model => !mapped.has(model.slug));

export const MAPPED_CATALOG_COUNT = CATALOG_TOTAL - UNMAPPED_CATALOG.length;
