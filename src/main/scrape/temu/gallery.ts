import type { Page } from 'playwright'
import { jobLog } from '../../jobs/log'

/** Rail photos split by role: leading → product images, trailing → Choice photos. */
export type TemuGallery = {
  images: string[]
  choices: string[]
}

function stripQuery(url: string): string {
  try {
    const u = new URL(url)
    u.search = ''
    u.hash = ''
    return u.href
  } catch {
    return url.split('?')[0]
  }
}

/**
 * Left-rail thumbs (#leftContent ol > li) are the full gallery in Temu order.
 * First and last <li> are not photos — skip them. The trailing N photos are the
 * variant (Choice) images, N = imgs inside #rightContent [role=radio].
 */
export async function collectTemuGallery(page: Page): Promise<TemuGallery> {
  const { srcs, choiceCount } = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#leftContent ol > li'))
    const srcs: string[] = []
    for (const li of items.slice(1, -1)) {
      const img = li.querySelector('img')
      let src = img ? img.currentSrc || img.src : ''
      if (!src || src.startsWith('data:')) {
        // Lazy slide not loaded yet — same asset sits in the inline
        // background-image of the slide div (smaller variant, query differs).
        const bgEl = li.querySelector<HTMLElement>('[style*="background-image"]')
        const m = bgEl
          ? /url\(["']?([^"')]+)["']?\)/.exec(bgEl.style.backgroundImage)
          : null
        if (m) src = m[1]
      }
      if (src && !src.startsWith('data:')) srcs.push(src)
    }
    const choiceCount = document.querySelectorAll(
      '#rightContent [role="radio"] img'
    ).length
    return { srcs, choiceCount }
  })

  const urls = srcs.map(stripQuery)
  jobLog(`temu gallery: rail=${urls.length} choiceImgs=${choiceCount}`)
  const n = Math.min(choiceCount, urls.length)
  const choices = n > 0 ? urls.slice(urls.length - n) : []

  // Dedupe images by URL (query already stripped): drop repeats and any photo
  // that also appears among the Choice photos.
  const seen = new Set(choices.map((u) => u.toLowerCase()))
  const images: string[] = []
  for (const u of urls.slice(0, urls.length - n)) {
    const key = u.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    images.push(u)
  }

  return { images, choices }
}
