export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Full-size AliExpress media URL from a thumbnail:
 * `…/kf/Sxxx.jpg_220x220q75.jpg_.avif` → `…/kf/Sxxx.jpg`.
 * Non-thumbnail URLs pass through unchanged.
 */
export function fullSizeAliImageUrl(src: string): string {
  let url = String(src || '').trim()
  if (!url) return url
  if (url.startsWith('//')) url = `https:${url}`
  const m = url.match(/^(.*?\.(?:jpe?g|png|webp|gif))_.+$/i)
  return m ? m[1] : url
}
