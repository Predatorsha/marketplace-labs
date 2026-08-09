import type { Page } from 'playwright'
import { jobLog } from '../../jobs/log'
import { sleep } from './util'

/**
 * Посылка со страницы «Track order».
 * Товары посылки идентифицируем картинками (src миниатюр) — они совпадают с
 * миниатюрами позиций в деталке заказа и различают варианты одного товара,
 * в отличие от тайтла.
 */
export type TemuPackageInfo = {
  /** "Package 1" (null — заказ без вкладок, единственная посылка). */
  label: string | null
  tracking_code: string | null
  /** Название перевозчика ("Transfera"). */
  carrier: string | null
  /** "Delivered on Jun 14, 2026" или последний статус трека. */
  status: string | null
  items: Array<{ image: string | null; title: string | null }>
}

/** Страница трекинга открыта: есть Shipping details / Tracking Number. */
async function waitForTrackingPage(page: Page, timeoutMs = 25_000): Promise<boolean> {
  return page
    .waitForFunction(
      () => {
        const text = document.body?.innerText || ''
        return /Shipping details/i.test(text) || /Tracking Number:/i.test(text)
      },
      { timeout: timeoutMs }
    )
    .then(() => true)
    .catch(() => false)
}

/**
 * Кликает "Track order" на деталке заказа. Трекинг может открыться в этой же
 * вкладке или попапом — возвращаем страницу, на которой он оказался.
 */
export async function openTemuTracking(
  page: Page
): Promise<{ page: Page; isPopup: boolean } | null> {
  const beforeUrl = page.url()
  const popupPromise = page
    .context()
    .waitForEvent('page', { timeout: 8_000 })
    .catch(() => null)

  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('[role="button"]')).find(
      (el) => ((el as HTMLElement).innerText || '').trim() === 'Track order'
    )
    if (!btn) return false
    ;(btn as HTMLElement).click()
    return true
  })
  if (!clicked) return null

  const navved = await page
    .waitForFunction((prev) => location.href !== prev, beforeUrl, { timeout: 8_000 })
    .then(() => true)
    .catch(() => false)

  if (navved) {
    const ok = await waitForTrackingPage(page)
    return ok ? { page, isPopup: false } : null
  }

  const popup = await popupPromise
  if (popup) {
    await popup.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined)
    const ok = await waitForTrackingPage(popup)
    if (ok) return { page: popup, isPopup: true }
    await popup.close().catch(() => undefined)
    return null
  }

  // Мог отрендериться оверлеем без смены URL.
  const ok = await waitForTrackingPage(page, 8_000)
  return ok ? { page, isPopup: false } : null
}

type TrackingTabs = { count: number; labels: string[] }

/** Вкладки Package 1..N (0 — вкладок нет, посылка одна). */
async function readPackageTabs(page: Page): Promise<TrackingTabs> {
  return page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[class*="package-name"]'))
    return {
      count: tabs.length,
      labels: tabs.map((t) => ((t as HTMLElement).innerText || '').trim())
    }
  })
}

async function clickPackageTab(page: Page, index: number): Promise<boolean> {
  return page.evaluate((i) => {
    const tabs = Array.from(document.querySelectorAll('[class*="package-name"]'))
    const tab = tabs[i] as HTMLElement | undefined
    if (!tab) return false
    const btn = (tab.closest('[role="button"]') as HTMLElement | null) || tab.parentElement
    ;(btn || tab).click()
    return true
  }, index)
}

/** Парсит текущую (активную) вкладку посылки. */
async function extractCurrentPackage(page: Page): Promise<Omit<TemuPackageInfo, 'label'>> {
  return page.evaluate(() => {
    const root =
      (document.querySelector('[class*="expressWrap"]') as HTMLElement | null) || document.body
    const text = root.innerText || ''

    // Трек: строка после "Tracking Number:" (у Temu рядом дубликат с пробелами
    // для скринридера — компактный вариант матчится первым).
    const trackM = text.match(/Tracking Number:\s*\n?\s*([A-Z0-9]{6,})/i)

    const carrierImg = root.querySelector(
      'img[class*="serviceProviderImg"]'
    ) as HTMLImageElement | null
    let carrier = carrierImg?.getAttribute('alt')?.trim() || null
    if (!carrier) {
      const m = text.match(/Contact ([A-Za-z][\w .-]{1,30})/)
      carrier = m ? m[1].trim() : null
    }

    // Статус: заголовок "Delivered on …", иначе верхняя строка истории трека.
    let status: string | null = null
    const deliveredM = text.match(/(Delivered on [A-Za-z]{3,9}\.? \d{1,2}, \d{4})/)
    if (deliveredM) {
      status = deliveredM[1]
    } else {
      const firstTrace = root.querySelector('[class*="track-info"]') as HTMLElement | null
      if (firstTrace) {
        const line = (firstTrace.innerText || '')
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean)[0]
        status = line ? line.replace(/,+$/, '').trim() : null
      }
    }

    const items = Array.from(root.querySelectorAll('[class*="goodsImgWrap"] img')).map((img) => ({
      image: img.getAttribute('src') || null,
      title: img.getAttribute('alt')?.trim() || null
    }))

    return { tracking_code: trackM ? trackM[1].toUpperCase() : null, carrier, status, items }
  })
}

/**
 * Собирает все посылки со страницы трекинга: обходит вкладки Package 1..N
 * (или парсит единственную, если вкладок нет).
 */
export async function collectTemuPackages(page: Page): Promise<TemuPackageInfo[]> {
  await sleep(800)
  const tabs = await readPackageTabs(page)

  if (tabs.count === 0) {
    const pkg = await extractCurrentPackage(page)
    return pkg.tracking_code || pkg.items.length ? [{ ...pkg, label: null }] : []
  }

  const out: TemuPackageInfo[] = []
  for (let i = 0; i < tabs.count; i++) {
    if (!(await clickPackageTab(page, i))) break
    // Контент вкладки перерисовывается на месте — ждём смены трека или просто даём время.
    const prevTrack = out.length ? out[out.length - 1].tracking_code : null
    await page
      .waitForFunction(
        (prev) => {
          const m = (document.body?.innerText || '').match(/Tracking Number:\s*\n?\s*([A-Z0-9]{6,})/i)
          return !prev || (m ? m[1].toUpperCase() : null) !== prev
        },
        prevTrack,
        { timeout: 10_000 }
      )
      .catch(() => undefined)
    await sleep(500)

    const pkg = await extractCurrentPackage(page)
    out.push({ ...pkg, label: tabs.labels[i] || `Package ${i + 1}` })
    if (!pkg.tracking_code) {
      jobLog(`temu tracking: tab "${tabs.labels[i]}" has no tracking number`)
    }
  }
  return out
}
