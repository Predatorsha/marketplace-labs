import type { AliChoiceOption } from './choices'

/** Fields pulled from the AliExpress product DOM (pre-normalization). */
export type AliDomExtract = {
  title: string | null
  priceRaw: string | null
  rating: string | null
  reviewCount: string | null
  sold: string | null
  /** Main slider photos (full-size); trailing ones duplicate SKU images. */
  sliderImages: string[]
  /** Description-block photos (shadow DOM) — the primary product gallery. */
  descriptionImages: string[]
  /** Direct gallery video URL (mp4), null when the slider has no video slide. */
  videoUrl: string | null
  specs: Record<string, string>
  sellerName: string | null
  storeUrl: string | null
  sellerId: string | null
  /** SKU combos across all properties, [] when the page has no picker. */
  choiceOptions: AliChoiceOption[]
  /** Option count of the image-carrying SKU property (trailing slider photos). */
  skuImageCount: number
}
