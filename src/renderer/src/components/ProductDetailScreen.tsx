import { useState } from 'react'
import type { ProductCard, ProductEditableFields } from '../../../shared/types'
import ProductDetailPanels, { productCardToDetails } from './ProductDetailPanels'

type Props = {
  product: ProductCard
  /** Текст кнопки возврата, например "Back" или "Order Details". */
  backLabel: string
  heading: React.ReactNode
  onBack: () => void
  onStatus?: (message: string, kind?: 'ok' | 'error') => void
}

/** Экран карточки товара: шапка с возвратом + панели деталей. Общий для каталога и заказов. */
export default function ProductDetailScreen({
  product: initial,
  backLabel,
  heading,
  onBack,
  onStatus
}: Props): React.JSX.Element {
  const [product, setProduct] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function onOpenFolder(): Promise<void> {
    if (!product.folder || !window.api?.openPath) return
    const res = await window.api.openPath(product.folder)
    if (!res.ok) onStatus?.(res.error || 'Could not open folder.', 'error')
  }

  async function onSaveDetails(patch: ProductEditableFields): Promise<boolean> {
    if (!window.api?.updateProduct) {
      onStatus?.('Cannot save: app API is not loaded.', 'error')
      return false
    }
    setBusy(true)
    onStatus?.('Saving…', 'ok')
    try {
      const res = await window.api.updateProduct(
        { platform: product.platform, product_id: product.product_id },
        patch
      )
      if (!res.ok || !res.product) {
        onStatus?.(res.error || 'Could not save product.', 'error')
        return false
      }
      setProduct(res.product)
      onStatus?.('Saved.', 'ok')
      return true
    } catch (exc) {
      onStatus?.(exc instanceof Error ? exc.message : String(exc), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="catalog-page catalog-detail">
      <header className="catalog-header">
        <button type="button" className="btn-ghost catalog-back" onClick={onBack}>
          ← {backLabel}
        </button>
        <h1 className="catalog-title">{heading}</h1>
      </header>
      <ProductDetailPanels
        product={productCardToDetails(product)}
        busy={busy}
        onOpenFolder={() => void onOpenFolder()}
        onSaveDetails={onSaveDetails}
      />
    </div>
  )
}
