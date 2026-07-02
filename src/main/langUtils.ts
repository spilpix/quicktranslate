import type { Settings } from '../shared/types'

export function labelForCode(code: string, s: Settings): string {
  if (code === s.langACode) return s.langALabel
  if (code === s.langBCode) return s.langBLabel
  return code.toUpperCase()
}

/**
 * Lightweight, offline source-language heuristic used only to pick a direction
 * within the configured pair. Good enough for the default RU↔EN pair; for other
 * pairs it falls back to translating into pair member A.
 */
export function detectDirection(
  text: string,
  s: Settings,
  explicitTargetCode?: string
): { detectedCode: string; targetCode: string } {
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) || []).length
  const latin = (text.match(/[A-Za-z]/g) || []).length
  const detectedCode = cyrillic > latin ? 'ru' : 'en'

  if (explicitTargetCode) return { detectedCode, targetCode: explicitTargetCode }
  if (detectedCode === s.langACode) return { detectedCode, targetCode: s.langBCode }
  if (detectedCode === s.langBCode) return { detectedCode, targetCode: s.langACode }
  return { detectedCode, targetCode: s.langACode }
}

/** Tiny LRU used by the translation clients to cache recent results in memory. */
export function createLru<V>(max: number): {
  get(k: string): V | undefined
  set(k: string, v: V): void
  clear(): void
} {
  const map = new Map<string, V>()
  return {
    get(k) {
      const v = map.get(k)
      if (v !== undefined) {
        map.delete(k)
        map.set(k, v)
      }
      return v
    },
    set(k, v) {
      map.set(k, v)
      if (map.size > max) {
        const oldest = map.keys().next().value
        if (oldest !== undefined) map.delete(oldest)
      }
    },
    clear() {
      map.clear()
    }
  }
}
