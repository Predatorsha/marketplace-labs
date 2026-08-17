import type { AppConfig } from '../config'
import { connect } from '../core/connect'
import { resolveCoverUrl } from '../products/gallery'
import { normalizePackageStatus } from '../../shared/packageStatus'
import type {
  PackageDetail,
  PackageDetailItem,
  PackageGetResult,
  PackageOrderRef
} from '../../shared/types'

type ItemRow = {
  id: number
  quantity: number | null
  title: string | null
  marketplace_product_id: string | null
  product_id: number | null
  product_title: string | null
  folder_path: string | null
}

export async function getPackage(cfg: AppConfig, id: number): Promise<PackageGetResult> {
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Bad package id.' }

  try {
    const db = connect(cfg)
    try {
      const row = db
        .prepare(
          `SELECT id, platform, label, status, tracking_code, created_at, updated_at
           FROM packages WHERE id = ?`
        )
        .get(id) as
        | {
            id: number
            platform: string
            label: string | null
            status: string | null
            tracking_code: string | null
            created_at: string | null
            updated_at: string | null
          }
        | undefined
      if (!row) return { ok: false, error: `Package #${id} not found.` }

      const tracks = db
        .prepare(
          `SELECT tracking_code, role FROM package_tracking_codes
           WHERE package_id = ?
           ORDER BY (role != 'primary') ASC, id ASC`
        )
        .all(row.id) as Array<{ tracking_code: string; role: string }>
      const primary = row.tracking_code || tracks.find((t) => t.role === 'primary')?.tracking_code || null
      const extra = tracks.map((t) => t.tracking_code).filter((code) => code !== primary)

      const orders = db
        .prepare(
          `SELECT o.id AS id, o.marketplace_order_id AS order_id, o.platform AS platform
           FROM package_orders po
           JOIN orders o ON o.id = po.order_id
           WHERE po.package_id = ?
           ORDER BY o.id ASC`
        )
        .all(row.id) as PackageOrderRef[]

      const lineRows = db
        .prepare(
          `SELECT pi.id AS id, pi.quantity AS quantity, oi.title AS title,
                  oi.marketplace_product_id AS marketplace_product_id,
                  p.id AS product_id, p.title AS product_title, p.folder_path AS folder_path
           FROM package_items pi
           JOIN order_items oi ON oi.id = pi.order_item_id
           LEFT JOIN products p ON p.id = oi.product_id
           WHERE pi.package_id = ?
           ORDER BY pi.id ASC`
        )
        .all(row.id) as ItemRow[]

      // Обложку каждого товара резолвим один раз, даже если он в нескольких позициях.
      const coverByProduct = new Map<number, string | null>()
      const items: PackageDetailItem[] = []
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
        items.push({
          id: ln.id,
          title: (ln.title || '').trim() || (ln.product_title || '').trim() || null,
          quantity: ln.quantity != null && Number(ln.quantity) > 0 ? Number(ln.quantity) : 1,
          marketplace_product_id: ln.marketplace_product_id || null,
          cover_url
        })
      }

      const status = typeof row.status === 'string' && row.status.trim() ? row.status.trim() : null
      const detail: PackageDetail = {
        id: row.id,
        platform: row.platform,
        label: row.label || null,
        status,
        status_key: normalizePackageStatus(status),
        tracking_code: primary,
        extra_tracking_codes: extra,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        orders,
        items
      }
      return { ok: true, package: detail }
    } finally {
      db.close()
    }
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    return { ok: false, error: message }
  }
}
