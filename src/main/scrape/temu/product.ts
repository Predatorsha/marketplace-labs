import type { Page } from 'playwright'
import { ensureTemuLoggedIn } from '../../browser/auth/temu'
import { normalizeDisplayPrice } from '../price'
import type { ScrapedProduct } from '../product'
import { isTemuProductUnavailable } from './availability'
import { extractTemuDom } from './extract'
import { sleep } from './util'

/**
 * Scrape a Temu product page (single-choice / no variant picker case).
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

  if (await isTemuProductUnavailable(page)) {
    return {
      product_id: opts.productId,
      url: page.url() || opts.url,
      status: 'archived'
    }
  }

  const dom = await extractTemuDom(page)
  const { images, choices } = dom.gallery
  if (images.length + choices.length < 1) {
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

  // Rail is already split: leading photos → images/, trailing (radio count) → Choice.
  // No variant radios on the page → treat the last photo as Choice.
  const choiceUrl = choices[0] ?? images[images.length - 1]
  const imageUrls = choices.length > 0 ? images : images.slice(0, -1)

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
    choice: {
      image_url: choiceUrl,
      group: dom.optionGroup,
      name: dom.optionName,
      price
    }
  }
}
