import type { Settings, TranslateError, TranslateErrorKind, TranslateResult } from '../shared/types'
import { createLru, detectDirection, labelForCode } from './langUtils'

const TIMEOUT_MS = 8000
const CACHE_MAX = 60
const MAX_TEXT = 5000

interface CacheEntry {
  translation: string
  detectedLang: string
  targetLang: string
  targetCode: string
}
const cache = createLru<CacheEntry>(CACHE_MAX)

function err(kind: TranslateErrorKind, message: string): TranslateResult {
  const error: TranslateError = { kind, message }
  return { ok: false, error }
}

export interface GoogleTranslateArgs {
  text: string
  explicitTargetCode?: string
  settings: Settings
}

/**
 * Free translation via the public (unofficial) Google Translate endpoint —
 * no API key required. Source language is auto-detected server-side; we only
 * pick the target within the configured pair.
 */
export async function translateGoogleFree({
  text,
  explicitTargetCode,
  settings
}: GoogleTranslateArgs): Promise<TranslateResult> {
  const trimmed = text.trim()
  if (!trimmed) return err('empty', 'Пустой текст')
  if (trimmed.length > MAX_TEXT) {
    return err('too-long', `Текст слишком длинный (максимум ${MAX_TEXT} символов)`)
  }

  const { targetCode } = detectDirection(trimmed, settings, explicitTargetCode)
  const targetLabel = labelForCode(targetCode, settings)

  const key = `${targetCode}::${trimmed}`
  const hit = cache.get(key)
  if (hit) {
    return {
      ok: true,
      translation: hit.translation,
      detectedLang: hit.detectedLang,
      targetLang: hit.targetLang,
      targetCode: hit.targetCode,
      cached: true
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto` +
      `&tl=${encodeURIComponent(targetCode)}&dt=t`

    // The text goes in a POST body: long texts blow past URL length limits.
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: `q=${encodeURIComponent(trimmed)}`
    })

    if (res.status === 429) {
      return err('rate-limit', 'Слишком много запросов к бесплатному переводчику, подождите немного')
    }
    if (!res.ok) {
      return err('api', `Ошибка перевода (${res.status})`)
    }

    // Shape: [ [ [translatedChunk, originalChunk, ...], ... ], null, detectedLangCode, ... ]
    const data: any = await res.json()
    const segments: any[] = Array.isArray(data?.[0]) ? data[0] : []
    const translation = segments
      .map((seg) => (Array.isArray(seg) ? seg[0] : ''))
      .filter(Boolean)
      .join('')
      .trim()

    if (!translation) return err('empty', 'Пустой ответ переводчика')

    const detectedCode: string = data?.[2] || detectDirection(trimmed, settings).detectedCode
    const detectedLabel = labelForCode(detectedCode, settings)

    cache.set(key, {
      translation,
      detectedLang: detectedLabel,
      targetLang: targetLabel,
      targetCode
    })

    return {
      ok: true,
      translation,
      detectedLang: detectedLabel,
      targetLang: targetLabel,
      targetCode,
      cached: false
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      return err('timeout', 'Превышено время ожидания (8 с). Попробуйте ещё раз.')
    }
    return err('offline', 'Нет соединения с интернетом')
  } finally {
    clearTimeout(timer)
  }
}

export function clearGoogleCache(): void {
  cache.clear()
}
