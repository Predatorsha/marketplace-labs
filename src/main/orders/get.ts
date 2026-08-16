import type { AppConfig } from '../config'
import { connect } from '../core/connect'
import { resolveCoverUrl } from '../products/gallery'
import { formatLinePrice, formatOrderTotal } from './format'
import type { OrderDetail, OrderDetailItem, OrderDetailPackage, OrderGetResult } from '../../shared/types'

type ItemRow = {
  id: number
  title: string | null
  quantity: number | null
  unit_price: number | null
  currency: string | null
  is_gift: number
  product_id: number | null
  product_title: string | null
  folder_path: string | null
}

export async function getOrder(cfg: AppConfig, id: number): Promise<OrderGetResult> {
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Bad order id.' }

  try {
    const db = connect(cfg)
    try {
      const row = db
        .prepare(
          `SELECT id, platform, marketplace_order_id, status, ordered_at
           FROM orders WHERE id = ?`
        )
        .get(id) as
        | {
            id: number
            platform: string
            marketplace_order_id: string
            status: string | null
            ordered_at: string | null
          }
        | undefined
      if (!row) return { ok: false, error: `Order #${id} not found.` }

      const lineRows = db
        .prepare(
          `SELECT oi.id AS id, oi.title AS title, oi.quantity AS quantity,
                  oi.unit_price AS unit_price, oi.currency AS currency, oi.is_gift AS is_gift,
                  p.id AS product_id, p.title AS product_title, p.folder_path AS folder_path
           FROM order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = ?
           ORDER BY oi.id ASC`
        )
        .all(row.id) as ItemRow[]

      // Обложку каждого товара резолвим один раз, даже если он в нескольких позициях.
      const coverByProduct = new Map<number, string | null>()
      const items: OrderDetailItem[] = []
      for (const ln of lineRows) {
        let cover_url: string | null = null
        if (ln.product_id != null) {
          if (coverByProduct.has(ln.product_id)) {
            cover_url = coverByProduct.get(ln.product_id) ?? null
          } else {
            cover_url = await resolveCoverUrl(cfg, db, ln.product_id, ln.folder_path)
            coverByProduct.set(ln.product_id, cover_url)
          }
        }
        const title = (ln.title || '').trim() || (ln.product_title || '').trim() || null
        const isGift = Number(ln.is_gift) === 1
        items.push({
          id: ln.id,
          title,
          quantity: ln.quantity != null && Number(ln.quantity) > 0 ? Number(ln.quantity) : 1,
          price: isGift ? null : formatLinePrice(ln),
          is_gift: isGift,
          cover_url
        })
      }

      const packages = db
        .prepare(
          `SELECT p.id AS id, p.label AS label, p.status AS status, p.tracking_code AS tracking_code
           FROM packages p
           JOIN package_orders po ON po.package_id = p.id
           WHERE po.order_id = ?
           ORDER BY p.id ASC`
        )
        .all(row.id) as OrderDetailPackage[]

      const order: OrderDetail = {
        id: row.id,
        platform: row.platform,
        order_id: row.marketplace_order_id,
        status: typeof row.status === 'string' && row.status.trim() ? row.status.trim() : null,
        ordered_at: row.ordered_at || null,
        total: formatOrderTotal(lineRows),
        items,
        packages
      }
      return { ok: true, order }
    } finally {
      db.close()
    }
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    return { ok: false, error: message }
  }
}
