import type { Page } from 'playwright'
import { imageDedupeKey, upgradeTemuImageUrl } from './images'
import { sleep } from './util'

const MAX_GALLERY_STEPS = 300

function galleryKey(url: string): string {
  return imageDedupeKey(upgradeTemuImageUrl(url))
}

/** Largest product image currently visible (PDP hero or lightbox preview). */
async function readPreviewSrc(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    function imgSrc(img: HTMLImageElement): string {
      return (
        img.currentSrc ||
        img.src ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-origin') ||
        ''
      )
    }
    function junk(src: string): boolean {
      return (
        !src ||
        src.startsWith('data:') ||
        /avatar|icon|logo|sprite|flag|emoji|upload_aimg/i.test(src)
      )
    }

    let best: string | null = null
    let area = 0
    for (const img of Array.from(document.querySelectorAll('img'))) {
      const rect = img.getBoundingClientRect()
      if (rect.width < 180 || rect.height < 180) continue
      if (rect.top > window.innerHeight * 0.9) continue
      if (rect.right < 80 || rect.left > window.innerWidth - 40) continue
      const src = imgSrc(img)
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

async function openLightbox(page: Page): Promise<boolean> {
  const clicked = await page.evaluate(() => {
    function junk(src: string): boolean {
      return (
        !src ||
        src.startsWith('data:') ||
        /avatar|icon|logo|sprite|flag|emoji|upload_aimg/i.test(src)
      )
    }

    let best: HTMLImageElement | null = null
    let area = 0
    for (const img of Array.from(document.querySelectorAll('img'))) {
      const rect = img.getBoundingClientRect()
      if (rect.width < 200 || rect.height < 200) continue
      if (rect.top > window.innerHeight * 0.85) continue
      // Prefer the main hero (center-left), not far-right cart rails.
      if (rect.left > window.innerWidth * 0.65) continue
      const src = img.currentSrc || img.src || ''
      if (junk(src)) continue
      const a = rect.width * rect.height
      if (a > area) {
        area = a
        best = img
      }
    }
    if (!best) return false
    best.click()
    return true
  })
  if (!clicked) return false
  await sleep(400)
  return true
}

/** Click the circular `>` control on the right of the large preview. */
async function clickRightNav(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    function junk(src: string): boolean {
      return (
        !src ||
        src.startsWith('data:') ||
        /avatar|icon|logo|sprite|flag|emoji|upload_aimg/i.test(src)
      )
    }

    let preview: DOMRect | null = null
    let area = 0
    for (const img of Array.from(document.querySelectorAll('img'))) {
      const rect = img.getBoundingClientRect()
      if (rect.width < 180 || rect.height < 180) continue
      const src = img.currentSrc || img.src || ''
      if (junk(src)) continue
      const a = rect.width * rect.height
      if (a > area) {
        area = a
        preview = rect
      }
    }
    if (!preview) return false

    const midY = preview.top + preview.height / 2
    const candidates: HTMLElement[] = []
    for (const el of Array.from(document.querySelectorAll('button, [role="button"], div, span'))) {
      if (!(el instanceof HTMLElement)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 28 || rect.width > 72 || rect.height < 28 || rect.height > 72) continue
      // Right edge of the large preview.
      if (rect.left < preview.right - 36 || rect.left > preview.right + 40) continue
      if (Math.abs(rect.top + rect.height / 2 - midY) > preview.height * 0.35) continue
      candidates.push(el)
    }
    if (!candidates.length) return false

    // Prefer the rightmost control in that band.
    candidates.sort(
      (a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left
    )
    candidates[0].click()
    return true
  })
}

async function closeLightbox(page: Page): Promise<void> {
  const closed = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('button, [role="button"], div, span, a'))
    for (const el of nodes) {
      if (!(el instanceof HTMLElement)) continue
      const rect = el.getBoundingClientRect()
      // Top-right close control on the overlay.
      if (rect.width < 18 || rect.width > 64 || rect.height < 18 || rect.height > 64) continue
      if (rect.top < 0 || rect.top > 120) continue
      if (rect.right < window.innerWidth - 80 || rect.left > window.innerWidth - 8) continue
      const label = (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.textContent ||
        ''
      )
        .trim()
        .toLowerCase()
      const looksClose =
        label === 'x' ||
        label === '×' ||
        /close|закрыть/i.test(label) ||
        (el.textContent || '').trim() === '×' ||
        (el.textContent || '').trim() === '✕'
      // Geometry alone is enough for Temu's corner X.
      if (looksClose || (rect.top < 80 && rect.right > window.innerWidth - 60)) {
        el.click()
        return true
      }
    }
    return false
  })
  if (!closed) {
    await page.keyboard.press('Escape').catch(() => undefined)
  }
  await sleep(250)
}

/**
 * Lightbox gallery: open main photo, step with right arrow, stop when the
 * current frame matches the first (loop). Loop frame is not kept.
 */
export async function collectTemuGalleryUrls(page: Page): Promise<string[]> {
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
    const moved = await clickRightNav(page)
    if (!moved) break
    await sleep(280)

    const raw = await readPreviewSrc(page)
    if (!raw) break
    const upgraded = upgradeTemuImageUrl(raw)
    if (!upgraded || !/^https?:\/\//i.test(upgraded)) break

    const key = galleryKey(upgraded)
    // Click registered but preview did not advance — stop (avoid duplicates).
    if (key === prevKey) break
    // Looped back to the start — do not keep the wrap frame.
    if (key === firstKey) break
    urls.push(upgraded)
    prevKey = key
  }

  await closeLightbox(page)
  return urls
}
