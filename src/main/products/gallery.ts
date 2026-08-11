import { access, readdir } from 'fs/promises'
import { join } from 'path'
import type { ProductChoiceRow, ProductImageRow } from '../db/models/product'
import { resolveActiveSnapshot } from './snapshots'

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/** Media root for a product: active timestamp snapshot, or null. */
function mediaRoot(productRootAbs: string): string | null {
  return resolveActiveSnapshot(productRootAbs)
}

async function resolveRelPaths(folderAbs: string, relPaths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const raw of relPaths) {
    const rel = String(raw || '')
      .trim()
      .replace(/\\/g, '/')
    if (!rel) continue
    const abs = join(folderAbs, rel)
    if (await pathExists(abs)) out.push(abs)
  }
  return out
}

async function scanImagesDir(folderAbs: string): Promise<string[]> {
  try {
    const imagesDir = join(folderAbs, 'images')
    const files = (await readdir(imagesDir)).filter((f) => !f.startsWith('.'))
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const out: string[] = []
    for (const f of files) {
      const abs = join(imagesDir, f)
      if (await pathExists(abs)) out.push(abs)
    }
    return out
  } catch {
    return []
  }
}

/** First gallery photo from active snapshot: product_images[0], else images/01.* / first file. */
export async function resolveCoverPath(
  productRootAbs: string,
  images: ProductImageRow[] = []
): Promise<string | null> {
  const folderAbs = mediaRoot(productRootAbs)
  if (!folderAbs) return null

  const fromDb = await resolveRelPaths(
    folderAbs,
    images.map((img) => img.rel_path)
  )
  if (fromDb.length) return fromDb[0]

  try {
    const imagesDir = join(folderAbs, 'images')
    const files = (await readdir(imagesDir)).filter((f) => !f.startsWith('.'))
    if (!files.length) return null
    const preferred = files.find((f) => /^01\./i.test(f))
    if (preferred) return join(imagesDir, preferred)
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    return join(imagesDir, files[0])
  } catch {
    return null
  }
}

export type ResolvedChoice = {
  absPath: string | null
  file: string
  name: string | null
  group: string | null
  price: string
  sold_out: boolean
}

/** Choice rows from DB; paths resolved under the active snapshot. */
export async function resolveChoiceItems(
  productRootAbs: string,
  choices: ProductChoiceRow[]
): Promise<ResolvedChoice[]> {
  const folderAbs = mediaRoot(productRootAbs)
  const out: ResolvedChoice[] = []
  for (const row of choices) {
    const rel = String(row.rel_path || '')
      .trim()
      .replace(/\\/g, '/')
    let absPath: string | null = null
    if (rel && folderAbs) {
      const abs = join(folderAbs, rel)
      if (await pathExists(abs)) absPath = abs
    }
    out.push({
      absPath,
      file: rel,
      name: row.name,
      group: row.group_name,
      price: row.price,
      sold_out: Boolean(row.sold_out)
    })
  }
  return out
}

/** Gallery paths from active snapshot (DB order, else scan images/). */
export async function resolveGalleryPaths(
  productRootAbs: string,
  images: ProductImageRow[] = []
): Promise<string[]> {
  const folderAbs = mediaRoot(productRootAbs)
  if (!folderAbs) return []
  const fromDb = await resolveRelPaths(
    folderAbs,
    images.map((img) => img.rel_path)
  )
  if (fromDb.length) return fromDb
  return scanImagesDir(folderAbs)
}
