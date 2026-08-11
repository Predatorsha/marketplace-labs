import type {
  HumanGateEvent,
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

export type DesktopApi = {
  startOrderSync: (platform: PlatformId) => Promise<OrderStartResult>
  listOrders: (query?: OrderListQuery) => Promise<OrderListResult>
  continueHumanGate: (gateId: number) => Promise<boolean>
  cancelHumanGate: (gateId: number) => Promise<boolean>
  onHumanGate: (cb: (payload: HumanGateEvent) => void) => () => void
  onHumanGateClosed: (
    cb: (data: { action: 'continue' | 'cancel'; gateId: number }) => void
  ) => () => void
  onProgress: (cb: (data: Record<string, unknown>) => void) => () => void
  downloadProduct: (url: string) => Promise<ProductDownloadResult>
  listProducts: (query?: ProductListQuery) => Promise<ProductListResult>
  getProduct: (key: ProductKey) => Promise<ProductGetResult>
  updateProduct: (key: ProductKey, patch: ProductEditableFields) => Promise<ProductUpdateResult>
  openPath: (path: string) => Promise<{ ok: boolean; error?: string }>
}

declare global {
  interface Window {
    api: DesktopApi
  }
}

export {}
