import type { Page } from 'playwright'
import { sleep } from './util'

/**
 * Прямой URL деталки заказа. Если Temu сменит схему — fetchOrder свалится в
 * фолбэк «кликнуть карточку в списке» (см. temu/orders.ts).
 */
export function temuOrderDetailUrl(orderId: string): string {
  return `https://www.temu.com/bgt_order_detail.html?parent_order_sn=${encodeURIComponent(orderId)}`
}

/**
 * Денежный текст Temu (EU-формат "1.234,56 €" / "3,19 €") → "1234.56 €",
 * чтобы parseMoney в code/orders.ts корректно взял число.
 */
export function normalizeTemuMoney(raw: string | null | undefined): string | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const m = text.match(/(-?)([\d.,\s ]*\d)\s*([€$£])?/)
  if (!m) return null
  let num = m[2].replace(/[\s ]/g, '')
  if (num.includes(',')) {
    // запятая — десятичный разделитель, точки — тысячи
    num = num.replace(/\./g, '').replace(',', '.')
  }
  const cur = m[3] || text.match(/[€$£]/)?.[0] || ''
  return `${m[1]}${num}${cur ? ` ${cur}` : ''}`
}

/** Позиция заказа из деталки (product_url заполняется отдельным проходом кликов). */
export type TemuOrderItemDetail = {
  line_number: number
  title: string | null
  /** Цена позиции, нормализованная ("3.19 €"); промо-цена, если показана. */
  price: string | null
  /** true — бесплатный подарок к заказу: вместо цены строка "Free". */
  is_gift: boolean
  /** Текст варианта/SKU, например "100pcs" или "Blue, Pink, Clear". */
  variant: string | null
  quantity: number | null
  /** src миниатюры позиции — вариант-специфична, по ней мапим товары посылок. */
  image: string | null
  product_url: string | null
}

export type TemuOrderDetail = {
  order_id: string
  /** "Delivered on Jun 21, 2026" из блока Delivery time, если есть. */
  status: string | null
  /** Сырая дата "Jun 7, 2026" из "Order time:". */
  order_time: string | null
  /** "81.61 €" — Order total (VAT included), нормализовано. */
  total: string | null
  /** "-62.11 €" — строка You saved, нормализовано. */
  discount: string | null
  items: TemuOrderItemDetail[]
}

/** Деталка открыта: на странице есть Payment details и нужный Order ID. */
export async function waitForTemuOrderDetail(
  page: Page,
  orderId: string,
  timeoutMs = 30_000
): Promise<boolean> {
  return page
    .waitForFunction(
      (oid) => {
        const text = document.body?.innerText || ''
        return text.includes(oid) && /Payment details/i.test(text)
      },
      orderId,
      { timeout: timeoutMs }
    )
    .then(() => true)
    .catch(() => false)
}

/**
 * Парсит деталку заказа. Якоря структурные:
 * - позиции: div[role="button"][aria-label^="item picture <title>"]
 * - платежи: #PAYMENT_DETAIL_DOM_ID
 * - шапка: текстовые метки "Order ID:" / "Order time:" / "Delivery time"
 */
export async function extractTemuOrderDetail(page: Page): Promise<TemuOrderDetail | null> {
  const dom = await page.evaluate(() => {
    const bodyText = document.body?.innerText || ''
    const idM = bodyText.match(/Order ID:\s*\n?\s*(PO-[0-9-]{8,})/)
    if (!idM) return null

    const timeM = bodyText.match(/Order time:\s*\n?\s*([A-Za-z]{3,9}\.? \d{1,2}, \d{4})/i)

    // Статус — из блока "Delivery time" → "Delivered on Jun 21, 2026".
    let status: string | null = null
    const deliveryLabels = Array.from(document.querySelectorAll('span, div')).filter(
      (el) => (el.textContent || '').trim() === 'Delivery time'
    )
    for (const el of deliveryLabels) {
      const box = el.closest('div')?.parentElement
      const t = box ? (box as HTMLElement).innerText : ''
      const m = t.match(/((?:Delivered|Arriving|Expected)[^\n]*)/i)
      if (m) {
        status = m[1].trim()
        break
      }
    }
    if (!status) {
      const m = bodyText.match(/(Delivered on [A-Za-z]{3,9}\.? \d{1,2}, \d{4})/)
      status = m ? m[1] : null
    }

    const pay = document.querySelector('#PAYMENT_DETAIL_DOM_ID') as HTMLElement | null
    const payText = pay ? pay.innerText : bodyText
    const totalM = payText.match(/Order total\s*\(VAT included\):\s*\n?\s*([\d.,\s]+[€$£])/)
    const savedM = payText.match(/You saved:\s*\n?\s*(-?[\d.,\s]+[€$£])/)

    const moneyRe = /^[\d.,\s]+[€$£]$/
    const anchors = Array.from(
      document.querySelectorAll('div[role="button"][aria-label^="item picture"]')
    )
    const items = anchors.map((a, i) => {
      const title =
        (a.getAttribute('aria-label') || '').replace(/^item picture\s*/i, '').trim() || null
      const block = a.parentElement as HTMLElement | null
      const lines = (block?.innerText || '')
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)

      const qtyIdx = lines.findIndex((l) => /^×\d+$/.test(l))
      const quantity = qtyIdx >= 0 ? Number(lines[qtyIdx].slice(1)) : null

      const priceLine = lines.find((l) => moneyRe.test(l)) || null
      const promoM = (block?.innerText || '').match(/After promos applied:\s*([\d.,\s]+[€$£])/)
      // Бесплатный подарок: вместо цены отдельная строка "Free"
      // ("Free returns" и прочие бейджи не матчатся — только слово целиком).
      const isGift = !priceLine && lines.some((l) => /^free$/i.test(l))

      // Вариант — строка перед ×N, не являющаяся тайтлом/ценой/промо/бейджем.
      let variant: string | null = null
      if (qtyIdx > 0) {
        for (let j = qtyIdx - 1; j >= 0; j--) {
          const l = lines[j]
          if (
            l === title ||
            moneyRe.test(l) ||
            /After promos applied/i.test(l) ||
            /^One-click pay$/i.test(l) ||
            /^Pre-order$/i.test(l) ||
            /^free$/i.test(l)
          ) {
            continue
          }
          variant = l
          break
        }
      }

      const img = a.querySelector('img')
      return {
        line_number: i + 1,
        title,
        price_raw: promoM ? promoM[1] : priceLine,
        is_gift: isGift,
        variant,
        quantity,
        image: img?.getAttribute('src') || null
      }
    })

    return {
      order_id: idM[1],
      status,
      order_time: timeM ? timeM[1].trim() : null,
      total_raw: totalM ? totalM[1].trim() : null,
      discount_raw: savedM ? savedM[1].trim() : null,
      items
    }
  })

  if (!dom) return null
  return {
    order_id: dom.order_id,
    status: dom.status,
    order_time: dom.order_time,
    total: normalizeTemuMoney(dom.total_raw),
    discount: normalizeTemuMoney(dom.discount_raw),
    items: dom.items.map((it) => ({
      line_number: it.line_number,
      title: it.title,
      price: normalizeTemuMoney(it.price_raw),
      is_gift: it.is_gift,
      variant: it.variant,
      quantity: it.quantity,
      image: it.image,
      product_url: null
    }))
  }
}

const ITEM_ANCHOR = 'div[role="button"][aria-label^="item picture"]'

/**
 * Кликает по каждой позиции заказа и снимает URL карточки товара.
 * Клик открывает страницу товара (в этой же вкладке или попапом) с модалкой
 * быстрой корзины поверх — URL берём и сразу уходим назад/закрываем попап,
 * само скачивание потом идёт прямым goto (модалка при этом не появляется).
 * Товар удалён с Temu → клик никуда не ведёт → null.
 * `skip` — индексы позиций, URL которых уже известен из БД: их не кликаем,
 * в результате у них null (caller подставляет URL сам).
 */
export async function collectTemuOrderItemUrls(
  page: Page,
  itemCount: number,
  skip?: ReadonlySet<number>
): Promise<Array<string | null>> {
  const urls: Array<string | null> = []

  for (let i = 0; i < itemCount; i++) {
    if (skip?.has(i)) {
      urls.push(null)
      continue
    }
    const anchors = page.locator(ITEM_ANCHOR)
    if ((await anchors.count()) <= i) {
      urls.push(null)
      continue
    }
    const anchor = anchors.nth(i)
    await anchor.scrollIntoViewIfNeeded().catch(() => undefined)
    await sleep(200)

    const beforeUrl = page.url()
    const popupPromise = page
      .context()
      .waitForEvent('page', { timeout: 8_000 })
      .catch(() => null)
    const navPromise = page
      .waitForFunction((prev) => location.href !== prev, beforeUrl, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false)

    await anchor.click({ timeout: 10_000 }).catch(() => undefined)

    const winner = await Promise.race([
      popupPromise.then((p) => (p ? ({ kind: 'popup' as const, popup: p }) : null)),
      navPromise.then((ok) => (ok ? { kind: 'nav' as const, popup: null } : null))
    ])

    if (winner?.kind === 'popup' && winner.popup) {
      const popup = winner.popup
      await popup.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined)
      const url = popup.url()
      await popup.close().catch(() => undefined)
      urls.push(url && url !== 'about:blank' ? url : null)
      await sleep(300)
      continue
    }

    // Раса могла отдать null раньше, чем случилась навигация — перепроверяем URL.
    if (winner?.kind === 'nav' || page.url() !== beforeUrl) {
      await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined)
      urls.push(page.url())
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
      await page
        .waitForFunction(() => /Payment details/i.test(document.body?.innerText || ''), {
          timeout: 20_000
        })
        .catch(() => undefined)
      await sleep(500)
      continue
    }

    // Ни попапа, ни навигации — товар удалён с Temu.
    urls.push(null)
    await sleep(200)
  }

  return urls
}
