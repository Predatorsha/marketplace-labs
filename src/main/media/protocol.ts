import { net, protocol } from 'electron'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import type { AppConfig } from '../config'
import { marketRoot } from '../core/paths'

export const MEDIA_SCHEME = 'ml-media'

/** Must run before `app.whenReady()`. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

/** Encode an absolute filesystem path as a renderer-safe media URL. */
export function toMediaUrl(absPath: string): string {
  const normalized = resolve(absPath)
  const encoded = Buffer.from(normalized, 'utf8').toString('base64url')
  return `${MEDIA_SCHEME}://local/${encoded}`
}

function decodeMediaUrl(requestUrl: string): string | null {
  try {
    const u = new URL(requestUrl)
    if (u.hostname !== 'local') return null
    const encoded = decodeURIComponent(u.pathname.replace(/^\//, ''))
    if (!encoded) return null
    return Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

export function isPathUnderRoot(absPath: string, root: string): boolean {
  const a = resolve(absPath).replace(/\\/g, '/').toLowerCase()
  const r = resolve(root).replace(/\\/g, '/').toLowerCase()
  return a === r || a.startsWith(`${r}/`)
}

/** Register handler after `app.whenReady()`. */
export function registerMediaProtocol(getConfig: () => AppConfig): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const filePath = decodeMediaUrl(request.url)
    if (!filePath) {
      return new Response('Bad media URL', { status: 400 })
    }
    const root = marketRoot(getConfig())
    if (!isPathUnderRoot(filePath, root)) {
      return new Response('Forbidden', { status: 403 })
    }
    try {
      return await net.fetch(pathToFileURL(filePath).href)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
