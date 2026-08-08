import type { Page } from 'playwright'
import {
  extractTemuOption,
  extractTemuPriceRaw,
  extractTemuReviews,
  extractTemuTitle
} from './buyBox'
import { extractTemuSpecs } from './details'
import { collectTemuGalleryUrls } from './gallery'
import { extractTemuSellerName } from './seller'
import type { TemuDomExtract } from './types'

/** Collect all first-screen fields from the open Temu product page. */
export async function extractTemuDom(page: Page): Promise<TemuDomExtract> {
  const title = await extractTemuTitle(page)
  const priceRaw = await extractTemuPriceRaw(page)
  const reviews = await extractTemuReviews(page)
  const option = await extractTemuOption(page)
  const gallery = await collectTemuGalleryUrls(page)
  const specs = await extractTemuSpecs(page)
  const sellerName = await extractTemuSellerName(page)

  return {
    title,
    priceRaw,
    reviewCount: reviews.reviewCount,
    rating: reviews.rating,
    optionGroup: option.optionGroup,
    optionName: option.optionName,
    gallery,
    specs,
    sellerName
  }
}
