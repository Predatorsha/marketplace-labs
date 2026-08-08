import { ipcMain, shell } from 'electron'
import { resolve } from 'path'
import { marketRoot } from '../../core/paths'
import { loadConfig } from '../../config'
import { isPathUnderRoot } from '../../media/protocol'

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openPath', async (_evt, args: { path: string }) => {
    const p = String(args?.path || '').trim()
    if (!p) return { ok: false, error: 'Empty path' }
    const abs = resolve(p)
    const cfg = loadConfig()
    if (!isPathUnderRoot(abs, marketRoot(cfg))) {
      return { ok: false, error: 'Path is outside the catalog root folder' }
    }
    const err = await shell.openPath(abs)
    if (err) return { ok: false, error: err }
    return { ok: true }
  })
}
