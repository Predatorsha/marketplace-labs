import type { PlatformId } from './humanGate'

/** Заказ, найденный в списке заказов маркетплейса (ещё не скачанный целиком). */
export type OrderSyncOrder = {
  marketplace_order_id: string
  /** Статус как на странице списка, например "Delivered on Jun 14, 2026". */
  status: string | null
  /** ISO-дата оформления заказа (YYYY-MM-DD), null если не распарсилась. */
  ordered_at: string | null
  items_count: number | null
  /** Сумма заказа как текст со страницы, например "219,46 €". */
  total: string | null
}

/** Результат прохода по списку заказов: что качать, что обновили, что пропустили. */
export type OrderSyncPlan = {
  platform: PlatformId
  /** Сколько карточек заказов увидели в списке всего. */
  discovered: number
  /** Заказы, которых нет в БД — их нужно скачать (следующая итерация). */
  to_download: OrderSyncOrder[]
  /** Известные заказы, у которых сменился статус — статус обновлён в БД. */
  status_updated: OrderSyncOrder[]
  /** Известные заказы с терминальным статусом в БД — не трогаем. */
  skipped_final: number
  /** Известные заказы, статус не изменился. */
  skipped_unchanged: number
  /** true — домотали до конца списка (кнопки "View more" больше нет). */
  reached_end: boolean
  /** Заказы из to_download, успешно скачанные и записанные в БД. */
  orders_synced: number
  /** Заказы из to_download, которые скачать не удалось (повторятся в следующем прогоне). */
  orders_failed: number
  /** Карточек товаров скачано (новых, у которых ещё не было папки). */
  products_scraped: number
  products_failed: number
  /** Известные заказы, у которых обновили посылки/треки со страницы Track order. */
  packages_refreshed: number
}

/** Карточка заказа в списке на странице Orders. */
export type OrderListItem = {
  id: number
  platform: string
  /** Номер заказа на маркетплейсе. */
  order_id: string
  /** Статус как на маркетплейсе, например "Delivered on Jun 14, 2026". */
  status: string | null
  /** ISO-дата оформления (YYYY-MM-DD). */
  ordered_at: string | null
  /**
   * Сумма позиций для отображения (например "€23.15").
   * null — цены позиций не распарсились или в заказе смешаны валюты.
   */
  total: string | null
  items_count: number
  /** Обложки товаров позиций как `ml-media://…`, максимум 3. */
  item_covers: string[]
}

/** Позиция заказа на странице деталей. */
export type OrderDetailItem = {
  id: number
  /** Название товара: order_items.title, фолбэк — products.title. */
  title: string | null
  quantity: number
  /**
   * Цена позиции строкой (например "€18.40"), уже умноженная на количество.
   * null — цена не распарсилась при синке.
   */
  price: string | null
  is_gift: boolean
  /** Обложка товара как `ml-media://…`, null — товара нет или нет фото. */
  cover_url: string | null
  /** Маркетплейсовый id товара — ключ getProduct (платформа берётся из заказа), null если товара нет в каталоге. */
  product_id: string | null
}

/** Посылка заказа на странице деталей. */
export type OrderDetailPackage = {
  id: number
  label: string | null
  status: string | null
  tracking_code: string | null
}

/** Полный заказ для страницы Order Details. */
export type OrderDetail = {
  id: number
  platform: string
  order_id: string
  status: string | null
  ordered_at: string | null
  total: string | null
  items: OrderDetailItem[]
  packages: OrderDetailPackage[]
}

export type OrderGetResult = {
  ok: boolean
  order?: OrderDetail
  error?: string
}

export type OrderListQuery = {
  page?: number
  page_size?: number
}

export type OrderListResult = {
  ok: boolean
  items?: OrderListItem[]
  total?: number
  page?: number
  page_size?: number
  error?: string
}

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
      plan?: OrderSyncPlan
      error?: string
    }
