/**
 * Signals parsed from marketplace product titles (qty, purpose, tags).
 * Purpose/tags use an LLM when OPENAI_API_KEY is set — no fixed category dictionary.
 */

import { jobLog } from '../jobs/log'

/** Pack size from title: "200pcs", "6Colors", "6 colors set", "1 Piece of …". */
export function extractPackQuantityFromTitle(title: string): number | null {
  const t = String(title || '')
  if (!t.trim()) return null
  const patterns = [
    /\b(\d+)\s*(?:pcs|pc)\b/i,
    /\b(\d+)\s*pieces?\b/i,
    /\b(\d+)\s*packs?\b/i,
    /\b(\d+)\s*piece\s+of\b/i,
    // "6Colors", "6 Colors", "6colours set"
    /\b(\d+)\s*colou?rs?\b/i,
    /\b(\d+)colou?rs?\b/i
  ]
  for (const re of patterns) {
    const m = t.match(re)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0 && n < 1_000_000) return n
  }
  return null
}

function normalizePurposeLabel(raw: string): string | null {
  let s = raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
  // Model sometimes echoes "purpose: …"
  s = s.replace(/^(purpose|type|product)\s*:\s*/i, '').trim()
  if (!s || s === 'null' || s === 'unknown' || s === 'n/a') return null
  // Keep short: max 6 words
  const words = s.split(' ').filter(Boolean)
  if (!words.length) return null
  if (words.length > 6) s = words.slice(0, 6).join(' ')
  if (s.length > 80) s = s.slice(0, 80).trim()
  return s || null
}

/**
 * Ask OpenAI what the product IS, from the title only.
 * Env: OPENAI_API_KEY (required), PURPOSE_LLM_MODEL (default gpt-5.6-sol — same as tags),
 * OPTIONAL: OPENAI_BASE_URL (OpenAI-compatible endpoint).
 * Always uses reasoning_effort=none (no chain-of-thought) for fast labeling.
 */
async function purposeFromLlm(title: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null

  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.PURPOSE_LLM_MODEL || process.env.TAGS_LLM_MODEL || 'gpt-5.6-sol'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        reasoning_effort: 'none',
        max_completion_tokens: 40,
        messages: [
          {
            role: 'system',
            content: [
              'You name the product type from a marketplace title.',
              'Reply with ONLY a short English label (2–5 words) for what the item IS.',
              'Ignore pack quantity (e.g. 200pcs), shipping fluff, and decorative motifs listed inside the item.',
              'Example: title mentions candle shapes inside a nail mold → "nail molds", not "candle".',
              'Example: beads for phone chains → "bead accessories", not "phone chain".',
              'No quotes, no punctuation, no explanation.'
            ].join(' ')
          },
          { role: 'user', content: title.trim() }
        ]
      })
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      jobLog(`purpose LLM HTTP ${res.status}: ${body.slice(0, 200)}`)
      return null
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content || ''
    return normalizePurposeLabel(text)
  } catch (exc) {
    jobLog(`purpose LLM failed: ${exc instanceof Error ? exc.message : exc}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Infer purpose from title meaning (LLM). Returns null if no key / failure.
 */
export async function inferPurposeFromProduct(
  product: Record<string, unknown>
): Promise<string | null> {
  const title = String(product.title || '').trim()
  if (!title) return null
  return purposeFromLlm(title)
}

function normalizeTagList(raw: string): string[] {
  let text = raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim()
  // Prefer JSON array if present
  const bracket = text.match(/\[[\s\S]*\]/)
  if (bracket) text = bracket[0]
  let parts: string[] = []
  try {
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) {
      parts = parsed.map((x) => String(x ?? ''))
    }
  } catch {
    parts = text.split(/[,;\n|/]+/)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    let s = part
      .trim()
      .replace(/^#/, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[\s_]+/g, ' ')
      .toLowerCase()
    // Strip non-latin letters (keep digits, spaces, ascii punctuation used in specs)
    s = s.replace(/[^a-z0-9\s.+/-]/g, '').replace(/\s+/g, ' ').trim()
    s = s.replace(/^(tag|tags)\s*:\s*/i, '').trim()
    if (!s || s === 'null' || s === 'unknown' || s === 'n/a') continue
    if (s.length > 40) s = s.slice(0, 40).trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= 7) break
  }
  return out
}

function tagsSystemPrompt(): string {
  return [
    'Generate a list of tags for this marketplace product (max 7 tags).',
    '1. niche - short catalog area if useful and not just repeating purpose (e.g. nails, charging, packaging)',
    '2. product line / subtype - what kind within that niche (e.g. hard gel, gan charger, travel adapter)',
    '3. subject - distinctive named identity: motif, collection, model feature, technique (e.g. 3d carving, flower, EssenceOfReverie-style proper names if present)',
    '4. specs / ports / region - concrete searchable facts (e.g. 65w, eu plug, 2 ac outlets, usb-c)',
    '5. extra theme - only if still useful and not filler',
    '',
    'Overall structure:',
    'niche → subtype → subject → specs → extras',
    '',
    'e.g. ["charging","gan charger","65w","eu plug","2 ac outlets","usb-c"]',
    'e.g. ["nails","hard gel","3d carving","non-stick","glass crystal","flower"]',
    '',
    'If some of these is missing from the product - skip it in the tag list.',
    'Keep multi-word compounds as one tag ("hard gel", "3d carving", "eu plug", "fast charging").',
    'Do not restate the purpose phrase as a tag. No vague filler (colorful, cute, portable, nice, diy, set, new).',
    'Do not tag pack size or net weight (5g, 200pcs, 6 colors) — quantity is stored separately.',
    'No hashtags. Only latin characters. Lowercase. Reply with ONLY a JSON array of strings.'
  ].join('\n')
}

/**
 * Ask OpenAI for searchable attribute tags from title (+ optional purpose).
 * Env: OPENAI_API_KEY, optional TAGS_LLM_MODEL (default gpt-5.6-sol).
 * Always uses reasoning_effort=none (no chain-of-thought) for fast labeling.
 */
async function tagsFromLlm(title: string, purpose: string | null): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return []

  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.TAGS_LLM_MODEL || 'gpt-5.6-sol'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    const userParts = [`Title: ${title.trim()}`]
    if (purpose?.trim()) userParts.push(`Purpose: ${purpose.trim()}`)

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        reasoning_effort: 'none',
        max_completion_tokens: 100,
        messages: [
          { role: 'system', content: tagsSystemPrompt() },
          { role: 'user', content: userParts.join('\n') }
        ]
      })
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      jobLog(`tags LLM HTTP ${res.status}: ${body.slice(0, 200)}`)
      return []
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content || ''
    return normalizeTagList(text)
  } catch (exc) {
    jobLog(`tags LLM failed: ${exc instanceof Error ? exc.message : exc}`)
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Infer tags from title (+ purpose if known). Empty if no key / failure.
 */
export async function inferTagsFromProduct(
  product: Record<string, unknown>
): Promise<string[]> {
  const title = String(product.title || '').trim()
  if (!title) return []
  const purpose =
    typeof product.purpose === 'string' && product.purpose.trim()
      ? product.purpose.trim()
      : null
  return tagsFromLlm(title, purpose)
}
