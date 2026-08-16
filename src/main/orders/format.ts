/** Форматирование цен заказов, общее для списка и деталки. */

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£'
}

export type OrderPriceLine = {
  quantity: number | null
  unit_price: number | null
  currency: string | null
}

function formatAmount(amount: number, currency: string): string {
  const text = amount.toFixed(2)
  if (!currency) return text
  const symbol = CURRENCY_SYMBOLS[currency]
  return symbol ? `${symbol}${text}` : `${text} ${currency}`
}

/** Цена одной позиции (unit_price × количество), null если цены нет. */
export function formatLinePrice(line: OrderPriceLine): string | null {
  if (line.unit_price == null || !Number.isFinite(Number(line.unit_price))) return null
  const qty = line.quantity != null && Number(line.quantity) > 0 ? Number(line.quantity) : 1
  const currency = (line.currency || '').trim().toUpperCase()
  return formatAmount(Number(line.unit_price) * qty, currency)
}

/**
 * Сумма позиций для карточки. Валюты в заказе смешаны или ни у одной позиции
 * нет цены — суммы нет (честнее, чем сложить разные валюты числом).
 */
export function formatOrderTotal(lines: OrderPriceLine[]): string | null {
  const sums = new Map<string, number>()
  for (const ln of lines) {
    if (ln.unit_price == null || !Number.isFinite(Number(ln.unit_price))) continue
    // Подарки (unit_price=0, валюты нет) сумме ничего не дают —
    // не даём их пустой валюте сломать определение единой валюты заказа.
    if (Number(ln.unit_price) === 0) continue
    const qty = ln.quantity != null && Number(ln.quantity) > 0 ? Number(ln.quantity) : 1
    const currency = (ln.currency || '').trim().toUpperCase()
    sums.set(currency, (sums.get(currency) || 0) + Number(ln.unit_price) * qty)
  }
  if (sums.size !== 1) return null
  const [currency, amount] = [...sums.entries()][0]
  return formatAmount(amount, currency)
}
