import type { Page } from 'playwright'
import { jobLog } from '../../jobs/log'
import { fullSizeAliImageUrl } from './util'

/**
 * Main slider thumbs (`slider--img--*` rail) in page order, upgraded to
 * full-size URLs. The trailing N photos duplicate the SKU variant images.
 */
export async function collectAliSliderImages(page: Page): Promise<string[]> {
  const srcs = await page.evaluate(() => {
    const imgs = Array.from(
      document.querySelectorAll<HTMLImageElement>('[class*="slider--img--"] img')
    )
    return imgs.map((img) => img.currentSrc || img.src || '').filter(Boolean)
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
