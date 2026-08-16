import type { Page } from 'playwright'
import { ensureTemuLoggedIn } from '../../browser/auth/temu'
import { normalizeProductTitle } from '../../code/orders'
import type { OrderPayload } from '../../db/models/order'
import { jobLog } from '../../jobs/log'
import { gotoTemuPage } from './nav'
import type { DiscoveredOrder, OrderListDiscovery, OrderListService } from '../orders'
import { parseProductUrl } from '../url'
import {
  collectTemuOrderItemUrls,
  extractTemuOrderDetail,
  temuOrderDetailUrl,
  waitForTemuOrderDetail,
  type TemuOrderItemDetail
} from './orderDetail'
import { collectTemuPackages, openTemuTracking, type TemuPackageInfo } from './tracking'
import { sleep } from './util'

export const TEMU_ORDERS_URL = 'https://www.temu.com/bgt_orders.html'

/** Страховка от бесконечного «View more» на очень длинных аккаунтах. */
const MAX_VIEW_MORE_CLICKS = 80

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12'
}

/** "Jul 22, 2026" → "2026-07-22". */
export function parseTemuOrderDate(raw: string | null | undefined): string | null {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/.exec(String(raw || '').trim())
  if (!m) return null
  const mm = MONTHS[m[1].toLowerCase()]
  if (!mm) return null
  return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`
}

type RawTemuOrderCard = {
  order_id: string
  status: string | null
  order_time: string | null
  items_count: number | null
  total: string | null
}

/**
 * Парсит карточки заказов из #TabListWrapperDOMId.
 * Классы у Temu обфусцированы и меняются, поэтому якорь — текст "Order ID:":
 * карточка = ближайший предок метки, содержащий "View order details".
 */
async function extractTemuOrderCards(page: Page): Promise<RawTemuOrderCard[]> {
  return page.evaluate(() => {
    const root = document.querySelector('#TabListWrapperDOMId')
    if (!root) return [] as RawTemuOrderCard[]

    const out: RawTemuOrderCard[] = []
    const seen = new Set<string>()
    const labels = Array.from(root.querySelectorAll('span')).filter(
      (s) => (s.textContent || '').trim() === 'Order ID:'
    )

    for (const label of labels) {
      let card: HTMLElement | null = label.parentElement
      while (
        card &&
        card !== root &&
        !((card as HTMLElement).innerText || '').includes('View order details')
      ) {
        card = card.parentElement
      }
      // Карточка без "View order details" (не должно случаться) — берём блок с футером.
      if (!card || card === root) {
        card = label.parentElement
        while (card && card !== root && !((card.innerText || '').includes('Order Time:'))) {
          card = card.parentElement
        }
      }
      if (!card || card === root) continue

      const text = card.innerText || ''
      const idMatch = text.match(/Order ID:\s*\n?\s*(PO-[0-9-]{8,})/) || text.match(/PO-[0-9-]{8,}/)
      const orderId = idMatch ? (idMatch[1] || idMatch[0]).trim() : ''
      if (!orderId || seen.has(orderId)) continue
      seen.add(orderId)

      // Статус — первая непустая строка карточки:
      // "Delivered on Jun 14, 2026" / "Cleared customs" / "Refunded" / …
      const firstLine =
        text
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean)[0] || ''
      const status = firstLine.replace(/View order details.*$/i, '').trim() || null

      const timeMatch = text.match(/Order Time:\s*\n?\s*([^\n]+)/)
      const itemsMatch = text.match(/(\d+)\s+items?:/)
      // "Order total 219,46 €" — берём первую денежную группу, чтобы не зацепить
      // aria-hidden дубликат суммы рядом.
      const totalMatch =
        text.match(/Order total\s*([\d\s.,]+\s*[€$£])/) || text.match(/Order total\s*([^\n]+)/)

      out.push({
        order_id: orderId,
        status,
        order_time: timeMatch ? timeMatch[1].trim() : null,
        items_count: itemsMatch ? Number(itemsMatch[1]) : null,
        total: totalMatch ? totalMatch[1].trim() : null
      })
    }
    return out
  })
}

/** Количество карточек (по якорю "Order ID:") + есть ли ещё кнопка "View more". */
async function orderListState(page: Page): Promise<{ count: number; hasMore: boolean }> {
  return page.evaluate(() => {
    const root = document.querySelector('#TabListWrapperDOMId')
    if (!root) return { count: 0, hasMore: false }
    const count = Array.from(root.querySelectorAll('span')).filter(
      (s) => (s.textContent || '').trim() === 'Order ID:'
    ).length
    const hasMore = Array.from(root.querySelectorAll('[role="button"]')).some(
      (b) => ((b as HTMLElement).innerText || '').trim() === 'View more'
    )
    return { count, hasMore }
  })
}

/**
 * «Устаканивает» список перед вердиктом о дне: кнопка "View more" рендерится
 * позже карточек и лениво (ниже вьюпорта), поэтому сразу после появления
 * первых карточек её в DOM ещё нет и orderListState видит ложное «дно».
 * Скроллим окно к концу списка и ждём кнопку либо рост числа карточек;
 * дно признаём только после LIST_SETTLE_ROUNDS тихих раундов подряд.
 */
const LIST_SETTLE_ROUNDS = 3
const LIST_SETTLE_TIMEOUT = 4_000

async function settleOrderList(page: Page): Promise<{ count: number; hasMore: boolean }> {
  let state = await orderListState(page)
  let quiet = 0
  while (!state.hasMore && quiet < LIST_SETTLE_ROUNDS) {
    await page
      .evaluate(() => {
        const root = document.querySelector('#TabListWrapperDOMId')
        const labels = root ? Array.from(root.querySelectorAll('span')) : []
        const last = labels.filter((s) => (s.textContent || '').trim() === 'Order ID:').pop()
        last?.scrollIntoView({ block: 'end' })
        window.scrollTo(0, document.body.scrollHeight)
      })
      .catch(() => undefined)
    const prev = state.count
    await page
      .waitForFunction(
        (prevCount) => {
          const root = document.querySelector('#TabListWrapperDOMId')
          if (!root) return false
          const count = Array.from(root.querySelectorAll('span')).filter(
            (s) => (s.textContent || '').trim() === 'Order ID:'
          ).length
          if (count > prevCount) return true
          return Array.from(root.querySelectorAll('[role="button"]')).some(
            (b) => ((b as HTMLElement).innerText || '').trim() === 'View more'
          )
        },
        prev,
        { timeout: LIST_SETTLE_TIMEOUT }
      )
      .catch(() => undefined)
    state = await orderListState(page)
    quiet = state.count > prev ? 0 : quiet + 1
  }
  return state
}

/** Кликает "View more"; false — кнопки нет (дно списка). */
async function clickViewMore(page: Page): Promise<boolean> {
  const btn = page
    .locator('#TabListWrapperDOMId [role="button"]')
    .filter({ hasText: /^View more$/ })
    .first()
  if ((await btn.count()) === 0) return false
  try {
    await btn.scrollIntoViewIfNeeded()
    await btn.click({ timeout: 10_000 })
    return true
  } catch {
    return false
  }
}

/** Ждём, пока после клика подгрузятся новые карточки (или кнопка исчезнет). */
async function waitForMoreOrders(page: Page, prevCount: number): Promise<void> {
  await page
    .waitForFunction(
      (prev) => {
        const root = document.querySelector('#TabListWrapperDOMId')
        if (!root) return false
        const count = Array.from(root.querySelectorAll('span')).filter(
          (s) => (s.textContent || '').trim() === 'Order ID:'
        ).length
        if (count > prev) return true
        return !Array.from(root.querySelectorAll('[role="button"]')).some(
          (b) => ((b as HTMLElement).innerText || '').trim() === 'View more'
        )
      },
      prevCount,
      { timeout: 25_000 }
    )
    .catch(() => undefined)
  await sleep(500)
}

/**
 * Кликает "View order details" карточки нужного заказа в списке.
 * true — клик сделан (карточка была видима).
 */
async function clickOrderCardInList(page: Page, orderId: string): Promise<boolean> {
  return page.evaluate((oid) => {
    const root = document.querySelector('#TabListWrapperDOMId')
    if (!root) return false
    const links = Array.from(root.querySelectorAll('[role="link"], [role="button"]')).filter(
      (el) => /View order details/i.test((el as HTMLElement).innerText || '')
    )
    for (const link of links) {
      // Карточка = ближайший предок ссылки, содержащий футер с "Order ID:".
      let card: HTMLElement | null = link.parentElement
      while (card && card !== root && !(card.innerText || '').includes('Order ID:')) {
        card = card.parentElement
      }
      if (card && card !== root && (card.innerText || '').includes(oid)) {
        ;(link as HTMLElement).click()
        return true
      }
    }
    return false
  }, orderId)
}

/**
 * Фолбэк, если прямой URL деталки не сработал: открыть список, домотать до
 * карточки заказа и кликнуть её. Деталка могла открыться попапом — тогда
 * забираем её URL и открываем в основной вкладке.
 */
async function openTemuOrderDetailViaList(page: Page, orderId: string): Promise<boolean> {
  await gotoTemuPage(page, TEMU_ORDERS_URL)
  await sleep(1500)
  await ensureTemuLoggedIn(page)
  await page.waitForSelector('#TabListWrapperDOMId', { timeout: 45_000 }).catch(() => undefined)

  for (let i = 0; i <= MAX_VIEW_MORE_CLICKS; i++) {
    const clicked = await clickOrderCardInList(page, orderId)
    if (clicked) {
      const opened = await waitForTemuOrderDetail(page, orderId, 15_000)
      if (opened) return true
      // Возможно деталка ушла в новую вкладку.
      const extra = page
        .context()
        .pages()
        .find((p) => p !== page && p.url().includes('order'))
      if (extra) {
        const url = extra.url()
        await extra.close().catch(() => undefined)
        await gotoTemuPage(page, url)
        return waitForTemuOrderDetail(page, orderId, 20_000)
      }
      return false
    }

    const state = await settleOrderList(page)
    if (!state.hasMore) return false
    if (!(await clickViewMore(page))) return false
    await waitForMoreOrders(page, state.count)
  }
  return false
}

/** Открывает деталку заказа: прямой URL, при неудаче — клик из списка. */
async function openTemuOrderDetail(page: Page, orderId: string): Promise<boolean> {
  await gotoTemuPage(page, temuOrderDetailUrl(orderId))
  await sleep(1200)
  await ensureTemuLoggedIn(page)

  let opened = await waitForTemuOrderDetail(page, orderId, 25_000)
  if (!opened) {
    jobLog(`temu order ${orderId}: direct detail URL failed, falling back to list click`)
    opened = await openTemuOrderDetailViaList(page, orderId)
  }
  return opened
}

function normImageKey(src: string | null | undefined): string | null {
  const s = String(src || '').trim()
  if (!s) return null
  return s.split('?')[0].replace(/^https?:\/\//i, '').toLowerCase()
}

/**
 * Мапит товары посылок (со страницы Track order) на позиции заказа.
 * Основной ключ — картинка миниатюры (различает варианты одного товара),
 * фолбэк — тайтл. Уже занятые в этой посылке строки повторно не берём,
 * чтобы две одинаковые позиции легли в разные слоты.
 */
function mapTemuPackages(
  orderId: string,
  packages: TemuPackageInfo[],
  items: TemuOrderItemDetail[]
): NonNullable<OrderPayload['packages']> {
  return packages
    .filter((p) => p.tracking_code)
    .map((p) => {
      const used = new Set<number>()
      for (const pkgItem of p.items) {
        const imgKey = normImageKey(pkgItem.image)
        let match = imgKey
          ? items.find((it) => !used.has(it.line_number) && normImageKey(it.image) === imgKey)
          : undefined
        if (!match && pkgItem.title) {
          const title = pkgItem.title.trim().toLowerCase()
          match = items.find(
            (it) => !used.has(it.line_number) && (it.title || '').trim().toLowerCase() === title
          )
        }
        if (match) {
          used.add(match.line_number)
        } else {
          jobLog(
            `temu order ${orderId}: package "${p.label ?? p.tracking_code}" item not matched: ` +
              `${(pkgItem.title || pkgItem.image || 'unknown').slice(0, 80)}`
          )
        }
      }
      const label = p.label
        ? p.carrier
          ? `${p.label} · ${p.carrier}`
          : p.label
        : p.carrier
      return {
        track: p.tracking_code,
        label,
        status: p.status,
        item_line_numbers: [...used]
      }
    })
}

/**
 * Со страницы деталки уходит в Track order и собирает посылки с маппингом
 * на позиции. Пустой массив — трекинга ещё нет (заказ не отправлен) или
 * страница не открылась.
 */
async function fetchTemuPackages(
  page: Page,
  orderId: string,
  items: TemuOrderItemDetail[]
): Promise<NonNullable<OrderPayload['packages']>> {
  const tracking = await openTemuTracking(page)
  if (!tracking) {
    jobLog(`temu order ${orderId}: tracking page not available`)
    return []
  }
  try {
    const packages = await collectTemuPackages(tracking.page)
    const mapped = mapTemuPackages(orderId, packages, items)
    jobLog(
      `temu order ${orderId}: ${mapped.length} package(s): ` +
        mapped.map((p) => `${p.track}[${(p.item_line_numbers || []).length} items]`).join(', ')
    )
    return mapped
  } finally {
    if (tracking.isPopup) {
      await tracking.page.close().catch(() => undefined)
    }
  }
}

function toDiscovered(card: RawTemuOrderCard): DiscoveredOrder {
  return {
    marketplace_order_id: card.order_id,
    status: card.status,
    ordered_at: parseTemuOrderDate(card.order_time),
    items_count: card.items_count,
    total: card.total
  }
}

/**
 * Список заказов Temu: открывает bgt_orders.html (через HumanGate логина),
 * жмёт "View more", пока не домотает до дна или до заказа, который уже
 * скачан и в БД имеет терминальный статус (всё, что ниже — старее и известно).
 */
export const temuOrderListService: OrderListService = {
  platform: 'temu',

  async discover(page, opts): Promise<OrderListDiscovery> {
    await gotoTemuPage(page, TEMU_ORDERS_URL)
    await sleep(1500)

    await ensureTemuLoggedIn(page)

    // После логина Temu может увести со списка заказов — возвращаемся.
    if (!page.url().includes('bgt_orders')) {
      await gotoTemuPage(page, TEMU_ORDERS_URL)
      await sleep(1000)
    }

    await page.waitForSelector('#TabListWrapperDOMId', { timeout: 45_000 })
    // Первые карточки рендерятся асинхронно; пустой список — тоже валидный исход.
    await page
      .waitForFunction(
        () => {
          const root = document.querySelector('#TabListWrapperDOMId')
          if (!root) return false
          const text = (root as HTMLElement).innerText || ''
          return text.includes('Order ID:') || /you don't have any orders/i.test(text)
        },
        { timeout: 30_000 }
      )
      .catch(() => undefined)

    let stagnant = 0
    for (let i = 0; i <= MAX_VIEW_MORE_CLICKS; i++) {
      const cards = await extractTemuOrderCards(page)
      const oldest = cards[cards.length - 1]

      if (oldest && opts.shouldStop(toDiscovered(oldest))) {
        jobLog(
          `temu orders: stop at known final order ${oldest.order_id} (${cards.length} cards visible)`
        )
        return { orders: cards.map(toDiscovered), reachedEnd: false }
      }

      const settled = await settleOrderList(page)
      if (!settled.hasMore) {
        // За время устаканивания могли дорендериться карточки — перечитываем.
        const finalCards =
          settled.count > cards.length ? await extractTemuOrderCards(page) : cards
        jobLog(`temu orders: reached list bottom (${finalCards.length} cards)`)
        return { orders: finalCards.map(toDiscovered), reachedEnd: true }
      }

      const clicked = await clickViewMore(page)
      if (!clicked) {
        return { orders: cards.map(toDiscovered), reachedEnd: true }
      }
      await waitForMoreOrders(page, cards.length)

      const after = await orderListState(page)
      if (after.count <= cards.length) {
        stagnant += 1
        // Кнопка есть, но список не растёт — после двух холостых кликов выходим.
        if (stagnant >= 2) {
          jobLog(`temu orders: list stopped growing at ${after.count} cards, giving up on View more`)
          return { orders: cards.map(toDiscovered), reachedEnd: !after.hasMore }
        }
      } else {
        stagnant = 0
        jobLog(`temu orders: loaded more (${cards.length} → ${after.count} cards)`)
      }
    }

    const cards = await extractTemuOrderCards(page)
    jobLog(`temu orders: hit MAX_VIEW_MORE_CLICKS cap with ${cards.length} cards`)
    return { orders: cards.map(toDiscovered), reachedEnd: false }
  },

  /**
   * Скачивает деталку одного заказа: сначала прямой URL bgt_order_detail.html,
   * при неудаче — клик по карточке из списка. Из деталки собирает позиции и
   * кликами снимает URL карточек товаров (null = товар удалён с Temu).
   * Позиции, чей title сматчился с известным товаром БД (opts.productUrlByTitle),
   * получают URL без клика. У таких позиций нет _oak_order_sn из кликового URL —
   * marketplace_item_id пуст, апсерт позиций падает на фолбэк line:N.
   */
  async fetchOrder(page, order, opts): Promise<OrderPayload | null> {
    const orderId = order.marketplace_order_id

    if (!(await openTemuOrderDetail(page, orderId))) {
      jobLog(`temu order ${orderId}: could not open order detail`)
      return null
    }

    const detail = await extractTemuOrderDetail(page)
    if (!detail) {
      jobLog(`temu order ${orderId}: detail parse failed`)
      return null
    }
    if (detail.order_id !== orderId) {
      jobLog(`temu order ${orderId}: detail shows ${detail.order_id}, aborting this order`)
      return null
    }

    // Позиции с известным по БД товаром: URL из карты, клик не нужен.
    const known = opts?.productUrlByTitle
    const prefilled = new Map<number, string>()
    if (known?.size) {
      for (let i = 0; i < detail.items.length; i++) {
        const key = normalizeProductTitle(detail.items[i].title)
        const url = key ? known.get(key) : undefined
        if (url) prefilled.set(i, url)
      }
    }

    const urls = await collectTemuOrderItemUrls(
      page,
      detail.items.length,
      new Set(prefilled.keys())
    )
    for (let i = 0; i < detail.items.length; i++) {
      detail.items[i].product_url = prefilled.get(i) ?? urls[i] ?? null
    }
    const deadItems = detail.items.filter((it) => !it.product_url).length
    jobLog(
      `temu order ${orderId}: ${detail.items.length} items, ` +
        `${detail.items.length - deadItems} with product url` +
        ` (${prefilled.size} from db without click), ${deadItems} deleted/unresolved`
    )

    // Посылки: клики по позициям вернули нас на деталку — кнопка Track order здесь.
    const packages = await fetchTemuPackages(page, orderId, detail.items)

    return {
      marketplace_order_id: orderId,
      status: detail.status ?? order.status,
      ordered_at: parseTemuOrderDate(detail.order_time) ?? order.ordered_at,
      discount: detail.discount,
      packages,
      items: detail.items.map((it) => {
        let productId: string | null = null
        let itemId: string | null = null
        let skuId: string | null = null
        let goodsNum: number | null = null
        if (it.product_url) {
          try {
            const parsed = parseProductUrl(it.product_url)
            if (parsed.platform === 'temu') productId = parsed.productId
          } catch {
            /* не товарная ссылка — оставляем без product_id */
          }
          // URL клика из деталки несёт идентификаторы строки заказа:
          // _oak_order_sn — суб-заказ позиции, sku_id — вариант, _oak_goods_num — количество.
          try {
            const u = new URL(it.product_url)
            itemId = u.searchParams.get('_oak_order_sn')?.trim() || null
            skuId = u.searchParams.get('sku_id')?.trim() || null
            const num = Number(u.searchParams.get('_oak_goods_num'))
            goodsNum = Number.isFinite(num) && num > 0 ? num : null
          } catch {
            /* ignore */
          }
        }
        return {
          marketplace_product_id: productId,
          marketplace_item_id: itemId ?? (skuId ? `sku:${skuId}` : null),
          title: it.title,
          quantity: it.quantity ?? goodsNum,
          price: it.price,
          is_gift: it.is_gift,
          sku: it.variant,
          line_number: it.line_number,
          url: it.product_url,
          image: it.image
        }
      })
    }
  },

  /**
   * Лёгкое обновление уже скачанного заказа: деталка без кликов по товарам →
   * Track order → посылки. Треки появляются позже первого скачивания заказа,
   * поэтому у нефинальных заказов посылки дотягиваем при каждой смене статуса.
   */
  async fetchPackages(page, order): Promise<OrderPayload | null> {
    const orderId = order.marketplace_order_id

    if (!(await openTemuOrderDetail(page, orderId))) {
      jobLog(`temu order ${orderId}: could not open order detail for package refresh`)
      return null
    }
    const detail = await extractTemuOrderDetail(page)
    if (!detail || detail.order_id !== orderId) {
      jobLog(`temu order ${orderId}: detail parse failed during package refresh`)
      return null
    }

    const packages = await fetchTemuPackages(page, orderId, detail.items)
    if (!packages.length) return null

    return {
      marketplace_order_id: orderId,
      status: detail.status ?? order.status,
      discount: detail.discount,
      packages,
      // Позиции нужны линковке package_items: матчатся по line:N / item id,
      // товары при этом не трогаются (marketplace_product_id не передаём).
      items: detail.items.map((it) => ({
        title: it.title,
        quantity: it.quantity,
        price: it.price,
        sku: it.variant,
        line_number: it.line_number
      }))
    }
  }
}
