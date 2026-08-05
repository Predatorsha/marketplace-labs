import type { AppConfig } from '../../config'
import { connect, toRelativeFolder, utcNowIso, type CatalogDb } from '../db'
import {
  extractPackQuantityFromTitle,
  inferPurposeFromProduct,
  inferTagsFromProduct
} from '../../products/titleSignals'
import { getProductTags, setProductTags } from './tags'
import { jobLog } from '../../jobs/log'

export type ProductChoiceRow = {
  rel_path: string
  name: string | null
  group_name: string | null
  price: string
  sort_order?: number
}

export type ProductImageRow = {
  rel_path: string
  sort_order?: number
}

export type ProductSpecRow = {
  key: string
  value: string | null
  sort_order?: number
}

function existingTagsForProduct(
  cfg: AppConfig,
  platform: string,
  marketplaceProductId: string
): string[] {
  const db = connect(cfg)
  try {
    const row = db
      .prepare(
        `SELECT id FROM products WHERE platform = ? AND marketplace_product_id = ?`
      )
      .get(platform.trim().toLowerCase(), String(marketplaceProductId || '').trim()) as
      | { id: number }
      | undefined
    if (!row) return []
    return getProductTags(db, row.id)
  } finally {
    db.close()
  }
}

export function normalizePriceText(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  return null
}

function normalizeTextField(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  return null
}

/** Join non-empty choice prices with "; " for display. */
export function joinChoicePrices(prices: Array<string | null | undefined>): string | null {
  const parts: string[] = []
  for (const p of prices) {
    if (typeof p !== 'string') continue
    const trimmed = p.trim()
    if (trimmed) parts.push(trimmed)
  }
  return parts.length ? parts.join('; ') : null
}

export function getProductChoicePrices(db: CatalogDb, productId: number): string[] {
  const rows = db
    .prepare(
      `SELECT price FROM product_choices WHERE product_id = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(productId) as Array<{ price: string }>
  return rows.map((r) => r.price)
}

export function getProductChoices(db: CatalogDb, productId: number): ProductChoiceRow[] {
  return db
    .prepare(
      `SELECT rel_path, name, group_name, price, sort_order
       FROM product_choices WHERE product_id = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(productId) as ProductChoiceRow[]
}

export function getProductImages(db: CatalogDb, productId: number): ProductImageRow[] {
  return db
    .prepare(
      `SELECT rel_path, sort_order FROM product_images
       WHERE product_id = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(productId) as ProductImageRow[]
}

export function getProductSpecs(db: CatalogDb, productId: number): ProductSpecRow[] {
  return db
    .prepare(
      `SELECT key, value, sort_order FROM product_specs
       WHERE product_id = ? ORDER BY sort_order ASC, key ASC`
    )
    .all(productId) as ProductSpecRow[]
}

export function setProductSpecs(db: CatalogDb, productId: number, specs: ProductSpecRow[]): void {
  db.prepare(`DELETE FROM product_specs WHERE product_id = ?`).run(productId)
  const insert = db.prepare(
    `INSERT INTO product_specs (product_id, sort_order, key, value) VALUES (?, ?, ?, ?)`
  )
  specs.forEach((spec, i) => {
    const key = String(spec.key || '').trim()
    if (!key) return
    insert.run(productId, spec.sort_order ?? i, key, spec.value ?? null)
  })
}

export function setProductImages(db: CatalogDb, productId: number, images: ProductImageRow[]): void {
  db.prepare(`DELETE FROM product_images WHERE product_id = ?`).run(productId)
  const insert = db.prepare(
    `INSERT INTO product_images (product_id, sort_order, rel_path) VALUES (?, ?, ?)`
  )
  images.forEach((img, i) => {
    const rel = String(img.rel_path || '')
      .trim()
      .replace(/\\/g, '/')
    if (!rel) return
    insert.run(productId, img.sort_order ?? i, rel)
  })
}

/** Replace all choices. Requires ≥1 choice with non-empty price. */
export function setProductChoices(
  db: CatalogDb,
  productId: number,
  choices: ProductChoiceRow[]
): void {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('product must have at least one choice')
  }
  const normalized: ProductChoiceRow[] = []
  for (const [i, c] of choices.entries()) {
    const price = normalizePriceText(c.price)
    if (!price) {
      throw new Error('each choice must have a non-empty price')
    }
    normalized.push({
      rel_path: String(c.rel_path || '')
        .trim()
        .replace(/\\/g, '/'),
      name: normalizeTextField(c.name),
      group_name: normalizeTextField(c.group_name),
      price,
      sort_order: c.sort_order ?? i
    })
  }
  if (!normalized.length) {
    throw new Error('product must have at least one choice')
  }

  db.prepare(`DELETE FROM product_choices WHERE product_id = ?`).run(productId)
  const insert = db.prepare(
    `INSERT INTO product_choices (product_id, sort_order, rel_path, name, group_name, price)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  for (const c of normalized) {
    insert.run(productId, c.sort_order ?? 0, c.rel_path, c.name, c.group_name, c.price)
  }
}

/** Ensure product has ≥1 choice; create a stub from price text if none. */
export function ensureProductHasChoice(
  db: CatalogDb,
  productId: number,
  priceHint?: string | number | null
): void {
  const countRow = db
    .prepare(`SELECT COUNT(*) AS c FROM product_choices WHERE product_id = ?`)
    .get(productId) as { c: number }
  if (Number(countRow?.c || 0) > 0) return
  const price = normalizePriceText(priceHint) || '—'
  setProductChoices(db, productId, [{ rel_path: '', name: null, group_name: null, price }])
}

export function upsertProductRecord(
  db: CatalogDb,
  cfg: AppConfig,
  opts: {
    platform: string
    marketplace_product_id: string
    title?: string | null
    url?: string | null
    folder_path?: string | null
    purpose?: string | null
    pack_quantity?: number | null
    rating?: string | null
    review_count?: string | null
    description?: string | null
    description_html?: string | null
    discount?: string | null
    orders?: string | null
    seller_name?: string | null
    seller_id?: string | null
    store_url?: string | null
    ships_from?: string | null
    shipping?: string | null
    video?: string | null
    overwrite_purpose?: boolean
    status?: string | null
  }
): number {
  const platform = (opts.platform || '').trim().toLowerCase()
  const marketplace_product_id = String(opts.marketplace_product_id || '').trim()
  if (!platform || !marketplace_product_id) {
    throw new Error('platform and marketplace_product_id are required')
  }

  const folder = opts.folder_path ? toRelativeFolder(cfg, opts.folder_path) : null
  const purposeVal =
    typeof opts.purpose === 'string' && opts.purpose.trim() ? opts.purpose.trim() : null
  const packQty =
    opts.pack_quantity != null && Number.isFinite(Number(opts.pack_quantity))
      ? Math.trunc(Number(opts.pack_quantity))
      : null
  const ratingVal = normalizeTextField(opts.rating)
  const reviewCountVal = normalizeTextField(opts.review_count)
  const statusVal = (opts.status || 'active').trim().toLowerCase() || 'active'
  const now = utcNowIso()

  const row = db
    .prepare(
      `SELECT id, purpose, status FROM products
       WHERE platform = ? AND marketplace_product_id = ?`
    )
    .get(platform, marketplace_product_id) as
    | { id: number; purpose: string | null; status: string }
    | undefined

  if (row) {
    const keepPurpose =
      purposeVal && (opts.overwrite_purpose || !row.purpose) ? purposeVal : row.purpose
    db.prepare(
      `UPDATE products
       SET title = COALESCE(?, title),
           url = COALESCE(?, url),
           folder_path = COALESCE(?, folder_path),
           purpose = ?,
           pack_quantity = COALESCE(?, pack_quantity),
           rating = COALESCE(?, rating),
           review_count = COALESCE(?, review_count),
           description = COALESCE(?, description),
           description_html = COALESCE(?, description_html),
           discount = COALESCE(?, discount),
           orders = COALESCE(?, orders),
           seller_name = COALESCE(?, seller_name),
           seller_id = COALESCE(?, seller_id),
           store_url = COALESCE(?, store_url),
           ships_from = COALESCE(?, ships_from),
           shipping = COALESCE(?, shipping),
           video = COALESCE(?, video),
           status = ?,
           last_seen_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      opts.title ?? null,
      opts.url ?? null,
      folder,
      keepPurpose,
      packQty,
      ratingVal,
      reviewCountVal,
      normalizeTextField(opts.description),
      typeof opts.description_html === 'string' ? opts.description_html : null,
      normalizeTextField(opts.discount),
      normalizeTextField(opts.orders),
      normalizeTextField(opts.seller_name),
      normalizeTextField(opts.seller_id),
      normalizeTextField(opts.store_url),
      normalizeTextField(opts.ships_from),
      normalizeTextField(opts.shipping),
      normalizeTextField(opts.video),
      statusVal,
      now,
      now,
      row.id
    )
    return row.id
  }

  const info = db
    .prepare(
      `INSERT INTO products (
        platform, marketplace_product_id, title, url, folder_path, purpose, pack_quantity,
        rating, review_count, description, description_html, discount, orders,
        seller_name, seller_id, store_url, ships_from, shipping, video,
        status, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      platform,
      marketplace_product_id,
      opts.title ?? null,
      opts.url ?? null,
      folder,
      purposeVal,
      packQty,
      ratingVal,
      reviewCountVal,
      normalizeTextField(opts.description),
      typeof opts.description_html === 'string' ? opts.description_html : null,
      normalizeTextField(opts.discount),
      normalizeTextField(opts.orders),
      normalizeTextField(opts.seller_name),
      normalizeTextField(opts.seller_id),
      normalizeTextField(opts.store_url),
      normalizeTextField(opts.ships_from),
      normalizeTextField(opts.shipping),
      normalizeTextField(opts.video),
      statusVal,
      now,
      now,
      now
    )
  return Number(info.lastInsertRowid)
}

function parseChoicesFromProduct(product: Record<string, unknown>): ProductChoiceRow[] {
  const local = product.local_files
  if (local && typeof local === 'object' && !Array.isArray(local)) {
    const choices = (local as { choices?: unknown }).choices
    if (Array.isArray(choices) && choices.length) {
      const out: ProductChoiceRow[] = []
      for (const [i, entry] of choices.entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
        const row = entry as Record<string, unknown>
        const price = normalizePriceText(row.price)
        if (!price) continue
        out.push({
          rel_path: String(row.file || '')
            .trim()
            .replace(/\\/g, '/'),
          name: normalizeTextField(row.name),
          group_name: normalizeTextField(row.group),
          price,
          sort_order: i
        })
      }
      if (out.length) return out
    }
  }
  return []
}

function parseImagesFromProduct(product: Record<string, unknown>): ProductImageRow[] {
  const local = product.local_files
  if (local && typeof local === 'object' && !Array.isArray(local)) {
    const images = (local as { images?: unknown }).images
    if (Array.isArray(images)) {
      return images
        .map((entry, i) => ({
          rel_path: String(entry || '')
            .trim()
            .replace(/\\/g, '/'),
          sort_order: i
        }))
        .filter((img) => Boolean(img.rel_path))
    }
  }
  return []
}

function parseSpecsFromProduct(product: Record<string, unknown>): ProductSpecRow[] {
  const specs = product.specs
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return []
  return Object.entries(specs as Record<string, unknown>).map(([key, value], i) => ({
    key,
    value: value == null ? null : String(value),
    sort_order: i
  }))
}

export async function upsertProductFromSaved(
  cfg: AppConfig,
  opts: {
    platform: string
    product: Record<string, unknown>
    folder: string
    purpose?: string | null
    tags?: string[] | null
    choices?: ProductChoiceRow[] | null
  }
): Promise<{ id: number; tags: string[]; my_rating: number | null }> {
  const title = String(opts.product.title || '')
  const explicit =
    opts.purpose !== undefined
      ? opts.purpose
      : typeof opts.product.purpose === 'string'
        ? opts.product.purpose
        : null
  const trimmed = typeof explicit === 'string' && explicit.trim() ? explicit.trim() : null
  let purpose = trimmed
  if (!purpose) {
    purpose = await inferPurposeFromProduct(opts.product)
    if (purpose) {
      jobLog(`catalog purpose inferred: ${purpose} (product_id=${opts.product.product_id})`)
    } else {
      jobLog(`catalog purpose not inferred (product_id=${opts.product.product_id})`)
    }
  }

  const fromProduct =
    opts.product.pack_quantity != null && Number.isFinite(Number(opts.product.pack_quantity))
      ? Math.trunc(Number(opts.product.pack_quantity))
      : null
  const pack_quantity = fromProduct ?? extractPackQuantityFromTitle(title) ?? 1
  jobLog(`catalog pack_quantity=${pack_quantity} (product_id=${opts.product.product_id})`)

  let tags: string[] = []
  if (Array.isArray(opts.tags)) {
    tags = opts.tags.map((t) => String(t).trim()).filter(Boolean)
  } else if (Array.isArray(opts.product.tags)) {
    tags = opts.product.tags.map((t) => String(t).trim()).filter(Boolean)
  }
  const marketplaceId = String(opts.product.product_id || '')
  const already = existingTagsForProduct(cfg, opts.platform, marketplaceId)
  if (already.length) {
    tags = already
  } else if (!tags.length) {
    tags = await inferTagsFromProduct({ ...opts.product, purpose })
    if (tags.length) {
      jobLog(
        `catalog tags inferred: ${tags.join(', ')} (product_id=${opts.product.product_id})`
      )
    } else {
      jobLog(`catalog tags not inferred (product_id=${opts.product.product_id})`)
    }
  }

  const choices =
    Array.isArray(opts.choices) && opts.choices.length
      ? opts.choices
      : parseChoicesFromProduct(opts.product)
  if (!choices.length) {
    throw new Error('product must have at least one choice')
  }

  const db = connect(cfg)
  let id: number
  let attached: string[] = []
  let my_rating: number | null = null
  try {
    id = upsertProductRecord(db, cfg, {
      platform: opts.platform,
      marketplace_product_id: String(opts.product.product_id || ''),
      title: title || null,
      url: (opts.product.url as string) || null,
      folder_path: opts.folder,
      purpose,
      pack_quantity,
      rating: normalizeTextField(opts.product.rating),
      review_count: normalizeTextField(opts.product.review_count),
      description: normalizeTextField(opts.product.description),
      description_html:
        typeof opts.product.description_html === 'string'
          ? opts.product.description_html
          : null,
      discount: normalizeTextField(opts.product.discount),
      orders: normalizeTextField(opts.product.orders),
      seller_name: normalizeTextField(opts.product.seller_name),
      seller_id: normalizeTextField(opts.product.seller_id),
      store_url: normalizeTextField(opts.product.store_url),
      ships_from: normalizeTextField(opts.product.ships_from),
      shipping: normalizeTextField(opts.product.shipping),
      video: normalizeTextField(opts.product.video),
      overwrite_purpose: false,
      status: 'active'
    })
    setProductChoices(db, id, choices)
    setProductImages(db, id, parseImagesFromProduct(opts.product))
    setProductSpecs(db, id, parseSpecsFromProduct(opts.product))
    const existing = getProductTags(db, id)
    if (existing.length) {
      attached = existing
    } else if (tags.length) {
      attached = setProductTags(db, { productId: id, tags, replace: true })
    }
    const ratingRow = db
      .prepare('SELECT my_rating FROM products WHERE id = ?')
      .get(id) as { my_rating: number | null } | undefined
    const raw = ratingRow?.my_rating
    if (raw != null && Number.isFinite(Number(raw))) {
      const n = Math.trunc(Number(raw))
      if (n >= 1 && n <= 5) my_rating = n
    }
  } finally {
    db.close()
  }
  return { id, tags: attached, my_rating }
}

export function productFolderExists(
  cfg: AppConfig,
  platform: string,
  productId: string
): string | null {
  const db = connect(cfg)
  try {
    const row = db
      .prepare(
        `SELECT folder_path FROM products
         WHERE platform = ? AND marketplace_product_id = ? AND folder_path IS NOT NULL`
      )
      .get(platform, productId) as { folder_path: string } | undefined
    return row?.folder_path ?? null
  } finally {
    db.close()
  }
}
