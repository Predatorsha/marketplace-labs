import type { AppConfig } from '../config'
import type { CatalogDb } from './connect'

/**
 * Миграции каталога поверх SCHEMA_SQL (schema.ts — единый инит).
 *
 * Сейчас миграций нет: данные тестовые, изменение схемы = правка SCHEMA_SQL
 * + снос data/catalog.sqlite. Когда появятся боевые данные, ALTER'ы старых БД
 * добавляются сюда (свёрнутые в инит 2026-08-11 доливки колонок удалены).
 */
export function migrateCatalogSchema(_db: CatalogDb, _cfg: AppConfig): void {
  /* нет миграций */
}
