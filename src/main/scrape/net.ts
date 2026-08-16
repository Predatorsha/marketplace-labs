/**
 * Детектор сетевых ошибок Chromium: реальный обрыв связи — дисконнект, DNS,
 * прокси/туннель. Таймауты (ERR_TIMED_OUT), пустые ответы (ERR_EMPTY_RESPONSE)
 * и обрывы соединения (ERR_CONNECTION_*) сюда НЕ входят: на Temu это часто
 * просто медленная страница, такие ошибки уходят вызывателю как есть и товар
 * ретраится следующим прогоном.
 *
 * Навигация — у платформ (scrape/temu/nav.ts, scrape/aliexpress/nav.ts):
 * общего fetch на оба маркета не пишем (ARCHITECTURE.md, «Marketplace split»).
 */
const NETWORK_ERR_RE =
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|ADDRESS_UNREACHABLE|NETWORK_CHANGED|PROXY_[A-Z_]+|TUNNEL_[A-Z_]+|SOCKS_[A-Z_]+)/

export function isNetworkError(exc: unknown): boolean {
  const message = exc instanceof Error ? exc.message : String(exc)
  return NETWORK_ERR_RE.test(message)
}
