import type { Page } from 'playwright'

/** Product heading: `h1[data-pl="product-title"]` in the buy box. */
export async function extractAliTitle(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const h = document.querySelector('h1[data-pl="product-title"]')
    const t = (h?.textContent || '').replace(/\s+/g, ' ').trim()
    return t || null
  })
}

/**
 * Current price text for the selected variant (`€9.05` style).
 * Class suffixes are hashed, so match by the stable `price-default--current--` prefix.
 */
export async function extractAliPriceRaw(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[class*="price-default--current--"]')
    const t = (el?.textContent || '').replace(/\s+/g, ' ').trim()
    if (t) return t

    const right = document.querySelector<HTMLElement>('.pdp-info-right')
    const m = (right?.innerText || '').match(/(?:€|£|US\s*\$|\$)\s*[\d.,]+/)
    return m ? m[0].trim() : null
  })
}

/**
 * Rating / review count / sold from the `[data-pl="product-reviewer"]` strip
 * ("5.0  7 Reviews ౹ 91 sold"). Missing strip → no product reviews.
 */
export async function extractAliReviews(
  page: Page
): Promise<{ rating: string | null; reviewCount: string | null; sold: string | null }> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-pl="product-reviewer"]')
    if (!root) return { rating: null, reviewCount: '0', sold: null }

    let rating: string | null = null
    const strong = (root.querySelector('strong')?.textContent || '').trim()
    const rate = strong.match(/(\d(?:[.,]\d)?)/)
    if (rate) {
      const n = Number(rate[1].replace(',', '.'))
      if (Number.isFinite(n) && n >= 0 && n <= 5) rating = String(n)
    }

    // No spaces inside the number class: "5.0  7 Reviews" must yield 7, not 507.
    const text = root.innerText || ''
    let reviewCount = '0'
    const rev = text.match(/(\d[\d.,]*)\s*reviews?\b/i)
    if (rev) {
      const digits = rev[1].replace(/[^\d]/g, '')
      if (digits) reviewCount = digits
    }

    let sold: string | null = null
    const s = text.match(/(\d[\d.,]*\+?)\s*sold\b/i)
    if (s) {
      const digits = s[1].replace(/[^\d+]/g, '')
      if (digits) sold = digits
    }

    return { rating, reviewCount, sold }
  })
}
