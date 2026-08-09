import type { ElementHandle, Page } from 'playwright'
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

/** Parse mall.html URL; only succeeds when mall_id is present. */
function parseMallFromUrl(raw: string): { storeUrl: string; sellerId: string } | null {
  try {
    const u = new URL(raw)
    if (!/mall\.html/i.test(u.pathname + u.href)) return null
    const sellerId = u.searchParams.get('mall_id')
    if (!sellerId) return null
    return { storeUrl: u.href, sellerId }
  } catch {
    const m = raw.match(/[?&]mall_id=(\d+)/i)
    if (!/mall\.html/i.test(raw) || !m) return null
    return { storeUrl: raw, sellerId: m[1] }
  }
}

async function queryStoreAvatar(
  page: Page
): Promise<ElementHandle<HTMLAnchorElement> | null> {
  const handle = await page.evaluateHandle(() => {
    const root = document.querySelector('#main_scale > div.mainContent')
    if (!root) return null
    const withImg = root.querySelector('a[href*="mall.html"] img')?.closest('a')
    if (withImg instanceof HTMLAnchorElement) return withImg
    const any = root.querySelector('a[href*="mall.html"]')
    return any instanceof HTMLAnchorElement ? any : null
  })
  const el = handle.asElement()
  if (el) return el as ElementHandle<HTMLAnchorElement>
  await handle.dispose().catch(() => undefined)
  return null
}

/**
 * Store icon: `#main_scale > div.mainContent a[href*="mall.html"]` (with img).
 * Light scroll only — a few short steps, not a full-page crawl.
 */
async function findTemuStoreAvatar(
  page: Page
): Promise<ElementHandle<HTMLAnchorElement> | null> {
  const found = await queryStoreAvatar(page)
  if (found) return found

  for (let i = 0; i < 4; i++) {
    const atBottom = await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (window.scrollY >= max - 8) return true
      window.scrollBy(0, Math.floor(window.innerHeight * 0.4))
      return false
    })
    await sleep(250)
    const again = await queryStoreAvatar(page)
    if (again) return again
    if (atBottom) break
  }
  return null
}

/**
 * After product fields + photos: click store icon in the same tab,
 * capture store_url with mall_id. Soft-fails to nulls; leaves page on mall.
 */
export async function resolveTemuSellerStore(
  page: Page
): Promise<{ storeUrl: string | null; sellerId: string | null }> {
  try {
    const avatar = await findTemuStoreAvatar(page)
    if (!avatar) return { storeUrl: null, sellerId: null }

    try {
      await avatar.scrollIntoViewIfNeeded()
      await sleep(300)
      await avatar.click({ timeout: 10_000 })
    } finally {
      await avatar.dispose().catch(() => undefined)
    }

    await page.waitForLoadState('domcontentloaded').catch(() => undefined)

    const deadline = Date.now() + 12_000
    while (Date.now() < deadline) {
      const parsed = parseMallFromUrl(page.url())
      if (parsed) return parsed
      await sleep(200)
    }

    return { storeUrl: null, sellerId: null }
  } catch {
    return { storeUrl: null, sellerId: null }
  }
}
