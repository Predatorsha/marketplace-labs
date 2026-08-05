import type { PlatformId } from './humanGate'

export type OrderStartResult =
  | {
      ok: false
      stub: true
      platform: PlatformId
      message: string
    }
  | {
      ok: boolean
      stub?: false
      platform: PlatformId
      message: string
      orders: number
      products: number
      ordersFailed?: number
      productsFailed?: number
      error?: string
    }
