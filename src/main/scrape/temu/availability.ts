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

/**
 * Снапшот (goods_snapshot.html) показывает «This item was discontinued» вместо
 * данных товара. Это окончательное удаление листинга — не ретраим, сразу
 * фолбэк-карточка из данных заказа (ретраи мёртвых листингов сняты в 0c8c636).
 */
export async function isTemuSnapshotDiscontinued(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').slice(0, 12_000)
    return /this item (was|has been|is) discontinued/i.test(text)
  })
}

/**
 * Снятый с продажи товар: вместо буй-бокса страница показывает миниатюру,
 * «This item is sold out. View more details» и грид Similar items.
 * Данные карточки при этом живы на goods_snapshot.html.
 * Точную фразу не путаем с "almost sold out" в сайдбаре корзины.
 */
export async function isTemuProductSoldOut(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body?.innerText || '').slice(0, 20_000)
    if (!/this item is sold out/i.test(text)) return false
    return !document.querySelector('#rightContent')
  })
}
