import type { AppConfig } from '../config'
import type { CatalogDb } from './connect'
import { toRelativeFolder } from './paths'

/** Columns expected on `products` (CREATE IF NOT EXISTS does not add these later). */
const PRODUCTS_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'purpose', ddl: 'TEXT' },
  { name: 'pack_quantity', ddl: 'INTEGER' },
  { name: 'my_rating', ddl: 'INTEGER' },
  { name: 'rating', ddl: 'TEXT' },
  { name: 'review_count', ddl: 'TEXT' },
  { name: 'description', ddl: 'TEXT' },
  { name: 'orders', ddl: 'TEXT' },
  { name: 'seller_name', ddl: 'TEXT' },
  { name: 'seller_id', ddl: 'TEXT' },
  { name: 'store_url', ddl: 'TEXT' },
  { name: 'video', ddl: 'TEXT' },
  { name: 'status', ddl: "TEXT NOT NULL DEFAULT 'active'" },
  { name: 'last_seen_at', ddl: 'TEXT' },
  { name: 'folder_path', ddl: 'TEXT' },
  { name: 'url', ddl: 'TEXT' },
  { name: 'title', ddl: 'TEXT' }
]

function tableColumns(db: CatalogDb, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((r) => r.name))
}

/** Rewrite broken absolute folder_path values to market_root-relative paths. */
function repairProductFolderPaths(db: CatalogDb, cfg: AppConfig): void {
  const rows = db
    .prepare(
      `SELECT id, folder_path FROM products WHERE folder_path IS NOT NULL AND TRIM(folder_path) != ''`
    )
    .all() as Array<{ id: number; folder_path: string }>
  const update = db.prepare(`UPDATE products SET folder_path = ? WHERE id = ?`)
  for (const row of rows) {
    const fixed = toRelativeFolder(cfg, row.folder_path)
    if (!fixed || fixed === row.folder_path.replace(/\\/g, '/')) continue
    update.run(fixed, row.id)
  }
}

/** Add missing columns on existing DBs created before schema grew. */
export function migrateCatalogSchema(db: CatalogDb, cfg: AppConfig): void {
  const productCols = tableColumns(db, 'products')
  if (productCols.size) {
    for (const col of PRODUCTS_COLUMNS) {
      if (productCols.has(col.name)) continue
      db.exec(`ALTER TABLE products ADD COLUMN ${col.name} ${col.ddl}`)
    }
    for (const drop of [
      'discount',
      'ships_from',
      'shipping',
      'price',
      'currency',
      'description_html'
    ] as const) {
      if (!productCols.has(drop)) continue
      try {
        db.exec(`ALTER TABLE products DROP COLUMN ${drop}`)
      } catch {
        /* older SQLite / busy — leave orphan column unused */
      }
    }
    repairProductFolderPaths(db, cfg)
  }

  const orderCols = tableColumns(db, 'orders')
  if (orderCols.size && !orderCols.has('discount')) {
    db.exec('ALTER TABLE orders ADD COLUMN discount TEXT')
  }
}
