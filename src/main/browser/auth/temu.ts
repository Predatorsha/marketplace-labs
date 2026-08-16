import type { Page } from 'playwright'
import { waitForHumanGate } from '../humanGate'
import type { AuthGateOpts } from './util'
import { sleep } from './util'

/**
 * Strict Temu session check: any visible Sign in / Register UI → need login.
 * Do not treat "Add to cart" (or other product chrome) as proof of a session.
 */
async function temuNeedsLogin(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const body = (document.body?.innerText || '').slice(0, 12_000)

    // Do not treat "Welcome back" / "Hello, …" as logged-in — that copy appears on Temu's login modal.

    const dialogs = Array.from(
      document.querySelectorAll('[role="dialog"], [class*="Modal"], [class*="modal"]')
    )
    for (const el of dialogs) {
      const t = (el.textContent || '').slice(0, 2000)
      if (/sign in/i.test(t) && (/register/i.test(t) || /google/i.test(t) || /facebook/i.test(t))) {
        return true
      }
    }

    if (/sign in\s*\/\s*register/i.test(body)) return true
    if (/sign in/i.test(body) && /register/i.test(body) && /continue with google/i.test(body)) {
      return true
    }

    const signInControl = Array.from(
      document.querySelectorAll('a, button, [role="button"], [role="link"]')
    ).some((el) => {
      const label = `${(el as HTMLElement).innerText || ''} ${el.getAttribute('aria-label') || ''}`
        .replace(/\s+/g, ' ')
        .trim()
      return /^sign in\b/i.test(label) || /^sign in\s*\/\s*register$/i.test(label)
    })
    if (signInControl) return true

    return false
  })
}

async function temuLooksLikeCaptcha(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const body = (document.body?.innerText || '').slice(0, 8000)
    return (
      /verify you are human|security check|captcha|unusual traffic/i.test(body) ||
      !!document.querySelector('iframe[src*="captcha"], iframe[src*="recaptcha"]')
    )
  })
}

/**
 * Temu-only login / captcha HumanGate loop.
 * Blocks until Sign in / Register is gone (or cancel / timeout).
 */
export async function ensureTemuLoggedIn(page: Page, opts?: AuthGateOpts): Promise<void> {
  const deadline = Date.now() + (opts?.timeoutMs ?? 15 * 60_000)

  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error('browser page closed during Temu login gate')

    const captcha = await temuLooksLikeCaptcha(page).catch(() => false)
    if (captcha) {
      const action = await waitForHumanGate({
        kind: 'captcha',
        platform: 'temu',
        message:
          'Temu: пройдите проверку (captcha) в окне браузера, затем нажмите «Продолжить».'
      })
      if (action === 'cancel') throw new Error('temu: captcha gate cancelled')
      await sleep(800)
      continue
    }

    const login = await temuNeedsLogin(page).catch(() => false)
    if (!login) return

    const action = await waitForHumanGate({
      kind: 'login',
      platform: 'temu',
      message:
        'Temu: нажмите Sign in / Register, войдите в аккаунт, затем «Продолжить». Пока вход не завершён — дальше не идём.'
    })
    if (action === 'cancel') throw new Error('temu: login gate cancelled')
    await sleep(1000)
  }

  throw new Error('temu: login / captcha gate timed out')
}
