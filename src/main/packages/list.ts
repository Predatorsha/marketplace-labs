import type { AppConfig } from '../config'
import { connect } from '../core/connect'
import { normalizePackageStatus } from '../../shared/packageStatus'
import type { PackageListItem, PackageListResult, PackageOrderRef } from '../../shared/types'

/**
 * Все посылки разом: поиск и фильтры по статусу страница Packages делает
 * на клиенте (посылок локально немного, пагинация не нужна).
 */
export function listPackages(cfg: AppConfig): PackageListResult {
  try {
    const db = connect(cfg)
    try {
      const rows = db
        .prepare(
          `SELECT id, platform, label, status, tracking_code, created_at, updated_at
           FROM packages
           ORDER BY (updated_at IS NULL) ASC, updated_at DESC, id DESC`
        )
        .all() as Array<{
        id: number
        platform: string
        label: string | null
        status: string | null
        tracking_code: string | null
        created_at: string | null
        updated_at: string | null
      }>

      const ordersStmt = db.prepare(
        `SELECT o.id AS id, o.marketplace_order_id AS order_id, o.platform AS platform
         FROM package_orders po
         JOIN orders o ON o.id = po.order_id
         WHERE po.package_id = ?
         ORDER BY o.id ASC`
      )
      const tracksStmt = db.prepare(
        `SELECT tracking_code FROM package_tracking_codes
         WHERE package_id = ?
         ORDER BY (role != 'primary') ASC, id ASC`
      )
      const itemsStmt = db.prepare(
        `SELECT COALESCE(SUM(quantity), 0) AS n FROM package_items WHERE package_id = ?`
      )

      const items: PackageListItem[] = rows.map((row) => {
        const orders = ordersStmt.all(row.id) as PackageOrderRef[]
        const tracks = (tracksStmt.all(row.id) as Array<{ tracking_code: string }>).map(
          (t) => t.tracking_code
        )
        const itemsRow = itemsStmt.get(row.id) as { n: number }
        const status =
          typeof row.status === 'string' && row.status.trim() ? row.status.trim() : null
        return {
          id: row.id,
          platform: row.platform,
          label: row.label || null,
          status,
          status_key: normalizePackageStatus(status),
          tracking_code: row.tracking_code || tracks[0] || null,
          tracking_codes: tracks,
          orders,
          items_count: Number(itemsRow?.n || 0),
          created_at: row.created_at || null,
          updated_at: row.updated_at || null
        }
      })

      return { ok: true, items, total: items.length }
    } finally {
      db.close()
    }
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    return { ok: false, error: message }
  }
}
