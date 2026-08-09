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
  specs: Record<string, string>
  sellerName: string | null
}
