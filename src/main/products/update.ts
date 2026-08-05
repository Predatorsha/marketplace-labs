import type { AppConfig } from '../config'
import {
  connect,
  fromRelativeFolder,
  toRelativeFolder,
  utcNowIso
} from '../catalog/db'
import { setProductTags } from '../catalog/repos/tags'
import type {
  ProductEditableFields,
  ProductKey,
  ProductStatus,
  ProductUpdateResult
} from '../../shared/types'
import { findProductRow, folderExists, getProduct } from './load'

const ALLOWED_STATUS = new Set<ProductStatus>(['active', 'archived'])

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

function normalizePackQuantity(value: number | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error('pack_quantity must be a number')
  }
  return Math.trunc(n)
}

function normalizeMyRating(value: number | null | undefined): number | null {
  if (value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error('my_rating must be a number')
  }
  const i = Math.trunc(n)
  if (i < 1 || i > 5) {
    throw new Error('my_rating must be between 1 and 5')
  }
  return i
}

function normalizeStatus(value: ProductStatus | undefined): ProductStatus | undefined {
  if (value === undefined) return undefined
  const status = String(value).trim().toLowerCase() as ProductStatus
  if (!ALLOWED_STATUS.has(status)) {
    throw new Error('status must be active or archived')
  }
  return status
}

function normalizeTags(value: string[] | null | undefined): string[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) throw new Error('tags must be an array')
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    const s = String(raw || '')
      .trim()
      .replace(/^#/, '')
      .toLowerCase()
      .replace(/[\s_]+/g, ' ')
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export async function updateProduct(
  cfg: AppConfig,
  key: ProductKey,
  patch: ProductEditableFields
): Promise<ProductUpdateResult> {
  try {
    if (!patch || typeof patch !== 'object') {
      return { ok: false, error: 'patch is required' }
    }

    const db = connect(cfg)
    let platform = ''
    let productId = ''
    try {
      const row = findProductRow(db, cfg, key)
      if (!row) {
        return { ok: false, error: 'Товар не найден в каталоге' }
      }
      if (!row.folder_path) {
        return { ok: false, error: 'У товара нет папки на диске' }
      }

      platform = row.platform
      productId = row.marketplace_product_id

      let folderAbs = fromRelativeFolder(cfg, row.folder_path)
      if (!folderAbs) {
        return { ok: false, error: 'Не удалось разрешить путь папки товара' }
      }

      if ('folder_path' in patch) {
        const requested = normalizeText(patch.folder_path)
        if (!requested) {
          return { ok: false, error: 'folder_path не может быть пустым' }
        }
        const candidate = fromRelativeFolder(cfg, requested)
        if (!candidate) {
          return { ok: false, error: 'Папка должна быть внутри корневой папки каталога' }
        }
        if (!(await folderExists(candidate))) {
          return {
            ok: false,
            error: 'Папка для relink должна существовать'
          }
        }
        folderAbs = candidate
      }

      const now = utcNowIso()
      const title = 'title' in patch ? normalizeText(patch.title) : row.title
      const url = 'url' in patch ? normalizeText(patch.url) : row.url
      const purpose = 'purpose' in patch ? normalizeText(patch.purpose) : row.purpose
      const pack_quantity =
        'pack_quantity' in patch
          ? normalizePackQuantity(patch.pack_quantity)
          : row.pack_quantity
      const my_rating =
        'my_rating' in patch ? normalizeMyRating(patch.my_rating) : row.my_rating
      const status = normalizeStatus(patch.status) ?? row.status ?? 'active'
      const folderRel = toRelativeFolder(cfg, folderAbs)
      const description =
        'description' in patch
          ? patch.description == null || !String(patch.description).trim()
            ? null
            : String(patch.description)
          : row.description

      db.prepare(
        `UPDATE products
         SET title = ?,
             url = ?,
             folder_path = ?,
             purpose = ?,
             pack_quantity = ?,
             my_rating = ?,
             description = ?,
             status = ?,
             last_seen_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        title,
        url,
        folderRel,
        purpose,
        pack_quantity,
        my_rating,
        description,
        status,
        now,
        now,
        row.id
      )

      if ('tags' in patch) {
        const tags = normalizeTags(patch.tags) || []
        setProductTags(db, { productId: row.id, tags, replace: true })
      }
    } finally {
      db.close()
    }

    return getProduct(cfg, { platform, product_id: productId })
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    return { ok: false, error: message }
  }
}
