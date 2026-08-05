import { app, BrowserWindow, Menu } from 'electron'
import { loadConfig } from '../config'
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
  registerMediaProtocol(() => loadConfig())
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
