import type { Page } from 'playwright'
import { ensureTemuLoggedIn } from '../../browser/auth/temu'
import { jobLog } from '../../jobs/log'
import { normalizeDisplayPrice } from '../price'
import type { OrderItemHint, ScrapedProduct } from '../product'
import { isTemuSnapshotDiscontinued } from './availability'
import { extractTemuReviews, extractTemuTitle } from './buyBox'
import { dumpTemuDebugHtml } from './debug'
import { extractTemuDescriptionSpecs, extractTemuSpecs } from './details'
import { collectTemuGallery } from './gallery'
import { gotoTemuPage } from './nav'
import { extractTemuSellerName } from './seller'
import { sleep } from './util'

/** CDN-URL без imageView2-параметров — максимальный доступный размер. */
function fullSizeTemuImage(src: string | null | undefined): string | null {
  const s = String(src || '').trim()
  if (!s || s.startsWith('data:')) return null
  return s.split('?')[0]
}

/**
 * Листинг удалён совсем (нет даже снапшота): собираем минимальную archived-карточку
 * из данных позиции заказа — фото миниатюры (CDN-оригинал), тайтл, вариант, цена.
 */
export function buildTemuProductFromOrderHint(
  opts: { url: string; productId: string },
  hint: OrderItemHint
): ScrapedProduct | null {
  const image = fullSizeTemuImage(hint.image)
  const title = (hint.title || '').trim() || null
  if (!image && !title) return null
  const price = normalizeDisplayPrice(hint.price == null ? null : String(hint.price)) || '—'
  return {
    product_id: opts.productId,
    url: opts.url,
    title,
    description: title,
    status: 'archived',
    dead_listing: true,
    gallery_image_urls: image ? [image] : [],
    choices: [{ image_url: null, name: hint.variant ?? null, group: null, price }]
  }
}

/**
 * Sold-out товар: качаем данные со страницы-снапшота goods_snapshot.html.
 * Там есть галерея (тот же #leftContent ol > li), тайтл, отзывы, имя продавца
 * и specs в блоке «Description», но нет буй-бокса: ни цены, ни вариантов —
 * единственный вариант получает цену из заказа (orderHint) или заглушку «—».
 */
export async function scrapeTemuSnapshotPage(
  page: Page,
  opts: { url: string; productId: string; orderHint?: OrderItemHint }
): Promise<ScrapedProduct> {
  const snapshotUrl = `https://www.temu.com/goods_snapshot.html?goods_id=${opts.productId}&title=Details`
  await gotoTemuPage(page, snapshotUrl)
  await sleep(1500)
  await ensureTemuLoggedIn(page)

  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || ''
        return (
          /this item (was|has been|is) discontinued/i.test(t) ||
          document.querySelectorAll('#leftContent ol > li').length > 2
        )
      },
      { timeout: 20_000 }
    )
    .catch(() => undefined)

  await dumpTemuDebugHtml(page, opts.productId, 'snapshot')

  // «This item was discontinued» вместо снапшота: данных не будет — сразу
  // фолбэк-карточка из данных заказа (раньше тут падало «no gallery images»).
  if (await isTemuSnapshotDiscontinued(page)) {
    jobLog(`temu product ${opts.productId}: snapshot shows discontinued`)
    const fromOrder = opts.orderHint
      ? buildTemuProductFromOrderHint(opts, opts.orderHint)
      : null
    if (fromOrder) return fromOrder
    return {
      product_id: opts.productId,
      url: opts.url,
      status: 'archived',
      dead_listing: true
    }
  }

  // Слайды рейла дорисовываются пачками — ждём, пока их число перестанет расти,
  // иначе снимем только первые 2 фотки.
  let prevCount = 0
  for (let i = 0; i < 20; i++) {
    const count = await page.evaluate(
      () => document.querySelectorAll('#leftContent ol > li').length
    )
    if (count === prevCount && count > 2) break
    prevCount = count
    await sleep(700)
  }

  const gallery = await collectTemuGallery(page)
  // Радио-вариантов на снапшоте нет — все фото рейла товарные, ничего не отрезаем.
  const images = [...gallery.images, ...gallery.choices]
  if (!images.length) {
    // Снапшот отрендерился пустым без маркера discontinued (Temu так умеет):
    // данных не будет — карточка из данных заказа, как у мёртвых листингов.
    const fromOrder = opts.orderHint
      ? buildTemuProductFromOrderHint(opts, opts.orderHint)
      : null
    if (fromOrder) {
      jobLog(`temu product ${opts.productId}: empty snapshot, filling archived card from order data`)
      return fromOrder
    }
    throw new Error('temu: no gallery images found on snapshot page')
  }

  let title = await extractTemuTitle(page)
  if (!title) {
    // Фолбэк: alt большой фотки галереи — на снапшоте это полный тайтл.
    title = await page.evaluate(() => {
      for (const img of document.querySelectorAll('#leftContent img')) {
        const alt = (img.getAttribute('alt') || '').trim()
        if (alt.length > 20) return alt
      }
      return null
    })
  }
  if (!title) {
    const fromOrder = opts.orderHint
      ? buildTemuProductFromOrderHint(opts, opts.orderHint)
      : null
    if (fromOrder) {
      jobLog(
        `temu product ${opts.productId}: snapshot without title, filling archived card from order data`
      )
      return fromOrder
    }
    throw new Error('temu: product title not found on snapshot page')
  }

  const reviews = await extractTemuReviews(page)
  const sellerName = await extractTemuSellerName(page)
  const specs = {
    ...(await extractTemuSpecs(page)),
    ...(await extractTemuDescriptionSpecs(page))
  }

  const hint = opts.orderHint
  const price = normalizeDisplayPrice(hint?.price == null ? null : String(hint.price)) || '—'

  return {
    product_id: opts.productId,
    url: opts.url,
    title,
    description: title,
    status: 'archived',
    rating: reviews.rating,
    review_count: reviews.reviewCount,
    seller_name: sellerName,
    seller_id: null,
    store_url: null,
    specs: Object.keys(specs).length > 0 ? specs : undefined,
    gallery_image_urls: images,
    choices: [{ image_url: null, name: hint?.variant ?? null, group: null, price }]
  }
}
