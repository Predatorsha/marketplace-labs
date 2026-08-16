import { getMainWindow } from '../app/window'

/**
 * Прогресс синка заказов в рендерер (канал orders:progress).
 * Подписчики: App.tsx (глобальный статус) и OrdersPage (заметка на странице).
 */
export function sendOrdersProgress(message: string): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('orders:progress', { message })
  }
}
