import { access } from 'fs/promises'
import { resolve } from 'path'
import type { AppConfig } from '../config'
import {
  getProductChoices,
  getProductImages,
  joinChoicePrices
} from '../code/products'
import { getProductTags } from '../code/tags'
import { connect, type CatalogDb } from '../core/connect'
import { fromRelativeFolder, toRelativeFolder } from '../core/paths'
import { toMediaUrl } from '../media/protocol'
import type { ProductCard, ProductGetResult, ProductKey } from '../../shared/types'
import { resolveChoiceItems, resolveGalleryPaths } from './gallery'

export type ProductRow = {
  id: number
  platform: string
  marketplace_product_id: string
  title: string | null
  url: string | null
  folder_path: string | null
  purpose: string | null
  pack_quantity: number | null
  my_rating: number | null
  rating: string | null
  review_count: string | null
  description: string | null
  status: string
}

const PRODUCT_SELECT = `SELECT id, platform, marketplace_product_id, title, url, folder_path,
                  purpose, pack_quantity, my_rating, rating, review_count, description, status
           FROM products`

function normalizeKey(key: ProductKey): ProductKey {
  if ('folder' in key && key.folder != null) {
    const folder = String(key.folder || '').trim()
    if (!folder) throw new Error('folder is required')
    return { folder }
  }
  const platform = String((key as { platform?: string }).platform || '')
    .trim()
    .toLowerCase()
  const product_id = String((key as { product_id?: string }).product_id || '').trim()
  if (!platform || !product_id) {
    throw new Error('platform and product_id are required')
  }
  return { platform, product_id }
}

export function findProductRow(db: CatalogDb, cfg: AppConfig, key: ProductKey): ProductRow | null {
  const normalized = normalizeKey(key)
  if ('folder' in normalized && typeof normalized.folder === 'string') {
    const abs = resolve(normalized.folder)
    const rel = toRelativeFolder(cfg, abs)
    const candidates = [rel, abs.replace(/\\/g, '/')].filter(
      (v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i
    )
    for (const folderPath of candidates) {
      const row = db
        .prepare(`${PRODUCT_SELECT} WHERE folder_path = ?`)
        .get(folderPath) as ProductRow | undefined
      if (row) return row
    }
    return null
  }

  const platform = String(normalized.platform || '').trim().toLowerCase()
  const productId = String(normalized.product_id || '').trim()
  return (
    (db
      .prepare(`${PRODUCT_SELECT} WHERE platform = ? AND marketplace_product_id = ?`)
      .get(platform, productId) as ProductRow | undefined) ?? null
  )
}

export async function folderExists(folder: string): Promise<boolean> {
  try {
    await access(folder)
    return true
  } catch {
    return false
  }
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asMyRating(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  if (i < 1 || i > 5) return null
  return i
}

export function buildProductCard(
  row: ProductRow,
  cfg: AppConfig,
  tags: string[] = [],
  imageUrls: string[] = [],
  choices: ProductCard['choices'] = []
): ProductCard {
  const folderAbs =
    fromRelativeFolder(cfg, row.folder_path) ||
    (row.folder_path ? resolve(row.folder_path) : '')
  const folder_path =
    toRelativeFolder(cfg, folderAbs) || row.folder_path || folderAbs.replace(/\\/g, '/')

  return {
    id: row.id,
    platform: row.platform,
    product_id: row.marketplace_product_id,
    folder: folderAbs,
    folder_path,
    title: row.title,
    url: row.url,
    purpose: row.purpose,
    pack_quantity: row.pack_quantity,
    my_rating: asMyRating(row.my_rating),
    rating: asStringOrNull(row.rating),
    review_count: asStringOrNull(row.review_count),
    price: joinChoicePrices(choices.map((c) => c.price)),
    status: row.status || 'active',
    description: typeof row.description === 'string' ? row.description : null,
    tags,
    image_urls: imageUrls,
    choices
  }
}

export async function getProduct(cfg: AppConfig, key: ProductKey): Promise<ProductGetResult> {
  try {
    const db = connect(cfg)
    try {
      const row = findProductRow(db, cfg, key)
      if (!row) {
        return { ok: false, error: 'Товар не найден в каталоге' }
      }
      if (!row.folder_path) {
        return { ok: false, error: 'У товара нет папки на диске' }
      }
      const folderAbs = fromRelativeFolder(cfg, row.folder_path)
      if (!folderAbs) {
        return { ok: false, error: 'Не удалось разрешить путь папки товара' }
      }
      const tags = getProductTags(db, row.id)
      const imageRows = getProductImages(db, row.id)
      const choiceRows = getProductChoices(db, row.id)
      const galleryPaths = await resolveGalleryPaths(folderAbs, imageRows)
      const imageUrls = galleryPaths.map((p) => toMediaUrl(p))
      const resolved = await resolveChoiceItems(folderAbs, choiceRows)
      const choices = resolved.map((c) => ({
        url: c.absPath ? toMediaUrl(c.absPath) : '',
        file: c.file,
        name: c.name,
        group: c.group,
        price: c.price
      }))
      return {
        ok: true,
        product: buildProductCard(
          { ...row, folder_path: row.folder_path },
          cfg,
          tags,
          imageUrls,
          choices
        )
      }
    } finally {
      db.close()
    }
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    return { ok: false, error: message }
  }
}
