import type { Page } from 'playwright'
import type { AppConfig } from '../config'
import { browserManager } from '../browser/manager'
import { latestOrderItemForProduct } from '../code/orders'
import { applyProductMarketplaceStatus, upsertProductFromSaved } from '../code/products'
import { connect } from '../core/connect'
import { jobLog } from '../jobs/log'
import { saveScrapedProductToDisk } from '../products/files'
import { findProductRow } from '../products/load'
import type {
  ProductDownloadResult,
  ProductImportSource,
  ProductKey
} from '../../shared/types'
import { ALIEXPRESS_IMAGE_REFERER } from './aliexpress/product'
import { scrapeProductPage, type OrderItemHint } from './product'
import { TEMU_IMAGE_REFERER } from './temu/product'
import { resolveTemuSellerStore } from './temu/seller'
import { parseProductUrl, type MarketplacePlatform, type ParsedProductUrl } from './url'

// Реферер для скачивания CDN-картинок; своим владеет каждый платформенный
// модуль, карта не даёт новой платформе молча провалиться в чужой referer.
const IMAGE_REFERER_BY_PLATFORM: Record<MarketplacePlatform, string> = {
  temu: TEMU_IMAGE_REFERER,
  aliexpress: ALIEXPRESS_IMAGE_REFERER
}

/**
 * Single product-scrape entry point.
 *
 * Flow: scrape PDP fields → gallery photos → save to disk → (Temu) store same-tab
 * → upsert DB → close browser.
 */
export async function scrapeProduct(
  cfg: AppConfig,
  url: string,
  opts?: {
    importSource?: ProductImportSource
    /** Данные позиции заказа — фолбэк для sold-out / удалённых карточек. */
    orderHint?: OrderItemHint
  }
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
        return await downloadProductWithPage(cfg, page, parsed, {
          importSource: opts?.importSource ?? 'link',
          orderHint: opts?.orderHint
        })
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

/**
 * Scrape + save + DB-upsert одного товара на уже открытой странице браузера.
 * Не трогает lifecycle браузера — используется и из scrapeProduct, и из синка
 * заказов, где страница живёт всю сессию.
 */
export async function downloadProductWithPage(
  cfg: AppConfig,
  page: Page,
  parsed: ParsedProductUrl,
  opts: {
    /**
     * Триггер импорта — задаётся вызывателем явно (по наличию orderHint его
     * не отличить: перекачка тоже передаёт восстановленный хинт). В БД поле
     * insert-only: у существующих карточек не меняется.
     */
    importSource: ProductImportSource
    /** Данные позиции заказа — фолбэк для sold-out / удалённых карточек. */
    orderHint?: OrderItemHint
  }
): Promise<ProductDownloadResult> {
  try {
    // Navigation + platform auth HumanGate happen inside scrapeProductPage (Temu → ensureTemuLoggedIn).
    const scraped = await scrapeProductPage(page, {
      platform: parsed.platform,
      url: parsed.url,
      productId: parsed.productId,
      orderHint: opts.orderHint
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
        status: applied.status,
        dead_listing: scraped.dead_listing || undefined
      }
    }

    // Fields + gallery already scraped; download photos to disk.
    const saved = await saveScrapedProductToDisk(cfg, {
      platform: parsed.platform,
      product: scraped,
      imageReferer: IMAGE_REFERER_BY_PLATFORM[parsed.platform]
    })

    // Temu: click store icon in the same tab, capture store_url + mall_id.
    // Снапшот sold-out товара перехода в магазин не имеет — не пытаемся.
    if (parsed.platform === 'temu' && scraped.status !== 'archived') {
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
      folder: saved.folder,
      import_source: opts.importSource
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
      status: scraped.status ?? 'active',
      dead_listing: scraped.dead_listing || undefined
    }
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    jobLog(`scrape fail platform=${parsed.platform} product_id=${parsed.productId} ${message}`)
    return { ok: false, error: message }
  }
}

/**
 * Перекачка уже существующей карточки: тот же каскад скрейпа по сохранённому
 * URL. Хинт для фолбэка мёртвых листингов восстанавливается из последней
 * позиции заказа с этим товаром (картинка позиции в БД не хранится — при
 * пустом скачивании прежние фото переносит вперёд saveScrapedProductToDisk).
 */
export async function reimportProduct(
  cfg: AppConfig,
  key: ProductKey
): Promise<ProductDownloadResult> {
  let url: string | null = null
  let orderHint: OrderItemHint | undefined
  const db = connect(cfg)
  try {
    const row = findProductRow(db, cfg, key)
    if (!row) {
      return { ok: false, error: 'Product not found' }
    }
    url = (row.url || '').trim() || null
    if (!url) {
      return { ok: false, error: 'Product has no stored URL to re-import from' }
    }
    const item = latestOrderItemForProduct(db, row.id)
    if (item) {
      orderHint = {
        title: item.title,
        variant: item.sku,
        price:
          item.unit_price != null
            ? item.currency
              ? `${item.currency} ${item.unit_price}`
              : String(item.unit_price)
            : null,
        image: null
      }
    }
  } finally {
    db.close()
  }

  return scrapeProduct(cfg, url, { importSource: 'link', orderHint })
}
