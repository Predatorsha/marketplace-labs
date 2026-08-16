import { IconSearch } from './icons'

/** Неактивная строка поиска из макета (поиск ещё не реализован). */
export default function ListSearchStub({ placeholder }: { placeholder: string }): React.JSX.Element {
  return (
    <div className="catalog-search-row" aria-hidden="true">
      <label className="url-field catalog-search-field">
        <IconSearch className="url-field-icon" size={16} />
        <input type="search" placeholder={placeholder} disabled tabIndex={-1} />
      </label>
      <button type="button" className="btn-download" disabled tabIndex={-1}>
        <IconSearch size={15} />
        <span>Search</span>
      </button>
    </div>
  )
}
