import type { TemuChoiceOption } from './choices'
import type { TemuGallery } from './gallery'

/** Fields pulled from the Temu product DOM (pre-normalization). */
export type TemuDomExtract = {
  title: string | null
  priceRaw: string | null
  reviewCount: string | null
  rating: string | null
  optionGroup: string | null
  optionName: string | null
  gallery: TemuGallery
  /** Buy-box variants (one per radio), [] when the page has no variant picker. */
  choiceOptions: TemuChoiceOption[]
  specs: Record<string, string>
  sellerName: string | null
}
