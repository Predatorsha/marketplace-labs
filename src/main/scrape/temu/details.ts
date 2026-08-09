import type { Page } from 'playwright'

/** Key/value rows under "Product details" (visible DOM only; no Expand click). */
export async function extractTemuSpecs(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const specs: Record<string, string> = {}
    const stopRe =
      /^(free shipping|sold by|add to cart|lightning deal|color:|qty|explore your interests|why choose temu|delivery:|courier company)/i
    const skipKeys = /^(save|report this item|copy|see all details|product details)$/i

    function addSpec(key: string, value: string): void {
      const k = key.replace(/\s+/g, ' ').replace(/:$/, '').trim()
      const v = value.replace(/\s+/g, ' ').trim()
      if (!k || !v || skipKeys.test(k) || k.length > 80 || v.length > 300) return
      if (!specs[k]) specs[k] = v
    }

    function parseLines(lines: string[]): void {
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
      const scope = root || detailsHeading.parentElement
      if (scope) {
        const scopeText = (scope as HTMLElement).innerText || ''
        const start = scopeText.search(/product details/i)
        const chunk = (start >= 0 ? scopeText.slice(start) : scopeText)
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
        parseLines(chunk)
      }
    }

    return specs
  })
}
