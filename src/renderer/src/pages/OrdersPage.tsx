import { useCallback, useEffect, useRef, useState } from 'react'
import type { OrderDetail, OrderListItem, OrderListResult } from '../../../shared/types'
import ListSearchStub from '../components/ListSearchStub'
import OrderDetailView from '../components/OrderDetailView'
import PaginationBar from '../components/PaginationBar'
import PixelMascot from '../components/PixelMascot'
import { IconBag, IconRefresh } from '../components/icons'
import { platformLabel } from '../lib/listUi'
import { usePagedList } from '../lib/usePagedList'

const PAGE_SIZE = 6

type Props = {
  onStatus?: (message: string, kind?: 'ok' | 'error') => void
}

export default function OrdersPage({ onStatus }: Props): React.JSX.Element {
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<OrderDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteKind, setNoteKind] = useState<'ok' | 'error'>('ok')
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  const setStatus = useCallback((message: string, kind: 'ok' | 'error' = 'ok'): void => {
    setNote(message)
    setNoteKind(kind)
    onStatusRef.current?.(message, kind)
  }, [])

  const fetchPage = useCallback(
    (nextPage: number, pageSize: number): Promise<OrderListResult> => {
      if (!window.api?.listOrders) throw new Error('Error: app API is not loaded.')
      return window.api.listOrders({ page: nextPage, page_size: pageSize })
    },
    []
  )
  const { page, items, total, totalPages, loading, loadPage, goToPage } =
    usePagedList<OrderListItem>({
      pageSize: PAGE_SIZE,
      fetchPage,
      fallbackError: 'Could not load orders.',
      onError: (message) => setStatus(message, 'error')
    })

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

  async function openOrder(item: OrderListItem): Promise<void> {
    if (!window.api?.getOrder) {
      setStatus('Error: app API is not loaded.', 'error')
      return
    }
    setDetailBusy(true)
    try {
      const res = await window.api.getOrder(item.id)
      if (!res.ok || !res.order) {
        setStatus(res.error || 'Could not open order.', 'error')
        return
      }
      setSelected(res.order)
    } catch (exc) {
      setStatus(exc instanceof Error ? exc.message : String(exc), 'error')
    } finally {
      setDetailBusy(false)
    }
  }

  function goBack(): void {
    setSelected(null)
    void loadPage(page)
  }

  if (selected) {
    return <OrderDetailView order={selected} onBack={goBack} />
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

        <ListSearchStub placeholder="Search orders..." />

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
                <button
                  key={order.id}
                  type="button"
                  className="catalog-card order-card"
                  disabled={detailBusy}
                  onClick={() => void openOrder(order)}
                >
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
                </button>
              )
            })}
          </div>
        )}
      </div>

      <footer className="catalog-footer">
        <PaginationBar page={page} totalPages={totalPages} loading={loading} onPage={goToPage} />

        <div className="catalog-total">
          <span>Total: {total} orders</span>
          <PixelMascot variant="face" size={28} />
        </div>
      </footer>
    </div>
  )
}
