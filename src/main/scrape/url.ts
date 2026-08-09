export type MarketplacePlatform = 'aliexpress' | 'temu'

export type ParsedProductUrl = {
  platform: MarketplacePlatform
  productId: string
  url: string
}

/** Temu goods id from pathname only: `...-g-607694501077974.html`. */
function extractTemuGoodsId(url: URL): string | null {
  const m = url.pathname.match(/-g-(\d{6,})(?:\.html)?$/i)
  return m?.[1] ?? null
}

function extractAliExpressItemId(url: URL): string | null {
  const m =
    url.pathname.match(/\/item\/(\d+)\.html/i) ||
    url.pathname.match(/\/i\/(\d+)\.html/i) ||
    url.href.match(/[?&]item[_-]?id=(\d+)/i)
  if (m?.[1]) return m[1]
  const digits = url.pathname.match(/(\d{10,})/)
  return digits?.[1] ?? null
}

/**
 * Detect platform + product id from a marketplace product URL.
 * Temu: id is taken once from `-g-{digits}` in the original pathname (never refined later).
 */
export function parseProductUrl(raw: string): ParsedProductUrl {
  const trimmed = String(raw || '').trim()
  if (!trimmed) throw new Error('url is required')

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error(`invalid product url: ${trimmed}`)
  }

  const host = url.hostname.toLowerCase()

  if (host.includes('temu')) {
    const productId = extractTemuGoodsId(url)
    if (!productId) {
      throw new Error(`could not parse Temu goods_id from url: ${trimmed}`)
    }
    return { platform: 'temu', productId, url: trimmed }
  }

  if (host.includes('aliexpress') || host.includes('aliyun')) {
    const productId = extractAliExpressItemId(url)
    if (!productId) {
      throw new Error(`could not parse AliExpress item id from url: ${trimmed}`)
    }
    return { platform: 'aliexpress', productId, url: trimmed }
  }

  throw new Error(`unsupported marketplace url (expected Temu or AliExpress): ${trimmed}`)
}
