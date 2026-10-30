import { mountChrome } from "./ui/chrome";
import { renderCodingPage } from "./ui/coding-page";
import { renderFreshness } from "./ui/freshness";
import { wireSortables } from "./ui/table-sort";
import { wireTooltips } from "./ui/tooltip";

renderFreshness("footer-freshness");
mountChrome();
renderCodingPage();
wireSortables();
wireTooltips();
