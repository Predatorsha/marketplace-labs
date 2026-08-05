import { utcNowIso, type CatalogDb } from '../db'

export function normalizeTagName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
}

export function ensureTag(db: CatalogDb, name: string): number {
  const norm = normalizeTagName(name)
  if (!norm) throw new Error('Empty tag name')
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(norm) as
    | { id: number }
    | undefined
  if (existing) return existing.id
  const info = db
    .prepare('INSERT INTO tags (name, created_at) VALUES (?, ?)')
    .run(norm, utcNowIso())
  return Number(info.lastInsertRowid)
}

export function getProductTags(db: CatalogDb, productId: number): string[] {
  const rows = db
    .prepare(
      `SELECT t.name
       FROM product_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE pt.product_id = ?
       ORDER BY t.name`
    )
    .all(productId) as Array<{ name: string }>
  return rows.map((r) => r.name)
}

export function setProductTags(
  db: CatalogDb,
  opts: {
    productId: number
    tags: string[]
    replace?: boolean
  }
): string[] {
  const productId = opts.productId
  const row = db.prepare('SELECT id FROM products WHERE id = ?').get(productId) as
    | { id: number }
    | undefined
  if (!row) throw new Error(`Unknown products.id=${productId}`)

  if (opts.replace !== false) {
    db.prepare('DELETE FROM product_tags WHERE product_id = ?').run(productId)
  }

  for (const raw of opts.tags) {
    const norm = normalizeTagName(raw)
    if (!norm) continue
    const tagId = ensureTag(db, norm)
    db.prepare(
      `INSERT OR IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)`
    ).run(productId, tagId)
  }
  return getProductTags(db, productId)
}
