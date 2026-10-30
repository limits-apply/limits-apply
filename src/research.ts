import { renderAgentTable } from "./ui/agents-table";
import { renderBreakEvenAnchor } from "./ui/break-even-anchor";
import { renderBudgetModal } from "./ui/budget-modal";
import { renderBreakEvenChart, renderParetoChart } from "./ui/charts";
import { mountChrome } from "./ui/chrome";
import { renderCommunityMeasurements } from "./ui/community-table";
import { renderFreshness } from "./ui/freshness";
import { revealHashTarget } from "./ui/hash-target";
import { renderLedger } from "./ui/ledger-table";
import { renderPortfolio } from "./ui/portfolio";
import { wireSortables } from "./ui/table-sort";
import { wireTooltips } from "./ui/tooltip";

wireTooltips();
renderAgentTable();
renderCommunityMeasurements();
renderBreakEvenAnchor();
renderFreshness("footer-freshness");
mountChrome();
renderBreakEvenChart();
renderParetoChart();
renderPortfolio();
renderBudgetModal();
renderLedger();
wireSortables();

addEventListener("hashchange", () => revealHashTarget(location.hash));
if (location.hash) revealHashTarget(location.hash, "instant");
