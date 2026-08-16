import type { Page } from 'playwright'
import { isNetworkError } from '../net'

/**
 * page.goto для AliExpress-страниц. Реальный обрыв связи (дисконнект/DNS/
 * прокси) переворачивается в понятное «network down»; всё остальное — включая
 * таймауты навигации — уходит вызывателю как есть и ретраится следующим
 * прогоном.
 *
 * Дубль с scrape/temu/nav.ts намеренный (ARCHITECTURE.md, «Marketplace
 * split»): общий у платформ только детектор isNetworkError.
 */
export async function gotoAliExpressPage(
  page: Page,
  url: string,
  opts?: { timeout?: number }
): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: opts?.timeout ?? 90_000 })
  } catch (exc) {
    if (isNetworkError(exc)) {
      const message = exc instanceof Error ? exc.message : String(exc)
      const code = message.match(/net::ERR_[A-Z_]+/)?.[0] ?? 'network error'
      throw new Error(`network down: ${code}`)
    }
    throw exc
  }
}
