import { describe, expect, it } from "vitest";

import { compare, reorder } from "../src/ui/table-sort";

const order = (cells: string[], numeric: boolean, dir: 1 | -1) =>
  [...cells].sort((a, b) => compare(a, b, numeric, dir));

describe("table sorting", () => {
  it("reads the figure a cell leads with, past its band and its rung", () => {
    const cells = ["12.4 modelled 8.1 – 19 tok/s", "48.2 observed 44 – 51 tok/s", "3.9 modelled 2 – 6 tok/s"];
    expect(order(cells, true, -1)[0]).toContain("48.2");
    expect(order(cells, true, 1)[0]).toContain("3.9");
  });

  it("reads thousands separators as one number, not as the digits before the comma", () => {
    expect(order(["$1,234", "$900"], true, -1)).toEqual(["$1,234", "$900"]);
  });

  it("reads a footprint past the unit and the line under it", () => {
    expect(order(["42 GB fits 36 GB", "9.6 GB fits 36 GB"], true, -1)[0]).toBe("42 GB fits 36 GB");
  });

  it("sorts a cell with no number last in both directions", () => {
    expect(order(["—", "$12.00", "$3.00"], true, -1)).toEqual(["$12.00", "$3.00", "—"]);
    expect(order(["—", "$12.00", "$3.00"], true, 1)).toEqual(["$3.00", "$12.00", "—"]);
  });

  it("sorts a boolean column from its stated value, not from an empty square", () => {
    expect(order(["0", "1", "0", "1"], true, -1)).toEqual(["1", "1", "0", "0"]);
  });

  it("ignores digits inside a name — a text column is text", () => {
    expect(order(["Qwen3 30B-A3B", "Gemma 3 12B"], false, 1)).toEqual(["Gemma 3 12B", "Qwen3 30B-A3B"]);
    expect(order(["Qwen3 30B-A3B", "Gemma 3 12B"], false, -1)).toEqual(["Qwen3 30B-A3B", "Gemma 3 12B"]);
  });
});

describe("sortable rows", () => {
  const keys = [(row: { price: number }) => row.price];

  it("keeps a rank attached to its row", () => {
    const rows = [{ rank: 1, price: 8 }, { rank: 2, price: 3 }];
    expect(reorder(rows, keys, [true], { col: 0, dir: 1 })).toEqual([
      { rank: 2, price: 3 }, { rank: 1, price: 8 },
    ]);
  });

  it("keeps input order among ties", () => {
    const rows = [{ id: "a", price: 8 }, { id: "b", price: 8 }, { id: "c", price: 3 }];
    expect(reorder(rows, keys, [true], { col: 0, dir: -1 })).toEqual([
      { id: "a", price: 8 }, { id: "b", price: 8 }, { id: "c", price: 3 },
    ]);
  });

  it("puts absent figures last in either direction", () => {
    const rows = [{ price: 8 }, { price: NaN }, { price: 3 }];
    expect(reorder(rows, keys, [true], { col: 0, dir: 1 })[2].price).toBeNaN();
    expect(reorder(rows, keys, [true], { col: 0, dir: -1 })[2].price).toBeNaN();
  });
});
