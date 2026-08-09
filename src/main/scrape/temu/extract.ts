import type { Page } from 'playwright'
import {
  extractTemuOption,
  extractTemuPriceRaw,
  extractTemuReviews,
  extractTemuTitle
} from './buyBox'
import { collectTemuChoiceOptions } from './choices'
import { extractTemuSpecs } from './details'
import { collectTemuGallery } from './gallery'
import { extractTemuSellerName } from './seller'
import type { TemuDomExtract } from './types'

/** Collect fields then gallery from the open Temu product page (no scroll before photos). */
export async function extractTemuDom(page: Page): Promise<TemuDomExtract> {
  const title = await extractTemuTitle(page)
  const priceRaw = await extractTemuPriceRaw(page)
  const reviews = await extractTemuReviews(page)
  const option = await extractTemuOption(page)
  const sellerName = await extractTemuSellerName(page)
  const specs = await extractTemuSpecs(page)
  const gallery = await collectTemuGallery(page)
  // After the gallery: clicking radios switches the selected variant on the page.
  const choiceOptions = await collectTemuChoiceOptions(page)

  return {
    title,
    priceRaw,
    reviewCount: reviews.reviewCount,
    rating: reviews.rating,
    optionGroup: option.optionGroup,
    optionName: option.optionName,
    gallery,
    choiceOptions,
    specs,
    sellerName
  }
}
