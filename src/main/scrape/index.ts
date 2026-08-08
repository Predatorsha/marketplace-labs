import type { AppConfig } from '../config'
import { browserManager } from '../browser/manager'
import { upsertProductFromSaved } from '../code/products'
import { jobLog } from '../jobs/log'
import { saveScrapedProductToDisk } from '../products/files'
import type { ProductDownloadResult } from '../../shared/types'
import { scrapeProductPage } from './product'
import { parseProductUrl } from './url'

/**
 * Single product-scrape entry point.
 *
 * Called from Import Download → preload downloadProduct → IPC products:download.
 * Receives a marketplace product URL from the UI; scrapes, saves to disk, upserts DB.
 *
 * Temu single-choice scrape is implemented; AliExpress / multi-choice TBD.
 */
export async function scrapeProduct(
  cfg: AppConfig,
  url: string
): Promise<ProductDownloadResult> {
  const trimmed = String(url || '').trim()
  if (!trimmed) {
    return { ok: false, error: 'url is required' }
  }

  try {
    const parsed = parseProductUrl(trimmed)

    return await browserManager.withLock(async () => {
      const page = await browserManager.ensureStarted(cfg.browser)

      // Navigation + platform auth HumanGate happen inside scrapeProductPage (Temu → ensureTemuLoggedIn).
      const scraped = await scrapeProductPage(page, {
        platform: parsed.platform,
        url: parsed.url,
        productId: parsed.productId
      })

      const saved = await saveScrapedProductToDisk(cfg, {
        platform: parsed.platform,
        product: scraped
      })

      const { tags, my_rating, purpose, pack_quantity } = await upsertProductFromSaved(cfg, {
        platform: parsed.platform,
        product: saved.product as Record<string, unknown>,
        folder: saved.folder
      })

      const choices = saved.product.local_files?.choices ?? []
      const price =
        choices
          .map((c) => String(c.price || '').trim())
          .filter(Boolean)
          .join('; ') || null

      jobLog(
        `scrape ok platform=${parsed.platform} product_id=${saved.product.product_id} folder=${saved.folder}`
      )

      return {
        ok: true,
        platform: parsed.platform,
        product_id: saved.product.product_id,
        folder: saved.folder,
        title: saved.product.title ?? null,
        url: saved.product.url ?? parsed.url,
        purpose,
        pack_quantity,
        my_rating,
        price,
        tags,
        status: 'active'
      }
    })
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    jobLog(`scrape fail ${message}`)
    return { ok: false, error: message }
  }
}
