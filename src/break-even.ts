import { renderBreakEvenPage } from "./ui/break-even-page";
import { renderBreakEvenChart } from "./ui/charts";
import { renderFreshness } from "./ui/freshness";
import { renderStaircase } from "./ui/staircase";
import { mountThemeToggle } from "./ui/theme";
import { wireTooltips } from "./ui/tooltip";

wireTooltips();
renderBreakEvenPage();
renderStaircase();
renderBreakEvenChart();
renderFreshness("footer-freshness");
mountThemeToggle("theme");
