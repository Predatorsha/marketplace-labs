import { mkdirSync, existsSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'fs'
import { join } from 'path'
import type { AppConfig } from '../config'
import { productFolderExists } from '../code/products'
import { fromRelativeFolder, marketRoot, toRelativeFolder } from '../core/paths'
import type { ScrapedProduct } from '../scrape/product'
import type { MarketplacePlatform } from '../scrape/url'
import { jobLog } from '../jobs/log'
import { formatSnapshotDirName, resolveActiveSnapshot } from './snapshots'

export type SavedProductOnDisk = {
  /** Product root relative to market_root (stored in SQLite folder_path). */
  folder: string
  /** Scraped product with local_files.images / local_files.choices filled. */
  product: ScrapedProduct
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `{product_id} {title}` — sanitized for Windows paths. */
function productRootFolderName(productId: string, title: string): string {
  const id = String(productId || '').trim() || 'unknown'
  let name = String(title || '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim()
  if (!name) name = id
  return `${id} ${name}`.replace(/\s+/g, ' ').trim()
}

function uniqueProductRootAbs(root: string, baseName: string): string {
  let candidate = join(root, baseName)
  if (!existsSync(candidate)) return candidate
  for (let i = 2; i < 1000; i++) {
    candidate = join(root, `${baseName} (${i})`)
    if (!existsSync(candidate)) return candidate
  }
  return join(root, `${baseName} (${Date.now()})`)
}

function allocateSnapshotAbs(productRootAbs: string): string {
  for (let i = 0; i < 1000; i++) {
    const candidate = join(productRootAbs, formatSnapshotDirName(new Date(Date.now() + i * 1000)))
    if (!existsSync(candidate)) return candidate
  }
  return join(productRootAbs, formatSnapshotDirName())
}

function extFromUrlOrType(url: string, contentType: string | null): string {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  const path = url.split('?')[0].toLowerCase()
  if (path.endsWith('.png')) return 'png'
  if (path.endsWith('.webp')) return 'webp'
  if (path.endsWith('.gif')) return 'gif'
  return 'jpg'
}

async function downloadBinary(
  url: string
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://www.temu.com/'
    }
  })
  if (!res.ok) {
    throw new Error(`image download HTTP ${res.status}: ${url.slice(0, 120)}`)
  }
  const contentType = res.headers.get('content-type')
  const buffer = Buffer.from(await res.arrayBuffer())
  if (!buffer.length) throw new Error(`empty image body: ${url.slice(0, 120)}`)
  return { buffer, contentType }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const abs = join(dir, name)
    try {
      if (statSync(abs).isFile()) out.push(name)
    } catch {
      /* ignore */
    }
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return out
}

/** Copy files from srcDir into destDir; return destination basenames. */
function copyDirFiles(srcDir: string, destDir: string): string[] {
  const names = listFiles(srcDir)
  if (!names.length) return []
  mkdirSync(destDir, { recursive: true })
  const written: string[] = []
  for (const name of names) {
    copyFileSync(join(srcDir, name), join(destDir, name))
    written.push(name)
  }
  return written
}

/**
 * Resolve product root folder (stable across re-scrapes).
 * Reuses catalog folder_path when present on disk; else `{id} {title}`.
 */
function resolveProductRootAbs(
  cfg: AppConfig,
  opts: { platform: MarketplacePlatform; productId: string; title: string }
): { rootAbs: string; reused: boolean } {
  const market = marketRoot(cfg)
  const existingRel = productFolderExists(cfg, opts.platform, opts.productId)
  if (existingRel) {
    const existingAbs = fromRelativeFolder(cfg, existingRel)
    if (existingAbs && existsSync(existingAbs)) {
      return { rootAbs: existingAbs, reused: true }
    }
  }
  const baseName = productRootFolderName(opts.productId, opts.title)
  return { rootAbs: uniqueProductRootAbs(market, baseName), reused: false }
}

/**
 * Persist scraped product assets under market_root:
 * `{id} {title}/{YYYY_MM_DD HH-mm-ss}/{images,choices}/`
 * `folder_path` in DB is the product root. Each download with files → new snapshot.
 */
export async function saveScrapedProductToDisk(
  cfg: AppConfig,
  opts: {
    platform: MarketplacePlatform
    product: ScrapedProduct
  }
): Promise<SavedProductOnDisk> {
  const product = { ...opts.product }
  const title = String(product.title || product.description || product.product_id)
  const market = marketRoot(cfg)
  mkdirSync(market, { recursive: true })

  const { rootAbs, reused } = resolveProductRootAbs(cfg, {
    platform: opts.platform,
    productId: String(product.product_id || ''),
    title
  })
  mkdirSync(rootAbs, { recursive: true })

  const choice = product.choice
  if (!choice?.price?.trim()) {
    throw new Error('saveScrapedProductToDisk: choice with price is required')
  }

  const galleryUrls = Array.isArray(product.gallery_image_urls) ? product.gallery_image_urls : []
  const downloadedImages: Array<{ name: string; buffer: Buffer }> = []
  for (let i = 0; i < galleryUrls.length; i++) {
    const url = galleryUrls[i]
    try {
      const { buffer, contentType } = await downloadBinary(url)
      const ext = extFromUrlOrType(url, contentType)
      downloadedImages.push({ name: `${pad2(i + 1)}.${ext}`, buffer })
    } catch (exc) {
      jobLog(`save image fail #${i + 1}: ${exc instanceof Error ? exc.message : exc}`)
    }
  }

  let choiceBuffer: { name: string; buffer: Buffer } | null = null
  if (choice.image_url) {
    try {
      const { buffer, contentType } = await downloadBinary(choice.image_url)
      const ext = extFromUrlOrType(choice.image_url, contentType)
      choiceBuffer = { name: `01.${ext}`, buffer }
    } catch (exc) {
      jobLog(`save choice image fail: ${exc instanceof Error ? exc.message : exc}`)
    }
  }

  let imageRels: string[] = []
  let choiceRel = ''
  let snapshotName = ''

  // New snapshot only when this run downloaded at least one file.
  if (downloadedImages.length > 0 || choiceBuffer) {
    const prevActive = resolveActiveSnapshot(rootAbs)
    const snapshotAbs = allocateSnapshotAbs(rootAbs)
    snapshotName = snapshotAbs.slice(rootAbs.length).replace(/^[/\\]+/, '')
    mkdirSync(snapshotAbs, { recursive: true })
    const imagesDir = join(snapshotAbs, 'images')
    const choicesDir = join(snapshotAbs, 'choices')
    mkdirSync(imagesDir, { recursive: true })
    mkdirSync(choicesDir, { recursive: true })

    if (downloadedImages.length) {
      for (const img of downloadedImages) {
        writeFileSync(join(imagesDir, img.name), img.buffer)
        imageRels.push(`images/${img.name}`)
      }
    } else if (prevActive) {
      // Keep gallery on the new active stamp when only choice was re-downloaded.
      imageRels = copyDirFiles(join(prevActive, 'images'), imagesDir).map((n) => `images/${n}`)
    }

    if (choiceBuffer) {
      writeFileSync(join(choicesDir, choiceBuffer.name), choiceBuffer.buffer)
      choiceRel = `choices/${choiceBuffer.name}`
    } else if (prevActive) {
      const copied = copyDirFiles(join(prevActive, 'choices'), choicesDir)
      if (copied.length) choiceRel = `choices/${copied[0]}`
    }
  } else {
    // No files downloaded — do not create a snapshot; keep prior choice path for price upsert.
    const prevActive = resolveActiveSnapshot(rootAbs)
    if (prevActive) {
      const prior = listFiles(join(prevActive, 'choices'))
      if (prior.length) choiceRel = `choices/${prior[0]}`
    }
  }

  const folderRel = toRelativeFolder(cfg, rootAbs) || rootAbs.replace(/\\/g, '/')

  const saved: ScrapedProduct = {
    ...product,
    gallery_image_urls: undefined,
    choice: undefined,
    local_files: {
      images: imageRels,
      choices: [
        {
          file: choiceRel,
          name: choice.name ?? null,
          group: choice.group ?? null,
          price: choice.price.trim()
        }
      ]
    }
  }

  jobLog(
    `saved product folder=${folderRel}${reused ? ' (reused root)' : ''}` +
      `${snapshotName ? ` snapshot=${snapshotName}` : ' (no snapshot)'}` +
      ` images=${imageRels.length} choice=${choiceRel || 'none'}`
  )

  return { folder: folderRel, product: saved }
}
