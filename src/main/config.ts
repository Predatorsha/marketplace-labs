import { existsSync, readFileSync } from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'
import { app } from 'electron'
import YAML from 'yaml'

export type AppConfig = {
  browser: {
    market_profile_dir: string
  }
  output: {
    catalog_db: string
    market_root: string
  }
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`config.yaml: missing or empty required string "${path}"`)
  }
  return value.trim()
}

function parseConfig(raw: unknown, path: string): AppConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`config.yaml: expected a mapping at ${path}`)
  }
  const loaded = raw as Record<string, unknown>
  const browser = loaded.browser
  const output = loaded.output
  if (!browser || typeof browser !== 'object' || Array.isArray(browser)) {
    throw new Error('config.yaml: missing required object "browser"')
  }
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('config.yaml: missing required object "output"')
  }
  const browserObj = browser as Record<string, unknown>
  const outputObj = output as Record<string, unknown>
  return {
    browser: {
      market_profile_dir: requireNonEmptyString(
        browserObj.market_profile_dir,
        'browser.market_profile_dir'
      )
    },
    output: {
      catalog_db: requireNonEmptyString(outputObj.catalog_db, 'output.catalog_db'),
      market_root: requireNonEmptyString(outputObj.market_root, 'output.market_root')
    }
  }
}

export function appRoot(): string {
  if (app.isPackaged) {
    return dirname(app.getPath('exe'))
  }
  return resolve(__dirname, '../..')
}

/**
 * Writable data root for relative config paths.
 * Packaged: Electron userData (survives rebuilds / Program Files).
 * Dev: project root (same as appRoot).
 */
export function dataRoot(): string {
  if (app.isPackaged) {
    return app.getPath('userData')
  }
  return appRoot()
}

export function configPath(): string {
  const candidates = [
    // Dev-only machine override (gitignored); never ship this.
    join(appRoot(), 'config.local.yaml'),
    // Packaged user override next to catalog data.
    app.isPackaged ? join(app.getPath('userData'), 'config.yaml') : '',
    // electron-builder extraResources
    join(process.resourcesPath || '', 'config.yaml'),
    join(appRoot(), 'config.yaml'),
    join(process.cwd(), 'config.yaml')
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return join(appRoot(), 'config.yaml')
}

export function loadConfig(): AppConfig {
  const path = configPath()
  if (!existsSync(path)) {
    throw new Error(`config.yaml not found (looked for ${path})`)
  }
  let parsed: unknown
  try {
    parsed = YAML.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`config.yaml: failed to parse ${path}: ${message}`)
  }
  return parseConfig(parsed, path)
}

/** Absolute path as-is; relative paths anchor to dataRoot() (never cwd). */
export function resolveAppPath(p: string): string {
  if (isAbsolute(p)) return p
  return resolve(dataRoot(), p)
}
