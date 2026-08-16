import { app, BrowserWindow, Menu } from 'electron'
import { loadConfig, type AppConfig } from '../config'
import { setHumanGateWindowGetter } from '../browser/humanGate'
import { registerIpc, shutdownBrowser } from '../ipc/register'
import { registerMediaProtocol, registerMediaScheme } from '../media/protocol'
import { createWindow, getMainWindow } from './window'

registerMediaScheme()

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.local.marketplace-labs')
  }

  Menu.setApplicationMenu(null)

  setHumanGateWindowGetter(() => getMainWindow())
  // Конфиг для media-протокола читаем один раз (лениво): протокол дёргает
  // getConfig на каждый ml-media:// запрос, а market_root меняется только
  // с перезапуском приложения.
  let mediaCfg: AppConfig | null = null
  registerMediaProtocol(() => (mediaCfg ??= loadConfig()))
  registerIpc()
  createWindow()

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
