import type { OrderDetail } from '../../../shared/types'
import { IconBag, IconChevronLeft, IconChevronRight, IconDoc, IconPackage, IconPencil } from './icons'
import { platformLabel, statusTone } from '../lib/listUi'

type Props = {
  order: OrderDetail
  onBack: () => void
}

/** Страница Order Details: сводка заказа, посылки и позиции. */
export default function OrderDetailView({ order, onBack }: Props): React.JSX.Element {
  return (
    <div className="catalog-page order-detail">
      <header className="catalog-header">
        <button type="button" className="btn-ghost catalog-back" onClick={onBack}>
          <IconChevronLeft size={13} />
          <span>Orders</span>
        </button>
        <div className="order-detail-title-row">
          <h1 className="catalog-title order-detail-title">
            <IconBag size={20} />
            <span>Order Details</span>
          </h1>
          <button type="button" className="btn-download order-detail-edit" disabled tabIndex={-1}>
            <IconPencil size={14} />
            <span>Edit Order</span>
          </button>
        </div>
      </header>

      <div className="order-detail-scroll">
        <section className="order-detail-panel order-detail-summary">
          <div className="order-detail-summary-main">
            <div className="order-detail-number" title={order.order_id}>
              Order # {order.order_id}
            </div>
            <div className="order-detail-meta-row">
              <span className="order-card-platform">{platformLabel(order.platform)}</span>
              <span className="order-detail-date">Ordered: {order.ordered_at || '—'}</span>
              {order.status ? (
                <span className={`order-status-badge tone-${statusTone(order.status)}`}>
                  {order.status}
                </span>
              ) : null}
            </div>
          </div>
          <div className="order-detail-summary-total">
            <span className="order-detail-total-label">Total</span>
            <span className="order-detail-total-price">{order.total || '—'}</span>
          </div>
        </section>

        {order.packages.length ? (
          <section className="order-detail-panel">
            <h2 className="order-detail-section-title">
              <IconPackage size={17} />
              <span>Packages ({order.packages.length})</span>
            </h2>
            <div className="order-detail-packages">
              {order.packages.map((pkg, idx) => {
                const tone = statusTone(pkg.status)
                return (
                  <div
                    key={pkg.id}
                    className={`order-package-chip tone-${tone}`}
                    title={pkg.tracking_code || undefined}
                  >
                    <IconPackage size={18} />
                    <span className="order-package-chip-text">
                      <span className="order-package-chip-label">
                        {pkg.label || `Package #${idx + 1}`}
                      </span>
                      <span className="order-package-chip-status">{pkg.status || '—'}</span>
                    </span>
                    <IconChevronRight size={13} />
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        <section className="order-detail-panel">
          <h2 className="order-detail-section-title">
            <IconDoc size={17} />
            <span>Items ({order.items.length})</span>
          </h2>
          <div className="order-detail-items">
            {order.items.map((item) => (
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
                    <span className="order-item-qty">Qty {item.quantity}</span>
                    <span className={`order-item-price${item.is_gift ? ' gift' : ''}`}>
                      {item.is_gift ? 'Free' : item.price || '—'}
                    </span>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
