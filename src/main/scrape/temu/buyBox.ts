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

    const bodyText = document.body?.innerText || ''
    const m = bodyText.match(/(?:Est\.?\s*[\d.,]+\s*[€$£][^\n]*)\n+([^\n]{30,400})/i)
    return m ? m[1].replace(/\s+/g, ' ').trim() : null
  })
}

/**
 * Raw price text from the buy box.
 * Prefer Est. …; else first currency amount (skip RRP). Left unchanged on purpose.
 */
export async function extractTemuPriceRaw(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || ''
    const estMatch = bodyText.match(/Est\.?\s*([€$£]?\s*[\d.,]+\s*[€$£]?)/i)
    if (estMatch) return `Est. ${estMatch[1].trim()}`

    const withoutRrp = bodyText.replace(/\bRRP\b[^\n]*/gi, ' ')
    const buy = withoutRrp.match(/([€$£]\s*[\d.,]+|[\d.,]+\s*[€$£])/)
    return buy ? buy[1].trim() : null
  })
}

export async function extractTemuReviews(
  page: Page
): Promise<{ reviewCount: string | null; rating: string | null }> {
  return page.evaluate(() => {
    const bodyText = document.body?.innerText || ''
    let reviewCount: string | null = null
    let rating: string | null = null

    const rev = bodyText.match(/([\d.,\s]+)\s*reviews?\b/i)
    if (rev) reviewCount = rev[1].replace(/[^\d]/g, '')

    const rate = bodyText.match(/\breviews?\b[^\d]{0,40}(\d([.,]\d)?)\b/i)
    if (rate) rating = rate[1].replace(',', '.')
    if (!rating) {
      const rate2 = bodyText.match(/\b(\d[.,]\d)\s*(?:\/\s*5)?\s*(?:stars?)?/i)
      if (rate2) rating = rate2[1].replace(',', '.')
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
