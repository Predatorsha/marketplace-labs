/**
 * Normalize marketplace price display text to `€ 1.18` style
 * (currency symbol first, dot decimal separator).
 */
export function normalizeDisplayPrice(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let text = String(raw).trim()
  if (!text) return null

  // Prefer the Est. clause when present (ignore "after applying…").
  const est = text.match(/Est\.?\s*([^\n;]+)/i)
  if (est) text = est[1].trim()

  let currency: string | null = null
  if (/€|eur\b/i.test(text)) currency = '€'
  else if (/£|gbp\b/i.test(text)) currency = '£'
  else if (/\$|usd\b/i.test(text)) currency = '$'

  const cleaned = text
    .replace(/Est\.?/gi, '')
    .replace(/after applying.*$/i, '')
    .replace(/[€$£]|eur|usd|gbp/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // European "1.234,56" or "1,18" vs "1.18"
  let amount: string | null = null
  const eu = cleaned.match(/(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+,\d{1,2})\b/)
  const us = cleaned.match(/(\d{1,3}(?:,\d{3})+\.\d{1,2}|\d+\.\d{1,2})\b/)
  const plain = cleaned.match(/(\d+)\b/)

  if (eu && (!us || (eu.index ?? 0) <= (us.index ?? 0))) {
    amount = eu[1].replace(/\./g, '').replace(',', '.')
  } else if (us) {
    amount = us[1].replace(/,/g, '')
  } else if (plain) {
    amount = plain[1]
  }

  if (!amount) return null

  // Trim trailing zeros after normalize only for ".10" style — keep two decimals when present.
  if (!amount.includes('.')) {
    /* integer ok */
  } else {
    const [whole, frac = ''] = amount.split('.')
    amount = `${whole}.${frac.padEnd(2, '0').slice(0, 2)}`
  }

  const symbol = currency || '€'
  return `${symbol} ${amount}`
}
