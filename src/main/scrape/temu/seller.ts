import type { Page } from 'playwright'
import { sleep } from './util'

/** Seller display name from the store card above Product details. */
export async function extractTemuSellerName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const avatarAnchor = Array.from(document.querySelectorAll('a[href*="mall"]')).find((a) => {
      const img = a.querySelector('img')
      if (!img) return false
      const alt = (img.getAttribute('alt') || '').trim()
      const around = (a.closest('section, article, div')?.textContent || '').slice(0, 600)
      return (
        !!alt &&
        !/^avatar$/i.test(alt) &&
        /followers|shop all items|started to sell/i.test(around)
      )
    }) as HTMLAnchorElement | undefined

    if (avatarAnchor) {
      const img = avatarAnchor.querySelector('img')
      const name = (img?.getAttribute('alt') || '').trim()
      if (name) return name
    }

    const soldBy = document.querySelector('a[aria-label^="Sold by" i]')
    const aria = soldBy?.getAttribute('aria-label') || ''
    const soldMatch = aria.match(/^Sold by\s+(.+)$/i)
    if (soldMatch) return soldMatch[1].trim()

    const nearShop = Array.from(document.querySelectorAll('[role="link"][aria-label]')).find(
      (el) => {
        const label = (el.getAttribute('aria-label') || '').trim()
        if (!label || /shop all|sold by|follow|avatar/i.test(label)) return false
        const blockText = (el.closest('section, article, div')?.textContent || '').slice(0, 500)
        return /followers|shop all items|started to sell/i.test(blockText)
      }
    )
    if (nearShop) {
      const label = (nearShop.getAttribute('aria-label') || '').trim()
      if (label) return label
    }

    return null
  })
}

function parseMallFromUrl(raw: string): { storeUrl: string; sellerId: string | null } | null {
  try {
    const u = new URL(raw)
    if (!/mall\.html/i.test(u.pathname + u.href)) return null
    const sellerId = u.searchParams.get('mall_id')
    return { storeUrl: u.href, sellerId }
  } catch {
    const m = raw.match(/[?&]mall_id=(\d+)/i)
    if (!/mall\.html/i.test(raw) || !m) return null
    return { storeUrl: raw, sellerId: m[1] }
  }
}

/** Resolve mall link href from the product page (does not navigate). */
async function findTemuMallHref(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const avatarAnchor = Array.from(document.querySelectorAll('a[href*="mall"]')).find((a) => {
      const img = a.querySelector('img')
      if (!img) return false
      const alt = (img.getAttribute('alt') || '').trim()
      const around = (a.closest('section, article, div')?.textContent || '').slice(0, 600)
      return (
        !!alt &&
        !/^avatar$/i.test(alt) &&
        /followers|shop all items|started to sell/i.test(around)
      )
    }) as HTMLAnchorElement | undefined
    if (avatarAnchor?.href) return avatarAnchor.href

    const shop = Array.from(document.querySelectorAll('a[href]')).find((a) =>
      /shop all items/i.test((a.textContent || '').replace(/\s+/g, ' '))
    ) as HTMLAnchorElement | undefined
    return shop?.href || null
  })
}

/**
 * Resolve seller store URL + mall_id without leaving the product tab.
 * Prefer parsing the mall href on the card; else open mall in a background tab and close it.
 */
export async function resolveTemuSellerStore(
  page: Page
): Promise<{ storeUrl: string | null; sellerId: string | null }> {
  const href = await findTemuMallHref(page)
  if (!href) return { storeUrl: null, sellerId: null }

  let absolute: string
  try {
    absolute = new URL(href, page.url()).href
  } catch {
    return { storeUrl: null, sellerId: null }
  }

  const fromHref = parseMallFromUrl(absolute)
  if (fromHref?.sellerId) return fromHref

  // Background tab: product page stays put; we never bring the mall tab to front.
  const storePage = await page.context().newPage()
  try {
    await storePage.goto(absolute, { waitUntil: 'domcontentloaded', timeout: 25_000 })
    await sleep(300)

    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      const parsed = parseMallFromUrl(storePage.url())
      if (parsed?.sellerId) return parsed
      await sleep(200)
    }

    return parseMallFromUrl(storePage.url()) ?? { storeUrl: null, sellerId: null }
  } catch {
    return { storeUrl: null, sellerId: null }
  } finally {
    await storePage.close().catch(() => undefined)
  }
}
