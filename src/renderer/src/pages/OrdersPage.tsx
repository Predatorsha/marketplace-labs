import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrderListItem } from '../../../shared/types'
import PixelMascot from '../components/PixelMascot'
import {
  IconBag,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
  IconSearch
} from '../components/icons'
import { pageItems, platformLabel } from '../lib/listUi'

const PAGE_SIZE = 6

type Props = {
  onStatus?: (message: string, kind?: 'ok' | 'error') => void
}

export default function OrdersPage({ onStatus }: Props): React.JSX.Element {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<OrderListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')
  const [noteKind, setNoteKind] = useState<'ok' | 'error'>('ok')
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const setStatus = useCallback((message: string, kind: 'ok' | 'error' = 'ok'): void => {
    setNote(message)
    setNoteKind(kind)
    onStatusRef.current?.(message, kind)
  }, [])

  const loadPage = useCallback(
    async (nextPage: number): Promise<void> => {
      if (!window.api?.listOrders) {
        setStatus('Error: app API is not loaded.', 'error')
        return
      }
      setLoading(true)
      try {
        const res = await window.api.listOrders({ page: nextPage, page_size: PAGE_SIZE })
        if (!res.ok) {
          setStatus(res.error || 'Could not load orders.', 'error')
          setItems([])
          setTotal(0)
          return
        }
        setItems(res.items || [])
        setTotal(res.total || 0)
        setPage(res.page || nextPage)
      } catch (exc) {
        setStatus(exc instanceof Error ? exc.message : String(exc), 'error')
      } finally {
        setLoading(false)
      }
    },
    [setStatus]
  )

  useEffect(() => {
    void loadPage(1)
  }, [loadPage])

  // Прогресс синка идёт событиями orders:progress — показываем его прямо на странице.
  useEffect(() => {
    if (!window.api?.onProgress) return undefined
    return window.api.onProgress((data) => {
      if (typeof data.message === 'string') {
        setNote(data.message)
        setNoteKind('ok')
      }
    })
  }, [])

  async function onSync(): Promise<void> {
    if (!window.api?.startOrderSync) {
      setStatus('Error: app API is not loaded.', 'error')
      return
    }
    setSyncing(true)
    setStatus('Starting order sync…')
    try {
      const res = await window.api.startOrderSync('temu')
      setStatus(res.message || (res.ok ? 'Sync finished.' : 'Sync failed.'), res.ok ? 'ok' : 'error')
      await loadPage(1)
    } catch (exc) {
      setStatus(exc instanceof Error ? exc.message : String(exc), 'error')
    } finally {
      setSyncing(false)
    }
  }

  function goToPage(next: number): void {
    const clamped = Math.min(totalPages, Math.max(1, next))
    if (clamped === page && items.length) return
    void loadPage(clamped)
  }

  return (
    <div className="catalog-page orders-page">
      <header className="catalog-header">
        <div className="orders-title-row">
          <h1 className="catalog-title">
            <IconBag size={20} />
            <span>Orders</span>
          </h1>
          <button
            type="button"
            className="btn-download orders-sync-btn"
            disabled={syncing}
            onClick={() => void onSync()}
          >
            <IconRefresh size={15} />
            <span>{syncing ? 'Syncing…' : 'Sync Orders'}</span>
          </button>
        </div>

        <div className="catalog-search-row" aria-hidden="true">
          <label className="url-field catalog-search-field">
            <IconSearch className="url-field-icon" size={16} />
            <input type="search" placeholder="Search orders..." disabled tabIndex={-1} />
          </label>
          <button type="button" className="btn-download" disabled tabIndex={-1}>
            <IconSearch size={15} />
            <span>Search</span>
          </button>
        </div>

        {note ? <div className={`orders-note${noteKind === 'error' ? ' error' : ''}`}>{note}</div> : null}
      </header>

      <div className="catalog-grid-wrap">
        {loading && !items.length ? (
          <div className="catalog-empty">Loading…</div>
        ) : !items.length ? (
          <div className="catalog-empty">No orders yet. Press “Sync Orders” to fetch them.</div>
        ) : (
          <div className="catalog-grid">
            {items.map((order) => {
              const thumbCount = Math.min(3, Math.max(order.items_count, order.item_covers.length))
              const hiddenItems = order.items_count - thumbCount
              return (
                <article key={order.id} className="catalog-card order-card">
                  <div className="order-card-number" title={order.order_id}>
                    Order # {order.order_id}
                  </div>
                  <div className="order-card-meta-row">
                    <span className="order-card-platform">{platformLabel(order.platform)}</span>
                    <span className="order-card-date">Ordered: {order.ordered_at || '—'}</span>
                  </div>
                  <div className="order-card-total-row">
                    <span className="order-card-total-label">Total</span>
                    <span className="order-card-total-price">{order.total || '—'}</span>
                  </div>
                  <div className="order-card-thumbs">
                    {Array.from({ length: thumbCount }, (_, i) => {
                      const src = order.item_covers[i]
                      const isLast = i === thumbCount - 1
                      return (
                        <span key={i} className="order-card-thumb">
                          {src ? (
                            <img src={src} alt="" />
                          ) : (
                            <span className="order-card-thumb-noimg">No photo</span>
                          )}
                          {isLast && hiddenItems > 0 ? (
                            <span className="order-card-thumb-more">+{hiddenItems}</span>
                          ) : null}
                        </span>
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <footer className="catalog-footer">
        <div className="catalog-pagination">
          <button
            type="button"
            className="catalog-page-btn"
            disabled={loading || page <= 1}
            onClick={() => goToPage(page - 1)}
            aria-label="Previous page"
          >
            <IconChevronLeft size={14} />
          </button>
          {pageItems(page, totalPages).map((entry, idx) =>
            entry === 'ellipsis' ? (
              <span key={`e-${idx}`} className="catalog-page-ellipsis">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                className={`catalog-page-btn${entry === page ? ' active' : ''}`}
                disabled={loading}
                onClick={() => goToPage(entry)}
              >
                {entry}
              </button>
            )
          )}
          <button
            type="button"
            className="catalog-page-btn"
            disabled={loading || page >= totalPages}
            onClick={() => goToPage(page + 1)}
            aria-label="Next page"
          >
            <IconChevronRight size={14} />
          </button>
        </div>

        <div className="catalog-total">
          <span>Total: {total} orders</span>
          <PixelMascot variant="face" size={28} />
        </div>
      </footer>
    </div>
  )
}
