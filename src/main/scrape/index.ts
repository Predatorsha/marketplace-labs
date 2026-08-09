import type { AppConfig } from '../config'
import { browserManager } from '../browser/manager'
import { applyProductMarketplaceStatus, upsertProductFromSaved } from '../code/products'
import { jobLog } from '../jobs/log'
import { saveScrapedProductToDisk } from '../products/files'
import type { ProductDownloadResult } from '../../shared/types'
import { ALIEXPRESS_IMAGE_REFERER } from './aliexpress/product'
import { scrapeProductPage } from './product'
import { TEMU_IMAGE_REFERER } from './temu/product'
import { resolveTemuSellerStore } from './temu/seller'
import { parseProductUrl } from './url'

/**
 * Single product-scrape entry point.
 *
 * Flow: scrape PDP fields → gallery photos → save to disk → (Temu) store same-tab
 * → upsert DB → close browser.
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
      try {
        const page = await browserManager.ensureStarted(cfg.browser)

        // Navigation + platform auth HumanGate happen inside scrapeProductPage (Temu → ensureTemuLoggedIn).
        const scraped = await scrapeProductPage(page, {
          platform: parsed.platform,
          url: parsed.url,
          productId: parsed.productId
        })

        // Unavailable PDP: flip catalog status only (no gallery/price to save).
        if (scraped.status === 'archived' && !scraped.choices?.length) {
          const applied = applyProductMarketplaceStatus(cfg, {
            platform: parsed.platform,
            marketplace_product_id: scraped.product_id,
            status: 'archived',
            url: scraped.url ?? parsed.url
          })
          if (!applied.ok) {
            jobLog(`scrape unavailable (not in catalog) product_id=${scraped.product_id}`)
            return { ok: false, error: applied.error }
          }
          jobLog(
            `scrape unavailable platform=${parsed.platform} product_id=${scraped.product_id}` +
              ` status=${applied.status}${applied.changed ? ' (changed)' : ''}`
          )
          return {
            ok: true,
            platform: parsed.platform,
            product_id: scraped.product_id,
            folder: applied.folder ?? undefined,
            title: applied.title,
            url: applied.url,
            status: applied.status
          }
        }

        // Fields + gallery already scraped; download photos to disk.
        const saved = await saveScrapedProductToDisk(cfg, {
          platform: parsed.platform,
          product: scraped,
          imageReferer:
            parsed.platform === 'temu' ? TEMU_IMAGE_REFERER : ALIEXPRESS_IMAGE_REFERER
        })

        // Temu: click store icon in the same tab, capture store_url + mall_id.
        if (parsed.platform === 'temu') {
          const store = await resolveTemuSellerStore(page)
          if (store.storeUrl && store.sellerId) {
            saved.product.store_url = store.storeUrl
            saved.product.seller_id = store.sellerId
            jobLog(
              `temu store ok seller_id=${store.sellerId} store_url=${store.storeUrl.slice(0, 120)}`
            )
          } else {
            jobLog(`temu store resolve failed product_id=${saved.product.product_id}`)
          }
        }

        const { tags, my_rating, purpose, pack_quantity } = await upsertProductFromSaved(cfg, {
          platform: parsed.platform,
          product: {
            ...(saved.product as Record<string, unknown>),
            status: scraped.status ?? 'active'
          },
          folder: saved.folder
        })

        const choices = saved.product.local_files?.choices ?? []
        const price =
          choices
            .map((c) => String(c.price || '').trim())
            .filter(Boolean)
            .join('; ') || null

        jobLog(
          `scrape ok platform=${parsed.platform} product_id=${saved.product.product_id} folder=${saved.folder}` +
            ` status=${scraped.status ?? 'active'}`
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
          status: scraped.status ?? 'active'
        }
      } finally {
        // Persist profile cookies, then shut Chromium so it does not linger after scrape.
        await browserManager.close()
      }
    })
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    jobLog(`scrape fail ${message}`)
    return { ok: false, error: message }
  }
}
