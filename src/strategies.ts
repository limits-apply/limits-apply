import { mountChrome } from "./ui/chrome";
import { renderFreshness } from "./ui/freshness";
import { renderStrategiesPage } from "./ui/strategies-page";
import { wireTooltips } from "./ui/tooltip";

renderFreshness("footer-freshness");
mountChrome();
renderStrategiesPage();
wireTooltips();
