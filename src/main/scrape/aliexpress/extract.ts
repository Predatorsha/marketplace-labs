import type { Page } from 'playwright'
import { extractAliPriceRaw, extractAliReviews, extractAliTitle } from './buyBox'
import { collectAliChoiceOptions } from './choices'
import { collectAliDescriptionImages, collectAliSliderImages } from './gallery'
import { extractAliSpecs } from './specs'
import type { AliDomExtract } from './types'
import { sleep } from './util'

/** Progressive scroll so lazy sections (#nav-specification, #product-description) mount. */
async function scrollForLazySections(page: Page): Promise<void> {
  for (let i = 0; i < 25; i++) {
    const done = await page.evaluate(() => {
      const mounted =
        !!document.querySelector('#nav-specification') &&
        !!document.querySelector('#product-description')
      window.scrollBy(0, Math.round(window.innerHeight * 0.8))
      const bottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 50
      return mounted || bottom
    })
    await sleep(350)
    if (done) return
  }
}

/**
 * Collect buy-box fields and slider first (top of page), then scroll for
 * specs + description photos, and walk SKU choices last — clicking tiles
 * switches the selected variant/price on the page.
 */
export async function extractAliDom(page: Page): Promise<AliDomExtract> {
  const title = await extractAliTitle(page)
  const priceRaw = await extractAliPriceRaw(page)
  const reviews = await extractAliReviews(page)
  const sliderImages = await collectAliSliderImages(page)

  await scrollForLazySections(page)
  const specs = await extractAliSpecs(page)
  const descriptionImages = await collectAliDescriptionImages(page)

  const choiceOptions = await collectAliChoiceOptions(page)

  return {
    title,
    priceRaw,
    rating: reviews.rating,
    reviewCount: reviews.reviewCount,
    sold: reviews.sold,
    sliderImages,
    descriptionImages,
    specs,
    choiceOptions
  }
}
