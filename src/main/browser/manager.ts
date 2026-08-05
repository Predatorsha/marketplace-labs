import {
  existsSync,
  mkdirSync,
  cpSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  unlinkSync
} from 'fs'
import { isAbsolute, join, resolve } from 'path'
import { app } from 'electron'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { appRoot, type AppConfig } from '../config'
import { installMarketAuthGuard } from './marketAuth'

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const CHROME_LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  // "Восстановить страницы? Chrome завершён некорректно"
  '--hide-crash-restore-bubble',
  '--disable-session-crashed-bubble',
  // Built-in Google Translate prompt / toolbar
  '--disable-features=Translate,TranslateUI',
  '--disable-translate',
  '--no-first-run',
  '--no-default-browser-check'
]

function dirHasContent(dir: string): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).length > 0
  } catch {
    return false
  }
}

/**
 * Drop restored tab/session files. Keeps Cookies / Login Data / Local Storage
 * so marketplace login survives, but Chrome starts without old tabs.
 */
function clearRestoredTabs(profileDir: string): void {
  const def = join(profileDir, 'Default')
  const dropFiles = ['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs']
  for (const name of dropFiles) {
    const p = join(def, name)
    try {
      if (existsSync(p)) unlinkSync(p)
    } catch {
      /* locked / missing — ignore */
    }
  }
  // Newer Chromium: Default/Sessions/*
  const sessionsDir = join(def, 'Sessions')
  try {
    if (existsSync(sessionsDir)) {
      rmSync(sessionsDir, { recursive: true, force: true })
    }
  } catch {
    /* ignore */
  }
}

/** Clear unclean-exit flag, disable tab restore + translate. Login cookies stay. */
function prepareProfilePrefs(profileDir: string): void {
  const prefsPath = join(profileDir, 'Default', 'Preferences')
  try {
    mkdirSync(join(profileDir, 'Default'), { recursive: true })
    let prefs: Record<string, unknown> = {}
    if (existsSync(prefsPath)) {
      prefs = JSON.parse(readFileSync(prefsPath, 'utf8')) as Record<string, unknown>
    }
    const profile = (prefs.profile && typeof prefs.profile === 'object'
      ? prefs.profile
      : {}) as Record<string, unknown>
    profile.exit_type = 'Normal'
    profile.exited_cleanly = true
    prefs.profile = profile
    prefs.translate = { ...(typeof prefs.translate === 'object' ? prefs.translate : {}), enabled: false }
    // 5 = Open the New Tab page (do not restore previous session tabs)
    const session = (prefs.session && typeof prefs.session === 'object'
      ? prefs.session
      : {}) as Record<string, unknown>
    session.restore_on_startup = 5
    prefs.session = session
    writeFileSync(prefsPath, JSON.stringify(prefs))
  } catch (exc) {
    console.log(`[browser] prepareProfilePrefs failed: ${exc}`)
  }
  clearRestoredTabs(profileDir)
}

export class BrowserManager {
  private context: BrowserContext | null = null
  private page: Page | null = null
  private startChain: Promise<unknown> = Promise.resolve()
  private jobChain: Promise<unknown> = Promise.resolve()
  private lastProfileDir: string | null = null

  /** Serialize jobs that share the single browser page. */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.jobChain.then(fn, fn)
    this.jobChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  /**
   * Persistent Chrome profile lives under Electron userData so rebuilds of
   * release/win-unpacked do not wipe cookies / login.
   */
  profileDir(browserCfg: AppConfig['browser']): string {
    const raw = browserCfg.market_profile_dir
    if (!raw?.trim()) {
      throw new Error('config.yaml: browser.market_profile_dir is required')
    }
    // Absolute path in config = use as-is (no userData prefix).
    if (isAbsolute(raw)) {
      mkdirSync(raw, { recursive: true })
      this.lastProfileDir = raw
      return raw
    }

    const stable = join(app.getPath('userData'), raw)
    mkdirSync(stable, { recursive: true })

    // One-time migrate from old locations (next to exe / project root)
    if (!dirHasContent(stable)) {
      const candidates = [
        resolve(appRoot(), raw),
        join(dirnameSafe(app.getPath('exe')), raw),
        resolve(process.cwd(), raw)
      ]
      for (const old of candidates) {
        if (old === stable) continue
        if (dirHasContent(old)) {
          try {
            cpSync(old, stable, { recursive: true })
            console.log(`[browser] migrated profile from ${old} -> ${stable}`)
            break
          } catch (exc) {
            console.log(`[browser] profile migrate failed from ${old}: ${exc}`)
          }
        }
      }
    }

    this.lastProfileDir = stable
    return stable
  }

  getProfileDir(): string | null {
    return this.lastProfileDir
  }

  async ensureStarted(browserCfg: AppConfig['browser']): Promise<Page> {
    const run = this.startChain.then(async () => {
      if (this.context && this.page) {
        // User may have closed the Chromium window manually — page.url()
        // never throws, so check liveness explicitly.
        const browser = this.context.browser()
        const dead = this.page.isClosed() || (browser ? !browser.isConnected() : false)
        if (!dead) return this.page
        await this.forceCloseUnlocked()
      }

      const profile = this.profileDir(browserCfg)
      console.log(`[browser] persistent profile: ${profile}`)
      prepareProfilePrefs(profile)

      const opts = {
        headless: false as const,
        args: CHROME_LAUNCH_ARGS,
        locale: 'en-US',
        timezoneId: 'Europe/Berlin',
        viewport: { width: 1440, height: 960 },
        userAgent: DEFAULT_USER_AGENT
      }

      try {
        this.context = await chromium.launchPersistentContext(profile, {
          ...opts,
          channel: 'chrome'
        })
      } catch {
        this.context = await chromium.launchPersistentContext(profile, opts)
      }

      await this.context.addInitScript(
        `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
         try {
           document.documentElement.setAttribute('translate', 'no');
           const meta = document.createElement('meta');
           meta.name = 'google';
           meta.content = 'notranslate';
           (document.head || document.documentElement).appendChild(meta);
         } catch (e) {}`
      )
      // Prefer a single blank page; close anything Chrome still restored.
      const opened = this.context.pages()
      this.page = opened[0] || (await this.context.newPage())
      for (const p of opened) {
        if (p !== this.page) {
          await p.close().catch(() => undefined)
        }
      }
      try {
        const url = this.page.url()
        if (url && url !== 'about:blank' && !url.startsWith('chrome://newtab')) {
          await this.page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 15_000 })
        }
      } catch {
        /* ignore */
      }
      // Any goto to AliExpress (orders / product / tracking / …) → login gate
      installMarketAuthGuard(this.page)
      this.context.on('page', (p) => {
        installMarketAuthGuard(p)
      })
      // Drop stale handles when the user closes the browser window manually
      const ctx = this.context
      ctx.on('close', () => {
        if (this.context === ctx) {
          this.context = null
          this.page = null
        }
      })
      return this.page
    })
    this.startChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  async restart(browserCfg: AppConfig['browser']): Promise<Page> {
    const run = this.startChain.then(async () => {
      await this.forceCloseUnlocked()
    })
    this.startChain = run.then(
      () => undefined,
      () => undefined
    )
    await run
    return this.ensureStarted(browserCfg)
  }

  private async forceCloseUnlocked(): Promise<void> {
    if (this.context) {
      try {
        // Close flushes cookies/localStorage into the persistent profile dir.
        await this.context.close()
      } catch {
        /* ignore */
      }
    }
    this.context = null
    this.page = null
  }

  async close(): Promise<void> {
    const run = this.startChain.then(async () => {
      await this.forceCloseUnlocked()
    })
    this.startChain = run.then(
      () => undefined,
      () => undefined
    )
    await run
  }
}

function dirnameSafe(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(0, i) : p
}

export const browserManager = new BrowserManager()
