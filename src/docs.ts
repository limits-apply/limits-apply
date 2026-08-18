import { renderFreshness } from "./ui/freshness";
import { highlightCode } from "./ui/highlight";
import { renderHarnesses } from "./ui/harness-table";
import { mountSectionSpy } from "./ui/docs-nav";
import { mountThemeToggle } from "./ui/theme";

renderFreshness("footer-freshness");
mountThemeToggle("theme");
mountSectionSpy();
if (document.getElementById("harness-cards")) renderHarnesses();
highlightCode();
