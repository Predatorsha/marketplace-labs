/**
 * Probe: verify AliExpress PDP selectors used by src/main/scrape/aliexpress/*.
 * Usage: node scripts/probe-aliexpress.mjs [productUrl]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const PROFILE = 'K:/marketplace-labs/.browser-profile-probe'
mkdirSync(PROFILE, { recursive: true })

const DEFAULT_URL =
  process.argv[2] ||
  'https://www.aliexpress.com/item/1005012237951306.html'

function fullSize(src) {
  let url = String(src || '').trim()
  if (!url) return url
  if (url.startsWith('//')) url = `https:${url}`
  const m = url.match(/^(.*?\.(?:jpe?g|png|webp|gif))_.+$/i)
  return m ? m[1] : url
}

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

await page
  .waitForFunction(
    () => !!document.querySelector('h1[data-pl="product-title"]'),
    { timeout: 60_000 }
  )
  .catch(() => console.log('WARN: title selector did not appear in 60s'))

// --- buy box ---
const buyBox = await page.evaluate(() => {
  const title =
    document.querySelector('h1[data-pl="product-title"]')?.textContent?.trim() || null
  const price =
    document.querySelector('[class*="price-default--current--"]')?.textContent?.trim() ||
    null
  const reviewer = document.querySelector('[data-pl="product-reviewer"]')
  const rating = reviewer?.querySelector('strong')?.textContent?.trim() || null
  const revText = reviewer?.innerText || ''
  return {
    title,
    price,
    rating,
    reviews: revText.match(/([\d.,\s]+)\s*reviews?/i)?.[1]?.trim() ?? null,
    sold: revText.match(/([\d.,\s]+\+?)\s*sold/i)?.[1]?.trim() ?? null
  }
})
console.log('buyBox:', JSON.stringify(buyBox, null, 2))

// --- slider ---
const slider = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[class*="slider--img--"] img'))
    .map((img) => img.currentSrc || img.src || '')
    .filter(Boolean)
)
console.log(`slider: ${slider.length} imgs`)
slider.forEach((s) => console.log('  ', fullSize(s)))

// --- sku options ---
const sku = await page.evaluate(() => {
  const props = Array.from(
    document.querySelectorAll('[class*="sku--wrap--"] [class*="sku-item--property--"]')
  )
  return props.map((prop) => ({
    title:
      prop.querySelector('[class*="sku-item--title--"]')?.textContent?.trim() || null,
    options: Array.from(prop.querySelectorAll('[data-sku-col]')).map((el) => ({
      col: el.getAttribute('data-sku-col'),
      alt: el.querySelector('img')?.getAttribute('alt') || null,
      src: el.querySelector('img')?.getAttribute('src') || null,
      selected: /sku-item--selected--/.test(el.className)
    }))
  }))
})
console.log('sku:', JSON.stringify(sku, null, 2))

// --- scroll for lazy sections ---
for (let i = 0; i < 25; i++) {
  const done = await page.evaluate(() => {
    const mounted =
      !!document.querySelector('#nav-specification') &&
      !!document.querySelector('#product-description')
    window.scrollBy(0, Math.round(window.innerHeight * 0.8))
    const bottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 50
    return mounted || bottom
  })
  await page.waitForTimeout(350)
  if (done) break
}

// --- specs ---
const viewMore = page.locator('#nav-specification button', { hasText: /view more/i })
if (await viewMore.count()) {
  await viewMore.first().click({ timeout: 3000 }).catch(() => undefined)
  await page.waitForTimeout(600)
}
const specs = await page.evaluate(() => {
  const out = {}
  for (const prop of document.querySelectorAll('[class*="specification--prop--"]')) {
    const k = prop.querySelector('[class*="specification--title--"]')?.textContent?.trim()
    const v = prop.querySelector('[class*="specification--desc--"]')?.textContent?.trim()
    if (k && v && !out[k]) out[k] = v
  }
  return out
})
await page.keyboard.press('Escape').catch(() => undefined)
console.log('specs:', JSON.stringify(specs, null, 2))

// --- description shadow imgs ---
await page
  .locator('#product-description')
  .first()
  .scrollIntoViewIfNeeded({ timeout: 5000 })
  .catch(() => undefined)
await page
  .waitForFunction(
    () => {
      const host = document.querySelector('#product-description > div')
      const root = host?.shadowRoot ?? host
      return !!root && root.querySelectorAll('img').length > 0
    },
    { timeout: 20_000 }
  )
  .catch(() => console.log('WARN: description images did not appear in 20s'))
const descImgs = await page.evaluate(() => {
  const host = document.querySelector('#product-description > div')
  const root = host?.shadowRoot ?? host
  if (!root) return { hasShadow: false, imgs: [] }
  return {
    hasShadow: !!host?.shadowRoot,
    imgs: Array.from(root.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') || '')
      .filter((s) => /^(https?:)?\/\//.test(s))
  }
})
console.log(`description: shadow=${descImgs.hasShadow} imgs=${descImgs.imgs.length}`)
descImgs.imgs.forEach((s) => console.log('  ', s))

// --- seller (#nav-store) ---
const seller = await page.evaluate(() => {
  const a = document.querySelector('#nav-store a[data-pl="store-name"]')
  if (!a) return null
  return {
    name: a.textContent?.trim() || null,
    href: a.getAttribute('href'),
    storeId: (a.getAttribute('href') || '').match(/\/store\/(\d+)/)?.[1] ?? null
  }
})
console.log('seller:', JSON.stringify(seller))

// --- click through sku options, read price each time ---
const tiles = page
  .locator('[class*="sku--wrap--"] [class*="sku-item--property--"]')
  .first()
  .locator('[data-sku-col]')
const tileCount = await tiles.count()
for (let i = 0; i < tileCount; i++) {
  await tiles.nth(i).scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => undefined)
  await tiles.nth(i).click({ timeout: 5000 }).catch((e) => console.log('click fail', e.message))
  await page.waitForTimeout(800)
  const p = await page.evaluate(
    () =>
      document.querySelector('[class*="price-default--current--"]')?.textContent?.trim() ||
      null
  )
  console.log(`choice #${i + 1} price:`, p)
}

await page.screenshot({ path: 'scripts/aliexpress-probe.png', fullPage: false })
console.log('done, screenshot: scripts/aliexpress-probe.png')
await context.close()
