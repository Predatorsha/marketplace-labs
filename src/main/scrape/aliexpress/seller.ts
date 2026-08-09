import type { Page } from 'playwright'

export type AliSellerInfo = {
  sellerName: string | null
  storeUrl: string | null
  sellerId: string | null
}

/**
 * Store card (`#nav-store`, lazy bottom section — scroll first): name from
 * `a[data-pl="store-name"]`, seller_id = store id from its `/store/{digits}`
 * href, store_url rebuilt clean from that id (tracking params dropped).
 */
export async function extractAliSeller(page: Page): Promise<AliSellerInfo> {
  return page.evaluate(() => {
    const a = document.querySelector<HTMLAnchorElement>(
      '#nav-store a[data-pl="store-name"]'
    )
    if (!a) return { sellerName: null, storeUrl: null, sellerId: null }

    const sellerName = (a.textContent || '').replace(/\s+/g, ' ').trim() || null

    let storeUrl: string | null = null
    let sellerId: string | null = null
    const m = (a.getAttribute('href') || '').match(/\/store\/(\d+)/)
    if (m) {
      sellerId = m[1]
      storeUrl = `https://www.aliexpress.com/store/${m[1]}`
    }

    return { sellerName, storeUrl, sellerId }
  })
}
