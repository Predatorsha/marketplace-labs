/** Stable key for same CDN asset (ignores query / resize transforms after upgrade). */
export function imageDedupeKey(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`.toLowerCase()
  } catch {
    return url.split('?')[0].toLowerCase()
  }
}

/**
 * Prefer a larger CDN variant.
 * Strip imageView2 resize when present (preview often still carries w/70–800).
 */
export function upgradeTemuImageUrl(url: string): string {
  const out = url.trim()
  if (!out) return out
  // img.kwcdn.com?...imageView2/2/w/70/... → drop transform, keep original asset
  if (/[?&]imageView2\//i.test(out)) {
    try {
      const u = new URL(out)
      u.search = ''
      return u.href
    } catch {
      return out.split('?')[0]
    }
  }
  return out
}
