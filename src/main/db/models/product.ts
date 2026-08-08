export type ProductChoiceRow = {
  rel_path: string
  name: string | null
  group_name: string | null
  price: string
  sort_order?: number
}

export type ProductImageRow = {
  rel_path: string
  sort_order?: number
}

export type ProductSpecRow = {
  key: string
  value: string | null
  sort_order?: number
}
