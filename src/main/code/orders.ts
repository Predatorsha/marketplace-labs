import type { AppConfig } from '../config'
import { connect, utcNowIso, type CatalogDb } from '../core/connect'
import type { OrderItemPayload, OrderPayload, PackagePayload } from '../db/models/order'
import { ensureProductHasChoice, upsertProductRecord } from './products'

export type { OrderItemPayload, OrderPayload, PackagePayload }

function orderPlatform(db: CatalogDb, orderId: number): string {
  const row = db.prepare('SELECT platform FROM orders WHERE id = ?').get(orderId) as
    | { platform: string }
    | undefined
  if (!row) throw new Error(`Unknown orders.id=${orderId}`)
  return String(row.platform).trim().toLowerCase()
}

/**
 * Формат цены: `1 234.56`
 * - пробелы группируют целую часть по 3 цифры
 * - `.` только отделяет целую и дробную части (не тысячи)
 */
function normalizeNumericToken(token: string): string {
  if (!token.includes('.')) return token
  const first = token.indexOf('.')
  // Одна десятичная точка; лишние точки в дробной части отбрасываем.
  return `${token.slice(0, first)}.${token.slice(first + 1).replace(/\./g, '')}`
}

export function parseMoney(value: unknown): { unitPrice: number | null; currency: string | null } {
  if (value == null) return { unitPrice: null, currency: null }
  if (typeof value === 'number') return { unitPrice: value, currency: null }
  const text = String(value).trim()
  if (!text) return { unitPrice: null, currency: null }
  let currency: string | null = null
  const upper = text.toUpperCase()
  if (text.includes('€') || upper.includes('EUR')) currency = 'EUR'
  else if (text.includes('$') || upper.includes('USD')) currency = 'USD'
  else if (text.includes('£') || upper.includes('GBP')) currency = 'GBP'
  // Убираем пробелы тысяч (обычный / nbsp / узкий), затем цифры и опциональная дробь.
  const cleaned = text.replace(/[\s\u00a0\u202f]/g, '')
  const m = cleaned.match(/\d+(?:\.\d+)?/)
  if (!m) return { unitPrice: null, currency }
  const parsed = Number(normalizeNumericToken(m[0]))
  return { unitPrice: Number.isFinite(parsed) ? parsed : null, currency }
}

export function hasOrder(cfg: AppConfig, platform: string, marketplaceOrderId: string): boolean {
  const db = connect(cfg)
  try {
    const row = db
      .prepare(
        `SELECT id FROM orders WHERE platform = ? AND marketplace_order_id = ?`
      )
      .get(platform.trim().toLowerCase(), String(marketplaceOrderId).trim()) as
      | { id: number }
      | undefined
    return Boolean(row)
  } finally {
    db.close()
  }
}

/**
 * Терминальный статус заказа: дальше он на маркетплейсе не меняется,
 * такие заказы при синке не перечитываем и статус не обновляем.
 * Delivered — по требованию; Refunded — деньги вернули, заказ уже не «оживёт».
 */
export function isFinalOrderStatus(status: string | null | undefined): boolean {
  const s = String(status || '').trim()
  return /^delivered\b/i.test(s) || /^refunded$/i.test(s)
}

/** marketplace_order_id → status для всех заказов платформы в БД. */
export function listOrderStatuses(cfg: AppConfig, platform: string): Map<string, string | null> {
  const db = connect(cfg)
  try {
    const rows = db
      .prepare(`SELECT marketplace_order_id, status FROM orders WHERE platform = ?`)
      .all(platform.trim().toLowerCase()) as Array<{
      marketplace_order_id: string
      status: string | null
    }>
    return new Map(rows.map((r) => [String(r.marketplace_order_id), r.status]))
  } finally {
    db.close()
  }
}

/**
 * Обновляет статусы уже существующих заказов (INSERT не делает: факт наличия
 * строки в orders означает «заказ скачан», а скачивание — отдельный шаг).
 */
export function updateOrderStatuses(
  cfg: AppConfig,
  platform: string,
  updates: Array<{ marketplace_order_id: string; status: string }>
): number {
  if (!updates.length) return 0
  const plat = platform.trim().toLowerCase()
  const db = connect(cfg)
  try {
    const stmt = db.prepare(
      `UPDATE orders SET status = ?, updated_at = ?
       WHERE platform = ? AND marketplace_order_id = ?`
    )
    let n = 0
    db.exec('BEGIN')
    try {
      for (const u of updates) {
        const info = stmt.run(
          u.status.trim(),
          utcNowIso(),
          plat,
          String(u.marketplace_order_id).trim()
        )
        n += Number(info.changes)
      }
      db.exec('COMMIT')
    } catch (exc) {
      try {
        db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw exc
    }
    return n
  } finally {
    db.close()
  }
}

export function listKnownOrderIds(cfg: AppConfig, platform: string): Set<string> {
  const db = connect(cfg)
  try {
    const rows = db
      .prepare(`SELECT marketplace_order_id FROM orders WHERE platform = ?`)
      .all(platform.trim().toLowerCase()) as Array<{ marketplace_order_id: string }>
    return new Set(rows.map((r) => String(r.marketplace_order_id)))
  } finally {
    db.close()
  }
}

export function productHasFolder(
  cfg: AppConfig,
  platform: string,
  marketplaceProductId: string
): boolean {
  const db = connect(cfg)
  try {
    const row = db
      .prepare(
        `SELECT folder_path FROM products
         WHERE platform = ? AND marketplace_product_id = ?
           AND folder_path IS NOT NULL AND TRIM(folder_path) != ''`
      )
      .get(platform.trim().toLowerCase(), String(marketplaceProductId).trim()) as
      | { folder_path: string }
      | undefined
    return Boolean(row)
  } finally {
    db.close()
  }
}

/**
 * Нормализация названия товара для матчинга позиций заказа с карточками БД.
 * Слишком короткие названия (< 10 знаков) не матчим — велик шанс совпадения
 * разных товаров.
 */
export function normalizeProductTitle(raw: string | null | undefined): string | null {
  const t = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return t.length >= 10 ? t : null
}

/**
 * normalized title → URL карточки для известных товаров платформы.
 * Два источника: products.title (текст PDP) и order_items.title уже синкнутых
 * заказов (текст деталки — он байт-в-байт совпадает у повторных покупок).
 * Название, за которым числятся разные товары, выбрасывается: по нему
 * матчить нельзя.
 */
export function listProductUrlsByTitle(cfg: AppConfig, platform: string): Map<string, string> {
  const plat = platform.trim().toLowerCase()
  const db = connect(cfg)
  try {
    const rows = [
      ...db
        .prepare(
          `SELECT title, url, marketplace_product_id AS pid FROM products
            WHERE platform = ? AND title IS NOT NULL
              AND url IS NOT NULL AND TRIM(url) != ''`
        )
        .all(plat),
      ...db
        .prepare(
          `SELECT oi.title AS title, p.url AS url, p.marketplace_product_id AS pid
             FROM order_items oi JOIN products p ON p.id = oi.product_id
            WHERE p.platform = ? AND oi.title IS NOT NULL
              AND p.url IS NOT NULL AND TRIM(p.url) != ''`
        )
        .all(plat)
    ] as Array<{ title: string; url: string; pid: string }>

    const byTitle = new Map<string, { url: string; pid: string }>()
    const ambiguous = new Set<string>()
    for (const r of rows) {
      const key = normalizeProductTitle(r.title)
      if (!key || ambiguous.has(key)) continue
      const prev = byTitle.get(key)
      if (!prev) {
        byTitle.set(key, { url: r.url, pid: String(r.pid) })
      } else if (prev.pid !== String(r.pid)) {
        byTitle.delete(key)
        ambiguous.add(key)
      }
    }
    return new Map([...byTitle].map(([k, v]) => [k, v.url]))
  } finally {
    db.close()
  }
}

function upsertOrder(
  db: CatalogDb,
  opts: {
    platform: string
    marketplace_order_id: string
    status?: string | null
    ordered_at?: string | null
    discount?: string | null
  }
): number {
  const platform = opts.platform.trim().toLowerCase()
  const marketplace_order_id = String(opts.marketplace_order_id).trim()
  const now = utcNowIso()
  const row = db
    .prepare(`SELECT id FROM orders WHERE platform = ? AND marketplace_order_id = ?`)
    .get(platform, marketplace_order_id) as { id: number } | undefined
  if (row) {
    db.prepare(
      `UPDATE orders
       SET status = COALESCE(?, status),
           ordered_at = COALESCE(?, ordered_at),
           discount = COALESCE(?, discount),
           updated_at = ?
       WHERE id = ?`
    ).run(opts.status ?? null, opts.ordered_at ?? null, opts.discount ?? null, now, row.id)
    return row.id
  }
  const info = db
    .prepare(
      `INSERT INTO orders (
        platform, marketplace_order_id, status, ordered_at, discount, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      platform,
      marketplace_order_id,
      opts.status ?? null,
      opts.ordered_at ?? null,
      opts.discount ?? null,
      now,
      now
    )
  return Number(info.lastInsertRowid)
}

function upsertOrderItem(
  db: CatalogDb,
  cfg: AppConfig,
  opts: {
    order_id: number
    marketplace_product_id?: string | null
    title?: string | null
    quantity?: number | null
    unit_price?: number | null
    currency?: string | null
    price?: string | number | null
    is_gift?: boolean | null
    sku?: string | null
    marketplace_item_id?: string | null
    source_line_key?: string | null
    line_number?: number | null
    product_url?: string | null
    platform?: string | null
  }
): number {
  const mpid = (opts.marketplace_product_id || '').trim() || null
  const skuVal = (opts.sku || '').trim() || null
  const itemId = (opts.marketplace_item_id || '').trim() || null
  let lineKey = (opts.source_line_key || '').trim() || null
  if (!lineKey && opts.line_number != null) lineKey = `line:${Number(opts.line_number)}`

  const orderPlat = orderPlatform(db, opts.order_id)
  const plat = (opts.platform || orderPlat).trim().toLowerCase()
  if (plat !== orderPlat) {
    throw new Error(`platform mismatch: arg=${plat} order=${orderPlat}`)
  }

  let unitPrice = opts.unit_price ?? null
  let currency = opts.currency ?? null
  if (unitPrice == null && opts.price != null) {
    const parsed = parseMoney(opts.price)
    unitPrice = parsed.unitPrice
    if (currency == null) currency = parsed.currency
  }
  if (typeof currency === 'string') currency = currency.trim().toUpperCase() || null

  // Подарок ("Free"): в заказе он стоит 0, но это цена позиции, а не товара.
  const isGift = opts.is_gift === true
  if (isGift && unitPrice == null) unitPrice = 0

  let productId: number | null = null
  if (mpid) {
    productId = upsertProductRecord(db, cfg, {
      platform: orderPlat,
      marketplace_product_id: mpid,
      title: opts.title,
      url: opts.product_url
    })
    // Карточке товара нулевую «подарочную» цену не подсказываем.
    const priceHint = isGift
      ? null
      : opts.price != null
        ? opts.price
        : unitPrice != null
          ? currency
            ? `${currency} ${unitPrice}`
            : String(unitPrice)
          : null
    ensureProductHasChoice(db, productId, priceHint)
  }

  let row: { id: number } | undefined
  if (itemId) {
    row = db
      .prepare(`SELECT id FROM order_items WHERE order_id = ? AND marketplace_item_id = ?`)
      .get(opts.order_id, itemId) as { id: number } | undefined
  }
  if (!row && lineKey) {
    row = db
      .prepare(`SELECT id FROM order_items WHERE order_id = ? AND source_line_key = ?`)
      .get(opts.order_id, lineKey) as { id: number } | undefined
  }

  if (row) {
    db.prepare(
      `UPDATE order_items
       SET product_id = COALESCE(?, product_id),
           marketplace_product_id = COALESCE(?, marketplace_product_id),
           title = COALESCE(?, title),
           quantity = COALESCE(?, quantity),
           unit_price = COALESCE(?, unit_price),
           currency = COALESCE(?, currency),
           is_gift = COALESCE(?, is_gift),
           sku = COALESCE(?, sku),
           marketplace_item_id = COALESCE(?, marketplace_item_id),
           source_line_key = COALESCE(?, source_line_key),
           updated_at = ?
       WHERE id = ?`
    ).run(
      productId,
      mpid,
      opts.title ?? null,
      opts.quantity ?? null,
      unitPrice,
      currency,
      opts.is_gift == null ? null : isGift ? 1 : 0,
      skuVal,
      itemId,
      lineKey,
      utcNowIso(),
      row.id
    )
    return row.id
  }

  if (!itemId && !lineKey) {
    throw new Error('order_items need marketplace_item_id or source_line_key/line_number')
  }

  const now = utcNowIso()
  const info = db
    .prepare(
      `INSERT INTO order_items (
        order_id, product_id, marketplace_product_id, marketplace_item_id,
        source_line_key, title, quantity, unit_price, currency, is_gift, sku,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.order_id,
      productId,
      mpid,
      itemId,
      lineKey,
      opts.title ?? null,
      opts.quantity ?? null,
      unitPrice,
      currency,
      isGift ? 1 : 0,
      skuVal,
      now,
      now
    )
  return Number(info.lastInsertRowid)
}

function addPackageTrackingCode(
  db: CatalogDb,
  opts: {
    package_id: number
    tracking_code: string
    role?: string
    make_primary?: boolean
  }
): void {
  const code = opts.tracking_code.trim().toUpperCase()
  if (!code) return
  const now = utcNowIso()
  let role = (opts.role || 'previous').trim().toLowerCase() || 'previous'
  const platRow = db
    .prepare('SELECT platform FROM packages WHERE id = ?')
    .get(opts.package_id) as { platform: string } | undefined
  if (!platRow) throw new Error(`Unknown packages.id=${opts.package_id}`)
  const platform = String(platRow.platform).trim().toLowerCase()
  // UNIQUE(platform, tracking_code): a code already stored for a different package
  // would abort the transaction — keep the existing association and skip.
  const existing = db
    .prepare(
      `SELECT package_id FROM package_tracking_codes WHERE platform = ? AND tracking_code = ?`
    )
    .get(platform, code) as { package_id: number } | undefined
  if (existing && existing.package_id !== opts.package_id) {
    console.log(
      `[orders] tracking code ${code} (${platform}) already belongs to package ` +
        `${existing.package_id}; skipping link to package ${opts.package_id}`
    )
    return
  }
  const asPrimary = Boolean(opts.make_primary || role === 'primary')
  if (asPrimary) {
    role = 'primary'
    db.prepare(
      `UPDATE package_tracking_codes
       SET role = 'previous'
       WHERE package_id = ? AND role = 'primary' AND tracking_code != ?`
    ).run(opts.package_id, code)
  }
  db.prepare(
    `INSERT INTO package_tracking_codes (
      package_id, platform, tracking_code, role, created_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(package_id, tracking_code) DO UPDATE SET
      role = excluded.role,
      platform = excluded.platform`
  ).run(opts.package_id, platform, code, role, now)
  if (asPrimary) {
    db.prepare(`UPDATE packages SET tracking_code = ?, updated_at = ? WHERE id = ?`).run(
      code,
      now,
      opts.package_id
    )
  }
}

function upsertPackage(
  db: CatalogDb,
  opts: {
    platform: string
    tracking_code: string
    label?: string | null
    status?: string | null
    extra_tracking_codes?: string[] | null
  }
): number {
  const platform = opts.platform.trim().toLowerCase()
  const tracking_code = opts.tracking_code.trim().toUpperCase()
  const now = utcNowIso()

  let row = db
    .prepare(
      `SELECT p.id AS id FROM packages p
       JOIN package_tracking_codes t ON t.package_id = p.id
       WHERE p.platform = ? AND t.tracking_code = ?`
    )
    .get(platform, tracking_code) as { id: number } | undefined
  if (!row) {
    row = db
      .prepare(`SELECT id FROM packages WHERE platform = ? AND tracking_code = ?`)
      .get(platform, tracking_code) as { id: number } | undefined
  }

  let packageId: number
  if (row) {
    packageId = row.id
    db.prepare(
      `UPDATE packages
       SET label = COALESCE(?, label),
           status = COALESCE(?, status),
           updated_at = ?
       WHERE id = ?`
    ).run(opts.label ?? null, opts.status ?? null, now, packageId)
  } else {
    const info = db
      .prepare(
        `INSERT INTO packages (platform, tracking_code, label, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(platform, tracking_code, opts.label ?? null, opts.status ?? null, now, now)
    packageId = Number(info.lastInsertRowid)
  }

  addPackageTrackingCode(db, {
    package_id: packageId,
    tracking_code,
    role: 'primary',
    make_primary: true
  })
  for (const extra of opts.extra_tracking_codes || []) {
    const code = String(extra || '')
      .trim()
      .toUpperCase()
    if (code && code !== tracking_code) {
      addPackageTrackingCode(db, { package_id: packageId, tracking_code: code, role: 'previous' })
    }
  }
  return packageId
}

function linkPackageOrder(db: CatalogDb, packageId: number, orderId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO package_orders (package_id, order_id, created_at) VALUES (?, ?, ?)`
  ).run(packageId, orderId, utcNowIso())
}

function linkPackageItem(
  db: CatalogDb,
  packageId: number,
  orderItemId: number,
  quantity?: number | null
): void {
  const row = db
    .prepare(`SELECT order_id, quantity FROM order_items WHERE id = ?`)
    .get(orderItemId) as { order_id: number; quantity: number | null } | undefined
  if (!row) throw new Error(`Unknown order_items.id=${orderItemId}`)
  linkPackageOrder(db, packageId, row.order_id)
  const qty = quantity == null ? 1 : Math.max(1, Number(quantity))
  const now = utcNowIso()
  db.prepare(
    `INSERT INTO package_items (package_id, order_item_id, quantity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(package_id, order_item_id) DO UPDATE SET
       quantity = excluded.quantity,
       updated_at = excluded.updated_at`
  ).run(packageId, orderItemId, qty, now, now)
  const ordered = row.quantity
  if (ordered != null && Number(ordered) > 0) {
    const packed = db
      .prepare(
        `SELECT COALESCE(SUM(quantity), 0) AS n FROM package_items WHERE order_item_id = ?`
      )
      .get(orderItemId) as { n: number }
    if (Number(packed.n) > Number(ordered)) {
      throw new Error(
        `package_items sum ${packed.n} > order_items.quantity ${ordered} ` +
          `for order_item_id=${orderItemId}`
      )
    }
  }
}

export function applyOrderSyncPayload(
  cfg: AppConfig,
  opts: { platform: string; orders: OrderPayload[] }
): {
  platform: string
  synced_orders: number
  synced_items: number
  synced_packages: number
} {
  const platform = opts.platform.trim().toLowerCase()
  const db = connect(cfg)
  try {
    let nOrders = 0
    let nItems = 0
    let nPackages = 0

    db.exec('BEGIN')
    try {
      for (const od of opts.orders) {
        const oid = String(od.marketplace_order_id || od.order_id || '').trim()
        if (!oid) continue
        const orderPk = upsertOrder(db, {
          platform,
          marketplace_order_id: oid,
          status: od.status,
          ordered_at: od.ordered_at,
          discount: od.discount
        })
        nOrders += 1
        const itemIds: number[] = []
        const lineToItemId = new Map<number, number>()
        for (let idx = 0; idx < (od.items || []).length; idx++) {
          const it = (od.items || [])[idx]
          const lineNo = it.line_number == null ? idx + 1 : Number(it.line_number)
          itemIds.push(
            upsertOrderItem(db, cfg, {
              order_id: orderPk,
              marketplace_product_id: it.marketplace_product_id || it.product_id,
              title: it.title,
              quantity: it.quantity,
              unit_price: it.unit_price,
              currency: it.currency,
              price: it.price,
              is_gift: it.is_gift,
              marketplace_item_id: it.marketplace_item_id || it.item_id,
              source_line_key: it.source_line_key,
              line_number: lineNo,
              sku: it.sku,
              platform,
              product_url: it.url
            })
          )
          lineToItemId.set(lineNo, itemIds[itemIds.length - 1])
          nItems += 1
        }
        const packageIds: number[] = []
        let anyExplicitMapping = false
        for (const pkg of od.packages || []) {
          const track = String(pkg.track || pkg.tracking_code || '').trim()
          if (!track) continue
          const extras = list(pkg.extra_tracks || pkg.tracks || [])
          const packageId = upsertPackage(db, {
            platform,
            tracking_code: track,
            label: pkg.package || pkg.label,
            status: pkg.status,
            extra_tracking_codes: extras.filter(
              (x) => String(x).trim().toUpperCase() !== track.toUpperCase()
            )
          })
          linkPackageOrder(db, packageId, orderPk)
          nPackages += 1
          packageIds.push(packageId)

          // Явный маппинг позиций (Temu: товары посылки со страницы Track order).
          if (pkg.item_line_numbers?.length) {
            anyExplicitMapping = true
            for (const ln of pkg.item_line_numbers) {
              const iid = lineToItemId.get(Number(ln))
              if (iid == null) {
                console.log(`[orders] order ${oid}: package line ${ln} has no matching item`)
                continue
              }
              const oi = db
                .prepare(`SELECT quantity FROM order_items WHERE id = ?`)
                .get(iid) as { quantity: number | null } | undefined
              try {
                linkPackageItem(db, packageId, iid, oi?.quantity ?? 1)
              } catch (exc) {
                // Не валим весь заказ из-за расхождения количеств в маппинге посылок.
                console.log(`[orders] order ${oid}: package item link failed: ${exc}`)
              }
            }
          }
        }
        if (packageIds.length === 1 && !anyExplicitMapping) {
          // Single package → all order lines belong to it.
          for (const iid of itemIds) {
            const oi = db
              .prepare(`SELECT quantity FROM order_items WHERE id = ?`)
              .get(iid) as { quantity: number | null } | undefined
            linkPackageItem(db, packageIds[0], iid, oi?.quantity ?? 1)
          }
        } else if (packageIds.length > 1 && !anyExplicitMapping) {
          console.log(
            `[orders] order ${oid}: ${packageIds.length} packages but no per-item ` +
              `package mapping — skipping package_items linking`
          )
        }
      }
      db.exec('COMMIT')
    } catch (exc) {
      try {
        db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw exc
    }

    return {
      platform,
      synced_orders: nOrders,
      synced_items: nItems,
      synced_packages: nPackages
    }
  } finally {
    db.close()
  }
}

function list(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((x) => String(x))
}
