import { ipcMain } from 'electron'
import { loadConfig } from '../../config'
import { jobLog } from '../../jobs/log'
import { getProduct } from '../../products/load'
import { listProducts } from '../../products/list'
import { updateProduct } from '../../products/update'
import type { ProductEditableFields, ProductKey, ProductListQuery } from '../../../shared/types'

export function registerProductsHandlers(): void {
  ipcMain.handle('products:download', async (_evt, args: { url: string }) => {
    const url = String(args?.url || '').trim()
    jobLog(`[ipc] products:download stub ${url}`)
    return {
      ok: false,
      error: 'Product download is not available yet (scrape not moved).'
    }
  })

  ipcMain.handle('products:list', async (_evt, args: ProductListQuery = {}) => {
    const cfg = loadConfig()
    try {
      return await listProducts(cfg, args || {})
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc)
      jobLog(`[ipc] products:list fail ${message}`)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('products:get', async (_evt, args: ProductKey) => {
    const cfg = loadConfig()
    try {
      return await getProduct(cfg, args)
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc)
      jobLog(`[ipc] products:get fail ${message}`)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(
    'products:update',
    async (_evt, args: ProductKey & { patch?: ProductEditableFields }) => {
      const cfg = loadConfig()
      const { patch, ...key } = args || ({} as ProductKey & { patch?: ProductEditableFields })
      try {
        return await updateProduct(cfg, key as ProductKey, patch || {})
      } catch (exc) {
        const message = exc instanceof Error ? exc.message : String(exc)
        jobLog(`[ipc] products:update fail ${message}`)
        return { ok: false, error: message }
      }
    }
  )
}
