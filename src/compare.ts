import { mountChrome } from "./ui/chrome";
import { renderComparePage } from "./ui/compare-page";
import { renderFreshness } from "./ui/freshness";
import { wireTooltips } from "./ui/tooltip";

renderFreshness("footer-freshness");
mountChrome();
renderComparePage();
wireTooltips();
