import type { Page } from 'playwright'
import type { MarketplacePlatform } from './url'
import { scrapeAliExpressProductPage } from './aliexpress/product'
import { scrapeTemuProductPage } from './temu/product'

/**
 * Raw product payload produced by Playwright scrapers.
 * After images/choices are saved to disk, pass this (with `local_files` filled)
 * to `upsertProductFromSaved` in code/products.ts.
 */
export type ScrapedChoiceDraft = {
  /** Remote image URL for this choice (trailing gallery photo), null when unknown. */
  image_url?: string | null
  name?: string | null
  group?: string | null
  price: string
}

export type ScrapedProduct = {
  product_id: string
  title?: string | null
  url?: string | null
  purpose?: string | null
  pack_quantity?: number | null
  tags?: string[]
  rating?: string | null
  review_count?: string | null
  description?: string | null
  description_html?: string | null
  orders?: string | null
  seller_name?: string | null
  seller_id?: string | null
  store_url?: string | null
  video?: string | null
  specs?: Record<string, unknown>
  /**
   * Marketplace availability from the live PDP.
   * `archived` = unavailable for purchase; `active` = normal buyable page.
   */
  status?: 'active' | 'archived'
  /** Remote gallery URLs (excludes choice image). Consumed by saveScrapedProductToDisk. */
  gallery_image_urls?: string[]
  /** Choice drafts before disk save, in buy-box radio order. */
  choices?: ScrapedChoiceDraft[]
  /** Filled after save-to-disk (relative paths under the product folder). */
  local_files?: {
    images?: string[]
    choices?: Array<{
      file: string
      name?: string | null
      group?: string | null
      price: string
    }>
  }
}

/**
 * Navigate + scrape one product page (used only by scrapeProduct).
 */
export async function scrapeProductPage(
  page: Page,
  opts: { platform: MarketplacePlatform; url: string; productId: string }
): Promise<ScrapedProduct> {
  if (opts.platform === 'temu') {
    return scrapeTemuProductPage(page, { url: opts.url, productId: opts.productId })
  }
  if (opts.platform === 'aliexpress') {
    return scrapeAliExpressProductPage(page, { url: opts.url, productId: opts.productId })
  }
  throw new Error(`scrapeProductPage: platform "${opts.platform}" is not implemented yet`)
}
