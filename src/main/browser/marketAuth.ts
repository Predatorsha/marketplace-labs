import type { Page } from 'playwright'

export type ProgressFn = (data: Record<string, unknown>) => void

/**
 * Placeholder for marketplace login checks.
 * Full AE login / human-gate flow lives with scrape code (not moved yet).
 */
export async function ensurePlatformLoggedIn(
  _page: Page,
  _opts?: { progress?: ProgressFn; timeoutMs?: number }
): Promise<void> {
  /* no-op until scrape / auth helpers are moved */
}

/** No-op marker for pages; auth is explicit when scrape returns. */
export function installMarketAuthGuard(_page: Page): void {
  /* intentionally empty — see ensurePlatformLoggedIn */
}
