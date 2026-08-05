import { useEffect, useState } from 'react'
import type {
  HumanGateEvent,
  ProductDownloadResult,
  ProductEditableFields
} from '../../shared/types'
import HumanGateModal from './components/HumanGateModal'
import Sidebar, { type NavId } from './components/Sidebar'
import ImportPage from './pages/ImportPage'
import CatalogPage from './pages/CatalogPage'

export default function App(): React.JSX.Element {
  const [nav, setNav] = useState<NavId>('import')
  const [status, setStatus] = useState('')
  const [statusKind, setStatusKind] = useState<'ok' | 'error'>('ok')
  const [busy, setBusy] = useState(false)
  const [gate, setGate] = useState<HumanGateEvent | null>(null)

  const [productUrl, setProductUrl] = useState('')
  const [lastDownload, setLastDownload] = useState<ProductDownloadResult | null>(null)

  useEffect(() => {
    if (!window.api) {
      setStatus(
        'Error: window.api unavailable (preload). Restart via npm run dev or rebuild the app.'
      )
      setStatusKind('error')
      return
    }

    const offGate = window.api.onHumanGate((payload) => setGate(payload))
    const offClosed = window.api.onHumanGateClosed((data) =>
      setGate((cur) => (cur && cur.gateId === data.gateId ? null : cur))
    )
    const offProgress = window.api.onProgress((data) => {
      if (typeof data.message === 'string') {
        setStatus(data.message)
        setStatusKind('ok')
      }
    })
    return () => {
      offGate()
      offClosed()
      offProgress()
    }
  }, [])

  async function onDownloadProduct(): Promise<void> {
    if (!window.api?.downloadProduct) {
      setStatusKind('error')
      setStatus('Error: app API is not loaded.')
      return
    }
    const url = productUrl.trim()
    if (!url) {
      setStatusKind('error')
      setStatus('Paste an AliExpress or Temu product link.')
      return
    }

    setBusy(true)
    setLastDownload(null)
    setStatusKind('ok')
    setStatus('Starting download…')
    try {
      const result = await window.api.downloadProduct(url)
      setLastDownload(result)
      if (result.ok && result.folder) {
        setProductUrl('')
        setStatusKind('ok')
        setStatus(
          `Downloaded${result.title ? `: ${result.title}` : ''}` +
            (result.platform ? ` (${result.platform})` : '')
        )
      } else {
        setStatusKind('error')
        setStatus(result.error || 'Product download is not available yet.')
      }
    } catch (exc) {
      setLastDownload({ ok: false, error: exc instanceof Error ? exc.message : String(exc) })
      setStatus(exc instanceof Error ? exc.message : String(exc))
      setStatusKind('error')
    } finally {
      setBusy(false)
      setGate(null)
    }
  }

  async function onOpenFolder(): Promise<void> {
    const folder = lastDownload?.folder
    if (!folder || !window.api?.openPath) return
    const res = await window.api.openPath(folder)
    if (!res.ok) {
      setStatusKind('error')
      setStatus(res.error || 'Could not open folder.')
    }
  }

  async function onSaveDetails(patch: ProductEditableFields): Promise<boolean> {
    if (!window.api?.updateProduct || !lastDownload?.ok) {
      setStatusKind('error')
      setStatus('Cannot save: product is not loaded.')
      return false
    }
    const key =
      lastDownload.platform && lastDownload.product_id
        ? { platform: lastDownload.platform, product_id: String(lastDownload.product_id) }
        : lastDownload.folder
          ? { folder: lastDownload.folder }
          : null
    if (!key) {
      setStatusKind('error')
      setStatus('Cannot save: missing product key.')
      return false
    }

    setBusy(true)
    setStatusKind('ok')
    setStatus('Saving…')
    try {
      const res = await window.api.updateProduct(key, patch)
      if (!res.ok || !res.product) {
        setStatusKind('error')
        setStatus(res.error || 'Could not save product.')
        return false
      }
      const p = res.product
      setLastDownload({
        ok: true,
        platform: p.platform,
        product_id: p.product_id,
        folder: p.folder,
        title: p.title,
        url: p.url,
        purpose: p.purpose,
        pack_quantity: p.pack_quantity,
        price: p.price,
        tags: p.tags || [],
        status: p.status
      })
      setStatusKind('ok')
      setStatus('Saved.')
      return true
    } catch (exc) {
      setStatusKind('error')
      setStatus(exc instanceof Error ? exc.message : String(exc))
      return false
    } finally {
      setBusy(false)
    }
  }

  function onNavigate(id: NavId): void {
    if (id === 'import' || id === 'catalog') {
      setNav(id)
      setStatus('')
      return
    }
    setStatusKind('ok')
    setStatus(`${id[0].toUpperCase()}${id.slice(1)} — coming soon.`)
  }

  return (
    <div className="shell">
      <Sidebar active={nav} onNavigate={onNavigate} />

      <main className="main">
        {nav === 'import' ? (
          <ImportPage
            productUrl={productUrl}
            onProductUrlChange={setProductUrl}
            onDownload={() => void onDownloadProduct()}
            onOpenFolder={() => void onOpenFolder()}
            onSaveDetails={onSaveDetails}
            busy={busy}
            lastDownload={lastDownload}
            status={status}
            statusKind={statusKind}
          />
        ) : null}
        {nav === 'catalog' ? (
          <CatalogPage
            onStatus={(message, kind = 'ok') => {
              setStatus(message)
              setStatusKind(kind)
            }}
          />
        ) : null}
      </main>

      <HumanGateModal
        gate={gate}
        onContinue={() => {
          if (gate) void window.api?.continueHumanGate(gate.gateId)
        }}
        onCancel={() => {
          if (gate) void window.api?.cancelHumanGate(gate.gateId)
        }}
      />
    </div>
  )
}
