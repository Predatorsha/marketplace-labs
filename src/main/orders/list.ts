import type { AppConfig } from '../config'
import { getProductImages } from '../code/products'
import { connect } from '../core/connect'
import { fromRelativeFolder } from '../core/paths'
import { toMediaUrl } from '../media/protocol'
import { resolveCoverPath } from '../products/gallery'
import type { OrderListItem, OrderListQuery, OrderListResult } from '../../shared/types'

const DEFAULT_PAGE_SIZE = 6
const MAX_PAGE_SIZE = 48
/** Сколько обложек товаров показываем в карточке заказа. */
const MAX_COVERS = 3

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£'
}

type OrderLineRow = {
  quantity: number | null
  unit_price: number | null
  currency: string | null
  product_id: number | null
  folder_path: string | null
}

/**
 * Сумма позиций для карточки. Валюты в заказе смешаны или ни у одной позиции
 * нет цены — суммы нет (честнее, чем сложить разные валюты числом).
 */
function formatOrderTotal(lines: OrderLineRow[]): string | null {
  const sums = new Map<string, number>()
  for (const ln of lines) {
    if (ln.unit_price == null || !Number.isFinite(Number(ln.unit_price))) continue
    // Подарки (unit_price=0, валюты нет) сумме ничего не дают —
    // не даём их пустой валюте сломать определение единой валюты заказа.
    if (Number(ln.unit_price) === 0) continue
    const qty = ln.quantity != null && Number(ln.quantity) > 0 ? Number(ln.quantity) : 1
    const currency = (ln.currency || '').trim().toUpperCase()
    sums.set(currency, (sums.get(currency) || 0) + Number(ln.unit_price) * qty)
  }
  if (sums.size !== 1) return null
  const [currency, amount] = [...sums.entries()][0]
  const text = amount.toFixed(2)
  if (!currency) return text
  const symbol = CURRENCY_SYMBOLS[currency]
  return symbol ? `${symbol}${text}` : `${text} ${currency}`
}

export async function listOrders(
  cfg: AppConfig,
  query: OrderListQuery = {}
): Promise<OrderListResult> {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(Number(query.page_size) || DEFAULT_PAGE_SIZE))
  )
  const page = Math.max(1, Math.trunc(Number(query.page) || 1))
  const offset = (page - 1) * pageSize

  try {
    const db = connect(cfg)
    try {
      const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM orders`).get() as { c: number }
      const total = Number(totalRow?.c || 0)
      const rows = db
        .prepare(
          `SELECT id, platform, marketplace_order_id, status, ordered_at
           FROM orders
           ORDER BY (ordered_at IS NULL) ASC, ordered_at DESC, id DESC
           LIMIT ? OFFSET ?`
        )
        .all(pageSize, offset) as Array<{
        id: number
        platform: string
        marketplace_order_id: string
        status: string | null
        ordered_at: string | null
      }>

      const linesStmt = db.prepare(
        `SELECT oi.quantity AS quantity, oi.unit_price AS unit_price, oi.currency AS currency,
                p.id AS product_id, p.folder_path AS folder_path
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC`
      )

      const items: OrderListItem[] = []
      for (const row of rows) {
        const lines = linesStmt.all(row.id) as OrderLineRow[]

        const item_covers: string[] = []
        const seenProducts = new Set<number>()
        for (const ln of lines) {
          if (item_covers.length >= MAX_COVERS) break
          if (ln.product_id == null || seenProducts.has(ln.product_id)) continue
          seenProducts.add(ln.product_id)
          const folderAbs = fromRelativeFolder(cfg, ln.folder_path)
          if (!folderAbs) continue
          const images = getProductImages(db, ln.product_id)
          const coverPath = await resolveCoverPath(folderAbs, images)
          if (coverPath) item_covers.push(toMediaUrl(coverPath))
        }

        items.push({
          id: row.id,
          platform: row.platform,
          order_id: row.marketplace_order_id,
          status: typeof row.status === 'string' && row.status.trim() ? row.status.trim() : null,
          ordered_at: row.ordered_at || null,
          total: formatOrderTotal(lines),
          items_count: lines.length,
          item_covers
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
