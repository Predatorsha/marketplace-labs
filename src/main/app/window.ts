import { app, BrowserWindow, Menu, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function resolveAppIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath || '', 'icon.ico'),
    join(__dirname, '../../build/icon.ico'),
    join(app.getAppPath(), 'build/icon.ico')
  ]
  return candidates.find((p) => p && existsSync(p))
}

export function createWindow(): void {
  const iconPath = resolveAppIcon()
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    title: 'Marketplace Labs',
    ...(icon && !icon.isEmpty() ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, selectionText } = params
    const template: MenuItemConstructorOptions[] = []

    if (isEditable) {
      template.push(
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', enabled: editFlags.canSelectAll }
      )
    } else if (selectionText) {
      template.push({ role: 'copy', enabled: editFlags.canCopy })
    }

    if (template.length) {
      Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}
