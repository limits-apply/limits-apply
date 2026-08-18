export interface IntelligenceReading {
  index: number;
  variant: string;
}

const SPAN = /<span>(\d+)<\/span><\/div><div class="[^"]*">Artificial Analysis Intelligence Index/;
const PROSE = /([^<>]{1,80}?) scores (\d+) on the Artificial Analysis Intelligence Index/;

export function slugFor(model: string, aaSlug?: string): string {
  return aaSlug ?? model.replace(/\./g, "-");
}

export function parseIntelligenceIndex(doc: string, slug: string): IntelligenceReading {
  const span = SPAN.exec(doc);
  const prose = PROSE.exec(doc);
  if (!span && !prose) throw new Error(`${slug}: no Intelligence Index found — AA changed their markup`);
  if (!span || !prose) {
    throw new Error(`${slug}: only the ${span ? "headline stat" : "prose"} carried an index; refusing a single witness`);
  }
  if (span[1] !== prose[2]) {
    throw new Error(`${slug}: headline says ${span[1]}, prose says ${prose[2]}. The page likely mixes two effort variants — resolve by hand.`);
  }
  const index = Number(span[1]);
  if (index < 0 || index > 100) throw new Error(`${slug}: index ${index} outside 0-100`);
  return { index, variant: prose[1].trim() };
}
