import { mkdirSync } from 'fs'
import { dirname, isAbsolute, resolve } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { AppConfig } from '../config'
import { SCHEMA_SQL } from './schema'

export type CatalogDb = DatabaseSync

export function utcNowIso(): string {
  return new Date().toISOString()
}

export function catalogDbPath(cfg: AppConfig): string {
  const raw = cfg.output.catalog_db
  return isAbsolute(raw) ? raw : resolve(raw)
}

export function marketRoot(cfg: AppConfig): string {
  const raw = cfg.output.market_root
  return isAbsolute(raw) ? raw : resolve(raw)
}

export function toRelativeFolder(cfg: AppConfig, folder: string | null | undefined): string | null {
  if (!folder) return null
  const abs = resolve(folder)
  const root = resolve(marketRoot(cfg))
  const normAbs = abs.replace(/\\/g, '/')
  const normRoot = root.replace(/\\/g, '/')
  if (
    normAbs.toLowerCase().startsWith(normRoot.toLowerCase() + '/') ||
    normAbs.toLowerCase() === normRoot.toLowerCase()
  ) {
    return abs.slice(root.length).replace(/^[/\\]/, '').replace(/\\/g, '/')
  }
  return abs
}

/** Resolve a catalog folder_path (relative or absolute) to an absolute path under market_root. */
export function fromRelativeFolder(cfg: AppConfig, folderPath: string | null | undefined): string | null {
  if (!folderPath) return null
  const trimmed = String(folderPath).trim()
  if (!trimmed) return null
  // Reject path traversal in relative segments.
  if (trimmed.split(/[/\\]/).includes('..')) return null
  const root = marketRoot(cfg)
  const abs = isAbsolute(trimmed) ? resolve(trimmed) : resolve(root, trimmed)
  const normAbs = abs.replace(/\\/g, '/').toLowerCase()
  const normRoot = resolve(root).replace(/\\/g, '/').toLowerCase()
  if (normAbs !== normRoot && !normAbs.startsWith(`${normRoot}/`)) return null
  return abs
}

/** DB paths whose schema create already ran in this process. */
const initializedDbPaths = new Set<string>()

/** Open catalog DB (built-in node:sqlite — no native better-sqlite3 rebuild). */
export function connect(cfg: AppConfig): CatalogDb {
  const path = catalogDbPath(cfg)
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  if (!initializedDbPaths.has(path)) {
    db.exec(SCHEMA_SQL)
    initializedDbPaths.add(path)
  }
  return db
}
