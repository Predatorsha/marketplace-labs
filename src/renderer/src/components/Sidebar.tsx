import PixelMascot from './PixelMascot'
import {
  IconDownload,
  IconFolder,
  IconBag,
  IconPackage,
  IconSettings,
  IconHeart
} from './icons'

export type NavId = 'import' | 'catalog' | 'orders' | 'packages' | 'settings'

type Props = {
  active: NavId
  onNavigate?: (id: NavId) => void
}

const NAV: { id: NavId; label: string; icon: React.ReactNode }[] = [
  { id: 'import', label: 'Import', icon: <IconDownload size={15} /> },
  { id: 'catalog', label: 'Catalog', icon: <IconFolder size={15} /> },
  { id: 'orders', label: 'Orders', icon: <IconBag size={15} /> },
  { id: 'packages', label: 'Packages', icon: <IconPackage size={15} /> },
  { id: 'settings', label: 'Settings', icon: <IconSettings size={15} /> }
]

export default function Sidebar({ active, onNavigate }: Props): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <span className="sidebar-logo-primary">Marketplace</span>
          <span className="sidebar-logo-secondary">Labs</span>
        </div>
        <PixelMascot variant="chest" className="sidebar-mascot" size={118} />
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {NAV.map((item) => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate?.(item.id)}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-label">{item.label}</span>
              {isActive ? (
                <span className="nav-item-heart" aria-hidden="true">
                  <IconHeart size={11} />
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-help">
        <PixelMascot variant="face" className="sidebar-help-face" size={34} />
        <div className="sidebar-help-bubble">
          <p>Catalog and import tools for marketplace products.</p>
          <div className="sidebar-help-hearts" aria-hidden="true">
            <IconHeart size={10} />
            <IconHeart size={10} />
            <IconHeart size={10} />
            <IconHeart size={10} />
          </div>
        </div>
      </div>
    </aside>
  )
}
