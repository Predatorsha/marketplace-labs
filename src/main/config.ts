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
    folder_pattern: string
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
      market_root: requireNonEmptyString(outputObj.market_root, 'output.market_root'),
      folder_pattern: requireNonEmptyString(outputObj.folder_pattern, 'output.folder_pattern')
    }
  }
}

export function appRoot(): string {
  if (app.isPackaged) {
    return dirname(app.getPath('exe'))
  }
  return resolve(__dirname, '../..')
}

export function configPath(): string {
  const candidates = [
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

export function resolveAppPath(p: string): string {
  if (isAbsolute(p)) return p
  return resolve(appRoot(), p)
}
