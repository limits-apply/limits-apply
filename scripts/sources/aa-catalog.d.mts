/** Types for the exports test/aa-catalog.test.ts drives; `scripts/` is otherwise plain JS. */

export interface CatalogModel {
  slug: string;
  name: string;
  intelligence: number;
}

export interface Catalog {
  source_url: string;
  models: CatalogModel[];
}

export declare function catalogFromPage(html: string): Catalog;

export declare function fetchAaCatalog(): Promise<Catalog>;

export declare function summarizeCatalog(catalog: Catalog): string;
