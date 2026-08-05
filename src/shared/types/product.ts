export type ProductDownloadResult = {
  ok: boolean
  platform?: string
  product_id?: string | null
  folder?: string
  title?: string | null
  url?: string | null
  purpose?: string | null
  pack_quantity?: number | null
  my_rating?: number | null
  /** Derived join of choice prices (not stored on product). */
  price?: string | null
  tags?: string[]
  status?: string | null
  error?: string
}

export type ProductStatus = 'active' | 'archived'

export type ProductEditableFields = {
  title?: string | null
  url?: string | null
  purpose?: string | null
  pack_quantity?: number | null
  my_rating?: number | null
  status?: ProductStatus
  description?: string | null
  folder_path?: string | null
  tags?: string[] | null
}

/** Lookup by catalog identity or by absolute/relative product folder. */
export type ProductKey =
  | { platform: string; product_id: string; folder?: never }
  | { folder: string; platform?: never; product_id?: never }

export type ProductChoiceItem = {
  /** Local choice photo as `ml-media://…`, or empty when missing. */
  url: string
  file: string
  name: string | null
  group: string | null
  /** Choice price (source of truth). */
  price: string
}

export type ProductCard = {
  id: number
  platform: string
  product_id: string
  /** Absolute path to product folder. */
  folder: string
  /** Path relative to market_root (as stored in SQLite). */
  folder_path: string
  title: string | null
  url: string | null
  purpose: string | null
  pack_quantity: number | null
  my_rating: number | null
  /** Marketplace star rating (e.g. `"4.5"`), read-only. */
  rating: string | null
  /** Marketplace review count text (e.g. `"1284"`), read-only. */
  review_count: string | null
  /** Derived join of choice prices for display (e.g. `€2.68; €2.65`). */
  price: string | null
  status: string
  description: string | null
  tags: string[]
  /** Local gallery image URLs (`ml-media://…`) for preview. */
  image_urls: string[]
  /** Choice photos with per-option prices (AliExpress / Temu). */
  choices: ProductChoiceItem[]
}

export type ProductGetResult = {
  ok: boolean
  product?: ProductCard
  error?: string
}

export type ProductUpdateResult = {
  ok: boolean
  product?: ProductCard
  error?: string
}

/** One card in the Catalog grid. */
export type CatalogListItem = {
  id: number
  platform: string
  product_id: string
  title: string | null
  purpose: string | null
  pack_quantity: number | null
  /** Derived join of choice prices (e.g. `€2.68; €2.65`). */
  price: string | null
  /** Marketplace star rating (e.g. `"4.5"`). */
  rating: string | null
  /** Marketplace review count text. */
  review_count: string | null
  /** First gallery photo as `ml-media://…`, or null. */
  cover_url: string | null
  folder: string
}

export type ProductListQuery = {
  page?: number
  page_size?: number
}

export type ProductListResult = {
  ok: boolean
  items?: CatalogListItem[]
  total?: number
  page?: number
  page_size?: number
  error?: string
}
