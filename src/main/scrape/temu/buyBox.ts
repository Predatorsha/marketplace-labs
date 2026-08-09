import type { Page } from 'playwright'

/** Product heading near the buy box (not breadcrumbs). */
export async function extractTemuTitle(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1, h2'))
    for (const h of headings) {
      const t = (h.textContent || '').replace(/\s+/g, ' ').trim()
      if (t.length >= 20 && t.length < 500 && !/^home\b/i.test(t)) {
        return t
      }
    }
    return null
  })
}

/** Raw price text from the buy box (`Est. …`). */
export async function extractTemuPriceRaw(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || ''
    const estMatch = bodyText.match(/Est\.?\s*([€$£]?\s*[\d.,]+\s*[€$£]?)/i)
    return estMatch ? `Est. ${estMatch[1].trim()}` : null
  })
}

/**
 * Product rating/reviews live in `#reviewContent` only.
 * Missing block → no product reviews (store rating must not be used).
 */
export async function extractTemuReviews(
  page: Page
): Promise<{ reviewCount: string | null; rating: string | null }> {
  return page.evaluate(() => {
    const root = document.querySelector('#reviewContent')
    if (!root) return { reviewCount: '0', rating: null }

    const text = (root as HTMLElement).innerText || ''
    let reviewCount = '0'
    const rev = text.match(/([\d.,\s]+)\s*reviews?\b/i)
    if (rev) {
      const digits = rev[1].replace(/[^\d]/g, '')
      if (digits) reviewCount = digits
    }

    let rating: string | null = null
    const rate = text.match(/\b(\d(?:[.,]\d)?)\s*(?:\/\s*5)?\b/)
    if (rate) {
      const n = Number(rate[1].replace(',', '.'))
      if (Number.isFinite(n) && n >= 0 && n <= 5) rating = String(n)
    }

    return { reviewCount, rating }
  })
}

/** Choice option in the buy box (Color/Size), not Product details specs. */
export async function extractTemuOption(
  page: Page
): Promise<{ optionGroup: string | null; optionName: string | null }> {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || ''
    const opt = bodyText.match(/\b(Color|Colour|Size)\s*:\s*([^\n|/]+)/i)
    if (!opt) return { optionGroup: null, optionName: null }

    const optionGroup = opt[1].trim()
    let optionName = opt[2].replace(/\s+/g, ' ').trim().split(/\s{2,}/)[0]
    optionName = optionName.replace(/\b(Size guide|Qty|Quantity)\b.*$/i, '').trim()
    return { optionGroup, optionName: optionName || null }
  })
}
