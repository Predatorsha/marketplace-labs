import type { Page } from 'playwright'
import { ensureTemuLoggedIn } from '../../browser/auth/temu'
import { jobLog } from '../../jobs/log'
import { normalizeDisplayPrice } from '../price'
import type { ScrapedChoiceDraft, ScrapedProduct } from '../product'
import { isTemuProductUnavailable } from './availability'
import { extractTemuDom } from './extract'
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
export async function scrapeTemuProductPage(
  page: Page,
  opts: { url: string; productId: string }
): Promise<ScrapedProduct> {
  await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await sleep(1500)

  await ensureTemuLoggedIn(page)

  const cur = page.url()
  if (!/goods|product|\d{6,}/i.test(cur) || cur.includes('about:blank')) {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await sleep(1000)
  }

  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || ''
        return (
          /unavailable for purchase/i.test(t) ||
          /item details are unavailable/i.test(t) ||
          /Est\.?/i.test(t) ||
          document.querySelectorAll('img').length > 5
        )
      },
      { timeout: 45_000 }
    )
    .catch(() => undefined)

  await closeTemuSkuModal(page)

  if (await isTemuProductUnavailable(page)) {
    return {
      product_id: opts.productId,
      url: page.url() || opts.url,
      status: 'archived'
    }
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
    choiceDrafts = dom.choiceOptions.map((opt, i) => ({
      image_url: choicePhotos[i] ?? null,
      name: opt.name ?? dom.optionName,
      group: opt.group ?? dom.optionGroup,
      price: normalizeDisplayPrice(opt.priceRaw) ?? price
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
