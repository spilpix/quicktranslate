import type { QuickTranslateApi } from '../shared/types'

declare global {
  interface Window {
    quicktranslate: QuickTranslateApi
  }
}

export {}
