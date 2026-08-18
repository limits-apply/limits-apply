import aaSnapshotUrl from "../data/artificial-analysis-2026-08-14.json?url&no-inline";
import { renderAgentTable } from "./ui/agents-table";
import { renderBudgetModal } from "./ui/budget-modal";
import { renderBreakEvenChart, renderParetoChart } from "./ui/charts";
import { renderCommunityMeasurements } from "./ui/community-table";
import { renderScoreTable, wireScoreControls } from "./ui/decision-table";
import { renderFreshness } from "./ui/freshness";
import { renderLedger } from "./ui/ledger-table";
import { renderPortfolio } from "./ui/portfolio";
import { wireSortables } from "./ui/table-sort";
import { mountThemeToggle } from "./ui/theme";
import { wireTooltips } from "./ui/tooltip";

document.querySelector<HTMLAnchorElement>("#aa-snapshot-link")!.href = aaSnapshotUrl;

wireTooltips();
wireScoreControls();
renderScoreTable();
renderAgentTable();
renderCommunityMeasurements();
renderFreshness("footer-freshness");
mountThemeToggle("theme");
renderBreakEvenChart();
renderParetoChart();
renderPortfolio();
renderBudgetModal();
renderLedger();
wireSortables();
