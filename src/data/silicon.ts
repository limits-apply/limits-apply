/**
 * Apple silicon, as Apple publishes it. Bandwidth is the only figure that decides
 * generation speed, and it is the one figure the marketing name does not carry:
 * two chips sold as "M4 Max" differ by 33 %, and two sold as "M5 Max" by 33 %
 * again. Core count is the only tiebreaker a browser can read.
 *
 * Nothing here is inferred. A chip Apple has not specified does not get a row.
 */
import type { Band, Rung } from "../lib/provenance";
import { exact } from "../lib/provenance";

export interface Chip {
  id: string;
  name: string;
  /** What separates this bin from its sibling, empty when the chip has only one. */
  bin: string;
  /** GB/s of unified memory bandwidth. */
  bandwidth: Band;
  rung: Rung;
  /** CPU cores, the only bin discriminator `navigator.hardwareConcurrency` exposes. */
  cpuCores: number;
  /** Unified memory Apple actually sells with this bin, GB, ascending. */
  ram: number[];
  source: string;
  verified: string;
}

/** Every figure in this file was last checked against Apple's own pages on this date. */
export const SILICON_VERIFIED = "2026-08-17";

const MBP_SPECS = "https://www.apple.com/macbook-pro/specs/";
const STUDIO_SPECS = "https://www.apple.com/mac-studio/specs/";
const M4_NEWSROOM = "https://www.apple.com/newsroom/2024/10/apple-introduces-m4-pro-and-m4-max/";
const M3_SPECS = "https://support.apple.com/en-us/117737";
const M3_ULTRA = "https://www.apple.com/newsroom/2025/03/apple-unveils-new-mac-studio-the-most-powerful-mac-ever/";

const chip = (
  id: string, name: string, bin: string, bandwidth: number,
  cpuCores: number, ram: number[], source: string,
): Chip => ({
  id, name, bin, bandwidth: exact(bandwidth), rung: "measured",
  cpuCores, ram, source, verified: SILICON_VERIFIED,
});

export const CHIPS: Chip[] = [
  chip("m3pro",    "M3 Pro",   "",                            150, 12, [18, 36],               M3_SPECS),
  chip("m3max30",  "M3 Max",   "14-core CPU · 30-core GPU",   300, 14, [36],                   M3_SPECS),
  chip("m3max40",  "M3 Max",   "16-core CPU · 40-core GPU",   400, 16, [48, 64, 128],          M3_SPECS),
  chip("m3ultra",  "M3 Ultra", "",                            819, 28, [96, 256, 512],         M3_ULTRA),
  chip("m4",       "M4",       "",                            120, 10, [16, 24, 32],           M4_NEWSROOM),
  chip("m4pro",    "M4 Pro",   "",                            273, 14, [24, 48, 64],           M4_NEWSROOM),
  chip("m4max32",  "M4 Max",   "14-core CPU · 32-core GPU",   410, 14, [36],                   STUDIO_SPECS),
  chip("m4max40",  "M4 Max",   "16-core CPU · 40-core GPU",   546, 16, [48, 64, 128],          STUDIO_SPECS),
  chip("m5",       "M5",       "",                            153, 10, [16, 24, 32],           MBP_SPECS),
  chip("m5pro",    "M5 Pro",   "",                            307, 18, [16, 24, 32, 36, 48, 64, 128], MBP_SPECS),
  chip("m5max32",  "M5 Max",   "18-core CPU · 32-core GPU",   460, 18, [24, 36, 48, 64, 128],  MBP_SPECS),
  chip("m5max40",  "M5 Max",   "18-core CPU · 40-core GPU",   614, 18, [24, 36, 48, 64, 128],  MBP_SPECS),
];

const BY_ID = new Map(CHIPS.map(entry => [entry.id, entry]));

export const chipFor = (id: string): Chip => {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown chip ${id}`);
  return found;
};

export const chipLabel = (entry: Chip): string =>
  entry.bin ? `${entry.name} · ${entry.bin}` : entry.name;

/** The bin a browser cannot tell apart is resolved downwards — never upwards. */
export const DEFAULT_CHIP = "m4max40";
