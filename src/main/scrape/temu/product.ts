import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Page } from 'playwright'
import { ensureTemuLoggedIn } from '../../browser/auth/temu'
import { jobLog } from '../../jobs/log'
import { gotoOnline } from '../net'
import { normalizeDisplayPrice } from '../price'
import type { OrderItemHint, ScrapedChoiceDraft, ScrapedProduct } from '../product'
import {
  isTemuProductSoldOut,
  isTemuProductUnavailable,
  isTemuSnapshotDiscontinued
} from './availability'
import { extractTemuReviews, extractTemuTitle } from './buyBox'
import { extractTemuDescriptionSpecs, extractTemuSpecs } from './details'
import { extractTemuDom } from './extract'
import { collectTemuGallery } from './gallery'
import { extractTemuSellerName } from './seller'
import { sleep } from './util'

/** Referer for downloading Temu CDN images outside the browser. */
export const TEMU_IMAGE_REFERER = 'https://www.temu.com/'

/**
 * Карточка, открытая по ссылке из деталки заказа (_oak_* параметры), иногда
 * сразу показывает модалку выбора SKU (#skuSelector). Она перекрывает галерею
 * и буй-бокс: галерея кажется пустой, клики по вариантам перехватываются.
 * Закрываем крестиком; модалки может и не быть — тогда no-op.
 */
async function closeTemuSkuModal(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const closed = await page
      .evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
        for (const dlg of dialogs) {
          if (!dlg.querySelector('#skuSelector')) continue
          const btn = dlg.querySelector<HTMLElement>('[role="button"][aria-label="close"]')
          if (btn) {
            btn.click()
            return true
          }
        }
        return false
      })
      .catch(() => false)
    if (!closed) return
    jobLog('temu product: closed SKU-selector modal over product page')
    await sleep(700)
  }
}

/**
 * Scrape a Temu product page: fields, gallery, and all buy-box choices.
 * Navigates, waits for login gate if needed, extracts fields from the first screen.
 * Unavailable listings return `status: 'archived'` without gallery/price (caller updates DB only).
 */
/**
 * Дамп HTML страницы в userData/debug — разбор состояний Temu, которые не
 * воспроизвести руками (sold out и пустые снапшоты показываются не всегда).
 */
async function dumpTemuDebugHtml(page: Page, productId: string, label: string): Promise<void> {
  try {
    const html = await page.content()
    const dir = join(app.getPath('userData'), 'debug')
    mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const file = join(dir, `${productId} ${label} ${stamp}.html`)
    writeFileSync(file, html)
    jobLog(`temu debug html saved: ${file}`)
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    jobLog(`temu debug html failed (${label}): ${message}`)
  }
}

/** CDN-URL без imageView2-параметров — максимальный доступный размер. */
function fullSizeTemuImage(src: string | null | undefined): string | null {
  const s = String(src || '').trim()
  if (!s || s.startsWith('data:')) return null
  return s.split('?')[0]
}

/**
 * Sold-out товар: качаем данные со страницы-снапшота goods_snapshot.html.
 * Там есть галерея (тот же #leftContent ol > li), тайтл, отзывы, имя продавца
 * и specs в блоке «Description», но нет буй-бокса: ни цены, ни вариантов —
 * единственный вариант получает цену из заказа (orderHint) или заглушку «—».
 */
async function scrapeTemuSnapshotPage(
  page: Page,
  opts: { url: string; productId: string; orderHint?: OrderItemHint }
): Promise<ScrapedProduct> {
  const snapshotUrl = `https://www.temu.com/goods_snapshot.html?goods_id=${opts.productId}&title=Details`
  await gotoOnline(page, snapshotUrl)
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

/**
 * Листинг удалён совсем (нет даже снапшота): собираем минимальную archived-карточку
 * из данных позиции заказа — фото миниатюры (CDN-оригинал), тайтл, вариант, цена.
 */
function buildTemuProductFromOrderHint(
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

export async function scrapeTemuProductPage(
  page: Page,
  opts: { url: string; productId: string; orderHint?: OrderItemHint }
): Promise<ScrapedProduct> {
  await gotoOnline(page, opts.url)
  await sleep(1500)

  await ensureTemuLoggedIn(page)

  const cur = page.url()
  if (!/goods|product|\d{6,}/i.test(cur) || cur.includes('about:blank')) {
    await gotoOnline(page, opts.url)
    await sleep(1000)
  }

  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || ''
        return (
          /unavailable for purchase/i.test(t) ||
          /item details are unavailable/i.test(t) ||
          /this item is sold out/i.test(t) ||
          /Est\.?/i.test(t) ||
          document.querySelectorAll('img').length > 5
        )
      },
      { timeout: 45_000 }
    )
    .catch(() => undefined)

  await closeTemuSkuModal(page)

  if (await isTemuProductUnavailable(page)) {
    // Листинг удалён совсем: снапшот у таких тоже мёртв («This item was
    // discontinued», проверено пробой) — не ждём ничего. Карточка собирается
    // из данных позиции заказа (фото/тайтл/вариант/цена); нет их — без данных.
    const fromOrder = opts.orderHint
      ? buildTemuProductFromOrderHint(opts, opts.orderHint)
      : null
    if (fromOrder) {
      jobLog(`temu product ${opts.productId}: unavailable, filling archived card from order data`)
      return fromOrder
    }
    return {
      product_id: opts.productId,
      url: opts.url,
      status: 'archived',
      dead_listing: true
    }
  }

  // Sold out: буй-бокса и галереи на goods.html нет — уходим на снапшот.
  if (await isTemuProductSoldOut(page)) {
    jobLog(`temu product ${opts.productId}: sold out, scraping snapshot page`)
    await dumpTemuDebugHtml(page, opts.productId, 'goods-sold-out')
    return scrapeTemuSnapshotPage(page, opts)
  }

  // После закрытия модалки (или просто медленного рендера) даём галерее
  // дорисоваться: пустой рейл — главный источник «no gallery images found».
  await page
    .waitForFunction(
      () => document.querySelectorAll('#leftContent ol > li').length > 2,
      { timeout: 15_000 }
    )
    .catch(() => undefined)

  const dom = await extractTemuDom(page)
  const { images, choices: choicePhotos } = dom.gallery
  if (images.length + choicePhotos.length < 1) {
    throw new Error('temu: no gallery images found on product page')
  }

  const price = normalizeDisplayPrice(dom.priceRaw)
  if (!price) {
    throw new Error(`temu: could not parse Est. price (raw=${dom.priceRaw ?? 'null'})`)
  }

  const text = (dom.title || '').trim()
  if (!text) {
    throw new Error('temu: product title/description not found')
  }

  // One choice per buy-box radio, photo paired by index with the trailing
  // gallery photos. No radios on the page → single choice from the last photo.
  let imageUrls: string[]
  let choiceDrafts: ScrapedChoiceDraft[]
  if (dom.choiceOptions.length > 0) {
    imageUrls = images
    // У распроданного цена — общая со страницы (в БД цена обязательна),
    // отличаем его по sold_out.
    choiceDrafts = dom.choiceOptions.map((opt, i) => ({
      image_url: choicePhotos[i] ?? null,
      name: opt.name ?? dom.optionName,
      group: opt.group ?? dom.optionGroup,
      price: normalizeDisplayPrice(opt.priceRaw) ?? price,
      sold_out: opt.soldOut
    }))
  } else {
    imageUrls = choicePhotos.length > 0 ? images : images.slice(0, -1)
    choiceDrafts = [
      {
        image_url: choicePhotos[0] ?? images[images.length - 1],
        name: dom.optionName,
        group: dom.optionGroup,
        price
      }
    ]
  }

  const specs =
    dom.specs && Object.keys(dom.specs).length > 0 ? { ...dom.specs } : undefined

  const productPageUrl = page.url() || opts.url

  return {
    product_id: opts.productId,
    url: productPageUrl,
    title: text,
    description: text,
    status: 'active',
    rating: dom.rating,
    review_count: dom.reviewCount,
    seller_name: dom.sellerName,
    seller_id: null,
    store_url: null,
    specs,
    gallery_image_urls: imageUrls,
    choices: choiceDrafts
  }
}
