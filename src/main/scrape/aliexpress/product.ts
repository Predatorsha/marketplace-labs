import type { Page } from 'playwright'
import { ensureAliExpressLoggedIn } from '../../browser/auth/aliexpress'
import { gotoOnline } from '../net'
import { normalizeDisplayPrice } from '../price'
import type { ScrapedChoiceDraft, ScrapedProduct } from '../product'
import { isAliProductUnavailable } from './availability'
import { extractAliDom } from './extract'
import { sleep } from './util'

/** Referer for downloading `aliexpress-media.com` images outside the browser. */
export const ALIEXPRESS_IMAGE_REFERER = 'https://www.aliexpress.com/'

/**
 * Scrape an AliExpress product page: fields, photos, and SKU choices.
 * Product photos come from the description block (shadow DOM); the slider
 * minus its trailing SKU photos is the fallback when the description is empty.
 * Unavailable listings return `status: 'archived'` (caller updates DB only).
 */
export async function scrapeAliExpressProductPage(
  page: Page,
  opts: { url: string; productId: string }
): Promise<ScrapedProduct> {
  await gotoOnline(page, opts.url)
  await sleep(1500)

  await ensureAliExpressLoggedIn(page)

  await page
    .waitForFunction(
      () => {
        const t = document.body?.innerText || ''
        return (
          !!document.querySelector('h1[data-pl="product-title"]') ||
          /no longer available|unavailable/i.test(t)
        )
      },
      { timeout: 45_000 }
    )
    .catch(() => undefined)

  if (await isAliProductUnavailable(page)) {
    return {
      product_id: opts.productId,
      url: page.url() || opts.url,
      status: 'archived'
    }
  }

  const dom = await extractAliDom(page)

  const title = (dom.title || '').trim()
  if (!title) {
    throw new Error('aliexpress: product title not found')
  }

  const price = normalizeDisplayPrice(dom.priceRaw)
  if (!price) {
    throw new Error(`aliexpress: could not parse price (raw=${dom.priceRaw ?? 'null'})`)
  }

  // Trailing slider photos duplicate the image-carrying SKU property options.
  const n = dom.skuImageCount
  const sliderMain =
    n > 0 ? dom.sliderImages.slice(0, Math.max(0, dom.sliderImages.length - n)) : dom.sliderImages
  const images = dom.descriptionImages.length ? dom.descriptionImages : sliderMain

  // One choice per SKU combo, photo from the combo's image-property tile.
  // No picker on the page → single choice, last slider photo.
  let choiceDrafts: ScrapedChoiceDraft[]
  if (dom.choiceOptions.length > 0) {
    choiceDrafts = dom.choiceOptions.map((opt) => ({
      image_url: opt.imageUrl,
      name: opt.name,
      group: opt.group,
      price: normalizeDisplayPrice(opt.priceRaw) ?? price
    }))
  } else {
    const last = dom.sliderImages[dom.sliderImages.length - 1] ?? images[images.length - 1]
    choiceDrafts = [{ image_url: last ?? null, name: null, group: null, price }]
  }

  if (!images.length) {
    throw new Error('aliexpress: no product photos found on product page')
  }

  const specs =
    dom.specs && Object.keys(dom.specs).length > 0 ? { ...dom.specs } : undefined

  return {
    product_id: opts.productId,
    url: page.url() || opts.url,
    title,
    description: title,
    status: 'active',
    rating: dom.rating,
    review_count: dom.reviewCount,
    orders: dom.sold,
    seller_name: dom.sellerName,
    seller_id: dom.sellerId,
    store_url: dom.storeUrl,
    video: dom.videoUrl,
    specs,
    gallery_image_urls: images,
    choices: choiceDrafts
  }
}
