import aaSnapshotUrl from "../data/artificial-analysis.json?url&no-inline";
import { mountChrome } from "./ui/chrome";
import { renderScoreTable, wireScoreControls } from "./ui/decision-table";
import { renderFreshness } from "./ui/freshness";
import { wireSortables } from "./ui/table-sort";
import { wireTooltips } from "./ui/tooltip";

document.querySelector<HTMLAnchorElement>("#aa-snapshot-link")!.href = aaSnapshotUrl;

wireTooltips();
wireScoreControls();
renderScoreTable();
renderFreshness("footer-freshness");
mountChrome();
wireSortables();
