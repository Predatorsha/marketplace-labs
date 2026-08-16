import { useCallback, useEffect, useRef, useState } from 'react'

/** Форма ответа списочных IPC (orders:list, products:list). */
export type PagedResult<T> = {
  ok: boolean
  items?: T[]
  total?: number
  page?: number
  error?: string
}

export type PagedList<T> = {
  page: number
  items: T[]
  total: number
  totalPages: number
  loading: boolean
  loadPage: (page: number) => Promise<void>
  goToPage: (page: number) => void
}

/**
 * Стейт-машина постраничного списка (Catalog, Orders): page/items/total/loading,
 * общий разбор ok/error и кламп goToPage. Первая страница грузится сама.
 * `fetchPage` должен быть стабильным (useCallback на странице).
 */
export function usePagedList<T>(opts: {
  pageSize: number
  fetchPage: (page: number, pageSize: number) => Promise<PagedResult<T>>
  /** Текст ошибки, когда IPC вернул !ok без error. */
  fallbackError: string
  onError: (message: string) => void
}): PagedList<T> {
  const { pageSize, fetchPage, fallbackError } = opts
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const onErrorRef = useRef(opts.onError)
  onErrorRef.current = opts.onError
  // Защита от гонки: два быстрых loadPage (клик страницы + Back из деталки) —
  // устаревший ответ не должен затирать более поздний.
  const genRef = useRef(0)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const loadPage = useCallback(
    async (nextPage: number): Promise<void> => {
      const gen = ++genRef.current
      setLoading(true)
      try {
        const res = await fetchPage(nextPage, pageSize)
        if (gen !== genRef.current) return
        if (!res.ok) {
          onErrorRef.current(res.error || fallbackError)
          setItems([])
          setTotal(0)
          return
        }
        setItems(res.items || [])
        setTotal(res.total || 0)
        setPage(res.page || nextPage)
      } catch (exc) {
        if (gen !== genRef.current) return
        onErrorRef.current(exc instanceof Error ? exc.message : String(exc))
      } finally {
        if (gen === genRef.current) setLoading(false)
      }
    },
    [fetchPage, pageSize, fallbackError]
  )

  useEffect(() => {
    void loadPage(1)
  }, [loadPage])

  function goToPage(next: number): void {
    const clamped = Math.min(totalPages, Math.max(1, next))
    if (clamped === page && items.length) return
    void loadPage(clamped)
  }

  return { page, items, total, totalPages, loading, loadPage, goToPage }
}
