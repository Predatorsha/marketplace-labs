/** Хелперы списочных страниц (Catalog, Orders): пагинация и подписи платформ. */

export function platformLabel(platform: string): string {
  const p = platform.trim().toLowerCase()
  if (p === 'aliexpress') return 'AliExpress'
  if (p === 'temu') return 'Temu'
  return platform || '—'
}

export type StatusTone = 'green' | 'blue' | 'orange' | 'grey'

/**
 * Цвет бейджа по тексту статуса маркетплейса ("Delivered on Jun 14, 2026",
 * "In transit", …). Неизвестный статус — оранжевый, как «в работе».
 */
export function statusTone(status: string | null | undefined): StatusTone {
  const s = (status || '').toLowerCase()
  if (/(cancel|refund|return)/.test(s)) return 'grey'
  if (/(delivered|shipped)/.test(s)) return 'green'
  if (/(transit|on the way|out for delivery)/.test(s)) return 'blue'
  return 'orange'
}

export function pageItems(current: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages = new Set<number>([1, totalPages, current])
  for (let d = 1; d <= 1; d++) {
    if (current - d >= 1) pages.add(current - d)
    if (current + d <= totalPages) pages.add(current + d)
  }
  if (current <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }
  if (current >= totalPages - 2) {
    pages.add(totalPages - 1)
    pages.add(totalPages - 2)
    pages.add(totalPages - 3)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const out: Array<number | 'ellipsis'> = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('ellipsis')
    out.push(p)
    prev = p
  }
  return out
}
