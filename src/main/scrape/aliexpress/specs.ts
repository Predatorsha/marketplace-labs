import type { Page } from 'playwright'
import { sleep } from './util'

/**
 * Key/value pairs from the Specifications section (`#nav-specification`).
 * Clicks "View more" first when present (may expand inline or open a modal —
 * pairs are collected document-wide either way, then Escape closes the modal).
 */
export async function extractAliSpecs(page: Page): Promise<Record<string, string>> {
  const section = page.locator('#nav-specification')
  if (!(await section.count())) return {}

  await section.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined)

  const viewMore = page.locator('#nav-specification button', { hasText: /view more/i })
  if (await viewMore.count()) {
    await viewMore
      .first()
      .click({ timeout: 3_000 })
      .catch(() => undefined)
    await sleep(600)
  }

  const specs = await page.evaluate(() => {
    const out: Record<string, string> = {}
    for (const prop of Array.from(document.querySelectorAll('[class*="specification--prop--"]'))) {
      const k = (prop.querySelector('[class*="specification--title--"]')?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
      const v = (prop.querySelector('[class*="specification--desc--"]')?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
      if (k && v && k.length <= 80 && v.length <= 300 && !out[k]) out[k] = v
    }
    return out
  })

  await page.keyboard.press('Escape').catch(() => undefined)
  return specs
}
