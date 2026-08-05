import { ipcMain } from 'electron'
import { resolveHumanGate } from '../../browser/humanGate'

export function registerOrdersHandlers(): void {
  ipcMain.handle('orders:start', async (_evt, args: { platform?: string }) => {
    const platform = String(args?.platform || '').trim() || 'unknown'
    return {
      ok: false,
      stub: true as const,
      platform: platform === 'temu' || platform === 'aliexpress' ? platform : 'aliexpress',
      message: 'Order sync is not available yet (scrape not moved).'
    }
  })

  ipcMain.handle('orders:humanGateContinue', async (_evt, args: { gateId: number }) => {
    return resolveHumanGate('continue', Number(args?.gateId))
  })

  ipcMain.handle('orders:cancel', async (_evt, args: { gateId: number }) => {
    return resolveHumanGate('cancel', Number(args?.gateId))
  })
}
