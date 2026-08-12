import { lookup } from 'node:dns/promises'
import type { Page } from 'playwright'

/**
 * Сетевые ошибки Chromium: обрыв соединения, DNS, прокси. Такие не ретраим —
 * как «Unavailable for purchase»: сразу ошибка, товар/заказ докачается
 * следующим прогоном.
 */
const NETWORK_ERR_RE =
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|ADDRESS_UNREACHABLE|NETWORK_CHANGED|TIMED_OUT|EMPTY_RESPONSE|CONNECTION_[A-Z_]+|PROXY_[A-Z_]+|TUNNEL_[A-Z_]+|SOCKS_[A-Z_]+)/

export function isNetworkError(exc: unknown): boolean {
  const message = exc instanceof Error ? exc.message : String(exc)
  return NETWORK_ERR_RE.test(message)
}

/** Быстрая проверка «есть ли сеть вообще»: DNS-резолв хоста через OS-резолвер. */
async function isHostUnreachable(host: string): Promise<boolean> {
  try {
    await lookup(host)
    return false
  } catch {
    return true
  }
}

/**
 * page.goto с быстрым отказом при обрыве сети:
 * - перед навигацией DNS-проба хоста — сети нет → мгновенная ошибка,
 *   не жжём 90-секундный таймаут навигации;
 * - сетевые ошибки Chromium переворачиваются в понятное «network down»;
 * - таймаут навигации перепроверяется пробой: сеть умерла во время загрузки —
 *   тоже «network down», а не безликий Timeout.
 */
export async function gotoOnline(
  page: Page,
  url: string,
  opts?: { timeout?: number }
): Promise<void> {
  const timeout = opts?.timeout ?? 90_000
  const host = new URL(url).hostname

  if (await isHostUnreachable(host)) {
    throw new Error(`network down: dns probe failed for ${host} — skipping without retries`)
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
  } catch (exc) {
    if (isNetworkError(exc) || (await isHostUnreachable(host))) {
      const message = exc instanceof Error ? exc.message : String(exc)
      const code = message.match(/net::ERR_[A-Z_]+/)?.[0] ?? 'connection stalled'
      throw new Error(`network down: ${code} — skipping without retries`)
    }
    throw exc
  }
}
