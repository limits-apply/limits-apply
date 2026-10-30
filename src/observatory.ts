import type { Observatory } from "@limits-apply/intelligence";

import { mountChrome } from "./ui/chrome";
import { renderFreshness } from "./ui/freshness";
import { readObservatory, renderObservatory } from "./ui/observatory";

const EMPTY: Observatory = { schemaVersion: 1, observations: 0, admissibleIntervals: 0, groups: [] };

renderFreshness("footer-freshness");
mountChrome();

fetch("observatory.json")
  .then(response => (response.ok ? response.json() : Promise.reject(new Error(`observatory.json: ${response.status}`))))
  .then(raw => renderObservatory(readObservatory(raw) ?? EMPTY))
  .catch(() => renderObservatory(EMPTY));
