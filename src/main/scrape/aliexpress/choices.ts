import type { Page } from 'playwright'
import { jobLog } from '../../jobs/log'
import { extractAliPriceRaw } from './buyBox'
import { fullSizeAliImageUrl, sleep } from './util'

export type AliChoiceOption = {
  name: string | null
  group: string | null
  /** Full-size variant image from the SKU tile, null for text-only options. */
  imageUrl: string | null
  priceRaw: string | null
}

const PROPERTY_SEL = '[class*="sku--wrap--"] [class*="sku-item--property--"]'

/**
 * First SKU property in the buy box: group from the "Color: d" title, one
 * option per `[data-sku-col]` tile (name from img alt / tile text). Only the
 * first property is walked — pages with several properties keep the rest at
 * their default selection.
 */
async function readAliSkuOptions(page: Page): Promise<{
  group: string | null
  propertyCount: number
  options: Array<{ name: string | null; imageSrc: string | null; selected: boolean }>
}> {
  return page.evaluate((propertySel) => {
    const props = Array.from(document.querySelectorAll(propertySel))
    const prop = props[0]
    if (!prop) return { group: null, propertyCount: 0, options: [] }

    const titleText =
      (prop.querySelector('[class*="sku-item--title--"]')?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
    const group = titleText.split(':')[0].trim() || null

    const options = Array.from(prop.querySelectorAll<HTMLElement>('[data-sku-col]')).map(
      (el) => {
        const img = el.querySelector('img')
        const name =
          (img?.getAttribute('alt') || el.innerText || '').replace(/\s+/g, ' ').trim() || null
        return {
          name,
          imageSrc: img?.getAttribute('src') || null,
          selected: /sku-item--selected--/.test(el.className)
        }
      }
    )

    return { group, propertyCount: props.length, options }
  }, PROPERTY_SEL)
}

/**
 * One entry per SKU tile of the first property, in DOM order. Clicks every
 * non-selected tile to read its own price from the buy box; the last clicked
 * variant stays selected on the page.
 */
export async function collectAliChoiceOptions(page: Page): Promise<AliChoiceOption[]> {
  const { group, propertyCount, options } = await readAliSkuOptions(page)
  if (!options.length) return []
  if (propertyCount > 1) {
    jobLog(`aliexpress choices: ${propertyCount} sku properties, walking only the first`)
  }

  const tiles = page.locator(PROPERTY_SEL).first().locator('[data-sku-col]')
  const out: AliChoiceOption[] = []
  let selected = options.findIndex((o) => o.selected)

  for (let i = 0; i < options.length; i++) {
    let priceRaw: string | null = null
    try {
      if (i !== selected) {
        const tile = tiles.nth(i)
        await tile.scrollIntoViewIfNeeded({ timeout: 3_000 })
        await tile.click({ timeout: 5_000 })
        selected = i
        await sleep(700)
      }
      priceRaw = await extractAliPriceRaw(page)
    } catch (exc) {
      jobLog(
        `aliexpress choice #${i + 1} price fail: ${exc instanceof Error ? exc.message : exc}`
      )
    }
    out.push({
      name: options[i].name,
      group,
      imageUrl: options[i].imageSrc ? fullSizeAliImageUrl(options[i].imageSrc!) : null,
      priceRaw
    })
  }
  return out
}
