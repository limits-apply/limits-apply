/**
 * When each weights file in the local tier was released. Reads
 * data/model-releases-2026-08-19.json, written by `node scripts/refresh.mjs releases`.
 *
 * Its own module rather than a second table inside `local-models.ts`, because
 * `scripts/refresh.mjs` reads the `import snapshot from` line to learn which snapshot
 * the site is actually showing — one adopted snapshot per module keeps that
 * unambiguous. This table used to be hand-transcribed from the same file, which is
 * the one place a snapshot could drift from what the page claimed without anything
 * noticing.
 */
import snapshot from "../../data/model-releases-2026-08-19.json";
import { LOCAL_MODELS, type LocalModel } from "./local-models";

export interface Release {
  /** Who made the weights. Also the icon slug — see scripts/favicons.sh. */
  maker: string;
  /** ISO date. */
  on: string;
  /**
   * `catalogue`: models.dev publishes a release date, and this is the one most of
   * its providers agree on. `weights`: nobody publishes one, so the date the weights
   * repository was created stands in for it — a proxy, one rung weaker.
   */
  via: "catalogue" | "weights";
  /** Listings that agree on the date, of listings found. Both zero under `weights`. */
  agree: [number, number];
}

export const RELEASE_SNAPSHOT = {
  verified: snapshot.retrieved_on,
  source: snapshot.source_url,
  fallback: snapshot.fallback_url,
};

const VIA = ["catalogue", "weights"] as const;

/** The weights file each AA row is served from — a release is a property of the file. */
const WEIGHTS_KEY = new Map(LOCAL_MODELS.map(model => [model.name, model.weightsKey]));

/**
 * Keyed on the weights file, not the AA row: a release date is a property of the
 * weights, so both reasoning modes of one model share it — the same reason
 * `MEASUREMENTS` key on `weightsKey`.
 */
export const LOCAL_RELEASES: Record<string, Release> = Object.fromEntries(
  snapshot.models.map(row => {
    const key = WEIGHTS_KEY.get(row.name);
    if (!key) {
      throw new Error(`the releases snapshot carries "${row.name}", which no model in local-models.ts serves`);
    }
    if (!(VIA as readonly string[]).includes(row.released.via)) {
      throw new Error(`${row.name}: released.via "${row.released.via}" is not one of ${VIA.join(" · ")}`);
    }
    return [key, {
      maker: row.maker,
      on: row.released.on,
      via: row.released.via as Release["via"],
      agree: [row.agree, row.listings] as [number, number],
    }];
  }),
);

export const releaseFor = (model: LocalModel): Release | null =>
  LOCAL_RELEASES[model.weightsKey] ?? null;
