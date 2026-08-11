import type { Page } from 'playwright'
import { jobLog } from '../../jobs/log'
import { extractTemuPriceRaw } from './buyBox'
import { sleep } from './util'

export type TemuChoiceOption = {
  name: string | null
  group: string | null
  priceRaw: string | null
  soldOut: boolean
}

/**
 * Buy-box variant radios in DOM order: name from aria-label, group from the
 * nearest preceding label ("Style" / "Color") found while walking up from the
 * radio. Class names are obfuscated, so only roles/structure are used.
 */
async function readTemuChoiceRadios(
  page: Page
): Promise<Array<{ name: string | null; group: string | null; checked: boolean }>> {
  return page.evaluate(() => {
    const radios = Array.from(
      document.querySelectorAll<HTMLElement>('#rightContent [role="radio"]')
    )
    return radios.map((el) => {
      const name =
        (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim() ||
        null

      let group: string | null = null
      let node: HTMLElement | null = el
      while (node && node.id !== 'rightContent' && !group) {
        let sib = node.previousElementSibling
        while (sib && !group) {
          const holdsRadio =
            sib.getAttribute('role') === 'radio' || sib.querySelector('[role="radio"]')
          if (!holdsRadio) {
            const text =
              (sib as HTMLElement).innerText?.replace(/\s+/g, ' ').trim() || ''
            if (text && text.length <= 40) group = text.replace(/:\s*$/, '')
          }
          sib = sib.previousElementSibling
        }
        node = node.parentElement
      }

      return { name, group, checked: el.getAttribute('aria-checked') === 'true' }
    })
  })
}

/**
 * «Sold out» в буй-боксе для выбранного сейчас варианта. Текст радио-кнопок
 * выкидываем (у других вариантов бывают свои ленты «Sold out»), «Almost sold
 * out» (огонёк почти распродан) — не считается.
 */
async function isTemuSelectedChoiceSoldOut(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('#rightContent')
    if (!root) return false
    const clone = root.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[role="radio"]').forEach((el) => el.remove())
    const text = (clone.textContent || '').replace(/\s+/g, ' ')
    return /\bsold\s*out\b/i.test(text.replace(/almost\s*sold\s*out/gi, ' '))
  })
}

/**
 * One entry per buy-box radio, in DOM order (matches the trailing Choice
 * photos of the gallery). Clicks every non-selected radio to read its own
 * `Est.` price; the last clicked variant stays selected on the page.
 * Sold-out variants keep priceRaw=null: у них «Est.» нет, а body-wide матч
 * подобрал бы цену предыдущего варианта.
 */
export async function collectTemuChoiceOptions(page: Page): Promise<TemuChoiceOption[]> {
  const radios = await readTemuChoiceRadios(page)
  if (!radios.length) return []

  const out: TemuChoiceOption[] = []
  let selected = radios.findIndex((r) => r.checked)
  for (let i = 0; i < radios.length; i++) {
    let priceRaw: string | null = null
    let soldOut = false
    try {
      if (i !== selected) {
        const radio = page.locator('#rightContent [role="radio"]').nth(i)
        await radio.scrollIntoViewIfNeeded({ timeout: 3_000 })
        await radio.click({ timeout: 5_000 })
        selected = i
        await sleep(700)
      }
      soldOut = await isTemuSelectedChoiceSoldOut(page)
      if (soldOut) {
        jobLog(`temu choice #${i + 1} (${radios[i].name ?? '?'}): sold out`)
      } else {
        priceRaw = await extractTemuPriceRaw(page)
      }
    } catch (exc) {
      jobLog(
        `temu choice #${i + 1} price fail: ${exc instanceof Error ? exc.message : exc}`
      )
    }
    out.push({ name: radios[i].name, group: radios[i].group, priceRaw, soldOut })
  }
  return out
}
