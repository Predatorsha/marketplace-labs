import type { Page } from 'playwright'
import type { MarketplacePlatform } from './url'

/**
 * TODO(playwright-scrape): scrape marketplace order lists / details and
 * feed code/orders.ts upsert helpers (upsertOrdersFromScraped or
 * equivalent). Wire from ipc/handlers/orders.ts `orders:start`.
 */
export async function scrapeOrders(
  _page: Page,
  _opts: { platform: MarketplacePlatform }
): Promise<void> {
  throw new Error('scrapeOrders is not implemented yet (see TODO in scrape/orders.ts)')
}
