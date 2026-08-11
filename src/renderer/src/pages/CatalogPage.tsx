import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CatalogListItem,
  ProductCard,
  ProductEditableFields
} from '../../../shared/types'
import ProductDetailPanels, { productCardToDetails } from '../components/ProductDetailPanels'
import PixelMascot from '../components/PixelMascot'
import StarRatingDisplay from '../components/StarRatingDisplay'
import {
  IconChevronLeft,
  IconChevronRight,
  IconFolder,
  IconHeart,
  IconSearch
} from '../components/icons'
import { pageItems, platformLabel } from '../lib/listUi'

const PAGE_SIZE = 8

type Props = {
  onStatus?: (message: string, kind?: 'ok' | 'error') => void
}

/** First choice price plus how many more are hidden behind it. */
function splitPrices(item: CatalogListItem): { first: string; more: number; all: string } {
  const all = (item.price || '').trim()
  if (!all) return { first: '—', more: 0, all: '' }
  const parts = all
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return { first: '—', more: 0, all: '' }
  return { first: parts[0], more: parts.length - 1, all }
}

/** Card heading: purpose + optional (Npcs). */
function formatCardHeading(item: CatalogListItem): string {
  const purpose = (item.purpose || '').trim() || '—'
  if (item.pack_quantity != null && item.pack_quantity > 0) {
    return `${purpose} (${item.pack_quantity}pcs)`
  }
  return purpose
}

export default function CatalogPage({ onStatus }: Props): React.JSX.Element {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CatalogListItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ProductCard | null>(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadPage = useCallback(async (nextPage: number): Promise<void> => {
    if (!window.api?.listProducts) {
      onStatusRef.current?.('Error: app API is not loaded.', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await window.api.listProducts({ page: nextPage, page_size: PAGE_SIZE })
      if (!res.ok) {
        onStatusRef.current?.(res.error || 'Could not load catalog.', 'error')
        setItems([])
        setTotal(0)
        return
      }
      setItems(res.items || [])
      setTotal(res.total || 0)
      setPage(res.page || nextPage)
    } catch (exc) {
      onStatusRef.current?.(exc instanceof Error ? exc.message : String(exc), 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPage(1)
  }, [loadPage])

  async function openProduct(item: CatalogListItem): Promise<void> {
    if (!window.api?.getProduct) return
    setDetailBusy(true)
    onStatus?.('Loading product…', 'ok')
    try {
      const res = await window.api.getProduct({
        platform: item.platform,
        product_id: item.product_id
      })
      if (!res.ok || !res.product) {
        onStatus?.(res.error || 'Could not open product.', 'error')
        return
      }
      setSelected(res.product)
      onStatus?.('', 'ok')
    } catch (exc) {
      onStatus?.(exc instanceof Error ? exc.message : String(exc), 'error')
    } finally {
      setDetailBusy(false)
    }
  }

  async function onOpenFolder(): Promise<void> {
    if (!selected?.folder || !window.api?.openPath) return
    const res = await window.api.openPath(selected.folder)
    if (!res.ok) onStatus?.(res.error || 'Could not open folder.', 'error')
  }

  async function onSaveDetails(patch: ProductEditableFields): Promise<boolean> {
    if (!selected || !window.api?.updateProduct) {
      onStatus?.('Cannot save: product is not loaded.', 'error')
      return false
    }
    setDetailBusy(true)
    onStatus?.('Saving…', 'ok')
    try {
      const res = await window.api.updateProduct(
        { platform: selected.platform, product_id: selected.product_id },
        patch
      )
      if (!res.ok || !res.product) {
        onStatus?.(res.error || 'Could not save product.', 'error')
        return false
      }
      setSelected(res.product)
      onStatus?.('Saved.', 'ok')
      return true
    } catch (exc) {
      onStatus?.(exc instanceof Error ? exc.message : String(exc), 'error')
      return false
    } finally {
      setDetailBusy(false)
    }
  }

  function goBack(): void {
    setSelected(null)
    void loadPage(page)
  }

  function goToPage(next: number): void {
    const clamped = Math.min(totalPages, Math.max(1, next))
    if (clamped === page && items.length) return
    void loadPage(clamped)
  }

  if (selected) {
    return (
      <div className="catalog-page catalog-detail">
        <header className="catalog-header">
          <button type="button" className="btn-ghost catalog-back" onClick={goBack}>
            ← Back
          </button>
          <h1 className="catalog-title">
            <IconFolder size={20} />
            <span>Catalog</span>
          </h1>
        </header>
        <ProductDetailPanels
          product={productCardToDetails(selected)}
          busy={detailBusy}
          onOpenFolder={() => void onOpenFolder()}
          onSaveDetails={onSaveDetails}
        />
      </div>
    )
  }

  return (
    <div className="catalog-page">
      <header className="catalog-header">
        <h1 className="catalog-title">
          <IconFolder size={20} />
          <span>Catalog</span>
        </h1>

        <div className="catalog-search-row" aria-hidden="true">
          <label className="url-field catalog-search-field">
            <IconSearch className="url-field-icon" size={16} />
            <input type="search" placeholder="Search products..." disabled tabIndex={-1} />
          </label>
          <button type="button" className="btn-download" disabled tabIndex={-1}>
            <IconSearch size={15} />
            <span>Search</span>
          </button>
        </div>
      </header>

      <div className="catalog-grid-wrap">
        {loading && !items.length ? (
          <div className="catalog-empty">Loading…</div>
        ) : !items.length ? (
          <div className="catalog-empty">No products in the catalog yet.</div>
        ) : (
          <div className="catalog-grid">
            {items.map((item) => (
              <button
                key={`${item.platform}:${item.product_id}`}
                type="button"
                className="catalog-card"
                disabled={detailBusy}
                onClick={() => void openProduct(item)}
              >
                <div className="catalog-card-title" title={formatCardHeading(item)}>
                  {formatCardHeading(item)}
                </div>
                <div className="catalog-card-image">
                  {item.cover_url ? (
                    <img src={item.cover_url} alt="" />
                  ) : (
                    <span className="catalog-card-noimg">No photo</span>
                  )}
                </div>
                <div className="catalog-card-rating-row">
                  <StarRatingDisplay
                    rating={item.rating}
                    reviewCount={item.review_count}
                    size="sm"
                  />
                </div>
                <div className="catalog-card-footer">
                  <div className="catalog-card-meta">
                    {(() => {
                      const { first, more, all } = splitPrices(item)
                      return (
                        <span className="catalog-card-price" title={more > 0 ? all : undefined}>
                          {first}
                          {more > 0 && (
                            <span className="catalog-card-price-more">
                              +{more} more price{more > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      )
                    })()}
                    <span className="catalog-card-platform">{platformLabel(item.platform)}</span>
                  </div>
                  <span className="catalog-card-heart" aria-hidden="true">
                    <IconHeart size={12} />
                  </span>
                </div>
              </button>
            ))}
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
          <span>Total: {total} items</span>
          <PixelMascot variant="face" size={28} />
        </div>
      </footer>
    </div>
  )
}
