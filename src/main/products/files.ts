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

function extFromContentType(contentType: string | null): string {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('gif')) return 'gif'
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

  const choices = product.choices ?? []
  if (!choices.length || choices.some((c) => !c.price?.trim())) {
    throw new Error('saveScrapedProductToDisk: at least one choice with a price is required')
  }

  const galleryUrls = product.gallery_image_urls ?? []
  const downloadedImages: Array<{ name: string; buffer: Buffer }> = []
  for (let i = 0; i < galleryUrls.length; i++) {
    try {
      const { buffer, contentType } = await downloadBinary(galleryUrls[i])
      downloadedImages.push({ name: `${pad2(i + 1)}.${extFromContentType(contentType)}`, buffer })
    } catch (exc) {
      jobLog(`save image fail #${i + 1}: ${exc instanceof Error ? exc.message : exc}`)
    }
  }

  // One file per choice, indexed like the choice list (01..NN); null = not downloaded.
  const choiceBuffers: Array<{ name: string; buffer: Buffer } | null> = []
  for (let i = 0; i < choices.length; i++) {
    const url = choices[i].image_url
    if (!url) {
      choiceBuffers.push(null)
      continue
    }
    try {
      const { buffer, contentType } = await downloadBinary(url)
      choiceBuffers.push({ name: `${pad2(i + 1)}.${extFromContentType(contentType)}`, buffer })
    } catch (exc) {
      jobLog(`save choice image fail #${i + 1}: ${exc instanceof Error ? exc.message : exc}`)
      choiceBuffers.push(null)
    }
  }
  const anyChoiceDownloaded = choiceBuffers.some(Boolean)

  let imageRels: string[] = []
  const choiceRels: string[] = choices.map(() => '')
  let snapshotName = ''

  // New snapshot only when this run downloaded at least one file.
  if (downloadedImages.length > 0 || anyChoiceDownloaded) {
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

    if (anyChoiceDownloaded) {
      for (let i = 0; i < choiceBuffers.length; i++) {
        const buf = choiceBuffers[i]
        if (!buf) continue
        writeFileSync(join(choicesDir, buf.name), buf.buffer)
        choiceRels[i] = `choices/${buf.name}`
      }
    } else if (prevActive) {
      // Keep prior choice photos on the new active stamp (paired by sort order).
      const copied = copyDirFiles(join(prevActive, 'choices'), choicesDir)
      copied.forEach((n, i) => {
        if (i < choiceRels.length) choiceRels[i] = `choices/${n}`
      })
    }
  } else {
    // No files downloaded — do not create a snapshot; keep prior choice paths for price upsert.
    const prevActive = resolveActiveSnapshot(rootAbs)
    if (prevActive) {
      listFiles(join(prevActive, 'choices')).forEach((n, i) => {
        if (i < choiceRels.length) choiceRels[i] = `choices/${n}`
      })
    }
  }

  const folderRel = toRelativeFolder(cfg, rootAbs) || rootAbs.replace(/\\/g, '/')

  const saved: ScrapedProduct = {
    ...product,
    gallery_image_urls: undefined,
    choices: undefined,
    local_files: {
      images: imageRels,
      choices: choices.map((c, i) => ({
        file: choiceRels[i],
        name: c.name ?? null,
        group: c.group ?? null,
        price: c.price.trim()
      }))
    }
  }

  jobLog(
    `saved product folder=${folderRel}${reused ? ' (reused root)' : ''}` +
      `${snapshotName ? ` snapshot=${snapshotName}` : ' (no snapshot)'}` +
      ` images=${imageRels.length} choices=${choiceRels.filter(Boolean).length}/${choices.length}`
  )

  return { folder: folderRel, product: saved }
}
