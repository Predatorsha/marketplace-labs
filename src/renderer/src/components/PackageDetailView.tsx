import type { PackageDetail } from '../../../shared/types'
import {
  IconBag,
  IconChevronLeft,
  IconChevronRight,
  IconDoc,
  IconPackage,
  IconPencil
} from './icons'
import { platformLabel } from '../lib/listUi'
import {
  PACKAGE_PROGRESS_STEPS,
  PACKAGE_STATUS_LABELS,
  formatPackageDate,
  packageStatusTone
} from '../lib/packageUi'
import PackageStatusCat from './PackageStatusCat'

type Props = {
  pkg: PackageDetail
  onBack: () => void
}

/** Страница Package Details: сводка посылки, прогресс доставки, заказы и позиции. */
export default function PackageDetailView({ pkg, onBack }: Props): React.JSX.Element {
  const tone = packageStatusTone(pkg.status_key)
  const activeStep = PACKAGE_PROGRESS_STEPS.indexOf(pkg.status_key)

  return (
    <div className="catalog-page order-detail">
      <header className="catalog-header">
        <button type="button" className="btn-ghost catalog-back" onClick={onBack}>
          <IconChevronLeft size={13} />
          <span>Packages</span>
        </button>
        <div className="order-detail-title-row">
          <h1 className="catalog-title order-detail-title">
            <IconPackage size={20} />
            <span>Package Details</span>
          </h1>
          <button type="button" className="btn-download order-detail-edit" disabled tabIndex={-1}>
            <IconPencil size={14} />
            <span>Edit Package</span>
          </button>
        </div>
      </header>

      <div className="order-detail-scroll">
        <section className="order-detail-panel pkg-detail-summary">
          <div className="pkg-detail-main">
            <div className="order-detail-number">
              {pkg.label || `Package #${pkg.id}`}
            </div>
            <div className="order-detail-meta-row">
              <span className={`order-status-badge tone-${tone}`} title={pkg.status || undefined}>
                {PACKAGE_STATUS_LABELS[pkg.status_key]}
              </span>
              <span className="order-card-platform">{platformLabel(pkg.platform)}</span>
            </div>
            <div className="pkg-detail-tracking">
              <span className="pkg-detail-field-label">Tracking:</span>
              <span className="pkg-detail-field-value">{pkg.tracking_code || 'Not assigned yet'}</span>
            </div>
            {pkg.extra_tracking_codes.length ? (
              <div className="pkg-detail-tracking">
                <span className="pkg-detail-field-label">Also:</span>
                <span className="pkg-detail-field-value">{pkg.extra_tracking_codes.join(', ')}</span>
              </div>
            ) : null}
          </div>
          <div className="pkg-detail-side">
            <div className="pkg-detail-dates">
              <span>Created: {formatPackageDate(pkg.created_at) || '—'}</span>
              <span>Updated: {formatPackageDate(pkg.updated_at) || '—'}</span>
              <span>
                <IconPackage size={13} /> {pkg.items.length} items
              </span>
            </div>
            <PackageStatusCat status={pkg.status_key} size={56} className="pkg-detail-cat" />
          </div>
        </section>

        <section className="order-detail-panel">
          <h2 className="order-detail-section-title">
            <IconPackage size={17} />
            <span>Shipment Progress</span>
          </h2>
          <div className="pkg-progress">
            {PACKAGE_PROGRESS_STEPS.map((step, idx) => {
              const state =
                activeStep < 0 ? 'todo' : idx < activeStep ? 'done' : idx === activeStep ? 'current' : 'todo'
              return (
                <div key={step} className={`pkg-step ${state}`}>
                  {state === 'current' ? (
                    <PackageStatusCat status={pkg.status_key} size={20} className="pkg-step-cat" />
                  ) : null}
                  <span className="pkg-step-dot">
                    {state === 'done' ? '✓' : state === 'current' ? '➜' : ''}
                  </span>
                  <span className="pkg-step-label">{PACKAGE_STATUS_LABELS[step]}</span>
                </div>
              )
            })}
          </div>
          {activeStep < 0 ? (
            <div className="pkg-progress-offpath">
              Current status: {PACKAGE_STATUS_LABELS[pkg.status_key]}
              {pkg.status ? ` — “${pkg.status}”` : ''}
            </div>
          ) : null}
        </section>

        {pkg.orders.length ? (
          <section className="order-detail-panel">
            <h2 className="order-detail-section-title">
              <IconBag size={17} />
              <span>Orders ({pkg.orders.length})</span>
            </h2>
            <div className="order-detail-packages">
              {pkg.orders.map((order) => (
                <div key={order.id} className="order-package-chip tone-grey pkg-order-chip">
                  <IconBag size={18} />
                  <span className="order-package-chip-text">
                    <span className="order-package-chip-label" title={order.order_id}>
                      Order # {order.order_id}
                    </span>
                    <span className="order-package-chip-status">{platformLabel(order.platform)}</span>
                  </span>
                  <IconChevronRight size={13} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="order-detail-panel">
          <h2 className="order-detail-section-title">
            <IconDoc size={17} />
            <span>Items ({pkg.items.length})</span>
          </h2>
          {pkg.items.length ? (
            <div className="order-detail-items">
              {pkg.items.map((item) => (
                <div key={item.id} className="order-item-row">
                  <span className="order-item-thumb">
                    {item.cover_url ? (
                      <img src={item.cover_url} alt="" />
                    ) : (
                      <span className="order-card-thumb-noimg">No photo</span>
                    )}
                  </span>
                  <span className="order-item-info">
                    <span className="order-item-title" title={item.title || undefined}>
                      {item.title || '—'}
                    </span>
                    <span className="order-item-bottom">
                      <span className="order-item-qty">
                        {item.marketplace_product_id
                          ? `Goods ID: ${item.marketplace_product_id}`
                          : '—'}
                      </span>
                      <span className="order-item-qty">Qty {item.quantity}</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="pkg-empty-note">No items are linked to this package yet.</div>
          )}
        </section>
      </div>
    </div>
  )
}
