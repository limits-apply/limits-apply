/** Types for the exports test/gate-cli.test.ts uses; `scripts/` is otherwise plain JS. */

export declare const ROOT: string;

export declare function importedSnapshotPath(tsFile: string): { file: string; path: string };

export declare function importedSnapshot(tsFile: string): { file: string; snapshot: unknown };
