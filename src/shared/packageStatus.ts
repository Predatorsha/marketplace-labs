import type { PackageStatusKey } from './types/packages'

/** Порядок статусов для чипов-фильтров и сортировок (как в спрайтах макета). */
export const PACKAGE_STATUS_ORDER: PackageStatusKey[] = [
  'processing',
  'awaiting_shipment',
  'in_transit',
  'customs',
  'local_delivery',
  'ready_for_pickup',
  'delivered',
  'delivery_problem',
  'returning',
  'returned',
  'lost',
  'unknown'
]

/**
 * Канонический статус из свободного текста маркетплейса ("Delivered on
 * Jun 14, 2026", "In transit", "Out for delivery", …). Порядок проверок
 * важен: сначала терминальные и проблемные, потом этапы доставки.
 */
export function normalizePackageStatus(status: string | null | undefined): PackageStatusKey {
  const s = (status || '').trim().toLowerCase()
  if (!s) return 'unknown'

  if (/\b(lost|missing)\b/.test(s)) return 'lost'
  if (/\breturned\b/.test(s)) return 'returned'
  if (/\breturn/.test(s)) return 'returning'
  if (
    /(problem|failed|failure|unable|couldn'?t deliver|not delivered|undeliverable|unsuccessful|exception|refused|damaged|cancel)/.test(
      s
    )
  ) {
    return 'delivery_problem'
  }
  if (/\bdelivered\b/.test(s)) return 'delivered'
  if (/(customs|clearance)/.test(s)) return 'customs'
  if (/(ready for pickup|pickup point|pick-?up station|awaiting collection|ready to collect)/.test(s)) {
    return 'ready_for_pickup'
  }
  if (/(out for delivery|local courier|local delivery|last mile)/.test(s)) return 'local_delivery'
  if (/(in transit|transit|on (the|its) way|shipped|departed|arrived|en route|picked up)/.test(s)) {
    return 'in_transit'
  }
  if (
    /(awaiting shipment|awaiting carrier|to be shipped|preparing|not yet shipped|label created|waiting for (carrier )?pickup)/.test(
      s
    )
  ) {
    return 'awaiting_shipment'
  }
  if (/(processing|order (placed|received|confirmed)|confirmed|packaging)/.test(s)) {
    return 'processing'
  }
  return 'unknown'
}
