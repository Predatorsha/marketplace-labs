import type { Page } from 'playwright'
import { sleep } from './util'

/** Key/value rows under "Product details" (kv-строки и пары «метка/значение»). */
export async function extractTemuSpecs(page: Page): Promise<Record<string, string>> {
  // Часть строк спрятана за «See more» внутри секции — раскрываем только её
  // кнопки, чтобы не трогать «See more» в отзывах и прочих блоках.
  const expanded = await page.evaluate(() => {
    let scope: Element | null = document.querySelector('#goodsDetail')
    if (!scope) {
      const heading = Array.from(document.querySelectorAll('h1, h2, h3')).find((h) =>
        /^product details$/i.test((h.textContent || '').trim())
      )
      scope = heading?.parentElement ?? null
      for (let i = 0; i < 4 && scope; i++) {
        if (/item id|main material|composition/i.test(scope.textContent || '')) break
        scope = scope.parentElement
      }
    }
    if (!scope) return false
    let clicked = false
    for (const btn of Array.from(scope.querySelectorAll<HTMLElement>('[role="button"]'))) {
      if (/^see more$/i.test((btn.innerText || '').trim())) {
        btn.click()
        clicked = true
      }
    }
    return clicked
  })
  if (expanded) await sleep(500)

  return page.evaluate(() => {
    const specs: Record<string, string> = {}
    const stopRe =
      /^(free shipping|sold by|add to cart|lightning deal|color:|qty|explore your interests|why choose temu|delivery:|courier company)/i
    const skipKeys = /^(save|report this item|copy|see more|see all details|product details)$/i

    function addSpec(key: string, value: string): void {
      const k = key.replace(/\s+/g, ' ').replace(/:$/, '').trim()
      const v = value.replace(/\s+/g, ' ').trim()
      if (!k || !v || skipKeys.test(k) || k.length > 80 || v.length > 300) return
      if (!specs[k]) specs[k] = v
    }

    function parseLines(lines: string[]): void {
      // Однострочный формат «Ключ: значение» («Item ID: EP62156», «Origin:
      // Zhejiang, China») — основная вёрстка Product details на живых PDP.
      for (const line of lines) {
        if (stopRe.test(line)) break
        const m = /^([A-Za-z][A-Za-z0-9 /&+-]{0,50}?):\s*(.+)$/.exec(line)
        if (!m) continue
        addSpec(m[1], m[2].replace(/\s*Copy$/i, ''))
      }
      parseLabelValuePairs(lines)
    }

    function parseLabelValuePairs(lines: string[]): void {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (i > 0 && stopRe.test(line)) break
        if (/^product details$/i.test(line) || skipKeys.test(line)) continue

        const next = lines[i + 1]
        if (
          !next ||
          stopRe.test(next) ||
          skipKeys.test(next) ||
          line.length > 60 ||
          next.length > 300 ||
          /^\d+([.,]\d+)?\s*%/.test(line)
        ) {
          continue
        }

        const looksLikeLabel =
          /^[A-Z][A-Za-z0-9 /&+-]{1,40}$/.test(line) &&
          !/^(free|sold|add|color|qty|women|men)/i.test(line)

        if (looksLikeLabel) {
          addSpec(line, next)
          i++
        }
      }
    }

    // Секция спеков: стабильный #goodsDetail, фолбэк — подъём от заголовка.
    let scope: Element | null = document.querySelector('#goodsDetail')
    if (!scope) {
      const detailsHeading = Array.from(document.querySelectorAll('h1, h2, h3')).find((h) =>
        /^product details$/i.test((h.textContent || '').trim())
      )
      if (detailsHeading) {
        let root: Element | null = detailsHeading.parentElement
        for (let i = 0; i < 4 && root; i++) {
          const text = (root.textContent || '').slice(0, 80)
          if (/operation instruction|main material|item id|composition/i.test(text)) break
          root = root.parentElement
        }
        scope = root || detailsHeading.parentElement
      }
    }
    if (scope) {
      const scopeText = (scope as HTMLElement).innerText || ''
      const start = scopeText.search(/product details/i)
      const chunk = (start >= 0 ? scopeText.slice(start) : scopeText)
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean)
      parseLines(chunk)
    }

    return specs
  })
}

/**
 * Блок «Description» (вёрстка снапшота goods_snapshot.html и части карточек):
 * каждая строка — единый текст «Ключ: значение» («Material: Plastic»),
 * хвост спрятан за кнопкой «See more» — сначала раскрываем её.
 */
export async function extractTemuDescriptionSpecs(page: Page): Promise<Record<string, string>> {
  const expanded = await page.evaluate(() => {
    let clicked = false
    for (const btn of document.querySelectorAll<HTMLElement>('[role="button"]')) {
      if (/^see more$/i.test((btn.innerText || '').trim())) {
        btn.click()
        clicked = true
      }
    }
    return clicked
  })
  if (expanded) await sleep(500)

  return page.evaluate(() => {
    const specs: Record<string, string> = {}
    const skipKeys = /^(save|report this item|copy|see more|see all details|description)$/i

    const heading = Array.from(document.querySelectorAll('div, h2, h3')).find(
      (h) => (h.textContent || '').trim() === 'Description' && h.childElementCount === 0
    )
    if (!heading?.parentElement) return specs

    const lines = ((heading.parentElement as HTMLElement).innerText || '')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const line of lines) {
      // «Item ID: YE10645602» (кнопка Copy приезжает отдельной строкой).
      const m = /^(.{1,60}?):\s*(.+)$/.exec(line)
      if (!m) continue
      const key = m[1].replace(/\s+/g, ' ').trim()
      const value = m[2].replace(/\s+/g, ' ').replace(/\s*Copy$/i, '').trim()
      if (!key || !value || skipKeys.test(key) || value.length > 300) continue
      if (!specs[key]) specs[key] = value
    }
    return specs
  })
}
