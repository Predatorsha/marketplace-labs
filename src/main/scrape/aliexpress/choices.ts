import type { Page } from 'playwright'
import { jobLog } from '../../jobs/log'
import { extractAliPriceRaw } from './buyBox'
import { fullSizeAliImageUrl, sleep } from './util'

export type AliChoiceOption = {
  /** Option names of the combo joined " / " ("A-1pcs / A7"). */
  name: string | null
  /** Property groups joined " / " ("Color / Size"). */
  group: string | null
  /** Full-size variant image from the image-carrying property, null when text-only. */
  imageUrl: string | null
  priceRaw: string | null
}

export type AliChoicesResult = {
  options: AliChoiceOption[]
  /** Option count of the property whose tiles carry images (trailing slider photos). */
  skuImageCount: number
}

const PROPERTY_SEL = '[class*="sku--wrap--"] [class*="sku-item--property--"]'

/** Combos are capped to keep the click walk bounded; the cut is logged. */
const MAX_COMBOS = 40

type AliSkuProperty = {
  group: string | null
  options: Array<{ name: string | null; imageSrc: string | null; selected: boolean }>
}

/**
 * All SKU properties in the buy box: group from the "Color: d" title, one
 * option per `[data-sku-col]` tile (name from img alt / tile text).
 */
async function readAliSkuProperties(page: Page): Promise<AliSkuProperty[]> {
  return page.evaluate((propertySel) => {
    return Array.from(document.querySelectorAll(propertySel)).map((prop) => {
      const titleText =
        (prop.querySelector('[class*="sku-item--title--"]')?.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
      const group = titleText.split(':')[0].trim() || null

      const options = Array.from(prop.querySelectorAll<HTMLElement>('[data-sku-col]')).map(
        (el) => {
          const img = el.querySelector('img')
          const name =
            (img?.getAttribute('alt') || el.innerText || '').replace(/\s+/g, ' ').trim() ||
            null
          return {
            name,
            imageSrc: img?.getAttribute('src') || null,
            selected: /sku-item--selected--/.test(el.className)
          }
        }
      )

      return { group, options }
    })
  }, PROPERTY_SEL)
}

/**
 * One entry per combination of SKU options across all properties (cartesian
 * product, last property varies fastest). Every combo is clicked in to read
 * its own price; the last clicked combo stays selected on the page.
 */
export async function collectAliChoiceOptions(page: Page): Promise<AliChoicesResult> {
  const props = await readAliSkuProperties(page)
  if (!props.length || props.some((p) => !p.options.length)) {
    return { options: [], skuImageCount: 0 }
  }

  const imagePropIdx = props.findIndex((p) => p.options.some((o) => o.imageSrc))
  const skuImageCount = imagePropIdx >= 0 ? props[imagePropIdx].options.length : 0

  let combos: number[][] = [[]]
  for (const p of props) {
    combos = combos.flatMap((c) => p.options.map((_, i) => [...c, i]))
  }
  if (combos.length > MAX_COMBOS) {
    jobLog(
      `aliexpress choices: ${combos.length} combos, capped to first ${MAX_COMBOS}`
    )
    combos = combos.slice(0, MAX_COMBOS)
  }

  const group = props.map((p) => p.group).filter(Boolean).join(' / ') || null
  const selected = props.map((p) => p.options.findIndex((o) => o.selected))
  const out: AliChoiceOption[] = []

  for (const combo of combos) {
    let priceRaw: string | null = null
    try {
      for (let pi = 0; pi < props.length; pi++) {
        if (combo[pi] === selected[pi]) continue
        const tile = page
          .locator(PROPERTY_SEL)
          .nth(pi)
          .locator('[data-sku-col]')
          .nth(combo[pi])
        await tile.scrollIntoViewIfNeeded({ timeout: 3_000 })
        await tile.click({ timeout: 5_000 })
        selected[pi] = combo[pi]
        await sleep(700)
      }
      priceRaw = await extractAliPriceRaw(page)
    } catch (exc) {
      jobLog(
        `aliexpress combo [${combo.join(',')}] price fail: ${
          exc instanceof Error ? exc.message : exc
        }`
      )
    }

    const name =
      combo
        .map((oi, pi) => props[pi].options[oi].name)
        .filter(Boolean)
        .join(' / ') || null
    const imageSrc =
      imagePropIdx >= 0 ? props[imagePropIdx].options[combo[imagePropIdx]].imageSrc : null

    out.push({
      name,
      group,
      imageUrl: imageSrc ? fullSizeAliImageUrl(imageSrc) : null,
      priceRaw
    })
  }

  jobLog(`aliexpress choices: ${props.length} properties, ${out.length} combos`)
  return { options: out, skuImageCount }
}
