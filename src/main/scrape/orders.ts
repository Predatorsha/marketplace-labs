import type { Page } from 'playwright'
import type { AppConfig } from '../config'
import { browserManager } from '../browser/manager'
import {
  applyOrderSyncPayload,
  isFinalOrderStatus,
  listOrderStatuses,
  listProductUrlsByTitle,
  normalizeProductTitle,
  productHasFolder,
  updateOrderStatuses,
  type OrderPayload
} from '../code/orders'
import { jobLog } from '../jobs/log'
import type { OrderSyncOrder, OrderSyncPlan } from '../../shared/types'
import { downloadProductWithPage } from './index'
import { temuOrderListService } from './temu/orders'
import type { TemuOrderHint } from './temu/product'
import { parseProductUrl, type MarketplacePlatform, type ParsedProductUrl } from './url'

/** Заказ, увиденный сервисом в списке заказов маркетплейса. */
export type DiscoveredOrder = OrderSyncOrder

export type OrderListDiscovery = {
  /** Все увиденные карточки, от новых к старым. */
  orders: DiscoveredOrder[]
  /** true — домотали до конца списка (кнопки подгрузки больше нет). */
  reachedEnd: boolean
}

/**
 * Платформенный сервис списка заказов. Каждая платформа реализует свой
 * (scrape/temu/orders.ts, позже scrape/aliexpress/orders.ts) — без общих if-ов.
 */
export interface OrderListService {
  platform: MarketplacePlatform
  /**
   * Открыть список заказов и мотать его, пока `shouldStop(самый старый видимый)`
   * не вернёт true или список не кончится.
   */
  discover(
    page: Page,
    opts: { shouldStop: (oldest: DiscoveredOrder) => boolean }
  ): Promise<OrderListDiscovery>
  /**
   * Открыть деталку заказа и собрать payload для applyOrderSyncPayload:
   * позиции с ценой/вариантом/количеством, URL карточек товаров
   * (url = null, если товар удалён с маркетплейса) и посылки с маппингом
   * позиций. null — деталка не открылась.
   * `opts.productUrlByTitle` — normalized title → URL уже известных товаров
   * из БД: у сматченных позиций URL берётся оттуда без клика по позиции.
   */
  fetchOrder(
    page: Page,
    order: DiscoveredOrder,
    opts?: { productUrlByTitle?: ReadonlyMap<string, string> }
  ): Promise<OrderPayload | null>
  /**
   * Лёгкое обновление посылок/треков уже скачанного заказа (без скрейпа
   * товаров). null — трекинга ещё нет или деталка не открылась.
   */
  fetchPackages?(page: Page, order: DiscoveredOrder): Promise<OrderPayload | null>
}

const ORDER_LIST_SERVICES: Partial<Record<MarketplacePlatform, OrderListService>> = {
  temu: temuOrderListService
  // aliexpress: подключается своим сервисом, когда будет написан
}

function normStatus(status: string | null | undefined): string {
  return String(status || '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Синк списка заказов платформы:
 * 1) сервис платформы мотает список до дна или до известного финального заказа;
 * 2) заказы, которых нет в БД → план на скачивание (само скачивание — следующий шаг);
 * 3) известные нефинальные с новым статусом → обновляем только статус;
 * 4) известные с терминальным статусом (Delivered/Refunded) → не трогаем.
 */
export async function syncOrders(
  cfg: AppConfig,
  platform: MarketplacePlatform
): Promise<OrderSyncPlan> {
  const service = ORDER_LIST_SERVICES[platform]
  if (!service) {
    throw new Error(`order sync: no service registered for platform "${platform}"`)
  }

  const known = listOrderStatuses(cfg, platform)
  jobLog(`orders sync start platform=${platform} known_in_db=${known.size}`)

  return browserManager.withLock(async () => {
    try {
      const page = await browserManager.ensureStarted(cfg.browser)

      const discovery = await service.discover(page, {
        shouldStop: (oldest) =>
          known.has(oldest.marketplace_order_id) &&
          isFinalOrderStatus(known.get(oldest.marketplace_order_id))
      })
      const reachedEnd = discovery.reachedEnd
      const orders = discovery.orders

      const toDownload: OrderSyncOrder[] = []
      const statusUpdated: OrderSyncOrder[] = []
      let skippedFinal = 0
      let skippedUnchanged = 0

      for (const order of orders) {
        if (!known.has(order.marketplace_order_id)) {
          toDownload.push(order)
          continue
        }
        const dbStatus = known.get(order.marketplace_order_id) ?? null
        if (isFinalOrderStatus(dbStatus)) {
          skippedFinal += 1
          continue
        }
        const fresh = normStatus(order.status)
        if (fresh && fresh !== normStatus(dbStatus)) {
          statusUpdated.push(order)
        } else {
          skippedUnchanged += 1
        }
      }

      const applied = updateOrderStatuses(
        cfg,
        platform,
        statusUpdated.map((o) => ({
          marketplace_order_id: o.marketplace_order_id,
          status: normStatus(o.status)
        }))
      )

      // У известных нефинальных заказов со сменившимся статусом дотягиваем
      // посылки/треки: они появляются позже первого скачивания заказа.
      let packagesRefreshed = 0
      if (service.fetchPackages) {
        for (const order of statusUpdated) {
          try {
            const payload = await service.fetchPackages(page, order)
            if (payload) {
              applyOrderSyncPayload(cfg, { platform, orders: [payload] })
              packagesRefreshed += 1
            }
          } catch (exc) {
            const message = exc instanceof Error ? exc.message : String(exc)
            jobLog(
              `orders sync: package refresh for ${order.marketplace_order_id} failed: ${message}`
            )
          }
        }
      }

      // Фаза скачивания: от старых к новым, чтобы БД заполнялась хронологично.
      let ordersSynced = 0
      let ordersFailed = 0
      let productsScraped = 0
      let productsFailed = 0
      // Мёртвые листинги («discontinued») — бывает временный глюк Temu.
      // Сохранение фолбэк-карточки откладываем: в конце прогона очередь
      // ретраится по кругу, и только после последнего круга пишем фолбэк.
      const deadRetryQueue: Array<{
        parsed: ParsedProductUrl
        hint: TemuOrderHint
      }> = []
      // Товар обрабатываем один раз за прогон, даже если встречается в нескольких заказах.
      const handledProducts = new Set<string>()
      // Известные товары из БД: сматченные по названию позиции получают URL
      // без клика по позиции в деталке заказа.
      const productUrlByTitle = toDownload.length
        ? listProductUrlsByTitle(cfg, platform)
        : new Map<string, string>()
      if (toDownload.length) {
        jobLog(`orders sync: ${productUrlByTitle.size} known product titles loaded from db`)
      }

      for (const order of [...toDownload].reverse()) {
        try {
          const payload = await service.fetchOrder(page, order, { productUrlByTitle })
          if (!payload) {
            ordersFailed += 1
            continue
          }

          for (const item of payload.items || []) {
            if (!item.url) continue
            let parsed
            try {
              parsed = parseProductUrl(item.url)
            } catch {
              continue
            }
            if (parsed.platform !== platform || handledProducts.has(parsed.productId)) continue
            handledProducts.add(parsed.productId)
            if (productHasFolder(cfg, platform, parsed.productId)) continue

            const hint: TemuOrderHint = {
              price: item.price ?? item.unit_price ?? null,
              title: item.title ?? null,
              image: item.image ?? null,
              variant: item.sku ?? null
            }
            const res = await downloadProductWithPage(cfg, page, parsed, {
              orderHint: hint,
              deferDeadListing: true
            })
            if (res.ok && res.dead_listing) {
              deadRetryQueue.push({ parsed, hint })
              jobLog(
                `orders sync: product ${parsed.productId} listing is dead, queued for retry`
              )
            } else if (res.ok) {
              productsScraped += 1
              // Свежескачанный товар сразу в карту: его позиции в следующих
              // заказах прогона получат URL без клика.
              const key = normalizeProductTitle(res.title)
              if (key && res.url && !productUrlByTitle.has(key)) {
                productUrlByTitle.set(key, res.url)
              }
              const orderKey = normalizeProductTitle(item.title)
              if (orderKey && res.url && !productUrlByTitle.has(orderKey)) {
                productUrlByTitle.set(orderKey, res.url)
              }
            } else {
              productsFailed += 1
              jobLog(
                `orders sync: product ${parsed.productId} scrape failed: ${res.error ?? 'unknown'}`
              )
            }
          }

          applyOrderSyncPayload(cfg, { platform, orders: [payload] })
          ordersSynced += 1
          jobLog(
            `orders sync: saved order ${order.marketplace_order_id}` +
              ` (${(payload.items || []).length} items)`
          )
        } catch (exc) {
          ordersFailed += 1
          const message = exc instanceof Error ? exc.message : String(exc)
          jobLog(`orders sync: order ${order.marketplace_order_id} failed: ${message}`)
        }
      }

      // Карусель ретраев мёртвых листингов: до DEAD_RETRY_ROUNDS кругов по
      // очереди. Ожил — качаем полноценно; после последнего круга всё ещё
      // мёртв — сохраняем фолбэк-карточку из данных заказа (deferDeadListing off).
      const DEAD_RETRY_ROUNDS = 5
      let deadRecovered = 0
      let deadPermanent = 0
      if (deadRetryQueue.length) {
        jobLog(
          `orders sync: retrying ${deadRetryQueue.length} dead listing(s),` +
            ` up to ${DEAD_RETRY_ROUNDS} rounds`
        )
        let queue = deadRetryQueue
        for (let round = 1; round <= DEAD_RETRY_ROUNDS && queue.length; round++) {
          const lastRound = round === DEAD_RETRY_ROUNDS
          const next: typeof queue = []
          for (const entry of queue) {
            const res = await downloadProductWithPage(cfg, page, entry.parsed, {
              orderHint: entry.hint,
              deferDeadListing: !lastRound
            })
            if (res.ok && !res.dead_listing) {
              productsScraped += 1
              deadRecovered += 1
              jobLog(
                `orders sync: dead listing ${entry.parsed.productId} recovered` +
                  ` on retry round ${round}`
              )
            } else if (!lastRound) {
              next.push(entry)
            } else {
              // Последний круг: фолбэк сохранён (ok) или скрейп упал совсем.
              if (res.ok) {
                productsScraped += 1
                deadPermanent += 1
              } else {
                productsFailed += 1
              }
              jobLog(
                `orders sync: product ${entry.parsed.productId} still dead after` +
                  ` ${DEAD_RETRY_ROUNDS} rounds` +
                  (res.ok ? ', saved fallback card from order data' : `: ${res.error ?? 'fail'}`)
              )
            }
          }
          queue = next
          // Небольшая пауза между кругами — даём бэкенду Temu шанс отдышаться.
          if (queue.length && !lastRound) {
            await new Promise((r) => setTimeout(r, 5000))
          }
        }
      }

      jobLog(
        `orders sync done platform=${platform} discovered=${orders.length}` +
          ` to_download=${toDownload.length} synced=${ordersSynced} failed=${ordersFailed}` +
          ` products_scraped=${productsScraped} products_failed=${productsFailed}` +
          ` dead_retried=${deadRetryQueue.length} dead_recovered=${deadRecovered}` +
          ` dead_permanent=${deadPermanent}` +
          ` status_updated=${applied} packages_refreshed=${packagesRefreshed}` +
          ` skipped_final=${skippedFinal} skipped_unchanged=${skippedUnchanged}` +
          ` reached_end=${reachedEnd}`
      )

      return {
        platform,
        discovered: orders.length,
        to_download: toDownload,
        status_updated: statusUpdated,
        skipped_final: skippedFinal,
        skipped_unchanged: skippedUnchanged,
        reached_end: reachedEnd,
        orders_synced: ordersSynced,
        orders_failed: ordersFailed,
        products_scraped: productsScraped,
        products_failed: productsFailed,
        packages_refreshed: packagesRefreshed
      }
    } finally {
      await browserManager.close()
    }
  })
}
