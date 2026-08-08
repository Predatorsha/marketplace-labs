/**
 * Probe: compare CDN / natural sizes of left-gallery thumbs vs main preview.
 * Usage: node scripts/probe-temu-gallery-sizes.mjs [productUrl]
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'fs'

function sizeScore(url) {
  const wPath = url.match(/\/w\/(\d+)/i)
  const hPath = url.match(/\/h\/(\d+)/i)
  const wQ = url.match(/[?&]width=(\d+)/i)
  const hQ = url.match(/[?&]height=(\d+)/i)
  const iv = url.match(/imageView2\/\d+\/w\/(\d+)/i)
  const w = Number(wPath?.[1] || wQ?.[1] || iv?.[1] || 0)
  const h = Number(hPath?.[1] || hQ?.[1] || 0)
  const score = w > 0 && h > 0 ? w * h : w > 0 ? w * w : h > 0 ? h * h : 0
  return { w, h, score, label: w || h ? (h ? `${w}x${h}` : `w=${w}`) : 'no-params' }
}

function basePath(url) {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url.split('?')[0]
  }
}

const PROFILE = 'K:/marketplace-labs/.browser-profile-probe'
mkdirSync(PROFILE, { recursive: true })

const DEFAULT_URL =
  process.argv[2] ||
  'https://www.temu.com/me-en/womens-black-long-gloves-lolita-lace--womens-tie-straps-arm-sleeves-hot-y2k-lolita-ballet-style-g-601100655688425.html'

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 960 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
  locale: 'en-US'
})

await context.addInitScript(
  `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`
)

const page = context.pages()[0] || (await context.newPage())
console.log('goto', DEFAULT_URL)
await page.goto(DEFAULT_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 })

for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(1000)
  let state
  try {
    state = await page.evaluate(() => {
      const text = (document.body?.innerText || '').replace(/\u200b/g, '')
      return {
        login: /sign in\s*\/\s*register/i.test(text) && /email or phone/i.test(text),
        est: /Est\.?/i.test(text),
        imgs: document.querySelectorAll('img').length,
        url: location.href
      }
    })
  } catch {
    console.log(`t=${i} (navigation in progress)`)
    continue
  }
  console.log(`t=${i} login=${state.login} est=${state.est} imgs=${state.imgs}`)
  if (!state.login && (state.est || state.imgs > 40)) break
  if (state.login && i === 10) {
    console.log('Still on login — log in manually in the opened Chrome window…')
  }
}

console.log('FINAL', page.url())
console.log('TITLE', await page.title())

await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const imgs = [...document.querySelectorAll('img')].filter((img) => {
    const r = img.getBoundingClientRect()
    return r.width > 28 && r.width < 140 && r.left < 420
  })
  if (!imgs.length) return
  let cur = imgs[0].parentElement
  let sc = null
  while (cur && cur !== document.body) {
    if (cur instanceof HTMLElement) {
      const oy = getComputedStyle(cur).overflowY
      if (
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        cur.scrollHeight > cur.clientHeight + 8
      ) {
        sc = cur
        break
      }
    }
    cur = cur.parentElement
  }
  if (!sc) return
  for (let i = 0; i < 30; i++) {
    const before = sc.scrollTop
    sc.scrollTop = sc.scrollHeight
    await sleep(80)
    if (sc.scrollTop === before) break
  }
})
await page.waitForTimeout(400)

const probe = await page.evaluate(() => {
  function srcOf(img) {
    return (
      img.currentSrc ||
      img.src ||
      img.getAttribute('data-src') ||
      img.getAttribute('data-origin') ||
      ''
    )
  }
  function junk(s) {
    return (
      !s ||
      s.startsWith('data:') ||
      /avatar|icon|logo|sprite|flag|emoji|login|upload_aimg/i.test(s)
    )
  }
  const all = [...document.querySelectorAll('img')]
    .map((img) => {
      const r = img.getBoundingClientRect()
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        left: Math.round(r.left),
        top: Math.round(r.top),
        nw: img.naturalWidth,
        nh: img.naturalHeight,
        src: srcOf(img)
      }
    })
    .filter((x) => x.w >= 24 && x.h >= 24 && !junk(x.src))

  const thumbsAll = all
    .filter((x) => x.w <= 160 && x.h <= 160 && x.left < 420)
    .sort((a, b) => a.left - b.left || a.top - b.top)
  let column = []
  if (thumbsAll.length) {
    const left0 = thumbsAll[0].left
    column = thumbsAll
      .filter((t) => Math.abs(t.left - left0) < 48)
      .sort((a, b) => a.top - b.top)
  }
  const stripRight = column.length ? Math.max(...column.map((t) => t.left + t.w)) : 220
  const previews = all
    .filter((x) => x.w >= 180 && x.h >= 180 && x.left >= stripRight - 20)
    .sort((a, b) => b.w * b.h - a.w * a.h)

  return {
    thumbs: column,
    preview: previews[0] || null,
    text: (document.body?.innerText || '')
      .replace(/\u200b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280)
  }
})

console.log('\nTEXT', probe.text)
console.log('THUMBS', probe.thumbs.length)

const thumbScores = []
for (const [i, t] of probe.thumbs.entries()) {
  const sc = sizeScore(t.src)
  thumbScores.push(sc.score)
  console.log(
    `G#${i + 1} disp=${t.w}x${t.h} nat=${t.nw}x${t.nh} cdn=${sc.label}`
  )
  console.log('   ', t.src.slice(0, 160))
}

let previewScore = 0
if (probe.preview) {
  const p = probe.preview
  const sc = sizeScore(p.src)
  previewScore = sc.score
  console.log(`\nPREVIEW disp=${p.w}x${p.h} nat=${p.nw}x${p.nh} cdn=${sc.label}`)
  console.log(p.src)

  // Click last thumb, re-read preview
  await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].filter((img) => {
      const r = img.getBoundingClientRect()
      const src = img.currentSrc || img.src || ''
      return (
        r.width > 28 &&
        r.width < 160 &&
        r.left < 420 &&
        src &&
        !src.startsWith('data:') &&
        !/avatar|logo|upload_aimg/i.test(src)
      )
    })
    if (!imgs.length) return
    imgs.sort(
      (a, b) =>
        a.getBoundingClientRect().left - b.getBoundingClientRect().left ||
        a.getBoundingClientRect().top - b.getBoundingClientRect().top
    )
    const left0 = imgs[0].getBoundingClientRect().left
    const col = imgs
      .filter((i) => Math.abs(i.getBoundingClientRect().left - left0) < 48)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    col[col.length - 1]?.click()
  })
  await page.waitForTimeout(400)

  const after = await page.evaluate(() => {
    function srcOf(img) {
      return img.currentSrc || img.src || ''
    }
    let best = null
    let area = 0
    for (const img of document.querySelectorAll('img')) {
      const r = img.getBoundingClientRect()
      if (r.width < 180 || r.height < 180) continue
      const src = srcOf(img)
      if (!src || src.startsWith('data:') || /upload_aimg|logo/i.test(src)) continue
      const a = r.width * r.height
      if (a > area) {
        area = a
        best = {
          w: Math.round(r.width),
          h: Math.round(r.height),
          nw: img.naturalWidth,
          nh: img.naturalHeight,
          src
        }
      }
    }
    return best
  })

  if (after) {
    const asc = sizeScore(after.src)
    previewScore = Math.max(previewScore, asc.score)
    console.log(
      `\nPREVIEW after last-thumb click disp=${after.w}x${after.h} nat=${after.nw}x${after.nh} cdn=${asc.label}`
    )
    console.log(after.src)
  }
} else {
  console.log('\nPREVIEW none')
}

const maxThumb = Math.max(0, ...thumbScores)
const maxThumbNat = Math.max(0, ...probe.thumbs.map((t) => t.nw * t.nh))
const previewNat = probe.preview ? probe.preview.nw * probe.preview.nh : 0

console.log('\n=== VERDICT ===')
console.log(`gallery CDN max score: ${maxThumb}`)
console.log(`preview CDN max score: ${previewScore}`)
console.log(`gallery natural max: ${maxThumbNat}`)
console.log(`preview natural: ${previewNat}`)

if (probe.preview && probe.thumbs.length) {
  const samePath = probe.thumbs.some(
    (t) => basePath(t.src) === basePath(probe.preview.src)
  )
  console.log(`same pathname gallery↔preview (current): ${samePath}`)
}

if (previewScore > maxThumb) {
  console.log('RESULT: preview CDN larger → prefer preview URLs')
} else if (previewScore === maxThumb && maxThumb > 0) {
  console.log('RESULT: SAME CDN size → stay hard-bound on left gallery')
} else if (maxThumb > previewScore) {
  console.log('RESULT: gallery CDN >= preview → stay on left gallery')
} else if (previewNat > maxThumbNat && maxThumbNat > 0) {
  console.log('RESULT: preview natural pixels larger (CDN params missing) → prefer preview')
} else if (previewNat === maxThumbNat && previewNat > 0) {
  console.log('RESULT: SAME natural size → stay hard-bound on left gallery')
} else {
  console.log('RESULT: inconclusive')
}

await page.screenshot({ path: 'K:/Cursor/marketplace-labs/scripts/temu-probe.png' })
console.log('screenshot scripts/temu-probe.png')
await context.close()
