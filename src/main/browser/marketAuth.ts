import type { Page } from 'playwright'
import type { PlatformId } from '../../shared/types/humanGate'
import { ensureAliExpressLoggedIn } from './auth/aliexpress'
import { ensureTemuLoggedIn } from './auth/temu'
import type { AuthGateOpts } from './auth/util'

function platformFromUrl(pageUrl: string): PlatformId | null {
  const host = pageUrl.toLowerCase()
  if (host.includes('temu')) return 'temu'
  if (host.includes('aliexpress') || host.includes('aliyun')) return 'aliexpress'
  return null
}

/**
 * Route to the platform-specific login / captcha workflow.
 * Temu and AliExpress logic live in separate modules — do not mix them here.
 */
export async function ensurePlatformLoggedIn(
  page: Page,
  opts?: AuthGateOpts & { platform?: PlatformId }
): Promise<void> {
  const platform = opts?.platform || platformFromUrl(page.url())
  if (platform === 'temu') {
    await ensureTemuLoggedIn(page, opts)
    return
  }
  if (platform === 'aliexpress') {
    await ensureAliExpressLoggedIn(page, opts)
    return
  }
}

/** No-op marker for pages; auth is explicit via ensurePlatformLoggedIn / ensureTemuLoggedIn. */
export function installMarketAuthGuard(_page: Page): void {
  /* intentionally empty — see ensureTemuLoggedIn / ensureAliExpressLoggedIn */
}

export { ensureTemuLoggedIn } from './auth/temu'
export { ensureAliExpressLoggedIn } from './auth/aliexpress'
