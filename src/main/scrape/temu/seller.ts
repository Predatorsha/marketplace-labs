import type { ElementHandle, Page } from 'playwright'
import { sleep } from './util'

/**
 * Карточка магазина в #leftContent, общий признак для обеих вёрсток
 * (стандартная — с <a href="/mall.html">, брендовая витрина Star seller —
 * div[role="button"] без <a>): самый вложенный блок, где есть счётчики
 * Followers + Sold и аватарка <img> с непустым alt (alt = имя магазина).
 * Дублируется в обоих evaluate: колбэки сериализуются по отдельности.
 */

/** Seller display name from the store card above Product details. */
export async function extractTemuSellerName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const root =
      document.querySelector('#leftContent') ||
      document.querySelector('#main_scale > div.mainContent') ||
      document.body
    if (!root) return null
    const isNameAlt = (i: Element): boolean => {
      const alt = (i.getAttribute('alt') || '').trim()
      return alt.length > 1 && !/^avatar$/i.test(alt)
    }
    const cards = Array.from(root.querySelectorAll<HTMLElement>('div, section')).filter((el) => {
      const t = (el.innerText || '').replace(/\s+/g, ' ')
      if (t.length > 600 || !/followers/i.test(t) || !/sold/i.test(t)) return false
      return Array.from(el.querySelectorAll('img')).some(isNameAlt)
    })
    // querySelectorAll идёт в порядке документа — последний кандидат самый вложенный.
    const card = cards[cards.length - 1]
    if (!card) return null

    const img = Array.from(card.querySelectorAll('img')).find(isNameAlt)
    const linkName = card.querySelector('[role="link"][aria-label]')
    const raw =
      (img?.getAttribute('alt') || '').trim() ||
      (linkName?.getAttribute('aria-label') || '').trim() ||
      (card.querySelector('span')?.textContent || '').trim()
    // "Brand Official Store: TWOING" → "TWOING"; обычное имя без ':' не трогаем.
    return raw.replace(/^.*?store:\s*/i, '').trim() || null
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

async function queryStoreAvatar(page: Page): Promise<ElementHandle<HTMLElement> | null> {
  const handle = await page.evaluateHandle(() => {
    const root =
      document.querySelector('#leftContent') ||
      document.querySelector('#main_scale > div.mainContent') ||
      document.body
    if (!root) return null
    const cards = Array.from(root.querySelectorAll<HTMLElement>('div, section')).filter((el) => {
      const t = (el.innerText || '').replace(/\s+/g, ' ')
      if (t.length > 600 || !/followers/i.test(t) || !/sold/i.test(t)) return false
      return Array.from(el.querySelectorAll('img')).some((i) => {
        const alt = (i.getAttribute('alt') || '').trim()
        return alt.length > 1 && !/^avatar$/i.test(alt)
      })
    })
    const card = cards[cards.length - 1]
    if (!card) return null

    // Стандартная вёрстка: ссылка на магазин (href без mall_id — параметры
    // подставляет JS при переходе), лучше с аватаркой внутри.
    const withImg = card.querySelector('a[href*="mall.html"] img')?.closest('a')
    if (withImg instanceof HTMLAnchorElement) return withImg
    const any = card.querySelector('a[href*="mall.html"]')
    if (any instanceof HTMLAnchorElement) return any
    // Брендовая витрина (Star seller): <a> нет, кликабелен сам див карточки
    // (или её предок) с role="button".
    const btn = card.closest('[role="button"]')
    return btn instanceof HTMLElement ? btn : null
  })
  const el = handle.asElement()
  if (el) return el as ElementHandle<HTMLElement>
  await handle.dispose().catch(() => undefined)
  return null
}

/** Store card: `a[href*="mall.html"]` внутри карточки, для брендовых витрин — сам div[role="button"]. */
async function findTemuStoreAvatar(page: Page): Promise<ElementHandle<HTMLElement> | null> {
  return queryStoreAvatar(page)
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
