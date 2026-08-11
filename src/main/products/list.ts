import type { AppConfig } from '../config'
import {
  getProductChoicePrices,
  getProductImages,
  joinChoicePrices
} from '../code/products'
import { connect } from '../core/connect'
import { fromRelativeFolder } from '../core/paths'
import { toMediaUrl } from '../media/protocol'
import type {
  CatalogListItem,
  ProductListQuery,
  ProductListResult
} from '../../shared/types'
import { resolveCoverPath } from './gallery'

const DEFAULT_PAGE_SIZE = 8
const MAX_PAGE_SIZE = 48

export async function listProducts(
  cfg: AppConfig,
  query: ProductListQuery = {}
): Promise<ProductListResult> {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(Number(query.page_size) || DEFAULT_PAGE_SIZE))
  )
  const page = Math.max(1, Math.trunc(Number(query.page) || 1))
  const offset = (page - 1) * pageSize

  try {
    const db = connect(cfg)
    try {
      const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM products`).get() as { c: number }
      const total = Number(totalRow?.c || 0)
      const rows = db
        .prepare(
          `SELECT id, platform, marketplace_product_id, title, purpose, pack_quantity,
                  rating, review_count, folder_path
           FROM products
           ORDER BY id DESC
           LIMIT ? OFFSET ?`
        )
        .all(pageSize, offset) as Array<{
        id: number
        platform: string
        marketplace_product_id: string
        title: string | null
        purpose: string | null
        pack_quantity: number | null
        rating: string | null
        review_count: string | null
        folder_path: string | null
      }>

      const items: CatalogListItem[] = []
      for (const row of rows) {
        const folderAbs = fromRelativeFolder(cfg, row.folder_path)
        const price = joinChoicePrices(getProductChoicePrices(db, row.id))
        const rating =
          typeof row.rating === 'string' && row.rating.trim() ? row.rating.trim() : null
        const review_count =
          typeof row.review_count === 'string' && row.review_count.trim()
            ? row.review_count.trim()
            : null
        const purpose =
          typeof row.purpose === 'string' && row.purpose.trim() ? row.purpose.trim() : null
        const pack_quantity =
          row.pack_quantity != null && Number.isFinite(Number(row.pack_quantity))
            ? Math.trunc(Number(row.pack_quantity))
            : null

        let cover_url: string | null = null
        if (folderAbs) {
          const images = getProductImages(db, row.id)
          const coverPath = await resolveCoverPath(folderAbs, images)
          if (coverPath) cover_url = toMediaUrl(coverPath)
        }

        items.push({
          id: row.id,
          platform: row.platform,
          product_id: row.marketplace_product_id,
          title: row.title,
          purpose,
          pack_quantity,
          price,
          rating,
          review_count,
          cover_url,
          folder: folderAbs || ''
        })
      }

      return { ok: true, items, total, page, page_size: pageSize }
    } finally {
      db.close()
    }
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    return { ok: false, error: message }
  }
}
