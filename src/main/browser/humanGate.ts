import { BrowserWindow, Notification } from 'electron'
// Типы гейта живут в shared/types/humanGate.ts: payload события orders:humanGate
// должен быть типизирован одной копией по обе стороны IPC.
import type { HumanGateKind, HumanGatePayload } from '../../shared/types/humanGate'

export type HumanGateHandle = {
  gateId: number
  result: Promise<'continue' | 'cancel'>
}

type GateWaiter = {
  id: number
  resolve: (action: 'continue' | 'cancel') => void
  payload: HumanGatePayload
  notification: Notification | null
}

let nextGateId = 0
let active: GateWaiter | null = null
let getMainWindow: (() => BrowserWindow | null) | null = null

export function setHumanGateWindowGetter(fn: () => BrowserWindow | null): void {
  getMainWindow = fn
}

function titleFor(kind: HumanGateKind): string {
  return kind === 'login' ? 'Нужен логин' : 'Нужна капча'
}

function bodyFor(payload: HumanGatePayload): string {
  // Platform-specific copy is owned by browser/auth/temu.ts and aliexpress.ts.
  if (payload.message) return payload.message
  return payload.kind === 'login'
    ? 'Войдите в аккаунт, затем нажмите «Продолжить» или кликните это уведомление.'
    : 'Пройдите проверку, затем нажмите «Продолжить» или кликните это уведомление.'
}

function showWindowsNotification(payload: HumanGatePayload, gateId: number): Notification | null {
  if (!Notification.isSupported()) return null
  const n = new Notification({
    title: titleFor(payload.kind),
    body: bodyFor(payload),
    urgency: 'critical'
  })
  n.on('click', () => {
    const win = getMainWindow?.()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
    // Stale toasts linger in Action Center — the id guard makes clicks on
    // them no-ops instead of dismissing a later unrelated gate.
    resolveHumanGate('continue', gateId)
  })
  n.show()
  return n
}

function broadcast(channel: string, data: unknown): void {
  const win = getMainWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

/**
 * Block until user continues (toast click or modal) or cancels.
 * Shows Windows notification + React modal at the same time.
 * Returns the gate id so auto-continue pollers can resolve exactly this gate.
 */
export function openHumanGate(payload: HumanGatePayload): HumanGateHandle {
  if (active) {
    // Nested gate: reuse existing wait (and its id)
    const prev = active
    const prevResolve = prev.resolve
    const result = new Promise<'continue' | 'cancel'>((resolve) => {
      prev.resolve = (action) => {
        prevResolve(action)
        resolve(action)
      }
    })
    return { gateId: prev.id, result }
  }

  const gateId = ++nextGateId

  const win = getMainWindow?.()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  const result = new Promise<'continue' | 'cancel'>((resolve) => {
    const waiter: GateWaiter = {
      id: gateId,
      payload,
      notification: null,
      resolve: (action) => {
        if (active === waiter) active = null
        try {
          waiter.notification?.close()
        } catch {
          /* ignore */
        }
        broadcast('orders:humanGateClosed', { action, gateId })
        resolve(action)
      }
    }
    active = waiter
    waiter.notification = showWindowsNotification(payload, gateId)
    broadcast('orders:humanGate', { ...payload, gateId })
  })

  return { gateId, result }
}

/** Convenience for callers that only await the outcome (product scrapers). */
export async function waitForHumanGate(payload: HumanGatePayload): Promise<'continue' | 'cancel'> {
  return openHumanGate(payload).result
}

/**
 * Resolve the gate with the given id. Calls with a stale id (an already
 * resolved gate, or no gate at all) are no-ops and return false.
 */
export function resolveHumanGate(action: 'continue' | 'cancel', gateId: number): boolean {
  if (!active || active.id !== gateId) return false
  active.resolve(action)
  return true
}
