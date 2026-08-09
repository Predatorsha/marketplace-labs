import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/** Snapshot folder name: `2026_08_09 14-30-08` (Windows-safe; no `:`). */
export const SNAPSHOT_DIR_RE = /^\d{4}_\d{2}_\d{2} \d{2}-\d{2}-\d{2}$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local timestamp folder name under a product root. */
export function formatSnapshotDirName(d = new Date()): string {
  const date = `${d.getFullYear()}_${pad2(d.getMonth() + 1)}_${pad2(d.getDate())}`
  const time = `${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`
  return `${date} ${time}`
}

function dirHasMediaFiles(snapshotAbs: string): boolean {
  for (const sub of ['images', 'choices'] as const) {
    const dir = join(snapshotAbs, sub)
    if (!existsSync(dir)) continue
    try {
      for (const name of readdirSync(dir)) {
        if (name.startsWith('.')) continue
        const abs = join(dir, name)
        try {
          if (statSync(abs).isFile()) return true
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return false
}

/** Subfolders of product root matching `YYYY_MM_DD HH-mm-ss`, sorted ascending. */
export function listSnapshotDirs(productRootAbs: string): string[] {
  if (!productRootAbs || !existsSync(productRootAbs)) return []
  try {
    const names = readdirSync(productRootAbs).filter((name) => {
      if (!SNAPSHOT_DIR_RE.test(name)) return false
      try {
        return statSync(join(productRootAbs, name)).isDirectory()
      } catch {
        return false
      }
    })
    names.sort((a, b) => a.localeCompare(b))
    return names
  } catch {
    return []
  }
}

/** Latest dated snapshot under the product root (by folder name), or null. */
export function resolveLatestSnapshot(productRootAbs: string): string | null {
  const names = listSnapshotDirs(productRootAbs)
  if (!names.length) return null
  return join(productRootAbs, names[names.length - 1])
}

/**
 * Latest non-empty snapshot under the product root, or null if none.
 * Media paths (images/, choices/) are resolved relative to this folder.
 */
export function resolveActiveSnapshot(productRootAbs: string): string | null {
  const names = listSnapshotDirs(productRootAbs)
  for (let i = names.length - 1; i >= 0; i--) {
    const abs = join(productRootAbs, names[i])
    if (dirHasMediaFiles(abs)) return abs
  }
  return null
}

/** Count of non-empty snapshots other than the active one. */
export function countArchivedSnapshots(productRootAbs: string): number {
  const active = resolveActiveSnapshot(productRootAbs)
  const names = listSnapshotDirs(productRootAbs)
  let n = 0
  for (const name of names) {
    const abs = join(productRootAbs, name)
    if (!dirHasMediaFiles(abs)) continue
    if (active && abs === active) continue
    n++
  }
  return n
}
