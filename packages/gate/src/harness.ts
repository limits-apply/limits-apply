export interface ConfigChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/** A field that already holds the value Gate would write is not a change, so re-running is a no-op. */
export function recorder(changes: ConfigChange[]) {
  return (field: string, oldValue: unknown, newValue: unknown): void => {
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes.push({ field, oldValue, newValue });
  };
}

export type HarnessMerge = (
  config: Record<string, unknown>,
  proxy?: string,
) => { config: Record<string, unknown>; changes: ConfigChange[] };
