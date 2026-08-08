import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { AppConfig } from '../config'
import { SCHEMA_SQL } from '../db/schema'
import { migrateCatalogSchema } from './migrate'
import { catalogDbPath } from './paths'

export type CatalogDb = DatabaseSync

export function utcNowIso(): string {
  return new Date().toISOString()
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
    migrateCatalogSchema(db, cfg)
    initializedDbPaths.add(path)
  }
  return db
}
