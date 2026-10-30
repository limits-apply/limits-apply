import { mountChrome } from "./ui/chrome";
import { mountSectionSpy } from "./ui/docs-nav";
import { renderFreshness } from "./ui/freshness";
import { renderHarnesses } from "./ui/harness-table";
import { highlightCode } from "./ui/highlight";

renderFreshness("footer-freshness");
mountChrome();
mountSectionSpy();
if (document.getElementById("harness-cards")) renderHarnesses();
highlightCode();
