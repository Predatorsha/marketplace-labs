import { ipcMain } from 'electron'
import { loadConfig } from '../../config'
import { resolveHumanGate } from '../../browser/humanGate'
import { jobLog } from '../../jobs/log'
import { listOrders } from '../../orders/list'
import { syncOrders } from '../../scrape/orders'
import type { OrderListQuery, OrderStartResult } from '../../../shared/types'

export function registerOrdersHandlers(): void {
  ipcMain.handle('orders:list', async (_evt, args: OrderListQuery = {}) => {
    const cfg = loadConfig()
    try {
      return await listOrders(cfg, args || {})
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc)
      jobLog(`[ipc] orders:list fail ${message}`)
      return { ok: false, error: message }
    }
  })

  /**
   * Синк списка заказов: мотает список, обновляет статусы известных заказов,
   * возвращает план — какие заказы ещё не скачаны (само скачивание — TODO).
   */
  ipcMain.handle('orders:start', async (_evt, args: { platform?: string }): Promise<
    OrderStartResult
  > => {
    const platform = String(args?.platform || '').trim().toLowerCase()
    if (platform !== 'temu') {
      return {
        ok: false,
        stub: true as const,
        platform: platform === 'aliexpress' ? 'aliexpress' : 'temu',
        message: 'Order sync is only implemented for Temu so far.'
      }
    }

    const cfg = loadConfig()
    try {
      const plan = await syncOrders(cfg, 'temu')
      return {
        ok: plan.orders_failed === 0,
        platform: 'temu',
        message:
          `Temu: заказов в списке ${plan.discovered}, скачано ${plan.orders_synced}/${plan.to_download.length}, ` +
          `товаров скачано ${plan.products_scraped}, статусов обновлено ${plan.status_updated.length}` +
          (plan.reached_end ? ' (дошли до конца списка)' : ''),
        orders: plan.orders_synced,
        products: plan.products_scraped,
        ordersFailed: plan.orders_failed,
        productsFailed: plan.products_failed,
        plan
      }
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc)
      jobLog(`[ipc] orders:start fail ${message}`)
      return {
        ok: false,
        platform: 'temu',
        message,
        orders: 0,
        products: 0,
        error: message
      }
    }
  })

  ipcMain.handle('orders:humanGateContinue', async (_evt, args: { gateId: number }) => {
    return resolveHumanGate('continue', Number(args?.gateId))
  })

  ipcMain.handle('orders:cancel', async (_evt, args: { gateId: number }) => {
    return resolveHumanGate('cancel', Number(args?.gateId))
  })
}
