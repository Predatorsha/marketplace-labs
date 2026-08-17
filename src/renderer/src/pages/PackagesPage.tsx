import { useEffect, useMemo, useRef, useState } from 'react'
import type { PackageDetail, PackageListItem, PackageStatusKey } from '../../../shared/types'
import { PACKAGE_STATUS_ORDER } from '../../../shared/packageStatus'
import PackageDetailView from '../components/PackageDetailView'
import PackageStatusCat from '../components/PackageStatusCat'
import { IconChevronRight, IconDoc, IconPackage, IconSearch } from '../components/icons'
import { platformLabel } from '../lib/listUi'
import {
  PACKAGE_STATUS_LABELS,
  formatPackageDate,
  packageStatusTone
} from '../lib/packageUi'

type Props = {
  onStatus?: (message: string, kind?: 'ok' | 'error') => void
}

type Filter = PackageStatusKey | 'all'

/** Поиск: по подписи, всем трек-номерам и номерам связанных заказов. */
function matchesQuery(item: PackageListItem, query: string): boolean {
  if (!query) return true
  const haystack = [
    item.label || `Package #${item.id}`,
    ...item.tracking_codes,
    item.tracking_code || '',
    ...item.orders.map((o) => o.order_id)
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(query)
}

export default function PackagesPage({ onStatus }: Props): React.JSX.Element {
  const [items, setItems] = useState<PackageListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<PackageDetail | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  function fail(message: string): void {
    setNote(message)
    onStatusRef.current?.(message, 'error')
  }

  async function loadPackages(): Promise<void> {
    if (!window.api?.listPackages) {
      fail('Error: app API is not loaded.')
      return
    }
    setLoading(true)
    try {
      const res = await window.api.listPackages()
      if (!res.ok) {
        fail(res.error || 'Could not load packages.')
        setItems([])
        return
      }
      setNote('')
      setItems(res.items || [])
    } catch (exc) {
      fail(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setLoading(false)
    }
  }

  // Грузим один раз при открытии страницы.
  useEffect(() => {
    void loadPackages()
  }, [])

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => matchesQuery(item, q))
  }, [items, query])

  const counts = useMemo(() => {
    const map = new Map<PackageStatusKey, number>()
    for (const item of searched) {
      map.set(item.status_key, (map.get(item.status_key) || 0) + 1)
    }
    return map
  }, [searched])

  const visible = filter === 'all' ? searched : searched.filter((i) => i.status_key === filter)

  async function openPackage(item: PackageListItem): Promise<void> {
    if (!window.api?.getPackage) {
      fail('Error: app API is not loaded.')
      return
    }
    setDetailBusy(true)
    try {
      const res = await window.api.getPackage(item.id)
      if (!res.ok || !res.package) {
        fail(res.error || 'Could not open package.')
        return
      }
      setSelected(res.package)
    } catch (exc) {
      fail(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setDetailBusy(false)
    }
  }

  function goBack(): void {
    setSelected(null)
    void loadPackages()
  }

  if (selected) {
    return <PackageDetailView pkg={selected} onBack={goBack} />
  }

  const listTitle = filter === 'all' ? 'All Packages' : PACKAGE_STATUS_LABELS[filter]

  return (
    <div className="catalog-page packages-page">
      <header className="catalog-header">
        <h1 className="catalog-title">
          <IconPackage size={20} />
          <span>Packages</span>
        </h1>

        <form
          className="catalog-search-row"
          onSubmit={(e) => {
            e.preventDefault()
          }}
        >
          <label className="url-field catalog-search-field">
            <IconSearch className="url-field-icon" size={16} />
            <input
              type="search"
              placeholder="Search by package, order or tracking number..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-download">
            <IconSearch size={15} />
            <span>Search</span>
          </button>
        </form>

        <div className="pkg-filter-row">
          <button
            type="button"
            className={`pkg-chip tone-pink${filter === 'all' ? ' active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <b>{searched.length}</b>
          </button>
          {PACKAGE_STATUS_ORDER.filter((key) => (counts.get(key) || 0) > 0).map((key) => (
            <button
              key={key}
              type="button"
              className={`pkg-chip tone-${packageStatusTone(key)}${filter === key ? ' active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {PACKAGE_STATUS_LABELS[key]} <b>{counts.get(key)}</b>
            </button>
          ))}
        </div>

        {note ? <div className="orders-note error">{note}</div> : null}
      </header>

      <section className="order-detail-panel pkg-list-panel">
        <h2 className="order-detail-section-title">
          <IconDoc size={17} />
          <span>
            {listTitle} ({visible.length})
          </span>
        </h2>
        <div className="pkg-list-scroll">
          {loading && !items.length ? (
            <div className="catalog-empty">Loading…</div>
          ) : !visible.length ? (
            <div className="catalog-empty">
              {items.length
                ? 'No packages match the current search or filter.'
                : 'No packages yet. They appear after an order sync.'}
            </div>
          ) : (
            <div className="pkg-grid">
              {visible.map((item) => {
                const tone = packageStatusTone(item.status_key)
                const firstOrder = item.orders[0]
                const updated = formatPackageDate(item.updated_at)
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`pkg-card tone-${tone}`}
                    disabled={detailBusy}
                    onClick={() => void openPackage(item)}
                  >
                    <span className="pkg-card-head">
                      <span className="pkg-card-title">{item.label || `Package #${item.id}`}</span>
                      <span
                        className={`order-status-badge tone-${tone}`}
                        title={item.status || undefined}
                      >
                        {PACKAGE_STATUS_LABELS[item.status_key]}
                      </span>
                    </span>
                    <span className="pkg-card-line">
                      {firstOrder ? (
                        <>
                          Order <span className="pkg-card-order">{firstOrder.order_id}</span>
                          {item.orders.length > 1 ? ` +${item.orders.length - 1}` : ''}
                          {' · '}
                          {platformLabel(firstOrder.platform)}
                        </>
                      ) : (
                        platformLabel(item.platform)
                      )}
                    </span>
                    <span className="pkg-card-line">
                      Tracking: {item.tracking_code || 'Not assigned yet'}
                    </span>
                    <span className="pkg-card-bottom">
                      <span className="pkg-card-line">
                        {item.items_count} items{updated ? ` · Updated ${updated}` : ''}
                      </span>
                      <span className="pkg-card-side">
                        <PackageStatusCat status={item.status_key} size={40} />
                        <IconChevronRight size={14} />
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
