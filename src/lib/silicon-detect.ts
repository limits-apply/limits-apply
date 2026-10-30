/**
 * Which Mac is this. Pure string work — the WebGL call that produces `renderer`
 * belongs to the picker, not here, so the parsing stays testable.
 *
 * Chrome exposes the marketing name through ANGLE. Safari returns "Apple GPU"
 * and nothing else, which is a normal answer, not a failure. Nothing in a
 * browser reports installed RAM, so RAM is never guessed.
 */

/**
 * Marketing name → the chip ids it covers, weakest bin first, and the CPU-core
 * count above which the stronger bin is the answer. `splitAt: null` means the
 * bins are separated by GPU cores, which no browser reports — so the weaker one
 * wins, because overstating a machine is the one error this page cannot make.
 */
const BINS: Record<string, { ids: string[]; splitAt: number | null }> = {
  "M3 Pro": { ids: ["m3pro"], splitAt: null },
  "M3 Max": { ids: ["m3max30", "m3max40"], splitAt: 14 },
  "M3 Ultra": { ids: ["m3ultra"], splitAt: null },
  "M4": { ids: ["m4"], splitAt: null },
  "M4 Pro": { ids: ["m4pro"], splitAt: null },
  "M4 Max": { ids: ["m4max32", "m4max40"], splitAt: 14 },
  "M5": { ids: ["m5"], splitAt: null },
  "M5 Pro": { ids: ["m5pro"], splitAt: null },
  "M5 Max": { ids: ["m5max32", "m5max40"], splitAt: null },
};

/** A chip id, or null when the string names no Mac we carry a bandwidth for. */
export function parseRenderer(renderer: string, cores: number): string | null {
  const match = /Apple (M\d(?: Pro| Max| Ultra)?)\b/.exec(renderer);
  const bin = match && BINS[match[1]];
  if (!bin) return null;
  return bin.splitAt != null && cores > bin.splitAt ? bin.ids[1] : bin.ids[0];
}

/** Chips whose bins a browser cannot tell apart — the picker says so out loud. */
export const AMBIGUOUS_BINS = Object.entries(BINS)
  .filter(([, bin]) => bin.ids.length > 1 && bin.splitAt == null)
  .map(([name]) => name);
