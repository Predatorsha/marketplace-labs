import { ipcMain } from 'electron'
import { loadConfig } from '../../config'
import { jobLog } from '../../jobs/log'
import { getPackage } from '../../packages/get'
import { listPackages } from '../../packages/list'

export function registerPackagesHandlers(): void {
  ipcMain.handle('packages:list', async () => {
    const cfg = loadConfig()
    try {
      return listPackages(cfg)
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc)
      jobLog(`[ipc] packages:list fail ${message}`)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('packages:get', async (_evt, args: { id?: number }) => {
    const cfg = loadConfig()
    try {
      return await getPackage(cfg, Number(args?.id))
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc)
      jobLog(`[ipc] packages:get fail ${message}`)
      return { ok: false, error: message }
    }
  })
}
