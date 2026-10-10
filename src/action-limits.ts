export const BROWSER_WAIT_MAX_MS = 10_000;
export const BROWSER_WAIT_DEFAULT_MS = 1_000;

export function parseBrowserWaitMs(value: unknown): number {
  if (value === undefined) return BROWSER_WAIT_DEFAULT_MS;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > BROWSER_WAIT_MAX_MS) {
    throw new Error(`browser_wait ms must be an integer between 0 and ${BROWSER_WAIT_MAX_MS}.`);
  }
  return value;
}
