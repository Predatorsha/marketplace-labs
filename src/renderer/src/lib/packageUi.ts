import type { PackageStatusKey } from '../../../shared/types'

/** Подписи канонических статусов посылки (как на макете). */
export const PACKAGE_STATUS_LABELS: Record<PackageStatusKey, string> = {
  processing: 'Processing',
  awaiting_shipment: 'Awaiting shipment',
  in_transit: 'In transit',
  customs: 'Customs',
  local_delivery: 'Local delivery',
  ready_for_pickup: 'Ready for pickup',
  delivered: 'Delivered',
  delivery_problem: 'Delivery problem',
  returning: 'Returning',
  returned: 'Returned',
  lost: 'Lost',
  unknown: 'Unknown'
}

export type PackageTone = 'green' | 'blue' | 'orange' | 'grey' | 'purple' | 'red'

/** Цвет бейджа/чипа по каноническому статусу (delivered на макете — фиолетовый). */
export function packageStatusTone(key: PackageStatusKey): PackageTone {
  switch (key) {
    case 'processing':
    case 'awaiting_shipment':
      return 'orange'
    case 'in_transit':
    case 'customs':
    case 'local_delivery':
      return 'blue'
    case 'ready_for_pickup':
      return 'green'
    case 'delivered':
      return 'purple'
    case 'delivery_problem':
    case 'lost':
      return 'red'
    default:
      return 'grey'
  }
}

/** Шаги таймлайна Shipment Progress (счастливый путь без проблемных статусов). */
export const PACKAGE_PROGRESS_STEPS: PackageStatusKey[] = [
  'processing',
  'awaiting_shipment',
  'in_transit',
  'customs',
  'local_delivery',
  'ready_for_pickup',
  'delivered'
]

/** "2026-08-11T14:32:00" → "Aug 11, 2026". Не-даты возвращаются как есть. */
export function formatPackageDate(iso: string | null | undefined): string | null {
  const raw = (iso || '').trim()
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
