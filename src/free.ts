import { mountChrome } from "./ui/chrome";
import { renderFreshness } from "./ui/freshness";
import { renderFreePage } from "./ui/free-page";
import { wireTooltips } from "./ui/tooltip";

renderFreshness("footer-freshness");
mountChrome();
renderFreePage();
wireTooltips();
