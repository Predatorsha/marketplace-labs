/**
 * Канонический статус посылки — под него навешиваются картинки котов
 * и шаги таймлайна на странице Package Details. Значения совпадают со
 * спрайтами из макета (processing … unknown).
 */
export type PackageStatusKey =
  | 'processing'
  | 'awaiting_shipment'
  | 'in_transit'
  | 'customs'
  | 'local_delivery'
  | 'ready_for_pickup'
  | 'delivered'
  | 'delivery_problem'
  | 'returning'
  | 'returned'
  | 'lost'
  | 'unknown'

/** Заказ, к которому привязана посылка (для карточки и деталей). */
export type PackageOrderRef = {
  id: number
  order_id: string
  platform: string
}

/** Карточка посылки в списке на странице Packages. */
export type PackageListItem = {
  id: number
  platform: string
  label: string | null
  /** Статус как пришёл с маркетплейса ("Delivered on Jun 14, 2026", …). */
  status: string | null
  /** Канонический статус, вычисленный из текста. */
  status_key: PackageStatusKey
  /** Основной трек-номер. */
  tracking_code: string | null
  /** Все трек-номера посылки (для поиска). */
  tracking_codes: string[]
  orders: PackageOrderRef[]
  items_count: number
  created_at: string | null
  updated_at: string | null
}

/** Позиция посылки на странице Package Details. */
export type PackageDetailItem = {
  id: number
  title: string | null
  quantity: number
  /** ID товара на маркетплейсе ("Goods ID" на макете). */
  marketplace_product_id: string | null
  /** Обложка товара как `ml-media://…`, null — товара нет или нет фото. */
  cover_url: string | null
}

/** Полная посылка для страницы Package Details. */
export type PackageDetail = {
  id: number
  platform: string
  label: string | null
  status: string | null
  status_key: PackageStatusKey
  tracking_code: string | null
  /** Дополнительные трек-номера (role != 'primary'). */
  extra_tracking_codes: string[]
  created_at: string | null
  updated_at: string | null
  orders: PackageOrderRef[]
  items: PackageDetailItem[]
}

export type PackageListResult = {
  ok: boolean
  items?: PackageListItem[]
  total?: number
  error?: string
}

export type PackageGetResult = {
  ok: boolean
  package?: PackageDetail
  error?: string
}
