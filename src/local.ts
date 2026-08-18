import { renderFreshness } from "./ui/freshness";
import { renderLocalHero, renderLocalNotes, renderLocalTable, wireWeighting } from "./ui/local-table";
import { wireSiliconPicker } from "./ui/silicon-picker";
import { wireSortables } from "./ui/table-sort";
import { mountThemeToggle } from "./ui/theme";
import { wireTooltips } from "./ui/tooltip";

wireTooltips();
renderLocalNotes();
wireSiliconPicker(machine => { renderLocalHero(machine); renderLocalTable(machine); });
wireWeighting();
renderFreshness("footer-freshness");
mountThemeToggle("theme");
wireSortables();
