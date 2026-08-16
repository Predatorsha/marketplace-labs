import { IconChevronLeft, IconChevronRight } from './icons'
import { pageItems } from '../lib/listUi'

type Props = {
  page: number
  totalPages: number
  loading?: boolean
  onPage: (page: number) => void
}

/** Пагинация списочных страниц (Catalog, Orders): стрелки + номера с эллипсисами. */
export default function PaginationBar({
  page,
  totalPages,
  loading,
  onPage
}: Props): React.JSX.Element {
  return (
    <div className="catalog-pagination">
      <button
        type="button"
        className="catalog-page-btn"
        disabled={loading || page <= 1}
        onClick={() => onPage(page - 1)}
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
            onClick={() => onPage(entry)}
          >
            {entry}
          </button>
        )
      )}
      <button
        type="button"
        className="catalog-page-btn"
        disabled={loading || page >= totalPages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        <IconChevronRight size={14} />
      </button>
    </div>
  )
}
