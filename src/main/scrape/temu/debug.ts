import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Page } from 'playwright'
import { jobLog } from '../../jobs/log'

/**
 * Дамп HTML страницы в userData/debug — разбор состояний Temu, которые не
 * воспроизвести руками (sold out и пустые снапшоты показываются не всегда).
 * Только за флагом ML_DUMP_HTML=1: дамп — полный HTML залогиненной страницы
 * (PII), без флага и уборки он молча растит диск.
 */
export async function dumpTemuDebugHtml(
  page: Page,
  productId: string,
  label: string
): Promise<void> {
  if (process.env.ML_DUMP_HTML !== '1') return
  try {
    const html = await page.content()
    const dir = join(app.getPath('userData'), 'debug')
    mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const file = join(dir, `${productId} ${label} ${stamp}.html`)
    writeFileSync(file, html)
    jobLog(`temu debug html saved: ${file}`)
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    jobLog(`temu debug html failed (${label}): ${message}`)
  }
}
