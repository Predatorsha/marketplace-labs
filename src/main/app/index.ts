import { app, BrowserWindow, Menu } from 'electron'
import { loadConfig } from '../config'
import { setHumanGateWindowGetter } from '../browser/humanGate'
import { registerIpc, shutdownBrowser } from '../ipc/register'
import { jobLog } from '../jobs/log'
import { registerMediaProtocol, registerMediaScheme } from '../media/protocol'
import { syncOrders } from '../scrape/orders'
import { createWindow, getMainWindow } from './window'

registerMediaScheme()

/**
 * Тестовый прогон синка заказов без кликов по UI:
 * ORDERS_SYNC_TEST=temu:2 npm run dev — верхние 2 заказа качаются
 * принудительно, результат в консоль, после — выход из приложения.
 */
async function runOrderSyncTest(spec: string): Promise<void> {
  const [platform, nRaw] = spec.split(':')
  const topN = Math.max(1, Number(nRaw) || 2)
  if (platform !== 'temu') {
    jobLog(`ORDERS_SYNC_TEST: unsupported platform "${platform}"`)
    app.quit()
    return
  }
  try {
    const plan = await syncOrders(loadConfig(), 'temu', { topN })
    jobLog(`ORDERS_SYNC_TEST result: ${JSON.stringify(plan, null, 2)}`)
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc)
    jobLog(`ORDERS_SYNC_TEST failed: ${message}`)
  } finally {
    await shutdownBrowser()
    app.quit()
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.local.marketplace-labs')
  }

  Menu.setApplicationMenu(null)

  setHumanGateWindowGetter(() => getMainWindow())
  registerMediaProtocol(() => loadConfig())
  registerIpc()
  createWindow()

  if (process.env.ORDERS_SYNC_TEST) {
    void runOrderSyncTest(String(process.env.ORDERS_SYNC_TEST))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void shutdownBrowser()
})
