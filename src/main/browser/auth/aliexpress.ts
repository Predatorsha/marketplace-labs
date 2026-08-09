import type { Page } from 'playwright'
import { waitForHumanGate } from '../humanGate'
import type { AuthGateOpts } from './util'
import { sleep } from './util'

async function aliexpressNeedsLogin(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Header account menu: logged out it reads "Sign in / Register" (hashed
    // class suffixes, so match by prefix), logged in — the account name.
    const account = document.querySelector<HTMLElement>(
      'div[class*="my-account--menuItem"], div[class*="my-account--"] [class*="my-account--text"]'
    )
    if (account && /sign\s*in|register|войти|регистрац/i.test(account.innerText || '')) {
      return true
    }

    const body = (document.body?.innerText || '').slice(0, 12_000)
    if (/sign in|join|login/i.test(body) && /password/i.test(body)) {
      const dialogs = document.querySelectorAll('[role="dialog"], .login-dialog, #login')
      if (dialogs.length) return true
    }
    return false
  })
}

async function aliexpressLooksLikeCaptcha(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const body = (document.body?.innerText || '').slice(0, 8000)
    return (
      /slide to verify|verify you are human|security check|captcha|unusual traffic/i.test(body) ||
      !!document.querySelector(
        'iframe[src*="captcha"], iframe[src*="recaptcha"], #nocaptcha, .nc-container'
      )
    )
  })
}

/**
 * AliExpress-only login / captcha HumanGate loop.
 * Separate from Temu — detection and copy live only here.
 */
export async function ensureAliExpressLoggedIn(page: Page, opts?: AuthGateOpts): Promise<void> {
  const deadline = Date.now() + (opts?.timeoutMs ?? 15 * 60_000)

  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error('browser page closed during AliExpress login gate')

    const captcha = await aliexpressLooksLikeCaptcha(page).catch(() => false)
    if (captcha) {
      opts?.progress?.({ phase: 'human_gate', kind: 'captcha', platform: 'aliexpress' })
      const action = await waitForHumanGate({
        kind: 'captcha',
        platform: 'aliexpress',
        message:
          'AliExpress: пройдите проверку в окне браузера, затем нажмите «Продолжить».'
      })
      if (action === 'cancel') throw new Error('aliexpress: captcha gate cancelled')
      await sleep(800)
      continue
    }

    const login = await aliexpressNeedsLogin(page).catch(() => false)
    if (!login) return

    opts?.progress?.({ phase: 'human_gate', kind: 'login', platform: 'aliexpress' })
    const action = await waitForHumanGate({
      kind: 'login',
      platform: 'aliexpress',
      message:
        'AliExpress: нажмите Sign in / Register и войдите в аккаунт, затем «Продолжить». Пока вход не завершён — дальше не идём.'
    })
    if (action === 'cancel') throw new Error('aliexpress: login gate cancelled')
    await sleep(1000)
    // Login often happens in a modal — the header can keep showing
    // "Sign in / Register" until a reload, which would re-open the gate forever.
    if (await aliexpressNeedsLogin(page).catch(() => false)) {
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
      await sleep(1500)
    }
  }

  throw new Error('aliexpress: login / captcha gate timed out')
}
