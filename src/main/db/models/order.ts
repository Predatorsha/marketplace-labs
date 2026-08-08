export type OrderItemPayload = {
  marketplace_product_id?: string | null
  product_id?: string | null
  marketplace_item_id?: string | null
  item_id?: string | null
  source_line_key?: string | null
  line_number?: number | null
  title?: string | null
  quantity?: number | null
  unit_price?: number | null
  currency?: string | null
  price?: string | number | null
  sku?: string | null
  url?: string | null
}

export type PackagePayload = {
  track?: string | null
  tracking_code?: string | null
  package?: string | null
  label?: string | null
  status?: string | null
  extra_tracks?: string[] | null
  tracks?: string[] | null
}

export type OrderPayload = {
  order_id?: string | null
  marketplace_order_id?: string | null
  status?: string | null
  ordered_at?: string | null
  items?: OrderItemPayload[] | null
  packages?: PackagePayload[] | null
}
