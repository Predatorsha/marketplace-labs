export type PlatformId = 'temu' | 'aliexpress'
export type HumanGateKind = 'login' | 'captcha'

export type HumanGatePayload = {
  kind: HumanGateKind
  platform: PlatformId
  message: string
}

/** Payload of the orders:humanGate event — carries the gate id back on resolve. */
export type HumanGateEvent = HumanGatePayload & { gateId: number }
