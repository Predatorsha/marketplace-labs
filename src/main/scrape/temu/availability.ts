import type { Page } from 'playwright'

/** Temu PDP when the listing is gone: "Unavailable for purchase". */
export async function isTemuProductUnavailable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').slice(0, 12_000)
    return (
      /unavailable for purchase/i.test(text) ||
      /item details are unavailable/i.test(text)
    )
  })
}
