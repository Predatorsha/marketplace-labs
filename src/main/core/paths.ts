import { existsSync } from 'fs'
import { basename, isAbsolute, resolve } from 'path'
import { resolveAppPath, type AppConfig } from '../config'

/** Absolute catalog DB path. Relative config values anchor to appRoot (never cwd). */
export function catalogDbPath(cfg: AppConfig): string {
  return resolveAppPath(cfg.output.catalog_db)
}

/** Absolute market/media root. Relative config values anchor to appRoot (never cwd). */
export function marketRoot(cfg: AppConfig): string {
  return resolveAppPath(cfg.output.market_root)
}

/**
 * Normalize a product folder to a path relative to output.market_root.
 * Relative inputs are resolved against market_root (never process cwd).
 */
export function toRelativeFolder(cfg: AppConfig, folder: string | null | undefined): string | null {
  if (!folder) return null
  const trimmed = String(folder).trim()
  if (!trimmed) return null
  if (trimmed.split(/[/\\]/).includes('..')) return null

  const root = resolve(marketRoot(cfg))
  const abs = isAbsolute(trimmed) ? resolve(trimmed) : resolve(root, trimmed)
  const normAbs = abs.replace(/\\/g, '/')
  const normRoot = root.replace(/\\/g, '/')

  if (normAbs.toLowerCase() === normRoot.toLowerCase()) return ''
  if (normAbs.toLowerCase().startsWith(`${normRoot.toLowerCase()}/`)) {
    return abs.slice(root.length).replace(/^[/\\]+/, '').replace(/\\/g, '/')
  }

  // Legacy bug: absolute path outside market_root (resolved from project cwd).
  // Recover when the folder name exists under market_root.
  const name = basename(trimmed)
  if (name) {
    const candidate = resolve(root, name)
    if (existsSync(candidate)) {
      return name.replace(/\\/g, '/')
    }
  }
  return null
}

/** Resolve a catalog folder_path (relative or absolute) to an absolute path under market_root. */
export function fromRelativeFolder(
  cfg: AppConfig,
  folderPath: string | null | undefined
): string | null {
  if (!folderPath) return null
  const trimmed = String(folderPath).trim()
  if (!trimmed) return null
  if (trimmed.split(/[/\\]/).includes('..')) return null
  const root = marketRoot(cfg)
  const abs = isAbsolute(trimmed) ? resolve(trimmed) : resolve(root, trimmed)
  const normAbs = abs.replace(/\\/g, '/').toLowerCase()
  const normRoot = resolve(root).replace(/\\/g, '/').toLowerCase()
  if (normAbs !== normRoot && !normAbs.startsWith(`${normRoot}/`)) return null
  return abs
}
