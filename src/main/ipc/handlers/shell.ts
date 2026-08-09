import { ipcMain, shell } from 'electron'
import { fromRelativeFolder } from '../../core/paths'
import { loadConfig } from '../../config'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openPath', async (_evt, args: { path: string }) => {
    const p = String(args?.path || '').trim()
    if (!p) return { ok: false, error: 'Empty path' }
    const cfg = loadConfig()
    const abs = fromRelativeFolder(cfg, p)
    if (!abs) {
      return { ok: false, error: 'Path is outside the catalog root folder' }
    }
    const err = await shell.openPath(abs)
    if (err) return { ok: false, error: err }
    return { ok: true }
  })
}
