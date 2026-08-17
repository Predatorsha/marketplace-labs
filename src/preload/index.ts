import { contextBridge, ipcRenderer } from 'electron'
import type {
  HumanGateEvent,
  OrderGetResult,
  OrderListQuery,
  OrderListResult,
  OrderStartResult,
  PlatformId,
  ProductDownloadResult,
  ProductEditableFields,
  ProductGetResult,
  ProductKey,
  ProductListQuery,
  ProductListResult,
  ProductUpdateResult
} from '../shared/types'

const api = {
  startOrderSync: (platform: PlatformId): Promise<OrderStartResult> =>
    ipcRenderer.invoke('orders:start', { platform }),

  listOrders: (query?: OrderListQuery): Promise<OrderListResult> =>
    ipcRenderer.invoke('orders:list', query || {}),

  getOrder: (id: number): Promise<OrderGetResult> => ipcRenderer.invoke('orders:get', { id }),

  continueHumanGate: (gateId: number): Promise<boolean> =>
    ipcRenderer.invoke('orders:humanGateContinue', { gateId }),

  cancelHumanGate: (gateId: number): Promise<boolean> =>
    ipcRenderer.invoke('orders:humanGateCancel', { gateId }),

  onHumanGate: (cb: (payload: HumanGateEvent) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: HumanGateEvent): void => cb(payload)
    ipcRenderer.on('orders:humanGate', listener)
    return () => ipcRenderer.removeListener('orders:humanGate', listener)
  },

  onHumanGateClosed: (
    cb: (data: { action: 'continue' | 'cancel'; gateId: number }) => void
  ): (() => void) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      data: { action: 'continue' | 'cancel'; gateId: number }
    ): void => cb(data)
    ipcRenderer.on('orders:humanGateClosed', listener)
    return () => ipcRenderer.removeListener('orders:humanGateClosed', listener)
  },

  onProgress: (cb: (data: Record<string, unknown>) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: Record<string, unknown>): void => cb(data)
    ipcRenderer.on('orders:progress', listener)
    return () => ipcRenderer.removeListener('orders:progress', listener)
  },

  downloadProduct: (url: string): Promise<ProductDownloadResult> =>
    ipcRenderer.invoke('products:download', { url }),

  reimportProduct: (key: ProductKey): Promise<ProductDownloadResult> =>
    ipcRenderer.invoke('products:reimport', key),

  listProducts: (query?: ProductListQuery): Promise<ProductListResult> =>
    ipcRenderer.invoke('products:list', query || {}),

  getProduct: (key: ProductKey): Promise<ProductGetResult> =>
    ipcRenderer.invoke('products:get', key),

  updateProduct: (
    key: ProductKey,
    patch: ProductEditableFields
  ): Promise<ProductUpdateResult> => ipcRenderer.invoke('products:update', { ...key, patch }),

  openPath: (path: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:openPath', { path })
}

contextBridge.exposeInMainWorld('api', api)

export type DesktopApi = typeof api
