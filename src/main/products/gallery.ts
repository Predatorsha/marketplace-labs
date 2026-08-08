import { access, readdir } from 'fs/promises'
import { join } from 'path'
import type { ProductChoiceRow, ProductImageRow } from '../db/models/product'

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
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

/** First gallery photo: product_images[0], else images/01.* / first file. */
export async function resolveCoverPath(
  folderAbs: string,
  images: ProductImageRow[] = []
): Promise<string | null> {
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
}

/** Choice rows from DB; absPath null when file missing or rel_path empty. */
export async function resolveChoiceItems(
  folderAbs: string,
  choices: ProductChoiceRow[]
): Promise<ResolvedChoice[]> {
  const out: ResolvedChoice[] = []
  for (const row of choices) {
    const rel = String(row.rel_path || '')
      .trim()
      .replace(/\\/g, '/')
    let absPath: string | null = null
    if (rel) {
      const abs = join(folderAbs, rel)
      if (await pathExists(abs)) absPath = abs
    }
    out.push({
      absPath,
      file: rel,
      name: row.name,
      group: row.group_name,
      price: row.price
    })
  }
  return out
}

/** Gallery paths from product_images order, else scan images/. */
export async function resolveGalleryPaths(
  folderAbs: string,
  images: ProductImageRow[] = []
): Promise<string[]> {
  const fromDb = await resolveRelPaths(
    folderAbs,
    images.map((img) => img.rel_path)
  )
  if (fromDb.length) return fromDb
  return scanImagesDir(folderAbs)
}
