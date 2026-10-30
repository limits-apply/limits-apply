/**
 * ECB daily reference rates — the only fully deterministic source here. Writes
 * `data/fx-rates-<date>.json`, whose dated snapshot `src/data/plans.ts` imports as `FX`.
 */
import { get } from "./http.mjs";

const FEED_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** `FX.rates` only carries the currencies `ALT_PRICES` actually uses. */
const WANTED = ["USD"];

export async function fetchFx() {
  const xml = await get(FEED_URL, "application/xml");

  // The ECB publishes on TARGET business days only — the feed's own `time=` is
  // the date the rate actually applies to, which is not always the day this
  // script happens to run (a Saturday run still reads Friday's rate).
  const dateMatch = xml.match(/time='(\d{4}-\d{2}-\d{2})'/);
  if (!dateMatch) throw new Error("ECB feed's Cube time= date not found");

  const rates = {};
  for (const currency of WANTED) {
    const m = xml.match(new RegExp(`currency='${currency}'\\s+rate='([\\d.]+)'`));
    if (!m) throw new Error(`ECB feed no longer publishes a ${currency} rate`);
    rates[currency] = Number(m[1]);
  }
  return {
    // The ECB always quotes 1 EUR = rate <currency>, so rates.USD is already USD per EUR.
    rates: { EUR: rates.USD },
    source: FEED_URL,
    notes: "Normalized from the ECB XML feed; published reference-rate values are unchanged.",
    retrieved_on: dateMatch[1],
  };
}

export function summarizeFx(snapshot) {
  return `ecb · EUR ${snapshot.rates.EUR} USD`;
}
