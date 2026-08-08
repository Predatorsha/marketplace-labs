import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppConfig } from '../config'
import { marketRoot, toRelativeFolder } from '../core/paths'
import type { ScrapedProduct } from '../scrape/product'
import type { MarketplacePlatform } from '../scrape/url'
import { jobLog } from '../jobs/log'

export type SavedProductOnDisk = {
  /** Path relative to market_root (stored in SQLite folder_path). */
  folder: string
  /** Scraped product with local_files.images / local_files.choices filled. */
  product: ScrapedProduct
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function localDateStamp(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function shortSlug(title: string, productId: string): string {
  const base = String(title || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
    .trim()
  return base || productId
}

function applyFolderPattern(
  pattern: string,
  opts: { date: string; short: string; id: string; platform: string }
): string {
  return pattern
    .replace(/\{date\}/gi, opts.date)
    .replace(/\{short\}/gi, opts.short)
    .replace(/\{id\}/gi, opts.id)
    .replace(/\{platform\}/gi, opts.platform)
    .replace(/[<>:"|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function uniqueFolderAbs(root: string, baseName: string): string {
  let candidate = join(root, baseName)
  if (!existsSync(candidate)) return candidate
  for (let i = 2; i < 1000; i++) {
    candidate = join(root, `${baseName} (${i})`)
    if (!existsSync(candidate)) return candidate
  }
  return join(root, `${baseName} (${Date.now()})`)
}

/**
 * Persist scraped product assets under output.market_root using folder_pattern.
 * Gallery → images/ (excludes choice). Choice image → choices/.
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
  const root = marketRoot(cfg)
  mkdirSync(root, { recursive: true })

  const folderName = applyFolderPattern(cfg.output.folder_pattern, {
    date: localDateStamp(),
    short: shortSlug(title, product.product_id),
    id: product.product_id,
    platform: opts.platform
  })
  const folderAbs = uniqueFolderAbs(root, folderName)
  mkdirSync(folderAbs, { recursive: true })
  const imagesDir = join(folderAbs, 'images')
  const choicesDir = join(folderAbs, 'choices')
  mkdirSync(imagesDir, { recursive: true })
  mkdirSync(choicesDir, { recursive: true })

  const galleryUrls = Array.isArray(product.gallery_image_urls) ? product.gallery_image_urls : []
  const imageRels: string[] = []
  for (let i = 0; i < galleryUrls.length; i++) {
    const url = galleryUrls[i]
    try {
      const { buffer, contentType } = await downloadBinary(url)
      const ext = extFromUrlOrType(url, contentType)
      const name = `${pad2(i + 1)}.${ext}`
      writeFileSync(join(imagesDir, name), buffer)
      imageRels.push(`images/${name}`)
    } catch (exc) {
      jobLog(
        `save image fail #${i + 1}: ${exc instanceof Error ? exc.message : exc}`
      )
    }
  }

  const choice = product.choice
  if (!choice?.price?.trim()) {
    throw new Error('saveScrapedProductToDisk: choice with price is required')
  }

  let choiceRel = ''
  if (choice.image_url) {
    try {
      const { buffer, contentType } = await downloadBinary(choice.image_url)
      const ext = extFromUrlOrType(choice.image_url, contentType)
      const name = `01.${ext}`
      writeFileSync(join(choicesDir, name), buffer)
      choiceRel = `choices/${name}`
    } catch (exc) {
      jobLog(
        `save choice image fail: ${exc instanceof Error ? exc.message : exc}`
      )
    }
  }

  const folderRel =
    toRelativeFolder(cfg, folderAbs) || folderAbs.replace(/\\/g, '/')

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

  // Lightweight sidecar for debugging / re-import
  try {
    writeFileSync(
      join(folderAbs, 'product.json'),
      JSON.stringify(
        {
          platform: opts.platform,
          product_id: saved.product_id,
          title: saved.title,
          url: saved.url,
          description: saved.description,
          rating: saved.rating,
          review_count: saved.review_count,
          seller_name: saved.seller_name ?? null,
          seller_id: saved.seller_id ?? null,
          store_url: saved.store_url ?? null,
          specs: saved.specs ?? null,
          local_files: saved.local_files
        },
        null,
        2
      ),
      'utf8'
    )
  } catch {
    /* ignore */
  }

  jobLog(
    `saved product folder=${folderRel} images=${imageRels.length} choice=${choiceRel || 'none'}`
  )

  return { folder: folderRel, product: saved }
}
