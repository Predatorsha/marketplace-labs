import { useEffect, useState } from 'react'
import type { ProductChoiceItem, ProductEditableFields, ProductStatus } from '../../../shared/types'
import PixelMascot from './PixelMascot'
import StarRatingDisplay from './StarRatingDisplay'
import { IconImage, IconHeart } from './icons'

export type ProductDetailsData = {
  platform: string | null
  product_id: string | null
  folder: string
  title: string | null
  url: string | null
  purpose: string | null
  pack_quantity: number | null
  price: string | null
  rating: string | null
  review_count: string | null
  tags: string[]
  status: string | null
  image_urls: string[]
  choices?: ProductChoiceItem[]
  archived_photo_sets?: number
}

type Props = {
  product: ProductDetailsData | null
  emptyInfoText?: string
  busy?: boolean
  onOpenFolder: () => void
  onSaveDetails: (patch: ProductEditableFields) => Promise<boolean>
}

type Draft = {
  title: string
  purpose: string
  pack_quantity: string
  status: ProductStatus
  tags: string
  folder: string
}

const EMPTY_FIELDS = [
  'Title',
  'Platform',
  'Purpose',
  'Pack quantity',
  'Price',
  'Status',
  'Tags',
  'Folder path',
  'URL'
] as const

type FieldLabel = (typeof EMPTY_FIELDS)[number]

const EDITABLE = new Set<FieldLabel>([
  'Title',
  'Purpose',
  'Pack quantity',
  'Status',
  'Tags',
  'Folder path'
])

function fieldValue(label: FieldLabel, product: ProductDetailsData | null): string {
  if (!product) return ''
  switch (label) {
    case 'Title':
      return product.title || ''
    case 'Platform':
      return product.platform || ''
    case 'Purpose':
      return product.purpose || ''
    case 'Pack quantity':
      return product.pack_quantity != null ? String(product.pack_quantity) : ''
    case 'Price':
      return product.price || ''
    case 'Status':
      return product.status || 'active'
    case 'Tags':
      return Array.isArray(product.tags) && product.tags.length ? product.tags.join(', ') : ''
    case 'Folder path':
      return product.folder || ''
    case 'URL':
      return product.url || ''
    default:
      return ''
  }
}

function draftFromProduct(product: ProductDetailsData): Draft {
  return {
    title: product.title || '',
    purpose: product.purpose || '',
    pack_quantity: product.pack_quantity != null ? String(product.pack_quantity) : '1',
    status: (product.status === 'archived' ? 'archived' : 'active') as ProductStatus,
    tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
    folder: product.folder || ''
  }
}

function draftValue(label: FieldLabel, draft: Draft, product: ProductDetailsData | null): string {
  switch (label) {
    case 'Title':
      return draft.title
    case 'Purpose':
      return draft.purpose
    case 'Pack quantity':
      return draft.pack_quantity
    case 'Status':
      return draft.status
    case 'Tags':
      return draft.tags
    case 'Folder path':
      return draft.folder
    default:
      return fieldValue(label, product)
  }
}

export default function ProductDetailPanels({
  product,
  emptyInfoText = 'Product details will appear here after import.',
  busy = false,
  onOpenFolder,
  onSaveDetails
}: Props): React.JSX.Element {
  const hasProduct = Boolean(product?.folder)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [choiceIndex, setChoiceIndex] = useState<number | null>(null)

  const imageUrls = product?.image_urls || []
  const choices = product?.choices || []

  useEffect(() => {
    setEditing(false)
    setDraft(null)
    setPreviewIndex(0)
    setChoiceIndex(null)
  }, [product?.folder, product?.product_id])

  useEffect(() => {
    if (previewIndex >= imageUrls.length) setPreviewIndex(0)
  }, [imageUrls.length, previewIndex])

  function startEdit(): void {
    if (!product) return
    setDraft(draftFromProduct(product))
    setEditing(true)
  }

  function cancelEdit(): void {
    setEditing(false)
    setDraft(null)
  }

  async function saveEdit(): Promise<void> {
    if (!draft || !product) return
    const packRaw = draft.pack_quantity.trim()
    const pack_quantity = packRaw === '' ? null : Number(packRaw)
    if (packRaw !== '' && !Number.isFinite(pack_quantity)) return

    const tags = draft.tags
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean)

    const folder = draft.folder.trim()
    if (!folder) return

    const patch: ProductEditableFields = {
      title: draft.title.trim() || null,
      purpose: draft.purpose.trim() || null,
      pack_quantity,
      status: draft.status,
      tags,
      folder_path: folder
    }

    setSaving(true)
    try {
      const ok = await onSaveDetails(patch)
      if (ok) {
        setEditing(false)
        setDraft(null)
      }
    } finally {
      setSaving(false)
    }
  }

  function setDraftField<K extends keyof Draft>(key: K, value: Draft[K]): void {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const activeImage =
    choiceIndex != null && choices[choiceIndex]?.url
      ? choices[choiceIndex].url
      : imageUrls[previewIndex] || null

  return (
    <div className="import-panels">
      <section className="panel panel-info" aria-labelledby="product-info-title">
        <div className="panel-frame">
          <h2 id="product-info-title" className="panel-title">
            <span>Product Information</span>
          </h2>

          {!hasProduct ? <div className="info-placeholder">{emptyInfoText}</div> : null}

          {hasProduct && product?.rating ? (
            <div className="info-rating-row">
              <StarRatingDisplay
                rating={product.rating}
                reviewCount={product.review_count}
                size="md"
              />
            </div>
          ) : null}

          {hasProduct && (product?.archived_photo_sets ?? 0) > 0 ? (
            <p className="info-archived-photos">
              Archived photos: {product?.archived_photo_sets} sets
            </p>
          ) : null}

          <dl className={`info-fields${editing ? ' editing' : ''}`}>
            {EMPTY_FIELDS.map((label) => {
              const value =
                editing && draft ? draftValue(label, draft, product) : fieldValue(label, product)
              const canEdit = editing && EDITABLE.has(label) && draft

              return (
                <div key={label} className="info-row">
                  <dt>{label}</dt>
                  <dd className={value || canEdit ? 'filled' : ''}>
                    {canEdit && label === 'Status' ? (
                      <select
                        className="info-input"
                        value={draft.status}
                        disabled={saving}
                        onChange={(e) =>
                          setDraftField('status', e.target.value as ProductStatus)
                        }
                      >
                        <option value="active">active</option>
                        <option value="archived">archived</option>
                      </select>
                    ) : canEdit && label === 'Title' ? (
                      <input
                        className="info-input"
                        value={draft.title}
                        disabled={saving}
                        onChange={(e) => setDraftField('title', e.target.value)}
                      />
                    ) : canEdit && label === 'Purpose' ? (
                      <input
                        className="info-input"
                        value={draft.purpose}
                        disabled={saving}
                        onChange={(e) => setDraftField('purpose', e.target.value)}
                      />
                    ) : canEdit && label === 'Pack quantity' ? (
                      <input
                        className="info-input"
                        type="number"
                        min={1}
                        step={1}
                        value={draft.pack_quantity}
                        disabled={saving}
                        onChange={(e) => setDraftField('pack_quantity', e.target.value)}
                      />
                    ) : canEdit && label === 'Tags' ? (
                      <input
                        className="info-input"
                        value={draft.tags}
                        disabled={saving}
                        placeholder="tag1, tag2, tag3"
                        onChange={(e) => setDraftField('tags', e.target.value)}
                      />
                    ) : canEdit && label === 'Folder path' ? (
                      <input
                        className="info-input"
                        value={draft.folder}
                        disabled={saving}
                        placeholder="K:\\Cursor\\marketplace-labs\\data\\aliexpress\\..."
                        onChange={(e) => setDraftField('folder', e.target.value)}
                      />
                    ) : (
                      value || '\u00a0'
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>

          <div className="panel-actions">
            <button
              type="button"
              className="btn-ghost"
              disabled={!hasProduct || editing}
              onClick={onOpenFolder}
            >
              Open folder
            </button>
            {editing ? (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={saving}
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-save"
                  disabled={saving}
                  onClick={() => void saveEdit()}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn-ghost"
                disabled={!hasProduct || busy}
                onClick={startEdit}
              >
                Edit details
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="panel panel-preview" aria-labelledby="image-preview-title">
        <div className="panel-frame">
          <h2 id="image-preview-title" className="panel-title">
            <IconImage size={15} />
            <span>Image Preview</span>
          </h2>

          <div className={`preview-stage${activeImage ? ' has-image' : ''}`}>
            {activeImage ? (
              <>
                <img className="preview-photo" src={activeImage} alt="" />
                {imageUrls.length > 1 ? (
                  <div className="preview-thumbs" role="list">
                    {imageUrls.map((url, idx) => (
                      <button
                        key={`${url}-${idx}`}
                        type="button"
                        className={`preview-thumb${idx === previewIndex ? ' active' : ''}`}
                        onClick={() => {
                          setChoiceIndex(null)
                          setPreviewIndex(idx)
                        }}
                        aria-label={`Image ${idx + 1}`}
                      >
                        <img src={url} alt="" />
                      </button>
                    ))}
                  </div>
                ) : null}
                {choices.length ? (
                  <div className="preview-thumbs preview-choices" role="list">
                    {choices.map((choice, idx) => (
                      <button
                        key={`${choice.file}-${idx}`}
                        type="button"
                        className={`preview-thumb${choiceIndex === idx ? ' active' : ''}`}
                        onClick={() => setChoiceIndex(idx)}
                        aria-label={choice.name || `Choice ${idx + 1}`}
                        title={`${choice.name || 'Choice'}: ${choice.price}`}
                      >
                        {choice.url ? (
                          <img src={choice.url} alt="" />
                        ) : (
                          <span className="preview-thumb-label">{choice.price}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="polaroid-stack" aria-hidden="true">
                  <div className="polaroid p1">
                    <span className="tape t-tl" />
                    <span className="tape t-tr" />
                  </div>
                  <div className="polaroid p2">
                    <span className="tape t-tl" />
                  </div>
                  <div className="polaroid p3">
                    <span className="tape t-tr" />
                  </div>
                  <div className="polaroid p4">
                    <span className="tape t-tl" />
                    <span className="tape t-br" />
                  </div>
                </div>
                <div className="preview-empty-msg">
                  No images yet. Imported photos will appear here.
                </div>
              </>
            )}

            <div className="preview-mascot">
              <span className="preview-mascot-bubble" aria-hidden="true">
                <IconHeart size={12} />
              </span>
              <PixelMascot variant="standing" size={68} />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export function productCardToDetails(product: {
  platform: string
  product_id: string
  folder: string
  title: string | null
  url: string | null
  purpose: string | null
  pack_quantity: number | null
  price?: string | null
  rating?: string | null
  review_count?: string | null
  tags: string[]
  status: string
  image_urls?: string[]
  choices?: ProductChoiceItem[]
  archived_photo_sets?: number
}): ProductDetailsData {
  return {
    platform: product.platform,
    product_id: product.product_id,
    folder: product.folder,
    title: product.title,
    url: product.url,
    purpose: product.purpose,
    pack_quantity: product.pack_quantity,
    price: product.price ?? null,
    rating: product.rating ?? null,
    review_count: product.review_count ?? null,
    tags: product.tags || [],
    status: product.status,
    image_urls: product.image_urls || [],
    choices: product.choices || [],
    archived_photo_sets: product.archived_photo_sets ?? 0
  }
}
