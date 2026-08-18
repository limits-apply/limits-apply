/**
 * The freshness line, shared by both entries. The reported date is deliberately
 * the **oldest** verification across the whole site, not the newest — two pages
 * with independent snapshots do not get to quote whichever is younger.
 */
import { AA_SNAPSHOT } from "../data/aa";
import { LOCAL_AA_SNAPSHOT } from "../data/local-models";
import { MEASUREMENTS_VERIFIED } from "../data/local-measurements";
import { STALE_DAYS, VERIFIED_ON } from "../data/plans";
import { SILICON_VERIFIED } from "../data/silicon";
import { el } from "./dom";

const daysSince = (iso: string) => (Date.now() - Date.parse(iso)) / 86400000;

/** Every dated snapshot on the site. The oldest of these is what gets printed. */
const VERIFICATIONS = [
  VERIFIED_ON, AA_SNAPSHOT.verified, LOCAL_AA_SNAPSHOT.verified, SILICON_VERIFIED, MEASUREMENTS_VERIFIED,
];

const OLDEST_VERIFICATION = VERIFICATIONS.reduce((a, b) => (a < b ? a : b));

/** Writes the line into the id given. The footer carries it, and nothing else does. */
export function renderFreshness(id: string): void {
  const age = daysSince(OLDEST_VERIFICATION);
  el(id).textContent = `Snapshot: ${OLDEST_VERIFICATION} · AA Index v${AA_SNAPSHOT.version}`
    + (age > STALE_DAYS ? ` · ${Math.floor(age)} days old — treat as stale` : "")
    + ". Prices, model access and quotas move in weeks; re-verify before relying on any row.";
}
