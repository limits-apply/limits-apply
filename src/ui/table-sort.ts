const NUMERIC_COLUMN = ".num, .disc, .r, .barcell, [data-num]";
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

const numberIn = (value: string): number | null => {
  const found = NUMBER.exec(value);
  return found ? Number(found[0].replace(/,/g, "")) : null;
};

export function compare(a: string | number, b: string | number, numeric: boolean, dir: 1 | -1): number {
  if (!numeric) return String(a).trim().localeCompare(String(b).trim()) * dir;
  const x = typeof a === "number" ? a : numberIn(a);
  const y = typeof b === "number" ? b : numberIn(b);
  const missing = (value: number | null): boolean => value == null || Number.isNaN(value);
  if (missing(x) || missing(y)) return Number(missing(x)) - Number(missing(y));
  return (x! - y!) * dir;
}

export function reorder<T>(
  rows: readonly T[],
  keys: ReadonlyArray<(row: T) => string | number | null>,
  numeric: readonly boolean[],
  active: { col: number; dir: 1 | -1 } | null,
): readonly T[] {
  if (!active) return rows;
  const key = keys[active.col];
  if (!key) throw new Error(`sort column ${active.col} has no accessor`);
  return [...rows].sort((a, b) => compare(key(a) ?? NaN, key(b) ?? NaN, !!numeric[active.col], active.dir));
}

interface Entry<T> {
  body: string;
  keys: ReadonlyArray<(row: T) => string | number | null>;
  render: () => void;
  initial?: { col: number; dir: 1 | -1 };
  active: { col: number; dir: 1 | -1 } | null;
  numeric: boolean[] | null;
}

const registry: Entry<unknown>[] = [];

function columns<T>(entry: Entry<T>): boolean[] {
  if (entry.numeric) return entry.numeric;
  const body = document.getElementById(entry.body);
  const cells = body?.closest("table")?.tHead?.rows[0]?.cells;
  if (!cells) throw new Error(`missing #${entry.body} table header`);
  if (cells.length !== entry.keys.length) {
    throw new Error(`#${entry.body}: ${entry.keys.length} sort keys for ${cells.length} columns`);
  }
  entry.numeric = [...cells].map(cell => cell.matches(NUMERIC_COLUMN));
  return entry.numeric;
}

export function sortable<T>(
  body: string,
  keys: ReadonlyArray<(row: T) => string | number | null>,
  render: () => void,
  initial?: { col: number; dir: 1 | -1 },
): (rows: readonly T[]) => readonly T[] {
  const entry: Entry<T> = { body, keys, render, initial, active: null, numeric: null };
  registry.push(entry as Entry<unknown>);
  return rows => reorder(rows, keys, columns(entry), entry.active ?? entry.initial ?? null);
}

function wire<T>(entry: Entry<T>): void {
  const body = document.getElementById(entry.body);
  const table = body?.closest("table");
  const head = table?.tHead?.rows[0];
  if (!head) throw new Error(`missing #${entry.body} table header`);
  const headers = [...head.cells] as HTMLTableCellElement[];
  columns(entry);
  headers.forEach(header => {
    header.setAttribute("aria-sort", "none");
    header.tabIndex = 0;
  });

  const initial = entry.active ?? entry.initial;
  if (initial) {
    headers[initial.col]?.setAttribute("aria-sort", initial.dir === 1 ? "ascending" : "descending");
  }

  const sortBy = (header: HTMLTableCellElement): void => {
    const col = headers.indexOf(header);
    if (col < 0) return;
    const previous = entry.active ?? entry.initial;
    const dir: 1 | -1 = previous?.col === col && previous.dir === -1 ? 1 : -1;
    entry.active = { col, dir };
    headers.forEach((other, index) =>
      other.setAttribute("aria-sort", index === col ? (dir === 1 ? "ascending" : "descending") : "none"));
    entry.render();
  };

  const headerOf = (event: Event) =>
    (event.target as HTMLElement | null)?.closest<HTMLTableCellElement>("th") ?? null;

  head.addEventListener("click", event => {
    const header = headerOf(event);
    if (header) sortBy(header);
  });
  head.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const header = headerOf(event);
    if (!header) return;
    event.preventDefault();
    sortBy(header);
  });
}

export function wireSortables(): void {
  registry.forEach(entry => wire(entry));
}
