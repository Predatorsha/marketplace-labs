import type { Page } from 'playwright'

/** AliExpress PDP when the listing is gone ("Sorry, this item is no longer available"). */
export async function isAliProductUnavailable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').slice(0, 12_000)
    return (
      /no longer available/i.test(text) ||
      /item (?:is )?unavailable/i.test(text) ||
      /this product can(?:not|'t) be purchased/i.test(text)
    )
  })
}
