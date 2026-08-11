// Полный снос тестовых данных: catalog.sqlite (+ -wal/-shm), всё содержимое
// market_root с диска, затем чистая БД по SCHEMA_SQL + migrateCatalogSchema
// (тот же инит, что в connect.ts). Браузерный профиль не трогает.
//
// Запуск:  node scripts/reset-data.mjs        — показать, что будет удалено
//          node scripts/reset-data.mjs --yes  — удалить и накатить инит
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import YAML from 'yaml'
import { SCHEMA_SQL } from '../src/main/db/schema.ts'
import { migrateCatalogSchema } from '../src/main/core/migrate.ts'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Как config.ts в dev: config.local.yaml важнее config.yaml,
// относительные пути — от корня проекта (dataRoot в dev = appRoot).
function loadConfig() {
  const candidates = [join(projectRoot, 'config.local.yaml'), join(projectRoot, 'config.yaml')]
  const path = candidates.find((p) => existsSync(p))
  if (!path) throw new Error('config.yaml не найден рядом с проектом')
  const raw = YAML.parse(readFileSync(path, 'utf8'))
  const catalogDb = raw?.output?.catalog_db
  const marketRoot = raw?.output?.market_root
  if (typeof catalogDb !== 'string' || !catalogDb.trim()) {
    throw new Error(`${path}: пустой output.catalog_db`)
  }
  if (typeof marketRoot !== 'string' || !marketRoot.trim()) {
    throw new Error(`${path}: пустой output.market_root`)
  }
  const abs = (p) => (isAbsolute(p) ? p : resolve(projectRoot, p))
  return { configPath: path, catalogDb: abs(catalogDb.trim()), marketRoot: abs(marketRoot.trim()) }
}

const cfg = loadConfig()
const marketRootAbs = resolve(cfg.marketRoot)

// Страховка от опечатки в конфиге: не сносим корень диска и корень проекта.
if (parse(marketRootAbs).root === marketRootAbs) {
  throw new Error(`market_root указывает на корень диска (${marketRootAbs}) — отказ`)
}
if (marketRootAbs === resolve(projectRoot)) {
  throw new Error(`market_root совпадает с корнем проекта (${marketRootAbs}) — отказ`)
}

const targets = []
for (const suffix of ['', '-wal', '-shm']) {
  const p = resolve(`${cfg.catalogDb}${suffix}`)
  if (existsSync(p)) targets.push(p)
}
if (existsSync(marketRootAbs)) {
  for (const name of readdirSync(marketRootAbs)) {
    const p = resolve(join(marketRootAbs, name))
    if (!targets.includes(p)) targets.push(p)
  }
}

console.log(`config:      ${cfg.configPath}`)
console.log(`catalog_db:  ${cfg.catalogDb}`)
console.log(`market_root: ${marketRootAbs}`)

const yes = process.argv.includes('--yes')
if (!targets.length) {
  console.log('Удалять нечего — данных нет.')
} else if (!yes) {
  console.log(`\nБудет удалено (${targets.length}):`)
  for (const p of targets) console.log(`  ${p}`)
  console.log('\nСухой прогон. Запусти с --yes, чтобы удалить и накатить инит.')
  process.exit(0)
} else {
  for (const p of targets) {
    rmSync(p, { recursive: true, force: true })
    console.log(`removed: ${p}`)
  }
}

if (yes || !targets.length) {
  mkdirSync(dirname(cfg.catalogDb), { recursive: true })
  mkdirSync(marketRootAbs, { recursive: true })
  const db = new DatabaseSync(cfg.catalogDb)
  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(SCHEMA_SQL)
    migrateCatalogSchema(db, cfg)
  } finally {
    db.close()
  }
  console.log(`\nЧистая БД создана по SCHEMA_SQL: ${cfg.catalogDb}`)
}
