import type { Page } from 'playwright'
import { imageDedupeKey, upgradeTemuImageUrl } from './images'
import { sleep } from './util'

const MAX_GALLERY_STEPS = 300
const FRAME_WAIT_MS = 1400
const FRAME_POLL_MS = 80
/** Same key must hold this long before we accept a frame (skip transition flashes). */
const FRAME_SETTLE_MS = 160

function galleryKey(url: string): string {
  return imageDedupeKey(upgradeTemuImageUrl(url))
}

/**
 * Largest product image currently visible.
 * When the lightbox is open, only consider imgs inside that dialog — page-level
 * hero / preloaded neighbors were winning by area and scrambling gallery order.
 */
async function readPreviewSrc(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    function junk(src: string): boolean {
      return (
        !src ||
        src.startsWith('data:') ||
        /avatar|icon|logo|sprite|flag|emoji|upload_aimg/i.test(src)
      )
    }

    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
    const root =
      dialog instanceof HTMLElement && dialog.getBoundingClientRect().width > 100
        ? dialog
        : document

    let best: string | null = null
    let area = 0
    for (const img of Array.from(root.querySelectorAll('img'))) {
      const rect = img.getBoundingClientRect()
      if (rect.width < 180 || rect.height < 180) continue
      if (rect.top > window.innerHeight * 0.9) continue
      if (rect.right < 80 || rect.left > window.innerWidth - 40) continue
      // Prefer the centered slide; ignore mostly off-screen carousel neighbors.
      if (rect.left < -40 || rect.right > window.innerWidth + 40) continue
      const src = img.currentSrc || ''
      if (junk(src)) continue
      const a = rect.width * rect.height
      if (a > area) {
        area = a
        best = src
      }
    }
    return best
  })
}

async function isLightboxOpen(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
    if (!dialog || !(dialog instanceof HTMLElement)) return false
    const rect = dialog.getBoundingClientRect()
    return rect.width > 100 && rect.height > 100
  })
}

/** Focus the open lightbox so ArrowRight / Escape reach it. */
async function focusLightbox(page: Page): Promise<void> {
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
    if (!(dialog instanceof HTMLElement)) return
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1')
    dialog.focus()
  })
}

/** First left-rail thumb src (Temu gallery index 0). Used to un-rotate after open-at-2nd. */
async function readFirstRailThumbSrc(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const li = document.querySelector('#leftContent ol > li:nth-child(1)')
    if (!(li instanceof HTMLElement)) return null
    const img = li.querySelector('img')
    if (!(img instanceof HTMLImageElement)) return null
    return img.currentSrc || null
  })
}

/** Rotate so `anchorKey` is first; no-op if missing or already first. */
function rotateGalleryToAnchor(urls: string[], anchorKey: string): string[] {
  if (!anchorKey || urls.length < 2) return urls
  const idx = urls.findIndex((u) => galleryKey(u) === anchorKey)
  if (idx <= 0) return urls
  return urls.slice(idx).concat(urls.slice(0, idx))
}

async function openLightbox(page: Page): Promise<boolean> {
  // PDP left rail: 2nd thumb opens the preview gallery (not the hero img).
  // Stay at top so #leftContent is on-screen before the click.
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(150)

  const thumb = page.locator('#leftContent ol > li:nth-child(2)').first()
  try {
    await thumb.scrollIntoViewIfNeeded({ timeout: 3_000 })
    await thumb.click({ timeout: 5_000 })
  } catch {
    return false
  }
  await sleep(400)
  await focusLightbox(page)
  return true
}

/** Poll until preview src key differs from `prevKey` and stays stable, or timeout. */
async function waitForFrameChange(
  page: Page,
  prevKey: string
): Promise<string | null> {
  const deadline = Date.now() + FRAME_WAIT_MS
  let candidate: string | null = null
  let candidateKey = ''
  let candidateSince = 0

  while (Date.now() < deadline) {
    const raw = await readPreviewSrc(page)
    if (raw) {
      const upgraded = upgradeTemuImageUrl(raw)
      if (upgraded && /^https?:\/\//i.test(upgraded)) {
        const key = galleryKey(upgraded)
        if (key !== prevKey) {
          if (key === candidateKey) {
            if (Date.now() - candidateSince >= FRAME_SETTLE_MS) return upgraded
          } else {
            candidate = upgraded
            candidateKey = key
            candidateSince = Date.now()
          }
        } else {
          candidate = null
          candidateKey = ''
          candidateSince = 0
        }
      }
    }
    await sleep(FRAME_POLL_MS)
  }
  return candidate
}

/**
 * Step gallery with ArrowRight once; only re-press if the frame still has not
 * changed (a blind second press skips a slide and shuffles order).
 */
async function stepRight(page: Page, prevKey: string): Promise<string | null> {
  await focusLightbox(page)
  await page.keyboard.press('ArrowRight').catch(() => undefined)
  const next = await waitForFrameChange(page, prevKey)
  if (next) return next

  await focusLightbox(page)
  await page.keyboard.press('ArrowRight').catch(() => undefined)
  return waitForFrameChange(page, prevKey)
}

/** Close lightbox with Escape only; verify dialog is gone. */
async function closeLightbox(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await isLightboxOpen(page))) return
    await focusLightbox(page)
    await page.keyboard.press('Escape').catch(() => undefined)
    await sleep(250)
  }
  // Final short wait in case the dialog is animating out.
  if (await isLightboxOpen(page)) await sleep(200)
}

/**
 * Lightbox gallery: open via left-rail 2nd thumb, step with ArrowRight, stop
 * when the current frame matches the first collected (loop). Loop frame is not
 * kept. Rotate back to Temu order using the 1st rail thumb (open starts at 2nd,
 * so without rotate the real last frame is not last — Choice would be wrong).
 * Close via Escape.
 */
export async function collectTemuGalleryUrls(page: Page): Promise<string[]> {
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(150)

  // Anchor = true gallery[0] before lightbox (2nd-thumb open shifts the start).
  const anchorRaw = await readFirstRailThumbSrc(page)
  const anchorKey = anchorRaw ? galleryKey(upgradeTemuImageUrl(anchorRaw)) : ''

  await openLightbox(page)

  const firstRaw = await readPreviewSrc(page)
  if (!firstRaw) {
    await closeLightbox(page)
    return []
  }

  const first = upgradeTemuImageUrl(firstRaw)
  const firstKey = galleryKey(first)
  const urls: string[] = [first]
  let prevKey = firstKey

  for (let step = 0; step < MAX_GALLERY_STEPS; step++) {
    const upgraded = await stepRight(page, prevKey)
    // Frame did not advance after ArrowRight (+ retry) — stop.
    if (!upgraded) break

    const key = galleryKey(upgraded)
    // Looped back to the start — do not keep the wrap frame.
    if (key === firstKey) break
    // Already collected (neighbor flash / odd Temu preload) — stop cleanly.
    if (urls.some((u) => galleryKey(u) === key)) break
    urls.push(upgraded)
    prevKey = key
  }

  await closeLightbox(page)
  return rotateGalleryToAnchor(urls, anchorKey)
}
