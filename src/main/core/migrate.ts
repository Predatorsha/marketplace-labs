import type { AppConfig } from '../config'
import type { CatalogDb } from './connect'

/** Идемпотентная доливка колонки: SQLite не умеет ADD COLUMN IF NOT EXISTS. */
function ensureColumn(db: CatalogDb, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}

/**
 * Миграции каталога поверх SCHEMA_SQL (schema.ts — единый инит).
 *
 * SCHEMA_SQL создаёт таблицы только целиком (IF NOT EXISTS): в уже существующую
 * таблицу новые колонки он не доливает. Каждое добавление колонки в SCHEMA_SQL
 * дублируется здесь ensureColumn'ом — тогда старые базы догоняют схему без
 * сноса файла.
 */
export function migrateCatalogSchema(db: CatalogDb, _cfg: AppConfig): void {
  // 2026-08-17: источник импорта карточки + источник данных (PR #2).
  ensureColumn(db, 'products', 'import_source', 'import_source TEXT')
  ensureColumn(db, 'products', 'data_source', 'data_source TEXT')
}
