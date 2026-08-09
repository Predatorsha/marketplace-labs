import type { Page } from 'playwright'
import { jobLog } from '../../jobs/log'
import { fullSizeAliImageUrl } from './util'

/**
 * Main slider thumbs (`slider--img--*` rail) in page order, upgraded to
 * full-size URLs. The trailing N photos duplicate the SKU variant images.
 * The video slide (item with a `slider--videoIcon--*` overlay) is skipped —
 * its poster duplicates a photo; the video itself goes through collectAliVideo.
 */
export async function collectAliSliderImages(page: Page): Promise<string[]> {
  const srcs = await page.evaluate(() => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('[class*="slider--item--"]')
    )
    const out: string[] = []
    for (const item of items) {
      if (item.querySelector('[class*="slider--videoIcon--"]')) continue
      const img = item.querySelector<HTMLImageElement>('[class*="slider--img--"] img')
      const src = img ? img.currentSrc || img.src : ''
      if (src) out.push(src)
    }
    return out
  })

  const out: string[] = []
  for (const s of srcs) {
    const full = fullSizeAliImageUrl(s)
    if (full && !full.startsWith('data:') && !out.includes(full)) out.push(full)
  }
  jobLog(`aliexpress slider: ${out.length} photos`)
  return out
}

/**
 * Gallery video URL, when the slider has a video slide. Clicks the slide so
 * the main preview mounts a `<video>` element, reads its src, then switches
 * back to the next slide. Blob/HLS sources cannot be downloaded → null.
 */
export async function collectAliVideo(page: Page): Promise<string | null> {
  const videoSlide = page.locator(
    '[class*="slider--item--"]:has([class*="slider--videoIcon--"])'
  )
  if (!(await videoSlide.count())) return null

  let url: string | null = null
  try {
    await videoSlide.first().click({ timeout: 5_000 })
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video')
        return !!(v && (v.currentSrc || v.src || v.querySelector('source')?.src))
      },
      { timeout: 10_000 }
    )
    url = await page.evaluate(() => {
      const v = document.querySelector('video')
      const src =
        v?.currentSrc || v?.src || v?.querySelector('source')?.getAttribute('src') || ''
      try {
        v?.pause()
      } catch {
        /* ignore */
      }
      return src || null
    })
  } catch (exc) {
    jobLog(`aliexpress video: src not found (${exc instanceof Error ? exc.message : exc})`)
  }

  // Restore a photo in the main preview for the rest of the scrape.
  await page
    .locator('[class*="slider--item--"]:not(:has([class*="slider--videoIcon--"]))')
    .first()
    .click({ timeout: 3_000 })
    .catch(() => undefined)

  if (url && url.startsWith('blob:')) {
    jobLog('aliexpress video: blob source, cannot download')
    return null
  }
  if (url && url.startsWith('//')) url = `https:${url}`
  jobLog(`aliexpress video: ${url ? url.slice(0, 120) : 'none'}`)
  return url
}

/**
 * Product photos from the description block. The section renders a nested
 * `#product-description` inside an open shadow root:
 * `#product-description > div` → shadowRoot → `img` list (full-size already).
 */
export async function collectAliDescriptionImages(page: Page): Promise<string[]> {
  await page
    .locator('#product-description')
    .first()
    .scrollIntoViewIfNeeded({ timeout: 5_000 })
    .catch(() => undefined)

  await page
    .waitForFunction(
      () => {
        const host = document.querySelector('#product-description > div')
        const root = host?.shadowRoot ?? host
        return !!root && root.querySelectorAll('img').length > 0
      },
      { timeout: 15_000 }
    )
    .catch(() => undefined)

  const srcs = await page.evaluate(() => {
    const host = document.querySelector('#product-description > div')
    const root = host?.shadowRoot ?? host ?? document.getElementById('product-description')
    if (!root) return []
    return Array.from(root.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') || '')
      .filter((s) => /^(https?:)?\/\//.test(s))
  })

  const out: string[] = []
  for (const s of srcs) {
    const full = fullSizeAliImageUrl(s)
    if (full && !out.includes(full)) out.push(full)
  }
  jobLog(`aliexpress description: ${out.length} photos`)
  return out
}
