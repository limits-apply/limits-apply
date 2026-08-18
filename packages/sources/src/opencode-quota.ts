export interface OpencodeQuotaRow {
  model: string;
  displayName: string;
  requestsPerWindow: number;
  bonusIsPromotional: boolean;
  bonusLabel: string | null;
}

const ITEM = /<span[^>]*\bdata-item\b[^>]*>/g;
const VALUE = /<span data-value>([^<]+)<\/span>/;
const NAME = /<span data-name>([^<]+)<\/span>/;
const BONUS = /data-bonus[^>]*>([^<]+)</;

function attr(name: string, tag: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match ? match[1] : null;
}

function unescapeHtml(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
}

export function parseOpencodeQuota(doc: string, kind = "go"): OpencodeQuotaRow[] {
  const tags = [...doc.matchAll(ITEM)];
  const rows: OpencodeQuotaRow[] = [];
  for (let index = 0; index < tags.length; index += 1) {
    const match = tags[index];
    const start = match.index ?? 0;
    const end = tags[index + 1]?.index ?? doc.length;
    const tag = match[0];
    const segment = doc.slice(start + tag.length, end);
    if (attr("data-kind", tag) !== kind) continue;
    const model = attr("data-model", tag);
    const value = VALUE.exec(segment);
    if (!model || !value) continue;
    const name = NAME.exec(segment);
    const bonus = BONUS.exec(segment);
    rows.push({
      model,
      displayName: name ? unescapeHtml(name[1]).trim() : model,
      requestsPerWindow: Number(value[1].replace(/[^\d]/g, "")),
      bonusIsPromotional: bonus !== null,
      bonusLabel: bonus ? bonus[1].trim() : null,
    });
  }
  return rows;
}

export function validateOpencodeQuota(rows: OpencodeQuotaRow[], expectedRows: number): OpencodeQuotaRow[] {
  if (rows.length !== expectedRows) {
    throw new Error(`expected ${expectedRows} rows, got ${rows.length} — OpenCode changed their lineup or markup`);
  }
  if (new Set(rows.map(row => row.model)).size !== rows.length) {
    throw new Error("duplicate models — the kind filter leaked promo bars into plan rows");
  }
  for (const row of rows) {
    if (row.requestsPerWindow <= 0) throw new Error(`non-positive quota for ${row.model}: ${row.requestsPerWindow}`);
  }
  return rows;
}
