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
 * Strip imageView2 resize when present (preview often still carries w/70–800);
 * otherwise bump explicit w/h params.
 */
export function upgradeTemuImageUrl(url: string): string {
  let out = url.trim()
  if (!out) return out
  // img.kwcdn.com?...imageView2/2/w/70/... → drop transform, keep original asset
  if (/[?&]imageView2\//i.test(out) || /[?&]imageMogr2\//i.test(out)) {
    try {
      const u = new URL(out)
      u.search = ''
      return u.href
    } catch {
      return out.split('?')[0]
    }
  }
  out = out.replace(/\/w\/\d+/gi, '/w/1400').replace(/\/h\/\d+/gi, '/h/1400')
  out = out.replace(/([?&])width=\d+/gi, '$1width=1400').replace(/([?&])height=\d+/gi, '$1height=1400')
  return out
}
