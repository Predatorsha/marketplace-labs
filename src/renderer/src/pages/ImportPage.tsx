import { useEffect, useMemo, useState } from 'react'
import type { ProductChoiceItem, ProductDownloadResult, ProductEditableFields } from '../../../shared/types'
import ProductDetailPanels, {
  type ProductDetailsData
} from '../components/ProductDetailPanels'
import { IconDownload, IconPaperclip } from '../components/icons'

type Props = {
  productUrl: string
  onProductUrlChange: (value: string) => void
  onDownload: () => void
  onOpenFolder: () => void
  onSaveDetails: (patch: ProductEditableFields) => Promise<boolean>
  busy: boolean
  lastDownload: ProductDownloadResult | null
  status: string
  statusKind: 'ok' | 'error'
}

export default function ImportPage({
  productUrl,
  onProductUrlChange,
  onDownload,
  onOpenFolder,
  onSaveDetails,
  busy,
  lastDownload,
  status,
  statusKind
}: Props): React.JSX.Element {
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [choices, setChoices] = useState<ProductChoiceItem[]>([])
  const [price, setPrice] = useState<string | null>(null)
  const [rating, setRating] = useState<string | null>(null)
  const [reviewCount, setReviewCount] = useState<string | null>(null)

  useEffect(() => {
    if (!lastDownload?.ok || !lastDownload.platform || !lastDownload.product_id) {
      setImageUrls([])
      setChoices([])
      setPrice(lastDownload?.price ?? null)
      setRating(null)
      setReviewCount(null)
      return
    }
    let cancelled = false
    void window.api
      ?.getProduct({
        platform: lastDownload.platform,
        product_id: String(lastDownload.product_id)
      })
      .then((res) => {
        if (cancelled) return
        if (res.ok && res.product) {
          setImageUrls(res.product.image_urls || [])
          setChoices(res.product.choices || [])
          setPrice(res.product.price)
          setRating(res.product.rating)
          setReviewCount(res.product.review_count)
        } else {
          setImageUrls([])
          setChoices([])
          setPrice(lastDownload.price ?? null)
          setRating(null)
          setReviewCount(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImageUrls([])
          setChoices([])
          setPrice(lastDownload.price ?? null)
          setRating(null)
          setReviewCount(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [lastDownload])

  const product: ProductDetailsData | null = useMemo(() => {
    if (!lastDownload?.ok || !lastDownload.folder) return null
    return {
      platform: lastDownload.platform || null,
      product_id: lastDownload.product_id != null ? String(lastDownload.product_id) : null,
      folder: lastDownload.folder,
      title: lastDownload.title || null,
      url: lastDownload.url || null,
      purpose: lastDownload.purpose || null,
      pack_quantity: lastDownload.pack_quantity ?? null,
      price: price ?? lastDownload.price ?? null,
      rating,
      review_count: reviewCount,
      tags: Array.isArray(lastDownload.tags) ? lastDownload.tags : [],
      status: lastDownload.status || 'active',
      image_urls: imageUrls,
      choices
    }
  }, [lastDownload, imageUrls, choices, price, rating, reviewCount])

  return (
    <div className="import-page">
      <header className="import-header">
        <h1 className="import-title">
          <IconDownload size={22} />
          <span>Import Product</span>
        </h1>

        <div className="import-url-row">
          <label className="url-field">
            <IconPaperclip className="url-field-icon" size={16} />
            <input
              type="url"
              placeholder="Paste product URL..."
              value={productUrl}
              disabled={busy}
              onChange={(e) => onProductUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) onDownload()
              }}
            />
          </label>
          <button
            type="button"
            className="btn-download"
            disabled={busy || !productUrl.trim()}
            onClick={onDownload}
          >
            <IconDownload size={15} />
            <span>{busy ? 'Downloading…' : 'Download'}</span>
          </button>
        </div>

        {status ? (
          <div className={`import-status${statusKind === 'error' ? ' error' : ''}`} role="status">
            {status}
          </div>
        ) : null}
      </header>

      <ProductDetailPanels
        product={product}
        busy={busy}
        onOpenFolder={onOpenFolder}
        onSaveDetails={onSaveDetails}
      />
    </div>
  )
}
