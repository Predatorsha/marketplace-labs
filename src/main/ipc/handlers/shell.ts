import { ipcMain, shell } from 'electron'
import { fromRelativeFolder } from '../../core/paths'
import { loadConfig } from '../../config'
import { resolveLatestSnapshot } from '../../products/snapshots'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openPath', async (_evt, args: { path: string }) => {
    const p = String(args?.path || '').trim()
    if (!p) return { ok: false, error: 'Empty path' }
    const cfg = loadConfig()
    const abs = fromRelativeFolder(cfg, p)
    if (!abs) {
      return { ok: false, error: 'Path is outside the catalog root folder' }
    }
    // Product roots hold dated snapshots; open the newest one when present.
    const target = resolveLatestSnapshot(abs) || abs
    const err = await shell.openPath(target)
    if (err) return { ok: false, error: err }
    return { ok: true }
  })
}
